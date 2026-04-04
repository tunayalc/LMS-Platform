"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

type DownloadStatus = "pending" | "downloading" | "paused" | "completed" | "failed";

type DownloadItem = {
  id: string;
  url: string;
  filename: string;
  savePath: string;
  progress: number;
  status: DownloadStatus;
  bytesReceived: number;
  totalBytes: number;
};

type OfflineQueuedAction = {
  id: string;
  type: string;
  payload: unknown;
  timestamp: string;
};

type OfflineSyncResult = {
  success: boolean;
  synced: number;
  remaining?: number;
};

const useIpc = () => {
  return useMemo(() => {
    if (typeof window === "undefined") {
      return null;
    }
    const ipc = (window as any).ipcRenderer as
      | {
          on: (channel: string, listener: (...args: any[]) => void) => void;
          off: (channel: string, listener: (...args: any[]) => void) => void;
          send: (channel: string, ...args: any[]) => void;
          invoke: <T = unknown>(channel: string, ...args: any[]) => Promise<T>;
        }
      | undefined;
    if (!ipc?.invoke) {
      return null;
    }
    return ipc;
  }, []);
};

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export default function DesktopPanel() {
  const { t } = useTranslation();
  const ipc = useIpc();

  const [updateState, setUpdateState] = useState<"idle" | "available" | "downloaded">("idle");
  const [downloads, setDownloads] = useState<Record<string, DownloadItem>>({});
  const [downloadUrl, setDownloadUrl] = useState("");
  const [downloadFilename, setDownloadFilename] = useState("");
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const [offlineQueue, setOfflineQueue] = useState<OfflineQueuedAction[]>([]);
  const [offlineLastSync, setOfflineLastSync] = useState<string | null>(null);
  const [offlineSyncing, setOfflineSyncing] = useState(false);
  const [offlineSyncResult, setOfflineSyncResult] = useState<OfflineSyncResult | null>(null);

  const [mediaError, setMediaError] = useState<string | null>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!ipc) return;

    const onUpdateAvailable = () => setUpdateState("available");
    const onUpdateDownloaded = () => setUpdateState("downloaded");

    const onDownloadProgress = (
      _event: unknown,
      payload: { id: string; progress: number; bytesReceived: number; totalBytes?: number },
    ) => {
      setDownloads((prev) => {
        const existing = prev[payload.id];
        if (!existing) return prev;
        return {
          ...prev,
          [payload.id]: {
            ...existing,
            progress: payload.progress,
            bytesReceived: payload.bytesReceived,
            totalBytes: typeof payload.totalBytes === "number" ? payload.totalBytes : existing.totalBytes,
            status: existing.status === "paused" ? "paused" : "downloading",
          },
        };
      });
    };

    const onDownloadComplete = (_event: unknown, payload: { id: string; path: string }) => {
      setDownloads((prev) => {
        const existing = prev[payload.id];
        if (!existing) return prev;
        return {
          ...prev,
          [payload.id]: { ...existing, status: "completed", progress: 100, savePath: payload.path },
        };
      });
    };

    const onDownloadFailed = (_event: unknown, payload: { id: string; error: string }) => {
      setDownloads((prev) => {
        const existing = prev[payload.id];
        if (!existing) return prev;
        return { ...prev, [payload.id]: { ...existing, status: "failed" } };
      });
      setDownloadError(payload.error || "download_failed");
    };

    ipc.on("update_available", onUpdateAvailable);
    ipc.on("update_downloaded", onUpdateDownloaded);
    ipc.on("download-progress", onDownloadProgress);
    ipc.on("download-complete", onDownloadComplete);
    ipc.on("download-failed", onDownloadFailed);

    return () => {
      ipc.off("update_available", onUpdateAvailable);
      ipc.off("update_downloaded", onUpdateDownloaded);
      ipc.off("download-progress", onDownloadProgress);
      ipc.off("download-complete", onDownloadComplete);
      ipc.off("download-failed", onDownloadFailed);
    };
  }, [ipc]);

  useEffect(() => {
    if (!ipc) return;
    void (async () => {
      try {
        const list = await ipc.invoke<DownloadItem[]>("download-list");
        const next: Record<string, DownloadItem> = {};
        for (const item of list) {
          next[item.id] = item;
        }
        setDownloads(next);
      } catch {
        // ignore
      }
    })();
  }, [ipc]);

  useEffect(() => {
    if (!ipc) return;
    void (async () => {
      try {
        const queue = await ipc.invoke<OfflineQueuedAction[]>("offline-queue-get");
        setOfflineQueue(queue);
        const lastSync = await ipc.invoke<string | null>("offline-last-sync");
        setOfflineLastSync(lastSync);
      } catch {
        // ignore
      }
    })();
  }, [ipc]);

  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.srcObject = cameraStream;
  }, [cameraStream]);

  if (!ipc) {
    return null;
  }

  const downloadList = Object.values(downloads).sort((a, b) => b.id.localeCompare(a.id));

  return (
    <div className="card" style={{ marginTop: 24 }}>
      <h3 style={{ marginBottom: 12 }}>{t("settings_desktop_title", "Masaüstü (Electron)")}</h3>
      <p className="meta" style={{ marginBottom: 16 }}>
        {t("settings_desktop_desc", "Bu ayarlar yalnızca Electron masaüstü uygulamasında görünür.")}
      </p>

      {/* Updates */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h4 style={{ marginBottom: 8 }}>{t("settings_updates", "Güncellemeler")}</h4>
        <div className="meta" style={{ marginBottom: 12 }}>
          {updateState === "idle"
            ? t("settings_updates_idle", "Durum: bilinmiyor")
            : updateState === "available"
              ? t("settings_updates_available", "Yeni sürüm bulundu, indiriliyor/indirilebilir.")
              : t("settings_updates_downloaded", "İndirildi, kuruluma hazır.")}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn-outline" type="button" onClick={() => ipc.send("check-updates")}>
            {t("settings_updates_check", "Güncellemeleri Kontrol Et")}
          </button>
          <button
            className="btn"
            type="button"
            disabled={updateState !== "downloaded"}
            onClick={() => ipc.send("install-update")}
          >
            {t("settings_updates_install", "Kur ve Yeniden Başlat")}
          </button>
        </div>
      </div>

      {/* Downloads */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h4 style={{ marginBottom: 8 }}>{t("settings_downloads", "İndirmeler")}</h4>
        {downloadError ? (
          <div className="meta" style={{ color: "#ef4444", marginBottom: 8 }}>
            {String(downloadError)}
          </div>
        ) : null}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <input
            className="input"
            placeholder={t("settings_download_url", "Dosya URL")}
            value={downloadUrl}
            onChange={(e) => setDownloadUrl(e.target.value)}
            style={{ flex: 1, minWidth: 260 }}
          />
          <input
            className="input"
            placeholder={t("settings_download_filename", "Dosya adı (opsiyonel)")}
            value={downloadFilename}
            onChange={(e) => setDownloadFilename(e.target.value)}
            style={{ flex: 1, minWidth: 200 }}
          />
          <button
            className="btn"
            type="button"
            onClick={async () => {
              setDownloadError(null);
              const url = downloadUrl.trim();
              if (!url) return;
              try {
                const id = await ipc.invoke<string | null>("download-start", url, downloadFilename.trim() || undefined);
                if (!id) return;
                setDownloads((prev) => ({
                  ...prev,
                  [id]: {
                    id,
                    url,
                    filename: downloadFilename.trim() || "",
                    savePath: "",
                    progress: 0,
                    status: "pending",
                    bytesReceived: 0,
                    totalBytes: 0,
                  },
                }));
                setDownloadUrl("");
                setDownloadFilename("");
              } catch (err) {
                setDownloadError(err instanceof Error ? err.message : String(err));
              }
            }}
          >
            {t("settings_download_start", "İndir")}
          </button>
        </div>

        {downloadList.length === 0 ? (
          <div className="meta">{t("settings_downloads_empty", "Henüz indirme yok.")}</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {downloadList.map((item) => (
              <div key={item.id} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                  <div style={{ minWidth: 240 }}>
                    <div style={{ fontWeight: 700 }}>{item.filename || item.url}</div>
                    <div className="meta">
                      {item.status} • {item.progress}% • {formatBytes(item.bytesReceived)}
                      {item.totalBytes ? ` / ${formatBytes(item.totalBytes)}` : ""}
                    </div>
                    {item.savePath ? <div className="meta">{item.savePath}</div> : null}
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <button
                      className="btn btn-outline"
                      type="button"
                      disabled={item.status !== "downloading"}
                      onClick={async () => {
                        const ok = await ipc.invoke<boolean>("download-pause", item.id);
                        if (!ok) return;
                        setDownloads((prev) => {
                          const existing = prev[item.id];
                          if (!existing) return prev;
                          return { ...prev, [item.id]: { ...existing, status: "paused" } };
                        });
                      }}
                    >
                      {t("pause", "Duraklat")}
                    </button>
                    <button
                      className="btn btn-outline"
                      type="button"
                      disabled={item.status !== "paused"}
                      onClick={async () => {
                        const ok = await ipc.invoke<boolean>("download-resume", item.id);
                        if (!ok) return;
                        setDownloads((prev) => {
                          const existing = prev[item.id];
                          if (!existing) return prev;
                          return { ...prev, [item.id]: { ...existing, status: "pending" } };
                        });
                      }}
                    >
                      {t("resume", "Devam")}
                    </button>
                    <button
                      className="btn btn-ghost"
                      type="button"
                      onClick={async () => {
                        const ok = await ipc.invoke<boolean>("download-cancel", item.id);
                        if (!ok) return;
                        setDownloads((prev) => {
                          const existing = prev[item.id];
                          if (!existing) return prev;
                          return { ...prev, [item.id]: { ...existing, status: "failed" } };
                        });
                      }}
                    >
                      {t("cancel", "İptal")}
                    </button>
                  </div>
                </div>
                <div style={{ height: 8, background: "var(--border)", borderRadius: 999, overflow: "hidden", marginTop: 10 }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${Math.max(0, Math.min(100, item.progress || 0))}%`,
                      background: "var(--accent)",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Offline Sync */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h4 style={{ marginBottom: 8 }}>{t("settings_offline", "Offline Senkron")}</h4>
        <div className="meta" style={{ marginBottom: 8 }}>
          {t("settings_offline_queue", "Kuyruk")}: {offlineQueue.length} •{" "}
          {t("settings_offline_last_sync", "Son senkron")}: {offlineLastSync || "-"}
        </div>
        {offlineSyncResult ? <div className="meta">{JSON.stringify(offlineSyncResult)}</div> : null}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <button
            className="btn"
            type="button"
            disabled={offlineSyncing}
            onClick={async () => {
              setOfflineSyncing(true);
              try {
                const token = localStorage.getItem("lms_token") || undefined;
                const result = await ipc.invoke<OfflineSyncResult>("offline-queue-sync", token);
                setOfflineSyncResult(result);
                const queue = await ipc.invoke<OfflineQueuedAction[]>("offline-queue-get");
                setOfflineQueue(queue);
                const last = await ipc.invoke<string | null>("offline-last-sync");
                setOfflineLastSync(last);
              } finally {
                setOfflineSyncing(false);
              }
            }}
          >
            {offlineSyncing ? t("loading", "Yükleniyor...") : t("settings_offline_sync_now", "Şimdi Senkronla")}
          </button>
          <button
            className="btn btn-outline"
            type="button"
            onClick={async () => {
              await ipc.invoke("offline-queue-clear");
              setOfflineQueue([]);
              setOfflineSyncResult(null);
            }}
          >
            {t("settings_offline_clear", "Kuyruğu Temizle")}
          </button>
        </div>
        {offlineQueue.length > 0 ? (
          <details style={{ marginTop: 12 }}>
            <summary style={{ cursor: "pointer" }}>{t("settings_offline_queue_details", "Kuyruk Detayları")}</summary>
            <pre style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{JSON.stringify(offlineQueue, null, 2)}</pre>
          </details>
        ) : null}
      </div>

      {/* Webcam / Mic */}
      <div className="card">
        <h4 style={{ marginBottom: 8 }}>{t("settings_media", "Webcam / Mikrofon")}</h4>
        {mediaError ? (
          <div className="meta" style={{ color: "#ef4444", marginBottom: 8 }}>
            {mediaError}
          </div>
        ) : null}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <button
            className="btn btn-outline"
            type="button"
            onClick={async () => {
              setMediaError(null);
              try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                setCameraStream(stream);
              } catch (err) {
                setMediaError(err instanceof Error ? err.message : String(err));
              }
            }}
          >
            {t("settings_media_start", "Kamerayı Başlat")}
          </button>
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => {
              cameraStream?.getTracks().forEach((t) => t.stop());
              setCameraStream(null);
            }}
          >
            {t("settings_media_stop", "Durdur")}
          </button>
        </div>
        <div style={{ borderRadius: 12, overflow: "hidden", background: "#000" }}>
          <video ref={videoRef} autoPlay playsInline muted style={{ width: "100%", maxHeight: 320 }} />
        </div>
      </div>
    </div>
  );
}
