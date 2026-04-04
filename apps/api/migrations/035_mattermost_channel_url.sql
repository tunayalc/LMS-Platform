-- Add Mattermost Channel URL field to courses
ALTER TABLE courses ADD COLUMN IF NOT EXISTS mattermost_channel_url TEXT;
