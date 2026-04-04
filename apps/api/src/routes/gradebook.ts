/**
 * Gradebook API Routes
 */

import { Router, Request, Response } from 'express';
import { GradebookService } from '../services/gradebook';

const router: Router = Router();

// Middleware for auth
const requireAuth = (req: Request, res: Response, next: Function) => {
    if (!(req as any).user) {
        (req as any).user = { id: 'anonymous', role: 'Student' };
    }
    next();
};

const requireInstructor = (req: Request, res: Response, next: Function) => {
    const role = (req as any).user?.role;
    if (!['Admin', 'SuperAdmin', 'Instructor', 'Assistant'].includes(role)) {
        return res.status(403).json({ error: 'Yetkiniz yok' });
    }
    next();
};

// ==================== CATEGORIES ====================

/**
 * GET /api/gradebook/:courseId/categories
 */
router.get('/:courseId/categories', requireAuth, async (req: Request, res: Response) => {
    try {
        const categories = await GradebookService.getCategories(req.params.courseId);
        res.json(categories);
    } catch (error) {
        console.error('Get categories error:', error);
        res.status(500).json({ error: 'Kategoriler alınamadı' });
    }
});

/**
 * POST /api/gradebook/:courseId/categories
 */
router.post('/:courseId/categories', requireAuth, requireInstructor, async (req: Request, res: Response) => {
    try {
        const { name, weight, dropLowest } = req.body;
        const category = await GradebookService.createCategory(
            req.params.courseId,
            name,
            weight || 100,
            dropLowest || 0
        );
        res.status(201).json(category);
    } catch (error) {
        console.error('Create category error:', error);
        res.status(500).json({ error: 'Kategori oluşturulamadı' });
    }
});

/**
 * PUT /api/gradebook/categories/:categoryId
 */
router.put('/categories/:categoryId', requireAuth, requireInstructor, async (req: Request, res: Response) => {
    try {
        const { name, weight, dropLowest } = req.body;
        await GradebookService.updateCategory(req.params.categoryId, { name, weight, dropLowest });
        res.json({ success: true });
    } catch (error) {
        console.error('Update category error:', error);
        res.status(500).json({ error: 'Kategori güncellenemedi' });
    }
});

/**
 * DELETE /api/gradebook/categories/:categoryId
 */
router.delete('/categories/:categoryId', requireAuth, requireInstructor, async (req: Request, res: Response) => {
    try {
        await GradebookService.deleteCategory(req.params.categoryId);
        res.json({ success: true });
    } catch (error) {
        console.error('Delete category error:', error);
        res.status(500).json({ error: 'Kategori silinemedi' });
    }
});

// ==================== GRADE ITEMS ====================

/**
 * GET /api/gradebook/:courseId/items
 */
router.get('/:courseId/items', requireAuth, async (req: Request, res: Response) => {
    try {
        const items = await GradebookService.getItems(req.params.courseId);
        res.json(items);
    } catch (error) {
        console.error('Get items error:', error);
        res.status(500).json({ error: 'Öğeler alınamadı' });
    }
});

/**
 * POST /api/gradebook/:courseId/items
 */
router.post('/:courseId/items', requireAuth, requireInstructor, async (req: Request, res: Response) => {
    try {
        const { categoryId, name, maxPoints, dueDate } = req.body;
        const item = await GradebookService.createItem(
            categoryId,
            req.params.courseId,
            name,
            maxPoints || 100,
            dueDate
        );
        res.status(201).json(item);
    } catch (error) {
        console.error('Create item error:', error);
        res.status(500).json({ error: 'Öğe oluşturulamadı' });
    }
});

/**
 * PUT /api/gradebook/items/:itemId
 */
router.put('/items/:itemId', requireAuth, requireInstructor, async (req: Request, res: Response) => {
    try {
        const { name, maxPoints, dueDate } = req.body;
        await GradebookService.updateItem(req.params.itemId, { name, maxPoints, dueDate });
        res.json({ success: true });
    } catch (error) {
        console.error('Update item error:', error);
        res.status(500).json({ error: 'Öğe güncellenemedi' });
    }
});

/**
 * DELETE /api/gradebook/items/:itemId
 */
router.delete('/items/:itemId', requireAuth, requireInstructor, async (req: Request, res: Response) => {
    try {
        await GradebookService.deleteItem(req.params.itemId);
        res.json({ success: true });
    } catch (error) {
        console.error('Delete item error:', error);
        res.status(500).json({ error: 'Öğe silinemedi' });
    }
});

// ==================== GRADES ====================

/**
 * GET /api/gradebook/items/:itemId/grades
 */
router.get('/items/:itemId/grades', requireAuth, requireInstructor, async (req: Request, res: Response) => {
    try {
        const grades = await GradebookService.getItemGrades(req.params.itemId);
        res.json(grades);
    } catch (error) {
        console.error('Get grades error:', error);
        res.status(500).json({ error: 'Notlar alınamadı' });
    }
});

