-- OB-121: Prevent stale calculation result accumulation
--
-- Problem: The calculation engine inserts new results without deleting old ones.
-- Multiple runs for the same entity+period+plan accumulate duplicate rows,
-- inflating totals by 138% (850 rows instead of 320, $7.75M instead of $3.26M).
--
-- Fix: Add unique constraint on (tenant_id, entity_id, period_id, rule_set_id).
-- The engine now DELETEs before INSERT (belt), and this constraint prevents
-- duplicates at the DB level (suspenders).

-- First, clean existing duplicates (keep the latest row per combo)
DELETE FROM calculation_results
WHERE id NOT IN (
  SELECT DISTINCT ON (tenant_id, entity_id, period_id, rule_set_id) id
  FROM calculation_results
  ORDER BY tenant_id, entity_id, period_id, rule_set_id, created_at DESC
);

-- Add the unique constraint
ALTER TABLE calculation_results
ADD CONSTRAINT calculation_results_unique_entity_period_plan
UNIQUE (tenant_id, entity_id, period_id, rule_set_id);
