-- Safe Exam Browser Support
-- Add SEB columns to exams table

ALTER TABLE exams 
ADD COLUMN IF NOT EXISTS seb_required BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS seb_browser_key VARCHAR(128),
ADD COLUMN IF NOT EXISTS seb_config JSONB;

-- Index for SEB-enabled exams
CREATE INDEX IF NOT EXISTS idx_exams_seb_required ON exams(seb_required) WHERE seb_required = true;

COMMENT ON COLUMN exams.seb_required IS 'Whether this exam requires Safe Exam Browser';
COMMENT ON COLUMN exams.seb_browser_key IS 'Browser Exam Key for SEB validation';
COMMENT ON COLUMN exams.seb_config IS 'Custom SEB configuration overrides';
