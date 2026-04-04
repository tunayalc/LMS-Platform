"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { createApiClient, resolveApiBaseUrl } from "@lms/shared";
import ImageCropper from "./ImageCropper";

type OmrResponse = {
  success?: boolean;
  service_used?: string;
  score?: number;
  answers?: Record<string, string>;
  details?: unknown;
  debug?: {
    debugImage?: string;
  };
};

type OmrPanelProps = {
  token: string | null;
};

const sanitizeForDisplay = (value: unknown, depth = 0): unknown => {
  const MAX_DEPTH = 6;
  const MAX_ARRAY = 80;
  const MAX_KEYS = 80;
  const MAX_STRING = 600;

  if (depth > MAX_DEPTH) {
    return "[max_depth]";
  }

  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    if (value.length > MAX_STRING) {
      return `${value.slice(0, MAX_STRING)}… (len=${value.length})`;
    }
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    const truncated = value.length > MAX_ARRAY;
    const items = value.slice(0, MAX_ARRAY).map((item) => sanitizeForDisplay(item, depth + 1));
    if (truncated) {
      return { items, truncated: true, total: value.length };
    }
    return items;
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;

    const entries = Object.entries(obj);
    const truncated = entries.length > MAX_KEYS;
    const picked = entries.slice(0, MAX_KEYS);
    const out: Record<string, unknown> = {};
    for (const [key, val] of picked) {
      if (key === "debug" && typeof val === "object" && val) {
        // Omit huge base64 debug images from raw JSON; it is rendered separately as an <img>.
        const dbg = val as Record<string, unknown>;
        const dbgOut: Record<string, unknown> = {};
        for (const [dbgKey, dbgVal] of Object.entries(dbg)) {
          if (dbgKey === "debugImage" && typeof dbgVal === "string") {
            dbgOut.debugImage = "[omitted_base64_image]";
            continue;
          }
          dbgOut[dbgKey] = sanitizeForDisplay(dbgVal, depth + 1);
        }
        out[key] = dbgOut;
        continue;
      }

      out[key] = sanitizeForDisplay(val, depth + 1);
    }
    if (truncated) {
      out.__truncated__ = true;
      out.__totalKeys__ = entries.length;
    }
    return out;
  }

  return String(value);
};

const formatJson = (value: unknown) => {
  try {
    return JSON.stringify(sanitizeForDisplay(value), null, 2);
  } catch {
    return String(value ?? "");
  }
};

type DebugImageSource =
  | { kind: "none" }
  | { kind: "dataUrl"; src: string }
  | { kind: "url"; src: string }
  | { kind: "base64"; base64: string; preferredMime: "image/jpeg" | "image/png" };

const parseDebugImage = (debugImage: string): DebugImageSource => {
  let value = debugImage.trim();
  if (!value) return { kind: "none" };

  // Already a data URL
  if (value.startsWith("data:")) return { kind: "dataUrl", src: value };

  // URL
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return { kind: "url", src: value };
  }

  // Handle python bytes repr like: b'/9j/....' or b"...."
  if ((value.startsWith("b'") && value.endsWith("'")) || (value.startsWith('b"') && value.endsWith('"'))) {
    value = value.slice(2, -1);
  }

  // Sometimes backend escapes newlines as literal "\\n" sequences.
  value = value.replace(/\\r/g, "").replace(/\\n/g, "");

  // Base64 sometimes contains line breaks/spaces; remove all whitespace.
  const compact = value.replace(/\s+/g, "");
  if (!compact) return { kind: "none" };

  // Some valid JPEG base64 strings start with "/9j/" which begins with "/". Avoid treating those as a path.
  const looksLikeBase64 = /^[A-Za-z0-9+/=]+$/.test(compact) && compact.length > 64;

  // Absolute paths (if ever returned by backend)
  if (!looksLikeBase64 && value.startsWith("/")) {
    return { kind: "url", src: value };
  }

  // Detect common base64 signatures to select a mime type.
  // JPEG base64 typically starts with "/9j/" ; PNG starts with "iVBOR".
  const preferredMime: "image/jpeg" | "image/png" = compact.startsWith("iVBOR")
    ? "image/png"
    : "image/jpeg";

  return { kind: "base64", base64: compact, preferredMime };
};

