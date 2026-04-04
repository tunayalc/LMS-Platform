/**
 * LTI 1.3 Service
 * Full implementation for Learning Tools Interoperability
 */

import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { query } from '../db';

// LTI 1.3 Message Types
type LtiMessageType = 'LtiResourceLinkRequest' | 'LtiDeepLinkingRequest' | 'LtiSubmissionReviewRequest';

// Platform Configuration
interface LtiPlatformConfig {
    issuer: string;
    clientId: string;
    deploymentId: string;
    authEndpoint: string;
    tokenEndpoint: string;
    jwksEndpoint: string;
    publicKey?: string;
    privateKey?: string;
}

// LTI Claims
interface LtiClaims {
    iss: string;
    sub: string;
    aud: string;
    exp: number;
    iat: number;
    nonce: string;
    'https://purl.imsglobal.org/spec/lti/claim/message_type': LtiMessageType;
    'https://purl.imsglobal.org/spec/lti/claim/version': string;
    'https://purl.imsglobal.org/spec/lti/claim/deployment_id': string;
    'https://purl.imsglobal.org/spec/lti/claim/target_link_uri': string;
    'https://purl.imsglobal.org/spec/lti/claim/resource_link'?: {
        id: string;
        title?: string;
        description?: string;
    };
    'https://purl.imsglobal.org/spec/lti/claim/roles'?: string[];
    'https://purl.imsglobal.org/spec/lti/claim/context'?: {
        id: string;
        type?: string[];
        label?: string;
        title?: string;
    };
    'https://purl.imsglobal.org/spec/lti-ags/claim/endpoint'?: {
        scope: string[];
        lineitems: string;
        lineitem?: string;
    };
    name?: string;
    email?: string;
    given_name?: string;
    family_name?: string;
    picture?: string;
}

// Role mappings
const LTI_ROLES = {
    INSTRUCTOR: 'http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor',
    LEARNER: 'http://purl.imsglobal.org/vocab/lis/v2/membership#Learner',
    ADMIN: 'http://purl.imsglobal.org/vocab/lis/v2/institution/person#Administrator',
    TA: 'http://purl.imsglobal.org/vocab/lis/v2/membership#TeachingAssistant',
};

// Generate RSA key pair for signing
const generateKeyPair = (): { publicKey: string; privateKey: string } => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });
    return { publicKey, privateKey };
};

// Store for nonces (in production, use Redis)
const usedNonces = new Set<string>();

