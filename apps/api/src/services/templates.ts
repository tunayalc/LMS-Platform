
import { query } from '../db';
import crypto from 'crypto';

interface CourseTemplate {
    id: string;
    title: string;
    description?: string;
    structure: any; // JSON structure of modules/contents
    isPublic: boolean;
    createdBy: string;
}

export const TemplateService = {
    /**
     * List available templates
     */
    listTemplates: async (): Promise<CourseTemplate[]> => {
        const result = await query(
            `SELECT * FROM course_templates WHERE is_public = true OR created_by = 'system' ORDER BY title ASC`
        );
        return result.rows as CourseTemplate[];
    },

    /**
     * Create a course from a template
     */
    createCourseFromTemplate: async (templateId: string, instructorId: string, newTitle?: string) => {
        // 1. Get Template
        const tmplResult = await query(`SELECT * FROM course_templates WHERE id = $1`, [templateId]);
        if (tmplResult.rows.length === 0) throw new Error('Template not found');
        const template = tmplResult.rows[0];

        // 2. Create Course
        const courseId = crypto.randomUUID();
        const title = newTitle || `${template.title} (Copy)`;

        await query(
            `INSERT INTO courses (id, title, description, instructor_id, created_at, updated_at)
             VALUES ($1, $2, $3, $4, NOW(), NOW())`,
            [courseId, title, template.description, instructorId]
        );

        // 3. Clone Modules & Content (Mock logic for structure cloning)
        // In a real app, this would recursively copy modules and content items defined in template.structure
        // For now, we assume structure is just a JSON blob we save to course metadata if we had that column.

        return { id: courseId, title };
    }
};
