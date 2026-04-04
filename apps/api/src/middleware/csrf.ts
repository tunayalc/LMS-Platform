/**
 * CSRF Protection Middleware
 * Implements Double Submit Cookie pattern for API protection
 */

import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

const CSRF_COOKIE_NAME = 'csrf_token';
const CSRF_HEADER_NAME = 'x-csrf-token';
const TOKEN_LENGTH = 32;

// Store for tokens (in production, use Redis with expiry)
const tokenStore = new Map<string, { created: number; userId?: string }>();

// Clean old tokens periodically
setInterval(() => {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    for (const [token, data] of tokenStore.entries()) {
        if (now - data.created > maxAge) {
            tokenStore.delete(token);
        }
    }
}, 60 * 60 * 1000); // Every hour

export const CsrfService = {
    /**
     * Generate new CSRF token
     */
    generateToken: (userId?: string): string => {
        const token = crypto.randomBytes(TOKEN_LENGTH).toString('hex');
        tokenStore.set(token, { created: Date.now(), userId });
        return token;
    },

    /**
     * Validate CSRF token
     */
    validateToken: (token: string, userId?: string): boolean => {
        const data = tokenStore.get(token);
        if (!data) return false;

        // Check if token is expired (1 hour)
        if (Date.now() - data.created > 60 * 60 * 1000) {
            tokenStore.delete(token);
            return false;
        }

        // If userId provided, verify it matches
        if (userId && data.userId && data.userId !== userId) {
            return false;
        }

        return true;
    },

    /**
     * Invalidate token after use (for extra security)
     */
    invalidateToken: (token: string): void => {
        tokenStore.delete(token);
    }
};

/**
 * CSRF Protection Middleware
 * - Sets CSRF cookie on all responses
 * - Validates CSRF header/body on state-changing requests (POST, PUT, DELETE, PATCH)
 */
export const csrfMiddleware = (options?: {
    excludePaths?: string[];
    excludeMethods?: string[];
}) => {
    const excludePaths = options?.excludePaths || ['/api/webhooks', '/api/lti', '/api/auth'];
    const excludeMethods = options?.excludeMethods || ['GET', 'HEAD', 'OPTIONS'];

    return (req: Request, res: Response, next: NextFunction) => {
        // Check if path is excluded
        const isExcluded = excludePaths.some(path => req.path.startsWith(path));
        if (isExcluded) {
            return next();
        }

        // Skip for safe methods
        if (excludeMethods.includes(req.method)) {
            // Set CSRF token cookie on safe requests
            let token = req.cookies?.[CSRF_COOKIE_NAME];
            if (!token) {
                token = CsrfService.generateToken((req as any).user?.id);
                res.cookie(CSRF_COOKIE_NAME, token, {
                    httpOnly: false, // Must be readable by JS
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'strict',
                    maxAge: 60 * 60 * 1000 // 1 hour
                });
            }
            return next();
        }

        // Validate CSRF token for state-changing requests
        const headerToken = req.headers[CSRF_HEADER_NAME] as string;
        const bodyToken = req.body?._csrf;
        const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
        const token = headerToken || bodyToken;

        if (!token || !cookieToken) {
            return res.status(403).json({
                error: 'CSRF token missing',
                message: 'İstek için CSRF token gerekli'
            });
        }

        // Double submit cookie validation
        if (token !== cookieToken) {
            return res.status(403).json({
                error: 'CSRF token mismatch',
                message: 'CSRF token doğrulaması başarısız'
            });
        }

        // Validate token exists in store
        if (!CsrfService.validateToken(token, (req as any).user?.id)) {
            return res.status(403).json({
                error: 'CSRF token invalid or expired',
                message: 'CSRF token geçersiz veya süresi dolmuş'
            });
        }

        // Regenerate token after successful validation (optional, more secure)
        const newToken = CsrfService.generateToken((req as any).user?.id);
        res.cookie(CSRF_COOKIE_NAME, newToken, {
            httpOnly: false,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 60 * 60 * 1000
        });

        next();
    };
};

/**
 * Get CSRF token endpoint handler
 */
export const getCsrfToken = (req: Request, res: Response) => {
    const token = CsrfService.generateToken((req as any).user?.id);

    res.cookie(CSRF_COOKIE_NAME, token, {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 60 * 60 * 1000
    });

    res.json({ csrfToken: token });
};

export default csrfMiddleware;
