# OB-115: SEMANTIC PIPELINE FIXES — DATA TYPE TAGGING + INPUT BINDINGS + ROUTING
## Target: alpha.3.0
## Date: February 28, 2026
## Derived From: CLT-113 Truth Report (T-15, T-14, T-07, T-01)
## Depends On: OB-114 merged (confidence fix, active filter, duplicate plan archived)

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules apply
2. `SCHEMA_REFERENCE.md` — authoritative column reference
3. `CLT-113_TRUTH_REPORT.md` — root causes T-13 through T-18
4. `CLT-113_DATABASE_TRUTH.md` — MBC database state

**Read all four before writing any code.**

---

## WHAT THIS OB SOLVES

OB-114 fixed the trivial display issues (confidence, labels, duplicate plan, fake preview). This OB attacks the **pipeline data problems** — the reasons MBC calculation produces $0.00.

CLT-113 identified a three-layer failure chain:

```
LAYER 1: All CSVs get data_type "Sheet1" (T-15)
  → The engine can't distinguish deposit data from mortgage data
  
LAYER 2: input_bindings is NULL on all MBC rule sets (T-14)
  → The engine doesn't know which data fields feed which plan components

LAYER 3: Semantic metric names don't match data field names (T-13)
  → "quarterly_mortgage_origination_volume" ≠ "LoanAmount"
```

This OB fixes Layers 1 and 2. Layer 3 (full semantic resolution) is architectural and needs a design session — but fixing Layers 1 and 2 gets us significantly closer and may enable calculation for simpler binding cases.

Additionally, this OB makes a data decision for Sabor routing (T-01).

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
3. Final step: `gh pr create --base main --head dev`
4. **Commit this prompt to git as first action.**
5. **Git from repo root (spm-platform), NOT web/.**
6. Supabase `.in()` calls MUST batch ≤200 items per call.
7. **Every proof gate requires pasted evidence — no self-attestation.**

---

## PHASE 0: DIAGNOSTIC — UNDERSTAND THE CURRENT CHAIN (15 min)

Before changing anything, trace the full path from file upload to calculation to understand exactly where data_type is set and where input_bindings is read.

### 0A: Trace data_type assignment in the import commit

```bash
echo "=== WHERE IS data_type SET ON committed_data? ==="
grep -n "data_type" web/src/app/api/import/commit/route.ts
echo ""
echo "=== WHAT VALUES DOES data_type GET? ==="
grep -B5 -A5 "data_type" web/src/app/api/import/commit/route.ts | head -40
```

Document:
- What value does `data_type` currently get when committing CSV files?
- Where does that value come from? (XLSX.js sheet name? A variable? A constant?)
- Is the AI classification result available at commit time?

### 0B: Trace where AI classification is stored and available

```bash
echo "=== AI CLASSIFICATION RESULTS ==="
grep -rn "classification\|classif\|matchedComponent\|sheetType" web/src/app/api/analyze-workbook/ --include="*.ts" | head -20
echo ""
echo "=== CLASSIFICATION IN ENHANCED PAGE ==="
grep -n "classification\|classif\|sheetType\|fileType" web/src/app/data/import/enhanced/page.tsx | head -30
```

Document:
- After AI analyzes files, where is the classification stored? (In component state? In a variable? In the analysis response?)
- Is classification available when the commit step runs?
- What does the classification look like? (e.g., `{type: "component_data", matchedComponent: "Mortgage Origination Bonus"}`)

### 0C: Trace input_bindings in the calculation engine

```bash
echo "=== WHERE DOES THE ENGINE READ input_bindings? ==="
grep -n "input_bindings\|inputBindings\|input_binding" web/src/lib/calculation/run-calculation.ts | head -20
echo ""
echo "=== WHERE DOES metric-resolver USE BINDINGS? ==="
grep -n "input_bindings\|inputBindings\|binding\|metric.*resolve" web/src/lib/calculation/metric-resolver.ts | head -20
echo ""
echo "=== HOW DOES THE ENGINE FIND DATA FOR A COMPONENT? ==="
grep -n "findMatchingSheet\|matchSheet\|getDataForComponent\|dataType\|data_type" web/src/lib/calculation/run-calculation.ts | head -20
```

