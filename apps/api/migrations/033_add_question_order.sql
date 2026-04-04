-- Add order column to questions for ordering
ALTER TABLE questions ADD COLUMN IF NOT EXISTS "order" INTEGER DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_questions_order ON questions("order");
