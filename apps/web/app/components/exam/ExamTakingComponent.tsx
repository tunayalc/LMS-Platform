import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { Question, QuestionMeta, Exam, trueFalseOptions } from '@lms/shared';
import Proctoring from './Proctoring';
import { HotspotQuestion } from '../questions';
import { useTranslation } from 'react-i18next';
import LocalizedFileInput from '../../../components/LocalizedFileInput';

interface ExamTakingComponentProps {
    exam: Exam;
    questions: Question[];
    apiBase: string;
    token: string;
    onComplete: (score: number, total: number, needsManualGrading?: boolean) => void;
    onCancel: () => void;
}

type AnswerMap = Record<string, any>;

// Styles object using CSS variables for dark/light mode support
const styles = {
    container: {
        width: '100%',
        maxWidth: '900px',
        margin: '0 auto',
        background: 'var(--card)',
        color: 'var(--ink)',
        borderRadius: '24px',
        overflow: 'hidden',
        boxShadow: 'var(--shadow-lg)',
        border: '1px solid var(--border)',
    } as React.CSSProperties,
    header: {
        background: 'var(--card)',
        backdropFilter: 'blur(10px)',
        padding: '24px 32px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '1px solid var(--border)',
    } as React.CSSProperties,
    title: {
        fontSize: '1.75rem',
        fontWeight: 700,
        margin: 0,
        color: 'var(--ink)',
    } as React.CSSProperties,
    timer: {
        fontSize: '2.5rem',
        fontFamily: 'monospace',
        fontWeight: 700,
        padding: '12px 20px',
        borderRadius: '16px',
        background: 'var(--accent-soft)',
        border: '1px solid var(--border)',
    } as React.CSSProperties,
    timerWarning: {
        color: '#ef4444',
        textShadow: '0 0 20px rgba(239, 68, 68, 0.5)',
    } as React.CSSProperties,
    timerNormal: {
        color: 'var(--accent)',
        textShadow: '0 0 20px var(--accent-soft)',
    } as React.CSSProperties,
    progressContainer: {
        width: '100%',
        height: '6px',
        background: 'var(--border)',
    } as React.CSSProperties,
    progressBar: {
        height: '100%',
        background: 'linear-gradient(90deg, var(--accent) 0%, #8b5cf6 100%)',
        transition: 'width 0.5s ease-out',
        boxShadow: '0 0 10px var(--accent-soft)',
    } as React.CSSProperties,
    progressText: {
        padding: '12px 32px',
        fontSize: '0.9rem',
        color: 'var(--ink-light)',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
    } as React.CSSProperties,
    questionArea: {
        padding: '48px 32px',
        minHeight: '400px',
    } as React.CSSProperties,
    questionNumber: {
        display: 'inline-block',
        padding: '6px 16px',
        background: 'var(--accent-soft)',
        color: 'var(--accent)',
        borderRadius: '20px',
        fontSize: '0.75rem',
        fontWeight: 700,
        textTransform: 'uppercase' as const,
        letterSpacing: '0.1em',
        marginBottom: '20px',
        border: '1px solid var(--border)',
    } as React.CSSProperties,
    questionPrompt: {
        fontSize: '1.75rem',
        fontWeight: 500,
        lineHeight: 1.5,
        marginBottom: '32px',
        color: 'var(--ink)',
    } as React.CSSProperties,
    optionsContainer: {
        display: 'flex',
        flexDirection: 'column' as const,
        gap: '12px',
    } as React.CSSProperties,
    option: (selected: boolean) => ({
        display: 'flex',
        alignItems: 'center',
        padding: '20px 24px',
        borderRadius: '16px',
        border: selected ? '2px solid var(--accent)' : '2px solid var(--border)',
        background: selected ? 'var(--accent-soft)' : 'var(--bg)',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        fontSize: '1.1rem',
        color: 'var(--ink)',
        boxShadow: selected ? 'var(--shadow-sm)' : 'none',
    }) as React.CSSProperties,
    radio: (selected: boolean) => ({
        width: '24px',
        height: '24px',
        borderRadius: '50%',
        border: selected ? '2px solid var(--accent)' : '2px solid var(--border)',
        marginRight: '16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        background: selected ? 'var(--accent)' : 'transparent',
    }) as React.CSSProperties,
    footer: {
        background: 'var(--card)',
        backdropFilter: 'blur(10px)',
        padding: '24px 32px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderTop: '1px solid var(--border)',
    } as React.CSSProperties,
    navButton: (disabled: boolean) => ({
        padding: '14px 28px',
        borderRadius: '12px',
        border: '1px solid var(--border)',
        background: disabled ? 'var(--bg)' : 'var(--card)',
        color: disabled ? 'var(--ink-light)' : 'var(--ink)',
        fontSize: '1rem',
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        transition: 'all 0.2s ease',
    }) as React.CSSProperties,
    nextButton: {
        padding: '14px 32px',
        borderRadius: '12px',
        border: 'none',
        background: 'var(--accent)',
        color: 'white',
        fontSize: '1rem',
        fontWeight: 600,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        boxShadow: 'var(--shadow-sm)',
        transition: 'all 0.2s ease',
    } as React.CSSProperties,
    submitButton: {
        padding: '14px 32px',
        borderRadius: '12px',
        border: 'none',
        background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
        color: 'white',
        fontSize: '1rem',
        fontWeight: 600,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        boxShadow: '0 10px 30px rgba(34, 197, 94, 0.3)',
    } as React.CSSProperties,
    exitButton: {
        padding: '10px 20px',
        borderRadius: '10px',
        border: 'none',
        background: 'transparent',
        color: '#ef4444',
        fontSize: '0.9rem',
        fontWeight: 600,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
    } as React.CSSProperties,
    input: {
        width: '100%',
        padding: '20px 24px',
        borderRadius: '16px',
        border: '2px solid var(--border)',
        background: 'var(--bg)',
        color: 'var(--ink)',
        fontSize: '1.1rem',
        outline: 'none',
    } as React.CSSProperties,
    textarea: {
        width: '100%',
        minHeight: '200px',
        padding: '20px 24px',
        borderRadius: '16px',
        border: '2px solid var(--border)',
        background: 'var(--bg)',
        color: 'var(--ink)',
        fontSize: '1.1rem',
        outline: 'none',
        resize: 'vertical' as const,
        fontFamily: 'inherit',
    } as React.CSSProperties,
    errorContainer: {
        display: 'flex',
        flexDirection: 'column' as const,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '400px',
        padding: '48px',
        textAlign: 'center' as const,
    } as React.CSSProperties,
    errorBox: {
        background: '#fef2f2',
        border: '1px solid #fecaca',
        borderRadius: '20px',
        padding: '32px',
        maxWidth: '400px',
    } as React.CSSProperties,
    loadingContainer: {
        display: 'flex',
        flexDirection: 'column' as const,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '400px',
        gap: '20px',
    } as React.CSSProperties,
    spinner: {
        width: '60px',
        height: '60px',
        border: '4px solid var(--border)',
        borderTopColor: 'var(--accent)',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite',
    } as React.CSSProperties,
};

