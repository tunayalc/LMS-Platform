import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";

interface Tag {
    id: string;
    name: string;
    color: string;
}

interface QuestionBankPanelProps {
    courseId: string;
    apiBaseUrl: string;
    token: string | null;
    onClose: () => void;
    onExamCreated: () => void;
}

export default function QuestionBankPanel({ courseId, apiBaseUrl, token, onClose, onExamCreated }: QuestionBankPanelProps) {
    const { t } = useTranslation();
    const [tags, setTags] = useState<Tag[]>([]);
    const [loading, setLoading] = useState(false);
    const [newTagName, setNewTagName] = useState("");

    // Exam Generation State
    const [selectedTagId, setSelectedTagId] = useState<string>("");
    const [questionCount, setQuestionCount] = useState(10);
    const [examTitle, setExamTitle] = useState("");
    const [examDuration, setExamDuration] = useState(30);
    const [passThreshold, setPassThreshold] = useState(50);

    useEffect(() => {
        if (token) fetchTags();
    }, [token]);

    const fetchTags = async () => {
        try {
            const res = await fetch(`${apiBaseUrl}/api/question-bank/tags`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) setTags(await res.json());
        } catch (error) {
            console.error(error);
        }
    };

    const handleCreateTag = async () => {
        if (!newTagName.trim()) return;
        try {
            const res = await fetch(`${apiBaseUrl}/api/question-bank/tags`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ name: newTagName })
            });
            if (res.ok) {
                setNewTagName("");
                fetchTags();
            }
        } catch (error) {
            console.error(error);
        }
    };

    const handleGenerateExam = async () => {
        if (!selectedTagId || !examTitle) {
            alert(t('alert_select_pool_title'));
            return;
        }

        setLoading(true);
        try {
            const res = await fetch(`${apiBaseUrl}/api/question-bank/exam-from-pool`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    title: examTitle,
                    courseId,
                    tagIds: [selectedTagId],
                    questionCount: Number(questionCount),
                    durationMinutes: Number(examDuration),
                    passThreshold: Number(passThreshold)
                })
            });

            if (res.ok) {
                alert(t('alert_exam_created'));
                onExamCreated();
                onClose();
            } else {
                const err = await res.json();
                alert(`${t('error')}: ${err.error || t('unknown_error')}`);
            }
        } catch (error) {
            console.error(error);
            alert(t('connection_error'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col">
                <div className="p-6 border-b flex justify-between items-center sticky top-0 bg-white z-10">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-800">{t('question_bank_title')}</h2>
                        <p className="text-sm text-gray-500">{t('question_bank_subtitle')}</p>
                    </div>
                    <button className="btn btn-ghost" onClick={onClose}>✕</button>
                </div>

                <div className="p-6 space-y-8">
                    {/* SECTION 1: MANAGE BANKS (TAGS) */}
                    <div className="bg-blue-50 p-6 rounded-lg border border-blue-100">
                        <h3 className="font-semibold text-lg mb-4 text-blue-900">{t('pool_section_title')}</h3>
                        <div className="flex gap-2 mb-4">
                            <input
                                className="input flex-1"
                                placeholder={t('new_pool_placeholder')}
                                value={newTagName}
                                onChange={(e) => setNewTagName(e.target.value)}
                            />
                            <button className="btn btn-secondary" onClick={handleCreateTag}>{t('add')}</button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {tags.map(tag => (
                                <span key={tag.id} className="px-3 py-1 bg-white border rounded-full text-sm font-medium text-gray-700 shadow-sm">
                                    {tag.name}
                                </span>
                            ))}
                            {tags.length === 0 && <span className="text-gray-400 italic">{t('no_pools_yet')}</span>}
                        </div>
                    </div>

                    {/* SECTION 2: GENERATE EXAM */}
                    <div className="bg-green-50 p-6 rounded-lg border border-green-100">
                        <h3 className="font-semibold text-lg mb-4 text-green-900">{t('exam_gen_section_title')}</h3>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">{t('exam_title_label')}</label>
                                <input
                                    className="input w-full"
                                    placeholder={t('exam_title_placeholder')}
                                    value={examTitle}
                                    onChange={(e) => setExamTitle(e.target.value)}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium mb-1">{t('select_pool_label')}</label>
                                    <select
                                        className="input w-full"
                                        value={selectedTagId}
                                        onChange={(e) => setSelectedTagId(e.target.value)}
                                    >
                                        <option value="">{t('select_placeholder')}</option>
                                        {tags.map(tag => (
                                            <option key={tag.id} value={tag.id}>{tag.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">{t('question_count_label')}</label>
                                    <input
                                        type="number"
                                        className="input w-full"
                                        value={questionCount}
                                        onChange={(e) => setQuestionCount(Number(e.target.value))}
                                        min={1}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium mb-1">{t('duration_label')}</label>
                                    <input
                                        type="number"
                                        className="input w-full"
                                        value={examDuration}
                                        onChange={(e) => setExamDuration(Number(e.target.value))}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">{t('pass_threshold_label')}</label>
                                    <input
                                        type="number"
                                        className="input w-full"
                                        value={passThreshold}
                                        onChange={(e) => setPassThreshold(Number(e.target.value))}
                                    />
                                </div>
                            </div>

                            <button
                                className="btn w-full py-3 text-lg font-semibold bg-green-600 hover:bg-green-700 text-white mt-4"
                                onClick={handleGenerateExam}
                                disabled={loading}
                            >
                                {loading ? t('generating_btn') : t('generate_exam_btn')}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
