
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { z } from "zod"; // explicit dependency if needed, or remove if not used in this file

// Constants
export const JWT_SECRET = process.env.LMS_JWT_SECRET || "dev-secret-key-change-in-prod";
export const JWT_EXPIRES_IN = "24h";
export const REFRESH_TOKEN_EXPIRES_IN = "7d";

// Roles
export const roles = ["SuperAdmin", "Admin", "Instructor", "Assistant", "Student", "Guest"] as const;
export type Role = (typeof roles)[number];
export const adminRoles: Role[] = ["SuperAdmin", "Admin"];

// Types
export interface User {
    id: string;
    username: string;
    role: Role;
    email: string;
    emailVerified?: boolean;
    fullName?: string;
}

// Helpers
export const isAssistantOrAbove = (role: Role) => adminRoles.includes(role) || role === "Assistant";

export const generateTokens = (user: User) => {
    // @ts-ignore
    const accessToken = jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );

    const refreshToken = crypto.randomBytes(40).toString("hex");
    return { accessToken, refreshToken };
};
