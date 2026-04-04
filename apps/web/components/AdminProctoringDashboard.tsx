'use client';

import { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useTranslation } from 'react-i18next';

interface ProctoringSession {
    sessionId: string;
    examId: string;
    userId: string;
    username?: string;
    exam_title?: string;
    peerId?: string;
    status: 'waiting' | 'connected' | 'ended';
    startedAt: string;
}

interface Violation {
    sessionId: string;
    userId: string;
    type: string;
    description: string;
    timestamp: string;
}

interface AdminProctoringDashboardProps {
    apiBaseUrl: string;
    token: string;
}

export default function AdminProctoringDashboard({ apiBaseUrl, token }: AdminProctoringDashboardProps) {
    const { t } = useTranslation();
    const [sessions, setSessions] = useState<ProctoringSession[]>([]);
    const [violations, setViolations] = useState<Violation[]>([]);
    const [selectedSession, setSelectedSession] = useState<string | null>(null);
    const [connected, setConnected] = useState(false);

    const socketRef = useRef<Socket | null>(null);
    const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
    const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());

    useEffect(() => {
        // Connect to proctoring namespace
        const socket = io(`${apiBaseUrl}/proctoring`, {
            auth: { token }
        });

        socketRef.current = socket;

        socket.on('connect', () => {
            console.log('[Proctoring Admin] Connected');
            setConnected(true);
            socket.emit('admin-join');
        });

        socket.on('disconnect', () => {
            console.log('[Proctoring Admin] Disconnected');
            setConnected(false);
        });

        socket.on('active-sessions', (activeSessions: ProctoringSession[]) => {
            setSessions(activeSessions);
        });

        socket.on('student-joined', (data: ProctoringSession) => {
            setSessions(prev => [...prev.filter(s => s.sessionId !== data.sessionId), data]);
        });

        socket.on('student-disconnected', (data: { sessionId: string }) => {
            setSessions(prev => prev.filter(s => s.sessionId !== data.sessionId));
            // Close peer connection
            const pc = peerConnections.current.get(data.sessionId);
            if (pc) {
                pc.close();
                peerConnections.current.delete(data.sessionId);
            }
        });

        socket.on('session-ended', (data: { sessionId: string }) => {
            setSessions(prev => prev.filter(s => s.sessionId !== data.sessionId));
        });

        socket.on('violation-reported', (violation: Violation) => {
            setViolations(prev => [violation, ...prev].slice(0, 50));
        });

        // WebRTC signaling
        socket.on('offer', async (data: { offer: RTCSessionDescriptionInit; senderId: string; sessionId: string }) => {
            const { offer, senderId, sessionId } = data;

            const pc = new RTCPeerConnection({
                iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
            });

            peerConnections.current.set(sessionId, pc);

            pc.ontrack = (event) => {
                const videoEl = videoRefs.current.get(sessionId);
                if (videoEl && event.streams[0]) {
                    videoEl.srcObject = event.streams[0];
                }
            };

            pc.onicecandidate = (event) => {
                if (event.candidate) {
                    socket.emit('ice-candidate', {
                        targetId: senderId,
                        candidate: event.candidate
                    });
                }
            };

            await pc.setRemoteDescription(offer);
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            socket.emit('answer', {
                targetId: senderId,
                answer
            });
        });

        socket.on('ice-candidate', (data: { candidate: RTCIceCandidateInit; senderId: string }) => {
            // Find which session this belongs to
            peerConnections.current.forEach((pc) => {
                if (pc.remoteDescription) {
                    pc.addIceCandidate(new RTCIceCandidate(data.candidate));
                }
            });
        });

        return () => {
            socket.disconnect();
            peerConnections.current.forEach(pc => pc.close());
        };
    }, [apiBaseUrl, token]);

    const watchSession = (sessionId: string) => {
        setSelectedSession(sessionId);
        socketRef.current?.emit('watch-session', sessionId);
    };

    return (
        <div style={{ padding: '20px' }}>
            <h2 style={{ marginBottom: '20px' }}>
                🎥 {t("proctoring_dashboard_title")}
                <span style={{
                    marginLeft: '10px',
                    fontSize: '0.8rem',
                    color: connected ? '#22c55e' : '#ef4444'
                }}>
                    {connected ? `● ${t("status_connected")}` : `○ ${t("status_disconnected")}`}
                </span>
            </h2>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '20px' }}>
                {/* Main Video Grid */}
                <div>
                    <h3>{t("active_sessions")} ({sessions.length})</h3>

                    {sessions.length === 0 ? (
                        <p style={{ color: '#64748b' }}>{t("active_sessions_empty")}</p>
                    ) : (
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                            gap: '16px'
                        }}>
                            {sessions.map(session => (
                                <div
                                    key={session.sessionId}
                                    style={{
                                        border: selectedSession === session.sessionId ? '2px solid #3b82f6' : '1px solid #e2e8f0',
                                        borderRadius: '8px',
                                        padding: '12px',
                                        background: '#f8fafc'
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                        <span style={{ fontWeight: 600 }}>{session.username || session.userId}</span>
                                        <span style={{
                                            fontSize: '0.75rem',
                                            padding: '2px 8px',
                                            borderRadius: '12px',
                                            background: session.status === 'connected' ? '#dcfce7' : '#fef3c7',
                                            color: session.status === 'connected' ? '#166534' : '#92400e'
                                        }}>
                                            {session.status === 'connected' ? t("status_connected") : t("status_waiting")}
                                        </span>
                                    </div>

                                    <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '8px' }}>
                                        {session.exam_title || session.examId}
                                    </div>

                                    {/* Video Element */}
                                    <video
                                        ref={el => { if (el) videoRefs.current.set(session.sessionId, el); }}
                                        autoPlay
                                        playsInline
                                        muted
                                        style={{
                                            width: '100%',
                                            height: '200px',
                                            background: '#1e293b',
                                            borderRadius: '4px',
                                            objectFit: 'cover'
                                        }}
                                    />

                                    <button
                                        onClick={() => watchSession(session.sessionId)}
                                        style={{
                                            marginTop: '8px',
                                            width: '100%',
                                            padding: '8px',
                                            background: '#3b82f6',
                                            color: 'white',
                                            border: 'none',
                                            borderRadius: '4px',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        {t("watch_start")}
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Violations Panel */}
                <div style={{
                    background: '#fef2f2',
                    borderRadius: '8px',
                    padding: '16px',
                    maxHeight: '600px',
                    overflowY: 'auto'
                }}>
                    <h3 style={{ color: '#dc2626', marginBottom: '12px' }}>
                        ⚠️ {t("violations_title")} ({violations.length})
                    </h3>

                    {violations.length === 0 ? (
                        <p style={{ color: '#64748b', fontSize: '0.9rem' }}>{t("violations_empty")}</p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {violations.map((v, i) => (
                                <div
                                    key={i}
                                    style={{
                                        background: 'white',
                                        padding: '10px',
                                        borderRadius: '6px',
                                        borderLeft: '3px solid #ef4444'
                                    }}
                                >
                                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{v.type}</div>
                                    <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{v.description}</div>
                                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '4px' }}>
                                        {new Date(v.timestamp).toLocaleTimeString('tr-TR')}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
