-- 006_exam_advanced.sql
-- Advanced exam features: attempts, draft mode, results visibility

-- Add new columns to exams table
ALTER TABLE exams ADD COLUMN IF NOT EXISTS max_attempts INTEGER DEFAULT 1;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS is_draft BOOLEAN DEFAULT true;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS results_visible_at TIMESTAMP;

-- Add attempts tracking to exam_submissions
ALTER TABLE exam_submissions ADD COLUMN IF NOT EXISTS attempt_number INTEGER DEFAULT 1;

-- Create index for efficient querying
CREATE INDEX IF NOT EXISTS idx_exams_is_draft ON exams(is_draft);
CREATE INDEX IF NOT EXISTS idx_exams_dates ON exams(start_date, end_date);