Document:
- Does the engine actually read `rule_sets.input_bindings`?
- How does `findMatchingSheet` currently work? What does it match on?
- What would the engine do differently if `input_bindings` was populated?

### 0D: Trace plan import — where are components created?

```bash
echo "=== PLAN IMPORT / INTERPRETATION ==="
grep -rn "input_bindings\|tierConfig\|metric.*name\|component.*create" web/src/app/api/ --include="*.ts" | grep -i "plan\|rule" | head -20
echo ""
echo "=== WHERE ARE RULE SETS CREATED/UPDATED? ==="
grep -rn "\.from('rule_sets').*insert\|\.from('rule_sets').*update\|\.from('rule_sets').*upsert" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v .next | head -15
```

Document:
- When the AI interprets a plan document and creates rule_sets, does it populate input_bindings?
- What metric names does it generate in components? (e.g., `quarterly_mortgage_origination_volume`)
- Where in the plan import flow would input_bindings be set?

### 0E: Examine existing MBC rule set structure

```bash
cd ~/spm-platform/web
npx tsx --env-file=.env.local -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await sb
  .from('rule_sets')
  .select('name, input_bindings, components')
  .eq('tenant_id', 'fa6a48c5-56dc-416d-9b7d-9c93d4882251')
  .eq('status', 'active')
  .order('name');
data?.forEach(rs => {
  console.log('\\n===', rs.name, '===');
  console.log('input_bindings:', JSON.stringify(rs.input_bindings));
  const comps = rs.components;
  if (Array.isArray(comps)) {
    comps.forEach(c => {
      console.log('  Component:', c.name || c.type, '→ metric:', c.tierConfig?.metric || c.metric || 'NONE');
    });
  } else {
    console.log('  components:', JSON.stringify(comps)?.substring(0, 200));
  }
});
"
```

This reveals:
- What metric names the engine expects per component
- The exact structure of the components JSONB
- Whether input_bindings is truly NULL or just empty

### 0F: Commit diagnostic

Write findings to `OB-115_ARCHITECTURE_DECISION.md` at project root:

```
ARCHITECTURE DECISION RECORD — OB-115
======================================
Problem: MBC calculation produces $0.00 because:
  1. committed_data.data_type = "Sheet1" for all CSVs (T-15)
  2. rule_sets.input_bindings = NULL (T-14)
  3. Engine metric names don't match data field names (T-13)

DIAGNOSTIC FINDINGS:
- data_type set at: [file:line] — value comes from: [source]
- AI classification available at commit time: [yes/no — where]
- Engine reads input_bindings at: [file:line]
- findMatchingSheet logic: [description of current matching]
- Component metric names: [list from DB query]
- Plan import sets input_bindings at: [file:line or "never"]

APPROACH:
Fix 1 (data_type): Tag committed_data with AI classification instead of XLSX.js sheet name
Fix 2 (input_bindings): Populate from component metric definitions during plan import or as a migration
Fix 3 (Sabor routing): Archive ICM rule sets that aren't real plans

CHOSEN: All three — they're independent fixes on different files.
```

**Commit:** `OB-115 Phase 0: Architecture decision — semantic pipeline diagnostic`

---

## PHASE 1: TAG COMMITTED DATA WITH AI CLASSIFICATION (20 min)

### What CLT-113 Found

**T-15:** All CSVs get `data_type: "Sheet1"` because the import commit route uses the XLSX.js sheet name. For CSV files, XLSX.js always defaults to "Sheet1."

**T-16:** The calculation engine's `findMatchingSheet` tries to fuzzy-match data_type against component names. "Sheet1" doesn't match "Mortgage Origination Bonus" → the engine can't find the data.

### What to Change

**File:** `web/src/app/api/import/commit/route.ts` (or wherever committed_data rows are inserted)

Currently, when inserting committed_data rows, the code uses the XLSX.js sheet name as `data_type`. Instead, it should use the AI classification result.

The AI classification is available in the analysis response — each sheet/file gets a classification like `"component_data"` and possibly a `matchedComponent` or `classification` field that identifies what the data represents.

**Implementation approach:**

1. Find where `data_type` is set in the commit route
2. Find where the AI classification result is available (it should be passed from the client through the commit request body, or stored in the analysis state)
3. Replace the XLSX.js sheet name with the AI classification

