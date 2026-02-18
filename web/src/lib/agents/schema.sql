-- agent_inbox — Stores agent-generated actions for persona dashboards
-- Run in Supabase SQL Editor before deploying OB-62/63

CREATE TABLE IF NOT EXISTS agent_inbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL,
  type TEXT NOT NULL,                    -- recommendation | alert | insight | action_required
  title TEXT NOT NULL,
  description TEXT,
  severity TEXT NOT NULL DEFAULT 'info', -- critical | warning | info
  action_url TEXT,
  action_label TEXT,
  metadata JSONB DEFAULT '{}',
  persona TEXT NOT NULL DEFAULT 'admin', -- admin | manager | rep | all
  expires_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  acted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, agent_id, title)
);

-- Index: tenant + persona lookup (non-dismissed only)
CREATE INDEX IF NOT EXISTS idx_agent_inbox_tenant_persona
  ON agent_inbox(tenant_id, persona)
  WHERE dismissed_at IS NULL;

-- Index: agent lookup
CREATE INDEX IF NOT EXISTS idx_agent_inbox_agent
  ON agent_inbox(agent_id);

-- RLS: Service role only
ALTER TABLE agent_inbox ENABLE ROW LEVEL SECURITY;
