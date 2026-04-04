/**
 * Content Module & Prerequisites Service
 * Handles hierarchical course structure and content dependencies
 */

import { query } from '../db';

// Helper functions
const newId = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();

interface CourseModule {
    id: string;
    courseId: string;
    parentModuleId?: string;
    title: string;
    description?: string;
    sortOrder: number;
    createdAt: string;
    updatedAt: string;
    children?: CourseModule[];
    contentItems?: ContentItem[];
}

interface ContentItem {
    id: string;
    type: string;
    title: string;
    source?: string | null;
    meetingUrl?: string | null;
    courseId?: string;
    moduleId?: string | null;
    sortOrder?: number | null;
    createdAt?: string;
    updatedAt?: string;
}

interface Prerequisite {
    id: string;
    contentId: string;
    prerequisiteContentId: string;
    createdAt: string;
}

export class ContentModuleService {
    /**
     * Create a new module in a course
     */
    static async createModule(data: {
        courseId: string;
        parentModuleId?: string;
        title: string;
        description?: string;
        sortOrder?: number;
    }): Promise<CourseModule> {
        const id = newId();
        const now = nowIso();

        await query(
            `INSERT INTO course_modules (id, course_id, parent_module_id, title, description, sort_order, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [id, data.courseId, data.parentModuleId || null, data.title, data.description || null, data.sortOrder || 0, now, now]
        );

        return {
            id,
            courseId: data.courseId,
            parentModuleId: data.parentModuleId,
            title: data.title,
            description: data.description,
            sortOrder: data.sortOrder || 0,
            createdAt: now,
            updatedAt: now,
        };
    }

    /**
     * Get all modules for a course in hierarchical structure
     */
    static async getModulesHierarchy(courseId: string): Promise<CourseModule[]> {
        const { rows } = await query<any>(
            `SELECT id, course_id as "courseId", parent_module_id as "parentModuleId", 
              title, description, sort_order as "sortOrder", 
              created_at as "createdAt", updated_at as "updatedAt"
       FROM course_modules WHERE course_id = $1 ORDER BY sort_order`,
            [courseId]
        );

        // Build hierarchy
        const moduleMap = new Map<string, CourseModule>();
        const rootModules: CourseModule[] = [];

        rows.forEach((row: CourseModule) => {
            row.children = [];
            row.contentItems = [];
            moduleMap.set(row.id, row);
        });

        rows.forEach((row: CourseModule) => {
            if (row.parentModuleId && moduleMap.has(row.parentModuleId)) {
                moduleMap.get(row.parentModuleId)!.children!.push(row);
            } else {
                rootModules.push(row);
            }
        });

        // Attach content items to modules (required by the web drag/drop UI)
        const { rows: contentRows } = await query<ContentItem>(
            `SELECT ci.id,
                    ci.type,
                    ci.title,
                    ci.source,
                    ci.meeting_url as "meetingUrl",
                    ci.course_id as "courseId",
                    ci.module_id as "moduleId",
                    ci.sort_order as "sortOrder",
                    ci.created_at as "createdAt",
                    ci.updated_at as "updatedAt"
               FROM content_items ci
              WHERE ci.course_id = $1
              ORDER BY ci.sort_order NULLS LAST, ci.created_at ASC`,
            [courseId]
        );

        for (const item of contentRows) {
            if (!item.moduleId) {
                continue;
            }
            const mod = moduleMap.get(item.moduleId);
            if (!mod) {
                continue;
            }
            mod.contentItems?.push(item);
        }

        return rootModules;
    }

    /**
     * Reorder modules (for drag & drop)
     */
    static async reorderModules(updates: { id: string; sortOrder: number; parentModuleId?: string }[]): Promise<void> {
        for (const update of updates) {
            await query(
                `UPDATE course_modules SET sort_order = $1, parent_module_id = $2, updated_at = $3 WHERE id = $4`,
                [update.sortOrder, update.parentModuleId || null, nowIso(), update.id]
            );
        }
    }

    /**
     * Reorder content items within a module (for drag & drop)
     */
    static async reorderContent(updates: { id: string; sortOrder: number; moduleId?: string }[]): Promise<void> {
        for (const update of updates) {
            await query(
                `UPDATE content_items SET sort_order = $1, module_id = $2, updated_at = $3 WHERE id = $4`,
                [update.sortOrder, update.moduleId || null, nowIso(), update.id]
            );
        }
    }

    /**
     * Add a prerequisite
     */
    static async addPrerequisite(contentId: string, prerequisiteContentId: string): Promise<Prerequisite> {
        const id = newId();
        const now = nowIso();

        await query(
            `INSERT INTO prerequisites (id, content_id, prerequisite_content_id, created_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (content_id, prerequisite_content_id) DO NOTHING`,
            [id, contentId, prerequisiteContentId, now]
        );

        return { id, contentId, prerequisiteContentId, createdAt: now };
    }

    /**
     * Remove a prerequisite
     */
    static async removePrerequisite(contentId: string, prerequisiteContentId: string): Promise<void> {
        await query(
            `DELETE FROM prerequisites WHERE content_id = $1 AND prerequisite_content_id = $2`,
            [contentId, prerequisiteContentId]
        );
    }

    /**
     * Get prerequisites for content
     */
    static async getPrerequisites(contentId: string): Promise<Prerequisite[]> {
        const { rows } = await query<any>(
            `SELECT p.id, p.content_id as "contentId", p.prerequisite_content_id as "prerequisiteContentId",
              p.created_at as "createdAt", ci.title as "prerequisiteTitle"
       FROM prerequisites p
       JOIN content_items ci ON p.prerequisite_content_id = ci.id
       WHERE p.content_id = $1`,
            [contentId]
        );
        return rows;
    }

    /**
     * Check if user has completed prerequisites
     */
    static async checkPrerequisites(userId: string, contentId: string): Promise<{
        canAccess: boolean;
        missingPrerequisites: { id: string; title: string }[];
    }> {
        const { rows } = await query<any>(
            `SELECT p.prerequisite_content_id as id, ci.title
       FROM prerequisites p
       JOIN content_items ci ON p.prerequisite_content_id = ci.id
       WHERE p.content_id = $1
       AND p.prerequisite_content_id NOT IN (
         SELECT content_id FROM content_completions WHERE user_id = $2
       )`,
            [contentId, userId]
        );

        return {
            canAccess: rows.length === 0,
            missingPrerequisites: rows,
        };
    }

    /**
     * Update content progress
     */
    static async updateProgress(userId: string, contentId: string, position: number, duration: number, completed: boolean): Promise<void> {
        const now = nowIso();
        const existing = await query<any>(
            `SELECT id FROM content_completions WHERE user_id = $1 AND content_id = $2`,
            [userId, contentId]
        );

        if (existing.rows.length > 0) {
            await query(
                `UPDATE content_completions 
                 SET last_position = $1, total_duration = $2, completed_at = $3, updated_at = $4 
                 WHERE user_id = $5 AND content_id = $6`,
                [position, duration, completed ? now : null, now, userId, contentId]
            );
        } else {
            await query(
                `INSERT INTO content_completions (id, user_id, content_id, last_position, total_duration, completed_at, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [newId(), userId, contentId, position, duration, completed ? now : null, now, now]
            );
        }
    }

    /**
     * Get content progress for user
     */
    static async getProgress(userId: string, contentId: string): Promise<{ position: number; duration: number; completed: boolean }> {
        const { rows } = await query<any>(
            `SELECT last_position as "position", total_duration as "duration", completed_at as "completedAt"
             FROM content_completions WHERE user_id = $1 AND content_id = $2`,
            [userId, contentId]
        );
        if (rows.length === 0) return { position: 0, duration: 0, completed: false };
        return {
            position: rows[0].position || 0,
            duration: rows[0].duration || 0,
            completed: !!rows[0].completedAt
        };
    }

    /**
     * Mark content as completed for user (Legacy support, though updateProgress is preferred)
     */
    static async markContentComplete(userId: string, contentId: string): Promise<void> {
        await this.updateProgress(userId, contentId, 0, 0, true);
    }

    /**
     * Clone a course with all its content
     */
    static async cloneCourse(courseId: string, newTitle: string, newInstructorId?: string): Promise<string> {
        const now = nowIso();
        const newCourseId = newId();

        // Get original course
        const { rows: courseRows } = await query<any>(
            `SELECT * FROM courses WHERE id = $1`,
            [courseId]
        );

        if (!courseRows[0]) throw new Error('Course not found');
        const originalCourse = courseRows[0];

        // Create new course
        await query(
            `INSERT INTO courses (id, title, description, instructor_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
            [newCourseId, newTitle, originalCourse.description, newInstructorId || originalCourse.instructor_id, now, now]
        );

        // Clone modules (mapping old IDs to new IDs)
        const moduleIdMap = new Map<string, string>();
        const { rows: moduleRows } = await query<any>(
            `SELECT * FROM course_modules WHERE course_id = $1 ORDER BY sort_order`,
            [courseId]
        );

        for (const mod of moduleRows) {
            const newModuleId = newId();
            moduleIdMap.set(mod.id, newModuleId);

            await query(
                `INSERT INTO course_modules (id, course_id, parent_module_id, title, description, sort_order, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [newModuleId, newCourseId, null, mod.title, mod.description, mod.sort_order, now, now]
            );
        }

        // Update parent references
        for (const mod of moduleRows) {
            if (mod.parent_module_id && moduleIdMap.has(mod.parent_module_id)) {
                await query(
                    `UPDATE course_modules SET parent_module_id = $1 WHERE id = $2`,
                    [moduleIdMap.get(mod.parent_module_id), moduleIdMap.get(mod.id)]
                );
            }
        }

        // Clone content items
        const { rows: contentRows } = await query<any>(
            `SELECT * FROM content_items WHERE course_id = $1`,
            [courseId]
        );

        for (const content of contentRows) {
            const newContentId = newId();
            const newModuleId = content.module_id ? moduleIdMap.get(content.module_id) : null;

            await query(
                `INSERT INTO content_items (id, type, title, source, course_id, module_id, sort_order, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                [newContentId, content.type, content.title, content.source, newCourseId, newModuleId, content.sort_order || 0, now, now]
            );
        }

        return newCourseId;
    }
}
