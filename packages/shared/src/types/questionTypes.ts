export type QuestionType =
  | "multiple_choice"
  | "multiple_select"
  | "true_false"
  | "matching"
  | "ordering"
  | "fill_blank"
  | "short_answer"
  | "long_answer"
  | "file_upload"
  | "calculation"
  | "hotspot"
  | "code";

export type QuestionAnswer = string | string[] | boolean | number;

export const questionTypeOptions: { value: QuestionType; label: string }[] = [
  { value: "multiple_choice", label: "Coktan Secmeli" },
  { value: "multiple_select", label: "Coklu Secim" },
  { value: "true_false", label: "Dogru/Yanlis" },
  { value: "matching", label: "Eslestirme" },
  { value: "ordering", label: "Siralama" },
  { value: "fill_blank", label: "Bosluk Doldurma" },
  { value: "short_answer", label: "Kisa Cevap" },
  { value: "long_answer", label: "Uzun Cevap" },
  { value: "file_upload", label: "Dosya Yukleme" },
  { value: "calculation", label: "Hesaplama" },
  { value: "hotspot", label: "Hotspot" },
  { value: "code", label: "Kod Calistirma" }
];

export const trueFalseOptions = ["Dogru", "Yanlis"] as const;

export const questionTypeValues = questionTypeOptions.map((option) => option.value);
