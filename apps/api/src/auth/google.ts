
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { query } from '../db';
import { generateTokens } from './utils';
import crypto from 'crypto';

export const configureGoogleStrategy = (passport: any) => {
    const apiBase = process.env.LMS_API_URL || 'http://localhost:3001';

    const clientID = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientID || !clientSecret) {
        console.error("❌ [GoogleAuth] Missing Credentials. ID:", clientID ? "Set" : "Missing", "Secret:", clientSecret ? "Set" : "Missing");
    }

    passport.use(new GoogleStrategy({
        clientID: clientID || 'missing-id',
        clientSecret: clientSecret || 'missing-secret',
        callbackURL: process.env.GOOGLE_CALLBACK_URL || `${apiBase}/auth/google/callback`,
        scope: ['profile', 'email', 'https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/calendar'],
        proxy: true
    },
        async (accessToken: string, refreshToken: string, profile: any, done: any) => {
            try {
                const email = profile.emails && profile.emails[0] ? profile.emails[0].value : `${profile.id}@google.com`;
                console.log("[GoogleAuth] Processing email:", email);
                const existingUser = await query('SELECT * FROM users WHERE email = $1', [email]);

                let user;
                if (existingUser.rows.length > 0) {
                    const raw = existingUser.rows[0];
                    user = {
                        id: raw.id,
                        username: raw.username,
                        email: raw.email,
                        role: raw.role,
                        emailVerified: raw.email_verified || raw.emailVerified // Handle snake_case from DB
                    };

                    // Update tokens (Delete + Insert to avoid pg-mem ON CONFLICT issues)
                    await query('DELETE FROM oauth_tokens WHERE user_id = $1 AND provider = $2', [user.id, 'google']);
                    await query(
                        `INSERT INTO oauth_tokens (id, user_id, provider, access_token, refresh_token, expires_at)
                     VALUES ($1, $2, 'google', $3, $4, NOW() + INTERVAL '1 hour')`,
                        [crypto.randomUUID(), user.id, accessToken, refreshToken]
                    );
                } else {
                    // Register new user (Simplified)
                    const newId = crypto.randomUUID();
                    user = {
                        id: newId,
                        username: email.split('@')[0],
                        email: email,
                        role: 'Student', // Default
                        emailVerified: true
                    };

                    await query(
                        `INSERT INTO users (id, username, email, role, email_verified, password_hash, created_at, updated_at)
                     VALUES ($1, $2, $3, $4, true, 'google_oauth', NOW(), NOW())`,
                        [user.id, user.username, user.email, user.role]
                    );

                    await query(
                        `INSERT INTO oauth_tokens (id, user_id, provider, access_token, refresh_token, expires_at)
                     VALUES ($1, $2, 'google', $3, $4, NOW() + INTERVAL '1 hour')`,
                        [crypto.randomUUID(), user.id, accessToken, refreshToken]
                    );
                }

                return done(null, user);
            } catch (err) {
                console.error("Google Auth Strategy Error:", err);
                return done(err);
            }
        }));
};
