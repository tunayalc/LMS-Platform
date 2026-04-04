/**
 * Question Grader Service
 * Centralized grading for all question types
 */

import CodeSandbox from './codeSandbox';

// Grading Result Interface
export interface GradingResult {
    score: number;           // Points earned
    maxScore: number;        // Maximum possible points
    percentage: number;      // 0-100
    isCorrect: boolean;
    isPartial: boolean;
    feedback?: string;
    details?: Record<string, any>;
}

// Question Data Interface
export interface QuestionData {
    type: string;
    answer: any;             // Correct answer
    options?: any;           // Question options
    meta?: Record<string, any>;
    points?: number;
}

// Grader Factory
export const QuestionGrader = {
    /**
     * Grade a question answer
     */
    grade: async (
        question: QuestionData,
        userAnswer: any,
        maxPoints: number = 10
    ): Promise<GradingResult> => {
        const graders: Record<string, (q: QuestionData, a: any, max: number) => Promise<GradingResult>> = {
            'multiple_choice': gradeMultipleChoice,
            'multiple_select': gradeMultipleSelect,
            'true_false': gradeTrueFalse,
            'matching': gradeMatching,
            'ordering': gradeOrdering,
            'fill_blank': gradeFillBlank,
            'short_answer': gradeShortAnswer,
            'long_answer': gradeLongAnswer,
            'hotspot': gradeHotspot,
            'code': gradeCode,
            'calculation': gradeCalculation,
            'file_upload': gradeFileUpload
        };

        const grader = graders[question.type];
        if (!grader) {
            return {
                score: 0,
                maxScore: maxPoints,
                percentage: 0,
                isCorrect: false,
                isPartial: false,
                feedback: `Bilinmeyen soru tipi: ${question.type}`
            };
        }

        return grader(question, userAnswer, maxPoints);
    },

    /**
     * Grade multiple questions
     */
    gradeAll: async (
        questions: Array<{ question: QuestionData; userAnswer: any; maxPoints?: number }>
    ): Promise<{ results: GradingResult[]; totalScore: number; totalMaxScore: number; percentage: number }> => {
        const results: GradingResult[] = [];
        let totalScore = 0;
        let totalMaxScore = 0;

        for (const item of questions) {
            const result = await QuestionGrader.grade(
                item.question,
                item.userAnswer,
                item.maxPoints || 10
            );
            results.push(result);
            totalScore += result.score;
            totalMaxScore += result.maxScore;
        }

        return {
            results,
            totalScore,
            totalMaxScore,
            percentage: totalMaxScore > 0 ? Math.round((totalScore / totalMaxScore) * 100) : 0
        };
    }
};

// ==================== GRADERS ====================

/**
 * Multiple Choice - Single correct answer
 */
async function gradeMultipleChoice(q: QuestionData, answer: any, maxPoints: number): Promise<GradingResult> {
    const correct = String(q.answer).trim().toLowerCase();
    const user = String(answer || '').trim().toLowerCase();
    const isCorrect = correct === user;

    return {
        score: isCorrect ? maxPoints : 0,
        maxScore: maxPoints,
        percentage: isCorrect ? 100 : 0,
        isCorrect,
        isPartial: false,
        feedback: isCorrect ? 'Doğru!' : `Yanlış. Doğru cevap: ${q.answer}`
    };
}

/**
 * Multiple Select - Multiple correct answers with partial credit
 */
async function gradeMultipleSelect(q: QuestionData, answer: any, maxPoints: number): Promise<GradingResult> {
    const correctAnswers: string[] = Array.isArray(q.answer) ? q.answer : [q.answer];
    const userAnswers: string[] = Array.isArray(answer) ? answer : [answer].filter(Boolean);

    const correctSet = new Set(correctAnswers.map(a => String(a).trim().toLowerCase()));
    const userSet = new Set(userAnswers.map(a => String(a).trim().toLowerCase()));

    let correctCount = 0;
    let wrongCount = 0;

    for (const ans of userSet) {
        if (correctSet.has(ans)) {
            correctCount++;
        } else {
            wrongCount++;
        }
    }

    // Partial credit: each correct +1, each wrong -0.5 (min 0)
    const pointPerCorrect = maxPoints / correctSet.size;
    const penalty = pointPerCorrect * 0.5;
    let score = (correctCount * pointPerCorrect) - (wrongCount * penalty);
    score = Math.max(0, Math.min(maxPoints, score));

    const isCorrect = correctCount === correctSet.size && wrongCount === 0;
    const isPartial = score > 0 && !isCorrect;

    return {
        score: Math.round(score * 100) / 100,
        maxScore: maxPoints,
        percentage: Math.round((score / maxPoints) * 100),
        isCorrect,
        isPartial,
        feedback: isCorrect ? 'Tüm seçimler doğru!' :
            `${correctCount}/${correctSet.size} doğru. ${wrongCount} yanlış seçim.`,
        details: { correctCount, wrongCount, totalCorrect: correctSet.size }
    };
}

