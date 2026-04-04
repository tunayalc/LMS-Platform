/**
 * Safe Exam Browser Routes
 * SEB is MANDATORY for all exams - no enable/disable option
 */

import { Router, Request, Response } from 'express';
import { query } from '../db';
import { SEBService, requireSEB } from '../services/seb';
import { requireAuth } from '../middleware/auth';

const router = Router();

/**
 * GET /api/exams/:examId/seb-config
 * Download .seb configuration file for an exam
 */
router.get('/exams/:examId/seb-config', requireAuth, async (req: Request, res: Response) => {
    try {
        const { examId } = req.params;
        const user = (req as any).user;

        // Get exam details
        const examResult = await query(
            'SELECT id, title, duration_minutes, seb_browser_key FROM exams WHERE id = $1',
            [examId]
        );

        if (examResult.rows.length === 0) {
            return res.status(404).json({ error: 'Sınav bulunamadı' });
        }

        const exam = examResult.rows[0];
        // SEB should open the WEB app URL (not the API host).
        const baseUrl =
            process.env.LMS_WEB_URL ||
            process.env.LMS_WEB_BASE_URL ||
            process.env.APP_URL ||
            'http://localhost:3000';

        // Ensure browser key exists
        let browserKey = exam.seb_browser_key;
        if (!browserKey) {
            browserKey = SEBService.generateBrowserKey(examId);
            await query(
                'UPDATE exams SET seb_browser_key = $2 WHERE id = $1',
                [examId, browserKey]
            );
        }

        // Generate SEB config
        const sebConfig = SEBService.generateConfigFile({
            examUrl: `${baseUrl}/exam/${examId}/take?token=${generateExamToken(user.id, examId)}`,
            examTitle: exam.title,
            duration: exam.duration_minutes,
            allowQuit: false,
            allowSpellCheck: false,
            enableURLFilter: true,
            allowedURLs: [
                `${baseUrl}/*`,
                'about:blank'
            ],
            blockedURLs: [
                '*google*',
                '*bing*',
                '*chatgpt*',
                '*openai*',
                '*claude*',
                '*gemini*',
                '*copilot*'
            ],
            browserKey
        });

        // Set filename
        const filename = `${exam.title.replace(/[^a-zA-Z0-9]/g, '_')}_SEB.seb`;

        res.setHeader('Content-Type', 'application/seb');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(sebConfig);

    } catch (error: any) {
        console.error('SEB config error:', error);
        res.status(500).json({ error: 'SEB yapılandırması oluşturulamadı' });
    }
});

/**
 * GET /api/exams/:examId/seb-status
 * Check if current request is from SEB
 */
router.get('/exams/:examId/seb-status', requireAuth, async (req: Request, res: Response) => {
    const isSEB = SEBService.isSEBRequest(req);
    const version = SEBService.getSEBVersion(req);

    res.json({
        isSEB,
        version,
        sebRequired: true, // Always required
        userAgent: req.headers['user-agent'],
        message: isSEB
            ? 'SEB tarayıcısı algılandı. Sınava devam edebilirsiniz.'
            : 'SEB tarayıcısı algılanmadı. Lütfen SEB ile giriş yapın.'
    });
});

/**
 * GET /api/exams/:examId/take-secure
 * Protected exam taking route - ALWAYS requires SEB
 */
router.get('/exams/:examId/take-secure', requireAuth, async (req: Request, res: Response) => {
    try {
        const { examId } = req.params;

        // Get exam and its browser key
        const examResult = await query(
            'SELECT id, title, seb_browser_key FROM exams WHERE id = $1',
            [examId]
        );

        if (examResult.rows.length === 0) {
            return res.status(404).json({ error: 'Sınav bulunamadı' });
        }

        const exam = examResult.rows[0];

        // SEB is ALWAYS required - apply middleware
        const sebMiddleware = requireSEB({ browserKey: exam.seb_browser_key });
        return sebMiddleware(req, res, () => {
            // SEB validated, proceed
            res.json({
                success: true,
                message: 'SEB doğrulandı, sınava başlayabilirsiniz',
                examId,
                sebValidated: true
            });
        });

    } catch (error: any) {
        console.error('Secure exam error:', error);
        res.status(500).json({ error: 'Sınav erişim hatası' });
    }
});

/**
 * GET /api/exams/:examId/seb-info
 * Get SEB information for an exam (for display purposes)
 */
router.get('/exams/:examId/seb-info', requireAuth, async (req: Request, res: Response) => {
    try {
        const { examId } = req.params;

        const examResult = await query(
            'SELECT id, title, seb_browser_key FROM exams WHERE id = $1',
            [examId]
        );

        if (examResult.rows.length === 0) {
            return res.status(404).json({ error: 'Sınav bulunamadı' });
        }

        const exam = examResult.rows[0];

        res.json({
            examId,
            examTitle: exam.title,
            sebRequired: true, // Always true
            hasBrowserKey: !!exam.seb_browser_key,
            configDownloadUrl: `/api/exams/${examId}/seb-config`,
            sebDownloadUrl: 'https://safeexambrowser.org/download_en.html',
            features: [
                'Kiosk Modu (Tam ekran kilitleme)',
                'Ekran görüntüsü engeli',
                'Kopyala/Yapıştır engeli',
                'Geliştirici araçları engeli',
                'URL filtreleme',
                'Uygulama değişiklik algılama',
                'Browser Key doğrulama'
            ]
        });

    } catch (error: any) {
        console.error('SEB info error:', error);
        res.status(500).json({ error: 'SEB bilgisi alınamadı' });
    }
});

// Helper: Generate temporary exam access token
function generateExamToken(userId: string, examId: string): string {
    const crypto = require('crypto');
    const data = `${userId}:${examId}:${Date.now()}`;
    return crypto.createHash('sha256').update(data).digest('hex').substring(0, 32);
}

export default router;
