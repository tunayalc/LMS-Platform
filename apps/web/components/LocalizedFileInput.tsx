"use client";

import { useId, useState } from "react";
import { useTranslation } from "react-i18next";

type Props = {
  accept?: string;
  onSelect: (file: File | null) => void;
};

export default function LocalizedFileInput({ accept, onSelect }: Props) {
  const { t } = useTranslation();
  const inputId = useId();
  const [fileName, setFileName] = useState<string | null>(null);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        width: "100%",
        padding: "12px 16px",
        borderRadius: "12px",
        border: "1px solid var(--border)",
        background: "var(--bg)"
      }}
    >
      <input
        id={inputId}
        type="file"
        accept={accept}
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0] ?? null;
          setFileName(file?.name ?? null);
          onSelect(file);
        }}
      />
      <label
        htmlFor={inputId}
        style={{
          cursor: "pointer",
          userSelect: "none",
          padding: "10px 14px",
          borderRadius: "10px",
          border: "1px solid var(--border)",
          background: "var(--card)",
          color: "var(--ink)",
          fontWeight: 700,
          whiteSpace: "nowrap"
        }}
      >
        {t("file_select_btn")}
      </label>
      <span
        style={{
          color: "var(--ink-light)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap"
        }}
        title={fileName ?? undefined}
      >
        {fileName ?? t("no_file_chosen")}
      </span>
    </div>
  );
}

