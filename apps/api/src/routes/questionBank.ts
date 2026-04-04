import { Router, Request, Response } from 'express';
import { QuestionBankService } from '../services/questionBank';
import { requireAuth, requireRole } from '../middleware/auth';
import { Role } from '../auth/utils';

const router = Router();
router.use(requireAuth);

// STRICT ACCESS CONTROL: Only these roles can access Question Bank
const allowedRoles = ["SuperAdmin", "Admin", "Instructor", "Assistant"] as Role[];

/**
 * GET /api/question-bank/tags
 * Get all question tags (banks)
 */
router.get('/tags', requireRole(allowedRoles), async (req: Request, res: Response) => {
    try {
        const tags = await QuestionBankService.getAllTags();
        res.json(tags);
    } catch (error) {
        console.error('Get tags error:', error);
        res.status(500).json({ error: 'Etiketler alınamadı' });
    }
});

/**
 * POST /api/question-bank/tags
 * Create a new tag
 */
router.post('/tags', requireRole(allowedRoles), async (req: Request, res: Response) => {
    try {
        const { name, color } = req.body;
        const tag = await QuestionBankService.createTag(name, color);
        res.status(201).json(tag);
    } catch (error) {
        console.error('Create tag error:', error);
        res.status(500).json({ error: 'Etiket oluşturulamadı' });
    }
});

/**
 * POST /api/question-bank/exam-from-pool
 * Create random exam from pool
 */
router.post('/exam-from-pool', requireRole(allowedRoles), async (req: Request, res: Response) => {
    try {
        const { title, courseId, tagIds, questionCount, durationMinutes, passThreshold } = req.body;
        const result = await QuestionBankService.createExamFromPool({
            title,
            courseId,
            tagIds,
            questionCount,
            durationMinutes,
            passThreshold
        });
        res.status(201).json(result);
    } catch (error) {
        console.error('Create exam from pool error:', error);
        res.status(500).json({ error: error instanceof Error ? error.message : 'Sınav oluşturulamadı' });
    }
});

/**
 * GET /api/question-bank/questions/:id/tags
 * Get tags for a specific question
 */
router.get('/questions/:id/tags', requireRole(allowedRoles), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        // reuse getQuestionsByTags service logic? No, need specific query.
        // We will add a helper query here directly or in service.
        // Direct query is faster for now.
        const { query } = require('../db');
        const { rows } = await query(
            `SELECT t.id, t.name, t.color FROM question_tags t
             JOIN question_tag_links qtl ON t.id = qtl.tag_id
             WHERE qtl.question_id = $1`,
            [id]
        );
        res.json(rows);
    } catch (error) {
        console.error('Get question tags error:', error);
        res.status(500).json({ error: 'Etiketler alınamadı' });
    }
});


/**
 * POST /api/question-bank/questions/:id/tag
 * Tag a question
 */
router.post('/questions/:id/tag', requireRole(allowedRoles), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { tagId } = req.body;
        await QuestionBankService.tagQuestion(id, tagId);
        res.json({ success: true });
    } catch (error) {
        console.error('Tag question error:', error);
        res.status(500).json({ error: 'Etiketlenemedi' });
    }
});

/**
 * DELETE /api/question-bank/questions/:id/tag
 * Untag a question
 */
router.delete('/questions/:id/tag', requireRole(allowedRoles), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { tagId } = req.body;
        await QuestionBankService.untagQuestion(id, tagId);
        res.json({ success: true });
    } catch (error) {
        console.error('Untag question error:', error);
        res.status(500).json({ error: 'Etiket kaldırılamadı' });
    }
});

export default router;