/**
 * True/False
 */
async function gradeTrueFalse(q: QuestionData, answer: any, maxPoints: number): Promise<GradingResult> {
    const normalizeAnswer = (a: any): boolean => {
        if (typeof a === 'boolean') return a;
        const str = String(a).trim().toLowerCase();
        return str === 'true' || str === 'doğru' || str === 'dogru' || str === '1';
    };

    const correct = normalizeAnswer(q.answer);
    const user = normalizeAnswer(answer);
    const isCorrect = correct === user;

    return {
        score: isCorrect ? maxPoints : 0,
        maxScore: maxPoints,
        percentage: isCorrect ? 100 : 0,
        isCorrect,
        isPartial: false,
        feedback: isCorrect ? 'Doğru!' : `Yanlış. Doğru cevap: ${correct ? 'Doğru' : 'Yanlış'}`
    };
}

/**
 * Matching - Pair matching
 */
async function gradeMatching(q: QuestionData, answer: any, maxPoints: number): Promise<GradingResult> {
    const correctPairs: Record<string, string> = q.answer || {};
    const userPairs: Record<string, string> = answer || {};

    const totalPairs = Object.keys(correctPairs).length;
    if (totalPairs === 0) {
        return { score: maxPoints, maxScore: maxPoints, percentage: 100, isCorrect: true, isPartial: false };
    }

    let correctCount = 0;
    for (const [left, right] of Object.entries(correctPairs)) {
        const userRight = userPairs[left];
        if (String(userRight).trim().toLowerCase() === String(right).trim().toLowerCase()) {
            correctCount++;
        }
    }

    const score = (correctCount / totalPairs) * maxPoints;
    const isCorrect = correctCount === totalPairs;
    const isPartial = correctCount > 0 && !isCorrect;

    return {
        score: Math.round(score * 100) / 100,
        maxScore: maxPoints,
        percentage: Math.round((correctCount / totalPairs) * 100),
        isCorrect,
        isPartial,
        feedback: isCorrect ? 'Tüm eşleştirmeler doğru!' : `${correctCount}/${totalPairs} doğru eşleştirme.`,
        details: { correctCount, totalPairs }
    };
}

/**
 * Ordering - Sequence ordering
 */
async function gradeOrdering(q: QuestionData, answer: any, maxPoints: number): Promise<GradingResult> {
    const correctOrder: string[] = Array.isArray(q.answer) ? q.answer : [];
    const userOrder: string[] = Array.isArray(answer) ? answer : [];

    if (correctOrder.length === 0) {
        return { score: maxPoints, maxScore: maxPoints, percentage: 100, isCorrect: true, isPartial: false };
    }

    // Count items in correct position
    let correctPositions = 0;
    for (let i = 0; i < correctOrder.length; i++) {
        if (i < userOrder.length &&
            String(correctOrder[i]).trim().toLowerCase() === String(userOrder[i]).trim().toLowerCase()) {
            correctPositions++;
        }
    }

    const score = (correctPositions / correctOrder.length) * maxPoints;
    const isCorrect = correctPositions === correctOrder.length;
    const isPartial = correctPositions > 0 && !isCorrect;

    return {
        score: Math.round(score * 100) / 100,
        maxScore: maxPoints,
        percentage: Math.round((correctPositions / correctOrder.length) * 100),
        isCorrect,
        isPartial,
        feedback: isCorrect ? 'Sıralama doğru!' : `${correctPositions}/${correctOrder.length} doğru pozisyon.`,
        details: { correctPositions, totalItems: correctOrder.length }
    };
}

/**
 * Fill in the Blank
 */
