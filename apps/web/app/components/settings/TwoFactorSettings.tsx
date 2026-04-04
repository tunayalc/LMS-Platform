"use client";

import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";

interface TwoFactorSettingsProps {
    apiBaseUrl: string;
    token: string | null;
}

export default function TwoFactorSettings({ apiBaseUrl, token }: TwoFactorSettingsProps) {
    const { t } = useTranslation();
    const [isEnabled, setIsEnabled] = useState(false);
    const [setupMode, setSetupMode] = useState(false);
    const [secret, setSecret] = useState<string | null>(null);
    const [qrUri, setQrUri] = useState<string | null>(null);
    const [verifyCode, setVerifyCode] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    // Check current 2FA status on mount
    useEffect(() => {
        if (!token) return;

        const check2FAStatus = async () => {
            try {
                const res = await fetch(`${apiBaseUrl}/auth/2fa/status`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    setIsEnabled(data.enabled);
                }
            } catch (err) {
                console.error("2FA status check error", err);
            }
        };

        check2FAStatus();
    }, [apiBaseUrl, token]);

    const handleStartSetup = async () => {
        if (!token) return;

        setLoading(true);
        setError(null);

        try {
            const res = await fetch(`${apiBaseUrl}/auth/2fa/setup`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                }
            });

            const data = await res.json();
            if (res.ok) {
                setSecret(data.secret);
                setQrUri(data.uri);
                setSetupMode(true);
            } else {
                setError(data.error || t("twofa_setup_failed"));
            }
        } catch (err) {
            setError(t("twofa_server_error"));
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyAndEnable = async () => {
        if (!token || !verifyCode.trim()) return;

        setLoading(true);
        setError(null);

        try {
            const res = await fetch(`${apiBaseUrl}/auth/2fa/enable`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ code: verifyCode.trim() })
            });

            const data = await res.json();
            if (res.ok) {
                setIsEnabled(true);
                setSetupMode(false);
                setSuccess(t("twofa_enabled_success"));
            } else {
                setError(data.error || t("twofa_invalid_code"));
            }
        } catch (err) {
            setError(t("twofa_verify_error"));
        } finally {
            setLoading(false);
        }
    };

    const handleDisable = async () => {
        if (!token) return;
        if (!confirm(t("twofa_disable_confirm"))) return;

        setLoading(true);
        setError(null);

        try {
            const res = await fetch(`${apiBaseUrl}/auth/2fa/disable`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` }
            });

            if (res.ok) {
                setIsEnabled(false);
                setSuccess(t("twofa_disabled_success"));
            } else {
                setError(t("twofa_disable_failed"));
            }
        } catch (err) {
            setError(t("twofa_server_error"));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="card" style={{ maxWidth: 500, margin: "0 auto" }}>
            <h3 style={{ marginBottom: 16 }}>🔐 {t("twofa_title")}</h3>

            {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}
            {success && <div className="alert alert-success" style={{ marginBottom: 12 }}>{success}</div>}

            {!isEnabled ? (
                !setupMode ? (
                    <div>
                        <p className="meta" style={{ marginBottom: 16 }}>
                            {t("twofa_desc")}
                        </p>
                        <button
                            className="btn"
                            onClick={handleStartSetup}
                            disabled={loading}
                        >
                            {loading ? t("twofa_loading") : t("twofa_setup")}
                        </button>
                    </div>
                ) : (
                    <div>
                        <p className="meta" style={{ marginBottom: 12 }}>
                            {t("twofa_step1")}
                        </p>

                        {qrUri && (
                            <div style={{
                                background: "var(--card)",
                                border: "1px solid var(--border)",
                                padding: 16,
                                borderRadius: 8,
                                display: "inline-block",
                                marginBottom: 16
                            }}>
                                <img
                                    src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrUri)}`}
                                    alt="2FA QR Code"
                                    style={{ width: 200, height: 200 }}
                                />
                            </div>
                        )}

                        {secret && (
                            <p className="meta" style={{ marginBottom: 12, fontSize: "0.75rem" }}>
                                {t("manual_entry")} <code style={{ background: "var(--bg-secondary)", padding: "2px 6px", borderRadius: 4 }}>{secret}</code>
                            </p>
                        )}

                        <p className="meta" style={{ marginBottom: 8 }}>
                            {t("twofa_step2")}
                        </p>

                        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                            <input
                                className="input"
                                type="text"
                                placeholder="000000"
                                value={verifyCode}
                                onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                maxLength={6}
                                style={{ width: 120, textAlign: "center", fontSize: "1.25rem", letterSpacing: 8 }}
                            />
                            <button
                                className="btn"
                                onClick={handleVerifyAndEnable}
                                disabled={loading || verifyCode.length !== 6}
                            >
                                {loading ? "..." : t("twofa_verify_enable")}
                            </button>
                        </div>

                        <button
                            className="btn btn-ghost"
                            onClick={() => setSetupMode(false)}
                        >
                            {t("twofa_cancel")}
                        </button>
                    </div>
                )
            ) : (
                <div>
                    <div style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 16,
                        padding: 12,
                        background: "#dcfce7",
                        borderRadius: 8
                    }}>
                        <span style={{ fontSize: "1.5rem" }}>✅</span>
                        <span style={{ fontWeight: 500, color: "#166534" }}>{t("twofa_active")}</span>
                    </div>

                    <button
                        className="btn btn-danger"
                        onClick={handleDisable}
                        disabled={loading}
                        style={{ background: "#ef4444", color: "#fff" }}
                    >
                        {loading ? "..." : t("twofa_disable")}
                    </button>
                </div>
            )}
        </div>
    );
}

