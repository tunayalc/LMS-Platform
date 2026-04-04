import React, { useState } from "react";
import useDrivePicker from "react-google-drive-picker";

type PickerProps = {
  onSelect: (file: { url: string; name: string; type: "pdf" | "video" }) => void;
};

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";
const GOOGLE_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_API_KEY || "";

export default function CloudFilePicker({ onSelect }: PickerProps) {
  const [openGooglePicker] = useDrivePicker();
  const [loading, setLoading] = useState(false);

  const handleGooglePick = () => {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_API_KEY) {
      alert("Google Drive icin NEXT_PUBLIC_GOOGLE_CLIENT_ID ve NEXT_PUBLIC_GOOGLE_API_KEY ayarlayin.");
      return;
    }

    setLoading(true);

    try {
      openGooglePicker({
        clientId: GOOGLE_CLIENT_ID,
        developerKey: GOOGLE_API_KEY,
        viewId: "DOCS",
        showUploadView: true,
        showUploadFolders: true,
        supportDrives: true,
        multiselect: false,
        callbackFunction: (data) => {
          if (data.action === "picked") {
            const file = data.docs[0];
            const isVideo = file.mimeType.includes("video");
            const isPdf = file.mimeType.includes("pdf");

            if (!isVideo && !isPdf) {
              alert("Sadece PDF veya Video secilebilir.");
            } else {
              onSelect({
                url: file.url,
                name: file.name,
                type: isVideo ? "video" : "pdf"
              });
            }
          }
          setLoading(false);
        }
      });
    } catch (err) {
      console.error("Google Picker Error:", err);
      setLoading(false);
    }
  };

  return (
    <div className="flex gap-2 mb-4">
      <button
        type="button"
        onClick={handleGooglePick}
        disabled={loading}
        className="btn"
        style={{ backgroundColor: "#DB4437", color: "white", display: "flex", alignItems: "center", gap: "8px" }}
      >
        {loading ? "Yukleniyor..." : <span>Google Drive</span>}
      </button>
    </div>
  );
}
