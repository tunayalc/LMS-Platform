/**
 * Question Bank Service
 * Tag-based question management and random question selection
 */

import { query } from '../db';
import crypto from 'crypto';

// Helper functions
const newId = () => crypto.randomUUID();
// ... (lines 10-200) ...

const nowIso = () => new Date().toISOString();

interface QuestionTag {
    id: string;
    name: string;
    color?: string;
    createdAt: string;
}

interface QuestionWithTags {
    id: string;
    prompt: string;
    type: string;
    tags: QuestionTag[];
    options?: any;
    answer?: any;
    meta?: any;
    points?: number;
}

export class QuestionBankService {
    /**
     * Create a new tag
     */
    static async createTag(name: string, color?: string): Promise<QuestionTag> {
        const id = newId();
        const now = nowIso();

        await query(
            `INSERT INTO question_tags (id, name, color, created_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (name) DO NOTHING`,
            [id, name, color || '#64748b', now]
        );

        return { id, name, color: color || '#64748b', createdAt: now };
    }

    /**
     * Get all tags
     */
    static async getAllTags(): Promise<QuestionTag[]> {
        const { rows } = await query<any>(
            `SELECT id, name, color, created_at as "createdAt" FROM question_tags ORDER BY name`
        );
        return rows;
    }

    /**
     * Tag a question
     */
    static async tagQuestion(questionId: string, tagId: string): Promise<void> {
        await query(
            `INSERT INTO question_tag_links (question_id, tag_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
            [questionId, tagId]
        );
    }

    /**
     * Remove tag from question
     */
    static async untagQuestion(questionId: string, tagId: string): Promise<void> {
        await query(
            `DELETE FROM question_tag_links WHERE question_id = $1 AND tag_id = $2`,
            [questionId, tagId]
        );
    }

    /**
     * Get questions by tags
     */
    static async getQuestionsByTags(tagIds: string[], limit?: number): Promise<QuestionWithTags[]> {
        const { rows } = await query<any>(
            `SELECT DISTINCT q.id, q.prompt, q.type
       FROM questions q
       JOIN question_tag_links qtl ON q.id = qtl.question_id
       WHERE qtl.tag_id = ANY($1)
       ${limit ? `LIMIT ${limit}` : ''}`,
            [tagIds]
        );

        // Get tags for each question
        for (const question of rows) {
            const { rows: tagRows } = await query<any>(
                `SELECT t.id, t.name, t.color FROM question_tags t
         JOIN question_tag_links qtl ON t.id = qtl.tag_id
         WHERE qtl.question_id = $1`,
                [question.id]
            );
            question.tags = tagRows;
        }

        return rows;
    }

    /**
     * Get random questions from pool with tag filtering
     */
    static async getRandomQuestions(options: {
        tagIds?: string[];
        types?: string[];
        count: number;
        excludeIds?: string[];
    }): Promise<QuestionWithTags[]> {
        let whereConditions: string[] = [];
        let params: any[] = [];
        let paramIndex = 1;

        if (options.tagIds && options.tagIds.length > 0) {
            whereConditions.push(`q.id IN (
        SELECT question_id FROM question_tag_links WHERE tag_id = ANY($${paramIndex})
      )`);
            params.push(options.tagIds);
            paramIndex++;
        }

        if (options.types && options.types.length > 0) {
            whereConditions.push(`q.type = ANY($${paramIndex})`);
            params.push(options.types);
            paramIndex++;
        }

        if (options.excludeIds && options.excludeIds.length > 0) {
            whereConditions.push(`q.id != ALL($${paramIndex})`);
            params.push(options.excludeIds);
            paramIndex++;
        }

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

        const { rows } = await query<any>(
            `SELECT q.id, q.prompt, q.type, q.options, q.answer, q.meta, q.points
       FROM questions q
       ${whereClause}
       ORDER BY RANDOM()
       LIMIT $${paramIndex}`,
            [...params, options.count]
        );

        // Get tags for each question
        for (const question of rows) {
            const { rows: tagRows } = await query<any>(
                `SELECT t.id, t.name, t.color FROM question_tags t
         JOIN question_tag_links qtl ON t.id = qtl.tag_id
         WHERE qtl.question_id = $1`,
                [question.id]
            );
            question.tags = tagRows;
        }

        return rows;
    }

    /**
     * Create exam from question pool
     */
    static async createExamFromPool(options: {
        title: string;
        courseId?: string;
        tagIds?: string[];
        questionCount: number;
        durationMinutes?: number;
        passThreshold?: number;
    }): Promise<{ examId: string; questionIds: string[] }> {
        const questions = await this.getRandomQuestions({
            tagIds: options.tagIds,
            count: options.questionCount,
        });

        if (questions.length < options.questionCount) {
            throw new Error(`Not enough questions in pool. Found: ${questions.length}, Needed: ${options.questionCount}`);
        }

        const examId = newId();
        const now = nowIso();

        // Create exam
        await query(
            `INSERT INTO exams (id, title, course_id, duration_minutes, pass_threshold, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [examId, options.title, options.courseId || null, options.durationMinutes || null, options.passThreshold || 50, now, now]
        );

        // CLONE questions for the new exam to preserve the pool
        const questionIds: string[] = [];
        for (const question of questions) {
            const newQuestionId = newId();
            // Clone question data
            await query(
                `INSERT INTO questions (id, exam_id, prompt, type, options, answer, meta, points, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                [
                    newQuestionId,
                    examId,
                    question.prompt,
                    question.type,
                    question.options || null,
                    question.answer || null,
                    question.meta || null,
                    question.points || 10,
                    now
                ]
            );

            // Clone tags (optional: if we want the new question to inherit tags)
            // For now, we skip cloning tags for the *generated* exam questions to keep them clean or independent.
            // But usually, an exam instance question doesn't need the pool tags.

            questionIds.push(newQuestionId);
        }

        return { examId, questionIds };
    }
}
