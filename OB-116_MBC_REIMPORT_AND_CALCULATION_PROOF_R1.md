# OB-116: MBC RE-IMPORT AND CALCULATION PROOF
## Target: alpha.3.0
## Date: February 28, 2026
## Derived From: CLT-113 Truth Report (T-13 through T-18)
## Depends On: OB-114 merged + OB-115 merged

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules apply
2. `SCHEMA_REFERENCE.md` — authoritative column reference
3. `CLT-113_TRUTH_REPORT.md` — calculation binding analysis (T-13 through T-18)
4. `CLT-113_DATABASE_TRUTH.md` — MBC database state, committed_data structure, component metrics
5. `OB-115_COMPLETION_REPORT.md` — what input_bindings were populated, what data_type logic changed

**Read all five before doing anything.**

---

## WHY THIS OB EXISTS

OB-114 fixed display lies (confidence, labels, fake preview). OB-115 fixed pipeline data (data_type tagging, input_bindings, Sabor routing). But MBC's **existing committed_data still has `data_type: "Sheet1"`** from the pre-fix import. The calculation engine still can't match data to components.

This OB:
1. Clears MBC's stale committed_data, calculation results, and import batches
2. Re-imports the 7 Caribe CSV files through the now-fixed pipeline
3. Runs calculation
4. Verifies whether the pipeline produces non-zero results
5. If $0.00 persists, diagnoses exactly why and documents what Layer 3 (semantic resolution) needs

**This is the proof-of-fix OB.** It answers the question: "Did OB-114 + OB-115 actually solve the problem?"

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
3. Final step: `gh pr create --base main --head dev`
4. **Commit this prompt to git as first action.**
5. **Git from repo root (spm-platform), NOT web/.**
6. Supabase `.in()` calls MUST batch ≤200 items per call.
7. **Every proof gate requires pasted evidence.**

---

## PHASE 0: PRE-FLIGHT — VERIFY OB-114 + OB-115 ARE MERGED (10 min)

### 0A: Confirm dev branch is current

```bash
cd ~/spm-platform
git checkout dev && git pull origin dev
git log --oneline -10
```

Verify that OB-114 and OB-115 commits are present. If not, STOP — this OB depends on both.

### 0B: Verify the three critical fixes are in place

```bash
echo "=== FIX 1: Confidence adapter (OB-114) ==="
grep -n "typeof result.confidence" web/src/lib/ai/providers/anthropic-adapter.ts
echo ""
echo "=== FIX 2: getRuleSets active filter (OB-114) ==="
grep -A 3 "from('rule_sets')" web/src/lib/supabase/rule-set-service.ts | head -10
echo ""
echo "=== FIX 3: data_type tagging (OB-115) ==="
grep -n "data_type" web/src/app/api/import/commit/route.ts | head -10
echo ""
echo "=== FIX 4: input_bindings populated (OB-115) ==="
cd ~/spm-platform/web
npx tsx --env-file=.env.local -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await sb.from('rule_sets').select('name, input_bindings')
  .eq('tenant_id', 'fa6a48c5-56dc-416d-9b7d-9c93d4882251').eq('status', 'active').order('name');
data?.forEach(rs => console.log(rs.name, '→', rs.input_bindings ? 'HAS BINDINGS' : 'NULL'));
"
```

Document the state. If any fix is missing, note it but continue — this OB can still diagnose what's needed.

### Proof Gate

| # | Gate | How CC Verifies | Evidence Required |
|---|------|----------------|-------------------|
| PG-01 | OB-114 + OB-115 commits present on dev | git log output | Paste last 10 commits |
| PG-02 | Critical fixes verified in code | grep outputs | Paste all grep results |

**Commit:** `OB-116 Phase 0: Pre-flight — OB-114/115 merge verification`

---

## PHASE 1: CAPTURE MBC BASELINE STATE (10 min)

Before clearing anything, document what exists so we can compare before/after.

