/**
 * Course Prerequisites Service
 * Manage course dependencies and completion requirements
 */

import { query } from '../db';

const newId = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();

interface Prerequisite {
    id: string;
    courseId: string;
    prerequisiteCourseId: string;
    minGrade?: number;  // Minimum grade percentage required
    required: boolean;  // Hard requirement vs recommended
    createdAt: string;
}

interface CourseCompletion {
    userId: string;
    courseId: string;
    completedAt: string;
    grade?: number;
    status: 'in_progress' | 'completed' | 'failed';
}

export const PrerequisiteService = {
    // ==================== PREREQUISITES ====================

    /**
     * Add prerequisite to course
     */
    addPrerequisite: async (
        courseId: string,
        prerequisiteCourseId: string,
        minGrade?: number,
        required: boolean = true
    ): Promise<Prerequisite> => {
        const id = newId();
        const now = nowIso();

        // Prevent circular dependencies
        const circular = await PrerequisiteService.checkCircular(courseId, prerequisiteCourseId);
        if (circular) {
            throw new Error('Döngüsel bağımlılık tespit edildi');
        }

        await query(
            `INSERT INTO course_prerequisites (id, course_id, prerequisite_course_id, min_grade, required, created_at)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (course_id, prerequisite_course_id) DO UPDATE SET min_grade = $4, required = $5`,
            [id, courseId, prerequisiteCourseId, minGrade || null, required, now]
        );

        return { id, courseId, prerequisiteCourseId, minGrade, required, createdAt: now };
    },

    /**
     * Remove prerequisite
     */
    removePrerequisite: async (courseId: string, prerequisiteCourseId: string): Promise<void> => {
        await query(
            'DELETE FROM course_prerequisites WHERE course_id = $1 AND prerequisite_course_id = $2',
            [courseId, prerequisiteCourseId]
        );
    },

    /**
     * Get prerequisites for course
     */
    getPrerequisites: async (courseId: string): Promise<Array<Prerequisite & { courseName: string }>> => {
        const result = await query(
            `SELECT cp.id, cp.course_id as "courseId", cp.prerequisite_course_id as "prerequisiteCourseId",
                    cp.min_grade as "minGrade", cp.required, cp.created_at as "createdAt",
                    c.title as "courseName"
             FROM course_prerequisites cp
             JOIN courses c ON cp.prerequisite_course_id = c.id
             WHERE cp.course_id = $1`,
            [courseId]
        );
        return result.rows as Array<Prerequisite & { courseName: string }>;
    },

    /**
     * Get courses that depend on this course
     */
    getDependentCourses: async (courseId: string): Promise<Array<{ courseId: string; courseName: string }>> => {
        const result = await query(
            `SELECT cp.course_id as "courseId", c.title as "courseName"
             FROM course_prerequisites cp
             JOIN courses c ON cp.course_id = c.id
             WHERE cp.prerequisite_course_id = $1`,
            [courseId]
        );
        return result.rows as Array<{ courseId: string; courseName: string }>;
    },

    /**
     * Check for circular dependencies
     */
    checkCircular: async (courseId: string, prerequisiteCourseId: string): Promise<boolean> => {
        // Check if adding this prerequisite would create a cycle
        const visited = new Set<string>();
        const queue = [prerequisiteCourseId];

        while (queue.length > 0) {
            const current = queue.shift()!;
            if (current === courseId) {
                return true; // Circular dependency found
            }
            if (visited.has(current)) continue;
            visited.add(current);

            const prereqs = await PrerequisiteService.getPrerequisites(current);
            for (const prereq of prereqs) {
                queue.push(prereq.prerequisiteCourseId);
            }
        }

        return false;
    },

    // ==================== COMPLETION TRACKING ====================

    /**
     * Mark course as completed
     */
    markCompleted: async (userId: string, courseId: string, grade?: number): Promise<void> => {
        const now = nowIso();
        const status = grade !== undefined && grade < 50 ? 'failed' : 'completed';

        await query(
            `INSERT INTO course_completions (user_id, course_id, completed_at, grade, status)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (user_id, course_id) DO UPDATE SET completed_at = $3, grade = $4, status = $5`,
            [userId, courseId, now, grade || null, status]
        );
    },

    /**
     * Get completion status
     */
    getCompletion: async (userId: string, courseId: string): Promise<CourseCompletion | null> => {
        const result = await query(
            `SELECT user_id as "userId", course_id as "courseId", completed_at as "completedAt", grade, status
             FROM course_completions WHERE user_id = $1 AND course_id = $2`,
            [userId, courseId]
        );
        return (result.rows[0] as CourseCompletion) || null;
    },

    /**
     * Get all completions for user
     */
    getUserCompletions: async (userId: string): Promise<CourseCompletion[]> => {
        const result = await query(
            `SELECT user_id as "userId", course_id as "courseId", completed_at as "completedAt", grade, status
             FROM course_completions WHERE user_id = $1`,
            [userId]
        );
        return result.rows as CourseCompletion[];
    },

    // ==================== ACCESS CONTROL ====================

    /**
     * Check if user can access course (prerequisites met)
     */
    canAccessCourse: async (userId: string, courseId: string): Promise<{
        allowed: boolean;
        missingPrerequisites: Array<{ courseId: string; courseName: string; reason: string }>;
    }> => {
        const prerequisites = await PrerequisiteService.getPrerequisites(courseId);
        const missingPrerequisites: Array<{ courseId: string; courseName: string; reason: string }> = [];

        for (const prereq of prerequisites) {
            const completion = await PrerequisiteService.getCompletion(userId, prereq.prerequisiteCourseId);

            if (!completion || completion.status !== 'completed') {
                if (prereq.required) {
                    missingPrerequisites.push({
                        courseId: prereq.prerequisiteCourseId,
                        courseName: prereq.courseName,
                        reason: 'Ders tamamlanmadı',
                    });
                }
            } else if (prereq.minGrade && completion.grade && completion.grade < prereq.minGrade) {
                missingPrerequisites.push({
                    courseId: prereq.prerequisiteCourseId,
                    courseName: prereq.courseName,
                    reason: `Minimum not gerekliliği: %${prereq.minGrade} (Alınan: %${completion.grade})`,
                });
            }
        }

        return {
            allowed: missingPrerequisites.length === 0,
            missingPrerequisites,
        };
    },

    /**
     * Get prerequisite tree (visual hierarchy)
     */
    getPrerequisiteTree: async (courseId: string, depth: number = 3): Promise<any> => {
        const buildTree = async (cId: string, currentDepth: number): Promise<any> => {
            if (currentDepth <= 0) return null;

            const courseResult = await query('SELECT id, title FROM courses WHERE id = $1', [cId]);
            if (courseResult.rows.length === 0) return null;

            const course = courseResult.rows[0];
            const prerequisites = await PrerequisiteService.getPrerequisites(cId);

            const children = [];
            for (const prereq of prerequisites) {
                const child = await buildTree(prereq.prerequisiteCourseId, currentDepth - 1);
                if (child) {
                    children.push({
                        ...child,
                        minGrade: prereq.minGrade,
                        required: prereq.required,
                    });
                }
            }

            return {
                id: course.id,
                title: course.title,
                prerequisites: children,
            };
        };

        return buildTree(courseId, depth);
    },
};

export default PrerequisiteService;
