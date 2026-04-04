
import express from 'express';
import { LtiService } from '../services/lti';
import { query } from '../db';

const router = express.Router();

/**
 * GET /api/lti/login
 * OIDC Login Initiation
 */
router.get('/login', async (req, res) => {
    const { login_hint, target_link_uri, lti_message_hint } = req.query;

    if (!login_hint || !target_link_uri) {
        return res.status(400).send('Missing required OIDC parameters');
    }

    try {
        const response = LtiService.generateLoginResponse(
            login_hint as string,
            target_link_uri as string,
            lti_message_hint as string
        );

        // Store nonce check if needed (in session/cookie)
        res.redirect(response.redirectUrl);
    } catch (error) {
        console.error('LTI Login Error:', error);
        res.status(500).send('Internal LTI Error');
    }
});

/**
 * POST /api/lti/launch
 * LTI 1.3 Launch Handler
 */
router.post('/launch', async (req, res) => {
    const { id_token, state } = req.body;

    if (!id_token) {
        return res.status(400).send('Missing id_token');
    }

    try {
        // Validate launch
        // Nonce validation would require retrieving state storage from login step. 
        // For stateless verify, we assume nonce claim in token is enough unique check if we track it.
        const validation = await LtiService.validateLaunch(id_token, state, 'nonce-placeholder');

        if (!validation.valid || !validation.claims) {
            return res.status(401).send(`Launch validation failed: ${validation.error}`);
        }

        // Provision User
        const { id, role } = await LtiService.provisionUser(validation.claims);

        // Generate App Token
        const { generateTokens } = require('../auth/utils');
        const { accessToken } = generateTokens({ id, role: role as any, username: validation.claims.name, email: validation.claims.email });

        // Redirect to Dashboard with token
        res.redirect(`${process.env.APP_URL}/auth/callback?token=${accessToken}&type=lti`);

    } catch (error) {
        console.error('LTI Launch Error:', error);
        res.status(500).send('Launch failed');
    }
});

/**
 * GET /api/lti/jwks
 * JWKS Endpoint
 */
router.get('/jwks', async (req, res) => {
    const jwks = await LtiService.getJwks();
    res.json(jwks);
});

export default router;
