# OB-75: AI PIPELINE PROOF — ZERO HARDCODING, FULL RECONCILIATION

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST: CC_STANDING_ARCHITECTURE_RULES.md

Before reading further, open and read the COMPLETE file `CC_STANDING_ARCHITECTURE_RULES.md` at the project root. Every decision in this OB must comply with:
- Section A: Design Principles (9 principles — especially #1 AI-First, #2 Scale by Design, #3 Fix Logic Not Data, #7 Prove Don't Describe)
- Section B: Architecture Decision Gate (mandatory BEFORE any implementation code)
- Section C: Anti-Pattern Registry (22 anti-patterns — DO NOT REPEAT ANY)
- Section D: Operational Rules (24 rules)
- Section E: Scale Reference
- Section F: Quick Checklist (run before completion report)

**If you have not read that file, STOP and read it now.**

Also read: `SCHEMA_REFERENCE.md` — the authoritative column reference for every Supabase query. **Every column name you write in this OB MUST come from this file.**

---

## WHY THIS OB EXISTS

OB-74 proved the pipeline connects end-to-end. But it did NOT prove the pipeline works without hardcoding.

**The problem:** `SHEET_COMPONENT_PATTERNS` in `metric-resolver.ts` is a regex dictionary that matches Spanish sheet names to English component names. `findMatchingSheet()` uses these patterns. This is the same anti-pattern as `FIELD_ID_MAPPINGS` — relocated, not eliminated. A Korean tenant with Hangul sheet names would FAIL `findMatchingSheet()`.

**The AI already knows the answer.** During import, the AI:
1. Classifies each sheet (what component it belongs to)
2. Maps each field (what semantic type it represents)
3. Assigns confidence scores

But `storeImportContext()` is a NO-OP (OB-74 finding). The AI's intelligence dies at import time. The calculation engine can't read it, so OB-74 built `SHEET_COMPONENT_PATTERNS` as a bridge — a hardcoded bridge.

**What this OB proves:**
1. AI Import Context persisted to Supabase (not lost after import)
2. `SHEET_COMPONENT_PATTERNS` eliminated — engine reads AI context from DB
3. ALL entities calculated (not LIMIT 1000)
4. ALL entities assigned to rule set (not first 1000)
5. Periods have proper start_date/end_date boundaries
6. Results reconcile against CLT-14B ground truth ($1,253,832 across 719 employees)

---

## ⚠️ CC COMPLIANCE ENFORCEMENT

### VIOLATIONS FROM OB-74 THAT MUST NOT RECUR

**VIOLATION 1: SHEET_COMPONENT_PATTERNS is hardcoding.**
Regex patterns matching Spanish sheet names = language-specific string matching = AP-5/AP-6 violation. Korean Test: FAILS. The AI classified sheets during import. The engine must read those classifications, not re-derive them with patterns.

**VIOLATION 2: Only 1,000 of 22,215 entities assigned.**
`rule_set_assignments` only created for first 1,000 entities. 21,215 entities were never assigned and never calculated. This is not a known issue — it's a pipeline failure.

**VIOLATION 3: 7 phantom periods without proper date boundaries.**
User created 3 periods. System created 7. Periods lack proper `start_date` and `end_date`. Period detection interprets month values without setting date ranges. PERIODS MUST HAVE start_date AND end_date — a defined time range, not a label.

**VIOLATION 4: Summary shows $165K but all entity rows show $0.**
AP-21 (summary vs detail mismatch). The summary reads from batch metadata. The entity detail reads from calculation_results but join fails. Single source of truth required.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000 responds
3. Final step: `gh pr create --base main --head dev` with descriptive title and body
4. **Supabase migrations: execute live AND verify with DB query. File existence ≠ applied.**
5. **Fix logic, not data.** Do not insert test data. Do not provide answer values.
6. **Commit this prompt to git as first action.**
7. Domain-agnostic always. The engine doesn't know it's ICM.
8. Security/scale/performance by design, not retrofitted.
9. **Git commands from repo root (spm-platform), NOT from web/.**

---

## GROUND TRUTH (January 2024, 719 employees)

From CLT-14B Reconciliation Analysis (100% validated):

| Component | Ground Truth | Employees w/Payout | Calc Type | Data Join |
|-----------|-------------|-------------------|-----------|-----------|
| Optical Sales | $748,600 | 620/719 | matrix_lookup | Employee (num_empleado) |
| Store Sales | $116,250 | 362/719 | tier_lookup | Store (No_Tienda) → Employee |
| New Customers | $39,100 | 141/719 | tier_lookup | Store (No_Tienda) → Employee |
| Collections | $283,000 | 710/719 | tier_lookup | Store (No_Tienda) → Employee |
| Club Protection | $10 | 2/719 | conditional_% | Employee (num_empleado) |
| Warranty | $66,872 | 8/719 | flat_% (4%) | Employee (Vendedor) |
| **TOTAL** | **$1,253,832** | **719** | | |

**Target accuracy:** ≥95% of ground truth ($1,191,140+). Per-component variance ≤10%.

**NOTE: Do NOT hardcode these values. Do NOT use them as answer keys. The engine must derive correct results from the plan document and source data. These values exist ONLY for reconciliation comparison AFTER calculation.**

---

## PHASE 0: DIAGNOSTIC — READ BEFORE ANY CODE

### 0A: Map the current AI Import Context flow

```bash
echo "=== WHERE AI IMPORT CONTEXT IS CREATED ==="
grep -rn "storeImportContext\|aiImportContext\|ai_import_context\|import_context" \
  src/app/data/import/enhanced/page.tsx | head -20

echo ""
echo "=== THE storeImportContext FUNCTION ==="
grep -n -A 30 "function storeImportContext\|const storeImportContext\|storeImportContext =" \
  src/app/data/import/enhanced/page.tsx | head -40

echo ""
echo "=== WHERE AI CONTEXT IS READ BY CALCULATION ==="
grep -rn "aiImportContext\|ai_import_context\|import_context\|SHEET_COMPONENT_PATTERNS\|findMatchingSheet" \
  src/lib/calculation/run-calculation.ts \
  src/lib/orchestration/metric-resolver.ts \
  src/app/api/calculation/run/route.ts | head -30

echo ""
echo "=== WHAT DATA THE AI PRODUCES AT IMPORT TIME ==="
grep -n "matchedComponent\|componentMatch\|sheetClassification\|sheetAnalysis" \
  src/app/data/import/enhanced/page.tsx | head -20
```

**Document findings before proceeding.**

### 0B: Map the entity assignment flow

```bash
echo "=== WHERE RULE_SET_ASSIGNMENTS ARE CREATED ==="
grep -rn "rule_set_assignments\|createAssignment\|assignEntities" \
  src/app/api/ src/lib/ --include="*.ts" | head -20

echo ""
echo "=== ANY LIMIT ON ASSIGNMENT COUNT ==="
grep -rn "LIMIT\|limit\|\.slice\|\.splice\|take\|first.*1000" \
  src/app/api/calculation/run/route.ts \
  src/app/api/import/ --include="*.ts" | head -20
```

### 0C: Map the period creation flow

```bash
echo "=== WHERE PERIODS ARE CREATED ==="
grep -rn "INSERT.*periods\|periods.*insert\|createPeriod\|detectPeriod" \
  src/app/api/ src/lib/ --include="*.ts" | head -20

echo ""
echo "=== PERIOD START_DATE AND END_DATE USAGE ==="
grep -rn "start_date\|end_date\|startDate\|endDate" \
  src/app/api/import/ src/lib/ --include="*.ts" | head -20
```

### 0D: Map the calculation result display flow

```bash
echo "=== HOW ENTITY RESULTS ARE DISPLAYED ==="
grep -rn "calculation_results.*select\|total_payout\|components.*jsonb" \
  src/app/operate/calculate/ --include="*.tsx" --include="*.ts" | head -20

echo ""
echo "=== HOW SUMMARY TOTAL IS COMPUTED ==="
grep -rn "summary\|totalPayout\|SUM\|aggregate" \
  src/app/operate/calculate/ --include="*.tsx" --include="*.ts" | head -20
```

**Commit:** `OB-75 Phase 0: Pipeline diagnostic`

---

## PHASE 1: ARCHITECTURE DECISION (MANDATORY)

Based on Phase 0 findings, fill in this Architecture Decision Record:

```
ARCHITECTURE DECISION RECORD
============================

PROBLEM 1: AI Import Context lost after import — storeImportContext is a NO-OP
  Option A: Persist AI context to import_batches.metadata JSONB
    - Scale: Yes (one JSON blob per batch) ___
    - AI-first: Yes (stores AI decisions) ___
    - Atomicity: Stored with batch in same transaction ___
  Option B: Create new table ai_import_context
    - Scale: Yes ___
    - AI-first: Yes ___
    - Atomicity: Separate insert, could orphan ___
  Option C: Persist in committed_data row_data (already partially done)
    - Scale: Yes (already stored per row) ___
    - AI-first: Yes ___
    - Atomicity: Already in commit flow ___
  CHOSEN: ___ because ___

PROBLEM 2: SHEET_COMPONENT_PATTERNS hardcodes sheet→component mapping
  Option A: Read sheet→component mapping from import_batches.metadata
    - Korean Test: PASSES (AI determines mapping, not code) ___
    - Scale: One DB read per calculation ___
  Option B: Read from committed_data data_type column per row
    - Korean Test: PASSES ___
    - Scale: Needs GROUP BY data_type, more complex ___
  CHOSEN: ___ because ___

PROBLEM 3: Only 1,000 entities assigned
  Option A: Assign all entities in import commit flow
    - Scale: Bulk insert all assignments in one operation ___
  Option B: Assign on calculation run (lazy assignment)
    - Scale: Assignment at calc time, could slow first run ___
  CHOSEN: ___ because ___

PROBLEM 4: Periods lack start_date/end_date
  Option A: Period detector sets date boundaries from data
    - Set start_date = first day of detected month, end_date = last day ___
  Option B: User creates periods manually, import maps to existing
    - Import matches data dates to user-defined periods ___
  CHOSEN: ___ because ___
```

**Commit:** `OB-75 Phase 1: Architecture decisions`

---

## MISSION 1: PERSIST AI IMPORT CONTEXT (The Foundation)

### What Must Happen

When the Enhanced Import commits data, the AI's sheet classifications and field mappings must be persisted to Supabase — NOT just logged to console.

### 1A: Fix storeImportContext

The function exists but is a NO-OP. Wire it to persist:

**Per-sheet context to persist (in import_batches.metadata or equivalent):**
```json
{
  "ai_context": {
    "sheets": [
      {
        "sheetName": "Base_Venta_Individual",
        "matchedComponent": "optical_sales_certified",
        "componentConfidence": 0.95,
        "fieldMappings": [
          { "sourceColumn": "num_empleado", "semanticType": "entityId", "confidence": 1.0 },
          { "sourceColumn": "Cumplimiento", "semanticType": "attainment", "confidence": 1.0 },
          { "sourceColumn": "Venta_Individual", "semanticType": "amount", "confidence": 1.0 },
          { "sourceColumn": "Meta_Individual", "semanticType": "goal", "confidence": 1.0 }
        ],
        "dataJoinType": "employee",
        "entityIdColumn": "num_empleado"
      }
    ]
  }
}
```

This is the AI's determination. The calculation engine reads this instead of `SHEET_COMPONENT_PATTERNS`.

### 1B: Persist ALL source columns (Carry Everything, Express Contextually)

Currently, unmapped fields are dropped at import. Fix: ALL columns from source file flow to committed_data row_data JSONB. Mapped fields get semantic type tags. Unmapped fields stored with original column names only. Nothing is dropped. Nothing is "Ignored."

This supports:
- Future plan changes requiring previously unmapped fields
- Sandbox scenarios testing alternate metric selections
- Audit trail back to original source data
- Reconciliation cross-referencing

### 1C: Verify persistence

```bash
echo "=== VERIFY AI CONTEXT PERSISTED ==="
# After import, query import_batches for the Pipeline Test Co batch
# Verify metadata contains ai_context with sheet classifications and field mappings
```

**Proof gates:**
- PG-1: import_batches.metadata contains ai_context with sheet→component mappings
- PG-2: committed_data row_data contains ALL original columns (not just mapped ones)

**Commit:** `OB-75 Mission 1: Persist AI Import Context to Supabase`

---

## MISSION 2: ELIMINATE SHEET_COMPONENT_PATTERNS (The Korean Test)

### What Must Happen

Remove `SHEET_COMPONENT_PATTERNS` from the calculation path. Replace `findMatchingSheet()` with a function that reads the persisted AI context.

### 2A: Create getSheetComponentMapping()

New function in `run-calculation.ts` or `metric-resolver.ts`:

```typescript
async function getSheetComponentMapping(tenantId: string, batchId: string): Promise<Map<string, string>> {
  // Read from import_batches.metadata.ai_context.sheets
  // Returns Map<componentName, sheetName> as determined by AI
  // ZERO hardcoded patterns
}
```

### 2B: Replace findMatchingSheet() calls

Every call to `findMatchingSheet()` that uses `SHEET_COMPONENT_PATTERNS` must be replaced with a lookup against the persisted AI context.

### 2C: Remove SHEET_COMPONENT_PATTERNS from exports

If `SHEET_COMPONENT_PATTERNS` is no longer used in the calculation path, remove the export. If it's still used for fallback/diagnostics, mark it clearly as deprecated and ensure the calculation path NEVER reads it.

### 2D: Korean Test verification

```bash
echo "=== KOREAN TEST: VERIFY ZERO HARDCODED PATTERNS IN CALC PATH ==="
grep -rn "SHEET_COMPONENT_PATTERNS\|findMatchingSheet" \
  src/lib/calculation/run-calculation.ts \
  src/app/api/calculation/run/route.ts
# Expected: 0 matches

echo ""
echo "=== VERIFY ENGINE READS AI CONTEXT ==="
grep -rn "ai_context\|getSheetComponentMapping\|import_batches.*metadata" \
  src/lib/calculation/run-calculation.ts \
  src/app/api/calculation/run/route.ts
# Expected: 1+ matches
```

**Proof gates:**
- PG-3: `SHEET_COMPONENT_PATTERNS` not referenced in calculation path (grep = 0)
- PG-4: Calculation reads sheet→component mapping from Supabase AI context
- PG-5: Korean Test: zero language-specific strings in calculation resolution path

**Commit:** `OB-75 Mission 2: Replace SHEET_COMPONENT_PATTERNS with AI context lookup`

---

## MISSION 3: FULL ENTITY COVERAGE (All 22,215 Entities)

### What Must Happen

ALL entities imported must be assigned to the rule set and calculated. Not 1,000. All of them.

### 3A: Fix rule_set_assignment to cover all entities

Trace the assignment creation code. Find the LIMIT or .slice(0, 1000) that caps at 1,000. Remove it. Bulk insert assignments for ALL entities in a single operation (AP-4: no sequential per-entity calls).

### 3B: Fix calculation to process all entities

The calculation run must process all assigned entities. If there's a batch size limit for performance, implement pagination — calculate in chunks of 5,000, not a hard cap of 1,000.

### 3C: Verify entity count

```sql
-- After fix, verify:
SELECT COUNT(*) FROM rule_set_assignments 
WHERE tenant_id = 'f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd';
-- Expected: 22,215 (not 1,000)

SELECT COUNT(*) FROM calculation_results
WHERE batch_id = '<new_batch_id>';
-- Expected: 22,215 (or however many entities exist for the selected period)
```

**Note on expected entity count for January 2024:** The ground truth has 719 employees for January. The import created 22,215 entities across ALL periods (Jan-Jul). For a single period calculation, the engine should calculate entities that have data for that period. This may be ~719 for January, not 22,215. The key fix is removing the arbitrary 1,000 cap — the engine should process ALL entities that have data for the selected period.

**Proof gates:**
- PG-6: rule_set_assignments count matches entity count (no arbitrary cap)
- PG-7: calculation_results count ≥ 719 for January 2024 period
- PG-8: Entity detail rows show actual payout values (not all $0 — AP-21 fix)

**Commit:** `OB-75 Mission 3: Full entity assignment and calculation coverage`

---

## MISSION 4: PERIOD ACCURACY (Start/End Date Boundaries)

### What Must Happen

Periods MUST have proper `start_date` and `end_date` values. Not just a label. Not just a canonical_key.

### 4A: Fix period detector

When the period detector identifies "January 2024" from data:
- `start_date` = `2024-01-01`
- `end_date` = `2024-01-31`
- `canonical_key` = `2024-01`
- `label` = `January 2024` (display only)

For non-calendar periods (future), the user defines date ranges. For auto-detected periods, use first and last day of the month/quarter.

### 4B: Fix phantom period creation

The import created 7 periods when the user created 3. The import should:
1. Check if a matching period already exists (by canonical_key or date range overlap)
2. If exists: use the existing period
3. If not: create with proper date boundaries

Do NOT create duplicate periods. Match against existing periods first.

### 4C: Verify periods

```sql
SELECT id, canonical_key, label, start_date, end_date
FROM periods
WHERE tenant_id = 'f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd'
ORDER BY start_date;
-- Verify: every period has non-null start_date and end_date
-- Verify: no duplicate periods for the same date range
```

**Proof gates:**
- PG-9: All periods have non-null start_date and end_date
- PG-10: No duplicate periods for the same canonical_key
- PG-11: committed_data.period_id FK points to correct periods

**Commit:** `OB-75 Mission 4: Period date boundaries and deduplication`

---

## MISSION 5: RECONCILIATION (The Proof)

### What Must Happen

Run calculation for January 2024. Compare results against CLT-14B ground truth. Document per-component accuracy.

### 5A: Nuclear clear and re-import

Because Missions 1-4 change the import and calculation pipeline, the existing data for Pipeline Test Co is stale. Clear and re-import:

```sql
-- Clear pipeline data for Pipeline Test Co (preserve tenant + profile)
DELETE FROM entity_period_outcomes WHERE tenant_id = 'f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd';
DELETE FROM calculation_results WHERE tenant_id = 'f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd';
DELETE FROM calculation_batches WHERE tenant_id = 'f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd';
DELETE FROM rule_set_assignments WHERE tenant_id = 'f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd';
DELETE FROM committed_data WHERE tenant_id = 'f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd';
DELETE FROM entities WHERE tenant_id = 'f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd';
DELETE FROM periods WHERE tenant_id = 'f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd';
DELETE FROM import_batches WHERE tenant_id = 'f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd';
DELETE FROM rule_sets WHERE tenant_id = 'f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd';
```

### 5B: Interactive re-import (STOP AND WAIT FOR ANDREW)

**⚠️ STOP HERE. Tell Andrew the pipeline is ready for re-import.**

Andrew will:
1. Upload the plan PPTX through the browser UI
2. Upload the data XLSX through the Enhanced Import UI
3. Confirm import completion

CC will:
1. Verify import_batches.metadata contains AI context
2. Verify committed_data contains ALL source columns
3. Verify entities, periods, assignments created correctly
4. Run calculation for January 2024 period
5. Proceed to reconciliation

### 5C: Run calculation

After import, run calculation for the January 2024 period via the UI or API:

```bash
# Verify calculation results
echo "=== CALCULATION RESULTS ==="
# Query calculation_results for the new batch
# Sum total_payout
# Count entities with non-zero payouts
# Extract per-component totals from components JSONB
```

### 5D: Reconciliation comparison

Compare engine output against ground truth. Build comparison per component:

```
RECONCILIATION REPORT — Pipeline Test Co — January 2024
========================================================

| Component         | Ground Truth | Engine    | Delta     | Accuracy | Status |
|-------------------|-------------|-----------|-----------|----------|--------|
| Optical Sales     | $748,600    | $___      | $___      | ___%     | ___    |
| Store Sales       | $116,250    | $___      | $___      | ___%     | ___    |
| New Customers     | $39,100     | $___      | $___      | ___%     | ___    |
| Collections       | $283,000    | $___      | $___      | ___%     | ___    |
| Club Protection   | $10         | $___      | $___      | ___%     | ___    |
| Warranty          | $66,872     | $___      | $___      | ___%     | ___    |
| TOTAL             | $1,253,832  | $___      | $___      | ___%     | ___    |

Employees processed: ___/719
Employees with non-zero payout: ___
Zero-payout employees (expected: 1): ___
```

**Proof gates:**
- PG-12: Calculation runs for January 2024 without error
- PG-13: Total payout ≥ $1,191,140 (95% of ground truth)
- PG-14: At least 5 of 6 components produce non-zero payouts
- PG-15: 700+ employees processed (not capped at 1,000)
- PG-16: Per-component variance ≤ 10% for Optical, Store Sales, Collections
- PG-17: Reconciliation report with per-component comparison completed

**Commit:** `OB-75 Mission 5: Reconciliation — engine vs ground truth`

---

## MISSION 6: DISPLAY ACCURACY (What The User Sees)

### What Must Happen

The Run Calculations page must show accurate data — entity external IDs (not UUIDs), actual payout per entity (not $0), and summary matching detail sum.

### 6A: Entity display

Entity Results table must show:
- `external_id` (employee number from source data, e.g., "96568046") — NOT truncated UUID
- `display_name` if available
- `total_payout` from calculation_results — the ACTUAL number, not $0

### 6B: Summary = Sum of detail

Summary cards (Entities Processed, Total Compensation, Average Payout) must be computed from the SAME data source as the entity detail rows. Single source of truth. AP-21.

### 6C: Verify display

Take screenshot or paste console evidence showing:
- Entity rows with real employee IDs
- Entity rows with non-zero payouts
- Summary total matching sum of entity detail rows

**Proof gates:**
- PG-18: Entity rows show external_id (employee numbers), not UUIDs
- PG-19: Entity rows show actual payout values from calculation_results
- PG-20: Summary total = SUM of all entity detail payout values (single source)

**Commit:** `OB-75 Mission 6: Display accuracy — entity IDs and payout values`

---

## HARD CHECKPOINT

**After Mission 5C (calculation complete), if:**
- Total payout < $500,000 → STOP. Document what's wrong. Do NOT proceed to display fixes.
- Fewer than 500 employees calculated → STOP. Entity assignment or period filtering is broken.
- All 6 components show $0 → STOP. AI context is not being read by engine.

**Diagnose the failure. Fix the root cause. Re-run calculation. Only proceed when total payout exceeds $500,000.**

---

## PROOF GATE SUMMARY

| PG | Mission | Description | Pass Criteria |
|----|---------|-------------|---------------|
| 1 | M1 | AI context persisted to Supabase | import_batches.metadata contains ai_context |
| 2 | M1 | ALL source columns in committed_data | row_data includes unmapped fields |
| 3 | M2 | SHEET_COMPONENT_PATTERNS not in calc path | grep = 0 matches |
| 4 | M2 | Engine reads AI context from DB | grep confirms ai_context/metadata reads |
| 5 | M2 | Korean Test passes | Zero language-specific strings in calc path |
| 6 | M3 | All entities assigned | Count matches entity table, no cap |
| 7 | M3 | 719+ results for January | calculation_results count for period |
| 8 | M3 | Entity detail shows real payouts | Not all $0 |
| 9 | M4 | Periods have start_date/end_date | All non-null |
| 10 | M4 | No duplicate periods | Unique canonical_key per tenant |
| 11 | M4 | committed_data FK correct | period_id points to right period |
| 12 | M5 | Calculation runs without error | No crash |
| 13 | M5 | Total payout ≥ 95% of GT | ≥ $1,191,140 |
| 14 | M5 | 5+ components non-zero | Component breakdown populated |
| 15 | M5 | 700+ employees calculated | Not capped at 1,000 |
| 16 | M5 | Per-component ≤ 10% variance | Optical, Store, Collections |
| 17 | M5 | Reconciliation report complete | Per-component table filled |
| 18 | M6 | Entity display shows external_id | Not UUIDs |
| 19 | M6 | Entity detail shows real payouts | Not $0 |
| 20 | M6 | Summary = Sum of detail | Single data source |

**20 proof gates. All must PASS or be documented as FAIL with root cause.**

---

## SECTION F QUICK CHECKLIST

```
Before submitting completion report, verify:
□ Architecture Decision committed before implementation?
□ Anti-Pattern Registry checked — zero violations?
□ Scale test: works for 10x current volume?
□ AI-first: zero hardcoded field names/patterns added?
□ SHEET_COMPONENT_PATTERNS eliminated from calculation path?
□ All Supabase migrations executed AND verified with DB query?
□ Proof gates verify LIVE/RENDERED state, not file existence?
□ Browser console clean on localhost?
□ Real data displayed, no placeholders?
□ Single code path (no duplicate pipelines)?
□ Atomic operations (clean state on failure)?
□ Periods have start_date AND end_date?
□ ALL source columns preserved in committed_data?
□ Reconciliation report with per-component comparison?
```

---

## COMPLETION REPORT

Save as `OB-75_COMPLETION_REPORT.md` in **PROJECT ROOT** (same level as package.json).

Mandatory structure:
1. **Commits** — list all with hashes
2. **Files modified** — list every file touched
3. **Proof gates** — 20 gates, each with PASS/FAIL + evidence (pasted output, not "this was implemented")
4. **Reconciliation report** — per-component table with ground truth vs engine
5. **Korean Test** — grep evidence showing zero hardcoded patterns
6. **Anti-pattern compliance** — AP-5, AP-6, AP-7, AP-18 through AP-22
7. **Known issues** — honest list of remaining gaps
8. **Section F Checklist** — completed

---

*"OB-74 proved the pipeline connects. OB-75 proves the pipeline thinks."*
*"The AI is the map. The engine reads the map. The map is never hardcoded."*

*OB-75 — February 22, 2026*
