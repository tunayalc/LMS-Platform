CREATE TABLE IF NOT EXISTS scorm_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  version TEXT DEFAULT '1.2',
  upload_path TEXT NOT NULL,
  extract_path TEXT NOT NULL,
  entry_point TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Optional: Track attempts/CMI data later
-- CREATE TABLE scorm_interactions ...
