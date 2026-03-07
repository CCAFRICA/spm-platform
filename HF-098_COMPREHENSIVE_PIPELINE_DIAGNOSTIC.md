# HF-098: COMPREHENSIVE PIPELINE DIAGNOSTIC — PRODUCTION REGRESSION ANALYSIS

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` at the project root — all rules apply
2. `SCHEMA_REFERENCE_LIVE.md` at the project root — this is the ONLY authoritative schema source

**If you have not read both files, STOP and read them now.**

---

## WHY THIS HF EXISTS

CLT-160 browser testing on production (vialuce.ai) after merging PRs 182-198 reveals FIVE compounding failures. Several of these were previously marked ✅ in findings registries but were never verified in production. **Localhost PASS ≠ production PASS.** This HF exists because our verification process failed.

### The Five Failures

| # | Failure | Claimed Status | Production Reality |
|---|---------|---------------|-------------------|
| 1 | HC not running in production | ✅ HF-095/096 | Zero `[SCI-HC-DIAG]` entries in Vercel logs. HC Override Authority (Decision 108) is not executing. |
| 2 | Datos_Flota_Hub misclassified as Transaction | ✅ HF-095 | `[SCI-SCORES-DIAG]` shows winner=transaction@75%, tied with reference@75%. HC should break the tie but isn't running. |
| 3 | /api/periods called on import page | ✅ HF-093 | Vercel logs show GET /api/periods during import flow. Decision 92 violation: import surface must have zero period references. |
| 4 | Plantilla entity binding failure | OPEN | "No entity_identifier binding found." Zero entities matched. Zero entities created. Calculation impossible. |
| 5 | All sheets labeled "Operational" | OPEN (F-15) | Datos_Rendimiento and Datos_Flota_Hub both show "Operational" instead of Transaction/Reference. Display label not reflecting classification. |

### Root Cause Assessment

These are NOT five independent bugs. They are consequences of a verification gap: **CC tests on localhost, marks findings ✅, and nobody verifies production.** This HF is diagnostic-first: understand the full picture, then fix everything in one pass.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000 responds
3. **Git commands from repo root (spm-platform), NOT from web/.**
4. **Commit this prompt to git as first action.**
5. **NO PARTIAL FIXES.** This is a comprehensive diagnostic. Complete Phase 0 and Phase 1 entirely before any code changes.

---

## SQL VERIFICATION GATE (MANDATORY — FP-49)

Before writing ANY SQL or any code that references database column names, CC MUST run:

```bash
echo "=== SQL VERIFICATION GATE ==="
echo "Checking SCHEMA_REFERENCE_LIVE.md for column names..."
cat SCHEMA_REFERENCE_LIVE.md
```

Every column name referenced in code changes must exist in the live schema. No exceptions. No assumptions. No fabrication.

---

## PHASE 0: COMPREHENSIVE DIAGNOSTIC

**DO NOT WRITE ANY FIX CODE UNTIL THIS ENTIRE PHASE IS COMPLETE.**

Run every command. Paste ALL output. Do not skip any.

```bash
echo "============================================"
echo "HF-098 PHASE 0: COMPREHENSIVE DIAGNOSTIC"
echo "============================================"
echo ""
echo "================================================"
echo "SECTION A: HC (Header Comprehension) PRODUCTION STATUS"
echo "================================================"

echo ""
echo "=== A1: ANTHROPIC_API_KEY in environment ==="
grep -rn "ANTHROPIC_API_KEY\|ANTHROPIC_KEY\|CLAUDE_API_KEY" web/src/ --include="*.ts" --include="*.tsx" | head -20
echo ""
echo "=== A2: .env files — what key names are expected ==="
cat web/.env.local 2>/dev/null | grep -i "anthropic\|claude\|api_key" || echo "No .env.local"
cat web/.env 2>/dev/null | grep -i "anthropic\|claude\|api_key" || echo "No .env"
cat web/.env.example 2>/dev/null | grep -i "anthropic\|claude\|api_key" || echo "No .env.example"

echo ""
echo "=== A3: HC call implementation — where is the LLM called? ==="
grep -rn "headerComprehension\|header_comprehension\|analyzeHeaders\|HeaderComprehension" web/src/ --include="*.ts" --include="*.tsx" | head -20

echo ""
echo "=== A4: HC function — full implementation ==="
echo "--- Find the file ---"
HC_FILE=$(grep -rln "headerComprehension\|analyzeHeaders\|HeaderComprehension" web/src/lib/ web/src/services/ --include="*.ts" 2>/dev/null | head -1)
echo "HC implementation file: $HC_FILE"
if [ -n "$HC_FILE" ]; then
  cat "$HC_FILE"
fi

echo ""
echo "=== A5: Where HC is called from analyze route ==="
cat web/src/app/api/import/sci/analyze/route.ts

