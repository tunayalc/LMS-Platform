import express from 'express';
import multer from 'multer';
import { OmrService } from '../services/omr';
import { requireAuth } from '../middleware/auth';

const router: express.Router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

const isMultipart = (req: express.Request) =>
    Boolean(req.headers["content-type"]?.includes("multipart/form-data"));

const maybeUpload = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!isMultipart(req)) {
        return next();
    }
    return upload.fields([
        { name: "image", maxCount: 1 },
        { name: "file", maxCount: 1 }
    ])(req, res, next);
};

const normalizeBase64 = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
        return "";
    }
    const commaIndex = trimmed.indexOf(",");
    if (trimmed.startsWith("data:") && commaIndex !== -1) {
        return trimmed.slice(commaIndex + 1);
    }
    return trimmed;
};

const resolveBase64Image = (req: express.Request) => {
    const raw = typeof req.body?.base64 === "string" ? req.body.base64 : "";
    if (raw) {
        return normalizeBase64(raw);
    }
    const images = Array.isArray(req.body?.images) ? req.body.images : [];
    const first = images[0];
    if (first && typeof first.base64 === "string") {
        return normalizeBase64(first.base64);
    }
    return "";
};

const resolveOmrBaseUrl = () => {
    const mode = process.env.LMS_MODE;
    if (mode === "docker") {
        return process.env.LMS_OMR_BASE_URL_DOCKER || "";
    }
    return process.env.LMS_OMR_BASE_URL_LOCAL || "";
};

const requestPythonOmr = async (
    buffer: Buffer,
    answerKey: Record<string, string>,
    calibration: { threshold?: number; xOffset?: number; yOffset?: number; smartAlign?: boolean; skipWarp?: boolean; manualCorners?: number[][] }
): Promise<{ result: any; service: string } | null> => {
    const baseUrl = resolveOmrBaseUrl();
    if (!baseUrl) {
        console.log("[OMR] Python service URL not configured, falling back to Node.js");
        return null;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
        const formData = new FormData();
        const blob = new Blob([new Uint8Array(buffer)], { type: "image/jpeg" });
        formData.append("file", blob, "omr.jpg");
        if (Object.keys(answerKey).length) {
            formData.append("answerKey", JSON.stringify(answerKey));
        }
        if (calibration.threshold !== undefined) {
            formData.append("threshold", calibration.threshold.toString());
        }
        if (calibration.xOffset !== undefined) {
            formData.append("xOffset", calibration.xOffset.toString());
        }
        if (calibration.yOffset !== undefined) {
            formData.append("yOffset", calibration.yOffset.toString());
        }
        if (calibration.smartAlign) {
            formData.append("smartAlign", "true");
        }
        if (calibration.skipWarp) {
            formData.append("skipWarp", "true");
        }
        // Manual corners from mobile crop mode
        if (calibration.manualCorners && Array.isArray(calibration.manualCorners)) {
            formData.append("manualCorners", JSON.stringify(calibration.manualCorners));
            console.log("[OMR] Sending manual corners to Python:", calibration.manualCorners);
        }
        // Always request debug image for diagnostics
        formData.append("debug", "true");

        console.log(`[OMR] Sending request to Python service: ${baseUrl}/scan`);
        const response = await fetch(`${baseUrl.replace(/\/$/, "")}/scan`, {
            method: "POST",
            body: formData,
            signal: controller.signal
        });
        if (!response.ok) {
            console.warn(`[OMR] Python service returned ${response.status}, falling back to Node.js`);
            return null;
        }
        const payload = await response.json();
        if (payload?.ok && payload.result) {
            console.log("[OMR] ✅ Processed by Python service");
            return { result: payload.result, service: "python" };
        }
    } catch (err) {
        console.warn("[OMR] Python service error, falling back to Node.js:", err);
        return null;
    } finally {
        clearTimeout(timeout);
    }
    return null;
};

