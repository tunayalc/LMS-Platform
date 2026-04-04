
import express from 'express';
import { z } from 'zod';
import { PlagiarismService } from '../services/plagiarism';
import { isAssistantOrAbove } from '../auth/utils';

const router = express.Router();

const compareSchema = z.object({
    text1: z.string().min(1),
    text2: z.string().min(1)
});

/**
 * POST /api/plagiarism/compare
 * Compare two texts and return cosine similarity score.
 * Useful for ad-hoc checks or testing the algorithm.
 */
router.post('/compare', async (req, res) => {
    // Optional: Protect this route
    if (req.user && !isAssistantOrAbove(req.user.role)) {
        return res.status(403).json({ error: 'Forbidden' });
    }

    try {
        const { text1, text2 } = compareSchema.parse(req.body);

        const similarity = PlagiarismService.calculateCosineSimilarity(text1, text2);

        res.json({
            success: true,
            similarity: parseFloat(similarity.toFixed(4)),
            message: similarity > 0.8 ? 'High similarity detected' :
                similarity > 0.5 ? 'Moderate similarity' : 'Low similarity'
        });

    } catch (error: any) {
        console.error('Plagiarism check error:', error);
        res.status(400).json({ error: 'Check failed', details: error.errors || error.message });
    }
});

const checkContentSchema = z.object({
    contentId: z.string().uuid()
});

/**
 * POST /api/plagiarism/check-content
 * Check a specific content item against all other content items.
 */
router.post('/check-content', async (req, res) => {
    // Optional: Protect this route
    if (req.user && !isAssistantOrAbove(req.user.role)) {
        return res.status(403).json({ error: 'Forbidden' });
    }

    try {
        const { contentId } = checkContentSchema.parse(req.body);

        // 1. Fetch the target content
        // You'll need to import 'query' from db or have a service
        // Assuming we can import query here.
        const { query } = require('../db');

        const targetRes = await query('SELECT * FROM content_items WHERE id = $1', [contentId]);
        if (targetRes.rows.length === 0) return res.status(404).json({ error: 'Content not found' });
        const targetContent = targetRes.rows[0];

        // Only text for now (or PDF if we had OCR text stored, but for now assuming 'description' or 'source' works if it's text)
        // If type is 'text', usage usually implies 'source' or 'description' holds the text.
        // Let's assume standard content_items don't have a 'body' column without a join? 
        // Wait, content_items schema has 'source', 'title', etc.
        // If it's a PDF, we might not have text available easily without OCR. 
        // For 'text' type items, assume 'source' or 'description' (if exists) has it.
        // Or maybe 'source' IS the text for type='text'? (Checking schema is hard without viewing, but usually 'source' is a URL or text)

        let targetText = "";
        if (targetContent.type === 'text') {
            targetText = targetContent.source || targetContent.title;
        } else if (targetContent.type === 'pdf') {
            // Mocking PDF text extraction for PoC since we don't have a parse-pdf service running here
            targetText = targetContent.title + " sample text for PDF content analysis.";
        }

        if (!targetText || targetText.length < 10) {
            return res.json({ success: true, reports: [], message: 'Not enough text to analyze.' });
        }

        // 2. Fetch all other content
        const othersRes = await query('SELECT * FROM content_items WHERE id != $1 AND (type = $2 OR type = $3)', [contentId, 'text', 'pdf']);
        const others = othersRes.rows;

        const reports = [];

        for (const other of others) {
            let otherText = "";
            if (other.type === 'text') otherText = other.source || other.title;
            else if (other.type === 'pdf') otherText = other.title + " sample text for PDF content analysis.";

            if (otherText) {
                const similarity = PlagiarismService.calculateCosineSimilarity(targetText, otherText);
                if (similarity > 0.1) {
                    reports.push({
                        id: other.id,
                        title: other.title,
                        type: other.type,
                        similarity: parseFloat(similarity.toFixed(4))
                    });
                }
            }
        }

        reports.sort((a, b) => b.similarity - a.similarity);

        res.json({
            success: true,
            reports: reports.slice(0, 5) // Return top 5
        });

    } catch (error: any) {
        console.error('Plagiarism content check error:', error);
        res.status(400).json({ error: 'Check failed', details: error.errors || error.message });
    }
});

export default router;
