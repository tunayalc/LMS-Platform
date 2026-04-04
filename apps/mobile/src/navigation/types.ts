export type RootStackParamList = {
    Auth: undefined;
    Dashboard: { role: string };
    // Modal/FullScreen Global Routes
    ExamTaking: { examId: string };
    PdfViewer: { uri: string; title?: string; contentId?: string };
    VideoPlayer: { url: string; title?: string; contentId?: string };
    WebViewer: { uri: string; title?: string };
    // Course Related
    CourseDetail: { courseId: string };
    CourseForm: { courseId?: string };
    ModulesEditor: { courseId: string };
    CourseRubrics: { courseId: string };
    QuestionBank: { courseId: string };
    CourseGradebook: { courseId: string };
    CourseNotes: { courseId: string };
    // Exam Related
    ExamForm: { examId?: string; courseId: string };
    QuestionForm: { questionId?: string; examId: string };
    // Content Related
    ContentForm: { contentId?: string; courseId: string; moduleId?: string };
    // User Related
    UserForm: { userId?: string };
};

export type AuthStackParamList = {
    Login: undefined;
    Register: undefined;
    ForgotPassword: undefined;
    TwoFactor: { tempToken: string };
    Kvkk: undefined;
};

export type DashboardTabParamList = {
    Home: undefined;
    Courses: undefined;
    Exams: undefined;
    OMR: undefined;
    Users: undefined;
    Profile: undefined;
};
