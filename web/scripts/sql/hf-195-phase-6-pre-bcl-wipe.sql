-- HF-195 Phase 6-PRE: BCL committed_data + downstream wipe
-- Preserves cross-tenant aggregates (foundational_patterns, domain_patterns, synaptic_density)
-- Tenant: b1c2d3e4-aaaa-bbbb-cccc-111111111111
-- Apply via Supabase Dashboard SQL Editor (architect-only, per memory).
--
-- Schema verification (CC executed pre-generation, 2026-05-01):
--   All 7 target tables exist in current VP schema and have tenant_id column.
--
-- Pre-wipe inventory (CC executed pre-generation, 2026-05-01):
--   committed_data         : 255 rows
--   rule_sets              :   0 rows
--   calculation_results    :   0 rows
--   classification_signals :  50 rows
--   structural_fingerprints:   3 rows
--   import_batches         :   3 rows
--   entity_period_outcomes :   0 rows
--
-- Order: child-tables-first to respect FK constraints.

BEGIN;

DELETE FROM entity_period_outcomes WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
DELETE FROM calculation_results    WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
DELETE FROM classification_signals WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
DELETE FROM structural_fingerprints WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
DELETE FROM import_batches         WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
DELETE FROM rule_sets              WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
DELETE FROM committed_data         WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';

-- DO NOT TOUCH: foundational_patterns, domain_patterns, synaptic_density (cross-tenant)
-- DO NOT TOUCH: profiles (VL Admin survival)
-- DO NOT TOUCH: tenants (BCL tenant row preserved)

COMMIT;
