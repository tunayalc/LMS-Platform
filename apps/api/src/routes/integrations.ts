
import express from 'express';
import { z } from 'zod';
import { MattermostService } from '../services/mattermost';
import { JitsiService } from '../services/jitsi';
import { BackupService } from '../services/backup';
import { requireAuth, requireRole } from '../middleware/auth'; // We'll need to export these from index.ts or move to middleware

const router = express.Router();

// Mattermost: Connect Course
router.post('/mattermost/connect/:courseId', requireAuth, async (req, res) => {
    try {
        const { courseId } = req.params;
        const channelId = await MattermostService.syncCourseChannel(courseId);
        res.json({ success: true, channelId });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// Jitsi: Generate Meeting URL
router.post('/jitsi/generate', requireAuth, async (req, res) => {
    try {
        const { roomName } = z.object({ roomName: z.string().min(1) }).parse(req.body);
        const user = (req as any).user; // Express.User has email now

        const url = JitsiService.generateMeetingUrl(roomName, {
            name: user.username,
            email: user.email,
            moderator: ['Instructor', 'Admin', 'SuperAdmin'].includes(user.role)
        });

        res.json({ success: true, url });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});


// Google: Sync Course Deadlines to Calendar
router.post('/google/calendar/sync/:courseId', requireAuth, async (req, res) => {
    try {
        const { courseId } = req.params;
        const user = (req as any).user;

        // Dynamic import to avoid circular dependency if any, or just import at top
        const { GoogleWorkspaceService } = await import('../services/googleWorkspace');

        const count = await GoogleWorkspaceService.syncCourseDeadlines(user.id, courseId);
        res.json({ success: true, syncedEvents: count });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// Backup: Trigger Manual Backup
router.post('/backup/run', requireRole(['SuperAdmin']), async (req, res) => {
    try {
        const result = await BackupService.runFullBackup();
        res.json({ success: true, ...result });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
