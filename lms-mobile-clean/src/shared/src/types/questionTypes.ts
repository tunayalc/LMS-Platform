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
  { value: "multiple_choice", label: "Çoktan Seçmeli" },
  { value: "multiple_select", label: "Çoklu Seçim" },
  { value: "true_false", label: "Doğru/Yanlış" },
  { value: "matching", label: "Eşleştirme" },
  { value: "ordering", label: "Sıralama" },
  { value: "fill_blank", label: "Boşluk Doldurma" },
  { value: "short_answer", label: "Kısa Cevap" },
  { value: "long_answer", label: "Uzun Cevap" },
  { value: "file_upload", label: "Dosya Yükleme" },
  { value: "calculation", label: "Hesaplama" },
  { value: "hotspot", label: "Hotspot" },
  { value: "code", label: "Kod Çalıştırma" }
];

export const trueFalseOptions = ["Doğru", "Yanlış"] as const;

export const questionTypeValues = questionTypeOptions.map((option) => option.value);
