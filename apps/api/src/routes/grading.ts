/**
 * Question Grading API Routes
 */

import { Router, Request, Response } from 'express';
import { QuestionGrader, GradingResult } from '../services/questionGrader';
import { query } from '../db';

const router: Router = Router();

// Middleware for auth (simplified)
const requireAuth = (req: Request, res: Response, next: Function) => {
    // In production, verify JWT token
    if (!(req as any).user) {
        (req as any).user = { id: 'anonymous', role: 'Student' };
    }
    next();
};

/**
 * Grade a single question
 * POST /api/grading/question/:questionId
 */
router.post('/question/:questionId', requireAuth, async (req: Request, res: Response) => {
    try {
        const { questionId } = req.params;
        const { answer } = req.body;

        // Get question from database
        const questionResult = await query(
            'SELECT id, prompt, type, answer, options, meta, points FROM questions WHERE id = $1',
            [questionId]
        );

        if (questionResult.rows.length === 0) {
            return res.status(404).json({ error: 'Soru bulunamadı' });
        }

        const question = questionResult.rows[0];
        const result = await QuestionGrader.grade(
            {
                type: question.type,
                answer: question.answer,
                options: question.options,
                meta: question.meta
            },
            answer,
            question.points || 10
        );

        res.json({
            questionId,
            ...result
        });
    } catch (error) {
        console.error('Grading error:', error);
        res.status(500).json({ error: 'Puanlama hatası' });
    }
});

/**
 * Grade exam submission
 * POST /api/grading/exam/:examId/submit
 */
router.post('/exam/:examId/submit', requireAuth, async (req: Request, res: Response) => {
    try {
        const { examId } = req.params;
        const { answers } = req.body; // { questionId: answer }
        const userId = (req as any).user.id;

        // Get exam questions
        const questionsResult = await query(
            'SELECT id, prompt, type, answer, options, meta, points FROM questions WHERE exam_id = $1',
            [examId]
        );

        if (questionsResult.rows.length === 0) {
            return res.status(404).json({ error: 'Sınav soruları bulunamadı' });
        }

        // Prepare questions for grading
        const gradingItems = questionsResult.rows.map(q => ({
            question: {
                type: q.type,
                answer: q.answer,
                options: q.options,
                meta: q.meta
            },
            userAnswer: answers?.[q.id],
            maxPoints: q.points || 10
        }));

        // Grade all questions
        const gradingResult = await QuestionGrader.gradeAll(gradingItems);

        // Build detailed results
        const detailedResults = questionsResult.rows.map((q, i) => ({
            questionId: q.id,
            prompt: q.prompt,
            type: q.type,
            userAnswer: answers?.[q.id],
            ...gradingResult.results[i]
        }));

        // Save submission to database
        const submissionId = crypto.randomUUID();
        await query(
            `INSERT INTO exam_submissions (id, exam_id, user_id, answers, score, max_score, percentage, grading_details, submitted_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
            [
                submissionId,
                examId,
                userId,
                JSON.stringify(answers),
                gradingResult.totalScore,
                gradingResult.totalMaxScore,
                gradingResult.percentage,
                JSON.stringify(detailedResults)
            ]
        );

        res.json({
            submissionId,
            examId,
            totalScore: gradingResult.totalScore,
            totalMaxScore: gradingResult.totalMaxScore,
            percentage: gradingResult.percentage,
            passed: gradingResult.percentage >= 50, // Default pass threshold
            results: detailedResults
        });
    } catch (error) {
        console.error('Exam grading error:', error);
        res.status(500).json({ error: 'Sınav puanlama hatası' });
    }
});

/**
 * Manual grade a question (for long_answer, file_upload)
 * POST /api/grading/manual/:submissionId/:questionId
 */
router.post('/manual/:submissionId/:questionId', requireAuth, async (req: Request, res: Response) => {
    try {
        const { submissionId, questionId } = req.params;
        const { score, feedback } = req.body;
        const graderId = (req as any).user.id;

        // Check permission (instructor/admin only)
        const userRole = (req as any).user.role;
        if (!['Admin', 'SuperAdmin', 'Instructor', 'Assistant'].includes(userRole)) {
            return res.status(403).json({ error: 'Yetkiniz yok' });
        }

        // Get submission
        const submissionResult = await query(
            'SELECT id, grading_details, score, max_score FROM exam_submissions WHERE id = $1',
            [submissionId]
        );

        if (submissionResult.rows.length === 0) {
            return res.status(404).json({ error: 'Gönderim bulunamadı' });
        }

        const submission = submissionResult.rows[0];
        const gradingDetails = submission.grading_details || [];

        // Find and update the question result
        let scoreDiff = 0;
        for (const result of gradingDetails) {
            if (result.questionId === questionId) {
                scoreDiff = score - result.score;
                result.score = score;
                result.feedback = feedback;
                result.isCorrect = score === result.maxScore;
                result.isPartial = score > 0 && score < result.maxScore;
                result.gradedBy = graderId;
                result.gradedAt = new Date().toISOString();
                break;
            }
        }

        // Update submission
        const newScore = submission.score + scoreDiff;
        const newPercentage = Math.round((newScore / submission.max_score) * 100);

        await query(
            `UPDATE exam_submissions 
             SET grading_details = $2, score = $3, percentage = $4, updated_at = NOW()
             WHERE id = $1`,
            [submissionId, JSON.stringify(gradingDetails), newScore, newPercentage]
        );

        res.json({
            success: true,
            submissionId,
            questionId,
            newScore,
            newPercentage
        });
    } catch (error) {
        console.error('Manual grading error:', error);
        res.status(500).json({ error: 'Manuel puanlama hatası' });
    }
});

/**
 * Preview grading (test without saving)
 * POST /api/grading/preview
 */
router.post('/preview', async (req: Request, res: Response) => {
    try {
        const { type, answer, correctAnswer, options, meta, points } = req.body;

        const result = await QuestionGrader.grade(
            { type, answer: correctAnswer, options, meta },
            answer,
            points || 10
        );

        res.json(result);
    } catch (error) {
        console.error('Preview grading error:', error);
        res.status(500).json({ error: 'Önizleme hatası' });
    }
});

export default router;
