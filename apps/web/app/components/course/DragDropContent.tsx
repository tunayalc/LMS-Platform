'use client';

import React, { useState } from 'react';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
    DragStartEvent,
    DragOverlay,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Types
interface ContentItem {
    id: string;
    type: 'video' | 'pdf' | 'text' | 'quiz' | 'assignment' | 'scorm' | 'h5p' | 'live_class';
    title: string;
    description?: string;
    duration?: number;
}

interface ContentModule {
    id: string;
    title: string;
    items: ContentItem[];
    collapsed?: boolean;
}

interface DragDropContentProps {
    modules: ContentModule[];
    onChange: (modules: ContentModule[]) => void;
    onItemClick?: (item: ContentItem, moduleId: string) => void;
    onAddItem?: (moduleId: string) => void;
    onAddModule?: () => void;
    editable?: boolean;
}

// Icon mapping
const TYPE_ICONS: Record<string, string> = {
    video: '🎬',
    pdf: '📄',
    text: '📝',
    quiz: '❓',
    assignment: '📋',
    scorm: '📦',
    h5p: '🎮',
    live_class: '📹',
};

// Sortable Item Component
const SortableItem = ({
    item,
    moduleId,
    onItemClick,
    editable,
}: {
    item: ContentItem;
    moduleId: string;
    onItemClick?: (item: ContentItem, moduleId: string) => void;
    editable: boolean;
}) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: item.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`content-item ${isDragging ? 'dragging' : ''}`}
            onClick={() => onItemClick?.(item, moduleId)}
        >
            {editable && (
                <div className="drag-handle" {...attributes} {...listeners}>
                    ⋮⋮
                </div>
            )}
            <span className="item-icon">{TYPE_ICONS[item.type] || '📄'}</span>
            <div className="item-info">
                <span className="item-title">{item.title}</span>
                {item.description && (
                    <span className="item-description">{item.description}</span>
                )}
            </div>
            {item.duration && (
                <span className="item-duration">{item.duration} dk</span>
            )}
        </div>
    );
};

