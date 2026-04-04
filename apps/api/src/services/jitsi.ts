
/**
 * Jitsi Meet Integration Service (8x8 JaaS Compatible)
 * Manages video conference rooms with RS256 JWT tokens.
 */

import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

interface JitsiConfig {
    domain: string;
    appId: string;
    privateKeyPath: string;
}

export const JitsiService = {
    getConfig: (): JitsiConfig => ({
        domain: process.env.JITSI_DOMAIN || '8x8.vc',
        appId: process.env.JITSI_APP_ID || '',
        privateKeyPath: process.env.JITSI_PRIVATE_KEY_PATH || ''
    }),

    /**
     * Generate a secure meeting URL with RS256 JWT token (8x8 JaaS compatible)
     */
    generateMeetingUrl: (roomName: string, user: { name: string; email: string; avatar?: string; moderator: boolean }) => {
        const config = JitsiService.getConfig();
        const safeRoomName = roomName.replace(/[^a-zA-Z0-9-_]/g, '');

        // If no private key configured, use public Jitsi
        if (!config.appId || !config.privateKeyPath) {
            const fallbackDomain = 'meet.jit.si';
            return `https://${fallbackDomain}/${safeRoomName}`;
        }

        try {
            // Read private key
            const privateKeyFullPath = path.resolve(process.cwd(), config.privateKeyPath);
            const privateKey = fs.readFileSync(privateKeyFullPath, 'utf8');

            // Generate unique key ID
            const kid = `${config.appId}/generated-kid`;

            // JaaS JWT payload
            const payload = {
                iss: 'chat',
                aud: 'jitsi',
                sub: config.appId,
                room: '*', // Allow all rooms
                context: {
                    user: {
                        id: crypto.randomUUID(),
                        name: user.name,
                        email: user.email,
                        avatar: user.avatar || '',
                        moderator: user.moderator ? 'true' : 'false'
                    },
                    features: {
                        livestreaming: 'true',
                        recording: 'true',
                        transcription: 'true',
                        'outbound-call': 'true'
                    }
                }
            };

            // Sign with RS256
            const token = jwt.sign(payload, privateKey, {
                algorithm: 'RS256',
                expiresIn: '2h',
                header: {
                    alg: 'RS256',
                    typ: 'JWT',
                    kid: kid
                }
            });

            // JaaS URL format: https://8x8.vc/{appId}/{roomName}?jwt={token}
            return `https://${config.domain}/${config.appId}/${safeRoomName}?jwt=${token}`;
        } catch (error) {
            console.error('Jitsi JWT Error:', error);
            // Fallback to public
            return `https://meet.jit.si/${safeRoomName}`;
        }
    }
};
