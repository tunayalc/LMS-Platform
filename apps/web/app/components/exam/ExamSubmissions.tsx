'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';

// --- Type Definitions ---
interface Submission {
    id: string;
    userId: string;
    userEmail: string;
    userName: string;
    score: number;
    percentage: number;
    maxPoints: number;
    attemptNumber: number;
    submittedAt: string;
    needsManualGrading: boolean;
}

interface ProctorLog {
    id: string;
    examId: string;
    userId: string;
    userName: string;
    violationType: string;
    message: string;
    createdAt: string;
}

interface QuestionDetail {
    id: string;
    prompt: string;
    type: string;
    options?: string[];
    points: number;
    correctAnswer: any;
    userAnswer: any;
    isAutoGradable: boolean;
    autoGradeResult: { correct: boolean; points: number } | null;
    manualGrade: { points: number; feedback: string; gradedAt: string } | null;
}

interface SubmissionDetail {
    submission: {
        id: string;
        examId: string;
        userId: string;
        userEmail: string;
        userName: string;
        score: number;
        submittedAt: string;
        attemptNumber: number;
    };
    questions: QuestionDetail[];
}

interface ExamSubmissionsProps {
    examId: string;
    examTitle: string;
    apiBase: string;
    token: string;
    onClose: () => void;
}

// --- Styles Constants ---
const styles = {
    overlay: {
        position: 'fixed' as 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        zIndex: 99999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(5px)'
    },
    modal: {
        backgroundColor: 'var(--card)',
        width: '95%', maxWidth: '1200px', height: '90vh',
        borderRadius: '16px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        display: 'flex', flexDirection: 'column' as 'column',
        overflow: 'hidden',
        color: 'var(--ink)',
        fontFamily: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
    },
    header: {
        padding: '20px 24px',
        borderBottom: '1px solid var(--border)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        backgroundColor: 'var(--card)',
        flexShrink: 0
    },
    title: { margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--ink)' },
    subtitle: { margin: '4px 0 0', fontSize: '0.875rem', color: 'var(--ink-light)' },
    closeBtn: {
        background: 'var(--bg-secondary)', border: 'none', borderRadius: '50%',
        width: '40px', height: '40px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', color: 'var(--ink-light)', fontSize: '20px',
        transition: 'background 0.2s',
        zIndex: 100000
    },
    content: {
        padding: '32px',
        overflowY: 'auto' as 'auto',
        flex: 1,
        backgroundColor: 'var(--bg)'
    },
    card: {
        backgroundColor: 'var(--card)',
        borderRadius: '12px',
        border: '1px solid var(--border)',
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
        overflow: 'hidden',
        marginBottom: '20px'
    },
    badge: {
        padding: '4px 10px', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 600,
        display: 'inline-flex', alignItems: 'center', gap: '4px'
    },
    input: {
        width: '100%',
        padding: '10px 12px',
        borderRadius: '8px',
        border: '1px solid #cbd5e1',
        fontSize: '0.95rem',
        marginTop: '6px'
    },
    button: {
        padding: '10px 20px',
        borderRadius: '8px',
        fontWeight: 600,
        cursor: 'pointer',
        border: 'none',
        transition: 'opacity 0.2s',
        color: 'white'
    }
};

