/**
 * Password Policy Middleware
 * Enforces password complexity requirements
 */

import { Request, Response, NextFunction } from 'express';

export interface PasswordPolicy {
    minLength: number;
    maxLength: number;
    requireUppercase: boolean;
    requireLowercase: boolean;
    requireNumbers: boolean;
    requireSpecialChars: boolean;
    specialChars: string;
    preventCommonPasswords: boolean;
    preventUserInfo: boolean;
    maxConsecutiveChars: number;
}

// Default policy
const DEFAULT_POLICY: PasswordPolicy = {
    minLength: 8,
    maxLength: 128,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: true,
    specialChars: '!@#$%^&*()_+-=[]{}|;:,.<>?',
    preventCommonPasswords: true,
    preventUserInfo: true,
    maxConsecutiveChars: 3,
};

// Common passwords to block
const COMMON_PASSWORDS = [
    'password', 'password123', '123456', '12345678', 'qwerty', 'abc123',
    'monkey', 'master', 'dragon', 'letmein', 'login', 'admin', 'welcome',
    'shadow', 'sunshine', 'princess', 'football', 'baseball', 'iloveyou',
    'trustno1', 'hello', 'charlie', 'donald', 'password1', 'qwerty123',
    'sifre', 'sifre123', '123456789', 'test123', 'guest', 'root',
];

export interface PasswordValidationResult {
    valid: boolean;
    errors: string[];
    strength: 'weak' | 'medium' | 'strong';
    score: number;  // 0-100
}

/**
 * Validate password against policy
 */
export function validatePassword(
    password: string,
    policy: PasswordPolicy = DEFAULT_POLICY,
    userInfo?: { username?: string; email?: string; name?: string }
): PasswordValidationResult {
    const errors: string[] = [];
    let score = 0;

    // Length check
    if (password.length < policy.minLength) {
        errors.push(`Şifre en az ${policy.minLength} karakter olmalıdır`);
    } else {
        score += 20;
    }

    if (password.length > policy.maxLength) {
        errors.push(`Şifre en fazla ${policy.maxLength} karakter olabilir`);
    }

    // Uppercase check
    if (policy.requireUppercase && !/[A-Z]/.test(password)) {
        errors.push('Şifre en az bir büyük harf içermelidir');
    } else if (/[A-Z]/.test(password)) {
        score += 15;
    }

    // Lowercase check
    if (policy.requireLowercase && !/[a-z]/.test(password)) {
        errors.push('Şifre en az bir küçük harf içermelidir');
    } else if (/[a-z]/.test(password)) {
        score += 15;
    }

    // Number check
    if (policy.requireNumbers && !/[0-9]/.test(password)) {
        errors.push('Şifre en az bir rakam içermelidir');
    } else if (/[0-9]/.test(password)) {
        score += 15;
    }

    // Special character check
    const specialRegex = new RegExp(`[${escapeRegex(policy.specialChars)}]`);
    if (policy.requireSpecialChars && !specialRegex.test(password)) {
        errors.push(`Şifre en az bir özel karakter içermelidir (${policy.specialChars})`);
    } else if (specialRegex.test(password)) {
        score += 20;
    }

    // Common password check
    if (policy.preventCommonPasswords) {
        const lowerPassword = password.toLowerCase();
        if (COMMON_PASSWORDS.some(cp => lowerPassword.includes(cp))) {
            errors.push('Şifre yaygın kullanılan bir şifre olamaz');
            score -= 20;
        }
    }

    // User info check
    if (policy.preventUserInfo && userInfo) {
        const lowerPassword = password.toLowerCase();
        const infoToCheck = [
            userInfo.username,
            userInfo.email?.split('@')[0],
            userInfo.name,
        ].filter(Boolean).map(s => s!.toLowerCase());

        for (const info of infoToCheck) {
            if (info.length >= 3 && lowerPassword.includes(info)) {
                errors.push('Şifre kullanıcı bilgilerini içeremez');
                score -= 15;
                break;
            }
        }
    }

    // Consecutive character check
    if (policy.maxConsecutiveChars > 0) {
        const consecutiveRegex = new RegExp(`(.)\\1{${policy.maxConsecutiveChars},}`);
        if (consecutiveRegex.test(password)) {
            errors.push(`Şifre ${policy.maxConsecutiveChars}'den fazla ardışık aynı karakter içeremez`);
            score -= 10;
        }
    }

    // Bonus for extra length
    if (password.length >= 12) score += 10;
    if (password.length >= 16) score += 5;

    // Normalize score
    score = Math.max(0, Math.min(100, score));

    // Determine strength
    let strength: 'weak' | 'medium' | 'strong';
    if (score >= 80 && errors.length === 0) {
        strength = 'strong';
    } else if (score >= 50) {
        strength = 'medium';
    } else {
        strength = 'weak';
    }

    return {
        valid: errors.length === 0,
        errors,
        strength,
        score,
    };
}

/**
 * Escape regex special characters
 */
function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Generate password suggestion
 */
export function generateSecurePassword(length: number = 16): string {
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const special = '!@#$%^&*()_+-=';
    const all = uppercase + lowercase + numbers + special;

    let password = '';

    // Ensure at least one of each type
    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += special[Math.floor(Math.random() * special.length)];

    // Fill the rest
    for (let i = password.length; i < length; i++) {
        password += all[Math.floor(Math.random() * all.length)];
    }

    // Shuffle
    return password.split('').sort(() => Math.random() - 0.5).join('');
}

/**
 * Password policy validation middleware
 */
export function passwordPolicyMiddleware(customPolicy?: Partial<PasswordPolicy>) {
    const policy = { ...DEFAULT_POLICY, ...customPolicy };

    return (req: Request, res: Response, next: NextFunction) => {
        const { password, newPassword } = req.body;
        const passwordToCheck = newPassword || password;

        if (!passwordToCheck) {
            return next();
        }

        const userInfo = {
            username: req.body.username || (req as any).user?.username,
            email: req.body.email || (req as any).user?.email,
            name: req.body.name || (req as any).user?.name,
        };

        const result = validatePassword(passwordToCheck, policy, userInfo);

        if (!result.valid) {
            return res.status(400).json({
                error: 'Şifre politikası ihlali',
                details: result.errors,
                strength: result.strength,
                score: result.score,
            });
        }

        // Attach result to request for logging
        (req as any).passwordValidation = result;
        next();
    };
}

/**
 * Get password requirements for UI display
 */
export function getPasswordRequirements(policy: PasswordPolicy = DEFAULT_POLICY): string[] {
    const requirements: string[] = [];

    requirements.push(`En az ${policy.minLength} karakter`);
    if (policy.requireUppercase) requirements.push('En az bir büyük harf (A-Z)');
    if (policy.requireLowercase) requirements.push('En az bir küçük harf (a-z)');
    if (policy.requireNumbers) requirements.push('En az bir rakam (0-9)');
    if (policy.requireSpecialChars) requirements.push(`En az bir özel karakter (${policy.specialChars})`);
    if (policy.preventCommonPasswords) requirements.push('Yaygın şifreler kullanılamaz');
    if (policy.preventUserInfo) requirements.push('Kullanıcı bilgileri içeremez');

    return requirements;
}

export default {
    validatePassword,
    generateSecurePassword,
    passwordPolicyMiddleware,
    getPasswordRequirements,
    DEFAULT_POLICY,
};
