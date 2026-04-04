-- Gradebook Schema

-- Grade Categories (Quizzes, Exams, Homework, etc.)
CREATE TABLE IF NOT EXISTS grade_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    weight DECIMAL DEFAULT 100,  -- Percentage weight (0-100)
    drop_lowest INTEGER DEFAULT 0,     -- Drop N lowest grades
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(course_id, name)
);

-- Grade Items (Individual assignments, quizzes, exams)
CREATE TABLE IF NOT EXISTS grade_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID NOT NULL REFERENCES grade_categories(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    max_points DECIMAL NOT NULL DEFAULT 100,
    due_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Student Grades
CREATE TABLE IF NOT EXISTS student_grades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    grade_item_id UUID NOT NULL REFERENCES grade_items(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    points DECIMAL NOT NULL DEFAULT 0,
    feedback TEXT,
    graded_by UUID REFERENCES users(id),
    graded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(grade_item_id, student_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_grade_categories_course ON grade_categories(course_id);
CREATE INDEX IF NOT EXISTS idx_grade_items_course ON grade_items(course_id);
CREATE INDEX IF NOT EXISTS idx_grade_items_category ON grade_items(category_id);
CREATE INDEX IF NOT EXISTS idx_student_grades_item ON student_grades(grade_item_id);
CREATE INDEX IF NOT EXISTS idx_student_grades_student ON student_grades(student_id);
CREATE INDEX IF NOT EXISTS idx_student_grades_lookup ON student_grades(grade_item_id, student_id);

-- Comments
COMMENT ON TABLE grade_categories IS 'Grade categories like Quizzes, Exams, Homework with weights';
COMMENT ON TABLE grade_items IS 'Individual graded items within categories';
COMMENT ON TABLE student_grades IS 'Student grades for each item with feedback';
COMMENT ON COLUMN grade_categories.weight IS 'Category weight in final grade (0-100)';
COMMENT ON COLUMN grade_categories.drop_lowest IS 'Number of lowest grades to drop';
