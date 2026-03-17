-- DIAG-004 CLEANUP: Remove 3 duplicate January batches from multi-file import
-- These batches contain January data incorrectly committed for Feb/Mar
-- Batch IDs from DIAG-004 Query 1.2
-- REVIEW AND EXECUTE MANUALLY IN SUPABASE SQL EDITOR

-- Step 1: Delete committed_data for the 3 duplicate batches
DELETE FROM committed_data
WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
  AND import_batch_id IN (
    'f3581470-00ed-458d-afb0-79c6a60c281c',
    'ddb8cd9a-dd4c-46f4-8215-7efd9de18ab1',
    'f0b7b125-4a2e-469d-b117-60cfe2c52acc'
  );
-- Expected: 255 rows deleted (85 x 3)

-- Step 2: Delete the import_batches records
DELETE FROM import_batches
WHERE id IN (
    'f3581470-00ed-458d-afb0-79c6a60c281c',
    'ddb8cd9a-dd4c-46f4-8215-7efd9de18ab1',
    'f0b7b125-4a2e-469d-b117-60cfe2c52acc'
  );
-- Expected: 3 rows deleted

-- Step 3: Delete stale calculation batches for February (produced from bad data)
DELETE FROM entity_period_outcomes
WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
  AND period_id = 'ac2fe76d-53f2-497e-8ba3-5802b1db57f5';

DELETE FROM calculation_results
WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
  AND period_id = 'ac2fe76d-53f2-497e-8ba3-5802b1db57f5';

DELETE FROM calculation_batches
WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
  AND period_id = 'ac2fe76d-53f2-497e-8ba3-5802b1db57f5';

-- Step 4: Verify cleanup
SELECT count(*) AS remaining_rows FROM committed_data
WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
-- Expected: 340 rows (85 Oct + 85 Nov + 85 Dec + 85 personal = 340)
-- Jan/Feb/Mar datos will be re-imported through the fixed pipeline

SELECT date_trunc('month', source_date)::date AS month, count(*)
FROM committed_data
WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
  AND source_date IS NOT NULL
GROUP BY 1 ORDER BY 1;
-- Expected: 3 months (Oct, Nov, Dec) with 85 rows each
