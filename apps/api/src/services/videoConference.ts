/**
 * Video Conference Service
 * Integration with BigBlueButton (BBB) and Jitsi Meet
 */

import crypto from 'crypto';

// BBB Configuration
interface BBBConfig {
    url: string;
    secret: string;
}

// Jitsi Configuration
interface JitsiConfig {
    domain: string;
    appId?: string;
    appSecret?: string;
}

interface MeetingParams {
    meetingId: string;
    name: string;
    moderatorPassword?: string;
    attendeePassword?: string;
    welcome?: string;
    duration?: number; // minutes
    record?: boolean;
    allowStartStopRecording?: boolean;
    webcamsOnlyForModerator?: boolean;
    muteOnStart?: boolean;
}

interface JoinParams {
    meetingId: string;
    userName: string;
    moderator: boolean;
    createIfNotExists?: boolean;
}

const getBBBConfig = (): BBBConfig => ({
    url: process.env.BBB_URL || 'https://bbb.example.com/bigbluebutton',
    secret: process.env.BBB_SECRET || 'your-bbb-shared-secret'
});

const getJitsiConfig = (): JitsiConfig => ({
    domain: process.env.JITSI_DOMAIN || 'meet.jit.si',
    appId: process.env.JITSI_APP_ID,
    appSecret: process.env.JITSI_APP_SECRET
});

