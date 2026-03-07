-- HF-096: Meridian Data Reset for HC Re-import
-- Tenant: Meridian (5035b1e8-0754-4527-b7ec-9f93f85e4c79)
-- Purpose: Delete all imported data so Andrew can re-import with HC diagnostic logging active
-- Execute in Supabase SQL Editor (admin@pipelinetest.mx or service role)

-- IMPORTANT: Run these in order. Each statement is idempotent.

-- Step 1: Delete calculation results
DELETE FROM calculation_results
WHERE entity_period_outcome_id IN (
  SELECT epo.id FROM entity_period_outcomes epo
  JOIN entities e ON epo.entity_id = e.id
  WHERE e.tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
);

-- Step 2: Delete entity period outcomes
DELETE FROM entity_period_outcomes
WHERE entity_id IN (
  SELECT id FROM entities
  WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
);

-- Step 3: Delete committed data
DELETE FROM committed_data
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';

-- Step 4: Delete entities
DELETE FROM entities
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';

-- Step 5: Delete periods
DELETE FROM periods
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';

-- Step 6: Delete classification signals (so HC re-import starts clean)
DELETE FROM classification_signals
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';

-- Step 7: Verify cleanup
SELECT 'calculation_results' AS table_name, COUNT(*) AS remaining
FROM calculation_results WHERE entity_period_outcome_id IN (
  SELECT epo.id FROM entity_period_outcomes epo
  JOIN entities e ON epo.entity_id = e.id
  WHERE e.tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
)
UNION ALL
SELECT 'entity_period_outcomes', COUNT(*) FROM entity_period_outcomes
WHERE entity_id IN (SELECT id FROM entities WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79')
UNION ALL
SELECT 'committed_data', COUNT(*) FROM committed_data
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
UNION ALL
SELECT 'entities', COUNT(*) FROM entities
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
UNION ALL
SELECT 'periods', COUNT(*) FROM periods
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
UNION ALL
SELECT 'classification_signals', COUNT(*) FROM classification_signals
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';

-- Expected: All rows show 0
