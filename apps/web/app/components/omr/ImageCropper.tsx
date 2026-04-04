"use client";

import { useRef, useState, useEffect, useCallback } from "react";

type ImageCropperProps = {
    imageSrc: string;
    onCropComplete: (croppedBlob: Blob) => void;
    onCancel: () => void;
};

export default function ImageCropper({ imageSrc, onCropComplete, onCancel }: ImageCropperProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [corners, setCorners] = useState<{ x: number; y: number }[]>([]);
    const [imageEl, setImageEl] = useState<HTMLImageElement | null>(null);
    const [draggingIdx, setDraggingIdx] = useState<number | null>(null);

    // Load image
    useEffect(() => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
            setImageEl(img);
            // Initialize corners at image corners
            setCorners([
                { x: 50, y: 50 },
                { x: img.width - 50, y: 50 },
                { x: img.width - 50, y: img.height - 50 },
                { x: 50, y: img.height - 50 },
            ]);
        };
        img.src = imageSrc;
    }, [imageSrc]);

    // Draw canvas
    const drawCanvas = useCallback(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx || !imageEl) return;

        canvas.width = imageEl.width;
        canvas.height = imageEl.height;

        ctx.drawImage(imageEl, 0, 0);

        // Draw selection polygon
        if (corners.length === 4) {
            ctx.beginPath();
            ctx.moveTo(corners[0].x, corners[0].y);
            corners.forEach((c) => ctx.lineTo(c.x, c.y));
            ctx.closePath();
            ctx.strokeStyle = "#00ff00";
            ctx.lineWidth = 3;
            ctx.stroke();

            // Draw corner handles
            corners.forEach((c, i) => {
                ctx.beginPath();
                ctx.arc(c.x, c.y, 12, 0, Math.PI * 2);
                ctx.fillStyle = draggingIdx === i ? "#ff0000" : "#00ff00";
                ctx.fill();
                ctx.strokeStyle = "#fff";
                ctx.lineWidth = 2;
                ctx.stroke();
            });
        }
    }, [imageEl, corners, draggingIdx]);

    useEffect(() => {
        drawCanvas();
    }, [drawCanvas]);

    const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY,
        };
    };

    const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const { x, y } = getCanvasCoords(e);
        const hitIdx = corners.findIndex((c) => Math.hypot(c.x - x, c.y - y) < 20);
        if (hitIdx >= 0) setDraggingIdx(hitIdx);
    };

    const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (draggingIdx === null) return;
        const { x, y } = getCanvasCoords(e);
        setCorners((prev) => prev.map((c, i) => (i === draggingIdx ? { x, y } : c)));
    };

    const handleMouseUp = () => setDraggingIdx(null);

    const handleCrop = () => {
        if (!imageEl || corners.length !== 4) return;

        // Create a temporary canvas for perspective transform
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        // Calculate output dimensions from corner positions
        const width = Math.max(
            Math.hypot(corners[1].x - corners[0].x, corners[1].y - corners[0].y),
            Math.hypot(corners[2].x - corners[3].x, corners[2].y - corners[3].y)
        );
        const height = Math.max(
            Math.hypot(corners[3].x - corners[0].x, corners[3].y - corners[0].y),
            Math.hypot(corners[2].x - corners[1].x, corners[2].y - corners[1].y)
        );

        canvas.width = Math.round(width);
        canvas.height = Math.round(height);

        // Simple perspective transform approximation using quadrilateral mapping
        // For better results, a proper perspective transform library should be used
        // Here we use a simple affine approximation

        // Draw the cropped region
        ctx.drawImage(
            imageEl,
            corners[0].x, corners[0].y,
            corners[1].x - corners[0].x, corners[3].y - corners[0].y,
            0, 0, canvas.width, canvas.height
        );

        canvas.toBlob((blob) => {
            if (blob) onCropComplete(blob);
        }, "image/jpeg", 0.95);
    };

    return (
        <div style={{ position: "relative" }}>
            <p style={{ marginBottom: "8px", fontSize: "14px", color: "var(--ink-light)" }}>
                Köşeleri sürükleyerek form alanını seçin
            </p>
            <canvas
                ref={canvasRef}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                style={{
                    maxWidth: "100%",
                    height: "auto",
                    cursor: draggingIdx !== null ? "grabbing" : "grab",
                    border: "2px solid var(--border)",
                    borderRadius: "8px",
                }}
            />
            <div style={{ marginTop: "12px", display: "flex", gap: "8px" }}>
                <button className="btn" onClick={handleCrop}>
                    Kırp ve Uygula
                </button>
                <button className="btn btn-secondary" onClick={onCancel}>
                    İptal
                </button>
            </div>
        </div>
    );
}