/**
 * POST /api/gradebook/items/:itemId/grades
 */
router.post('/items/:itemId/grades', requireAuth, requireInstructor, async (req: Request, res: Response) => {
    try {
        const { studentId, points, feedback } = req.body;
        const graderId = (req as any).user.id;
        const grade = await GradebookService.setGrade(
            req.params.itemId,
            studentId,
            points,
            feedback,
            graderId
        );
        res.status(201).json(grade);
    } catch (error) {
        console.error('Set grade error:', error);
        res.status(500).json({ error: 'Not verilemedi' });
    }
});

/**
 * POST /api/gradebook/items/:itemId/grades/bulk
 */
router.post('/items/:itemId/grades/bulk', requireAuth, requireInstructor, async (req: Request, res: Response) => {
    try {
        const { grades } = req.body; // Array of { studentId, points, feedback }
        const graderId = (req as any).user.id;

        const results = [];
        for (const g of grades) {
            const grade = await GradebookService.setGrade(
                req.params.itemId,
                g.studentId,
                g.points,
                g.feedback,
                graderId
            );
            results.push(grade);
        }

        res.status(201).json({ count: results.length, grades: results });
    } catch (error) {
        console.error('Bulk grade error:', error);
        res.status(500).json({ error: 'Toplu not verilemedi' });
    }
});

// ==================== STUDENT VIEW ====================

/**
 * GET /api/gradebook/:courseId/my-grades
 */
router.get('/:courseId/my-grades', requireAuth, async (req: Request, res: Response) => {
    try {
        const studentId = (req as any).user.id;
        const grades = await GradebookService.getStudentGrades(req.params.courseId, studentId);
        const finalGrade = await GradebookService.calculateFinalGrade(req.params.courseId, studentId);
        res.json({ grades, finalGrade });
    } catch (error) {
        console.error('Get my grades error:', error);
        res.status(500).json({ error: 'Notlar alınamadı' });
    }
});

/**
 * GET /api/gradebook/:courseId/student/:studentId
 */
router.get('/:courseId/student/:studentId', requireAuth, requireInstructor, async (req: Request, res: Response) => {
    try {
        const grades = await GradebookService.getStudentGrades(req.params.courseId, req.params.studentId);
        const finalGrade = await GradebookService.calculateFinalGrade(req.params.courseId, req.params.studentId);
        res.json({ grades, finalGrade });
    } catch (error) {
        console.error('Get student grades error:', error);
        res.status(500).json({ error: 'Öğrenci notları alınamadı' });
    }
});

// ==================== STATISTICS ====================

/**
 * GET /api/gradebook/items/:itemId/statistics
 */
router.get('/items/:itemId/statistics', requireAuth, requireInstructor, async (req: Request, res: Response) => {
    try {
        const stats = await GradebookService.getItemStatistics(req.params.itemId);
        res.json(stats);
    } catch (error) {
        console.error('Get statistics error:', error);
        res.status(500).json({ error: 'İstatistikler alınamadı' });
    }
});

/**
 * GET /api/gradebook/:courseId/leaderboard
 */
router.get('/:courseId/leaderboard', requireAuth, async (req: Request, res: Response) => {
    try {
        const limit = parseInt(req.query.limit as string) || 10;
        const leaderboard = await GradebookService.getCourseLeaderboard(req.params.courseId, limit);
        res.json(leaderboard);
    } catch (error) {
        console.error('Get leaderboard error:', error);
        res.status(500).json({ error: 'Sıralama alınamadı' });
    }
});

// ==================== EXPORT ====================

/**
 * GET /api/gradebook/:courseId/export
 */
router.get('/:courseId/export', requireAuth, requireInstructor, async (req: Request, res: Response) => {
    try {
        const csv = await GradebookService.exportGradesCSV(req.params.courseId);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="grades_${req.params.courseId}.csv"`);
        res.send(csv);
    } catch (error) {
        console.error('Export grades error:', error);
        res.status(500).json({ error: 'Notlar dışa aktarılamadı' });
    }
});

// ==================== SYNC FROM EXAMS ====================

/**
 * POST /api/gradebook/sync-exam/:examId
 * Sync exam submissions to gradebook items
 */
router.post('/sync-exam/:examId', requireAuth, requireInstructor, async (req: Request, res: Response) => {
    try {
        const { examId } = req.params;
        const graderId = (req as any).user.id;

        // This will be implemented in GradebookService
        const result = await GradebookService.syncExamToGradebook(examId, graderId);
        res.json(result);
    } catch (error) {
        console.error('Sync exam to gradebook error:', error);
        res.status(500).json({ error: 'Sınav notları aktarılamadı' });
    }
});

export default router;
