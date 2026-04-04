-- Plagiarism detection tables

-- Assignments (Missing from previous migrations)
CREATE TABLE IF NOT EXISTS assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    due_date TIMESTAMPTZ,
    allowed_file_types TEXT[],
    max_file_size_mb INTEGER DEFAULT 10,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for assignments
CREATE INDEX IF NOT EXISTS idx_assignments_course ON assignments(course_id);

CREATE TABLE IF NOT EXISTS plagiarism_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    similarity_score FLOAT NOT NULL, -- 0.0 to 1.0 (100%)
    matched_source_id UUID REFERENCES users(id), -- User who had the most similar content
    report_details JSONB, -- Detailed comparison data
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_plagiarism_assignment ON plagiarism_reports(assignment_id);
CREATE INDEX IF NOT EXISTS idx_plagiarism_student ON plagiarism_reports(student_id);
