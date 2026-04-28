-- AUD-004 / OB-196 Phase 1.6.5: drop disputes table per architect direction
-- Disputes feature reconstructs on engine foundation as roadmap item ("structured dispute workflow");
-- current table contaminated by demo-era coupling (calculation-engine.ts, GuidedDisputeFlow,
-- SystemAnalyzer, dispute-service.ts demo arms). Future feature builds on fresh schema design.
--
-- Pre-migration verification (CC service-role query 2026-04-28):
--   disputes_row_count = 0
--   audit_log dispute_rows = null (no orphan-data risk)
--   FK fan-in: zero (verified via grep web/supabase/migrations: zero hits for REFERENCES disputes / dispute_id)
--
-- Architect applies via Supabase SQL Editor (Standing Rule 7).
-- Post-application verification:
--   SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'disputes';  -- expected 0

DROP TABLE IF EXISTS disputes CASCADE;
