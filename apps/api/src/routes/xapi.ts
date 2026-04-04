
import express from 'express';
import { XApiService, XAPI_VERBS } from '../services/xapi';

const router = express.Router();

/**
 * POST /api/xapi/statements
 * Receive xAPI statements from frontend
 */
router.post('/statements', async (req, res) => {
    try {
        const statement = req.body;
        // In a real LRS proxy, validation is complex.
        // Here we just forward it to our internal logic or LRS.

        // Log locally
        if (process.env.LMS_AUTH_MODE === 'mock') {
            console.log('[xAPI] Received statement:', JSON.stringify(statement, null, 2));
            // Simulate success
            return res.json([statement.id || 'stub-id']);
        }

        const result = await XApiService.sendStatement(statement);

        if (result.success) {
            res.json([result.id]);
        } else {
            res.status(502).json({ error: result.error });
        }
    } catch (error: any) {
        console.error('xAPI Error:', error);
        res.status(500).json({ error: 'Failed to process statement' });
    }
});

export default router;
