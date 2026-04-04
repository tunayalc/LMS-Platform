-- Add progress tracking columns to content_completions
ALTER TABLE content_completions 
ADD COLUMN IF NOT EXISTS last_position INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_duration INTEGER DEFAULT 0;
