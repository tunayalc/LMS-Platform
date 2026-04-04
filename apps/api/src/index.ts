// Ensure env is loaded before other internal imports.
import "./env";
import path from "path";

import cors from "cors";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import express from "express";
import "express-async-errors";
import fs from "fs";
import multer from "multer";
import { z } from "zod";
import { ensureSchema, query } from "./db";
import passport from "passport";
import AdmZip from "adm-zip";
import extractZip from "extract-zip";
import { OmrService } from "./services/omr";
import { errorHandler } from "./middleware/error";
import { TwoFactorService } from "./services/twoFactor";
import { MattermostService } from "./services/mattermost";
import { Microsoft365Service } from "./services/microsoft365";
import { SEBService } from "./services/seb";
import { configureMicrosoftStrategy } from "./auth/microsoft";
import { configureGoogleStrategy } from "./auth/google";
import authOauthRoutes from "./routes/auth_oauth";
import { generateTokens, isAssistantOrAbove, roles, adminRoles, User, Role, JWT_SECRET } from "./auth/utils";

import integrationRouter from "./routes/integrations";
import omrRouter from "./routes/omr";
import examsRouter from "./routes/exams";
import sebRouter from "./routes/seb";
import { EmailService } from "./services/email";
import { AuditService } from "./services/auditLog";
import { requireAuth, requireRole, writeRoles } from "./middleware/auth";
import gradebookRouter from "./routes/gradebook";
import rubricsRouter from './routes/rubrics';
import templatesRouter from './routes/templates';
import notesRouter from './routes/notes';
import modulesRouter from './routes/contentModules';
import courseDuplicateRouter from './routes/courseDuplicate';
import questionBankRouter from './routes/questionBank';
import plagiarismRouter from './routes/plagiarism';
import progressRouter from './routes/progress';
import { LtiService } from './services/lti';
import { XApiService } from './services/xapi';
import { QtiService } from './services/qti';
import authLdapRouter from './routes/auth_ldap';
import authSamlRouter from './routes/auth_saml';
import xapiRouter from './routes/xapi';
import pushRouter from './routes/push';
import ltiRouter from './routes/lti';


const app = express();

// --- AUTO RESET USERS REMOVED ---
// --- STARTUP KEYBOARD CAT TEST MAIL REMOVED ---
const appName = process.env.APP_NAME || "LMS API";
const appVersion = process.env.npm_package_version || "1.0.0";
const port = process.env.LMS_API_PORT || 4000;
const authMode = process.env.LMS_AUTH_MODE || "local";
const resolvedMode = process.env.LMS_MODE || "local";
const resolvedCorsOrigin = process.env.LMS_CORS_ORIGIN || "*";

// Passport Config
app.use(passport.initialize());
configureMicrosoftStrategy(passport);
configureGoogleStrategy(passport);


app.set('trust proxy', 1); // Trust first proxy (needed for rate limiter behind Nginx/Vercel)
app.use(cors({ origin: resolvedCorsOrigin, credentials: true }));

// SECURITY: Helmet (Headers) & Rate Limiting
import helmet from "helmet";
import rateLimit from "express-rate-limit";

// 1. Helmet for secure headers (CSP disabling for now to avoid dev issues with images/scripts)
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

// 2. Rate Limiting (150 requests per 15 mins per IP)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 150,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: "too_many_requests", message: "Çok fazla istek gönderdiniz, lütfen 15 dakika bekleyin." }
});
app.use(limiter);

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

const UPLOADS_DIR = path.join(process.cwd(), "uploads");
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
app.use('/uploads', express.static(UPLOADS_DIR));

// Multer setup for file uploads
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9-_]/g, "");
    cb(null, `${name}-${Date.now()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
});

const requireMultipart: express.RequestHandler = (req, res, next) => {
  const contentType = req.headers["content-type"];
  if (!contentType || !contentType.includes("multipart/form-data")) {
    return res.status(400).json({ error: "bad_request", message: "multipart_required" });
  }
  next();
};

const nowIso = () => new Date().toISOString();
const newId = () => crypto.randomUUID();

// Password policy check (min 8 chars, upper/lower/number/special)
const validatePassword = (password: string): { valid: boolean; error?: string } => {
  if (password.length < 8) {
    return { valid: false, error: 'password_min_length' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: 'password_uppercase_required' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, error: 'password_lowercase_required' };
  }
  if (!/[.!@#$%^&*()_+\-=\[\]{};':"\|,<>\/?]/.test(password)) {
    return { valid: false, error: 'password_special_char_required' };
  }
  return { valid: true };
};

const createUserRecord = async (input: {
  username: string;
  email: string;
  password: string;
  role: Role;
  emailVerified?: boolean;
  fullName?: string;
}) => {
  // Password security check
  const passwordCheck = validatePassword(input.password);
  if (!passwordCheck.valid) {
    throw new Error(passwordCheck.error);
  }

  const timestamp = nowIso();
  const normalizedEmail = input.email.trim().toLowerCase();
  const emailVerified = Boolean(input.emailVerified);

  const record: UserRecord = {
    id: newId(),
    username: input.username.trim(),
    email: normalizedEmail,
    emailVerified,
    role: input.role,
    passwordHash: hashPassword(input.password),
    createdAt: timestamp,
    updatedAt: timestamp,
    fullName: input.fullName
  };
  await query(
    `INSERT INTO users (id, username, email, email_verified, role, password_hash, created_at, updated_at, full_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      record.id,
      record.username,
      record.email,
      record.emailVerified ?? false,
      record.role,
      record.passwordHash,
      record.createdAt,
      record.updatedAt,
      record.fullName
    ]
  );
  return record;
};

const createEmailVerificationToken = async (userId: string, email: string) => {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  await query(`DELETE FROM email_verification_tokens WHERE user_id = $1`, [userId]);
  await query(
    `INSERT INTO email_verification_tokens (id, user_id, token_hash, expires_at, created_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [newId(), userId, tokenHash, expiresAt, nowIso()]
  );

  const baseUrl = "https://lms.tunayalcin.site";
  const verifyLink = `${baseUrl}/auth/verify-email?token=${token}&email=${encodeURIComponent(email)}`;
  const smtpConfigured = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

  // LOG LINK HERE TOO (To catch mock mode)
  console.log("=====================================================");
  console.log(`[VERIFICATION LINK RAW] For ${email}:`);
  console.log(verifyLink);
  console.log("=====================================================");

  if (!smtpConfigured) {
    return { mode: "mock" as const, verifyLink };
  }

  await EmailService.sendEmailVerification(email, token);
  return { mode: "smtp" as const };
};

const updateUserRecord = async (input: {
  id: string;
  username: string;
  email?: string;
  role: Role;
  passwordHash?: string | null;
  emailVerified: boolean;
}) => {
  const timestamp = nowIso();
  const { rows } = await query<UserRecord>(
    `UPDATE users
      SET username = $1,
          email = $2,
          email_verified = $3,
          role = $4,
          password_hash = COALESCE($5, password_hash),
          updated_at = $6
      WHERE id = $7
      RETURNING id, username, email, email_verified as "emailVerified", role, password_hash as "passwordHash",
        created_at as "createdAt", updated_at as "updatedAt"`,
    [
      input.username.trim(),
      input.email ? input.email.trim().toLowerCase() : null,
      input.emailVerified,
      input.role,
      input.passwordHash || null,
      timestamp,
      input.id
    ]
  );
  return rows[0];
};

const deleteUserRecord = async (id: string) => {
  const result = await query(`DELETE FROM users WHERE id = $1`, [id]);
  return result.rowCount ?? 0;
};

type LMSAuthedRequest = express.Request;

const questionTypes = [
  "multiple_choice",
  "multiple_select",
  "true_false",
  "matching",
  "ordering",
  "fill_blank",
  "short_answer",
  "long_answer",
  "file_upload",
  "calculation",
  "hotspot",
  "code"
] as const;
type QuestionType = (typeof questionTypes)[number];
const trueFalseOptions = ["Dogru", "Yanlis"] as const;
const choiceQuestionTypes = new Set<QuestionType>(["multiple_choice", "multiple_select"]);





// --- Type Definitions ---
type UserRecord = User & {
  passwordHash: string;
  emailVerified?: boolean;
  createdAt: string;
  updatedAt: string;
};

type Course = {
  id: string;
  title: string;
  description?: string;
  instructorId?: string;
  mattermostChannelId?: string;
  createdAt: string;
  updatedAt: string;
};

type Exam = {
  id: string;
  title: string;
  courseId?: string;
  durationMinutes?: number;
  passThreshold?: number;
  startDate?: string;
  endDate?: string;
  maxAttempts?: number;
  isDraft?: boolean;
  resultsVisibleAt?: string;
  createdAt: string;
  updatedAt: string;
};

type Question = {
  id: string;
  examId?: string;
  prompt: string;
  type: string;
  options?: string[];
  answer?: any;
  meta?: any;
  points?: number;
  createdAt: string;
  updatedAt?: string;
};

type ExamSubmission = {
  id: string;
  examId: string;
  userId: string;
  score: number;
  answers: any;
  attemptNumber?: number;
  startedAt?: string;
  submittedAt: string;
  createdAt: string;
  updatedAt: string;
};

type QuestionMeta = {
  matchingPairs?: { left: string; right: string }[];
  orderingItems?: string[];
  blankAnswers?: string[][];
  shortAnswers?: string[];
  longAnswerGuide?: string;
  fileUpload?: {
    allowedTypes?: string[];
    maxFiles?: number;
    maxSizeMb?: number;
  };
  calculation?: {
    formula: string;
    variables?: { name: string; min?: number; max?: number; step?: number }[];
  };
  hotspot?: {
    imageUrl: string;
    areas: { x: number; y: number; width: number; height: number }[];
  };
  code?: {
    language: string;
    starter?: string;
    tests?: { input: string; output: string }[];
  };
};

type ContentItem = {
  id: string;
  type: string;
  title: string;
  source?: string;
  courseId?: string;
  createdAt: string;
  updatedAt: string;
};

// --- Schemas ---
const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1)
});

const roleSchema = z.enum(roles);

const passwordPolicyRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[.!@#$%^&*()_+\-=\[\]{};':"\\|,<>\/?])[A-Za-z\d.!@#$%^&*()_+\-=\[\]{};':"\\|,<>\/?]{8,}$/;
const passwordSchema = z
  .string()
  .min(8, "password_min_length")
  .refine((val) => passwordPolicyRegex.test(val), {
    message: "password_special_char_required"
  });

const userCreateSchema = z.object({
  username: z.string().min(1),
  email: z.string().email(),
  password: passwordSchema,
  role: roleSchema.optional()
});

const userRegisterSchema = z.object({
  username: z.string().min(1),
  email: z.string().email(),
  password: passwordSchema,
  role: roleSchema.optional(),
  fullName: z.string().optional()
});

const userPatchSchema = z.object({
  username: z.string().min(1).optional(),
  email: z.string().email().optional(),
  password: passwordSchema.optional(),
  role: roleSchema.optional()
});

const courseSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional()
});

const coursePatchSchema = courseSchema.partial();

const examSchema = z.object({
  title: z.string().min(1),
  courseId: z.string().optional(),
  durationMinutes: z.number().optional(),
  passThreshold: z.number().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  maxAttempts: z.number().optional(),
  isDraft: z.boolean().optional(),
  resultsVisibleAt: z.string().optional()
});

const examPatchSchema = z.object({
  title: z.string().optional(),
  courseId: z.string().optional(),
  durationMinutes: z.number().optional(),
  passThreshold: z.number().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  maxAttempts: z.number().optional(),
  isDraft: z.boolean().optional(),
  resultsVisibleAt: z.string().optional()
});

const examSubmissionSchema = z.object({
  answers: z.record(z.any())
});

const questionTypeSchema = z.enum(questionTypes);
const questionAnswerSchema = z.union([
  z.string().min(1),
  z.array(z.string().min(1)),
  z.boolean(),
  z.number()
]);
const matchingPairSchema = z.object({
  left: z.string().min(1),
  right: z.string().min(1)
});
const calculationVariableSchema = z.object({
  name: z.string().min(1),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional()
});
const hotspotAreaSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number()
});
const codeTestSchema = z.object({
  input: z.string().min(1),
  output: z.string().min(1)
});
const questionMetaSchema = z
  .object({
    matchingPairs: z.array(matchingPairSchema).optional(),
    orderingItems: z.array(z.string().min(1)).optional(),
    blankAnswers: z.array(z.array(z.string().min(1))).optional(),
    shortAnswers: z.array(z.string().min(1)).optional(),
    longAnswerGuide: z.string().min(1).optional(),
    fileUpload: z
      .object({
        allowedTypes: z.array(z.string().min(1)).optional(),
        maxFiles: z.number().int().positive().optional(),
        maxSizeMb: z.number().positive().optional()
      })
      .optional(),
    calculation: z
      .object({
        formula: z.string().min(1),
        variables: z.array(calculationVariableSchema).optional()
      })
      .optional(),
    hotspot: z
      .object({
        imageUrl: z.string().min(1),
        areas: z.array(hotspotAreaSchema).min(1)
      })
      .optional(),
    code: z
      .object({
        language: z.string().min(1),
        starter: z.string().optional(),
        tests: z.array(codeTestSchema).optional()
      })
      .optional()
  })
  .optional();

const questionSchema = z.object({
  prompt: z.string().min(1),
  type: questionTypeSchema,
  examId: z.string().optional(),
  options: z.array(z.string().min(1)).optional(),
  answer: questionAnswerSchema.optional(),
  meta: questionMetaSchema,
  points: z.number().optional()
});

const questionPatchSchema = z.object({
  prompt: z.string().min(1).optional(),
  type: questionTypeSchema.optional(),
  examId: z.string().optional(),
  options: z.array(z.string().min(1)).optional(),
  answer: questionAnswerSchema.optional(),
  meta: questionMetaSchema,
  points: z.number().optional()
});

const contentSchema = z.object({
  type: z.string().min(1),
  title: z.string().min(1),
  source: z.string().optional(), // For SCORM/upload ID
  meetingUrl: z.string().optional(), // For Teams/Jitsi
  courseId: z.string().min(1)
});

const contentPatchSchema = z.object({
  type: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  source: z.string().optional(),
  meetingUrl: z.string().optional()
});

const scormValidateSchema = z.object({
  packageUrl: z.string().min(1).optional(),
  manifest: z.string().min(1).optional()
});

const xapiStatementSchema = z.object({
  actor: z.any(),
  verb: z.any(),
  object: z.any()
});

const ltiLaunchSchema = z.object({
  launchUrl: z.string().min(1)
});

const qtiValidateSchema = z.object({
  packageUrl: z.string().min(1).optional()
});

const smtpTestSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1),
  message: z.string().min(1)
});

const mattermostTestSchema = z.object({
  message: z.string().min(1),
  channelId: z.string().optional(),
  courseId: z.string().optional()
});

const microsoftMeetingSchema = z.object({
  subject: z.string().min(1),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  attendees: z.array(z.string().email()).optional()
});

// --- Helper Functions ---
const getUserByUsername = async (username: string) => {
  const { rows } = await query<UserRecord>("SELECT * FROM users WHERE username = $1", [username]);
  return rows[0];
};

const getUserById = async (id: string) => {
  const { rows } = await query<UserRecord>("SELECT * FROM users WHERE id = $1", [id]);
  return rows[0];
};

const sanitizeUser = (user: UserRecord): User => {
  const { passwordHash, ...rest } = user;
  return rest;
};

const writeAudit = async (entry: { actorId?: string; action: string; entityType?: string; entityId?: string; meta?: any }) => {
  try {
    await query(
      `INSERT INTO audit_logs (id, actor_id, event_type, action, entity_type, entity_id, meta, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [newId(), entry.actorId ?? null, entry.action, entry.action, entry.entityType ?? null, entry.entityId ?? null, toJson(entry.meta), nowIso()]
    );
  } catch (err) {
    console.error("Audit log failed:", err);
  }
};

