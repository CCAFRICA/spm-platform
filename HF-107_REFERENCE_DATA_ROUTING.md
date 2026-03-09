# HF-107: REFERENCE DATA ROUTING — EXECUTE PIPELINE FIX

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` at the project root — all rules apply
2. `SCHEMA_REFERENCE_LIVE.md` at the project root — authoritative schema source
3. `web/src/app/api/import/sci/execute/route.ts` — the execute pipeline
4. `web/src/lib/sci/synaptic-ingestion-state.ts` — content unit types and resolution
5. `web/src/app/api/import/sci/analyze/route.ts` — how classification feeds into execute

**If you have not read ALL FIVE files, STOP and read them now.**

---

## WHY THIS HF EXISTS

The SCI classification pipeline correctly classifies Datos_Flota_Hub as `reference@85%` (Level 1 HC pattern: `lookup_table`). The import reports "3 of 3 succeeded." But the database shows:

```
entities:        50   (from Plantilla — correct)
committed_data:  86   (should be ~200+ if transaction data routed correctly)
reference_data:  0    (should be ≥1 — reference header)
reference_items: 0    (should be ≥12 — hub records)
```

The execute route either has no code path for reference-classified content, or the reference routing falls back to committed_data silently. Either way, reference data is not reaching the reference tables (Decision 92: reference_data, reference_items, alias_registry).

Additionally, committed_data at 86 is lower than expected. Datos_Rendimiento has 201 rows but only ~50 may have been written. This needs investigation.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000 responds
3. **Git commands from repo root (spm-platform), NOT from web/.**
4. **Commit this prompt to git as first action.**
5. **COMPLETION REPORT IS MANDATORY (Rules 25-28).**
6. **EVIDENTIARY GATES — NOT PASS/FAIL.**

---

## SQL VERIFICATION GATE (MANDATORY — FP-49)

Before writing ANY SQL or code referencing database column names:

```bash
echo "=== reference_data schema ==="
grep -A 15 "### reference_data" SCHEMA_REFERENCE_LIVE.md

echo "=== reference_items schema ==="
grep -A 15 "### reference_items" SCHEMA_REFERENCE_LIVE.md

echo "=== committed_data schema ==="
grep -A 15 "### committed_data" SCHEMA_REFERENCE_LIVE.md
```

Verify every column name before writing any insert/select code.

---

## PHASE 0: COMPREHENSIVE DIAGNOSTIC

```bash
echo "============================================"
echo "HF-107 PHASE 0: REFERENCE ROUTING DIAGNOSTIC"
echo "============================================"

echo ""
echo "================================================"
echo "SECTION A: EXECUTE ROUTE — REFERENCE HANDLING"
echo "================================================"

echo ""
echo "=== A1: Full execute route ==="
cat web/src/app/api/import/sci/execute/route.ts

echo ""
echo "=== A2: How does the execute route process each classification? ==="
grep -n "reference\|Reference\|entity\|Entity\|transaction\|Transaction\|classification\|processSheet\|processContent" web/src/app/api/import/sci/execute/route.ts | head -30

echo ""
echo "=== A3: Is there a reference processing path? ==="
grep -n "reference_data\|reference_items\|insertReference\|processReference\|referenceRoute\|from('reference" web/src/app/api/import/sci/execute/route.ts | head -15

echo ""
echo "=== A4: Where does committed_data get written? ==="
grep -n "committed_data\|from('committed" web/src/app/api/import/sci/execute/route.ts | head -15

echo ""
echo "=== A5: What happens to reference-classified content in the execute route? ==="
echo "--- Trace: when classification = 'reference', what code path runs? ---"
grep -n "switch\|case.*reference\|if.*reference\|classification.*===\|type.*===\|routing" web/src/app/api/import/sci/execute/route.ts | head -20

echo ""
echo "================================================"
echo "SECTION B: COMMITTED_DATA COUNT INVESTIGATION"
echo "================================================"

echo ""
echo "=== B1: How are transaction rows written to committed_data? ==="
echo "--- Is there deduplication, batching, or row limiting? ---"
grep -n "insert\|upsert\|batch\|chunk\|limit\|dedup\|unique" web/src/app/api/import/sci/execute/route.ts | head -20

echo ""
echo "=== B2: Processing order in execute ==="
grep -n "processing.*order\|order.*processing\|entity.*first\|reference.*before\|sequence" web/src/app/api/import/sci/execute/route.ts | head -10

echo ""
echo "================================================"
echo "SECTION C: REFERENCE TABLE WRITE INFRASTRUCTURE"
echo "================================================"

echo ""
echo "=== C1: Does any code anywhere write to reference_data? ==="
grep -rn "from('reference_data')\|reference_data.*insert\|insertInto.*reference_data" web/src/ --include="*.ts" | grep -v node_modules | grep -v ".next" | head -15

echo ""
echo "=== C2: Does any code anywhere write to reference_items? ==="
grep -rn "from('reference_items')\|reference_items.*insert\|insertInto.*reference_items" web/src/ --include="*.ts" | grep -v node_modules | grep -v ".next" | head -15

