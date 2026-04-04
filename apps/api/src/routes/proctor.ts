import express from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth';
import { z } from 'zod';
import { storageService } from '../services/storage';
import { ProctoringService } from '../services/proctor';

const router: express.Router = express.Router();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

const SnapshotMetadata = z.object({
    examId: z.string(),
    timestamp: z.string().optional(),
});

router.post('/snapshot', requireAuth, upload.single('snapshot'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No snapshot file provided' });
    }

    try {
        const { examId } = SnapshotMetadata.parse(req.body);

        // 1. Upload Snapshot
        const key = await storageService.upload(req.file, 'snapshots');

        // 2. Perform AI Analysis (Real-time)
        const analysis = await ProctoringService.analyzeImage(req.file.buffer);

        // 3. Log results
        if (!analysis.isClean) {
            console.warn(`⚠️ Proctor Violation [Exam: ${examId}, User: ${req.user!.id}]:`, analysis.violations);
            await ProctoringService.logViolation(examId, req.user!.id, analysis, key);
        }

        res.json({
            success: true,
            key: key,
            analysis: {
                isClean: analysis.isClean,
                violations: analysis.violations
            },
            message: 'Snapshot analyzed and recorded'
        });
    } catch (error) {
        console.error("Snapshot Handler Error:", error);
        res.status(400).json({ error: 'Snapshot processing error' });
    }
});

export default router;