const listUsers = async (limit: number, offset: number) => {
  const { rows } = await query<UserRecord>(
    `SELECT * FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return rows;
};

const normalizeUsername = (value: string) => value.trim().toLowerCase();
const normalizeAnswerToken = (value: string) =>
  value.trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");

const normalizeTrueFalseAnswer = (
  answer: unknown
): (typeof trueFalseOptions)[number] | undefined => {
  if (typeof answer === "boolean") {
    return answer ? trueFalseOptions[0] : trueFalseOptions[1];
  }
  if (typeof answer === "string") {
    const normalized = normalizeAnswerToken(answer);
    if (["dogru", "true", "t", "yes", "evet"].includes(normalized)) {
      return trueFalseOptions[0];
    }
    if (["yanlis", "false", "f", "no", "hayir"].includes(normalized)) {
      return trueFalseOptions[1];
    }
  }
  return undefined;
};

const hashPassword = (password: string) => {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
};

const verifyPassword = (password: string, stored: string) => {
  if (!stored) { return false; }
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) {
    return false; // Malformed
  }
  const check = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(check, "hex"));
};

// ... lines 605-727 ... (skipped, this tool handles non-contiguous edits if I used multi_replace, but I must use replace_file_content for contiguous. 
// Wait, I cannot edit non-contiguous lines in one replace_file_content call.
// I will use multi_replace_file_content instead.


const checkCourseOwnership = async (courseId: string, actor: User) => {
  if (isAssistantOrAbove(actor.role)) return true;
  const { rows } = await query("SELECT instructor_id FROM courses WHERE id = $1", [courseId]);
  return rows[0]?.instructor_id === actor.id;
};

const checkExamOwnership = async (examId: string, actor: User) => {
  if (isAssistantOrAbove(actor.role)) return true;
  const { rows } = await query(
    `SELECT c.instructor_id FROM exams e 
     JOIN courses c ON e.course_id = c.id 
     WHERE e.id = $1`,
    [examId]
  );
  return rows[0]?.instructor_id === actor.id;
};

const checkContentOwnership = async (contentId: string, actor: User) => {
  if (isAssistantOrAbove(actor.role)) return true;
  const { rows } = await query(
    `SELECT c.instructor_id FROM content_items ci
     JOIN courses c ON ci.course_id = c.id 
     WHERE ci.id = $1`,
    [contentId]
  );
  return rows[0]?.instructor_id === actor.id;
};

const toJson = (value: unknown) => {
  if (value === undefined) {
    return null;
  }
  return JSON.stringify(value);
};

const seedContent = async () => {
  const { rows } = await query<{ count: string }>(
    `SELECT COUNT(*)::text as count FROM content_items`
  );
  if (rows[0] && Number(rows[0].count) > 0) {
    return;
  }
  const timestamp = nowIso();
  const items: ContentItem[] = [
    {
      id: newId(),
      type: "video",
      title: "Intro Video",
      source: "placeholder",
      createdAt: timestamp,
      updatedAt: timestamp
    },
    {
      id: newId(),
      type: "pdf",
      title: "Sample PDF",
      source: "placeholder",
      createdAt: timestamp,
      updatedAt: timestamp
    }
  ];

  for (const item of items) {
    await query(
      `INSERT INTO content_items (id, type, title, source, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [item.id, item.type, item.title, item.source, item.createdAt, item.updatedAt]
    );
  }
};

const badRequest = (res: express.Response, error: unknown) => {
  return res.status(400).json({ error: "validation_error", details: error });
};

const parsePagination = (req: express.Request, fallbackLimit = 1000) => {
  const limitRaw = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
  const offsetRaw = Array.isArray(req.query.offset) ? req.query.offset[0] : req.query.offset;
  const limitParsed = limitRaw ? Number(limitRaw) : fallbackLimit;
  const offsetParsed = offsetRaw ? Number(offsetRaw) : 0;
  const limit = Number.isFinite(limitParsed)
    ? Math.min(Math.max(Math.trunc(limitParsed), 1), 1000)
    : fallbackLimit;
  const offset = Number.isFinite(offsetParsed)
    ? Math.max(Math.trunc(offsetParsed), 0)
    : 0;
  return { limit, offset };
};



app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: nowIso(),
    mode: resolvedMode
  });
});


app.get("/version", (_req, res) => {
  res.json({
    name: appName,
    version: appVersion,
    node: process.version,
    mode: resolvedMode,
    timestamp: nowIso()
  });
});

import coursesRouter from "./routes/courses";

app.use("/api/integrations", integrationRouter);
app.use("/api/omr", omrRouter);
app.use("/api/courses", coursesRouter);
app.use("/api/exams", examsRouter);
app.use("/api/seb", sebRouter);
app.use("/auth", authOauthRoutes);
app.use("/auth/ldap", authLdapRouter);
app.use("/auth/saml", authSamlRouter);
app.use("/api/xapi", xapiRouter);
app.use("/api/lti", ltiRouter);
app.use("/api/rubrics", rubricsRouter);
app.use("/api/templates", templatesRouter);
app.use("/api/notes", notesRouter);
app.use("/api/modules", modulesRouter);
app.use("/api/gradebook", gradebookRouter);
app.use("/api/question-bank", questionBankRouter);
app.use("/api/plagiarism", plagiarismRouter);
app.use("/api/progress", progressRouter);
app.use("/api/courses", courseDuplicateRouter);
app.use("/api/push", pushRouter);

app.post("/auth/login", async (req, res) => {
  try {
    console.log('[auth/login] Request received:', JSON.stringify(req.body));
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return badRequest(res, parsed.error.flatten());
    }

    const { username, password } = parsed.data;
    console.log('[auth/login] Attempting login for user:', username);

    if (authMode === "local") {
      console.log('[auth/login] Querying database for user...');
      const existing = await getUserByUsername(username);
      console.log('[auth/login] User found:', existing ? 'yes' : 'no');
      // Fix: pg-mem/pg might return snake_case 'password_hash'. Handle both.
      const storedHash = existing?.passwordHash || (existing as any)?.password_hash;

      if (!existing || !verifyPassword(password, storedHash)) {
        return res.status(401).json({ error: "invalid_credentials" });
      }
      const isEmailVerified = existing.emailVerified ?? (existing as any).email_verified ?? false;

      if (existing.email && !isEmailVerified) {
        return res.status(403).json({ error: "email_not_verified" });
      }

      // Check if user has 2FA enabled (using user_2fa table)
      let twoFactorEnabled = false;
      try {
        const { rows: twoFaRows } = await query("SELECT enabled FROM user_2fa WHERE user_id = $1", [existing.id]);
        twoFactorEnabled = twoFaRows[0]?.enabled === true;
      } catch (e) {
        console.log('[auth] user_2fa table not available, skipping 2FA check');
      }

      if (twoFactorEnabled) {
        // Generate temporary token for 2FA verification (valid for 5 minutes)
        const tempPayload = { userId: existing.id, purpose: '2fa_verify', exp: Math.floor(Date.now() / 1000) + 300 };
        const tempToken = jwt.sign(tempPayload, JWT_SECRET);

        return res.json({
          requires2FA: true,
          tempToken,
          message: "2fa_required"
        });
      }

      // Ensure sanitizeUser gets the right property if it expects it
      // Or prefer to reconstruct the user object cleanly to avoid further issues
      const userToSanitize = { ...existing, emailVerified: isEmailVerified };
      const user = sanitizeUser(userToSanitize);
      const { accessToken, refreshToken } = generateTokens(user);

      if (resolvedMode === "local" || resolvedMode === "docker") {
        try {
          const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
          const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days
          await query(
            `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at)
           VALUES ($1, $2, $3, $4, $5)`,
            [newId(), user.id, tokenHash, expiresAt, nowIso()]
          );
        } catch (e) {
          console.error("Failed to store refresh token", e);
        }
      }

      void writeAudit({
        actorId: user.id,
        action: "auth_login",
        entityType: "user",
        entityId: user.id,
        meta: { mode: authMode }
      });
      return res.json({ accessToken, refreshToken, user });
    }

    const normalized = normalizeUsername(username);
    const matchedRole = roles.find((role) => role.toLowerCase() === normalized);
    const role: Role = matchedRole ?? "Student";
    const user: User = {
      id: newId(),
      username,
      role,
      email: `${username.toLowerCase()}@example.com`
    };

    const { accessToken, refreshToken } = generateTokens(user);

    void writeAudit({
      actorId: user.id,
      action: "auth_login",
      entityType: "user",
      entityId: user.id,
      meta: { mode: authMode }
    });

    return res.json({ accessToken, refreshToken, user });
  } catch (err) {
    console.error('[auth/login] CRITICAL ERROR:', err);
    return res.status(500).json({ error: "server_error", details: String(err) });
  }
});

app.post("/auth/bootstrap", async (req, res) => {
  if (authMode !== "local") {
    return res.status(400).json({ error: "auth_mode" });
  }

  const demoPassword = "Admin123!";

  // Pre-defined demo users
  const demoUsers = [
    { username: "superadmin", password: demoPassword, role: "SuperAdmin", email: "superadmin@example.com" },
    { username: "admin", password: demoPassword, role: "Admin", email: "admin@example.com" },
    { username: "smoke.admin", password: demoPassword, role: "Admin", email: "smoke.admin@example.com" },
    { username: "instructor", password: demoPassword, role: "Instructor", email: "instructor@example.com" },
    { username: "assistant", password: demoPassword, role: "Assistant", email: "assistant@example.com" },
    { username: "student", password: demoPassword, role: "Student", email: "student@example.com" },
    { username: "guest", password: demoPassword, role: "Guest", email: "guest@example.com" }
  ];

  const createdUsers = [];

  for (const template of demoUsers) {
    const existing = await getUserByUsername(template.username);
    if (!existing) {
      const record = await createUserRecord({
        username: template.username,
        email: template.email,
        password: template.password,
        role: template.role as Role,
        emailVerified: true
      });
      createdUsers.push(sanitizeUser(record));
    }
  }

  // Keep smoke user usable for CI/local smoke even on persistent DBs (best-effort).
  try {
    const smokeAdmin = await getUserByUsername("smoke.admin");
    if (smokeAdmin) {
      await query("UPDATE user_2fa SET enabled = false WHERE user_id = $1", [smokeAdmin.id]);
    }
  } catch (_e) {
    // ignore if user_2fa doesn't exist
  }

  // If request body was provided (legacy behavior), try to create that one too
  const parsed = userCreateSchema.safeParse(req.body);
  if (parsed.success) {
    const existing = await getUserByUsername(parsed.data.username);
    if (!existing) {
      const role = parsed.data.role ?? "SuperAdmin";
      const record = await createUserRecord({
        username: parsed.data.username,
        email: parsed.data.email, // now mandatory in schema
        password: parsed.data.password,
        role
      });
      createdUsers.push(sanitizeUser(record));
    }
  }

  return res.status(201).json({
    message: "Bootstrap completed. Demo users created if missing.",
    created: createdUsers
  });
});

// --- Register Endpoint (Public) ---
app.post("/auth/register", async (req, res) => {
  if (authMode !== "local") return res.status(400).json({ error: "auth_mode" });

  const parsed = userRegisterSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error.flatten());

  const { username, password, email, role } = parsed.data;

  // 1. Check if role is allowed (SuperAdmin cannot be created via public register)
  const requestedRole = role ?? "Student";
  if (requestedRole === "SuperAdmin") {
    return res.status(403).json({ error: "forbidden", message: "superadmin_register_forbidden" });
  }

  // 2. Check existing username
  const existingUser = await getUserByUsername(username);
  if (existingUser) return res.status(409).json({ error: "username_taken" });

  // 3. Check existing email (if provided)
  const { rows } = await query("SELECT id FROM users WHERE email = $1", [email.trim().toLowerCase()]);
  if (rows.length > 0) return res.status(409).json({ error: "email_taken" });

  // 4. Create User
  let record: UserRecord;
  try {
    record = await createUserRecord({
      username,
      email,
      password,
      role: requestedRole,
      emailVerified: false,
      fullName: parsed.data.fullName
    });
  } catch (err) {
    return res.status(400).json({
      error: "validation_error",
      message: err instanceof Error ? err.message : "Invalid user data."
    });
  }

  void writeAudit({
    actorId: record.id,
    action: "auth_register",
    entityType: "user",
    entityId: record.id,
    meta: { role: record.role }
  });

  const verification = await createEmailVerificationToken(record.id, email.trim().toLowerCase());
  return res.status(201).json({ user: sanitizeUser(record), verification });
});

app.post("/auth/verify-email", async (req, res) => {
  const { token, email } = req.body ?? {};
  if (!token || !email || typeof token !== "string" || typeof email !== "string") {
    return res.status(400).json({ error: "validation_error", message: "missing_fields" });
  }

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const { rows } = await query<{ user_id: string }>(
    `SELECT t.user_id
       FROM email_verification_tokens t
       JOIN users u ON u.id = t.user_id
      WHERE t.token_hash = $1
        AND t.expires_at > NOW()
        AND lower(u.email) = lower($2)`,
    [tokenHash, email.trim().toLowerCase()]
  );

  if (!rows.length) {
    return res.status(401).json({ error: "invalid_token", message: "token_invalid" });
  }

  const userId = rows[0].user_id;
  await query(`UPDATE users SET email_verified = TRUE, updated_at = $2 WHERE id = $1`, [
    userId,
    nowIso()
  ]);
  await query(`DELETE FROM email_verification_tokens WHERE user_id = $1`, [userId]);

  return res.json({ ok: true });
});

app.post("/auth/verify-email/resend", async (req, res) => {
  const { email } = req.body ?? {};
  if (!email || typeof email !== "string") {
    return res.status(400).json({ error: "validation_error", message: "email_required" });
  }

  const { rows } = await query<{ id: string; email: string; email_verified: boolean }>(
    `SELECT id, email, email_verified FROM users WHERE lower(email) = lower($1)`,
    [email.trim().toLowerCase()]
  );

  if (!rows.length) {
    return res.json({ ok: true, message: "verification_email_sent" });
  }

  const user = rows[0];
  if (user.email_verified) {
    return res.json({ ok: true, alreadyVerified: true });
  }

  const verification = await createEmailVerificationToken(user.id, user.email);
  return res.json({ ok: true, verification });
});

