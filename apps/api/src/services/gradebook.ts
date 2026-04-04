/**
 * Gradebook Service
 * Comprehensive grade management for courses and students
 */

import { query } from '../db';

const newId = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();

// Grade calculation methods
type GradeMethod = 'weighted' | 'points' | 'percentage' | 'letter';

// Letter grade thresholds
const LETTER_GRADES = [
    { letter: 'AA', min: 90, gpa: 4.0 },
    { letter: 'BA', min: 85, gpa: 3.5 },
    { letter: 'BB', min: 80, gpa: 3.0 },
    { letter: 'CB', min: 75, gpa: 2.5 },
    { letter: 'CC', min: 70, gpa: 2.0 },
    { letter: 'DC', min: 65, gpa: 1.5 },
    { letter: 'DD', min: 60, gpa: 1.0 },
    { letter: 'FD', min: 50, gpa: 0.5 },
    { letter: 'FF', min: 0, gpa: 0.0 },
];

interface GradeCategory {
    id: string;
    courseId: string;
    name: string;
    weight: number;  // 0-100
    dropLowest: number;
    createdAt: string;
}

interface GradeItem {
    id: string;
    categoryId: string;
    courseId: string;
    name: string;
    maxPoints: number;
    dueDate?: string;
    createdAt: string;
}

interface StudentGrade {
    id: string;
    gradeItemId: string;
    studentId: string;
    points: number;
    feedback?: string;
    gradedBy?: string;
    gradedAt?: string;
}

