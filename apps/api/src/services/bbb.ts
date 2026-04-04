import crypto from 'crypto';
import qs from 'querystring';
import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';

// Defaults for development (Blindside Networks Test Server)
const BBB_URL = process.env.BBB_URL || 'https://test-install.blindsidenetworks.com/bigbluebutton/api';
const BBB_SECRET = process.env.BBB_SECRET || '8cd8ef52e8e101574e400365b55e11a6';

export class BBBService {

    /**
     * Generate checksum for BBB API call
     */
    private static getChecksum(callName: string, queryParams: string): string {
        return crypto.createHash('sha1').update(callName + queryParams + BBB_SECRET).digest('hex');
    }

    /**
     * Generate deterministic passwords based on meetingID
     */
    private static getPasswords(meetingID: string) {
        return {
            moderatorPW: crypto.createHash('sha1').update(`mod${meetingID}${BBB_SECRET}`).digest('hex').substring(0, 12),
            attendeePW: crypto.createHash('sha1').update(`att${meetingID}${BBB_SECRET}`).digest('hex').substring(0, 12)
        };
    }

    /**
     * Ensure a meeting exists (Create if not running)
     */
    static async ensureMeeting(meetingID: string, meetingName: string): Promise<void> {
        const { moderatorPW, attendeePW } = this.getPasswords(meetingID);

        const params = {
            meetingID,
            name: meetingName,
            moderatorPW,
            attendeePW,
            record: true,
            allowStartStopRecording: true,
            autoStartRecording: false,
        };

        const queryStr = qs.encode(params);
        const checksum = this.getChecksum('create', queryStr);
        const url = `${BBB_URL}/create?${queryStr}&checksum=${checksum}`;

        try {
            const res = await axios.get(url);
            // We could parse XML here to check for <returncode>SUCCESS</returncode>
            // But usually if it fails, it throws or returns error XML.
            // fast-xml-parser can be used if we need strict checks.
            // For now, let's assume success if 200 OK.
            // console.log("BBB Create Response:", res.data);
        } catch (error) {
            console.error("BBB Create Error:", error);
            throw new Error("Failed to create BBB meeting");
        }
    }

    /**
     * Get Join URL for a user
     */
    static getJoinUrl(meetingID: string, fullName: string, role: 'MODERATOR' | 'VIEWER'): string {
        const { moderatorPW, attendeePW } = this.getPasswords(meetingID);
        const password = role === 'MODERATOR' ? moderatorPW : attendeePW;

        const params = {
            meetingID,
            fullName,
            password,
            redirect: 'true' // We want the frontend to redirect or iframe this URL
        };

        const queryStr = qs.encode(params);
        const checksum = this.getChecksum('join', queryStr);

        return `${BBB_URL}/join?${queryStr}&checksum=${checksum}`;
    }
}
