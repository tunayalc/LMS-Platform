-- Audit Log and KVKK Tables

-- Audit Logs Table
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'INFO',
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    user_name VARCHAR(255),
    user_role VARCHAR(50),
    ip_address VARCHAR(45),
    user_agent TEXT,
    resource_type VARCHAR(100),
    resource_id VARCHAR(100),
    action TEXT NOT NULL,
    details JSONB,
    previous_value JSONB,
    new_value JSONB,
    success BOOLEAN DEFAULT true,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for audit logs
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_event_type ON audit_logs(event_type);
CREATE INDEX idx_audit_logs_severity ON audit_logs(severity);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);

-- User Consents (KVKK)
CREATE TABLE IF NOT EXISTS user_consents (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    consent_type VARCHAR(50) NOT NULL,
    granted BOOLEAN NOT NULL DEFAULT false,
    version VARCHAR(20) NOT NULL,
    ip_address VARCHAR(45),
    granted_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, consent_type)
);

-- Data Subject Requests (KVKK)
CREATE TABLE IF NOT EXISTS data_subject_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    request_type VARCHAR(50) NOT NULL, -- ACCESS, RECTIFICATION, ERASURE, PORTABILITY, OBJECTION
    status VARCHAR(20) DEFAULT 'PENDING',
    requested_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    notes TEXT,
    response_data JSONB
);

CREATE INDEX idx_data_requests_user ON data_subject_requests(user_id);
CREATE INDEX idx_data_requests_status ON data_subject_requests(status);

-- LTI Platforms
CREATE TABLE IF NOT EXISTS lti_platforms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issuer VARCHAR(255) NOT NULL,
    client_id VARCHAR(255) NOT NULL,
    deployment_id VARCHAR(255),
    auth_endpoint TEXT,
    token_endpoint TEXT,
    jwks_endpoint TEXT,
    public_key TEXT,
    private_key TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE audit_logs IS 'Security audit trail for all critical actions';
COMMENT ON TABLE user_consents IS 'KVKK consent records for user data processing';
COMMENT ON TABLE data_subject_requests IS 'KVKK data subject access/erasure requests';
COMMENT ON TABLE lti_platforms IS 'LTI 1.3 platform registrations';
