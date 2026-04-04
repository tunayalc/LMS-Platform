/**
 * Live Class Service
 * Integrates with Jitsi Meet and BigBlueButton for video conferencing
 */

interface JitsiRoomConfig {
    roomName: string;
    subject?: string;
    userDisplayName: string;
    userEmail?: string;
    isHost?: boolean;
    password?: string;
}

interface BBBRoomConfig {
    meetingName: string;
    moderatorPassword: string;
    attendeePassword: string;
    welcomeMessage?: string;
    maxParticipants?: number;
    duration?: number; // minutes
    recordMeeting?: boolean;
}

interface LiveClassResult {
    success: boolean;
    roomUrl?: string;
    error?: string;
}

export class LiveClassService {
    private static jitsiDomain = process.env.LMS_JITSI_DOMAIN || 'meet.jit.si';
    private static bbbUrl = process.env.LMS_BBB_URL;
    private static bbbSecret = process.env.LMS_BBB_SECRET;

    /**
     * Generate a Jitsi Meet room URL
     * Works with public Jitsi servers or self-hosted instances
     */
    static createJitsiRoom(config: JitsiRoomConfig): LiveClassResult {
        try {
            // Sanitize room name to be URL-safe
            const sanitizedRoom = config.roomName
                .replace(/[^a-zA-Z0-9-_]/g, '')
                .toLowerCase();

            // Build JWT config for authenticated rooms (if using JWT-enabled Jitsi)
            const params = new URLSearchParams();

            if (config.subject) {
                params.set('subject', config.subject);
            }

            if (config.userDisplayName) {
                params.set('userInfo.displayName', config.userDisplayName);
            }

            if (config.userEmail) {
                params.set('userInfo.email', config.userEmail);
            }

            const paramString = params.toString();
            const roomUrl = `https://${this.jitsiDomain}/${sanitizedRoom}${paramString ? `#${paramString}` : ''}`;

            return {
                success: true,
                roomUrl,
            };
        } catch (error) {
            return {
                success: false,
                error: String(error),
            };
        }
    }

    /**
     * Create a BigBlueButton meeting
     * Requires BBB server URL and shared secret
     */
    static async createBBBMeeting(config: BBBRoomConfig): Promise<LiveClassResult> {
        if (!this.bbbUrl || !this.bbbSecret) {
            return {
                success: false,
                error: 'BigBlueButton not configured. Set LMS_BBB_URL and LMS_BBB_SECRET.',
            };
        }

        try {
            const crypto = await import('crypto');
            const meetingId = `lms-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

            // Build API call parameters
            const createParams = new URLSearchParams({
                meetingID: meetingId,
                name: config.meetingName,
                moderatorPW: config.moderatorPassword,
                attendeePW: config.attendeePassword,
                welcome: config.welcomeMessage || 'LMS Canlı Ders\'e Hoş Geldiniz!',
            });

            if (config.maxParticipants) {
                createParams.set('maxParticipants', String(config.maxParticipants));
            }

            if (config.duration) {
                createParams.set('duration', String(config.duration));
            }

            if (config.recordMeeting) {
                createParams.set('record', 'true');
                createParams.set('autoStartRecording', 'true');
            }

            // Generate checksum
            const queryString = createParams.toString();
            const checksum = crypto
                .createHash('sha1')
                .update(`create${queryString}${this.bbbSecret}`)
                .digest('hex');

            const createUrl = `${this.bbbUrl}/api/create?${queryString}&checksum=${checksum}`;

            // Make API call
            const response = await fetch(createUrl);
            const text = await response.text();

            if (text.includes('<returncode>SUCCESS</returncode>')) {
                // Generate join URL for moderator
                const joinParams = new URLSearchParams({
                    meetingID: meetingId,
                    fullName: 'Moderator',
                    password: config.moderatorPassword,
                });
                const joinChecksum = crypto
                    .createHash('sha1')
                    .update(`join${joinParams.toString()}${this.bbbSecret}`)
                    .digest('hex');

                const joinUrl = `${this.bbbUrl}/api/join?${joinParams.toString()}&checksum=${joinChecksum}`;

                return {
                    success: true,
                    roomUrl: joinUrl,
                };
            }

            return {
                success: false,
                error: 'BBB meeting creation failed',
            };
        } catch (error) {
            return {
                success: false,
                error: String(error),
            };
        }
    }

    /**
     * Generate a unique room name based on course/lesson
     */
    static generateRoomName(courseId: string, lessonTitle: string): string {
        const timestamp = Date.now().toString(36);
        const courseSlug = courseId.substring(0, 8);
        const lessonSlug = lessonTitle
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '')
            .substring(0, 20);

        return `lms-${courseSlug}-${lessonSlug}-${timestamp}`;
    }

    /**
     * Quick method to create a Jitsi room for a class
     */
    static quickCreateRoom(
        courseId: string,
        lessonTitle: string,
        instructorName: string
    ): LiveClassResult {
        const roomName = this.generateRoomName(courseId, lessonTitle);
        return this.createJitsiRoom({
            roomName,
            subject: lessonTitle,
            userDisplayName: instructorName,
            isHost: true,
        });
    }
}
