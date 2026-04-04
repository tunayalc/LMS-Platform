-- Add metadata columns to exams
ALTER TABLE exams ADD COLUMN IF NOT EXISTS duration_minutes integer;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS pass_threshold integer;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS start_date timestamptz;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS end_date timestamptz;

-- Add points to questions
ALTER TABLE questions ADD COLUMN IF NOT EXISTS points integer DEFAULT 10;

-- Create exam_submissions table
CREATE TABLE IF NOT EXISTS exam_submissions (
  id uuid PRIMARY KEY,
  exam_id uuid NOT NULL,
  user_id uuid NOT NULL,
  score integer,
  answers jsonb, -- Stores user answers key-value pairs or array
  started_at timestamptz NOT NULL,
  submitted_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT fk_exam FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE,
  CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS exam_submissions_exam_idx ON exam_submissions (exam_id);
CREATE INDEX IF NOT EXISTS exam_submissions_user_idx ON exam_submissions (user_id);