export const GradebookService = {
    // ==================== CATEGORIES ====================

    /**
     * Create grade category (e.g., "Quizzes", "Exams", "Homework")
     */
    createCategory: async (courseId: string, name: string, weight: number, dropLowest: number = 0): Promise<GradeCategory> => {
        const id = newId();
        const now = nowIso();

        await query(
            `INSERT INTO grade_categories (id, course_id, name, weight, drop_lowest, created_at)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [id, courseId, name, weight, dropLowest, now]
        );

        return { id, courseId, name, weight, dropLowest, createdAt: now };
    },

    /**
     * Get categories for course
     */
    getCategories: async (courseId: string): Promise<GradeCategory[]> => {
        const result = await query(
            `SELECT id, course_id as "courseId", name, weight, drop_lowest as "dropLowest", created_at as "createdAt"
             FROM grade_categories WHERE course_id = $1 ORDER BY name`,
            [courseId]
        );
        return result.rows as GradeCategory[];
    },

    /**
     * Update category
     */
    updateCategory: async (categoryId: string, updates: Partial<Pick<GradeCategory, 'name' | 'weight' | 'dropLowest'>>): Promise<void> => {
        const sets: string[] = [];
        const params: any[] = [];
        let idx = 1;

        if (updates.name !== undefined) {
            sets.push(`name = $${idx++}`);
            params.push(updates.name);
        }
        if (updates.weight !== undefined) {
            sets.push(`weight = $${idx++}`);
            params.push(updates.weight);
        }
        if (updates.dropLowest !== undefined) {
            sets.push(`drop_lowest = $${idx++}`);
            params.push(updates.dropLowest);
        }

        if (sets.length > 0) {
            params.push(categoryId);
            await query(`UPDATE grade_categories SET ${sets.join(', ')} WHERE id = $${idx}`, params);
        }
    },

    /**
     * Delete category
     */
    deleteCategory: async (categoryId: string): Promise<void> => {
        await query('DELETE FROM grade_categories WHERE id = $1', [categoryId]);
    },

    // ==================== GRADE ITEMS ====================

    /**
     * Create grade item (assignment, quiz, exam)
     */
    createItem: async (categoryId: string, courseId: string, name: string, maxPoints: number, dueDate?: string): Promise<GradeItem> => {
        const id = newId();
        const now = nowIso();

        await query(
            `INSERT INTO grade_items (id, category_id, course_id, name, max_points, due_date, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [id, categoryId, courseId, name, maxPoints, dueDate || null, now]
        );

        return { id, categoryId, courseId, name, maxPoints, dueDate, createdAt: now };
    },

    /**
     * Get items for course
     */
    getItems: async (courseId: string): Promise<GradeItem[]> => {
        const result = await query(
            `SELECT id, category_id as "categoryId", course_id as "courseId", name, max_points as "maxPoints", 
                    due_date as "dueDate", created_at as "createdAt"
             FROM grade_items WHERE course_id = $1 ORDER BY created_at`,
            [courseId]
        );
        return result.rows as GradeItem[];
    },

    /**
     * Get items by category
     */
    getItemsByCategory: async (categoryId: string): Promise<GradeItem[]> => {
        const result = await query(
            `SELECT id, category_id as "categoryId", course_id as "courseId", name, max_points as "maxPoints", 
                    due_date as "dueDate", created_at as "createdAt"
             FROM grade_items WHERE category_id = $1 ORDER BY created_at`,
            [categoryId]
        );
        return result.rows as GradeItem[];
    },

    /**
     * Update item
     */
    updateItem: async (itemId: string, updates: Partial<Pick<GradeItem, 'name' | 'maxPoints' | 'dueDate'>>): Promise<void> => {
        const sets: string[] = [];
        const params: any[] = [];
        let idx = 1;

        if (updates.name !== undefined) {
            sets.push(`name = $${idx++}`);
            params.push(updates.name);
        }
        if (updates.maxPoints !== undefined) {
            sets.push(`max_points = $${idx++}`);
            params.push(updates.maxPoints);
        }
        if (updates.dueDate !== undefined) {
            sets.push(`due_date = $${idx++}`);
            params.push(updates.dueDate);
        }

        if (sets.length > 0) {
            params.push(itemId);
            await query(`UPDATE grade_items SET ${sets.join(', ')} WHERE id = $${idx}`, params);
        }
    },

    /**
     * Delete item
     */
    deleteItem: async (itemId: string): Promise<void> => {
        await query('DELETE FROM grade_items WHERE id = $1', [itemId]);
    },

    // ==================== STUDENT GRADES ====================

    /**
     * Set student grade
     */
    setGrade: async (gradeItemId: string, studentId: string, points: number, feedback?: string, gradedBy?: string): Promise<StudentGrade> => {
        const id = newId();
        const now = nowIso();

        await query(
            `INSERT INTO student_grades (id, grade_item_id, student_id, points, feedback, graded_by, graded_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (grade_item_id, student_id) 
             DO UPDATE SET points = $4, feedback = $5, graded_by = $6, graded_at = $7`,
            [id, gradeItemId, studentId, points, feedback || null, gradedBy || null, now]
        );

        return { id, gradeItemId, studentId, points, feedback, gradedBy, gradedAt: now };
    },

    /**
     * Get grades for student in course
     */
    getStudentGrades: async (courseId: string, studentId: string): Promise<any[]> => {
        const result = await query(
            `SELECT sg.id, sg.grade_item_id as "gradeItemId", sg.points, sg.feedback, sg.graded_at as "gradedAt",
                    gi.name as "itemName", gi.max_points as "maxPoints", gc.name as "categoryName", gc.weight
             FROM student_grades sg
             JOIN grade_items gi ON sg.grade_item_id = gi.id
             JOIN grade_categories gc ON gi.category_id = gc.id
             WHERE gi.course_id = $1 AND sg.student_id = $2
             ORDER BY gi.created_at`,
            [courseId, studentId]
        );
        return result.rows;
    },

    /**
     * Get all grades for a grade item
     */
    getItemGrades: async (gradeItemId: string): Promise<any[]> => {
        const result = await query(
            `SELECT sg.id, sg.student_id as "studentId", sg.points, sg.feedback, sg.graded_at as "gradedAt",
                    u.username, u.email
             FROM student_grades sg
             JOIN users u ON sg.student_id = u.id
             WHERE sg.grade_item_id = $1
             ORDER BY u.username`,
            [gradeItemId]
        );
        return result.rows;
    },

    // ==================== CALCULATIONS ====================

    /**
     * Calculate student's final grade for course
     */
    calculateFinalGrade: async (courseId: string, studentId: string): Promise<{
        percentage: number;
        letter: string;
        gpa: number;
        categoryBreakdown: Array<{ name: string; weight: number; earned: number; possible: number; percentage: number }>;
    }> => {
        // Get categories
        const categories = await GradebookService.getCategories(courseId);

        // Get all grades
        const grades = await GradebookService.getStudentGrades(courseId, studentId);

        // Group grades by category
        const categoryGrades: Record<string, Array<{ points: number; maxPoints: number }>> = {};
        for (const grade of grades) {
            if (!categoryGrades[grade.categoryName]) {
                categoryGrades[grade.categoryName] = [];
            }
            categoryGrades[grade.categoryName].push({
                points: grade.points,
                maxPoints: grade.maxPoints,
            });
        }

        // Calculate weighted average
        let totalWeightedScore = 0;
        let totalWeight = 0;
        const categoryBreakdown: Array<{ name: string; weight: number; earned: number; possible: number; percentage: number }> = [];

        for (const category of categories) {
            const catGrades = categoryGrades[category.name] || [];

            if (catGrades.length === 0) continue;

            // Sort and drop lowest if configured
            if (category.dropLowest > 0) {
                catGrades.sort((a, b) => (a.points / a.maxPoints) - (b.points / b.maxPoints));
                catGrades.splice(0, category.dropLowest);
            }

            const earned = catGrades.reduce((sum, g) => sum + g.points, 0);
            const possible = catGrades.reduce((sum, g) => sum + g.maxPoints, 0);
            const percentage = possible > 0 ? (earned / possible) * 100 : 0;

            categoryBreakdown.push({
                name: category.name,
                weight: category.weight,
                earned,
                possible,
                percentage: Math.round(percentage * 100) / 100,
            });

            totalWeightedScore += percentage * (category.weight / 100);
            totalWeight += category.weight;
        }

        // Normalize if weights don't add to 100
        const finalPercentage = totalWeight > 0 ? (totalWeightedScore / totalWeight) * 100 : 0;

        // Convert to letter grade
        const letterGrade = LETTER_GRADES.find(g => finalPercentage >= g.min) || LETTER_GRADES[LETTER_GRADES.length - 1];

        return {
            percentage: Math.round(finalPercentage * 100) / 100,
            letter: letterGrade.letter,
            gpa: letterGrade.gpa,
            categoryBreakdown,
        };
    },

    /**
     * Get class statistics for grade item
     */
    getItemStatistics: async (gradeItemId: string): Promise<{
        count: number;
        average: number;
        median: number;
        min: number;
        max: number;
        stdDev: number;
    }> => {
        const result = await query(
            `SELECT 
                COUNT(*)::int as count,
                COALESCE(AVG(points), 0) as average,
                COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY points), 0) as median,
                COALESCE(MIN(points), 0) as min,
                COALESCE(MAX(points), 0) as max,
                COALESCE(STDDEV(points), 0) as std_dev
             FROM student_grades WHERE grade_item_id = $1`,
            [gradeItemId]
        );

        const stats = result.rows[0];
        return {
            count: stats.count,
            average: Math.round(stats.average * 100) / 100,
            median: Math.round(stats.median * 100) / 100,
            min: stats.min,
            max: stats.max,
            stdDev: Math.round(stats.std_dev * 100) / 100,
        };
    },

    /**
     * Get course leaderboard
     */
    getCourseLeaderboard: async (courseId: string, limit: number = 10): Promise<Array<{
        studentId: string;
        username: string;
        percentage: number;
        letter: string;
    }>> => {
        // Get enrolled students
        const studentsResult = await query(
            `SELECT u.id, u.username 
             FROM course_enrollments ce 
             JOIN users u ON ce.user_id = u.id 
             WHERE ce.course_id = $1`,
            [courseId]
        );

        const leaderboard: Array<{ studentId: string; username: string; percentage: number; letter: string }> = [];

        for (const student of studentsResult.rows) {
            const grade = await GradebookService.calculateFinalGrade(courseId, student.id);
            leaderboard.push({
                studentId: student.id,
                username: student.username,
                percentage: grade.percentage,
                letter: grade.letter,
            });
        }

        // Sort by percentage descending
        leaderboard.sort((a, b) => b.percentage - a.percentage);

        return leaderboard.slice(0, limit);
    },

    /**
     * Export grades as CSV
     */
    exportGradesCSV: async (courseId: string): Promise<string> => {
        const items = await GradebookService.getItems(courseId);
        const studentsResult = await query(
            `SELECT u.id, u.username, u.email 
             FROM course_enrollments ce 
             JOIN users u ON ce.user_id = u.id 
             WHERE ce.course_id = $1 ORDER BY u.username`,
            [courseId]
        );

        // Header row
        const headers = ['Öğrenci', 'E-posta', ...items.map(i => i.name), 'Toplam %', 'Harf'];
        const rows: string[][] = [headers];

        for (const student of studentsResult.rows) {
            const grades = await GradebookService.getStudentGrades(courseId, student.id);
            const finalGrade = await GradebookService.calculateFinalGrade(courseId, student.id);

            const row = [
                student.username,
                student.email || '',
                ...items.map(item => {
                    const grade = grades.find(g => g.gradeItemId === item.id);
                    return grade ? `${grade.points}/${item.maxPoints}` : '-';
                }),
                finalGrade.percentage.toString(),
                finalGrade.letter,
            ];
            rows.push(row);
        }

        return rows.map(row => row.join(',')).join('\n');
    },

    /**
     * Sync exam submissions to gradebook
     * Creates a grade item for the exam and populates grades from submissions
     */
    syncExamToGradebook: async (examId: string, graderId: string): Promise<{ synced: number; created: boolean }> => {
        // 1. Get exam info
        const examResult = await query(
            `SELECT id, title, course_id FROM exams WHERE id = $1`,
            [examId]
        );

        if (examResult.rows.length === 0) {
            throw new Error('Sınav bulunamadı');
        }

        const exam = examResult.rows[0];
        const courseId = exam.course_id;

        if (!courseId) {
            throw new Error('Sınav bir kursa bağlı değil');
        }

        // 2. Get or create "Sınavlar" category
        let category = (await query(
            `SELECT id FROM grade_categories WHERE course_id = $1 AND name = 'Sınavlar'`,
            [courseId]
        )).rows[0];

        if (!category) {
            const catId = newId();
            await query(
                `INSERT INTO grade_categories (id, course_id, name, weight, drop_lowest, created_at) 
                 VALUES ($1, $2, 'Sınavlar', 40, 0, NOW())`,
                [catId, courseId]
            );
            category = { id: catId };
        }

        // 3. Get or create grade item for this exam
        let gradeItem = (await query(
            `SELECT id, max_points FROM grade_items WHERE course_id = $1 AND name = $2`,
            [courseId, exam.title]
        )).rows[0];

        let created = false;
        if (!gradeItem) {
            // Calculate max points from questions
            const maxPointsResult = await query(
                `SELECT COALESCE(SUM(points), 100) as max FROM questions WHERE exam_id = $1`,
                [examId]
            );
            const maxPoints = maxPointsResult.rows[0]?.max || 100;

            const itemId = newId();
            await query(
                `INSERT INTO grade_items (id, category_id, course_id, name, max_points, due_date, created_at)
                 VALUES ($1, $2, $3, $4, $5, NULL, NOW())`,
                [itemId, category.id, courseId, exam.title, maxPoints]
            );
            gradeItem = { id: itemId, max_points: maxPoints };
            created = true;
        }

        // 4. Get exam submissions and sync to grades
        const submissions = await query(
            `SELECT user_id, score FROM exam_submissions 
             WHERE exam_id = $1 AND submitted_at IS NOT NULL`,
            [examId]
        );

        let synced = 0;
        for (const sub of submissions.rows) {
            await GradebookService.setGrade(
                gradeItem.id,
                sub.user_id,
                sub.score || 0,
                'Otomatik senkronize edildi',
                graderId
            );
            synced++;
        }

        return { synced, created };
    },
};

export default GradebookService;