export const VideoConferenceService = {
    // ==================== BigBlueButton ====================

    /**
     * Generate BBB API checksum
     */
    bbbChecksum: (apiCall: string, params: string): string => {
        const config = getBBBConfig();
        return crypto
            .createHash('sha1')
            .update(apiCall + params + config.secret)
            .digest('hex');
    },

    /**
     * Create BBB meeting
     */
    createBBBMeeting: async (params: MeetingParams): Promise<{ success: boolean; meetingId: string; moderatorUrl: string; attendeeUrl: string }> => {
        const config = getBBBConfig();

        const moderatorPW = params.moderatorPassword || crypto.randomBytes(8).toString('hex');
        const attendeePW = params.attendeePassword || crypto.randomBytes(8).toString('hex');

        const queryParams = new URLSearchParams({
            meetingID: params.meetingId,
            name: params.name,
            moderatorPW,
            attendeePW,
            welcome: params.welcome || `${params.name} toplantısına hoş geldiniz!`,
            duration: String(params.duration || 60),
            record: String(params.record || false),
            allowStartStopRecording: String(params.allowStartStopRecording || true),
            webcamsOnlyForModerator: String(params.webcamsOnlyForModerator || false),
            muteOnStart: String(params.muteOnStart || true)
        });

        const checksum = VideoConferenceService.bbbChecksum('create', queryParams.toString());
        queryParams.append('checksum', checksum);

        try {
            const response = await fetch(`${config.url}/api/create?${queryParams.toString()}`);
            const text = await response.text();

            // Parse XML response
            if (text.includes('<returncode>SUCCESS</returncode>')) {
                return {
                    success: true,
                    meetingId: params.meetingId,
                    moderatorUrl: VideoConferenceService.getBBBJoinUrl(params.meetingId, 'Moderator', moderatorPW),
                    attendeeUrl: VideoConferenceService.getBBBJoinUrl(params.meetingId, 'Attendee', attendeePW)
                };
            }

            return { success: false, meetingId: params.meetingId, moderatorUrl: '', attendeeUrl: '' };
        } catch (error) {
            console.error('BBB Create Meeting Error:', error);
            return { success: false, meetingId: params.meetingId, moderatorUrl: '', attendeeUrl: '' };
        }
    },

    /**
     * Get BBB join URL
     */
    getBBBJoinUrl: (meetingId: string, userName: string, password: string): string => {
        const config = getBBBConfig();
        const queryParams = new URLSearchParams({
            meetingID: meetingId,
            fullName: userName,
            password
        });

        const checksum = VideoConferenceService.bbbChecksum('join', queryParams.toString());
        queryParams.append('checksum', checksum);

        return `${config.url}/api/join?${queryParams.toString()}`;
    },

    /**
     * End BBB meeting
     */
    endBBBMeeting: async (meetingId: string, moderatorPassword: string): Promise<boolean> => {
        const config = getBBBConfig();
        const queryParams = new URLSearchParams({
            meetingID: meetingId,
            password: moderatorPassword
        });

        const checksum = VideoConferenceService.bbbChecksum('end', queryParams.toString());
        queryParams.append('checksum', checksum);

        try {
            const response = await fetch(`${config.url}/api/end?${queryParams.toString()}`);
            const text = await response.text();
            return text.includes('<returncode>SUCCESS</returncode>');
        } catch {
            return false;
        }
    },

    /**
     * Check if BBB meeting is running
     */
    isBBBMeetingRunning: async (meetingId: string): Promise<boolean> => {
        const config = getBBBConfig();
        const queryParams = new URLSearchParams({ meetingID: meetingId });
        const checksum = VideoConferenceService.bbbChecksum('isMeetingRunning', queryParams.toString());
        queryParams.append('checksum', checksum);

        try {
            const response = await fetch(`${config.url}/api/isMeetingRunning?${queryParams.toString()}`);
            const text = await response.text();
            return text.includes('<running>true</running>');
        } catch {
            return false;
        }
    },

    // ==================== Jitsi Meet ====================

    /**
     * Generate Jitsi meeting URL
     */
    createJitsiMeeting: (roomName: string, displayName: string, options?: {
        startWithAudioMuted?: boolean;
        startWithVideoMuted?: boolean;
        subject?: string;
    }): string => {
        const config = getJitsiConfig();

        // Sanitize room name
        const safeRoomName = roomName.replace(/[^a-zA-Z0-9]/g, '');

        const params = new URLSearchParams();
        if (options?.startWithAudioMuted) params.append('config.startWithAudioMuted', 'true');
        if (options?.startWithVideoMuted) params.append('config.startWithVideoMuted', 'true');
        if (options?.subject) params.append('config.subject', options.subject);
        if (displayName) params.append('userInfo.displayName', displayName);

        const queryString = params.toString();
        return `https://${config.domain}/${safeRoomName}${queryString ? '#' + queryString : ''}`;
    },

    /**
     * Generate Jitsi JWT token (for authenticated rooms)
     */
    generateJitsiJwt: (roomName: string, user: { id: string; name: string; email: string; moderator: boolean }): string | null => {
        const config = getJitsiConfig();

        if (!config.appId || !config.appSecret) {
            return null; // JWT auth not configured
        }

        const now = Math.floor(Date.now() / 1000);
        const payload = {
            iss: config.appId,
            aud: 'jitsi',
            sub: config.domain,
            room: roomName,
            exp: now + 7200, // 2 hours
            context: {
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    moderator: user.moderator
                },
                features: {
                    recording: user.moderator,
                    livestreaming: false,
                    'screen-sharing': true
                }
            }
        };

        // In production, use proper JWT signing
        // return jwt.sign(payload, config.appSecret, { algorithm: 'HS256' });
        return Buffer.from(JSON.stringify(payload)).toString('base64');
    },

    // ==================== Unified Interface ====================

    /**
     * Create meeting (auto-select provider)
     */
    createMeeting: async (params: MeetingParams, provider: 'bbb' | 'jitsi' = 'jitsi'): Promise<{
        success: boolean;
        provider: string;
        meetingId: string;
        joinUrl: string;
        moderatorUrl?: string;
    }> => {
        if (provider === 'bbb') {
            const result = await VideoConferenceService.createBBBMeeting(params);
            return {
                success: result.success,
                provider: 'bbb',
                meetingId: result.meetingId,
                joinUrl: result.attendeeUrl,
                moderatorUrl: result.moderatorUrl
            };
        } else {
            // Jitsi - instant meetings
            const joinUrl = VideoConferenceService.createJitsiMeeting(params.meetingId, 'Moderator', {
                subject: params.name
            });
            return {
                success: true,
                provider: 'jitsi',
                meetingId: params.meetingId,
                joinUrl
            };
        }
    }
};

export default VideoConferenceService;