// POST /api/omr/scan - Process OMR image and return results
router.post('/scan', requireAuth, maybeUpload, async (req, res) => {
    try {
        const files = (req as express.Request & { files?: Record<string, Express.Multer.File[]> }).files;
        const resolvedFile =
            req.file ??
            (files?.image?.[0] ?? null) ??
            (files?.file?.[0] ?? null);

        // Answer key from request body (JSON string)
        let answerKey: Record<string, string> = {};
        if (req.body.answerKey) {
            try {
                answerKey = JSON.parse(req.body.answerKey);
            } catch {
                return res.status(400).json({ error: 'Invalid answerKey JSON' });
            }
        }

        // Optional calibration parameters (including new smartAlign)
        const rawSmartAlign = (req.body as any).smartAlign;
        const rawSkipWarp = (req.body as any).skipWarp;
        const rawPreferPython = (req.body as any).preferPython;
        const preferPython = rawPreferPython === 'true' || rawPreferPython === true;

        // Manual corners from crop mode (array of 4 [x,y] points)
        let manualCorners: number[][] | undefined;
        if (req.body.corners) {
            try {
                const parsed = typeof req.body.corners === 'string'
                    ? JSON.parse(req.body.corners)
                    : req.body.corners;
                if (Array.isArray(parsed) && parsed.length === 4) {
                    manualCorners = parsed;
                    console.log('[OMR] Manual corners received:', manualCorners);
                }
            } catch {
                console.warn('[OMR] Failed to parse corners, ignoring');
            }
        }

        const calibration = {
            threshold: req.body.threshold ? parseFloat(req.body.threshold) : undefined,
            xOffset: req.body.xOffset ? parseFloat(req.body.xOffset) : undefined,
            yOffset: req.body.yOffset ? parseFloat(req.body.yOffset) : undefined,
            // Default smartAlign to true for better robustness (especially on mobile photos)
            smartAlign: rawSmartAlign === undefined ? true : (rawSmartAlign === 'true' || rawSmartAlign === true),
            // Default skipWarp to false (we want perspective correction unless explicitly disabled)
            skipWarp: rawSkipWarp === 'true' || rawSkipWarp === true,
            // Manual corners from mobile crop mode
            manualCorners,
        };
        console.log(`[OMR] Received skipWarp='${req.body.skipWarp}', parsed as: ${calibration.skipWarp}`);

        let service_used = 'nodejs';

        if (!resolvedFile) {
            const base64 = resolveBase64Image(req);
            if (!base64) {
                return res.status(400).json({ error: 'Image file is required' });
            }
            const buffer = Buffer.from(base64, "base64");
            const pythonResponse = await requestPythonOmr(buffer, answerKey, calibration);
            let result: any;
            if (pythonResponse) {
                result = pythonResponse.result;
                service_used = pythonResponse.service;
            } else {
                console.log("[OMR] ⚠️ Using Node.js fallback (Python unavailable)");
                if (preferPython) {
                    return res.status(503).json({
                        error: 'OMR Service Unavailable',
                        message: 'OMR (Python/OpenCV) servisi çalışmıyor. Lütfen `pnpm dev:omr` ile başlatın.',
                        service_used: 'python',
                    });
                }
                result = await OmrService.processExamPaper(buffer, answerKey, calibration);
            }
            return res.json({
                success: true,
                service_used,
                score: result.score ?? 0,
                answers: result.answers ?? {},
                details: result.details ?? [],
                warnings: result.warnings ?? [],
                meta: result.meta,
                debug: result.debug
            });
        }

        const pythonResponse = await requestPythonOmr(resolvedFile.buffer, answerKey, calibration);
        let result: any;
        if (pythonResponse) {
            result = pythonResponse.result;
            service_used = pythonResponse.service;
        } else {
            console.log("[OMR] ⚠️ Using Node.js fallback (Python unavailable)");
            if (preferPython) {
                return res.status(503).json({
                    error: 'OMR Service Unavailable',
                    message: 'OMR (Python/OpenCV) servisi çalışmıyor. Lütfen `pnpm dev:omr` ile başlatın.',
                    service_used: 'python',
                });
            }
            result = await OmrService.processExamPaper(resolvedFile.buffer, answerKey, calibration);
        }

        res.json({
            success: true,
            service_used,
            score: result.score ?? 0,
            answers: result.answers ?? {},
            details: result.details ?? [],
            warnings: result.warnings ?? [],
            meta: result.meta,
            debug: result.debug
        });
    } catch (error) {
        console.error('OMR Scan Error:', error);
        res.status(500).json({ error: 'OMR processing failed', details: String(error) });
    }
});

// GET /api/omr/export/:examId - Export OMR results as JSON
router.get('/export/:examId', requireAuth, async (req, res) => {
    try {
        const examId = req.params.examId;

        // In a real implementation, this would fetch stored OMR results from DB
        // For now, we return a template structure
        const exportData = {
            exportedAt: new Date().toISOString(),
            examId: examId,
            format: 'OMR_EXPORT_V1',
            results: [] as any[], // Would be populated from database
            metadata: {
                totalQuestions: 30,
                optionsPerQuestion: 5,
                layout: 'A4_PORTRAIT'
            }
        };

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename=omr_export_${examId}.json`);
        res.json(exportData);
    } catch (error) {
        console.error('OMR Export Error:', error);
        res.status(500).json({ error: 'Export failed' });
    }
});

// GET /api/omr/templates - Get available OMR template presets
router.get('/templates', requireAuth, async (_req, res) => {
    try {
        // Default OMR templates/presets for different exam paper layouts
        const templates = [
            {
                id: 'standard_30',
                name: '30 Soruluk Standart',
                questionCount: 30,
                optionsPerQuestion: 5,
                layout: 'A4_PORTRAIT',
                description: 'A4 dikey, 30 soru, 5 şık (A-E)'
            },
            {
                id: 'standard_50',
                name: '50 Soruluk Standart',
                questionCount: 50,
                optionsPerQuestion: 5,
                layout: 'A4_PORTRAIT',
                description: 'A4 dikey, 50 soru, 5 şık (A-E)'
            },
            {
                id: 'standard_100',
                name: '100 Soruluk Standart',
                questionCount: 100,
                optionsPerQuestion: 5,
                layout: 'A4_PORTRAIT',
                description: 'A4 dikey, 100 soru, 5 şık (A-E)'
            },
            {
                id: 'custom',
                name: 'Özel Şablon',
                questionCount: 0,
                optionsPerQuestion: 5,
                layout: 'CUSTOM',
                description: 'Özel ayarlarla tarama'
            }
        ];

        res.json({ templates });
    } catch (error) {
        console.error('OMR Templates Error:', error);
        res.status(500).json({ error: 'Failed to load templates' });
    }
});

export default router;
