-- ============================================================
-- HF-355: Platform-Operations Ingestion (capability-gated)
--
-- WHY: A platform operator (profiles.tenant_id = NULL) could not enqueue an import — the OB-251
-- processing_jobs write policy keys on tenant membership (tenant_id IN profiles WHERE auth_user_id),
-- which a NULL tenant can never satisfy, and the VL-Admin policy covers SELECT only. The failed insert
-- returned 403, the client fell back to the synchronous full-materialization path, and a 7.5M-cell file
-- took the production DB down.
--
-- FIX (I3, SR-39 — SOC 2 CC6 / OWASP A01,A04 / DS-014): authorize ingestion by an EXPLICIT named
-- capability, `platform.data_operations`, NOT the structural `tenant_id IS NULL` proxy. An auditor can
-- answer "why could this user enqueue cross-tenant ingestion" with "they hold platform.data_operations,"
-- a deliberate grant. The primary enforcement is the server enqueue route (service-role + this same
-- capability check, see /api/import/sci/enqueue); this policy is defense-in-depth and also lets the
-- platform operator's fire-and-forget job-status updates succeed.
--
-- FP-49: verified against the LIVE schema (scripts/_hf355_verify_migration.ts row-introspection) —
-- profiles.capabilities is a JSONB ARRAY; processing_jobs exists with the OB-251 member / VL-Admin-
-- SELECT / service-role policies and a NOT NULL tenant_id. Static SCHEMA_REFERENCE_LIVE.md is stale on
-- processing_jobs chunk columns (noted). Korean Test: the capability is a structural authorization
-- token, no domain/tenant/role literal in any predicate.
-- ============================================================

-- ────────────────────────────────────────────
-- 1. Grant `platform.data_operations` to every platform operator lacking it.
--    Idempotent: only appends where absent. Array shape preserved (jsonb || jsonb-array → jsonb-array),
--    so the existing capabilities array CHECK still passes.
-- ────────────────────────────────────────────
UPDATE profiles
SET capabilities = capabilities || '["platform.data_operations"]'::jsonb,
    updated_at = now()
WHERE role = 'platform'
  AND NOT (capabilities @> '["platform.data_operations"]'::jsonb);

-- ────────────────────────────────────────────
-- 2. Capability-gated WRITE policy on processing_jobs.
--    A profile holding platform.data_operations may manage processing_jobs for ANY tenant. Keys on the
--    CAPABILITY, never on tenant_id IS NULL (I3). Idempotent (DROP IF EXISTS then CREATE). The existing
--    "Tenant members…", "VL Admin read…", and "Service role…" policies are left intact (an INSERT is
--    permitted if ANY policy's USING/WITH CHECK is satisfied — RLS policies are OR-combined).
-- ────────────────────────────────────────────
DROP POLICY IF EXISTS "Platform operators can manage processing jobs" ON processing_jobs;
CREATE POLICY "Platform operators can manage processing jobs"
  ON processing_jobs FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE auth_user_id = auth.uid()
        AND capabilities @> '["platform.data_operations"]'::jsonb
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE auth_user_id = auth.uid()
        AND capabilities @> '["platform.data_operations"]'::jsonb
    )
  );

-- ============================================================
-- POST-CONDITION (architect verifies via scripts/_hf355_verify_migration.ts + SQL Editor):
--   • every role='platform' profile contains 'platform.data_operations'
--   • policy "Platform operators can manage processing jobs" exists on processing_jobs (FOR ALL)
--   • the new write policy's predicate references the capability, NOT tenant_id IS NULL
--   • capabilities arrays still satisfy the array CHECK
-- ============================================================
