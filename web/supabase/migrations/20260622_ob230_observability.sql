-- OB-230 — User Observability Surface migration.
-- SR-44: authored by CC, APPLIED BY THE ARCHITECT in the Supabase SQL Editor. Not run by CC.

-- ── HALT-5: index platform_events by actor ──────────────────────────────────
-- The User Operations Console reads events per user (actor_id OR entity_id). platform_events has
-- indexes on tenant_id and event_type only — actor_id is unindexed, so per-user timeline/summary
-- queries do a sequential scan. This composite serves both the timeline (ORDER BY created_at DESC)
-- and the 24h summary. (Plain CREATE INDEX — the table is small today; for a large table prefer
-- CREATE INDEX CONCURRENTLY run OUTSIDE a transaction.)
CREATE INDEX IF NOT EXISTS idx_platform_events_actor_created
  ON platform_events (actor_id, created_at DESC);

-- entity_id is the target of admin.user.* actions; index it so a user's "actions done TO them"
-- half of the timeline OR-query is also covered.
CREATE INDEX IF NOT EXISTS idx_platform_events_entity_created
  ON platform_events (entity_id, created_at DESC);

-- ── HALT-3: seed the navigation-tracking opt-in flag (default OFF) ───────────
-- PATCH /api/platform/settings only UPDATEs an existing key (no upsert), so the row must exist
-- before the Observatory Settings toggle can flip it. Navigation breadcrumbs (3C) stay disabled
-- until this is true — keeps event volume opt-in.
INSERT INTO platform_settings (key, value, description)
VALUES (
  'enable_navigation_tracking',
  'false'::jsonb,
  'OB-230: log navigation.route_change breadcrumbs to platform_events (diagnostic, not analytics). Default OFF — enable only when diagnosing; increases event volume.'
)
ON CONFLICT (key) DO NOTHING;
