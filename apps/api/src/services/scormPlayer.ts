/**
 * SCORM Player Runtime
 * Implements basic SCORM 1.2 / 2004 runtime API for playing SCORM packages
 */

import { query } from '../db';

// SCORM API Interface
interface ScormApi {
    Initialize: (param: string) => string;
    Terminate: (param: string) => string;
    GetValue: (element: string) => string;
    SetValue: (element: string, value: string) => string;
    Commit: (param: string) => string;
    GetLastError: () => string;
    GetErrorString: (errorCode: string) => string;
    GetDiagnostic: (errorCode: string) => string;
}

// SCORM Data Model
interface ScormSession {
    id: string;
    packageId: string;
    userId: string;
    startTime: Date;
    data: Record<string, string>;
    completionStatus: 'unknown' | 'not attempted' | 'incomplete' | 'completed';
    successStatus: 'unknown' | 'passed' | 'failed';
    score: number | null;
}

// Store active sessions in memory (in production, use Redis)
const activeSessions: Map<string, ScormSession> = new Map();

export const ScormService = {
    /**
     * Start a new SCORM session
     */
    startSession: async (packageId: string, userId: string): Promise<string> => {
        const sessionId = `scorm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const session: ScormSession = {
            id: sessionId,
            packageId,
            userId,
            startTime: new Date(),
            data: {
                'cmi.core.student_id': userId,
                'cmi.core.student_name': 'User',
                'cmi.core.lesson_location': '',
                'cmi.core.lesson_status': 'not attempted',
                'cmi.core.score.raw': '',
                'cmi.core.score.min': '0',
                'cmi.core.score.max': '100',
                'cmi.core.total_time': '0000:00:00',
                'cmi.core.session_time': '0000:00:00',
                'cmi.suspend_data': '',
                'cmi.launch_data': '',
            },
            completionStatus: 'not attempted',
            successStatus: 'unknown',
            score: null
        };

        activeSessions.set(sessionId, session);

        // Log session start
        try {
            await query(
                `INSERT INTO scorm_sessions (id, package_id, user_id, started_at, status)
                 VALUES ($1, $2, $3, NOW(), 'active')
                 ON CONFLICT DO NOTHING`,
                [sessionId, packageId, userId]
            );
        } catch (e) {
            console.warn('Could not log SCORM session to DB:', e);
        }

        return sessionId;
    },

    /**
     * Get SCORM runtime API for a session
     */
    getApi: (sessionId: string): ScormApi | null => {
        const session = activeSessions.get(sessionId);
        if (!session) return null;

        let lastError = '0';

        return {
            Initialize: (_param: string): string => {
                lastError = '0';
                return 'true';
            },

            Terminate: (_param: string): string => {
                lastError = '0';
                // Save session data
                ScormService.endSession(sessionId);
                return 'true';
            },

            GetValue: (element: string): string => {
                lastError = '0';
                const value = session.data[element];
                if (value === undefined) {
                    lastError = '401'; // Not implemented
                    return '';
                }
                return value;
            },

            SetValue: (element: string, value: string): string => {
                lastError = '0';
                session.data[element] = value;

                // Track completion
                if (element === 'cmi.core.lesson_status') {
                    if (value === 'completed' || value === 'passed') {
                        session.completionStatus = 'completed';
                    }
                    if (value === 'passed') {
                        session.successStatus = 'passed';
                    } else if (value === 'failed') {
                        session.successStatus = 'failed';
                    }
                }

                // Track score
                if (element === 'cmi.core.score.raw') {
                    session.score = parseFloat(value) || null;
                }

                return 'true';
            },

            Commit: (_param: string): string => {
                lastError = '0';
                // In production, save to database
                return 'true';
            },

            GetLastError: (): string => {
                return lastError;
            },

            GetErrorString: (errorCode: string): string => {
                const errors: Record<string, string> = {
                    '0': 'No Error',
                    '101': 'General Exception',
                    '201': 'Invalid Argument Error',
                    '301': 'Not Initialized',
                    '401': 'Not Implemented Error',
                    '402': 'Invalid Set Value',
                    '403': 'Element is Read Only',
                    '404': 'Element is Write Only',
                };
                return errors[errorCode] || 'Unknown Error';
            },

            GetDiagnostic: (errorCode: string): string => {
                return `Diagnostic info for error ${errorCode}`;
            }
        };
    },

    /**
     * End and save SCORM session
     */
    endSession: async (sessionId: string): Promise<void> => {
        const session = activeSessions.get(sessionId);
        if (!session) return;

        try {
            await query(
                `UPDATE scorm_sessions 
                 SET ended_at = NOW(), 
                     completion_status = $2,
                     success_status = $3,
                     score = $4,
                     data = $5
                 WHERE id = $1`,
                [
                    sessionId,
                    session.completionStatus,
                    session.successStatus,
                    session.score,
                    JSON.stringify(session.data)
                ]
            );
        } catch (e) {
            console.warn('Could not save SCORM session:', e);
        }

        activeSessions.delete(sessionId);
    },

    /**
     * Get session data
     */
    getSessionData: (sessionId: string): ScormSession | null => {
        return activeSessions.get(sessionId) || null;
    },

    /**
     * Generate SCORM player HTML
     */
    generatePlayerHtml: (packageUrl: string, sessionId: string, apiEndpoint: string): string => {
        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SCORM Player</title>
    <style>
        body, html { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; }
        iframe { border: none; width: 100%; height: 100%; }
    </style>
</head>
<body>
    <iframe id="scorm-content" src="${packageUrl}/index.html"></iframe>
    
    <script>
        // SCORM 1.2 API
        var API = {
            LMSInitialize: function(param) { return "true"; },
            LMSFinish: function(param) { 
                fetch("${apiEndpoint}/scorm/sessions/${sessionId}/end", { method: "POST" });
                return "true"; 
            },
            LMSGetValue: function(element) {
                // Sync call to get value (simplified)
                return "";
            },
            LMSSetValue: function(element, value) {
                fetch("${apiEndpoint}/scorm/sessions/${sessionId}/data", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ element, value })
                });
                return "true";
            },
            LMSCommit: function(param) { return "true"; },
            LMSGetLastError: function() { return "0"; },
            LMSGetErrorString: function(code) { return "No Error"; },
            LMSGetDiagnostic: function(code) { return ""; }
        };
        
        // SCORM 2004 API
        var API_1484_11 = {
            Initialize: API.LMSInitialize,
            Terminate: API.LMSFinish,
            GetValue: API.LMSGetValue,
            SetValue: API.LMSSetValue,
            Commit: API.LMSCommit,
            GetLastError: API.LMSGetLastError,
            GetErrorString: API.LMSGetErrorString,
            GetDiagnostic: API.LMSGetDiagnostic
        };
    </script>
</body>
</html>
        `;
    }
};

export default ScormService;
