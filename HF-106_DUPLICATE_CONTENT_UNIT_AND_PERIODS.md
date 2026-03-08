# HF-106: DUPLICATE CONTENT UNIT ELIMINATION + /api/periods REMOVAL

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` at the project root — all rules apply
2. `SCHEMA_REFERENCE_LIVE.md` at the project root — authoritative schema source
3. `web/src/app/api/import/sci/analyze/route.ts` — where Level 1 and Level 2 coexist
4. `web/src/lib/sci/hc-pattern-classifier.ts` — Level 1 pattern classifier
5. `web/src/lib/sci/resolver.ts` — Level 2 CRR resolver
6. `web/src/components/layout/auth-shell.tsx` — PeriodProvider mounting
7. `web/src/contexts/period-context.tsx` — period context

**If you have not read ALL SEVEN files, STOP and read them now.**

---

## WHY THIS HF EXISTS

### Failure 1: Duplicate Content Unit

**Production evidence (March 8, 2026 15:59 UTC):**

The import proposal showed 4 content units for a 3-sheet file:
```
Plantilla          — entity@90%       (Level 1: entity_roster)
Datos_Rendimiento  — transaction@90%  (Level 1: repeated_measures_over_time)
Datos_Flota_Hub    — reference@85%    (Level 1: lookup_table)
split              — transaction@73%  (Level 2: CRR Bayesian — DUPLICATE)
```

When the user confirmed import, both the reference AND the transaction versions of Datos_Flota_Hub were sent to the execute route. The reference import succeeded first. The transaction import tried to insert the same rows as reference items and hit a unique constraint: `duplicate key value violates unique constraint 'reference_items_reference_data_id_external_key_key'`.

**Root cause:** HF-105 wired Level 1 to run AFTER Level 2 and override the resolution, but it didn't remove the Level 2 entry from the content unit array. Both entries exist in the proposal. The execute route receives both and processes both.

### Failure 2: /api/periods on Import Path (Decision 92)

**Production evidence (March 8, 2026 15:58 UTC):**
```
GET 200 /api/periods  (15:58:51.59)
GET 200 /api/periods  (15:58:50.80)
```

This is the FIFTH HF claiming to fix this (HF-093, HF-098, HF-101, HF-103, now HF-106). Prior approaches:
- HF-093: Fixed something in period context (claimed ✅, not verified in production)
- HF-098: Added isImportRoute to dependency array (failed)
- HF-101: PeriodProvider conditionally not mounted on import in auth-shell.tsx (failed)
- HF-103: Extended exclusion to /data/import (still failed)

All four approaches tried to conditionally prevent PeriodProvider from mounting or fetching on the import path. All four failed because the periods fetch happens during navigation to `/operate` BEFORE the user reaches `/operate/import`. By the time the `isImportRoute` check runs, the fetch has already fired.

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
cat SCHEMA_REFERENCE_LIVE.md
```

---

## PHASE 0: COMPREHENSIVE DIAGNOSTIC