const toDataUrl = (base64: string, mime: string) => `data:${mime};base64,${base64}`;

const normalizeBase64 = (value: string) => {
  let next = value.trim();
  if (!next) return "";

  // Handle python bytes repr like: b'/9j/....' or b"...."
  if ((next.startsWith("b'") && next.endsWith("'")) || (next.startsWith('b"') && next.endsWith('"'))) {
    next = next.slice(2, -1);
  }

  // Remove literal escape sequences sometimes produced by JSON-stringified payloads.
  next = next.replace(/\\r/g, "").replace(/\\n/g, "");

  // Remove whitespace
  next = next.replace(/\s+/g, "");

  // Convert url-safe base64 variants
  next = next.replace(/-/g, "+").replace(/_/g, "/");

  // Pad to length multiple of 4
  const mod = next.length % 4;
  if (mod === 2) next += "==";
  else if (mod === 3) next += "=";

  return next;
};

const detectMimeFromBytes = (bytes: Uint8Array): "image/jpeg" | "image/png" | "application/octet-stream" => {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  return "application/octet-stream";
};

const base64ToBytes = (base64: string) => {
  const binaryString = atob(base64);
  const length = binaryString.length;
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i += 1) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

function DebugImage({
  debugImage,
  label,
  errorText
}: {
  debugImage: string;
  label: string;
  errorText: string;
}) {
  const parsed = useMemo(() => parseDebugImage(debugImage), [debugImage]);
  const [failed, setFailed] = useState(false);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    setFailed(false);
    setBlobUrl(null);
  }, [debugImage]);

  if (parsed.kind === "none") {
    return <div style={{ padding: "12px", color: "var(--ink-light)", fontSize: "0.9rem" }}>{errorText}</div>;
  }

  useEffect(() => {
    if (parsed.kind === "url") {
      return;
    }

    try {
      if (typeof window === "undefined") return;

      const base64 =
        parsed.kind === "dataUrl"
          ? normalizeBase64(parsed.src.slice(parsed.src.indexOf(",") + 1))
          : normalizeBase64(parsed.base64);
      if (!base64) return;

      const bytes = base64ToBytes(base64);
      const detectedMime = detectMimeFromBytes(bytes);
      const mime =
        detectedMime === "application/octet-stream" && parsed.kind === "base64"
          ? parsed.preferredMime
          : detectedMime === "application/octet-stream"
            ? "image/jpeg"
            : detectedMime;

      const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
      setBlobUrl(url);
      return () => URL.revokeObjectURL(url);
    } catch {
      return;
    }
  }, [parsed]);

  const src = parsed.kind === "url" ? parsed.src : blobUrl ?? (parsed.kind === "dataUrl" ? parsed.src : toDataUrl(parsed.base64, parsed.preferredMime));

  return (
    <>
      {!failed ? (
        <img
          src={src}
          alt={label}
          style={{ width: "100%", maxHeight: "340px", objectFit: "contain", display: "block" }}
          onError={() => setFailed(true)}
        />
      ) : (
        <div style={{ padding: "12px", color: "var(--ink-light)", fontSize: "0.9rem" }}>{errorText}</div>
      )}
    </>
  );
}

const useObjectUrl = (file: File | null) => {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) {
      setUrl(null);
      return;
    }
    const nextUrl = URL.createObjectURL(file);
    setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [file]);
  return url;
};

