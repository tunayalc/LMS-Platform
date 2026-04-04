-- Prerequisites Schema

-- Course Prerequisites
CREATE TABLE IF NOT EXISTS course_prerequisites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    prerequisite_course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    min_grade DECIMAL,  -- Minimum grade percentage (0-100)
    required BOOLEAN DEFAULT true,  -- Hard requirement vs recommended
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(course_id, prerequisite_course_id),
    CHECK (course_id != prerequisite_course_id)  -- Prevent self-reference
);

-- Course Completions (tracking)
CREATE TABLE IF NOT EXISTS course_completions (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    completed_at TIMESTAMPTZ DEFAULT NOW(),
    grade DECIMAL,
    status VARCHAR(20) DEFAULT 'completed',  -- in_progress, completed, failed
    PRIMARY KEY (user_id, course_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_prerequisites_course ON course_prerequisites(course_id);
CREATE INDEX IF NOT EXISTS idx_prerequisites_prereq ON course_prerequisites(prerequisite_course_id);
CREATE INDEX IF NOT EXISTS idx_completions_user ON course_completions(user_id);
CREATE INDEX IF NOT EXISTS idx_completions_course ON course_completions(course_id);

-- Comments
COMMENT ON TABLE course_prerequisites IS 'Course dependency definitions';
COMMENT ON TABLE course_completions IS 'User course completion tracking';
COMMENT ON COLUMN course_prerequisites.min_grade IS 'Minimum grade percentage required (0-100)';
COMMENT ON COLUMN course_prerequisites.required IS 'True = hard requirement, False = recommended';