// Sortable Module Component
const SortableModule = ({
    module,
    onItemClick,
    onAddItem,
    editable,
    onToggleCollapse,
    onDeleteModule,
}: {
    module: ContentModule;
    onItemClick?: (item: ContentItem, moduleId: string) => void;
    onAddItem?: (moduleId: string) => void;
    editable: boolean;
    onToggleCollapse: (moduleId: string) => void;
    onDeleteModule?: (moduleId: string) => void;
}) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: module.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`content-module ${isDragging ? 'dragging' : ''} ${module.collapsed ? 'collapsed' : ''}`}
        >
            <div className="module-header">
                {editable && (
                    <div className="drag-handle" {...attributes} {...listeners}>
                        ⋮⋮
                    </div>
                )}
                <button
                    className="collapse-btn"
                    onClick={() => onToggleCollapse(module.id)}
                >
                    {module.collapsed ? '▶' : '▼'}
                </button>
                <span className="module-title">{module.title}</span>
                <span className="item-count">{module.items.length} öğe</span>
                {editable && onDeleteModule && (
                    <button
                        className="delete-btn"
                        onClick={() => onDeleteModule(module.id)}
                        title="Modülü Sil"
                    >
                        🗑️
                    </button>
                )}
            </div>

            {!module.collapsed && (
                <div className="module-content">
                    <SortableContext
                        items={module.items.map(i => i.id)}
                        strategy={verticalListSortingStrategy}
                    >
                        {module.items.map((item) => (
                            <SortableItem
                                key={item.id}
                                item={item}
                                moduleId={module.id}
                                onItemClick={onItemClick}
                                editable={editable}
                            />
                        ))}
                    </SortableContext>

                    {editable && onAddItem && (
                        <button
                            className="add-item-btn"
                            onClick={() => onAddItem(module.id)}
                        >
                            + İçerik Ekle
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};

// Main Drag-Drop Content Component
export function DragDropContent({
    modules,
    onChange,
    onItemClick,
    onAddItem,
    onAddModule,
    editable = true,
}: DragDropContentProps) {
    const [activeId, setActiveId] = useState<string | null>(null);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleDragStart = (event: DragStartEvent) => {
        setActiveId(event.active.id as string);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveId(null);

        if (!over || active.id === over.id) return;

        // Check if dragging a module or item
        const activeModule = modules.find(m => m.id === active.id);
        const overModule = modules.find(m => m.id === over.id);

        if (activeModule && overModule) {
            // Reordering modules
            const oldIndex = modules.findIndex(m => m.id === active.id);
            const newIndex = modules.findIndex(m => m.id === over.id);
            onChange(arrayMove(modules, oldIndex, newIndex));
        } else {
            // Reordering items within or across modules
            let sourceModuleIdx = -1;
            let sourceItemIdx = -1;
            let destModuleIdx = -1;
            let destItemIdx = -1;

            modules.forEach((module, mIdx) => {
                const activeIdx = module.items.findIndex(i => i.id === active.id);
                const overIdx = module.items.findIndex(i => i.id === over.id);

                if (activeIdx !== -1) {
                    sourceModuleIdx = mIdx;
                    sourceItemIdx = activeIdx;
                }
                if (overIdx !== -1) {
                    destModuleIdx = mIdx;
                    destItemIdx = overIdx;
                }
            });

            if (sourceModuleIdx !== -1 && destModuleIdx !== -1) {
                const newModules = [...modules];

                if (sourceModuleIdx === destModuleIdx) {
                    // Same module
                    newModules[sourceModuleIdx] = {
                        ...newModules[sourceModuleIdx],
                        items: arrayMove(
                            newModules[sourceModuleIdx].items,
                            sourceItemIdx,
                            destItemIdx
                        ),
                    };
                } else {
                    // Different modules
                    const [movedItem] = newModules[sourceModuleIdx].items.splice(sourceItemIdx, 1);
                    newModules[destModuleIdx].items.splice(destItemIdx, 0, movedItem);
                }

                onChange(newModules);
            }
        }
    };

    const handleToggleCollapse = (moduleId: string) => {
        onChange(
            modules.map(m =>
                m.id === moduleId ? { ...m, collapsed: !m.collapsed } : m
            )
        );
    };

    const handleDeleteModule = (moduleId: string) => {
        if (confirm('Bu modülü silmek istediğinizden emin misiniz?')) {
            onChange(modules.filter(m => m.id !== moduleId));
        }
    };

    return (
        <div className="drag-drop-content">
            <style jsx global>{`
                .drag-drop-content {
                    padding: 16px;
                }
                .content-module {
                    background: white;
                    border: 1px solid #e5e7eb;
                    border-radius: 8px;
                    margin-bottom: 12px;
                    overflow: hidden;
                }
                .content-module.dragging {
                    box-shadow: 0 8px 24px rgba(0,0,0,0.15);
                }
                .module-header {
                    display: flex;
                    align-items: center;
                    padding: 12px 16px;
                    background: #f9fafb;
                    border-bottom: 1px solid #e5e7eb;
                    gap: 8px;
                }
                .content-module.collapsed .module-header {
                    border-bottom: none;
                }
                .module-title {
                    flex: 1;
                    font-weight: 600;
                    color: #1f2937;
                }
                .item-count {
                    font-size: 12px;
                    color: #6b7280;
                    background: #e5e7eb;
                    padding: 2px 8px;
                    border-radius: 12px;
                }
                .collapse-btn {
                    background: none;
                    border: none;
                    cursor: pointer;
                    font-size: 12px;
                    color: #6b7280;
                    padding: 4px;
                }
                .delete-btn {
                    background: none;
                    border: none;
                    cursor: pointer;
                    font-size: 14px;
                    opacity: 0.5;
                    transition: opacity 0.2s;
                }
                .delete-btn:hover {
                    opacity: 1;
                }
                .module-content {
                    padding: 8px;
                }
                .content-item {
                    display: flex;
                    align-items: center;
                    padding: 12px;
                    background: white;
                    border: 1px solid #e5e7eb;
                    border-radius: 6px;
                    margin-bottom: 6px;
                    cursor: pointer;
                    transition: all 0.15s;
                    gap: 12px;
                }
                .content-item:hover {
                    background: #f9fafb;
                    border-color: #3b82f6;
                }
                .content-item.dragging {
                    border-style: dashed;
                    opacity: 0.5;
                }
                .drag-handle {
                    cursor: grab;
                    color: #9ca3af;
                    font-size: 16px;
                    user-select: none;
                }
                .drag-handle:active {
                    cursor: grabbing;
                }
                .item-icon {
                    font-size: 20px;
                }
                .item-info {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                }
                .item-title {
                    font-weight: 500;
                    color: #1f2937;
                }
                .item-description {
                    font-size: 12px;
                    color: #6b7280;
                    margin-top: 2px;
                }
                .item-duration {
                    font-size: 12px;
                    color: #6b7280;
                }
                .add-item-btn {
                    width: 100%;
                    padding: 10px;
                    background: #f3f4f6;
                    border: 2px dashed #d1d5db;
                    border-radius: 6px;
                    color: #6b7280;
                    cursor: pointer;
                    transition: all 0.15s;
                }
                .add-item-btn:hover {
                    background: #e5e7eb;
                    border-color: #3b82f6;
                    color: #3b82f6;
                }
                .add-module-btn {
                    width: 100%;
                    padding: 16px;
                    background: white;
                    border: 2px dashed #d1d5db;
                    border-radius: 8px;
                    color: #6b7280;
                    cursor: pointer;
                    font-size: 14px;
                    transition: all 0.15s;
                }
                .add-module-btn:hover {
                    background: #f9fafb;
                    border-color: #3b82f6;
                    color: #3b82f6;
                }
            `}</style>

            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
            >
                <div>
                    <SortableContext
                        items={modules.map(m => m.id)}
                        strategy={verticalListSortingStrategy}
                    >
                        {modules.map((module) => (
                            <SortableModule
                                key={module.id}
                                module={module}
                                onItemClick={onItemClick}
                                onAddItem={onAddItem}
                                editable={editable}
                                onToggleCollapse={handleToggleCollapse}
                                onDeleteModule={editable ? handleDeleteModule : undefined}
                            />
                        ))}
                    </SortableContext>
                </div>
            </DndContext>

            {editable && onAddModule && (
                <button className="add-module-btn" onClick={onAddModule}>
                    + Yeni Modül Ekle
                </button>
            )}
        </div>
    );
}

export default DragDropContent;
