/**
 * Audit Logging Service
 * Comprehensive logging for security-critical actions
 */

import { query } from '../db';

// Audit Event Types
type AuditEventType =
    | 'AUTH_LOGIN' | 'AUTH_LOGOUT' | 'AUTH_FAILED' | 'AUTH_PASSWORD_CHANGE' | 'AUTH_2FA_ENABLED'
    | 'USER_CREATE' | 'USER_UPDATE' | 'USER_DELETE' | 'USER_ROLE_CHANGE'
    | 'COURSE_CREATE' | 'COURSE_UPDATE' | 'COURSE_DELETE'
    | 'EXAM_CREATE' | 'EXAM_UPDATE' | 'EXAM_DELETE' | 'EXAM_SUBMIT' | 'EXAM_GRADE'
    | 'CONTENT_UPLOAD' | 'CONTENT_DELETE'
    | 'PERMISSION_GRANT' | 'PERMISSION_REVOKE'
    | 'DATA_EXPORT' | 'DATA_DELETE'
    | 'SYSTEM_CONFIG_CHANGE' | 'SYSTEM_ERROR';

// Severity Levels
type AuditSeverity = 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';

interface AuditLogEntry {
    id?: string;
    timestamp: Date;
    eventType: AuditEventType;
    severity: AuditSeverity;
    userId?: string;
    userName?: string;
    userRole?: string;
    ipAddress?: string;
    userAgent?: string;
    resourceType?: string;
    resourceId?: string;
    action: string;
    details?: Record<string, any>;
    previousValue?: any;
    newValue?: any;
    success: boolean;
    errorMessage?: string;
}

// In-memory buffer for non-critical logs
const logBuffer: AuditLogEntry[] = [];
const BUFFER_SIZE = 100;
const FLUSH_INTERVAL = 30000; // 30 seconds

