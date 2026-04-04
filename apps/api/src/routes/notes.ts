import { Router, Request, Response } from 'express';
import { NotesService } from '../services/notes';
import { requireAuth } from '../middleware/auth';

const router = Router();

// All notes routes require auth
router.use(requireAuth);

/**
 * POST /api/notes
 * Create a new note
 */
router.post('/', async (req: Request, res: Response) => {
    try {
        const { contentId, contentType, text, timestamp, pageNumber, color } = req.body;
        const userId = (req as any).user!.id;

        const note = await NotesService.create(
            userId,
            contentId,
            contentType,
            text,
            { timestamp, pageNumber, color }
        );
        res.status(201).json(note);
    } catch (error) {
        console.error('Create note error:', error);
        res.status(500).json({ error: 'Not oluşturulamadı' });
    }
});

/**
 * GET /api/notes/content/:contentId
 * Get notes for specific content
 */
router.get('/content/:contentId', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user!.id;
        const notes = await NotesService.getByContent(userId, req.params.contentId);
        res.json(notes);
    } catch (error) {
        console.error('Get content notes error:', error);
        res.status(500).json({ error: 'Notlar alınamadı' });
    }
});

/**
 * GET /api/notes/course/:courseId
 * Get all notes for a course
 */
router.get('/course/:courseId', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user!.id;
        const notes = await NotesService.getByCourse(userId, req.params.courseId);
        res.json(notes);
    } catch (error) {
        console.error('Get course notes error:', error);
        res.status(500).json({ error: 'Ders notları alınamadı' });
    }
});

/**
 * PUT /api/notes/:id
 * Update a note
 */
router.put('/:id', async (req: Request, res: Response) => {
    try {
        const { text, color } = req.body;
        const userId = (req as any).user!.id;

        await NotesService.update(req.params.id, userId, text, color);
        res.json({ success: true });
    } catch (error) {
        console.error('Update note error:', error);
        res.status(500).json({ error: 'Not güncellenemedi' });
    }
});

/**
 * DELETE /api/notes/:id
 * Delete a note
 */
router.delete('/:id', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user!.id;
        await NotesService.delete(req.params.id, userId);
        res.json({ success: true });
    } catch (error) {
        console.error('Delete note error:', error);
        res.status(500).json({ error: 'Not silinemedi' });
    }
});

export default router;
