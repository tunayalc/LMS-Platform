"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import TwoFactorSettings from "../components/settings/TwoFactorSettings";
import DesktopPanel from "../components/settings/DesktopPanel";
import { resolveApiBaseUrl } from "@lms/shared";
import { useTranslation } from "react-i18next";

export default function SettingsPage() {
    const { t } = useTranslation();
    const [apiBaseUrl, setApiBaseUrl] = useState<string | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [user, setUser] = useState<any>(null);

    useEffect(() => {
        try {
            setApiBaseUrl(resolveApiBaseUrl({ runtime: "web" }));
            setToken(localStorage.getItem("lms_token"));
            const userData = localStorage.getItem("lms_user");
            if (userData) {
                setUser(JSON.parse(userData));
            }
        } catch (err) {
            console.error("Settings init error:", err);
        }
    }, []);

    if (!token || !user) {
        return (
            <div className="auth-container">
                <div className="auth-card" style={{ textAlign: "center" }}>
                    <h2>{t("settings_title")}</h2>
                    <p style={{ marginBottom: 16 }}>{t("settings_login_required")}</p>
                    <Link href="/" className="btn">{t("login")}</Link>
                </div>
            </div>
        );
    }

    return (
        <div style={{ maxWidth: 800, margin: "0 auto", padding: "32px 16px" }}>
            <div style={{ marginBottom: 32 }}>
                <Link href={`/dashboard/${user.role?.toLowerCase() || "student"}`} style={{ color: "var(--accent)" }}>
                    ← {t("settings_back_dashboard")}
                </Link>
            </div>

            <h1 style={{ marginBottom: 32 }}>⚙️ {t("settings_account_title")}</h1>

            {/* User Info Card */}
            <div className="card" style={{ marginBottom: 24 }}>
                <h3 style={{ marginBottom: 12 }}>👤 {t("settings_user_info")}</h3>
                <p><strong>{t("username_label")}:</strong> {user.username}</p>
                <p><strong>{t("email_label")}:</strong> {user.email || t("settings_not_specified")}</p>
                <p><strong>{t("role_label")}:</strong> {user.role}</p>
            </div>

            {/* 2FA Settings */}
            {apiBaseUrl && (
                <TwoFactorSettings apiBaseUrl={apiBaseUrl} token={token} />
            )}

            <DesktopPanel />
        </div>
    );
}
