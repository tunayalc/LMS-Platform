'use client';

import React, { useRef, useEffect, useState } from 'react';
import * as faceapi from 'face-api.js';
import { useTranslation } from 'react-i18next';

interface ProctoringProps {
    examId: string;
    onViolation: (type: 'multiple_faces' | 'no_face' | 'unknown', message: string) => void;
}

export default function Proctoring({ examId, onViolation }: ProctoringProps) {
    const { t } = useTranslation();
    const videoRef = useRef<HTMLVideoElement>(null);
    const [modelsLoaded, setModelsLoaded] = useState(false);
    const [status, setStatus] = useState<'initializing' | 'active' | 'error'>('initializing');
    const [faceCount, setFaceCount] = useState(0);
    const [warning, setWarning] = useState<string | null>(null);

    useEffect(() => {
        const loadModels = async () => {
            const MODEL_URL = '/models';
            try {
                await Promise.all([
                    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
                    faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL)
                ]);
                setModelsLoaded(true);
            } catch (err) {
                console.error("Model yükleme hatası:", err);
                setStatus('error');
            }
        };
        loadModels();
    }, []);

    useEffect(() => {
        if (modelsLoaded) {
            startVideo();
        }
    }, [modelsLoaded]);

    const startVideo = () => {
        navigator.mediaDevices
            .getUserMedia({ video: { width: 320, height: 240 } })
            .then((stream) => {
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    setStatus('active');
                }
            })
            .catch((err) => {
                console.error("Webcam erişim hatası:", err);
                setStatus('error');
            });
    };

    useEffect(() => {
        if (status !== 'active') return;

        const interval = setInterval(async () => {
            if (videoRef.current) {
                const detections = await faceapi.detectAllFaces(
                    videoRef.current,
                    new faceapi.TinyFaceDetectorOptions()
                );

                const count = detections.length;
                setFaceCount(count);

                if (count === 0) {
                    setWarning(t("proctoring_warning_no_face"));
                    onViolation('no_face', t("proctoring_violation_no_face"));
                } else if (count > 1) {
                    setWarning(t("proctoring_warning_multiple_faces"));
                    onViolation('multiple_faces', t("proctoring_violation_multiple_faces"));
                } else {
                    setWarning(null);
                }
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [status, onViolation]);

    return (
        <div className="proctoring-widget" style={{
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            width: '200px',
            backgroundColor: 'var(--card)',
            borderRadius: '12px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            overflow: 'hidden',
            border: warning ? '3px solid #ef4444' : '1px solid var(--border)',
            zIndex: 9999
        }}>
            <div style={{ position: 'relative', height: '150px', backgroundColor: '#000' }}>
                <video
                    ref={videoRef}
                    autoPlay
                    muted
                    width="200"
                    height="150"
                    style={{ objectFit: 'cover', transform: 'scaleX(-1)' }} // Mirror effect
                />

                <div style={{
                    position: 'absolute',
                    top: '8px',
                    left: '8px',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    backgroundColor: 'rgba(0,0,0,0.6)',
                    color: 'white',
                    fontSize: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                }}>
                    <div style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        backgroundColor: status === 'active' ? '#22c55e' : '#ef4444'
                    }} />
                    {status === 'active' ? t("proctoring_status_active") : t("proctoring_status_connecting")}
                </div>
            </div>

            {warning && (
                <div style={{
                    padding: '8px',
                    backgroundColor: 'var(--danger-bg)',
                    color: 'var(--danger-ink)',
                    fontSize: '11px',
                    fontWeight: 600,
                    textAlign: 'center',
                    borderTop: '1px solid var(--border)'
                }}>
                    {warning}
                </div>
            )}

            {!warning && (
                <div style={{
                    padding: '8px',
                    backgroundColor: 'var(--bg)',
                    color: 'var(--ink-light)',
                    fontSize: '11px',
                    textAlign: 'center',
                    borderTop: '1px solid var(--border)'
                }}>
                    {t("proctoring_hint_stay_on_screen")}
                </div>
            )}
        </div>
    );
}
