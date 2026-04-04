/**
 * Password Service
 * Secure password hashing using bcrypt
 */

import bcrypt from 'bcrypt';

const SALT_ROUNDS = 12; // Higher = more secure, but slower

export const PasswordService = {
    /**
     * Hash a password using bcrypt
     */
    hash: async (password: string): Promise<string> => {
        return bcrypt.hash(password, SALT_ROUNDS);
    },

    /**
     * Verify a password against a hash
     */
    verify: async (password: string, hash: string): Promise<boolean> => {
        return bcrypt.compare(password, hash);
    },

    /**
     * Check if password meets policy requirements
     */
    validatePolicy: (password: string): { valid: boolean; errors: string[] } => {
        const errors: string[] = [];

        if (password.length < 8) {
            errors.push('Şifre en az 8 karakter olmalıdır');
        }
        if (password.length > 128) {
            errors.push('Şifre en fazla 128 karakter olabilir');
        }
        if (!/[A-Z]/.test(password)) {
            errors.push('Şifre en az bir büyük harf içermelidir');
        }
        if (!/[a-z]/.test(password)) {
            errors.push('Şifre en az bir küçük harf içermelidir');
        }
        if (!/[0-9]/.test(password)) {
            errors.push('Şifre en az bir rakam içermelidir');
        }
        if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
            errors.push('Şifre en az bir özel karakter içermelidir');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    },

    /**
     * Check if hash needs rehashing (e.g., if salt rounds changed)
     */
    needsRehash: (hash: string): boolean => {
        const rounds = bcrypt.getRounds(hash);
        return rounds < SALT_ROUNDS;
    }
};

export default PasswordService;
