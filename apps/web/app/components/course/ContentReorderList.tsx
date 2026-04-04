import React from 'react';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ContentItem } from '@lms/shared';

interface ContentReorderListProps {
    items: ContentItem[];
    onReorder: (newItems: ContentItem[]) => void | Promise<void>;
}

function SortableItem({ id, item }: { id: string, item: ContentItem }) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
    } = useSortable({ id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    return (
        <div ref={setNodeRef} style={style} className="flex items-center gap-3 p-3 bg-white border rounded-md mb-2 shadow-sm select-none">
            <div {...attributes} {...listeners} className="cursor-grab text-gray-400 hover:text-gray-600 p-1">
                ☰
            </div>
            <div className="flex-1">
                <div className="font-medium text-sm">{item.title}</div>
                <div className="text-xs text-gray-500 uppercase">{item.type}</div>
            </div>
        </div>
    );
}

export default function ContentReorderList({ items, onReorder }: ContentReorderListProps) {
    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        if (over && active.id !== over.id) {
            const oldIndex = items.findIndex((item) => item.id === active.id);
            const newIndex = items.findIndex((item) => item.id === over.id);
            onReorder(arrayMove(items, oldIndex, newIndex));
        }
    };

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
        >
            <SortableContext
                items={items.map(i => i.id)}
                strategy={verticalListSortingStrategy}
            >
                <div className="bg-gray-50 p-4 rounded-lg">
                    {items.map((item) => (
                        <SortableItem key={item.id} id={item.id} item={item} />
                    ))}
                </div>
            </SortableContext>
        </DndContext>
    );
}
