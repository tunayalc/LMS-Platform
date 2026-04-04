-- Rubric System for Grading
-- Allows instructors to create reusable grading rubrics

CREATE TABLE IF NOT EXISTS rubrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
    instructor_id UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rubric_criteria (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rubric_id UUID REFERENCES rubrics(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    max_points DECIMAL NOT NULL DEFAULT 10,
    order_index INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rubric_levels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    criteria_id UUID REFERENCES rubric_criteria(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL, -- e.g., "Excellent", "Good", "Needs Improvement"
    description TEXT,
    points DECIMAL NOT NULL,
    order_index INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Link rubrics to exams/questions
CREATE TABLE IF NOT EXISTS exam_rubrics (
    exam_id UUID REFERENCES exams(id) ON DELETE CASCADE,
    rubric_id UUID REFERENCES rubrics(id) ON DELETE CASCADE,
    PRIMARY KEY (exam_id, rubric_id)
);

-- Store rubric-based grades
CREATE TABLE IF NOT EXISTS rubric_grades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID NOT NULL, -- References exam_submissions
    rubric_id UUID REFERENCES rubrics(id),
    criteria_id UUID REFERENCES rubric_criteria(id),
    level_id UUID REFERENCES rubric_levels(id),
    points_awarded DECIMAL,
    feedback TEXT,
    graded_by UUID REFERENCES users(id),
    graded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_rubrics_course ON rubrics(course_id);
CREATE INDEX idx_rubric_criteria_rubric ON rubric_criteria(rubric_id);
CREATE INDEX idx_rubric_levels_criteria ON rubric_levels(criteria_id);
CREATE INDEX idx_rubric_grades_submission ON rubric_grades(submission_id);
