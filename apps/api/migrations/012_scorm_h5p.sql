-- SCORM and H5P Database Tables
-- Simplified for pg-mem compatibility (No FKs, No Defaults)

-- SCORM Sessions
CREATE TABLE IF NOT EXISTS scorm_sessions (
    id VARCHAR(100) PRIMARY KEY,
    package_id UUID NOT NULL,
    user_id UUID,
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    completion_status VARCHAR(50),
    success_status VARCHAR(50),
    score DECIMAL,
    data JSONB,
    created_at TIMESTAMPTZ
);

-- SCORM Packages (Defined in 008_scorm_tables.sql)
-- CREATE TABLE IF NOT EXISTS scorm_packages (
--     id UUID PRIMARY KEY,
--     title VARCHAR(255) NOT NULL,
--     version VARCHAR(20),
--     course_id UUID,
--     file_path TEXT,
--     entry_point VARCHAR(255),
--     uploaded_by UUID,
--     created_at TIMESTAMPTZ,
--     updated_at TIMESTAMPTZ
-- );

-- H5P Content
CREATE TABLE IF NOT EXISTS h5p_content (
    id VARCHAR(100) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    filename VARCHAR(255),
    library_name VARCHAR(100),
    library_version VARCHAR(20),
    course_id UUID,
    uploaded_by UUID,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);

-- H5P User Data (progress/state)
CREATE TABLE IF NOT EXISTS h5p_user_data (
    content_id VARCHAR(100),
    user_id UUID,
    data JSONB,
    updated_at TIMESTAMPTZ,
    PRIMARY KEY (content_id, user_id)
);

-- H5P Results (completion/scores)
CREATE TABLE IF NOT EXISTS h5p_results (
    id UUID PRIMARY KEY,
    content_id VARCHAR(100),
    user_id UUID,
    score DECIMAL,
    max_score DECIMAL,
    duration INTEGER,
    completed_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_scorm_sessions_user ON scorm_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_scorm_sessions_package ON scorm_sessions(package_id);
CREATE INDEX IF NOT EXISTS idx_scorm_packages_course ON scorm_packages(course_id);
CREATE INDEX IF NOT EXISTS idx_h5p_content_course ON h5p_content(course_id);
CREATE INDEX IF NOT EXISTS idx_h5p_results_user ON h5p_results(user_id);
