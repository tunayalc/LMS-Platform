import { StatusBar } from "expo-status-bar";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { Video, ResizeMode } from "expo-av";
import * as FileSystem from "expo-file-system/legacy";
import "./i18n";
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from "react-i18next";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  AppState,
  AppStateStatus,
  Alert,
  Linking
} from "react-native";

import { getApiBaseUrl, apiClient, loadServerUrl, setApiBaseUrl } from "./api/client";
import { omrBaseUrl, uploadOmrScan } from "./api/omrClient";
import { getEnv, getRuntime } from "./config/env";
import { questionTypeOptions, trueFalseOptions } from "./shared";
import type {
  AuthLoginResponse,
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
} from "./shared";
import { OfflineManager } from "./utils/offline";
import { NotificationManager } from "./utils/notifications";
import { BiometricManager } from "./utils/biometric";
import OpticReaderScreen from "./screens/OpticReaderScreen";
import PdfViewerScreen from "./screens/PdfViewerScreen";
import ExamTakingScreen from "./screens/ExamTakingScreen";
import { ThemeProvider, useTheme } from "./contexts/ThemeContext";
import ThemeToggle from "./components/ThemeToggle";
import ServerSettingsModal from "./components/ServerSettingsModal";

const roleOptions: Role[] = ["SuperAdmin", "Admin", "Instructor", "Assistant", "Student", "Guest"];
type EditTarget = "course" | "content" | "exam" | "question" | null;
const defaultQuestionType = questionTypeOptions[0]?.value ?? "multiple_choice";
const questionTypeLabelMap = new Map(
  questionTypeOptions.map((option) => [option.value, option.label])
);
const contentTypeOptions = ["video", "pdf", "live_class", "scorm"] as const;
const normalizeQuestionType = (value: string) =>
  questionTypeLabelMap.has(value as QuestionType) ? (value as QuestionType) : defaultQuestionType;
type MatchingPairInput = { left: string; right: string };
type CalculationVariableInput = { name: string; min: string; max: string; step: string };
type HotspotAreaInput = { x: string; y: string; width: string; height: string };
type CodeTestInput = { input: string; output: string };
const isChoiceQuestion = (value: QuestionType) =>
  value === "multiple_choice" || value === "multiple_select" || value === "true_false";
const isEditableChoiceQuestion = (value: QuestionType) =>
  value === "multiple_choice" || value === "multiple_select";