// --- Forgot Password Endpoint ---
app.post("/auth/forgot-password", async (req, res) => {
  const { email } = req.body;
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: "validation_error", message: "email_required" });
  }

  // Find user by email
  const { rows } = await query<UserRecord>("SELECT * FROM users WHERE email = $1", [email.trim().toLowerCase()]);
  const user = rows[0];

  if (!user) {
    // Return success even if user not found to prevent enumeration
    return res.json({ ok: true, message: "verification_email_sent" });
  }

  // Generate Reset Token (short lived, e.g. 1 hour)
  const resetToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

  await query(
    `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [newId(), user.id, tokenHash, expiresAt, nowIso()] // Reusing refresh_tokens table strictly for PoC, ideally use separate table
  );

  const baseUrl = process.env.LMS_WEB_URL || process.env.LMS_WEB_BASE_URL || "http://localhost:3000";
  const resetLink = `${baseUrl}/auth/reset-password?token=${resetToken}&email=${email}`;
  const smtpConfigured = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
  if (!smtpConfigured) {
    return res.json({ ok: true, mode: "mock", resetLink });
  }

  await EmailService.sendPasswordReset(email, resetToken);
  return res.json({ ok: true, mode: "smtp" });
});

// --- Reset Password Endpoint ---
app.post("/auth/reset-password", async (req, res) => {
  const { token, email, newPassword } = req.body;
  if (!token || !email || !newPassword) {
    return res.status(400).json({ error: "validation_error", message: "missing_fields" });
  }

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const { rows } = await query<{ user_id: string }>(
    `SELECT user_id FROM refresh_tokens 
     WHERE token_hash = $1 AND expires_at > NOW()`,
    [tokenHash]
  );

  if (!rows.length) {
    return res.status(401).json({ error: "invalid_token", message: "token_invalid" });
  }

  const userId = rows[0].user_id;

  // Verify email matches user (security check)
  const userRecord = await getUserById(userId);
  if (!userRecord || userRecord.email !== email) {
    return res.status(401).json({ error: "invalid_token", message: "email_mismatch" });
  }

  // Update password
  const newPasswordHash = hashPassword(newPassword);
  await query("UPDATE users SET password_hash = $1, updated_at = $2 WHERE id = $3", [newPasswordHash, nowIso(), userId]);

  // Invalidate token
  await query("DELETE FROM refresh_tokens WHERE token_hash = $1", [tokenHash]);

  return res.json({ ok: true });
});

app.get("/auth/me", requireAuth, (req, res) => {
  res.json({ user: (req as LMSAuthedRequest).user });
});

app.post("/auth/logout", requireAuth, (req, res) => {
  // Stateless JWT, client discards token.
  res.json({ ok: true });
});

app.post("/auth/refresh", async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(400).json({ error: "missing_token" });
  }

  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

  const { rows } = await query<{ user_id: string }>(
    `SELECT user_id FROM refresh_tokens 
     WHERE token_hash = $1 AND expires_at > NOW()`,
    [tokenHash]
  );

  if (!rows.length) {
    return res.status(401).json({ error: "invalid_grant" });
  }

  const userId = rows[0].user_id;
  const userRecord = await getUserById(userId);

  if (!userRecord) {
    return res.status(401).json({ error: "user_not_found" });
  }

  const user = sanitizeUser(userRecord);
  const tokens = generateTokens(user);

  // Rotate refresh token (revoke old, issue new)
  await query(`DELETE FROM refresh_tokens WHERE token_hash = $1`, [tokenHash]);

  const newTokenHash = crypto.createHash('sha256').update(tokens.refreshToken).digest('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  await query(
    `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [newId(), user.id, newTokenHash, expiresAt, nowIso()]
  );

  res.json({ ...tokens, user });
});

app.get("/roles", (_req, res) => {
  res.json({ roles });
});

app.get("/users", requireRole(adminRoles), async (req, res) => {
  const { limit, offset } = parsePagination(req);
  const list = await listUsers(limit, offset);
  res.json({ users: list.map((item) => sanitizeUser(item)) });
});

app.get("/users/:id", requireRole(adminRoles), async (req, res) => {
  const user = await getUserById(req.params.id);
  if (!user) {
    return res.status(404).json({ error: "not_found" });
  }
  res.json({ user: sanitizeUser(user) });
});

app.post("/users", requireRole(adminRoles), async (req, res) => {
  const parsed = userCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return badRequest(res, parsed.error.flatten());
  }
  const existing = await getUserByUsername(parsed.data.username);
  if (existing) {
    return res.status(409).json({ error: "username_taken" });
  }
  if (parsed.data.email) {
    const { rows } = await query("SELECT id FROM users WHERE email = $1", [
      parsed.data.email.trim().toLowerCase()
    ]);
    if (rows.length > 0) {
      return res.status(409).json({ error: "email_taken" });
    }
  }
  const role = parsed.data.role ?? "Student";
  let record: UserRecord;
  try {
    record = await createUserRecord({
      username: parsed.data.username,
      email: parsed.data.email,
      password: parsed.data.password,
      role
    });
  } catch (err) {
    return res.status(400).json({
      error: "validation_error",
      message: err instanceof Error ? err.message : "invalid_user_data"
    });
  }
  const actor = (req as LMSAuthedRequest).user;
  void writeAudit({
    actorId: actor?.id,
    action: "user_create",
    entityType: "user",
    entityId: record.id,
    meta: { role: record.role }
  });
  res.status(201).json({ user: sanitizeUser(record) });
});

app.patch("/users/:id", requireRole(adminRoles), async (req, res) => {
  const parsed = userPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    return badRequest(res, parsed.error.flatten());
  }
  if (parsed.data.password) {
    const passwordCheck = validatePassword(parsed.data.password);
    if (!passwordCheck.valid) {
      return res.status(400).json({
        error: "validation_error",
        message: passwordCheck.error
      });
    }
  }
  const existing = await getUserById(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: "not_found" });
  }
  const nextUsername = parsed.data.username ?? existing.username;
  const normalized = normalizeUsername(nextUsername);
  if (normalized !== normalizeUsername(existing.username)) {
    const duplicate = await getUserByUsername(nextUsername);
    if (duplicate) {
      return res.status(409).json({ error: "username_taken" });
    }
  }
  const existingEmail = existing.email ? existing.email.toLowerCase() : undefined;
  const nextEmail = parsed.data.email ? parsed.data.email.trim().toLowerCase() : existingEmail;
  const emailChanged = Boolean(nextEmail && nextEmail !== existingEmail);
  if (nextEmail && nextEmail !== existingEmail) {
    const { rows } = await query("SELECT id FROM users WHERE email = $1", [nextEmail]);
    if (rows.length > 0) {
      return res.status(409).json({ error: "email_taken" });
    }
  }
  const nextPasswordHash = parsed.data.password
    ? hashPassword(parsed.data.password)
    : existing.passwordHash;
  const nextEmailVerified = nextEmail ? (emailChanged ? false : Boolean(existing.emailVerified)) : true;
  const updated = await updateUserRecord({
    id: existing.id,
    username: nextUsername,
    email: nextEmail,
    role: parsed.data.role ?? existing.role,
    passwordHash: nextPasswordHash,
    emailVerified: nextEmailVerified
  });
  const actor = (req as LMSAuthedRequest).user;
  void writeAudit({
    actorId: actor?.id,
    action: "user_update",
    entityType: "user",
    entityId: updated.id,
    meta: { role: updated.role }
  });
  res.json({ user: sanitizeUser(updated) });
});

app.delete("/users/:id", requireRole(adminRoles), async (req, res) => {
  const deleted = await deleteUserRecord(req.params.id);
  if (!deleted) {
    return res.status(404).json({ error: "not_found" });
  }
  const actor = (req as LMSAuthedRequest).user;
  void writeAudit({
    actorId: actor?.id,
    action: "user_delete",
    entityType: "user",
    entityId: req.params.id
  });
  res.json({ ok: true });
});

app.get("/courses", requireAuth, async (req, res) => {
  const { limit, offset } = parsePagination(req);
  const user = (req as LMSAuthedRequest).user!;
  const mode = req.query.mode as string; // 'enrolled' or 'browse'

  let queryText = `SELECT id, title, description, instructor_id as "instructorId", created_at as "createdAt", updated_at as "updatedAt"
     FROM courses`;
  const params: any[] = [limit, offset];

  if (user.role === 'Instructor') {
    queryText += ` WHERE instructor_id = $3`;
    params.push(user.id);
  } else if (user.role === 'Student') {
    if (mode === 'enrolled') {
      queryText += ` WHERE id IN (SELECT course_id FROM course_enrollments WHERE user_id = $3)`;
      params.push(user.id);
    } else if (mode === 'browse') {
      // Show ALL courses not enrolled in. Simple and effective.
      queryText += ` WHERE id NOT IN (SELECT course_id FROM course_enrollments WHERE user_id = $3)`;
      params.push(user.id);
    } else {
      // If no mode specified, default to enrolled for cleanliness, or ALL?
      // Let's default to 'enrolled' for students if mode is missing.
      queryText += ` WHERE id IN (SELECT course_id FROM course_enrollments WHERE user_id = $3)`;
      params.push(user.id);
    }
  }
  // Assistants and Admins see all by default (no WHERE added)

  queryText += ` ORDER BY created_at DESC LIMIT $1 OFFSET $2`;

  const { rows } = await query<Course>(queryText, params);
  res.json({ courses: rows });
});

app.post("/courses", requireRole(writeRoles), async (req, res) => {
  const parsed = courseSchema.safeParse(req.body);
  if (!parsed.success) {
    return badRequest(res, parsed.error.flatten());
  }

  const id = newId();
  const timestamp = nowIso();
  const actor = (req as LMSAuthedRequest).user;

  // If Instructor, auto-assign. If Admin, could be null or assigned. 
  // For simplicity MVP, assign to creator if not specified (though schema doesn't have instructorId input yet, so auto-assign to actor).
  const instructorId = actor?.role === 'Instructor' ? actor.id : null;

  const { rows } = await query<Course>(
    `INSERT INTO courses (id, title, description, instructor_id, created_at, updated_at, mattermost_webhook_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, title, description, instructor_id as "instructorId", mattermost_webhook_url as "mattermostWebhookUrl", created_at as "createdAt", updated_at as "updatedAt"`,
    [id, parsed.data.title, parsed.data.description ?? null, instructorId, timestamp, timestamp, req.body.mattermostWebhookUrl ?? null]
  );

  void writeAudit({
    actorId: actor?.id,
    action: "course_create",
    entityType: "course",
    entityId: rows[0]?.id
  });
  res.status(201).json({ course: rows[0] });
});

app.get("/courses/:id", requireAuth, async (req, res) => {
  const { rows } = await query<Course>(
    `SELECT id, title, description, created_at as "createdAt", updated_at as "updatedAt"
     FROM courses WHERE id = $1`,
    [req.params.id]
  );
  const course = rows[0];
  if (!course) {
    return res.status(404).json({ error: "not_found" });
  }
  res.json({ course });
});

app.patch("/courses/:id", requireRole(writeRoles), async (req, res) => {
  const parsed = coursePatchSchema.safeParse(req.body);
  if (!parsed.success) {
    return badRequest(res, parsed.error.flatten());
  }

  const { rows: existingRows } = await query<Course>(
    `SELECT id, title, description, created_at as "createdAt", updated_at as "updatedAt"
     FROM courses WHERE id = $1`,
    [req.params.id]
  );
  const existing = existingRows[0];
  if (!existing) {
    return res.status(404).json({ error: "not_found" });
  }

  const actor = (req as LMSAuthedRequest).user!;
  if (!(await checkCourseOwnership(req.params.id, actor))) {
    return res.status(403).json({ error: "forbidden", message: "course_ownership_required" });
  }

  const nextTitle = parsed.data.title ?? existing.title;
  const nextDescription =
    parsed.data.description === undefined ? existing.description : parsed.data.description;
  const updatedAt = nowIso();
  const nextMattermostWebhookUrl = req.body.mattermostWebhookUrl === undefined ? (existing as any).mattermost_webhook_url : req.body.mattermostWebhookUrl;

  const { rows } = await query<Course>(
    `UPDATE courses
     SET title = $1, description = $2, mattermost_webhook_url = $3, updated_at = $4
     WHERE id = $5
     RETURNING id, title, description, mattermost_webhook_url as "mattermostWebhookUrl", created_at as "createdAt", updated_at as "updatedAt"`,
    [nextTitle, nextDescription ?? null, nextMattermostWebhookUrl ?? null, updatedAt, req.params.id]
  );
  void writeAudit({
    actorId: actor?.id,
    action: "course_update",
    entityType: "course",
    entityId: rows[0]?.id
  });
  res.json({ course: rows[0] });
});

app.delete("/courses/:id", requireRole(writeRoles), async (req, res) => {
  const actor = (req as LMSAuthedRequest).user!;
  if (!(await checkCourseOwnership(req.params.id, actor))) {
    return res.status(403).json({ error: "forbidden", message: "course_ownership_required" });
  }

  const result = await query(`DELETE FROM courses WHERE id = $1`, [req.params.id]);
  if (!result.rowCount) {
    return res.status(404).json({ error: "not_found" });
  }
  void writeAudit({
    actorId: actor?.id,
    action: "course_delete",
    entityType: "course",
    entityId: req.params.id
  });
  res.json({ ok: true });



});


// --- LDAP / SSO Stubs ---
app.post("/auth/ldap/login", async (req, res) => {
  const { username, password } = req.body;
  console.log(`[LDAP Stub] Attempting login for ${username}`);
  if (username && username.startsWith("ldap_")) {
    return res.json({ token: "mock_ldap_token", user: { id: "ldap_user", username, role: "Student" } });
  }
  return res.status(401).json({ error: "ldap_auth_failed" });
});

app.get("/auth/sso/redirect", (req, res) => {
  res.redirect("https://mock-idp.com/login?callback=http://localhost:3000/auth/sso/callback");
});

// --- Plagiarism Mock ---
app.post("/assessments/plagiarism-check", requireAuth, async (req, res) => {
  await new Promise(r => setTimeout(r, 1500));
  const score = Math.floor(Math.random() * 30);
  res.json({ score, reportUrl: "https://mock-plagiarism-report.com/report.pdf" });
});
// -----------------------

app.get("/content", requireAuth, async (req, res) => {
  const { limit, offset } = parsePagination(req);
  const actor = (req as LMSAuthedRequest).user!;
  const courseId = req.query.courseId as string;

  let queryText = `SELECT ci.id, ci.type, ci.title, ci.source, ci.meeting_url as "meetingUrl", ci.course_id as "courseId", ci.created_at as "createdAt", ci.updated_at as "updatedAt"
     FROM content_items ci`;
  const params: any[] = [limit, offset];

  if (actor.role === 'Instructor') {
    queryText += ` JOIN courses c ON ci.course_id = c.id WHERE c.instructor_id = $3`;
    params.push(actor.id);
  } else if (actor.role === 'Student') {
    queryText += ` WHERE ci.course_id IN (SELECT course_id FROM course_enrollments WHERE user_id = $3)`;
    params.push(actor.id);
  }
  // Assistant/Admin see all

  if (courseId) {
    queryText += (actor.role === 'Instructor' || actor.role === 'Student') ? ` AND ci.course_id = $4` : ` WHERE ci.course_id = $3`;
    params.push(courseId);
  }

  queryText += ` ORDER BY ci.created_at DESC LIMIT $1 OFFSET $2`;

  const { rows } = await query<ContentItem>(queryText, params);
  res.json({ content: rows });
});

