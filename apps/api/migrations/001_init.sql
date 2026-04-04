CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY,
  username text NOT NULL,
  role text NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_idx ON users (lower(username));

CREATE TABLE IF NOT EXISTS courses (
  id uuid PRIMARY KEY,
  title text NOT NULL,
  description text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS courses_created_at_idx ON courses (created_at DESC);

CREATE TABLE IF NOT EXISTS content_items (
  id uuid PRIMARY KEY,
  type text NOT NULL,
  title text NOT NULL,
  source text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS content_items_type_idx ON content_items (type);
CREATE INDEX IF NOT EXISTS content_items_created_at_idx ON content_items (created_at DESC);

CREATE TABLE IF NOT EXISTS exams (
  id uuid PRIMARY KEY,
  title text NOT NULL,
  course_id uuid,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS exams_course_idx ON exams (course_id);
CREATE INDEX IF NOT EXISTS exams_created_at_idx ON exams (created_at DESC);

CREATE TABLE IF NOT EXISTS questions (
  id uuid PRIMARY KEY,
  exam_id uuid,
  prompt text NOT NULL,
  type text NOT NULL,
  options jsonb,
  answer jsonb,
  meta jsonb,
  created_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS questions_exam_idx ON questions (exam_id);
CREATE INDEX IF NOT EXISTS questions_type_idx ON questions (type);


