-- user_journey — Tracks user milestone completions for embedded training
-- Run in Supabase SQL Editor before deploying OB-62/63

CREATE TABLE IF NOT EXISTS user_journey (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  milestone TEXT NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}',
  UNIQUE(user_id, tenant_id, milestone)
);

-- Index: user + tenant lookup
CREATE INDEX IF NOT EXISTS idx_user_journey_user_tenant
  ON user_journey(user_id, tenant_id);

-- RLS: Service role only
ALTER TABLE user_journey ENABLE ROW LEVEL SECURITY;
