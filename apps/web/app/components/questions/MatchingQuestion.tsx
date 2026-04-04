'use client';

import React, { useState } from 'react';

interface MatchingQuestionProps {
    leftItems: string[];
    rightItems: string[];
    value: Record<string, string>;
    onChange: (matches: Record<string, string>) => void;
    disabled?: boolean;
    showCorrect?: boolean;
    correctAnswer?: Record<string, string>;
}

export function MatchingQuestion({
    leftItems,
    rightItems,
    value = {},
    onChange,
    disabled = false,
    showCorrect = false,
    correctAnswer = {}
}: MatchingQuestionProps) {
    const [dragging, setDragging] = useState<string | null>(null);
    const [shuffledRight] = useState(() => [...rightItems].sort(() => Math.random() - 0.5));

    const handleMatch = (left: string, right: string) => {
        if (disabled) return;

        // Remove any existing match with this right item
        const newMatches = { ...value };
        for (const [k, v] of Object.entries(newMatches)) {
            if (v === right) delete newMatches[k];
        }

        newMatches[left] = right;
        onChange(newMatches);
    };

    const handleRemoveMatch = (left: string) => {
        if (disabled) return;
        const newMatches = { ...value };
        delete newMatches[left];
        onChange(newMatches);
    };

    const isCorrect = (left: string) => {
        if (!showCorrect) return null;
        const userAnswer = value[left];
        const correct = correctAnswer[left];
        return userAnswer === correct;
    };

    return (
        <div className="matching-question">
            <style jsx>{`
                .matching-question {
                    display: flex;
                    gap: 2rem;
                    padding: 1rem;
                }
                .column {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    gap: 0.5rem;
                }
                .column-header {
                    font-weight: 600;
                    padding: 0.5rem;
                    background: #f3f4f6;
                    border-radius: 6px;
                    text-align: center;
                }
                .item {
                    padding: 0.75rem 1rem;
                    background: white;
                    border: 2px solid #e5e7eb;
                    border-radius: 8px;
                    cursor: pointer;
                    transition: all 0.2s;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                }
                .item:hover:not(.disabled) {
                    border-color: #3b82f6;
                    background: #eff6ff;
                }
                .item.matched {
                    border-color: #3b82f6;
                    background: #dbeafe;
                }
                .item.correct {
                    border-color: #10b981;
                    background: #d1fae5;
                }
                .item.incorrect {
                    border-color: #ef4444;
                    background: #fee2e2;
                }
                .item.disabled {
                    cursor: not-allowed;
                    opacity: 0.7;
                }
                .item.dragging {
                    opacity: 0.5;
                }
                .item.used {
                    opacity: 0.5;
                }
                .match-indicator {
                    font-size: 0.75rem;
                    color: #6b7280;
                    margin-left: 0.5rem;
                }
                .remove-btn {
                    background: #ef4444;
                    color: white;
                    border: none;
                    border-radius: 50%;
                    width: 20px;
                    height: 20px;
                    cursor: pointer;
                    font-size: 12px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .connection-area {
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    gap: 0.25rem;
                }
                .connection-line {
                    width: 40px;
                    height: 2px;
                    background: #3b82f6;
                }
            `}</style>

            <div className="column">
                <div className="column-header">Sol</div>
                {leftItems.map((item, idx) => {
                    const matched = value[item];
                    const correct = isCorrect(item);

                    return (
                        <div
                            key={idx}
                            className={`item ${matched ? 'matched' : ''} ${disabled ? 'disabled' : ''} 
                                ${correct === true ? 'correct' : ''} ${correct === false ? 'incorrect' : ''}`}
                            onClick={() => {
                                if (matched) {
                                    handleRemoveMatch(item);
                                } else if (dragging) {
                                    handleMatch(item, dragging);
                                    setDragging(null);
                                }
                            }}
                        >
                            <span>{item}</span>
                            {matched && (
                                <span className="match-indicator">
                                    → {matched}
                                    {!disabled && (
                                        <button
                                            className="remove-btn"
                                            onClick={(e) => { e.stopPropagation(); handleRemoveMatch(item); }}
                                        >
                                            ×
                                        </button>
                                    )}
                                </span>
                            )}
                        </div>
                    );
                })}
            </div>

            <div className="column">
                <div className="column-header">Sağ</div>
                {shuffledRight.map((item, idx) => {
                    const isUsed = Object.values(value).includes(item);

                    return (
                        <div
                            key={idx}
                            className={`item ${isUsed ? 'used' : ''} ${dragging === item ? 'dragging' : ''} ${disabled ? 'disabled' : ''}`}
                            onClick={() => {
                                if (disabled) return;
                                if (dragging === item) {
                                    setDragging(null);
                                } else {
                                    setDragging(item);
                                }
                            }}
                        >
                            {item}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export default MatchingQuestion;
