"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useEffect, Suspense } from "react";
import { createApiClient, resolveApiBaseUrl } from "@lms/shared";
import { useTranslation } from "react-i18next";

function ResetPasswordForm() {
    const { t } = useTranslation();
    const router = useRouter();
    const searchParams = useSearchParams();
    const token = searchParams?.get("token");
    const email = searchParams?.get("email");

    const [apiBaseUrl, setApiBaseUrl] = useState<string | null>(null);
    const [newPassword, setNewPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        try {
            setApiBaseUrl(resolveApiBaseUrl({ runtime: "web" }));
        } catch (err) {
            setError(t("error"));
        }
    }, [t]);

    const apiClient = useMemo(() => {
        if (!apiBaseUrl) return null;
        return createApiClient({ baseUrl: apiBaseUrl });
    }, [apiBaseUrl]);

    if (!token || !email) {
        return (
            <div className="error">
                {t("reset_link_invalid")}
            </div>
        );
    }

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!apiClient) return;

        setError(null);
        setLoading(true);

        try {
            await apiClient.post("/auth/reset-password", {
                token,
                email,
                newPassword
            });
            setSuccess(true);
            setTimeout(() => {
                router.push("/");
            }, 3000);
        } catch (err: any) {
            setError(t("reset_failed_expired"));
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <div style={{ textAlign: 'center' }}>
                <div className="badge" style={{ backgroundColor: '#dcfce7', color: '#166534', marginBottom: '16px' }}>
                    {t("password_changed_badge")}
                </div>
                <p className="meta">
                    {t("password_reset_success")}
                </p>
                <Link href="/" className="btn btn-secondary" style={{ marginTop: '16px' }}>
                    {t("login_now")}
                </Link>
            </div>
        );
    }

    return (
        <form className="form" onSubmit={handleSubmit}>
            <p className="meta" style={{ marginTop: 0 }}>
                {t("set_new_password_prompt", { email })}
            </p>
            <div className="option-list">
                <input
                    className="input"
                    type="password"
                    placeholder={t("new_password_title")}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={6}
                />
            </div>

            {error && <div className="error">{error}</div>}

            <button className="btn" type="submit" disabled={loading}>
                {loading ? t("updating_btn") : t("update_password_btn")}
            </button>
        </form>
    );
}

export default function ResetPasswordPage() {
    const { t } = useTranslation();
    return (
        <main className="shell" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh' }}>
            <div className="card" style={{ width: '100%', maxWidth: '400px' }}>
                <h1>{t("new_password_title")}</h1>
                <Suspense fallback={<div>{t("loading")}</div>}>
                    <ResetPasswordForm />
                </Suspense>
            </div>
        </main>
    );
}
