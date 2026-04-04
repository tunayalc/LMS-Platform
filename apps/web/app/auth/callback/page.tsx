"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import { useTranslation } from "react-i18next";


function AuthCallbackContent() {
    const { t } = useTranslation();
    const router = useRouter();
    const searchParams = useSearchParams();
    const [status, setStatus] = useState("...");

    useEffect(() => {
        setStatus(t("logging_in_status"));
        const token = searchParams?.get("token");
        const userId = searchParams?.get("userId");
        const error = searchParams?.get("error");

        if (error) {
            setStatus(t("login_failed_status") + error);
            setTimeout(() => router.push("/"), 3000);
            return;
        }

        if (token) {
            localStorage.setItem("lms_token", token);
            const role = searchParams?.get("role") || "Student";
            if (userId) {
                // Fetch user details or mock them for storage
                const user = { id: userId, username: "Google User", role: role };
                localStorage.setItem("lms_user", JSON.stringify(user));

                // Redirect to dashboard based on role
                const dashboardPath = role.toLowerCase().includes('admin') ? 'admin' :
                    role.toLowerCase().includes('teacher') ? 'teacher' :
                        role.toLowerCase().includes('assistant') ? 'assistant' : 'student';
                router.push(`/dashboard/${dashboardPath}`);
            } else {
                setStatus(t("auth_callback_error_user_id"));
            }
        } else {
            setStatus(t("auth_callback_error_token"));
            setTimeout(() => router.push("/"), 3000);
        }
    }, [router, searchParams, t]);

    return (
        <div className="shell" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
            <div className="card" style={{ maxWidth: '400px', textAlign: 'center' }}>
                <h2 style={{ fontSize: '1.5rem', marginBottom: '16px' }}>{status}</h2>
                <div className="spinner"></div>
            </div>
        </div>
    );
}

export default function AuthCallbackPage() {
    const { t } = useTranslation();
    return (
        <Suspense fallback={<div>{t("loading")}</div>}>
            <AuthCallbackContent />
        </Suspense>
    );
}