```bash
cd ~/spm-platform/web
npx tsx --env-file=.env.local -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const tenantId = 'fa6a48c5-56dc-416d-9b7d-9c93d4882251';

console.log('=== MBC BASELINE STATE ===');

// Committed data
const { count: cdCount } = await sb.from('committed_data').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId);
console.log('Committed data rows:', cdCount);

// Data types breakdown
const { data: dtypes } = await sb.from('committed_data').select('data_type').eq('tenant_id', tenantId);
const typeCounts = {};
dtypes?.forEach(r => { typeCounts[r.data_type] = (typeCounts[r.data_type] || 0) + 1; });
console.log('Data types:', typeCounts);

// Calculation results
const { count: crCount } = await sb.from('calculation_results').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId);
console.log('Calculation results:', crCount);

// Calculation batches
const { data: batches } = await sb.from('calculation_batches').select('id, lifecycle_state, rule_set_id').eq('tenant_id', tenantId);
console.log('Calculation batches:', batches?.length);
batches?.forEach(b => console.log('  ', b.id.substring(0, 8), b.lifecycle_state));

// Import batches
const { data: imports } = await sb.from('import_batches').select('id, file_name, status, row_count').eq('tenant_id', tenantId);
console.log('Import batches:', imports?.length);
imports?.forEach(ib => console.log('  ', ib.file_name, '→', ib.status, '(', ib.row_count, 'rows)'));

// Entities
const { count: entCount } = await sb.from('entities').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId);
console.log('Entities:', entCount);

// Periods
const { data: periods } = await sb.from('periods').select('label, canonical_key').eq('tenant_id', tenantId).order('start_date');
console.log('Periods:', periods?.length);
periods?.forEach(p => console.log('  ', p.label, '(', p.canonical_key, ')'));

// Rule set assignments
const { count: rsaCount } = await sb.from('rule_set_assignments').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId);
console.log('Rule set assignments:', rsaCount);
"
```

Write results to `OB-116_BASELINE_STATE.md` at project root.

### Proof Gate

| # | Gate | How CC Verifies | Evidence Required |
|---|------|----------------|-------------------|
| PG-03 | Baseline state documented | Script output pasted | Full output |

**Commit:** `OB-116 Phase 1: MBC baseline state captured`

---

## PHASE 2: CLEAR STALE MBC DATA (15 min)

Clear calculation results and committed_data so we can re-import through the fixed pipeline. **Preserve:** entities, periods, rule_sets, rule_set_assignments (these are structural, not import-dependent).

### 2A: Clear in dependency order

Foreign key constraints require a specific deletion order. Delete child records before parent records.

```bash
cd ~/spm-platform/web
npx tsx --env-file=.env.local -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const tenantId = 'fa6a48c5-56dc-416d-9b7d-9c93d4882251';

console.log('=== CLEARING MBC STALE DATA ===');

// Step 1: Delete calculation_results (depends on calculation_batches)
const { count: cr } = await sb.from('calculation_results').delete().eq('tenant_id', tenantId).select('*', { count: 'exact', head: true });
console.log('Deleted calculation_results:', cr || 0);

// Step 2: Delete entity_period_outcomes (if any)
const { count: epo } = await sb.from('entity_period_outcomes').delete().eq('tenant_id', tenantId).select('*', { count: 'exact', head: true });
console.log('Deleted entity_period_outcomes:', epo || 0);

// Step 3: Delete calculation_batches
const { count: cb } = await sb.from('calculation_batches').delete().eq('tenant_id', tenantId).select('*', { count: 'exact', head: true });
console.log('Deleted calculation_batches:', cb || 0);

// Step 4: Delete committed_data (depends on import_batches)
const { count: cd } = await sb.from('committed_data').delete().eq('tenant_id', tenantId).select('*', { count: 'exact', head: true });
console.log('Deleted committed_data:', cd || 0);

// Step 5: Delete import_batches
const { count: ib } = await sb.from('import_batches').delete().eq('tenant_id', tenantId).select('*', { count: 'exact', head: true });
console.log('Deleted import_batches:', ib || 0);

// Step 6: Delete classification_signals (if any)
const { count: cs } = await sb.from('classification_signals').delete().eq('tenant_id', tenantId).select('*', { count: 'exact', head: true });
console.log('Deleted classification_signals:', cs || 0);

console.log('\\n=== PRESERVED ===');
const { count: ent } = await sb.from('entities').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId);
console.log('Entities:', ent, '(preserved)');
const { count: per } = await sb.from('periods').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId);
console.log('Periods:', per, '(preserved)');
const { count: rs } = await sb.from('rule_sets').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'active');
console.log('Active rule sets:', rs, '(preserved)');
const { count: rsa } = await sb.from('rule_set_assignments').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId);
console.log('Rule set assignments:', rsa, '(preserved)');
"
```

