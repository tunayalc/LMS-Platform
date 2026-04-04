
import { Router, Request, Response } from 'express';
import { query } from '../db';
import { requireAuth } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

/**
 * GET /api/exams/course/:courseId
 * List exams for a specific course
 */
router.get('/course/:courseId', async (req: Request, res: Response) => {
    try {
        const { courseId } = req.params;
        const user = (req as any).user;

        // TODO: Add strict role check if needed (e.g. only enrolled students)

        const { rows } = await query(
            `SELECT id, title, duration_minutes as "durationMinutes", pass_threshold as "passThreshold", created_at as "createdAt", is_draft as "isDraft" 
             FROM exams 
             WHERE course_id = $1 
             ORDER BY created_at DESC`,
            [courseId]
        );

        res.json(rows);
    } catch (error) {
        console.error('Get exams error:', error);
        res.status(500).json({ error: 'Sınavlar alınamadı' });
    }
});

/**
 * GET /api/exams/:id
 * Get single exam details
 */
router.get('/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { rows } = await query(
            `SELECT id, title, course_id as "courseId", duration_minutes as "durationMinutes", pass_threshold as "passThreshold", 
             start_date as "startDate", end_date as "endDate", max_attempts as "maxAttempts", 
             is_draft as "isDraft", results_visible_at as "resultsVisibleAt", created_at as "createdAt" 
             FROM exams 
             WHERE id = $1`,
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Sınav bulunamadı' });
        }

        res.json(rows[0]);
    } catch (error) {
        console.error('Get exam details error:', error);
        res.status(500).json({ error: 'Sınav detayları alınamadı' });
    }
});

export default router;
