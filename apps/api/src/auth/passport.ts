import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { query } from "../db";
import { randomUUID } from "crypto";

// Fallback Mock Strategy if credentials are missing
class MockStrategy extends passport.Strategy {
    name = "google";
    authenticate() {
        // Simulate successful Google profile
        const profile = {
            id: "mock-google-id-123456",
            displayName: "Mock Google User",
            emails: [{ value: "mock.user@gmail.com", verified: true }],
            photos: [{ value: "https://via.placeholder.com/96" }],
            provider: "google"
        };
        this.success(profile as any);
    }
}

export const setupPassport = () => {
    const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
    const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
    const CALLBACK_URL = process.env.GOOGLE_CALLBACK_URL || "http://localhost:3001/auth/google/callback";

    if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && GOOGLE_CLIENT_ID !== "buraya_client_id_yapıştırın") {
        console.log("✅ Google OAuth configured with REAL credentials.");
        passport.use(
            new GoogleStrategy(
                {
                    clientID: GOOGLE_CLIENT_ID,
                    clientSecret: GOOGLE_CLIENT_SECRET,
                    callbackURL: CALLBACK_URL
                },
                async (accessToken, refreshToken, profile, done) => {
                    try {
                        return done(null, profile as any);
                    } catch (err) {
                        return done(err as Error, undefined);
                    }
                }
            )
        );
    } else {
        console.warn("⚠️  Google OAuth credentials missing. Using MOCK strategy.");
        passport.use(new MockStrategy());
    }

    passport.serializeUser((user: any, done) => {
        done(null, user);
    });

    passport.deserializeUser((user: any, done) => {
        done(null, user);
    });
};