If the AI classification doesn't include a meaningful data type beyond "component_data", use the **filename** instead. For MBC, filenames like "CFG_Deposit_Balances_Q1_2024.csv" contain semantic information that "Sheet1" does not. The filename is a better fallback than the XLSX.js default.

**Priority order for data_type value:**
1. AI's `matchedComponent` or specific classification (best)
2. AI's `classification` category (good)
3. Original filename without extension (acceptable fallback)
4. "Sheet1" (NEVER — this is the bug)

### Acceptance Test

After making the change, verify by examining the code:

```bash
echo "=== VERIFY: data_type no longer uses sheet name for CSVs ==="
grep -n "data_type" web/src/app/api/import/commit/route.ts
echo ""
echo "=== VERIFY: classification or filename used instead ==="
grep -B3 -A3 "data_type" web/src/app/api/import/commit/route.ts
```

Then verify the data impact — MBC's existing committed_data won't change (data already committed), but NEW imports will use the correct data_type.

### Proof Gate

| # | Gate | How CC Verifies | Evidence Required |
|---|------|----------------|-------------------|
| PG-01 | data_type assignment no longer uses XLSX.js sheet name for CSV files | grep of commit route showing new logic | Paste grep output |
| PG-02 | AI classification or filename used as data_type | Code snippet showing the replacement | Paste the new code block |
| PG-03 | Fallback chain documented (AI classification → filename → never "Sheet1") | Comment in code or architecture decision | Paste the comment/code |
| PG-04 | `npm run build` exits 0 | Build output | Paste last 3 lines |

**Commit:** `OB-115 Phase 1: Tag committed_data with AI classification, not XLSX.js sheet name`

---

## PHASE 2: POPULATE INPUT_BINDINGS ON MBC RULE SETS (20 min)

### What CLT-113 Found

**T-14:** `input_bindings` is NULL on all MBC rule sets. The engine expects this JSONB to map semantic metric names to data field patterns. Without it, the engine can't resolve which committed_data fields feed which component calculations.

### What to Change

This has two parts:

**Part A: Fix MBC's existing rule sets (data migration)**

Based on Phase 0E's output, we know what metric names each component expects. We need to create input_bindings that map those metric names to the actual field names in committed_data.

From CLT-113's database truth, MBC's committed_data row_data has keys like:
```
LoanAmount, Term_Months, InterestRate, DisbursementDate, OfficerID, 
TotalDepositBalance, NewAccountsOpened, AccountsClosed, 
MortgageID, ClosingDate, PropertyType, SnapshotDate, SnapshotPeriod
```

For each active rule set, create input_bindings that map component metrics to these actual field names:

```bash
cd ~/spm-platform/web
npx tsx --env-file=.env.local -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const tenantId = 'fa6a48c5-56dc-416d-9b7d-9c93d4882251';

// First, read the components to understand what metrics each plan expects
const { data: ruleSets } = await sb
  .from('rule_sets')
  .select('id, name, components')
  .eq('tenant_id', tenantId)
  .eq('status', 'active')
  .order('name');

ruleSets?.forEach(rs => {
  console.log('\\n===', rs.name, '===');
  console.log('Components:', JSON.stringify(rs.components, null, 2)?.substring(0, 500));
});
"
```

**Paste this output into the Architecture Decision. Then, based on what you see:**

For the **Mortgage Origination Bonus Plan 2024**, if the component expects `quarterly_mortgage_origination_volume`, create input_bindings:

```json
{
  "quarterly_mortgage_origination_volume": {
    "data_field": "LoanAmount",
    "data_type": "CFG_Mortgage_Closings_Q1_2024",
    "aggregation": "sum",
    "semantic_type": "amount"
  }
}
```

For the **Deposit Growth Incentive**, if it expects a deposit metric:

```json
{
  "quarterly_deposit_growth": {
    "data_field": "TotalDepositBalance",
    "data_type": "CFG_Deposit_Balances_Q1_2024",
    "aggregation": "max_minus_min",
    "semantic_type": "balance"
  }
}
```

**CRITICAL:** Do NOT guess the metric names. Read them from the components JSONB in Phase 0E output. Map each metric name to the actual committed_data field name based on semantic meaning.

If you cannot determine the correct mapping from the component structure, document what you found and what information is missing. Do NOT insert incorrect bindings — wrong bindings are worse than NULL bindings.

