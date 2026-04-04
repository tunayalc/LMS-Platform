-- User Management Extended Schema
-- Simplified for pg-mem compatibility (No FKs, No Defaults)

-- Add columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS ldap_dn VARCHAR(500);
ALTER TABLE users ADD COLUMN IF NOT EXISTS saml_name_id VARCHAR(500);
ALTER TABLE users ADD COLUMN IF NOT EXISTS oauth_provider VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS oauth_id VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_secret VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_backup_codes JSONB;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS login_attempts INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- SAML Identity Providers
CREATE TABLE IF NOT EXISTS saml_idps (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    entity_id VARCHAR(500) NOT NULL UNIQUE,
    sso_url TEXT NOT NULL,
    slo_url TEXT,
    certificate TEXT NOT NULL,
    signature_algorithm VARCHAR(20) DEFAULT 'sha256',
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);

-- OAuth Providers Configuration
CREATE TABLE IF NOT EXISTS oauth_providers (
    id UUID PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    client_id VARCHAR(255) NOT NULL,
    client_secret VARCHAR(500),
    authorization_url TEXT,
    token_url TEXT,
    userinfo_url TEXT,
    scopes TEXT,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ
);

-- OAuth Tokens (for token refresh)
CREATE TABLE IF NOT EXISTS oauth_tokens (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    provider VARCHAR(100) NOT NULL,
    access_token TEXT,
    refresh_token TEXT,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    UNIQUE (user_id, provider)
);

-- User Sessions (for session management)
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY,
    user_id UUID,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    ip_address VARCHAR(45),
    user_agent TEXT,
    device_info JSONB,
    last_activity TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ
);

-- Login History
CREATE TABLE IF NOT EXISTS login_history (
    id UUID PRIMARY KEY,
    user_id UUID,
    email VARCHAR(255),
    auth_method VARCHAR(50) NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    location JSONB,
    success BOOLEAN NOT NULL,
    failure_reason VARCHAR(255),
    two_factor_used BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_ldap_dn ON users(ldap_dn);
CREATE INDEX IF NOT EXISTS idx_users_saml_name_id ON users(saml_name_id);
CREATE INDEX IF NOT EXISTS idx_users_oauth ON users(oauth_provider, oauth_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_login_history_user ON login_history(user_id);
CREATE INDEX IF NOT EXISTS idx_login_history_email ON login_history(email);
CREATE INDEX IF NOT EXISTS idx_login_history_created ON login_history(created_at);

-- Insert default OAuth providers
-- Removed INSERT for safety in pg-mem, relying on env vars. Or keep simple insert:
INSERT INTO oauth_providers (id, name, client_id, authorization_url, token_url, userinfo_url, scopes)
VALUES
    ('11111111-1111-1111-1111-111111111111', 'google', 'your-google-client-id', 'https://accounts.google.com/o/oauth2/v2/auth', 'https://oauth2.googleapis.com/token', 'https://www.googleapis.com/oauth2/v2/userinfo', 'openid email profile'),
    ('22222222-2222-2222-2222-222222222222', 'microsoft', 'your-microsoft-client-id', 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize', 'https://login.microsoftonline.com/common/oauth2/v2.0/token', 'https://graph.microsoft.com/v1.0/me', 'openid email profile')
ON CONFLICT (name) DO NOTHING;