### 2B: Handle deletion errors

If any deletion fails due to foreign key constraints, the error will tell you which table references it. Add that table to the deletion sequence above the failing step. Common culprits:
- `entity_period_outcomes` references `calculation_results`
- `calculation_results` references `calculation_batches`
- `committed_data` references `import_batches`

If a table doesn't exist, the Supabase client will return an error — document it and continue.

### 2C: Verify clean state

```bash
cd ~/spm-platform/web
npx tsx --env-file=.env.local -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const tenantId = 'fa6a48c5-56dc-416d-9b7d-9c93d4882251';

const tables = ['committed_data', 'calculation_results', 'calculation_batches', 'import_batches'];
for (const table of tables) {
  const { count } = await sb.from(table).select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId);
  console.log(table + ':', count, count === 0 ? '✓' : '✗ STILL HAS DATA');
}
"
```

### Proof Gate

| # | Gate | How CC Verifies | Evidence Required |
|---|------|----------------|-------------------|
| PG-04 | committed_data cleared | Count = 0 | Paste verification output |
| PG-05 | calculation_results cleared | Count = 0 | Paste verification output |
| PG-06 | calculation_batches cleared | Count = 0 | Paste verification output |
| PG-07 | Entities + periods + rule_sets preserved | Counts match baseline | Paste verification output |

**Commit:** `OB-116 Phase 2: MBC stale data cleared — clean slate for re-import`

---

## PHASE 3: RE-IMPORT MBC DATA VIA API (30 min)

**This is the critical phase.** We need to re-import the 7 Caribe CSV files through the now-fixed pipeline and verify that:
1. Each file gets a meaningful `data_type` (not "Sheet1")
2. The AI classification produces useful metadata
3. committed_data is correctly tagged

### 3A: Locate the CSV files

The Caribe data files are:
1. `CFG_Deposit_Balances_Q1_2024.csv` (48 rows)
2. `CFG_Insurance_Referrals_Q1_2024.csv` (188 rows)
3. `CFG_Loan_Defaults_Q1_2024.csv` (9 rows)
4. `CFG_Loan_Disbursements_Feb2024.csv` (446 rows)
5. `CFG_Loan_Disbursements_Jan2024.csv` (396 rows)
6. `CFG_Loan_Disbursements_Mar2024.csv` (394 rows)
7. `CFG_Mortgage_Closings_Q1_2024.csv` (82 rows)

Plus roster: `CFG_Personnel_Q1_2024.xlsx` (25 entities)

These files may be available in the project repo or a demo data directory. Search for them:

```bash
find ~/spm-platform -name "CFG_*" -type f 2>/dev/null | head -20
find ~/spm-platform -name "*Caribe*" -type f 2>/dev/null | head -10
find ~/spm-platform -name "*MBC*" -o -name "*Mexican*" -type f 2>/dev/null | head -10
ls ~/spm-platform/web/demo-data/ 2>/dev/null
ls ~/spm-platform/web/scripts/demo-data/ 2>/dev/null
ls ~/spm-platform/demo-data/ 2>/dev/null
```

If files are not found in the repo, **STOP and document this.** The re-import test requires the actual CSV files. Andrew will need to provide them or point to their location.

### 3B: Import via API (if files available)

If the CSV files are found, import them programmatically through the same API the UI uses. This tests the pipeline end-to-end.

For EACH file:

```bash
cd ~/spm-platform/web

# Step 1: Upload and analyze (simulates the Sheet Analysis step)
# This calls the analyze-workbook API which triggers AI classification
curl -X POST http://localhost:3000/api/analyze-workbook \
  -H "Content-Type: application/json" \
  -d '{
    "filename": "CFG_Deposit_Balances_Q1_2024.csv",
    "sheets": [{ "name": "Sheet1", "columns": ["OfficerID", "OfficerName", "Branch", "SnapshotDate", "SnapshotPeriod", "TotalDepositBalance", "NewAccountsOpened", "AccountsClosed", "Currency"], "sampleValues": [...], "rowCount": 48 }],
    "tenantId": "fa6a48c5-56dc-416d-9b7d-9c93d4882251"
  }'
```

