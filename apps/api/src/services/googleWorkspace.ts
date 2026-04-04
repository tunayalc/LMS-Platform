/**
 * Google Workspace Integration
 * Google Drive and Calendar integration
 */

import { query } from '../db';

const API_BASE = 'https://www.googleapis.com';

interface GoogleCredentials {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
}

interface DriveFile {
    id: string;
    name: string;
    mimeType: string;
    size?: number;
    webViewLink?: string;
    downloadUrl?: string;
}

interface CalendarEvent {
    id: string;
    summary: string;
    description?: string;
    start: { dateTime?: string; date?: string };
    end: { dateTime?: string; date?: string };
    location?: string;
    attendees?: Array<{ email: string }>;
}

export const GoogleWorkspaceService = {
    /**
     * Get user's Google credentials from database
     */
    getCredentials: async (userId: string): Promise<GoogleCredentials | null> => {
        const result = await query(
            `SELECT access_token, refresh_token, expires_at 
             FROM oauth_tokens WHERE user_id = $1 AND provider = 'google'`,
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
     * Refresh access token if expired
     */
    refreshTokenIfNeeded: async (userId: string, credentials: GoogleCredentials): Promise<GoogleCredentials> => {
        if (Date.now() < credentials.expiresAt - 60000) {
            return credentials; // Still valid
        }

        const clientId = process.env.GOOGLE_CLIENT_ID;
        const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

        const response = await fetch('https://oauth2.googleapis.com/token', {
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
            refreshToken: credentials.refreshToken,
            expiresAt: Date.now() + data.expires_in * 1000,
        };

        // Save new token
        await query(
            `UPDATE oauth_tokens SET access_token = $1, expires_at = $2 
             WHERE user_id = $3 AND provider = 'google'`,
            [newCredentials.accessToken, new Date(newCredentials.expiresAt), userId]
        );

        return newCredentials;
    },

    // ==================== GOOGLE DRIVE ====================

    /**
     * List files in Drive
     */
    listDriveFiles: async (userId: string, folderId?: string, pageToken?: string): Promise<{
        files: DriveFile[];
        nextPageToken?: string;
    }> => {
        const credentials = await GoogleWorkspaceService.getCredentials(userId);
        if (!credentials) throw new Error('Google hesabı bağlı değil');

        const validCreds = await GoogleWorkspaceService.refreshTokenIfNeeded(userId, credentials);

        let query_param = "trashed=false";
        if (folderId) {
            query_param += ` and '${folderId}' in parents`;
        }

        const params = new URLSearchParams({
            q: query_param,
            fields: 'nextPageToken,files(id,name,mimeType,size,webViewLink)',
            pageSize: '50',
        });
        if (pageToken) params.set('pageToken', pageToken);

        const response = await fetch(`${API_BASE}/drive/v3/files?${params}`, {
            headers: { Authorization: `Bearer ${validCreds.accessToken}` },
        });

        if (!response.ok) throw new Error('Drive dosyaları alınamadı');

        const data = await response.json();
        return {
            files: data.files || [],
            nextPageToken: data.nextPageToken,
        };
    },

    /**
     * Upload file to Drive
     */
    uploadToDrive: async (userId: string, file: Buffer, filename: string, mimeType: string, folderId?: string): Promise<DriveFile> => {
        const credentials = await GoogleWorkspaceService.getCredentials(userId);
        if (!credentials) throw new Error('Google hesabı bağlı değil');

        const validCreds = await GoogleWorkspaceService.refreshTokenIfNeeded(userId, credentials);

        const metadata: any = { name: filename };
        if (folderId) metadata.parents = [folderId];

        // Multipart upload
        const boundary = '-------314159265358979323846';
        const body = Buffer.concat([
            Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`),
            Buffer.from(`--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
            file,
            Buffer.from(`\r\n--${boundary}--`),
        ]);

        const response = await fetch(`${API_BASE}/upload/drive/v3/files?uploadType=multipart`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${validCreds.accessToken}`,
                'Content-Type': `multipart/related; boundary=${boundary}`,
            },
            body,
        });

        if (!response.ok) throw new Error('Dosya yüklenemedi');

        return await response.json();
    },

    /**
     * Get shareable link
     */
    getShareableLink: async (userId: string, fileId: string): Promise<string> => {
        const credentials = await GoogleWorkspaceService.getCredentials(userId);
        if (!credentials) throw new Error('Google hesabı bağlı değil');

        const validCreds = await GoogleWorkspaceService.refreshTokenIfNeeded(userId, credentials);

        // Create permission
        await fetch(`${API_BASE}/drive/v3/files/${fileId}/permissions`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${validCreds.accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ type: 'anyone', role: 'reader' }),
        });

        // Get link
        const response = await fetch(`${API_BASE}/drive/v3/files/${fileId}?fields=webViewLink`, {
            headers: { Authorization: `Bearer ${validCreds.accessToken}` },
        });

        const data = await response.json();
        return data.webViewLink;
    },

    // ==================== GOOGLE CALENDAR ====================

    /**
     * List calendar events
     */
    listCalendarEvents: async (userId: string, timeMin?: Date, timeMax?: Date): Promise<CalendarEvent[]> => {
        const credentials = await GoogleWorkspaceService.getCredentials(userId);
        if (!credentials) throw new Error('Google hesabı bağlı değil');

        const validCreds = await GoogleWorkspaceService.refreshTokenIfNeeded(userId, credentials);

        const params = new URLSearchParams({
            maxResults: '50',
            orderBy: 'startTime',
            singleEvents: 'true',
        });

        if (timeMin) params.set('timeMin', timeMin.toISOString());
        if (timeMax) params.set('timeMax', timeMax.toISOString());

        const response = await fetch(`${API_BASE}/calendar/v3/calendars/primary/events?${params}`, {
            headers: { Authorization: `Bearer ${validCreds.accessToken}` },
        });

        if (!response.ok) throw new Error('Takvim etkinlikleri alınamadı');

        const data = await response.json();
        return data.items || [];
    },

    /**
     * Create calendar event
     */
    createCalendarEvent: async (userId: string, event: Omit<CalendarEvent, 'id'>): Promise<CalendarEvent> => {
        const credentials = await GoogleWorkspaceService.getCredentials(userId);
        if (!credentials) throw new Error('Google hesabı bağlı değil');

        const validCreds = await GoogleWorkspaceService.refreshTokenIfNeeded(userId, credentials);

        const response = await fetch(`${API_BASE}/calendar/v3/calendars/primary/events`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${validCreds.accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(event),
        });

        if (!response.ok) throw new Error('Etkinlik oluşturulamadı');

        return await response.json();
    },

    /**
     * Sync course deadlines to calendar
     */
    syncCourseDeadlines: async (userId: string, courseId: string): Promise<number> => {
        // Get course deadlines
        const deadlines = await query(
            `SELECT gi.name, gi.due_date, c.title as course_title
             FROM grade_items gi
             JOIN courses c ON gi.course_id = c.id
             WHERE gi.course_id = $1 AND gi.due_date IS NOT NULL AND gi.due_date > NOW()`,
            [courseId]
        );

        let synced = 0;
        for (const deadline of deadlines.rows) {
            try {
                await GoogleWorkspaceService.createCalendarEvent(userId, {
                    summary: `📚 ${deadline.name}`,
                    description: `Ders: ${deadline.course_title}`,
                    start: { dateTime: deadline.due_date },
                    end: { dateTime: new Date(new Date(deadline.due_date).getTime() + 3600000).toISOString() },
                });
                synced++;
            } catch (e) {
                console.error('Calendar sync error:', e);
            }
        }

        return synced;
    },
};

export default GoogleWorkspaceService;
