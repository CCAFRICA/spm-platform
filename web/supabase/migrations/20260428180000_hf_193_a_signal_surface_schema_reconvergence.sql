-- Re-author of HF-193 signal-surface schema half.
-- Source-of-truth re-convergence with live DB after CLT-197 wholesale revert
-- (commit 314e8db0, 2026-04-26) deleted migration files but did not roll back
-- the live database. Architect disposition (Phase 4 Class B B.0): live schema
-- state matches Decision 153 LOCKED 2026-04-20 specification; this migration
-- restores source-of-truth alignment without modifying live state.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.
-- Safe to apply against a database already in this state.
--
-- Decision 153 dispositions A2 (typed columns) implemented here.
-- F2 write site, E1 read site, and C2 gate land in B.2 / B.3 / B.4 of this OB.

ALTER TABLE public.classification_signals
  ADD COLUMN IF NOT EXISTS rule_set_id uuid,
  ADD COLUMN IF NOT EXISTS metric_name text,
  ADD COLUMN IF NOT EXISTS component_index integer;

CREATE INDEX IF NOT EXISTS idx_classification_signals_l2_lookup
  ON public.classification_signals USING btree
    (signal_type, rule_set_id, metric_name, component_index)
  WHERE (signal_type = 'metric_comprehension'::text);
