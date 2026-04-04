'use client';

import React, { useState } from 'react';

interface OrderingQuestionProps {
    items: string[];
    value: string[];
    onChange: (order: string[]) => void;
    disabled?: boolean;
    showCorrect?: boolean;
    correctAnswer?: string[];
}

export function OrderingQuestion({
    items,
    value = [],
    onChange,
    disabled = false,
    showCorrect = false,
    correctAnswer = []
}: OrderingQuestionProps) {
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

    // Initialize with shuffled items if no value
    const currentOrder = value.length > 0 ? value : items;

    const handleDragStart = (index: number) => {
        if (disabled) return;
        setDraggedIndex(index);
    };

    const handleDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        if (draggedIndex === null || draggedIndex === index || disabled) return;

        const newOrder = [...currentOrder];
        const draggedItem = newOrder[draggedIndex];
        newOrder.splice(draggedIndex, 1);
        newOrder.splice(index, 0, draggedItem);

        setDraggedIndex(index);
        onChange(newOrder);
    };

    const handleDragEnd = () => {
        setDraggedIndex(null);
    };

    const moveItem = (fromIndex: number, direction: 'up' | 'down') => {
        if (disabled) return;
        const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1;
        if (toIndex < 0 || toIndex >= currentOrder.length) return;

        const newOrder = [...currentOrder];
        [newOrder[fromIndex], newOrder[toIndex]] = [newOrder[toIndex], newOrder[fromIndex]];
        onChange(newOrder);
    };

    const isCorrectPosition = (index: number) => {
        if (!showCorrect || correctAnswer.length === 0) return null;
        return currentOrder[index] === correctAnswer[index];
    };

    return (
        <div className="ordering-question">
            <style jsx>{`
                .ordering-question {
                    display: flex;
                    flex-direction: column;
                    gap: 0.5rem;
                    padding: 1rem;
                }
                .order-item {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                    padding: 0.75rem 1rem;
                    background: white;
                    border: 2px solid #e5e7eb;
                    border-radius: 8px;
                    cursor: grab;
                    transition: all 0.2s;
                    user-select: none;
                }
                .order-item:hover:not(.disabled) {
                    border-color: #3b82f6;
                    background: #f8fafc;
                }
                .order-item.dragging {
                    opacity: 0.5;
                    border-style: dashed;
                }
                .order-item.correct {
                    border-color: #10b981;
                    background: #d1fae5;
                }
                .order-item.incorrect {
                    border-color: #ef4444;
                    background: #fee2e2;
                }
                .order-item.disabled {
                    cursor: not-allowed;
                }
                .order-number {
                    width: 28px;
                    height: 28px;
                    background: #3b82f6;
                    color: white;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-weight: 600;
                    font-size: 0.875rem;
                    flex-shrink: 0;
                }
                .order-content {
                    flex: 1;
                }
                .order-controls {
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                }
                .control-btn {
                    background: #e5e7eb;
                    border: none;
                    border-radius: 4px;
                    width: 24px;
                    height: 18px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 10px;
                    color: #374151;
                    transition: background 0.2s;
                }
                .control-btn:hover:not(:disabled) {
                    background: #3b82f6;
                    color: white;
                }
                .control-btn:disabled {
                    opacity: 0.3;
                    cursor: not-allowed;
                }
                .drag-handle {
                    color: #9ca3af;
                    cursor: grab;
                    font-size: 1.25rem;
                }
            `}</style>

            {currentOrder.map((item, index) => {
                const correct = isCorrectPosition(index);

                return (
                    <div
                        key={`${item}-${index}`}
                        className={`order-item 
                            ${draggedIndex === index ? 'dragging' : ''} 
                            ${disabled ? 'disabled' : ''}
                            ${correct === true ? 'correct' : ''}
                            ${correct === false ? 'incorrect' : ''}`}
                        draggable={!disabled}
                        onDragStart={() => handleDragStart(index)}
                        onDragOver={(e) => handleDragOver(e, index)}
                        onDragEnd={handleDragEnd}
                    >
                        <span className="drag-handle">⋮⋮</span>
                        <span className="order-number">{index + 1}</span>
                        <span className="order-content">{item}</span>
                        {!disabled && (
                            <div className="order-controls">
                                <button
                                    className="control-btn"
                                    onClick={() => moveItem(index, 'up')}
                                    disabled={index === 0}
                                    title="Yukarı taşı"
                                >
                                    ▲
                                </button>
                                <button
                                    className="control-btn"
                                    onClick={() => moveItem(index, 'down')}
                                    disabled={index === currentOrder.length - 1}
                                    title="Aşağı taşı"
                                >
                                    ▼
                                </button>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

export default OrderingQuestion;
