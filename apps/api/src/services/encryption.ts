/**
 * Encryption Service
 * AES-256 encryption for sensitive data
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const SALT_LENGTH = 64;
const KEY_LENGTH = 32;

// Get encryption key from environment or generate one
const getKey = (): Buffer => {
    const envKey = process.env.ENCRYPTION_KEY;
    if (envKey) {
        // Use provided key (must be 32 bytes / 64 hex chars)
        return Buffer.from(envKey, 'hex');
    }
    // Fallback: derive from secret
    const secret = process.env.JWT_SECRET || 'default-secret-change-me';
    return crypto.scryptSync(secret, 'lms-salt', KEY_LENGTH);
};

export const EncryptionService = {
    /**
     * Encrypt data using AES-256-GCM
     */
    encrypt: (plaintext: string): string => {
        const key = getKey();
        const iv = crypto.randomBytes(IV_LENGTH);

        const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

        let encrypted = cipher.update(plaintext, 'utf8', 'hex');
        encrypted += cipher.final('hex');

        const authTag = cipher.getAuthTag();

        // Return IV + AuthTag + Encrypted data (all in hex)
        return iv.toString('hex') + authTag.toString('hex') + encrypted;
    },

    /**
     * Decrypt data using AES-256-GCM
     */
    decrypt: (ciphertext: string): string => {
        const key = getKey();

        // Extract IV, auth tag, and encrypted data
        const iv = Buffer.from(ciphertext.slice(0, IV_LENGTH * 2), 'hex');
        const authTag = Buffer.from(ciphertext.slice(IV_LENGTH * 2, (IV_LENGTH + TAG_LENGTH) * 2), 'hex');
        const encrypted = ciphertext.slice((IV_LENGTH + TAG_LENGTH) * 2);

        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    },

    /**
     * Hash sensitive data (one-way)
     */
    hash: (data: string): string => {
        const salt = crypto.randomBytes(SALT_LENGTH);
        const hash = crypto.pbkdf2Sync(data, salt, 100000, 64, 'sha512');
        return salt.toString('hex') + ':' + hash.toString('hex');
    },

    /**
     * Verify hashed data
     */
    verifyHash: (data: string, storedHash: string): boolean => {
        const [salt, hash] = storedHash.split(':');
        const saltBuffer = Buffer.from(salt, 'hex');
        const newHash = crypto.pbkdf2Sync(data, saltBuffer, 100000, 64, 'sha512');
        return hash === newHash.toString('hex');
    },

    /**
     * Encrypt object data
     */
    encryptObject: (obj: object): string => {
        return EncryptionService.encrypt(JSON.stringify(obj));
    },

    /**
     * Decrypt to object
     */
    decryptObject: <T>(ciphertext: string): T => {
        const decrypted = EncryptionService.decrypt(ciphertext);
        return JSON.parse(decrypted) as T;
    },

    /**
     * Generate random encryption key (for initial setup)
     */
    generateKey: (): string => {
        return crypto.randomBytes(KEY_LENGTH).toString('hex');
    }
};

export default EncryptionService;