async function gradeFillBlank(q: QuestionData, answer: any, maxPoints: number): Promise<GradingResult> {
    const correctAnswers: string[] = Array.isArray(q.answer) ? q.answer : [q.answer];
    const userAnswer = String(answer || '').trim().toLowerCase();

    // Check if user answer matches any acceptable answer
    const isCorrect = correctAnswers.some(correct => {
        const normalizedCorrect = String(correct).trim().toLowerCase();
        // Check exact match or regex
        if (normalizedCorrect.startsWith('/') && normalizedCorrect.endsWith('/')) {
            try {
                const regex = new RegExp(normalizedCorrect.slice(1, -1), 'i');
                return regex.test(userAnswer);
            } catch {
                return normalizedCorrect === userAnswer;
            }
        }
        return normalizedCorrect === userAnswer;
    });

    return {
        score: isCorrect ? maxPoints : 0,
        maxScore: maxPoints,
        percentage: isCorrect ? 100 : 0,
        isCorrect,
        isPartial: false,
        feedback: isCorrect ? 'Doğru!' : `Yanlış. Kabul edilen cevaplar: ${correctAnswers.join(', ')}`
    };
}

/**
 * Short Answer - Fuzzy matching
 */
async function gradeShortAnswer(q: QuestionData, answer: any, maxPoints: number): Promise<GradingResult> {
    const correctAnswers: string[] = Array.isArray(q.answer) ? q.answer : [q.answer];
    const userAnswer = String(answer || '').trim().toLowerCase();

    // Check exact or fuzzy match
    let bestMatch = 0;
    for (const correct of correctAnswers) {
        const normalizedCorrect = String(correct).trim().toLowerCase();

        // Exact match
        if (normalizedCorrect === userAnswer) {
            bestMatch = 1;
            break;
        }

        // Fuzzy match using Levenshtein similarity
        const similarity = calculateSimilarity(normalizedCorrect, userAnswer);
        if (similarity > bestMatch) {
            bestMatch = similarity;
        }
    }

    // Threshold for acceptance (85% similarity)
    const threshold = q.meta?.similarityThreshold || 0.85;
    const isCorrect = bestMatch >= threshold;
    const isPartial = bestMatch >= 0.5 && !isCorrect;

    const score = isCorrect ? maxPoints : (isPartial ? maxPoints * bestMatch : 0);

    return {
        score: Math.round(score * 100) / 100,
        maxScore: maxPoints,
        percentage: Math.round(bestMatch * 100),
        isCorrect,
        isPartial,
        feedback: isCorrect ? 'Doğru!' :
            isPartial ? `Kısmen doğru (%${Math.round(bestMatch * 100)} benzerlik)` : 'Yanlış.',
        details: { similarity: bestMatch }
    };
}

/**
 * Long Answer - Manual grading required
 */
async function gradeLongAnswer(q: QuestionData, answer: any, maxPoints: number): Promise<GradingResult> {
    // Long answers require manual grading
    return {
        score: 0,
        maxScore: maxPoints,
        percentage: 0,
        isCorrect: false,
        isPartial: false,
        feedback: 'Bu soru manuel değerlendirme gerektiriyor.',
        details: { requiresManualGrading: true, userAnswer: answer }
    };
}

/**
 * Hotspot - Region/coordinate checking
 */
async function gradeHotspot(q: QuestionData, answer: any, maxPoints: number): Promise<GradingResult> {
    const regions: Array<{
        id: string;
        type: 'circle' | 'rectangle' | 'polygon';
        x?: number;
        y?: number;
        radius?: number;
        width?: number;
        height?: number;
        points?: Array<{ x: number; y: number }>;
    }> = q.meta?.regions || [];

    const correctRegionId = q.answer;
    const userClick: { x: number; y: number } = answer || { x: 0, y: 0 };

    // Find which region the user clicked
    let clickedRegion: string | null = null;
    for (const region of regions) {
        if (isPointInRegion(userClick, region)) {
            clickedRegion = region.id;
            break;
        }
    }

    const isCorrect = clickedRegion === correctRegionId;

    return {
        score: isCorrect ? maxPoints : 0,
        maxScore: maxPoints,
        percentage: isCorrect ? 100 : 0,
        isCorrect,
        isPartial: false,
        feedback: isCorrect ? 'Doğru bölge!' : 'Yanlış bölge.',
        details: { clickedRegion, correctRegion: correctRegionId, userClick }
    };
}

/**
 * Code - Execute and test
 */
