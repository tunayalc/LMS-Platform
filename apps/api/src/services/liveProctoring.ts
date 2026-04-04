/**
 * Live Proctoring WebRTC Service
 * Handles real-time video monitoring via WebRTC + Socket.IO signaling
 */

import { Server as SocketServer } from 'socket.io';
import { query } from '../db';

interface ProctoringSession {
    sessionId: string;
    examId: string;
    userId: string;
    peerId?: string;
    status: 'waiting' | 'connected' | 'ended';
    startedAt: Date;
}

const activeSessions = new Map<string, ProctoringSession>();
const adminWatchers = new Map<string, Set<string>>(); // sessionId -> Set of admin socket IDs

export const setupProctoringSocket = (io: SocketServer) => {
    const proctorNamespace = io.of('/proctoring');

    proctorNamespace.on('connection', (socket) => {
        console.log('[Proctoring] Client connected:', socket.id);

        // Student joins proctoring session
        socket.on('join-session', async (data: { sessionId: string; userId: string; examId: string }) => {
            const { sessionId, userId, examId } = data;

            // Store session
            activeSessions.set(sessionId, {
                sessionId,
                examId,
                userId,
                peerId: socket.id,
                status: 'connected',
                startedAt: new Date()
            });

            socket.join(`session:${sessionId}`);
            socket.data.sessionId = sessionId;
            socket.data.role = 'student';
            socket.data.userId = userId;

            // Notify admins
            proctorNamespace.to('proctoring-admins').emit('student-joined', {
                sessionId,
                userId,
                peerId: socket.id,
                examId
            });

            console.log(`[Proctoring] Student ${userId} joined session ${sessionId}`);
        });

        // Admin joins to watch sessions
        socket.on('admin-join', () => {
            socket.join('proctoring-admins');
            socket.data.role = 'admin';

            // Send current active sessions
            const sessions = Array.from(activeSessions.values());
            socket.emit('active-sessions', sessions);

            console.log('[Proctoring] Admin joined');
        });

        // Admin watches specific session
        socket.on('watch-session', (sessionId: string) => {
            socket.join(`session:${sessionId}`);

            if (!adminWatchers.has(sessionId)) {
                adminWatchers.set(sessionId, new Set());
            }
            adminWatchers.get(sessionId)!.add(socket.id);

            // Request WebRTC offer from student
            const session = activeSessions.get(sessionId);
            if (session?.peerId) {
                proctorNamespace.to(session.peerId).emit('offer-request', {
                    adminId: socket.id
                });
            }

            console.log(`[Proctoring] Admin watching session ${sessionId}`);
        });

        // WebRTC Signaling: Offer
        socket.on('offer', (data: { targetId: string; offer: RTCSessionDescriptionInit }) => {
            proctorNamespace.to(data.targetId).emit('offer', {
                offer: data.offer,
                senderId: socket.id,
                sessionId: socket.data.sessionId
            });
        });

        // WebRTC Signaling: Answer
        socket.on('answer', (data: { targetId: string; answer: RTCSessionDescriptionInit }) => {
            proctorNamespace.to(data.targetId).emit('answer', {
                answer: data.answer,
                senderId: socket.id
            });
        });

        // WebRTC Signaling: ICE Candidate
        socket.on('ice-candidate', (data: { targetId: string; candidate: RTCIceCandidateInit }) => {
            proctorNamespace.to(data.targetId).emit('ice-candidate', {
                candidate: data.candidate,
                senderId: socket.id
            });
        });

        // Report violation
        socket.on('violation', async (data: { sessionId: string; type: string; description: string; screenshot?: string }) => {
            const { sessionId, type, description, screenshot } = data;

            // Store in database
            await query(`
                INSERT INTO proctoring_violations (id, session_id, user_id, type, description, screenshot_url, created_at)
                VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW())
            `, [sessionId, socket.data.userId, type, description, screenshot]);

            // Notify admins
            proctorNamespace.to('proctoring-admins').emit('violation-reported', {
                sessionId,
                userId: socket.data.userId,
                type,
                description,
                timestamp: new Date().toISOString()
            });

            console.log(`[Proctoring] Violation reported: ${type} in session ${sessionId}`);
        });

        // End session
        socket.on('end-session', async () => {
            const sessionId = socket.data.sessionId;
            if (sessionId) {
                activeSessions.delete(sessionId);
                adminWatchers.delete(sessionId);

                await query(`
                    UPDATE proctoring_sessions SET status = 'completed', ended_at = NOW() WHERE id = $1
                `, [sessionId]);

                proctorNamespace.to('proctoring-admins').emit('session-ended', { sessionId });
                socket.leave(`session:${sessionId}`);

                console.log(`[Proctoring] Session ended: ${sessionId}`);
            }
        });

        // Handle disconnect
        socket.on('disconnect', () => {
            const sessionId = socket.data.sessionId;

            if (socket.data.role === 'student' && sessionId) {
                const session = activeSessions.get(sessionId);
                if (session) {
                    session.status = 'ended';
                    activeSessions.set(sessionId, session);
                }

                proctorNamespace.to('proctoring-admins').emit('student-disconnected', {
                    sessionId,
                    userId: socket.data.userId
                });
            }

            // Remove admin from watchers
            if (socket.data.role === 'admin') {
                adminWatchers.forEach((watchers, sessId) => {
                    watchers.delete(socket.id);
                });
            }

            console.log('[Proctoring] Client disconnected:', socket.id);
        });
    });

    return proctorNamespace;
};

export const getProctoringStats = async () => {
    const activeCount = activeSessions.size;
    const { rows: violations } = await query(`
        SELECT type, COUNT(*) as count FROM proctoring_violations
        WHERE created_at > NOW() - INTERVAL '24 hours'
        GROUP BY type
    `);

    return {
        activeSessions: activeCount,
        recentViolations: violations
    };
};

export default { setupProctoringSocket, getProctoringStats };
