-- Make SEB mandatory for all exams
-- SEB is no longer optional - it's required by default

-- Change default value to true
ALTER TABLE exams 
ALTER COLUMN seb_required SET DEFAULT true;

-- Update all existing exams to require SEB
UPDATE exams SET seb_required = true WHERE seb_required = false OR seb_required IS NULL;

-- Generate browser keys for exams that don't have one
UPDATE exams 
SET seb_browser_key = encode(sha256(random()::text::bytea || id::text::bytea), 'hex')
WHERE seb_browser_key IS NULL;

COMMENT ON COLUMN exams.seb_required IS 'SEB is mandatory for all exams (always true)';
