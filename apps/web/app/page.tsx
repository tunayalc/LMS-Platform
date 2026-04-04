"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { useEffect, useMemo, useState } from "react";
import { createApiClient, resolveApiBaseUrl } from "@lms/shared";
import type { AuthLoginResponse } from "@lms/shared";

const authMode = process.env.LMS_AUTH_MODE ?? "mock";

export default function LoginPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [apiBaseUrl, setApiBaseUrl] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 2FA state
  const [requires2FA, setRequires2FA] = useState(false);
  const [tempToken, setTempToken] = useState<string | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState("");

  useEffect(() => {
    try {
      setApiBaseUrl(resolveApiBaseUrl({ runtime: "web" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "api_resolve_error");
    }
  }, []);

  const loginApiClient = useMemo(() => {
    if (!apiBaseUrl) {
      return null;
    }
    return createApiClient({ baseUrl: apiBaseUrl });
  }, [apiBaseUrl]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!loginApiClient) {
      setError("api_not_ready");
      return;
    }
    if (!username.trim() || !password.trim()) {
      setError("username_password_required");
      return;
    }
    setLoading(true);
    try {
      const response = await loginApiClient.post<AuthLoginResponse>("/auth/login", {
        username,
        password
      });

      // Check if 2FA is required
      if ((response as any).requires2FA) {
        setRequires2FA(true);
        setTempToken((response as any).tempToken);
        setLoading(false);
        return;
      }

      // @ts-ignore - response type update pending
      const token = response.accessToken || response.token;
      // @ts-ignore
      const refreshToken = response.refreshToken;

      localStorage.setItem("lms_token", token);
      if (refreshToken) localStorage.setItem("lms_refresh_token", refreshToken);
      localStorage.setItem("lms_user", JSON.stringify(response.user));
      router.push(`/dashboard/${response.user.role.toLowerCase()}`);
    } catch (err) {
      const data = (err as any)?.response?.data;
      if (data?.error === "email_not_verified") {
        setError("email_not_verified");
      } else {
        setError(err instanceof Error ? err.message : "login_failed");
      }
    } finally {
      setLoading(false);
    }
  };

  const handle2FAVerify = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!loginApiClient || !tempToken) {
      setError("2fa_failed");
      return;
    }
    if (!twoFactorCode.trim() || twoFactorCode.length !== 6) {
      setError("code_length_error");
      return;
    }
    setLoading(true);
    try {
      const response = await loginApiClient.post<any>("/auth/2fa/verify", {
        tempToken,
        code: twoFactorCode
      });

      const token = response.accessToken;
      const refreshToken = response.refreshToken;

      localStorage.setItem("lms_token", token);
      if (refreshToken) localStorage.setItem("lms_refresh_token", refreshToken);
      localStorage.setItem("lms_user", JSON.stringify(response.user));
      router.push(`/dashboard/${response.user.role.toLowerCase()}`);
    } catch (err) {
      const data = (err as any)?.response?.data;
      if (data?.error === "invalid_code") {
        setError("invalid_code_retry");
      } else if (data?.error === "invalid_or_expired_token") {
        setError("session_expired_relogin");
        setRequires2FA(false);
        setTempToken(null);
      } else {
        setError(err instanceof Error ? err.message : "2fa_failed");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h1 style={{ fontSize: '2rem', fontWeight: '800', color: 'var(--ink)', marginBottom: '8px', letterSpacing: '-0.03em' }}>
            LMS Web
          </h1>
          <p suppressHydrationWarning>{t('subtitle')}</p>
        </div>

        {requires2FA ? (
          /* 2FA Code Input Form */
          <form className="form" onSubmit={handle2FAVerify}>
            <div style={{ textAlign: 'center', marginBottom: '16px' }}>
              <div style={{ fontSize: '3rem', marginBottom: '12px' }}>🔐</div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: '700', color: 'var(--ink)', marginBottom: '8px' }}>
                {t('mobile_2fa_title')}
              </h2>
              <p style={{ color: 'var(--ink-light)' }}>
                {t('mobile_enter_code')}
              </p>
            </div>

            <div>
              <label className="label">{t('mobile_2fa_title')}</label>
              <input
                className="input"
                type="text"
                placeholder="000000"
                value={twoFactorCode}
                onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                maxLength={6}
                style={{ textAlign: 'center', fontSize: '1.5rem', letterSpacing: '0.5rem' }}
                autoFocus
              />
            </div>

            {error ? <div className="error">{t(error)}</div> : null}

            <button className="btn" type="submit" disabled={loading || twoFactorCode.length !== 6}>
              {loading ? `${t('verify')}...` : t('verify')}
            </button>

            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => { setRequires2FA(false); setTempToken(null); setTwoFactorCode(""); }}
              style={{ marginTop: '12px' }}
            >
              {t('cancel')}
            </button>
          </form>
        ) : (
          /* Regular Login Form */
          <form className="form" onSubmit={handleSubmit}>
            <div>
              <label className="label" suppressHydrationWarning>{t('username_label')}</label>
              <input
                className="input"
                placeholder={t('username_placeholder') ?? "Username"}
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                suppressHydrationWarning
              />
            </div>

            <div>
              <label className="label" suppressHydrationWarning>{t('password_label')}</label>
              <input
                className="input"
                type="password"
                placeholder={t('password_placeholder') ?? "Password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                suppressHydrationWarning
              />
            </div>

            {error ? <div className="error">{t(error)}</div> : null}

            <button className="btn" type="submit" disabled={loading} suppressHydrationWarning>
              {loading ? t('logging_in') : t('login_button')}
            </button>
          </form>
        )}

        <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div className="divider" style={{ textAlign: 'center', color: 'var(--ink-light)', fontSize: '0.9rem', margin: '0 0 8px 0' }} suppressHydrationWarning>{t('or_divider')}</div>
          <button
            className="btn"
            type="button"
            onClick={() => {
              if (loginApiClient) {
                window.location.href = `${apiBaseUrl}/auth/google`;
              } else {
                alert(t("api_url_not_resolved"));
              }
            }}
            suppressHydrationWarning
            style={{ backgroundColor: '#DB4437', color: 'white', border: 'none' }}
          >
            {t('login_google')}
          </button>

          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => {
              if (loginApiClient) {
                window.location.href = `${apiBaseUrl}/auth/microsoft`;
              } else {
                alert(t("api_url_not_resolved"));
              }
            }}
            style={{ backgroundColor: '#0078d4', color: 'white', border: 'none' }}
            suppressHydrationWarning
          >
            {t('login_microsoft')}
          </button>
        </div>

        <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
          <div style={{ display: 'flex', gap: '24px', fontSize: '0.95rem' }}>
            <Link href="/auth/forgot-password" style={{ color: 'var(--accent)', fontWeight: '500' }} suppressHydrationWarning>{t('forgot_password')}</Link>
            <Link href="/auth/register" style={{ color: 'var(--accent)', fontWeight: '700' }} suppressHydrationWarning>{t('register_new')}</Link>
          </div>
          <button
            type="button"
            onClick={() => {
              setUsername("guest");
              setPassword("Guest123!");
            }}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--ink-light)',
              cursor: 'pointer',
              fontSize: '0.85rem',
              marginTop: '12px',
              textDecoration: 'underline'
            }}
            suppressHydrationWarning
          >
            {t('guest_login')}
          </button>
          <div style={{ marginTop: '16px', borderTop: '1px solid var(--border)', width: '100%', paddingTop: '12px', textAlign: 'center' }}>
            <Link href="/kvkk" className="btn btn-outline" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%', marginTop: '20px', fontSize: '0.9rem', textDecoration: 'none' }}>
              {t('kvkk_link')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