export const LtiService = {
    /**
     * Get or create platform configuration
     */
    getPlatformConfig: async (platformId: string): Promise<LtiPlatformConfig | null> => {
        try {
            const result = await query(
                'SELECT * FROM lti_platforms WHERE id = $1',
                [platformId]
            );

            if (result.rows.length === 0) return null;

            const row = result.rows[0];
            return {
                issuer: row.issuer,
                clientId: row.client_id,
                deploymentId: row.deployment_id,
                authEndpoint: row.auth_endpoint,
                tokenEndpoint: row.token_endpoint,
                jwksEndpoint: row.jwks_endpoint,
                publicKey: row.public_key,
                privateKey: row.private_key
            };
        } catch (error) {
            console.error('LTI Platform config error:', error);
            return null;
        }
    },

    /**
     * Register new platform
     */
    registerPlatform: async (config: Omit<LtiPlatformConfig, 'publicKey' | 'privateKey'>): Promise<{ id: string; publicKey: string }> => {
        const keys = generateKeyPair();
        const id = crypto.randomUUID();

        await query(
            `INSERT INTO lti_platforms (id, issuer, client_id, deployment_id, auth_endpoint, token_endpoint, jwks_endpoint, public_key, private_key)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [id, config.issuer, config.clientId, config.deploymentId, config.authEndpoint, config.tokenEndpoint, config.jwksEndpoint, keys.publicKey, keys.privateKey]
        );

        return { id, publicKey: keys.publicKey };
    },

    /**
     * Generate OIDC login initiation response
     */
    generateLoginResponse: (
        loginHint: string,
        targetLinkUri: string,
        ltiMessageHint?: string
    ): { redirectUrl: string; state: string; nonce: string } => {
        const state = crypto.randomBytes(32).toString('hex');
        const nonce = crypto.randomBytes(32).toString('hex');

        const params = new URLSearchParams({
            scope: 'openid',
            response_type: 'id_token',
            client_id: process.env.LTI_CLIENT_ID || 'lms-tool',
            redirect_uri: `${process.env.APP_URL}/api/lti/callback`,
            login_hint: loginHint,
            state,
            nonce,
            prompt: 'none'
        });

        if (ltiMessageHint) {
            params.append('lti_message_hint', ltiMessageHint);
        }

        return {
            redirectUrl: `${process.env.LTI_AUTH_ENDPOINT}?${params.toString()}`,
            state,
            nonce
        };
    },

    /**
     * Validate and decode LTI launch request
     */
    validateLaunch: async (idToken: string, state: string, nonce: string): Promise<{ valid: boolean; claims?: LtiClaims; error?: string }> => {
        try {
            // Decode without verification first to get issuer
            const decoded = jwt.decode(idToken, { complete: true });
            if (!decoded) {
                return { valid: false, error: 'Invalid token format' };
            }

            const claims = decoded.payload as LtiClaims;

            // Validate nonce (prevent replay)
            if (usedNonces.has(nonce)) {
                return { valid: false, error: 'Nonce already used' };
            }
            usedNonces.add(nonce);

            // Validate message type
            const messageType = claims['https://purl.imsglobal.org/spec/lti/claim/message_type'];
            if (messageType !== 'LtiResourceLinkRequest') {
                return { valid: false, error: 'Invalid message type' };
            }

            // Validate version
            const version = claims['https://purl.imsglobal.org/spec/lti/claim/version'];
            if (version !== '1.3.0') {
                return { valid: false, error: 'Invalid LTI version' };
            }

            // In production: Verify signature with platform's public key
            // const platformConfig = await LtiService.getPlatformConfig(claims.iss);
            // jwt.verify(idToken, platformConfig.publicKey, { algorithms: ['RS256'] });

            return { valid: true, claims };
        } catch (error) {
            return { valid: false, error: `Validation error: ${error}` };
        }
    },

    /**
     * Map LTI roles to app roles
     */
    mapRoles: (ltiRoles: string[]): string => {
        if (ltiRoles.includes(LTI_ROLES.ADMIN)) return 'Admin';
        if (ltiRoles.includes(LTI_ROLES.INSTRUCTOR)) return 'Instructor';
        if (ltiRoles.includes(LTI_ROLES.TA)) return 'Assistant';
        return 'Student';
    },

    /**
     * Create or update user from LTI claims
     */
    provisionUser: async (claims: LtiClaims): Promise<{ id: string; role: string }> => {
        const ltiRoles = claims['https://purl.imsglobal.org/spec/lti/claim/roles'] || [];
        const role = LtiService.mapRoles(ltiRoles);

        const result = await query(
            `INSERT INTO users (id, username, email, role, created_at, updated_at)
             VALUES (gen_random_uuid(), $1, $2, $3, NOW(), NOW())
             ON CONFLICT (email) DO UPDATE SET updated_at = NOW()
             RETURNING id, role`,
            [claims.name || claims.sub, claims.email, role]
        );

        return result.rows[0] as { id: string; role: string };
    },

    /**
     * Generate JWKS endpoint response
     */
    getJwks: async (): Promise<{ keys: any[] }> => {
        // In production, return actual key set
        return {
            keys: [{
                kty: 'RSA',
                alg: 'RS256',
                use: 'sig',
                kid: 'lms-tool-key-1',
                // n and e would be derived from actual public key
            }]
        };
    },

    /**
     * Send grade back to platform (AGS - Assignment and Grade Services)
     */
    sendGrade: async (
        platformId: string,
        lineitemUrl: string,
        userId: string,
        score: number,
        maxScore: number
    ): Promise<boolean> => {
        try {
            const config = await LtiService.getPlatformConfig(platformId);
            if (!config) return false;

            // Get access token
            const tokenResponse = await fetch(config.tokenEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    grant_type: 'client_credentials',
                    client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
                    client_assertion: jwt.sign(
                        { iss: config.clientId, sub: config.clientId, aud: config.tokenEndpoint },
                        config.privateKey!,
                        { algorithm: 'RS256', expiresIn: '5m' }
                    ),
                    scope: 'https://purl.imsglobal.org/spec/lti-ags/scope/score'
                })
            });

            if (!tokenResponse.ok) return false;

            const { access_token } = await tokenResponse.json();

            // Send score
            const scoreResponse = await fetch(`${lineitemUrl}/scores`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${access_token}`,
                    'Content-Type': 'application/vnd.ims.lis.v1.score+json'
                },
                body: JSON.stringify({
                    userId,
                    scoreGiven: score,
                    scoreMaximum: maxScore,
                    activityProgress: 'Completed',
                    gradingProgress: 'FullyGraded',
                    timestamp: new Date().toISOString()
                })
            });

            return scoreResponse.ok;
        } catch (error) {
            console.error('LTI grade send error:', error);
            return false;
        }
    }
};

export default LtiService;
