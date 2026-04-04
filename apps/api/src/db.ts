import { Pool } from "pg";
import { DataType, newDb } from "pg-mem";
import type { QueryResultRow } from "pg";
import crypto from "crypto";
import { existsSync } from "fs";
import { readFile, readdir } from "fs/promises";
import path from "path";

let pool: Pool | null = null;
let usingMemory = false;

type DbMode = "postgres" | "memory" | "auto";

const resolveDbMode = (): DbMode => {
  const value = (process.env.LMS_DB_MODE ?? "postgres").toLowerCase();
  if (value === "postgres" || value === "memory" || value === "auto") {
    return value as DbMode;
  }
  return "postgres";
};

const createMemoryPool = () => {
  const db = newDb();
  db.public.registerFunction({
    name: "gen_random_uuid",
    returns: DataType.uuid,
    implementation: () => crypto.randomUUID()
  });
  db.public.registerFunction({
    name: "uuid_generate_v4",
    returns: DataType.uuid,
    implementation: () => crypto.randomUUID()
  });
  const adapter = db.adapters.createPg();
  return new adapter.Pool();
};

const initPool = () => {
  // Force PostgreSQL mode unless explicitly overridden with LMS_FORCE_MEMORY=true
  const forceMemory = process.env.LMS_FORCE_MEMORY === "true";
  const mode = forceMemory ? "memory" : "postgres";
  console.log(`[db] Initializing Pool. Mode: ${mode}`);

  const dbUrl = process.env.LMS_DB_URL || "postgresql://postgres:postgres@localhost:5432/lms";

  if (forceMemory) {
    console.log("[db] Using IN-MEMORY database (pg-mem) - LMS_FORCE_MEMORY=true");
    usingMemory = true;
    return createMemoryPool();
  }

  console.log("[db] Connecting to POSTGRESQL at:", dbUrl.replace(/:[^:@]*@/, ":***@")); // Hide password
  const useSsl = process.env.LMS_DB_SSL === "true";
  usingMemory = false;

  const pool = new Pool({
    connectionString: dbUrl,
    ssl: useSsl ? { rejectUnauthorized: false } : undefined
  });

  pool.on('error', (err) => {
    console.error('[db] Unexpected error on idle client', err);
  });

  return pool;
};

const isConnectionError = (err: unknown) => {
  if (err && typeof err === "object") {
    const code = (err as { code?: string }).code;
    if (code) {
      return ["ECONNREFUSED", "ENOTFOUND", "EHOSTUNREACH", "ETIMEDOUT", "EPIPE"].includes(code);
    }
    const message = (err as { message?: string }).message;
    if (message) {
      return message.includes("ECONNREFUSED") || message.includes("connect");
    }
  }
  return false;
};

const getPool = (): Pool => {
  if (pool) {
    return pool;
  }
  const nextPool = initPool();
  pool = nextPool;
  return nextPool;
};

export const query = async <T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = []
) => {
  const activePool = getPool();
  try {
    return await activePool.query<T>(text, params);
  } catch (err) {
    const mode = resolveDbMode();
    if (mode === "auto" && !usingMemory && isConnectionError(err)) {
      // User requested NO DB RESET. Fallback to memory causes "reset".
      // We will now THROW the error instead of falling back, so the user/admin knows DB is down.
      // console.warn("[db] Postgres unavailable, falling back to in-memory DB");
      // const fallbackPool = createMemoryPool() as unknown as Pool;
      // pool = fallbackPool;
      // usingMemory = true;
      // return fallbackPool.query<T>(text, params);

      console.error("❌ [db] Connection to Postgres failed. In-memory fallback is DISABLED to prevent data reset.");
      throw err;
    }
    throw err;
  }
};

const getMigrationsDir = () => path.join(__dirname, "..", "migrations");

export const runMigrations = async () => {
  const migrationsDir = getMigrationsDir();
  if (!existsSync(migrationsDir)) {
    throw new Error(`Migrations directory not found: ${migrationsDir}`);
  }

  await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id text PRIMARY KEY,
      applied_at timestamptz NOT NULL
    );
  `);

  let files = (await readdir(migrationsDir))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  if (usingMemory) {
    const safe = new Set([
      "001_init.sql",
      "002_auth.sql",
      "003_add_email.sql",
      "004_hierarchy.sql",
      "005_exam_system.sql",
      "006_exam_advanced.sql",
      "007_live_class.sql",
      "008_scorm_tables.sql",
      "009_push_tokens.sql",
      "010_advanced_features.sql",
      "011_access_control.sql",
      "012_scorm_h5p.sql",
      "013_audit_kvkk.sql",
      "014_user_management.sql",
      "015_question_grading.sql",
      "016_gradebook.sql",
      "017_prerequisites.sql",
      // "018_notes.sql", // pg-mem doesn't support to_tsvector
      "019_pdf_bookmarks.sql",
      "020_plagiarism.sql",
      "022_rubric_system.sql",
      "023_course_templates.sql",
      // "026_seb_support.sql", // pg-mem doesn't support random()
      // "027_seb_mandatory.sql", // pg-mem doesn't support random()
      "028_audit_actor_id.sql",
      "029_email_verification.sql",
      "030_content_progress.sql",
      "030_proctoring_logs.sql",
      "031_add_full_name.sql",
      "032_manual_grades.sql",
      "033_add_question_order.sql"
    ]);
    files = files.filter((file) => safe.has(file));
  }

  for (const file of files) {
    const existing = await query<{ id: string }>(
      `SELECT id FROM schema_migrations WHERE id = $1`,
      [file]
    );
    if (existing.rowCount && existing.rows[0]) {
      continue;
    }
    const sql = await readFile(path.join(migrationsDir, file), "utf8");
    if (!sql.trim()) {
      continue;
    }
    await query(sql);
    await query(
      `INSERT INTO schema_migrations (id, applied_at) VALUES ($1, $2)`,
      [file, new Date().toISOString()]
    );
  }
};

const ensureAuditColumns = async () => {
  try {
    await query(
      `ALTER TABLE audit_logs
         ADD COLUMN IF NOT EXISTS actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
         ADD COLUMN IF NOT EXISTS entity_type VARCHAR(50),
         ADD COLUMN IF NOT EXISTS entity_id VARCHAR(100),
         ADD COLUMN IF NOT EXISTS meta JSONB DEFAULT '{}'::jsonb;`
    );
    await query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_id);`);
  } catch (err) {
    const code = err && typeof err === "object" ? (err as { code?: string }).code : undefined;
    if (code === "42P01") {
      return;
    }
    console.warn("[db] audit_logs actor_id ensure failed", err);
  }
};

export const ensureSchema = async () => {
  await runMigrations();
  await ensureAuditColumns();
};

export const closeDb = async () => {
  if (!pool) {
    return;
  }
  await pool.end();
  pool = null;
};
