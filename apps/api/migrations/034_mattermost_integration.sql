-- Add Mattermost integration fields to courses
ALTER TABLE courses ADD COLUMN IF NOT EXISTS mattermost_webhook_url TEXT;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS mattermost_channel_id TEXT;
