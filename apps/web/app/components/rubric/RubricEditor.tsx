import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface RubricLevel {
    name: string;
    description: string;
    points: number;
}

interface RubricCriteria {
    name: string;
    description: string;
    maxPoints: number;
    levels: RubricLevel[];
}

interface RubricEditorProps {
    courseId: string;
    apiBaseUrl: string;
    token: string | null;
    onClose: () => void;
}

export default function RubricEditor({ courseId, apiBaseUrl, token, onClose }: RubricEditorProps) {
    const { t } = useTranslation();
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [criteria, setCriteria] = useState<RubricCriteria[]>([
        { name: "Criterion 1", description: "", maxPoints: 10, levels: [] }
    ]);
    const [loading, setLoading] = useState(false);

    const handleAddCriteria = () => {
        setCriteria([...criteria, { name: "", description: "", maxPoints: 10, levels: [] }]);
    };

    const handleUpdateCriteria = (index: number, field: keyof RubricCriteria, value: any) => {
        const newCriteria = [...criteria];
        newCriteria[index] = { ...newCriteria[index], [field]: value };
        setCriteria(newCriteria);
    };

    const handleSave = async () => {
        if (!title) return alert(t('alert_title_required'));
        setLoading(true);
        try {
            const res = await fetch(`${apiBaseUrl}/api/rubrics`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    title,
                    description,
                    courseId,
                    criteria
                })
            });
            if (res.ok) {
                alert(t('success_saved'));
                onClose();
            } else {
                alert(t('error'));
            }
        } catch (e) {
            console.error(e);
            alert(t('connection_error'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto flex flex-col">
                <div className="p-6 border-b flex justify-between items-center sticky top-0 bg-white z-10">
                    <h2 className="text-2xl font-bold">{t('create_rubric_title')}</h2>
                    <button className="btn btn-ghost" onClick={onClose}>✕</button>
                </div>

                <div className="p-8 space-y-6">
                    <div className="grid gap-4">
                        <div>
                            <label className="block font-semibold mb-1">{t('rubric_title_label')}</label>
                            <input className="input w-full" value={title} onChange={e => setTitle(e.target.value)} placeholder={t('rubric_title_placeholder')} />
                        </div>
                        <div>
                            <label className="block font-semibold mb-1">{t('description_label')}</label>
                            <textarea className="input w-full h-20" value={description} onChange={e => setDescription(e.target.value)} />
                        </div>
                    </div>

                    <div className="border-t pt-6">
                        <h3 className="font-bold text-lg mb-4">{t('criteria_section_title')}</h3>
                        {criteria.map((c, i) => (
                            <div key={i} className="mb-6 p-4 border rounded bg-gray-50">
                                <div className="flex justify-between mb-2">
                                    <h4 className="font-semibold text-blue-800">{t('criterion_label')} {i + 1}</h4>
                                    <button className="text-red-500 text-sm" onClick={() => setCriteria(criteria.filter((_, idx) => idx !== i))}>{t('delete')}</button>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                    <input
                                        className="input"
                                        placeholder={t('criterion_name_placeholder')}
                                        value={c.name}
                                        onChange={(e) => handleUpdateCriteria(i, 'name', e.target.value)}
                                    />
                                    <input
                                        className="input"
                                        type="number"
                                        placeholder={t('max_points_placeholder')}
                                        value={c.maxPoints}
                                        onChange={(e) => handleUpdateCriteria(i, 'maxPoints', Number(e.target.value))}
                                    />
                                </div>
                                <textarea
                                    className="input w-full text-sm"
                                    placeholder={t('criterion_desc_placeholder')}
                                    value={c.description}
                                    onChange={(e) => handleUpdateCriteria(i, 'description', e.target.value)}
                                />
                                {/* Levels editing could be added here for detailed rubric, simplifying for PoC */}
                                <p className="text-xs text-gray-400 mt-2">{t('rubric_levels_hint')}</p>
                            </div>
                        ))}
                        <button className="btn btn-secondary w-full" onClick={handleAddCriteria}>{t('add_criterion_btn')}</button>
                    </div>

                    <div className="pt-4 border-t flex justify-end gap-2">
                        <button className="btn btn-ghost" onClick={onClose}>{t('cancel')}</button>
                        <button className="btn btn-primary" onClick={handleSave} disabled={loading}>
                            {loading ? t('saving_btn') : t('save_rubric_btn')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