```bash
echo "============================================"
echo "HF-106 PHASE 0: DIAGNOSTIC"
echo "============================================"

echo ""
echo "================================================"
echo "SECTION A: DUPLICATE CONTENT UNIT"
echo "================================================"

echo ""
echo "=== A1: How Level 1 override works in analyze route ==="
echo "--- Show the code that runs Level 2, then Level 1, and how they interact ---"
grep -n "resolveClassification\|classifyByHCPattern\|hcPattern\|Level 1\|Level 2\|override" web/src/app/api/import/sci/analyze/route.ts | head -20

echo ""
echo "=== A2: Full Level 1/Level 2 integration block ==="
echo "--- Paste the section of analyze/route.ts from resolveClassification through the end of Level 1 override ---"

echo ""
echo "=== A3: What is the content unit data structure? ==="
echo "--- How are content units stored in the proposal? ---"
grep -n "contentUnit\|ContentUnit\|proposal\|resolution\|units\|sheets" web/src/app/api/import/sci/analyze/route.ts | head -20

echo ""
echo "=== A4: How does the execute route receive content units? ==="
grep -n "contentUnit\|ContentUnit\|proposal\|resolution\|units" web/src/app/api/import/sci/execute/route.ts 2>/dev/null | head -15

echo ""
echo "=== A5: What creates the 'split' entry? ==="
grep -rn "split\|Split\|duplicate\|clone\|copy.*unit\|second.*unit" web/src/app/api/import/sci/analyze/route.ts web/src/lib/sci/ --include="*.ts" | head -15

echo ""
echo "=== A6: State resolution array — does it hold both Level 1 and Level 2 results? ==="
grep -n "resolution\|Resolution\|allScores\|round2Scores" web/src/app/api/import/sci/analyze/route.ts | head -20

echo ""
echo "================================================"
echo "SECTION B: /api/periods — FIFTH ATTEMPT"
echo "================================================"

echo ""
echo "=== B1: EVERY file that references /api/periods or periods endpoint ==="
grep -rn "/api/periods" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next"

echo ""
echo "=== B2: EVERY file that calls from('periods') ==="
grep -rn "from('periods')" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next"

echo ""
echo "=== B3: Period API route — full file ==="
cat web/src/app/api/periods/route.ts 2>/dev/null || echo "No /api/periods route file found"

echo ""
echo "=== B4: PeriodProvider in auth-shell — full integration ==="
grep -B 5 -A 10 "PeriodProvider" web/src/components/layout/auth-shell.tsx

echo ""
echo "=== B5: PeriodContext — what triggers the fetch ==="
grep -n "fetch\|loadPeriods\|useEffect\|api/periods\|from('periods')" web/src/contexts/period-context.tsx | head -15

echo ""
echo "=== B6: Does /operate layout or any parent layout fetch periods? ==="
grep -rn "period\|Period\|loadPeriod\|fetchPeriod" web/src/app/operate/layout.tsx web/src/app/layout.tsx 2>/dev/null | head -10

echo ""
echo "=== B7: What components on the /operate page (not /operate/import) reference periods? ==="
cat web/src/app/operate/page.tsx 2>/dev/null | head -40
grep -n "period\|Period\|usePeriod" web/src/app/operate/page.tsx 2>/dev/null

echo ""
echo "=== B8: The actual network request — is it from PeriodContext or somewhere else? ==="
echo "--- Check if any OTHER component or context makes its own /api/periods call ---"
grep -rn "api/periods" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | grep -v period-context | grep -v "// "

echo ""
echo "=== B9: Auth shell isImportRoute check — is it working? ==="
grep -n "isImportRoute\|pathname.*import\|import.*route" web/src/components/layout/auth-shell.tsx | head -10
```

**PASTE ALL OUTPUT before proceeding.**

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-106 Phase 0: Duplicate content unit + periods diagnostic" && git push origin dev`

---

## PHASE 1: ARCHITECTURE DECISION GATE

```
ARCHITECTURE DECISION RECORD
============================

FAILURE 1: Duplicate Content Unit
  Problem: Level 1 adds an override but doesn't remove the Level 2 entry.
           Both go to execute. Duplicate import fails on unique constraint.

  Fix: When Level 1 matches a content unit, it must REPLACE the Level 2 entry,
       not coexist with it. One content unit per sheet. One classification per sheet.

  The "split" entry suggests the code may be splitting a content unit when Level 1
  and Level 2 disagree. This is wrong — Level 1 overrides Level 2. There is no split.

  Implementation: After Level 1 runs, if a match is found for sheet X, remove any
  other content unit for sheet X from the proposal. One sheet = one content unit.

FAILURE 2: /api/periods
  Problem: Four prior fixes all used the same approach — conditional PeriodProvider
           mounting based on pathname. All failed because periods fetch fires on /operate
           before the user navigates to /operate/import.

  Approach: STOP trying to conditionally mount PeriodProvider.
  Instead: determine exactly which component/route makes the /api/periods call.
  The diagnostic in B1-B9 will reveal whether it's:
    a. PeriodContext fetching on mount (when PeriodProvider is on /operate)
    b. A direct Supabase query in a component on /operate
    c. The /operate page itself importing periods
    d. A layout-level fetch

  If it's (a): PeriodProvider should NOT mount until a user enters a page that
  actually needs periods (Calculate, Reconciliation). NOT on /operate. NOT on import.
  Move PeriodProvider from auth-shell.tsx to the specific pages that need it.

  If it's (b/c/d): Remove the direct call.

Scale test: YES
Decision 92 compliance: Import surface must have zero period references
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-106 Phase 1: Architecture decision" && git push origin dev`

