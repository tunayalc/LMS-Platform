-- Notes Schema

CREATE TABLE IF NOT EXISTS user_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content_id VARCHAR(100) NOT NULL,  -- Can be video, pdf, etc.
    content_type VARCHAR(50) NOT NULL, -- video, pdf, text, lesson
    text TEXT NOT NULL,
    timestamp INTEGER,      -- For video notes (seconds)
    page_number INTEGER,    -- For PDF notes
    color VARCHAR(20) DEFAULT '#fef08a',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_notes_user ON user_notes(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_content ON user_notes(content_id);
CREATE INDEX IF NOT EXISTS idx_notes_user_content ON user_notes(user_id, content_id);
CREATE INDEX IF NOT EXISTS idx_notes_text ON user_notes USING GIN(to_tsvector('turkish', text));

COMMENT ON TABLE user_notes IS 'User notes on course content (videos, PDFs, etc.)';
COMMENT ON COLUMN user_notes.timestamp IS 'Video timestamp in seconds';
COMMENT ON COLUMN user_notes.page_number IS 'PDF page number';
