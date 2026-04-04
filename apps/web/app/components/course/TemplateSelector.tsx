
"use client";

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface Template {
    id: string;
    title: string;
    description: string;
    category: string;
    usage_count: number;
}

interface TemplateSelectorProps {
    apiBaseUrl: string;
    token: string;
    onSelect: (templateId: string) => void;
    onCancel: () => void;
}

export default function TemplateSelector({ apiBaseUrl, token, onSelect, onCancel }: TemplateSelectorProps) {
    const { t } = useTranslation();
    const [templates, setTemplates] = useState<Template[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const normalizedBase = apiBaseUrl.replace(/\/$/, "");
        fetch(`${normalizedBase}/api/templates`, {
            headers: { Authorization: `Bearer ${token}` }
        })
            .then(res => res.json())
            .then(data => {
                setTemplates(Array.isArray(data) ? data : []);
                setLoading(false);
            })
            .catch(err => {
                console.error(err);
                setLoading(false);
            });
    }, [apiBaseUrl, token]);

    if (loading) return <div className="p-4">{t('templates_loading')}</div>;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold dark:text-white">{t('create_from_template')}</h2>
                    <button onClick={onCancel} className="text-gray-500 hover:text-gray-700">✕</button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div
                        onClick={() => onSelect('empty')}
                        className="border dark:border-gray-700 p-4 rounded cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                    >
                        <h3 className="font-semibold text-lg dark:text-white">{t('empty_course')}</h3>
                        <p className="text-sm text-gray-500">{t('empty_course_desc')}</p>
                    </div>

                    {templates.map(tmpl => (
                        <div
                            key={tmpl.id}
                            onClick={() => onSelect(tmpl.id)}
                            className="border dark:border-gray-700 p-4 rounded cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/30 border-l-4 border-l-transparent hover:border-l-blue-500 transition"
                        >
                            <h3 className="font-semibold text-lg dark:text-white">{tmpl.title}</h3>
                            <p className="text-sm text-gray-500 mb-2">{tmpl.description}</p>
                            <span className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                                {tmpl.category || t('general')}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
