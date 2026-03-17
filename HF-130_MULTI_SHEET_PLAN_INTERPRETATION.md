# HF-130: SCI Execute — Multi-Sheet Plan Interpretation
# Classification: HF (Hotfix)
# Fixes: 3 empty rule_sets created instead of 1 interpreted plan with 4 components
# Date: March 14, 2026
# PR Target: dev → main

---

## AUTONOMY DIRECTIVE
NEVER ask yes/no. NEVER say "shall I." NEVER pause for confirmation. Execute every phase sequentially.

---

## CC_STANDING_ARCHITECTURE_RULES.md
**READ THIS FILE FIRST.** All rules apply. Key rules: commit+push per phase, build after push, evidence in completion report, git from repo root.

---

## THE PROBLEM (VERIFIED FROM VERCEL LOGS)

SCI execute processes each plan-classified sheet as an independent plan:

```
[SCI Execute] Plan interpretation starting for Plan General
[interpretationToPlanConfig] 1 variants created
[SCI Execute] Plan saved: Unnamed Plan (...), 1 variants, 0 components

[SCI Execute] Plan interpretation starting for Tablas de Tasas
[interpretationToPlanConfig] 1 variants created
[SCI Execute] Plan saved: Unnamed Plan (...), 1 variants, 0 components

[SCI Execute] Plan interpretation starting for Metas Mensuales
[interpretationToPlanConfig] 1 variants created
[SCI Execute] Plan saved: Unnamed Plan (...), 1 variants, 0 components
```

Result: 3 empty rule_sets instead of 1 interpreted plan with 4 components.

**Root cause:** The BCL plan file has 3 sheets that together define ONE plan:
- Plan General = overview (structure, roles, component descriptions)
- Tablas de Tasas = rate tables (C1 matrix, C2 tiers)
- Metas Mensuales = monthly targets (C3/C4 rates)

The AI interpreter needs ALL sheets as context for a single call. Sending "Plan General" alone (10 rows of overview text) gives the AI nothing to extract rate tables from — those are on "Tablas de Tasas."

**How the working path does it:** The Configure → Plan Import path (used for Meridian PPTX, and for previously seeded plans) sends the entire document to the AI interpreter as a single call. SCI execute must do the same for multi-sheet XLSX plan files.

---

## SCHEMA REFERENCE

### rule_sets (from SCHEMA_REFERENCE_LIVE.md)
```
id              uuid    NOT NULL  DEFAULT uuid_generate_v4()
tenant_id       uuid    NOT NULL
name            text    NOT NULL
status          text    NOT NULL  DEFAULT 'draft'
components      jsonb   NOT NULL
created_at      timestamptz
updated_at      timestamptz
```

### BCL Tenant
- ID: b1c2d3e4-aaaa-bbbb-cccc-111111111111
- File in storage: b1c2d3e4-aaaa-bbbb-cccc-111111111111/1773453099188_BCL_Plan_Comisiones_2025.xlsx
- Currently has 3 empty rule_sets (from the broken run) — delete these first.

---

## CC FAILURE PATTERNS TO PREVENT

| # | Pattern | Prevention |
|---|---------|-----------|
| FP-21 | Dual code path | Do NOT create a new plan interpretation function. Reuse the existing one that works for Meridian. |
| FP-69 | Fix one thing, leave others | The fix must handle ANY multi-sheet XLSX classified as plan — not just BCL. |
| FP-66 | Seeding instead of importing | The plan MUST come through AI interpretation. Do not seed components. |
| FP-71 | Button gate blocks API | After fixing, the full chain must work: upload → classify → confirm → execute → interpret → rule_set with components. |

---

## PHASE 0: CODE TRACE — ZERO CODE CHANGES

### 0A: Find how SCI execute iterates over plan content units
```bash
grep -n "executePlanPipeline\|Plan.*content.unit\|contentType.*plan\|for.*contentUnit\|forEach.*contentUnit" web/src/app/api/import/sci/execute/route.ts | head -20
```
Paste the full output. We need to see: does execute loop over content units and call the interpreter per-unit? Or does it batch them?

### 0B: Find the existing working plan interpreter entry point
```bash
grep -rn "interpretPlan\|planInterpreter\|interpret.*plan\|AIService.*plan\|plan.*interpret" web/src/lib/ --include="*.ts" | head -20
```
Paste the full output. This is the function that works for Meridian.

### 0C: Find how the working path sends multi-sheet data to the interpreter
```bash
grep -rn "sheets\|allSheets\|workbook\|documentData\|fileContent" web/src/lib/ai/ --include="*.ts" | head -20
```
Paste the full output.

### 0D: Look at what interpretationToPlanConfig receives and returns
```bash
grep -n "interpretationToPlanConfig\|function.*PlanConfig\|toPlanConfig" web/src/ -r --include="*.ts" | head -10
```
Then read the function (±30 lines). Paste the code.

### 0E: Check what the AI interpreter prompt expects as input
The interpreter should receive the FULL document content (all sheets) so it can cross-reference rate tables with component descriptions. Find the prompt or the input construction:
```bash
grep -rn "interpretPlan\|plan.*prompt\|system.*plan\|You are.*plan" web/src/lib/ai/ --include="*.ts" | head -10
```