app.get("/content", requireAuth, async (req, res) => {
  const { limit, offset } = parsePagination(req);
  const user = (req as LMSAuthedRequest).user!;
  const courseId = req.query.courseId as string;

  let queryText = `SELECT id, type, title, source, meeting_url as "meetingUrl", course_id as "courseId", created_at as "createdAt", updated_at as "updatedAt"
     FROM content_items`;
  const params: any[] = [limit, offset];

  const conditions: string[] = [];

  if (courseId) {
    conditions.push(`course_id = $${params.length + 1}`);
    params.push(courseId);
  }

  if (user.role === 'Instructor') {
    // Only see content for courses they teach
    // If courseId is provided, we should verify ownership? Or just let the join handle it.
    // Efficient way: JOIN courses.
    // queryText += ` JOIN courses c ON content_items.course_id = c.id WHERE c.instructor_id = $...`
    // But we already have WHERE clause construction.
    // Let's modify query structure slightly.
    queryText = `SELECT ci.id, ci.type, ci.title, ci.source, ci.meeting_url as "meetingUrl", ci.course_id as "courseId", ci.created_at as "createdAt", ci.updated_at as "updatedAt"
                 FROM content_items ci
                 JOIN courses c ON ci.course_id = c.id`;
    conditions.push(`c.instructor_id = $${params.length + 1}`);
    params.push(user.id);
  } else if (user.role === 'Student') {
    // Only see content for enrolled courses
    conditions.push(`course_id IN (SELECT course_id FROM course_enrollments WHERE user_id = $${params.length + 1})`);
    params.push(user.id);
  }

  if (conditions.length > 0) {
    queryText += " WHERE " + conditions.join(" AND ");
  }

  queryText += ` ORDER BY created_at DESC LIMIT $1 OFFSET $2`;

  try {
    const { rows } = await query<ContentItem>(queryText, params);
    res.json({ content: rows });
  } catch (err) {
    console.error("GET /content error", err);
    res.status(500).json({ error: "fetch_failed" });
  }
});

app.post("/content", requireRole(writeRoles), async (req, res) => {
  const parsed = contentSchema.safeParse(req.body);
  if (!parsed.success) {
    return badRequest(res, parsed.error.flatten());
  }

  const id = newId();
  const timestamp = nowIso();
  const actor = (req as LMSAuthedRequest).user!;

  if (parsed.data.courseId && !(await checkCourseOwnership(parsed.data.courseId, actor))) {
    return res.status(403).json({ error: "forbidden", message: "course_ownership_required" });
  }

  const { rows } = await query<ContentItem>(
    `INSERT INTO content_items (id, type, title, source, meeting_url, course_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, type, title, source, meeting_url as "meetingUrl", course_id as "courseId", created_at as "createdAt", updated_at as "updatedAt"`,
    [id, parsed.data.type, parsed.data.title, parsed.data.source ?? null, parsed.data.meetingUrl ?? null, parsed.data.courseId ?? null, timestamp, timestamp]
  );
  void writeAudit({
    actorId: actor?.id,
    action: "content_create",
    entityType: "content",
    entityId: rows[0]?.id,
    meta: { type: rows[0]?.type }
  });
  res.status(201).json({ content: rows[0] });
});

// --- Enrollment & Membership ---
app.post("/courses/:id/enroll", requireAuth, async (req, res) => {
  const actor = (req as LMSAuthedRequest).user!;
  const courseId = req.params.id;

  if (actor.role !== "Student") {
    return res.status(403).json({ error: "forbidden", message: "students_only" });
  }

  const { rows: courses } = await query("SELECT id, title FROM courses WHERE id = $1", [courseId]);
  if (!courses.length) return res.status(404).json({ error: "course_not_found" });

  const course = courses[0];

  try {
    const id = crypto.randomUUID();
    await query(
      `INSERT INTO course_enrollments (id, user_id, course_id, enrolled_at)
       VALUES ($1, $2, $3, $4)`,
      [id, actor.id, courseId, nowIso()]
    );

    // Send Enrollment Email
    const baseUrl = process.env.LMS_WEB_URL || "http://localhost:5173";
    const courseLink = `${baseUrl}/courses/${courseId}`;

    import("./services/email").then(({ EmailService }) => {
      if (actor.email) {
        EmailService.sendMail(actor.email, `Kursa Kaydoldunuz: ${course.title}`, `<p>Merhaba ${actor.username},</p><p>${course.title} kursuna başarıyla kaydoldunuz.</p><a href="${courseLink}">Kursa Git</a>`).catch(console.error);
      }
    });

    res.json({ ok: true });
  } catch (err: any) {
    if (err.code === "23505") return res.status(409).json({ error: "already_enrolled" });
    throw err;
  }
});

app.get("/courses/:id/members", requireAuth, async (req, res) => {
  const actor = (req as LMSAuthedRequest).user!;
  const courseId = req.params.id;

  if (!(await checkCourseOwnership(courseId, actor))) {
    return res.status(403).json({ error: "forbidden" });
  }

  const { rows } = await query(
    `SELECT u.id, u.username, u.role, ce.enrolled_at as "enrolledAt"
     FROM users u
     JOIN course_enrollments ce ON u.id = ce.user_id
     WHERE ce.course_id = $1`,
    [courseId]
  );
  res.json({ members: rows });
});

app.post("/courses/:id/members", requireAuth, async (req, res) => {
  const actor = (req as LMSAuthedRequest).user!;
  const courseId = req.params.id;
  const { username } = req.body;

  if (!(await checkCourseOwnership(courseId, actor))) {
    return res.status(403).json({ error: "forbidden" });
  }

  const user = await getUserByUsername(username);
  if (!user) return res.status(404).json({ error: "user_not_found" });

  try {
    const id = crypto.randomUUID();
    await query(
      `INSERT INTO course_enrollments (id, user_id, course_id, enrolled_at)
       VALUES ($1, $2, $3, $4)`,
      [id, user.id, courseId, nowIso()]
    );
    res.json({ ok: true, user: sanitizeUser(user) });
  } catch (err: any) {
    if (err.code === "23505") return res.status(409).json({ error: "already_enrolled" });
    throw err;
  }
});

// --- SCORM Endpoints ---

app.post("/scorm/upload", requireRole(writeRoles), requireMultipart, upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "no_file" });
  }

  const { courseId, title } = req.body;
  if (!courseId || !title) {
    return res.status(400).json({ error: "missing_fields", message: "courseId and title are required" });
  }

  const id = crypto.randomUUID();
  const extractPath = path.join(UPLOADS_DIR, "scorm", id);

  try {
    const zip = new AdmZip(req.file.path);
    zip.extractAllTo(extractPath, true);

    // Basic Parsing of imsmanifest.xml to find entry point
    let entryPoint = "index.html";
    const manifestPath = path.join(extractPath, "imsmanifest.xml");
    if (fs.existsSync(manifestPath)) {
      const manifestContent = fs.readFileSync(manifestPath, "utf-8");
      // Simple regex to find the first resource with type="webcontent" and href
      const match = manifestContent.match(/<resource[^>]*type="webcontent"[^>]*href="([^"]+)"/);
      if (match && match[1]) {
        entryPoint = match[1];
      } else {
        // Fallback: search for index.html or index.htm
        const entries = zip.getEntries();
        const index = entries.find(e => e.entryName.match(/^index\.html?$/i));
        if (index) entryPoint = index.entryName;
      }
    }

    // Clean up zip file
    fs.unlinkSync(req.file.path);

    const timestamp = nowIso();
    const { rows: pkgRows } = await query(
      `INSERT INTO scorm_packages (id, course_id, title, upload_path, extract_path, entry_point, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, course_id as "courseId", title, version, entry_point as "entryPoint", created_at as "createdAt"`,
      [id, courseId, title, req.file.path, extractPath, entryPoint, timestamp]
    );

    // Create Content Item for this SCORM package
    const contentId = crypto.randomUUID();
    const { rows: contentRows } = await query(
      `INSERT INTO content_items (id, type, title, source, course_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, type, title, source, course_id as "courseId", created_at as "createdAt", updated_at as "updatedAt"`,
      [contentId, 'scorm', title, id, courseId, timestamp, timestamp]
    );

    res.status(201).json({ package: pkgRows[0], content: contentRows[0] });
  } catch (err) {
    console.error("SCORM Upload Error:", err);
    res.status(500).json({ error: "scorm_processing_failed", message: "Failed to process SCORM package" });
  }
});

app.get("/scorm/:id/launch", requireAuth, async (req, res) => {
  const { id } = req.params;
  const { rows } = await query(`SELECT entry_point FROM scorm_packages WHERE id = $1`, [id]);
  if (!rows.length) {
    return res.status(404).json({ error: "not_found" });
  }
  const entryPoint = rows[0].entry_point || "index.html";
  // Return the URL for the frontend to handle (iframe or WebView)
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  const launchUrl = `${baseUrl}/uploads/scorm/${id}/${entryPoint}`;
  res.json({ url: launchUrl });
});

// -----------------------


app.delete("/courses/:id/members/:userId", requireAuth, async (req, res) => {
  const actor = (req as LMSAuthedRequest).user!;
  const { id: courseId, userId } = req.params;

  if (!(await checkCourseOwnership(courseId, actor))) {
    return res.status(403).json({ error: "forbidden" });
  }

  await query(`DELETE FROM course_enrollments WHERE course_id = $1 AND user_id = $2`, [courseId, userId]);
  res.json({ ok: true });
});

app.post("/content/list-files", requireAuth, async (req, res) => {
  const { path: relativePath } = req.body;
  if (!relativePath || typeof relativePath !== 'string') {
    return res.status(400).json({ error: "missing_path" });
  }

  // Security: Prevent traversal
  const safePath = path.normalize(relativePath).replace(/^(\.\.[\/\\])+/, '');
  // Remove leading /uploads/ or \uploads\ prefix (cross-platform)
  const strippedPath = safePath.replace(/^[\/\\]?uploads[\/\\]?/, '');
  const fullPath = path.join(UPLOADS_DIR, strippedPath);

  // Ensure we are still inside UPLOADS_DIR
  if (!fullPath.startsWith(UPLOADS_DIR)) {
    return res.status(403).json({ error: "forbidden_path" });
  }

  try {
    const stats = await fs.promises.stat(fullPath);
    let searchPath = fullPath;

    // If it's a file, list the parent directory
    if (stats.isFile()) {
      searchPath = path.dirname(fullPath);
    }

    const items = await fs.promises.readdir(searchPath, { withFileTypes: true });

    // Calculate relative base for client
    // UPLOADS_DIR = .../uploads
    // searchPath = .../uploads/folder
    // relativeBase = /uploads/folder
    const relativeBase = '/uploads/' + path.relative(UPLOADS_DIR, searchPath).replace(/\\/g, '/');

    const fileList = items.map(item => ({
      name: item.name,
      type: item.isDirectory() ? 'directory' : 'file',
      path: `${relativeBase}/${item.name}`
    }));

    // Sort: Directories first
    fileList.sort((a, b) => {
      if (a.type === b.type) return a.name.localeCompare(b.name);
      return a.type === 'directory' ? -1 : 1;
    });

    res.json({ files: fileList, currentPath: relativeBase });
  } catch (err: any) {
    console.error("List files error:", err);
    console.error("[DEBUG] UPLOADS_DIR:", UPLOADS_DIR);
    console.error("[DEBUG] Requested path:", relativePath);
    console.error("[DEBUG] Computed fullPath:", fullPath);
    res.status(404).json({
      error: "not_found",
      message: "Path not found",
      debug: {
        uploadsDir: UPLOADS_DIR,
        requestedPath: relativePath,
        computedFullPath: fullPath
      }
    });
  }
});

app.post("/content/upload", requireRole(writeRoles), requireMultipart, upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "no_file", message: "No file uploaded." });
  }

  let fileUrl = `/uploads/${req.file.filename}`;
  const ext = path.extname(req.file.originalname).toLowerCase();

  // Auto-extract ZIP/H5P for direct playback
  if (ext === '.zip' || ext === '.h5p') {
    const folderName = path.parse(req.file.filename).name;
    const extractPath = path.join(UPLOADS_DIR, folderName);

    try {
      // Force overwrite: Clean up existing folder to ensure fresh unzip
      if (fs.existsSync(extractPath)) {
        try {
          fs.rmSync(extractPath, { recursive: true, force: true });
        } catch (cleanupErr) {
          console.error("[Upload] Failed to clean up existing path:", cleanupErr);
        }
      }

      fs.mkdirSync(extractPath, { recursive: true });

      // Use extract-zip (more robust than adm-zip)
      await extractZip(req.file.path, { dir: extractPath });
      console.log(`[Upload] Extracted ${req.file.originalname} to ${extractPath}`);

      // Find entry point by scanning extracted files
      const findEntryPoint = (dir: string, basePath: string = ""): string => {
        const items = fs.readdirSync(dir);
        const candidates = ["index.html", "index.htm", "story.html", "launch.html", "player.html"];

        // Check direct matches first
        for (const candidate of candidates) {
          if (items.includes(candidate)) {
            return basePath ? `${basePath}/${candidate}` : candidate;
          }
        }

        // Check subdirectories
        for (const item of items) {
          const itemPath = path.join(dir, item);
          if (fs.statSync(itemPath).isDirectory()) {
            const found = findEntryPoint(itemPath, basePath ? `${basePath}/${item}` : item);
            if (found) return found;
          }
        }

        // Return first HTML file found
        for (const item of items) {
          if (item.toLowerCase().endsWith('.html')) {
            return basePath ? `${basePath}/${item}` : item;
          }
        }

        return "";
      };

      const entryPoint = findEntryPoint(extractPath);

      if (entryPoint) {
        fileUrl = `/uploads/${folderName}/${entryPoint}`;
        console.log(`[Upload] Auto-extracted ${req.file.originalname} -> ${fileUrl}`);
      } else {
        // No entry point found, but still point to extracted folder for file browsing
        fileUrl = `/uploads/${folderName}/`;
        console.log(`[Upload] Extracted ${req.file.originalname} to folder (no entry point): ${fileUrl}`);
      }
    } catch (e) {
      console.error("[Upload] Auto-unzip failed:", e);
      // Fallback to original file if extraction fails
      fileUrl = `/uploads/${req.file.filename}`;
    }
  }

  res.json({ url: fileUrl, filename: req.file.filename });
});

app.get("/content/:id", requireAuth, async (req: LMSAuthedRequest, res: express.Response) => {
  const user = req.user!;

  // Access Control Check
  if (user.role === 'Student') {
    const access = await AccessControlService.checkContentAccess(user, req.params.id);
    if (!access.allowed) {
      return res.status(403).json({ error: "access_denied", reason: access.reason });
    }
  }

  const { rows } = await query<ContentItem>(
    `SELECT id, type, title, source, created_at as "createdAt", updated_at as "updatedAt"
     FROM content_items WHERE id = $1`,
    [req.params.id]
  );

  const item = rows[0];
  if (!item) {
    return res.status(404).json({ error: "not_found" });
  }
  res.json({ content: item });
});

