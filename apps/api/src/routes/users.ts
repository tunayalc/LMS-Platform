
import express from 'express';
import { query } from '../db';
import { z } from 'zod';

const router: express.Router = express.Router();

const pushTokenSchema = z.object({
    token: z.string().min(1)
});

/**
 * POST /api/users/push-token
 * Register or update the push notification token for the current user
 */
router.post('/push-token', async (req, res) => {
    try {
        const { token } = pushTokenSchema.parse(req.body);
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        await query(
            `INSERT INTO push_tokens (id, user_id, token, updated_at)
       VALUES (gen_random_uuid(), $1, $2, NOW())
       ON CONFLICT (user_id) DO UPDATE 
       SET token = EXCLUDED.token, updated_at = NOW()`,
            [userId, token]
        );

        res.json({ success: true, message: 'Push token registered' });
    } catch (error: any) {
        console.error('Push token error:', error);
        res.status(400).json({ error: 'Failed to register token', details: error.errors || error.message });
    }
});

export default router;
