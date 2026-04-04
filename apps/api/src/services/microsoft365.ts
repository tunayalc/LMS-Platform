/**
 * Microsoft 365 Integration
 * Teams and OneDrive integration
 */

import { query } from '../db';

const GRAPH_API = 'https://graph.microsoft.com/v1.0';
const isMicrosoftMock = () => {
    const mode = (process.env.MICROSOFT_MODE || '').toLowerCase();
    return mode === 'mock' || process.env.MICROSOFT_MOCK === 'true';
};
const buildMockId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
const buildMockDate = () => new Date().toISOString();

interface MicrosoftCredentials {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
}

interface OneDriveItem {
    id: string;
    name: string;
    size?: number;
    webUrl?: string;
    folder?: { childCount: number };
    file?: { mimeType: string };
}

interface TeamsMessage {
    id: string;
    body: { content: string };
    from: { user: { displayName: string } };
    createdDateTime: string;
}

export const Microsoft365Service = {
    /**
     * Get user's Microsoft credentials
     */
    getCredentials: async (userId: string): Promise<MicrosoftCredentials | null> => {
        if (isMicrosoftMock()) {
            return {
                accessToken: 'mock-access',
                refreshToken: 'mock-refresh',
                expiresAt: Date.now() + 60 * 60 * 1000,
            };
        }
        const result = await query(
            `SELECT access_token, refresh_token, expires_at 
             FROM oauth_tokens WHERE user_id = $1 AND provider = 'microsoft'`,
            [userId]
        );
        if (result.rows.length === 0) return null;

        const row = result.rows[0];
        return {
            accessToken: row.access_token,
            refreshToken: row.refresh_token,
            expiresAt: new Date(row.expires_at).getTime(),
        };
    },

    /**
     * Refresh token if needed
     */
    refreshTokenIfNeeded: async (userId: string, credentials: MicrosoftCredentials): Promise<MicrosoftCredentials> => {
        if (isMicrosoftMock()) {
            return credentials;
        }
        if (Date.now() < credentials.expiresAt - 60000) {
            return credentials;
        }

        const clientId = process.env.MICROSOFT_CLIENT_ID;
        const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;

        const response = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: clientId!,
                client_secret: clientSecret!,
                refresh_token: credentials.refreshToken,
                grant_type: 'refresh_token',
            }),
        });

        const data = await response.json();

        const newCredentials = {
            accessToken: data.access_token,
            refreshToken: data.refresh_token || credentials.refreshToken,
            expiresAt: Date.now() + data.expires_in * 1000,
        };

        await query(
            `UPDATE oauth_tokens SET access_token = $1, refresh_token = $2, expires_at = $3 
             WHERE user_id = $4 AND provider = 'microsoft'`,
            [newCredentials.accessToken, newCredentials.refreshToken, new Date(newCredentials.expiresAt), userId]
        );

        return newCredentials;
    },

    // ==================== ONEDRIVE ====================

    /**
     * List OneDrive files
     */
    listOneDriveFiles: async (userId: string, folderId?: string): Promise<OneDriveItem[]> => {
        if (isMicrosoftMock()) {
            return [
                { id: 'mock-folder-1', name: 'Course Assets', folder: { childCount: 2 } },
                {
                    id: 'mock-file-1',
                    name: 'intro.pdf',
                    size: 234000,
                    webUrl: 'https://onedrive.mock/intro.pdf',
                    file: { mimeType: 'application/pdf' },
                },
                {
                    id: 'mock-file-2',
                    name: 'lesson.mp4',
                    size: 1230000,
                    webUrl: 'https://onedrive.mock/lesson.mp4',
                    file: { mimeType: 'video/mp4' },
                },
            ];
        }
        const credentials = await Microsoft365Service.getCredentials(userId);
        if (!credentials) throw new Error('Microsoft hesabı bağlı değil');

        const validCreds = await Microsoft365Service.refreshTokenIfNeeded(userId, credentials);

        const endpoint = folderId
            ? `${GRAPH_API}/me/drive/items/${folderId}/children`
            : `${GRAPH_API}/me/drive/root/children`;

        const response = await fetch(endpoint, {
            headers: { Authorization: `Bearer ${validCreds.accessToken}` },
        });

        if (!response.ok) throw new Error('OneDrive dosyaları alınamadı');

        const data = await response.json();
        return data.value || [];
    },

    /**
     * Upload file to OneDrive
     */
    uploadToOneDrive: async (userId: string, file: Buffer, filename: string, folderId?: string): Promise<OneDriveItem> => {
        if (isMicrosoftMock()) {
            return {
                id: buildMockId('mock-upload'),
                name: filename,
                size: file.length,
                webUrl: `https://onedrive.mock/${encodeURIComponent(filename)}`,
                file: { mimeType: 'application/octet-stream' },
            };
        }
        const credentials = await Microsoft365Service.getCredentials(userId);
        if (!credentials) throw new Error('Microsoft hesabı bağlı değil');

        const validCreds = await Microsoft365Service.refreshTokenIfNeeded(userId, credentials);

        const endpoint = folderId
            ? `${GRAPH_API}/me/drive/items/${folderId}:/${filename}:/content`
            : `${GRAPH_API}/me/drive/root:/${filename}:/content`;

        const response = await fetch(endpoint, {
            method: 'PUT',
            headers: {
                Authorization: `Bearer ${validCreds.accessToken}`,
                'Content-Type': 'application/octet-stream',
            },
            body: new Uint8Array(file),
        });

        if (!response.ok) throw new Error('Dosya yüklenemedi');

        return await response.json();
    },

    /**
     * Get shareable link
     */
    getOneDriveShareLink: async (userId: string, itemId: string): Promise<string> => {
        if (isMicrosoftMock()) {
            return `https://onedrive.mock/share/${encodeURIComponent(itemId)}`;
        }
        const credentials = await Microsoft365Service.getCredentials(userId);
        if (!credentials) throw new Error('Microsoft hesabı bağlı değil');

        const validCreds = await Microsoft365Service.refreshTokenIfNeeded(userId, credentials);

        const response = await fetch(`${GRAPH_API}/me/drive/items/${itemId}/createLink`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${validCreds.accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ type: 'view', scope: 'anonymous' }),
        });

        if (!response.ok) throw new Error('Paylaşım linki oluşturulamadı');

        const data = await response.json();
        return data.link.webUrl;
    },

    // ==================== TEAMS ====================

    /**
     * List Teams
     */
    listTeams: async (userId: string): Promise<any[]> => {
        if (isMicrosoftMock()) {
            return [
                { id: 'mock-team-1', displayName: 'Mock Team', description: 'Sample Team (mock)' },
            ];
        }
        const credentials = await Microsoft365Service.getCredentials(userId);
        if (!credentials) throw new Error('Microsoft hesabı bağlı değil');

        const validCreds = await Microsoft365Service.refreshTokenIfNeeded(userId, credentials);

        const response = await fetch(`${GRAPH_API}/me/joinedTeams`, {
            headers: { Authorization: `Bearer ${validCreds.accessToken}` },
        });

        if (!response.ok) throw new Error('Teams listesi alınamadı');

        const data = await response.json();
        return data.value || [];
    },

    /**
     * List channels in team
     */
    listChannels: async (userId: string, teamId: string): Promise<any[]> => {
        if (isMicrosoftMock()) {
            return [
                { id: 'mock-channel-1', displayName: 'General', description: 'Mock General Channel' },
                { id: 'mock-channel-2', displayName: 'Announcements', description: 'Mock Announcements' },
            ];
        }
        const credentials = await Microsoft365Service.getCredentials(userId);
        if (!credentials) throw new Error('Microsoft hesabı bağlı değil');

        const validCreds = await Microsoft365Service.refreshTokenIfNeeded(userId, credentials);

        const response = await fetch(`${GRAPH_API}/teams/${teamId}/channels`, {
            headers: { Authorization: `Bearer ${validCreds.accessToken}` },
        });

        if (!response.ok) throw new Error('Kanallar alınamadı');

        const data = await response.json();
        return data.value || [];
    },

    /**
     * Send message to channel
     */
    sendChannelMessage: async (userId: string, teamId: string, channelId: string, content: string): Promise<TeamsMessage> => {
        if (isMicrosoftMock()) {
            return {
                id: buildMockId('mock-msg'),
                body: { content },
                from: { user: { displayName: 'Mock Bot' } },
                createdDateTime: buildMockDate(),
            };
        }
        const credentials = await Microsoft365Service.getCredentials(userId);
        if (!credentials) throw new Error('Microsoft hesabı bağlı değil');

        const validCreds = await Microsoft365Service.refreshTokenIfNeeded(userId, credentials);

        const response = await fetch(`${GRAPH_API}/teams/${teamId}/channels/${channelId}/messages`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${validCreds.accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ body: { content } }),
        });

        if (!response.ok) throw new Error('Mesaj gönderilemedi');

        return await response.json();
    },

    /**
     * Create online meeting
     */
    createMeeting: async (userId: string, subject: string, startTime: Date, endTime: Date, attendees?: string[]): Promise<any> => {
        if (isMicrosoftMock()) {
            return {
                id: buildMockId('mock-meeting'),
                subject,
                startDateTime: startTime.toISOString(),
                endDateTime: endTime.toISOString(),
                joinUrl: `https://teams.mock/meet/${buildMockId('room')}`,
                attendees: attendees ?? [],
            };
        }
        const credentials = await Microsoft365Service.getCredentials(userId);
        if (!credentials) throw new Error('Microsoft hesabı bağlı değil');

        const validCreds = await Microsoft365Service.refreshTokenIfNeeded(userId, credentials);

        const response = await fetch(`${GRAPH_API}/me/onlineMeetings`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${validCreds.accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                subject,
                startDateTime: startTime.toISOString(),
                endDateTime: endTime.toISOString(),
                participants: attendees ? {
                    attendees: attendees.map(email => ({
                        upn: email,
                        role: 'attendee',
                    })),
                } : undefined,
            }),
        });

        if (!response.ok) throw new Error('Toplantı oluşturulamadı');

        return await response.json();
    },
};

export default Microsoft365Service;
