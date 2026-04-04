"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { createApiClient, resolveApiBaseUrl } from "@lms/shared";

export default function VerifyEmailPage() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const token = searchParams?.get("token");
  const email = searchParams?.get("email");
  const [apiBaseUrl, setApiBaseUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [messageKey, setMessageKey] = useState<string>("verify_email_starting");
  const [messageOverride, setMessageOverride] = useState<string | null>(null);

  useEffect(() => {
    try {
      setApiBaseUrl(resolveApiBaseUrl({ runtime: "web" }));
    } catch (err) {
      setStatus("error");
      setMessageKey("verify_email_api_resolve_failed");
      setMessageOverride(null);
    }
  }, []);

  const apiClient = useMemo(() => {
    if (!apiBaseUrl) return null;
    return createApiClient({ baseUrl: apiBaseUrl });
  }, [apiBaseUrl]);

  useEffect(() => {
    const run = async () => {
      if (!token || !email) {
        setStatus("error");
        setMessageKey("verify_email_missing_params");
        setMessageOverride(null);
        return;
      }
      if (!apiClient) return;

      try {
        await apiClient.post("/auth/verify-email", { token, email });
        setStatus("success");
        setMessageKey("verify_email_success");
        setMessageOverride(null);
      } catch (err: any) {
        const data = err?.response?.data;
        setStatus("error");
        if (typeof data?.message === "string" && data.message.trim()) {
          setMessageOverride(data.message);
          setMessageKey("verify_email_failed");
        } else {
          setMessageKey("verify_email_failed");
          setMessageOverride(null);
        }
      }
    };

    void run();
  }, [token, email, apiClient]);

  return (
    <main className="shell" style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "70vh" }}>
      <div className="card" style={{ maxWidth: 520, width: "100%" }}>
        <h1>{t("verify_email_title")}</h1>
        <p className={status === "error" ? "error" : status === "success" ? "success" : "meta"}>
          {messageOverride ?? t(messageKey)}
        </p>
        <div style={{ marginTop: "16px" }}>
          <Link href="/" style={{ color: "var(--accent)", fontWeight: 600 }}>
            {t("return_to_login")}
          </Link>
        </div>
      </div>
    </main>
  );
}