**Commit:** `git add -A && git commit -m "HF-130 Phase 0: Multi-sheet plan interpretation trace" && git push origin dev`

---

## PHASE 1: FIX — BATCH ALL PLAN SHEETS INTO ONE INTERPRETATION CALL

Based on Phase 0 findings, implement the fix. The fix MUST:

1. **Identify all plan-classified content units from the same file** in the execute pipeline
2. **Combine their sheet data into a single document payload** before calling the interpreter
3. **Make ONE AI interpretation call** with all sheet data as context
4. **Create ONE rule_set** with the components extracted from the combined interpretation
5. **Skip individual per-sheet interpretation** for plan-classified units when multiple plan sheets come from the same file
6. **Reuse the existing interpreter function** — do not create a new one

### Expected flow after fix:
```
Execute receives 3 plan content units (Plan General, Tablas de Tasas, Metas Mensuales)
  → Detects all 3 are plan-classified from the same file
  → Combines sheet data into single document context
  → ONE call to AI plan interpreter with all 3 sheets
  → ONE rule_set created with 4 components (C1, C2, C3, C4)
  → Remaining 2 units marked as "included in plan interpretation" (not independently processed)
```

### CRITICAL: Clean up stale data first
Before testing, delete the 3 empty rule_sets from BCL:
```sql
DELETE FROM rule_sets 
WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
```
Include this cleanup in the Phase 1 implementation notes.

**Commit:** `git add -A && git commit -m "HF-130 Phase 1: Batch plan sheets into single interpretation call" && git push origin dev`

---

## PHASE 2: BUILD + VERIFY

### 2A: Clean build
```bash
cd web && rm -rf .next && npm run build
```
Must exit 0. Paste output.

### 2B: Verify single interpretation call path exists
```bash
grep -n "batch\|combine\|group\|merge.*plan\|allSheets\|planUnits" web/src/app/api/import/sci/execute/route.ts | head -10
```
Paste output.

### 2C: Verify only ONE rule_set will be created per file (not per sheet)
Look at the code path and confirm the loop creates one rule_set, not N.

**Commit:** `git add -A && git commit -m "HF-130 Phase 2: Build verification" && git push origin dev`

---

## PHASE 3: CREATE PR

```bash
gh pr create --base main --head dev \
  --title "HF-130: Multi-sheet plan interpretation — batch all plan sheets into single AI call" \
  --body "## Problem
SCI execute sends each plan-classified sheet to the AI interpreter independently.
A 3-sheet plan (overview + rate tables + targets) produces 3 empty rule_sets instead
of 1 interpreted plan with 4 components.

## Root Cause
executePlanPipeline loops per content unit. The AI interpreter needs all sheets as
context to cross-reference component descriptions with rate tables.

## Fix
When multiple content units from the same file are classified as plan, batch them
into a single interpretation call. Create one rule_set from the combined result.

## Verification
BCL plan import: 3 sheets → 1 rule_set with 4 components (C1, C2, C3, C4)."
```

**Commit:** `git add -A && git commit -m "HF-130 Phase 3: Completion report + PR" && git push origin dev`

---

## PROOF GATES — HARD

| # | Criterion | How to Verify |
|---|-----------|---------------|
| PG-01 | Plan content units from same file are batched before interpretation | Paste the grouping/batching code |
| PG-02 | ONE AI call made for multi-sheet plan (not N calls) | Paste the code showing single call with combined sheets |
| PG-03 | ONE rule_set created per file (not per sheet) | Paste the code showing single insert |
| PG-04 | Existing plan interpreter function reused (not new one created) | Paste the import/call showing reuse |
| PG-05 | Build exits 0 | Paste build output |

## PROOF GATES — SOFT

| # | Criterion | How to Verify |
|---|-----------|---------------|
| PG-S1 | Works for single-sheet plan files too (no regression) | Code shows fallback for single plan unit |
| PG-S2 | Non-plan content units unaffected by the batching logic | Paste code showing plan-only grouping |

---

## COMPLETION REPORT ENFORCEMENT

- File: `HF-130_COMPLETION_REPORT.md` in PROJECT ROOT
- Created BEFORE final build verification
- VERBATIM proof gate criteria with PASS/FAIL and PASTED evidence
- If this file does not exist at batch end, the batch is INCOMPLETE.

---

## PRODUCTION VERIFICATION (FOR ANDREW — AFTER PR MERGE)

1. Delete the 3 empty BCL rule_sets:
```sql
DELETE FROM rule_sets 
WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
```

2. Login as Patricia on vialuce.ai → /operate/import
3. Re-upload BCL_Plan_Comisiones_2025.xlsx (or re-confirm if still in queue)
4. Verify Vercel logs show ONE interpretation call (not 3)
5. Verify in Supabase:
```sql
SELECT id, name, status, components
FROM rule_sets 
WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
```
Should show 1 rule_set with components containing C1, C2, C3, C4.

6. If components present → /operate/calculate → Calculate October 2025 → verify against GT $44,590

---

*"One plan file. Three sheets. One interpretation. One rule_set. Four components."*

*vialuce.ai — Intelligence. Acceleration. Performance.*
