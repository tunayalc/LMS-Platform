
import express from 'express';
import { z } from 'zod';
import { PushNotificationService } from '../services/push';
import { query } from '../db';
import { requireAuth } from '../middleware/auth';

const router = express.Router();
router.use(requireAuth);

const testPushSchema = z.object({
    userId: z.string().optional(),
    token: z.string().optional(),
    title: z.string().min(1),
    body: z.string().min(1),
});

/**
 * POST /api/push/test
 * Send a test notification to a specific user or token.
 * Requires Admin privileges (middleware to be added in index.ts or here).
 */
router.post('/test', async (req, res) => {
    const user = req.user;
    if (!user) {
        return res.status(401).json({ error: 'unauthorized' });
    }

    // Admin only
    if (!['SuperAdmin', 'Admin'].includes(user.role)) {
        return res.status(403).json({ error: 'Forbidden' });
    }

    try {
        const { userId, token, title, body } = testPushSchema.parse(req.body);

        let targetTokens: string[] = [];

        if (token) {
            targetTokens = [token];
        } else if (userId) {
            // Fetch user's token from DB
            const { rows } = await query('SELECT token FROM push_tokens WHERE user_id = $1', [userId]);
            if (rows.length > 0) {
                targetTokens = rows.map(r => r.token);
            } else {
                return res.status(404).json({ error: 'User has no registered push tokens' });
            }
        } else {
            return res.status(400).json({ error: 'Either userId or token must be provided' });
        }

        const result = await PushNotificationService.notifyUsers(targetTokens, {
            title,
            body,
            data: { type: 'test_notification' }
        });

        res.json({
            success: true,
            sent: result.success,
            failed: result.failed,
            message: `Attempted to send to ${targetTokens.length} tokens`
        });

    } catch (error: any) {
        console.error('Test push error:', error);
        res.status(400).json({ error: 'Failed to send test push', details: error.errors || error.message });
    }
});

export default router;
