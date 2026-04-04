
import Jimp from 'jimp';

// Types for OMR
export interface OmrResult {
    score: number;
    answers: Record<string, string>; // questionId -> option (A, B, C...)
    details: { questionIndex: number; selected: string; correct: boolean }[];
    debug?: {
        imageWidth: number;
        imageHeight: number;
        markersFound: boolean;
        threshold: number;
        densities: { q: number; option: string; density: number }[];
        debugImage?: string;
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// FORM LAYOUT CONFIGURATION
// Updated based on User's "Working Template" (156 Questions, 3 Columns)
// ═══════════════════════════════════════════════════════════════════════════════

/*
 * User Provided "Working" Coordinates (Approx):
 * Col 1: 0.20 - 0.45  (Width ~0.25) -> Start ~0.23
 * Col 2: 0.48 - 0.68  (Width ~0.20) -> Start ~0.49
 * Col 3: 0.76 - 1.00  (Width ~0.24) -> Start ~0.77
 * 
 * Previous config was too far right (0.55+).
 */

const FORM_LAYOUT = {
    // Answer grid columns - Based on actual form analysis
    // The form has left side for Kitapçık/Sınıf/Numara (~40% width)
    // Answer columns are on the right side (~45% to 95% of width)
    // 3 columns: 1-52, 53-104, 105-156 (total 156 questions)
    columns: [
        {
            startX: 0.46,  // Column 1 starts at ~46%
            endX: 0.58,    // Column 1 ends at ~58%
            questionsStart: 1,
            questionsCount: 52,
        },
        {
            startX: 0.60,  // Column 2 starts at ~60%
            endX: 0.72,    // Column 2 ends at ~72%
            questionsStart: 53,
            questionsCount: 52,
        },
        {
            startX: 0.75,  // Column 3 starts at ~75%
            endX: 0.87,    // Column 3 ends at ~87%
            questionsStart: 105,
            questionsCount: 52,
        }
    ],
    // Y coordinates - Answer area starts after header section
    startYRatio: 0.10,      // Start at ~10% from top (after header)
    rowHeightRatio: 0.0155, // Each row height (~1.55% of image height for 52 rows)

    options: ['A', 'B', 'C', 'D', 'E'],

    // Bubble detection radius
    bubbleRadiusRatio: 0.008,
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN OMR SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

export const OmrService = {
    /**
     * Processes an uploaded image to detect marked answers.
     * @param calibration Optional calibration overrides { threshold, xOffset, yOffset }
     */
    processExamPaper: async (
        imageBuffer: Buffer,
        answerKey: Record<string, string>,
        calibration?: { threshold?: number; xOffset?: number; yOffset?: number }
    ): Promise<OmrResult> => {
        try {
            let image = await Jimp.read(imageBuffer);
            console.log(`[OMR] Original image: ${image.getWidth()}x${image.getHeight()}`);

            // ─────────────────────────────────────────────────────────────────
            // Step 1: Pre-process Image
            // ─────────────────────────────────────────────────────────────────
            image.grayscale();
            image.contrast(0.4);

            // Normalize size (resize to standard width for consistent processing)
            const TARGET_WIDTH = 1200;
            if (image.getWidth() !== TARGET_WIDTH) {
                image.resize(TARGET_WIDTH, Jimp.AUTO);
            }

            const width = image.getWidth();
            const height = image.getHeight();
            console.log(`[OMR] Processed image: ${width}x${height}`);

            // Apply calibration offsets
            const xOffsetRatio = calibration?.xOffset ?? 0;
            const yOffsetRatio = calibration?.yOffset ?? 0;

            // ─────────────────────────────────────────────────────────────────
            // Step 2: Detect Corner Markers and Align
            // ─────────────────────────────────────────────────────────────────
            const markers = findFiducialMarkers(image);
            let markersFound = false;

            if (markers) {
                markersFound = true;
                console.log(`[OMR] Markers found: TL(${markers.tl.x},${markers.tl.y}) TR(${markers.tr.x},${markers.tr.y})`);
                image = alignImageByMarkers(image, markers);
            } else {
                console.warn("[OMR] Corner markers not detected, processing with best-effort alignment");
            }

            // ─────────────────────────────────────────────────────────────────
            // Step 3: Calculate Adaptive Threshold (or use override)
            // ─────────────────────────────────────────────────────────────────
            let adaptiveThreshold = calculateAdaptiveThreshold(image);
            if (calibration?.threshold !== undefined) {
                console.log(`[OMR] Using manual threshold: ${calibration.threshold} (auto was ${adaptiveThreshold.toFixed(2)})`);
                adaptiveThreshold = calibration.threshold;
            } else {
                console.log(`[OMR] Adaptive threshold: ${adaptiveThreshold.toFixed(2)}`);
            }

            // ─────────────────────────────────────────────────────────────────
            // Step 4: Scan All Answer Bubbles & Draw Debug Overlay
            // ─────────────────────────────────────────────────────────────────
            const answers: Record<string, string> = {};
            const details: OmrResult['details'] = [];
            const debugDensities: { q: number; option: string; density: number }[] = [];
            let score = 0;

            const bubbleRadius = Math.round(width * FORM_LAYOUT.bubbleRadiusRatio);

            // Debug Image: Clone to draw inspection grid
            const debugImg = image.clone();
            // Convert to color if it was grayscale (Jimp might keep it single channel, but drawing color usually works if treated as RGB)
            // But Jimp grayscale is still 4 channel data usually.

            // Process each column
            for (const column of FORM_LAYOUT.columns) {
                // Pre-calculate X positions for options in this column (Interpolation)
                const optionPositions = FORM_LAYOUT.options.map((_, idx) => {
                    // Linear interpolation: Start + (End - Start) * (idx / (count - 1))
                    const range = column.endX - column.startX;
                    const step = range / (FORM_LAYOUT.options.length - 1);
                    return Math.round(width * (column.startX + (step * idx) + xOffsetRatio));
                });

                for (let rowIdx = 0; rowIdx < column.questionsCount; rowIdx++) {
                    const questionNumber = column.questionsStart + rowIdx;
                    const questionId = `q_${questionNumber}`;

                    // Apply Y offset from calibration
                    const rowY = Math.round(height * (FORM_LAYOUT.startYRatio + yOffsetRatio + rowIdx * FORM_LAYOUT.rowHeightRatio));

                    // Skip if out of bounds
                    if (rowY + bubbleRadius >= height) {
                        console.warn(`[OMR] Q${questionNumber} out of bounds at Y=${rowY}`);
                        continue;
                    }

                    // Store densities for this row
                    const rowDensities: { char: string; density: number; x: number }[] = [];

                    // Check each option (A, B, C, D, E)
                    for (let optIdx = 0; optIdx < FORM_LAYOUT.options.length; optIdx++) {
                        const optionChar = FORM_LAYOUT.options[optIdx];
                        const optionX = optionPositions[optIdx];

                        if (optionX + bubbleRadius >= width) continue;

                        const density = calculateBubbleDensity(image, optionX, rowY, bubbleRadius);

                        rowDensities.push({ char: optionChar, density, x: optionX });
                        debugDensities.push({ q: questionNumber, option: optionChar, density });

                        // Debug Drawing: Red dot at scan center
                        debugImg.scan(optionX - 2, rowY - 2, 5, 5, function (x, y, idx) {
                            this.bitmap.data[idx + 0] = 255;
                            this.bitmap.data[idx + 1] = 0;
                            this.bitmap.data[idx + 2] = 0;
                            this.bitmap.data[idx + 3] = 255;
                        });
                    }

                    // ─────────────────────────────────────────────────────────────────
                    // RELATIVE DENSITY ALGORITHM (With Blank Row Guard)
                    // ─────────────────────────────────────────────────────────────────
                    // Sort by density descending
                    rowDensities.sort((a, b) => b.density - a.density);

                    const darkest = rowDensities[0];
                    const others = rowDensities.slice(1);
                    const avgOthers = others.reduce((sum, item) => sum + item.density, 0) / others.length || 0;

                    // Statistic: Standard Deviation of all 5 bubbles
                    const allDensities = rowDensities.map(d => d.density);
                    const avgAll = allDensities.reduce((a, b) => a + b, 0) / allDensities.length;
                    const variance = allDensities.reduce((a, b) => a + Math.pow(b - avgAll, 2), 0) / allDensities.length;
                    const stdDev = Math.sqrt(variance);

                    let selected = '';

                    // Parameters
                    // 1. MIN_INK: Absolute floor. Raised to 0.22 to aggressively filter shadows/noise.
                    const MIN_INK_THRESHOLD = 0.22;
                    // 2. RELATIVE_RATIO: Darkest must be 60% darker than average of others
                    const RELATIVE_RATIO = 1.60;
                    // 3. MIN_VARIANCE: Raised to 0.05 to ensure row definitely has a mark
                    const MIN_VARIANCE_THRESHOLD = 0.05;

                    const isDarkEnough = darkest.density > MIN_INK_THRESHOLD;
                    const isSignificantlyDarker = darkest.density > (avgOthers * RELATIVE_RATIO);
                    const hasContrast = stdDev > MIN_VARIANCE_THRESHOLD;

                    if (isDarkEnough && isSignificantlyDarker && hasContrast) {
                        selected = darkest.char;
                    } else {
                        // Log why it failed (for debugging)
                        // console.log(`Q${questionNumber} skipped: Dark=${darkest.density.toFixed(2)} Var=${stdDev.toFixed(3)}`);
                    }

                    // Legacy/Fallback check if relative check fails but signal is very strong?
                    // No, stick to relative. It's safer.

                    const correctAnswer = answerKey[questionId];
                    const isCorrect = selected !== '' && selected === correctAnswer;

                    if (isCorrect) score++;

                    answers[questionId] = selected;
                    details.push({
                        questionIndex: questionNumber - 1,
                        selected,
                        correct: isCorrect
                    });

                    // Draw GREEN box for selected answer
                    if (selected) {
                        const selectedBubble = rowDensities.find(d => d.char === selected);
                        if (selectedBubble) {
                            debugImg.scan(selectedBubble.x - 4, rowY - 4, 9, 9, function (x, y, idx) {
                                this.bitmap.data[idx + 0] = 0;   // R
                                this.bitmap.data[idx + 1] = 255; // G
                                this.bitmap.data[idx + 2] = 0;   // B
                                this.bitmap.data[idx + 3] = 255; // A
                            });
                        }
                    }
                }
            }

            console.log(`[OMR] Detected ${Object.values(answers).filter(a => a !== '').length} marked answers`);

            const debugBase64 = await debugImg.getBase64Async(Jimp.MIME_JPEG);

            return {
                score,
                answers,
                details,
                debug: {
                    imageWidth: width,
                    imageHeight: height,
                    markersFound,
                    threshold: adaptiveThreshold,
                    densities: debugDensities.slice(0, 50), // First 50 for debugging
                    debugImage: debugBase64
                }
            };

        } catch (error) {
            console.error("[OMR] Processing Failed:", error);
            throw error;
        }
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Calculate density of dark pixels in a circular region (bubble area)
 */
function calculateBubbleDensity(image: Jimp, cx: number, cy: number, radius: number): number {
    let darkPixels = 0;
    let totalPixels = 0;
    const diameter = radius * 2;

    const startX = Math.max(0, cx - radius);
    const startY = Math.max(0, cy - radius);
    const endX = Math.min(image.getWidth() - 1, cx + radius);
    const endY = Math.min(image.getHeight() - 1, cy + radius);

    if (startX >= endX || startY >= endY) return 0;

    for (let y = startY; y <= endY; y++) {
        for (let x = startX; x <= endX; x++) {
            const dist = Math.hypot(x - cx, y - cy);
            if (dist <= radius) {
                const idx = (y * image.getWidth() + x) * 4;
                const brightness = image.bitmap.data[idx]; // Grayscale, so R=G=B

                if (brightness < 100) { // Dark pixel threshold
                    darkPixels++;
                }
                totalPixels++;
            }
        }
    }

    return totalPixels > 0 ? darkPixels / totalPixels : 0;
}

/**
 * Calculate adaptive threshold based on image statistics
 * Samples multiple regions to determine appropriate marking threshold
 */
function calculateAdaptiveThreshold(image: Jimp): number {
    const width = image.getWidth();
    const height = image.getHeight();
    const samplePoints: number[] = [];

    // Sample random points in the answer region
    const sampleRadius = Math.round(width * 0.01);

    for (let i = 0; i < 50; i++) {
        const x = Math.round(width * (0.35 + Math.random() * 0.6));
        const y = Math.round(height * (0.1 + Math.random() * 0.8));

        const density = calculateBubbleDensity(image, x, y, sampleRadius);
        samplePoints.push(density);
    }

    // Sort and find the gap between "empty" and "filled" bubbles
    samplePoints.sort((a, b) => a - b);

    // Use the median of the upper quartile as threshold guide
    const upperQuartileStart = Math.floor(samplePoints.length * 0.75);
    const upperQuartile = samplePoints.slice(upperQuartileStart);

    if (upperQuartile.length === 0) return 0.35; // Fallback

    const avgUpper = upperQuartile.reduce((a, b) => a + b, 0) / upperQuartile.length;

    // "Doluluk seçimini fazla yap" -> Increase sensitivity range
    // Allow threshold to go lower (0.25) to catch faint marks
    // But keeping upper bound (0.60) to avoid false positives
    return Math.max(0.20, Math.min(0.60, avgUpper * 0.70));
}

/**
 * Find corner fiducial markers (dark squares at corners)
 */
function findFiducialMarkers(image: Jimp): { tl: Point; tr: Point; bl: Point; br: Point } | null {
    const w = image.getWidth();
    const h = image.getHeight();
    // Look in slightly larger corners to catch skewed images
    const cornerSizeW = Math.round(w * 0.20);
    const cornerSizeH = Math.round(h * 0.20);

    const findDarkBlob = (xStart: number, yStart: number, regionW: number, regionH: number): Point | null => {
        let sumX = 0, sumY = 0, count = 0;
        let minX = w, maxX = 0, minY = h, maxY = 0;

        for (let y = yStart; y < yStart + regionH; y++) {
            for (let x = xStart; x < xStart + regionW; x++) {
                if (x >= 0 && x < w && y >= 0 && y < h) {
                    const idx = (y * w + x) * 4;
                    const val = image.bitmap.data[idx];

                    if (val < 90) { // Slightly increased tolerance for "Dark"
                        sumX += x;
                        sumY += y;
                        count++;
                        minX = Math.min(minX, x);
                        maxX = Math.max(maxX, x);
                        minY = Math.min(minY, y);
                        maxY = Math.max(maxY, y);
                    }
                }
            }
        }

        // Filter out small noise or lines, looking for a substantial blob
        if (count > 200 && (maxX - minX) > 10 && (maxY - minY) > 10) {
            return { x: Math.round(sumX / count), y: Math.round(sumY / count) };
        }
        return null;
    };

    const tl = findDarkBlob(0, 0, cornerSizeW, cornerSizeH);
    const tr = findDarkBlob(w - cornerSizeW, 0, cornerSizeW, cornerSizeH);
    const bl = findDarkBlob(0, h - cornerSizeH, cornerSizeW, cornerSizeH);
    const br = findDarkBlob(w - cornerSizeW, h - cornerSizeH, cornerSizeW, cornerSizeH);

    if (tl && tr && bl && br) {
        return { tl, tr, bl, br };
    }

    return null;
}

interface Point {
    x: number;
    y: number;
}

/**
 * Validates if the 4 corners form a somewhat valid rectangle to avoid crazy warps
 */
/**
 * Align image based on detected corner markers (rotation correction)
 */
function alignImageByMarkers(image: Jimp, markers: { tl: Point; tr: Point }): Jimp {
    const dx = markers.tr.x - markers.tl.x;
    const dy = markers.tr.y - markers.tl.y;

    const angleRad = Math.atan2(dy, dx);
    const angleDeg = angleRad * (180 / Math.PI);

    // Only rotate if significant skew detected
    if (Math.abs(angleDeg) > 0.3 && Math.abs(angleDeg) < 15) {
        console.log(`[OMR] Rotating image by ${(-angleDeg).toFixed(2)} degrees`);
        image.rotate(-angleDeg);
    }

    return image;
}