---

## PHASE 2: IMPLEMENTATION

### 2A: Fix Duplicate Content Unit

Ensure that when Level 1 matches a sheet, the Level 2 result for that same sheet is REMOVED from the content unit array. One sheet = one entry in the proposal. The execute route receives exactly 3 content units for a 3-sheet file, not 4.

After the fix, verify the content unit array has exactly one entry per sheet by logging:
```
console.log(`[SCI-PROPOSAL] ${contentUnits.length} content units for ${sheets.length} sheets`);
```

### 2B: Fix /api/periods

Based on Phase 0 diagnostic, implement the architectural fix. The approach depends on what the diagnostic reveals, but the prior conditional-mounting approach is explicitly rejected — it has failed four times.

The most likely correct fix: move PeriodProvider out of auth-shell.tsx entirely. Mount it only in the layouts/pages that actually need periods (Calculate, Reconciliation). This means /operate loads without periods context, and periods are only fetched when the user navigates to a page that needs them.

### 2C: Build

```bash
cd /Users/AndrewAfrica/spm-platform/web
rm -rf .next
npm run build 2>&1 | tail -20
# MUST exit 0
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-106 Phase 2: Duplicate content unit fix + periods architectural fix" && git push origin dev`

---

## PHASE 3: LOCALHOST VERIFICATION WITH EVIDENCE

### V1: Exactly 3 Content Units for 3-Sheet File
Import Meridian XLSX on localhost.
**Required evidence:** Paste the `[SCI-PROPOSAL]` log line showing exactly 3 content units for 3 sheets. No duplicates. No "split" entry.

### V2: Classification Correct — No Duplicates
**Required evidence:** Paste the proposal response showing exactly 3 items:
- Plantilla: entity
- Datos_Rendimiento: transaction
- Datos_Flota_Hub: reference
No second Datos_Flota_Hub entry.

### V3: Import Succeeds — All 3 Sheets
Confirm all and import on localhost.
**Required evidence:** Import summary showing 3 of 3 succeeded. No unique constraint errors. Datos_Flota_Hub imported as Reference Data without error.

### V4: Zero /api/periods on Import Path
Open browser Network tab. Navigate login → tenant selection → /operate → /operate/import → import file.
**Required evidence:** List of network requests. Zero requests to /api/periods during the ENTIRE navigation flow, including the /operate page.

