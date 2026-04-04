/**
 * Access Control Service
 * Handles content validity dates and group restrictions
 */

import { query } from '../db';

interface User {
    id: string;
    username: string;
    role: string;
}

export class AccessControlService {
    /**
     * Check if user has access to a specific content item
     */
    static async checkContentAccess(user: User, contentId: string): Promise<{ allowed: boolean; reason?: string }> {
        // Admins always allowed
        if (['SuperAdmin', 'Admin', 'Instructor'].includes(user.role)) {
            return { allowed: true };
        }

        const { rows } = await query<any>(
            `SELECT valid_from, valid_until, allowed_groups
       FROM content_items
       WHERE id = $1`,
            [contentId]
        );

        if (rows.length === 0) {
            return { allowed: false, reason: 'not_found' };
        }

        const content = rows[0];
        const now = new Date();

        // 1. Date Check
        if (content.valid_from && new Date(content.valid_from) > now) {
            return { allowed: false, reason: 'not_started' };
        }

        if (content.valid_until && new Date(content.valid_until) < now) {
            return { allowed: false, reason: 'expired' };
        }

        // 2. Group Check
        if (content.allowed_groups && content.allowed_groups.length > 0) {
            const allowedGroups: string[] = content.allowed_groups;

            const { rows: userGroups } = await query<any>(
                `SELECT group_id FROM user_groups WHERE user_id = $1`,
                [user.id]
            );

            const userGroupIds = userGroups.map((r: any) => r.group_id);

            // Check intersection
            const hasAccess = allowedGroups.some(gId => userGroupIds.includes(gId));
            if (!hasAccess) {
                return { allowed: false, reason: 'group_restriction' };
            }
        }

        return { allowed: true };
    }

    /**
     * Get list of groups a user belongs to
     */
    static async getUserGroups(userId: string): Promise<any[]> {
        const { rows } = await query<any>(
            `SELECT g.id, g.name 
       FROM groups g
       JOIN user_groups ug ON g.id = ug.group_id
       WHERE ug.user_id = $1`,
            [userId]
        );
        return rows;
    }
}
