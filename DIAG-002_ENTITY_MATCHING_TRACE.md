# DIAG-002: ENTITY MATCHING TRACE — BCL NOVEMBER IMPORT

**This prompt produces ZERO code changes in Phase 0. Diagnostic and trace only. Evidence collection only.**

**Phase 1 applies a fix ONLY if Phase 0 identifies a specific, evidenced root cause.**

---

## READ FIRST

1. `CC_STANDING_ARCHITECTURE_RULES.md`
2. `SCHEMA_REFERENCE_LIVE.md`

---

## THE PROBLEM

BCL November data import: SCI classifies correctly (transaction@90%), 85 rows parsed, but Import Complete shows **0 Entities Matched**. This has failed twice in production (before and after HF-137). The "Go to Calculate" button is inactive because no entity-linked data exists.

BCL has 85 entities in the entities table. The November file has 85 rows with ID_Empleado values. The matching should succeed but doesn't.

**HF-137 claimed to fix this** by reassigning sheetData from the case-insensitive fallback. That fix either didn't address the actual root cause, or there's a second failure point downstream.

---

## WHAT "ENTITY MATCHING" MEANS

The import pipeline must:
1. Parse the XLSX → extract rows
2. Identify which column is the entity identifier (SCI says ID_Empleado@identifier)
3. Read the values from that column (e.g., "5001", "5002", etc.)
4. Look up each value against `entities.external_id` for this tenant
5. If match → assign entity_id (UUID) to the committed_data row
6. If no match → row has no entity_id

"0 Entities Matched" means step 4, 5, or 6 failed for ALL 85 rows.

---

## PHASE 0: TRACE THE EXACT FAILURE (Zero Code Changes)

### 0A: Verify Entities Exist

```bash
cd web
npx tsx -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await sb.from('entities')
  .select('external_id, display_name')
  .eq('tenant_id', 'b1c2d3e4-aaaa-bbbb-cccc-111111111111')
  .order('external_id')
  .limit(10);
console.log('Entity count query...');
const { count } = await sb.from('entities')
  .select('*', { count: 'exact', head: true })
  .eq('tenant_id', 'b1c2d3e4-aaaa-bbbb-cccc-111111111111');
console.log('Total entities:', count);
console.log('First 10:', JSON.stringify(data, null, 2));
console.log('Error:', error);
"
```

**Paste the output.** We need to see the exact format of external_id (e.g., "BCL-5001" vs "5001" vs "BCL5001").

### 0B: Check What November Data Looks Like in committed_data

```bash
npx tsx -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Find the most recent import batches
const { data: batches } = await sb.from('import_batches')
  .select('id, file_name, row_count, status, created_at')
  .eq('tenant_id', 'b1c2d3e4-aaaa-bbbb-cccc-111111111111')
  .order('created_at', { ascending: false })
  .limit(5);
console.log('Recent import batches:', JSON.stringify(batches, null, 2));

// Find committed_data from the most recent batch
if (batches && batches.length > 0) {
  const latestBatchId = batches[0].id;
  const { data: rows } = await sb.from('committed_data')
    .select('entity_id, data_type, source_date, row_data')
    .eq('tenant_id', 'b1c2d3e4-aaaa-bbbb-cccc-111111111111')
    .eq('import_batch_id', latestBatchId)
    .limit(3);
  console.log('Latest batch rows (first 3):', JSON.stringify(rows, null, 2));
  
  // Count rows with and without entity_id
  const { count: withEntity } = await sb.from('committed_data')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', 'b1c2d3e4-aaaa-bbbb-cccc-111111111111')
    .eq('import_batch_id', latestBatchId)
    .not('entity_id', 'is', null);
  const { count: withoutEntity } = await sb.from('committed_data')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', 'b1c2d3e4-aaaa-bbbb-cccc-111111111111')
    .eq('import_batch_id', latestBatchId)
    .is('entity_id', null);
  console.log('Rows WITH entity_id:', withEntity);
  console.log('Rows WITHOUT entity_id:', withoutEntity);
}
"
```

**This tells us:**
- Did the 85 rows actually reach committed_data?
- Do they have entity_id assigned?
- What does the row_data look like? (Specifically: what key holds the identifier value?)

### 0C: Check What October Data Looks Like (The Working Import)