async function gradeCode(q: QuestionData, answer: any, maxPoints: number): Promise<GradingResult> {
    const language = q.meta?.language || 'python';
    const testCases = q.meta?.testCases || [];
    const code = String(answer || '');

    if (!code.trim()) {
        return {
            score: 0,
            maxScore: maxPoints,
            percentage: 0,
            isCorrect: false,
            isPartial: false,
            feedback: 'Kod girilmedi.'
        };
    }

    try {
        const result = await CodeSandbox.gradeSubmission(code, language, testCases);
        const percentage = result.maxScore > 0 ? Math.round((result.score / result.maxScore) * 100) : 0;
        const scaledScore = (percentage / 100) * maxPoints;

        return {
            score: Math.round(scaledScore * 100) / 100,
            maxScore: maxPoints,
            percentage,
            isCorrect: percentage === 100,
            isPartial: percentage > 0 && percentage < 100,
            feedback: `${result.results.filter(r => r.passed).length}/${result.results.length} test geçti.`,
            details: { testResults: result.results }
        };
    } catch (error) {
        return {
            score: 0,
            maxScore: maxPoints,
            percentage: 0,
            isCorrect: false,
            isPartial: false,
            feedback: `Kod çalıştırma hatası: ${error}`
        };
    }
}

/**
 * Calculation - Math expression evaluation
 */
async function gradeCalculation(q: QuestionData, answer: any, maxPoints: number): Promise<GradingResult> {
    const correctAnswer = q.answer;
    const userAnswer = answer;
    const tolerance = q.meta?.tolerance || 0.001;

    try {
        const correctNum = parseFloat(String(correctAnswer));
        const userNum = parseFloat(String(userAnswer));

        if (isNaN(userNum)) {
            return {
                score: 0,
                maxScore: maxPoints,
                percentage: 0,
                isCorrect: false,
                isPartial: false,
                feedback: 'Geçersiz sayı formatı.'
            };
        }

        const difference = Math.abs(correctNum - userNum);
        const isCorrect = difference <= tolerance;

        return {
            score: isCorrect ? maxPoints : 0,
            maxScore: maxPoints,
            percentage: isCorrect ? 100 : 0,
            isCorrect,
            isPartial: false,
            feedback: isCorrect ? 'Doğru!' : `Yanlış. Doğru cevap: ${correctAnswer}`,
            details: { difference, tolerance }
        };
    } catch (error) {
        return {
            score: 0,
            maxScore: maxPoints,
            percentage: 0,
            isCorrect: false,
            isPartial: false,
            feedback: 'Hesaplama hatası.'
        };
    }
}

/**
 * File Upload - Manual grading
 */
async function gradeFileUpload(q: QuestionData, answer: any, maxPoints: number): Promise<GradingResult> {
    const fileInfo = answer; // { filename, url, size, type }

    if (!fileInfo || !fileInfo.filename) {
        return {
            score: 0,
            maxScore: maxPoints,
            percentage: 0,
            isCorrect: false,
            isPartial: false,
            feedback: 'Dosya yüklenmedi.'
        };
    }

    return {
        score: 0,
        maxScore: maxPoints,
        percentage: 0,
        isCorrect: false,
        isPartial: false,
        feedback: 'Dosya yüklendi. Manuel değerlendirme bekleniyor.',
        details: { requiresManualGrading: true, fileInfo }
    };
}

// ==================== HELPERS ====================

/**
 * Calculate Levenshtein similarity (0-1)
 */
function calculateSimilarity(a: string, b: string): number {
    if (a === b) return 1;
    if (a.length === 0 || b.length === 0) return 0;

    const matrix: number[][] = [];
    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }

    const maxLen = Math.max(a.length, b.length);
    return 1 - (matrix[b.length][a.length] / maxLen);
}

/**
 * Check if point is in region
 */
function isPointInRegion(
    point: { x: number; y: number },
    region: { type: string; x?: number; y?: number; radius?: number; width?: number; height?: number; points?: Array<{ x: number; y: number }> }
): boolean {
    switch (region.type) {
        case 'circle':
            const dx = point.x - (region.x || 0);
            const dy = point.y - (region.y || 0);
            return Math.sqrt(dx * dx + dy * dy) <= (region.radius || 0);

        case 'rectangle':
            const rx = region.x || 0;
            const ry = region.y || 0;
            return point.x >= rx && point.x <= rx + (region.width || 0) &&
                point.y >= ry && point.y <= ry + (region.height || 0);

        case 'polygon':
            if (!region.points || region.points.length < 3) return false;
            return isPointInPolygon(point, region.points);

        default:
            return false;
    }
}

/**
 * Ray casting algorithm for polygon
 */
function isPointInPolygon(point: { x: number; y: number }, polygon: Array<{ x: number; y: number }>): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].x, yi = polygon[i].y;
        const xj = polygon[j].x, yj = polygon[j].y;

        if (((yi > point.y) !== (yj > point.y)) &&
            (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi)) {
            inside = !inside;
        }
    }
    return inside;
}

export default QuestionGrader;
