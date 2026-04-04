
import { query } from '../db';

interface PlagiarismResult {
    studentId: string;
    similarity: number; // 0-1
}

export const PlagiarismService = {
    /**
     * Calculate Cosine Similarity between two text strings
     */
    calculateCosineSimilarity: (text1: string, text2: string): number => {
        const tokenize = (text: string) => text.toLowerCase().match(/\w+/g) || [];
        const tokens1 = tokenize(text1);
        const tokens2 = tokenize(text2);

        const uniqueTokens = Array.from(new Set([...tokens1, ...tokens2]));

        const vec1 = uniqueTokens.map(token => tokens1.filter(t => t === token).length);
        const vec2 = uniqueTokens.map(token => tokens2.filter(t => t === token).length);

        const dotProduct = vec1.reduce((sum, val, i) => sum + (val * vec2[i]), 0);
        const mag1 = Math.sqrt(vec1.reduce((sum, val) => sum + (val * val), 0));
        const mag2 = Math.sqrt(vec2.reduce((sum, val) => sum + (val * val), 0));

        if (mag1 === 0 || mag2 === 0) return 0.0;

        return dotProduct / (mag1 * mag2);
    },

    /**
     * Check a specific submission against all other submissions for the same assignment
     */
    checkPlagiarism: async (assignmentId: string, submissionId: string, content: string): Promise<PlagiarismResult[]> => {
        // Fetch all other submissions for this assignment
        const result = await query(
            `SELECT user_id, content FROM assignment_submissions 
             WHERE assignment_id = $1 AND id != $2`,
            [assignmentId, submissionId]
        );

        const otherSubmissions = result.rows;
        const reports: PlagiarismResult[] = [];

        for (const sub of otherSubmissions) {
            // Assuming content is stored as JSON or text; extracting text.
            // Simplified: Assuming 'content' column holds the text directly or a JSON with 'text' field.
            let subText = "";
            if (typeof sub.content === 'string') {
                subText = sub.content;
            } else if (sub.content?.text) {
                subText = sub.content.text;
            }

            if (subText) {
                const similarity = PlagiarismService.calculateCosineSimilarity(content, subText);
                if (similarity > 0.2) { // Threshold for reporting
                    reports.push({
                        studentId: sub.user_id,
                        similarity
                    });

                    // Store high similarity in DB
                    if (similarity > 0.5) {
                        await query(
                            `INSERT INTO plagiarism_reports 
                              (assignment_id, student_id, similarity_score, matched_source_id)
                              VALUES ($1, (SELECT user_id FROM assignment_submissions WHERE id=$2), $3, $4)`,
                            [assignmentId, submissionId, similarity, sub.user_id]
                        );
                    }
                }
            }
        }

        return reports.sort((a, b) => b.similarity - a.similarity);
    },

    /**
     * Generic check against a list of texts
     */
    checkGeneric: (text: string, comparisonTexts: string[]): { text: string, similarity: number }[] => {
        return comparisonTexts.map(comp => ({
            text: comp,
            similarity: PlagiarismService.calculateCosineSimilarity(text, comp)
        })).sort((a, b) => b.similarity - a.similarity);
    },

    /**
     * Compare specific submissions directly
     */
    /**
     * Compare specific submissions directly
     */
    compareSubmissions: async (submissionIds: string[]): Promise<{ id1: string, id2: string, similarity: number }[]> => {
        if (submissionIds.length < 2) return [];

        // Fetch contents
        const { rows } = await query(
            `SELECT id, content FROM assignment_submissions WHERE id = ANY($1)`,
            [submissionIds]
        );

        if (rows.length < 2) return [];

        const comparisons = [];
        for (let i = 0; i < rows.length; i++) {
            for (let j = i + 1; j < rows.length; j++) {
                const sub1 = rows[i];
                const sub2 = rows[j];

                // Extract text from content (assuming JSON or String)
                const text1 = typeof sub1.content === 'string' ? sub1.content : (sub1.content?.text || '');
                const text2 = typeof sub2.content === 'string' ? sub2.content : (sub2.content?.text || '');

                if (text1 && text2) {
                    const similarity = PlagiarismService.calculateCosineSimilarity(text1, text2);
                    comparisons.push({
                        id1: sub1.id,
                        id2: sub2.id,
                        similarity: parseFloat(similarity.toFixed(4))
                    });
                }
            }
        }

        return comparisons.sort((a, b) => b.similarity - a.similarity);
    }
};
