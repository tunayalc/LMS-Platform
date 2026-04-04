'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface SEBSettingsProps {
    examId: string;
    examTitle: string;
    sebBrowserKey?: string;
    apiBaseUrl: string;
    token: string;
}

/**
 * SEB (Safe Exam Browser) Settings Component
 * SEB is MANDATORY for all exams - this component only shows status and download
 */
export default function SEBSettings({
    examId,
    examTitle,
    sebBrowserKey,
    apiBaseUrl,
    token
}: SEBSettingsProps) {
    const { t } = useTranslation();
    const [browserKey] = useState(sebBrowserKey);

    const handleDownloadConfig = () => {
        const url = `${apiBaseUrl}/api/exams/${examId}/seb-config`;
        window.open(url, '_blank');
    };

    return (
        <div className="seb-settings" style={{
            border: '2px solid var(--accent)',
            borderRadius: '12px',
            padding: '20px',
            marginTop: '16px',
            background: 'var(--accent-soft)'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                <span style={{ fontSize: '32px' }}>🔒</span>
                <div>
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--ink)' }}>
                        {t("seb_required_title")}
                    </h3>
                    <p style={{ margin: '4px 0 0', fontSize: '14px', color: 'var(--ink-light)' }}>
                        {t("seb_required_message")}
                    </p>
                </div>
            </div>

            <div style={{
                padding: '16px',
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                marginBottom: '16px'
            }}>
                <h4 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 700, color: 'var(--ink)' }}>
                    🛡️ {t("seb_features_title")}
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '13px' }}>
                    <div>✅ {t("seb_feature_kiosk")}</div>
                    <div>✅ {t("seb_feature_screenshot_block")}</div>
                    <div>✅ {t("seb_feature_copy_paste_block")}</div>
                    <div>✅ {t("seb_feature_devtools_block")}</div>
                    <div>✅ {t("seb_feature_url_filtering")}</div>
                    <div>✅ {t("seb_feature_app_switch_detection")}</div>
                    <div>✅ {t("seb_feature_browser_key_validation")}</div>
                    <div>✅ {t("seb_feature_session_encryption")}</div>
                </div>
            </div>

            {browserKey && (
                <div style={{
                    padding: '12px',
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    marginBottom: '16px',
                    fontFamily: 'monospace',
                    fontSize: '12px',
                    color: 'var(--ink)'
                }}>
                    <strong>Browser Key:</strong> {browserKey.substring(0, 20)}...
                </div>
            )}

            <button
                onClick={handleDownloadConfig}
                style={{
                    width: '100%',
                    padding: '16px 24px',
                    background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '10px',
                    fontSize: '16px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    boxShadow: '0 4px 14px rgba(34, 197, 94, 0.4)',
                    transition: 'all 0.2s ease'
                }}
                onMouseOver={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 6px 20px rgba(34, 197, 94, 0.5)';
                }}
                onMouseOut={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 4px 14px rgba(34, 197, 94, 0.4)';
                }}
            >
                📥 {t("seb_download_config_button")}
            </button>

            <div style={{
                marginTop: '16px',
                padding: '12px',
                background: '#fef3c7',
                border: '1px solid #fcd34d',
                borderRadius: '8px',
                fontSize: '13px',
                color: '#92400e'
            }}>
                <strong>⚠️ {t("seb_students_note_title")}</strong><br />
                1. <a href="https://safeexambrowser.org/download_en.html" target="_blank" style={{ color: '#b45309' }}>
                    {t("seb_students_note_step1")}
                </a><br />
                2. {t("seb_students_note_step2")}<br />
                3. {t("seb_students_note_step3")}<br />
                4. {t("seb_students_note_step4")}
            </div>
        </div>
    );
}
