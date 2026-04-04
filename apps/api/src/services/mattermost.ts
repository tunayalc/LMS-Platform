/**
 * Mattermost Integration
 * Self-hosted messaging and notifications
 */

import { query } from '../db';

interface MattermostConfig {
    serverUrl: string;
    accessToken: string;
}

interface MattermostUser {
    id: string;
    username: string;
    email: string;
    first_name?: string;
    last_name?: string;
}

interface MattermostChannel {
    id: string;
    name: string;
    display_name: string;
    type: 'O' | 'P' | 'D' | 'G'; // Open, Private, Direct, Group
    team_id: string;
}

interface MattermostPost {
    id: string;
    channel_id: string;
    message: string;
    create_at: number;
    user_id: string;
}

export const MattermostService = {
    /**
     * Get Mattermost config from environment
     */
    getConfig: (): MattermostConfig & { webhookUrl?: string } => {
        const serverUrl = process.env.MATTERMOST_URL;
        const accessToken = process.env.MATTERMOST_TOKEN;
        // User might provide webhook url
        const webhookUrl = process.env.MATTERMOST_WEBHOOK_URL || (serverUrl?.includes('/hooks/') ? serverUrl : undefined);

        if (webhookUrl) {
            return { serverUrl: '', accessToken: '', webhookUrl };
        }

        if (!serverUrl || !accessToken) {
            throw new Error('Mattermost yapılandırması eksik (URL/Token veya Webhook gerekli)');
        }

        return { serverUrl: serverUrl.replace(/\/$/, ''), accessToken };
    },

    /**
     * Make authenticated API request
     */
    apiRequest: async <T>(endpoint: string, options: RequestInit = {}): Promise<T> => {
        const config = MattermostService.getConfig();

        // If strict API call and we only have webhook, fail gracefully or throw
        if (!config.serverUrl && config.webhookUrl) {
            throw new Error('Bu özellik için Webhook yeterli değil, Bot Token gerekir.');
        }

        const response = await fetch(`${config.serverUrl}/api/v4${endpoint}`, {
            ...options,
            headers: {
                Authorization: `Bearer ${config.accessToken}`,
                'Content-Type': 'application/json',
                ...options.headers,
            },
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Mattermost API hatası: ${error}`);
        }

        return response.json();
    },

    // ==================== USERS ====================

    /**
     * Get current user (bot)
     */
    getMe: async (): Promise<MattermostUser> => {
        return MattermostService.apiRequest<MattermostUser>('/users/me');
    },

    /**
     * Get user by email
     */
    getUserByEmail: async (email: string): Promise<MattermostUser | null> => {
        try {
            return await MattermostService.apiRequest<MattermostUser>(`/users/email/${email}`);
        } catch {
            return null;
        }
    },

    /**
     * Get user by ID
     */
    getUserById: async (userId: string): Promise<MattermostUser> => {
        return MattermostService.apiRequest<MattermostUser>(`/users/${userId}`);
    },

    // ==================== CHANNELS ====================

    /**
     * Get team channels
     */
    getTeamChannels: async (teamId: string): Promise<MattermostChannel[]> => {
        return MattermostService.apiRequest<MattermostChannel[]>(`/teams/${teamId}/channels`);
    },

    /**
     * Get channel by ID
     */
    getChannel: async (channelId: string): Promise<MattermostChannel> => {
        return MattermostService.apiRequest<MattermostChannel>(`/channels/${channelId}`);
    },

    /**
     * Create channel
     */
    createChannel: async (teamId: string, name: string, displayName: string, type: 'O' | 'P' = 'O'): Promise<MattermostChannel> => {
        return MattermostService.apiRequest<MattermostChannel>('/channels', {
            method: 'POST',
            body: JSON.stringify({ team_id: teamId, name, display_name: displayName, type }),
        });
    },

    /**
     * Add user to channel
     */
    addUserToChannel: async (channelId: string, userId: string): Promise<void> => {
        await MattermostService.apiRequest(`/channels/${channelId}/members`, {
            method: 'POST',
            body: JSON.stringify({ user_id: userId }),
        });
    },

    /**
     * Create direct message channel
     */
    createDirectChannel: async (userId1: string, userId2: string): Promise<MattermostChannel> => {
        return MattermostService.apiRequest<MattermostChannel>('/channels/direct', {
            method: 'POST',
            body: JSON.stringify([userId1, userId2]),
        });
    },

    // ==================== MESSAGING ====================

    /**
     * Send message to channel
     */
    sendMessage: async (channelId: string, message: string, props?: any): Promise<MattermostPost> => {
        const config = MattermostService.getConfig();

        // Webhook Mode
        if (config.webhookUrl) {
            const payload = {
                text: message,
                ...props,
                // Webhooks usually don't support 'channel_id' override unless admin allowed
                // We send generic payload
            };

            const response = await fetch(config.webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error('Mattermost Webhook failed');
            return { id: 'webhook-msg', user_id: 'bot', message, create_at: Date.now(), channel_id: channelId };
        }

        // API Mode
        return MattermostService.apiRequest<MattermostPost>('/posts', {
            method: 'POST',
            body: JSON.stringify({ channel_id: channelId, message, props }),
        });
    },

    /**
     * Send direct message to user
     */
    sendDirectMessage: async (toUserId: string, message: string): Promise<MattermostPost> => {
        const me = await MattermostService.getMe();
        const channel = await MattermostService.createDirectChannel(me.id, toUserId);
        return MattermostService.sendMessage(channel.id, message);
    },

    /**
     * Send formatted notification
     */
    sendNotification: async (
        channelId: string,
        title: string,
        text: string,
        color?: string,
        fields?: Array<{ title: string; value: string; short?: boolean }>
    ): Promise<MattermostPost> => {
        return MattermostService.sendMessage(channelId, '', {
            attachments: [
                {
                    fallback: `${title}: ${text}`,
                    color: color || '#3b82f6',
                    title,
                    text,
                    fields: fields?.map(f => ({
                        title: f.title,
                        value: f.value,
                        short: f.short ?? true,
                    })),
                },
            ],
        });
    },

    // ==================== LMS INTEGRATION ====================

    /**
     * Sync course to Mattermost channel
     */
    syncCourseChannel: async (courseId: string): Promise<string> => {
        const courseResult = await query('SELECT title, id FROM courses WHERE id = $1', [courseId]);
        if (courseResult.rows.length === 0) throw new Error('Kurs bulunamadı');

        const course = courseResult.rows[0];
        const teamId = process.env.MATTERMOST_TEAM_ID!;

        // Create or get channel
        const channelName = `course-${course.id.slice(0, 8)}`;
        let channel: MattermostChannel;

        try {
            channel = await MattermostService.apiRequest<MattermostChannel>(`/teams/${teamId}/channels/name/${channelName}`);
        } catch {
            channel = await MattermostService.createChannel(teamId, channelName, `📚 ${course.title}`);
        }

        // Send welcome message
        await MattermostService.sendNotification(
            channel.id,
            `${course.title} Kurs Kanalı`,
            'Bu kanal kurs duyuruları ve tartışmalar için kullanılmaktadır.',
            '#10b981'
        );

        // Save channel ID to course
        await query('UPDATE courses SET mattermost_channel_id = $1 WHERE id = $2', [channel.id, courseId]);

        return channel.id;
    },

    /**
     * Send course announcement
     */
    sendCourseAnnouncement: async (courseId: string, title: string, content: string): Promise<void> => {
        const result = await query('SELECT mattermost_channel_id FROM courses WHERE id = $1', [courseId]);
        const channelId = result.rows[0]?.mattermost_channel_id;

        if (!channelId) {
            throw new Error('Kurs Mattermost kanalına bağlı değil');
        }

        await MattermostService.sendNotification(channelId, `📢 ${title}`, content, '#f59e0b');
    },

    /**
     * Notify about new submission
     */
    notifyNewSubmission: async (courseId: string, studentName: string, assignmentName: string): Promise<void> => {
        const result = await query('SELECT mattermost_channel_id FROM courses WHERE id = $1', [courseId]);
        const channelId = result.rows[0]?.mattermost_channel_id;

        if (!channelId) return;

        await MattermostService.sendNotification(
            channelId,
            'Yeni Gönderim',
            `**${studentName}** "${assignmentName}" ödevini gönderdi.`,
            '#3b82f6',
            [
                { title: 'Öğrenci', value: studentName },
                { title: 'Ödev', value: assignmentName },
            ]
        );
    },
};

export default MattermostService;