app.patch("/content/:id", requireRole(writeRoles), async (req, res) => {
  const parsed = contentPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    return badRequest(res, parsed.error.flatten());
  }

  const { rows: existingRows } = await query<ContentItem>(
    `SELECT id, type, title, source, created_at as "createdAt", updated_at as "updatedAt"
     FROM content_items WHERE id = $1`,
    [req.params.id]
  );
  const existing = existingRows[0];
  if (!existing) {
    return res.status(404).json({ error: "not_found" });
  }

  const nextType = parsed.data.type ?? existing.type;
  const nextTitle = parsed.data.title ?? existing.title;
  const nextSource = parsed.data.source === undefined ? existing.source : parsed.data.source;
  const updatedAt = nowIso();

  const actor = (req as LMSAuthedRequest).user!;
  if (!(await checkContentOwnership(req.params.id, actor))) {
    return res.status(403).json({ error: "forbidden", message: "You don't own this content." });
  }

  const { rows } = await query<ContentItem>(
    `UPDATE content_items
     SET type = $1, title = $2, source = $3, updated_at = $4
     WHERE id = $5
     RETURNING id, type, title, source, created_at as "createdAt", updated_at as "updatedAt"`,
    [nextType, nextTitle, nextSource ?? null, updatedAt, req.params.id]
  );
  void writeAudit({
    actorId: actor?.id,
    action: "content_update",
    entityType: "content",
    entityId: rows[0]?.id,
    meta: { type: rows[0]?.type }
  });
  res.json({ content: rows[0] });
});

app.delete("/content/:id", requireRole(writeRoles), async (req, res) => {
  const actor = (req as LMSAuthedRequest).user!;
  if (!(await checkContentOwnership(req.params.id, actor))) {
    return res.status(403).json({ error: "forbidden", message: "You don't own this content." });
  }

  const result = await query(`DELETE FROM content_items WHERE id = $1`, [req.params.id]);
  if (!result.rowCount) {
    return res.status(404).json({ error: "not_found" });
  }
  void writeAudit({
    actorId: actor?.id,
    action: "content_delete",
    entityType: "content",
    entityId: req.params.id
  });
  res.json({ ok: true });
});

app.get("/exams", requireAuth, async (req, res) => {
  const { limit, offset } = parsePagination(req);
  const actor = (req as LMSAuthedRequest).user!;
  const courseId = req.query.courseId as string | undefined;

  let queryText = `SELECT e.id, e.title, e.course_id as "courseId", e.duration_minutes as "durationMinutes", e.pass_threshold as "passThreshold",
       e.start_date as "startDate", e.end_date as "endDate", e.max_attempts as "maxAttempts", e.is_draft as "isDraft",
       e.results_visible_at as "resultsVisibleAt", e.created_at as "createdAt", e.updated_at as "updatedAt"
     FROM exams e`;
  const params: any[] = [limit, offset];

  if (actor.role === 'Instructor') {
    queryText += ` JOIN courses c ON e.course_id = c.id WHERE c.instructor_id = $3`;
    params.push(actor.id);
  } else if (actor.role === 'Student') {
    queryText += ` WHERE e.is_draft = false AND e.course_id IN (SELECT course_id FROM course_enrollments WHERE user_id = $3)`;
    params.push(actor.id);
  } else if (actor.role === 'Guest') {
    queryText += ` WHERE e.is_draft = false`;
  }
  // Assistants and Admins see all

  if (courseId) {
    const placeholder = `$${params.length + 1}`;
    queryText += queryText.includes(" WHERE ") ? ` AND e.course_id = ${placeholder}` : ` WHERE e.course_id = ${placeholder}`;
    params.push(courseId);
  }

  queryText += ` ORDER BY e.created_at DESC LIMIT $1 OFFSET $2`;

  const { rows } = await query<Exam>(queryText, params);
  res.json({ exams: rows });
});

app.post("/exams", requireRole(writeRoles), async (req, res) => {
  const parsed = examSchema.safeParse(req.body);
  if (!parsed.success) {
    return badRequest(res, parsed.error.flatten());
  }

  const id = newId();
  const timestamp = nowIso();
  const actor = (req as LMSAuthedRequest).user!;

  if (parsed.data.courseId && !(await checkCourseOwnership(parsed.data.courseId, actor))) {
    return res.status(403).json({ error: "forbidden", message: "You don't own this course." });
  }

  const { rows } = await query<Exam>(
    `INSERT INTO exams (id, title, course_id, duration_minutes, pass_threshold, start_date, end_date, max_attempts, is_draft, results_visible_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING id, title, course_id as "courseId", duration_minutes as "durationMinutes", pass_threshold as "passThreshold",
       start_date as "startDate", end_date as "endDate", max_attempts as "maxAttempts", is_draft as "isDraft",
       results_visible_at as "resultsVisibleAt", created_at as "createdAt", updated_at as "updatedAt"`,
    [
      id,
      parsed.data.title,
      parsed.data.courseId ?? null,
      parsed.data.durationMinutes ?? null,
      parsed.data.passThreshold ?? null,
      parsed.data.startDate ?? null,
      parsed.data.endDate ?? null,
      parsed.data.maxAttempts ?? 1,
      parsed.data.isDraft ?? true,
      parsed.data.resultsVisibleAt ?? null,
      timestamp,
      timestamp
    ]
  );
  void writeAudit({
    actorId: actor?.id,
    action: "exam_create",
    entityType: "exam",
    entityId: rows[0]?.id
  });
  res.status(201).json({ exam: rows[0] });
});

app.patch("/exams/:id", requireRole(writeRoles), async (req, res) => {
  const parsed = examPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    return badRequest(res, parsed.error.flatten());
  }

  const { rows: existingRows } = await query<Exam>(
    `SELECT id, title, course_id as "courseId", duration_minutes as "durationMinutes", pass_threshold as "passThreshold",
      start_date as "startDate", end_date as "endDate", max_attempts as "maxAttempts", is_draft as "isDraft",
      results_visible_at as "resultsVisibleAt", created_at as "createdAt", updated_at as "updatedAt"
     FROM exams WHERE id = $1`,
    [req.params.id]
  );
  const existing = existingRows[0];
  if (!existing) {
    return res.status(404).json({ error: "not_found" });
  }

  const nextTitle = parsed.data.title ?? existing.title;
  const nextCourseId = parsed.data.courseId ?? existing.courseId;
  const nextDuration = parsed.data.durationMinutes ?? existing.durationMinutes;
  const nextPass = parsed.data.passThreshold ?? existing.passThreshold;
  const nextStart = parsed.data.startDate ?? existing.startDate;
  const nextEnd = parsed.data.endDate ?? existing.endDate;
  const nextMaxAttempts = parsed.data.maxAttempts ?? existing.maxAttempts;
  const nextIsDraft = parsed.data.isDraft ?? existing.isDraft;
  const nextResultsVisible = parsed.data.resultsVisibleAt ?? existing.resultsVisibleAt;
  const updatedAt = nowIso();

  const actor = (req as LMSAuthedRequest).user!;
  if (!(await checkExamOwnership(req.params.id, actor))) {
    return res.status(403).json({ error: "forbidden", message: "You don't own this exam." });
  }

  const { rows } = await query<Exam>(
    `UPDATE exams
     SET title = $1, course_id = $2, duration_minutes = $3, pass_threshold = $4,
         start_date = $5, end_date = $6, max_attempts = $7, is_draft = $8, results_visible_at = $9, updated_at = $10
     WHERE id = $11
     RETURNING id, title, course_id as "courseId", duration_minutes as "durationMinutes", pass_threshold as "passThreshold",
       start_date as "startDate", end_date as "endDate", max_attempts as "maxAttempts", is_draft as "isDraft",
       results_visible_at as "resultsVisibleAt", created_at as "createdAt", updated_at as "updatedAt"`,
    [nextTitle, nextCourseId ?? null, nextDuration ?? null, nextPass ?? null, nextStart ?? null, nextEnd ?? null,
      nextMaxAttempts ?? 1, nextIsDraft ?? true, nextResultsVisible ?? null, updatedAt, req.params.id]
  );

  void writeAudit({
    actorId: actor?.id,
    action: "exam_update",
    entityType: "exam",
    entityId: rows[0]?.id
  });
  res.json({ exam: rows[0] });
});

app.get("/exams/:id", requireAuth, async (req, res) => {
  const { rows } = await query<Exam>(
    `SELECT id, title, course_id as "courseId", duration_minutes as "durationMinutes", pass_threshold as "passThreshold",
       start_date as "startDate", end_date as "endDate", max_attempts as "maxAttempts", is_draft as "isDraft",
       results_visible_at as "resultsVisibleAt", created_at as "createdAt", updated_at as "updatedAt"
     FROM exams WHERE id = $1`,
    [req.params.id]
  );
  const exam = rows[0];
  if (!exam) {
    return res.status(404).json({ error: "not_found" });
  }
  res.json({ exam });
});