const formatAnswer = (value: Question["answer"]) => {
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  if (typeof value === "boolean") {
    return value ? "Doğru" : "Yanlış";
  }
  if (value === undefined) {
    return "";
  }
  return String(value);
};
const formatQuestionMetaLines = (question: Question) => {
  const meta = question.meta as QuestionMeta | undefined;
  if (!meta) {
    return [];
  }
  if (question.type === "matching" && meta.matchingPairs?.length) {
    const pairs = meta.matchingPairs
      .map((pair) => `${pair.left} -> ${pair.right}`)
      .join(" | ");
    return [`Eşleşme: ${pairs}`];
  }
  if (question.type === "ordering" && meta.orderingItems?.length) {
    return [`Sıralama: ${meta.orderingItems.join(" > ")}`];
  }
  if (question.type === "fill_blank" && meta.blankAnswers?.length) {
    const blanks = meta.blankAnswers
      .map((answers, index) => `Boşluk ${index + 1}: ${answers.join(" / ")}`)
      .join(" | ");
    return [blanks];
  }
  if (question.type === "short_answer" && meta.shortAnswers?.length) {
    return [`Kısa cevaplar: ${meta.shortAnswers.join(", ")}`];
  }
  if (question.type === "long_answer" && meta.longAnswerGuide) {
    return [`Uzun cevap notu: ${meta.longAnswerGuide}`];
  }
  if (question.type === "file_upload" && meta.fileUpload) {
    const parts = [];
    if (meta.fileUpload.allowedTypes?.length) {
      parts.push(`Tür: ${meta.fileUpload.allowedTypes.join(", ")}`);
    }
    if (meta.fileUpload.maxFiles) {
      parts.push(`Maks dosya: ${meta.fileUpload.maxFiles}`);
    }
    if (meta.fileUpload.maxSizeMb) {
      parts.push(`Maks boyut: ${meta.fileUpload.maxSizeMb}MB`);
    }
    return parts.length ? [`Dosya: ${parts.join(" | ")}`] : [];
  }
  if (question.type === "calculation" && meta.calculation?.formula) {
    return [`Formül: ${meta.calculation.formula}`];
  }
  if (question.type === "hotspot" && meta.hotspot?.imageUrl) {
    return [
      `Hotspot: ${meta.hotspot.imageUrl} (${meta.hotspot.areas?.length ?? 0} alan)`
    ];
  }
  if (question.type === "code" && meta.code?.language) {
    return [
      `Kod: ${meta.code.language} (${meta.code.tests?.length ?? 0} test)`
    ];
  }
  return [];
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
const normalizePairs = (pairs?: MatchingPairInput[]) => {
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
const normalizeVariables = (vars?: CalculationVariableInput[]) => {
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
const resolveScrollOffset = (offset?: number) => (offset && offset > 0 ? offset - 12 : 0);
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

function AppContent() {
  const { t, i18n } = useTranslation();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const scrollRef = useRef<ScrollView>(null);
  const runtime = useMemo(() => getRuntime(), []);
  const authMode = useMemo(() => {
    try {
      return getEnv().LMS_AUTH_MODE ?? "mock";
    } catch {
      return "mock";
    }
  }, []);
  const roleOptionsText = useMemo(() => roleOptions.join("/"), []);
  const [username, setUsername] = useState("");
  const [showPdf, setShowPdf] = useState(false);
  const [pdfParams, setPdfParams] = useState<{ uri: string; title: string } | null>(null);
  const [password, setPassword] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isRegisterMode, setIsRegisterMode] = useState(false); // Kayıt modu
  const [registerRole, setRegisterRole] = useState<Role>("Student"); // Kayıt rolü
  const [showSettings, setShowSettings] = useState(false);
  const [showCamera, setShowCamera] = useState(false); // New State
  const [takingExam, setTakingExam] = useState(false); // Exam Taking Mode
  const [user, setUser] = useState<AuthLoginResponse["user"] | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [version, setVersion] = useState<VersionResponse | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'detail' | 'exam_detail' | 'omr'>('list');
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [selectedExam, setSelectedExam] = useState<Exam | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [browseCourses, setBrowseCourses] = useState<Course[]>([]);
  const [courseTitle, setCourseTitle] = useState("");
  const [courseDescription, setCourseDescription] = useState("");
  const [contentItems, setContentItems] = useState<Content[]>([]);
  const [contentTitle, setContentTitle] = useState("");
  const [contentType, setContentType] = useState<(typeof contentTypeOptions)[number]>(
    contentTypeOptions[0]
  );
  const [contentSource, setContentSource] = useState("");
  const [meetingUrl, setMeetingUrl] = useState("");
  const [contentFile, setContentFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [newUserName, setNewUserName] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState<Role>("Student");
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editUserName, setEditUserName] = useState("");
  const [editUserPassword, setEditUserPassword] = useState("");
  const [editUserRole, setEditUserRole] = useState<Role>("Student");
  const [exams, setExams] = useState<Exam[]>([]);
  const [examTitle, setExamTitle] = useState("");
  const [examCourseId, setExamCourseId] = useState("");
  const [examDuration, setExamDuration] = useState("");
  const [examPassThreshold, setExamPassThreshold] = useState("");
  const [examStartDate, setExamStartDate] = useState("");
  const [examEndDate, setExamEndDate] = useState("");
  const [examMaxAttempts, setExamMaxAttempts] = useState("1");
  const [examIsDraft, setExamIsDraft] = useState(true);
  const [examResultsVisibleAt, setExamResultsVisibleAt] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [questionPrompt, setQuestionPrompt] = useState("");
  const [questionPoints, setQuestionPoints] = useState("10");
  const [questionType, setQuestionType] = useState<QuestionType>(defaultQuestionType);
  const [questionOptions, setQuestionOptions] = useState<string[]>(["", ""]);
  const [questionAnswer, setQuestionAnswer] = useState("");
  const [questionAnswerMulti, setQuestionAnswerMulti] = useState<string[]>([]);
  const [questionExamId, setQuestionExamId] = useState("");
  const [matchingPairs, setMatchingPairs] = useState<MatchingPairInput[]>(normalizePairs());
  const [orderingItems, setOrderingItems] = useState<string[]>(normalizeList(undefined, 2));
  const [blankAnswers, setBlankAnswers] = useState<string[][]>(normalizeBlankAnswers());
  const [shortAnswers, setShortAnswers] = useState<string[]>(normalizeList(undefined, 1));
  const [longAnswerGuide, setLongAnswerGuide] = useState("");
  const [fileAllowedTypes, setFileAllowedTypes] = useState<string[]>(normalizeList(undefined, 1));
  const [fileMaxFiles, setFileMaxFiles] = useState("");
  const [fileMaxSizeMb, setFileMaxSizeMb] = useState("");
  const [calculationFormula, setCalculationFormula] = useState("");
  const [calculationVariables, setCalculationVariables] = useState<CalculationVariableInput[]>(
    normalizeVariables()
  );
  const [hotspotImageUrl, setHotspotImageUrl] = useState("");
  const [hotspotAreas, setHotspotAreas] = useState<HotspotAreaInput[]>(normalizeHotspotAreas());
  const [codeLanguage, setCodeLanguage] = useState("javascript");
  const [codeStarter, setCodeStarter] = useState("");
  const [codeTests, setCodeTests] = useState<CodeTestInput[]>(normalizeCodeTests());
  const [pendingScrollTarget, setPendingScrollTarget] = useState<EditTarget>(null);
  const [editCourseOffset, setEditCourseOffset] = useState(0);
  const [editContentOffset, setEditContentOffset] = useState(0);
  const [editExamOffset, setEditExamOffset] = useState(0);
  const [editQuestionOffset, setEditQuestionOffset] = useState(0);
  const [omrResult, setOmrResult] = useState<string | null>(null);
  const [omrImageUri, setOmrImageUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [creatingCourse, setCreatingCourse] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);
  const [creatingContent, setCreatingContent] = useState(false);
  const [creatingExam, setCreatingExam] = useState(false);
  const [creatingQuestion, setCreatingQuestion] = useState(false);
  const [deletingCourseId, setDeletingCourseId] = useState<string | null>(null);
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [editCourseTitle, setEditCourseTitle] = useState("");
  const [editCourseDescription, setEditCourseDescription] = useState("");
  const [updatingCourseId, setUpdatingCourseId] = useState<string | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [deletingContentId, setDeletingContentId] = useState<string | null>(null);
  const [editingContentId, setEditingContentId] = useState<string | null>(null);
  const [editContentTitle, setEditContentTitle] = useState("");
  const [editContentType, setEditContentType] = useState<string>(contentTypeOptions[0]);
  const [editContentSource, setEditContentSource] = useState("");
  const [editMeetingUrl, setEditMeetingUrl] = useState("");
  const [updatingContentId, setUpdatingContentId] = useState<string | null>(null);
  const [deletingExamId, setDeletingExamId] = useState<string | null>(null);
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
  const [updatingExamId, setUpdatingExamId] = useState<string | null>(null);
  const [deletingQuestionId, setDeletingQuestionId] = useState<string | null>(null);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [editQuestionPrompt, setEditQuestionPrompt] = useState("");
  const [editQuestionType, setEditQuestionType] = useState<QuestionType>(defaultQuestionType);
  const [editQuestionOptions, setEditQuestionOptions] = useState<string[]>(["", ""]);
  const [editQuestionAnswer, setEditQuestionAnswer] = useState("");
  const [editQuestionAnswerMulti, setEditQuestionAnswerMulti] = useState<string[]>([]);
  const [editQuestionExamId, setEditQuestionExamId] = useState("");
  const [editMatchingPairs, setEditMatchingPairs] =
    useState<MatchingPairInput[]>(normalizePairs());
  const [editOrderingItems, setEditOrderingItems] = useState<string[]>(
    normalizeList(undefined, 2)
  );
  const [editBlankAnswers, setEditBlankAnswers] = useState<string[][]>(normalizeBlankAnswers());
  const [editShortAnswers, setEditShortAnswers] = useState<string[]>(normalizeList(undefined, 1));
  const [editLongAnswerGuide, setEditLongAnswerGuide] = useState("");
  const [editFileAllowedTypes, setEditFileAllowedTypes] = useState<string[]>(
    normalizeList(undefined, 1)
  );
  const [editFileMaxFiles, setEditFileMaxFiles] = useState("");
  const [editFileMaxSizeMb, setEditFileMaxSizeMb] = useState("");
  const [editCalculationFormula, setEditCalculationFormula] = useState("");
  const [editCalculationVariables, setEditCalculationVariables] =
    useState<CalculationVariableInput[]>(normalizeVariables());
  const [editHotspotImageUrl, setEditHotspotImageUrl] = useState("");
  const [editHotspotAreas, setEditHotspotAreas] =
    useState<HotspotAreaInput[]>(normalizeHotspotAreas());
  const [editCodeLanguage, setEditCodeLanguage] = useState("javascript");
  const [editCodeStarter, setEditCodeStarter] = useState("");
  const [editCodeTests, setEditCodeTests] = useState<CodeTestInput[]>(normalizeCodeTests());
  const [updatingQuestionId, setUpdatingQuestionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [biometricAvailable, setBiometricAvailable] = useState(false);

  // Student Exam States
  const [examStarted, setExamStarted] = useState(false);
  const [examAnswers, setExamAnswers] = useState<Record<string, any>>({});
  const [examSubmissionResult, setExamSubmissionResult] = useState<{ score: number; passed: boolean } | null>(null);
  const [examSubmitting, setExamSubmitting] = useState(false);

  const loadStatus = useCallback(async () => {
    setError(null);
    try {
      const [healthResult, versionResult] = await Promise.all([
        apiClient.get<HealthResponse>("/health"),
        apiClient.get<VersionResponse>("/version")
      ]);
      setHealth(healthResult);
      setVersion(versionResult);
    } catch (err) {
      setError(parseApiError(err, "Request failed"));
    }
  }, []);

  const loadData = useCallback(async (authToken?: string, role?: string) => {
    if (!authToken) {
      setError("Token bulunamadı. Giriş ekranından tekrar login ol.");
      return;
    }
    setError(null);
    try {
      const headers = { Authorization: `Bearer ${authToken}` };
      const isAdmin = role ? ["superadmin", "admin"].includes(role.toLowerCase()) : false;
      const isStudent = role ? role.toLowerCase() === 'student' : false;

      const usersRequest = isAdmin
        ? apiClient.get<{ users: User[] }>("/users", { headers })
        : Promise.resolve({ users: [] });

      const courseRequest = apiClient.get<{ courses: Course[] }>("/courses", {
        headers,
        params: isStudent ? { mode: 'enrolled' } : undefined
      });

      const browseRequest = isStudent
        ? apiClient.get<{ courses: Course[] }>("/courses", {
          headers,
          params: { mode: 'browse' }
        })
        : Promise.resolve({ courses: [] });

      const [coursesResult, browseResult, contentResult, examsResult, questionsResult, usersResult] =
        await Promise.all([
          courseRequest,
          browseRequest,
          apiClient.get<{ content: Content[] }>("/content", { headers }),
          apiClient.get<{ exams: Exam[] }>("/exams", { headers }),
          apiClient.get<{ questions: Question[] }>("/questions", { headers }),
          usersRequest
        ]);
      setCourses(coursesResult.courses);
      setBrowseCourses(browseResult.courses);
      setContentItems(contentResult.content);
      setExams(examsResult.exams);
      setQuestions(questionsResult.questions);
      setUsers(usersResult.users);
    } catch (err) {
      setError(parseApiError(err, "Liste verisi çekilemedi."));
    }
  }, []);

  // Load saved server URL at startup (if any)
  useEffect(() => {
    loadServerUrl().catch(() => {
      // Ignore storage errors: fallback to default URL.
    });
  }, []);

  useEffect(() => {
    // Biometric Check
    BiometricManager.checkHardware().then(async (hasHardware) => {
      if (hasHardware) {
        const isEnrolled = await BiometricManager.checkEnrollment();
        setBiometricAvailable(isEnrolled);
      }
    });

    // Notifications Configuration
    const setupNotifications = async () => {
      const token = await NotificationManager.registerForPushNotificationsAsync();
      if (token) {
        setPushToken(token);
      }
    };
    setupNotifications();
  }, []);

  // Sync Push Token when logged in
  useEffect(() => {
    if (token && pushToken && user) {
      apiClient.post("/users/push-token", { token: pushToken })
        .then(() => console.log("Push token synced"))
        .catch(err => console.log("Push token sync error", err));
    }
  }, [token, pushToken, user]);

  const handleLogin = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!username.trim() || !password.trim()) {
        setError("Kullanıcı adı ve şifre gerekli.");
        return;
      }
      const response = await apiClient.post<AuthLoginResponse>("/auth/login", {
        username,
        password
      });
      // @ts-ignore
      const token = response.accessToken || response.token;
      setUser(response.user);
      setToken(token);
      setIsLoggedIn(true);

      // Securely store credentials for biometric access
      await BiometricManager.saveCredentials(username, password);

      await loadStatus();
      await loadData(token, response.user.role);
    } catch (err) {
      setError(parseApiError(err, "Giriş başarısız."));
    } finally {
      setLoading(false);
    }
  }, [username, password]); // Added deps

  const handleBiometricLogin = useCallback(async () => {
    const hasHardware = await BiometricManager.checkHardware();
    if (!hasHardware) return;

    const authenticated = await BiometricManager.authenticate();
    if (authenticated) {
      try {
        const creds = await BiometricManager.getCredentials();

        if (creds) {
          setUsername(creds.username);
          setPassword(creds.password);

          setLoading(true);
          const response = await apiClient.post<AuthLoginResponse>("/auth/login", {
            username: creds.username,
            password: creds.password
          });
          // @ts-ignore
          const token = response.accessToken || response.token;
          setUser(response.user);
          setToken(token);
          setIsLoggedIn(true);
          await loadStatus();
          await loadData(token, response.user.role);
        } else {
          Alert.alert("Bilgi", "Biyometrik giriş için önce bir kez normal giriş yapmalısınız.");
        }
      } catch (e) {
        setError("Biyometrik giriş sonrası sunucu hatası.");
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (examStarted && nextAppState.match(/inactive|background/)) {
        Alert.alert(
          "Uyarı",
          "Sınav esnasında uygulamadan çıkamazsınız! Bu hareket kaydedildi.",
          [{ text: "Tamam" }]
        );
      }
    });

    return () => {
      subscription.remove();
    };
  }, [examStarted]);

  const handleRegister = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!username.trim() || !password.trim()) {
        setError("Kullanıcı adı ve şifre gerekli.");
        return;
      }
      if (password.length < 8) {
        setError("Şifre en az 8 karakter olmalıdır.");
        return;
      }
      if (!/[A-Z]/.test(password)) {
        setError("Şifre en az bir büyük harf içermelidir.");
        return;
      }
      if (!/[a-z]/.test(password)) {
        setError("Şifre en az bir küçük harf içermelidir.");
        return;
      }
      if (!/[.!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
        setError("Şifre en az bir özel karakter (., !, @ vb.) içermelidir.");
        return;
      }

      await apiClient.post("/auth/register", {
        username,
        password,
        role: registerRole
      });

      Alert.alert("Başarılı", "Kayıt başarılı! Şimdi giriş yapabilirsiniz.", [
        { text: "Tamam", onPress: () => setIsRegisterMode(false) }
      ]);
      setPassword("");
    } catch (err) {
      setError(parseApiError(err, "Kayıt başarısız."));
    } finally {
      setLoading(false);
    }
  }, [username, password, registerRole]);

  const handleLogout = useCallback(() => {
    setIsLoggedIn(false);
    setPassword("");
    setUser(null);
    setToken(null);
    setHealth(null);
    setVersion(null);
    setCourses([]);
    setContentItems([]);
    setExams([]);
    setQuestions([]);
    setUsers([]);
    setCourseTitle("");
    setCourseDescription("");
    setContentTitle("");
    setContentType(contentTypeOptions[0]);
    setContentSource("");
    setNewUserName("");
    setNewUserPassword("");
    setNewUserRole("Student");
    setExamTitle("");
    setExamCourseId("");
    setQuestionPrompt("");
    setQuestionType(defaultQuestionType);
    setQuestionOptions(normalizeOptionList());
    setQuestionAnswer("");
    setQuestionAnswerMulti([]);
    setQuestionExamId("");
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
    setEditingCourseId(null);
    setEditCourseTitle("");
    setEditCourseDescription("");
    setUpdatingCourseId(null);
    setEditingContentId(null);
    setEditContentTitle("");
    setEditContentType(contentTypeOptions[0]);
    setEditContentSource("");
    setUpdatingContentId(null);
    setDeletingContentId(null);
    setEditingUserId(null);
    setEditUserName("");
    setEditUserPassword("");
    setEditUserRole("Student");
    setUpdatingUserId(null);
    setDeletingUserId(null);
    setEditingExamId(null);
    setEditExamTitle("");
    setEditExamCourseId("");
    setUpdatingExamId(null);
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
    setUpdatingQuestionId(null);
    setOmrResult(null);
    setOmrImageUri(null);
    setError(null);
  }, []);

  const pickImage = useCallback(async (source: "camera" | "library") => {
    setLoading(true);
    setError(null);
    try {
      if (source === "camera") {
        const cameraPermission = await ImagePicker.requestCameraPermissionsAsync();
        if (!cameraPermission.granted) {
          setError("Kamera izni reddedildi.");
          return;
        }
      } else {
        const libraryPermission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!libraryPermission.granted) {
          setError("Medya kütüphanesi izni reddedildi.");
          return;
        }
      }

      const result =
        source === "camera"
          ? await ImagePicker.launchCameraAsync({ quality: 0.8 })
          : await ImagePicker.launchImageLibraryAsync({ quality: 0.8 });

      if (result.canceled || !result.assets?.length) {
        return;
      }

      const asset = result.assets[0];
      setOmrImageUri(asset.uri);
      const response = await uploadOmrScan({
        uri: asset.uri,
        mimeType: asset.mimeType ?? "image/jpeg",
        name: asset.fileName ?? "scan.jpg"
      });
      setOmrResult(JSON.stringify(response.result, null, 2));
    } catch (err) {
      setError(parseApiError(err, "OMR taraması başarısız."));
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRefresh = useCallback(async () => {
    if (!token) {
      setError("Token bulunamadı. Giriş ekranından tekrar login ol.");
      return;
    }
    setRefreshing(true);
    await loadStatus();
    await loadData(token, user?.role);
    setRefreshing(false);
  }, [loadData, loadStatus, token]);

  useEffect(() => {
    if (!pendingScrollTarget) {
      return;
    }
    const offsets: Record<Exclude<EditTarget, null>, number> = {
      course: editCourseOffset,
      content: editContentOffset,
      exam: editExamOffset,
      question: editQuestionOffset
    };
    const offset = offsets[pendingScrollTarget];
    if (offset === undefined || offset === null) {
      return;
    }
    scrollRef.current?.scrollTo({ y: resolveScrollOffset(offset), animated: true });
    setPendingScrollTarget(null);
  }, [
    editContentOffset,
    editCourseOffset,
    editExamOffset,
    editQuestionOffset,
    pendingScrollTarget
  ]);

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
    // Offline check loop
    const checkOffline = async () => {
      const offline = !(await OfflineManager.checkConnection());
      setIsOffline(offline);
    };
    checkOffline();
    const interval = setInterval(checkOffline, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // Push & Biometric init
    const init = async () => {
      const token = await NotificationManager.registerForPushNotificationsAsync();
      if (token) setPushToken(token);

      const bio = await BiometricManager.checkHardware();
      setBiometricAvailable(bio);
    };
    init();
  }, []);

  // Duplicate handler removed.

  const handleTestPush = async () => {
    // await NotificationManager.sendTestNotification();
    alert("Test notification triggered (mock)");
    setError("Bildirim tetiklendi! (Bildirim merkezini kontrol et)");
  };

  const canWrite =
    user?.role &&
    ["superadmin", "admin", "instructor", "assistant"].includes(user.role.toLowerCase());
  const isAdmin = user?.role && ["superadmin", "admin"].includes(user.role.toLowerCase());

  const handleCreateCourse = useCallback(async () => {
    if (!token) {
      setError("Token bulunamadı. Giriş ekranından tekrar login ol.");
      return;
    }
    if (!courseTitle.trim()) {
      setError("Kurs başlığı gerekli.");
      return;
    }
    setCreatingCourse(true);
    try {
      const response = await apiClient.post<{ course: Course }>(
        "/courses",
        {
          title: courseTitle.trim(),
          description: courseDescription.trim() || undefined
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setCourses((prev) => [response.course, ...prev]);
      setCourseTitle("");
      setCourseDescription("");
    } catch (err) {
      setError(parseApiError(err, "Kurs oluşturulamadı."));
    } finally {
      setCreatingCourse(false);
    }
  }, [courseDescription, courseTitle, token]);

  const handleEnroll = useCallback(async (courseId: string) => {
    if (!token) return;
    setLoading(true);
    try {
      await apiClient.post(`/courses/${courseId}/enroll`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      // Move course from browse to enrolled
      setBrowseCourses(prev => prev.filter(c => c.id !== courseId));
      void loadData(token, user?.role); // Refresh to get correct content/exams
    } catch (err) {
      setError(parseApiError(err, "Kayıt olunamadı."));
    } finally {
      setLoading(false);
    }
  }, [apiClient, loadData, token, user?.role]);

  const handleDeleteCourse = useCallback(
    async (courseId: string) => {
      if (!token) {
        setError("Token bulunamadı. Giriş ekranından tekrar login ol.");
        return;
      }
      setDeletingCourseId(courseId);
      try {
        await apiClient.del(`/courses/${courseId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setCourses((prev) => prev.filter((course) => course.id !== courseId));
      } catch (err) {
        setError(parseApiError(err, "Kurs silinemedi."));
      } finally {
        setDeletingCourseId(null);
      }
    },
    [token]
  );

  const startEditCourse = useCallback((course: Course) => {
    setEditingCourseId(course.id);
    setEditCourseTitle(course.title);
    setEditCourseDescription(course.description ?? "");
    setPendingScrollTarget("course");
  }, []);

  const cancelEditCourse = useCallback(() => {
    setEditingCourseId(null);
    setEditCourseTitle("");
    setEditCourseDescription("");
  }, []);

  const handleUpdateCourse = useCallback(async () => {
    if (!token || !editingCourseId) {
      setError("Token bulunamadı. Giriş ekranından tekrar login ol.");
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
          description: editCourseDescription.trim() || undefined
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setCourses((prev) =>
        prev.map((course) => (course.id === editingCourseId ? response.course : course))
      );
      cancelEditCourse();
    } catch (err) {
      setError(parseApiError(err, "Kurs güncellenemedi."));
    } finally {
      setUpdatingCourseId(null);
    }
  }, [editCourseDescription, editCourseTitle, editingCourseId, token, cancelEditCourse]);

  const handleCreateUser = useCallback(async () => {
    if (!token) {
      setError("Token bulunamadı. Giriş ekranından tekrar login ol.");
      return;
    }
    if (!newUserName.trim() || !newUserPassword.trim()) {
      setError("Kullanıcı adı ve şifre gerekli.");
      return;
    }
    if (newUserPassword.trim().length < 4) {
      setError("Şifre en az 4 karakter olmalı.");
      return;
    }
    setCreatingUser(true);
    try {
      const response = await apiClient.post<{ user: User }>(
        "/users",
        {
          username: newUserName.trim(),
          password: newUserPassword,
          role: newUserRole
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setUsers((prev) => [response.user, ...prev]);
      setNewUserName("");
      setNewUserPassword("");
      setNewUserRole("Student");
    } catch (err) {
      setError(parseApiError(err, "Kullanıcı oluşturulamadı."));
    } finally {
      setCreatingUser(false);
    }
  }, [newUserName, newUserPassword, newUserRole, token]);

  const handleDeleteUser = useCallback(
    async (userId: string) => {
      if (!token) {
        setError("Token bulunamadı. Giriş ekranından tekrar login ol.");
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
    [token]
  );

  const startEditUser = useCallback((userItem: User) => {
    setEditingUserId(userItem.id);
    setEditUserName(userItem.username);
    setEditUserRole(userItem.role);
    setEditUserPassword("");
  }, []);

  const cancelEditUser = useCallback(() => {
    setEditingUserId(null);
    setEditUserName("");
    setEditUserRole("Student");
    setEditUserPassword("");
  }, []);

  const handleUpdateUser = useCallback(async () => {
    if (!token || !editingUserId) {
      setError("Token bulunamadı. Giriş ekranından tekrar login ol.");
      return;
    }
    if (!editUserName.trim()) {
      setError("Kullanıcı adı gerekli.");
      return;
    }
    if (editUserPassword.trim() && editUserPassword.trim().length < 4) {
      setError("Şifre en az 4 karakter olmalı.");
      return;
    }
    setUpdatingUserId(editingUserId);
    try {
      const payload: { username: string; role: Role; password?: string } = {
        username: editUserName.trim(),
        role: editUserRole
      };
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
  }, [editUserName, editUserPassword, editUserRole, editingUserId, token, cancelEditUser]);

  const handleCreateContent = useCallback(async () => {
    if (!token) {
      setError("Token bulunamadı. Giriş ekranından tekrar login ol.");
      return;
    }
    const normalizedType = contentType.trim().toLowerCase();
    if (!contentTitle.trim() || !normalizedType) {
      setError("İçerik başlığı ve tipi gerekli.");
      return;
    }
    if (!contentTypeOptions.includes(normalizedType as (typeof contentTypeOptions)[number])) {
      setError("İçerik tipi video veya pdf olmalı.");
      return;
    }
    setCreatingContent(true);
    try {
      let finalSource = contentSource.trim();

      if (contentFile) {
        const formData = new FormData();
        // @ts-ignore
        formData.append("file", {
          uri: contentFile.uri,
          type: contentFile.mimeType || "application/octet-stream",
          name: contentFile.name
        });

        const uploadRes = await apiClient.post<{ url: string }>(
          "/content/upload",
          formData,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "multipart/form-data"
            }
          }
        );
        finalSource = uploadRes.url;
      }

      if (normalizedType === 'scorm') {
        if (!contentFile) {
          setError("SCORM paketi (.zip) seçilmeli.");
          return;
        }
        const formData = new FormData();
        // @ts-ignore
        formData.append("file", {
          uri: contentFile.uri,
          type: contentFile.mimeType || "application/zip",
          name: contentFile.name
        });
        formData.append("title", contentTitle.trim());
        formData.append("courseId", selectedCourse?.id || "");

        const response = await apiClient.post<{ content: Content }>(
          "/scorm/upload",
          formData,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "multipart/form-data"
            }
          }
        );
        // The API now returns the created content item in response.content
        setContentItems((prev) => [response.content, ...prev]);
      } else {
        const response = await apiClient.post<{ content: Content }>(
          "/content",
          {
            title: contentTitle.trim(),
            type: normalizedType,
            source: contentSource.trim() || undefined,
            meetingUrl: normalizedType === "live_class" ? meetingUrl.trim() : undefined
          },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setContentItems((prev) => [response.content, ...prev]);
      }

      setContentTitle("");
      setContentType(contentTypeOptions[0]);
      setContentSource("");
      setMeetingUrl("");
      setContentFile(null);
    } catch (err) {
      setError(parseApiError(err, "İçerik oluşturulamadı."));
    } finally {
      setCreatingContent(false);
    }
  }, [contentFile, contentSource, contentTitle, contentType, token, selectedCourse, meetingUrl]);

  const handlePickDocument = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        setContentFile(result.assets[0]);
      }
    } catch (err) {
      setError(parseApiError(err, "Dosya secilemedi."));
    }
  }, []);

  const handleDeleteContent = useCallback(
    async (contentId: string) => {
      if (!token) {
        setError("Token bulunamadı. Giriş ekranından tekrar login ol.");
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
    [token]
  );

  const startEditContent = useCallback((item: Content) => {
    setEditingContentId(item.id);
    setEditContentTitle(item.title);
    setEditContentType(item.type);
    setEditContentSource(item.source ?? "");
    setEditMeetingUrl(item.meetingUrl ?? "");
    setPendingScrollTarget("content");
  }, []);

  const cancelEditContent = useCallback(() => {
    setEditingContentId(null);
    setEditContentTitle("");
    setEditContentType(contentTypeOptions[0]);
    setEditContentSource("");
    setEditMeetingUrl("");
  }, []);

  const handleUpdateContent = useCallback(async () => {
    if (!token || !editingContentId) {
      setError("Token bulunamadı. Giriş ekranından tekrar login ol.");
      return;
    }
    const normalizedType = editContentType.trim().toLowerCase();
    if (!editContentTitle.trim() || !normalizedType) {
      setError("İçerik başlığı ve tipi gerekli.");
      return;
    }
    if (!contentTypeOptions.includes(normalizedType as (typeof contentTypeOptions)[number])) {
      setError("İçerik tipi video veya pdf olmalı.");
      return;
    }
    setUpdatingContentId(editingContentId);
    try {
      const response = await apiClient.patch<{ content: Content }>(
        `/content/${editingContentId}`,
        {
          title: editContentTitle.trim(),
          type: normalizedType,
          source: editContentSource.trim() || undefined,
          meetingUrl: normalizedType === "live_class" ? editMeetingUrl.trim() : undefined
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setContentItems((prev) =>
        prev.map((item) => (item.id === editingContentId ? response.content : item))
      );
      cancelEditContent();
    } catch (err) {
      setError(parseApiError(err, "Icerik guncellenemedi."));
    } finally {
      setUpdatingContentId(null);
    }
  }, [
    editContentSource,
    editContentTitle,
    editContentType,
    editingContentId,
    token,
    cancelEditContent
  ]);

  const handleCreateExam = useCallback(async () => {
    if (!token) {
      setError("Token bulunamadi. Giris ekranindan tekrar login ol.");
      return;
    }
    if (!examTitle.trim()) {
      setError("Sinav basligi gerekli.");
      return;
    }
    setCreatingExam(true);
    try {
      const response = await apiClient.post<{ exam: Exam }>(
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
      const res = await apiClient.get<{ exams: Exam[] }>("/exams", {
        headers: { Authorization: `Bearer ${token}` }
      });
      setExams(res.exams);
      setExamTitle("");
      setExamDuration("");
      setExamPassThreshold("");
      setExamStartDate("");
      setExamEndDate("");
      setExamMaxAttempts("1");
      setExamIsDraft(true);
      setExamResultsVisibleAt("");
      setCreatingExam(false);
    } catch (err) {
      setError(parseApiError(err, "Sinav olusturulamadi."));
    } finally {
      setCreatingExam(false);
    }
  }, [examTitle, token, selectedCourse, examDuration, examPassThreshold]);

  const handleDeleteExam = useCallback(
    async (examId: string) => {
      if (!token) {
        setError("Token bulunamadi. Giris ekranindan tekrar login ol.");
        return;
      }
      setDeletingExamId(examId);
      try {
        await apiClient.del(`/exams/${examId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setExams((prev) => prev.filter((exam) => exam.id !== examId));
      } catch (err) {
        setError(parseApiError(err, "Sinav silinemedi."));
      } finally {
        setDeletingExamId(null);
      }
    },
    [token]
  );

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
    setPendingScrollTarget("exam");
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
    if (!token || !editingExamId) {
      setError("Token bulunamadi. Giris ekranindan tekrar login ol.");
      return;
    }
    if (!editExamTitle.trim()) {
      setError("Sinav basligi gerekli.");
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
          maxAttempts: editExamMaxAttempts.trim() ? parseInt(editExamMaxAttempts) : 1,
          isDraft: editExamIsDraft,
          resultsVisibleAt: editExamResultsVisibleAt.trim() || undefined
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setExams((prev) => prev.map((exam) => (exam.id === editingExamId ? response.exam : exam)));
      cancelEditExam();
    } catch (err) {
      setError(parseApiError(err, "Sinav guncellenemedi."));
    } finally {
      setUpdatingExamId(null);
    }
  }, [editExamCourseId, editExamTitle, editingExamId, token, cancelEditExam]);

  const handleStartExam = useCallback(() => {
    setExamStarted(true);
    setExamAnswers({});
    setExamSubmissionResult(null);
    setExamSubmitting(false);
  }, []);

  const handleSubmitExam = useCallback(async () => {
    if (!token || !selectedExam) return;
    setExamSubmitting(true);
    setError(null);
    try {
      const res = await apiClient.post<{ score: number; passed: boolean }>(
        `/exams/${selectedExam.id}/submit`,
        { answers: examAnswers },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setExamSubmissionResult(res);
      setExamStarted(false);
    } catch (err) {
      setError(parseApiError(err, "Sinav gonderilemedi."));
    } finally {
      setExamSubmitting(false);
    }
  }, [token, selectedExam, examAnswers]);

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

  const handleCreateQuestion = useCallback(async () => {
    if (!token) {
      setError("Token bulunamadi. Giris ekranindan tekrar login ol.");
      return;
    }
    if (!questionPrompt.trim() || !questionType.trim()) {
      setError("Soru metni ve tipi gerekli.");
      return;
    }
    const optionsList = isChoiceQuestion(questionType)
      ? getOptionList(questionType, questionOptions)
      : [];
    if (isChoiceQuestion(questionType) && questionType !== "true_false" && optionsList.length < 2) {
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
      meta = longAnswerGuide.trim() ? { longAnswerGuide: longAnswerGuide.trim() } : undefined;
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

    // Camera Rendering Logic
    if (showCamera) {
      return (
        <SafeAreaView style={{ flex: 1, backgroundColor: 'black' }}>
          <OpticReaderScreen navigation={{ goBack: () => setShowCamera(false) }} />
        </SafeAreaView>
      );
    }

    if (showPdf && pdfParams) {
      return (
        <SafeAreaView style={{ flex: 1, backgroundColor: 'white' }}>
          <PdfViewerScreen
            navigation={{ goBack: () => setShowPdf(false) }}
            route={{ params: pdfParams }}
          />
        </SafeAreaView>
      )
    }

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
    shortAnswers,
    token
  ]);

  const handleDeleteQuestion = useCallback(
    async (questionId: string) => {
      if (!token) {
        setError("Token bulunamadi. Giris ekranindan tekrar login ol.");
        return;
      }
      setDeletingQuestionId(questionId);
      try {
        await apiClient.del(`/questions/${questionId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setQuestions((prev) => prev.filter((question) => question.id !== questionId));
      } catch (err) {
        setError(parseApiError(err, "Soru silinemedi."));
      } finally {
        setDeletingQuestionId(null);
      }
    },
    [token]
  );

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
        setEditQuestionAnswer(question.answer ? "Dogru" : "Yanlis");
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
    setPendingScrollTarget("question");
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
    if (!token || !editingQuestionId) {
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
        prev.map((question) => (question.id === editingQuestionId ? response.question : question))
      );
      cancelEditQuestion();
    } catch (err) {
      setError(parseApiError(err, "Soru guncellenemedi."));
    } finally {
      setUpdatingQuestionId(null);
    }
  }, [
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
    editShortAnswers,
    token,
    cancelEditQuestion
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

  const editQuestionOptionList = getOptionList(editQuestionType, editQuestionOptions);

  if (showCamera) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: 'black' }}>
        <OpticReaderScreen navigation={{ goBack: () => setShowCamera(false) }} />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style="dark" />
      {isOffline ? (
        <View style={{ backgroundColor: '#ef4444', padding: 8, alignItems: 'center' }}>
          <Text style={{ color: 'white', fontWeight: 'bold' }}>Offline Mod - İnternet Yok</Text>
        </View>
      ) : null}
      {!isLoggedIn ? (
        <View style={styles.centered}>
          <View style={styles.card}>
            {/* Header: Theme Toggle & Language */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                <ThemeToggle />
                <Pressable onPress={() => setShowSettings(true)} style={{ padding: 4 }}>
                  <Text style={{ fontSize: 24 }}>⚙️</Text>
                </Pressable>
              </View>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <Pressable onPress={() => i18n.changeLanguage('tr')}><Text style={{ fontSize: 24 }}>🇹🇷</Text></Pressable>
                <Pressable onPress={() => i18n.changeLanguage('en')}><Text style={{ fontSize: 24 }}>🇬🇧</Text></Pressable>
                <Pressable onPress={() => i18n.changeLanguage('de')}><Text style={{ fontSize: 24 }}>🇩🇪</Text></Pressable>
              </View>
            </View>

            <Text style={styles.title}>LMS Mobil</Text>
            <Text style={styles.subtitle}>{isRegisterMode ? "Kayıt Ol" : "Giriş Yap"}</Text>

            <TextInput
              style={styles.input}
              placeholder="Kullanıcı Adı"
              autoCapitalize="none"
              value={username}
              onChangeText={setUsername}
              accessibilityLabel="Username Input"
              accessibilityHint="Enter your username"
            />
            <TextInput
              style={styles.input}
              placeholder="Şifre"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              accessibilityLabel="Password Input"
              accessibilityHint="Enter your password"
            />

            {isRegisterMode && (
              <View style={{ marginBottom: 12 }}>
                <Text style={{ marginBottom: 8, color: colors.text }}>Rol Seçin:</Text>
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  {(["Student", "Instructor", "Assistant"] as Role[]).map((r) => (
                    <Pressable
                      key={r}
                      onPress={() => setRegisterRole(r)}
                      style={[
                        styles.secondaryButton,
                        {
                          backgroundColor: registerRole === r ? '#3b82f6' : '#f1f5f9',
                          paddingVertical: 8,
                          paddingHorizontal: 12,
                          marginTop: 0,
                          flex: 0
                        }
                      ]}
                    >
                      <Text style={{
                        color: registerRole === r ? '#fff' : '#475569',
                        fontWeight: '600'
                      }}>{r}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable
              style={styles.primaryButton}
              onPress={isRegisterMode ? handleRegister : handleLogin}
              disabled={loading}
              accessibilityLabel={isRegisterMode ? "Register Button" : "Login Button"}
              accessibilityRole="button"
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryText}>{isRegisterMode ? "Kayıt Ol" : t('login')}</Text>
              )}
            </Pressable>

            <Pressable onPress={() => setIsRegisterMode(!isRegisterMode)} style={{ marginTop: 16, alignItems: 'center' }}>
              <Text style={{ color: '#3b82f6', fontWeight: '500' }}>
                {isRegisterMode ? "Zaten hesabın var mı? Giriş Yap" : "Hesabın yok mu? Kayıt Ol"}
              </Text>
            </Pressable>

            {!isRegisterMode && (
              <>
                {biometricAvailable ? (
                  <Pressable style={styles.secondaryButton} onPress={handleBiometricLogin} disabled={loading}>
                    <Text style={styles.secondaryText}>Biyometrik Giriş</Text>
                  </Pressable>
                ) : null}

                {/* OAuth Buttons */}
                <View style={{ flexDirection: 'row', gap: 12, marginTop: 12, marginBottom: 8 }}>
                  <Pressable
                    style={[styles.secondaryButton, { flex: 1, marginTop: 0, backgroundColor: '#fff', borderColor: '#e2e8f0' }]}
                    onPress={() => getApiBaseUrl() && Linking.openURL(`${getApiBaseUrl()}/auth/google`)}
                  >
                    <Text style={styles.secondaryText}>Google</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.secondaryButton, { flex: 1, marginTop: 0, backgroundColor: '#fff', borderColor: '#e2e8f0' }]}
                    onPress={() => getApiBaseUrl() && Linking.openURL(`${getApiBaseUrl()}/auth/microsoft`)}
                  >
                    <Text style={styles.secondaryText}>Microsoft</Text>
                  </Pressable>
                </View>

                <Pressable
                  style={[
                    styles.secondaryButton,
                    {
                      marginTop: 16,
                      backgroundColor: colors.card,
                      borderWidth: 1,
                      borderColor: colors.border,
                      paddingVertical: 12
                    }
                  ]}
                  onPress={() => {
                    setUsername("guest");
                    setPassword("1234");
                  }}
                  disabled={loading}
                >
                  <Text style={[styles.secondaryText, { color: colors.text, fontSize: 14, fontWeight: '600' }]}>🕵️‍♂️ Misafir Girişi</Text>
                </Pressable>
              </>
            )}
            <ServerSettingsModal visible={showSettings} onClose={() => setShowSettings(false)} />
          </View>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent} ref={scrollRef}>
          <View style={styles.card}>
            <View style={{ marginBottom: 0 }}>
              <Text style={styles.title}>Hoş Geldin, {user?.username} 👋</Text>
              <Text style={styles.subtitle}>{user?.role} paneli</Text>

              <Pressable
                onPress={() => setShowCamera(true)}
                style={({ pressed }) => [
                  {
                    backgroundColor: pressed ? '#d1fae5' : '#ecfdf5',
                    padding: 12,
                    marginTop: 12,
                    borderRadius: 12,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    borderWidth: 1,
                    borderColor: '#10b981'
                  }
                ]}
              >
                <Text style={{ fontSize: 20 }}>📸</Text>
                <Text style={{ color: '#059669', fontWeight: '700', fontSize: 15 }}>Optik Form Oku</Text>
              </Pressable>
            </View>
            <ThemeToggle />
          </View>
          {isAdmin ? (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Kullanicilar</Text>

              {users.length ? (
                users.map((userItem) => (
                  <View key={userItem.id} style={styles.listItem}>
                    <Text style={styles.listTitle}>{userItem.username}</Text>
                    <Text style={styles.listSubtitle}>Role: {userItem.role}</Text>
                    <View style={styles.actionRow}>
                      <Pressable
                        style={styles.miniButton}
                        onPress={() => startEditUser(userItem)}
                        disabled={
                          updatingUserId === userItem.id || deletingUserId === userItem.id
                        }
                      >
                        <Text style={styles.miniButtonText}>Duzenle</Text>
                      </Pressable>
                      <Pressable
                        style={styles.miniButton}
                        onPress={() => handleDeleteUser(userItem.id)}
                        disabled={deletingUserId === userItem.id}
                      >
                        <Text style={styles.miniButtonText}>
                          {deletingUserId === userItem.id ? "Siliniyor..." : "Sil"}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                ))
              ) : (
                <Text style={styles.helperText}>Henuz kullanici yok.</Text>
              )}

              <View style={styles.formBlock}>
                <TextInput
                  style={styles.input}
                  placeholder="Kullanici adi"
                  value={newUserName}
                  onChangeText={setNewUserName}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Sifre"
                  secureTextEntry
                  value={newUserPassword}
                  onChangeText={setNewUserPassword}
                />
                <TextInput
                  style={styles.input}
                  placeholder={`Role (${roleOptionsText})`}
                  value={newUserRole}
                  onChangeText={(value) => setNewUserRole(value as Role)}
                />
                <Pressable
                  style={styles.primaryButton}
                  onPress={handleCreateUser}
                  disabled={creatingUser}
                >
                  {creatingUser ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.primaryText}>Kullanici Olustur</Text>
                  )}
                </Pressable>
              </View>
              {editingUserId ? (
                <View style={styles.formBlock}>
                  <TextInput
                    style={styles.input}
                    placeholder="Kullanici adi"
                    value={editUserName}
                    onChangeText={setEditUserName}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Yeni sifre (opsiyonel)"
                    secureTextEntry
                    value={editUserPassword}
                    onChangeText={setEditUserPassword}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder={`Role (${roleOptionsText})`}
                    value={editUserRole}
                    onChangeText={(value) => setEditUserRole(value as Role)}
                  />
                  <Pressable
                    style={styles.primaryButton}
                    onPress={handleUpdateUser}
                    disabled={updatingUserId === editingUserId}
                  >
                    {updatingUserId === editingUserId ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.primaryText}>Kullaniciyi Guncelle</Text>
                    )}
                  </Pressable>
                  <Pressable style={styles.secondaryButton} onPress={cancelEditUser}>
                    <Text style={styles.secondaryText}>Iptal</Text>
                  </Pressable>
                </View>
              ) : null}

            </View>
          ) : null}

          {viewMode === 'detail' ? (
            <View style={styles.card}>
              <Pressable onPress={() => { setViewMode('list'); setSelectedCourse(null); }} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <Text style={{ fontSize: 18, marginRight: 8 }}>←</Text>
                <Text style={{ fontSize: 16, fontWeight: '600', color: '#334155' }}>Kurs Listesine Dön</Text>
              </Pressable>
              <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#0f172a' }}>{selectedCourse?.title}</Text>
              {selectedCourse?.description ? <Text style={{ color: '#64748b' }}>{selectedCourse.description}</Text> : null}
            </View>
          ) : null}

          {viewMode === 'list' ? (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Kurslar</Text>
              {courses.length ? (
                courses.map((course) => (
                  <View key={course.id} style={styles.listItem}>
                    <Pressable onPress={() => { setSelectedCourse(course); setViewMode('detail'); }}>
                      <Text style={[styles.listTitle, { color: '#2563eb', textDecorationLine: 'underline' }]}>{course.title}</Text>
                    </Pressable>
                    {course.description ? (
                      <Text style={styles.listSubtitle}>{course.description}</Text>
                    ) : null}
                    {canWrite ? (
                      <View style={styles.actionRow}>
                        <Pressable
                          style={styles.miniButton}
                          onPress={() => startEditCourse(course)}
                          disabled={updatingCourseId === course.id || deletingCourseId === course.id}
                        >
                          <Text style={styles.miniButtonText}>Duzenle</Text>
                        </Pressable>
                        <Pressable
                          style={styles.miniButton}
                          onPress={() => handleDeleteCourse(course.id)}
                          disabled={deletingCourseId === course.id}
                        >
                          <Text style={styles.miniButtonText}>
                            {deletingCourseId === course.id ? "Siliniyor..." : "Sil"}
                          </Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                ))
              ) : (
                <Text style={styles.helperText}>{user?.role?.toLowerCase() === 'student' ? 'Henüz hiçbir kursa kayıtlı değilsin.' : 'Henüz kurs yok.'}</Text>
              )}

              {user?.role?.toLowerCase() === 'student' && browseCourses.length > 0 ? (
                <View style={{ marginTop: 24 }}>
                  <Text style={styles.sectionTitle}>Kurs Keşfet</Text>
                  {browseCourses.map((course) => (
                    <View key={course.id} style={styles.listItem}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.listTitle}>{course.title}</Text>
                        {course.description ? (
                          <Text style={styles.listSubtitle}>{course.description}</Text>
                        ) : null}
                      </View>
                      <Pressable
                        style={[styles.miniButton, { backgroundColor: '#0891b2' }]}
                        onPress={() => handleEnroll(course.id)}
                        disabled={loading}
                      >
                        <Text style={[styles.miniButtonText, { color: 'white' }]}>Kayıt Ol</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              ) : null}

              {canWrite ? (
                !editingCourseId ? (
                  <View style={styles.formBlock}>
                    <Text style={styles.formTitle}>Kurs Olustur</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Kurs basligi"
                      value={courseTitle}
                      onChangeText={setCourseTitle}
                    />
                    <TextInput
                      style={styles.input}
                      placeholder="Aciklama (opsiyonel)"
                      value={courseDescription}
                      onChangeText={setCourseDescription}
                    />
                    <Pressable
                      style={styles.primaryButton}
                      onPress={handleCreateCourse}
                      disabled={creatingCourse}
                    >
                      {creatingCourse ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.primaryText}>Kurs Olustur</Text>
                      )}
                    </Pressable>
                  </View>
                ) : null
              ) : null}


              {canWrite && editingCourseId ? (
                <View
                  style={styles.formBlock}
                  onLayout={(event) => setEditCourseOffset(event.nativeEvent.layout.y)}
                >
                  <Text style={styles.formTitle}>Kursu Duzenle</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Kurs basligi"
                    value={editCourseTitle}
                    onChangeText={setEditCourseTitle}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Aciklama (opsiyonel)"
                    value={editCourseDescription}
                    onChangeText={setEditCourseDescription}
                  />
                  <Pressable
                    style={styles.primaryButton}
                    onPress={handleUpdateCourse}
                    disabled={updatingCourseId === editingCourseId}
                  >
                    {updatingCourseId === editingCourseId ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.primaryText}>Kursu Guncelle</Text>
                    )}
                  </Pressable>
                  <Pressable style={styles.secondaryButton} onPress={cancelEditCourse}>
                    <Text style={styles.secondaryText}>Iptal</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          ) : null}

          {viewMode === 'detail' ? (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Icerikler</Text>
              <Text style={styles.listSubtitle}>
                {contentItems.filter(i => i.courseId === selectedCourse?.id).length} İçerik
              </Text>

              {contentItems.filter(i => i.courseId === selectedCourse?.id).length ? (
                contentItems.filter(i => i.courseId === selectedCourse?.id).map((item) => (
                  <View key={item.id} style={styles.listItem}>
                    <Text style={styles.listTitle}>{item.title}</Text>
                    <Text style={styles.listSubtitle}>Tip: {item.type}</Text>
                    {item.source ? (
                      <Text style={styles.listSubtitle}>Source: {item.source}</Text>
                    ) : null}
                    {item.source && isImageContent(item.type) ? (
                      <Image source={{ uri: item.source }} style={styles.contentPreview} />
                    ) : null}
                    {item.source && item.type === 'video' ? (
                      <Video
                        style={{ width: '100%', height: 200, marginTop: 8, backgroundColor: 'black' }}
                        source={{ uri: item.source }}
                        useNativeControls
                        resizeMode={ResizeMode.CONTAIN}
                        isLooping
                      />
                    ) : null}
                    {item.type === 'live_class' && item.meetingUrl ? (
                      <Pressable
                        style={[styles.miniButton, { backgroundColor: '#10b981', marginTop: 8 }]}
                        onPress={() => Linking.openURL(item.meetingUrl!)}
                      >
                        <Text style={styles.miniButtonText}>🎥 Canlı Derse Katıl</Text>
                      </Pressable>
                    ) : null}
                    {item.type === 'pdf' ? (
                      <Pressable
                        style={[styles.miniButton, { backgroundColor: '#ea580c', marginTop: 8 }]}
                        onPress={() => {
                          if (!item.source) return;
                          setPdfParams({ uri: item.source, title: item.title });
                          setShowPdf(true);
                        }}
                      >
                        <Text style={styles.miniButtonText}>📄 Görüntüle</Text>
                      </Pressable>
                    ) : null}

                    {item.type === 'scorm' ? (
                      <Pressable
                        style={[styles.miniButton, { backgroundColor: '#7c3aed', marginTop: 8 }]}
                        onPress={async () => {
                          try {
                            const res = await apiClient.get<{ url: string }>(`/scorm/${item.source}/launch`, {
                              headers: { Authorization: `Bearer ${token}` }
                            });
                            if (res.url) Linking.openURL(res.url);
                          } catch (e) {
                            alert("SCORM başlatılamadı.");
                          }
                        }}
                      >
                        <Text style={styles.miniButtonText}>🚀 Başlat (SCORM)</Text>
                      </Pressable>
                    ) : null}

                    {canWrite ? (
                      <View style={styles.actionRow}>
                        <Pressable
                          style={[styles.miniButton, { backgroundColor: '#475569' }]}
                          onPress={async () => {
                            if (!item.source) return;
                            try {
                              const uri = `${(FileSystem as any).documentDirectory ?? (FileSystem as any).cacheDirectory}exam_${item.id}_solutions.pdf`;
                              const { uri: fileUri } = await FileSystem.downloadAsync(item.source, uri);
                              alert(`İndirildi: ${fileUri}`);
                            } catch (e) {
                              alert("İndirme hatası");
                            }
                          }}
                        >
                          <Text style={styles.miniButtonText}>İndir</Text>
                        </Pressable>
                        <Pressable
                          style={styles.miniButton}
                          onPress={() => startEditContent(item)}
                          disabled={updatingContentId === item.id || deletingContentId === item.id}
                        >
                          <Text style={styles.miniButtonText}>Duzenle</Text>
                        </Pressable>
                        <Pressable
                          style={styles.miniButton}
                          onPress={() => handleDeleteContent(item.id)}
                          disabled={deletingContentId === item.id}
                        >
                          <Text style={styles.miniButtonText}>
                            {deletingContentId === item.id ? "Siliniyor..." : "Sil"}
                          </Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                ))
              ) : (
                <Text style={styles.helperText}>Henuz icerik yok.</Text>
              )}

              {canWrite ? (
                !editingContentId ? (
                  <View style={styles.formBlock}>
                    <Text style={styles.formTitle}>Icerik Olustur</Text>
                    <Text style={styles.helperText}>Icerik tipi: video veya pdf</Text>
                    <View style={styles.chipRow}>
                      {contentTypeOptions.map((option) => {
                        const active = contentType === option;
                        return (
                          <Pressable
                            key={`content-${option}`}
                            style={[styles.chip, active && styles.chipActive]}
                            onPress={() => setContentType(option)}
                          >
                            <Text style={[styles.chipText, active && styles.chipTextActive]}>
                              {option}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    <TextInput
                      style={styles.input}
                      placeholder="Icerik basligi"
                      value={contentTitle}
                      onChangeText={setContentTitle}
                    />
                    <TextInput
                      style={styles.input}
                      placeholder="Source (opsiyonel)"
                      value={contentSource}
                      onChangeText={setContentSource}
                    />
                    {contentType === 'live_class' ? (
                      <TextInput
                        style={styles.input}
                        placeholder="Toplanti Linki (Meeting URL)"
                        value={meetingUrl}
                        onChangeText={setMeetingUrl}
                      />
                    ) : null}
                    <Pressable
                      style={[styles.secondaryButton, { marginBottom: 12 }]}
                      onPress={handlePickDocument}
                    >
                      <Text style={styles.secondaryText}>
                        {contentFile ? `Seçildi: ${contentFile.name}` : "Veya Dosya Seç"}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={styles.primaryButton}
                      onPress={handleCreateContent}
                      disabled={creatingContent}
                    >
                      {creatingContent ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.primaryText}>Icerik Olustur</Text>
                      )}
                    </Pressable>
                  </View>
                ) : null
              ) : null}


              {canWrite && editingContentId ? (
                <View
                  style={styles.formBlock}
                  onLayout={(event) => setEditContentOffset(event.nativeEvent.layout.y)}
                >
                  <Text style={styles.formTitle}>Icerigi Duzenle</Text>
                  <Text style={styles.helperText}>Icerik tipi: video veya pdf</Text>
                  <View style={styles.chipRow}>
                    {contentTypeOptions.map((option) => {
                      const active = editContentType === option;
                      return (
                        <Pressable
                          key={`edit-content-${option}`}
                          style={[styles.chip, active && styles.chipActive]}
                          onPress={() => setEditContentType(option)}
                        >
                          <Text style={[styles.chipText, active && styles.chipTextActive]}>
                            {option}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <TextInput
                    style={styles.input}
                    placeholder="Icerik basligi"
                    value={editContentTitle}
                    onChangeText={setEditContentTitle}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Source (opsiyonel)"
                    value={editContentSource}
                    onChangeText={setEditContentSource}
                  />
                  {editContentType === 'live_class' ? (
                    <TextInput
                      style={styles.input}
                      placeholder="Toplanti Linki (Meeting URL)"
                      value={editMeetingUrl}
                      onChangeText={setEditMeetingUrl}
                    />
                  ) : null}
                  <Pressable
                    style={styles.primaryButton}
                    onPress={handleUpdateContent}
                    disabled={updatingContentId === editingContentId}
                  >
                    {updatingContentId === editingContentId ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.primaryText}>Icerigi Guncelle</Text>
                    )}
                  </Pressable>
                  <Pressable style={styles.secondaryButton} onPress={cancelEditContent}>
                    <Text style={styles.secondaryText}>Iptal</Text>
                  </Pressable>
                </View>
              ) : null}

            </View>
          ) : null}

          {viewMode === 'detail' && (
            <>
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Sinavlar</Text>
                <Text style={styles.listSubtitle}>
                  {exams.filter((e: Exam) => e.courseId === selectedCourse?.id).length} Sınav
                </Text>

                {exams.filter(e => e.courseId === selectedCourse?.id).length ? (
                  exams.filter(e => e.courseId === selectedCourse?.id).map((exam) => (
                    <View key={exam.id} style={styles.listItem}>
                      <Text style={styles.listTitle}>{exam.title}</Text>
                      {exam.courseId ? (
                        <Text style={styles.listSubtitle}>Course ID: {exam.courseId}</Text>
                      ) : null}
                      {canWrite ? (
                        <View style={styles.actionRow}>
                          <Pressable
                            style={styles.miniButton}
                            onPress={() => startEditExam(exam)}
                            disabled={updatingExamId === exam.id || deletingExamId === exam.id}
                          >
                            <Text style={styles.miniButtonText}>Duzenle</Text>
                          </Pressable>
                          <Pressable
                            style={styles.miniButton}
                            onPress={() => handleDeleteExam(exam.id)}
                            disabled={deletingExamId === exam.id}
                          >
                            <Text style={styles.miniButtonText}>
                              {deletingExamId === exam.id ? "Siliniyor..." : "Sil"}
                            </Text>
                          </Pressable>
                        </View>
                      ) : (
                        <View style={styles.actionRow}>
                          <Pressable
                            style={[styles.miniButton, { backgroundColor: '#0f766e' }]}
                            onPress={() => { setSelectedExam(exam); setViewMode('exam_detail'); setExamStarted(false); setExamSubmissionResult(null); }}
                          >
                            <Text style={[styles.miniButtonText, { color: 'white' }]}>Sınava Gir</Text>
                          </Pressable>
                          <Pressable
                            style={[styles.miniButton, { backgroundColor: '#4f46e5', marginLeft: 8 }]}
                            onPress={() => { setSelectedExam(exam); setViewMode('omr'); }}
                          >
                            <Text style={[styles.miniButtonText, { color: 'white' }]}>Optik Tara</Text>
                          </Pressable>
                        </View>
                      )}
                    </View>

                  ))
                ) : (
                  <Text style={styles.helperText}>Henuz sinav yok.</Text>
                )}

                {canWrite ? (
                  !editingExamId ? (
                    <View style={styles.formBlock}>
                      <Text style={styles.formTitle}>Sinav Olustur</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="Sinav basligi"
                        value={examTitle}
                        onChangeText={setExamTitle}
                      />
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TextInput
                          style={[styles.input, { flex: 1 }]}
                          placeholder="Süre (dk)"
                          keyboardType="numeric"
                          value={examDuration}
                          onChangeText={setExamDuration}
                        />
                        <TextInput
                          style={[styles.input, { flex: 1 }]}
                          placeholder="Geçme Eşiği"
                          keyboardType="numeric"
                          value={examPassThreshold}
                          onChangeText={setExamPassThreshold}
                        />
                      </View>
                      <TextInput
                        style={styles.input}
                        placeholder="Başlangıç (YYYY-MM-DD HH:MM)"
                        value={examStartDate}
                        onChangeText={setExamStartDate}
                      />
                      <TextInput
                        style={styles.input}
                        placeholder="Bitiş (YYYY-MM-DD HH:MM)"
                        value={examEndDate}
                        onChangeText={setExamEndDate}
                      />
                      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 12 }}>
                        <TextInput
                          style={[styles.input, { flex: 1, marginBottom: 0 }]}
                          placeholder="Max Deneme"
                          keyboardType="numeric"
                          value={examMaxAttempts}
                          onChangeText={setExamMaxAttempts}
                        />
                        <Pressable
                          onPress={() => setExamIsDraft(!examIsDraft)}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                        >
                          <View style={{ width: 20, height: 20, borderWidth: 1, borderRadius: 4, alignItems: 'center', justifyContent: 'center' }}>
                            {examIsDraft && <View style={{ width: 12, height: 12, backgroundColor: '#2563eb', borderRadius: 2 }} />}
                          </View>
                          <Text style={{ fontSize: 13 }}>Taslak</Text>
                        </Pressable>
                      </View>
                      <TextInput
                        style={styles.input}
                        placeholder="Sonuç Görünürlük (YYYY-MM-DD HH:MM)"
                        value={examResultsVisibleAt}
                        onChangeText={setExamResultsVisibleAt}
                      />
                      <Pressable
                        style={styles.primaryButton}
                        onPress={handleCreateExam}
                        disabled={creatingExam}
                      >
                        {creatingExam ? (
                          <ActivityIndicator color="#fff" />
                        ) : (
                          <Text style={styles.primaryText}>Sinav Olustur</Text>
                        )}
                      </Pressable>
                    </View>
                  ) : null
                ) : null}


                {canWrite && editingExamId ? (
                  <View
                    style={styles.formBlock}
                    onLayout={(event) => setEditExamOffset(event.nativeEvent.layout.y)}
                  >
                    <Text style={styles.formTitle}>Sinavi Duzenle</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Sinav basligi"
                      value={editExamTitle}
                      onChangeText={setEditExamTitle}
                    />
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TextInput
                        style={[styles.input, { flex: 1 }]}
                        placeholder="Süre (dk)"
                        keyboardType="numeric"
                        value={editExamDuration}
                        onChangeText={setEditExamDuration}
                      />
                      <TextInput
                        style={[styles.input, { flex: 1 }]}
                        placeholder="Geçme Eşiği"
                        keyboardType="numeric"
                        value={editExamPassThreshold}
                        onChangeText={setEditExamPassThreshold}
                      />
                    </View>
                    <TextInput
                      style={styles.input}
                      placeholder="Başlangıç (YYYY-MM-DD HH:MM)"
                      value={editExamStartDate}
                      onChangeText={setEditExamStartDate}
                    />
                    <TextInput
                      style={styles.input}
                      placeholder="Bitiş (YYYY-MM-DD HH:MM)"
                      value={editExamEndDate}
                      onChangeText={setEditExamEndDate}
                    />
                    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 12 }}>
                      <TextInput
                        style={[styles.input, { flex: 1, marginBottom: 0 }]}
                        placeholder="Max Deneme"
                        keyboardType="numeric"
                        value={editExamMaxAttempts}
                        onChangeText={setEditExamMaxAttempts}
                      />
                      <Pressable
                        onPress={() => setEditExamIsDraft(!editExamIsDraft)}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                      >
                        <View style={{ width: 20, height: 20, borderWidth: 1, borderRadius: 4, alignItems: 'center', justifyContent: 'center' }}>
                          {editExamIsDraft && <View style={{ width: 12, height: 12, backgroundColor: '#2563eb', borderRadius: 2 }} />}
                        </View>
                        <Text style={{ fontSize: 13 }}>Taslak</Text>
                      </Pressable>
                    </View>
                    <TextInput
                      style={styles.input}
                      placeholder="Sonuç Görünürlük (YYYY-MM-DD HH:MM)"
                      value={editExamResultsVisibleAt}
                      onChangeText={setEditExamResultsVisibleAt}
                    />
                    <Pressable
                      style={styles.primaryButton}
                      onPress={handleUpdateExam}
                      disabled={updatingExamId === editingExamId}
                    >
                      {updatingExamId === editingExamId ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.primaryText}>Sinavi Guncelle</Text>
                      )}
                    </Pressable>
                    <Pressable style={styles.secondaryButton} onPress={cancelEditExam}>
                      <Text style={styles.secondaryText}>Iptal</Text>
                    </Pressable>
                  </View>
                ) : null}

              </View>
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Sorular</Text>

                {questions.length ? (
                  questions.map((question) => {
                    const optionList =
                      question.options?.length
                        ? question.options
                        : question.type === "true_false"
                          ? [...trueFalseOptions]
                          : null;
                    return (
                      <View key={question.id} style={styles.listItem}>
                        <Text style={styles.listTitle}>{question.prompt}</Text>
                        <Text style={styles.listSubtitle}>
                          Tip: {questionTypeLabelMap.get(question.type as QuestionType) ?? question.type}
                        </Text>
                        {question.examId ? (
                          <Text style={styles.listSubtitle}>Exam ID: {question.examId}</Text>
                        ) : null}
                        {optionList ? (
                          <Text style={styles.listSubtitle}>
                            Secenekler: {optionList.join(", ")}
                          </Text>
                        ) : null}
                        {question.answer !== undefined ? (
                          <Text style={styles.listSubtitle}>
                            Dogru: {formatAnswer(question.answer)}
                          </Text>
                        ) : null}
                        {formatQuestionMetaLines(question).map((line, index) => (
                          <Text key={`${question.id}-meta-${index}`} style={styles.listSubtitle}>
                            {line}
                          </Text>
                        ))}
                        {canWrite ? (
                          <View style={styles.actionRow}>
                            <Pressable
                              style={styles.miniButton}
                              onPress={() => startEditQuestion(question)}
                              disabled={
                                updatingQuestionId === question.id || deletingQuestionId === question.id
                              }
                            >
                              <Text style={styles.miniButtonText}>Duzenle</Text>
                            </Pressable>
                            <Pressable
                              style={styles.miniButton}
                              onPress={() => handleDeleteQuestion(question.id)}
                              disabled={deletingQuestionId === question.id}
                            >
                              <Text style={styles.miniButtonText}>
                                {deletingQuestionId === question.id ? "Siliniyor..." : "Sil"}
                              </Text>
                            </Pressable>
                          </View>
                        ) : null}
                      </View>
                    );
                  })
                ) : (
                  <Text style={styles.helperText}>Henuz soru yok.</Text>
                )}

                {canWrite ? (
                  !editingQuestionId ? (
                    <View style={styles.formBlock}>
                      <Text style={styles.formTitle}>Soru Olustur</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="Soru metni"
                        value={questionPrompt}
                        onChangeText={setQuestionPrompt}
                      />
                      <View style={styles.chipRow}>
                        {questionTypeOptions.map((option) => {
                          const active = questionType === option.value;
                          return (
                            <Pressable
                              key={option.value}
                              style={[styles.chip, active && styles.chipActive]}
                              onPress={() => setQuestionType(option.value)}
                            >
                              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                                {option.label}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                      {isChoiceQuestion(questionType) ? (
                        <>
                          {isEditableChoiceQuestion(questionType) ? (
                            <>
                              {questionOptions.map((option, index) => (
                                <View key={`new-option-${index}`} style={styles.optionRow}>
                                  <TextInput
                                    style={[styles.input, styles.optionInput]}
                                    placeholder={`Secenek ${index + 1}`}
                                    value={option}
                                    onChangeText={(value) => updateQuestionOption(index, value)}
                                  />
                                  <Pressable
                                    style={styles.optionRemove}
                                    onPress={() => removeQuestionOption(index)}
                                    disabled={questionOptions.length <= 2}
                                  >
                                    <Text style={styles.optionRemoveText}>Sil</Text>
                                  </Pressable>
                                </View>
                              ))}
                              <Pressable style={styles.secondaryButton} onPress={addQuestionOption}>
                                <Text style={styles.secondaryText}>Secenek ekle</Text>
                              </Pressable>
                            </>
                          ) : null}
                          {questionType === "true_false" ? (
                            <>
                              <Text style={styles.helperText}>Dogru veya Yanlis sec</Text>
                              <View style={styles.answerRow}>
                                {trueFalseOptions.map((option) => {
                                  const active = questionAnswer === option;
                                  return (
                                    <Pressable
                                      key={`answer-${option}`}
                                      style={[styles.chip, active && styles.chipActive]}
                                      onPress={() => setQuestionAnswer(option)}
                                    >
                                      <Text style={[styles.chipText, active && styles.chipTextActive]}>
                                        {option}
                                      </Text>
                                    </Pressable>
                                  );
                                })}
                              </View>
                            </>
                          ) : questionOptions.length ? (
                            <>
                              <Text style={styles.helperText}>
                                {questionType === "multiple_select"
                                  ? "Dogru secenekleri isaretle"
                                  : "Dogru cevabi sec"}
                              </Text>
                              <View style={styles.answerRow}>
                                {questionType === "multiple_select"
                                  ? questionOptions.map((option) => {
                                    const active = questionAnswerMulti.includes(option);
                                    return (
                                      <Pressable
                                        key={`answer-${option}`}
                                        style={[styles.chip, active && styles.chipActive]}
                                        onPress={() => toggleQuestionAnswerMulti(option)}
                                      >
                                        <Text
                                          style={[styles.chipText, active && styles.chipTextActive]}
                                        >
                                          {option}
                                        </Text>
                                      </Pressable>
                                    );
                                  })
                                  : questionOptions.map((option) => {
                                    const active = questionAnswer === option;
                                    return (
                                      <Pressable
                                        key={`answer-${option}`}
                                        style={[styles.chip, active && styles.chipActive]}
                                        onPress={() => setQuestionAnswer(option)}
                                      >
                                        <Text
                                          style={[styles.chipText, active && styles.chipTextActive]}
                                        >
                                          {option}
                                        </Text>
                                      </Pressable>
                                    );
                                  })}
                              </View>
                            </>
                          ) : (
                            <Text style={styles.helperText}>Once secenekleri doldur.</Text>
                          )}
                        </>
                      ) : null}
                      {questionType === "matching" ? (
                        <>
                          <Text style={styles.helperText}>
                            Dogru eslesmeleri sol-sag olarak gir.
                          </Text>
                          {matchingPairs.map((pair, index) => (
                            <View key={`match-${index}`} style={styles.listItem}>
                              <View style={styles.pairRow}>
                                <TextInput
                                  style={[styles.input, styles.pairInput]}
                                  placeholder={`Sol ${index + 1}`}
                                  value={pair.left}
                                  onChangeText={(value) => updateMatchingPair(index, "left", value)}
                                />
                                <TextInput
                                  style={[styles.input, styles.pairInput]}
                                  placeholder={`Sag ${index + 1}`}
                                  value={pair.right}
                                  onChangeText={(value) => updateMatchingPair(index, "right", value)}
                                />
                              </View>
                              <Pressable
                                style={styles.optionRemove}
                                onPress={() => removeMatchingPair(index)}
                                disabled={matchingPairs.length <= 1}
                              >
                                <Text style={styles.optionRemoveText}>Sil</Text>
                              </Pressable>
                            </View>
                          ))}
                          <Pressable style={styles.secondaryButton} onPress={addMatchingPair}>
                            <Text style={styles.secondaryText}>Cift ekle</Text>
                          </Pressable>
                        </>
                      ) : null}
                      {questionType === "ordering" ? (
                        <>
                          <Text style={styles.helperText}>
                            Dogru sirayi olustur ve yukari/asagi ile duzenle.
                          </Text>
                          {orderingItems.map((item, index) => (
                            <View key={`order-${index}`} style={styles.listItem}>
                              <TextInput
                                style={styles.input}
                                placeholder={`Madde ${index + 1}`}
                                value={item}
                                onChangeText={(value) => updateOrderingItem(index, value)}
                              />
                              <View style={styles.rowActions}>
                                <Pressable
                                  style={styles.secondaryButton}
                                  onPress={() => moveOrderingItem(index, index - 1)}
                                  disabled={index === 0}
                                >
                                  <Text style={styles.secondaryText}>Yukari</Text>
                                </Pressable>
                                <Pressable
                                  style={styles.secondaryButton}
                                  onPress={() => moveOrderingItem(index, index + 1)}
                                  disabled={index === orderingItems.length - 1}
                                >
                                  <Text style={styles.secondaryText}>Asagi</Text>
                                </Pressable>
                                <Pressable
                                  style={styles.optionRemove}
                                  onPress={() => removeOrderingItem(index)}
                                  disabled={orderingItems.length <= 2}
                                >
                                  <Text style={styles.optionRemoveText}>Sil</Text>
                                </Pressable>
                              </View>
                            </View>
                          ))}
                          <Pressable style={styles.secondaryButton} onPress={addOrderingItem}>
                            <Text style={styles.secondaryText}>Madde ekle</Text>
                          </Pressable>
                        </>
                      ) : null}
                      {questionType === "fill_blank" ? (
                        <>
                          <Text style={styles.helperText}>
                            Soru metninde ____ ile bosluklari belirt.
                          </Text>
                          {blankAnswers.map((answers, blankIndex) => (
                            <View key={`blank-${blankIndex}`} style={styles.blankBlock}>
                              <Text style={styles.blankHeader}>Bosluk {blankIndex + 1}</Text>
                              {answers.map((answer, answerIndex) => (
                                <View key={`blank-${blankIndex}-${answerIndex}`} style={styles.optionRow}>
                                  <TextInput
                                    style={[styles.input, styles.optionInput]}
                                    placeholder={`Cevap ${answerIndex + 1}`}
                                    value={answer}
                                    onChangeText={(value) =>
                                      updateBlankAnswer(blankIndex, answerIndex, value)
                                    }
                                  />
                                  <Pressable
                                    style={styles.optionRemove}
                                    onPress={() => removeBlankAnswer(blankIndex, answerIndex)}
                                    disabled={answers.length <= 1}
                                  >
                                    <Text style={styles.optionRemoveText}>Sil</Text>
                                  </Pressable>
                                </View>
                              ))}
                              <View style={styles.rowActions}>
                                <Pressable
                                  style={styles.secondaryButton}
                                  onPress={() => addBlankAnswer(blankIndex)}
                                >
                                  <Text style={styles.secondaryText}>Cevap ekle</Text>
                                </Pressable>
                                <Pressable
                                  style={styles.optionRemove}
                                  onPress={() => removeBlank(blankIndex)}
                                  disabled={blankAnswers.length <= 1}
                                >
                                  <Text style={styles.optionRemoveText}>Bosluk sil</Text>
                                </Pressable>
                              </View>
                            </View>
                          ))}
                          <Pressable style={styles.secondaryButton} onPress={addBlank}>
                            <Text style={styles.secondaryText}>Bosluk ekle</Text>
                          </Pressable>
                        </>
                      ) : null}
                      {questionType === "short_answer" ? (
                        <>
                          <Text style={styles.helperText}>
                            Kabul edilen kisa cevaplari gir.
                          </Text>
                          {shortAnswers.map((answer, index) => (
                            <View key={`short-${index}`} style={styles.optionRow}>
                              <TextInput
                                style={[styles.input, styles.optionInput]}
                                placeholder={`Cevap ${index + 1}`}
                                value={answer}
                                onChangeText={(value) => updateShortAnswer(index, value)}
                              />
                              <Pressable
                                style={styles.optionRemove}
                                onPress={() => removeShortAnswer(index)}
                                disabled={shortAnswers.length <= 1}
                              >
                                <Text style={styles.optionRemoveText}>Sil</Text>
                              </Pressable>
                            </View>
                          ))}
                          <Pressable style={styles.secondaryButton} onPress={addShortAnswer}>
                            <Text style={styles.secondaryText}>Cevap ekle</Text>
                          </Pressable>
                        </>
                      ) : null}
                      {questionType === "long_answer" ? (
                        <>
                          <Text style={styles.helperText}>
                            Uzun cevap icin degerlendirme notu (opsiyonel).
                          </Text>
                          <TextInput
                            style={[styles.input, styles.multilineInput]}
                            placeholder="Degerlendirme notu (opsiyonel)"
                            value={longAnswerGuide}
                            onChangeText={setLongAnswerGuide}
                            multiline
                            numberOfLines={4}
                          />
                        </>
                      ) : null}
                      {questionType === "file_upload" ? (
                        <>
                          <Text style={styles.helperText}>
                            Izin verilen dosya tiplerini ve limitleri belirle.
                          </Text>
                          {fileAllowedTypes.map((item, index) => (
                            <View key={`file-type-${index}`} style={styles.optionRow}>
                              <TextInput
                                style={[styles.input, styles.optionInput]}
                                placeholder={`Izinli tur ${index + 1} (pdf, docx...)`}
                                value={item}
                                onChangeText={(value) => updateFileAllowedType(index, value)}
                              />
                              <Pressable
                                style={styles.optionRemove}
                                onPress={() => removeFileAllowedType(index)}
                                disabled={fileAllowedTypes.length <= 1}
                              >
                                <Text style={styles.optionRemoveText}>Sil</Text>
                              </Pressable>
                            </View>
                          ))}
                          <Pressable style={styles.secondaryButton} onPress={addFileAllowedType}>
                            <Text style={styles.secondaryText}>Tur ekle</Text>
                          </Pressable>
                          <TextInput
                            style={styles.input}
                            placeholder="Maks dosya sayisi"
                            value={fileMaxFiles}
                            onChangeText={setFileMaxFiles}
                          />
                          <TextInput
                            style={styles.input}
                            placeholder="Maks boyut (MB)"
                            value={fileMaxSizeMb}
                            onChangeText={setFileMaxSizeMb}
                          />
                        </>
                      ) : null}
                      {questionType === "calculation" ? (
                        <>
                          <Text style={styles.helperText}>
                            Formulu ve degisken araliklarini gir.
                          </Text>
                          <TextInput
                            style={styles.input}
                            placeholder="Formul (ornek: (a+b)*c)"
                            value={calculationFormula}
                            onChangeText={setCalculationFormula}
                          />
                          {calculationVariables.map((variable, index) => (
                            <View key={`calc-${index}`} style={styles.listItem}>
                              <View style={styles.calcRow}>
                                <TextInput
                                  style={[styles.input, styles.calcInput]}
                                  placeholder="Degisken"
                                  value={variable.name}
                                  onChangeText={(value) =>
                                    updateCalculationVariable(index, "name", value)
                                  }
                                />
                                <TextInput
                                  style={[styles.input, styles.calcInput]}
                                  placeholder="Min"
                                  value={variable.min}
                                  onChangeText={(value) =>
                                    updateCalculationVariable(index, "min", value)
                                  }
                                />
                                <TextInput
                                  style={[styles.input, styles.calcInput]}
                                  placeholder="Max"
                                  value={variable.max}
                                  onChangeText={(value) =>
                                    updateCalculationVariable(index, "max", value)
                                  }
                                />
                                <TextInput
                                  style={[styles.input, styles.calcInput]}
                                  placeholder="Adim"
                                  value={variable.step}
                                  onChangeText={(value) =>
                                    updateCalculationVariable(index, "step", value)
                                  }
                                />
                              </View>
                              <Pressable
                                style={styles.optionRemove}
                                onPress={() => removeCalculationVariable(index)}
                                disabled={calculationVariables.length <= 1}
                              >
                                <Text style={styles.optionRemoveText}>Sil</Text>
                              </Pressable>
                            </View>
                          ))}
                          <Pressable style={styles.secondaryButton} onPress={addCalculationVariable}>
                            <Text style={styles.secondaryText}>Degisken ekle</Text>
                          </Pressable>
                        </>
                      ) : null}
                      {questionType === "hotspot" ? (
                        <>
                          <Text style={styles.helperText}>
                            Resim URL ve dogru alan(lar)i gir.
                          </Text>
                          <TextInput
                            style={styles.input}
                            placeholder="Resim URL"
                            value={hotspotImageUrl}
                            onChangeText={setHotspotImageUrl}
                          />
                          {hotspotAreas.map((area, index) => (
                            <View key={`hotspot-${index}`} style={styles.listItem}>
                              <View style={styles.calcRow}>
                                <TextInput
                                  style={[styles.input, styles.calcInput]}
                                  placeholder="X"
                                  value={area.x}
                                  onChangeText={(value) => updateHotspotArea(index, "x", value)}
                                />
                                <TextInput
                                  style={[styles.input, styles.calcInput]}
                                  placeholder="Y"
                                  value={area.y}
                                  onChangeText={(value) => updateHotspotArea(index, "y", value)}
                                />
                                <TextInput
                                  style={[styles.input, styles.calcInput]}
                                  placeholder="Genislik"
                                  value={area.width}
                                  onChangeText={(value) => updateHotspotArea(index, "width", value)}
                                />
                                <TextInput
                                  style={[styles.input, styles.calcInput]}
                                  placeholder="Yukseklik"
                                  value={area.height}
                                  onChangeText={(value) => updateHotspotArea(index, "height", value)}
                                />
                              </View>
                              <Pressable
                                style={styles.optionRemove}
                                onPress={() => removeHotspotArea(index)}
                                disabled={hotspotAreas.length <= 1}
                              >
                                <Text style={styles.optionRemoveText}>Sil</Text>
                              </Pressable>
                            </View>
                          ))}
                          <Pressable style={styles.secondaryButton} onPress={addHotspotArea}>
                            <Text style={styles.secondaryText}>Alan ekle</Text>
                          </Pressable>
                        </>
                      ) : null}
                      {questionType === "code" ? (
                        <>
                          <Text style={styles.helperText}>
                            Calistirma dili ve testleri tanimla.
                          </Text>
                          <TextInput
                            style={styles.input}
                            placeholder="Dil (javascript, python...)"
                            value={codeLanguage}
                            onChangeText={setCodeLanguage}
                          />
                          <TextInput
                            style={[styles.input, styles.multilineInput]}
                            placeholder="Baslangic kodu (opsiyonel)"
                            value={codeStarter}
                            onChangeText={setCodeStarter}
                            multiline
                            numberOfLines={4}
                          />
                          {codeTests.map((test, index) => (
                            <View key={`code-test-${index}`} style={styles.listItem}>
                              <View style={styles.pairRow}>
                                <TextInput
                                  style={[styles.input, styles.pairInput]}
                                  placeholder="Input"
                                  value={test.input}
                                  onChangeText={(value) => updateCodeTest(index, "input", value)}
                                />
                                <TextInput
                                  style={[styles.input, styles.pairInput]}
                                  placeholder="Output"
                                  value={test.output}
                                  onChangeText={(value) => updateCodeTest(index, "output", value)}
                                />
                              </View>
                              <Pressable
                                style={styles.optionRemove}
                                onPress={() => removeCodeTest(index)}
                                disabled={codeTests.length <= 1}
                              >
                                <Text style={styles.optionRemoveText}>Sil</Text>
                              </Pressable>
                            </View>
                          ))}
                          <Pressable style={styles.secondaryButton} onPress={addCodeTest}>
                            <Text style={styles.secondaryText}>Test ekle</Text>
                          </Pressable>
                        </>
                      ) : null}
                      <TextInput
                        style={styles.input}
                        placeholder="Exam ID (opsiyonel)"
                        value={questionExamId}
                        onChangeText={setQuestionExamId}
                      />
                      <Pressable
                        style={styles.primaryButton}
                        onPress={handleCreateQuestion}
                        disabled={creatingQuestion}
                      >
                        {creatingQuestion ? (
                          <ActivityIndicator color="#fff" />
                        ) : (
                          <Text style={styles.primaryText}>Soru Olustur</Text>
                        )}
                      </Pressable>
                    </View>
                  ) : null
                ) : null}


                {canWrite && editingQuestionId ? (
                  <View
                    style={styles.formBlock}
                    onLayout={(event) => setEditQuestionOffset(event.nativeEvent.layout.y)}
                  >
                    <Text style={styles.formTitle}>Soruyu Duzenle</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Soru metni"
                      value={editQuestionPrompt}
                      onChangeText={setEditQuestionPrompt}
                    />
                    <View style={styles.chipRow}>
                      {questionTypeOptions.map((option) => {
                        const active = editQuestionType === option.value;
                        return (
                          <Pressable
                            key={option.value}
                            style={[styles.chip, active && styles.chipActive]}
                            onPress={() => handleEditQuestionTypeChange(option.value)}
                          >
                            <Text style={[styles.chipText, active && styles.chipTextActive]}>
                              {option.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    {isChoiceQuestion(editQuestionType) ? (
                      <>
                        {isEditableChoiceQuestion(editQuestionType) ? (
                          <>
                            {editQuestionOptions.map((option, index) => (
                              <View key={`edit-option-${index}`} style={styles.optionRow}>
                                <TextInput
                                  style={[styles.input, styles.optionInput]}
                                  placeholder={`Secenek ${index + 1}`}
                                  value={option}
                                  onChangeText={(value) => updateEditQuestionOption(index, value)}
                                />
                                <Pressable
                                  style={styles.optionRemove}
                                  onPress={() => removeEditQuestionOption(index)}
                                  disabled={editQuestionOptions.length <= 2}
                                >
                                  <Text style={styles.optionRemoveText}>Sil</Text>
                                </Pressable>
                              </View>
                            ))}
                            <Pressable style={styles.secondaryButton} onPress={addEditQuestionOption}>
                              <Text style={styles.secondaryText}>Secenek ekle</Text>
                            </Pressable>
                          </>
                        ) : null}
                        {editQuestionType === "true_false" ? (
                          <>
                            <Text style={styles.helperText}>Dogru veya Yanlis sec</Text>
                            <View style={styles.answerRow}>
                              {trueFalseOptions.map((option) => {
                                const active = editQuestionAnswer === option;
                                return (
                                  <Pressable
                                    key={`edit-answer-${option}`}
                                    style={[styles.chip, active && styles.chipActive]}
                                    onPress={() => setEditQuestionAnswer(option)}
                                  >
                                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                                      {option}
                                    </Text>
                                  </Pressable>
                                );
                              })}
                            </View>
                          </>
                        ) : editQuestionOptionList.length ? (
                          <>
                            <Text style={styles.helperText}>
                              {editQuestionType === "multiple_select"
                                ? "Dogru secenekleri isaretle"
                                : "Dogru cevabi sec"}
                            </Text>
                            <View style={styles.answerRow}>
                              {editQuestionType === "multiple_select"
                                ? editQuestionOptionList.map((option) => {
                                  const active = editQuestionAnswerMulti.includes(option);
                                  return (
                                    <Pressable
                                      key={`edit-answer-${option}`}
                                      style={[styles.chip, active && styles.chipActive]}
                                      onPress={() => toggleEditQuestionAnswerMulti(option)}
                                    >
                                      <Text
                                        style={[styles.chipText, active && styles.chipTextActive]}
                                      >
                                        {option}
                                      </Text>
                                    </Pressable>
                                  );
                                })
                                : editQuestionOptionList.map((option) => {
                                  const active = editQuestionAnswer === option;
                                  return (
                                    <Pressable
                                      key={`edit-answer-${option}`}
                                      style={[styles.chip, active && styles.chipActive]}
                                      onPress={() => setEditQuestionAnswer(option)}
                                    >
                                      <Text
                                        style={[styles.chipText, active && styles.chipTextActive]}
                                      >
                                        {option}
                                      </Text>
                                    </Pressable>
                                  );
                                })}
                            </View>
                          </>
                        ) : (
                          <Text style={styles.helperText}>Once secenekleri doldur.</Text>
                        )}
                      </>
                    ) : null}
                    {editQuestionType === "matching" ? (
                      <>
                        <Text style={styles.helperText}>
                          Dogru eslesmeleri sol-sag olarak gir.
                        </Text>
                        {editMatchingPairs.map((pair, index) => (
                          <View key={`edit-match-${index}`} style={styles.listItem}>
                            <View style={styles.pairRow}>
                              <TextInput
                                style={[styles.input, styles.pairInput]}
                                placeholder={`Sol ${index + 1}`}
                                value={pair.left}
                                onChangeText={(value) => updateEditMatchingPair(index, "left", value)}
                              />
                              <TextInput
                                style={[styles.input, styles.pairInput]}
                                placeholder={`Sag ${index + 1}`}
                                value={pair.right}
                                onChangeText={(value) => updateEditMatchingPair(index, "right", value)}
                              />
                            </View>
                            <Pressable
                              style={styles.optionRemove}
                              onPress={() => removeEditMatchingPair(index)}
                              disabled={editMatchingPairs.length <= 1}
                            >
                              <Text style={styles.optionRemoveText}>Sil</Text>
                            </Pressable>
                          </View>
                        ))}
                        <Pressable style={styles.secondaryButton} onPress={addEditMatchingPair}>
                          <Text style={styles.secondaryText}>Cift ekle</Text>
                        </Pressable>
                      </>
                    ) : null}
                    {editQuestionType === "ordering" ? (
                      <>
                        <Text style={styles.helperText}>
                          Dogru sirayi olustur ve yukari/asagi ile duzenle.
                        </Text>
                        {editOrderingItems.map((item, index) => (
                          <View key={`edit-order-${index}`} style={styles.listItem}>
                            <TextInput
                              style={styles.input}
                              placeholder={`Madde ${index + 1}`}
                              value={item}
                              onChangeText={(value) => updateEditOrderingItem(index, value)}
                            />
                            <View style={styles.rowActions}>
                              <Pressable
                                style={styles.secondaryButton}
                                onPress={() => moveEditOrderingItem(index, index - 1)}
                                disabled={index === 0}
                              >
                                <Text style={styles.secondaryText}>Yukari</Text>
                              </Pressable>
                              <Pressable
                                style={styles.secondaryButton}
                                onPress={() => moveEditOrderingItem(index, index + 1)}
                                disabled={index === editOrderingItems.length - 1}
                              >
                                <Text style={styles.secondaryText}>Asagi</Text>
                              </Pressable>
                              <Pressable
                                style={styles.optionRemove}
                                onPress={() => removeEditOrderingItem(index)}
                                disabled={editOrderingItems.length <= 2}
                              >
                                <Text style={styles.optionRemoveText}>Sil</Text>
                              </Pressable>
                            </View>
                          </View>
                        ))}
                        <Pressable style={styles.secondaryButton} onPress={addEditOrderingItem}>
                          <Text style={styles.secondaryText}>Madde ekle</Text>
                        </Pressable>
                      </>
                    ) : null}
                    {editQuestionType === "fill_blank" ? (
                      <>
                        <Text style={styles.helperText}>
                          Soru metninde ____ ile bosluklari belirt.
                        </Text>
                        {editBlankAnswers.map((answers, blankIndex) => (
                          <View key={`edit-blank-${blankIndex}`} style={styles.blankBlock}>
                            <Text style={styles.blankHeader}>Bosluk {blankIndex + 1}</Text>
                            {answers.map((answer, answerIndex) => (
                              <View
                                key={`edit-blank-${blankIndex}-${answerIndex}`}
                                style={styles.optionRow}
                              >
                                <TextInput
                                  style={[styles.input, styles.optionInput]}
                                  placeholder={`Cevap ${answerIndex + 1}`}
                                  value={answer}
                                  onChangeText={(value) =>
                                    updateEditBlankAnswer(blankIndex, answerIndex, value)
                                  }
                                />
                                <Pressable
                                  style={styles.optionRemove}
                                  onPress={() => removeEditBlankAnswer(blankIndex, answerIndex)}
                                  disabled={answers.length <= 1}
                                >
                                  <Text style={styles.optionRemoveText}>Sil</Text>
                                </Pressable>
                              </View>
                            ))}
                            <View style={styles.rowActions}>
                              <Pressable
                                style={styles.secondaryButton}
                                onPress={() => addEditBlankAnswer(blankIndex)}
                              >
                                <Text style={styles.secondaryText}>Cevap ekle</Text>
                              </Pressable>
                              <Pressable
                                style={styles.optionRemove}
                                onPress={() => removeEditBlank(blankIndex)}
                                disabled={editBlankAnswers.length <= 1}
                              >
                                <Text style={styles.optionRemoveText}>Bosluk sil</Text>
                              </Pressable>
                            </View>
                          </View>
                        ))}
                        <Pressable style={styles.secondaryButton} onPress={addEditBlank}>
                          <Text style={styles.secondaryText}>Bosluk ekle</Text>
                        </Pressable>
                      </>
                    ) : null}
                    {editQuestionType === "short_answer" ? (
                      <>
                        <Text style={styles.helperText}>
                          Kabul edilen kisa cevaplari gir.
                        </Text>
                        {editShortAnswers.map((answer, index) => (
                          <View key={`edit-short-${index}`} style={styles.optionRow}>
                            <TextInput
                              style={[styles.input, styles.optionInput]}
                              placeholder={`Cevap ${index + 1}`}
                              value={answer}
                              onChangeText={(value) => updateEditShortAnswer(index, value)}
                            />
                            <Pressable
                              style={styles.optionRemove}
                              onPress={() => removeEditShortAnswer(index)}
                              disabled={editShortAnswers.length <= 1}
                            >
                              <Text style={styles.optionRemoveText}>Sil</Text>
                            </Pressable>
                          </View>
                        ))}
                        <Pressable style={styles.secondaryButton} onPress={addEditShortAnswer}>
                          <Text style={styles.secondaryText}>Cevap ekle</Text>
                        </Pressable>
                      </>
                    ) : null}
                    {editQuestionType === "long_answer" ? (
                      <>
                        <Text style={styles.helperText}>
                          Uzun cevap icin degerlendirme notu (opsiyonel).
                        </Text>
                        <TextInput
                          style={[styles.input, styles.multilineInput]}
                          placeholder="Degerlendirme notu (opsiyonel)"
                          value={editLongAnswerGuide}
                          onChangeText={setEditLongAnswerGuide}
                          multiline
                          numberOfLines={4}
                        />
                      </>
                    ) : null}
                    {editQuestionType === "file_upload" ? (
                      <>
                        <Text style={styles.helperText}>
                          Izin verilen dosya tiplerini ve limitleri belirle.
                        </Text>
                        {editFileAllowedTypes.map((item, index) => (
                          <View key={`edit-file-type-${index}`} style={styles.optionRow}>
                            <TextInput
                              style={[styles.input, styles.optionInput]}
                              placeholder={`Izinli tur ${index + 1} (pdf, docx...)`}
                              value={item}
                              onChangeText={(value) => updateEditFileAllowedType(index, value)}
                            />
                            <Pressable
                              style={styles.optionRemove}
                              onPress={() => removeEditFileAllowedType(index)}
                              disabled={editFileAllowedTypes.length <= 1}
                            >
                              <Text style={styles.optionRemoveText}>Sil</Text>
                            </Pressable>
                          </View>
                        ))}
                        <Pressable style={styles.secondaryButton} onPress={addEditFileAllowedType}>
                          <Text style={styles.secondaryText}>Tur ekle</Text>
                        </Pressable>
                        <TextInput
                          style={styles.input}
                          placeholder="Maks dosya sayisi"
                          value={editFileMaxFiles}
                          onChangeText={setEditFileMaxFiles}
                        />
                        <TextInput
                          style={styles.input}
                          placeholder="Maks boyut (MB)"
                          value={editFileMaxSizeMb}
                          onChangeText={setEditFileMaxSizeMb}
                        />
                      </>
                    ) : null}
                    {editQuestionType === "calculation" ? (
                      <>
                        <Text style={styles.helperText}>
                          Formulu ve degisken araliklarini gir.
                        </Text>
                        <TextInput
                          style={styles.input}
                          placeholder="Formul (ornek: (a+b)*c)"
                          value={editCalculationFormula}
                          onChangeText={setEditCalculationFormula}
                        />
                        {editCalculationVariables.map((variable, index) => (
                          <View key={`edit-calc-${index}`} style={styles.listItem}>
                            <View style={styles.calcRow}>
                              <TextInput
                                style={[styles.input, styles.calcInput]}
                                placeholder="Degisken"
                                value={variable.name}
                                onChangeText={(value) =>
                                  updateEditCalculationVariable(index, "name", value)
                                }
                              />
                              <TextInput
                                style={[styles.input, styles.calcInput]}
                                placeholder="Min"
                                value={variable.min}
                                onChangeText={(value) =>
                                  updateEditCalculationVariable(index, "min", value)
                                }
                              />
                              <TextInput
                                style={[styles.input, styles.calcInput]}
                                placeholder="Max"
                                value={variable.max}
                                onChangeText={(value) =>
                                  updateEditCalculationVariable(index, "max", value)
                                }
                              />
                              <TextInput
                                style={[styles.input, styles.calcInput]}
                                placeholder="Adim"
                                value={variable.step}
                                onChangeText={(value) =>
                                  updateEditCalculationVariable(index, "step", value)
                                }
                              />
                            </View>
                            <Pressable
                              style={styles.optionRemove}
                              onPress={() => removeEditCalculationVariable(index)}
                              disabled={editCalculationVariables.length <= 1}
                            >
                              <Text style={styles.optionRemoveText}>Sil</Text>
                            </Pressable>
                          </View>
                        ))}
                        <Pressable
                          style={styles.secondaryButton}
                          onPress={addEditCalculationVariable}
                        >
                          <Text style={styles.secondaryText}>Degisken ekle</Text>
                        </Pressable>
                      </>
                    ) : null}
                    {editQuestionType === "hotspot" ? (
                      <>
                        <Text style={styles.helperText}>
                          Resim URL ve dogru alan(lar)i gir.
                        </Text>
                        <TextInput
                          style={styles.input}
                          placeholder="Resim URL"
                          value={editHotspotImageUrl}
                          onChangeText={setEditHotspotImageUrl}
                        />
                        {editHotspotAreas.map((area, index) => (
                          <View key={`edit-hotspot-${index}`} style={styles.listItem}>
                            <View style={styles.calcRow}>
                              <TextInput
                                style={[styles.input, styles.calcInput]}
                                placeholder="X"
                                value={area.x}
                                onChangeText={(value) => updateEditHotspotArea(index, "x", value)}
                              />
                              <TextInput
                                style={[styles.input, styles.calcInput]}
                                placeholder="Y"
                                value={area.y}
                                onChangeText={(value) => updateEditHotspotArea(index, "y", value)}
                              />
                              <TextInput
                                style={[styles.input, styles.calcInput]}
                                placeholder="Genislik"
                                value={area.width}
                                onChangeText={(value) =>
                                  updateEditHotspotArea(index, "width", value)
                                }
                              />
                              <TextInput
                                style={[styles.input, styles.calcInput]}
                                placeholder="Yukseklik"
                                value={area.height}
                                onChangeText={(value) =>
                                  updateEditHotspotArea(index, "height", value)
                                }
                              />
                            </View>
                            <Pressable
                              style={styles.optionRemove}
                              onPress={() => removeEditHotspotArea(index)}
                              disabled={editHotspotAreas.length <= 1}
                            >
                              <Text style={styles.optionRemoveText}>Sil</Text>
                            </Pressable>
                          </View>
                        ))}
                        <Pressable style={styles.secondaryButton} onPress={addEditHotspotArea}>
                          <Text style={styles.secondaryText}>Alan ekle</Text>
                        </Pressable>
                      </>
                    ) : null}
                    {editQuestionType === "code" ? (
                      <>
                        <Text style={styles.helperText}>
                          Calistirma dili ve testleri tanimla.
                        </Text>
                        <TextInput
                          style={styles.input}
                          placeholder="Dil (javascript, python...)"
                          value={editCodeLanguage}
                          onChangeText={setEditCodeLanguage}
                        />
                        <TextInput
                          style={[styles.input, styles.multilineInput]}
                          placeholder="Baslangic kodu (opsiyonel)"
                          value={editCodeStarter}
                          onChangeText={setEditCodeStarter}
                          multiline
                          numberOfLines={4}
                        />
                        {editCodeTests.map((test, index) => (
                          <View key={`edit-code-test-${index}`} style={styles.listItem}>
                            <View style={styles.pairRow}>
                              <TextInput
                                style={[styles.input, styles.pairInput]}
                                placeholder="Input"
                                value={test.input}
                                onChangeText={(value) => updateEditCodeTest(index, "input", value)}
                              />
                              <TextInput
                                style={[styles.input, styles.pairInput]}
                                placeholder="Output"
                                value={test.output}
                                onChangeText={(value) => updateEditCodeTest(index, "output", value)}
                              />
                            </View>
                            <Pressable
                              style={styles.optionRemove}
                              onPress={() => removeEditCodeTest(index)}
                              disabled={editCodeTests.length <= 1}
                            >
                              <Text style={styles.optionRemoveText}>Sil</Text>
                            </Pressable>
                          </View>
                        ))}
                        <Pressable style={styles.secondaryButton} onPress={addEditCodeTest}>
                          <Text style={styles.secondaryText}>Test ekle</Text>
                        </Pressable>
                      </>
                    ) : null}
                    <TextInput
                      style={styles.input}
                      placeholder="Exam ID (opsiyonel)"
                      value={editQuestionExamId}
                      onChangeText={setEditQuestionExamId}
                    />
                    <Pressable
                      style={styles.primaryButton}
                      onPress={handleUpdateQuestion}
                      disabled={updatingQuestionId === editingQuestionId}
                    >
                      {updatingQuestionId === editingQuestionId ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.primaryText}>Soruyu Guncelle</Text>
                      )}
                    </Pressable>
                    <Pressable style={styles.secondaryButton} onPress={cancelEditQuestion}>
                      <Text style={styles.secondaryText}>Iptal</Text>
                    </Pressable>
                  </View>
                ) : null}

              </View>
            </>
          )}

          {viewMode === 'exam_detail' && selectedExam && (
            <View style={styles.card}>
              <Pressable onPress={() => setViewMode('detail')} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                <Text style={{ fontSize: 18, marginRight: 8, color: '#475569' }}>←</Text>
                <Text style={{ fontWeight: '600', color: '#475569' }}>Detaya Dön</Text>
              </Pressable>

              <Text style={styles.sectionTitle}>{selectedExam.title}</Text>
              {selectedExam.durationMinutes && <Text style={styles.helperText}>Süre: {selectedExam.durationMinutes} dakika</Text>}

              {!examStarted && !examSubmissionResult ? (
                <View style={{ padding: 20, alignItems: 'center' }}>
                  <Text style={{ marginBottom: 20, textAlign: 'center', color: '#334155' }}>Sınava başlamaya hazır mısınız?</Text>
                  <Pressable style={styles.primaryButton} onPress={handleStartExam}>
                    <Text style={styles.primaryText}>Sınavı Başlat</Text>
                  </Pressable>
                </View>
              ) : examSubmissionResult ? (
                <View style={styles.resultBox}>
                  <Text style={[styles.resultTitle, { color: examSubmissionResult.passed ? '#059669' : '#dc2626' }]}>
                    {examSubmissionResult.passed ? "TEBRİKLER! GEÇTİNİZ" : "KALDINIZ"}
                  </Text>
                  <Text style={styles.resultText}>Skor: %{examSubmissionResult.score}</Text>
                  <Pressable style={[styles.secondaryButton, { marginTop: 20 }]} onPress={() => { setViewMode('detail'); setExamSubmissionResult(null); }}>
                    <Text style={styles.secondaryText}>Tamam</Text>
                  </Pressable>
                </View>
              ) : (
                <ExamTakingScreen
                  exam={selectedExam}
                  questions={questions.filter(q => q.examId === selectedExam.id)}
                  token={token || ''}
                  apiBase={getApiBaseUrl()}
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
            </View>
          )}

          {viewMode === 'omr' && selectedExam && (
            <View style={{ flex: 1, height: 700 }}>
              <View style={styles.card}>
                <Pressable onPress={() => setViewMode('list')} style={{ marginBottom: 10 }}>
                  <Text style={{ fontSize: 18, color: '#333' }}>← Listeye Dön</Text>
                </Pressable>
                <Text style={styles.sectionTitle}>{selectedExam.title} - Optik Okuma</Text>
              </View>
              <OpticReaderScreen
                route={{ params: { examId: selectedExam.id } }}
                navigation={{ goBack: () => setViewMode('list') }}
                token={token}
                apiBaseUrl={getApiBaseUrl()}
              />
            </View>
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable style={styles.primaryButton} onPress={handleRefresh} disabled={refreshing}>
            {refreshing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryText}>Refresh</Text>
            )}
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={handleLogout}>
            <Text style={styles.secondaryText}>Logout</Text>
          </Pressable>

        </ScrollView>
      )}
    </SafeAreaView>
  );
}

type ThemeColors = ReturnType<typeof useTheme>["colors"];

const createStyles = (colors: ThemeColors, isDark: boolean) =>
  StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 100,
    alignItems: "center"
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: colors.card,
    borderRadius: 24, // Rounder corners
    padding: 28,
    shadowColor: "#1e293b",
    shadowOpacity: isDark ? 0.35 : 0.15,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
    marginBottom: 24
  },
  title: {
    fontSize: 28, // Larger title
    fontWeight: "700",
    color: colors.text,
    marginBottom: 8,
    textAlign: "center"
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    marginBottom: 32,
    textAlign: "center",
    fontWeight: "500"
  },
  input: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    marginBottom: 16,
    backgroundColor: colors.surface,
    color: colors.text
  },
  helperText: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 12,
    marginLeft: 4
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 12,
    shadowColor: colors.primary,
    shadowOpacity: isDark ? 0.45 : 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4
  },
  primaryText: {
    color: colors.primaryText,
    fontWeight: "700",
    fontSize: 16,
    letterSpacing: 0.5
  },
  secondaryButton: {
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 12,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: "transparent"
  },
  secondaryText: {
    color: colors.textSecondary,
    fontWeight: "600",
    fontSize: 15
  },
  infoRow: {
    marginTop: 16,
    alignItems: "center"
  },
  statusBlock: {
    marginBottom: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginTop: 24,
    marginBottom: 16,
    color: colors.text,
    alignSelf: "flex-start",
    paddingLeft: 4
  },
  formTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 12,
    color: colors.text
  },
  listItem: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    backgroundColor: colors.card,
    shadowColor: "#64748b",
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2
  },
  listTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 4
  },
  listSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2
  },
  formBlock: {
    marginTop: 16,
    padding: 20,
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border
  },
  actionRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 12
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12
  },
  pairRow: {
    flexDirection: "row",
    gap: 12
  },
  pairInput: {
    flex: 1
  },
  rowActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 12,
    alignItems: "center"
  },
  blankBlock: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    backgroundColor: colors.card
  },
  blankHeader: {
    fontWeight: "600",
    color: colors.text,
    marginBottom: 12
  },
  calcRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12
  },
  calcInput: {
    flex: 1,
    minWidth: 80
  },
  optionInput: {
    flex: 1
  },
  optionRemove: {
    marginLeft: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.error,
    backgroundColor: isDark ? "rgba(248, 113, 113, 0.18)" : "rgba(220, 38, 38, 0.12)"
  },
  optionRemoveText: {
    color: colors.error,
    fontWeight: "600",
    fontSize: 13
  },
  answerRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 12,
    gap: 8
  },
  multilineInput: {
    minHeight: 120,
    textAlignVertical: "top"
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 16,
    gap: 8
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 24,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: colors.card
  },
  chipActive: {
    borderColor: colors.primary,
    backgroundColor: isDark ? "rgba(20, 184, 166, 0.18)" : "rgba(13, 148, 136, 0.12)"
  },
  chipText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: "600"
  },
  chipTextActive: {
    color: colors.primary
  },
  miniButton: {
    marginTop: 0,
    alignSelf: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card
  },
  miniButtonText: {
    color: colors.textSecondary,
    fontWeight: "600",
    fontSize: 13
  },
  infoLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    fontWeight: "600"
  },
  infoValue: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "500"
  },
  error: {
    color: colors.error,
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: isDark ? "rgba(248, 113, 113, 0.18)" : "rgba(220, 38, 38, 0.12)",
    overflow: "hidden",
    textAlign: "center",
    fontWeight: "500"
  },
  omrActions: {
    marginVertical: 16,
    gap: 12
  },
  preview: {
    marginTop: 16,
    width: "100%",
    height: 200,
    borderRadius: 16,
    backgroundColor: colors.border
  },
  contentPreview: {
    marginTop: 12,
    width: "100%",
    height: 180,
    borderRadius: 16,
    backgroundColor: colors.border
  },
  resultBox: {
    marginTop: 16,
    backgroundColor: "#f0f9ff",
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e0f2fe"
  },
  resultTitle: {
    fontSize: 13,
    color: "#0369a1",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    fontWeight: "700",
    marginBottom: 8
  },
  resultText: {
    fontSize: 14,
    color: "#0c4a6e",
    lineHeight: 20
  }
});

// Wrapper component with ThemeProvider
export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}
