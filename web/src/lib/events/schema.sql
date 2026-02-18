-- platform_events — Event Bus Table
-- Run in Supabase SQL Editor before deploying OB-62/63

CREATE TABLE IF NOT EXISTS platform_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  actor_id UUID,
  entity_id UUID,
  payload JSONB DEFAULT '{}',
  processed_by JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index: tenant lookup
CREATE INDEX IF NOT EXISTS idx_platform_events_tenant
  ON platform_events(tenant_id);

-- Index: event type filtering
CREATE INDEX IF NOT EXISTS idx_platform_events_type
  ON platform_events(event_type);

-- Index: unprocessed events for agent loop
CREATE INDEX IF NOT EXISTS idx_platform_events_unprocessed
  ON platform_events(tenant_id, created_at DESC)
  WHERE jsonb_array_length(processed_by) = 0;

-- RLS: Service role only (events are system-managed)
ALTER TABLE platform_events ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (bypasses RLS automatically)
-- No RLS policies needed for anon/authenticated since events are written by server only
