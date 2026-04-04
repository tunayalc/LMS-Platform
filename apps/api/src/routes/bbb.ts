import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { BBBService } from '../services/bbb';

const router = Router();
router.use(requireAuth);

/**
 * POST /api/bbb/join
 * Join a BBB meeting (auto-creates if moderator)
 */
router.post('/join', async (req: Request, res: Response) => {
    try {
        // We expect meetingID to be provided. 
        // In a real app, we should verify user access to this meetingID via Course enrollment.
        // For now, checks are implicit via requireAuth (user must be logged in).
        const { meetingID, meetingName } = req.body;
        const user = (req as any).user;

        if (!meetingID || !user) {
            return res.status(400).json({ error: 'Missing parameters or user not found' });
        }

        const isAdminOrInstructor = ['admin', 'superadmin', 'instructor'].includes(user.role.toLowerCase());
        const role = isAdminOrInstructor ? 'MODERATOR' : 'VIEWER';

        // If Moderator, assume they can start/create the meeting
        if (role === 'MODERATOR') {
            await BBBService.ensureMeeting(meetingID, meetingName || 'Canlı Ders');
        }

        const url = BBBService.getJoinUrl(meetingID, user.username || user.email, role);
        res.json({ url });

    } catch (error) {
        console.error('BBB Join Error:', error);
        res.status(500).json({ error: 'Toplantıya katılınamadı' });
    }
});

export default router;
