import express from 'express';
import { requireAuth } from '../middleware/auth';
import { query } from '../db';

const router: express.Router = express.Router();

// GET /api/templates - List templates (public or own)
router.get('/', requireAuth, async (req, res) => {
    try {
        const userId = (req as any).user?.id;
        const category = req.query.category as string | undefined;

        let sql = `SELECT * FROM course_templates WHERE is_public = true OR created_by = $1`;
        const params: any[] = [userId];

        if (category) {
            sql += ' AND category = $2';
            params.push(category);
        }

        sql += ' ORDER BY usage_count DESC, created_at DESC';

        const result = await query(sql, params);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch templates' });
    }
});

// GET /api/templates/:id - Get template with items
router.get('/:id', requireAuth, async (req, res) => {
    try {
        const templateResult = await query(
            'SELECT * FROM course_templates WHERE id = $1',
            [req.params.id]
        );

        if (templateResult.rows.length === 0) {
            return res.status(404).json({ error: 'Template not found' });
        }

        const itemsResult = await query(
            'SELECT * FROM template_items WHERE template_id = $1 ORDER BY order_index',
            [req.params.id]
        );

        res.json({
            ...templateResult.rows[0],
            items: itemsResult.rows
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch template' });
    }
});

// POST /api/templates - Create template from course
router.post('/', requireAuth, async (req, res) => {
    try {
        const { title, description, category, isPublic, courseId } = req.body;
        const userId = (req as any).user?.id;

        // Create template
        const templateResult = await query(
            `INSERT INTO course_templates (title, description, category, is_public, created_by)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [title, description, category, isPublic || false, userId]
        );
        const template = templateResult.rows[0];

        // If courseId provided, copy course structure to template
        if (courseId) {
            // Copy content items
            const contentResult = await query(
                'SELECT * FROM content WHERE course_id = $1 ORDER BY created_at',
                [courseId]
            );

            for (let i = 0; i < contentResult.rows.length; i++) {
                const content = contentResult.rows[i];
                await query(
                    `INSERT INTO template_items (template_id, item_type, title, description, config, order_index)
                     VALUES ($1, 'content', $2, $3, $4, $5)`,
                    [template.id, content.title, null, JSON.stringify({ type: content.type }), i]
                );
            }

            // Copy exams
            const examResult = await query(
                'SELECT * FROM exams WHERE course_id = $1 ORDER BY created_at',
                [courseId]
            );

            for (let i = 0; i < examResult.rows.length; i++) {
                const exam = examResult.rows[i];
                await query(
                    `INSERT INTO template_items (template_id, item_type, title, description, config, order_index)
                     VALUES ($1, 'exam', $2, $3, $4, $5)`,
                    [
                        template.id,
                        exam.title,
                        null,
                        JSON.stringify({
                            durationMinutes: exam.duration_minutes,
                            passThreshold: exam.pass_threshold
                        }),
                        contentResult.rows.length + i
                    ]
                );
            }
        }

        res.status(201).json(template);
    } catch (error) {
        console.error('Create template error:', error);
        res.status(500).json({ error: 'Failed to create template' });
    }
});

// POST /api/templates/:id/apply - Create course from template
router.post('/:id/apply', requireAuth, async (req, res) => {
    try {
        const templateId = req.params.id;
        const { courseTitle } = req.body;
        const userId = (req as any).user?.id;

        // Get template
        const templateResult = await query(
            'SELECT * FROM course_templates WHERE id = $1',
            [templateId]
        );

        if (templateResult.rows.length === 0) {
            return res.status(404).json({ error: 'Template not found' });
        }

        const template = templateResult.rows[0];

        // Create new course
        const courseResult = await query(
            `INSERT INTO courses (title, description, instructor_id, created_at, updated_at)
             VALUES ($1, $2, $3, NOW(), NOW()) RETURNING *`,
            [courseTitle || template.title, template.description, userId]
        );
        const course = courseResult.rows[0];

        // Get template items and create course content
        const itemsResult = await query(
            'SELECT * FROM template_items WHERE template_id = $1 ORDER BY order_index',
            [templateId]
        );

        for (const item of itemsResult.rows) {
            if (item.item_type === 'content') {
                const config = item.config || {};
                await query(
                    `INSERT INTO content (title, type, course_id, created_at, updated_at)
                     VALUES ($1, $2, $3, NOW(), NOW())`,
                    [item.title, config.type || 'video', course.id]
                );
            } else if (item.item_type === 'exam') {
                const config = item.config || {};
                await query(
                    `INSERT INTO exams (title, course_id, duration_minutes, pass_threshold, is_draft, created_at, updated_at)
                     VALUES ($1, $2, $3, $4, true, NOW(), NOW())`,
                    [item.title, course.id, config.durationMinutes || 60, config.passThreshold || 50]
                );
            }
        }

        // Increment usage count
        await query(
            'UPDATE course_templates SET usage_count = usage_count + 1 WHERE id = $1',
            [templateId]
        );

        res.json({ success: true, course });
    } catch (error) {
        console.error('Apply template error:', error);
        res.status(500).json({ error: 'Failed to apply template' });
    }
});

// DELETE /api/templates/:id
router.delete('/:id', requireAuth, async (req, res) => {
    try {
        await query('DELETE FROM course_templates WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete template' });
    }
});

export default router;
