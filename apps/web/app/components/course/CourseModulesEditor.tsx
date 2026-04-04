import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent
} from "@dnd-kit/core";
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Module, ContentItem } from "@lms/shared";
import ContentReorderList from './ContentReorderList';

interface CourseModulesEditorProps {
    courseId: string;
    apiBaseUrl: string;
    token: string;
    onClose: () => void;
}

function SortableModuleItem({
    module,
    onEdit,
    onDelete,
    onReorderContents
}: {
    module: Module,
    onEdit: (id: string, title: string) => void,
    onDelete: (id: string) => void,
    onReorderContents: (module: Module) => void
}) {
    const { t } = useTranslation();
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
    } = useSortable({ id: module.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    const [isEditing, setIsEditing] = useState(false);
    const [editTitle, setEditTitle] = useState(module.title);

    const handleSave = () => {
        onEdit(module.id, editTitle);
        setIsEditing(false);
    };

    return (
        <div ref={setNodeRef} style={style} className="module-item mb-4 p-4 bg-gray-50 border rounded-lg shadow-sm">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 flex-1">
                    {/* Drag Handle */}
                    <div {...attributes} {...listeners} className="cursor-grab text-gray-400 hover:text-gray-600 p-2">
                        ☰
                    </div>

                    {isEditing ? (
                        <div className="flex gap-2 flex-1">
                            <input
                                className="input flex-1"
                                value={editTitle}
                                onChange={(e) => setEditTitle(e.target.value)}
                            />
                            <button className="btn btn-sm btn-primary" onClick={handleSave}>{t('save')}</button>
                            <button className="btn btn-sm btn-ghost" onClick={() => setIsEditing(false)}>{t('cancel')}</button>
                        </div>
                    ) : (
                        <h3 className="font-semibold text-lg">{module.title}</h3>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    <button
                        className="btn btn-sm btn-outline btn-info gap-2"
                        onClick={() => onReorderContents(module)}
                        title={t('reorder_contents')}
                    >
                        ⇄ {t('contents')}
                    </button>
                    {!isEditing && (
                        <button className="btn btn-sm btn-ghost" onClick={() => setIsEditing(true)}>✎</button>
                    )}
                    <button className="btn btn-sm btn-ghost text-red-500" onClick={() => onDelete(module.id)}>🗑</button>
                </div>
            </div>
        </div>
    );
}

// --- Main Component ---

export default function CourseModulesEditor({ courseId, apiBaseUrl, token, onClose }: CourseModulesEditorProps) {
    const { t } = useTranslation();
    const [modules, setModules] = useState<Module[]>([]);
    const [loading, setLoading] = useState(false);
    const [newModuleTitle, setNewModuleTitle] = useState("");

    // Content Reorder State
    const [reorderingModule, setReorderingModule] = useState<Module | null>(null);
    const [moduleContents, setModuleContents] = useState<ContentItem[]>([]);
    const [contentsLoading, setContentsLoading] = useState(false);

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    useEffect(() => {
        fetchModules();
    }, [courseId, token]);

    // ... (fetchModules, handleDragEnd, saveOrder, handleAddModule codes same as before)
    const fetchModules = async () => {
        if (!token) return;
        setLoading(true);
        try {
            const res = await fetch(`${apiBaseUrl}/api/modules/${courseId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setModules(data);
            }
        } catch (error) {
            console.error("Modüller yüklenemedi", error);
        } finally {
            setLoading(false);
        }
    };

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;

        if (over && active.id !== over.id) {
            setModules((items) => {
                const oldIndex = items.findIndex(i => i.id === active.id);
                const newIndex = items.findIndex(i => i.id === over.id);
                const newItems = arrayMove(items, oldIndex, newIndex);
                saveOrder(newItems);
                return newItems;
            });
        }
    };

    const saveOrder = async (sortedModules: Module[]) => {
        try {
            const updates = sortedModules.map((m, index) => ({
                id: m.id,
                sortOrder: index,
                parentModuleId: null
            }));

            await fetch(`${apiBaseUrl}/api/modules/reorder`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ updates })
            });
        } catch (error) {
            console.error("Sıralama kaydedilemedi", error);
        }
    };

    const handleAddModule = async () => {
        if (!newModuleTitle.trim()) return;
        try {
            const res = await fetch(`${apiBaseUrl}/api/modules`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    courseId,
                    title: newModuleTitle,
                    sortOrder: modules.length
                })
            });
            if (res.ok) {
                const newModule = await res.json();
                setModules([...modules, newModule]);
                setNewModuleTitle("");
            }
        } catch (error) {
            console.error("Modül eklenemedi", error);
        }
    };

    const handleEditModule = async (id: string, title: string) => {
        console.log("Edit module", id, title);
        setModules(modules.map(m => m.id === id ? { ...m, title } : m));
    };

    const handleDeleteModule = async (id: string) => {
        if (!confirm(t('confirm_delete_module'))) return;
        console.log("Delete module", id);
        setModules(modules.filter(m => m.id !== id));
    };

    // --- Content Reorder Logic ---

    const openReorderContents = async (module: Module) => {
        setReorderingModule(module);
        setContentsLoading(true);
        try {
            const directItems = (module.contentItems ?? []).slice();
            if (directItems.length) {
                setModuleContents(directItems.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)));
                return;
            }

            // Fallback: some API responses may not embed contentItems in module objects.
            // Fetch course contents and filter by moduleId.
            const res = await fetch(`${apiBaseUrl}/content?courseId=${encodeURIComponent(courseId)}&limit=1000&offset=0`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!res.ok) {
                throw new Error(`Content fetch failed (${res.status})`);
            }
            const data = await res.json();
            const all = (Array.isArray(data) ? data : (data?.content || [])) as any[];
            const items = all
                .filter((c) => String(c.moduleId || '') === String(module.id))
                .map((c) => ({
                    id: c.id,
                    type: c.type,
                    title: c.title,
                    source: c.source,
                    meetingUrl: c.meetingUrl,
                    courseId: c.courseId,
                    moduleId: c.moduleId,
                    sortOrder: c.sortOrder
                }));
            setModuleContents(items.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)));
        } catch (err) {
            console.error(err);
            alert(t('error'));
        } finally {
            setContentsLoading(false);
        }
    };

    const handleSaveContentOrder = async (newItems: ContentItem[]) => {
        setModuleContents(newItems);
        setModules((prev) =>
            prev.map((m) => (m.id === reorderingModule?.id ? { ...m, contentItems: newItems } : m))
        );
        // Call API
        try {
            const updates = newItems.map((item, index) => ({
                id: item.id,
                sortOrder: index,
                moduleId: reorderingModule?.id
            }));
            await fetch(`${apiBaseUrl}/api/modules/reorder-content`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ updates })
            });
        } catch (err) {
            console.error('Content reorder failed', err);
        }
    };

    return (
        <div className="fixed inset-0 bg-white z-50 overflow-y-auto flex flex-col">
            <div className="p-4 border-b flex justify-between items-center sticky top-0 bg-white z-10 shadow-sm">
                <h2 className="text-xl font-bold">{t('edit_modules_title')}</h2>
                <button className="btn" onClick={onClose}>{t('close')}</button>
            </div>
            <div className="px-6 pt-4 text-sm text-gray-600">
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <div className="font-semibold text-amber-900 mb-1">{t('drag_drop_hint_title', 'Sürükle-Bırak')}</div>
                    <div className="text-amber-900">
                        {t('drag_drop_hint_body', 'Sıralamak için sol taraftaki ☰ tutamacını basılı tutup sürükleyin. “⇄ İçerikler” ile modül içi içerik sıralamasını açabilirsiniz.')}
                    </div>
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden">
                {/* Modules List */}
                <div className={`p-6 w-full ${reorderingModule ? 'lg:w-1/2 border-r' : 'max-w-4xl mx-auto'} overflow-y-auto transition-all`}>
                    <div className="mb-8 p-4 bg-blue-50 rounded-lg flex gap-2">
                        <input
                            className="input flex-1"
                            placeholder={t('new_module_placeholder')}
                            value={newModuleTitle}
                            onChange={(e) => setNewModuleTitle(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAddModule()}
                        />
                        <button className="btn btn-primary" onClick={handleAddModule}>{t('add_module_btn')}</button>
                    </div>

                    {loading ? <p className="text-center">{t('loading')}</p> : (
                        <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragEnd={handleDragEnd}
                        >
                            <SortableContext
                                items={modules.map(m => m.id)}
                                strategy={verticalListSortingStrategy}
                            >
                                {modules.map((module) => (
                                    <SortableModuleItem
                                        key={module.id}
                                        module={module}
                                        onEdit={handleEditModule}
                                        onDelete={handleDeleteModule}
                                        onReorderContents={openReorderContents}
                                    />
                                ))}
                            </SortableContext>
                        </DndContext>
                    )}
                </div>

                {/* Content Reorder Sidebar */}
                {reorderingModule && (
                    <div className="w-full lg:w-1/2 bg-gray-50 flex flex-col border-l shadow-2xl absolute inset-0 lg:static lg:inset-auto z-20">
                        <div className="p-4 bg-white border-b flex justify-between items-center">
                            <h3 className="font-bold text-lg">{t('reorder_contents')}: {reorderingModule.title}</h3>
                            <button className="btn btn-sm btn-circle btn-ghost" onClick={() => setReorderingModule(null)}>✕</button>
                        </div>
                        <div className="p-6 overflow-y-auto flex-1">
                            {contentsLoading ? (
                                <p>{t('loading')}</p>
                            ) : moduleContents.length > 0 ? (
                                <ContentReorderList
                                    items={moduleContents}
                                    onReorder={handleSaveContentOrder}
                                />
                            ) : (
                                <p className="text-gray-500 text-center mt-10">{t('no_content_in_module')}</p>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
