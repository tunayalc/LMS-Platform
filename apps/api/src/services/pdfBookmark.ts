/**
 * PDF Bookmark Service
 * User bookmarks and annotations for PDF documents
 */

import { query } from '../db';

const newId = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();

interface PDFBookmark {
    id: string;
    userId: string;
    contentId: string;  // PDF content ID
    pageNumber: number;
    title: string;
    color?: string;
    createdAt: string;
}

interface PDFAnnotation {
    id: string;
    userId: string;
    contentId: string;
    pageNumber: number;
    type: 'highlight' | 'underline' | 'note' | 'drawing';
    data: any;  // Annotation-specific data (coordinates, text, etc.)
    createdAt: string;
}

interface PDFProgress {
    userId: string;
    contentId: string;
    currentPage: number;
    totalPages: number;
    percentage: number;
    lastViewedAt: string;
}

export const PDFBookmarkService = {
    // ==================== BOOKMARKS ====================

    /**
     * Add bookmark
     */
    addBookmark: async (userId: string, contentId: string, pageNumber: number, title: string, color?: string): Promise<PDFBookmark> => {
        const id = newId();
        const now = nowIso();

        await query(
            `INSERT INTO pdf_bookmarks (id, user_id, content_id, page_number, title, color, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [id, userId, contentId, pageNumber, title, color || '#3b82f6', now]
        );

        return { id, userId, contentId, pageNumber, title, color, createdAt: now };
    },

    /**
     * Get bookmarks for PDF
     */
    getBookmarks: async (userId: string, contentId: string): Promise<PDFBookmark[]> => {
        const result = await query(
            `SELECT id, user_id as "userId", content_id as "contentId", page_number as "pageNumber",
                    title, color, created_at as "createdAt"
             FROM pdf_bookmarks WHERE user_id = $1 AND content_id = $2
             ORDER BY page_number`,
            [userId, contentId]
        );
        return result.rows as PDFBookmark[];
    },

    /**
     * Delete bookmark
     */
    deleteBookmark: async (bookmarkId: string, userId: string): Promise<void> => {
        await query('DELETE FROM pdf_bookmarks WHERE id = $1 AND user_id = $2', [bookmarkId, userId]);
    },

    /**
     * Update bookmark
     */
    updateBookmark: async (bookmarkId: string, userId: string, title: string, color?: string): Promise<void> => {
        await query(
            `UPDATE pdf_bookmarks SET title = $1, color = COALESCE($2, color) WHERE id = $3 AND user_id = $4`,
            [title, color, bookmarkId, userId]
        );
    },

    // ==================== ANNOTATIONS ====================

    /**
     * Add annotation
     */
    addAnnotation: async (
        userId: string,
        contentId: string,
        pageNumber: number,
        type: PDFAnnotation['type'],
        data: any
    ): Promise<PDFAnnotation> => {
        const id = newId();
        const now = nowIso();

        await query(
            `INSERT INTO pdf_annotations (id, user_id, content_id, page_number, type, data, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [id, userId, contentId, pageNumber, type, JSON.stringify(data), now]
        );

        return { id, userId, contentId, pageNumber, type, data, createdAt: now };
    },

    /**
     * Get annotations for page
     */
    getAnnotations: async (userId: string, contentId: string, pageNumber?: number): Promise<PDFAnnotation[]> => {
        let sql = `SELECT id, user_id as "userId", content_id as "contentId", page_number as "pageNumber",
                          type, data, created_at as "createdAt"
                   FROM pdf_annotations WHERE user_id = $1 AND content_id = $2`;
        const params: any[] = [userId, contentId];

        if (pageNumber !== undefined) {
            sql += ' AND page_number = $3';
            params.push(pageNumber);
        }

        sql += ' ORDER BY page_number, created_at';

        const result = await query(sql, params);
        return result.rows.map(row => ({
            ...row,
            data: typeof row.data === 'string' ? JSON.parse(row.data) : row.data,
        })) as PDFAnnotation[];
    },

    /**
     * Delete annotation
     */
    deleteAnnotation: async (annotationId: string, userId: string): Promise<void> => {
        await query('DELETE FROM pdf_annotations WHERE id = $1 AND user_id = $2', [annotationId, userId]);
    },

    // ==================== PROGRESS ====================

    /**
     * Save reading progress
     */
    saveProgress: async (userId: string, contentId: string, currentPage: number, totalPages: number): Promise<void> => {
        const percentage = Math.round((currentPage / totalPages) * 100);
        const now = nowIso();

        await query(
            `INSERT INTO pdf_progress (user_id, content_id, current_page, total_pages, percentage, last_viewed_at)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (user_id, content_id) DO UPDATE SET
                current_page = $3, total_pages = $4, percentage = $5, last_viewed_at = $6`,
            [userId, contentId, currentPage, totalPages, percentage, now]
        );
    },

    /**
     * Get reading progress
     */
    getProgress: async (userId: string, contentId: string): Promise<PDFProgress | null> => {
        const result = await query(
            `SELECT user_id as "userId", content_id as "contentId", current_page as "currentPage",
                    total_pages as "totalPages", percentage, last_viewed_at as "lastViewedAt"
             FROM pdf_progress WHERE user_id = $1 AND content_id = $2`,
            [userId, contentId]
        );
        return result.rows[0] as PDFProgress | undefined || null;
    },

    /**
     * Get all PDF progress for user
     */
    getAllProgress: async (userId: string): Promise<PDFProgress[]> => {
        const result = await query(
            `SELECT user_id as "userId", content_id as "contentId", current_page as "currentPage",
                    total_pages as "totalPages", percentage, last_viewed_at as "lastViewedAt"
             FROM pdf_progress WHERE user_id = $1 ORDER BY last_viewed_at DESC`,
            [userId]
        );
        return result.rows as PDFProgress[];
    },
};

export default PDFBookmarkService;
