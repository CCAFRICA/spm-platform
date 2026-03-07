# HF-094: DUPLICATE RULE SET CLEANUP + SIGNAL WRITE PATH FIX
## CLT-160 Diagnostic Issues #1 and #3
## Type: Hotfix — P0 (duplicate blocks convergence) + P1 (signal path regression)
## Evidence: CLT-160 Diagnostic Report — duplicate rule_sets, HF-092 dedicated columns not populated

---

## AUTONOMY DIRECTIVE
NEVER ask yes/no. NEVER say "shall I". Just act. Execute all phases sequentially. Commit after each phase. Push after each commit.

---

## READ FIRST

1. `CC_STANDING_ARCHITECTURE_RULES.md`
2. `web/src/lib/sci/classification-signal-service.ts` — Phase E's writeClassificationSignal (dedicated columns)

---

## THE PROBLEMS

### Problem 1: Duplicate Rule Set (P0)
Two rule_sets with identical name "Meridian Logistics Group Incentive Plan 2025":
- `465ecdad-b471-4be1-b166-5f41964b10f9` (March 5 — stale, from prior session)
- `022b0e46-2968-451e-8634-fc7877912649` (March 7 — current, from CLT-160)

Convergence and calculation may bind to the wrong rule_set. The older one must be deleted.

### Problem 2: Signal Write Path Regression (P1 — Scale violation)
HF-092 corrected the classification signal service to write to dedicated indexed columns instead of `signal_value` JSONB. But the CLT-160 diagnostic shows plan import signals are STILL writing to JSONB, not dedicated columns.

This means the plan pipeline's signal write path is NOT going through Phase E's `writeClassificationSignal`. There are multiple signal write paths in the codebase (AP-32 violation) and HF-092 only fixed one.

---

## PHASE 0: DIAGNOSTIC

```bash
# 1. Find ALL signal write functions in the codebase
grep -rn "classification_signals.*insert\|\.from.*classification_signals\|captureSignal\|writeSignal\|persistSignal\|writeClassificationSignal" \
  web/src/lib/ web/src/app/api/ --include="*.ts" | grep -v node_modules | head -30

# 2. How does the plan pipeline write signals?
grep -B 5 -A 20 "signal\|Signal\|classification_signal" \
  web/src/app/api/import/sci/execute/route.ts | grep -i "plan\|signal" | head -20

# 3. Which signal write function does execute route import?
grep -n "import.*signal\|import.*Signal\|from.*signal" \
  web/src/app/api/import/sci/execute/route.ts | head -10

# 4. Does the execute route use writeClassificationSignal (Phase E) or something else?
grep -n "writeClassificationSignal\|captureSignal\|persistSignalBatch\|signalService" \
  web/src/app/api/import/sci/execute/route.ts | head -10

# 5. Find ALL functions that write to classification_signals table
grep -rn "from('classification_signals')\|into.*classification_signals" \
  web/src/lib/ web/src/app/api/ --include="*.ts" | head -15

# 6. What did the plan import actually write?
# Run in Supabase SQL Editor:
# SELECT id, signal_type, 
#   source_file_name, classification, decision_source, scope,
#   signal_value IS NOT NULL as has_old_jsonb,
#   structural_fingerprint IS NOT NULL as has_new_fingerprint,
#   classification_trace IS NOT NULL as has_new_trace
# FROM classification_signals 
# WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
# ORDER BY created_at DESC LIMIT 10;
```

Paste ALL output. Identify:
- Which signal write function the plan pipeline uses
- Whether it's the Phase E `writeClassificationSignal` or an older function
- All other signal write functions that bypass HF-092's dedicated columns

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-094 Phase 0: Diagnostic — dual signal write paths + duplicate rule_set" && git push origin dev`

---

## PHASE 1: DELETE DUPLICATE RULE SET

Execute in Supabase SQL Editor:

```sql
-- Verify the stale rule_set has no dependent data
SELECT 
  (SELECT count(*) FROM rule_set_assignments WHERE rule_set_id = '465ecdad-b471-4be1-b166-5f41964b10f9') as assignments,
  (SELECT count(*) FROM calculation_batches WHERE rule_set_id = '465ecdad-b471-4be1-b166-5f41964b10f9') as batches,
  (SELECT count(*) FROM calculation_results WHERE rule_set_id = '465ecdad-b471-4be1-b166-5f41964b10f9') as results;

-- If all zeros, safe to delete
DELETE FROM rule_sets WHERE id = '465ecdad-b471-4be1-b166-5f41964b10f9';

-- Verify only one rule_set remains
SELECT id, name, created_at FROM rule_sets 
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
```

