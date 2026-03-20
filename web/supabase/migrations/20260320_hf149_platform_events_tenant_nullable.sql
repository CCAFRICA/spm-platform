-- HF-149: Make tenant_id nullable on platform_events
-- SOC 2 CC6: Auth event logging requires platform-scope events (VL Admin).
-- VL Admin has tenant_id IS NULL — auth events cannot be inserted when NOT NULL.
-- Decision 143: All auth events logged. DS-019 Section 8.1: 10 event types.
-- Current state: ZERO rows — every insert for platform-scope events fails.
--
-- EXECUTE IN SUPABASE SQL EDITOR:

ALTER TABLE platform_events ALTER COLUMN tenant_id DROP NOT NULL;

COMMENT ON COLUMN platform_events.tenant_id IS
  'NULL for platform-scope events (auth, system). UUID for tenant-scoped events.';

-- RLS: Platform role reads all events, tenant users read own
-- First drop any existing SELECT policy
DROP POLICY IF EXISTS "platform_events_select" ON platform_events;
DROP POLICY IF EXISTS "platform_events_select_platform" ON platform_events;
DROP POLICY IF EXISTS "Enable read access for all users" ON platform_events;

CREATE POLICY "platform_events_select" ON platform_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.auth_user_id = auth.uid()
      AND profiles.role = 'platform'
    )
    OR
    (
      tenant_id IS NOT NULL
      AND tenant_id IN (
        SELECT profiles.tenant_id FROM profiles
        WHERE profiles.auth_user_id = auth.uid()
      )
    )
  );

-- Verify
SELECT column_name, is_nullable
FROM information_schema.columns
WHERE table_name = 'platform_events' AND column_name = 'tenant_id';
