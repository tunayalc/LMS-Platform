-- Add instructor_id to courses
ALTER TABLE courses ADD COLUMN IF NOT EXISTS instructor_id uuid;
CREATE INDEX IF NOT EXISTS courses_instructor_idx ON courses (instructor_id);

-- Add course_id to content_items
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS course_id uuid;
CREATE INDEX IF NOT EXISTS content_items_course_idx ON content_items (course_id);

-- Create course_enrollments table
CREATE TABLE IF NOT EXISTS course_enrollments (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  course_id uuid NOT NULL,
  enrolled_at timestamptz NOT NULL,
  CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  UNIQUE(user_id, course_id)
);

CREATE INDEX IF NOT EXISTS course_enrollments_user_idx ON course_enrollments (user_id);
CREATE INDEX IF NOT EXISTS course_enrollments_course_idx ON course_enrollments (course_id);