export default function ExamTakingComponent({
    exam,
    questions,
    apiBase,
    token,
    onComplete,
    onCancel,
}: ExamTakingComponentProps) {
    const { t } = useTranslation();
    const [answers, setAnswers] = useState<AnswerMap>({});
    const [currentIndex, setCurrentIndex] = useState(0);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [timeLeft, setTimeLeft] = useState<number | null>(
        exam.durationMinutes ? exam.durationMinutes * 60 : null
    );
    const proctorThrottleRef = useRef<{ type: 'multiple_faces' | 'no_face' | 'unknown'; at: number } | null>(null);

    useEffect(() => {
        if (timeLeft === null) return;
        if (timeLeft <= 0) {
            handleSubmit();
            return;
        }
        const interval = setInterval(() => {
            setTimeLeft((prev) => (prev !== null ? prev - 1 : null));
        }, 1000);
        return () => clearInterval(interval);
    }, [timeLeft]);

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const currentQuestion = questions[currentIndex];
    const totalQuestions = questions.length;

    const setAnswer = (questionId: string, value: any) => {
        setAnswers((prev) => ({ ...prev, [questionId]: value }));
    };

    const handleSubmit = async () => {
        setSubmitting(true);
        setError(null);
        try {
            const res = await fetch(`${apiBase}/exams/${exam.id}/submit`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ answers }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.message || t('exam_submit_failed'));
            }
            const data = await res.json();
            // data.score is now percentage (out of 100)
            // data.needsManualGrading indicates if instructor review is needed
            onComplete(data.score ?? 0, data.total ?? 100, data.needsManualGrading ?? false);
        } catch (e: any) {
            setError(e.message || t('exam_submit_error'));
            setSubmitting(false);
        }
    };

    const handleViolation = async (type: 'multiple_faces' | 'no_face' | 'unknown', message: string) => {
        try {
            const now = Date.now();
            const last = proctorThrottleRef.current;
            if (last && last.type === type && now - last.at < 15000) {
                return;
            }
            proctorThrottleRef.current = { type, at: now };

            await fetch(`${apiBase}/exams/${exam.id}/proctor`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ type, message }),
            });
        } catch (err) {
            console.error('Proctoring log warning:', err);
        }
    };

    // Render functions for different question types
    const renderMultipleChoice = (q: Question) => {
        const options = q.options || [];
        const selected = answers[q.id] as string | undefined;
        return (
            <div style={styles.optionsContainer}>
                {options.map((opt, idx) => (
                    <div
                        key={idx}
                        style={styles.option(selected === opt)}
                        onClick={() => setAnswer(q.id, opt)}
                    >
                        <div style={styles.radio(selected === opt)}>
                            {selected === opt && <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#fff' }} />}
                        </div>
                        <span>{opt}</span>
                    </div>
                ))}
            </div>
        );
    };

    const renderMultipleSelect = (q: Question) => {
        const options = q.options || [];
        const selected = (answers[q.id] as string[]) || [];
        const toggle = (opt: string) => {
            if (selected.includes(opt)) {
                setAnswer(q.id, selected.filter((s) => s !== opt));
            } else {
                setAnswer(q.id, [...selected, opt]);
            }
        };
        return (
            <div style={styles.optionsContainer}>
                {options.map((opt, idx) => (
                    <div
                        key={idx}
                        style={styles.option(selected.includes(opt))}
                        onClick={() => toggle(opt)}
                    >
                        <div style={{
                            ...styles.radio(selected.includes(opt)),
                            borderRadius: '4px',
                        }}>
                            {selected.includes(opt) && <span style={{ color: '#fff', fontWeight: 700 }}>✓</span>}
                        </div>
                        <span>{opt}</span>
                    </div>
                ))}
            </div>
        );
    };

    const renderTrueFalse = (q: Question) => {
        const selected = answers[q.id] as string | undefined;
        return (
            <div style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
                {trueFalseOptions.map((opt) => (
                    <button
                        key={opt}
                        type="button"
                        onClick={() => setAnswer(q.id, opt)}
                        style={{
                            flex: 1,
                            maxWidth: '200px',
                            padding: '24px',
                            borderRadius: '16px',
                            border: selected === opt ? 'none' : '2px solid var(--border)',
                            fontSize: '1.25rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            background: selected === opt
                                ? (opt === 'Dogru' ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)' : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)')
                                : 'var(--card)',
                            color: selected === opt ? 'white' : 'var(--ink)',
                            boxShadow: selected === opt ? 'var(--shadow-lg)' : 'var(--shadow-sm)',
                            transition: 'all 0.2s ease',
                        }}
                    >
                        {opt === 'Dogru' ? '✓ ' + t('true', 'Doğru') : '✗ ' + t('false', 'Yanlış')}
                    </button>
                ))}
            </div>
        );
    };

    const renderShortAnswer = (q: Question) => (
        <input
            type="text"
            style={styles.input}
            placeholder={t('short_answer_placeholder', 'Type your answer here...')}
            value={(answers[q.id] as string) || ''}
            onChange={(e) => setAnswer(q.id, e.target.value)}
        />
    );

    const renderLongAnswer = (q: Question) => (
        <textarea
            style={styles.textarea}
            placeholder={t('long_answer_placeholder', 'Type your detailed answer here...')}
            value={(answers[q.id] as string) || ''}
            onChange={(e) => setAnswer(q.id, e.target.value)}
        />
    );

    // Ordering question - drag and drop simulation with buttons
    const renderOrdering = (q: Question) => {
        const meta = q.meta as QuestionMeta | undefined;
        const items = meta?.orderingItems || q.options || [];
        const currentOrder = (answers[q.id] as string[]) || [...items];

        const moveItem = (fromIndex: number, toIndex: number) => {
            const newOrder = [...currentOrder];
            const [removed] = newOrder.splice(fromIndex, 1);
            newOrder.splice(toIndex, 0, removed);
            setAnswer(q.id, newOrder);
        };

        return (
            <div style={styles.optionsContainer}>
                <p style={{ color: '#94a3b8', marginBottom: '16px', fontSize: '0.9rem' }}>
                    {t('ordering_instruction', 'Use the arrows to reorder items:')}
                </p>
                {currentOrder.map((item, idx) => (
                    <div
                        key={idx}
                        style={{
                            ...styles.option(false),
                            justifyContent: 'space-between',
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <span style={{ color: '#60a5fa', fontWeight: 700, minWidth: '30px' }}>{idx + 1}.</span>
                            <span>{item}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                                type="button"
                                onClick={() => idx > 0 && moveItem(idx, idx - 1)}
                                disabled={idx === 0}
                                style={{
                                    padding: '8px 12px',
                                    borderRadius: '8px',
                                    border: 'none',
                                    background: idx === 0 ? 'rgba(255,255,255,0.05)' : 'rgba(59, 130, 246, 0.2)',
                                    color: idx === 0 ? '#64748b' : '#60a5fa',
                                    cursor: idx === 0 ? 'not-allowed' : 'pointer',
                                }}
                            >
                                ↑
                            </button>
                            <button
                                type="button"
                                onClick={() => idx < currentOrder.length - 1 && moveItem(idx, idx + 1)}
                                disabled={idx === currentOrder.length - 1}
                                style={{
                                    padding: '8px 12px',
                                    borderRadius: '8px',
                                    border: 'none',
                                    background: idx === currentOrder.length - 1 ? 'rgba(255,255,255,0.05)' : 'rgba(59, 130, 246, 0.2)',
                                    color: idx === currentOrder.length - 1 ? '#64748b' : '#60a5fa',
                                    cursor: idx === currentOrder.length - 1 ? 'not-allowed' : 'pointer',
                                }}
                            >
                                ↓
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    // Matching question - dropdowns
    const renderMatching = (q: Question) => {
        const meta = q.meta as QuestionMeta | undefined;
        const pairs = meta?.matchingPairs || [];
        const userMatches = (answers[q.id] as Record<string, string>) || {};
        const leftItems = pairs.map((p) => p.left);
        const rightItems = pairs.map((p) => p.right);

        return (
            <div style={styles.optionsContainer}>
                <p style={{ color: '#94a3b8', marginBottom: '16px', fontSize: '0.9rem' }}>
                    {t('matching_instruction', 'Match items from left to right:')}
                </p>
                {leftItems.map((left, idx) => (
                    <div
                        key={idx}
                        style={{
                            ...styles.option(!!userMatches[left]),
                            justifyContent: 'space-between',
                        }}
                    >
                        <span style={{ fontWeight: 600 }}>{left}</span>
                        <select
                            value={userMatches[left] || ''}
                            onChange={(e) => setAnswer(q.id, { ...userMatches, [left]: e.target.value })}
                            style={{
                                padding: '10px 16px',
                                borderRadius: '8px',
                                border: '2px solid rgba(255,255,255,0.2)',
                                background: 'rgba(0,0,0,0.3)',
                                color: '#fff',
                                fontSize: '1rem',
                                minWidth: '200px',
                            }}
                        >
                            <option value="">{t('select_placeholder', '-- Select --')}</option>
                            {rightItems.map((right, rIdx) => (
                                <option key={rIdx} value={right}>{right}</option>
                            ))}
                        </select>
                    </div>
                ))}
            </div>
        );
    };

    // Fill in the blank
    const renderFillBlank = (q: Question) => {
        const blankCount = (q.prompt.match(/_+/g) || []).length || 1;
        const currentAnswers = (answers[q.id] as string[]) || Array(blankCount).fill('');

        return (
            <div style={styles.optionsContainer}>
                <p style={{ color: '#94a3b8', marginBottom: '16px', fontSize: '0.9rem' }}>
                    {t('fill_blank_instruction', 'Fill in each blank:')}
                </p>
                {currentAnswers.map((val, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                        <span style={{ color: '#60a5fa', fontWeight: 700 }}>{t('blank', 'Blank')} {idx + 1}:</span>
                        <input
                            type="text"
                            style={{ ...styles.input, flex: 1 }}
                            placeholder={t('fill_blank_placeholder', 'Your answer...')}
                            value={val}
                            onChange={(e) => {
                                const newAnswers = [...currentAnswers];
                                newAnswers[idx] = e.target.value;
                                setAnswer(q.id, newAnswers);
                            }}
                        />
                    </div>
                ))}
            </div>
        );
    };

    // File upload placeholder
    const renderFileUpload = (q: Question) => (
        <div style={{ padding: '24px', border: '2px dashed rgba(255,255,255,0.2)', borderRadius: '16px', textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: '16px' }}>📁</div>
            <p style={{ color: '#94a3b8', marginBottom: '16px' }}>{t('file_drop_prompt', 'Click to select or drag a file here')}</p>
            <div style={{ maxWidth: '520px', margin: '0 auto' }}>
                <LocalizedFileInput
                    onSelect={(file) => {
                        if (file) setAnswer(q.id, file.name); // Store filename as placeholder
                    }}
                />
            </div>
            {answers[q.id] && (
                <p style={{ color: '#22c55e', marginTop: '12px' }}>✓ {t('file_uploaded', 'File selected')}: {String(answers[q.id])}</p>
            )}
        </div>
    );

    // Calculation question
    const renderCalculation = (q: Question) => (
        <div>
            <p style={{ color: '#94a3b8', marginBottom: '16px', fontSize: '0.9rem' }}>
                {t('calculation_instruction', 'Enter your calculated answer:')}
            </p>
            <input
                type="number"
                step="any"
                style={styles.input}
                placeholder={t('calculation_placeholder', 'Enter numeric answer...')}
                value={(answers[q.id] as string) || ''}
                onChange={(e) => setAnswer(q.id, e.target.value)}
            />
        </div>
    );

    const renderHotspotInteractive = (q: Question) => {
        const imageUrl = q.meta?.hotspot?.imageUrl;
        const areas = q.meta?.hotspot?.areas ?? [];
        const value = (answers[q.id] as { x: number; y: number } | null) ?? null;

        if (!imageUrl) {
            return (
                <div style={{ padding: '20px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '12px', color: '#f87171' }}>
                    {t('hotspot_missing_image', 'Hotspot image is missing.')}
                </div>
            );
        }

        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <p style={{ color: '#94a3b8', fontSize: '0.95rem' }}>
                    {t('hotspot_instruction', 'Click on the correct area in the image.')}
                </p>
                <HotspotQuestion
                    imageUrl={imageUrl}
                    regions={areas.map((area, index) => ({
                        id: `area-${index}`,
                        type: 'rectangle' as const,
                        x: area.x,
                        y: area.y,
                        width: area.width,
                        height: area.height
                    }))}
                    value={value}
                    onChange={(point) => setAnswer(q.id, point)}
                />
            </div>
        );
    };

    // Hotspot placeholder
    const renderHotspot = (q: Question) => (
        <div style={{ padding: '24px', background: 'rgba(255,255,255,0.05)', borderRadius: '16px', textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🎯</div>
            <p style={{ color: '#94a3b8' }}>{t('hotspot_instruction', 'Click on the correct area in the image.')}</p>
            <p style={{ color: '#64748b', fontSize: '0.85rem' }}>{t('hotspot_not_supported', 'Hotspot questions require image interaction.')}</p>
        </div>
    );

    // Code question placeholder
    const renderCode = (q: Question) => (
        <div>
            <p style={{ color: '#94a3b8', marginBottom: '16px', fontSize: '0.9rem' }}>
                {t('code_instruction', 'Write your code below:')}
            </p>
            <textarea
                style={{
                    ...styles.textarea,
                    fontFamily: 'monospace',
                    background: '#0f172a',
                    minHeight: '250px',
                }}
                placeholder={t('code_placeholder', '// Write your code here...')}
                value={(answers[q.id] as string) || ''}
                onChange={(e) => setAnswer(q.id, e.target.value)}
            />
        </div>
    );

    const renderQuestion = (q: Question) => {
        switch (q.type) {
            case 'multiple_choice': return renderMultipleChoice(q);
            case 'multiple_select': return renderMultipleSelect(q);
            case 'true_false': return renderTrueFalse(q);
            case 'short_answer': return renderShortAnswer(q);
            case 'long_answer': return renderLongAnswer(q);
            case 'ordering': return renderOrdering(q);
            case 'matching': return renderMatching(q);
            case 'fill_blank': return renderFillBlank(q);
            case 'file_upload': return renderFileUpload(q);
            case 'calculation': return renderCalculation(q);
            case 'hotspot': return renderHotspotInteractive(q);
            case 'code': return renderCode(q);
            default: return (
                <div style={{ padding: '20px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '12px', color: '#f87171' }}>
                    {t('unsupported_question_type', 'Unsupported question type')}: {q.type}
                </div>
            );
        }
    };

    // Loading state
    if (submitting) {
        return (
            <div style={styles.container}>
                <div style={styles.loadingContainer}>
                    <div style={styles.spinner} />
                    <p style={{ fontSize: '1.25rem', color: '#94a3b8' }}>{t('submitting', 'Submitting exam...')}</p>
                </div>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
        );
    }

    // Error state
    if (error) {
        return (
            <div style={styles.container}>
                <div style={styles.errorContainer}>
                    <div style={styles.errorBox}>
                        <div style={{ fontSize: '3rem', marginBottom: '16px' }}>⚠️</div>
                        <h3 style={{ fontSize: '1.5rem', marginBottom: '12px' }}>{t('error_occurred', 'Error')}</h3>
                        <p style={{ color: '#f87171', marginBottom: '24px' }}>{error}</p>
                        <button
                            onClick={onCancel}
                            style={{ ...styles.navButton(false), margin: '0 auto' }}
                        >
                            {t('return_to_dashboard', 'Back')}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div style={styles.container}>
            <Proctoring examId={exam.id} onViolation={handleViolation} />

            {/* Header */}
            <div style={styles.header}>
                <div>
                    <h1 style={styles.title}>{exam.title}</h1>
                    <div style={{ marginTop: '8px', fontSize: '0.9rem', color: '#94a3b8' }}>
                        {t('question')} {currentIndex + 1} / {totalQuestions}
                    </div>
                </div>
                <div style={{
                    ...styles.timer,
                    ...(timeLeft && timeLeft < 300 ? styles.timerWarning : styles.timerNormal)
                }}>
                    {timeLeft !== null ? formatTime(timeLeft) : '∞'}
                </div>
            </div>

            {/* Progress Bar */}
            <div style={styles.progressContainer}>
                <div style={{ ...styles.progressBar, width: `${((currentIndex + 1) / totalQuestions) * 100}%` }} />
            </div>

            {/* Question Area */}
            <div style={styles.questionArea}>
                {currentQuestion ? (
                    <>
                        <div style={styles.questionNumber}>
                            {t('question')} {currentIndex + 1}
                        </div>
                        <div style={styles.questionPrompt}>
                            {currentQuestion.prompt}
                        </div>
                        {renderQuestion(currentQuestion)}
                    </>
                ) : (
                    <div style={{ textAlign: 'center', color: '#94a3b8', padding: '48px' }}>
                        {t('no_questions', 'No questions available.')}
                    </div>
                )}
            </div>

            {/* Footer */}
            <div style={styles.footer}>
                <button
                    onClick={() => {
                        if (confirm(t('exit_confirm', 'Are you sure you want to exit?'))) {
                            onCancel();
                        }
                    }}
                    style={styles.exitButton}
                >
                    ← {t('exam_exit', 'Exit')}
                </button>

                <div style={{ display: 'flex', gap: '12px' }}>
                    <button
                        onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
                        disabled={currentIndex === 0}
                        style={styles.navButton(currentIndex === 0)}
                    >
                        ← {t('nav_prev', 'Previous')}
                    </button>

                    {currentIndex === totalQuestions - 1 ? (
                        <button
                            onClick={() => {
                                if (confirm(t('submit_confirm', 'Are you sure you want to submit?'))) {
                                    handleSubmit();
                                }
                            }}
                            style={styles.submitButton}
                        >
                            {t('submit_exam', 'Submit')} ✓
                        </button>
                    ) : (
                        <button
                            onClick={() => setCurrentIndex((prev) => Math.min(totalQuestions - 1, prev + 1))}
                            style={styles.nextButton}
                        >
                            {t('nav_next', 'Next')} →
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
