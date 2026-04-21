-- HF-193-A Phase 1.2: Signal-surface schema migration (A2 disposition)
--
-- Adds three typed columns + composite index to classification_signals per
-- Decision 153 Q-A=A2 disposition and Decision 64 v2 L2 Comprehension
-- vocabulary (IGF-T2-E01 v2, landed via VG PR #48 merge 2026-04-21).
--
-- This migration is ADDITIVE — no existing columns modified; no existing
-- data migrated. Existing signal rows (e.g., OB-86 classification signals,
-- Phase E vocabulary bindings) continue using their existing columns.
-- New L2 Comprehension signals use the new columns.
--
-- Partial index scopes to 'metric_comprehension' signal_type per spec
-- artifact recommended_form. Index supports the composite-key query
-- pattern used by E1 reads and C2 gates.
--
-- Application path: VP convention (apply-migration-008.mjs documented pattern) —
-- author migration file here; architect applies via Supabase SQL Editor.
-- CC verifies post-apply via Supabase JS client (Phase 1.3).

BEGIN;

-- Add the three scoping columns (nullable — existing rows pre-date these columns)
ALTER TABLE classification_signals
  ADD COLUMN IF NOT EXISTS rule_set_id UUID,
  ADD COLUMN IF NOT EXISTS metric_name TEXT,
  ADD COLUMN IF NOT EXISTS component_index INTEGER;

-- Composite index: partial, scoped to metric_comprehension signals
-- Supports E1 read pattern: lookup by (signal_type, rule_set_id, metric_name, component_index)
CREATE INDEX IF NOT EXISTS idx_classification_signals_l2_lookup
  ON classification_signals (signal_type, rule_set_id, metric_name, component_index)
  WHERE signal_type = 'metric_comprehension';

COMMIT;

-- Post-migration verification (Phase 1.3, CC-executed via Supabase JS client):
--   1. Approach 3a: query information_schema.columns for the three new columns
--   2. Approach 3b (fallback): behavioral INSERT+DELETE test on classification_signals
--   3. Index presence: accept Supabase SQL Editor output as authoritative
