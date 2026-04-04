import express from 'express';
import { requireAuth } from '../middleware/auth';
import { query } from '../db';

const router: express.Router = express.Router();

// POST /api/courses/:id/duplicate - Duplicate a course with all its content and exams
router.post('/:id/duplicate', requireAuth, async (req, res) => {
    try {
        const courseId = req.params.id;
        const newTitle = req.body.title || `Copy of Course ${courseId}`;
        const userId = (req as any).user?.id;

        // 1. Get original course
        const courseResult = await query(
            'SELECT * FROM courses WHERE id = $1',
            [courseId]
        );

        if (courseResult.rows.length === 0) {
            return res.status(404).json({ error: 'Course not found' });
        }

        const originalCourse = courseResult.rows[0];

        // 2. Create new course
        const newCourseResult = await query(
            `INSERT INTO courses (title, description, instructor_id, created_at, updated_at)
             VALUES ($1, $2, $3, NOW(), NOW())
             RETURNING *`,
            [newTitle, originalCourse.description, userId || originalCourse.instructor_id]
        );
        const newCourse = newCourseResult.rows[0];

        // 3. Duplicate content
        const contentResult = await query(
            'SELECT * FROM content WHERE course_id = $1',
            [courseId]
        );

        let contentCount = 0;
        for (const content of contentResult.rows) {
            await query(
                `INSERT INTO content (title, type, source, meeting_url, course_id, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
                [content.title, content.type, content.source, content.meeting_url, newCourse.id]
            );
            contentCount++;
        }

        // 4. Duplicate exams
        const examResult = await query(
            'SELECT * FROM exams WHERE course_id = $1',
            [courseId]
        );

        const examIdMap: Record<string, string> = {};
        for (const exam of examResult.rows) {
            const newExamResult = await query(
                `INSERT INTO exams (title, course_id, duration_minutes, pass_threshold, 
                 start_date, end_date, max_attempts, is_draft, results_visible_at, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8, NOW(), NOW())
                 RETURNING id`,
                [
                    `${exam.title} (Copy)`,
                    newCourse.id,
                    exam.duration_minutes,
                    exam.pass_threshold,
                    exam.start_date,
                    exam.end_date,
                    exam.max_attempts,
                    exam.results_visible_at
                ]
            );
            examIdMap[exam.id] = newExamResult.rows[0].id;
        }

        // 5. Duplicate questions
        for (const [oldExamId, newExamId] of Object.entries(examIdMap)) {
            const questionResult = await query(
                'SELECT * FROM questions WHERE exam_id = $1',
                [oldExamId]
            );

            for (const question of questionResult.rows) {
                await query(
                    `INSERT INTO questions (exam_id, prompt, type, options, answer, meta, points, created_at)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
                    [
                        newExamId,
                        question.prompt,
                        question.type,
                        question.options,
                        question.answer,
                        question.meta,
                        question.points
                    ]
                );
            }
        }

        res.json({
            success: true,
            message: 'Course duplicated successfully',
            newCourse: newCourse,
            duplicatedContent: contentCount,
            duplicatedExams: Object.keys(examIdMap).length
        });

    } catch (error) {
        console.error('Course Duplication Error:', error);
        res.status(500).json({ error: 'Failed to duplicate course', details: String(error) });
    }
});

export default router;
