import express from 'express';
import { requireAuth } from '../middleware/auth';
import { query } from '../db';

const router: express.Router = express.Router();

// GET /api/rubrics - List all rubrics (optionally by course)
router.get('/', requireAuth, async (req, res) => {
    try {
        const courseId = req.query.courseId as string | undefined;

        let sql = 'SELECT * FROM rubrics';
        const params: any[] = [];

        if (courseId) {
            sql += ' WHERE course_id = $1';
            params.push(courseId);
        }

        sql += ' ORDER BY created_at DESC';

        const result = await query(sql, params);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch rubrics' });
    }
});

// GET /api/rubrics/:id - Get rubric with criteria and levels
router.get('/:id', requireAuth, async (req, res) => {
    try {
        const rubricId = req.params.id;

        const rubricResult = await query('SELECT * FROM rubrics WHERE id = $1', [rubricId]);
        if (rubricResult.rows.length === 0) {
            return res.status(404).json({ error: 'Rubric not found' });
        }

        const criteriaResult = await query(
            'SELECT * FROM rubric_criteria WHERE rubric_id = $1 ORDER BY order_index',
            [rubricId]
        );

        // Get levels for each criteria
        const criteriaWithLevels = await Promise.all(
            criteriaResult.rows.map(async (criteria) => {
                const levelsResult = await query(
                    'SELECT * FROM rubric_levels WHERE criteria_id = $1 ORDER BY order_index',
                    [criteria.id]
                );
                return { ...criteria, levels: levelsResult.rows };
            })
        );

        res.json({
            ...rubricResult.rows[0],
            criteria: criteriaWithLevels
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch rubric' });
    }
});

// POST /api/rubrics - Create new rubric
router.post('/', requireAuth, async (req, res) => {
    try {
        const { title, description, courseId, criteria } = req.body;
        const userId = (req as any).user?.id;

        // Create rubric
        const rubricResult = await query(
            `INSERT INTO rubrics (title, description, course_id, instructor_id)
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [title, description, courseId, userId]
        );
        const rubric = rubricResult.rows[0];

        // Create criteria and levels
        if (criteria && Array.isArray(criteria)) {
            for (let i = 0; i < criteria.length; i++) {
                const c = criteria[i];
                const criteriaResult = await query(
                    `INSERT INTO rubric_criteria (rubric_id, name, description, max_points, order_index)
                     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
                    [rubric.id, c.name, c.description, c.maxPoints || 10, i]
                );
                const criteriaId = criteriaResult.rows[0].id;

                // Create levels for this criteria
                if (c.levels && Array.isArray(c.levels)) {
                    for (let j = 0; j < c.levels.length; j++) {
                        const level = c.levels[j];
                        await query(
                            `INSERT INTO rubric_levels (criteria_id, name, description, points, order_index)
                             VALUES ($1, $2, $3, $4, $5)`,
                            [criteriaId, level.name, level.description, level.points, j]
                        );
                    }
                }
            }
        }

        res.status(201).json(rubric);
    } catch (error) {
        console.error('Create rubric error:', error);
        res.status(500).json({ error: 'Failed to create rubric' });
    }
});

// POST /api/rubrics/:id/grade - Grade a submission using rubric
router.post('/:id/grade', requireAuth, async (req, res) => {
    try {
        const rubricId = req.params.id;
        const { submissionId, grades } = req.body;
        const graderId = (req as any).user?.id;

        // grades = [{ criteriaId, levelId, pointsAwarded, feedback }]

        let totalPoints = 0;

        for (const grade of grades) {
            await query(
                `INSERT INTO rubric_grades (submission_id, rubric_id, criteria_id, level_id, points_awarded, feedback, graded_by)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [submissionId, rubricId, grade.criteriaId, grade.levelId, grade.pointsAwarded, grade.feedback, graderId]
            );
            totalPoints += grade.pointsAwarded || 0;
        }

        res.json({ success: true, totalPoints });
    } catch (error) {
        console.error('Grade with rubric error:', error);
        res.status(500).json({ error: 'Failed to grade submission' });
    }
});

// DELETE /api/rubrics/:id - Delete rubric
router.delete('/:id', requireAuth, async (req, res) => {
    try {
        await query('DELETE FROM rubrics WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete rubric' });
    }
});

export default router;