export default function OmrPanel({ token }: OmrPanelProps) {
  const { t } = useTranslation();
  const apiBaseUrl = useMemo(() => resolveApiBaseUrl({ runtime: "web" }), []);
  const omrApiClient = useMemo(
    () => createApiClient({ baseUrl: apiBaseUrl, timeoutMs: 20000 }),
    [apiBaseUrl]
  );

  const [file, setFile] = useState<File | null>(null);
  const previewUrl = useObjectUrl(file);
  const [answerKey, setAnswerKey] = useState("");
  const [result, setResult] = useState<OmrResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const omrPath = "/api/omr/scan";

  // Calibration settings
  const [showSettings, setShowSettings] = useState(false);
  const [threshold, setThreshold] = useState(0.35);
  const [xOffset, setXOffset] = useState(0);
  const [yOffset, setYOffset] = useState(0);
  const [smartAlign, setSmartAlign] = useState(false);
  const [skipWarp, setSkipWarp] = useState(true);  // NEW: Skip perspective warp (default ON for cropped images)

  // Crop mode
  const [cropMode, setCropMode] = useState(false);

  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraActive(false);
  };

  useEffect(() => {
    return () => stopCamera();
  }, []);

  // Effect to bind stream to video element AFTER it mounts
  useEffect(() => {
    if (cameraActive && videoRef.current && streamRef.current) {
      console.log("[OMR] Binding stream to video element");
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(err => {
        console.error("[OMR] Video play failed:", err);
      });
    }
  }, [cameraActive]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null;
    setFile(nextFile);
    setResult(null);
    setError(null);
  };

  const handleCropComplete = (croppedBlob: Blob) => {
    const croppedFile = new File([croppedBlob], "cropped_omr.jpg", { type: "image/jpeg" });
    setFile(croppedFile);
    setCropMode(false);
  };

  const startCamera = async () => {
    setError(null);
    try {
      // Camera API requires HTTPS or localhost
      if (typeof window !== 'undefined' && window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
        setError(t("camera_https_error"));
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setError(t("camera_support_error") || "Browser not supported");
        return;
      }
      console.log("[OMR] Requesting camera access...");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      console.log("[OMR] Camera access granted, setting state...");
      streamRef.current = stream;
      // Set state FIRST - this will trigger re-render with video element
      // Then the useEffect above will bind the stream
      setCameraActive(true);
    } catch (err: any) {
      console.error("[OMR] Camera error:", err);
      if (err.name === 'NotAllowedError') {
        setError(t("camera_permission_error"));
      } else if (err.name === 'NotFoundError') {
        setError(t("camera_not_found") || "Camera not found");
      } else if (err.name === 'NotReadableError') {
        setError(t("camera_in_use") || "Camera in use");
      } else {
        setError(`${t("camera_error") || "Error"}: ${err.message || err.name}`);
      }
    }
  };

  const captureFrame = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) {
      setError(t("camera_error_video_canvas"));
      return;
    }

    // Log video state for debugging
    console.log("[OMR] Video state:", {
      readyState: video.readyState,
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight
    });

    console.log("[OMR] Capturing frame:", video.videoWidth, "x", video.videoHeight);
    // Use fallback dimensions if video reports 0
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setError(t("camera_error_canvas_context"));
      return;
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setError(t("capture_error"));
          return;
        }
        const captured = new File([blob], "omr-capture.jpg", { type: blob.type });
        setFile(captured);
        setResult(null);
        stopCamera();
      },
      "image/jpeg",
      0.95
    );
  };

  const handleScan = async () => {
    if (!token) {
      setError(t("error"));
      return;
    }
    if (!file) {
      setError(t("omr_desc"));
      return;
    }
    setProcessing(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("image", file);
      if (answerKey.trim()) {
        formData.append("answerKey", answerKey.trim());
      }
      // Add calibration parameters
      formData.append("threshold", threshold.toString());
      formData.append("xOffset", xOffset.toString());
      formData.append("yOffset", yOffset.toString());
      formData.append("smartAlign", smartAlign.toString());
      formData.append("skipWarp", skipWarp.toString());

      const response = await omrApiClient.post<OmrResponse>(omrPath, formData, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("scan_error"));
    } finally {
      setProcessing(false);
    }
  };

  // Ref for file input to clear it programmatically
  const fileInputRef = useRef<HTMLInputElement>(null);

  const clearSelection = () => {
    setFile(null);
    setResult(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="card" style={{ overflow: 'hidden', maxWidth: '100%' }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>{t("omr_title")}</h2>
          <span className="badge" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
            OMR
          </span>
      </div>
      <p className="meta">{t("omr_desc")}</p>

      <div className="form">
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "12px" }}>
          {/* File Upload Button */}
          <label className="btn btn-secondary" style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "8px", width: "auto" }}>
            <span>{t("upload_file")}</span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              style={{ display: "none" }}
            />
          </label>

          <button className="btn" type="button" onClick={startCamera} disabled={cameraActive} style={{ width: "auto" }}>
            {t("open_camera")}
          </button>
          <button className="btn btn-secondary" type="button" onClick={captureFrame} disabled={!cameraActive} style={{ width: "auto" }}>
            {t("take_photo")}
          </button>

          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => setCropMode(true)}
            disabled={!file || cameraActive}
            style={{ width: "auto" }}
          >
            {t("crop")}
          </button>

          <button className="btn btn-ghost" type="button" onClick={clearSelection} style={{ width: "auto" }}>
            {t("clear")}
          </button>
          <button className="btn btn-ghost" type="button" onClick={() => setShowSettings(!showSettings)} style={{ width: "auto" }}>
            {t("settings")}
          </button>
        </div>

        {/* Crop Mode UI */}
        {cropMode && previewUrl && (
          <div style={{ marginBottom: "16px" }}>
            <ImageCropper
              imageSrc={previewUrl}
              onCropComplete={handleCropComplete}
              onCancel={() => setCropMode(false)}
            />
          </div>
        )}

        {/* Calibration Settings Panel */}
        {showSettings && (
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", padding: "16px", borderRadius: "12px", marginBottom: "16px" }}>
            <h4 style={{ margin: "0 0 12px 0", color: "var(--ink)" }}>{t("calibration_settings")}</h4>

            <div style={{ marginBottom: "12px" }}>
              <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", color: "var(--ink)" }}>
                {t("threshold")}:
              </label>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <input
                  type="range"
                  min="0.20"
                  max="0.60"
                  step="0.01"
                  value={threshold}
                  onChange={(e) => setThreshold(parseFloat(e.target.value))}
                  style={{ flex: 1 }}
                />
                <input
                  type="number"
                  step="0.01"
                  value={threshold}
                  onChange={(e) => setThreshold(parseFloat(e.target.value))}
                  style={{ width: "80px", padding: "6px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--ink)" }}
                />
              </div>
              <small style={{ color: "var(--ink-light)" }}>{t("omr_threshold_desc") || "Low = Sensitive, High = Stringent"}</small>
            </div>

            <div style={{ marginBottom: "12px" }}>
              <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", color: "var(--ink)" }}>
                X Offset:
              </label>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <input
                  type="range"
                  min="-0.05"
                  max="0.05"
                  step="0.001"
                  value={xOffset}
                  onChange={(e) => setXOffset(parseFloat(e.target.value))}
                  style={{ flex: 1 }}
                />
                <input
                  type="number"
                  step="0.001"
                  value={xOffset}
                  onChange={(e) => setXOffset(parseFloat(e.target.value))}
                  style={{ width: "80px", padding: "6px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--ink)" }}
                />
              </div>
            </div>

            <div style={{ marginBottom: "8px" }}>
              <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", color: "var(--ink)" }}>
                Y Offset:
              </label>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <input
                  type="range"
                  min="-0.05"
                  max="0.05"
                  step="0.001"
                  value={yOffset}
                  onChange={(e) => setYOffset(parseFloat(e.target.value))}
                  style={{ flex: 1 }}
                />
                <input
                  type="number"
                  step="0.001"
                  value={yOffset}
                  onChange={(e) => setYOffset(parseFloat(e.target.value))}
                  style={{ width: "80px", padding: "6px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--ink)" }}
                />
              </div>
            </div>

            <div style={{ marginBottom: "12px" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", color: "var(--ink)", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={smartAlign}
                  onChange={(e) => setSmartAlign(e.target.checked)}
                />
                {t("omr_smart_align")}
              </label>
              <small style={{ color: "var(--ink-light)" }}>{t("omr_smart_align_desc")}</small>
            </div>

            <div style={{ marginBottom: "12px" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", color: "var(--ink)", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={skipWarp}
                  onChange={(e) => setSkipWarp(e.target.checked)}
                />
                {t("omr_skip_warp")}
              </label>
              <small style={{ color: "var(--ink-light)" }}>{t("omr_skip_warp_desc")}</small>
            </div>

            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => { setThreshold(0.35); setXOffset(0); setYOffset(0); setSmartAlign(false); setSkipWarp(true); }}
              style={{ marginTop: "8px", width: "auto" }}
            >
              {t("default_settings")}
            </button>
          </div>
        )}

        {cameraActive ? (
          <div style={{ marginTop: 12 }}>
            <video ref={videoRef} style={{ width: "100%", borderRadius: 12 }} muted autoPlay playsInline />
            <canvas ref={canvasRef} style={{ display: "none" }} />
          </div>
        ) : null}

        {previewUrl ? (
          <div style={{ marginTop: 12 }}>
            <h4 style={{ margin: '0 0 8px 0' }}>{t("preview")}:</h4>
            <img
              src={previewUrl}
              alt="OMR preview"
              style={{ width: "100%", maxHeight: "400px", objectFit: "contain", borderRadius: 12, border: "1px solid #e2e8f0", background: "#f1f5f9" }}
            />
          </div>
        ) : null}

        <textarea
          className="input"
          rows={4}
          placeholder={t("answer_key_placeholder")}
          value={answerKey}
          onChange={(event) => setAnswerKey(event.target.value)}
        />

        <button className="btn" type="button" onClick={handleScan} disabled={processing}>
          {processing ? t("scanning") : t("scan_start")}
        </button>
      </div>

      {error ? <div className="error">{error}</div> : null}
      {result ? (() => {
        // Calculate statistics from result
        const answers = result.answers || {};
        const details = (result.details as { selected?: string; correct?: boolean }[]) || [];

        const totalQuestions = Object.keys(answers).length;
        const answered = Object.values(answers).filter(a => a && a !== '').length;
        const blank = totalQuestions - answered;
        const correct = details.filter(d => d.correct === true).length;
        const wrong = answered - correct;

        return (
          <div style={{ marginTop: 20 }}>
            {/* Service Badge */}
            <div style={{ display: "flex", gap: "12px", alignItems: "center", marginBottom: "16px" }}>
              <span className="meta">{t("scan_result")}</span>
              <span
                className="badge"
                style={{
                  background: result.service_used === "python" ? "#22c55e" : "#f59e0b",
                  color: "#fff",
                  fontSize: "12px",
                }}
              >
                {result.service_used === "python" ? "✅ Python" : "⚠️ Node.js (Fallback)"}
              </span>
            </div>

            {/* Statistics Cards */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
              gap: "12px",
              marginBottom: "20px"
            }}>
              {/* Total Questions */}
              <div style={{
                background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                borderRadius: "16px",
                padding: "20px",
                textAlign: "center",
                color: "#fff",
                boxShadow: "0 4px 15px rgba(102, 126, 234, 0.3)"
              }}>
                <div style={{ fontSize: "2.5rem", fontWeight: "800" }}>{totalQuestions}</div>
                <div style={{ fontSize: "0.85rem", opacity: 0.9 }}>{t("total_questions")}</div>
              </div>

              {/* Correct */}
              <div style={{
                background: "linear-gradient(135deg, #11998e 0%, #38ef7d 100%)",
                borderRadius: "16px",
                padding: "20px",
                textAlign: "center",
                color: "#fff",
                boxShadow: "0 4px 15px rgba(17, 153, 142, 0.3)"
              }}>
                <div style={{ fontSize: "2.5rem", fontWeight: "800" }}>{correct}</div>
                <div style={{ fontSize: "0.85rem", opacity: 0.9 }}>✓ {t("correct")}</div>
              </div>

              {/* Wrong */}
              <div style={{
                background: "linear-gradient(135deg, #eb3349 0%, #f45c43 100%)",
                borderRadius: "16px",
                padding: "20px",
                textAlign: "center",
                color: "#fff",
                boxShadow: "0 4px 15px rgba(235, 51, 73, 0.3)"
              }}>
                <div style={{ fontSize: "2.5rem", fontWeight: "800" }}>{wrong}</div>
                <div style={{ fontSize: "0.85rem", opacity: 0.9 }}>✗ {t("wrong")}</div>
              </div>

              {/* Blank */}
              <div style={{
                background: "linear-gradient(135deg, #bdc3c7 0%, #7f8c8d 100%)",
                borderRadius: "16px",
                padding: "20px",
                textAlign: "center",
                color: "#fff",
                boxShadow: "0 4px 15px rgba(127, 140, 141, 0.3)"
              }}>
                <div style={{ fontSize: "2.5rem", fontWeight: "800" }}>{blank}</div>
                <div style={{ fontSize: "0.85rem", opacity: 0.9 }}>○ {t("empty")}</div>
              </div>
            </div>

            {/* Score Bar */}
            {totalQuestions > 0 && (
              <div style={{ marginBottom: "20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                  <span style={{ fontWeight: "600" }}>{t("score") || "Puan"}</span>
                  <span style={{ fontWeight: "700", color: "#22c55e" }}>
                    {answered > 0 ? Math.round((correct / answered) * 100) : 0}%
                  </span>
                </div>
                <div style={{
                  height: "12px",
                  background: "var(--border)",
                  borderRadius: "6px",
                  overflow: "hidden"
                }}>
                  <div style={{
                    height: "100%",
                    width: `${answered > 0 ? (correct / answered) * 100 : 0}%`,
                    background: "linear-gradient(90deg, #22c55e 0%, #16a34a 100%)",
                    borderRadius: "6px",
                    transition: "width 0.5s ease"
                  }} />
                </div>
              </div>
            )}

            {/* Debug Image */}
            {result.debug?.debugImage && (
              <div style={{ marginTop: "20px", borderTop: "1px solid var(--border)", paddingTop: "16px" }}>
                <h4 style={{ color: "#ef4444", marginBottom: "8px" }}>{t("omr_debug_title") || "Debug Görüntüsü"}</h4>
                <p style={{ fontSize: "12px", color: "var(--ink-light)", marginBottom: "12px" }}>
                  {t("omr_debug_desc") || "Kırmızı noktalar tarama noktaları, yeşil daireler tespit edilen cevaplar"}
                </p>
                <div style={{ overflow: "hidden", border: "2px solid #ef4444", borderRadius: "12px", maxHeight: "350px" }}>
                  <DebugImage
                    debugImage={result.debug.debugImage}
                    label="Debug Grid"
                    errorText={t("image_load_error") || "Görsel yüklenemedi."}
                  />
                </div>
              </div>
            )}

            {/* Raw JSON Toggle */}
            <details style={{ marginTop: "16px" }}>
              <summary style={{ cursor: "pointer", color: "var(--ink-light)", fontSize: "0.85rem" }}>
                {t("show_raw_data") || "Ham Veriyi Göster"}
              </summary>
              <pre
                style={{
                  background: "var(--code-bg)",
                  color: "var(--code-ink)",
                  border: "1px solid var(--code-border)",
                  padding: "12px",
                  borderRadius: 12,
                  whiteSpace: "pre-wrap",
                  overflowWrap: "anywhere",
                  wordBreak: "break-word",
                  overflowY: "auto",
                  overflowX: "hidden",
                  maxHeight: "200px",
                  fontSize: "0.75rem",
                  marginTop: "8px"
                }}
              >
                {formatJson(result)}
              </pre>
            </details>
          </div>
        );
      })() : null}
    </div>
  );
}
