/**
 * Rubric Service
 * Manages rubrics for open-ended question evaluation
 */

import { query } from '../db';
import crypto from 'crypto';

interface RubricCriterion {
    id: string;
    name: string;
    description: string;
    maxPoints: number;
    levels: RubricLevel[];
}

interface RubricLevel {
    score: number;
    label: string;
    description: string;
}

interface Rubric {
    id: string;
    title: string;
    description?: string;
    criteria: RubricCriterion[];
    maxScore: number;
    createdBy: string;
    createdAt: Date;
}

interface RubricEvaluation {
    rubricId: string;
    submissionId: string;
    evaluatorId: string;
    scores: { criterionId: string; score: number; feedback?: string }[];
    totalScore: number;
    overallFeedback?: string;
}

export const RubricService = {
    /**
     * Create a new rubric
     */
    createRubric: async (
        title: string,
        description: string,
        criteria: Omit<RubricCriterion, 'id'>[],
        createdBy: string
    ): Promise<Rubric> => {
        const id = crypto.randomUUID();

        // Add IDs to criteria
        const criteriaWithIds = criteria.map(c => ({
            ...c,
            id: crypto.randomUUID()
        }));

        const maxScore = criteriaWithIds.reduce((sum, c) => sum + c.maxPoints, 0);

        await query(
            `INSERT INTO rubrics (id, title, description, criteria, max_score, created_by, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
            [id, title, description, JSON.stringify(criteriaWithIds), maxScore, createdBy]
        );

        return {
            id,
            title,
            description,
            criteria: criteriaWithIds,
            maxScore,
            createdBy,
            createdAt: new Date()
        };
    },

    /**
     * Get rubric by ID
     */
    getRubric: async (rubricId: string): Promise<Rubric | null> => {
        const result = await query(
            `SELECT * FROM rubrics WHERE id = $1`,
            [rubricId]
        );

        if (result.rows.length === 0) return null;

        const row = result.rows[0];
        return {
            id: row.id,
            title: row.title,
            description: row.description,
            criteria: row.criteria,
            maxScore: row.max_score,
            createdBy: row.created_by,
            createdAt: row.created_at
        };
    },

    /**
     * List rubrics for a user
     */
    listRubrics: async (userId: string): Promise<Rubric[]> => {
        const result = await query(
            `SELECT * FROM rubrics WHERE created_by = $1 ORDER BY created_at DESC`,
            [userId]
        );

        return result.rows.map(row => ({
            id: row.id,
            title: row.title,
            description: row.description,
            criteria: row.criteria,
            maxScore: row.max_score,
            createdBy: row.created_by,
            createdAt: row.created_at
        }));
    },

    /**
     * Update rubric
     */
    updateRubric: async (
        rubricId: string,
        updates: { title?: string; description?: string; criteria?: RubricCriterion[] }
    ): Promise<void> => {
        const setClauses: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        if (updates.title) {
            setClauses.push(`title = $${paramIndex++}`);
            values.push(updates.title);
        }
        if (updates.description !== undefined) {
            setClauses.push(`description = $${paramIndex++}`);
            values.push(updates.description);
        }
        if (updates.criteria) {
            setClauses.push(`criteria = $${paramIndex++}`);
            values.push(JSON.stringify(updates.criteria));
            const maxScore = updates.criteria.reduce((sum, c) => sum + c.maxPoints, 0);
            setClauses.push(`max_score = $${paramIndex++}`);
            values.push(maxScore);
        }

        if (setClauses.length > 0) {
            values.push(rubricId);
            await query(
                `UPDATE rubrics SET ${setClauses.join(', ')} WHERE id = $${paramIndex}`,
                values
            );
        }
    },

    /**
     * Delete rubric
     */
    deleteRubric: async (rubricId: string): Promise<void> => {
        await query(`DELETE FROM rubrics WHERE id = $1`, [rubricId]);
    },

    /**
     * Evaluate a submission using a rubric
     */
    evaluateSubmission: async (
        rubricId: string,
        submissionId: string,
        evaluatorId: string,
        scores: { criterionId: string; score: number; feedback?: string }[],
        overallFeedback?: string
    ): Promise<RubricEvaluation> => {
        const rubric = await RubricService.getRubric(rubricId);
        if (!rubric) throw new Error('Rubric not found');

        // Validate scores
        for (const score of scores) {
            const criterion = rubric.criteria.find(c => c.id === score.criterionId);
            if (!criterion) throw new Error(`Invalid criterion: ${score.criterionId}`);
            if (score.score < 0 || score.score > criterion.maxPoints) {
                throw new Error(`Score out of range for criterion ${criterion.name}`);
            }
        }

        const totalScore = scores.reduce((sum, s) => sum + s.score, 0);

        await query(
            `INSERT INTO rubric_evaluations (id, rubric_id, submission_id, evaluator_id, scores, total_score, overall_feedback, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
             ON CONFLICT (submission_id) DO UPDATE SET
                scores = $5, total_score = $6, overall_feedback = $7, updated_at = NOW()`,
            [crypto.randomUUID(), rubricId, submissionId, evaluatorId, JSON.stringify(scores), totalScore, overallFeedback]
        );

        return {
            rubricId,
            submissionId,
            evaluatorId,
            scores,
            totalScore,
            overallFeedback
        };
    },

    /**
     * Get evaluation for a submission
     */
    getEvaluation: async (submissionId: string): Promise<RubricEvaluation | null> => {
        const result = await query(
            `SELECT * FROM rubric_evaluations WHERE submission_id = $1`,
            [submissionId]
        );

        if (result.rows.length === 0) return null;

        const row = result.rows[0];
        return {
            rubricId: row.rubric_id,
            submissionId: row.submission_id,
            evaluatorId: row.evaluator_id,
            scores: row.scores,
            totalScore: row.total_score,
            overallFeedback: row.overall_feedback
        };
    },

    /**
     * Create default rubric template
     */
    createDefaultTemplate: (type: 'essay' | 'project' | 'code'): Omit<RubricCriterion, 'id'>[] => {
        const templates = {
            essay: [
                {
                    name: 'İçerik ve Argüman',
                    description: 'Tezin netliği ve destekleyici kanıtlar',
                    maxPoints: 30,
                    levels: [
                        { score: 30, label: 'Mükemmel', description: 'Güçlü tez, kapsamlı kanıtlar' },
                        { score: 22, label: 'İyi', description: 'Net tez, yeterli kanıt' },
                        { score: 15, label: 'Orta', description: 'Belirsiz tez, sınırlı kanıt' },
                        { score: 8, label: 'Zayıf', description: 'Tez yok veya çok zayıf' },
                        { score: 0, label: 'Yetersiz', description: 'Konu dışı veya boş' }
                    ]
                },
                {
                    name: 'Organizasyon',
                    description: 'Yapı ve akış',
                    maxPoints: 25,
                    levels: [
                        { score: 25, label: 'Mükemmel', description: 'Mükemmel organizasyon' },
                        { score: 18, label: 'İyi', description: 'İyi yapı' },
                        { score: 12, label: 'Orta', description: 'Bazı organizasyon sorunları' },
                        { score: 6, label: 'Zayıf', description: 'Zayıf organizasyon' },
                        { score: 0, label: 'Yetersiz', description: 'Organizasyon yok' }
                    ]
                },
                {
                    name: 'Dil ve Üslup',
                    description: 'Gramer, yazım ve akademik dil',
                    maxPoints: 25,
                    levels: [
                        { score: 25, label: 'Mükemmel', description: 'Hatasız, akademik dil' },
                        { score: 18, label: 'İyi', description: 'Birkaç küçük hata' },
                        { score: 12, label: 'Orta', description: 'Bazı hatalar' },
                        { score: 6, label: 'Zayıf', description: 'Çok sayıda hata' },
                        { score: 0, label: 'Yetersiz', description: 'Anlaşılmaz' }
                    ]
                },
                {
                    name: 'Kaynak Kullanımı',
                    description: 'Atıf ve referanslar',
                    maxPoints: 20,
                    levels: [
                        { score: 20, label: 'Mükemmel', description: 'Kapsamlı ve doğru atıflar' },
                        { score: 15, label: 'İyi', description: 'Yeterli atıf' },
                        { score: 10, label: 'Orta', description: 'Sınırlı atıf' },
                        { score: 5, label: 'Zayıf', description: 'Yetersiz atıf' },
                        { score: 0, label: 'Yetersiz', description: 'Atıf yok' }
                    ]
                }
            ],
            project: [
                {
                    name: 'Teknik Uygulama',
                    description: 'Kod kalitesi ve çalışabilirlik',
                    maxPoints: 40,
                    levels: [
                        { score: 40, label: 'Mükemmel', description: 'Hatasız, optimize kod' },
                        { score: 30, label: 'İyi', description: 'Çalışır, minor hatalar' },
                        { score: 20, label: 'Orta', description: 'Kısmen çalışır' },
                        { score: 10, label: 'Zayıf', description: 'Çoğunlukla çalışmaz' },
                        { score: 0, label: 'Yetersiz', description: 'Hiç çalışmaz' }
                    ]
                },
                {
                    name: 'Tasarım',
                    description: 'Mimari ve UX',
                    maxPoints: 30,
                    levels: [
                        { score: 30, label: 'Mükemmel', description: 'Profesyonel tasarım' },
                        { score: 22, label: 'İyi', description: 'İyi tasarım' },
                        { score: 15, label: 'Orta', description: 'Orta tasarım' },
                        { score: 7, label: 'Zayıf', description: 'Zayıf tasarım' },
                        { score: 0, label: 'Yetersiz', description: 'Tasarım yok' }
                    ]
                },
                {
                    name: 'Dokümantasyon',
                    description: 'README, yorumlar, API docs',
                    maxPoints: 30,
                    levels: [
                        { score: 30, label: 'Mükemmel', description: 'Kapsamlı dokümantasyon' },
                        { score: 22, label: 'İyi', description: 'İyi dokümantasyon' },
                        { score: 15, label: 'Orta', description: 'Temel dokümantasyon' },
                        { score: 7, label: 'Zayıf', description: 'Eksik dokümantasyon' },
                        { score: 0, label: 'Yetersiz', description: 'Dokümantasyon yok' }
                    ]
                }
            ],
            code: [
                {
                    name: 'Doğruluk',
                    description: 'Kod beklenen çıktıyı üretiyor mu?',
                    maxPoints: 40,
                    levels: [
                        { score: 40, label: 'Mükemmel', description: 'Tüm test cases geçer' },
                        { score: 30, label: 'İyi', description: '%75+ test geçer' },
                        { score: 20, label: 'Orta', description: '%50+ test geçer' },
                        { score: 10, label: 'Zayıf', description: '%25+ test geçer' },
                        { score: 0, label: 'Yetersiz', description: 'Hiç test geçmez' }
                    ]
                },
                {
                    name: 'Kod Kalitesi',
                    description: 'Okunabilirlik, best practices',
                    maxPoints: 30,
                    levels: [
                        { score: 30, label: 'Mükemmel', description: 'Clean code prensipleri' },
                        { score: 22, label: 'İyi', description: 'İyi okunabilirlik' },
                        { score: 15, label: 'Orta', description: 'Orta kalite' },
                        { score: 7, label: 'Zayıf', description: 'Düşük kalite' },
                        { score: 0, label: 'Yetersiz', description: 'Çok kötü' }
                    ]
                },
                {
                    name: 'Verimlilik',
                    description: 'Time/Space complexity',
                    maxPoints: 30,
                    levels: [
                        { score: 30, label: 'Mükemmel', description: 'Optimal çözüm' },
                        { score: 22, label: 'İyi', description: 'Verimli çözüm' },
                        { score: 15, label: 'Orta', description: 'Kabul edilebilir' },
                        { score: 7, label: 'Zayıf', description: 'Verimsiz' },
                        { score: 0, label: 'Yetersiz', description: 'Çok verimsiz' }
                    ]
                }
            ]
        };

        return templates[type];
    }
};

export default RubricService;
