"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import RichTextEditor from "../../components/RichTextEditor";
import CloudFilePicker from "../../components/CloudFilePicker";
import MicrosoftOneDrivePicker from "../../components/MicrosoftOneDrivePicker";
import ExamTakingComponent from "../../components/exam/ExamTakingComponent";
import ExamSubmissions from "../../components/exam/ExamSubmissions";
import TemplateSelector from "../../components/course/TemplateSelector";
import OmrPanel from "../../components/omr/OmrPanel";
import Gradebook from "../../components/Gradebook";
import CourseModulesEditor from "../../components/course/CourseModulesEditor";
import QuestionBankPanel from "../../components/exam/QuestionBankPanel";
import RubricEditor from "../../components/rubric/RubricEditor";
import ContentPlayer from "../../components/course/ContentPlayer";
import NotesPanel from "../../components/course/NotesPanel";
import ContentReorderList from "../../components/course/ContentReorderList";
import LocalizedFileInput from "../../../components/LocalizedFileInput";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createApiClient, resolveApiBaseUrl, questionTypeOptions, trueFalseOptions } from "@lms/shared";
import type {
  Content,
  Course,
  Exam,
  HealthResponse,
  Question,
  QuestionMeta,
  QuestionType,
  Role,
  User,
  VersionResponse
} from "@lms/shared";

type PageProps = { params: { role: string } };
type CoursesResponse = { courses: Course[] };
type ContentResponse = { content: Content[] };
type ExamsResponse = { exams: Exam[] };
type QuestionsResponse = { questions: Question[] };
type UsersResponse = { users: User[] };
type MatchingPair = { left: string; right: string };
type CalculationVariable = { name: string; min: string; max: string; step: string };
type HotspotAreaInput = { x: string; y: string; width: string; height: string };
type CodeTestInput = { input: string; output: string };
type Tag = { id: string; name: string; color: string; };

const readToken = () => {
  if (typeof window === "undefined") {
    return null;
  }
  return localStorage.getItem("lms_token");
};

const canWriteRoles = new Set(["superadmin", "admin", "instructor", "assistant"]);
const canCreateCourseRoles = new Set(["superadmin", "admin", "instructor"]); // Sadece Öğretmen ve Admin ders açabilir
const adminRoles = new Set(["superadmin", "admin"]);
const roleOptions: Role[] = ["SuperAdmin", "Admin", "Instructor", "Assistant", "Student", "Guest"];
const contentTypeOptions = ["video", "pdf", "scorm", "h5p"] as const;
const defaultQuestionType = questionTypeOptions[0]?.value ?? "multiple_choice";
const questionTypeLabelMap = new Map(
  questionTypeOptions.map((option) => [option.value, option.label])
);
const normalizeQuestionType = (value: string) =>
  questionTypeLabelMap.has(value as QuestionType) ? (value as QuestionType) : defaultQuestionType;
const isChoiceQuestion = (value: QuestionType) =>
  value === "multiple_choice" || value === "multiple_select" || value === "true_false";
const isEditableChoiceQuestion = (value: QuestionType) =>
  value === "multiple_choice" || value === "multiple_select";
const formatAnswer = (value: Question["answer"], t: (key: string) => string) => {
  if (Array.isArray(value)) {
    return value.join(" / ");
  }
  if (typeof value === "boolean") {
    return value ? t("true") : t("false");
  }
  if (value === undefined) {
    return "";
  }
  return String(value);
};
const parseApiError = (err: unknown, fallback: string) => {
  if (err instanceof Error && err.message) {
    return err.message;
  }
  if (typeof err === "object" && err) {
    const maybeMessage = (err as { message?: string }).message;
    if (maybeMessage) {
      return maybeMessage;
    }
    const maybeResponse = (err as { response?: { data?: unknown } }).response?.data;
    if (maybeResponse && typeof maybeResponse === "object") {
      const error = (maybeResponse as { error?: string }).error;
      if (error) {
        return error;
      }
      const details = (maybeResponse as { details?: unknown }).details;
      if (details && typeof details === "object") {
        const fieldErrors = (details as { fieldErrors?: Record<string, string[]> }).fieldErrors;
        if (fieldErrors) {
          const messages = Object.values(fieldErrors)
            .flat()
            .filter(Boolean);
          if (messages.length) {
            return messages.join(" ");
          }
        }
      }
    }
  }
  return fallback;
};
const formatQuestionMetaLines = (question: Question, t: (key: string, options?: any) => string) => {
  const meta = question.meta ?? undefined;
  if (!meta) {
    return [] as string[];
  }
  if (question.type === "matching" && meta.matchingPairs?.length) {
    return [
      `${t("matching_pair")}: ${meta.matchingPairs
        .map((pair) => `${pair.left ?? ""} -> ${pair.right ?? ""}`)
        .join("; ")}`
    ];
  }
  if (question.type === "ordering" && meta.orderingItems?.length) {
    return [`${t("ordering")}: ${meta.orderingItems.join(" > ")}`];
  }
  if (question.type === "fill_blank" && meta.blankAnswers?.length) {
    const blanks = meta.blankAnswers
      .map((answers, index) => `${t("question_blank_label")} ${index + 1}: ${answers.join(" / ")}`)
      .join(" | ");
    return [`${t("question_fill_blank_prompt")} ${blanks}`];
  }
  if (question.type === "short_answer" && meta.shortAnswers?.length) {
    return [`${t("short_answer")}: ${meta.shortAnswers.join(", ")}`];
  }
  if (question.type === "long_answer" && meta.longAnswerGuide) {
    return [`${t("long_answer_note")}: ${meta.longAnswerGuide}`];
  }
  if (question.type === "file_upload" && meta.fileUpload) {
    const parts = [
      meta.fileUpload.allowedTypes?.length
        ? `${t("file_upload_types")}: ${meta.fileUpload.allowedTypes.join(", ")}`
        : null,
      meta.fileUpload.maxFiles ? `${t("file_upload_max")}: ${meta.fileUpload.maxFiles}` : null,
      meta.fileUpload.maxSizeMb ? `${t("file_upload_size")}: ${meta.fileUpload.maxSizeMb}` : null
    ].filter(Boolean);
    return parts.length ? [`${t("upload_file")}: ${parts.join(" | ")}`] : [];
  }
  if (question.type === "calculation" && meta.calculation?.formula) {
    const variables = meta.calculation.variables?.length
      ? meta.calculation.variables
        .map((item) => {
          const min = item.min ?? "";
          const max = item.max ?? "";
          const step = item.step ?? "";
          return `${item.name ?? ""}(${min}-${max}${step ? `, ${step}` : ""})`;
        })
        .join("; ")
      : "";
    return [
      `${t("formula")}: ${meta.calculation.formula}${variables ? ` | ${t("variables")}: ${variables}` : ""
      }`
    ];
  }
  if (question.type === "hotspot" && meta.hotspot) {
    const areasCount = meta.hotspot.areas?.length ?? 0;
    return [
      `${t("hotspot")}: ${meta.hotspot.imageUrl}${areasCount ? ` | ${t("areas_count")}: ${areasCount}` : ""
      }`
    ];
  }
  if (question.type === "code" && meta.code?.language) {
    const testsCount = meta.code.tests?.length ?? 0;
    return [`${t("code")}: ${meta.code.language}${testsCount ? ` | ${t("test_count")}: ${testsCount}` : ""}`];
  }
  return [];
};
const normalizeOptionList = (options?: string[]) => {
  const next = (options ?? []).map((item) => item ?? "");
  if (next.length >= 2) {
    return next;
  }
  const filled = [...next];
  while (filled.length < 2) {
    filled.push("");
  }
  return filled;
};
const buildOptionList = (options: string[]) =>
  options.map((item) => item.trim()).filter(Boolean);
const getOptionList = (type: QuestionType, options: string[]) =>
  type === "true_false" ? [] : buildOptionList(options);
const normalizeList = (items?: string[], minLength = 1) => {
  const next = (items ?? []).map((item) => item ?? "");
  if (next.length >= minLength) {
    return next;
  }
  const filled = [...next];
  while (filled.length < minLength) {
    filled.push("");
  }
  return filled;
};
const normalizePairs = (pairs?: MatchingPair[]) => {
  const next = (pairs ?? []).map((pair) => ({
    left: pair.left ?? "",
    right: pair.right ?? ""
  }));
  return next.length ? next : [{ left: "", right: "" }];
};
const normalizeBlankAnswers = (blanks?: string[][]) => {
  const next = (blanks ?? []).map((answers) => normalizeList(answers, 1));
  return next.length ? next : [normalizeList(undefined, 1)];
};
const normalizeVariables = (vars?: CalculationVariable[]) => {
  const next = (vars ?? []).map((item) => ({
    name: item.name ?? "",
    min: item.min ?? "",
    max: item.max ?? "",
    step: item.step ?? ""
  }));
  return next.length ? next : [{ name: "", min: "", max: "", step: "" }];
};
const normalizeHotspotAreas = (areas?: HotspotAreaInput[]) => {
  const next = (areas ?? []).map((item) => ({
    x: item.x ?? "",
    y: item.y ?? "",
    width: item.width ?? "",
    height: item.height ?? ""
  }));
  return next.length ? next : [{ x: "", y: "", width: "", height: "" }];
};
const normalizeCodeTests = (tests?: CodeTestInput[]) => {
  const next = (tests ?? []).map((item) => ({
    input: item.input ?? "",
    output: item.output ?? ""
  }));
  return next.length ? next : [{ input: "", output: "" }];
};
const toNumberOrUndefined = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const numberValue = Number(trimmed);
  return Number.isFinite(numberValue) ? numberValue : undefined;
};
const isImageContent = (value: string) => {
  const normalized = value.toLowerCase();
  return (
    normalized.includes("image") || normalized.includes("photo") || normalized.includes("resim")
  );
};

import { useTranslation } from "react-i18next";

