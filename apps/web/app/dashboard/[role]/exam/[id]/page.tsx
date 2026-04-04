'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import ExamTakingComponent from '../../../../components/exam/ExamTakingComponent';
import { useTranslation } from 'react-i18next';
import { resolveApiBaseUrl } from '@lms/shared';

// Define minimal types locally or import from shared if available
// Assuming shared types might not be fully accessible or to avoid import issues:
interface Exam {
    id: string;
    title: string;
    durationMinutes?: number;
    passThreshold?: number;
    // ... other fields
}

interface Question {
    id: string;
    type: string;
    prompt: string;
    options?: string[];
    // ...
}

export default function ExamDetailPage() {
    const params = useParams();
    const router = useRouter();
    const { t } = useTranslation();
    const [token, setToken] = useState<string | null>(null);
    const [apiBaseUrl, setApiBaseUrl] = useState<string>("");

    const [exam, setExam] = useState<Exam | null>(null);
    const [questions, setQuestions] = useState<Question[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const { role, id: examId } = params as { role: string; id: string };

    useEffect(() => {
        // Client-side only logic
        if (typeof window !== 'undefined') {
            const storedToken = localStorage.getItem('lms_token');
            if (!storedToken) {
                router.push('/');
                return;
            }
            setToken(storedToken);

            setApiBaseUrl(resolveApiBaseUrl({ runtime: 'web' }));
        }
    }, [router]);


    useEffect(() => {
        // Enforce SEB for students
        if (role === 'student' && typeof navigator !== 'undefined') {
            const isSEB = navigator.userAgent.includes('SEB');
            if (!isSEB) {
                setError(t('seb_required_message'));
            }
        }
    }, [role, t]);

    useEffect(() => {
        if (!token || !apiBaseUrl || !examId) return;
        // Skip fetching if SEB error is already present for students
        if (role === 'student' && typeof navigator !== 'undefined' && !navigator.userAgent.includes('SEB')) {
            return;
        }

        const fetchData = async () => {
            setLoading(true);
            try {
                // Fetch Exam
                const examRes = await fetch(`${apiBaseUrl}/exams/${examId}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (!examRes.ok) {
                    if (examRes.status === 404) throw new Error(t('exam_not_found'));
                    throw new Error('Failed to fetch exam');
                }
                const examData = await examRes.json();

                // Fetch Questions
                const qRes = await fetch(`${apiBaseUrl}/questions?examId=${examId}&limit=100`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (!qRes.ok) throw new Error('Failed to fetch questions');
                const qData = await qRes.json();

                setExam(examData.exam || examData); // Handle nested 'exam' wrapper if present
                setQuestions(qData.questions || []);

            } catch (err: any) {
                console.error(err);
                setError(err.message || 'Error loading exam');
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [token, apiBaseUrl, examId, role, t]);

    if (error) {
        return (
            <div
                className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-8 text-white"
                style={{ backgroundColor: '#111827', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'white' }}
            >
                <div
                    className="bg-red-500/10 border border-red-500/20 p-8 rounded-2xl max-w-lg w-full text-center shadow-2xl backdrop-blur-sm"
                    style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', borderColor: 'rgba(239, 68, 68, 0.2)', padding: '2rem', borderRadius: '1rem', maxWidth: '32rem', width: '100%', textAlign: 'center' }}
                >
                    <div className="bg-red-500/20 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6" style={{ backgroundColor: 'rgba(239, 68, 68, 0.2)', width: '4rem', height: '4rem', borderRadius: '9999px', margin: '0 auto 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg className="w-8 h-8 text-red-500" style={{ color: '#ef4444', width: '2rem', height: '2rem' }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                    </div>
                    <h2 className="text-2xl font-bold mb-4" style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem' }}>{t('seb_required_title', 'SEB Required')}</h2>
                    <p className="text-red-200 mb-8" style={{ color: '#fca5a5', marginBottom: '2rem' }}>{error}</p>
                    <button
                        onClick={() => router.back()}
                        className="px-8 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-xl font-semibold transition-all border border-gray-700"
                        style={{ padding: '0.75rem 2rem', backgroundColor: '#1f2937', color: 'white', borderRadius: '0.75rem', fontWeight: 600, border: '1px solid #374151', cursor: 'pointer' }}
                    >
                        {t('return_to_list', 'Return to List')}
                    </button>
                    <div className="mt-8 pt-6 border-t border-gray-700/50" style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid rgba(55, 65, 81, 0.5)' }}>
                        <a href="https://safeexambrowser.org/download_en.html" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 text-sm hover:underline" style={{ color: '#60a5fa', textDecoration: 'underline' }}>
                            Download Safe Exam Browser
                        </a>
                    </div>
                </div>
            </div>
        );
    }

    if (!token || !apiBaseUrl || loading) {
        return <div className="p-8 flex justify-center" style={{ padding: '2rem', display: 'flex', justifyContent: 'center' }}>{t('loading')}...</div>;
    }

    if (!exam) return null; // Should be handled by error state

    // If role is student, only render pure component, no surrounding UI to prevent navigation
    if (role === 'student') {
        return (
            <ExamTakingComponent
                exam={exam as any}
                questions={questions as any[]}
                apiBase={apiBaseUrl}
                token={token}
                onComplete={(score, total, needsManualGrading) => {
                    let message = `${t('exam_completed')}\n\n${t('score', 'Score')}: ${score}/100`;
                    if (needsManualGrading) {
                        message += `\n\n⏳ ${t('manual_grading_pending', 'Some questions require manual grading by the instructor. Your final score may change.')}`;
                    }
                    alert(message);
                    router.push(`/dashboard/${role}`);
                }}
                onCancel={() => router.back()}
            />
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            <div className="bg-white shadow p-4 flex justify-between items-center sticky top-0 z-10">
                <button
                    onClick={() => router.back()}
                    className="text-gray-600 hover:text-gray-900 font-semibold flex items-center gap-2"
                >
                    ← {t('return_to_list')}
                </button>
                <div className="font-bold text-lg">{exam.title}</div>
                <div className="w-20"></div> {/* Spacer */}
            </div>

            <div className="flex-1 p-4 md:p-8">
                <ExamTakingComponent
                    exam={exam as any} // Cast to any to avoid strict shared type mismatch if fields differ slightly
                    questions={questions as any[]}
                    apiBase={apiBaseUrl} // Note: Prop is apiBase, not apiBaseUrl
                    token={token}
                    onComplete={(score, total, needsManualGrading) => {
                        let message = `${t('exam_completed')}\n\n${t('score', 'Score')}: ${score}/100`;
                        if (needsManualGrading) {
                            message += `\n\n⏳ ${t('manual_grading_pending', 'Some questions require manual grading by the instructor. Your final score may change.')}`;
                        }
                        alert(message);
                        router.push(`/dashboard/${role}`);
                    }}
                    onCancel={() => router.back()}
                />
            </div>
        </div>
    );
}
