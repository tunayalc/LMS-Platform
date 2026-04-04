
/**
 * AI Proctoring Service using AWS Rekognition
 * Handles face detection, multiple person detection, and exam rule validation.
 */

import { RekognitionClient, DetectFacesCommand, DetectLabelsCommand } from "@aws-sdk/client-rekognition";
import { query } from '../db';

const hasAwsConfig =
    !!process.env.AWS_REGION &&
    !!process.env.AWS_ACCESS_KEY_ID &&
    !!process.env.AWS_SECRET_ACCESS_KEY;

// Initialize AWS Rekognition only when configured via env (no hardcoded defaults)
const rekognition = hasAwsConfig
    ? new RekognitionClient({
          region: process.env.AWS_REGION,
          credentials: {
              accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
          },
      })
    : null;

interface AnalysisResult {
    isClean: boolean;
    faceCount: number;
    violations: string[];
    confidence: number;
}

export const ProctoringService = {
    /**
     * Analyze image buffer for proctoring violations
     */
    analyzeImage: async (imageBuffer: Buffer): Promise<AnalysisResult> => {
        const violations: string[] = [];

        // Config waiting: allow exam to continue; still usable for UI/demo
        if (!rekognition) {
            console.log('⚠️ Proctoring: AWS Rekognition anahtarı bekleniyor. Güvenli mod varsayılıyor.');
            return {
                isClean: true,
                faceCount: 1,
                violations: [],
                confidence: 100
            };
        }

        try {
            // 1. Detect Faces
            const faceCommand = new DetectFacesCommand({
                Image: { Bytes: imageBuffer },
                Attributes: ["ALL"]
            });
            const faceResponse = await rekognition.send(faceCommand);
            const faceDetails = faceResponse.FaceDetails || [];
            const faceCount = faceDetails.length;

            if (faceCount === 0) {
                violations.push("No face detected (Kamera önünde kimse yok)");
            } else if (faceCount > 1) {
                violations.push(`Multiple faces detected: ${faceCount} (Birden fazla kişi tespit edildi)`);
            } else {
                // Single face checks
                const face = faceDetails[0];
                if (face.Sunglasses?.Value && (face.Sunglasses.Confidence ?? 0) > 90) {
                    violations.push("Sunglasses detected (Güneş gözlüğü takılı)");
                }
                if (face.EyesOpen?.Value === false && (face.EyesOpen.Confidence ?? 0) > 90) {
                    // violations.push("Eyes closed (Gözler kapalı)"); // Maybe sleeping?
                }
            }

            // 2. Detect Labels (Objects like Phone, Book)
            const labelCommand = new DetectLabelsCommand({
                Image: { Bytes: imageBuffer },
                MaxLabels: 10,
                MinConfidence: 75
            });
            const labelResponse = await rekognition.send(labelCommand);
            const labels = labelResponse.Labels || [];

            const forbiddenItems = ['Cell Phone', 'Mobile Phone', 'Phone', 'Tablet', 'Book', 'Headphones'];

            for (const label of labels) {
                if (label.Name && forbiddenItems.includes(label.Name)) {
                    violations.push(`Forbidden object detected: ${label.Name} (Yasaklı nesne)`);
                }
            }

            return {
                isClean: violations.length === 0,
                faceCount,
                violations,
                confidence: 95
            };

        } catch (error) {
            console.error("Proctoring Analysis Error:", error);
            // Fail open or closed? usually fail open for demo
            return {
                isClean: true,
                faceCount: 1,
                violations: ["AI Analysis Failed (Service Unavailable)"],
                confidence: 0
            };
        }
    },

    /**
     * Log violation to database
     */
    logViolation: async (examId: string, userId: string, analysis: AnalysisResult, imageUrl: string) => {
        if (analysis.violations.length === 0) return;

        await query(
            `INSERT INTO proctoring_logs (exam_id, user_id, violations, face_count, image_url, created_at)
             VALUES ($1, $2, $3, $4, $5, NOW())`,
            [examId, userId, analysis.violations, analysis.faceCount, imageUrl]
        );
    }
};