**IMPORTANT:** The exact API shape may differ. Before calling the API:

```bash
echo "=== ANALYZE WORKBOOK API SHAPE ==="
head -100 web/src/app/api/analyze-workbook/route.ts
echo ""
echo "=== IMPORT COMMIT API SHAPE ==="
head -100 web/src/app/api/import/commit/route.ts
```

Read both API routes to understand:
- What request body they expect
- What response they return
- How analysis feeds into commit

### 3C: Alternative approach — build a re-import script

If the API is too complex to call via curl (requires auth tokens, complex payloads, multi-step flow), build a script that:

1. Reads the CSV files
2. Parses them using the same parsing logic the UI uses
3. Calls the commit API (or directly inserts into committed_data) with the correct data_type

```bash
# Create the re-import script
cat > ~/spm-platform/web/scripts/reimport-mbc-data.ts << 'SCRIPT_EOF'
// OB-116: Re-import MBC data through fixed pipeline
// This script reads the Caribe CSV files and commits them to Supabase
// with the correct data_type from OB-115's fix

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// ... CC fills in the implementation based on the API shape diagnostic
SCRIPT_EOF
```

**The key requirement:** committed_data rows must have `data_type` set to a meaningful value derived from the filename or AI classification — NOT "Sheet1".

### 3D: If files are NOT available — direct SQL migration

If the CSV files aren't in the repo, we can alternatively fix the EXISTING committed_data by updating data_type based on import_batch file names:

```sql
-- This approach updates existing data without re-importing
-- Match committed_data to import_batches to get original filename
-- Then derive data_type from filename

-- First, check what import_batches we have
SELECT ib.id, ib.file_name, COUNT(cd.id) as data_rows
FROM import_batches ib
LEFT JOIN committed_data cd ON cd.import_batch_id = ib.id
WHERE ib.tenant_id = 'fa6a48c5-56dc-416d-9b7d-9c93d4882251'
GROUP BY ib.id, ib.file_name;
```

If import_batches still link to committed_data (they would if committed_data has import_batch_id), update data_type based on the original filename:

```bash
cd ~/spm-platform/web
npx tsx --env-file=.env.local -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const tenantId = 'fa6a48c5-56dc-416d-9b7d-9c93d4882251';

// Get import batches with filenames
const { data: batches } = await sb.from('import_batches')
  .select('id, file_name')
  .eq('tenant_id', tenantId);

if (!batches || batches.length === 0) {
  console.log('No import batches found — data was already cleared in Phase 2.');
  console.log('Re-import requires the original CSV files. Document and stop.');
  process.exit(0);
}

// Map filename to semantic data_type
const filenameToType = (name) => {
  if (!name) return 'unknown';
  const lower = name.toLowerCase();
  if (lower.includes('deposit')) return 'deposit_balance';
  if (lower.includes('insurance') || lower.includes('referral')) return 'insurance_referral';
  if (lower.includes('default')) return 'loan_default';
  if (lower.includes('disbursement')) return 'loan_disbursement';
  if (lower.includes('mortgage') || lower.includes('closing')) return 'mortgage_closing';
  if (lower.includes('personnel') || lower.includes('roster')) return 'personnel';
  return name.replace(/\.csv$|\.xlsx?$/i, '').replace(/[^a-z0-9]/gi, '_');
};

for (const batch of batches) {
  const newType = filenameToType(batch.file_name);
  const { count } = await sb.from('committed_data')
    .update({ data_type: newType })
    .eq('import_batch_id', batch.id)
    .select('*', { count: 'exact', head: true });
  console.log(batch.file_name, '→', newType, '(' + (count || 0) + ' rows updated)');
}
"
```

**IMPORTANT:** Phase 2 already cleared committed_data. If the data was deleted, we can't update it — we need to re-import. Document which path was taken.

### 3E: Verify committed_data state after re-import

