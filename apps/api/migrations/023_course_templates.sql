-- Course Templates System
-- Allows saving and reusing course structures

CREATE TABLE IF NOT EXISTS course_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100), -- e.g., "Programming", "Math", "Language"
    thumbnail_url TEXT,
    created_by UUID REFERENCES users(id),
    is_public BOOLEAN DEFAULT false,
    usage_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Template content structure (JSON for flexibility)
CREATE TABLE IF NOT EXISTS template_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID REFERENCES course_templates(id) ON DELETE CASCADE,
    item_type VARCHAR(50) NOT NULL, -- 'content', 'exam', 'module'
    title VARCHAR(255) NOT NULL,
    description TEXT,
    config JSONB, -- Stores type-specific configuration
    order_index INTEGER DEFAULT 0,
    parent_id UUID REFERENCES template_items(id), -- For nested modules
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_templates_category ON course_templates(category);
CREATE INDEX idx_templates_public ON course_templates(is_public);
CREATE INDEX idx_template_items_template ON template_items(template_id);
