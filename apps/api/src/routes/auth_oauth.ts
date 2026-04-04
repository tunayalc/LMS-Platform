
import express from 'express';
import passport from 'passport';
import { generateTokens } from '../auth/utils';

const router = express.Router();

// --- Microsoft ---
router.get('/microsoft', passport.authenticate('microsoft', { session: false }));

router.get('/microsoft/callback',
    passport.authenticate('microsoft', { session: false, failureRedirect: '/login?error=microsoft_auth_failed' }),
    (req, res) => {
        // User is authenticated by passport strategy, which places user in req.user
        const user = req.user as any;
        const tokens = generateTokens(user);

        // Redirect to frontend with tokens
        // In production, use a secure HTTP-only cookie or a temporary code exchange flow
        const frontendUrl = process.env.LMS_WEB_URL || 'http://localhost:3000';
        res.redirect(`${frontendUrl}/auth/callback?token=${tokens.accessToken}&refresh=${tokens.refreshToken}`);
    }
);

// --- Google ---
router.get('/google', passport.authenticate('google', { session: false }));

router.get('/google/callback',
    passport.authenticate('google', { session: false, failureRedirect: '/login?error=google_auth_failed' }),
    (req, res) => {
        const user = req.user as any;
        const tokens = generateTokens(user);

        const frontendUrl = process.env.LMS_WEB_URL || 'http://localhost:3000';
        // Include userId and role for frontend to use
        res.redirect(`${frontendUrl}/auth/callback?token=${tokens.accessToken}&refresh=${tokens.refreshToken}&userId=${user.id}&role=${user.role}`);
    }
);

export default router;
