'use client';

import React, { useState, useRef } from 'react';

interface Region {
    id: string;
    type: 'circle' | 'rectangle' | 'polygon';
    x?: number;
    y?: number;
    radius?: number;
    width?: number;
    height?: number;
    points?: Array<{ x: number; y: number }>;
}

interface HotspotQuestionProps {
    imageUrl: string;
    regions?: Region[];
    value: { x: number; y: number } | null;
    onChange: (point: { x: number; y: number }) => void;
    disabled?: boolean;
    showCorrect?: boolean;
    correctRegionId?: string;
}

export function HotspotQuestion({
    imageUrl,
    regions = [],
    value = null,
    onChange,
    disabled = false,
    showCorrect = false,
    correctRegionId
}: HotspotQuestionProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [hoveredRegion, setHoveredRegion] = useState<string | null>(null);

    const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (disabled) return;

        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;

        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        onChange({ x: Math.round(x), y: Math.round(y) });
    };

    const isPointInRegion = (point: { x: number; y: number }, region: Region): boolean => {
        switch (region.type) {
            case 'circle':
                const dx = point.x - (region.x || 0);
                const dy = point.y - (region.y || 0);
                return Math.sqrt(dx * dx + dy * dy) <= (region.radius || 0);
            case 'rectangle':
                return point.x >= (region.x || 0) &&
                    point.x <= (region.x || 0) + (region.width || 0) &&
                    point.y >= (region.y || 0) &&
                    point.y <= (region.y || 0) + (region.height || 0);
            default:
                return false;
        }
    };

    const getClickedRegion = (): string | null => {
        if (!value) return null;
        for (const region of regions) {
            if (isPointInRegion(value, region)) {
                return region.id;
            }
        }
        return null;
    };

    const clickedRegion = getClickedRegion();
    const isCorrect = showCorrect && clickedRegion === correctRegionId;
    const isIncorrect = showCorrect && clickedRegion !== correctRegionId && value !== null;

    return (
        <div className="hotspot-question">
            <style jsx>{`
                .hotspot-question {
                    position: relative;
                    display: inline-block;
                    max-width: 100%;
                }
                .hotspot-container {
                    position: relative;
                    display: inline-block;
                    cursor: ${disabled ? 'not-allowed' : 'crosshair'};
                    border: 2px solid #e5e7eb;
                    border-radius: 8px;
                    overflow: hidden;
                }
                .hotspot-container.correct {
                    border-color: #10b981;
                }
                .hotspot-container.incorrect {
                    border-color: #ef4444;
                }
                .hotspot-image {
                    display: block;
                    max-width: 100%;
                    height: auto;
                }
                .click-marker {
                    position: absolute;
                    width: 20px;
                    height: 20px;
                    background: #3b82f6;
                    border: 3px solid white;
                    border-radius: 50%;
                    transform: translate(-50%, -50%);
                    box-shadow: 0 2px 4px rgba(0,0,0,0.3);
                    pointer-events: none;
                    z-index: 10;
                }
                .click-marker.correct {
                    background: #10b981;
                }
                .click-marker.incorrect {
                    background: #ef4444;
                }
                .region-overlay {
                    position: absolute;
                    pointer-events: none;
                    opacity: 0;
                    transition: opacity 0.2s;
                }
                .region-overlay.visible {
                    opacity: 0.3;
                }
                .region-overlay.correct-region {
                    opacity: 0.4;
                    background: #10b981 !important;
                }
                .instructions {
                    margin-top: 0.75rem;
                    font-size: 0.875rem;
                    color: #6b7280;
                }
                .feedback {
                    margin-top: 0.5rem;
                    padding: 0.5rem 1rem;
                    border-radius: 6px;
                    font-size: 0.875rem;
                }
                .feedback.correct {
                    background: #d1fae5;
                    color: #065f46;
                }
                .feedback.incorrect {
                    background: #fee2e2;
                    color: #991b1b;
                }
            `}</style>

            <div
                ref={containerRef}
                className={`hotspot-container ${isCorrect ? 'correct' : ''} ${isIncorrect ? 'incorrect' : ''}`}
                onClick={handleClick}
            >
                <img src={imageUrl} alt="Hotspot image" className="hotspot-image" />

                {/* Show regions in debug/correct mode */}
                {showCorrect && regions.map(region => (
                    <div
                        key={region.id}
                        className={`region-overlay ${region.id === correctRegionId ? 'correct-region visible' : ''}`}
                        style={{
                            left: region.type === 'circle' ? (region.x || 0) - (region.radius || 0) : region.x,
                            top: region.type === 'circle' ? (region.y || 0) - (region.radius || 0) : region.y,
                            width: region.type === 'circle' ? (region.radius || 0) * 2 : region.width,
                            height: region.type === 'circle' ? (region.radius || 0) * 2 : region.height,
                            borderRadius: region.type === 'circle' ? '50%' : '4px',
                            background: region.id === correctRegionId ? '#10b981' : '#3b82f6'
                        }}
                    />
                ))}

                {/* User click marker */}
                {value && (
                    <div
                        className={`click-marker ${isCorrect ? 'correct' : ''} ${isIncorrect ? 'incorrect' : ''}`}
                        style={{ left: value.x, top: value.y }}
                    />
                )}
            </div>

            {!disabled && (
                <p className="instructions">
                    💡 Resim üzerinde doğru noktaya tıklayın
                </p>
            )}

            {showCorrect && value && (
                <div className={`feedback ${isCorrect ? 'correct' : 'incorrect'}`}>
                    {isCorrect ? '✓ Doğru bölge!' : '✗ Yanlış bölge'}
                </div>
            )}
        </div>
    );
}

export default HotspotQuestion;
