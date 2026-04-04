/**
 * Rate Limiting Middleware
 * Protects API from abuse and DDoS attacks
 */

import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

// General API rate limiter
export const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: {
        error: 'Çok fazla istek gönderdiniz. Lütfen 15 dakika sonra tekrar deneyin.',
        retryAfter: 15
    },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    handler: (req: Request, res: Response) => {
        res.status(429).json({
            error: 'Rate limit exceeded',
            message: 'Çok fazla istek gönderdiniz. Lütfen 15 dakika sonra tekrar deneyin.',
            retryAfter: 15 * 60
        });
    }
});

// Stricter limiter for authentication endpoints
export const authLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // limit each IP to 10 login attempts per hour
    message: {
        error: 'Çok fazla giriş denemesi. Lütfen 1 saat sonra tekrar deneyin.',
        retryAfter: 60
    },
    skipSuccessfulRequests: true, // Don't count successful logins
    handler: (req: Request, res: Response) => {
        res.status(429).json({
            error: 'Too many login attempts',
            message: 'Çok fazla giriş denemesi. Lütfen 1 saat sonra tekrar deneyin.',
            retryAfter: 60 * 60
        });
    }
});

// Password reset limiter
export const passwordResetLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5, // limit each IP to 5 password reset requests per hour
    message: {
        error: 'Çok fazla şifre sıfırlama isteği.',
        retryAfter: 60
    }
});

// File upload limiter
export const uploadLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 50, // limit each IP to 50 uploads per hour
    message: {
        error: 'Çok fazla dosya yükleme isteği.',
        retryAfter: 60
    }
});

export default {
    apiLimiter,
    authLimiter,
    passwordResetLimiter,
    uploadLimiter
};