app.post("/exams/:id/submit", requireAuth, async (req, res) => {
  const { id } = req.params;
  const parsed = examSubmissionSchema.safeParse(req.body);
  if (!parsed.success) {
    return badRequest(res, parsed.error.flatten());
  }
  const { answers } = parsed.data;

  const { rows: exams } = await query<Exam>(`SELECT * FROM exams WHERE id = $1`, [id]);
  const exam = exams[0];
  if (!exam) return res.status(404).json({ error: "not_found" });

  const actor = (req as LMSAuthedRequest).user!;
  if (actor.role === "Student") {
    const requestHash = req.headers["x-safeexambrowser-requesthash"];
    if (!SEBService.isSEBRequest(req) || !requestHash) {
      return res.status(403).json({
        error: "seb_required",
        message: "Bu sınava yalnızca Safe Exam Browser üzerinden girilebilir.",
        sebRequired: true,
        configUrl: `/api/exams/${id}/seb-config`,
        downloadUrl: "https://safeexambrowser.org/download_en.html"
      });
    }
  }

  const { rows: submissions } = await query(
    `SELECT count(*) as count FROM exam_submissions WHERE exam_id = $1 AND user_id = $2`,
    [id, actor.id]
  );
  const existingAttempts = parseInt(submissions[0].count);
  if (exam.maxAttempts && existingAttempts >= exam.maxAttempts) {
    return res.status(400).json({ error: "max_attempts_reached" });
  }

  // Auto-grade - only for auto-gradable question types
  const { rows: questions } = await query<Question>(`SELECT * FROM questions WHERE exam_id = $1`, [id]);

  // Define which question types can be auto-graded
  const autoGradableTypes = ['multiple_choice', 'multiple_select', 'true_false', 'fill_blank', 'calculation', 'ordering', 'matching'];
  const manualGradingTypes = ['short_answer', 'long_answer', 'file_upload', 'code', 'hotspot'];

  let autoGradedScore = 0;
  let autoGradedTotalPoints = 0;
  let manualGradingPoints = 0;
  const gradingDetails: Record<string, { autoGraded: boolean; score: number; maxPoints: number; correct?: boolean }> = {};

  const questionCount = questions.length;
  // Dynamic equal weighting: Total 100 points distributed equally among questions
  const pointsPerQuestion = questionCount > 0 ? (100 / questionCount) : 0;

  for (const q of questions) {
    const qPoints = pointsPerQuestion;
    const userAnswer = answers[q.id];

    if (autoGradableTypes.includes(q.type)) {
      // Auto-grade this question
      autoGradedTotalPoints += qPoints;
      let correct = false;

      if (q.type === 'multiple_choice' || q.type === 'true_false') {
        if (userAnswer === q.answer) correct = true;
      } else if (q.type === 'fill_blank') {
        if (String(userAnswer || '').trim().toLowerCase() === String(q.answer || '').trim().toLowerCase()) correct = true;
      } else if (q.type === 'calculation') {
        // Numeric comparison with tolerance
        const userNum = parseFloat(String(userAnswer));
        const correctNum = parseFloat(String(q.answer));
        if (!isNaN(userNum) && !isNaN(correctNum) && Math.abs(userNum - correctNum) < 0.001) correct = true;
      } else if (q.type === 'ordering' || q.type === 'matching') {
        // JSON comparison
        if (JSON.stringify(userAnswer) === JSON.stringify(q.answer)) correct = true;
      } else if (q.type === 'multiple_select') {
        // Array comparison (order-insensitive)
        const userArr = Array.isArray(userAnswer) ? [...userAnswer].sort() : [];
        const correctArr = Array.isArray(q.answer) ? [...(q.answer as string[])].sort() : [];
        if (JSON.stringify(userArr) === JSON.stringify(correctArr)) correct = true;
      }

      if (correct) {
        autoGradedScore += qPoints;
      }

      gradingDetails[q.id] = { autoGraded: true, score: correct ? qPoints : 0, maxPoints: qPoints, correct };
    } else {
      // Manual grading required
      manualGradingPoints += qPoints; // Track points that need manual grading

      gradingDetails[q.id] = { autoGraded: false, score: 0, maxPoints: qPoints };
    }
  }

  // Final Score Calculation
  // autoGradedScore has the points from auto-graded questions
  // manualGradingPoints tracks potential points from manual questions (currently 0 in score)
  const percentageScore = parseFloat(autoGradedScore.toFixed(2)); // It is already out of 100 based on the logic above
  const needsManualGrading = manualGradingPoints > 0;

  const submissionId = crypto.randomUUID();
  await query(
    `INSERT INTO exam_submissions (id, exam_id, user_id, score, answers, attempt_number, started_at, submitted_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [submissionId, id, actor.id, autoGradedScore, JSON.stringify(answers), existingAttempts + 1, nowIso(), nowIso(), nowIso(), nowIso()]
  );

  // Calculate if passed (based on percentage, passThreshold is assumed to be percentage)
  const passed = exam.passThreshold ? percentageScore >= exam.passThreshold : true;

  res.json({
    passed,
    score: percentageScore,  // Percentage out of 100
    total: 100,  // Always out of 100
    autoGradedScore,
    autoGradedTotal: autoGradedTotalPoints,
    needsManualGrading,
    manualGradingPoints,
    submissionId,
    details: gradingDetails
  });
});

// ==================== EXAM SUBMISSIONS (For Instructors) ====================

/**
 * GET /exams/:id/submissions
 * List all submissions for an exam (instructor only)
 */
app.get("/exams/:id/submissions", requireRole(writeRoles), async (req, res) => {
  const { id } = req.params;
  const actor = (req as LMSAuthedRequest).user!;

  // Check if user owns this exam
  if (!(await checkExamOwnership(id, actor))) {
    return res.status(403).json({ error: "forbidden", message: "You don't own this exam." });
  }

  const { rows: submissions } = await query(
    `SELECT es.id, es.user_id as "userId", es.score, es.answers, es.attempt_number as "attemptNumber", 
            es.submitted_at as "submittedAt", es.created_at as "createdAt",
            u.email as "userEmail", u.full_name as "userName"
     FROM exam_submissions es
     JOIN users u ON u.id = es.user_id
     WHERE es.exam_id = $1
     ORDER BY es.submitted_at DESC`,
    [id]
  );

  // Get questions for this exam to determine grading status
  const { rows: questions } = await query<Question>(`SELECT * FROM questions WHERE exam_id = $1`, [id]);
  const manualGradingTypes = ['short_answer', 'long_answer', 'file_upload', 'code', 'hotspot'];
  const hasManualGradingQuestions = questions.some(q => manualGradingTypes.includes(q.type));

  const enrichedSubmissions = submissions.map(sub => {
    const answers = typeof sub.answers === 'string' ? JSON.parse(sub.answers) : sub.answers;
    let totalPoints = 0;
    let maxPoints = 0;

    const percentage = sub.score;
    maxPoints = 100;

    return {
      ...sub,
      answers,
      percentage,
      maxPoints,
      needsManualGrading: hasManualGradingQuestions
    };
  });

  res.json({ submissions: enrichedSubmissions, hasManualGradingQuestions });
});

/**
 * GET /exams/:id/submissions/:submissionId
 * Get detailed submission with questions and answers (instructor only)
 */
app.get("/exams/:id/submissions/:submissionId", requireRole(writeRoles), async (req, res) => {
  const { id, submissionId } = req.params;
  const actor = (req as LMSAuthedRequest).user!;

  if (!(await checkExamOwnership(id, actor))) {
    return res.status(403).json({ error: "forbidden", message: "You don't own this exam." });
  }

  const { rows: submissions } = await query(
    `SELECT es.*, u.email as "userEmail", u.full_name as "userName"
     FROM exam_submissions es
     JOIN users u ON u.id = es.user_id
     WHERE es.id = $1 AND es.exam_id = $2`,
    [submissionId, id]
  );

  if (!submissions.length) {
    return res.status(404).json({ error: "not_found" });
  }

  const submission = submissions[0];
  const answers = typeof submission.answers === 'string' ? JSON.parse(submission.answers) : submission.answers;

  // Get questions
  const { rows: questions } = await query<Question>(`SELECT * FROM questions WHERE exam_id = $1 ORDER BY "order"`, [id]);

  // Get manual grades if any
  const { rows: manualGrades } = await query(
    `SELECT question_id as "questionId", points, feedback, graded_by as "gradedBy", graded_at as "gradedAt"
     FROM manual_grades
     WHERE submission_id = $1`,
    [submissionId]
  );

  const gradesMap: Record<string, any> = {};
  for (const g of manualGrades) {
    gradesMap[g.questionId] = g;
  }

  const autoGradableTypes = ['multiple_choice', 'multiple_select', 'true_false', 'fill_blank', 'calculation', 'ordering', 'matching'];

  const questionsWithAnswers = questions.map(q => {
    const questionCount = questions.length;
    const pointsPerQuestion = questionCount > 0 ? (100 / questionCount) : 0;

    const userAnswer = answers[q.id];
    const isAutoGradable = autoGradableTypes.includes(q.type);
    const manualGrade = gradesMap[q.id];

    let autoGradeResult = null;
    if (isAutoGradable) {
      let correct = false;
      if (q.type === 'multiple_choice' || q.type === 'true_false') {
        correct = userAnswer === q.answer;
      } else if (q.type === 'fill_blank') {
        correct = String(userAnswer || '').trim().toLowerCase() === String(q.answer || '').trim().toLowerCase();
      } else {
        correct = JSON.stringify(userAnswer) === JSON.stringify(q.answer);
      }
      autoGradeResult = { correct, points: correct ? pointsPerQuestion : 0 };
    }

    return {
      id: q.id,
      prompt: q.prompt,
      type: q.type,
      options: q.options,
      points: pointsPerQuestion,
      correctAnswer: q.answer,
      userAnswer,
      isAutoGradable,
      autoGradeResult,
      manualGrade
    };
  });

  res.json({
    submission: {
      id: submission.id,
      examId: id,
      userId: submission.user_id,
      userEmail: submission.userEmail,
      userName: submission.userName,
      score: submission.score,
      submittedAt: submission.submitted_at,
      attemptNumber: submission.attempt_number
    },
    questions: questionsWithAnswers
  });
});

/**
 * POST /exams/:id/submissions/:submissionId/grade
 * Manually grade a question (instructor only)
 */
app.post("/exams/:id/submissions/:submissionId/grade", requireRole(writeRoles), async (req, res) => {
  const { id, submissionId } = req.params;
  const { questionId, points, feedback } = req.body;
  const actor = (req as LMSAuthedRequest).user!;

  if (!(await checkExamOwnership(id, actor))) {
    return res.status(403).json({ error: "forbidden", message: "You don't own this exam." });
  }

  if (!questionId || points === undefined) {
    return res.status(400).json({ error: "bad_request", message: "questionId and points are required" });
  }

  // Verify submission exists
  const { rows: submissions } = await query(
    `SELECT * FROM exam_submissions WHERE id = $1 AND exam_id = $2`,
    [submissionId, id]
  );
  if (!submissions.length) {
    return res.status(404).json({ error: "not_found" });
  }

  // Verify question exists and get max points
  const { rows: questions } = await query<Question>(`SELECT * FROM questions WHERE id = $1 AND exam_id = $2`, [questionId, id]);
  if (!questions.length) {
    return res.status(404).json({ error: "question_not_found" });
  }
  // Calculate dynamic points per question
  const { rows: allQuestions } = await query<Question>(`SELECT * FROM questions WHERE exam_id = $1`, [id]);
  const questionCount = allQuestions.length;
  const pointsPerQuestion = questionCount > 0 ? (100 / questionCount) : 0;

  // Verify question exists within exam context (already fetched above via allQuestions logic, but we need specific question check from initial query)
  // We can just use allQuestions.find
  const question = allQuestions.find(q => q.id === questionId);
  if (!question) {
    return res.status(404).json({ error: "question_not_found" });
  }

  const maxPoints = pointsPerQuestion;

  if (points < 0 || points > maxPoints) {
    return res.status(400).json({ error: "invalid_points", message: `Points must be between 0 and ${maxPoints}` });
  }

  // Upsert manual grade
  await query(
    `INSERT INTO manual_grades (id, submission_id, question_id, points, feedback, graded_by, graded_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (submission_id, question_id) 
     DO UPDATE SET points = $4, feedback = $5, graded_by = $6, graded_at = $7, updated_at = $9`,
    [crypto.randomUUID(), submissionId, questionId, points, feedback || null, actor.id, nowIso(), nowIso(), nowIso()]
  );

  // Recalculate total score for submission
  const { rows: allManualGrades } = await query(
    `SELECT question_id, points FROM manual_grades WHERE submission_id = $1`,
    [submissionId]
  );

  const submission = submissions[0];
  const answers = typeof submission.answers === 'string' ? JSON.parse(submission.answers) : submission.answers;
  const autoGradableTypes = ['multiple_choice', 'multiple_select', 'true_false', 'fill_blank', 'calculation', 'ordering', 'matching'];

  let totalScore = 0;
  const manualGradesMap: Record<string, number> = {};
  for (const mg of allManualGrades) {
    manualGradesMap[mg.question_id] = mg.points;
  }

  for (const q of allQuestions) {
    const qPoints = pointsPerQuestion;
    if (autoGradableTypes.includes(q.type)) {
      // Auto-grade
      const userAnswer = answers[q.id];
      let correct = false;
      if (q.type === 'multiple_choice' || q.type === 'true_false') {
        correct = userAnswer === q.answer;
      } else if (q.type === 'fill_blank') {
        correct = String(userAnswer || '').trim().toLowerCase() === String(q.answer || '').trim().toLowerCase();
      } else {
        correct = JSON.stringify(userAnswer) === JSON.stringify(q.answer);
      }
      if (correct) totalScore += qPoints;
    } else {
      // Check for manual grade
      if (manualGradesMap[q.id] !== undefined) {
        totalScore += manualGradesMap[q.id];
      }
    }
  }

  // Update submission score
  await query(`UPDATE exam_submissions SET score = $1, updated_at = $2 WHERE id = $3`, [totalScore, nowIso(), submissionId]);

  res.json({
    success: true,
    newScore: totalScore,
    questionId,
    points,
    feedback
  });
});

app.delete("/exams/:id", requireRole(writeRoles), async (req, res) => {
  const actor = (req as LMSAuthedRequest).user!;
  if (!(await checkExamOwnership(req.params.id, actor))) {
    return res.status(403).json({ error: "forbidden", message: "You don't own this exam." });
  }

  const result = await query(`DELETE FROM exams WHERE id = $1`, [req.params.id]);
  if (!result.rowCount) {
    return res.status(404).json({ error: "not_found" });
  }
  void writeAudit({
    actorId: actor?.id,
    action: "exam_delete",
    entityType: "exam",
    entityId: req.params.id
  });
  res.json({ ok: true });
});

app.get("/questions", requireAuth, async (req, res) => {
  const { limit, offset } = parsePagination(req);
  const examId = typeof req.query.examId === 'string' ? req.query.examId : undefined;
  const actor = (req as LMSAuthedRequest).user!;

  if (examId && actor.role === "Student") {
    const requestHash = req.headers["x-safeexambrowser-requesthash"];
    if (!SEBService.isSEBRequest(req) || !requestHash) {
      return res.status(403).json({
        error: "seb_required",
        message: "Bu sınava yalnızca Safe Exam Browser üzerinden girilebilir.",
        sebRequired: true,
        configUrl: `/api/exams/${examId}/seb-config`,
        downloadUrl: "https://safeexambrowser.org/download_en.html"
      });
    }
  }

  let queryText = `SELECT id, exam_id as "examId", prompt, type, options, answer, meta,
      created_at as "createdAt"
     FROM questions`;
  const params: any[] = [];

  if (examId) {
    queryText += ` WHERE exam_id = $1`;
    params.push(examId);

    // Add pagination
    queryText += ` ORDER BY created_at DESC LIMIT $2 OFFSET $3`;
    params.push(limit, offset);
  } else {
    // No filter
    queryText += ` ORDER BY created_at DESC LIMIT $1 OFFSET $2`;
    params.push(limit, offset);
  }

  const { rows } = await query<Question>(queryText, params);
  res.json({ questions: rows });
});

app.get("/questions/:id", requireAuth, async (req, res) => {
  const actor = (req as LMSAuthedRequest).user!;
  const { rows } = await query<Question>(
    `SELECT id, exam_id as "examId", prompt, type, options, answer, meta, points, created_at as "createdAt"
       FROM questions WHERE id = $1`,
    [req.params.id]
  );
  const question = rows[0];
  if (!question) {
    return res.status(404).json({ error: "not_found" });
  }

  if (question.examId && actor.role === "Student") {
    const requestHash = req.headers["x-safeexambrowser-requesthash"];
    if (!SEBService.isSEBRequest(req) || !requestHash) {
      return res.status(403).json({
        error: "seb_required",
        message: "Bu sınava yalnızca Safe Exam Browser üzerinden girilebilir.",
        sebRequired: true,
        configUrl: `/api/exams/${question.examId}/seb-config`,
        downloadUrl: "https://safeexambrowser.org/download_en.html"
      });
    }
  }

  // Instructor/Assistant should only see questions for exams they own.
  if (question.examId && (actor.role === "Instructor" || actor.role === "Assistant")) {
    const ok = await checkExamOwnership(question.examId, actor);
    if (!ok) {
      return res.status(403).json({ error: "forbidden" });
    }
  }

  res.json({ question });
});

app.post("/questions", requireRole(writeRoles), async (req, res) => {
  const parsed = questionSchema.safeParse(req.body);
  if (!parsed.success) {
    return badRequest(res, parsed.error.flatten());
  }

  const isTrueFalse = parsed.data.type === "true_false";
  const normalizedOptions = isTrueFalse ? [...trueFalseOptions] : parsed.data.options;
  const normalizedAnswer = isTrueFalse
    ? normalizeTrueFalseAnswer(parsed.data.answer)
    : parsed.data.answer;
  const id = newId();
  const createdAt = nowIso();
  const actor = (req as LMSAuthedRequest).user!;

  if (parsed.data.examId && !(await checkExamOwnership(parsed.data.examId, actor))) {
    return res.status(403).json({ error: "forbidden", message: "You don't own this exam." });
  }

  const { rows } = await query<Question>(
    `INSERT INTO questions (id, exam_id, prompt, type, options, answer, meta, points, created_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8, $9)
     RETURNING id, exam_id as "examId", prompt, type, options, answer, meta, points,
      created_at as "createdAt"`,
    [
      id,
      parsed.data.examId ?? null,
      parsed.data.prompt,
      parsed.data.type,
      toJson(normalizedOptions),
      toJson(normalizedAnswer),
      toJson(parsed.data.meta),
      parsed.data.points ?? 10,
      createdAt
    ]
  );
  void writeAudit({
    actorId: actor?.id,
    action: "question_create",
    entityType: "question",
    entityId: rows[0]?.id,
    meta: { type: rows[0]?.type }
  });
  res.status(201).json({ question: rows[0] });
});

app.patch("/questions/:id", requireRole(writeRoles), async (req, res) => {
  const parsed = questionPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    return badRequest(res, parsed.error.flatten());
  }

  const { rows: existingRows } = await query<Question>(
    `SELECT id, exam_id as "examId", prompt, type, options, answer, meta,
      created_at as "createdAt"
     FROM questions WHERE id = $1`,
    [req.params.id]
  );
  const existing = existingRows[0];
  if (!existing) {
    return res.status(404).json({ error: "not_found" });
  }

  const existingExamId = existing.examId ?? undefined;
  const existingOptions = existing.options ?? undefined;
  const existingAnswer = existing.answer ?? undefined;
  const existingMeta = existing.meta ?? undefined;

  const nextType = parsed.data.type ?? existing.type;
  const normalizedOptions =
    nextType === "true_false"
      ? [...trueFalseOptions]
      : parsed.data.options ?? existingOptions;
  const normalizedAnswer =
    nextType === "true_false"
      ? normalizeTrueFalseAnswer(parsed.data.answer ?? existingAnswer)
      : parsed.data.answer ?? existingAnswer;
  const candidate = {
    prompt: parsed.data.prompt ?? existing.prompt,
    type: nextType,
    examId: parsed.data.examId ?? existingExamId,
    options: normalizedOptions,
    answer: normalizedAnswer,
    meta: parsed.data.meta ?? existingMeta,
    points: parsed.data.points ?? existing.points
  };

  const actor = (req as LMSAuthedRequest).user!;
  if (candidate.examId && !(await checkExamOwnership(candidate.examId, actor))) {
    return res.status(403).json({ error: "forbidden", message: "You don't own this exam." });
  }

  const { rows } = await query<Question>(
    `UPDATE questions
     SET prompt = $1, type = $2, exam_id = $3, options = $4::jsonb,
         answer = $5::jsonb, meta = $6::jsonb, points = $7
     WHERE id = $8
     RETURNING id, exam_id as "examId", prompt, type, options, answer, meta, points,
      created_at as "createdAt"`,
    [
      candidate.prompt,
      candidate.type,
      candidate.examId ?? null,
      toJson(candidate.options),
      toJson(candidate.answer),
      toJson(candidate.meta),
      candidate.points ?? 10,
      req.params.id
    ]
  );
  void writeAudit({
    actorId: actor?.id,
    action: "question_update",
    entityType: "question",
    entityId: rows[0]?.id,
    meta: { type: rows[0]?.type }
  });

  res.json({ question: rows[0] });
});

app.delete("/questions/:id", requireRole(writeRoles), async (req, res) => {
  const { rows: questions } = await query("SELECT exam_id FROM questions WHERE id = $1", [req.params.id]);
  const question = questions[0];
  if (!question) return res.status(404).json({ error: "not_found" });

  const actor = (req as LMSAuthedRequest).user!;
  if (question.exam_id && !(await checkExamOwnership(question.exam_id, actor))) {
    return res.status(403).json({ error: "forbidden", message: "You don't own this exam." });
  }

  await query(`DELETE FROM questions WHERE id = $1`, [req.params.id]);
  void writeAudit({
    actorId: actor?.id,
    action: "question_delete",
    entityType: "question",
    entityId: req.params.id
  });
  res.json({ ok: true });
});



app.get("/integrations/status", requireRole(adminRoles), (_req, res) => {
  const mattermostConfigured = Boolean(
    process.env.MATTERMOST_WEBHOOK_URL ||
    (process.env.MATTERMOST_URL && process.env.MATTERMOST_TOKEN)
  );
  const microsoftMode = (process.env.MICROSOFT_MODE || "").toLowerCase();
  const microsoftConfigured = Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET);
  const smtpConfigured = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
  res.json({
    ok: true,
    services: {
      smtp: smtpConfigured ? "configured" : "mock",
      mattermost: mattermostConfigured ? "configured" : "missing",
      microsoft365: microsoftMode === "mock" ? "mock" : (microsoftConfigured ? "configured" : "missing"),
      scorm: "stub",
      xapi: "stub",
      lti: "stub",
      qti: "stub"
    }
  });
});

app.post("/integrations/smtp/test", requireRole(adminRoles), async (req, res) => {
  const parsed = smtpTestSchema.safeParse(req.body);
  if (!parsed.success) {
    return badRequest(res, parsed.error.flatten());
  }
  const actor = (req as LMSAuthedRequest).user;
  void writeAudit({
    actorId: actor?.id,
    action: "smtp_test",
    entityType: "integration",
    meta: { to: parsed.data.to }
  });
  const smtpConfigured = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
  if (!smtpConfigured) {
    return res.json({ ok: true, mode: "mock" });
  }
  const sent = await EmailService.sendMail(parsed.data.to, parsed.data.subject, parsed.data.message);
  if (!sent) {
    return res.status(400).json({ error: "smtp_error", message: "SMTP send failed." });
  }
  res.json({ ok: true, mode: "smtp" });
});

app.post("/integrations/mattermost/test", requireRole(adminRoles), async (req, res) => {
  const parsed = mattermostTestSchema.safeParse(req.body);
  if (!parsed.success) {
    return badRequest(res, parsed.error.flatten());
  }
  const actor = (req as LMSAuthedRequest).user;
  try {
    const { message, channelId, courseId } = parsed.data;
    let targetChannelId = channelId ?? "webhook";
    if (courseId) {
      targetChannelId = await MattermostService.syncCourseChannel(courseId);
    }
    await MattermostService.sendMessage(targetChannelId, message);
    const config = MattermostService.getConfig();
    void writeAudit({
      actorId: actor?.id,
      action: "mattermost_test",
      entityType: "integration",
      meta: { channelId: targetChannelId, mode: config.webhookUrl ? "webhook" : "api" }
    });
    res.json({ ok: true, mode: config.webhookUrl ? "webhook" : "api", channelId: targetChannelId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "mattermost_error";
    res.status(400).json({ error: "mattermost_error", message });
  }
});

app.get("/integrations/microsoft/onedrive", requireRole(writeRoles), async (req, res) => {
  const actor = (req as LMSAuthedRequest).user;
  if (!actor?.id) {
    return res.status(401).json({ error: "unauthorized" });
  }
  const folderId = typeof req.query.folderId === "string" ? req.query.folderId : undefined;
  try {
    const items = await Microsoft365Service.listOneDriveFiles(actor.id, folderId);
    res.json({ ok: true, items });
  } catch (error) {
    const message = error instanceof Error ? error.message : "microsoft_onedrive_error";
    res.status(400).json({ error: "microsoft_onedrive_error", message });
  }
});

app.post("/integrations/microsoft/teams/meeting", requireRole(writeRoles), async (req, res) => {
  const actor = (req as LMSAuthedRequest).user;
  if (!actor?.id) {
    return res.status(401).json({ error: "unauthorized" });
  }
  const parsed = microsoftMeetingSchema.safeParse(req.body);
  if (!parsed.success) {
    return badRequest(res, parsed.error.flatten());
  }
  const start = new Date(parsed.data.startTime);
  const end = new Date(parsed.data.endTime);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
    return res.status(400).json({ error: "invalid_datetime" });
  }
  try {
    const meeting = await Microsoft365Service.createMeeting(
      actor.id,
      parsed.data.subject,
      start,
      end,
      parsed.data.attendees
    );
    res.json({ ok: true, meeting });
  } catch (error) {
    const message = error instanceof Error ? error.message : "microsoft_meeting_error";
    res.status(400).json({ error: "microsoft_meeting_error", message });
  }
});

app.post("/integrations/scorm/validate", requireRole(writeRoles), async (req, res) => {
  const parsed = scormValidateSchema.safeParse(req.body);
  if (!parsed.success) {
    return badRequest(res, parsed.error.flatten());
  }
  const actor = (req as LMSAuthedRequest).user;
  void writeAudit({
    actorId: actor?.id,
    action: "scorm_validate",
    entityType: "integration",
    meta: { source: parsed.data.packageUrl ? "url" : "manifest" }
  });
  res.json({ ok: true, warnings: [] });
});

app.post("/integrations/xapi/statement", requireRole(writeRoles), async (req, res) => {
  const parsed = xapiStatementSchema.safeParse(req.body);
  if (!parsed.success) {
    return badRequest(res, parsed.error.flatten());
  }
  const actor = (req as LMSAuthedRequest).user;
  void writeAudit({
    actorId: actor?.id,
    action: "xapi_statement",
    entityType: "integration"
  });
  res.json({ ok: true });
});

app.post("/integrations/lti/launch", requireRole(writeRoles), async (req, res) => {
  const parsed = ltiLaunchSchema.safeParse(req.body);
  if (!parsed.success) {
    return badRequest(res, parsed.error.flatten());
  }
  const actor = (req as LMSAuthedRequest).user;
  void writeAudit({
    actorId: actor?.id,
    action: "lti_launch",
    entityType: "integration"
  });
  res.json({ ok: true, mode: "stub" });
});

app.post("/integrations/qti/validate", requireRole(writeRoles), async (req, res) => {
  const parsed = qtiValidateSchema.safeParse(req.body);
  if (!parsed.success) {
    return badRequest(res, parsed.error.flatten());
  }
  const actor = (req as LMSAuthedRequest).user;
  void writeAudit({
    actorId: actor?.id,
    action: "qti_validate",
    entityType: "integration",
    meta: { source: parsed.data.packageUrl ? "url" : "manifest" }
  });
  res.json({ ok: true, warnings: [] });
});

// ===== PUSH NOTIFICATIONS =====
import { PushNotificationService } from "./services/push";
import { ContentModuleService } from "./services/contentModule";
import { QuestionBankService } from "./services/questionBank";
import { PlagiarismService } from "./services/plagiarism";

import { LiveClassService } from "./services/liveClass";
import { SyncService } from "./services/sync";
import { AccessControlService } from "./services/accessControl";

const pushTokenSchema = z.object({
  token: z.string().min(1),
  userId: z.string().optional()
});

const pushNotifySchema = z.object({
  tokens: z.array(z.string().min(1)).min(1),
  title: z.string().min(1),
  body: z.string().min(1),
  data: z.record(z.any()).optional()
});

const pushCourseSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  data: z.record(z.any()).optional()
});

// Register push token (called from mobile app)
app.post("/push/register", requireAuth, async (req, res) => {
  const user = (req as LMSAuthedRequest).user;
  const parsed = pushTokenSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "validation_error", details: parsed.error.flatten() });
  }

  const userId = parsed.data.userId || user?.id;
  if (!userId) {
    return res.status(400).json({ error: "user_id_required" });
  }

  // Store token in database (upsert)
  try {
    await query(
      `INSERT INTO push_tokens (id, user_id, token, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id) DO UPDATE SET token = $3, updated_at = $5`,
      [newId(), userId, parsed.data.token, nowIso(), nowIso()]
    );
    res.json({ success: true });
  } catch (err) {
    console.error("[push] Register failed:", err);
    res.status(500).json({ error: "registration_failed" });
  }
});

// Send push notification (admin only)
app.post("/push/send", requireRole(adminRoles), async (req, res) => {
  const user = (req as LMSAuthedRequest).user;
  const parsed = pushNotifySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "validation_error", details: parsed.error.flatten() });
  }

  const result = await PushNotificationService.notifyUsers(parsed.data.tokens, {
    title: parsed.data.title,
    body: parsed.data.body,
    data: parsed.data.data
  });

  await writeAudit({
    actorId: user?.id,
    action: "push_notification_sent",
    meta: { recipientCount: parsed.data.tokens.length, ...result }
  });

  res.json(result);
});

// Send push to all users enrolled in a course (Admin/Instructor)
app.post("/push/course/:id", requireRole(writeRoles), async (req, res) => {
  const actor = (req as LMSAuthedRequest).user!;
  const courseId = req.params.id;
  const parsed = pushCourseSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "validation_error", details: parsed.error.flatten() });
  }

  if (!(await checkCourseOwnership(courseId, actor))) {
    return res.status(403).json({ error: "forbidden" });
  }

  const { rows } = await query<{ token: string }>(
    `SELECT pt.token
     FROM push_tokens pt
     JOIN course_enrollments ce ON ce.user_id = pt.user_id
     WHERE ce.course_id = $1`,
    [courseId]
  );

  const tokens = rows.map((r) => r.token).filter(Boolean);
  if (!tokens.length) {
    return res.json({ success: 0, failed: 0, message: "No registered tokens" });
  }

  const result = await PushNotificationService.notifyUsers(tokens, {
    title: parsed.data.title,
    body: parsed.data.body,
    data: { ...(parsed.data.data ?? {}), courseId }
  });

  await writeAudit({
    actorId: actor.id,
    action: "push_course_sent",
    meta: { courseId, recipientCount: tokens.length, ...result }
  });

  res.json(result);
});

// Send announcement to all users
app.post("/push/announce", requireRole(adminRoles), async (req, res) => {
  const user = (req as LMSAuthedRequest).user;
  const { message } = req.body;
  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "message_required" });
  }

  // Get all push tokens
  const { rows } = await query<{ token: string }>("SELECT token FROM push_tokens");
  const tokens = rows.map((r) => r.token).filter(Boolean);

  if (!tokens.length) {
    return res.json({ success: 0, failed: 0, message: "No registered tokens" });
  }

  const result = await PushNotificationService.sendAnnouncementNotification(tokens, message);

  await writeAudit({
    actorId: user?.id,
    action: "announcement_sent",
    meta: { message, ...result }
  });

  res.json(result);
});

// ===== COURSE MODULES & PREREQUISITES =====
const moduleSchema = z.object({
  courseId: z.string().min(1),
  parentModuleId: z.string().optional(),
  title: z.string().min(1),
  description: z.string().optional(),
  sortOrder: z.number().optional()
});

app.post("/modules", requireRole(adminRoles), async (req, res) => {
  const parsed = moduleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error);
  const result = await ContentModuleService.createModule(parsed.data);
  res.json(result);
});

app.get("/courses/:id/modules", requireAuth, async (req, res) => {
  const result = await ContentModuleService.getModulesHierarchy(req.params.id);
  res.json(result);
});

app.post("/modules/reorder", requireRole(adminRoles), async (req, res) => {
  await ContentModuleService.reorderModules(req.body);
  res.json({ success: true });
});

app.post("/content/reorder", requireRole(adminRoles), async (req, res) => {
  await ContentModuleService.reorderContent(req.body);
  res.json({ success: true });
});

app.post("/prerequisites", requireRole(adminRoles), async (req, res) => {
  const { contentId, prerequisiteContentId } = req.body;
  const result = await ContentModuleService.addPrerequisite(contentId, prerequisiteContentId);
  res.json(result);
});

app.get("/content/:id/access", requireAuth, async (req, res) => {
  const user = (req as LMSAuthedRequest).user;
  const result = await ContentModuleService.checkPrerequisites(user!.id, req.params.id);
  res.json(result);
});

app.post("/content/:id/complete", requireAuth, async (req, res) => {
  const user = (req as LMSAuthedRequest).user;
  await ContentModuleService.markContentComplete(user!.id, req.params.id);
  res.json({ success: true });
});

// ===== COURSE CLONING =====
app.post("/courses/:id/clone", requireRole(adminRoles), async (req, res) => {
  const { title, instructorId } = req.body;
  if (!title) return res.status(400).json({ error: "title_required" });
  const newCourseId = await ContentModuleService.cloneCourse(req.params.id, title, instructorId);
  res.json({ newCourseId });
});

// ===== QUESTION BANK =====
app.post("/question-bank/tags", requireRole(adminRoles), async (req, res) => {
  const { name, color } = req.body;
  const result = await QuestionBankService.createTag(name, color);
  res.json(result);
});

import bbbRoutes from './routes/bbb';



// ===== BIGBLUEBUTTON =====
app.use('/api/bbb', bbbRoutes);

app.get("/question-bank/tags", requireAuth, async (req, res) => {
  const result = await QuestionBankService.getAllTags();
  res.json(result);
});

app.post("/question-bank/questions/:id/tag", requireRole(adminRoles), async (req, res) => {
  await QuestionBankService.tagQuestion(req.params.id, req.body.tagId);
  res.json({ success: true });
});

app.post("/exams/generate-from-pool", requireRole(adminRoles), async (req, res) => {
  const result = await QuestionBankService.createExamFromPool(req.body);
  res.json(result);
});

// ===== PLAGIARISM DETECTION =====
app.post("/plagiarism/check", requireRole(adminRoles), async (req, res) => {
  const { text, comparisonTexts } = req.body;
  const result = PlagiarismService.checkGeneric(text, comparisonTexts);
  res.json(result);
});

app.post("/plagiarism/compare-submissions", requireRole(adminRoles), async (req, res) => {
  const result = await PlagiarismService.compareSubmissions(req.body.submissions);
  res.json(result);
});

// Mount comprehensive plagiarism router (has compare, check-content endpoints)
app.use('/api/plagiarism', plagiarismRouter);

// ===== PROGRESS TRACKING =====
app.use('/api/progress', progressRouter);

// ===== 2FA (TOTP) =====
app.post("/auth/2fa/setup", requireAuth, async (req, res) => {
  const user = (req as LMSAuthedRequest).user;
  const secret = TwoFactorService.generateSecret();
  const uri = TwoFactorService.generateProvisioningUri({
    secret,
    accountName: user!.username,
    issuer: "LMS Platform"
  });

  // Store secret temporarily/awaiting verification
  await query("INSERT INTO user_2fa (id, user_id, secret, enabled) VALUES ($1, $2, $3, $4) ON CONFLICT (user_id) DO UPDATE SET secret = $3, enabled = $4",
    [newId(), user!.id, secret.base32, false]);

  res.json({ secret: secret.base32, uri });
});

app.post("/auth/2fa/enable", requireAuth, async (req, res) => {
  const user = (req as LMSAuthedRequest).user;
  const { code } = req.body;

  const { rows } = await query("SELECT secret FROM user_2fa WHERE user_id = $1", [user!.id]);
  if (!rows[0]) return res.status(400).json({ error: "2fa_not_setup" });

  const verify = TwoFactorService.verifyCode(rows[0].secret, code);
  if (!verify.valid) return res.status(400).json({ error: "invalid_code" });

  const backupCodes = TwoFactorService.generateBackupCodes();
  await query("UPDATE user_2fa SET enabled = true, backup_codes = $1 WHERE user_id = $2", [backupCodes, user!.id]);

  res.json({ success: true, backupCodes });
});

app.post("/auth/2fa/verify", async (req, res) => {
  const { tempToken, code } = req.body;

  // Verify temp token
  let decoded: any;
  try {
    decoded = jwt.verify(tempToken, JWT_SECRET) as any;
    if (decoded.purpose !== '2fa_verify') {
      return res.status(400).json({ error: "invalid_token" });
    }
  } catch (e) {
    return res.status(400).json({ error: "invalid_or_expired_token" });
  }

  const userId = decoded.userId;
  const { rows } = await query("SELECT secret, enabled, backup_codes FROM user_2fa WHERE user_id = $1", [userId]);

  if (!rows[0]?.enabled) return res.status(400).json({ error: "2fa_not_enabled" });

  const verify = TwoFactorService.verifyCode(rows[0].secret, code);
  let isValid = verify.valid;

  // Try backup code if TOTP fails
  if (!isValid && code) {
    const backup = TwoFactorService.verifyBackupCode(code, rows[0].backup_codes || []);
    if (backup.valid) {
      await query("UPDATE user_2fa SET backup_codes = $1 WHERE user_id = $2", [backup.remainingCodes, userId]);
      isValid = true;
    }
  }

  if (!isValid) {
    return res.status(400).json({ error: "invalid_code" });
  }

  // 2FA verified - issue tokens
  const { rows: userRows } = await query("SELECT * FROM users WHERE id = $1", [userId]);
  if (!userRows[0]) {
    return res.status(400).json({ error: "user_not_found" });
  }

  const user = sanitizeUser(userRows[0] as UserRecord);
  const { accessToken, refreshToken } = generateTokens(user);

  // Store refresh token
  try {
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await query(
      `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [newId(), user.id, tokenHash, expiresAt, nowIso()]
    );
  } catch (e) {
    console.error("Failed to store refresh token", e);
  }

  void writeAudit({
    actorId: user.id,
    action: "auth_login",
    entityType: "user",
    entityId: user.id,
    meta: { mode: "local", with2FA: true }
  });

  return res.json({ success: true, accessToken, refreshToken, user });
});

