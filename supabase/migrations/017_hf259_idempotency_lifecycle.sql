-- 017_hf259_idempotency_lifecycle.sql
-- HF-259 (1C completing slice): execution idempotency (Q3) + audited rule_set supersession (Q6).
--
-- FP-49: schema verified live at HEAD 18e055c7 before authoring — rule_sets has no lifecycle/
-- predecessor columns; import_batches carries batch-level lineage + file_hash_sha256; neither
-- table below pre-exists. structural_fingerprints (the tabular moat) is untouched.
--
-- Apply step: architect applies via Supabase Dashboard SQL Editor (VP migration locus).
-- CC verifies post-application via scripts/_hf259-verify-migration.ts (service-role).

-- ── Q3: plan-interpretation idempotency / single-flight ──────────────────────
-- One row per (tenant, plan content hash). The UNIQUE constraint is the single-flight
-- guard: a second concurrent import of the same content cannot INSERT a second
-- 'in_progress' row. `rule_set_id` (set when status='completed') is the fingerprint-reuse
-- key: a later import of the same content returns this rule_set without re-deriving.
-- content_hash = SHA-256 of the plan file bytes (format-invariant; computeFileHashSha256).
CREATE TABLE IF NOT EXISTS plan_interpretation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  content_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress',   -- 'in_progress' | 'completed' | 'failed'
  rule_set_id UUID,                              -- set when status='completed'
  source_file_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, content_hash)               -- single-flight: one execution per content per tenant
);
CREATE INDEX IF NOT EXISTS idx_plan_runs_tenant_hash ON plan_interpretation_runs(tenant_id, content_hash);

-- ── Q6: rule_set lifecycle audit ─────────────────────────────────────────────
-- Explicit, recorded transitions for every rule_set lifecycle event. With Q3 in place,
-- a duplicate import is deduped before save, so 'superseded' fires only on a GENUINE
-- re-interpretation (an intentional plan change) — and that event is audited.
CREATE TABLE IF NOT EXISTS rule_set_lifecycle_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  rule_set_id UUID NOT NULL,
  event_type TEXT NOT NULL,                      -- 'created' | 'superseded' | 'withdrawn'
  predecessor_id UUID,                           -- for 'superseded': the rule_set being replaced; for 'created': the new id's predecessor (if any)
  actor TEXT,                                    -- created_by / user id / 'sci' system actor
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rs_lifecycle_ruleset ON rule_set_lifecycle_events(rule_set_id);
CREATE INDEX IF NOT EXISTS idx_rs_lifecycle_tenant ON rule_set_lifecycle_events(tenant_id, created_at DESC);

-- ── RLS ───────────────────────────────────────────────────────────────────────
-- Writes happen server-side via the service-role client (bypasses RLS). Reads from the
-- browser (UI lifecycle visibility) are tenant-scoped. Mirrors the 016 read-policy pattern.
ALTER TABLE plan_interpretation_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant members read plan_interpretation_runs"
  ON plan_interpretation_runs FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM profiles WHERE auth_user_id = auth.uid()));

ALTER TABLE rule_set_lifecycle_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant members read rule_set_lifecycle_events"
  ON rule_set_lifecycle_events FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM profiles WHERE auth_user_id = auth.uid()));
