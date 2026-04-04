"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ScormPlayer from "../../components/ScormPlayer";
// Ensure resolveApiBaseUrl is available or use a fallback
import { resolveApiBaseUrl } from "@lms/shared";
import { useTranslation } from "react-i18next";

export default function ScormPlayerPage({ params }: { params: { id: string } }) {
    const { t } = useTranslation();
    const [url, setUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [apiBaseUrl, setApiBaseUrl] = useState<string>("");
    const router = useRouter();

    useEffect(() => {
        const init = async () => {
            try {
                const base = resolveApiBaseUrl({ runtime: "web" });
                setApiBaseUrl(base);

                const token = localStorage.getItem("lms_token");
                if (!token) {
                    // Redirect to login handled by middleware mostly, but just in case
                    window.location.href = "/";
                    return;
                }

                // 1. Start Session
                // For now, we assume GET /launch does both? Or we need to call start explicitly?
                // Based on previous code, it was GET /scorm/:id/launch
                const res = await fetch(`${base}/scorm/${params.id}/launch`, {
                    headers: { Authorization: `Bearer ${token}` }
                });

                if (!res.ok) throw new Error("Failed to launch SCORM");

                const data = await res.json();
                if (data.url) {
                    setUrl(data.url);
                    // Mock session ID if not returned, or assume backend handles it.
                    // Ideally backend /launch should return { url, sessionId }
                    setSessionId(data.sessionId || `temp_${Date.now()}`);
                }
            } catch (err) {
                console.error(err);
                setError(t("scorm_error_launch"));
            }
        };

        init();
    }, [params.id, t]);

    if (error) {
        return (
            <div className="flex items-center justify-center h-screen bg-red-50">
                <div className="text-red-600 font-semibold">{error}</div>
            </div>
        );
    }

    if (!url || !sessionId || !apiBaseUrl) {
        return (
            <div className="flex items-center justify-center h-screen bg-gray-50">
                <div className="text-gray-600">{t("preparing")}</div>
            </div>
        );
    }

    return (
        <ScormPlayer
            launchUrl={url}
            sessionId={sessionId}
            apiBaseUrl={apiBaseUrl}
            token={localStorage.getItem("lms_token") || ""}
            onExit={() => router.back()}
        />
    );
}

