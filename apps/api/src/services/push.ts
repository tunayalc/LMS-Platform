/**
 * Push Notification Service
 * Supports Expo Push Notifications and can be extended for FCM/APNS
 */

interface PushMessage {
    to: string | string[]; // Expo push token(s)
    title?: string;
    body: string;
    data?: Record<string, any>;
    sound?: 'default' | null;
    badge?: number;
    priority?: 'default' | 'normal' | 'high';
    channelId?: string;
}

interface PushTicket {
    id?: string;
    status: 'ok' | 'error';
    message?: string;
    details?: { error?: string };
}

interface PushReceipt {
    status: 'ok' | 'error';
    message?: string;
    details?: { error?: string };
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';

export class PushNotificationService {
    /**
     * Send push notification via Expo Push API
     * For production, you might want to use FCM/APNS directly
     */
    static async sendPushNotification(message: PushMessage): Promise<PushTicket[]> {
        const messages = Array.isArray(message.to)
            ? message.to.map((token) => ({ ...message, to: token }))
            : [message];

        try {
            const response = await fetch(EXPO_PUSH_URL, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Accept-Encoding': 'gzip, deflate',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(messages),
            });

            const result = await response.json() as { data: PushTicket[] };
            console.log(`[PushService] Sent ${messages.length} messages. Result:`, JSON.stringify(result));
            return result.data || [];
        } catch (error) {
            console.error('[PushService] Send failed:', error);
            return [{ status: 'error', message: String(error) }];
        }
    }

    /**
     * Get push notification receipts to check delivery status
     */
    static async getPushReceipts(ticketIds: string[]): Promise<Record<string, PushReceipt>> {
        try {
            const response = await fetch(EXPO_RECEIPTS_URL, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ ids: ticketIds }),
            });

            const result = await response.json() as { data: Record<string, PushReceipt> };
            return result.data || {};
        } catch (error) {
            console.error('[PushService] Get receipts failed:', error);
            return {};
        }
    }

    /**
     * Send notification to multiple users by their stored push tokens
     */
    static async notifyUsers(
        tokens: string[],
        notification: { title: string; body: string; data?: Record<string, any> }
    ): Promise<{ success: number; failed: number }> {
        if (!tokens.length) {
            return { success: 0, failed: 0 };
        }

        const validTokens = tokens.filter((t) => t && t.startsWith('ExponentPushToken'));

        if (!validTokens.length) {
            return { success: 0, failed: tokens.length };
        }

        const tickets = await this.sendPushNotification({
            to: validTokens,
            title: notification.title,
            body: notification.body,
            data: notification.data,
            sound: 'default',
            priority: 'high',
        });

        const success = tickets.filter((t) => t.status === 'ok').length;
        const failed = tickets.filter((t) => t.status === 'error').length;

        return { success, failed };
    }

    /**
     * Predefined notification types for common events
     */
    static async sendExamReminder(tokens: string[], examTitle: string, minutesLeft: number) {
        return this.notifyUsers(tokens, {
            title: '⏰ Sınav Hatırlatması',
            body: `"${examTitle}" sınavına ${minutesLeft} dakika kaldı!`,
            data: { type: 'exam_reminder', examTitle },
        });
    }

    static async sendGradeNotification(tokens: string[], examTitle: string, score: number) {
        return this.notifyUsers(tokens, {
            title: '📊 Not Açıklandı',
            body: `"${examTitle}" sınavından ${score} puan aldınız.`,
            data: { type: 'grade_published', examTitle, score },
        });
    }

    static async sendNewContentNotification(tokens: string[], courseTitle: string, contentTitle: string) {
        return this.notifyUsers(tokens, {
            title: '📚 Yeni İçerik',
            body: `"${courseTitle}" dersine "${contentTitle}" eklendi.`,
            data: { type: 'new_content', courseTitle, contentTitle },
        });
    }

    static async sendAnnouncementNotification(tokens: string[], message: string) {
        return this.notifyUsers(tokens, {
            title: '📢 Duyuru',
            body: message,
            data: { type: 'announcement' },
        });
    }
}