### V5: Periods Still Work on Calculate Page
Navigate to Calculate page.
**Required evidence:** Periods load correctly on the Calculate page (PeriodProvider works where it's needed).

### V6: Build Clean
```bash
cd /Users/AndrewAfrica/spm-platform/web
rm -rf .next
npm run build 2>&1 | tail -10
```
**Required evidence:** Paste output including exit code.

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-106 Phase 3: Localhost verification" && git push origin dev`

---

## PHASE 4: AUTOMATED CLT WITH EVIDENTIARY GATES

```bash
echo "============================================"
echo "HF-106 CLT: EVIDENTIARY VERIFICATION"
echo "============================================"

echo ""
echo "=== EG-1: No duplicate content units in proposal ==="
echo "Evidence:"
grep -n "split\|duplicate\|clone\|second.*resolution\|push.*unit\|push.*content" web/src/app/api/import/sci/analyze/route.ts | head -10
echo "--- Expected: no code that creates duplicate entries ---"

echo ""
echo "=== EG-2: Level 1 REPLACES Level 2 ==="
echo "Evidence:"
grep -A 10 "hcPattern\|classifyByHCPattern\|Level 1.*override\|override.*resolution" web/src/app/api/import/sci/analyze/route.ts | head -25
echo "--- Must show replacement logic, not addition ---"

echo ""
echo "=== EG-3: PeriodProvider NOT in auth-shell ==="
echo "Evidence:"
grep -n "PeriodProvider" web/src/components/layout/auth-shell.tsx
echo "--- Expected: zero results (moved to specific pages) ---"

echo ""
echo "=== EG-4: PeriodProvider in Calculate/Reconciliation pages ==="
echo "Evidence:"
grep -rn "PeriodProvider" web/src/app/operate/calculate/ web/src/app/operate/reconciliation/ 2>/dev/null | head -10
echo "--- Expected: PeriodProvider present in pages that need it ---"

echo ""
echo "=== EG-5: Zero /api/periods callers outside period-context ==="
echo "Evidence:"
grep -rn "api/periods" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | grep -v period-context | grep -v "// "
echo "--- Expected: zero results ---"

echo ""
echo "=== EG-6: Build clean ==="
cd /Users/AndrewAfrica/spm-platform/web
rm -rf .next
npm run build 2>&1 | tail -10
echo "Exit code: $?"
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-106 Phase 4: CLT evidentiary gates" && git push origin dev`

---

## PHASE 5: COMPLETION REPORT + PR

### Completion Report (MANDATORY)

Create `HF-106_COMPLETION_REPORT.md` at project root. Required evidentiary gates:

1. **EG-1:** Proposal shows exactly 3 content units — paste proposal response
2. **EG-2:** Level 1 replacement code — paste the code block
3. **EG-3:** PeriodProvider architectural change — paste before/after
4. **EG-4:** Import succeeds 3/3 on localhost — paste import summary
5. **EG-5:** Zero /api/periods in network tab — paste request list
6. **EG-6:** Build output

### PR Creation

```bash
cd /Users/AndrewAfrica/spm-platform
gh pr create --base main --head dev \
  --title "HF-106: Fix duplicate content unit + architectural /api/periods removal" \
  --body "## Two Failures Fixed

### 1. Duplicate Content Unit
Level 1 HC pattern override added alongside Level 2 CRR result instead of replacing it.
Datos_Flota_Hub appeared twice (reference + transaction). Import failed on unique constraint.
Fixed: Level 1 REPLACES Level 2 when matched. One sheet = one content unit.

### 2. /api/periods on Import Path (Decision 92)
Fifth fix — prior four conditional-mounting approaches all failed because periods fetch
fires on /operate before user reaches /operate/import.
Fixed: [CC fills — architectural approach used]

## Evidence
- 3 content units for 3 sheets (no duplicates)
- Import succeeds 3/3
- Zero /api/periods in network tab
- Periods still work on Calculate page

## Production Verification Required (Andrew)
See PV-1 through PV-5 in prompt."
```

---

## WHAT NOT TO DO

1. **DO NOT keep both Level 1 and Level 2 entries for the same sheet.** Level 1 replaces Level 2. One sheet = one content unit.
2. **DO NOT use the isImportRoute conditional approach for periods.** It failed four times. Move PeriodProvider to the pages that need it.
3. **DO NOT break periods on Calculate or Reconciliation pages.** V5 verifies this.
4. **DO NOT skip the completion report.**
5. **DO NOT use field-name matching.** Korean Test (AP-25).
6. **DO NOT write SQL without checking SCHEMA_REFERENCE_LIVE.md.** FP-49.

---

## ANDREW: PRODUCTION VERIFICATION (POST-MERGE)

### PV-1: Clean Meridian Data
Three DELETE statements + also delete reference_data and reference_items for Meridian:
```sql
DELETE FROM reference_items WHERE reference_data_id IN (
  SELECT id FROM reference_data WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
);
DELETE FROM reference_data WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
DELETE FROM committed_data WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
DELETE FROM entities WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
DELETE FROM classification_signals WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
```
Verify all at 0.

### PV-2: Re-import Meridian XLSX
Confirm and import.

### PV-3: Import Succeeds — All 3 Sheets
**Evidence required:** Screenshot showing "3 of 3 succeeded" (not "3 of 4"). No "split" entry. No unique constraint errors. Datos_Flota_Hub shows "Reference Data."

### PV-4: Zero /api/periods
**Evidence required:** Vercel Runtime Logs showing zero `GET /api/periods` during the entire import flow (login → tenant → operate → import → confirm).

### PV-5: Database Verification
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
);
```
**Evidence required:** entities > 0, committed_data > 0, reference_data > 0, reference_items > 0.

**Only after ALL five PV checks pass with evidence can the import pipeline be considered production-verified.**
