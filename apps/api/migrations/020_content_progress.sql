-- Content Progress Table
-- Tracks user progress through content items (video position, PDF page, etc.)

CREATE TABLE IF NOT EXISTS content_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content_id UUID NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
    progress_percent INTEGER DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
    last_position VARCHAR(255), -- For video: seconds, for PDF: page number
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, content_id)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_content_progress_user ON content_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_content_progress_content ON content_progress(content_id);
