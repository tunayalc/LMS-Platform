"use client";

import Link from "next/link";
import { useMemo, useState, useEffect } from "react";
import { createApiClient, resolveApiBaseUrl } from "@lms/shared";
import { useTranslation } from "react-i18next";

export default function ForgotPasswordPage() {
    const { t } = useTranslation();
    const [apiBaseUrl, setApiBaseUrl] = useState<string | null>(null);
    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);
    const [sent, setSent] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        try {
            setApiBaseUrl(resolveApiBaseUrl({ runtime: "web" }));
        } catch (err) {
            setError("API connection failed.");
        }
    }, []);

    const apiClient = useMemo(() => {
        if (!apiBaseUrl) return null;
        return createApiClient({ baseUrl: apiBaseUrl });
    }, [apiBaseUrl]);

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!apiClient) return;

        setError(null);
        setLoading(true);

        try {
            await apiClient.post("/auth/forgot-password", { email });
            setSent(true);
        } catch (err: any) {
            setError(t("error"));
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className="shell" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh' }}>
            <div className="card" style={{ width: '100%', maxWidth: '400px' }}>
                <h1>{t("forgot_password_title") || t("forgot_password")}</h1>

                {sent ? (
                    <div style={{ textAlign: 'center' }}>
                        <div className="badge" style={{ backgroundColor: '#dcfce7', color: '#166534', marginBottom: '16px' }}>
                            {t("link_sent_badge")}
                        </div>
                        <p className="meta">
                            {t("check_email_desc", { email })}
                        </p>
                        <div style={{ marginTop: '24px' }}>
                            <Link href="/" className="btn btn-secondary">
                                {t("return_to_login")}
                            </Link>
                        </div>
                    </div>
                ) : (
                    <form className="form" onSubmit={handleSubmit}>
                        <p className="meta" style={{ marginTop: 0 }}>
                            {t("forgot_password_desc")}
                        </p>
                        <div className="option-list">
                            <input
                                className="input"
                                type="email"
                                placeholder={t("email_label") || "Email"}
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>

                        {error && <div className="error">{error}</div>}

                        <button className="btn" type="submit" disabled={loading}>
                            {loading ? t("sending_btn") : t("send_reset_link")}
                        </button>
                    </form>
                )}

                {!sent && (
                    <div className="meta" style={{ textAlign: 'center', marginTop: '16px' }}>
                        <Link href="/" style={{ color: 'var(--accent)', fontWeight: 600 }}>{t("cancel")}</Link>
                    </div>
                )}
            </div>
        </main>
    );
}