```bash
npx tsx -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Find October's import batch
const { data: batches } = await sb.from('import_batches')
  .select('id, file_name, row_count, status, created_at')
  .eq('tenant_id', 'b1c2d3e4-aaaa-bbbb-cccc-111111111111')
  .order('created_at', { ascending: true })
  .limit(5);
console.log('Oldest import batches:', JSON.stringify(batches, null, 2));

// Find October committed_data with entity_id
if (batches && batches.length > 0) {
  const octBatchId = batches[0].id;
  const { data: rows } = await sb.from('committed_data')
    .select('entity_id, data_type, source_date, row_data')
    .eq('tenant_id', 'b1c2d3e4-aaaa-bbbb-cccc-111111111111')
    .eq('import_batch_id', octBatchId)
    .not('entity_id', 'is', null)
    .limit(3);
  console.log('October batch rows with entity_id (first 3):', JSON.stringify(rows, null, 2));
  
  // What key in row_data holds the identifier?
  if (rows && rows.length > 0) {
    console.log('row_data keys:', Object.keys(rows[0].row_data));
    // Find the value that matches the entity
    const { data: entity } = await sb.from('entities')
      .select('external_id')
      .eq('id', rows[0].entity_id)
      .single();
    console.log('Matched entity external_id:', entity?.external_id);
    console.log('Row ID_Empleado value:', rows[0].row_data['ID_Empleado'] || rows[0].row_data['id_empleado'] || 'NOT FOUND');
  }
}
"
```

**This is critical.** By comparing October (which worked) to November (which doesn't), we can see exactly what's different. Same column names? Same value format? Same entity_id assignment path?

### 0D: Trace the Execute-Bulk Entity Resolution Code

```bash
echo "=== Find execute-bulk route ==="
find web/src/app/api/import -path "*execute*" -name "*.ts" | sort

echo ""
echo "=== Entity resolution logic ==="
# Print the FULL entity matching section of execute-bulk
cat -n web/src/app/api/import/sci/execute-bulk/route.ts
```

**Paste the ENTIRE file.** Not excerpts. The full file with line numbers.

Then specifically identify:
1. Which line reads the identifier column from the row?
2. Which line queries the entities table?
3. Which line assigns entity_id to the committed_data row?
4. What happens when the lookup fails?
5. Is there logging that shows what values were attempted?

### 0E: Compare HF-137 Fix Against Current Code

```bash
echo "=== HF-137 commit diff ==="
git log --oneline --all | grep -i "137\|entity\|match\|bulk" | head -10
git show --stat HEAD~5..HEAD -- web/src/app/api/import/sci/execute-bulk/route.ts
```

Show what HF-137 actually changed in execute-bulk. Did the change deploy? Is it present in the current code?

### 0F: Simulate Entity Matching Locally

```bash
npx tsx -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Get all entity external_ids
const { data: entities } = await sb.from('entities')
  .select('id, external_id')
  .eq('tenant_id', 'b1c2d3e4-aaaa-bbbb-cccc-111111111111');

// Simulate what November data has
const novemberIds = ['5001', '5002', '5003', '5012', '5085']; // sample values from November

console.log('Entities external_id format (first 5):', entities?.slice(0, 5).map(e => e.external_id));
console.log('November ID_Empleado values (sample):', novemberIds);

// Try exact match
for (const novId of novemberIds) {
  const match = entities?.find(e => e.external_id === novId);
  console.log(novId, '→ exact match:', match ? match.external_id : 'NO MATCH');
}

// Try with BCL- prefix
for (const novId of novemberIds) {
  const match = entities?.find(e => e.external_id === 'BCL-' + novId);
  console.log('BCL-' + novId, '→ match:', match ? match.external_id : 'NO MATCH');
}

// Try contains
for (const novId of novemberIds) {
  const match = entities?.find(e => e.external_id.includes(novId));
  console.log(novId, '→ contains match:', match ? match.external_id : 'NO MATCH');
}
"
```

**This directly tests the matching hypothesis.** If entity external_ids are "BCL-5001" and the November data has "5001", exact match fails. If both are "5001", it should work.

### 0G: Root Cause Report

Based on ALL evidence above, document:

1. **Do November rows reach committed_data?** (0B tells us)
2. **Do they have entity_id?** (0B tells us)
3. **What format is entities.external_id?** (0A tells us)
4. **What format is the identifier value in November's row_data?** (0B tells us)
5. **Do these formats match?** (0F tells us)
6. **Where in execute-bulk does the matching happen?** (0D tells us)
7. **Did HF-137's fix deploy?** (0E tells us)
8. **How did October's import match but November's doesn't?** (0C tells us)

**Commit:** `git add -A && git commit -m "DIAG-002 Phase 0: Entity matching trace — complete evidence collection" && git push origin dev`

---

## PHASE 1: FIX (Only After Phase 0 Evidence)

Based on Phase 0 findings, apply the targeted fix. The fix MUST address the specific evidenced root cause.

**Do NOT proceed to Phase 1 until Phase 0 is complete and the root cause is documented with evidence.**

### Possible Root Causes and Fixes:

**A) Format mismatch (e.g., "BCL-5001" vs "5001"):**
- Fix: normalize both sides before matching
- Strip common prefixes, trim whitespace, case-insensitive comparison