// GET /auth/2fa/status - Check if 2FA is enabled for current user
app.get("/auth/2fa/status", requireAuth, async (req, res) => {
  const user = (req as LMSAuthedRequest).user;
  const { rows } = await query("SELECT enabled FROM user_2fa WHERE user_id = $1", [user!.id]);
  res.json({ enabled: rows[0]?.enabled ?? false });
});

// POST /auth/2fa/disable - Disable 2FA for current user
app.post("/auth/2fa/disable", requireAuth, async (req, res) => {
  const user = (req as LMSAuthedRequest).user;
  await query("DELETE FROM user_2fa WHERE user_id = $1", [user!.id]);
  res.json({ success: true });
});

// ===== OFFLINE SYNC =====
app.post("/sync", requireAuth, async (req: LMSAuthedRequest, res) => {
  const { actions } = req.body;
  if (!Array.isArray(actions)) return res.status(400).json({ error: "invalid_actions" });

  const result = await SyncService.processBatch(req.user!.id, actions);
  res.json(result);
});

// ===== GROUPS (Admin Only) =====
app.post("/groups", requireRole(adminRoles), async (req, res) => {
  const { name, description } = req.body;
  const id = newId();
  await query("INSERT INTO groups (id, name, description) VALUES ($1, $2, $3)", [id, name, description]);
  res.json({ id, name, description });
});

