import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { query } from '../db';
import crypto from 'crypto';

const router = Router();
router.use(requireAuth);

const newId = () => crypto.randomUUID();

/**
 * GET /api/progress/:contentId
 * Get user's progress for a specific content item
 */
router.get('/:contentId', async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const { contentId } = req.params;

        const { rows } = await query(
            `SELECT progress_percent, last_position, updated_at 
             FROM content_progress 
             WHERE user_id = $1 AND content_id = $2`,
            [user.id, contentId]
        );

        if (rows.length === 0) {
            return res.json({ progressPercent: 0, lastPosition: null });
        }

        res.json({
            progressPercent: rows[0].progress_percent,
            lastPosition: rows[0].last_position,
            updatedAt: rows[0].updated_at
        });
    } catch (error) {
        console.error('Get progress error:', error);
        res.status(500).json({ error: 'İlerleme alınamadı' });
    }
});

/**
 * POST /api/progress
 * Save/update user's progress for a content item
 */
router.post('/', async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const { contentId, progressPercent, lastPosition } = req.body;

        if (!contentId) {
            return res.status(400).json({ error: 'contentId gerekli' });
        }

        // Upsert progress
        await query(
            `INSERT INTO content_progress (id, user_id, content_id, progress_percent, last_position, updated_at)
             VALUES ($1, $2, $3, $4, $5, NOW())
             ON CONFLICT (user_id, content_id) 
             DO UPDATE SET progress_percent = $4, last_position = $5, updated_at = NOW()`,
            [newId(), user.id, contentId, progressPercent || 0, lastPosition || null]
        );

        res.json({ success: true });
    } catch (error) {
        console.error('Save progress error:', error);
        res.status(500).json({ error: 'İlerleme kaydedilemedi' });
    }
});

/**
 * GET /api/progress/course/:courseId
 * Get all progress for a course (for instructors)
 */
router.get('/course/:courseId', async (req: Request, res: Response) => {
    try {
        const { courseId } = req.params;

        const { rows } = await query(
            `SELECT cp.content_id, cp.user_id, cp.progress_percent, u.username
             FROM content_progress cp
             JOIN users u ON cp.user_id = u.id
             JOIN content_items ci ON cp.content_id = ci.id
             WHERE ci.course_id = $1
             ORDER BY u.username, ci.created_at`,
            [courseId]
        );

        res.json(rows);
    } catch (error) {
        console.error('Get course progress error:', error);
        res.status(500).json({ error: 'Kurs ilerlemesi alınamadı' });
    }
});

export default router;