**Note:** This SQL must be run manually in Supabase SQL Editor. CC cannot execute it. Include the commands in the completion report with expected results.

### Proof Gates — Phase 1
- PG-01: Stale rule_set has zero dependent data (assignments, batches, results)
- PG-02: DELETE executed (or documented for Andrew to execute)
- PG-03: Only one rule_set remains for Meridian

---

## PHASE 2: FIX SIGNAL WRITE PATHS

Based on Phase 0 findings, consolidate all signal write paths to use Phase E's `writeClassificationSignal` with HF-092 dedicated columns.

### What to do:

1. **Identify every function that writes to classification_signals** (Phase 0 command #1 and #5)
2. **For each function that is NOT `writeClassificationSignal`:**
   - Determine if it's called from the SCI pipeline (execute, analyze, converge)
   - If yes: replace the call with `writeClassificationSignal`
   - If no (e.g., OB-86 plan anomaly signals): leave it — those use signal_value intentionally
3. **Verify the execute route's signal write** (Phase 0 commands #3 and #4):
   - If it imports `writeClassificationSignal` but also uses another function: remove the other
   - If it imports an older function: switch to `writeClassificationSignal`
4. **Verify convergence signals** (Phase G upgraded to Phase E service — confirm still wired)

### Single Source of Truth for SCI Signals
After this fix, there must be ONE function that writes SCI signals: `writeClassificationSignal` from `classification-signal-service.ts`. All SCI signal writes (classification, convergence, plan interpretation) must go through this function. No exceptions. AP-32.

### Proof Gates — Phase 2
- PG-04: ALL SCI signal writes use `writeClassificationSignal` (grep verification)
- PG-05: ZERO direct `classification_signals` inserts outside of `writeClassificationSignal` for SCI data
- PG-06: Non-SCI signals (OB-86 plan anomaly, etc.) may still use old path — that's acceptable
- PG-07: `npm run build` exits 0

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-094 Phase 2: Consolidate signal write paths — single writeClassificationSignal for all SCI signals" && git push origin dev`

---

## PHASE 3: VERIFY + PR

```bash
kill dev server
rm -rf .next
npm run build
npm run dev

# Verify writeClassificationSignal is the only SCI signal writer
grep -rn "classification_signals.*insert\|from('classification_signals')" \
  web/src/lib/sci/ web/src/app/api/import/sci/ web/src/app/api/intelligence/ --include="*.ts" | head -10
# Should show ONLY writeClassificationSignal in classification-signal-service.ts

# Verify execute route uses writeClassificationSignal
grep -n "writeClassificationSignal" web/src/app/api/import/sci/execute/route.ts | head -5

# Verify no other signal write functions imported in execute route
grep -n "captureSignal\|persistSignal\|signalService\|signal_value" \
  web/src/app/api/import/sci/execute/route.ts | grep -v "// " | head -5
# Should return ZERO for non-writeClassificationSignal signal functions
```

```bash
cd /Users/AndrewAfrica/spm-platform
gh pr create --base main --head dev \
  --title "HF-094: Duplicate rule_set cleanup + signal write path consolidation" \
  --body "## Problem 1: Duplicate Rule Set
Two rule_sets with same name from different sessions. Older one (465ecdad, March 5) deleted.
Only current rule_set (022b0e46, March 7) remains.

## Problem 2: Signal Write Path Regression
Plan import signals writing to signal_value JSONB instead of HF-092 dedicated columns.
Root cause: multiple signal write functions in codebase (AP-32).
Fix: all SCI signal writes consolidated to writeClassificationSignal (Phase E service).
Non-SCI signals (OB-86 plan anomaly) unaffected.

## Standing Rule 2 Compliance
All SCI signals now write to indexed dedicated columns.
Zero JSONB blob writes for SCI data."
```

### Proof Gates — Phase 3
- PG-08: `npm run build` exits 0
- PG-09: localhost:3000 responds
- PG-10: Single SCI signal write function (grep verification)
- PG-11: PR created

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-094 Complete: Duplicate cleanup + signal path consolidation" && git push origin dev`

---

## COMPLETION REPORT ENFORCEMENT

File: `HF-094_COMPLETION_REPORT.md` in PROJECT ROOT.

### Report Structure
1. **Phase 0 diagnostic** — paste all 6 command outputs
2. **Signal write functions found** — list every function that writes to classification_signals
3. **Which functions were updated** — before/after for each
4. **Duplicate rule_set** — deletion SQL + verification
5. **Proof gates** — 11 gates, each PASS/FAIL with pasted evidence

---

*HF-094: "One table. One write function. One set of indexed columns. Everything else is a shortcut that becomes a redesign."*