echo ""
echo "=== A6: HC diagnostic logging from HF-096 ==="
grep -rn "SCI-HC-DIAG\|SCI-PROFILE-DIAG\|SCI-SCORES-DIAG" web/src/ --include="*.ts" --include="*.tsx" | head -20

echo ""
echo "=== A7: Does HC have error handling that swallows failures? ==="
grep -rn "catch\|try\|fallback\|silent\|skip" "$HC_FILE" 2>/dev/null | head -20

echo ""
echo "================================================"
echo "SECTION B: /api/periods ON IMPORT PAGE"
echo "================================================"

echo ""
echo "=== B1: Who calls /api/periods? ==="
grep -rn "api/periods\|/periods" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -30

echo ""
echo "=== B2: Import page and its components ==="
cat web/src/app/operate/import/page.tsx 2>/dev/null | head -80
echo ""
echo "=== B3: Import layout ==="
cat web/src/app/operate/import/layout.tsx 2>/dev/null || echo "No import layout"

echo ""
echo "=== B4: Components used on import page ==="
grep -rn "import.*from" web/src/app/operate/import/page.tsx 2>/dev/null | head -20

echo ""
echo "=== B5: Any context provider that fetches periods ==="
grep -rn "periods\|fetchPeriods\|loadPeriods\|usePeriods" web/src/contexts/ --include="*.ts" --include="*.tsx" | head -15

echo ""
echo "=== B6: Chrome sidebar or shell fetching periods ==="
grep -rn "periods\|/api/periods" web/src/components/navigation/ web/src/components/layout/ --include="*.ts" --include="*.tsx" | head -15

echo ""
echo "=== B7: HF-093 fix — what was actually changed? ==="
git log --all --oneline | grep -i "093\|periods\|leak" | head -10
echo "--- Diff of the fix ---"
PR_COMMIT=$(git log --all --oneline | grep -i "093" | head -1 | awk '{print $1}')
if [ -n "$PR_COMMIT" ]; then
  git show "$PR_COMMIT" --stat
fi

echo ""
echo "================================================"
echo "SECTION C: ENTITY BINDING FAILURE"
echo "================================================"

echo ""
echo "=== C1: Entity identifier binding logic ==="
grep -rn "entity_identifier\|entityIdentifier\|identifier.*binding\|No entity_identifier" web/src/ --include="*.ts" --include="*.tsx" | head -20

echo ""
echo "=== C2: How entities are created from Plantilla ==="
grep -rn "createEntit\|insertEntit\|entityAgent\|EntityAgent" web/src/ --include="*.ts" --include="*.tsx" | head -20

echo ""
echo "=== C3: Execute pipeline — entity processing ==="
grep -rn "processEntity\|entityMap\|entity.*processing\|processing.*order" web/src/app/api/import/sci/execute/ --include="*.ts" -A 5 | head -40

echo ""
echo "=== C4: What does 'No entity_identifier binding found' mean? ==="
grep -rn "No entity_identifier\|entity_identifier binding" web/src/ --include="*.ts" --include="*.tsx" -B 3 -A 3

echo ""
echo "=== C5: Convergence — input_bindings state ==="
grep -rn "input_bindings\|inputBindings" web/src/ --include="*.ts" --include="*.tsx" | head -20

echo ""
echo "=== C6: Rule set in database — check input_bindings ==="
echo "MANUAL CHECK: Andrew will verify rule_set input_bindings in Supabase"

echo ""
echo "================================================"
echo "SECTION D: DISPLAY LABELS"
echo "================================================"

echo ""
echo "=== D1: Where 'Operational' label comes from ==="
grep -rn "Operational\|operational" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -20

echo ""
echo "=== D2: Classification to display label mapping ==="
grep -rn "displayLabel\|display_label\|classificationLabel\|getLabel\|typeLabel" web/src/ --include="*.ts" --include="*.tsx" | head -20

echo ""
echo "=== D3: Import summary component ==="
grep -rn "import.*summary\|ImportSummary\|importSummary\|WhatWasImported" web/src/ --include="*.ts" --include="*.tsx" | head -10
echo "--- Full component ---"
SUMMARY_FILE=$(grep -rln "ImportSummary\|WhatWasImported\|WHAT WAS IMPORTED" web/src/ --include="*.tsx" 2>/dev/null | head -1)
if [ -n "$SUMMARY_FILE" ]; then
  echo "File: $SUMMARY_FILE"
  grep -n "Operational\|classification\|data_type\|dataType\|sheet.*type\|type.*label" "$SUMMARY_FILE" | head -20
fi

echo ""
echo "================================================"
echo "SECTION E: KOREAN TEST COMPLIANCE"
echo "================================================"