// Flush buffer to database
const flushBuffer = async () => {
    if (logBuffer.length === 0) return;

    const entries = logBuffer.splice(0, logBuffer.length);

    try {
        for (const entry of entries) {
            await query(
                `INSERT INTO audit_logs 
                 (event_type, severity, user_id, user_name, user_role, ip_address, user_agent,
                  resource_type, resource_id, action, details, previous_value, new_value, success, error_message, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
                [
                    entry.eventType, entry.severity, entry.userId, entry.userName, entry.userRole,
                    entry.ipAddress, entry.userAgent, entry.resourceType, entry.resourceId,
                    entry.action, JSON.stringify(entry.details), JSON.stringify(entry.previousValue),
                    JSON.stringify(entry.newValue), entry.success, entry.errorMessage, entry.timestamp
                ]
            );
        }
    } catch (error) {
        console.error('[AuditLog] Failed to flush buffer:', error);
        // Re-add failed entries
        logBuffer.unshift(...entries);
    }
};

// Start periodic flush
setInterval(flushBuffer, FLUSH_INTERVAL);

export const AuditService = {
    /**
     * Log audit event
     */
    log: async (entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): Promise<void> => {
        const fullEntry: AuditLogEntry = {
            ...entry,
            timestamp: new Date()
        };

        // Critical events are logged immediately
        if (entry.severity === 'CRITICAL' || entry.severity === 'ERROR') {
            try {
                await query(
                    `INSERT INTO audit_logs 
                     (event_type, severity, user_id, user_name, user_role, ip_address, user_agent,
                      resource_type, resource_id, action, details, previous_value, new_value, success, error_message, created_at)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
                    [
                        fullEntry.eventType, fullEntry.severity, fullEntry.userId, fullEntry.userName, fullEntry.userRole,
                        fullEntry.ipAddress, fullEntry.userAgent, fullEntry.resourceType, fullEntry.resourceId,
                        fullEntry.action, JSON.stringify(fullEntry.details), JSON.stringify(fullEntry.previousValue),
                        JSON.stringify(fullEntry.newValue), fullEntry.success, fullEntry.errorMessage, fullEntry.timestamp
                    ]
                );
            } catch (error) {
                console.error('[AuditLog] Critical log failed:', error, entry);
            }
        } else {
            // Buffer non-critical logs
            logBuffer.push(fullEntry);
            if (logBuffer.length >= BUFFER_SIZE) {
                flushBuffer();
            }
        }

        // Also log to console in development
        if (process.env.NODE_ENV !== 'production') {
            console.log(`[AUDIT] ${entry.severity} | ${entry.eventType} | ${entry.action} | User: ${entry.userId || 'N/A'}`);
        }
    },

    /**
     * Log authentication event
     */
    logAuth: async (
        eventType: 'AUTH_LOGIN' | 'AUTH_LOGOUT' | 'AUTH_FAILED' | 'AUTH_PASSWORD_CHANGE',
        userId: string | undefined,
        userName: string | undefined,
        ipAddress: string | undefined,
        userAgent: string | undefined,
        success: boolean,
        errorMessage?: string
    ) => {
        await AuditService.log({
            eventType,
            severity: success ? 'INFO' : 'WARNING',
            userId,
            userName,
            ipAddress,
            userAgent,
            action: eventType.replace('AUTH_', '').toLowerCase(),
            success,
            errorMessage
        });
    },

    /**
     * Log resource change
     */
    logResourceChange: async (
        eventType: AuditEventType,
        userId: string,
        userName: string,
        resourceType: string,
        resourceId: string,
        action: string,
        previousValue?: any,
        newValue?: any,
        ipAddress?: string
    ) => {
        await AuditService.log({
            eventType,
            severity: 'INFO',
            userId,
            userName,
            resourceType,
            resourceId,
            action,
            previousValue,
            newValue,
            ipAddress,
            success: true
        });
    },

    /**
     * Log security event
     */
    logSecurity: async (
        action: string,
        details: Record<string, any>,
        severity: AuditSeverity = 'WARNING',
        userId?: string,
        ipAddress?: string
    ) => {
        await AuditService.log({
            eventType: 'SYSTEM_ERROR',
            severity,
            userId,
            ipAddress,
            action,
            details,
            success: severity !== 'ERROR' && severity !== 'CRITICAL'
        });
    },

    /**
     * Query audit logs
     */
    query: async (filters: {
        userId?: string;
        eventType?: AuditEventType;
        severity?: AuditSeverity;
        startDate?: Date;
        endDate?: Date;
        resourceType?: string;
        resourceId?: string;
        limit?: number;
        offset?: number;
    }): Promise<{ logs: AuditLogEntry[]; total: number }> => {
        let sql = 'SELECT * FROM audit_logs WHERE 1=1';
        let countSql = 'SELECT COUNT(*) FROM audit_logs WHERE 1=1';
        const params: any[] = [];
        let paramIndex = 1;

        if (filters.userId) {
            sql += ` AND user_id = $${paramIndex}`;
            countSql += ` AND user_id = $${paramIndex}`;
            params.push(filters.userId);
            paramIndex++;
        }

        if (filters.eventType) {
            sql += ` AND event_type = $${paramIndex}`;
            countSql += ` AND event_type = $${paramIndex}`;
            params.push(filters.eventType);
            paramIndex++;
        }

        if (filters.severity) {
            sql += ` AND severity = $${paramIndex}`;
            countSql += ` AND severity = $${paramIndex}`;
            params.push(filters.severity);
            paramIndex++;
        }

        if (filters.startDate) {
            sql += ` AND created_at >= $${paramIndex}`;
            countSql += ` AND created_at >= $${paramIndex}`;
            params.push(filters.startDate);
            paramIndex++;
        }

        if (filters.endDate) {
            sql += ` AND created_at <= $${paramIndex}`;
            countSql += ` AND created_at <= $${paramIndex}`;
            params.push(filters.endDate);
            paramIndex++;
        }

        sql += ' ORDER BY created_at DESC';
        sql += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(filters.limit || 50, filters.offset || 0);

        const [logsResult, countResult] = await Promise.all([
            query(sql, params),
            query(countSql, params.slice(0, -2))
        ]);

        return {
            logs: logsResult.rows as unknown as AuditLogEntry[],
            total: parseInt(countResult.rows[0]?.count || '0')
        };
    }
};

export default AuditService;
