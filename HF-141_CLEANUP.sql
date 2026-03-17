-- HF-141 CLEANUP: Remove March data committed with February source_dates
-- After HF-141 merge, Andrew will:
-- 1. Run this cleanup
-- 2. Re-import March through the fixed pipeline

-- Step 1: Find the March batch (has Feb source_dates, from the Feb+Mar multi-file import)
-- These are the two batches from the post-HF-140 import session (proposalId 36e8f4a3)
-- that both contain February data. One is correct (Feb), one is the corrupted March batch.

-- First, identify the two batch IDs:
SELECT cd.import_batch_id, count(*) as rows, min(cd.source_date) as min_date
FROM committed_data cd
JOIN import_batches ib ON cd.import_batch_id = ib.id
WHERE cd.tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
  AND cd.source_date >= '2026-02-01'
  AND cd.source_date < '2026-03-01'
GROUP BY cd.import_batch_id;
-- Expected: 2 batch IDs, each with 85 rows

-- Step 2: Delete the SECOND batch (the one created for March but with Feb data)
-- Since both batches have identical data, delete the one with the later created_at.
-- Replace {BATCH_ID} with the actual ID from Step 1 query.

-- DELETE FROM committed_data
-- WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
--   AND import_batch_id = '{BATCH_ID_OF_SECOND_BATCH}';
-- Expected: 85 rows deleted

-- DELETE FROM import_batches WHERE id = '{BATCH_ID_OF_SECOND_BATCH}';
-- Expected: 1 row deleted

-- Step 3: Verify cleanup
SELECT date_trunc('month', source_date)::date AS month, count(*)
FROM committed_data
WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
  AND source_date IS NOT NULL
GROUP BY 1 ORDER BY 1;
-- Expected: Oct 85, Nov 85, Dec 85, Feb 85 (no Jan, no Mar yet)

-- Step 4: After cleanup, re-import March file individually through the fixed pipeline
-- Then re-import January file individually
-- Then calculate all 6 months
