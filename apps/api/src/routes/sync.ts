
import express from 'express';
import { query } from '../db';
import { z } from 'zod';
import PrerequisiteService from '../services/prerequisites';

const router: express.Router = express.Router();

// Schema for offline actions
const offlineActionSchema = z.object({
    id: z.string(),
    type: z.string(),
    payload: z.record(z.any()),
    timestamp: z.string().optional()
});

const syncRequestSchema = z.object({
    actions: z.array(offlineActionSchema)
});

/**
 * POST /api/sync
 * Process offline actions queue
 */
router.post('/', async (req, res) => {
    try {
        const { actions } = syncRequestSchema.parse(req.body);
        const results = [];

        for (const action of actions) {
            try {
                console.log(`[Sync] Processing action: ${action.type}`, action.id);

                switch (action.type) {
                    case 'exam_submission':
                        await processExamSubmission(req.user?.id || 'offline-user', action.payload);
                        break;

                    case 'course_completion':
                        await processCourseCompletion(req.user?.id || 'offline-user', action.payload);
                        break;

                    default:
                        console.warn(`[Sync] Unknown action type: ${action.type}`);
                }

                results.push({ id: action.id, status: 'success' });
            } catch (err: any) {
                console.error(`[Sync] Action failed: ${action.id}`, err);
                results.push({ id: action.id, status: 'error', error: err.message });
            }
        }

        res.json({ results });
    } catch (error: any) {
        res.status(400).json({ error: 'Invalid sync payload', details: error.errors || error.message });
    }
});

// Helper: Process Exam Submission
async function processExamSubmission(userId: string, payload: any) {
    const { examId, answers, score, passed, startedAt, submittedAt } = payload;

    if (!examId || !submittedAt) {
        throw new Error('Missing require fields for exam submission');
    }

    // Idempotency check handled by DB constraints or logic here ideally
    // Save submission
    await query(
        `INSERT INTO exam_submissions (id, exam_id, user_id, score, answers, started_at, submitted_at, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW(), NOW())
     ON CONFLICT (exam_id, user_id) DO UPDATE 
     SET score = EXCLUDED.score, answers = EXCLUDED.answers, submitted_at = EXCLUDED.submitted_at`,
        [examId, userId, score || 0, JSON.stringify(answers), startedAt, submittedAt]
    );
}

// Helper: Process Course Completion
async function processCourseCompletion(userId: string, payload: any) {
    const { courseId, grade } = payload || {};
    if (!courseId) {
        throw new Error('Missing required fields for course completion');
    }
    await PrerequisiteService.markCompleted(userId, courseId, typeof grade === 'number' ? grade : undefined);
}

export default router;
