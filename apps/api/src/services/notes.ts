/**
 * Notes Service
 * User notes on course content
 */

import { query } from '../db';

const newId = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();

interface Note {
    id: string;
    userId: string;
    contentId: string;
    contentType: 'video' | 'pdf' | 'text' | 'lesson';
    text: string;
    timestamp?: number;  // For video notes (seconds)
    pageNumber?: number; // For PDF notes
    color?: string;
    createdAt: string;
    updatedAt?: string;
}

export const NotesService = {
    /**
     * Create new note
     */
    create: async (
        userId: string,
        contentId: string,
        contentType: Note['contentType'],
        text: string,
        options?: { timestamp?: number; pageNumber?: number; color?: string }
    ): Promise<Note> => {
        const id = newId();
        const now = nowIso();

        await query(
            `INSERT INTO user_notes (id, user_id, content_id, content_type, text, timestamp, page_number, color, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [id, userId, contentId, contentType, text, options?.timestamp || null, options?.pageNumber || null, options?.color || '#fef08a', now]
        );

        return {
            id,
            userId,
            contentId,
            contentType,
            text,
            timestamp: options?.timestamp,
            pageNumber: options?.pageNumber,
            color: options?.color,
            createdAt: now,
        };
    },

    /**
     * Get notes for content
     */
    getByContent: async (userId: string, contentId: string): Promise<Note[]> => {
        const result = await query(
            `SELECT id, user_id as "userId", content_id as "contentId", content_type as "contentType",
                    text, timestamp, page_number as "pageNumber", color, created_at as "createdAt", updated_at as "updatedAt"
             FROM user_notes WHERE user_id = $1 AND content_id = $2 ORDER BY COALESCE(timestamp, 0), created_at`,
            [userId, contentId]
        );
        return result.rows as Note[];
    },

    /**
     * Get all notes for user in course
     */
    getByCourse: async (userId: string, courseId: string): Promise<Note[]> => {
        const result = await query(
            `SELECT n.id, n.user_id as "userId", n.content_id as "contentId", n.content_type as "contentType",
                    n.text, n.timestamp, n.page_number as "pageNumber", n.color, n.created_at as "createdAt", n.updated_at as "updatedAt",
                    c.title as "contentTitle"
             FROM user_notes n
             JOIN course_content c ON n.content_id = c.id::text
             WHERE n.user_id = $1 AND c.course_id = $2
             ORDER BY n.created_at DESC`,
            [userId, courseId]
        );
        return result.rows as Note[];
    },

    /**
     * Update note
     */
    update: async (noteId: string, userId: string, text: string, color?: string): Promise<void> => {
        const now = nowIso();
        await query(
            `UPDATE user_notes SET text = $1, color = COALESCE($2, color), updated_at = $3 
             WHERE id = $4 AND user_id = $5`,
            [text, color, now, noteId, userId]
        );
    },

    /**
     * Delete note
     */
    delete: async (noteId: string, userId: string): Promise<void> => {
        await query('DELETE FROM user_notes WHERE id = $1 AND user_id = $2', [noteId, userId]);
    },

    /**
     * Search notes
     */
    search: async (userId: string, searchTerm: string, limit: number = 50): Promise<Note[]> => {
        const result = await query(
            `SELECT id, user_id as "userId", content_id as "contentId", content_type as "contentType",
                    text, timestamp, page_number as "pageNumber", color, created_at as "createdAt"
             FROM user_notes 
             WHERE user_id = $1 AND text ILIKE $2
             ORDER BY created_at DESC LIMIT $3`,
            [userId, `%${searchTerm}%`, limit]
        );
        return result.rows as Note[];
    },

    /**
     * Get notes count per content
     */
    getNotesCount: async (userId: string, contentIds: string[]): Promise<Record<string, number>> => {
        if (contentIds.length === 0) return {};

        const result = await query(
            `SELECT content_id, COUNT(*)::int as count 
             FROM user_notes WHERE user_id = $1 AND content_id = ANY($2)
             GROUP BY content_id`,
            [userId, contentIds]
        );

        const counts: Record<string, number> = {};
        for (const row of result.rows) {
            counts[row.content_id] = row.count;
        }
        return counts;
    },

    /**
     * Export notes as text
     */
    exportNotes: async (userId: string, courseId?: string): Promise<string> => {
        let notes: Note[];

        if (courseId) {
            notes = await NotesService.getByCourse(userId, courseId);
        } else {
            const result = await query(
                `SELECT id, content_id as "contentId", content_type as "contentType",
                        text, timestamp, page_number as "pageNumber", created_at as "createdAt"
                 FROM user_notes WHERE user_id = $1 ORDER BY created_at`,
                [userId]
            );
            notes = result.rows as Note[];
        }

        const lines: string[] = ['# Notlarım\n'];
        let currentContent = '';

        for (const note of notes) {
            if (note.contentId !== currentContent) {
                currentContent = note.contentId;
                lines.push(`\n## ${(note as any).contentTitle || note.contentId}\n`);
            }

            let prefix = '-';
            if (note.timestamp) {
                const mins = Math.floor(note.timestamp / 60);
                const secs = note.timestamp % 60;
                prefix = `- [${mins}:${secs.toString().padStart(2, '0')}]`;
            } else if (note.pageNumber) {
                prefix = `- [Sayfa ${note.pageNumber}]`;
            }

            lines.push(`${prefix} ${note.text}`);
        }

        return lines.join('\n');
    },
};

export default NotesService;