**Part B: Ensure future plan imports generate input_bindings**

Find where rule_sets are created during plan import:

```bash
grep -rn "from('rule_sets').*insert\|from('rule_sets').*upsert" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v .next
```

At the point where rule_sets are created, check if `input_bindings` is set. If not, add a TODO comment for the architectural fix (full semantic binding layer will be designed separately):

```typescript
// TODO (Decision 64): Plan import should generate input_bindings from AI interpretation.
// Currently NULL — the semantic binding layer will populate this.
// See CLT-113 T-14 and OB-115 Phase 2 diagnostic.
```

### Acceptance Test

```bash
# Verify input_bindings after migration
cd ~/spm-platform/web
npx tsx --env-file=.env.local -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await sb
  .from('rule_sets')
  .select('name, input_bindings')
  .eq('tenant_id', 'fa6a48c5-56dc-416d-9b7d-9c93d4882251')
  .eq('status', 'active')
  .order('name');
data?.forEach(rs => {
  console.log(rs.name, '→ input_bindings:', rs.input_bindings ? 'POPULATED' : 'NULL');
  if (rs.input_bindings) console.log('  ', JSON.stringify(rs.input_bindings));
});
"
```

### Proof Gate

| # | Gate | How CC Verifies | Evidence Required |
|---|------|----------------|-------------------|
| PG-05 | Component metric names documented from DB | Phase 0E query output | Paste component structure |
| PG-06 | input_bindings populated for plans where mapping is determinable | DB query showing non-NULL | Paste query output |
| PG-07 | Bindings map correct metric → correct data field | Binding JSONB matches semantic meaning | Paste bindings with rationale |
| PG-08 | Plans with unclear mapping left as NULL with documentation | Documented what's missing | Paste documentation |
| PG-09 | Future plan import has TODO comment for Decision 64 | grep of TODO | Paste grep output |
| PG-10 | `npm run build` exits 0 | Build output | Paste last 3 lines |

**Commit:** `OB-115 Phase 2: Populate input_bindings for MBC rule sets`

---

## PHASE 3: SABOR ROUTING FIX — DATA DECISION (10 min)

### What CLT-113 Found

**T-01:** Sabor has `financial: true` in features AND 2 active ICM rule sets ("Comision por Ventas - Meseros" and "Indice de Desempeño"). The routing logic checks `hasFinancial && !hasICM` — since Sabor has ICM rule sets, `hasICM = true`, so it falls through to the ICM path and lands on import.

### Design Decision

Sabor's ICM rule sets are **real plans** — "Comision por Ventas" is a server commission plan, "Indice de Desempeño" is a performance index. Sabor IS a dual-module tenant.

But for demo purposes, Sabor's primary identity is as a **Financial module showcase** (restaurant POS data, 47K cheques). The ICM plans were created as part of OB-95 seeding.

**Decision:** Archive Sabor's ICM rule sets so it routes to `/financial` as intended. The rule set data is preserved (archived, not deleted) and can be reactivated later when the platform supports dual-module routing properly.

### Exact Change

```bash
cd ~/spm-platform/web
npx tsx --env-file=.env.local -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const tenantId = '10000000-0001-0000-0000-000000000001';

// Archive Sabor's ICM rule sets
const { data, error } = await sb
  .from('rule_sets')
  .update({ status: 'archived' })
  .eq('tenant_id', tenantId)
  .eq('status', 'active')
  .select('id, name, status');

if (error) { console.error('ERROR:', error); process.exit(1); }
console.log('Archived Sabor rule sets:');
data?.forEach(rs => console.log(' ', rs.name, '→', rs.status));

// Verify: no active rule sets remain
const { count } = await sb
  .from('rule_sets')
  .select('*', { count: 'exact', head: true })
  .eq('tenant_id', tenantId)
  .eq('status', 'active');

console.log('\\nActive rule sets remaining:', count);
console.log('Expected: 0 (Sabor is now financial-only for routing)');
"
```

### Acceptance Test

After archiving, with OB-114's session-context fix in place (active-only count), Sabor's `ruleSetCount` will be 0, making `hasICM = false` and `hasFinancial && !hasICM = true` → routes to `/financial`.