echo ""
echo "=== C3: Reference data processing function (if it exists) ==="
grep -rn "processReference\|referenceProcessor\|handleReference\|importReference" web/src/ --include="*.ts" | grep -v node_modules | grep -v ".next" | head -15

echo ""
echo "=== C4: OB-160F processing order — entity → reference → transaction ==="
echo "--- Was reference processing built in OB-160F? ---"
grep -rn "processingOrder\|PROCESSING_ORDER\|Entity.*Reference.*Transaction\|reference.*process" web/src/ --include="*.ts" | grep -v node_modules | grep -v ".next" | head -15
```

**PASTE ALL OUTPUT before proceeding.**

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-107 Phase 0: Reference routing diagnostic" && git push origin dev`

---

## PHASE 1: ARCHITECTURE DECISION GATE

```
ARCHITECTURE DECISION RECORD
============================
Problem: Reference-classified content does not reach reference_data/reference_items tables.
         The execute route may lack a reference processing path entirely.

Reference table schema (from SCHEMA_REFERENCE_LIVE.md):
  reference_data: id, tenant_id, reference_type, name, version, status, key_field,
                  schema_definition, import_batch_id, metadata, created_by, created_at, updated_at
  reference_items: id, tenant_id, reference_data_id, external_key, display_name,
                   category, attributes, status, created_at, updated_at

Fix requirements:
  1. When classification = 'reference', execute route writes to reference_data + reference_items
  2. reference_data gets one header row per reference sheet (type, name, key_field)
  3. reference_items gets one row per data row in the sheet (external_key, attributes as JSONB)
  4. The key_field should be the column HC identified as reference_key
  5. Each item's external_key is the value from the reference_key column
  6. All other columns go into attributes JSONB (Carry Everything principle)
  7. Idempotent: re-import should upsert, not fail on unique constraints

Also investigate: committed_data at 86 — is this correct or are transaction rows missing?

Scale test: YES — works for any reference-classified sheet
Korean Test: YES — key_field determined by HC semantic role, not field name matching
FP-49: All column names verified against SCHEMA_REFERENCE_LIVE.md
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-107 Phase 1: Architecture decision — reference routing" && git push origin dev`

---

## PHASE 2: IMPLEMENTATION

### 2A: Build Reference Processing Path

In the execute route, add (or fix) the reference processing path:

1. When a content unit has classification = 'reference':
   - Create one `reference_data` row (header: reference_type, name from sheet name, key_field from HC reference_key column, version=1, status='active')
   - Create `reference_items` rows — one per data row, external_key from the reference_key column value, all other columns in attributes JSONB
   - Link via `reference_data_id`

2. The reference_key column is identified by HC — the column with `columnRole = 'reference_key'`. Use the HC interpretation to determine which column is the key. Do NOT hardcode a column name.

3. Handle idempotency: if reference_data already exists for this tenant + reference_type + version, either upsert or delete-and-recreate.

### 2B: Investigate committed_data Count

Determine why committed_data = 86:
- Is Datos_Rendimiento writing all 201 rows or only unique entity rows (50)?
- Is Datos_Flota_Hub writing to committed_data (36 rows) despite being classified as reference?
- What is the expected committed_data count for a correct import?

### 2C: Build

```bash
cd /Users/AndrewAfrica/spm-platform/web
rm -rf .next
npm run build 2>&1 | tail -20
# MUST exit 0
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-107 Phase 2: Reference routing implementation" && git push origin dev`

---

## PHASE 3: LOCALHOST VERIFICATION WITH EVIDENCE

### V1: Reference Data Written
Import Meridian XLSX on localhost.
**Required evidence:** Query results showing:
```sql
SELECT COUNT(*) FROM reference_data WHERE tenant_id = '[meridian_id]';
-- Expected: ≥ 1
SELECT COUNT(*) FROM reference_items WHERE reference_data_id IN (
  SELECT id FROM reference_data WHERE tenant_id = '[meridian_id]'
);
-- Expected: ≥ 12 (hub records)
```

### V2: Reference Data Structure
**Required evidence:** Paste one reference_data row showing reference_type, name, key_field.
Paste one reference_items row showing external_key, attributes JSONB.

### V3: Committed Data Count Explained
**Required evidence:** Query showing committed_data row count and breakdown by data source/sheet. Explain what the correct count should be and why.

### V4: Classification Still Correct
**Required evidence:** Paste `[SCI-HC-PATTERN]` logs showing all three Level 1 matches.

### V5: Import Succeeds 3/3
**Required evidence:** Import summary showing 3 of 3 succeeded. No constraint errors.

### V6: Build Clean
```bash
cd /Users/AndrewAfrica/spm-platform/web
rm -rf .next
npm run build 2>&1 | tail -10
```
**Required evidence:** Paste output including exit code.

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-107 Phase 3: Localhost verification" && git push origin dev`

---

