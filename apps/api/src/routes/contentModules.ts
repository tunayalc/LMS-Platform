import { Router, Request, Response } from 'express';
import { ContentModuleService } from '../services/contentModule';
import { requireAuth, requireRole } from '../middleware/auth';
import { Role } from '../auth/utils';

const router = Router();
router.use(requireAuth);

const adminRole = ["SuperAdmin", "Admin", "Instructor", "Assistant"] as Role[];

/**
 * GET /api/modules/:courseId
 * Get modules hierarchy for a course
 */
router.get('/:courseId', async (req: Request, res: Response) => {
    try {
        const modules = await ContentModuleService.getModulesHierarchy(req.params.courseId);
        res.json(modules);
    } catch (error) {
        console.error('Get modules error:', error);
        res.status(500).json({ error: 'Modüller alınamadı' });
    }
});

/**
 * POST /api/modules
 * Create a new module
 */
router.post('/', requireRole(adminRole), async (req: Request, res: Response) => {
    try {
        const { courseId, title, description, parentModuleId, sortOrder } = req.body;
        const module = await ContentModuleService.createModule({
            courseId,
            title,
            description,
            parentModuleId,
            sortOrder
        });
        res.status(201).json(module);
    } catch (error) {
        console.error('Create module error:', error);
        res.status(500).json({ error: 'Modül oluşturulamadı' });
    }
});

/**
 * POST /api/modules/reorder
 * Reorder modules
 */
router.post('/reorder', requireRole(adminRole), async (req: Request, res: Response) => {
    try {
        // updates: { id, sortOrder, parentModuleId? }[]
        const { updates } = req.body;
        await ContentModuleService.reorderModules(updates);
        res.json({ success: true });
    } catch (error) {
        console.error('Reorder modules error:', error);
        res.status(500).json({ error: 'Modül sıralaması güncellenemedi' });
    }
});

/**
 * POST /api/modules/reorder-content
 * Reorder content within modules
 */
router.post('/reorder-content', requireRole(adminRole), async (req: Request, res: Response) => {
    try {
        // updates: { id, sortOrder, moduleId? }[]
        const { updates } = req.body;
        await ContentModuleService.reorderContent(updates);
        res.json({ success: true });
    } catch (error) {
        console.error('Reorder content error:', error);
        res.status(500).json({ error: 'İçerik sıralaması güncellenemedi' });
    }
});

/**
 * POST /api/modules/prerequisite
 * Add prerequisite
 */
router.post('/prerequisite', requireRole(adminRole), async (req: Request, res: Response) => {
    try {
        const { contentId, prerequisiteContentId } = req.body;
        const result = await ContentModuleService.addPrerequisite(contentId, prerequisiteContentId);
        res.status(201).json(result);
    } catch (error) {
        console.error('Add prerequisite error:', error);
        res.status(500).json({ error: 'Ön koşul eklenemedi' });
    }
});

/**
 * DELETE /api/modules/prerequisite
 * Remove prerequisite
 */
router.delete('/prerequisite', requireRole(adminRole), async (req: Request, res: Response) => {
    try {
        const { contentId, prerequisiteContentId } = req.body;
        await ContentModuleService.removePrerequisite(contentId, prerequisiteContentId);
        res.json({ success: true });
    } catch (error) {
        console.error('Remove prerequisite error:', error);
        res.status(500).json({ error: 'Ön koşul silinemedi' });
    }
});

/**
 * GET /api/modules/prerequisite/:contentId
 * Get prerequisites
 */
router.get('/prerequisite/:contentId', async (req: Request, res: Response) => {
    try {
        const prerequisites = await ContentModuleService.getPrerequisites(req.params.contentId);
        res.json(prerequisites);
    } catch (error) {
        console.error('Get prerequisites error:', error);
        res.status(500).json({ error: 'Ön koşullar alınamadı' });
    }
});

/**
 * POST /api/modules/clone
 * Clone a course
 */
router.post('/clone', requireRole(adminRole), async (req: Request, res: Response) => {
    try {
        const { courseId, newTitle } = req.body;
        const instructorId = (req as any).user!.id; // Current user becomes instructor of new course
        const newCourseId = await ContentModuleService.cloneCourse(courseId, newTitle, instructorId);
        res.status(201).json({ id: newCourseId });
    } catch (error) {
        console.error('Clone course error:', error);
        res.status(500).json({ error: 'Kurs kopyalanamadı' });
    }
});

/**
 * POST /api/modules/progress
 * Update content progress
 */
router.post('/progress', async (req: Request, res: Response) => {
    try {
        const { contentId, position, duration, completed } = req.body;
        const userId = (req as any).user!.id;

        await ContentModuleService.updateProgress(userId, contentId, position || 0, duration || 0, completed || false);
        res.json({ success: true });
    } catch (error) {
        console.error('Update progress error:', error);
        res.status(500).json({ error: 'İlerleme kaydedilemedi' });
    }
});

/**
 * GET /api/modules/progress/:contentId
 * Get content progress
 */
router.get('/progress/:contentId', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user!.id; // Use (req as any) to match recent fixes
        const progress = await ContentModuleService.getProgress(userId, req.params.contentId);
        res.json(progress);
    } catch (error) {
        console.error('Get progress error:', error);
        res.status(500).json({ error: 'İlerleme alınamadı' });
    }
});

export default router;