```bash
# Verify via DB
cd ~/spm-platform/web
npx tsx --env-file=.env.local -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { count } = await sb
  .from('rule_sets')
  .select('*', { count: 'exact', head: true })
  .eq('tenant_id', '10000000-0001-0000-0000-000000000001')
  .eq('status', 'active');
console.log('Sabor active rule sets:', count, '(should be 0)');
"
```

### Proof Gate

| # | Gate | How CC Verifies | Evidence Required |
|---|------|----------------|-------------------|
| PG-11 | Sabor rule sets archived | Script output showing archived names | Paste script output |
| PG-12 | Zero active rule sets for Sabor | Count query returns 0 | Paste query output |

**Commit:** `OB-115 Phase 3: Archive Sabor ICM rule sets — financial-only routing`

---

## PHASE 4: SYSTEM-VERIFIED ACCEPTANCE TEST (20 min)

### 4A: Start fresh dev server

```bash
cd ~/spm-platform/web
pkill -f "next dev" 2>/dev/null || true
rm -rf .next && npm run build && npm run dev &
sleep 15
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
```

### 4B: Verify MBC data state

```bash
cd ~/spm-platform/web
npx tsx --env-file=.env.local -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const tenantId = 'fa6a48c5-56dc-416d-9b7d-9c93d4882251';

// Check rule sets
const { data: rs } = await sb.from('rule_sets').select('name, input_bindings, status')
  .eq('tenant_id', tenantId).eq('status', 'active').order('name');
console.log('MBC Active Rule Sets:', rs?.length);
rs?.forEach(r => console.log(' ', r.name, '→ bindings:', r.input_bindings ? 'YES' : 'NULL'));

// Check committed_data data_types
const { data: dt } = await sb.from('committed_data').select('data_type')
  .eq('tenant_id', tenantId).limit(1);
console.log('\\nNote: Existing committed_data still has old data_type.');
console.log('New imports will use AI classification. Verify code change.');
"
```

### 4C: Verify Sabor state

```bash
cd ~/spm-platform/web
npx tsx --env-file=.env.local -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Sabor active rule sets (should be 0)
const { count } = await sb.from('rule_sets').select('*', { count: 'exact', head: true })
  .eq('tenant_id', '10000000-0001-0000-0000-000000000001')
  .eq('status', 'active');
console.log('Sabor active rule sets:', count, '(should be 0 for financial routing)');
"
```

### 4D: Verify code changes

```bash
echo "=== COMMITTED DATA TYPE ASSIGNMENT ==="
grep -n "data_type" web/src/app/api/import/commit/route.ts | head -10
echo ""
echo "=== NO SHEET1 HARDCODED ==="
grep -n "Sheet1" web/src/app/api/import/commit/route.ts
echo "(should be zero matches or only in fallback comments)"
```

### 4E: Final build

```bash
cd ~/spm-platform/web
rm -rf .next && npm run build 2>&1 | tail -5
echo "Exit code: $?"
```

### Proof Gate

| # | Gate | How CC Verifies | Evidence Required |
|---|------|----------------|-------------------|
| PG-13 | Dev server responds 200 | curl output | Paste |
| PG-14 | MBC has 4 active plans with bindings status | DB query | Paste |
| PG-15 | Sabor has 0 active rule sets | DB query | Paste |
| PG-16 | No "Sheet1" hardcoded in commit route | grep output | Paste |
| PG-17 | Final build clean | npm run build exits 0 | Paste last 5 lines |

**Commit:** `OB-115 Phase 4: System-verified acceptance test`

---

## PHASE 5: COMPLETION REPORT + PR (10 min)

### 5A: Write completion report

Create `OB-115_COMPLETION_REPORT.md` at project root:

```markdown
# OB-115 COMPLETION REPORT
## Semantic Pipeline Fixes — Data Type + Input Bindings + Routing
## Date: [today]
## PR: #[number]

### CLT-113 Findings Addressed

| Finding | Root Cause | Fix Applied | Verified |
|---|---|---|---|
| T-15: CSV data_type "Sheet1" | Commit route uses XLSX.js name | AI classification / filename | grep shows new logic |
| T-14: input_bindings NULL | Plan import never populates | Migration for MBC + TODO for future | DB shows populated |
| T-01: Sabor routing to import | ICM rule sets make hasICM=true | Archived ICM rule sets | DB shows 0 active |
| T-16: findMatchingSheet fails | "Sheet1" can't match components | Fixed by T-15 (new data_type) | Code analysis |

### PDR Resolutions

| PDR | Status |
|---|---|
| PDR-02 (Sabor routing) | RESOLVED — financial-only via archived ICM rule sets |

### What's NOT Fixed (Still Requires Design Session)

| Item | Why |
|---|---|
| T-13: Full semantic binding | Architectural — metric name resolution between plan concepts and data fields needs design |
| Existing committed_data | Already committed with "Sheet1" — would need re-import or migration to fix |
| Future plan imports generating bindings | Needs AI to produce bindings during plan interpretation (Decision 64) |

### Files Modified
[List all files]

### Commits
[List all commits]

### System Verification Results
[Paste Phase 4 outputs]
```

