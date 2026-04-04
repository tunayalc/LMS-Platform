
import express from 'express';
import { z } from 'zod';
import { LdapService } from '../services/ldap';
import { generateTokens } from '../auth/utils';
import { query } from '../db';
import { Role } from '../auth/utils'; // Optional if needed for type casting

const router = express.Router();

const loginSchema = z.object({
    username: z.string().min(1),
    password: z.string().min(1)
});

/**
 * POST /auth/ldap/login
 * Authenticate with LDAP credentials
 */
router.post('/login', async (req, res) => {
    try {
        const { username, password } = loginSchema.parse(req.body);

        const result = await LdapService.authenticate(username, password);

        if (!result.success || !result.user) {
            return res.status(401).json({ error: result.error || 'Authentication failed' });
        }

        // Sync user to local DB
        const { id, role } = await LdapService.syncUser(result.user);

        // Generate JWT Tokens
        // Note: generateTokens needs to be imported. If it's not exported from index.ts, we need to refactor.
        // For now, assuming we export it or duplicate logic (better to export).
        const tokens = generateTokens({ id, username, role: role as any, email: result.user.email });

        res.json({
            success: true,
            user: { id, username, role },
            ...tokens
        });

    } catch (error: any) {
        console.error('LDAP Login error:', error);
        res.status(400).json({ error: 'Login failed', details: error.errors || error.message });
    }
});

export default router;