export default function RoleDashboardPage({ params }: PageProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const [apiBaseUrl, setApiBaseUrl] = useState<string | null>(null);

  const apiClient = useMemo(() => {
    if (!apiBaseUrl) {
      return null;
    }
    return createApiClient({ baseUrl: apiBaseUrl });
  }, [apiBaseUrl]);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [version, setVersion] = useState<VersionResponse | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'detail' | 'exam_detail'>('list');
  const [activeSection, setActiveSection] = useState<'courses' | 'omr' | 'users' | 'rubrics' | 'gradebook'>('courses');
  const [activeTab, setActiveTab] = useState<'content' | 'grades' | 'exams'>('content');
  const [showModuleEditor, setShowModuleEditor] = useState(false);
  const [showContentReorder, setShowContentReorder] = useState(false);
  const [contentReorderModuleId, setContentReorderModuleId] = useState<string>("__unassigned__");
  const [courseModulesFlat, setCourseModulesFlat] = useState<Array<{ id: string; title: string }>>([]);
  const [showQuestionBank, setShowQuestionBank] = useState(false);
  const [showRubricEditor, setShowRubricEditor] = useState(false);
  const [showGeneralNotes, setShowGeneralNotes] = useState(false);
  const [showClassList, setShowClassList] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [selectedExam, setSelectedExam] = useState<Exam | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [browseCourses, setBrowseCourses] = useState<Course[]>([]);
  const [contentItems, setContentItems] = useState<Content[]>([]);
  const [courseMembers, setCourseMembers] = useState<any[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState<Role>("Student");
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editUserName, setEditUserName] = useState("");
  const [editUserEmail, setEditUserEmail] = useState("");
  const [editUserPassword, setEditUserPassword] = useState("");
  const [editUserRole, setEditUserRole] = useState<Role>("Student");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [mattermostWebhookUrl, setMattermostWebhookUrl] = useState("");
  const [mattermostChannelUrl, setMattermostChannelUrl] = useState("");
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [editCourseTitle, setEditCourseTitle] = useState("");
  const [editCourseDescription, setEditCourseDescription] = useState("");
  const [editCourseMattermostWebhookUrl, setEditCourseMattermostWebhookUrl] = useState("");
  const [editCourseMattermostChannelUrl, setEditCourseMattermostChannelUrl] = useState("");
  const editCourseFormRef = useRef<HTMLDivElement | null>(null);
  const [contentType, setContentType] = useState<(typeof contentTypeOptions)[number]>(
    contentTypeOptions[0]
  );
  const [contentTitle, setContentTitle] = useState("");
  const [contentSource, setContentSource] = useState("");
  const [editingContentId, setEditingContentId] = useState<string | null>(null);
  const [editContentType, setEditContentType] = useState<string>(contentTypeOptions[0]);
  const [editContentTitle, setEditContentTitle] = useState("");
  const [editContentSource, setEditContentSource] = useState("");
  const [contentFile, setContentFile] = useState<File | null>(null);
  const [editContentFile, setEditContentFile] = useState<File | null>(null);
  const editContentFormRef = useRef<HTMLDivElement | null>(null);
  const [exams, setExams] = useState<Exam[]>([]);
  const [examTitle, setExamTitle] = useState("");
  const [examCourseId, setExamCourseId] = useState("");
  const [newPrerequisites, setNewPrerequisites] = useState<Content[]>([]);
  const [editPrerequisites, setEditPrerequisites] = useState<Content[]>([]);

  const flattenModules = useCallback((nodes: any[], acc: Array<{ id: string; title: string }> = []) => {
    for (const n of nodes || []) {
      if (n && n.id && n.title) {
        acc.push({ id: String(n.id), title: String(n.title) });
      }
      if (Array.isArray(n?.children) && n.children.length) {
        flattenModules(n.children, acc);
      }
    }
    return acc;
  }, []);

  useEffect(() => {
    if (!showContentReorder || !selectedCourse || !apiClient) return;
    const token = readToken();
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${apiBaseUrl}/api/modules/${selectedCourse.id}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const flat = flattenModules(Array.isArray(data) ? data : [], []);
        setCourseModulesFlat(flat);
        // Default selection: first module if exists, otherwise unassigned.
        if (flat.length && contentReorderModuleId === "__unassigned__") {
          setContentReorderModuleId(flat[0].id);
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, apiClient, contentReorderModuleId, flattenModules, selectedCourse, showContentReorder]);

  // Question Tags
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [editQuestionTags, setEditQuestionTags] = useState<Tag[]>([]);


  const [examDuration, setExamDuration] = useState("");
  const [examPassThreshold, setExamPassThreshold] = useState("");
  const [examStartDate, setExamStartDate] = useState("");
  const [examEndDate, setExamEndDate] = useState("");
  const [examMaxAttempts, setExamMaxAttempts] = useState("1");
  const [examIsDraft, setExamIsDraft] = useState(true);
  const [examResultsVisibleAt, setExamResultsVisibleAt] = useState("");
  const [editingExamId, setEditingExamId] = useState<string | null>(null);
  const [editExamTitle, setEditExamTitle] = useState("");
  const [editExamCourseId, setEditExamCourseId] = useState("");
  const [editExamDuration, setEditExamDuration] = useState("");
  const [editExamPassThreshold, setEditExamPassThreshold] = useState("");
  const [editExamStartDate, setEditExamStartDate] = useState("");
  const [editExamEndDate, setEditExamEndDate] = useState("");
  const [editExamMaxAttempts, setEditExamMaxAttempts] = useState("1");
  const [editExamIsDraft, setEditExamIsDraft] = useState(true);
  const [editExamResultsVisibleAt, setEditExamResultsVisibleAt] = useState("");
  const editExamFormRef = useRef<HTMLDivElement | null>(null);
  const [viewingSubmissionsExam, setViewingSubmissionsExam] = useState<Exam | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const editQuestionFormRef = useRef<HTMLDivElement | null>(null);
  const [questionPrompt, setQuestionPrompt] = useState("");
  const [questionPoints, setQuestionPoints] = useState("10");
  const [questionType, setQuestionType] = useState<QuestionType>(defaultQuestionType);
  const [questionOptions, setQuestionOptions] = useState<string[]>(["", ""]);
  const [questionAnswer, setQuestionAnswer] = useState("");
  const [questionAnswerMulti, setQuestionAnswerMulti] = useState<string[]>([]);
  const [questionExamId, setQuestionExamId] = useState("");
  const [matchingPairs, setMatchingPairs] = useState<MatchingPair[]>(normalizePairs());
  const [orderingItems, setOrderingItems] = useState<string[]>(normalizeList(undefined, 2));
  const [blankAnswers, setBlankAnswers] = useState<string[][]>(normalizeBlankAnswers());
  const [shortAnswers, setShortAnswers] = useState<string[]>(normalizeList(undefined, 1));
  const [longAnswerGuide, setLongAnswerGuide] = useState("");
  const [fileAllowedTypes, setFileAllowedTypes] = useState<string[]>(normalizeList(undefined, 1));
  const [fileMaxFiles, setFileMaxFiles] = useState("");
  const [fileMaxSizeMb, setFileMaxSizeMb] = useState("");
  const [calculationFormula, setCalculationFormula] = useState("");
  const [calculationVariables, setCalculationVariables] = useState<CalculationVariable[]>(
    normalizeVariables()
  );
  const [hotspotImageUrl, setHotspotImageUrl] = useState("");
  const [hotspotAreas, setHotspotAreas] = useState<HotspotAreaInput[]>(normalizeHotspotAreas());
  const [codeLanguage, setCodeLanguage] = useState("javascript");
  const [codeStarter, setCodeStarter] = useState("");
  const [codeTests, setCodeTests] = useState<CodeTestInput[]>(normalizeCodeTests());
  const [rubricItems, setRubricItems] = useState<{ criteria: string; points: string; description: string }[]>([{ criteria: "", points: "", description: "" }]);

  // Student Exam States
  const [examStarted, setExamStarted] = useState(false);
  const [examAnswers, setExamAnswers] = useState<Record<string, any>>({});
  const [examSubmissionResult, setExamSubmissionResult] = useState<{ score: number; passed: boolean } | null>(null);
  const [examSubmitting, setExamSubmitting] = useState(false);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [editQuestionPrompt, setEditQuestionPrompt] = useState("");
  const [editQuestionPoints, setEditQuestionPoints] = useState("10");
  const [editQuestionType, setEditQuestionType] = useState<QuestionType>(defaultQuestionType);
  const [editQuestionOptions, setEditQuestionOptions] = useState<string[]>(["", ""]);
  const [editQuestionAnswer, setEditQuestionAnswer] = useState("");
  const [editQuestionAnswerMulti, setEditQuestionAnswerMulti] = useState<string[]>([]);
  const [editQuestionExamId, setEditQuestionExamId] = useState("");
  const [editMatchingPairs, setEditMatchingPairs] = useState<MatchingPair[]>(normalizePairs());
  const [editOrderingItems, setEditOrderingItems] = useState<string[]>(normalizeList(undefined, 2));
  const [editBlankAnswers, setEditBlankAnswers] = useState<string[][]>(normalizeBlankAnswers());
  const [editShortAnswers, setEditShortAnswers] = useState<string[]>(normalizeList(undefined, 1));
  const [editLongAnswerGuide, setEditLongAnswerGuide] = useState("");
  const [editFileAllowedTypes, setEditFileAllowedTypes] = useState<string[]>(
    normalizeList(undefined, 1)
  );
  const [editFileMaxFiles, setEditFileMaxFiles] = useState("");
  const [editFileMaxSizeMb, setEditFileMaxSizeMb] = useState("");
  const [editCalculationFormula, setEditCalculationFormula] = useState("");
  const [editCalculationVariables, setEditCalculationVariables] = useState<CalculationVariable[]>(
    normalizeVariables()
  );
  const [editHotspotImageUrl, setEditHotspotImageUrl] = useState("");
  const [editHotspotAreas, setEditHotspotAreas] =
    useState<HotspotAreaInput[]>(normalizeHotspotAreas());
  const [editCodeLanguage, setEditCodeLanguage] = useState("javascript");
  const [editCodeStarter, setEditCodeStarter] = useState("");
  const [editCodeTests, setEditCodeTests] = useState<CodeTestInput[]>(normalizeCodeTests());
  const [editRubricItems, setEditRubricItems] = useState<{ criteria: string; points: string; description: string }[]>([{ criteria: "", points: "", description: "" }]);

  const [liveRoomName, setLiveRoomName] = useState("");
  const [liveClassProvider, setLiveClassProvider] = useState<'jitsi' | 'bbb'>('jitsi');
  const [liveMeetingUrl, setLiveMeetingUrl] = useState<string | null>(null);
  const [liveMeetingError, setLiveMeetingError] = useState<string | null>(null);
  const [creatingMeeting, setCreatingMeeting] = useState(false);

  const [userRole, setUserRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);
  const [creatingContent, setCreatingContent] = useState(false);
  const [creatingExam, setCreatingExam] = useState(false);
  const [creatingQuestion, setCreatingQuestion] = useState(false);
  const [updatingCourseId, setUpdatingCourseId] = useState<string | null>(null);
  const [deletingCourseId, setDeletingCourseId] = useState<string | null>(null);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [updatingContentId, setUpdatingContentId] = useState<string | null>(null);
  const [deletingContentId, setDeletingContentId] = useState<string | null>(null);
  const [updatingExamId, setUpdatingExamId] = useState<string | null>(null);
  const [deletingExamId, setDeletingExamId] = useState<string | null>(null);
  const [updatingQuestionId, setUpdatingQuestionId] = useState<string | null>(null);
  const [deletingQuestionId, setDeletingQuestionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [playingContent, setPlayingContent] = useState<Content | null>(null);
  const [contentProgress, setContentProgress] = useState<Record<string, number>>({});

  // Fetch content progress when course changes
  useEffect(() => {
    if (selectedCourse && readToken()) {
      const fetchProgress = async () => {
        try {
          const res = await fetch(`${apiBaseUrl}/api/progress/course/${selectedCourse.id}`, {
            headers: { Authorization: `Bearer ${readToken()}` }
          });
          if (res.ok) {
            const data = await res.json();
            const progressMap: Record<string, number> = {};
            for (const p of data) {
              progressMap[p.content_id] = p.progress_percent;
            }
            setContentProgress(progressMap);
          }
        } catch (err) {
          console.error("Progress fetch error", err);
        }
      };
      fetchProgress();
    }
  }, [selectedCourse, apiBaseUrl]);

  // Fetch tags when editing question
  useEffect(() => {
    if (editingQuestionId && apiClient) {
      // Fetch All Tags
      apiClient.get<Tag[]>('/question-bank/tags', { headers: { Authorization: `Bearer ${readToken()}` } })
        .then(res => setAllTags(res))
        .catch(console.error);

      // Fetch Question Tags
      apiClient.get<Tag[]>(`/question-bank/questions/${editingQuestionId}/tags`, { headers: { Authorization: `Bearer ${readToken()}` } })
        .then(res => setEditQuestionTags(res))
        .catch(console.error);
    }
  }, [editingQuestionId, apiClient]);

  useEffect(() => {
    try {
      setApiBaseUrl(resolveApiBaseUrl({ runtime: "web" }));
    } catch (err) {
      setError(parseApiError(err, t('api_resolve_error')));
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const raw = localStorage.getItem("lms_user");
    if (!raw) {
      return;
    }
    try {
      const parsed = JSON.parse(raw) as { role?: string };
      if (parsed.role) {
        setUserRole(parsed.role);
      }
    } catch {
      setUserRole(null);
    }
  }, []);

  const roleLower = (userRole ?? params.role).toLowerCase();
  const canWrite = canWriteRoles.has(roleLower);
  const canCreateCourse = canCreateCourseRoles.has(roleLower);
  const isAdmin = adminRoles.has(roleLower);
  const tokenAvailable = readToken() !== null;
  const currentToken = readToken();


  const editContentTypeOptions = useMemo(() => {
    const trimmed = editContentType.trim();
    if (!trimmed) {
      return contentTypeOptions;
    }
    return contentTypeOptions.includes(trimmed as (typeof contentTypeOptions)[number])
      ? contentTypeOptions
      : [...contentTypeOptions, trimmed];
  }, [editContentType]);

  const handleStartExam = useCallback(() => {
    setExamStarted(true);
    setExamAnswers({});
    setExamSubmissionResult(null);
    setExamSubmitting(false);
  }, []);

  const handleSubmitExam = useCallback(async () => {
    if (!apiClient || !selectedExam) return;
    setExamSubmitting(true);
    setError(null);
    const token = readToken();
    if (!token) {
      setError(t('token_not_found'));
      setExamSubmitting(false);
      return;
    }

    try {
      const res = await apiClient.post<{ score: number; passed: boolean }>(
        `/exams/${selectedExam.id}/submit`,
        { answers: examAnswers },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setExamSubmissionResult(res);
      setExamStarted(false);
    } catch (err) {
      setError(parseApiError(err, t('exam_submit_error')));
    } finally {
      setExamSubmitting(false);
    }
  }, [apiClient, selectedExam, examAnswers]);

  const toggleOption = useCallback((questionId: string, option: string, isMulti: boolean) => {
    setExamAnswers(prev => {
      const current = prev[questionId];
      if (isMulti) {
        const list = Array.isArray(current) ? current : [];
        if (list.includes(option)) {
          return { ...prev, [questionId]: list.filter((o: string) => o !== option) };
        } else {
          return { ...prev, [questionId]: [...list, option] };
        }
      } else {
        return { ...prev, [questionId]: option };
      }
    });
  }, []);

  const loadData = useCallback(async () => {
    if (!apiClient) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [healthResult, versionResult] = await Promise.all([
        apiClient.get<HealthResponse>("/health"),
        apiClient.get<VersionResponse>("/version")
      ]);
      setHealth(healthResult);
      setVersion(versionResult);

      const token = readToken();
      if (!token) {
        setCourses([]);
        setError(t('session_expired'));
        return;
      }
      const isAdmin = adminRoles.has(roleLower);
      const isStudent = roleLower === 'student';

      const usersRequest = isAdmin
        ? apiClient.get<UsersResponse>("/users", {
          headers: { Authorization: `Bearer ${token}` }
        })
        : Promise.resolve<UsersResponse>({ users: [] });

      const courseRequest = apiClient.get<CoursesResponse>("/courses", {
        headers: { Authorization: `Bearer ${token}` },
        params: isStudent ? { mode: 'enrolled' } : undefined
      });

      const browseRequest = isStudent
        ? apiClient.get<CoursesResponse>("/courses", {
          headers: { Authorization: `Bearer ${token}` },
          params: { mode: 'browse' }
        })
        : Promise.resolve<CoursesResponse>({ courses: [] });

      const [courseResponse, browseResponse, contentResponse, examResponse, questionResponse, usersResponse] =
        await Promise.all([
          courseRequest,
          browseRequest,
          apiClient.get<ContentResponse>("/content", {
            headers: { Authorization: `Bearer ${token}` }
          }),
          // apiClient.get<ExamsResponse>("/exams", { headers: { Authorization: `Bearer ${token}` } }),
          Promise.resolve({ exams: [] }),
          apiClient.get<QuestionsResponse>("/questions", {
            headers: { Authorization: `Bearer ${token}` }
          }),
          usersRequest
        ]);
      setCourses(courseResponse.courses);
      setBrowseCourses(browseResponse.courses);
      setContentItems(contentResponse.content);
      setUsers(usersResponse.users);
      setExams(examResponse.exams);
      setQuestions(questionResponse.questions);
    } catch (err) {
      setError(parseApiError(err, "Dashboard yüklenemedi."));
    } finally {
      setLoading(false);
    }
  }, [apiClient, roleLower]);

  useEffect(() => {
    if (!apiClient) {
      return;
    }
    void loadData();
  }, [apiClient, loadData]);

  // Fetch Exams specifically for the selected course
  useEffect(() => {
    if (viewMode === 'detail' && selectedCourse && activeTab === 'exams') {
      const fetchExams = async () => {
        if (!apiClient) return;
        try {
          const token = readToken();
          const res = await apiClient.get<Exam[]>(`/api/exams/course/${selectedCourse.id}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          setExams(res || []);
        } catch (err) {
          console.error("Fetch exams failed", err);
        }
      };
      fetchExams();
    }
  }, [viewMode, selectedCourse, activeTab, apiClient]);

  useEffect(() => {
    setQuestionOptions(normalizeOptionList());
    setQuestionAnswer(questionType === "true_false" ? trueFalseOptions[0] : "");
    setQuestionAnswerMulti([]);
    setMatchingPairs(normalizePairs());
    setOrderingItems(normalizeList(undefined, 2));
    setBlankAnswers(normalizeBlankAnswers());
    setShortAnswers(normalizeList(undefined, 1));
    setLongAnswerGuide("");
    setFileAllowedTypes(normalizeList(undefined, 1));
    setFileMaxFiles("");
    setFileMaxSizeMb("");
    setCalculationFormula("");
    setCalculationVariables(normalizeVariables());
    setHotspotImageUrl("");
    setHotspotAreas(normalizeHotspotAreas());
    setCodeLanguage("javascript");
    setCodeStarter("");
    setCodeTests(normalizeCodeTests());
  }, [questionType]);

  useEffect(() => {
    if (editingQuestionId) {
      editQuestionFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [editingQuestionId]);

  useEffect(() => {
    if (editingCourseId) {
      editCourseFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [editingCourseId]);

  useEffect(() => {
    if (editingContentId) {
      editContentFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [editingContentId]);

  useEffect(() => {
    if (editingExamId) {
      editExamFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [editingExamId]);


  const handleCreate = useCallback(async () => {
    if (!apiClient) {
      return;
    }
    setError(null);
    if (!title.trim()) {
      setError("Kurs başlığı gerekli.");
      return;
    }
    const token = readToken();
    if (!token) {
      setError("Token bulunamadi. Giris ekranindan tekrar login ol.");
      return;
    }
    setCreating(true);
    try {
      const response = await apiClient.post<{ course: Course }>(
        "/courses",
        {
          title: title.trim(),
          description: description.trim() || undefined,
          mattermostWebhookUrl: mattermostWebhookUrl.trim() || undefined,
          mattermostChannelUrl: mattermostChannelUrl.trim() || undefined
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setCourses((prev) => [response.course, ...prev]);
      setTitle("");
      setDescription("");
      setMattermostWebhookUrl("");
      setMattermostChannelUrl("");
    } catch (err) {
      setError(parseApiError(err, "Kurs oluşturulamadı."));
    } finally {
      setCreating(false);
    }
  }, [apiClient, description, title]);

  const handleCreateFromTemplate = useCallback(async (templateId: string) => {
    if (!apiClient) return;
    setError(null);
    const token = readToken();
    if (!token) return;

    setCreating(true);
    setShowTemplateSelector(false);

    try {
      if (templateId === 'empty') {
        // Normal creation flow if "Empty" selected, but using default title if empty
        const response = await apiClient.post<{ course: Course }>(
          "/courses",
          { title: "Yeni Ders", description: "" },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setCourses((prev) => [response.course, ...prev]);
      } else {
        // Apply template
        const response = await apiClient.post<{ course: Course }>(
          `/api/templates/${templateId}/apply`,
          { courseTitle: title || undefined },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setCourses((prev) => [response.course, ...prev]);
      }
      setTitle("");
      setDescription("");
    } catch (err) {
      setError(parseApiError(err, "Şablon uygulanamadı."));
    } finally {
      setCreating(false);
    }
  }, [apiClient, title]);

  const startEditCourse = useCallback((course: Course) => {
    setEditingCourseId(course.id);
    setEditCourseTitle(course.title);
    setEditCourseDescription(course.description ?? "");
    setEditCourseMattermostWebhookUrl(course.mattermostWebhookUrl ?? "");
    setEditCourseMattermostChannelUrl(course.mattermostChannelUrl ?? "");
  }, []);

  const cancelEditCourse = useCallback(() => {
    setEditingCourseId(null);
    setEditCourseTitle("");
    setEditCourseDescription("");
    setEditCourseMattermostWebhookUrl("");
    setEditCourseMattermostChannelUrl("");
  }, []);

  const handleUpdateCourse = useCallback(async () => {
    if (!apiClient || !editingCourseId) {
      return;
    }
    setError(null);
    const token = readToken();
    if (!token) {
      setError("Token bulunamadi. Giris ekranindan tekrar login ol.");
      return;
    }
    if (!editCourseTitle.trim()) {
      setError("Kurs başlığı gerekli.");
      return;
    }
    setUpdatingCourseId(editingCourseId);
    try {
      const response = await apiClient.patch<{ course: Course }>(
        `/courses/${editingCourseId}`,
        {
          title: editCourseTitle.trim(),
          description: editCourseDescription.trim() || undefined,
          mattermostWebhookUrl: editCourseMattermostWebhookUrl.trim() || undefined,
          mattermostChannelUrl: editCourseMattermostChannelUrl.trim() || undefined
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setCourses((prev) =>
        prev.map((item) => (item.id === editingCourseId ? response.course : item))
      );
      cancelEditCourse();
    } catch (err) {
      setError(parseApiError(err, "Kurs güncellenemedi."));
    } finally {
      setUpdatingCourseId(null);
    }
  }, [apiClient, cancelEditCourse, editCourseDescription, editCourseTitle, editingCourseId]);

  const handleDeleteCourse = useCallback(
    async (courseId: string) => {
      if (!apiClient) {
        return;
      }
      setError(null);
      const token = readToken();
      if (!token) {
        setError("Token bulunamadi. Giris ekranindan tekrar login ol.");
        return;
      }
      setDeletingCourseId(courseId);
      try {
        await apiClient.del(`/courses/${courseId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setCourses((prev) => prev.filter((item) => item.id !== courseId));
      } catch (err) {
        setError(parseApiError(err, "Kurs silinemedi."));
      } finally {
        setDeletingCourseId(null);
      }
    },
    [apiClient]
  );

  const handleEnroll = useCallback(async (courseId: string) => {
    if (!apiClient) return;
    if (roleLower !== "student") {
      setError("Sadece öğrenciler derse kayıt olabilir.");
      return;
    }
    const token = readToken();
    if (!token) return;
    setLoading(true);
    try {
      await apiClient.post(`/courses/${courseId}/enroll`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      // Move course from browse to enrolled
      setBrowseCourses(prev => prev.filter(c => c.id !== courseId));
      void loadData(); // Refresh to get correct content/exams
    } catch (err) {
      setError(parseApiError(err, "Kayıt olunamadı."));
    } finally {
      setLoading(false);
    }
  }, [apiClient, loadData, roleLower]);

  const handleCreateUser = useCallback(async () => {
    if (!apiClient) {
      return;
    }
    setError(null);
    if (!newUserName.trim() || !newUserPassword.trim()) {
      setError("Kullanıcı adı ve şifre gerekli.");
      return;
    }
    if (newUserPassword.trim().length < 4) {
      setError("Şifre en az 4 karakter olmalı.");
      return;
    }
    const token = readToken();
    if (!token) {
      setError("Token bulunamadi. Giris ekranindan tekrar login ol.");
      return;
    }
    setCreatingUser(true);
    try {
      const response = await apiClient.post<{ user: User }>(
        "/users",
        {
          username: newUserName.trim(),
          email: newUserEmail.trim() || undefined,
          password: newUserPassword,
          role: newUserRole
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setUsers((prev) => [response.user, ...prev]);
      setNewUserName("");
      setNewUserEmail("");
      setNewUserPassword("");
      setNewUserRole("Student");
    } catch (err) {
      setError(parseApiError(err, "Kullanıcı oluşturulamadı."));
    } finally {
      setCreatingUser(false);
    }
  }, [apiClient, newUserName, newUserPassword, newUserRole]);

  const startEditUser = useCallback((user: User) => {
    setEditingUserId(user.id);
    setEditUserName(user.username);
    setEditUserEmail(user.email || "");
    setEditUserRole(user.role);
    setEditUserPassword("");
  }, []);

  const cancelEditUser = useCallback(() => {
    setEditingUserId(null);
    setEditUserName("");
    setEditUserEmail("");
    setEditUserRole("Student");
    setEditUserPassword("");
  }, []);

  const handleUpdateUser = useCallback(async () => {
    if (!apiClient || !editingUserId) {
      return;
    }
    setError(null);
    if (!editUserName.trim()) {
      setError("Kullanıcı adı gerekli.");
      return;
    }
    if (editUserPassword.trim() && editUserPassword.trim().length < 4) {
      setError("Şifre en az 4 karakter olmalı.");
      return;
    }
    const token = readToken();
    if (!token) {
      setError("Token bulunamadi. Giris ekranindan tekrar login ol.");
      return;
    }
    setUpdatingUserId(editingUserId);
    try {
      const payload: { username: string; email?: string; role: Role; password?: string } = {
        username: editUserName.trim(),
        role: editUserRole
      };
      if (editUserEmail.trim()) {
        payload.email = editUserEmail.trim();
      }
      if (editUserPassword.trim()) {
        payload.password = editUserPassword;
      }
      const response = await apiClient.patch<{ user: User }>(`/users/${editingUserId}`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUsers((prev) => prev.map((item) => (item.id === editingUserId ? response.user : item)));
      cancelEditUser();
    } catch (err) {
      setError(parseApiError(err, "Kullanıcı güncellenemedi."));
    } finally {
      setUpdatingUserId(null);
    }
  }, [apiClient, cancelEditUser, editUserName, editUserPassword, editUserRole, editingUserId]);

  const handleDeleteUser = useCallback(
    async (userId: string) => {
      if (!apiClient) {
        return;
      }
      setError(null);
      const token = readToken();
      if (!token) {
        setError("Token bulunamadi. Giris ekranindan tekrar login ol.");
        return;
      }
      setDeletingUserId(userId);
      try {
        await apiClient.del(`/users/${userId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setUsers((prev) => prev.filter((item) => item.id !== userId));
      } catch (err) {
        setError(parseApiError(err, "Kullanıcı silinemedi."));
      } finally {
        setDeletingUserId(null);
      }
    },
    [apiClient]
  );

  const handleCreateContent = useCallback(async () => {
    if (!apiClient) {
      return;
    }
    setError(null);
    const normalizedType = contentType.trim().toLowerCase();
    if (!contentTitle.trim() || !normalizedType) {
      setError("İçerik tipi ve başlığı gerekli.");
      return;
    }
    if (!contentTypeOptions.includes(normalizedType as (typeof contentTypeOptions)[number])) {
      setError("Geçersiz içerik tipi.");
      return;
    }
    if (!contentSource.trim() && !contentFile) {
      setError("Video/PDF icin kaynak URL veya dosya yuklemelisin.");
      return;
    }
    const token = readToken();
    if (!token) {
      setError("Token bulunamadi. Giris ekranindan tekrar login ol.");
      return;
    }
    setCreatingContent(true);
    try {
      let finalSource = contentSource.trim();

      if (contentFile && apiClient) {
        const formData = new FormData();
        formData.append("file", contentFile);
        const uploadRes = await apiClient.post<{ url: string }>(
          "/content/upload",
          formData,
          {
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        );
        finalSource = uploadRes.url;
      }

      const created = await apiClient.post<{ content: Content }>(
        "/content",
        {
          type: normalizedType,
          title: contentTitle.trim(),
          source: finalSource || undefined,
          courseId: selectedCourse?.id
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (newPrerequisites.length > 0) {
        await Promise.all(
          newPrerequisites.map((prereq) =>
            apiClient.post(
              "/api/modules/prerequisite",
              { contentId: created.content.id, prerequisiteContentId: prereq.id },
              { headers: { Authorization: `Bearer ${token}` } }
            )
          )
        );
      }
      // Refresh content list
      const res = await apiClient.get<ContentResponse>(
        `/content${selectedCourse ? `?courseId=${selectedCourse.id}` : ''}`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      setContentItems(res.content);
      setContentType(contentTypeOptions[0]);
      setContentTitle("");
      setContentSource("");
      setContentFile(null);
      setNewPrerequisites([]);
      setCreatingContent(false);
    } catch (err) {
      setError(parseApiError(err, "İçerik oluşturulamadı."));
      setCreatingContent(false);
    }
  }, [
    tokenAvailable,
    apiClient,
    contentType,
    contentTitle,
    contentSource,
    contentFile,
    newPrerequisites,
    selectedCourse
  ]);

  const handleCreateMeeting = useCallback(async () => {
    if (!apiClient || !selectedCourse) return;
    setError(null);

    if (!liveRoomName.trim()) {
      setError("Oda adı gerekli.");
      return;
    }

    const token = readToken();
    if (!token) {
      setError("Token bulunamadi.");
      return;
    }

    setCreatingMeeting(true);
    try {
      const roomName = liveRoomName.trim().replace(/\s+/g, '-');
      let meetingUrl: string;
      let contentTitle: string;

      if (liveClassProvider === 'bbb') {
        // BBB: Get join URL from backend
        const bbbRes = await apiClient.post<{ url: string }>(
          '/bbb/join',
          { meetingID: roomName, meetingName: liveRoomName },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        meetingUrl = bbbRes.url;
        contentTitle = `BBB Ders: ${liveRoomName}`;
      } else {
        // Jitsi: Direct URL
        meetingUrl = `https://meet.jit.si/${roomName}`;
        contentTitle = `Canlı Ders: ${liveRoomName}`;
      }

      // 1. Save to Database as Content
      await apiClient.post(
        "/content",
        {
          type: "live_class",
          title: contentTitle,
          source: meetingUrl,
          courseId: selectedCourse.id,
          meta: { provider: liveClassProvider }
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // 2. Set Local URL for immediate "Join" button in form (optional UI feedback)
      setLiveMeetingUrl(meetingUrl);

      // 3. Refresh Content List
      const res = await apiClient.get<ContentResponse>(
        `/content?courseId=${selectedCourse.id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setContentItems(res.content);

      // Reset form
      setLiveRoomName("");

    } catch (err) {
      setError(parseApiError(err, "Toplantı oluşturulamadı."));
    } finally {
      setCreatingMeeting(false);
    }
  }, [apiClient, liveRoomName, liveClassProvider, selectedCourse]);

  const startEditContent = useCallback((item: Content) => {
    setEditingContentId(item.id);
    setEditContentType(item.type);
    setEditContentTitle(item.title);
    setEditContentSource(item.source ?? "");
    setEditContentFile(null);
    if (apiClient) {
      apiClient.get<Content[]>(`/api/modules/prerequisite/${item.id}`, { headers: { Authorization: `Bearer ${readToken()}` } })
        .then(res => setEditPrerequisites(res))
        .catch(err => console.error("Prerequisites fetch error", err));
    }
  }, [apiClient]);

  const cancelEditContent = useCallback(() => {
    setEditingContentId(null);
    setEditContentType(contentTypeOptions[0]);
    setEditContentTitle("");
    setEditContentSource("");
    setEditContentFile(null);
  }, []);

  const handleUpdateContent = useCallback(async () => {
    if (!apiClient || !editingContentId) {
      return;
    }
    setError(null);
    const token = readToken();
    if (!token) {
      setError("Token bulunamadi. Giris ekranindan tekrar login ol.");
      return;
    }
    const normalizedType = editContentType.trim().toLowerCase();
    if (!editContentTitle.trim() || !normalizedType) {
      setError("İçerik tipi ve başlığı gerekli.");
      return;
    }
    if (!contentTypeOptions.includes(normalizedType as (typeof contentTypeOptions)[number])) {
      setError("Geçersiz içerik tipi.");
      return;
    }
    if (!editContentSource.trim() && !editContentFile) {
      setError("Video/PDF icin kaynak URL veya dosya yuklemelisin.");
      return;
    }
    setUpdatingContentId(editingContentId);
    try {
      let finalSource = editContentSource.trim();
      if (editContentFile) {
        const formData = new FormData();
        formData.append("file", editContentFile);
        const uploadRes = await apiClient.post<{ url: string }>(
          "/content/upload",
          formData,
          {
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        );
        finalSource = uploadRes.url;
      }
      const response = await apiClient.patch<{ content: Content }>(
        `/content/${editingContentId}`,
        {
          type: normalizedType,
          title: editContentTitle.trim(),
          source: finalSource || undefined
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setContentItems((prev) =>
        prev.map((item) => (item.id === editingContentId ? response.content : item))
      );
      cancelEditContent();
    } catch (err) {
      setError(parseApiError(err, "İçerik güncellenemedi."));
    } finally {
      setUpdatingContentId(null);
    }
  }, [
    apiClient,
    cancelEditContent,
    editContentFile,
    editContentSource,
    editContentTitle,
    editContentType,
    editingContentId
  ]);

  const handleDeleteContent = useCallback(
    async (contentId: string) => {
      if (!apiClient) {
        return;
      }
      setError(null);
      const token = readToken();
      if (!token) {
        setError("Token bulunamadi. Giris ekranindan tekrar login ol.");
        return;
      }
      setDeletingContentId(contentId);
      try {
        await apiClient.del(`/content/${contentId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setContentItems((prev) => prev.filter((item) => item.id !== contentId));
      } catch (err) {
        setError(parseApiError(err, "İçerik silinemedi."));
      } finally {
        setDeletingContentId(null);
      }
    },
    [apiClient]
  );

  const handleCreateExam = useCallback(async () => {
    if (!apiClient) {
      return;
    }
    setError(null);
    if (!examTitle.trim()) {
      setError("Sınav başlığı gerekli.");
      return;
    }
    const token = readToken();
    if (!token) {
      setError("Token bulunamadi. Giris ekranindan tekrar login ol.");
      return;
    }
    setCreatingExam(true);
    try {
      await apiClient.post(
        "/exams",
        {
          title: examTitle.trim(),
          courseId: selectedCourse?.id,
          durationMinutes: examDuration.trim() ? parseInt(examDuration) : undefined,
          passThreshold: examPassThreshold.trim() ? parseInt(examPassThreshold) : undefined,
          startDate: examStartDate.trim() || undefined,
          endDate: examEndDate.trim() || undefined,
          maxAttempts: examMaxAttempts.trim() ? parseInt(examMaxAttempts) : 1,
          isDraft: examIsDraft,
          resultsVisibleAt: examResultsVisibleAt.trim() || undefined
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const res = await apiClient.get<ExamsResponse>("/exams", {
        headers: { Authorization: `Bearer ${token}` }
      });
      setExams(res.exams);
      setExamTitle("");
      setExamCourseId("");
      setExamDuration("");
      setExamPassThreshold("");
      setExamStartDate("");
      setExamEndDate("");
      setExamMaxAttempts("1");
      setExamIsDraft(true);
      setExamResultsVisibleAt("");
      setCreatingExam(false);
    } catch (err) {
      setError(parseApiError(err, "Sınav oluşturulamadı."));
      setCreatingExam(false);
    }
  }, [tokenAvailable, apiClient, examTitle, selectedCourse, examDuration, examPassThreshold, examStartDate, examEndDate]);

  const startEditExam = useCallback((exam: Exam) => {
    setEditingExamId(exam.id);
    setEditExamTitle(exam.title);
    setEditExamCourseId(exam.courseId ?? "");
    setEditExamDuration(exam.durationMinutes?.toString() ?? "");
    setEditExamPassThreshold(exam.passThreshold?.toString() ?? "");
    setEditExamStartDate(exam.startDate ?? "");
    setEditExamEndDate(exam.endDate ?? "");
    setEditExamMaxAttempts(exam.maxAttempts?.toString() ?? "1");
    setEditExamIsDraft(exam.isDraft ?? true);
    setEditExamResultsVisibleAt(exam.resultsVisibleAt ?? "");
    // Switch to Content tab where the edit form is located
    setActiveTab('content');
    // Scroll to form after a short delay
    setTimeout(() => {
      const formEl = document.querySelector('.form h3');
      if (formEl) formEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  }, []);

  const cancelEditExam = useCallback(() => {
    setEditingExamId(null);
    setEditExamTitle("");
    setEditExamCourseId("");
    setEditExamDuration("");
    setEditExamPassThreshold("");
    setEditExamStartDate("");
    setEditExamEndDate("");
    setEditExamMaxAttempts("1");
    setEditExamIsDraft(true);
    setEditExamResultsVisibleAt("");
  }, []);

  const handleUpdateExam = useCallback(async () => {
    if (!apiClient || !editingExamId) {
      return;
    }
    setError(null);
    const token = readToken();
    if (!token) {
      setError("Token bulunamadi. Giris ekranindan tekrar login ol.");
      return;
    }
    if (!editExamTitle.trim()) {
      setError("Sınav başlığı gerekli.");
      return;
    }
    setUpdatingExamId(editingExamId);
    try {
      const response = await apiClient.patch<{ exam: Exam }>(
        `/exams/${editingExamId}`,
        {
          title: editExamTitle.trim(),
          courseId: editExamCourseId.trim() || undefined,
          durationMinutes: editExamDuration.trim() ? parseInt(editExamDuration) : undefined,
          passThreshold: editExamPassThreshold.trim() ? parseInt(editExamPassThreshold) : undefined,
          startDate: editExamStartDate.trim() || undefined,
          endDate: editExamEndDate.trim() || undefined,
          maxAttempts: editExamMaxAttempts.trim() ? parseInt(editExamMaxAttempts) : undefined,
          isDraft: editExamIsDraft,
          resultsVisibleAt: editExamResultsVisibleAt.trim() || undefined
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setExams((prev) => prev.map((item) => (item.id === editingExamId ? response.exam : item)));
      cancelEditExam();
    } catch (err) {
      setError(parseApiError(err, "Sınav güncellenemedi."));
    } finally {
      setUpdatingExamId(null);
    }
  }, [apiClient, cancelEditExam, editExamCourseId, editExamTitle, editingExamId]);

  const handleDeleteExam = useCallback(
    async (examId: string) => {
      if (!apiClient) {
        return;
      }
      setError(null);
      const token = readToken();
      if (!token) {
        setError("Token bulunamadi. Giris ekranindan tekrar login ol.");
        return;
      }
      setDeletingExamId(examId);
      try {
        await apiClient.del(`/exams/${examId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setExams((prev) => prev.filter((item) => item.id !== examId));
      } catch (err) {
        setError(parseApiError(err, "Sınav silinemedi."));
      } finally {
        setDeletingExamId(null);
      }
    },
    [apiClient]
  );

  const addRubricItem = () => {
    setRubricItems([...rubricItems, { criteria: "", points: "", description: "" }]);
  };

  const updateRubricItem = (index: number, field: keyof typeof rubricItems[0], value: string) => {
    const next = [...rubricItems];
    next[index] = { ...next[index], [field]: value };
    setRubricItems(next);
  };

  const removeRubricItem = (index: number) => {
    setRubricItems(rubricItems.filter((_, i) => i !== index));
  };

  const addEditRubricItem = () => {
    setEditRubricItems([...editRubricItems, { criteria: "", points: "", description: "" }]);
  };

  const updateEditRubricItem = (index: number, field: keyof typeof editRubricItems[0], value: string) => {
    const next = [...editRubricItems];
    next[index] = { ...next[index], [field]: value };
    setEditRubricItems(next);
  };

  const removeEditRubricItem = (index: number) => {
    setEditRubricItems(editRubricItems.filter((_, i) => i !== index));
  };

  const handleCreateQuestion = useCallback(async () => {
    if (!apiClient) {
      return;
    }
    setError(null);
    if (!questionPrompt.trim() || !questionType.trim()) {
      setError("Soru metni ve tipi gerekli.");
      return;
    }
    const token = readToken();
    if (!token) {
      setError("Token bulunamadi. Giris ekranindan tekrar login ol.");
      return;
    }
    const optionsList = isChoiceQuestion(questionType)
      ? getOptionList(questionType, questionOptions)
      : [];
    if (
      isChoiceQuestion(questionType) &&
      questionType !== "true_false" &&
      optionsList.length < 2
    ) {
      setError("Secenekli sorular icin en az 2 secenek gir.");
      return;
    }
    if (
      questionType !== "multiple_select" &&
      questionType !== "true_false" &&
      questionAnswer.trim() &&
      !optionsList.includes(questionAnswer.trim())
    ) {
      setError("Dogru cevap seceneklerden biri olmali.");
      return;
    }
    if (questionType === "multiple_choice" && !questionAnswer.trim()) {
      setError("Dogru cevap sec.");
      return;
    }
    if (questionType === "multiple_select" && questionAnswerMulti.length < 1) {
      setError("En az bir dogru cevap sec.");
      return;
    }
    if (questionType === "true_false" && !questionAnswer.trim()) {
      setError("Dogru/Yanlis sec.");
      return;
    }
    let meta: QuestionMeta | undefined;
    if (questionType === "matching") {
      const pairs = matchingPairs
        .map((pair) => ({ left: pair.left.trim(), right: pair.right.trim() }))
        .filter((pair) => pair.left && pair.right);
      if (pairs.length < 1) {
        setError("Eslesme icin en az 1 cift gir.");
        return;
      }
      meta = { matchingPairs: pairs };
    }
    if (questionType === "ordering") {
      const items = orderingItems.map((item) => item.trim()).filter(Boolean);
      if (items.length < 2) {
        setError("Siralama icin en az 2 madde gir.");
        return;
      }
      meta = { orderingItems: items };
    }
    if (questionType === "fill_blank") {
      const blanks = blankAnswers
        .map((answers) => answers.map((answer) => answer.trim()).filter(Boolean))
        .filter((answers) => answers.length > 0);
      if (blanks.length < 1) {
        setError("Bosluk doldurma icin en az 1 bosluk gir.");
        return;
      }
      meta = { blankAnswers: blanks };
    }
    if (questionType === "short_answer") {
      const answers = shortAnswers.map((answer) => answer.trim()).filter(Boolean);
      if (answers.length < 1) {
        setError("Kisa cevap icin en az 1 cevap gir.");
        return;
      }
      meta = { shortAnswers: answers };
    }
    if (questionType === "long_answer") {
      meta = longAnswerGuide.trim() ? { longAnswerGuide: longAnswerGuide.trim() } : {};
      const rubric = rubricItems.filter(i => i.criteria && i.points).map(i => ({
        criteria: i.criteria,
        points: Number(i.points) || 0,
        description: i.description
      }));
      if (rubric.length) {
        meta = { ...meta, rubric };
      }
      if (Object.keys(meta).length === 0) meta = undefined;
    }
    if (questionType === "file_upload") {
      const allowedTypes = fileAllowedTypes.map((item) => item.trim()).filter(Boolean);
      const maxFiles = toNumberOrUndefined(fileMaxFiles);
      const maxSizeMb = toNumberOrUndefined(fileMaxSizeMb);
      if (fileMaxFiles.trim() && maxFiles === undefined) {
        setError("Maksimum dosya sayisi sayi olmali.");
        return;
      }
      if (fileMaxSizeMb.trim() && maxSizeMb === undefined) {
        setError("Maksimum boyut sayi olmali.");
        return;
      }
      meta = {
        fileUpload: {
          allowedTypes: allowedTypes.length ? allowedTypes : undefined,
          maxFiles,
          maxSizeMb
        }
      };
    }
    if (questionType === "calculation") {
      if (!calculationFormula.trim()) {
        setError("Hesaplama formulu gerekli.");
        return;
      }
      const variables = calculationVariables
        .map((item) => ({
          name: item.name.trim(),
          min: toNumberOrUndefined(item.min),
          max: toNumberOrUndefined(item.max),
          step: toNumberOrUndefined(item.step)
        }))
        .filter((item) => item.name);
      meta = {
        calculation: {
          formula: calculationFormula.trim(),
          variables: variables.length ? variables : undefined
        }
      };
    }
    if (questionType === "hotspot") {
      if (!hotspotImageUrl.trim()) {
        setError("Hotspot icin resim URL gerekli.");
        return;
      }
      const areas = hotspotAreas
        .map((area) => ({
          x: toNumberOrUndefined(area.x),
          y: toNumberOrUndefined(area.y),
          width: toNumberOrUndefined(area.width),
          height: toNumberOrUndefined(area.height)
        }))
        .filter(
          (area) =>
            area.x !== undefined &&
            area.y !== undefined &&
            area.width !== undefined &&
            area.height !== undefined
        ) as { x: number; y: number; width: number; height: number }[];
      if (areas.length < 1) {
        setError("Hotspot icin en az 1 alan gir.");
        return;
      }
      meta = { hotspot: { imageUrl: hotspotImageUrl.trim(), areas } };
    }
    if (questionType === "code") {
      const tests = codeTests
        .map((item) => ({ input: item.input.trim(), output: item.output.trim() }))
        .filter((item) => item.input && item.output);
      if (tests.length < 1) {
        setError("Kod sorusu icin en az 1 test gir.");
        return;
      }
      meta = {
        code: {
          language: codeLanguage.trim() || "javascript",
          starter: codeStarter.trim() || undefined,
          tests
        }
      };
    }
    const answerValue =
      questionType === "multiple_select"
        ? questionAnswerMulti.filter((item) => optionsList.includes(item))
        : questionAnswer.trim() || undefined;
    setCreatingQuestion(true);
    try {
      const response = await apiClient.post<{ question: Question }>(
        "/questions",
        {
          prompt: questionPrompt.trim(),
          type: questionType.trim(),
          examId: selectedExam?.id || questionExamId.trim() || undefined,
          options: optionsList.length ? optionsList : undefined,
          answer: answerValue,
          meta,
          points: questionPoints.trim() ? parseInt(questionPoints) : 10
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setQuestions((prev) => [response.question, ...prev]);
      setQuestionPrompt("");
      setQuestionType(defaultQuestionType);
      setQuestionOptions(normalizeOptionList());
      setQuestionAnswer("");
      setQuestionAnswerMulti([]);
      setQuestionExamId("");
    } catch (err) {
      setError(parseApiError(err, "Soru olusturulamadi."));
    } finally {
      setCreatingQuestion(false);
    }
  }, [
    apiClient,
    blankAnswers,
    calculationFormula,
    calculationVariables,
    codeLanguage,
    codeStarter,
    codeTests,
    fileAllowedTypes,
    fileMaxFiles,
    fileMaxSizeMb,
    hotspotAreas,
    hotspotImageUrl,
    longAnswerGuide,
    matchingPairs,
    orderingItems,
    questionAnswer,
    questionAnswerMulti,
    questionExamId,
    questionOptions,
    questionPrompt,
    questionType,
    shortAnswers
  ]);

  const startEditQuestion = useCallback((question: Question) => {
    setEditingQuestionId(question.id);
    setEditQuestionPrompt(question.prompt);
    setEditQuestionType(normalizeQuestionType(question.type));
    setEditQuestionOptions(normalizeOptionList(question.options));
    if (Array.isArray(question.answer)) {
      setEditQuestionAnswer("");
      setEditQuestionAnswerMulti(question.answer);
    } else {
      if (typeof question.answer === "boolean") {
        setEditQuestionAnswer(question.answer ? "Doğru" : "Yanlış");
      } else {
        setEditQuestionAnswer(question.answer ? String(question.answer) : "");
      }
      setEditQuestionAnswerMulti([]);
    }
    setEditQuestionExamId(question.examId ?? "");
    const meta = question.meta;
    setEditMatchingPairs(normalizePairs(meta?.matchingPairs));
    setEditOrderingItems(normalizeList(meta?.orderingItems, 2));
    setEditBlankAnswers(normalizeBlankAnswers(meta?.blankAnswers));
    setEditShortAnswers(normalizeList(meta?.shortAnswers, 1));
    setEditLongAnswerGuide(meta?.longAnswerGuide ?? "");
    if (meta?.rubric) {
      setEditRubricItems(meta.rubric.map(r => ({
        criteria: r.criteria,
        points: String(r.points),
        description: r.description || ""
      })));
    } else {
      setEditRubricItems([{ criteria: "", points: "", description: "" }]);
    }
    setEditFileAllowedTypes(normalizeList(meta?.fileUpload?.allowedTypes, 1));
    setEditFileMaxFiles(
      meta?.fileUpload?.maxFiles !== undefined ? String(meta.fileUpload.maxFiles) : ""
    );
    setEditFileMaxSizeMb(
      meta?.fileUpload?.maxSizeMb !== undefined ? String(meta.fileUpload.maxSizeMb) : ""
    );
    setEditCalculationFormula(meta?.calculation?.formula ?? "");
    setEditCalculationVariables(
      normalizeVariables(
        meta?.calculation?.variables?.map((item) => ({
          name: item.name ?? "",
          min: item.min !== undefined ? String(item.min) : "",
          max: item.max !== undefined ? String(item.max) : "",
          step: item.step !== undefined ? String(item.step) : ""
        }))
      )
    );
    setEditHotspotImageUrl(meta?.hotspot?.imageUrl ?? "");
    setEditHotspotAreas(
      normalizeHotspotAreas(
        meta?.hotspot?.areas?.map((area) => ({
          x: area.x !== undefined ? String(area.x) : "",
          y: area.y !== undefined ? String(area.y) : "",
          width: area.width !== undefined ? String(area.width) : "",
          height: area.height !== undefined ? String(area.height) : ""
        }))
      )
    );
    setEditCodeLanguage(meta?.code?.language ?? "javascript");
    setEditCodeStarter(meta?.code?.starter ?? "");
    setEditCodeTests(
      normalizeCodeTests(
        meta?.code?.tests?.map((test) => ({
          input: test.input ?? "",
          output: test.output ?? ""
        }))
      )
    );
  }, []);

  const cancelEditQuestion = useCallback(() => {
    setEditingQuestionId(null);
    setEditQuestionPrompt("");
    setEditQuestionType(defaultQuestionType);
    setEditQuestionOptions(normalizeOptionList());
    setEditQuestionAnswer("");
    setEditQuestionAnswerMulti([]);
    setEditQuestionExamId("");
    setEditMatchingPairs(normalizePairs());
    setEditOrderingItems(normalizeList(undefined, 2));
    setEditBlankAnswers(normalizeBlankAnswers());
    setEditShortAnswers(normalizeList(undefined, 1));
    setEditLongAnswerGuide("");
    setEditFileAllowedTypes(normalizeList(undefined, 1));
    setEditFileMaxFiles("");
    setEditFileMaxSizeMb("");
    setEditCalculationFormula("");
    setEditCalculationVariables(normalizeVariables());
    setEditHotspotImageUrl("");
    setEditHotspotAreas(normalizeHotspotAreas());
    setEditCodeLanguage("javascript");
    setEditCodeStarter("");
    setEditCodeTests(normalizeCodeTests());
  }, []);

  const handleUpdateQuestion = useCallback(async () => {
    if (!apiClient || !editingQuestionId) {
      return;
    }
    setError(null);
    const token = readToken();
    if (!token) {
      setError("Token bulunamadi. Giris ekranindan tekrar login ol.");
      return;
    }
    if (!editQuestionPrompt.trim() || !editQuestionType.trim()) {
      setError("Soru metni ve tipi gerekli.");
      return;
    }
    const editOptionsList = isChoiceQuestion(editQuestionType)
      ? getOptionList(editQuestionType, editQuestionOptions)
      : [];
    if (
      isChoiceQuestion(editQuestionType) &&
      editQuestionType !== "true_false" &&
      editOptionsList.length < 2
    ) {
      setError("Secenekli sorular icin en az 2 secenek gir.");
      return;
    }
    if (
      editQuestionType !== "multiple_select" &&
      editQuestionType !== "true_false" &&
      editQuestionAnswer.trim() &&
      !editOptionsList.includes(editQuestionAnswer.trim())
    ) {
      setError("Dogru cevap seceneklerden biri olmali.");
      return;
    }
    if (editQuestionType === "multiple_choice" && !editQuestionAnswer.trim()) {
      setError("Dogru cevap sec.");
      return;
    }
    if (editQuestionType === "multiple_select" && editQuestionAnswerMulti.length < 1) {
      setError("En az bir dogru cevap sec.");
      return;
    }
    if (editQuestionType === "true_false" && !editQuestionAnswer.trim()) {
      setError("Dogru/Yanlis sec.");
      return;
    }
    let editMeta: QuestionMeta | undefined;
    if (editQuestionType === "matching") {
      const pairs = editMatchingPairs
        .map((pair) => ({ left: pair.left.trim(), right: pair.right.trim() }))
        .filter((pair) => pair.left && pair.right);
      if (pairs.length < 1) {
        setError("Eslesme icin en az 1 cift gir.");
        return;
      }
      editMeta = { matchingPairs: pairs };
    }
    if (editQuestionType === "ordering") {
      const items = editOrderingItems.map((item) => item.trim()).filter(Boolean);
      if (items.length < 2) {
        setError("Siralama icin en az 2 madde gir.");
        return;
      }
      editMeta = { orderingItems: items };
    }
    if (editQuestionType === "fill_blank") {
      const blanks = editBlankAnswers
        .map((answers) => answers.map((answer) => answer.trim()).filter(Boolean))
        .filter((answers) => answers.length > 0);
      if (blanks.length < 1) {
        setError("Bosluk doldurma icin en az 1 bosluk gir.");
        return;
      }
      editMeta = { blankAnswers: blanks };
    }
    if (editQuestionType === "short_answer") {
      const answers = editShortAnswers.map((answer) => answer.trim()).filter(Boolean);
      if (answers.length < 1) {
        setError("Kisa cevap icin en az 1 cevap gir.");
        return;
      }
      editMeta = { shortAnswers: answers };
    }
    if (editQuestionType === "long_answer") {
      editMeta = editLongAnswerGuide.trim()
        ? { longAnswerGuide: editLongAnswerGuide.trim() }
        : undefined;
    }
    if (editQuestionType === "file_upload") {
      const allowedTypes = editFileAllowedTypes.map((item) => item.trim()).filter(Boolean);
      const maxFiles = toNumberOrUndefined(editFileMaxFiles);
      const maxSizeMb = toNumberOrUndefined(editFileMaxSizeMb);
      if (editFileMaxFiles.trim() && maxFiles === undefined) {
        setError("Maksimum dosya sayisi sayi olmali.");
        return;
      }
      if (editFileMaxSizeMb.trim() && maxSizeMb === undefined) {
        setError("Maksimum boyut sayi olmali.");
        return;
      }
      editMeta = {
        fileUpload: {
          allowedTypes: allowedTypes.length ? allowedTypes : undefined,
          maxFiles,
          maxSizeMb
        }
      };
    }
    if (editQuestionType === "calculation") {
      if (!editCalculationFormula.trim()) {
        setError("Hesaplama formulu gerekli.");
        return;
      }
      const variables = editCalculationVariables
        .map((item) => ({
          name: item.name.trim(),
          min: toNumberOrUndefined(item.min),
          max: toNumberOrUndefined(item.max),
          step: toNumberOrUndefined(item.step)
        }))
        .filter((item) => item.name);
      editMeta = {
        calculation: {
          formula: editCalculationFormula.trim(),
          variables: variables.length ? variables : undefined
        }
      };
    }
    if (editQuestionType === "hotspot") {
      if (!editHotspotImageUrl.trim()) {
        setError("Hotspot icin resim URL gerekli.");
        return;
      }
      const areas = editHotspotAreas
        .map((area) => ({
          x: toNumberOrUndefined(area.x),
          y: toNumberOrUndefined(area.y),
          width: toNumberOrUndefined(area.width),
          height: toNumberOrUndefined(area.height)
        }))
        .filter(
          (area) =>
            area.x !== undefined &&
            area.y !== undefined &&
            area.width !== undefined &&
            area.height !== undefined
        ) as { x: number; y: number; width: number; height: number }[];
      if (areas.length < 1) {
        setError("Hotspot icin en az 1 alan gir.");
        return;
      }
      editMeta = { hotspot: { imageUrl: editHotspotImageUrl.trim(), areas } };
    }
    if (editQuestionType === "code") {
      const tests = editCodeTests
        .map((item) => ({ input: item.input.trim(), output: item.output.trim() }))
        .filter((item) => item.input && item.output);
      if (tests.length < 1) {
        setError("Kod sorusu icin en az 1 test gir.");
        return;
      }
      editMeta = {
        code: {
          language: editCodeLanguage.trim() || "javascript",
          starter: editCodeStarter.trim() || undefined,
          tests
        }
      };
    }
    const editAnswerValue =
      editQuestionType === "multiple_select"
        ? editQuestionAnswerMulti.filter((item) => editOptionsList.includes(item))
        : editQuestionAnswer.trim() || undefined;
    setUpdatingQuestionId(editingQuestionId);
    try {
      const response = await apiClient.patch<{ question: Question }>(
        `/questions/${editingQuestionId}`,
        {
          prompt: editQuestionPrompt.trim(),
          type: editQuestionType.trim(),
          examId: editQuestionExamId.trim() || undefined,
          options: editOptionsList.length ? editOptionsList : undefined,
          answer: editAnswerValue,
          meta: editMeta
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setQuestions((prev) =>
        prev.map((item) => (item.id === editingQuestionId ? response.question : item))
      );
      cancelEditQuestion();
    } catch (err) {
      setError(parseApiError(err, "Soru guncellenemedi."));
    } finally {
      setUpdatingQuestionId(null);
    }
  }, [
    apiClient,
    cancelEditQuestion,
    editBlankAnswers,
    editCalculationFormula,
    editCalculationVariables,
    editCodeLanguage,
    editCodeStarter,
    editCodeTests,
    editFileAllowedTypes,
    editFileMaxFiles,
    editFileMaxSizeMb,
    editHotspotAreas,
    editHotspotImageUrl,
    editLongAnswerGuide,
    editMatchingPairs,
    editOrderingItems,
    editQuestionAnswer,
    editQuestionAnswerMulti,
    editQuestionExamId,
    editQuestionOptions,
    editQuestionPrompt,
    editQuestionType,
    editingQuestionId,
    editShortAnswers
  ]);

  const updateQuestionOption = useCallback(
    (index: number, value: string) => {
      setQuestionOptions((prev) => {
        const next = [...prev];
        const previous = next[index] ?? "";
        next[index] = value;
        if (isEditableChoiceQuestion(questionType)) {
          const cleaned = buildOptionList(next);
          if (questionType === "multiple_select") {
            setQuestionAnswerMulti((current) =>
              current
                .map((item) => (item === previous ? value : item))
                .filter((item) => cleaned.includes(item))
            );
          } else {
            setQuestionAnswer((current) => {
              if (current === previous) {
                return value;
              }
              if (current && !cleaned.includes(current)) {
                return "";
              }
              return current;
            });
          }
        }
        return next;
      });
    },
    [questionType]
  );

  const addQuestionOption = useCallback(() => {
    setQuestionOptions((prev) => [...prev, ""]);
  }, []);

  const removeQuestionOption = useCallback((index: number) => {
    setQuestionOptions((prev) => {
      if (prev.length <= 2) {
        return prev;
      }
      const removed = prev[index];
      const next = prev.filter((_item, idx) => idx !== index);
      setQuestionAnswer((current) => (current === removed ? "" : current));
      setQuestionAnswerMulti((current) => current.filter((item) => item !== removed));
      return next;
    });
  }, []);

  const toggleQuestionAnswerMulti = useCallback((option: string) => {
    setQuestionAnswerMulti((prev) =>
      prev.includes(option) ? prev.filter((item) => item !== option) : [...prev, option]
    );
  }, []);

  const updateEditQuestionOption = useCallback(
    (index: number, value: string) => {
      setEditQuestionOptions((prev) => {
        const next = [...prev];
        const previous = next[index] ?? "";
        next[index] = value;
        if (isEditableChoiceQuestion(editQuestionType)) {
          const cleaned = buildOptionList(next);
          if (editQuestionType === "multiple_select") {
            setEditQuestionAnswerMulti((current) =>
              current
                .map((item) => (item === previous ? value : item))
                .filter((item) => cleaned.includes(item))
            );
          } else {
            setEditQuestionAnswer((current) => {
              if (current === previous) {
                return value;
              }
              if (current && !cleaned.includes(current)) {
                return "";
              }
              return current;
            });
          }
        }
        return next;
      });
    },
    [editQuestionType]
  );

  const addEditQuestionOption = useCallback(() => {
    setEditQuestionOptions((prev) => [...prev, ""]);
  }, []);

  const removeEditQuestionOption = useCallback((index: number) => {
    setEditQuestionOptions((prev) => {
      if (prev.length <= 2) {
        return prev;
      }
      const removed = prev[index];
      const next = prev.filter((_item, idx) => idx !== index);
      setEditQuestionAnswer((current) => (current === removed ? "" : current));
      setEditQuestionAnswerMulti((current) => current.filter((item) => item !== removed));
      return next;
    });
  }, []);

  const toggleEditQuestionAnswerMulti = useCallback((option: string) => {
    setEditQuestionAnswerMulti((prev) =>
      prev.includes(option) ? prev.filter((item) => item !== option) : [...prev, option]
    );
  }, []);

  const updateMatchingPair = useCallback((index: number, field: "left" | "right", value: string) => {
    setMatchingPairs((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }, []);

  const addMatchingPair = useCallback(() => {
    setMatchingPairs((prev) => [...prev, { left: "", right: "" }]);
  }, []);

  const removeMatchingPair = useCallback((index: number) => {
    setMatchingPairs((prev) => (prev.length <= 1 ? prev : prev.filter((_item, idx) => idx !== index)));
  }, []);

  const updateOrderingItem = useCallback((index: number, value: string) => {
    setOrderingItems((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }, []);

  const addOrderingItem = useCallback(() => {
    setOrderingItems((prev) => [...prev, ""]);
  }, []);

  const moveOrderingItem = useCallback((from: number, to: number) => {
    setOrderingItems((prev) => {
      if (to < 0 || to >= prev.length) {
        return prev;
      }
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  }, []);

  const removeOrderingItem = useCallback((index: number) => {
    setOrderingItems((prev) => (prev.length <= 2 ? prev : prev.filter((_item, idx) => idx !== index)));
  }, []);

  const updateBlankAnswer = useCallback(
    (blankIndex: number, answerIndex: number, value: string) => {
      setBlankAnswers((prev) => {
        const next = prev.map((answers) => [...answers]);
        next[blankIndex][answerIndex] = value;
        return next;
      });
    },
    []
  );

  const addBlank = useCallback(() => {
    setBlankAnswers((prev) => [...prev, normalizeList(undefined, 1)]);
  }, []);

  const removeBlank = useCallback((blankIndex: number) => {
    setBlankAnswers((prev) =>
      prev.length <= 1 ? prev : prev.filter((_item, idx) => idx !== blankIndex)
    );
  }, []);

  const addBlankAnswer = useCallback((blankIndex: number) => {
    setBlankAnswers((prev) => {
      const next = prev.map((answers) => [...answers]);
      next[blankIndex].push("");
      return next;
    });
  }, []);

  const removeBlankAnswer = useCallback((blankIndex: number, answerIndex: number) => {
    setBlankAnswers((prev) => {
      const next = prev.map((answers) => [...answers]);
      if (next[blankIndex].length <= 1) {
        return next;
      }
      next[blankIndex] = next[blankIndex].filter((_item, idx) => idx !== answerIndex);
      return next;
    });
  }, []);

  const updateShortAnswer = useCallback((index: number, value: string) => {
    setShortAnswers((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }, []);

  const addShortAnswer = useCallback(() => {
    setShortAnswers((prev) => [...prev, ""]);
  }, []);

  const removeShortAnswer = useCallback((index: number) => {
    setShortAnswers((prev) => (prev.length <= 1 ? prev : prev.filter((_item, idx) => idx !== index)));
  }, []);

  const updateFileAllowedType = useCallback((index: number, value: string) => {
    setFileAllowedTypes((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }, []);

  const addFileAllowedType = useCallback(() => {
    setFileAllowedTypes((prev) => [...prev, ""]);
  }, []);

  const removeFileAllowedType = useCallback((index: number) => {
    setFileAllowedTypes((prev) =>
      prev.length <= 1 ? prev : prev.filter((_item, idx) => idx !== index)
    );
  }, []);

  const updateCalculationVariable = useCallback(
    (index: number, field: "name" | "min" | "max" | "step", value: string) => {
      setCalculationVariables((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], [field]: value };
        return next;
      });
    },
    []
  );

  const addCalculationVariable = useCallback(() => {
    setCalculationVariables((prev) => [...prev, { name: "", min: "", max: "", step: "" }]);
  }, []);

  const removeCalculationVariable = useCallback((index: number) => {
    setCalculationVariables((prev) =>
      prev.length <= 1 ? prev : prev.filter((_item, idx) => idx !== index)
    );
  }, []);

  const updateHotspotArea = useCallback(
    (index: number, field: "x" | "y" | "width" | "height", value: string) => {
      setHotspotAreas((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], [field]: value };
        return next;
      });
    },
    []
  );

  const addHotspotArea = useCallback(() => {
    setHotspotAreas((prev) => [...prev, { x: "", y: "", width: "", height: "" }]);
  }, []);

  const removeHotspotArea = useCallback((index: number) => {
    setHotspotAreas((prev) =>
      prev.length <= 1 ? prev : prev.filter((_item, idx) => idx !== index)
    );
  }, []);

  const updateCodeTest = useCallback(
    (index: number, field: "input" | "output", value: string) => {
      setCodeTests((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], [field]: value };
        return next;
      });
    },
    []
  );

  const addCodeTest = useCallback(() => {
    setCodeTests((prev) => [...prev, { input: "", output: "" }]);
  }, []);

  const removeCodeTest = useCallback((index: number) => {
    setCodeTests((prev) => (prev.length <= 1 ? prev : prev.filter((_item, idx) => idx !== index)));
  }, []);

  const updateEditMatchingPair = useCallback(
    (index: number, field: "left" | "right", value: string) => {
      setEditMatchingPairs((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], [field]: value };
        return next;
      });
    },
    []
  );

  const addEditMatchingPair = useCallback(() => {
    setEditMatchingPairs((prev) => [...prev, { left: "", right: "" }]);
  }, []);

  const removeEditMatchingPair = useCallback((index: number) => {
    setEditMatchingPairs((prev) =>
      prev.length <= 1 ? prev : prev.filter((_item, idx) => idx !== index)
    );
  }, []);

  const updateEditOrderingItem = useCallback((index: number, value: string) => {
    setEditOrderingItems((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }, []);

  const addEditOrderingItem = useCallback(() => {
    setEditOrderingItems((prev) => [...prev, ""]);
  }, []);

  const moveEditOrderingItem = useCallback((from: number, to: number) => {
    setEditOrderingItems((prev) => {
      if (to < 0 || to >= prev.length) {
        return prev;
      }
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  }, []);

  const removeEditOrderingItem = useCallback((index: number) => {
    setEditOrderingItems((prev) =>
      prev.length <= 2 ? prev : prev.filter((_item, idx) => idx !== index)
    );
  }, []);

  const updateEditBlankAnswer = useCallback(
    (blankIndex: number, answerIndex: number, value: string) => {
      setEditBlankAnswers((prev) => {
        const next = prev.map((answers) => [...answers]);
        next[blankIndex][answerIndex] = value;
        return next;
      });
    },
    []
  );

  const addEditBlank = useCallback(() => {
    setEditBlankAnswers((prev) => [...prev, normalizeList(undefined, 1)]);
  }, []);

  const removeEditBlank = useCallback((blankIndex: number) => {
    setEditBlankAnswers((prev) =>
      prev.length <= 1 ? prev : prev.filter((_item, idx) => idx !== blankIndex)
    );
  }, []);

  const addEditBlankAnswer = useCallback((blankIndex: number) => {
    setEditBlankAnswers((prev) => {
      const next = prev.map((answers) => [...answers]);
      next[blankIndex].push("");
      return next;
    });
  }, []);

  const removeEditBlankAnswer = useCallback((blankIndex: number, answerIndex: number) => {
    setEditBlankAnswers((prev) => {
      const next = prev.map((answers) => [...answers]);
      if (next[blankIndex].length <= 1) {
        return next;
      }
      next[blankIndex] = next[blankIndex].filter((_item, idx) => idx !== answerIndex);
      return next;
    });
  }, []);

  const updateEditShortAnswer = useCallback((index: number, value: string) => {
    setEditShortAnswers((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }, []);

  const addEditShortAnswer = useCallback(() => {
    setEditShortAnswers((prev) => [...prev, ""]);
  }, []);

  const removeEditShortAnswer = useCallback((index: number) => {
    setEditShortAnswers((prev) =>
      prev.length <= 1 ? prev : prev.filter((_item, idx) => idx !== index)
    );
  }, []);

  const updateEditFileAllowedType = useCallback((index: number, value: string) => {
    setEditFileAllowedTypes((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }, []);

  const addEditFileAllowedType = useCallback(() => {
    setEditFileAllowedTypes((prev) => [...prev, ""]);
  }, []);

  const removeEditFileAllowedType = useCallback((index: number) => {
    setEditFileAllowedTypes((prev) =>
      prev.length <= 1 ? prev : prev.filter((_item, idx) => idx !== index)
    );
  }, []);

  const updateEditCalculationVariable = useCallback(
    (index: number, field: "name" | "min" | "max" | "step", value: string) => {
      setEditCalculationVariables((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], [field]: value };
        return next;
      });
    },
    []
  );

  const addEditCalculationVariable = useCallback(() => {
    setEditCalculationVariables((prev) => [...prev, { name: "", min: "", max: "", step: "" }]);
  }, []);

  const removeEditCalculationVariable = useCallback((index: number) => {
    setEditCalculationVariables((prev) =>
      prev.length <= 1 ? prev : prev.filter((_item, idx) => idx !== index)
    );
  }, []);

  const updateEditHotspotArea = useCallback(
    (index: number, field: "x" | "y" | "width" | "height", value: string) => {
      setEditHotspotAreas((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], [field]: value };
        return next;
      });
    },
    []
  );

  const addEditHotspotArea = useCallback(() => {
    setEditHotspotAreas((prev) => [...prev, { x: "", y: "", width: "", height: "" }]);
  }, []);

  const removeEditHotspotArea = useCallback((index: number) => {
    setEditHotspotAreas((prev) =>
      prev.length <= 1 ? prev : prev.filter((_item, idx) => idx !== index)
    );
  }, []);

  const updateEditCodeTest = useCallback(
    (index: number, field: "input" | "output", value: string) => {
      setEditCodeTests((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], [field]: value };
        return next;
      });
    },
    []
  );

  const addEditCodeTest = useCallback(() => {
    setEditCodeTests((prev) => [...prev, { input: "", output: "" }]);
  }, []);

  const removeEditCodeTest = useCallback((index: number) => {
    setEditCodeTests((prev) => (prev.length <= 1 ? prev : prev.filter((_item, idx) => idx !== index)));
  }, []);

  const handleEditQuestionTypeChange = useCallback((nextType: QuestionType) => {
    setEditQuestionType(nextType);
    setEditQuestionOptions(normalizeOptionList());
    setEditQuestionAnswer(nextType === "true_false" ? trueFalseOptions[0] : "");
    setEditQuestionAnswerMulti([]);
    setEditMatchingPairs(normalizePairs());
    setEditOrderingItems(normalizeList(undefined, 2));
    setEditBlankAnswers(normalizeBlankAnswers());
    setEditShortAnswers(normalizeList(undefined, 1));
    setEditLongAnswerGuide("");
    setEditFileAllowedTypes(normalizeList(undefined, 1));
    setEditFileMaxFiles("");
    setEditFileMaxSizeMb("");
    setEditCalculationFormula("");
    setEditCalculationVariables(normalizeVariables());
    setEditHotspotImageUrl("");
    setEditHotspotAreas(normalizeHotspotAreas());
    setEditCodeLanguage("javascript");
    setEditCodeStarter("");
    setEditCodeTests(normalizeCodeTests());
  }, []);

  const questionOptionList = getOptionList(questionType, questionOptions);
  const editQuestionOptionList = getOptionList(editQuestionType, editQuestionOptions);

  const handleDeleteQuestion = useCallback(
    async (questionId: string) => {
      if (!apiClient) {
        return;
      }
      setError(null);
      const token = readToken();
      if (!token) {
        setError(t('session_expired'));
        return;
      }
      setDeletingQuestionId(questionId);
      try {
        await apiClient.del(`/questions/${questionId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setQuestions((prev) => prev.filter((item) => item.id !== questionId));
      } catch (err) {
        setError(parseApiError(err, t('question_delete_error')));
      } finally {
        setDeletingQuestionId(null);
      }
    },
    [apiClient]
  );



  return (
    <main style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Sidebar Navigation */}
      <aside style={{
        width: '280px',
        background: 'var(--card)',
        borderRight: '1px solid var(--border)',
        padding: '24px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        position: 'fixed',
        left: 0,
        top: 0,
        bottom: 0,
        overflowY: 'auto',
        zIndex: 50
      }}>
        <div style={{ color: 'var(--accent)', fontWeight: 800, fontSize: '1.5rem', marginBottom: '32px', padding: '0 12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>📚 {t('menu_title')}</span>
        </div>

        {/* Navigation Items */}
        <button
          onClick={() => { setActiveSection('courses'); setViewMode('list'); }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '14px 16px',
            borderRadius: '12px',
            border: 'none',
            background: activeSection === 'courses' ? 'var(--accent)' : 'transparent',
            color: activeSection === 'courses' ? '#fff' : 'var(--ink-light)',
            cursor: 'pointer',
            fontSize: '1rem',
            fontWeight: 600,
            textAlign: 'left',
            transition: 'all 0.2s'
          }}
        >
          📖 {t('courses')}
        </button>

        {canWrite && (
          <button
            onClick={() => setActiveSection('omr')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '14px 16px',
              borderRadius: '12px',
              border: 'none',
              background: activeSection === 'omr' ? 'var(--accent)' : 'transparent',
              color: activeSection === 'omr' ? '#fff' : 'var(--ink-light)',
              cursor: 'pointer',
              fontSize: '1rem',
              fontWeight: 600,
              textAlign: 'left',
              transition: 'all 0.2s'
            }}
          >
            📊 {t('omr_scan_title')}
          </button>
        )}

        {isAdmin && (
          <button
            onClick={() => setActiveSection('users')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '14px 16px',
              borderRadius: '12px',
              border: 'none',
              background: activeSection === 'users' ? 'var(--accent)' : 'transparent',
              color: activeSection === 'users' ? '#fff' : 'var(--ink-light)',
              cursor: 'pointer',
              fontSize: '1rem',
              fontWeight: 600,
              textAlign: 'left',
              transition: 'all 0.2s'
            }}
          >
            👥 {t('users')}
          </button>
        )}

        {/* Course-level menu items - only visible when a course is selected */}
        {selectedCourse && canWrite && (
          <>
            <div style={{ height: '1px', background: 'var(--border)', margin: '16px 0' }} />
            <div style={{ padding: '0 16px', marginBottom: '8px' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--ink-light)', textTransform: 'uppercase', fontWeight: 600 }}>
                {selectedCourse.title}
              </span>
            </div>
            <button
              onClick={() => setActiveSection('rubrics')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '14px 16px',
                borderRadius: '12px',
                border: 'none',
                background: activeSection === 'rubrics' ? 'var(--accent)' : 'transparent',
                color: activeSection === 'rubrics' ? '#fff' : 'var(--ink-light)',
                cursor: 'pointer',
                fontSize: '1rem',
                fontWeight: 600,
                textAlign: 'left',
                transition: 'all 0.2s'
              }}
            >
              📋 {t('rubrics')}
            </button>
            <button
              onClick={() => setActiveSection('gradebook')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '14px 16px',
                borderRadius: '12px',
                border: 'none',
                background: activeSection === 'gradebook' ? 'var(--accent)' : 'transparent',
                color: activeSection === 'gradebook' ? '#fff' : 'var(--ink-light)',
                cursor: 'pointer',
                fontSize: '1rem',
                fontWeight: 600,
                textAlign: 'left',
                transition: 'all 0.2s'
              }}
            >
              📊 {t('gradebook')}
            </button>
          </>
        )}

        {/* Divider */}
        <div style={{ height: '1px', background: 'var(--border)', margin: '16px 0' }} />

        {/* Settings Link */}
        <Link
          href="/settings"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '14px 16px',
            borderRadius: '12px',
            color: 'var(--ink-light)',
            fontSize: '1rem',
            fontWeight: 600,
            textDecoration: 'none',
            transition: 'all 0.2s'
          }}
        >
          ⚙️ {t('settings')}
        </Link>

        {/* Logout */}
        <button
          onClick={() => {
            localStorage.removeItem('lms_token');
            localStorage.removeItem('lms_refresh_token');
            localStorage.removeItem('lms_user');
            window.location.href = '/';
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '14px 16px',
            borderRadius: '12px',
            border: 'none',
            background: 'transparent',
            color: '#ef4444',
            cursor: 'pointer',
            fontSize: '1rem',
            fontWeight: 600,
            textAlign: 'left',
            marginTop: 'auto'
          }}
        >
          🚪 {t('logout')}
        </button>

        {/* User Badge */}
        {userRole && (
          <div style={{
            padding: '12px 16px',
            background: 'var(--bg)',
            borderRadius: '12px',
            color: 'var(--ink)',
            fontSize: '0.875rem',
            marginTop: '12px'
          }}>
            <div style={{ color: 'var(--ink-light)', fontSize: '0.75rem' }}>{t('role')}</div>
            <strong>{userRole}</strong>
          </div>
        )}
      </aside>

      {/* Main Content */}
      {/* Main Content */}
      <div style={{
        marginLeft: '280px',
        flex: 1,
        padding: '32px',
        minHeight: '100vh',
        background: 'var(--bg)'
      }}>
        {!tokenAvailable ? (
          <div className="error" style={{ marginTop: '16px' }}>
            {t('session_expired')} <a href="/">{t('return_to_login')}</a>
          </div>
        ) : null}
        {error ? <div className="error" style={{ marginTop: '16px' }}>{t(error)}</div> : null}

        {/* OMR Section */}
        {activeSection === 'omr' && canWrite && <OmrPanel token={currentToken} />}

        {/* Rubrics Section */}
        {activeSection === 'rubrics' && canWrite && (
          <div className="card">
            <h2 style={{ marginBottom: '24px' }}>{t('rubrics')}</h2>
            <RubricEditor
              courseId={selectedCourse?.id || ''}
              token={currentToken}
              apiBaseUrl={apiBaseUrl || ''}
              onClose={() => setActiveSection('courses')}
            />
          </div>
        )}

        {/* Gradebook Section */}
        {activeSection === 'gradebook' && canWrite && (
          <div className="card">
            <h2 style={{ marginBottom: '24px' }}>{t('gradebook')}</h2>
            <Gradebook
              courseId={selectedCourse?.id || ''}
              role={userRole || 'student'}
              token={currentToken}
              apiBaseUrl={apiBaseUrl || ''}
            />
          </div>
        )}

        {/* Users Section */}
        {activeSection === 'users' && isAdmin && (
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ margin: 0 }}>{t('users')}</h2>
              <span className="badge" style={{ background: 'var(--border)', color: 'var(--ink)' }}>
                {users.length} {t('user_count')}
              </span>
            </div>

            {users.length ? (
              <ul>
                {users.map((user) => (
                  <li key={user.id}>
                    <strong>{user.username}</strong> - {user.role}
                    <div className="meta">
                      <button
                        className="btn"
                        type="button"
                        onClick={() => startEditUser(user)}
                        disabled={updatingUserId === user.id || deletingUserId === user.id}
                      >
                        {t('edit')}
                      </button>
                      <button
                        className="btn"
                        type="button"
                        onClick={() => handleDeleteUser(user.id)}
                        disabled={deletingUserId === user.id}
                      >
                        {deletingUserId === user.id ? t('deleting') : t('delete')}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="meta">{t('no_users_yet')}</p>
            )}

            <div className="form">
              <input
                className="input"
                placeholder={t('username_placeholder')}
                value={newUserName}
                onChange={(event) => setNewUserName(event.target.value)}
              />
              <input
                className="input"
                placeholder={t('email_required')}
                value={newUserEmail}
                onChange={(event) => setNewUserEmail(event.target.value)}
                type="email"
                required
              />
              <input
                className="input"
                placeholder={t('password_placeholder')}
                type="password"
                value={newUserPassword}
                onChange={(event) => setNewUserPassword(event.target.value)}
              />
              <select
                className="input"
                value={newUserRole}
                onChange={(event) => setNewUserRole(event.target.value as Role)}
              >
                {roleOptions.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
              <button
                className="btn"
                type="button"
                onClick={handleCreateUser}
                disabled={creatingUser}
              >
                {creatingUser ? t("saving") : t("create_user")}
              </button>
            </div>

            {editingUserId ? (
              <div className="form">
                <input
                  className="input"
                  placeholder={t('username_placeholder')}
                  value={editUserName}
                  onChange={(event) => setEditUserName(event.target.value)}
                />
                <input
                  className="input"
                  placeholder={t('email_required')}
                  value={editUserEmail}
                  onChange={(event) => setEditUserEmail(event.target.value)}
                  type="email"
                  required
                />
                <input
                  className="input"
                  placeholder={t('new_password_optional')}
                  type="password"
                  value={editUserPassword}
                  onChange={(event) => setEditUserPassword(event.target.value)}
                />
                <select
                  className="input"
                  value={editUserRole}
                  onChange={(event) => setEditUserRole(event.target.value as Role)}
                >
                  {roleOptions.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
                <button
                  className="btn"
                  type="button"
                  onClick={handleUpdateUser}
                  disabled={updatingUserId === editingUserId}
                >
                  {updatingUserId === editingUserId ? t('updating') : t('update_user')}
                </button>
                <button className="btn" type="button" onClick={cancelEditUser}>
                  {t('cancel')}
                </button>
              </div>
            ) : null}
          </div>
        )}

        {/* Course Detail Section */}
        {activeSection === 'courses' && viewMode === 'detail' && (
          <div style={{ marginBottom: '16px' }}>
            <button
              className="btn btn-ghost"
              onClick={() => { setViewMode('list'); setSelectedCourse(null); }}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: 0, fontSize: '1.1rem', fontWeight: 600, color: 'var(--ink-light)' }}
            >
              ← {t('return_course_list')}
            </button>
            {selectedCourse?.description && selectedCourse.description !== '<p><br></p>' && (
              <div
                style={{ color: 'var(--ink-light)', marginBottom: '16px' }}
                dangerouslySetInnerHTML={{ __html: selectedCourse.description }}
              />
            )}

            {/* Mattermost / Chat Button */}
            {selectedCourse?.mattermostWebhookUrl && (
              <div className="mb-4">
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    // If it's a direct link to channel, open it. 
                    // If it's a webhook, we can't 'join' via webhook. 
                    // Assuming simpler 'Link' behavior or just showing it's active.
                    // But user provided a webhook url. 
                    // I'll add a button that might send a 'Hello' or if they meant Invite Link.
                    // User request: "Millet oraya katılsın" -> Implies Link.
                    // If the URL contains 'hooks', it's a webhook. 
                    // If it's not a hook, open it.
                    if (selectedCourse.mattermostWebhookUrl?.includes('/hooks/')) {
                      alert(t("mattermost_webhook_warning"));
                    } else {
                      window.open(selectedCourse.mattermostWebhookUrl, '_blank');
                    }
                  }}
                  className="btn btn-outline btn-sm gap-2 inline-flex items-center text-blue-600 border-blue-600 hover:bg-blue-50"
                >
                  💬 {t('join_chat')}
                </a>
              </div>
            )}


            {/* TAB BAR */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
              <button
                className={activeTab === 'content' ? 'btn' : 'btn btn-outline'}
                onClick={() => setActiveTab('content')}
                style={{ padding: '10px 20px', fontSize: '0.95rem' }}
              >
                {t('tab_content')}
              </button>
              <button
                className={activeTab === 'grades' ? 'btn' : 'btn btn-outline'}
                onClick={() => setActiveTab('grades')}
                style={{ padding: '10px 20px', fontSize: '0.95rem' }}
              >
                {t('tab_class_notebook')}
              </button>
              <button
                className={activeTab === 'exams' ? 'btn' : 'btn btn-outline'}
                onClick={() => setActiveTab('exams')}
                style={{ padding: '10px 20px', fontSize: '0.95rem' }}
              >
                {t('tab_exams')}
              </button>
            </div>

            {viewMode === 'detail' && activeTab === 'exams' && (
              <div className="card">
                <h3>{t('tab_exams')}</h3>
                {exams.length > 0 ? (
                  <ul className="divide-y divide-gray-200 dark:divide-slate-700">
                    {exams.filter(e => (canWrite || !e.isDraft)).map(exam => (
                      <li key={exam.id} className="p-4 flex flex-col md:flex-row justify-between items-center gap-4 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors">
                        <div>
                          <div className="font-bold text-lg flex items-center gap-2 text-slate-900 dark:text-slate-100">
                            {exam.title}
                            {exam.isDraft && (
                              <span className="bg-amber-500 text-white text-xs px-2 py-0.5 rounded shadow-sm">
                                {t('draft')}
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-2">
                            <span>⏱️ {exam.durationMinutes ? `${exam.durationMinutes} dk` : 'Süresiz'}</span>
                            <span className="text-slate-300 dark:text-slate-600">|</span>
                            <span>🎯 {t('pass_threshold')}: {exam.passThreshold}</span>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {canWrite && exam.isDraft && (
                            <button
                              className="btn px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded shadow-sm transition-all"
                              title={t('publish')}
                              onClick={async () => {
                                if (!confirm(t('publish_confirm'))) return;
                                try {
                                  const token = readToken();
                                  if (!token) throw new Error('Authentication token not found');

                                  const apiUrl = resolveApiBaseUrl({ runtime: 'web' });
                                  const res = await fetch(`${apiUrl}/exams/${exam.id}`, {
                                    method: 'PATCH',
                                    headers: {
                                      'Content-Type': 'application/json',
                                      'Authorization': `Bearer ${token}`
                                    },
                                    body: JSON.stringify({ isDraft: false })
                                  });

                                  if (!res.ok) {
                                    const errorData = await res.json().catch(() => ({}));
                                    throw new Error(errorData.error || errorData.message || res.statusText || 'Publish failed');
                                  }

                                  setExams(prev => prev.map(e => e.id === exam.id ? { ...e, isDraft: false } : e));
                                  alert(t('published'));
                                } catch (err: any) {
                                  console.error(err);
                                  alert(`${t('error')}: ${err.message || 'Unknown error'}`);
                                }
                              }}
                            >
                              {t('publish')}
                            </button>
                          )}
                          <button
                            className="btn px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded shadow-sm flex items-center gap-2 transition-all dark:bg-slate-700 dark:hover:bg-slate-600"
                            onClick={async () => {
                              try {
                                const token = readToken();
                                if (!token) {
                                  alert(t('token_not_found'));
                                  return;
                                }
                                const apiUrl = resolveApiBaseUrl({ runtime: 'web' });
                                const response = await fetch(`${apiUrl}/api/seb/exams/${exam.id}/seb-config`, {
                                  headers: { Authorization: `Bearer ${token}` }
                                });
                                if (!response.ok) {
                                  const errorData = await response.json().catch(() => ({}));
                                  throw new Error(errorData.error || 'Download failed');
                                }
                                const blob = await response.blob();
                                const filename = response.headers.get('Content-Disposition')?.split('filename=')[1]?.replace(/"/g, '') || `exam_${exam.id}_SEB.seb`;
                                const url = window.URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = filename;
                                document.body.appendChild(a);
                                a.click();
                                window.URL.revokeObjectURL(url);
                                document.body.removeChild(a);
                              } catch (err) {
                                console.error('SEB download error:', err);
                                alert(t('error'));
                              }
                            }}
                          >
                            <span>⬇️ SEB</span>
                          </button>

                          <button
                            className="btn px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded shadow-sm transition-all"
                            onClick={() => router.push(`/dashboard/${roleLower}/exam/${exam.id}`)}
                          >
                            {roleLower === 'student' ? t('start_exam') : t('details')}
                          </button>
                          {canWrite && (
                            <>
                              <button
                                className="btn btn-outline px-3 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded transition-colors"
                                title={t('view_submissions', 'View Submissions')}
                                onClick={() => setViewingSubmissionsExam(exam)}
                              >
                                📋
                              </button>
                              <button
                                className="btn btn-outline px-3 py-2 border border-slate-300 dark:border-slate-600 text-amber-600 dark:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded transition-colors"
                                title={t('edit_exam')}
                                onClick={() => startEditExam(exam)}
                              >
                                ✏️
                              </button>
                              <button
                                className="btn btn-outline px-3 py-2 border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                                title={t('delete_exam')}
                                onClick={() => {
                                  if (confirm(t('delete_confirm'))) {
                                    handleDeleteExam(exam.id);
                                  }
                                }}
                              >
                                🗑️
                              </button>
                            </>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="meta">{t('no_exams_yet')}</p>
                )}
              </div>
            )}

            <button
              className="btn"
              style={{ marginBottom: '16px', marginRight: '8px', background: showClassList ? 'var(--accent)' : undefined, color: showClassList ? 'white' : undefined }}
              onClick={async () => {
                const nextState = !showClassList;
                setShowClassList(nextState);
                if (nextState && apiClient && selectedCourse) {
                  const token = readToken();
                  if (!token) return;
                  setLoading(true);
                  try {
                    const res = await apiClient.get<any>(`/courses/${selectedCourse.id}/members`, {
                      headers: { Authorization: `Bearer ${token}` }
                    });
                    setCourseMembers(res.members);
                  } catch (err) {
                    setError(parseApiError(err, t('error')));
                  } finally {
                    setLoading(false);
                  }
                }
              }}
            >
              {t('show_class_list')}
            </button>

            {canWrite && (
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <button
                  className="btn btn-outline"
                  onClick={() => { setShowQuestionBank(false); setShowRubricEditor(false); setShowGeneralNotes(false); setShowModuleEditor(true); }}
                >
                  {t('edit_modules')}
                </button>
                <button
                  className="btn btn-outline"
                  onClick={() => { setShowModuleEditor(false); setShowRubricEditor(false); setShowGeneralNotes(false); setShowQuestionBank(true); }}
                >
                  {t('question_bank')}
                </button>
                <button
                  className="btn btn-outline"
                  onClick={() => { setShowModuleEditor(false); setShowQuestionBank(false); setShowGeneralNotes(false); setShowRubricEditor(true); }}
                >
                  {t('rubrics')}
                </button>
              </div>
            )}

            <button
              className="btn btn-secondary w-full mb-4 flex items-center justify-center gap-2"
              onClick={() => { setShowModuleEditor(false); setShowQuestionBank(false); setShowRubricEditor(false); setShowGeneralNotes(true); }}
            >
              {t('course_general_notes')}
            </button>

            {/* GENERAL NOTES OVERLAY */}
            {showGeneralNotes && selectedCourse && (
              <div className="fixed inset-0 bg-black/50 z-[999] flex items-center justify-center">
                <div className="bg-white rounded-xl shadow-xl h-[600px] flex overflow-hidden relative">
                  <button
                    className="absolute top-2 right-2 text-gray-500 hover:text-gray-800 z-10 p-1 bg-white rounded-full shadow"
                    onClick={() => setShowGeneralNotes(false)}
                  >
                    ✕
                  </button>
                  <div className="w-[400px] h-full">
                    <NotesPanel
                      contentId={`general-course-${selectedCourse.id}`}
                      contentType="general"
                      apiBaseUrl={apiBaseUrl || ""}
                      token={readToken()}
                    />
                  </div>
                </div>
              </div>
            )}



            {/* QUESTION BANK OVERLAY */}
            {showQuestionBank && selectedCourse && (
              <QuestionBankPanel
                courseId={selectedCourse.id}
                apiBaseUrl={apiBaseUrl || ""}
                token={readToken()}
                onClose={() => setShowQuestionBank(false)}
                onExamCreated={() => {
                  loadData(); // Reload exams to show new one
                }}
              />
            )}

            {/* RUBRIC EDITOR OVERLAY */}
            {showRubricEditor && selectedCourse && (
              <RubricEditor
                courseId={selectedCourse.id}
                apiBaseUrl={apiBaseUrl || ""}
                token={readToken()}
                onClose={() => setShowRubricEditor(false)}
              />
            )}

            {showClassList && (
              <div className="meta-block" style={{ marginTop: '16px' }}>
                <h4 style={{ marginBottom: '8px' }}>{t('participants')}</h4>
                {courseMembers.length > 0 ? (
                  <ul>
                    {courseMembers.map((m) => (
                      <li key={m.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                        <span>{m.username} ({m.role})</span>
                        <span className="meta">{new Date(m.enrolledAt).toLocaleDateString()}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="meta">{t('no_users_yet')}</p>
                )}
              </div>
            )}
          </div>
        )
        }

        {/* GRADEBOOK TAB CONTENT */}
        {
          activeSection === 'courses' && viewMode === 'detail' && activeTab === 'grades' && (
            <Gradebook
              courseId={selectedCourse!.id}
              role={roleLower}
              apiBaseUrl={apiBaseUrl || ""}
              token={readToken()}
            />
          )
        }

        {/* Courses List Section */}
        {
          activeSection === 'courses' && viewMode === 'list' && (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h2 style={{ margin: 0 }}>{t('courses')}</h2>
                <span className="badge" style={{ background: 'var(--border)', color: 'var(--ink)' }}>
                  {courses.length} {t('course_count')}
                </span>
              </div>
              {loading ? <p className="meta">{t('loading')}</p> : null}
              {courses.length ? (
                <ul>
                  {courses.map((course) => (
                    <li key={course.id}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', flexWrap: 'wrap', gap: '8px' }}>
                        <div>
                          <div
                            onClick={() => { setSelectedCourse(course); setViewMode('detail'); }}
                            style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--accent)', cursor: 'pointer', textDecoration: 'underline' }}
                          >
                            {course.title}
                          </div>
                          {course.description && course.description.replace(/<[^>]+>/g, '').trim() ? (
                            <div style={{ color: 'var(--ink-light)', marginTop: '4px' }}>
                              {course.description.replace(/<[^>]+>/g, '').trim()}
                            </div>
                          ) : null}
                        </div>
                        {canCreateCourse ? (
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              className="btn"
                              style={{ padding: '8px 16px', fontSize: '0.9rem' }}
                              type="button"
                              onClick={() => startEditCourse(course)}
                              disabled={updatingCourseId === course.id || deletingCourseId === course.id}
                            >
                              {t('edit')}
                            </button>
                            <button
                              className="btn btn-outline"
                              style={{ padding: '8px 16px', fontSize: '0.9rem' }}
                              type="button"
                              onClick={async () => {
                                const newTitle = prompt(`${course.title} ${t('copy_course_prompt')}`, `${course.title} ${t('copy_suffix')}`);
                                if (!newTitle) return;

                                setLoading(true);
                                try {
                                  const token = readToken();
                                  if (!token) return;

                                  const res = await fetch(`${apiBaseUrl}/api/courses/${course.id}/duplicate`, {
                                    method: "POST",
                                    headers: {
                                      "Content-Type": "application/json",
                                      Authorization: `Bearer ${token}`
                                    },
                                    body: JSON.stringify({ title: newTitle })
                                  });

                                  if (res.ok) {
                                    await loadData();
                                    alert(t('course_copied_alert'));
                                  } else {
                                    alert(t('error'));
                                  }
                                } catch (e) {
                                  console.error(e);
                                  alert(t('error'));
                                } finally {
                                  setLoading(false);
                                }
                              }}
                            >
                              {t('copy')}
                            </button>
                            <button
                              className="btn btn-ghost"
                              style={{ padding: '8px 16px', fontSize: '0.9rem' }}
                              type="button"
                              onClick={() => handleDeleteCourse(course.id)}
                              disabled={deletingCourseId === course.id}
                            >
                              {deletingCourseId === course.id ? "..." : t('delete')}
                            </button>
                            <button
                              className="btn btn-outline"
                              style={{ padding: '8px 16px', fontSize: '0.9rem', color: 'var(--accent)', borderColor: 'var(--accent)' }}
                              type="button"
                              title={t('save_as_template')}
                              onClick={async () => {
                                const tmplTitle = prompt(`"${course.title}" ${t('save_template_prompt')}`, course.title);
                                if (!tmplTitle) return;
                                setLoading(true);
                                try {
                                  const token = readToken();
                                  if (!token || !apiClient) return;
                                  await apiClient.post("/api/templates", {
                                    title: tmplTitle,
                                    description: course.description,
                                    category: "General",
                                    isPublic: true,
                                    courseId: course.id
                                  }, { headers: { Authorization: `Bearer ${token}` } });
                                  alert(t('template_created_success'));
                                } catch (e) {
                                  console.error(e);
                                  alert(t('template_create_error'));
                                } finally {
                                  setLoading(false);
                                }
                              }}
                            >
                              {t('template')}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="meta">{roleLower === 'student' ? t('course_list_empty_student') : t('course_list_empty_instructor')}</p>
              )}

              {(roleLower === 'student' && browseCourses.length > 0) && (
                <div style={{ marginTop: '32px' }}>
                  <h3 style={{ marginBottom: '16px', color: 'var(--ink)' }}>{t('discover_courses')}</h3>
                  <ul>
                    {browseCourses.map((course) => (
                      <li key={course.id}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                          <div>
                            <div style={{ fontWeight: '700' }}>{course.title}</div>
                            {course.description && course.description.replace(/<[^>]+>/g, '').trim() ? (
                              <div className="meta">{course.description.replace(/<[^>]+>/g, '').trim()}</div>
                            ) : null}
                          </div>
                          <button
                            className="btn"
                            style={{ background: 'var(--accent)' }}
                            onClick={() => handleEnroll(course.id)}
                            disabled={loading}
                          >
                            {t('enroll')}
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {canCreateCourse ? (
                !editingCourseId ? (
                  <div className="form">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h3>{t('create_course')}</h3>
                      <button className="btn btn-outline" type="button" onClick={() => setShowTemplateSelector(true)} style={{ fontSize: '0.8rem' }}>
                        {t('from_template')}
                      </button>
                    </div>
                    {showTemplateSelector && (
                      <TemplateSelector
                        apiBaseUrl={apiBaseUrl || ""}
                        token={readToken() || ""}
                        onSelect={handleCreateFromTemplate}
                        onCancel={() => setShowTemplateSelector(false)}
                      />
                    )}
                    <input
                      className="input"
                      placeholder={t('course_title')}
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                    />
                    <RichTextEditor
                      className="mb-4"
                      placeholder={t('description_optional')}
                      value={description}
                      onChange={setDescription}
                    />
                    <input
                      className="input"
                      placeholder={t("mattermost_webhook_url")}
                      value={mattermostWebhookUrl}
                      onChange={(event) => setMattermostWebhookUrl(event.target.value)}
                    />
                    <input
                      className="input"
                      placeholder={t("mattermost_channel_url")}
                      value={mattermostChannelUrl}
                      onChange={(event) => setMattermostChannelUrl(event.target.value)}
                    />
                    <button className="btn" type="button" onClick={handleCreate} disabled={creating}>
                      {creating ? t('saving') : t('create_course')}
                    </button>
                  </div>
                ) : null
              ) : null}

              {canCreateCourse && editingCourseId ? (
                <div className="form" ref={editCourseFormRef}>
                  <h3>{t('edit_course')}</h3>
                  <input
                    className="input"
                    placeholder={t('course_title')}
                    value={editCourseTitle}
                    onChange={(event) => setEditCourseTitle(event.target.value)}
                  />
                  <RichTextEditor
                    className="mb-4"
                    placeholder={t('description_optional')}
                    value={editCourseDescription}
                    onChange={setEditCourseDescription}
                  />
                  <input
                    className="input"
                    placeholder={t("mattermost_webhook_url")}
                    value={editCourseMattermostWebhookUrl}
                    onChange={(event) => setEditCourseMattermostWebhookUrl(event.target.value)}
                  />
                  <input
                    className="input"
                    placeholder={t("mattermost_channel_url_short")}
                    value={editCourseMattermostChannelUrl}
                    onChange={(event) => setEditCourseMattermostChannelUrl(event.target.value)}
                  />
                  <button
                    className="btn"
                    type="button"
                    onClick={handleUpdateCourse}
                    disabled={updatingCourseId === editingCourseId}
                  >
                    {updatingCourseId === editingCourseId ? t('updating') : t('update_course')}
                  </button>
                  <button className="btn" type="button" onClick={cancelEditCourse}>
                    {t('cancel')}
                  </button>
                </div>
              ) : null}
            </div>
          )
        }

        {
          viewMode === 'detail' && activeTab === 'content' && (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <h2 style={{ margin: 0 }}>{t('contents')}</h2>
                  <span className="badge" style={{ background: '#e2e8f0', color: '#0f172a' }}>
                    {contentItems.filter(i => i.courseId === selectedCourse?.id).length} {t('content_count')}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {(selectedCourse?.mattermostChannelUrl || selectedCourse?.mattermostWebhookUrl || true) && (
                    <a
                      href={selectedCourse?.mattermostChannelUrl || "http://localhost:8065"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn"
                      style={{ background: '#166de0', color: 'white', display: 'flex', alignItems: 'center', gap: '6px', textDecoration: 'none', padding: '8px 16px' }}
                    >
                      <span style={{ fontSize: '1.2em' }}>💬</span> {t('go_to_chat', 'Sohbet Grubuna Katıl')}
                    </a>
                  )}
                  {canWrite && (
                    <button
                      className="btn btn-outline"
                      onClick={() => setShowModuleEditor(true)}
                      title={t('reorder_modules_tooltip', 'Sürükle-bırak ile modülleri ve içerikleri sırala')}
                      style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      <span>⇄</span> {t('organize_modules', 'Sürükle-Bırak ile Düzenle')}
                    </button>
                  )}
                  {canWrite && (
                    <button
                      className="btn btn-secondary"
                      type="button"
                      onClick={() => {
                        setShowContentReorder((prev) => !prev);
                        setShowModuleEditor(false);
                      }}
                      title={t('reorder_contents_tooltip', 'İçerikleri sürükle-bırak ile sırala')}
                    >
                      ☰ {t('reorder_contents', 'İçerikleri Sırala')}
                    </button>
                  )}
                </div>
              </div>

              {canWrite && showContentReorder && selectedCourse && apiBaseUrl ? (
                <div style={{ marginBottom: '18px' }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
                    <div style={{ fontWeight: 700, color: '#0f172a' }}>{t('drag_drop_hint_title', 'Sürükle-Bırak')}</div>
                    <div style={{ color: '#64748b', fontSize: '0.9rem' }}>
                      {t('drag_drop_hint_body_short', 'Sırayı değiştirmek için listedeki ☰ tutamacını sürükleyin.')}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
                    <label style={{ fontSize: '0.85rem', color: '#475569' }}>{t('module', 'Modül')}</label>
                    <select
                      className="input"
                      style={{ maxWidth: 420 }}
                      value={contentReorderModuleId}
                      onChange={(e) => setContentReorderModuleId(e.target.value)}
                    >
                      <option value="__unassigned__">{t('unassigned', 'Modülsüz İçerikler')}</option>
                      {courseModulesFlat.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.title}
                        </option>
                      ))}
                    </select>
                    <button className="btn btn-ghost" type="button" onClick={() => setShowContentReorder(false)}>
                      {t('close')}
                    </button>
                  </div>

                  <ContentReorderList
                    items={contentItems
                      .filter((i) => i.courseId === selectedCourse.id)
                      .filter((i) =>
                        contentReorderModuleId === "__unassigned__"
                          ? !i.moduleId
                          : String(i.moduleId) === String(contentReorderModuleId)
                      )
                      .slice()
                      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))}
                    onReorder={async (newItems) => {
                      const token = readToken();
                      if (!token || !apiBaseUrl) return;

                      // Optimistic local update
                      setContentItems((prev) => {
                        const map = new Map(newItems.map((ni, idx) => [ni.id, idx]));
                        return prev.map((item) => {
                          const nextIndex = map.get(item.id);
                          if (nextIndex === undefined) return item;
                          return {
                            ...item,
                            sortOrder: nextIndex,
                            moduleId: contentReorderModuleId === "__unassigned__" ? null : contentReorderModuleId
                          };
                        });
                      });

                      const updates = newItems.map((item, index) => ({
                        id: item.id,
                        sortOrder: index,
                        moduleId: contentReorderModuleId === "__unassigned__" ? null : contentReorderModuleId
                      }));

                      try {
                        const res = await fetch(`${apiBaseUrl}/api/modules/reorder-content`, {
                          method: "POST",
                          headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${token}`
                          },
                          body: JSON.stringify({ updates })
                        });
                        if (!res.ok) {
                          throw new Error(`reorder failed (${res.status})`);
                        }
                      } catch (e) {
                        console.error(e);
                        alert(t('error'));
                        void loadData();
                      }
                    }}
                  />
                </div>
              ) : null}

              {contentItems.filter(i => i.courseId === selectedCourse?.id).length ? (
                <ul>
                  {contentItems.filter(i => i.courseId === selectedCourse?.id).map((item) => (
                    <li key={item.id}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '16px' }}>
                        <div>
                          <div style={{ fontSize: '1.05rem', fontWeight: '700', color: '#0f172a' }}>{item.title}</div>
                          {/* Prerequisites Badge */}
                          {(item as any).meta?.prerequisites && (item as any).meta.prerequisites.length > 0 && (
                            <div style={{ fontSize: '0.8rem', color: '#d97706', marginTop: '4px' }}>
                              🔒 {t('prerequisites')}: {(item as any).meta.prerequisites.join(", ")}
                            </div>
                          )}
                          <div style={{ display: 'flex', gap: '8px', marginTop: '4px', alignItems: 'center' }}>
                            <span className="badge" style={{ fontSize: '0.75rem', padding: '2px 8px' }}>
                              {item.type === 'live_class' ? t('live_class') :
                                item.type === 'scorm' ? t('scorm') :
                                  item.type === 'h5p' ? t('h5p') :
                                    item.type === 'zip' ? t('zip') :
                                      t(item.type)}
                            </span>
                            {/* Progress Badge */}
                            {contentProgress[item.id] !== undefined && (
                              <span
                                className="badge"
                                style={{
                                  fontSize: '0.7rem',
                                  padding: '2px 6px',
                                  background: contentProgress[item.id] >= 100 ? '#22c55e' : contentProgress[item.id] > 0 ? '#f59e0b' : '#e2e8f0',
                                  color: contentProgress[item.id] > 0 ? '#fff' : '#64748b'
                                }}
                              >
                                {contentProgress[item.id] >= 100 ? `✓ ${t('completed')}` : `${contentProgress[item.id]}%`}
                              </span>
                            )}
                            {/* Source Hidden per user request */}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {item.type === 'live_class' && item.source ? (
                            <a
                              href={item.source}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn"
                              style={{ padding: '8px 16px', fontSize: '0.9rem', background: '#0891b2', textDecoration: 'none', whiteSpace: 'nowrap' }}
                            >
                              {t("join_class")}
                            </a>
                          ) : (
                            <button
                              className="btn"
                              style={{ padding: '8px 16px', fontSize: '0.9rem', background: '#3b82f6', color: 'white', whiteSpace: 'nowrap' }}
                              onClick={() => setPlayingContent(item)}
                            >
                              {item.type === 'video' ? t('watch') : item.type === 'pdf' ? t('read') : t('start_content')}
                            </button>
                          )}
                          {canWrite && (
                            <>
                              <button
                                className="btn"
                                style={{ padding: '8px 16px', fontSize: '0.9rem' }}
                                type="button"
                                onClick={() => startEditContent(item)}
                                disabled={updatingContentId === item.id || deletingContentId === item.id}
                              >
                                {t('edit')}
                              </button>
                              <button
                                className="btn btn-ghost"
                                style={{ padding: '8px 16px', fontSize: '0.9rem' }}
                                type="button"
                                onClick={() => handleDeleteContent(item.id)}
                                disabled={deletingContentId === item.id}
                              >
                                {deletingContentId === item.id ? "..." : t('delete')}
                              </button>

                              {(item.type === 'pdf' || item.type === 'text') && (
                                <button
                                  className="btn btn-ghost text-purple-600"
                                  style={{ padding: '8px 16px', fontSize: '0.9rem' }}
                                  title={t('check_plagiarism_tooltip')}
                                  onClick={async () => {
                                    if (!confirm(t('plagiarism_check_confirm'))) return;
                                    try {
                                      const res = await fetch(`${apiBaseUrl}/api/plagiarism/check-content`, {
                                        method: 'POST',
                                        headers: {
                                          'Content-Type': 'application/json',
                                          Authorization: `Bearer ${readToken()}`
                                        },
                                        body: JSON.stringify({ contentId: item.id })
                                      });
                                      const data = await res.json();
                                      if (data.success) {
                                        if (data.reports.length === 0) {
                                          alert(t('plagiarism_clean'));
                                        } else {
                                          const top = data.reports[0];
                                          alert(`${t('plagiarism_found')}\n\n${t('max_similarity')}: %${(top.similarity * 100).toFixed(1)}\n${t('source')}: ${top.title}\n\n(${t('total_matches_found', { count: data.reports.length })})`);
                                        }
                                      } else {
                                        alert(t('error_label') + (data.message || data.error));
                                      }
                                    } catch (e) {
                                      console.error(e);
                                      alert(t('plagiarism_check_error'));
                                    }
                                  }}
                                >
                                  {t('check_plagiarism')}
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                      {item.source && isImageContent(item.type) ? (
                        <div style={{ marginTop: 12, position: 'relative', width: '100%', height: '200px' }}>
                          <Image
                            src={item.source}
                            alt={item.title}
                            fill
                            style={{ objectFit: 'contain' }}
                            className="content-preview"
                          />
                        </div>
                      ) : null}

                    </li>
                  ))}
                </ul>
              ) : (
                <p className="meta">{t('no_content_yet')}</p>
              )}

              {canWrite ? (
                !editingContentId ? (
                  <div className="form">
                    <h3>{t('create_content')}</h3>
                    <select
                      className="input"
                      value={contentType}
                      onChange={(event) =>
                        setContentType(event.target.value as (typeof contentTypeOptions)[number])
                      }
                    >
                      {contentTypeOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                    <p className="meta">{t('content_type_warning')}</p>
                    <input
                      className="input"
                      placeholder={t("content_title")}
                      value={contentTitle}
                      onChange={(event) => setContentTitle(event.target.value)}
                    />
                    <input
                      className="input"
                      placeholder={t("source_url")}
                      value={contentSource}
                      onChange={(event) => setContentSource(event.target.value)}
                    />
                    <CloudFilePicker onSelect={(file) => {
                      setContentTitle(file.name);
                      setContentSource(file.url);
                      setContentType(file.type);
                    }} />
                    <MicrosoftOneDrivePicker
                      apiBaseUrl={apiBaseUrl}
                      token={readToken()}
                      onSelect={(file) => {
                        setContentTitle(file.name);
                        setContentSource(file.url);
                        setContentType(file.type);
                      }}
                    />
                    <div className="form-group" style={{ marginBottom: '12px' }}>
                      <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '4px', color: 'var(--ink-light)' }}>
                        {t("or_file_upload")}
                      </label>
                      <LocalizedFileInput
                        accept={
                          contentType === 'video' ? 'video/*' :
                            contentType === 'pdf' ? '.pdf,application/pdf' :
                              (contentType === 'h5p' || contentType === 'scorm') ? '.zip,.h5p,application/zip,application/x-zip-compressed' :
                                undefined
                        }
                        onSelect={(file) => setContentFile(file)}
                      />
                    </div>
                    <div className="meta-block" style={{ marginBottom: '12px' }}>
                      <div className="meta" style={{ marginBottom: 6 }}>
                        {t('add_prerequisite')}
                      </div>
                      {newPrerequisites.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                          {newPrerequisites.map((p) => (
                            <span key={p.id} className="badge" style={{ background: 'var(--border)', color: 'var(--ink)' }}>
                              {p.title}
                              <button
                                type="button"
                                style={{ marginLeft: '6px', cursor: 'pointer' }}
                                onClick={() => setNewPrerequisites((prev) => prev.filter((x) => x.id !== p.id))}
                              >
                                ✕
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <select id="add-prereq-select-new" className="input" style={{ flex: 1 }}>
                          <option value="">{t('add_prerequisite')}</option>
                          {contentItems
                            .filter(
                              (c) =>
                                c.courseId === selectedCourse?.id &&
                                !newPrerequisites.find((np) => np.id === c.id)
                            )
                            .map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.title}
                              </option>
                            ))}
                        </select>
                        <button
                          className="btn btn-secondary"
                          type="button"
                          onClick={() => {
                            const select = document.getElementById("add-prereq-select-new") as HTMLSelectElement;
                            const val = select?.value;
                            if (!val) return;
                            const target = contentItems.find((c) => c.id === val);
                            if (!target) return;
                            setNewPrerequisites((prev) => [...prev, target]);
                            select.value = "";
                          }}
                        >
                          {t('add')}
                        </button>
                      </div>
                    </div>
                    <button
                      className="btn"
                      type="button"
                      onClick={handleCreateContent}
                      disabled={creatingContent}
                    >
                      {creatingContent ? t('saving') : t('create_content')}
                    </button>
                  </div>
                ) : null
              ) : null}

              {canWrite && editingContentId ? (
                <div className="form" ref={editContentFormRef}>
                  <h3>{t('edit_content')}</h3>
                  <select
                    className="input"
                    value={editContentType}
                    onChange={(event) => setEditContentType(event.target.value)}
                  >
                    {editContentTypeOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  <p className="meta">{t('content_type_warning')}</p>
                  <input
                    className="input"
                    placeholder={t('content_title')}
                    value={editContentTitle}
                    onChange={(event) => setEditContentTitle(event.target.value)}
                  />
                  <input
                    className="input"
                    placeholder={t('source_optional')}
                    value={editContentSource}
                    onChange={(event) => setEditContentSource(event.target.value)}
                  />
                  <CloudFilePicker onSelect={(file) => {
                    setEditContentTitle(file.name);
                    setEditContentSource(file.url);
                    setEditContentType(file.type);
                  }} />
                  <MicrosoftOneDrivePicker
                    apiBaseUrl={apiBaseUrl}
                    token={readToken()}
                    onSelect={(file) => {
                      setEditContentTitle(file.name);
                      setEditContentSource(file.url);
                      setEditContentType(file.type);
                    }}
                  />
                  <div className="form-group" style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '4px', color: 'var(--ink-light)' }}>
                      {t("or_file_upload")}
                    </label>
                    <LocalizedFileInput
                      accept={
                        editContentType === 'video' ? 'video/*' :
                          editContentType === 'pdf' ? '.pdf,application/pdf' :
                            (editContentType === 'h5p' || editContentType === 'scorm') ? '.zip,.h5p,application/zip,application/x-zip-compressed' :
                              undefined
                      }
                      onSelect={(file) => setEditContentFile(file)}
                    />
                  </div>
                  <button
                    className="btn"
                    type="button"
                    onClick={handleUpdateContent}
                    disabled={updatingContentId === editingContentId}
                  >
                    {updatingContentId === editingContentId ? t('updating') : t('update_content')}
                  </button>
                  <button className="btn" type="button" onClick={cancelEditContent}>
                    {t('cancel')}
                  </button>

                  <div className="meta-block" style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid #eee' }}>
                    {editPrerequisites.length > 0 && (
                      <ul style={{ marginBottom: 12 }}>
                        {editPrerequisites.map(p => (
                          <li key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '4px 8px', marginBottom: 4, borderRadius: 4 }}>
                            <span style={{ fontSize: '0.9rem' }}>{p.title}</span>
                            <button
                              className="btn btn-ghost btn-sm"
                              style={{ color: '#ef4444' }}
                              onClick={async () => {
                                if (!apiClient || !editingContentId) return;
                                try {
                                  await apiClient.del("/api/modules/prerequisite", {
                                    headers: { Authorization: `Bearer ${readToken()}` },
                                    body: { contentId: editingContentId, prerequisiteContentId: p.id }
                                  });
                                  setEditPrerequisites(prev => prev.filter(x => x.id !== p.id));
                                } catch (e) { alert(t('delete_failed')); }
                              }}
                            >✕</button>
                          </li>
                        ))}
                      </ul>
                    )}

                    <div style={{ display: 'flex', gap: 8 }}>
                      <select
                        className="input"
                        id="add-prereq-select"
                        style={{ fontSize: '0.9rem' }}
                      >
                        <option value="">{t('add_prerequisite')}</option>
                        {contentItems
                          .filter(c => c.courseId === selectedCourse?.id && c.id !== editingContentId && !editPrerequisites.find(ep => ep.id === c.id))
                          .map(c => (
                            <option key={c.id} value={c.id}>{c.title}</option>
                          ))
                        }
                      </select>
                      <button
                        className="btn btn-secondary"
                        onClick={async () => {
                          const select = document.getElementById("add-prereq-select") as HTMLSelectElement;
                          const val = select.value;
                          if (!val || !apiClient || !editingContentId) return;

                          const target = contentItems.find(c => c.id === val);
                          if (!target) return;

                          try {
                            await apiClient.post("/api/modules/prerequisite", {
                              contentId: editingContentId,
                              prerequisiteContentId: val
                            }, { headers: { Authorization: `Bearer ${readToken()}` } });
                            setEditPrerequisites(prev => [...prev, target]);
                            select.value = "";
                          } catch (e) { alert(t('add_failed')); }
                        }}
                      >{t('add')}</button>
                    </div>
                  </div>

                </div>
              ) : null}
            </div>
          )
        }

        {
          viewMode === 'detail' && canWrite && activeTab === 'content' && (
            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <h2 style={{ margin: 0 }}>{t('create_live_class')}</h2>
                <span className="badge" style={{ background: liveClassProvider === 'bbb' ? '#0ea5e9' : '#e2e8f0', color: liveClassProvider === 'bbb' ? '#fff' : '#0f172a' }}>
                  {liveClassProvider === 'bbb' ? t('provider_bbb') : t('provider_jitsi')}
                </span>
              </div>
              <p className="meta">{t('select_provider_msg')}</p>

              {/* Provider Selector */}
              <div style={{ display: 'flex', gap: '16px', marginBottom: '12px', padding: '8px 0' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="liveClassProvider"
                    value="jitsi"
                    checked={liveClassProvider === 'jitsi'}
                    onChange={() => setLiveClassProvider('jitsi')}
                  />
                  <span style={{ fontWeight: 500 }}>{t('provider_jitsi')}</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="liveClassProvider"
                    value="bbb"
                    checked={liveClassProvider === 'bbb'}
                    onChange={() => setLiveClassProvider('bbb')}
                  />
                  <span style={{ fontWeight: 500 }}>{t('provider_bbb')}</span>
                </label>
              </div>

              <div className="form">
                <input
                  className="input"
                  placeholder={t("room_name")}
                  value={liveRoomName}
                  onChange={(event) => setLiveRoomName(event.target.value)}
                />
                <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                  <button
                    className="btn"
                    type="button"
                    onClick={handleCreateMeeting}
                    disabled={creatingMeeting}
                  >
                    {creatingMeeting ? t('creating_meeting') : t('create_meeting')}
                  </button>
                  {liveMeetingUrl ? (
                    <a className="btn btn-secondary" href={liveMeetingUrl} target="_blank" rel="noreferrer">
                      {t('open_meeting')}
                    </a>
                  ) : null}
                </div>
              </div>
              {liveMeetingError ? <div className="error">{liveMeetingError}</div> : null}
            </div>
          )
        }

        {
          viewMode === 'detail' && activeTab === 'content' && (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h2 style={{ margin: 0 }}>{t('exams')}</h2>
                <span className="badge" style={{ background: '#e2e8f0', color: '#0f172a' }}>
                  {exams.filter(e => e.courseId === selectedCourse?.id && (canWrite || !e.isDraft)).length} {t('exam_count')}
                </span>
              </div>
              {exams.filter(e => e.courseId === selectedCourse?.id && (canWrite || !e.isDraft)).length ? (
                <ul>
                  {exams.filter(e => e.courseId === selectedCourse?.id && (canWrite || !e.isDraft)).map((exam) => (
                    <li key={exam.id}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
                        <div>
                          <div style={{ fontSize: '1.05rem', fontWeight: '700', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {exam.title}
                            {exam.isDraft && (
                              <span className="badge" style={{ backgroundColor: '#f59e0b', color: 'white', fontSize: '0.75rem', padding: '2px 8px', borderRadius: '4px' }}>
                                {t('draft')}
                              </span>
                            )}
                          </div>
                          {exam.durationMinutes ? <div style={{ fontSize: '0.85rem', color: '#64748b' }}>{t('duration_min')}: {exam.durationMinutes}</div> : ""}
                          {exam.passThreshold ? <div style={{ fontSize: '0.85rem', color: '#64748b' }}>{t('pass_grade')}: {exam.passThreshold}</div> : ""}
                        </div>

                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            className="btn"
                            style={{ padding: '8px 16px', fontSize: '0.9rem', background: '#0f766e' }}
                            type="button"
                            onClick={() => {
                              setSelectedExam(exam);
                              setViewMode('exam_detail');
                            }}
                          >
                            {t('detail')}
                          </button>
                          {canWrite && exam.isDraft && (
                            <button
                              className="btn"
                              style={{ padding: '8px 16px', fontSize: '0.9rem', background: '#3b82f6' }}
                              type="button"
                              onClick={async () => {
                                if (!confirm(t('publish_confirm') || "Are you sure you want to publish this exam?")) return;
                                try {
                                  if (!apiClient) return;
                                  await apiClient.patch(`/exams/${exam.id}`, { isDraft: false });
                                  setExams(prev => prev.map(e => e.id === exam.id ? { ...e, isDraft: false } : e));
                                  alert(t('published'));
                                } catch (err) {
                                  console.error(err);
                                  alert("Failed to publish");
                                }
                              }}
                            >
                              {t('publish')}
                            </button>
                          )}
                          {canWrite ? (
                            <>
                              <button
                                className="btn"
                                style={{ padding: '8px 16px', fontSize: '0.9rem' }}
                                type="button"
                                onClick={() => startEditExam(exam)}
                                disabled={updatingExamId === exam.id || deletingExamId === exam.id}
                              >
                                {t('edit')}
                              </button>
                              <button
                                className="btn btn-ghost"
                                style={{ padding: '8px 16px', fontSize: '0.9rem' }}
                                type="button"
                                onClick={() => handleDeleteExam(exam.id)}
                                disabled={deletingExamId === exam.id}
                              >
                                {deletingExamId === exam.id ? '...' : t('delete')}
                              </button>
                            </>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="meta">{t('no_exams_yet')}</p>
              )}

              {canWrite ? (
                !editingExamId ? (
                  <div className="form">
                    <h3>{t('create_exam')}</h3>
                    <input
                      className="input"
                      placeholder={t('exam_title')}
                      value={examTitle}
                      onChange={(event) => setExamTitle(event.target.value)}
                    />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <input
                        className="input"
                        type="number"
                        placeholder={t('duration_min')}
                        value={examDuration}
                        onChange={(e) => setExamDuration(e.target.value)}
                      />
                      <input
                        className="input"
                        type="number"
                        placeholder={t('pass_grade')}
                        value={examPassThreshold}
                        onChange={(e) => setExamPassThreshold(e.target.value)}
                      />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <div>
                        <label style={{ fontSize: '0.8rem', color: '#666' }}>{t('start_date')}</label>
                        <input
                          className="input"
                          type="datetime-local"
                          value={examStartDate}
                          onChange={(e) => setExamStartDate(e.target.value)}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.8rem', color: '#666' }}>{t('end_date')}</label>
                        <input
                          className="input"
                          type="datetime-local"
                          value={examEndDate}
                          onChange={(e) => setExamEndDate(e.target.value)}
                        />
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '10px' }}>
                      <div>
                        <label style={{ fontSize: '0.8rem', color: '#666' }}>{t('max_attempts')}</label>
                        <input
                          className="input"
                          type="number"
                          placeholder={t('max_attempts')}
                          value={examMaxAttempts}
                          onChange={(e) => setExamMaxAttempts(e.target.value)}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.8rem', color: '#666' }}>{t('results_visibility')}</label>
                        <input
                          className="input"
                          type="datetime-local"
                          value={examResultsVisibleAt}
                          onChange={(e) => setExamResultsVisibleAt(e.target.value)}
                        />
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '10px 0' }}>
                      <input
                        type="checkbox"
                        id="createExamDraft"
                        checked={examIsDraft}
                        onChange={(e) => setExamIsDraft(e.target.checked)}
                      />
                      <label htmlFor="createExamDraft">{t('draft_mode')}</label>
                    </div>
                    <button className="btn" type="button" onClick={handleCreateExam} disabled={creatingExam}>
                      {creatingExam ? t('saving') : t('create_exam')}
                    </button>
                  </div>
                ) : null
              ) : null}

              {canWrite && editingExamId ? (
                <div className="form" ref={editExamFormRef}>
                  <h3>{t('edit_exam')}</h3>
                  <input
                    className="input"
                    placeholder={t('exam_title')}
                    value={editExamTitle}
                    onChange={(event) => setEditExamTitle(event.target.value)}
                  />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <input
                      className="input"
                      type="number"
                      placeholder={t('duration_min')}
                      value={editExamDuration}
                      onChange={(e) => setEditExamDuration(e.target.value)}
                    />
                    <input
                      className="input"
                      type="number"
                      placeholder={t('pass_grade')}
                      value={editExamPassThreshold}
                      onChange={(e) => setEditExamPassThreshold(e.target.value)}
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                      <label style={{ fontSize: '0.8rem', color: '#666' }}>{t('start_date')}</label>
                      <input
                        className="input"
                        type="datetime-local"
                        value={editExamStartDate}
                        onChange={(e) => setEditExamStartDate(e.target.value)}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.8rem', color: '#666' }}>{t('end_date')}</label>
                      <input
                        className="input"
                        type="datetime-local"
                        value={editExamEndDate}
                        onChange={(e) => setEditExamEndDate(e.target.value)}
                      />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '10px' }}>
                    <div>
                      <label style={{ fontSize: '0.8rem', color: '#666' }}>{t('max_attempts')}</label>
                      <input
                        className="input"
                        type="number"
                        placeholder={t('max_attempts')}
                        value={editExamMaxAttempts}
                        onChange={(e) => setEditExamMaxAttempts(e.target.value)}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.8rem', color: '#666' }}>{t('results_visibility')}</label>
                      <input
                        className="input"
                        type="datetime-local"
                        value={editExamResultsVisibleAt}
                        onChange={(e) => setEditExamResultsVisibleAt(e.target.value)}
                      />
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '10px 0' }}>
                    <input
                      type="checkbox"
                      id="editExamDraft"
                      checked={editExamIsDraft}
                      onChange={(e) => setEditExamIsDraft(e.target.checked)}
                    />
                    <label htmlFor="editExamDraft">{t('draft_mode_description')}</label>
                  </div>
                  <button
                    className="btn"
                    type="button"
                    onClick={handleUpdateExam}
                    disabled={updatingExamId === editingExamId}
                  >
                    {updatingExamId === editingExamId ? t('updating') : t('update_exam')}
                  </button>
                  <button className="btn" type="button" onClick={cancelEditExam}>
                    {t('cancel')}
                  </button>
                </div>
              ) : null}
            </div>
          )
        }

        {
          viewMode === 'exam_detail' && selectedExam && !canWrite && (
            <div className="card">
              <button className="btn" style={{ marginBottom: '16px' }} onClick={() => { setSelectedExam(null); setViewMode('detail'); }}>{t('return_to_list')}</button>

              {!examStarted && !examSubmissionResult && (
                <div style={{ textAlign: 'center', padding: '20px' }}>
                  <h2 style={{ fontSize: '1.5rem', marginBottom: '10px' }}>{selectedExam.title}</h2>
                  <div style={{ display: 'flex', gap: '20px', justifyContent: 'center', marginBottom: '20px', color: '#64748b' }}>
                    <span>{t('duration_min')}: {selectedExam.durationMinutes || t('unlimited')}</span>
                    <span>{t('question_count')}: {questions.filter(q => q.examId === selectedExam.id).length}</span>
                    <span>{t('pass_grade')}: {selectedExam.passThreshold || '-'}</span>
                  </div>
                  <button
                    className="btn"
                    onClick={handleStartExam}
                    style={{ padding: '12px 32px', fontSize: '1.1rem', background: '#0f766e', color: 'white' }}
                  >
                    {t('start_exam')}
                  </button>

                  <div style={{ marginTop: '24px', borderTop: '1px solid #e2e8f0', paddingTop: '16px' }}>
                    <button
                      className="btn btn-outline"
                      style={{ fontSize: '0.9rem', color: '#6366f1', borderColor: '#6366f1' }}
                      onClick={async () => {
                        if (!apiClient || !selectedExam) return;
                        const token = readToken();
                        if (!token) return;
                        try {
                          const res = await fetch(`${apiBaseUrl}/api/seb/exams/${selectedExam.id}/seb-config`, {
                            headers: { Authorization: `Bearer ${token}` }
                          });
                          if (res.ok) {
                            const blob = await res.blob();
                            const url = window.URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `${selectedExam.title.replace(/[^a-zA-Z0-9]/g, '_')}_SEB.seb`;
                            document.body.appendChild(a);
                            a.click();
                            window.URL.revokeObjectURL(url);
                            document.body.removeChild(a);
                          } else {
                            alert(t('seb_download_failed'));
                          }
                        } catch (e) {
                          console.error(e);
                          alert(t('download_error'));
                        }
                      }}
                    >
                      {t('download_seb')}
                    </button>
                    <p className="meta" style={{ marginTop: '8px', fontSize: '0.8rem' }}>
                      {t('seb_required')}
                    </p>
                  </div>
                </div>
              )}

              {examStarted && !examSubmissionResult && apiBaseUrl && (
                <ExamTakingComponent
                  exam={selectedExam}
                  questions={questions.filter(q => q.examId === selectedExam.id)}
                  apiBase={apiBaseUrl}
                  token={readToken() || ''}
                  onComplete={(score, total) => {
                    setExamSubmissionResult({ score: Math.round((score / total) * 100), passed: (score / total) >= (selectedExam.passThreshold || 50) / 100 });
                    setExamStarted(false);
                  }}
                  onCancel={() => {
                    setExamStarted(false);
                    setViewMode('detail');
                  }}
                />
              )}

              {examSubmissionResult && (
                <div style={{ textAlign: 'center', padding: '40px 0' }}>
                  <h2 style={{ marginBottom: '20px' }}>{t('exam_completed')}</h2>
                  <div style={{ fontSize: '3.5rem', fontWeight: 'bold', color: examSubmissionResult.passed ? '#0f766e' : '#b91c1c', marginBottom: '16px' }}>
                    {examSubmissionResult.score} / 100
                  </div>
                  <p className="meta" style={{ fontSize: '1.2rem', marginBottom: '32px' }}>
                    {examSubmissionResult.passed ? t('congrats_passed') : t('failed_msg')}
                  </p>
                  <button
                    className="btn"
                    onClick={() => { setViewMode('detail'); setSelectedExam(null); }}
                    style={{ padding: '12px 24px' }}
                  >
                    {t('return_to_list')}
                  </button>
                </div>
              )}
            </div>
          )
        }

        {
          viewMode === 'exam_detail' && selectedExam && canWrite && (
            <>
              <button
                className="btn btn-secondary"
                style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}
                type="button"
                onClick={() => {
                  setSelectedExam(null);
                  setViewMode('detail');
                }}
              >
                <span>←</span> {t('return_to_course')}
              </button>

              <div className="card" style={{ marginBottom: '32px' }}>
                <div style={{ padding: '0 0 16px 0', borderBottom: '1px solid #e2e8f0', marginBottom: '16px' }}>
                  <h2 style={{ marginBottom: '8px', fontSize: '1.5rem', color: '#1e293b' }}>{selectedExam.title}</h2>
                  <div style={{ display: 'flex', gap: '24px', color: '#64748b' }}>
                    {selectedExam.durationMinutes && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>⏱️</span>
                        <strong>{t('duration')}:</strong> {selectedExam.durationMinutes} {t('minutes')}
                      </div>
                    )}
                    {selectedExam.passThreshold && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>🎯</span>
                        <strong>{t('pass_grade')}:</strong> {selectedExam.passThreshold}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                  <h2 style={{ margin: 0 }}>{t('questions')}</h2>
                  <span className="badge" style={{ background: '#e2e8f0', color: '#0f172a' }}>
                    {questions.filter(q => q.examId === selectedExam.id).length} {t('question_count')}
                  </span>
                </div>
                {questions.filter(q => q.examId === selectedExam.id).length ? (
                  <ul>
                    {questions.filter(q => q.examId === selectedExam.id).map((question) => {
                      const optionList =
                        question.options?.length
                          ? question.options
                          : question.type === "true_false"
                            ? [...trueFalseOptions]
                            : null;
                      return (
                        <li key={question.id}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '16px' }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: '700', color: '#0f172a', marginBottom: '4px' }}>{question.prompt}</div>

                              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                                <span className="badge" style={{ fontSize: '0.75rem', padding: '2px 8px' }}>
                                  {questionTypeLabelMap.get(question.type as QuestionType) ?? question.type}
                                </span>
                                {question.examId ? <span style={{ color: '#64748b', fontSize: '0.85rem' }}>{t('exam')}: {question.examId}</span> : ""}
                              </div>

                              {optionList ? (
                                <div className="meta" style={{ marginTop: '8px', padding: '12px', background: '#f8fafc', borderRadius: '8px' }}>
                                  <strong>{t('options')}:</strong> {optionList.join(", ")}
                                </div>
                              ) : null}
                              {question.answer !== undefined && question.answer !== null ? (
                                <div className="meta" style={{ color: '#10b981', fontWeight: '600', marginTop: '8px' }}>
                                  ✅ {t('correct')}: {formatAnswer(question.answer, t)}
                                </div>
                              ) : null}
                              {formatQuestionMetaLines(question, t).map((line, index) => (
                                <div className="meta" key={`${question.id}-meta-${index}`} style={{ marginTop: '4px' }}>
                                  {line}
                                </div>
                              ))}
                            </div>

                            {canWrite ? (
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <button
                                  className="btn"
                                  style={{ padding: '8px 16px', fontSize: '0.9rem' }}
                                  type="button"
                                  onClick={() => startEditQuestion(question)}
                                  disabled={
                                    updatingQuestionId === question.id || deletingQuestionId === question.id
                                  }
                                >
                                  {t('edit')}
                                </button>
                                <button
                                  className="btn btn-ghost"
                                  style={{ padding: '8px 16px', fontSize: '0.9rem' }}
                                  type="button"
                                  onClick={() => handleDeleteQuestion(question.id)}
                                  disabled={deletingQuestionId === question.id}
                                >
                                  {deletingQuestionId === question.id ? "..." : t('delete')}
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="meta">{t('no_questions_yet')}</p>
                )}

                {canWrite ? (
                  !editingQuestionId ? (
                    <div className="form">
                      <h3>{t('create_question')}</h3>
                      <input
                        className="input"
                        placeholder={t('question_text')}
                        value={questionPrompt}
                        onChange={(event) => setQuestionPrompt(event.target.value)}
                      />
                      <select
                        className="input"
                        value={questionType}
                        onChange={(event) => setQuestionType(event.target.value as QuestionType)}
                      >
                        {questionTypeOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      {isChoiceQuestion(questionType) ? (
                        <div className="option-list">
                          {isEditableChoiceQuestion(questionType) ? (
                            <>
                              {questionOptions.map((option, index) => (
                                <div className="option-row" key={`new-option-${index}`}>
                                  <input
                                    className="input"
                                    placeholder={t('option_placeholder', { number: index + 1 })}
                                    value={option}
                                    onChange={(event) => updateQuestionOption(index, event.target.value)}
                                  />
                                  <button
                                    className="btn btn-ghost"
                                    type="button"
                                    onClick={() => removeQuestionOption(index)}
                                    disabled={questionOptions.length <= 2}
                                  >
                                    {t('delete')}
                                  </button>
                                </div>
                              ))}
                              <button className="btn btn-secondary" type="button" onClick={addQuestionOption}>
                                {t('add_option')}
                              </button>
                            </>
                          ) : null}
                          {questionType === "true_false" ? (
                            <>
                              <p className="meta">{t('correct_false_select')}</p>
                              <div className="choice-box">
                                {trueFalseOptions.map((option) => (
                                  <label className="choice-item" key={`answer-${option}`}>
                                    <input
                                      type="radio"
                                      name="question-answer"
                                      checked={questionAnswer === option}
                                      onChange={() => setQuestionAnswer(option)}
                                    />
                                    <span>{option}</span>
                                  </label>
                                ))}
                              </div>
                            </>
                          ) : questionOptionList.length ? (
                            <>
                              <p className="meta">
                                {questionType === "multiple_select"
                                  ? t('multiple_select_instruction')
                                  : t('single_select_instruction')}
                              </p>
                              <div className="choice-box">
                                {questionType === "multiple_select"
                                  ? questionOptionList.map((option) => (
                                    <label className="choice-item" key={`answer-${option}`}>
                                      <input
                                        type="checkbox"
                                        checked={questionAnswerMulti.includes(option)}
                                        onChange={() => toggleQuestionAnswerMulti(option)}
                                      />
                                      <span>{option}</span>
                                    </label>
                                  ))
                                  : questionOptionList.map((option) => (
                                    <label className="choice-item" key={`answer-${option}`}>
                                      <input
                                        type="radio"
                                        name="question-answer"
                                        checked={questionAnswer === option}
                                        onChange={() => setQuestionAnswer(option)}
                                      />
                                      <span>{option}</span>
                                    </label>
                                  ))}
                              </div>
                            </>
                          ) : (
                            <p className="meta">{t('fill_options_first')}</p>
                          )}
                        </div>
                      ) : null}
                      {questionType === "matching" ? (
                        <div className="option-list">
                          <p className="meta">{t('matching_instruction')}</p>
                          {matchingPairs.map((pair, index) => (
                            <div className="option-row" key={`match-${index}`}>
                              <div className="pair-row">
                                <input
                                  className="input"
                                  placeholder={`${t('left')} ${index + 1}`}
                                  value={pair.left}
                                  onChange={(event) => updateMatchingPair(index, "left", event.target.value)}
                                />
                                <input
                                  className="input"
                                  placeholder={`${t('right')} ${index + 1}`}
                                  value={pair.right}
                                  onChange={(event) => updateMatchingPair(index, "right", event.target.value)}
                                />
                              </div>
                              <button
                                className="btn btn-ghost"
                                type="button"
                                onClick={() => removeMatchingPair(index)}
                                disabled={matchingPairs.length <= 1}
                              >
                                {t('delete')}
                              </button>
                            </div>
                          ))}
                          <button className="btn btn-secondary" type="button" onClick={addMatchingPair}>
                            {t('add_pair')}
                          </button>
                        </div>
                      ) : null}
                      {questionType === "ordering" ? (
                        <div className="option-list">
                          <p className="meta">{t('ordering_instruction')}</p>
                          {orderingItems.map((item, index) => (
                            <div className="option-row" key={`order-${index}`}>
                              <input
                                className="input"
                                placeholder={`${t('item')} ${index + 1}`}
                                value={item}
                                onChange={(event) => updateOrderingItem(index, event.target.value)}
                              />
                              <div className="row-actions">
                                <button
                                  className="btn btn-ghost"
                                  type="button"
                                  onClick={() => moveOrderingItem(index, index - 1)}
                                  disabled={index === 0}
                                >
                                  {t('move_up')}
                                </button>
                                <button
                                  className="btn btn-ghost"
                                  type="button"
                                  onClick={() => moveOrderingItem(index, index + 1)}
                                  disabled={index === orderingItems.length - 1}
                                >
                                  {t('move_down')}
                                </button>
                                <button
                                  className="btn btn-ghost"
                                  type="button"
                                  onClick={() => removeOrderingItem(index)}
                                  disabled={orderingItems.length <= 2}
                                >
                                  {t('delete')}
                                </button>
                              </div>
                            </div>
                          ))}
                          <button className="btn btn-secondary" type="button" onClick={addOrderingItem}>
                            {t('add_item')}
                          </button>
                        </div>
                      ) : null}
                      {questionType === "fill_blank" ? (
                        <div className="meta-block">
                          <p className="meta">{t('fill_blank_instruction')}</p>
                          {blankAnswers.map((answers, blankIndex) => (
                            <div className="blank-block" key={`blank-${blankIndex}`}>
                              <div className="blank-header">{t('blank')} {blankIndex + 1}</div>
                              <div className="option-list">
                                {answers.map((answer, answerIndex) => (
                                  <div className="option-row" key={`blank-${blankIndex}-${answerIndex}`}>
                                    <input
                                      className="input"
                                      placeholder={`${t('answer')} ${answerIndex + 1}`}
                                      value={answer}
                                      onChange={(event) =>
                                        updateBlankAnswer(blankIndex, answerIndex, event.target.value)
                                      }
                                    />
                                    <button
                                      className="btn btn-ghost"
                                      type="button"
                                      onClick={() => removeBlankAnswer(blankIndex, answerIndex)}
                                      disabled={answers.length <= 1}
                                    >
                                      {t('delete')}
                                    </button>
                                  </div>
                                ))}
                              </div>
                              <div className="row-actions">
                                <button
                                  className="btn btn-secondary"
                                  type="button"
                                  onClick={() => addBlankAnswer(blankIndex)}
                                >
                                  {t('add_answer')}
                                </button>
                                <button
                                  className="btn btn-ghost"
                                  type="button"
                                  onClick={() => removeBlank(blankIndex)}
                                  disabled={blankAnswers.length <= 1}
                                >
                                  {t('remove_blank')}
                                </button>
                              </div>
                            </div>
                          ))}
                          <button className="btn btn-secondary" type="button" onClick={addBlank}>
                            {t('add_blank')}
                          </button>
                        </div>
                      ) : null}
                      {questionType === "short_answer" ? (
                        <div className="option-list">
                          <p className="meta">{t('short_answer_instruction')}</p>
                          {shortAnswers.map((answer, index) => (
                            <div className="option-row" key={`short-${index}`}>
                              <input
                                className="input"
                                placeholder={`${t('answer')} ${index + 1}`}
                                value={answer}
                                onChange={(event) => updateShortAnswer(index, event.target.value)}
                              />
                              <button
                                className="btn btn-ghost"
                                type="button"
                                onClick={() => removeShortAnswer(index)}
                                disabled={shortAnswers.length <= 1}
                              >
                                {t('delete')}
                              </button>
                            </div>
                          ))}
                          <button className="btn btn-secondary" type="button" onClick={addShortAnswer}>
                            {t('add_answer')}
                          </button>
                        </div>
                      ) : null}
                      {questionType === "long_answer" ? (
                        <div className="option-list">
                          <p className="meta">{t('long_answer_instruction')}</p>
                          <textarea
                            className="input"
                            placeholder={t('evaluation_note_optional')}
                            rows={4}
                            value={longAnswerGuide}
                            onChange={(event) => setLongAnswerGuide(event.target.value)}
                          />
                          <div className="meta-block" style={{ marginTop: 10 }}>
                            <p className="meta">{t('rubric_criteria_optional')}</p>
                            {rubricItems.map((item, index) => (
                              <div className="option-row" key={`rubric-${index}`}>
                                <input className="input" placeholder={t('criteria')} value={item.criteria} onChange={e => updateRubricItem(index, 'criteria', e.target.value)} />
                                <input className="input" placeholder={t('points')} value={item.points} onChange={e => updateRubricItem(index, 'points', e.target.value)} type="number" style={{ width: 80 }} />
                                <input className="input" placeholder={t('description')} value={item.description} onChange={e => updateRubricItem(index, 'description', e.target.value)} />
                                <button className="btn btn-ghost" type="button" onClick={() => removeRubricItem(index)} disabled={rubricItems.length <= 1}>{t('delete')}</button>
                              </div>
                            ))}
                            <button className="btn btn-secondary" type="button" onClick={addRubricItem}>+ {t('add_criteria')}</button>
                          </div>
                        </div>
                      ) : null}
                      {questionType === "file_upload" ? (
                        <div className="meta-block">
                          <p className="meta">{t('file_upload_instruction')}</p>
                          <div className="option-list">
                            {fileAllowedTypes.map((item, index) => (
                              <div className="option-row" key={`file-type-${index}`}>
                                <input
                                  className="input"
                                  placeholder={`${t('allowed_type')} ${index + 1} (pdf, docx...)`}
                                  value={item}
                                  onChange={(event) => updateFileAllowedType(index, event.target.value)}
                                />
                                <button
                                  className="btn btn-ghost"
                                  type="button"
                                  onClick={() => removeFileAllowedType(index)}
                                  disabled={fileAllowedTypes.length <= 1}
                                >
                                  {t('delete')}
                                </button>
                              </div>
                            ))}
                          </div>
                          <button className="btn btn-secondary" type="button" onClick={addFileAllowedType}>
                            {t('add_type')}
                          </button>
                          <input
                            className="input"
                            type="number"
                            placeholder={t('max_files')}
                            value={fileMaxFiles}
                            onChange={(event) => setFileMaxFiles(event.target.value)}
                          />
                          <input
                            className="input"
                            type="number"
                            placeholder={t('max_size_mb')}
                            value={fileMaxSizeMb}
                            onChange={(event) => setFileMaxSizeMb(event.target.value)}
                          />
                        </div>
                      ) : null}
                      {questionType === "calculation" ? (
                        <div className="meta-block">
                          <p className="meta">{t('calculation_instruction')}</p>
                          <input
                            className="input"
                            placeholder={t('formula_example')}
                            value={calculationFormula}
                            onChange={(event) => setCalculationFormula(event.target.value)}
                          />
                          <div className="option-list">
                            {calculationVariables.map((variable, index) => (
                              <div className="option-row" key={`calc-${index}`}>
                                <div className="calc-row">
                                  <input
                                    className="input"
                                    placeholder={t('variable')}
                                    value={variable.name}
                                    onChange={(event) =>
                                      updateCalculationVariable(index, "name", event.target.value)
                                    }
                                  />
                                  <input
                                    className="input"
                                    placeholder={t('min')}
                                    value={variable.min}
                                    onChange={(event) =>
                                      updateCalculationVariable(index, "min", event.target.value)
                                    }
                                  />
                                  <input
                                    className="input"
                                    placeholder={t('max')}
                                    value={variable.max}
                                    onChange={(event) =>
                                      updateCalculationVariable(index, "max", event.target.value)
                                    }
                                  />
                                  <input
                                    className="input"
                                    placeholder={t('step')}
                                    value={variable.step}
                                    onChange={(event) =>
                                      updateCalculationVariable(index, "step", event.target.value)
                                    }
                                  />
                                </div>
                                <button
                                  className="btn btn-ghost"
                                  type="button"
                                  onClick={() => removeCalculationVariable(index)}
                                  disabled={calculationVariables.length <= 1}
                                >
                                  {t('delete')}
                                </button>
                              </div>
                            ))}
                            <button
                              className="btn btn-secondary"
                              type="button"
                              onClick={addCalculationVariable}
                            >
                              {t('add_variable')}
                            </button>
                          </div>
                        </div>
                      ) : null}
                      {questionType === "hotspot" ? (
                        <div className="meta-block">
                          <p className="meta">{t('hotspot_instruction')}</p>
                          <input
                            className="input"
                            placeholder={t('image_url')}
                            value={hotspotImageUrl}
                            onChange={(event) => setHotspotImageUrl(event.target.value)}
                          />
                          <div className="option-list">
                            {hotspotAreas.map((area, index) => (
                              <div className="option-row" key={`hotspot-${index}`}>
                                <div className="calc-row">
                                  <input
                                    className="input"
                                    placeholder="X"
                                    value={area.x}
                                    onChange={(event) => updateHotspotArea(index, "x", event.target.value)}
                                  />
                                  <input
                                    className="input"
                                    placeholder="Y"
                                    value={area.y}
                                    onChange={(event) => updateHotspotArea(index, "y", event.target.value)}
                                  />
                                  <input
                                    className="input"
                                    placeholder={t('width')}
                                    value={area.width}
                                    onChange={(event) =>
                                      updateHotspotArea(index, "width", event.target.value)
                                    }
                                  />
                                  <input
                                    className="input"
                                    placeholder={t('height')}
                                    value={area.height}
                                    onChange={(event) =>
                                      updateHotspotArea(index, "height", event.target.value)
                                    }
                                  />
                                </div>
                                <button
                                  className="btn btn-ghost"
                                  type="button"
                                  onClick={() => removeHotspotArea(index)}
                                  disabled={hotspotAreas.length <= 1}
                                >
                                  {t('delete')}
                                </button>
                              </div>
                            ))}
                            <button className="btn btn-secondary" type="button" onClick={addHotspotArea}>
                              {t('add_area')}
                            </button>
                          </div>
                        </div>
                      ) : null}
                      {questionType === "code" ? (
                        <div className="meta-block">
                          <p className="meta">{t('code_instruction')}</p>
                          <select
                            className="input"
                            value={codeLanguage}
                            onChange={(event) => setCodeLanguage(event.target.value)}
                          >
                            <option value="javascript">JavaScript</option>
                            <option value="typescript">TypeScript</option>
                            <option value="python">Python</option>
                            <option value="java">Java</option>
                          </select>
                          <textarea
                            className="input"
                            placeholder={t('starter_code_optional')}
                            rows={4}
                            value={codeStarter}
                            onChange={(event) => setCodeStarter(event.target.value)}
                          />
                          <div className="option-list">
                            {codeTests.map((test, index) => (
                              <div className="option-row" key={`code-test-${index}`}>
                                <div className="pair-row">
                                  <input
                                    className="input"
                                    placeholder="Input"
                                    value={test.input}
                                    onChange={(event) => updateCodeTest(index, "input", event.target.value)}
                                  />
                                  <input
                                    className="input"
                                    placeholder="Output"
                                    value={test.output}
                                    onChange={(event) => updateCodeTest(index, "output", event.target.value)}
                                  />
                                </div>
                                <button
                                  className="btn btn-ghost"
                                  type="button"
                                  onClick={() => removeCodeTest(index)}
                                  disabled={codeTests.length <= 1}
                                >
                                  {t('delete')}
                                </button>
                              </div>
                            ))}
                            <button className="btn btn-secondary" type="button" onClick={addCodeTest}>
                              {t('add_test')}
                            </button>
                          </div>
                        </div>
                      ) : null}
                      <input
                        className="input"
                        placeholder={t('exam_id_optional')}
                        value={questionExamId}
                        onChange={(event) => setQuestionExamId(event.target.value)}
                      />
                      <button
                        className="btn"
                        type="button"
                        onClick={handleCreateQuestion}
                        disabled={creatingQuestion}
                      >
                        {creatingQuestion ? t('saving') : t('create_question')}
                      </button>
                    </div>
                  ) : null
                ) : null}

                {canWrite && editingQuestionId ? (
                  <div className="form" ref={editQuestionFormRef}>
                    <h3>{t('edit_question')}</h3>
                    <input
                      className="input"
                      placeholder={t('question_text')}
                      value={editQuestionPrompt}
                      onChange={(event) => setEditQuestionPrompt(event.target.value)}
                    />
                    <select
                      className="input"
                      value={editQuestionType}
                      onChange={(event) => handleEditQuestionTypeChange(event.target.value as QuestionType)}
                    >
                      {questionTypeOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    {isChoiceQuestion(editQuestionType) ? (
                      <div className="option-list">
                        {isEditableChoiceQuestion(editQuestionType) ? (
                          <>
                            {editQuestionOptions.map((option, index) => (
                              <div className="option-row" key={`edit-option-${index}`}>
                                <input
                                  className="input"
                                  placeholder={t('option_placeholder', { number: index + 1 })}
                                  value={option}
                                  onChange={(event) => updateEditQuestionOption(index, event.target.value)}
                                />
                                <button
                                  className="btn btn-ghost"
                                  type="button"
                                  onClick={() => removeEditQuestionOption(index)}
                                  disabled={editQuestionOptions.length <= 2}
                                >
                                  {t('delete')}
                                </button>
                              </div>
                            ))}
                            <button className="btn btn-secondary" type="button" onClick={addEditQuestionOption}>
                              {t('add_option')}
                            </button>
                          </>
                        ) : null}
                        {editQuestionType === "true_false" ? (
                          <>
                            <p className="meta">{t('correct_false_select')}</p>
                            <div className="choice-box">
                              {trueFalseOptions.map((option) => (
                                <label className="choice-item" key={`edit-answer-${option}`}>
                                  <input
                                    type="radio"
                                    name="edit-question-answer"
                                    checked={editQuestionAnswer === option}
                                    onChange={() => setEditQuestionAnswer(option)}
                                  />
                                  <span>{option}</span>
                                </label>
                              ))}
                            </div>
                          </>
                        ) : editQuestionOptionList.length ? (
                          <>
                            <p className="meta">
                              {editQuestionType === "multiple_select"
                                ? t('multiple_select_instruction')
                                : t('single_select_instruction')}
                            </p>
                            <div className="choice-box">
                              {editQuestionType === "multiple_select"
                                ? editQuestionOptionList.map((option) => (
                                  <label className="choice-item" key={`edit-answer-${option}`}>
                                    <input
                                      type="checkbox"
                                      checked={editQuestionAnswerMulti.includes(option)}
                                      onChange={() => toggleEditQuestionAnswerMulti(option)}
                                    />
                                    <span>{option}</span>
                                  </label>
                                ))
                                : editQuestionOptionList.map((option) => (
                                  <label className="choice-item" key={`edit-answer-${option}`}>
                                    <input
                                      type="radio"
                                      name="edit-question-answer"
                                      checked={editQuestionAnswer === option}
                                      onChange={() => setEditQuestionAnswer(option)}
                                    />
                                    <span>{option}</span>
                                  </label>
                                ))}
                            </div>
                          </>
                        ) : (
                          <p className="meta">{t('fill_options_first')}</p>
                        )}
                      </div>
                    ) : null}
                    {editQuestionType === "matching" ? (
                      <div className="option-list">
                        <p className="meta">{t('matching_instruction')}</p>
                        {editMatchingPairs.map((pair, index) => (
                          <div className="option-row" key={`edit-match-${index}`}>
                            <div className="pair-row">
                              <input
                                className="input"
                                placeholder={`${t('left')} ${index + 1}`}
                                value={pair.left}
                                onChange={(event) => updateEditMatchingPair(index, "left", event.target.value)}
                              />
                              <input
                                className="input"
                                placeholder={`${t('right')} ${index + 1}`}
                                value={pair.right}
                                onChange={(event) => updateEditMatchingPair(index, "right", event.target.value)}
                              />
                            </div>
                            <button
                              className="btn btn-ghost"
                              type="button"
                              onClick={() => removeEditMatchingPair(index)}
                              disabled={editMatchingPairs.length <= 1}
                            >
                              {t('delete')}
                            </button>
                          </div>
                        ))}
                        <button className="btn btn-secondary" type="button" onClick={addEditMatchingPair}>
                          {t('add_pair')}
                        </button>
                      </div>
                    ) : null}
                    {editQuestionType === "ordering" ? (
                      <div className="option-list">
                        <p className="meta">{t('ordering_instruction')}</p>
                        {editOrderingItems.map((item, index) => (
                          <div className="option-row" key={`edit-order-${index}`}>
                            <input
                              className="input"
                              placeholder={`${t('item')} ${index + 1}`}
                              value={item}
                              onChange={(event) => updateEditOrderingItem(index, event.target.value)}
                            />
                            <div className="row-actions">
                              <button
                                className="btn btn-ghost"
                                type="button"
                                onClick={() => moveEditOrderingItem(index, index - 1)}
                                disabled={index === 0}
                              >
                                {t('move_up')}
                              </button>
                              <button
                                className="btn btn-ghost"
                                type="button"
                                onClick={() => moveEditOrderingItem(index, index + 1)}
                                disabled={index === editOrderingItems.length - 1}
                              >
                                {t('move_down')}
                              </button>
                              <button
                                className="btn btn-ghost"
                                type="button"
                                onClick={() => removeEditOrderingItem(index)}
                                disabled={editOrderingItems.length <= 2}
                              >
                                {t('delete')}
                              </button>
                            </div>
                          </div>
                        ))}
                        <button className="btn btn-secondary" type="button" onClick={addEditOrderingItem}>
                          {t('add_item')}
                        </button>
                      </div>
                    ) : null}
                    {editQuestionType === "fill_blank" ? (
                      <div className="meta-block">
                        <p className="meta">{t('fill_blank_instruction')}</p>
                        {editBlankAnswers.map((answers, blankIndex) => (
                          <div className="blank-block" key={`edit-blank-${blankIndex}`}>
                            <div className="blank-header">{t('blank')} {blankIndex + 1}</div>
                            <div className="option-list">
                              {answers.map((answer, answerIndex) => (
                                <div className="option-row" key={`edit-blank-${blankIndex}-${answerIndex}`}>
                                  <input
                                    className="input"
                                    placeholder={`${t('answer')} ${answerIndex + 1}`}
                                    value={answer}
                                    onChange={(event) =>
                                      updateEditBlankAnswer(blankIndex, answerIndex, event.target.value)
                                    }
                                  />
                                  <button
                                    className="btn btn-ghost"
                                    type="button"
                                    onClick={() => removeEditBlankAnswer(blankIndex, answerIndex)}
                                    disabled={answers.length <= 1}
                                  >
                                    Sil
                                  </button>
                                </div>
                              ))}
                            </div>
                            <div className="row-actions">
                              <button
                                className="btn btn-secondary"
                                type="button"
                                onClick={() => addEditBlankAnswer(blankIndex)}
                              >
                                {t('add_answer')}
                              </button>
                              <button
                                className="btn btn-ghost"
                                type="button"
                                onClick={() => removeEditBlank(blankIndex)}
                                disabled={editBlankAnswers.length <= 1}
                              >
                                {t('remove_blank')}
                              </button>
                            </div>
                          </div>
                        ))}
                        <button className="btn btn-secondary" type="button" onClick={addEditBlank}>
                          {t('add_blank')}
                        </button>
                      </div>
                    ) : null}
                    {editQuestionType === "short_answer" ? (
                      <div className="option-list">
                        <p className="meta">{t('short_answer_instruction')}</p>
                        {editShortAnswers.map((answer, index) => (
                          <div className="option-row" key={`edit-short-${index}`}>
                            <input
                              className="input"
                              placeholder={`Cevap ${index + 1}`}
                              value={answer}
                              onChange={(event) => updateEditShortAnswer(index, event.target.value)}
                            />
                            <button
                              className="btn btn-ghost"
                              type="button"
                              onClick={() => removeEditShortAnswer(index)}
                              disabled={editShortAnswers.length <= 1}
                            >
                              Sil
                            </button>
                          </div>
                        ))}
                        <button className="btn btn-secondary" type="button" onClick={addEditShortAnswer}>
                          {t('add_answer')}
                        </button>
                      </div>
                    ) : null}
                    {editQuestionType === "long_answer" ? (
                      <div className="option-list">
                        <p className="meta">{t('long_answer_instruction')}</p>
                        <textarea
                          className="input"
                          placeholder={t('evaluation_note_optional')}
                          rows={4}
                          value={editLongAnswerGuide}
                          onChange={(event) => setEditLongAnswerGuide(event.target.value)}
                        />
                        <div className="meta-block" style={{ marginTop: 10 }}>
                          <p className="meta">{t('rubrics')}</p>
                          {editRubricItems.map((item, index) => (
                            <div className="option-row" key={`edit-rubric-${index}`}>
                              <input className="input" placeholder={t('criteria')} value={item.criteria} onChange={e => updateEditRubricItem(index, 'criteria', e.target.value)} />
                              <input className="input" placeholder={t('points')} value={item.points} onChange={e => updateEditRubricItem(index, 'points', e.target.value)} type="number" style={{ width: 80 }} />
                              <input className="input" placeholder={t('description_optional')} value={item.description} onChange={e => updateEditRubricItem(index, 'description', e.target.value)} />
                              <button className="btn btn-ghost" type="button" onClick={() => removeEditRubricItem(index)} disabled={editRubricItems.length <= 1}>{t('delete')}</button>
                            </div>
                          ))}
                          <button className="btn btn-secondary" type="button" onClick={addEditRubricItem}>{t('add_criteria')}</button>
                        </div>
                      </div>
                    ) : null}
                    {editQuestionType === "file_upload" ? (
                      <div className="meta-block">
                        <p className="meta">{t('file_upload_instruction')}</p>
                        <div className="option-list">
                          {editFileAllowedTypes.map((item, index) => (
                            <div className="option-row" key={`edit-file-type-${index}`}>
                              <input
                                className="input"
                                placeholder={`${t('allowed_type')} ${index + 1} (pdf, docx...)`}
                                value={item}
                                onChange={(event) => updateEditFileAllowedType(index, event.target.value)}
                              />
                              <button
                                className="btn btn-ghost"
                                type="button"
                                onClick={() => removeEditFileAllowedType(index)}
                                disabled={editFileAllowedTypes.length <= 1}
                              >
                                Sil
                              </button>
                            </div>
                          ))}
                        </div>
                        <button
                          className="btn btn-secondary"
                          type="button"
                          onClick={addEditFileAllowedType}
                        >
                          {t('add_type')}
                        </button>
                        <input
                          className="input"
                          placeholder={t('max_files')}
                          value={editFileMaxFiles}
                          onChange={(event) => setEditFileMaxFiles(event.target.value)}
                        />
                        <input
                          className="input"
                          placeholder={t('max_size_mb')}
                          value={editFileMaxSizeMb}
                          onChange={(event) => setEditFileMaxSizeMb(event.target.value)}
                        />
                      </div>
                    ) : null}
                    {editQuestionType === "calculation" ? (
                      <div className="meta-block">
                        <p className="meta">{t('calculation_instruction')}</p>
                        <input
                          className="input"
                          placeholder={t('formula_example')}
                          value={editCalculationFormula}
                          onChange={(event) => setEditCalculationFormula(event.target.value)}
                        />
                        <div className="option-list">
                          {editCalculationVariables.map((variable, index) => (
                            <div className="option-row" key={`edit-calc-${index}`}>
                              <div className="calc-row">
                                <input
                                  className="input"
                                  placeholder={t('variable')}
                                  value={variable.name}
                                  onChange={(event) =>
                                    updateEditCalculationVariable(index, "name", event.target.value)
                                  }
                                />
                                <input
                                  className="input"
                                  placeholder="Min"
                                  value={variable.min}
                                  onChange={(event) =>
                                    updateEditCalculationVariable(index, "min", event.target.value)
                                  }
                                />
                                <input
                                  className="input"
                                  placeholder="Max"
                                  value={variable.max}
                                  onChange={(event) =>
                                    updateEditCalculationVariable(index, "max", event.target.value)
                                  }
                                />
                                <input
                                  className="input"
                                  placeholder={t('step')}
                                  value={variable.step}
                                  onChange={(event) =>
                                    updateEditCalculationVariable(index, "step", event.target.value)
                                  }
                                />
                              </div>
                              <button
                                className="btn btn-ghost"
                                type="button"
                                onClick={() => removeEditCalculationVariable(index)}
                                disabled={editCalculationVariables.length <= 1}
                              >
                                Sil
                              </button>
                            </div>
                          ))}
                          <button
                            className="btn btn-secondary"
                            type="button"
                            onClick={addEditCalculationVariable}
                          >
                            {t('add_variable')}
                          </button>
                        </div>
                      </div>
                    ) : null}
                    {editQuestionType === "hotspot" ? (
                      <div className="meta-block">
                        <p className="meta">{t('hotspot_instruction')}</p>
                        <input
                          className="input"
                          placeholder={t('image_url')}
                          value={editHotspotImageUrl}
                          onChange={(event) => setEditHotspotImageUrl(event.target.value)}
                        />
                        <div className="option-list">
                          {editHotspotAreas.map((area, index) => (
                            <div className="option-row" key={`edit-hotspot-${index}`}>
                              <div className="calc-row">
                                <input
                                  className="input"
                                  placeholder="X"
                                  value={area.x}
                                  onChange={(event) => updateEditHotspotArea(index, "x", event.target.value)}
                                />
                                <input
                                  className="input"
                                  placeholder="Y"
                                  value={area.y}
                                  onChange={(event) => updateEditHotspotArea(index, "y", event.target.value)}
                                />
                                <input
                                  className="input"
                                  placeholder={t('width')}
                                  value={area.width}
                                  onChange={(event) =>
                                    updateEditHotspotArea(index, "width", event.target.value)
                                  }
                                />
                                <input
                                  className="input"
                                  placeholder={t('height')}
                                  value={area.height}
                                  onChange={(event) =>
                                    updateEditHotspotArea(index, "height", event.target.value)
                                  }
                                />
                              </div>
                              <button
                                className="btn btn-ghost"
                                type="button"
                                onClick={() => removeEditHotspotArea(index)}
                                disabled={editHotspotAreas.length <= 1}
                              >
                                Sil
                              </button>
                            </div>
                          ))}
                          <button className="btn btn-secondary" type="button" onClick={addEditHotspotArea}>
                            {t('add_area')}
                          </button>
                        </div>
                      </div>
                    ) : null}
                    {editQuestionType === "code" ? (
                      <div className="meta-block">
                        <p className="meta">{t('code_instruction')}</p>
                        <select
                          className="input"
                          value={editCodeLanguage}
                          onChange={(event) => setEditCodeLanguage(event.target.value)}
                        >
                          <option value="javascript">JavaScript</option>
                          <option value="typescript">TypeScript</option>
                          <option value="python">Python</option>
                          <option value="java">Java</option>
                        </select>
                        <textarea
                          className="input"
                          placeholder={t('starter_code_optional')}
                          rows={4}
                          value={editCodeStarter}
                          onChange={(event) => setEditCodeStarter(event.target.value)}
                        />
                        <div className="option-list">
                          {editCodeTests.map((test, index) => (
                            <div className="option-row" key={`edit-code-test-${index}`}>
                              <div className="pair-row">
                                <input
                                  className="input"
                                  placeholder="Input"
                                  value={test.input}
                                  onChange={(event) => updateEditCodeTest(index, "input", event.target.value)}
                                />
                                <input
                                  className="input"
                                  placeholder="Output"
                                  value={test.output}
                                  onChange={(event) =>
                                    updateEditCodeTest(index, "output", event.target.value)
                                  }
                                />
                              </div>
                              <button
                                className="btn btn-ghost"
                                type="button"
                                onClick={() => removeEditCodeTest(index)}
                                disabled={editCodeTests.length <= 1}
                              >
                                Sil
                              </button>
                            </div>
                          ))}
                          <button className="btn btn-secondary" type="button" onClick={addEditCodeTest}>
                            {t('add_test')}
                          </button>
                        </div>
                      </div>
                    ) : null}
                    <input
                      className="input"
                      placeholder="Exam ID (opsiyonel)"
                      value={editQuestionExamId}
                      onChange={(event) => setEditQuestionExamId(event.target.value)}
                    />

                    {/* TAGS UI */}
                    <div className="meta-block" style={{ marginTop: '16px', borderTop: '1px solid #eee', paddingTop: '16px' }}>
                      <p className="meta">{t('question_tags')}</p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                        {editQuestionTags.map(tag => (
                          <span key={tag.id} className="badge" style={{ background: tag.color || '#eee', color: '#333' }}>
                            {tag.name}
                            <button style={{ marginLeft: '4px', cursor: 'pointer' }} onClick={async () => {
                              if (!apiClient || !editingQuestionId) return;
                              try {
                                await apiClient.del(`/question-bank/questions/${editingQuestionId}/tag`, {
                                  headers: { Authorization: `Bearer ${readToken()}` },
                                  body: { tagId: tag.id }
                                });
                                setEditQuestionTags(prev => prev.filter(t => t.id !== tag.id));
                              } catch (e) { alert(t('delete_failed')); }
                            }}>✕</button>
                          </span>
                        ))}
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <select id="add-tag-select" className="input" style={{ flex: 1 }}>
                          <option value="">{t('tag_select')}</option>
                          {allTags.filter(t => !editQuestionTags.find(et => et.id === t.id)).map(t => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                        </select>
                        <button className="btn btn-secondary" type="button" onClick={async () => {
                          const select = document.getElementById("add-tag-select") as HTMLSelectElement;
                          const val = select.value;
                          if (!val || !apiClient || !editingQuestionId) return;
                          const tagObj = allTags.find(t => t.id === val);
                          try {
                            await apiClient.post(`/question-bank/questions/${editingQuestionId}/tag`, { tagId: val }, {
                              headers: { Authorization: `Bearer ${readToken()}` }
                            });
                            if (tagObj) setEditQuestionTags(prev => [...prev, tagObj]);
                            select.value = "";
                          } catch (e) { alert(t('add_failed')); }
                        }}>{t('add')}</button>
                      </div>
                    </div>

                    <button
                      className="btn"
                      type="button"
                      onClick={handleUpdateQuestion}
                      disabled={updatingQuestionId === editingQuestionId}
                    >
                      {updatingQuestionId === editingQuestionId ? t('updating') : t('update_question')}
                    </button>
                    <button className="btn" type="button" onClick={cancelEditQuestion}>
                      {t('cancel')}
                    </button>
                  </div>
                ) : null}
              </div>
            </>
          )
        }

        <button className="btn" type="button" onClick={loadData} disabled={loading}>
          {t('refresh')}
        </button>
        <div style={{ marginTop: 12 }}>
          <Link href="/">{t('return_to_login')}</Link>
        </div>


        {showModuleEditor && selectedCourse && apiBaseUrl && (
          <CourseModulesEditor
            courseId={selectedCourse.id}
            apiBaseUrl={apiBaseUrl}
            token={readToken() || ''}
            onClose={() => {
              setShowModuleEditor(false);
              void loadData();
            }}
          />
        )}

        {
          playingContent && apiBaseUrl && (
            <div style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0,0,0,0.95)',
              zIndex: 9999,
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              padding: 0
            }}>
              {/* Absolute Close Button - Enhanced Visibility */}
              <button
                onClick={() => setPlayingContent(null)}
                style={{
                  position: 'absolute',
                  top: '20px',
                  right: '25px',
                  background: '#dc2626',
                  border: '2px solid white',
                  borderRadius: '50%',
                  width: '44px',
                  height: '44px',
                  color: 'white',
                  fontSize: '24px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  zIndex: 10001,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
                }}
                title={t('close')}
              >
                ✕
              </button>

              {/* Player Container - Full Screen */}
              <div style={{
                width: '100vw',
                height: '100vh',
                maxWidth: 'none',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                background: 'black'
              }}>
                <ContentPlayer
                  content={playingContent}
                  apiBaseUrl={apiBaseUrl!}
                  token={readToken()}
                  onComplete={() => setPlayingContent(null)}
                />
              </div>
            </div>
          )
        }


      </div> {/* End Main Content */}

      {/* Exam Submissions Modal */}
      {viewingSubmissionsExam && apiBaseUrl && (
        <ExamSubmissions
          examId={viewingSubmissionsExam.id}
          examTitle={viewingSubmissionsExam.title}
          apiBase={apiBaseUrl}
          token={readToken() || ''}
          onClose={() => setViewingSubmissionsExam(null)}
        />
      )}
    </main>
  );
}
