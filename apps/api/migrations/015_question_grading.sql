-- Question Grading Schema Updates

-- Add grading columns to questions if not exists
ALTER TABLE questions ADD COLUMN IF NOT EXISTS grading_config JSONB;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS test_cases JSONB;

-- Add grading columns to exam_submissions if not exists
ALTER TABLE exam_submissions ADD COLUMN IF NOT EXISTS grading_details JSONB;
ALTER TABLE exam_submissions ADD COLUMN IF NOT EXISTS percentage INTEGER;
ALTER TABLE exam_submissions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- Create index for faster grading queries
CREATE INDEX IF NOT EXISTS idx_questions_type ON questions(type);
CREATE INDEX IF NOT EXISTS idx_submissions_exam_user ON exam_submissions(exam_id, user_id);

-- Sample grading configs for different question types
COMMENT ON COLUMN questions.grading_config IS 'Grading configuration: { similarityThreshold, tolerance, partialCredit, etc }';
COMMENT ON COLUMN questions.test_cases IS 'For code questions: [{ input, expected, points, hidden }]';

-- Example matching question structure:
-- options: { "left": ["A", "B"], "right": ["1", "2"] }
-- answer: { "A": "1", "B": "2" }

-- Example ordering question structure:
-- options: ["C", "A", "B"] (shuffled)
-- answer: ["A", "B", "C"] (correct order)

-- Example hotspot question structure:
-- meta: { "imageUrl": "...", "regions": [{ "id": "x", "type": "circle", "x": 100, "y": 100, "radius": 30 }] }
-- answer: "x" (region id)

-- Example code question structure:
-- meta: { "language": "python", "starterCode": "def func():", "testCases": [...] }
-- answer: null (graded by test cases)
