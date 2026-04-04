/**
 * KVKK (Kişisel Verilerin Korunması Kanunu) Compliance Service
 * Turkish Personal Data Protection Law compliance utilities
 */

import { query } from '../db';
import crypto from 'crypto';

// Data categories as per KVKK
type DataCategory =
    | 'IDENTITY' // Kimlik bilgileri
    | 'CONTACT' // İletişim bilgileri
    | 'EDUCATION' // Eğitim bilgileri
    | 'PROFESSIONAL' // Mesleki bilgiler
    | 'FINANCIAL' // Finansal bilgiler
    | 'HEALTH' // Sağlık bilgileri (özel nitelikli)
    | 'BIOMETRIC' // Biyometrik veriler (özel nitelikli)
    | 'CRIMINAL' // Ceza mahkumiyeti (özel nitelikli)
    | 'POLITICAL' // Siyasi görüş (özel nitelikli)
    | 'RELIGIOUS' // Dini inanç (özel nitelikli)
    | 'LOCATION' // Konum bilgileri
    | 'BEHAVIORAL'; // Davranışsal veriler

// Consent types
type ConsentType =
    | 'DATA_PROCESSING' // Veri işleme
    | 'DATA_TRANSFER' // Veri aktarımı
    | 'MARKETING' // Pazarlama
    | 'PROFILING' // Profilleme
    | 'COOKIES' // Çerez kullanımı
    | 'THIRD_PARTY'; // Üçüncü taraf paylaşımı

interface Consent {
    userId: string;
    consentType: ConsentType;
    granted: boolean;
    grantedAt?: Date;
    revokedAt?: Date;
    version: string;
    ipAddress?: string;
}

interface DataSubjectRequest {
    id: string;
    userId: string;
    requestType: 'ACCESS' | 'RECTIFICATION' | 'ERASURE' | 'PORTABILITY' | 'OBJECTION';
    status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'REJECTED';
    requestedAt: Date;
    completedAt?: Date;
    notes?: string;
}