```bash
cd ~/spm-platform/web
npx tsx --env-file=.env.local -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const tenantId = 'fa6a48c5-56dc-416d-9b7d-9c93d4882251';

// Check data_types
const { data } = await sb.from('committed_data').select('data_type').eq('tenant_id', tenantId);
const types = {};
data?.forEach(r => { types[r.data_type] = (types[r.data_type] || 0) + 1; });
console.log('=== COMMITTED DATA TYPES AFTER RE-IMPORT ===');
Object.entries(types).forEach(([k, v]) => console.log('  ' + k + ':', v, 'rows'));
console.log('Total rows:', data?.length);
console.log('');
console.log('CRITICAL CHECK: Is Sheet1 gone?', Object.keys(types).includes('Sheet1') ? '✗ STILL PRESENT' : '✓ GONE');
"
```

### Proof Gate

| # | Gate | How CC Verifies | Evidence Required |
|---|------|----------------|-------------------|
| PG-08 | CSV files located OR migration path documented | find/ls output | Paste file paths or document absence |
| PG-09 | Re-import executed (API, script, or migration) | Script output | Paste execution results |
| PG-10 | committed_data has meaningful data_types | Type breakdown query | Paste — no "Sheet1" |
| PG-11 | Total row count matches baseline (~1,661) | Count query | Paste count |

**Commit:** `OB-116 Phase 3: MBC data re-imported with correct data_types`

---

## PHASE 4: RUN CALCULATION (20 min)

### 4A: Trigger calculation via API

Find the calculation trigger endpoint:

```bash
echo "=== CALCULATION API ROUTES ==="
find web/src/app/api -path "*calc*" -name "route.ts" | sort
echo ""
echo "=== CALCULATION TRIGGER LOGIC ==="
grep -rn "runCalculation\|triggerCalculation\|calculateBatch\|startCalculation" web/src/app/api/ --include="*.ts" | head -15
echo ""
echo "=== RUN-CALCULATION ENTRY POINT ==="
head -50 web/src/lib/calculation/run-calculation.ts
```

### 4B: Run calculation for each active rule set × period

```bash
cd ~/spm-platform/web
npx tsx --env-file=.env.local -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const tenantId = 'fa6a48c5-56dc-416d-9b7d-9c93d4882251';

// Get active rule sets
const { data: ruleSets } = await sb.from('rule_sets')
  .select('id, name').eq('tenant_id', tenantId).eq('status', 'active').order('name');
console.log('Active rule sets:', ruleSets?.map(r => r.name));

// Get periods
const { data: periods } = await sb.from('periods')
  .select('id, label').eq('tenant_id', tenantId).order('start_date');
console.log('Periods:', periods?.map(p => p.label));

// Try to import and call run-calculation directly
// The shape depends on how run-calculation.ts exports its functions
console.log('\\nReady to calculate. Finding the trigger mechanism...');
"
```

Then find and call the calculation:

```bash
echo "=== HOW DOES THE UI TRIGGER CALCULATION? ==="
grep -rn "calculate\|runCalc\|trigger" web/src/app/operate/calculate/page.tsx web/src/app/admin/launch/calculate/page.tsx 2>/dev/null | head -20
echo ""
echo "=== API ENDPOINT FOR CALCULATION ==="
grep -rn "POST\|handler\|export" web/src/app/api/calculate/route.ts 2>/dev/null | head -20
```

Call the calculation endpoint (adapt based on what the diagnostic finds):

```bash
# Try calling the calculate API
curl -X POST http://localhost:3000/api/calculate \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "fa6a48c5-56dc-416d-9b7d-9c93d4882251",
    "periodId": "[PERIOD_ID_FROM_ABOVE]",
    "ruleSetId": "[MORTGAGE_RULE_SET_ID]"
  }' 2>&1 | head -50
```

Run calculation for EACH rule set × period combination. Start with the Mortgage Origination plan since that's the one CLT-113 traced ($0.00 because `quarterly_mortgage_origination_volume` was undefined).

### 4C: Check calculation results

