import type { QuestionAnswer, QuestionType } from "./questionTypes";

export type Role = "SuperAdmin" | "Admin" | "Instructor" | "Assistant" | "Student" | "Guest";

export type HealthResponse = {
  status: "ok";
  uptime: number;
  timestamp: string;
  mode: "local" | "docker";
};

export type VersionResponse = {
  name: string;
  version: string;
  node: string;
  mode: "local" | "docker";
  timestamp: string;
};

export type AuthLoginRequest = {
  username: string;
  password: string;
};

export type AuthLoginResponse = {
  token: string;
  user: User;
  requires2FA?: boolean;
};

export type User = {
  id: string;
  username: string;
  role: Role;
};

export type Course = {
  id: string;
  title: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
};

export type Exam = {
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

export type QuestionMatchingPair = {
  left: string;
  right: string;
};

export type QuestionCalculationVariable = {
  name: string;
  min?: number;
  max?: number;
  step?: number;
};

export type QuestionHotspotArea = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type QuestionCodeTest = {
  input: string;
  output: string;
};



export type RubricItem = {
  criteria: string;
  points: number;
  description?: string;
};

export type QuestionMeta = {
  matchingPairs?: QuestionMatchingPair[];
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
    variables?: QuestionCalculationVariable[];
  };
  hotspot?: {
    imageUrl: string;
    areas: QuestionHotspotArea[];
  };
  code?: {
    language: string;
    starter?: string;
    tests?: QuestionCodeTest[];
  };
  rubric?: RubricItem[];
};

export type Question = {
  id: string;
  examId?: string;
  prompt: string;
  type: QuestionType;
  options?: string[];
  answer?: QuestionAnswer;
  meta?: QuestionMeta;
  points?: number;
  createdAt: string;
};

export type Content = {
  id: string;
  type: string;
  title: string;
  source?: string;
  meetingUrl?: string;
  courseId?: string;
  createdAt: string;
  updatedAt: string;
};

export type ScormPackage = {
  id: string;
  courseId: string;
  title: string;
  version: string;
  entryPoint?: string;
  createdAt: string;
};

export * from "./questionTypes";
