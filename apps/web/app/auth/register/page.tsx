"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useEffect } from "react";
import { createApiClient, resolveApiBaseUrl } from "@lms/shared";
import { useTranslation } from "react-i18next";

export default function RegisterPage() {
    const { t } = useTranslation();
    const router = useRouter();
    const [apiBaseUrl, setApiBaseUrl] = useState<string | null>(null);
    const [username, setUsername] = useState("");
    const [fullName, setFullName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [role, setRole] = useState("Student");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [info, setInfo] = useState<string | null>(null);

    const formatError = (err: any) => {
        const data = err?.response?.data;
        if (data?.error === "auth_mode") {
            return "Kayit kapali. LMS_AUTH_MODE=local olmali.";
        }
        if (data?.error === "validation_error") {
            const fieldErrors = data?.details?.fieldErrors;
            if (fieldErrors) {
                const messages = Object.values(fieldErrors).flat().filter(Boolean);
                if (messages.length) {
                    return messages.join(" ");
                }
            }
        }
        if (data?.message) {
            return data.message;
        }
        return t("error_registration_failed");
    };

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
        setInfo(null);
        setLoading(true);

        try {
            const response = await apiClient.post<any>("/auth/register", {
                username,
                fullName,
                email,
                password,
                role
            });
            const verification = response?.verification;
            if (verification?.mode === "mock" && verification?.verifyLink) {
                console.log("Development Verification Link:", verification.verifyLink);
                setInfo(t("verification_email_sent"));
                return;
            }
            router.push("/?registered=true");
        } catch (err: any) {
            const msg = err.response?.data?.error === "username_taken" ? t("error_username_taken") :
                err.response?.data?.error === "email_taken" ? t("error_email_taken") :
                    formatError(err);
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className="shell" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh' }}>
            <div className="card" style={{ width: '100%', maxWidth: '400px' }}>
                <h1>{t("register_title")}</h1>
                <form className="form" onSubmit={handleSubmit}>
                    <div className="option-list">
                        <input
                            className="input"
                            placeholder={t("username_placeholder")}
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required
                        />
                        <input
                            className="input"
                            placeholder={t("full_name_placeholder")}
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            required
                        />
                        <input
                            className="input"
                            type="email"
                            placeholder={t("email_placeholder")}
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                        <input
                            className="input"
                            type="password"
                            placeholder={t("password_placeholder")}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            minLength={8}
                        />
                        <p className="meta">{t("password_hint")}</p>
                        <select
                            className="input"
                            value={role}
                            onChange={(e) => setRole(e.target.value)}
                        >
                            <option value="Student">{t("role_student")}</option>
                            <option value="Instructor">{t("role_instructor")}</option>
                            <option value="Assistant">{t("role_assistant")}</option>
                        </select>
                    </div>

                    {info && <div className="info">{info}</div>}
                    {error && <div className="error">{error}</div>}

                    <button className="btn" type="submit" disabled={loading}>
                        {loading ? t("registering") : t("register_button")}
                    </button>
                </form>
                <div className="meta" style={{ textAlign: 'center' }}>
                    {t("already_have_account")} <Link href="/" style={{ color: 'var(--accent)', fontWeight: 600 }}>{t("login")}</Link>
                </div>
                <div style={{ marginTop: '16px', textAlign: 'center' }}>
                    <button
                        className="btn btn-secondary"
                        type="button"
                        onClick={() => {
                            if (apiBaseUrl) {
                                window.location.href = `${apiBaseUrl}/auth/google`;
                            } else {
                                alert("API URL hazir degil");
                            }
                        }}
                    >
                        {t("register_google")}
                    </button>
                </div>
            </div>
        </main>
    );
}