echo ""
echo "=== E1: Surviving nameSignals / field-name matching ==="
grep -rn "AMOUNT_SIGNALS\|containsId\|containsName\|containsDate\|nameSignals\|fieldNameMatch" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -20

echo ""
echo "=== E2: Any remaining language-specific string literals ==="
grep -rn "'nombre'\|'fecha'\|'monto'\|'cantidad'\|'employee'\|'commission'\|'salary'\|'quota'" web/src/lib/ web/src/services/ --include="*.ts" | head -20

echo ""
echo "================================================"
echo "SECTION F: vl_admin CONSOLIDATION VERIFICATION"
echo "================================================"

echo ""
echo "=== F1: Any surviving vl_admin references ==="
VL_COUNT=$(grep -rn "vl_admin" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | wc -l)
echo "vl_admin references remaining: $VL_COUNT"
if [ "$VL_COUNT" -gt 0 ]; then
  grep -rn "vl_admin" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next"
fi

echo ""
echo "=== F2: scope_level references ==="
SCOPE_COUNT=$(grep -rn "scope_level" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | grep -v "// " | wc -l)
echo "Active scope_level references: $SCOPE_COUNT"
if [ "$SCOPE_COUNT" -gt 0 ]; then
  grep -rn "scope_level" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | grep -v "// "
fi
```

**PASTE ALL OUTPUT before proceeding.**

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-098 Phase 0: Comprehensive pipeline diagnostic" && git push origin dev`

---

## PHASE 1: ASSESSMENT AND PLAN

**Based on Phase 0 output, write a structured assessment before any code changes.**

Format:

```
ASSESSMENT
==========

FAILURE 1: HC Not Running in Production
  Root cause: [exact reason from diagnostic]
  Evidence: [file:line references]
  Fix: [specific change]

FAILURE 2: Datos_Flota_Hub Misclassified
  Root cause: [exact reason — likely consequence of Failure 1]
  Evidence: [file:line references]
  Fix: [specific change, or "resolved by Failure 1 fix"]

FAILURE 3: /api/periods on Import Page
  Root cause: [what calls it and why HF-093 didn't fix it]
  Evidence: [file:line references]
  Fix: [specific change]

FAILURE 4: Entity Binding Failure
  Root cause: [why Plantilla shows "No entity_identifier binding found"]
  Evidence: [file:line references]
  Fix: [specific change]

FAILURE 5: "Operational" Display Labels
  Root cause: [where the label comes from]
  Evidence: [file:line references]
  Fix: [specific change]

KOREAN TEST: [PASS/FAIL — list any surviving violations]

vl_admin CONSOLIDATION: [PASS/FAIL — count remaining references]

IMPLEMENTATION ORDER: [ordered list of fixes with dependencies noted]
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-098 Phase 1: Assessment and implementation plan" && git push origin dev`

---

## PHASE 2: IMPLEMENTATION

**Execute fixes in the order determined by Phase 1 assessment.**

Requirements for each fix:
- Reference the exact file:line from Phase 0 diagnostic
- Minimal change — fix the root cause, don't restructure
- After each fix: commit, push, build, verify on localhost

**After ALL fixes are applied:**

```bash
# Full build verification
cd /Users/AndrewAfrica/spm-platform/web
rm -rf .next
npm run build 2>&1 | tail -20
# MUST exit 0

# Dev server
npm run dev &
sleep 5
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/login
# Must be 200
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-098 Phase 2: All fixes implemented" && git push origin dev`

---

## PHASE 3: LOCALHOST VERIFICATION

```bash
echo "============================================"
echo "HF-098 PHASE 3: LOCALHOST VERIFICATION"
echo "============================================"

echo ""
echo "=== V1: HC runs on localhost ==="
echo "Import Meridian XLSX on localhost. Check terminal output for [SCI-HC-DIAG] entries."
echo "Expected: HC returns column roles with confidence values for all 3 sheets."

echo ""
echo "=== V2: Zero /api/periods calls on import ==="
echo "Check browser Network tab during import flow."
echo "Expected: ZERO requests to /api/periods"

echo ""
echo "=== V3: Classification labels ==="
echo "After import, check sheet labels."
echo "Expected: Datos_Rendimiento = Transaction, Datos_Flota_Hub = Reference, Plantilla = Entity"

echo ""
echo "=== V4: Entity binding ==="
echo "Expected: Plantilla shows entity count > 0, NOT 'No entity_identifier binding found'"

echo ""
echo "=== V5: vl_admin consolidation ==="
VL_COUNT=$(grep -rn "vl_admin" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | wc -l)
echo "vl_admin references: $VL_COUNT (must be 0)"

echo ""
echo "=== V6: scope_level consolidation ==="
SCOPE_COUNT=$(grep -rn "scope_level" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | grep -v "// " | wc -l)
echo "scope_level references: $SCOPE_COUNT (must be 0)"

echo ""
echo "=== V7: Build clean ==="
cd /Users/AndrewAfrica/spm-platform/web
rm -rf .next
npm run build 2>&1 | tail -5
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-098 Phase 3: Localhost verification complete" && git push origin dev`