## PHASE 4: AUTOMATED CLT WITH EVIDENTIARY GATES

```bash
echo "============================================"
echo "HF-107 CLT: REFERENCE ROUTING VERIFICATION"
echo "============================================"

echo ""
echo "=== EG-1: Reference processing path exists ==="
echo "Evidence:"
grep -n "reference_data\|reference_items\|processReference\|from('reference" web/src/app/api/import/sci/execute/route.ts | head -15
echo "--- Must show insert/upsert to reference tables ---"

echo ""
echo "=== EG-2: Reference key determined by HC, not hardcoded ==="
echo "Evidence:"
grep -n "reference_key\|columnRole\|key_field\|hc.*key\|interpretation" web/src/app/api/import/sci/execute/route.ts | head -15
echo "--- Must show HC-derived key field, not hardcoded column name ---"

echo ""
echo "=== EG-3: Attributes JSONB carries everything ==="
echo "Evidence:"
grep -n "attributes\|row_data\|JSONB\|json" web/src/app/api/import/sci/execute/route.ts | grep -i "reference" | head -10
echo "--- Must show all columns stored in attributes ---"

echo ""
echo "=== EG-4: Idempotent — handles re-import ==="
echo "Evidence:"
grep -n "upsert\|ON CONFLICT\|delete.*before\|existing.*reference\|duplicate" web/src/app/api/import/sci/execute/route.ts | head -10

echo ""
echo "=== EG-5: Build clean ==="
cd /Users/AndrewAfrica/spm-platform/web
rm -rf .next
npm run build 2>&1 | tail -10
echo "Exit code: $?"
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-107 Phase 4: CLT evidentiary gates" && git push origin dev`

---

## PHASE 5: COMPLETION REPORT + PR

### Completion Report (MANDATORY)

Create `HF-107_COMPLETION_REPORT.md` at project root. Required evidentiary gates:

1. **EG-1:** Reference processing code — paste the insert/upsert block
2. **EG-2:** HC-derived key field — paste the code that reads reference_key from HC
3. **EG-3:** reference_data and reference_items query results from localhost
4. **EG-4:** One reference_data row and one reference_items row pasted
5. **EG-5:** committed_data count explanation
6. **EG-6:** Import 3/3 on localhost
7. **EG-7:** Build output

### PR Creation

```bash
cd /Users/AndrewAfrica/spm-platform
gh pr create --base main --head dev \
  --title "HF-107: Reference data routing — execute pipeline writes to reference tables" \
  --body "## Problem
Reference-classified content (Datos_Flota_Hub) imports successfully but writes zero rows
to reference_data/reference_items. The execute route lacked a reference processing path.

## Fix
Added reference processing: when classification = 'reference', execute route creates
reference_data header + reference_items per row. Key field determined by HC reference_key
column role. All other columns stored in attributes JSONB (Carry Everything).

## Evidence
- reference_data ≥ 1, reference_items ≥ 12 after import
- HC-derived key field, no hardcoded column names
- Import 3/3 succeeded
- Build clean

## Production Verification Required (Andrew)
See PV-1 through PV-4 in prompt."
```

---

## WHAT NOT TO DO

1. **DO NOT hardcode the reference key column name.** Use HC's reference_key column role identification.
2. **DO NOT discard non-key columns.** All columns go into attributes JSONB (Carry Everything — slot 10).
3. **DO NOT skip idempotency.** Re-import must work without unique constraint violations.
4. **DO NOT write reference data to committed_data.** Reference goes to reference tables.
5. **DO NOT skip the completion report.**
6. **DO NOT write SQL without checking SCHEMA_REFERENCE_LIVE.md.** FP-49.

---

## ANDREW: PRODUCTION VERIFICATION (POST-MERGE)

### PV-1: Clean ALL Five Tables
```sql
DELETE FROM reference_items WHERE reference_data_id IN (
  SELECT id FROM reference_data WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
)
```
```sql
DELETE FROM reference_data WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
```
```sql
DELETE FROM committed_data WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
```
```sql
DELETE FROM entities WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
```
```sql
DELETE FROM classification_signals WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
```
Verify all five at zero (select "No limit" for UNION query, or run individually).

### PV-2: Re-import Meridian XLSX
Confirm and import.

### PV-3: Import 3/3 Succeeded
**Evidence required:** Screenshot showing "3 of 3 succeeded." No errors.

### PV-4: Database Verification (select "No limit")
```sql
SELECT 'entities' AS tbl, COUNT(*) AS cnt
FROM entities WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
UNION ALL
SELECT 'committed_data', COUNT(*) FROM committed_data
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
UNION ALL
SELECT 'reference_data', COUNT(*) FROM reference_data
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
UNION ALL
SELECT 'reference_items', COUNT(*) FROM reference_items
WHERE reference_data_id IN (
  SELECT id FROM reference_data WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
)
```
**Evidence required:** entities > 0, committed_data > 0, reference_data > 0, reference_items > 0.

**Only after ALL four PV checks pass with evidence can the reference routing be considered production-verified.**
