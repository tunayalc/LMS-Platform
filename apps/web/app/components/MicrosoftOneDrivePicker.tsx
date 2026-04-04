"use client";

import { useState } from "react";

type OneDriveItem = {
  id: string;
  name: string;
  webUrl?: string;
  size?: number;
  file?: { mimeType?: string };
  folder?: { childCount?: number };
};

type PickerProps = {
  apiBaseUrl: string | null;
  token: string | null;
  onSelect: (file: { name: string; url: string; type: "video" | "pdf" }) => void;
};

const resolveContentType = (item: OneDriveItem): "video" | "pdf" => {
  const name = item.name.toLowerCase();
  const mime = item.file?.mimeType?.toLowerCase() ?? "";
  if (mime.includes("pdf") || name.endsWith(".pdf")) {
    return "pdf";
  }
  return "video";
};

export default function MicrosoftOneDrivePicker({ apiBaseUrl, token, onSelect }: PickerProps) {
  const [items, setItems] = useState<OneDriveItem[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadItems = async () => {
    if (!apiBaseUrl) {
      setError("API base URL not ready.");
      return;
    }
    if (!token) {
      setError("Login required to access OneDrive.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const response = await fetch(`${apiBaseUrl}/integrations/microsoft/onedrive`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.message || "OneDrive fetch failed.");
      }
      const nextItems = Array.isArray(data.items) ? data.items : [];
      setItems(nextItems);
      if (nextItems.length > 0) {
        setSelectedId(nextItems[0].id);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "OneDrive fetch failed.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const useSelected = () => {
    const selected = items.find((item) => item.id === selectedId);
    if (!selected || !selected.webUrl) {
      setError("Select a file with a URL.");
      return;
    }
    onSelect({
      name: selected.name,
      url: selected.webUrl,
      type: resolveContentType(selected)
    });
  };

  return (
    <div className="form-group" style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button className="btn btn-secondary" type="button" onClick={loadItems} disabled={loading}>
          {loading ? "Loading OneDrive..." : "Microsoft OneDrive"}
        </button>
        {items.length > 0 ? (
          <>
            <select
              className="input"
              value={selectedId}
              onChange={(event) => {
                setSelectedId(event.target.value);
                // Auto-select immediately
                const id = event.target.value;
                const selected = items.find((item) => item.id === id);
                if (selected && selected.webUrl) {
                  onSelect({
                    name: selected.name,
                    url: selected.webUrl,
                    type: resolveContentType(selected)
                  });
                }
              }}
            >
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </>
        ) : null}
      </div>
      {error ? (
        <div className="error" style={{ marginTop: 8 }}>
          {error}
        </div>
      ) : null}
    </div>
  );
}