### 5B: Create PR

```bash
gh pr create --base main --head dev --title "OB-115: Semantic Pipeline Fixes — Data Type Tagging, Input Bindings, Sabor Routing" --body "CLT-113 truth report execution continued. Fixes T-15 (CSV data_type), T-14 (input_bindings), T-01 (Sabor routing). Import commit now uses AI classification for data_type. MBC rule sets have input_bindings populated. Sabor ICM rule sets archived for financial-only routing."
```

### Proof Gate

| # | Gate | How CC Verifies | Evidence Required |
|---|------|----------------|-------------------|
| PG-18 | Completion report at project root | ls output | Paste |
| PG-19 | PR created | gh pr output | Paste PR URL |

**Commit:** `OB-115 Phase 5: Completion report and PR`

---

## PROOF GATE SUMMARY

| # | Gate | Phase | Type |
|---|------|-------|------|
| PG-01 | data_type no longer uses Sheet1 for CSVs | 1 | grep |
| PG-02 | AI classification or filename used | 1 | code paste |
| PG-03 | Fallback chain documented | 1 | comment paste |
| PG-04 | Build clean after Phase 1 | 1 | build output |
| PG-05 | Component metrics documented from DB | 2 | query output |
| PG-06 | input_bindings populated where determinable | 2 | query output |
| PG-07 | Correct metric → field mapping | 2 | binding JSONB + rationale |
| PG-08 | Unclear mappings documented, not guessed | 2 | documentation |
| PG-09 | TODO comment for Decision 64 | 2 | grep output |
| PG-10 | Build clean after Phase 2 | 2 | build output |
| PG-11 | Sabor rule sets archived | 3 | script output |
| PG-12 | Zero active Sabor rule sets | 3 | query output |
| PG-13 | Dev server responds | 4 | curl output |
| PG-14 | MBC plan + bindings state | 4 | query output |
| PG-15 | Sabor active count = 0 | 4 | query output |
| PG-16 | No Sheet1 hardcoded in commit | 4 | grep output |
| PG-17 | Final build clean | 4 | build output |
| PG-18 | Completion report exists | 5 | ls output |
| PG-19 | PR created | 5 | PR URL |

**Total: 5 phases, 19 proof gates.**
**Every proof gate requires pasted evidence.**

---

## WHAT SUCCESS LOOKS LIKE

After this OB:
1. **New imports tag committed_data with meaningful data_type** — "CFG_Mortgage_Closings" instead of "Sheet1"
2. **MBC rule sets have input_bindings** where mappings are determinable — the engine has a bridge between plan concepts and data fields
3. **Sabor routes to /financial** — PDR-02 resolved after 11 failed routing attempts
4. **The calculation engine can potentially produce non-zero results** for MBC on re-import — though full semantic resolution (Layer 3) still needs the design session

**What this DOES NOT guarantee:** Non-zero MBC calculations. That depends on whether the engine's metric resolution can use the new input_bindings and data_type. A re-import of MBC data after this fix + a calculation run is the test. If it still produces $0.00, the remaining gap is Layer 3 (semantic name resolution) which requires the design session for Decision 64.

---

## COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `OB-115_COMPLETION_REPORT.md` in PROJECT ROOT
- Created BEFORE final build verification
- Contains VERBATIM proof gate criteria with PASS/FAIL and PASTED evidence
- Committed to git as part of the batch

---

*"Layer 1: the engine can distinguish the data. Layer 2: the engine knows what it needs. Layer 3: the engine speaks the data's language."*
*Vialuce.ai — Intelligence. Acceleration. Performance.*
