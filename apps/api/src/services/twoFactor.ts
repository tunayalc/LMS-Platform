/**
 * Two-Factor Authentication (2FA) Service
 * TOTP (Time-based One-Time Password) implementation
 */

import crypto from 'crypto';
import { query } from '../db';

// TOTP Configuration
const TOTP_CONFIG = {
    digits: 6,
    period: 30, // seconds
    algorithm: 'sha1' as const,
    issuer: process.env.APP_NAME || 'LMS Platform'
};

// Base32 encoding for secrets
const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

const base32Encode = (buffer: Buffer): string => {
    let result = '';
    let bits = 0;
    let value = 0;

    for (const byte of buffer) {
        value = (value << 8) | byte;
        bits += 8;

        while (bits >= 5) {
            result += BASE32_CHARS[(value >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }

    if (bits > 0) {
        result += BASE32_CHARS[(value << (5 - bits)) & 31];
    }

    return result;
};

const base32Decode = (encoded: string): Buffer => {
    const cleaned = encoded.toUpperCase().replace(/[^A-Z2-7]/g, '');
    const bytes: number[] = [];
    let bits = 0;
    let value = 0;

    for (const char of cleaned) {
        const index = BASE32_CHARS.indexOf(char);
        if (index === -1) continue;

        value = (value << 5) | index;
        bits += 5;

        if (bits >= 8) {
            bytes.push((value >>> (bits - 8)) & 255);
            bits -= 8;
        }
    }

    return Buffer.from(bytes);
};

export const TwoFactorService = {
    /**
     * Generate new TOTP secret
     */
    generateSecret: (): { secret: string; base32: string } => {
        const buffer = crypto.randomBytes(20);
        const base32 = base32Encode(buffer);
        return {
            secret: buffer.toString('hex'), // This is NOT used by Google Auth, base32 is
            base32 // Key for Google Auth
        };
    },

    /**
     * Generate Provisioning URI
     */
    generateProvisioningUri: (options: { secret: { base32: string } | string; accountName: string; issuer: string }): string => {
        const secretKey = typeof options.secret === 'string' ? options.secret : options.secret.base32;
        return `otpauth://totp/${encodeURIComponent(options.issuer)}:${encodeURIComponent(options.accountName)}?secret=${secretKey}&issuer=${encodeURIComponent(options.issuer)}&algorithm=SHA1&digits=${TOTP_CONFIG.digits}&period=${TOTP_CONFIG.period}`;
    },

    /**
     * Generate TOTP code for current time
     */
    generateCode: (secret: string, time?: number): string => {
        const currentTime = time || Math.floor(Date.now() / 1000);
        const counter = Math.floor(currentTime / TOTP_CONFIG.period);

        // Convert counter to 8-byte buffer
        const counterBuffer = Buffer.alloc(8);
        counterBuffer.writeBigUInt64BE(BigInt(counter));

        // Decode secret from base32
        const secretBuffer = base32Decode(secret);

        // Generate HMAC
        const hmac = crypto.createHmac(TOTP_CONFIG.algorithm, secretBuffer);
        hmac.update(counterBuffer);
        const hash = hmac.digest();

        // Dynamic truncation
        const offset = hash[hash.length - 1] & 0x0f;
        const binary = (
            ((hash[offset] & 0x7f) << 24) |
            ((hash[offset + 1] & 0xff) << 16) |
            ((hash[offset + 2] & 0xff) << 8) |
            (hash[offset + 3] & 0xff)
        );

        // Generate code with leading zeros
        const code = (binary % Math.pow(10, TOTP_CONFIG.digits)).toString();
        return code.padStart(TOTP_CONFIG.digits, '0');
    },

    /**
     * Verify TOTP code
     */
    verifyCode: (secret: string, code: string, window: number = 1): { valid: boolean } => {
        const currentTime = Math.floor(Date.now() / 1000);

        // Check current and adjacent time windows
        for (let i = -window; i <= window; i++) {
            const checkTime = currentTime + (i * TOTP_CONFIG.period);
            const expectedCode = TwoFactorService.generateCode(secret, checkTime);

            if (code === expectedCode) {
                return { valid: true };
            }
        }

        return { valid: false };
    },

    /**
     * Generate QR code URL for authenticator apps
     */
    generateQrUrl: (secret: string, userEmail: string): string => {
        const otpauth = `otpauth://totp/${encodeURIComponent(TOTP_CONFIG.issuer)}:${encodeURIComponent(userEmail)}?secret=${secret}&issuer=${encodeURIComponent(TOTP_CONFIG.issuer)}&algorithm=SHA1&digits=${TOTP_CONFIG.digits}&period=${TOTP_CONFIG.period}`;

        // Return URL for QR code generation (use with qrcode library or Google Charts)
        return `https://chart.googleapis.com/chart?chs=200x200&chld=M|0&cht=qr&chl=${encodeURIComponent(otpauth)}`;
    },

    /**
     * Generate Backup Codes (Alias)
     */
    generateBackupCodes: (): string[] => {
        const codes: string[] = [];
        for (let i = 0; i < 10; i++) {
            codes.push(crypto.randomBytes(4).toString('hex').toUpperCase());
        }
        return codes;
    },

    /**
     * Verify Backup Code
     */
    verifyBackupCode: (code: string, backupCodes: string[]): { valid: boolean; remainingCodes: string[] } => {
        const normalizedCode = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
        const codeIndex = backupCodes.findIndex(bc => bc === normalizedCode);

        if (codeIndex !== -1) {
            const remaining = [...backupCodes];
            remaining.splice(codeIndex, 1);
            return { valid: true, remainingCodes: remaining };
        }

        return { valid: false, remainingCodes: backupCodes };
    },

    /**
     * Regenerate backup codes (DB access)
     */
    regenerateBackupCodes: async (userId: string): Promise<string[]> => {
        const backupCodes: string[] = [];
        for (let i = 0; i < 10; i++) {
            backupCodes.push(crypto.randomBytes(4).toString('hex').toUpperCase());
        }

        await query(
            'UPDATE users SET two_factor_backup_codes = $2, updated_at = NOW() WHERE id = $1',
            [userId, JSON.stringify(backupCodes)]
        );

        return backupCodes;
    },

    /**
     * Enable 2FA for user
     */
    enable: async (userId: string): Promise<{ secret: string; qrUrl: string; backupCodes: string[] }> => {
        const { secret, base32 } = TwoFactorService.generateSecret();

        // Generate backup codes
        const backupCodes: string[] = [];
        for (let i = 0; i < 10; i++) {
            backupCodes.push(crypto.randomBytes(4).toString('hex').toUpperCase());
        }

        // Get user email
        const userResult = await query('SELECT email FROM users WHERE id = $1', [userId]);
        const email = userResult.rows[0]?.email || 'user@example.com';

        await query(
            `UPDATE users SET 
                two_factor_secret = $2,
                two_factor_backup_codes = $3,
                two_factor_enabled = false,
                updated_at = NOW()
             WHERE id = $1`,
            [userId, base32, JSON.stringify(backupCodes)]
        );

        return {
            secret: base32,
            qrUrl: TwoFactorService.generateQrUrl(base32, email),
            backupCodes
        };
    },

    /**
     * Confirm and activate 2FA
     */
    confirm: async (userId: string, code: string): Promise<boolean> => {
        const result = await query(
            'SELECT two_factor_secret FROM users WHERE id = $1',
            [userId]
        );

        if (result.rows.length === 0) return false;

        const secret = result.rows[0].two_factor_secret;
        if (!secret) return false;

        const verify = TwoFactorService.verifyCode(secret, code);

        if (verify.valid) {
            await query(
                'UPDATE users SET two_factor_enabled = true, updated_at = NOW() WHERE id = $1',
                [userId]
            );
            return true;
        }

        return false;
    },

    /**
     * Verify 2FA during login
     */
    verify: async (userId: string, code: string): Promise<{ valid: boolean; method: 'totp' | 'backup' }> => {
        const result = await query(
            'SELECT two_factor_secret, two_factor_backup_codes FROM users WHERE id = $1',
            [userId]
        );

        if (result.rows.length === 0) {
            return { valid: false, method: 'totp' };
        }

        const { two_factor_secret, two_factor_backup_codes } = result.rows[0];

        // Try TOTP first
        if (TwoFactorService.verifyCode(two_factor_secret, code).valid) {
            return { valid: true, method: 'totp' };
        }

        // Try backup codes
        const backupCodes: string[] = JSON.parse(two_factor_backup_codes || '[]');
        const verifyBackup = TwoFactorService.verifyBackupCode(code, backupCodes);

        if (verifyBackup.valid) {
            await query(
                'UPDATE users SET two_factor_backup_codes = $2, updated_at = NOW() WHERE id = $1',
                [userId, JSON.stringify(verifyBackup.remainingCodes)]
            );
            return { valid: true, method: 'backup' };
        }

        return { valid: false, method: 'totp' };
    },

    /**
     * Disable 2FA
     */
    disable: async (userId: string): Promise<boolean> => {
        await query(
            `UPDATE users SET 
                two_factor_enabled = false,
                two_factor_secret = NULL,
                two_factor_backup_codes = NULL,
                updated_at = NOW()
             WHERE id = $1`,
            [userId]
        );
        return true;
    },

    /**
     * Check if user has 2FA enabled
     */
    isEnabled: async (userId: string): Promise<boolean> => {
        const result = await query(
            'SELECT two_factor_enabled FROM users WHERE id = $1',
            [userId]
        );
        return result.rows[0]?.two_factor_enabled === true;
    },
};

export default TwoFactorService;