```bash
cd ~/spm-platform/web
npx tsx --env-file=.env.local -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const tenantId = 'fa6a48c5-56dc-416d-9b7d-9c93d4882251';

// Get calculation results
const { data: results } = await sb.from('calculation_results')
  .select('entity_id, total_payout, components, metrics')
  .eq('tenant_id', tenantId)
  .order('total_payout', { ascending: false })
  .limit(10);

console.log('=== CALCULATION RESULTS ===');
console.log('Total results:', results?.length);

if (!results || results.length === 0) {
  console.log('NO RESULTS — calculation may not have run or produced no output');
} else {
  const nonZero = results.filter(r => r.total_payout > 0);
  console.log('Non-zero payout results:', nonZero.length);
  console.log('');
  results.forEach(r => {
    console.log('Entity:', r.entity_id?.substring(0, 8), '→ Total payout:', r.total_payout);
    if (r.components) {
      console.log('  Components:', JSON.stringify(r.components)?.substring(0, 200));
    }
    if (r.metrics) {
      console.log('  Metrics:', JSON.stringify(r.metrics)?.substring(0, 200));
    }
  });
}

// Aggregate
const { data: agg } = await sb.from('calculation_results')
  .select('total_payout')
  .eq('tenant_id', tenantId);

const totalPayout = agg?.reduce((sum, r) => sum + (r.total_payout || 0), 0);
console.log('\\n=== AGGREGATE ===');
console.log('Total payout across all entities:', totalPayout);
console.log('Is non-zero?', totalPayout > 0 ? '✓ YES — PIPELINE WORKS' : '✗ NO — STILL \$0.00');
"
```

### 4D: If still $0.00 — diagnose Layer 3

If the calculation still produces $0.00, the semantic binding gap (Layer 3) is confirmed. Trace exactly what happens:

```bash
cd ~/spm-platform/web
npx tsx --env-file=.env.local -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const tenantId = 'fa6a48c5-56dc-416d-9b7d-9c93d4882251';

// Check what the engine sees
const { data: rs } = await sb.from('rule_sets')
  .select('name, input_bindings, components')
  .eq('tenant_id', tenantId).eq('status', 'active')
  .eq('name', 'Mortgage Origination Bonus Plan 2024')
  .single();

console.log('=== MORTGAGE PLAN — ENGINE INPUT ===');
console.log('input_bindings:', JSON.stringify(rs?.input_bindings, null, 2));
console.log('');

// Check what committed_data looks like for mortgage type
const { data: cd } = await sb.from('committed_data')
  .select('data_type, row_data')
  .eq('tenant_id', tenantId)
  .ilike('data_type', '%mortgage%')
  .limit(3);

console.log('=== COMMITTED DATA (mortgage type) ===');
console.log('Rows found:', cd?.length);
cd?.forEach(r => {
  console.log('  data_type:', r.data_type);
  console.log('  row_data keys:', Object.keys(r.row_data || {}));
});

// Check what the engine expects vs what exists
const components = rs?.components;
if (Array.isArray(components)) {
  components.forEach(c => {
    const metric = c.tierConfig?.metric || c.metric || 'UNKNOWN';
    console.log('\\nComponent expects metric:', metric);
    console.log('input_bindings maps to:', rs?.input_bindings?.[metric] || 'NOT MAPPED');
    
    // Check if the mapped field exists in committed_data
    const mappedField = rs?.input_bindings?.[metric]?.data_field;
    if (mappedField && cd?.length > 0) {
      const hasField = cd[0].row_data?.hasOwnProperty(mappedField);
      console.log('Data field', mappedField, 'exists in row_data?', hasField ? '✓' : '✗');
    }
  });
}
"
```