**B) Identifier column not being read:**
- Fix: use SCI semantic binding (identifier role) to identify the correct column

**C) Entity lookup query wrong:**
- Fix: correct the Supabase query that matches row values to entities.external_id

**D) Rows reach committed_data but entity_id is assigned later (not during import):**
- Fix: ensure entity resolution happens during import, not after

**E) HF-137 fix didn't deploy or was overwritten:**
- Fix: reapply and verify

### After Fix — Verification Script

```bash
npx tsx -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Delete November committed_data so we can re-import
const { data: batches } = await sb.from('import_batches')
  .select('id, file_name, created_at')
  .eq('tenant_id', 'b1c2d3e4-aaaa-bbbb-cccc-111111111111')
  .ilike('file_name', '%Nov%')
  .order('created_at', { ascending: false })
  .limit(1);
  
if (batches && batches.length > 0) {
  const batchId = batches[0].id;
  console.log('Deleting November batch:', batches[0].file_name);
  
  const { error: delData } = await sb.from('committed_data')
    .delete()
    .eq('import_batch_id', batchId);
  console.log('Delete committed_data:', delData ? 'ERROR: ' + delData.message : 'OK');
  
  const { error: delBatch } = await sb.from('import_batches')
    .delete()
    .eq('id', batchId);
  console.log('Delete import_batch:', delBatch ? 'ERROR: ' + delBatch.message : 'OK');
}

// Verify October data still intact
const { count } = await sb.from('committed_data')
  .select('*', { count: 'exact', head: true })
  .eq('tenant_id', 'b1c2d3e4-aaaa-bbbb-cccc-111111111111');
console.log('Remaining committed_data rows:', count, '(expected: 170 for October)');
"
```

This cleans up the failed November import so Patricia can re-import after the fix.

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-1 | Root cause identified with pasted DB evidence | Format mismatch / lookup failure / code path documented |
| PG-2 | October vs November comparison documented | Why October worked and November didn't |
| PG-3 | Fix targets evidenced root cause | Not speculative |
| PG-4 | Failed November data cleaned up | Patricia can re-import |
| PG-5 | `npm run build` exits 0 | Clean build |

**Commit:** `git add -A && git commit -m "DIAG-002 Phase 1: Entity matching fix — [root cause]" && git push origin dev`

---

## PHASE 2: COMPLETION REPORT + PR

Create `DIAG-002_ENTITY_MATCHING_REPORT.md`:

```markdown
# DIAG-002: Entity Matching Trace — Report

## Evidence

### Entity external_id format: [paste from 0A]
### November row_data identifier values: [paste from 0B]
### October row_data identifier values: [paste from 0C]
### Match test results: [paste from 0F]

## Root Cause
[Exact reason matching fails, with evidence]

## Fix
[What was changed and why]

## Cleanup
[November failed import data removed — Patricia can re-import]
```

```bash
gh pr create --base main --head dev \
  --title "DIAG-002: Entity Matching Fix — [root cause description]" \
  --body "## Evidence-Based Fix

### Root Cause
[from diagnostic]

### Evidence
- Entity external_id format: [format]
- November identifier values: [format]
- Match result: [why it fails]

### Fix
[targeted change]

### Andrew's Browser Test
Upload BCL_Datos_Nov2025.xlsx → Import Complete must show >0 Entities Matched

## See DIAG-002_ENTITY_MATCHING_REPORT.md"
```

**Commit:** `git add -A && git commit -m "DIAG-002 Phase 2: Completion report + PR" && git push origin dev`

---

## ANDREW'S BROWSER TEST (Post-Merge)

**One action. One expected result.**

1. Login as Patricia
2. Navigate to /operate/import
3. Upload BCL_Datos_Nov2025.xlsx
4. Confirm classification → Import

**Expected: Import Complete shows 85 Records, >0 Entities Matched, "Go to Calculate →" is active.**

If Entities Matched is 0, the fix failed. No ambiguity.

---

*DIAG-002 — March 15, 2026*
*"Compare what worked (October) to what didn't (November). The difference is the root cause."*