app.post("/groups/:id/members", requireRole(adminRoles), async (req, res) => {
  const { userId } = req.body;
  await query("INSERT INTO user_groups (user_id, group_id) VALUES ($1, $2)", [userId, req.params.id]);
  res.json({ success: true });
});

// Proctoring Integration (11.2)
app.post("/exams/:id/proctor", requireAuth, async (req, res) => {
  const { id } = req.params;
  const { type, message } = req.body;
  const user = (req as LMSAuthedRequest).user;

  // Log proctoring event
  console.log(`[PROCTOR] Exam: ${id}, User: ${user?.username}, Violation: ${type}, Msg: ${message}`);

  await query(
    "INSERT INTO proctoring_logs (id, exam_id, user_id, violation_type, message, created_at) VALUES ($1, $2, $3, $4, $5, $6)",
    [newId(), id, user?.id, type, message, nowIso()]
  );

  res.json({ success: true });
});

app.get("/exams/:id/proctor/logs", requireRole(writeRoles), async (req, res) => {
  const actor = (req as LMSAuthedRequest).user!;
  const examId = req.params.id;
  const { limit, offset } = parsePagination(req);

  if (!(await checkExamOwnership(examId, actor))) {
    return res.status(403).json({ error: "forbidden" });
  }

  const { rows } = await query(
    `SELECT pl.id,
            pl.exam_id as "examId",
            pl.user_id as "userId",
            u.username as "userName",
            pl.violation_type as "violationType",
            pl.message,
            pl.created_at as "createdAt"
     FROM proctoring_logs pl
     JOIN users u ON u.id = pl.user_id
     WHERE pl.exam_id = $3
     ORDER BY pl.created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset, examId]
  );

  res.json({ logs: rows });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", version: appVersion });
});

app.use("/api/gradebook", gradebookRouter);
app.use("/api/rubrics", rubricsRouter);
app.use("/api/templates", templatesRouter);
app.use("/api/notes", notesRouter);
app.use("/api/modules", modulesRouter);
app.use("/api/question-bank", questionBankRouter);
app.use("/api/plagiarism", plagiarismRouter);

// ===== AUDIT LOGS (Admin Only) =====
app.get("/api/audit", requireRole(adminRoles), async (req, res) => {
  const { userId, eventType, severity, startDate, endDate, limit, offset } = req.query;

  const result = await AuditService.query({
    userId: userId as string,
    eventType: eventType as any,
    severity: severity as any,
    startDate: startDate ? new Date(startDate as string) : undefined,
    endDate: endDate ? new Date(endDate as string) : undefined,
    limit: limit ? parseInt(limit as string) : 50,
    offset: offset ? parseInt(offset as string) : 0
  });

  res.json(result);
});

app.get("/api/audit/summary", requireRole(adminRoles), async (req, res) => {
  const startDate = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const severityCounts = await query(`
    SELECT severity, COUNT(*) as count 
    FROM audit_logs 
    WHERE created_at >= $1 
    GROUP BY severity
  `, [startDate]);

  const eventTypeCounts = await query(`
    SELECT event_type, COUNT(*) as count 
    FROM audit_logs 
    WHERE created_at >= $1 
    GROUP BY event_type 
    ORDER BY count DESC 
    LIMIT 10
  `, [startDate]);

  res.json({
    period: '24h',
    bySeverity: severityCounts.rows,
    byEventType: eventTypeCounts.rows
  });
});

// ===== LTI 1.3 ROUTES =====
// OIDC Login Initiation
app.get("/api/lti/login", async (req, res) => {
  const { login_hint, target_link_uri, lti_message_hint } = req.query;

  if (!login_hint || !target_link_uri) {
    return res.status(400).json({ error: "Missing required LTI login parameters" });
  }

  const response = LtiService.generateLoginResponse(
    login_hint as string,
    target_link_uri as string,
    lti_message_hint as string
  );

  res.redirect(response.redirectUrl);
});

// LTI Launch Callback
app.post("/api/lti/callback", async (req, res) => {
  const { id_token, state } = req.body;

  if (!id_token) {
    return res.status(400).json({ error: "Missing id_token" });
  }

  const validation = await LtiService.validateLaunch(id_token, state || '', 'nonce');

  if (!validation.valid) {
    return res.status(401).json({ error: validation.error });
  }

  // Provision user and create session
  const user = await LtiService.provisionUser(validation.claims!);
  const tokens = generateTokens({
    id: user.id,
    role: user.role,
    username: validation.claims!.name || validation.claims!.sub,
    email: validation.claims!.email || ''
  } as User);

  // Redirect to frontend with token
  res.redirect(`${process.env.LMS_WEB_BASE_URL || 'http://localhost:3001'}/dashboard/${user.role.toLowerCase()}?token=${tokens.accessToken}`);
});

// JWKS endpoint for platforms
app.get("/api/lti/jwks", async (req, res) => {
  const jwks = await LtiService.getJwks();
  res.json(jwks);
});

// ===== xAPI ROUTES =====
app.post("/api/xapi/statements", requireAuth, async (req, res) => {
  const { statement } = req.body;

  if (!statement) {
    return res.status(400).json({ error: "Statement required" });
  }

  const result = await XApiService.sendStatement(statement);
  res.json(result);
});

app.get("/api/xapi/statements", requireRole(adminRoles), async (req, res) => {
  // Basic statement query (simplified)
  res.json({ statements: [], more: null });
});

// Track content progress via xAPI
app.post("/api/xapi/track", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const { type, contentId, contentTitle, data } = req.body;

  try {
    let result;
    switch (type) {
      case 'launch':
        result = await XApiService.trackCourseLaunch(user, contentId, contentTitle);
        break;
      case 'video':
        result = await XApiService.trackVideoWatched(user, contentId, contentTitle, data?.progress || 0);
        break;
      case 'exam':
        result = await XApiService.trackExamCompletion(
          user, contentId, contentTitle,
          data?.score || 0, data?.maxScore || 100, data?.passed || false, data?.duration || 0
        );
        break;
      default:
        return res.status(400).json({ error: "Unknown tracking type" });
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Tracking failed" });
  }
});

// ===== QTI 2.1 IMPORT/EXPORT =====
app.post("/api/qti/import", requireRole(writeRoles), upload.single('package'), async (req, res) => {
  const { courseId } = req.body;

  if (!req.file || !courseId) {
    return res.status(400).json({ error: "QTI package file and courseId required" });
  }

  const result = await QtiService.importQtiPackage(req.file.buffer, courseId);
  res.json(result);
});

app.get("/api/qti/export/:examId", requireRole(writeRoles), async (req, res) => {
  const { examId } = req.params;

  const manifest = await QtiService.exportExamToQti(examId);
  res.set('Content-Type', 'application/xml');
  res.set('Content-Disposition', `attachment; filename="exam-${examId}.xml"`);
  res.send(manifest);
});

// ===== LIVE PROCTORING (Socket.IO signaling handled in server setup) =====
app.get("/api/proctoring/sessions", requireRole(adminRoles), async (req, res) => {
  // Get active proctoring sessions
  const { rows } = await query(`
    SELECT ps.*, u.username, e.title as exam_title
    FROM proctoring_sessions ps
    JOIN users u ON ps.user_id = u.id
    JOIN exams e ON ps.exam_id = e.id
    WHERE ps.status = 'active'
    ORDER BY ps.started_at DESC
  `);
  res.json({ sessions: rows });
});

app.post("/api/proctoring/start", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const { examId } = req.body;

  // Create proctoring session
  const sessionId = crypto.randomUUID();
  await query(`
    INSERT INTO proctoring_sessions (id, user_id, exam_id, status, started_at)
    VALUES ($1, $2, $3, 'active', NOW())
    ON CONFLICT (user_id, exam_id) DO UPDATE SET status = 'active', started_at = NOW()
  `, [sessionId, user.id, examId]);

  res.json({
    sessionId,
    signalingPath: `/proctoring/${sessionId}`,
    signalingUrl: process.env.LMS_WEB_BASE_URL
      ? `${process.env.LMS_WEB_BASE_URL}/proctoring/${sessionId}`
      : undefined
  });
});

app.post("/api/proctoring/violation", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const { sessionId, type, description, screenshot } = req.body;

  await query(`
    INSERT INTO proctoring_violations (id, session_id, user_id, type, description, screenshot_url, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, NOW())
  `, [crypto.randomUUID(), sessionId, user.id, type, description, screenshot]);

  // Notify admins via socket
  io.of('/proctoring').to('proctoring-admins').emit('violation-reported', {
    sessionId,
    userId: user.id,
    type,
    description,
    timestamp: new Date().toISOString()
  });

  res.json({ success: true });
});

app.post("/api/proctoring/end", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const { sessionId } = req.body;

  await query(`
    UPDATE proctoring_sessions SET status = 'completed', ended_at = NOW() WHERE id = $1 AND user_id = $2
  `, [sessionId, user.id]);

  res.json({ success: true });
});

// Backend Integrations (LDAP, SAML, xAPI)
app.use('/auth', authOauthRoutes); // <--- RESTORED THIS LINE
app.use('/api/auth/ldap', authLdapRouter);
app.use('/api/auth/saml', authSamlRouter);
app.use('/api/xapi', xapiRouter);
app.use('/api/push', pushRouter);

app.use((req, res) => {
  res.status(404).json({ error: "not_found", path: req.path });
});

app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error("[api] Unhandled error", err);
    res.status(500).json({ error: "server_error" });
  }
);

import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { setupProctoringSocket } from "./services/liveProctoring";

const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: resolvedCorsOrigin,
    methods: ["GET", "POST"],
    credentials: true
  }
});

io.on("connection", (socket) => {
  console.log("WebRTC Signaling: Client connected", socket.id);
  socket.on("join-exam-room", (examId) => { socket.join(examId); });
  socket.on("offer", (payload) => { io.to(payload.target).emit("offer", { sdp: payload.sdp, caller: socket.id }); });
  socket.on("answer", (payload) => { io.to(payload.target).emit("answer", { sdp: payload.sdp, caller: socket.id }); });
  socket.on("ice-candidate", (payload) => { io.to(payload.target).emit("ice-candidate", { candidate: payload.candidate, caller: socket.id }); });
});

// Proctoring namespace (/proctoring): live session list + violation events
setupProctoringSocket(io);

const seedAdmin = async () => {
  try {
    // Seed Admin
    const adminCheck = await query("SELECT id FROM users WHERE username = 'admin' LIMIT 1");
    if (adminCheck.rows.length === 0) {
      console.log("[seed] Creating default admin user...");
      await createUserRecord({
        username: "admin",
        email: "ytunahan7878@gmail.com",
        password: "Admin123!",
        role: "Admin",
        emailVerified: true
      });
      console.log(`[seed] Admin created.`);
    }

    // Seed Guest
    const guestCheck = await query("SELECT id FROM users WHERE username = 'guest' LIMIT 1");
    if (guestCheck.rows.length === 0) {
      console.log("[seed] Creating guest user...");
      await createUserRecord({
        username: "guest",
        email: "guest@lms.local",
        password: "Guest123!",
        role: "Student",
        emailVerified: true
      });
      console.log(`[seed] Guest created.`);
    }
  } catch (err) {
    console.error("[seed] Failed to seed users (non-critical):", err);
  }
};

const start = async () => {
  await ensureSchema();
  await seedAdmin(); // Added seeding
  // await seedContent(); // Keeping if it existed, or just relying on seedAdmin. 
  // Wait, previous view showed await seedContent();. I should include it if checking explicitly.
  // The file view showed:
  // 2563:   await ensureSchema();
  // 2564:   await seedContent();
  // so I will keep it.
  if (typeof seedContent !== 'undefined') { await seedContent(); }

  httpServer.listen(parseInt(port.toString()), '0.0.0.0', () => {
    console.log(`[api] ${appName} listening on 0.0.0.0:${port}`);
    const forceMemory = process.env.LMS_FORCE_MEMORY === "true";

    console.log(`[api] 🔌 Database Mode: ${forceMemory ? 'MEMORY' : 'POSTGRES'}`);
    if (forceMemory) {
      console.warn("⚠️  WARNING: Running in IN-MEMORY mode. Data will be lost on restart.");
    } else {
      console.log("✅ Using Persistent Storage (PostgreSQL)");
    }
  });
};

start().catch((err) => {
  console.error("[api] Failed to start", err);
  process.exit(1);
});