This will tell us exactly where the chain breaks:
- Are input_bindings populated? (If not, OB-115 Phase 2 didn't work)
- Does committed_data have the right data_type? (If not, re-import didn't work)
- Does the engine USE input_bindings? (If not, run-calculation.ts needs modification)
- Does the mapped field exist in row_data? (If not, the binding is wrong)

### Proof Gate

| # | Gate | How CC Verifies | Evidence Required |
|---|------|----------------|-------------------|
| PG-12 | Calculation triggered for at least 1 rule set × period | API call or script output | Paste execution result |
| PG-13 | Calculation results exist in database | Count query | Paste count |
| PG-14 | Total payout documented (zero or non-zero) | Aggregate query | Paste total |
| PG-15 | If $0.00: specific binding chain break identified | Diagnostic output | Paste trace showing where it fails |

**Commit:** `OB-116 Phase 4: Calculation executed — results documented`

---

## PHASE 5: TRUTH REPORT AND COMPLETION (15 min)

### 5A: Write OB-116 completion report

Create `OB-116_COMPLETION_REPORT.md` at project root:

```markdown
# OB-116 COMPLETION REPORT
## MBC Re-Import and Calculation Proof
## Date: [today]
## PR: #[number]

### Objective
Re-import MBC data through OB-114/115-fixed pipeline and prove whether calculation produces non-zero results.

### Results

| Metric | Before (CLT-113) | After (OB-116) |
|--------|-------------------|-----------------|
| committed_data.data_type | "Sheet1" (all rows) | [new types] |
| input_bindings | NULL (all rule sets) | [populated/still NULL] |
| Calculation total_payout | $0.00 | [new value or $0.00] |
| Non-zero results | 0 of 25 | [count] |

### If Non-Zero: What Fixed It
[Document which fix (data_type, input_bindings, or both) enabled the engine to find data]

### If Still $0.00: What's Still Missing
[Document exact binding chain break from Phase 4D diagnostic]
[Specify what Layer 3 semantic resolution needs to do]
[This becomes the design brief for Decision 64]

### Import Path Used
[API re-import / script / SQL migration — document which approach and why]

### Files Modified
[List — likely just the re-import script if any code changes]

### Commits
[List all]
```

### 5B: Create PR

```bash
gh pr create --base main --head dev --title "OB-116: MBC Re-Import and Calculation Proof — [RESULT]" --body "Re-imported MBC data through OB-114/115-fixed pipeline. [RESULT]. See OB-116_COMPLETION_REPORT.md for full diagnostic."
```

Replace `[RESULT]` with either:
- "Non-zero calculation achieved — pipeline works end-to-end"
- "$0.00 persists — Layer 3 semantic binding design needed"

### Proof Gate

| # | Gate | How CC Verifies | Evidence Required |
|---|------|----------------|-------------------|
| PG-16 | Completion report at project root | ls output | Paste |
| PG-17 | Report includes before/after comparison | Content check | Paste relevant section |
| PG-18 | If $0.00: Layer 3 gap precisely documented | Binding trace included | Paste |
| PG-19 | PR created with accurate title | gh pr output | Paste PR URL |

**Commit:** `OB-116 Phase 5: Completion report and PR`

---

## PROOF GATE SUMMARY

| # | Gate | Phase |
|---|------|-------|
| PG-01 | OB-114/115 commits present | 0 |
| PG-02 | Critical fixes verified in code | 0 |
| PG-03 | Baseline state documented | 1 |
| PG-04 | committed_data cleared | 2 |
| PG-05 | calculation_results cleared | 2 |
| PG-06 | calculation_batches cleared | 2 |
| PG-07 | Structural data preserved | 2 |
| PG-08 | CSV files located or absence documented | 3 |
| PG-09 | Re-import executed | 3 |
| PG-10 | data_types meaningful (no "Sheet1") | 3 |
| PG-11 | Row count matches baseline | 3 |
| PG-12 | Calculation triggered | 4 |
| PG-13 | Results exist in DB | 4 |
| PG-14 | Total payout documented | 4 |
| PG-15 | If $0.00: binding break identified | 4 |
| PG-16 | Completion report exists | 5 |
| PG-17 | Before/after comparison included | 5 |
| PG-18 | Layer 3 gap documented if needed | 5 |
| PG-19 | PR created | 5 |

**Total: 5 phases, 19 proof gates.**

---

## WHAT SUCCESS LOOKS LIKE

**Best case:** MBC calculation produces non-zero payouts for at least one rule set. This proves OB-114 + OB-115 + OB-116 fixed the pipeline end-to-end.

**Expected case:** Some plans produce non-zero (where input_bindings → data field mapping is direct), others produce $0.00 (where semantic resolution still can't bridge metric names to data fields). This narrows the remaining gap.

**Worst case:** Still $0.00 across the board, but now we know EXACTLY where the chain breaks — the diagnostic in Phase 4D provides the precise design brief for Decision 64's semantic binding layer.

**In all cases, this OB produces value.** Either we prove the fix works, or we produce the exact specification for what's still needed. No more guessing.

---

## COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `OB-116_COMPLETION_REPORT.md` in PROJECT ROOT
- Created BEFORE final build verification
- Contains VERBATIM proof gate criteria with PASS/FAIL and PASTED evidence
- Committed to git as part of the batch

---

*"The test of a fix isn't whether the code looks right. It's whether the number changes."*
*Vialuce.ai — Intelligence. Acceleration. Performance.*