---

## PHASE 4: COMPLETION + PR

```bash
cd /Users/AndrewAfrica/spm-platform
gh pr create --base main --head dev \
  --title "HF-098: Comprehensive pipeline fix — HC production, periods leak, entity binding, display labels" \
  --body "## Problem
Five compounding failures discovered in CLT-160 production testing:
1. HC not running in production (Decision 108 not enforced)
2. Datos_Flota_Hub misclassified (consequence of #1)
3. /api/periods still called on import page (Decision 92 violation, HF-093 regression)
4. Plantilla entity binding failure (zero entities created)
5. Display labels showing 'Operational' for all sheet types

## Root Causes
[CC fills from Phase 1 assessment]

## Fixes Applied
[CC fills from Phase 2 implementation]

## Verification
- Localhost: HC runs, correct classification, zero /api/periods calls, entities created
- Zero vl_admin references
- Zero scope_level references
- Build clean

## PRODUCTION VERIFICATION REQUIRED (Andrew post-merge)
See production verification section below.

## CC Failure Patterns Addressed
- FP-49: SQL Verification Gate enforced
- Pattern 45: Comprehensive diagnostic before action
- Pattern 33: Localhost PASS ≠ production PASS"
```

---

## WHAT NOT TO DO

1. **DO NOT fix one failure and submit.** All five must be diagnosed and fixed together.
2. **DO NOT skip Phase 0.** Complete diagnostic before any code change.
3. **DO NOT skip Phase 1.** Written assessment with file:line evidence before implementation.
4. **DO NOT reference scope_level anywhere.** The column is `role`.
5. **DO NOT reference vl_admin anywhere.** The canonical role value is `platform`.
6. **DO NOT write SQL without checking SCHEMA_REFERENCE_LIVE.md.** FP-49.
7. **DO NOT mark any finding ✅ in the completion report.** Only Andrew can mark findings resolved after production verification.
8. **DO NOT assume HC works because it works on localhost.** The Anthropic API key must be verified in the production environment.
9. **DO NOT add /api/periods calls to any import-related code.** Decision 92: period is a calculation parameter, not import context.
10. **DO NOT use nameSignals or field-name matching patterns.** Korean Test (AP-25).

---

## ANDREW: PRODUCTION VERIFICATION (POST-MERGE)

**After merging this PR and Vercel deploy completes, Andrew performs these checks:**

### PV-1: HC Running in Production
- Re-import Meridian XLSX on vialuce.ai
- Check Vercel Runtime Logs for `[SCI-HC-DIAG]` entries
- **PASS:** HC entries present with confidence values for all 3 sheets
- **FAIL:** No `[SCI-HC-DIAG]` entries → Anthropic API key issue in Vercel env vars

### PV-2: Classification Correct
- Check Vercel Runtime Logs for `[SCI-SCORES-DIAG]` entries
- **PASS:** Datos_Flota_Hub winner = reference. Datos_Rendimiento winner = transaction. Plantilla winner = entity.
- **FAIL:** Any sheet misclassified → HC Override not working

### PV-3: Zero /api/periods on Import
- Open browser Network tab, filter for "periods"
- Navigate to import page and import the file
- **PASS:** Zero requests to /api/periods during entire import flow
- **FAIL:** Any /api/periods request → Decision 92 regression

### PV-4: Entity Binding
- Check import summary after import
- **PASS:** Plantilla shows entity count > 0, "Entities matched" > 0
- **FAIL:** "No entity_identifier binding found" → entity binding logic broken

### PV-5: Display Labels
- Check import summary sheet labels
- **PASS:** Datos_Rendimiento = "Transaction", Datos_Flota_Hub = "Reference", Plantilla = "Entity" (or "Team Roster")
- **FAIL:** Any sheet showing "Operational" → display label mapping broken

### PV-6: Database Verification
Run in Supabase SQL Editor:
```sql
SELECT 'entities' AS tbl, COUNT(*) AS cnt
FROM entities WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
UNION ALL
SELECT 'committed_data', COUNT(*) FROM committed_data
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
UNION ALL
SELECT 'classification_signals', COUNT(*) FROM classification_signals
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
UNION ALL
SELECT 'reference_data', COUNT(*) FROM reference_data
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
```
- **PASS:** entities > 0, committed_data > 0, classification_signals > 0, reference_data > 0
- **FAIL:** Any table at 0 → corresponding pipeline step failed

**Only after ALL six PV checks pass can findings be marked ✅.**
