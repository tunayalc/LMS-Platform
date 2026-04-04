
import { Strategy as MicrosoftStrategy } from 'passport-microsoft';
import { query } from '../db';
import { generateTokens, User } from './utils';
import crypto from 'crypto';

export const configureMicrosoftStrategy = (passport: any) => {
    const apiBase = process.env.LMS_API_URL || 'http://localhost:3001';

    passport.use(new MicrosoftStrategy({
        clientID: process.env.MICROSOFT_CLIENT_ID || 'missing-client-id',
        clientSecret: process.env.MICROSOFT_CLIENT_SECRET || 'missing-client-secret',
        callbackURL: process.env.MICROSOFT_CALLBACK_URL || `${apiBase}/auth/microsoft/callback`,
        scope: ['user.read', 'files.readwrite', 'offline_access'], // Files permission for OneDrive
        authorizationURL: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
        tokenURL: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    },
        async (accessToken: string, refreshToken: string, profile: any, done: any) => {
            try {
                const email = profile.emails && profile.emails[0] ? profile.emails[0].value : `${profile.id}@microsoft.com`;

                // Check if user exists by email
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
                    await query('DELETE FROM oauth_tokens WHERE user_id = $1 AND provider = $2', [user.id, 'microsoft']);
                    await query(
                        `INSERT INTO oauth_tokens (id, user_id, provider, access_token, refresh_token, expires_at)
                     VALUES ($1, $2, 'microsoft', $3, $4, NOW() + INTERVAL '1 hour')`,
                        [crypto.randomUUID(), user.id, accessToken, refreshToken]
                    );
                } else {
                    // Register new user (Simplified for now - strictly should require explicit registration)
                    // For integration-only (linking), we might want to restrict this.
                    // But user asked for "Login with Microsoft".
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
                     VALUES ($1, $2, $3, $4, true, 'microsoft_oauth', NOW(), NOW())`,
                        [user.id, user.username, user.email, user.role]
                    );

                    await query(
                        `INSERT INTO oauth_tokens (id, user_id, provider, access_token, refresh_token, expires_at)
                     VALUES ($1, $2, 'microsoft', $3, $4, NOW() + INTERVAL '1 hour')`,
                        [crypto.randomUUID(), user.id, accessToken, refreshToken]
                    );
                }

                return done(null, user);
            } catch (err) {
                console.error("Microsoft Auth Strategy Error:", err);
                return done(err);
            }
        }));
};
