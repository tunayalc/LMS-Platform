-- Backward compatibility for audit_logs actor_id

ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS actor_id UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_id);