export const KvkkService = {
    // ==================== Data Masking ====================

    /**
     * Mask email address
     */
    maskEmail: (email: string): string => {
        if (!email || !email.includes('@')) return '***@***.***';
        const [local, domain] = email.split('@');
        const maskedLocal = local.length > 2
            ? local[0] + '*'.repeat(local.length - 2) + local[local.length - 1]
            : '**';
        const [domainName, tld] = domain.split('.');
        const maskedDomain = domainName[0] + '*'.repeat(domainName.length - 1) + '.' + tld;
        return `${maskedLocal}@${maskedDomain}`;
    },

    /**
     * Mask phone number
     */
    maskPhone: (phone: string): string => {
        if (!phone || phone.length < 4) return '****';
        return phone.slice(0, 3) + '*'.repeat(phone.length - 6) + phone.slice(-3);
    },

    /**
     * Mask TC Kimlik No
     */
    maskTcKimlik: (tcNo: string): string => {
        if (!tcNo || tcNo.length !== 11) return '***********';
        return tcNo.slice(0, 3) + '*****' + tcNo.slice(-3);
    },

    /**
     * Mask name (keep first letter)
     */
    maskName: (name: string): string => {
        if (!name || name.length < 2) return '*';
        return name[0] + '*'.repeat(name.length - 1);
    },

    /**
     * Hash sensitive data for storage
     */
    hashData: (data: string): string => {
        return crypto.createHash('sha256').update(data).digest('hex');
    },

    /**
     * Anonymize user data
     */
    anonymizeUser: (user: any): any => {
        return {
            ...user,
            username: KvkkService.maskName(user.username),
            email: KvkkService.maskEmail(user.email),
            phone: user.phone ? KvkkService.maskPhone(user.phone) : undefined,
            tcKimlik: user.tcKimlik ? KvkkService.maskTcKimlik(user.tcKimlik) : undefined
        };
    },

    // ==================== Consent Management ====================

    /**
     * Record user consent
     */
    recordConsent: async (consent: Consent): Promise<boolean> => {
        try {
            await query(
                `INSERT INTO user_consents (user_id, consent_type, granted, version, ip_address, granted_at)
                 VALUES ($1, $2, $3, $4, $5, NOW())
                 ON CONFLICT (user_id, consent_type) 
                 DO UPDATE SET granted = $3, version = $4, ip_address = $5, 
                               granted_at = CASE WHEN $3 THEN NOW() ELSE user_consents.granted_at END,
                               revoked_at = CASE WHEN NOT $3 THEN NOW() ELSE NULL END`,
                [consent.userId, consent.consentType, consent.granted, consent.version, consent.ipAddress]
            );
            return true;
        } catch (error) {
            console.error('Consent record error:', error);
            return false;
        }
    },

    /**
     * Check if user has given consent
     */
    hasConsent: async (userId: string, consentType: ConsentType): Promise<boolean> => {
        try {
            const result = await query(
                `SELECT granted FROM user_consents 
                 WHERE user_id = $1 AND consent_type = $2 AND granted = true`,
                [userId, consentType]
            );
            return result.rows.length > 0;
        } catch {
            return false;
        }
    },

    /**
     * Get all consents for user
     */
    getUserConsents: async (userId: string): Promise<Consent[]> => {
        const result = await query(
            `SELECT * FROM user_consents WHERE user_id = $1`,
            [userId]
        );
        return result.rows as unknown as Consent[];
    },

    // ==================== Data Retention ====================

    /**
     * Get data retention policy
     */
    getRetentionPolicy: (dataCategory: DataCategory): number => {
        // Returns retention period in days
        const policies: Record<DataCategory, number> = {
            IDENTITY: 365 * 5, // 5 years after account closure
            CONTACT: 365 * 5,
            EDUCATION: 365 * 10, // 10 years for education records
            PROFESSIONAL: 365 * 5,
            FINANCIAL: 365 * 10, // Legal requirement
            HEALTH: 365 * 20, // Special category - longer retention
            BIOMETRIC: 365 * 1, // Delete within 1 year if not needed
            CRIMINAL: 0, // Delete immediately when no longer needed
            POLITICAL: 0,
            RELIGIOUS: 0,
            LOCATION: 90, // 90 days
            BEHAVIORAL: 365 * 2 // 2 years for analytics
        };
        return policies[dataCategory] || 365;
    },

    /**
     * Apply retention policy - delete old data
     */
    applyRetentionPolicy: async (): Promise<{ deleted: number }> => {
        let totalDeleted = 0;

        // Delete old audit logs (keep 5 years)
        const auditResult = await query(
            `DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL '5 years'`
        );
        totalDeleted += auditResult.rowCount || 0;

        // Delete old sessions (keep 90 days)
        const sessionResult = await query(
            `DELETE FROM user_sessions WHERE last_activity < NOW() - INTERVAL '90 days'`
        );
        totalDeleted += sessionResult.rowCount || 0;

        // Anonymize deleted users (keep 30 days before full anonymization)
        const userResult = await query(
            `UPDATE users SET 
             username = 'deleted_' || id,
             email = 'deleted_' || id || '@deleted.local',
             password_hash = 'DELETED'
             WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '30 days'`
        );
        totalDeleted += userResult.rowCount || 0;

        return { deleted: totalDeleted };
    },

    // ==================== Data Subject Rights ====================

    /**
     * Create data subject request
     */
    createRequest: async (
        userId: string,
        requestType: DataSubjectRequest['requestType']
    ): Promise<string> => {
        const result = await query(
            `INSERT INTO data_subject_requests (user_id, request_type, status, requested_at)
             VALUES ($1, $2, 'PENDING', NOW())
             RETURNING id`,
            [userId, requestType]
        );
        return result.rows[0].id;
    },

    /**
     * Export user data (Right of Access / Portability)
     */
    exportUserData: async (userId: string): Promise<Record<string, any>> => {
        const [userResult, coursesResult, submissionsResult, consentsResult] = await Promise.all([
            query('SELECT id, username, email, role, created_at FROM users WHERE id = $1', [userId]),
            query('SELECT c.* FROM courses c JOIN course_enrollments ce ON c.id = ce.course_id WHERE ce.user_id = $1', [userId]),
            query('SELECT * FROM exam_submissions WHERE user_id = $1', [userId]),
            query('SELECT * FROM user_consents WHERE user_id = $1', [userId])
        ]);

        return {
            exportDate: new Date().toISOString(),
            user: userResult.rows[0],
            courses: coursesResult.rows,
            examSubmissions: submissionsResult.rows,
            consents: consentsResult.rows,
            format: 'KVKK_EXPORT_V1'
        };
    },

    /**
     * Delete user data (Right to Erasure)
     */
    deleteUserData: async (userId: string, hardDelete: boolean = false): Promise<boolean> => {
        try {
            if (hardDelete) {
                // Cascade delete all user data
                await query('DELETE FROM exam_submissions WHERE user_id = $1', [userId]);
                await query('DELETE FROM course_enrollments WHERE user_id = $1', [userId]);
                await query('DELETE FROM user_consents WHERE user_id = $1', [userId]);
                await query('DELETE FROM users WHERE id = $1', [userId]);
            } else {
                // Soft delete - mark as deleted, anonymize later
                await query(
                    `UPDATE users SET deleted_at = NOW(), email = 'deleted_' || id || '@deleted.local' WHERE id = $1`,
                    [userId]
                );
            }
            return true;
        } catch (error) {
            console.error('User data deletion error:', error);
            return false;
        }
    },

    // ==================== Privacy Notice ====================

    /**
     * Get privacy notice version
     */
    getPrivacyNotice: (): { version: string; lastUpdated: string; content: string } => {
        return {
            version: '1.0.0',
            lastUpdated: '2026-01-01',
            content: `
# Kişisel Verilerin Korunması Aydınlatma Metni

## 1. Veri Sorumlusu
LMS Eğitim Platformu olarak kişisel verilerinizin güvenliği bizim için önemlidir.

## 2. İşlenen Kişisel Veriler
- Kimlik bilgileri (ad, soyad, kullanıcı adı)
- İletişim bilgileri (e-posta, telefon)
- Eğitim bilgileri (ders kayıtları, sınav sonuçları)
- Kullanım verileri (giriş zamanları, platform kullanımı)

## 3. İşleme Amaçları
- Eğitim hizmetlerinin sunulması
- Performans değerlendirmesi
- Yasal yükümlülüklerin yerine getirilmesi

## 4. Veri Aktarımı
Kişisel verileriniz, açık rızanız olmadan üçüncü taraflarla paylaşılmaz.

## 5. Haklarınız
- Verilerinize erişim hakkı
- Düzeltme hakkı
- Silme hakkı (unutulma hakkı)
- Veri taşınabilirliği hakkı
- İtiraz hakkı

## 6. İletişim
KVKK başvuruları için: kvkk@lms.com.tr
            `.trim()
        };
    }
};

export default KvkkService;
