
import crypto from 'crypto';
import axios from 'axios';
import { parseStringPromise } from 'xml2js';

const BBB_API_URL = process.env.BBB_API_URL || 'https://test-install.blindsidenetworks.com/bigbluebutton/api';
const BBB_SECRET = process.env.BBB_SECRET || '8cd8ef52e8e101574e400365b55e11a6'; // Public Test Secret

export const BigBlueButtonService = {
    /**
     * Generate checksum for BBB API calls
     */
    generateChecksum: (apiCall: string, queryParams: string): string => {
        const str = apiCall + queryParams + BBB_SECRET;
        return crypto.createHash('sha1').update(str).digest('hex');
    },

    /**
     * Create a meeting
     */
    createMeeting: async (meetingID: string, meetingName: string, moderatorPW: string, attendeePW: string) => {
        const apiCall = 'create';
        const params = new URLSearchParams({
            meetingID,
            name: meetingName,
            attendeePW,
            moderatorPW,
            record: 'true',
            allowStartStopRecording: 'true',
            autoStartRecording: 'false'
        });

        const queryStr = params.toString();
        const checksum = BigBlueButtonService.generateChecksum(apiCall, queryStr);
        const url = `${BBB_API_URL}/${apiCall}?${queryStr}&checksum=${checksum}`;

        try {
            const response = await axios.get(url);
            const result = await parseStringPromise(response.data, { explicitArray: false });
            return result.response;
        } catch (error: any) {
            console.error('BBB Create Error:', error.message);
            throw new Error('Failed to create BBB meeting');
        }
    },

    /**
     * Get Join URL
     */
    getJoinUrl: (meetingID: string, fullName: string, role: 'MODERATOR' | 'VIEWER', password: string): string => {
        const apiCall = 'join';
        const params = new URLSearchParams({
            meetingID,
            fullName,
            password,
            redirect: 'true'
        });

        const queryStr = params.toString();
        const checksum = BigBlueButtonService.generateChecksum(apiCall, queryStr);
        return `${BBB_API_URL}/${apiCall}?${queryStr}&checksum=${checksum}`;
    },

    /**
     * End a meeting
     */
    endMeeting: async (meetingID: string, password: string) => {
        const apiCall = 'end';
        const params = new URLSearchParams({
            meetingID,
            password
        });

        const queryStr = params.toString();
        const checksum = BigBlueButtonService.generateChecksum(apiCall, queryStr);
        const url = `${BBB_API_URL}/${apiCall}?${queryStr}&checksum=${checksum}`;

        try {
            const response = await axios.get(url);
            const result = await parseStringPromise(response.data, { explicitArray: false });
            return result.response;
        } catch (error: any) {
            console.error('BBB End Error:', error.message);
            return null;
        }
    },

    /**
     * Get Recordings
     */
    getRecordings: async (meetingID?: string) => {
        const apiCall = 'getRecordings';
        const params = new URLSearchParams();
        if (meetingID) {
            params.append('meetingID', meetingID);
        }

        const queryStr = params.toString();
        const checksum = BigBlueButtonService.generateChecksum(apiCall, queryStr);
        const url = `${BBB_API_URL}/${apiCall}?${queryStr}&checksum=${checksum}`;

        try {
            const response = await axios.get(url);
            const result = await parseStringPromise(response.data, { explicitArray: false });
            return result.response.recordings ? result.response.recordings.recording : [];
        } catch (error: any) {
            console.error('BBB Recordings Error:', error.message);
            return [];
        }
    }
};
