-- Access Control & Offline Sync Support

-- Access Control for Contents
ALTER TABLE content_items 
ADD COLUMN IF NOT EXISTS valid_from TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS valid_until TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS allowed_groups TEXT[], -- Array of Group IDs or Names
ADD COLUMN IF NOT EXISTS is_offline_downloadable BOOLEAN DEFAULT true;

-- Access Control for Exams
ALTER TABLE exams
ADD COLUMN IF NOT EXISTS valid_from TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS valid_until TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS allowed_groups TEXT[];

-- Create Groups Table (Simplistic approach for now)
CREATE TABLE IF NOT EXISTS groups (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User-Group Membership
CREATE TABLE IF NOT EXISTS user_groups (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, group_id)
);

-- Offline Sync Logs (Client Actions Inbox)
CREATE TABLE IF NOT EXISTS offline_sync_logs (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action_type TEXT NOT NULL, -- e.g., 'COMPLETE_CONTENT', 'SUBMIT_EXAM'
    payload JSONB NOT NULL,
    processed_at TIMESTAMPTZ, -- NULL if pending
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW() -- Client timestamp usually but server time for receipt is safer for ordering
);

CREATE INDEX IF NOT EXISTS idx_content_validity ON content_items(valid_from, valid_until);
CREATE INDEX IF NOT EXISTS idx_offline_sync_user ON offline_sync_logs(user_id);