export default function ExamSubmissions({ examId, examTitle, apiBase, token, onClose }: ExamSubmissionsProps) {
    const { t } = useTranslation();
    const [submissions, setSubmissions] = useState<Submission[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedSubmission, setSelectedSubmission] = useState<SubmissionDetail | null>(null);
    const [grading, setGrading] = useState<Record<string, { points: number; feedback: string }>>({});
    const [saving, setSaving] = useState(false);
    const [proctorLogs, setProctorLogs] = useState<ProctorLog[]>([]);
    const [proctorLoading, setProctorLoading] = useState(false);
    const proctorLastSeenRef = useRef<string | null>(null);
    const [newViolations, setNewViolations] = useState(0);

    const translateViolationType = (type: string) => {
        switch (type) {
            case 'no_face':
                return t('proctoring_type_no_face', 'no_face');
            case 'multiple_faces':
                return t('proctoring_type_multiple_faces', 'multiple_faces');
            case 'unknown':
                return t('proctoring_type_unknown', 'unknown');
            default:
                return type;
        }
    };

    const translateViolationMessage = (log: ProctorLog) => {
        switch (log.violationType) {
            case 'no_face':
                return t('proctoring_violation_no_face', 'Face not detected');
            case 'multiple_faces':
                return t('proctoring_violation_multiple_faces', 'Multiple faces detected');
            default: {
                const msg = (log.message ?? '').trim();
                if (!msg) return '';
                // If backend sent a translation key, try resolving it.
                if (/^[a-z0-9_]+$/i.test(msg)) {
                    return t(msg);
                }
                return msg;
            }
        }
    };

    const fetchSubmissions = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`${apiBase}/exams/${examId}/submissions`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.message || res.statusText || 'Failed to fetch submissions');
            }
            const data = await res.json();
            setSubmissions(data.submissions);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, [apiBase, examId, token]);

    const fetchProctorLogs = useCallback(async () => {
        setProctorLoading(true);
        try {
            const res = await fetch(`${apiBase}/exams/${examId}/proctor/logs?limit=100`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!res.ok) {
                // If the current role can't view logs, just hide the section.
                setProctorLogs([]);
                return;
            }
            const data = await res.json();
            const logs = Array.isArray(data.logs) ? (data.logs as ProctorLog[]) : [];
            setProctorLogs((prev) => {
                const nextFirst = logs[0]?.id ?? null;
                const prevFirst = prev[0]?.id ?? null;

                if (!proctorLastSeenRef.current && nextFirst) {
                    proctorLastSeenRef.current = nextFirst;
                } else if (nextFirst && proctorLastSeenRef.current && nextFirst !== proctorLastSeenRef.current) {
                    const newCount = logs.findIndex((l) => l.id === proctorLastSeenRef.current);
                    setNewViolations((c) => c + (newCount > 0 ? newCount : 1));
                    proctorLastSeenRef.current = nextFirst;
                }
                return logs;
            });
        } catch (_e) {
            setProctorLogs([]);
        } finally {
            setProctorLoading(false);
        }
    }, [apiBase, examId, token]);

    useEffect(() => {
        fetchSubmissions();
    }, [fetchSubmissions]);

    useEffect(() => {
        fetchProctorLogs();
    }, [fetchProctorLogs]);

    // Keep refreshing proctor logs while modal is open (near real-time alerts for instructor/admin)
    useEffect(() => {
        const interval = setInterval(() => {
            void fetchProctorLogs();
        }, 5000);
        return () => clearInterval(interval);
    }, [fetchProctorLogs]);

    const viewSubmissionDetail = async (submissionId: string) => {
        try {
            const res = await fetch(`${apiBase}/exams/${examId}/submissions/${submissionId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!res.ok) throw new Error('Failed to fetch submission details');
            const data: SubmissionDetail = await res.json();
            setSelectedSubmission(data);

            const initialGrading: Record<string, { points: number; feedback: string }> = {};
            for (const q of data.questions) {
                if (!q.isAutoGradable) {
                    initialGrading[q.id] = {
                        points: q.manualGrade?.points ?? 0,
                        feedback: q.manualGrade?.feedback ?? ''
                    };
                }
            }
            setGrading(initialGrading);
        } catch (e: any) {
            setError(e.message);
        }
    };

    const saveGrade = async (questionId: string) => {
        if (!selectedSubmission) return;
        setSaving(true);
        try {
            const grade = grading[questionId];
            const res = await fetch(`${apiBase}/exams/${examId}/submissions/${selectedSubmission.submission.id}/grade`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    questionId,
                    points: grade.points,
                    feedback: grade.feedback
                })
            });
            if (!res.ok) throw new Error('Failed to save grade');
            await res.json();
            await viewSubmissionDetail(selectedSubmission.submission.id);
            await fetchSubmissions();
        } catch (e: any) {
            alert(e.message);
        } finally {
            setSaving(false);
        }
    };

    const formatDate = (dateStr: string) => new Date(dateStr).toLocaleString();

    if (loading) {
        return (
            <div style={styles.overlay}>
                <div style={{ ...styles.modal, width: '300px', height: 'auto', padding: '40px', alignItems: 'center' }}>
                    <div style={{ width: '40px', height: '40px', border: '3px solid #6366f1', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', marginBottom: '16px' }}></div>
                    <div style={{ color: '#64748b', fontWeight: 500 }}>{t('loading', 'Loading...')}</div>
                </div>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
        );
    }

    return (
        <div
            style={styles.overlay}
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <div style={styles.modal}>

                {/* Header */}
                <div style={styles.header}>
                    <div>
                        <h2 style={styles.title}>
                            {selectedSubmission ? t('submission_review', 'Review Submission') : t('exam_submissions', 'Exam Submissions')}
                        </h2>
                        <p style={styles.subtitle}>{examTitle}</p>
                    </div>
                    <div style={{ display: 'flex', gap: '12px' }}>
                        {selectedSubmission && (
                            <button
                                onClick={() => setSelectedSubmission(null)}
                                style={{
                                    border: '1px solid #e2e8f0', background: 'transparent', borderRadius: '8px', padding: '8px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b', fontWeight: 600
                                }}
                            >
                                <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                                {t('back', 'Back')}
                            </button>
                        )}
                        <button
                            onClick={onClose}
                            style={styles.closeBtn}
                            title={t('close')}
                        >
                            <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>
                </div>

                {/* Main Content */}
                <div style={styles.content}>
                    {error && (
                        <div style={{ backgroundColor: '#fef2f2', borderLeft: '4px solid #ef4444', padding: '16px', marginBottom: '24px', color: '#b91c1c', display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <span style={{ fontSize: '24px' }}>⚠️</span>
                            <span>{error}</span>
                        </div>
                    )}

                    {!selectedSubmission ? (
                        /* List View */
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <div style={styles.card}>
                                <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ fontWeight: 700, color: '#0f172a' }}>
                                        {t('proctoring_violations', 'Proctoring Violations')}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        {newViolations > 0 ? (
                                            <button
                                                type="button"
                                                onClick={() => setNewViolations(0)}
                                                style={{
                                                    border: '1px solid #fecaca',
                                                    background: '#fef2f2',
                                                    color: '#b91c1c',
                                                    borderRadius: 999,
                                                    padding: '4px 10px',
                                                    fontSize: '0.8rem',
                                                    fontWeight: 700,
                                                    cursor: 'pointer'
                                                }}
                                                title={t('mark_seen', 'Mark as seen')}
                                            >
                                                +{newViolations} {t('new', 'new')}
                                            </button>
                                        ) : null}
                                        <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
                                            {proctorLoading ? t('loading', 'Loading...') : `${proctorLogs.length}`}
                                        </span>
                                    </div>
                                </div>
                                <div style={{ padding: '16px 20px' }}>
                                    {proctorLoading ? (
                                        <div style={{ color: '#64748b', fontWeight: 500 }}>{t('loading', 'Loading...')}</div>
                                    ) : proctorLogs.length === 0 ? (
                                        <div style={{ color: '#94a3b8' }}>{t('no_proctoring_logs', 'No proctoring violations recorded.')}</div>
                                    ) : (
                                        <div style={{ overflowX: 'auto' }}>
                                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                                <thead style={{ backgroundColor: 'var(--card)', borderBottom: '1px solid var(--border)' }}>
                                                    <tr>
                                                        <th style={{ padding: '10px 12px', fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>{t('date', 'Date')}</th>
                                                        <th style={{ padding: '10px 12px', fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>{t('student', 'Student')}</th>
                                                        <th style={{ padding: '10px 12px', fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>{t('type', 'Type')}</th>
                                                        <th style={{ padding: '10px 12px', fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>{t('message', 'Message')}</th>
                                                    </tr>
                                                </thead>
                                                <tbody style={{ backgroundColor: 'var(--card)' }}>
                                                    {proctorLogs.map((log, idx) => (
                                                        <tr key={log.id} style={{ borderBottom: idx === proctorLogs.length - 1 ? 'none' : '1px solid var(--border)' }}>
                                                            <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--ink-light)' }}>
                                                                {new Date(log.createdAt).toLocaleString()}
                                                            </td>
                                                            <td style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--ink)' }}>{log.userName}</td>
                                                            <td style={{ padding: '10px 12px', color: 'var(--ink)' }}>{translateViolationType(log.violationType)}</td>
                                                            <td style={{ padding: '10px 12px', color: 'var(--ink)' }}>{translateViolationMessage(log)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div style={styles.card}>
                            {submissions.length === 0 ? (
                                <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>
                                    <svg width="64" height="64" style={{ margin: '0 auto 16px', opacity: 0.5 }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                    <p style={{ fontSize: '1.25rem', fontWeight: 500 }}>{t('no_submissions_found', 'No submissions yet')}</p>
                                </div>
                            ) : (
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                        <thead style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                            <tr>
                                                <th style={{ padding: '16px', fontSize: '0.8rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>{t('student', 'Student')}</th>
                                                <th style={{ padding: '16px', fontSize: '0.8rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>{t('score', 'Score')}</th>
                                                <th style={{ padding: '16px', fontSize: '0.8rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>{t('status', 'Status')}</th>
                                                <th style={{ padding: '16px', width: '100px' }}></th>
                                            </tr>
                                        </thead>
                                        <tbody style={{ backgroundColor: '#fff' }}>
                                            {submissions.map((sub, idx) => (
                                                <tr key={sub.id} style={{ borderBottom: idx === submissions.length - 1 ? 'none' : '1px solid #f1f5f9' }}>
                                                    <td style={{ padding: '16px' }}>
                                                        <div style={{ fontWeight: 600, color: '#0f172a' }}>{sub.userName}</div>
                                                        <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '2px' }}>{sub.userEmail}</div>
                                                    </td>
                                                    <td style={{ padding: '16px' }}>
                                                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                                                            <span style={{ fontSize: '1.25rem', fontWeight: 700, color: sub.percentage >= 50 ? '#059669' : '#d97706' }}>
                                                                {sub.percentage}
                                                            </span>
                                                            <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>/ 100</span>
                                                        </div>
                                                    </td>
                                                    <td style={{ padding: '16px' }}>
                                                        {sub.needsManualGrading ? (
                                                            <span style={{ ...styles.badge, backgroundColor: '#fef3c7', color: '#92400e' }}>
                                                                ⏳ {t('needs_grading', 'Needs Grading')}
                                                            </span>
                                                        ) : (
                                                            <span style={{ ...styles.badge, backgroundColor: '#d1fae5', color: '#065f46' }}>
                                                                ✓ {t('graded', 'Graded')}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td style={{ padding: '16px', textAlign: 'right' }}>
                                                        <button
                                                            onClick={() => viewSubmissionDetail(sub.id)}
                                                            style={{
                                                                border: '1px solid #e2e8f0', background: '#fff', color: '#4f46e5',
                                                                padding: '6px 12px', borderRadius: '6px', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer'
                                                            }}
                                                        >
                                                            {t('view', 'View')}
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                        </div>
                    ) : (
                        /* Detail View */
                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) 3fr', gap: '24px', alignItems: 'start' }}>

                            {/* Sidebar Info - Made responsive safe */}
                            <div style={{ ...styles.card, padding: '24px', position: 'sticky', top: '0', minWidth: '250px' }}>
                                <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                                    <div style={{ fontSize: '0.85rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700, marginBottom: '8px' }}>{t('total_score', 'Total Score')}</div>
                                    <div style={{ fontSize: '3.5rem', fontWeight: 900, lineHeight: 1, color: '#4f46e5' }}>
                                        {selectedSubmission.submission.score}
                                        <span style={{ fontSize: '1.25rem', fontWeight: 500, color: '#94a3b8', marginLeft: '4px' }}>/100</span>
                                    </div>
                                </div>
                                <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                                        <span style={{ color: '#64748b' }}>{t('student')}</span>
                                        <span style={{ fontWeight: 600, color: '#1e293b', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedSubmission.submission.userName}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                                        <span style={{ color: '#64748b' }}>{t('date')}</span>
                                        <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', backgroundColor: '#f1f5f9', padding: '4px 8px', borderRadius: '4px' }}>
                                            {formatDate(selectedSubmission.submission.submittedAt)}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Questions Column */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%' }}>
                                {selectedSubmission.questions.map((q, idx) => {
                                    const borderColor = q.isAutoGradable
                                        ? (q.autoGradeResult?.correct ? '#10b981' : '#ef4444') // Emerald / Red
                                        : '#f59e0b'; // Amber
                                    return (
                                        <div key={q.id} style={{ ...styles.card, borderLeft: `5px solid ${borderColor}`, padding: '24px' }}>
                                            {/* Q Header */}
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span style={{ backgroundColor: '#e2e8f0', color: '#475569', padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase' }}>
                                                        Q{idx + 1}
                                                    </span>
                                                    <span style={{ border: '1px solid #e2e8f0', color: '#94a3b8', padding: '3px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}>
                                                        {q.type.replace('_', ' ')}
                                                    </span>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                    <span style={{ backgroundColor: '#f8fafc', padding: '6px 12px', borderRadius: '6px', fontWeight: 600, fontSize: '0.9rem', color: '#334155' }}>
                                                        {q.isAutoGradable && q.autoGradeResult ? q.autoGradeResult.points : 0} / {q.points} pts
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Prompt */}
                                            <div style={{ fontSize: '1.25rem', color: '#1e293b', fontWeight: 500, lineHeight: 1.5, marginBottom: '24px' }}>
                                                {q.prompt}
                                            </div>

                                            {/* Content Grid */}
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                                                {/* Student Answer */}
                                                <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px' }}>
                                                    <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', fontWeight: 700, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        👤 {t('student_answer', 'Student Answer')}
                                                    </div>
                                                    <div style={{ fontFamily: 'monospace', fontSize: '0.9rem', color: '#334155', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                                                        {typeof q.userAnswer === 'object'
                                                            ? JSON.stringify(q.userAnswer, null, 2)
                                                            : (q.userAnswer || <span style={{ color: '#cbd5e1', fontStyle: 'italic' }}>{t('no_answer')}</span>)}
                                                    </div>
                                                </div>

                                                {/* Correct Answer */}
                                                {q.isAutoGradable && (
                                                    <div style={{ backgroundColor: '#ecfdf5', border: '1px solid #d1fae5', borderRadius: '8px', padding: '16px' }}>
                                                        <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#059669', fontWeight: 700, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            ✅ {t('correct_answer', 'Correct Answer')}
                                                        </div>
                                                        <div style={{ fontFamily: 'monospace', fontSize: '0.9rem', color: '#064e3b', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                                                            {typeof q.correctAnswer === 'object' ? JSON.stringify(q.correctAnswer, null, 2) : q.correctAnswer}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Manual Grading */}
                                            {!q.isAutoGradable && (
                                                <div style={{ marginTop: '24px', backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '20px' }}>
                                                    <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#92400e', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        ✏️ {t('grade_this_question', 'Grade Question')}
                                                    </h4>
                                                    <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                                                        <div style={{ width: '120px' }}>
                                                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#92400e', marginBottom: '4px' }}>
                                                                {t('points')} (0-{q.points})
                                                            </label>
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                max={q.points}
                                                                value={grading[q.id]?.points ?? 0}
                                                                onChange={(e) => setGrading(prev => ({
                                                                    ...prev,
                                                                    [q.id]: { ...prev[q.id], points: parseInt(e.target.value) || 0 }
                                                                }))}
                                                                style={{ ...styles.input, fontWeight: 'bold' }}
                                                            />
                                                        </div>
                                                        <div style={{ flex: 1, minWidth: '200px' }}>
                                                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#92400e', marginBottom: '4px' }}>
                                                                {t('feedback')}
                                                            </label>
                                                            <input
                                                                type="text"
                                                                value={grading[q.id]?.feedback ?? ''}
                                                                onChange={(e) => setGrading(prev => ({
                                                                    ...prev,
                                                                    [q.id]: { ...prev[q.id], feedback: e.target.value }
                                                                }))}
                                                                placeholder={t('enter_feedback', 'Feedback...')}
                                                                style={styles.input}
                                                            />
                                                        </div>
                                                        <button
                                                            disabled={saving}
                                                            onClick={() => saveGrade(q.id)}
                                                            style={{ ...styles.button, backgroundColor: saving ? '#9ca3af' : '#d97706', height: '42px' }}
                                                        >
                                                            {saving ? '...' : t('save')}
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
