
import { query } from '../db';
import { randomUUID } from 'crypto';

export interface H5PContent {
    id?: string;
    courseId: string;
    libraryId: string;
    title: string;
    params: any; // content json
    metadata?: any;
    slug?: string;
}

export const H5PService = {
    /**
     * List all installed libraries
     */
    getLibraries: async () => {
        const res = await query('SELECT * FROM h5p_libraries ORDER BY title');
        return res.rows;
    },

    /**
     * Create or Update H5P Content
     */
    saveContent: async (content: H5PContent) => {
        const slug = content.slug || content.title.toLowerCase().replace(/[^a-z0-9]/g, '-');

        if (content.id) {
            // Update
            const res = await query(
                `UPDATE h5p_content 
                 SET title=$1, params=$2, metadata=$3, slug=$4, updated_at=NOW()
                 WHERE id=$5 RETURNING *`,
                [content.title, JSON.stringify(content.params), JSON.stringify(content.metadata), slug, content.id]
            );
            return res.rows[0];
        } else {
            // Create
            const res = await query(
                `INSERT INTO h5p_content (course_id, library_id, title, params, metadata, slug)
                 VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
                [content.courseId, content.libraryId, content.title, JSON.stringify(content.params), JSON.stringify(content.metadata), slug]
            );
            return res.rows[0];
        }
    },

    /**
     * Get content by ID
     */
    getContent: async (id: string) => {
        const res = await query(
            `SELECT c.*, l.machine_name, l.major_version, l.minor_version 
             FROM h5p_content c
             JOIN h5p_libraries l ON c.library_id = l.id
             WHERE c.id = $1`,
            [id]
        );
        return res.rows[0];
    },

    /**
     * Save interaction result (xAPI)
     */
    saveResult: async (userId: string, contentId: string, score: number, maxScore: number, details: any) => {
        await query(
            `INSERT INTO h5p_results (user_id, content_id, score, max_score, opened_at, finished_at, details)
             VALUES ($1, $2, $3, $4, NOW(), NOW(), $5)`,
            [userId, contentId, score, maxScore, JSON.stringify(details)]
        );
    }
};
