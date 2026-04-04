-- Manual grades table for instructor grading of non-auto-gradable questions
CREATE TABLE IF NOT EXISTS manual_grades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID NOT NULL REFERENCES exam_submissions(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    points INTEGER NOT NULL DEFAULT 0,
    feedback TEXT,
    graded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    graded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(submission_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_manual_grades_submission ON manual_grades(submission_id);
CREATE INDEX IF NOT EXISTS idx_manual_grades_question ON manual_grades(question_id);
