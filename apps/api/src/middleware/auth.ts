
import express from 'express';
import jwt from 'jsonwebtoken';
import { User, Role, JWT_SECRET } from '../auth/utils';

export const writeRoles: Role[] = ["SuperAdmin", "Admin", "Instructor", "Assistant"];

export const getToken = (req: express.Request) => {
    const header = req.headers.authorization;
    if (!header) {
        return null;
    }
    const [scheme, value] = header.split(" ");
    if (!scheme || scheme.toLowerCase() !== "bearer" || !value) {
        return null;
    }
    return value.trim();
};

export const requireAuth: express.RequestHandler = (req, res, next) => {
    const token = getToken(req);
    if (!token) {
        return res.status(401).json({ error: "unauthorized", message: "Missing bearer token." });
    }

    try {
        const payload = jwt.verify(token, JWT_SECRET) as User;
        req.user = payload; // Types are now augmented globally in types.d.ts
        return next();
    } catch (err) {
        return res.status(401).json({ error: "unauthorized", message: "Invalid or expired token." });
    }
};

export const requireRole = (allowed: Role[]): express.RequestHandler => {
    return (req, res, next) => {
        const token = getToken(req);
        if (!token) {
            return res.status(401).json({ error: "unauthorized", message: "Missing bearer token." });
        }

        try {
            const payload = jwt.verify(token, JWT_SECRET) as User;
            if (!allowed.includes(payload.role)) {
                return res.status(403).json({ error: "forbidden", message: "Insufficient role." });
            }
            req.user = payload;
            return next();
        } catch (err) {
            return res.status(401).json({ error: "unauthorized", message: "Invalid or expired token." });
        }
    };
};
