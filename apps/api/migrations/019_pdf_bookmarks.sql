-- PDF Bookmarks, Annotations, and Progress

-- Bookmarks
CREATE TABLE IF NOT EXISTS pdf_bookmarks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content_id VARCHAR(100) NOT NULL,
    page_number INTEGER NOT NULL,
    title VARCHAR(255) NOT NULL,
    color VARCHAR(20) DEFAULT '#3b82f6',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Annotations
CREATE TABLE IF NOT EXISTS pdf_annotations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content_id VARCHAR(100) NOT NULL,
    page_number INTEGER NOT NULL,
    type VARCHAR(50) NOT NULL,  -- highlight, underline, note, drawing
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Reading Progress
CREATE TABLE IF NOT EXISTS pdf_progress (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content_id VARCHAR(100) NOT NULL,
    current_page INTEGER NOT NULL DEFAULT 1,
    total_pages INTEGER NOT NULL DEFAULT 1,
    percentage INTEGER NOT NULL DEFAULT 0,
    last_viewed_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, content_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pdf_bookmarks_user_content ON pdf_bookmarks(user_id, content_id);
CREATE INDEX IF NOT EXISTS idx_pdf_annotations_user_content ON pdf_annotations(user_id, content_id);
CREATE INDEX IF NOT EXISTS idx_pdf_annotations_page ON pdf_annotations(content_id, page_number);
CREATE INDEX IF NOT EXISTS idx_pdf_progress_user ON pdf_progress(user_id);

-- Comments
COMMENT ON TABLE pdf_bookmarks IS 'User bookmarks in PDF documents';
COMMENT ON TABLE pdf_annotations IS 'User annotations (highlights, notes) in PDF documents';
COMMENT ON TABLE pdf_progress IS 'PDF reading progress tracking';
