# HF-132: SCI Execute — Auto-Activate Plan Rule Sets on Creation
# Classification: HF (Hotfix)
# Fixes: Decision 114 gap — plan created as 'draft', no activation UI, Calculate filters for 'active'
# Date: March 14, 2026
# PR Target: dev → main

---

## AUTONOMY DIRECTIVE
NEVER ask yes/no. NEVER say "shall I." NEVER pause for confirmation. Execute every phase sequentially.

---

## CC_STANDING_ARCHITECTURE_RULES.md
**READ THIS FILE FIRST.** All rules apply.

### Key Rules for This HF
1. Commit + push after every phase.
2. After every push: kill dev → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000.
3. Fix logic, not data (Rule 11). Do NOT activate plans via SQL.
4. Evidence = paste code/output (Rule 27).
5. One commit per phase (Rule 28).
6. Git from repo root (spm-platform), NOT web/.

---

## SCHEMA REFERENCE (from SCHEMA_REFERENCE_LIVE.md)

### rule_sets
```
id              uuid      NOT NULL  DEFAULT uuid_generate_v4()
tenant_id       uuid      NOT NULL
name            text      NOT NULL
description     text      YES
status          text      NOT NULL  DEFAULT 'draft'
version         integer   NOT NULL  DEFAULT 1
effective_from  date      YES
effective_to    date      YES
population_config jsonb   NOT NULL
input_bindings  jsonb     NOT NULL
components      jsonb     NOT NULL
cadence_config  jsonb     NOT NULL
outcome_config  jsonb     NOT NULL
metadata        jsonb     NOT NULL
created_by      uuid      YES
approved_by     uuid      YES
created_at      timestamptz NOT NULL DEFAULT now()
updated_at      timestamptz NOT NULL DEFAULT now()
```

**CRITICAL:** `status` is unconstrained TEXT with DEFAULT 'draft'. No enum. No check constraint. The Calculate page filters for `status = 'active'`. There is NO UI to change status from 'draft' to 'active'. This is the dead end.

### VL Admin
- platform@vialuce.com, UUID 9c179b53, role='platform', tenant_id NULL
- Must survive ALL destructive operations.

### BCL Tenant
- ID: b1c2d3e4-aaaa-bbbb-cccc-111111111111
- Current rule_sets: 1 correct (d299b413, 'Banco Cumbre del Litoral - Retail Banking Commission Plan 2025-2026', status='draft', 2 variants, 8 components) + 3 stale drafts from prior broken runs
- 85 entities, 170 committed_data rows, 0 calculation_results, 0 rule_set_assignments

---

## THE PROBLEM

SCI execute creates plan rule_sets with `status = 'draft'` (the database default). The Calculate page queries `rule_sets WHERE status = 'active'`. No UI exists to change status. The tenant admin successfully imports a plan through the browser, sees "Import Complete," navigates to Calculate, and sees nothing — the plan is invisible to the calculation pipeline.

This is Decision 114 (identified March 9, 2026): "Plan status 'draft' should not block calculation. Calculate page filters for status='active' but no UI exists to activate plans."

This gap means the vertical slice is broken: Patricia can import a plan but cannot calculate. The only workaround is manual SQL — which violates the vertical slice rule.

---

## THE FIX

Two changes, both required:

### Change 1: SCI execute sets status='active' when saving a plan rule_set
When the AI interpreter successfully produces components and the rule_set is saved, set `status = 'active'` instead of relying on the database default 'draft'. The admin confirmed the classification, the AI interpreted it, the plan is ready.

### Change 2: SCI execute deactivates prior rule_sets for the same tenant
When creating a new active rule_set, set any existing `status = 'active'` rule_sets for the same tenant to `status = 'superseded'`. This prevents multiple active plans from confusing the engine. Only the most recently imported plan is active.

**Why not add an activation UI instead?** Because activation without review adds a step that provides no value. The admin already confirmed the classification. The AI interpreted it. Adding a "click to activate" button is a gate without purpose — it exists only because the code defaults to 'draft'. If we want a review/approval workflow in the future, it should be designed properly (DS-007 Evaluation Experience), not bolted on as a status toggle.

---

## CC FAILURE PATTERNS TO PREVENT

| # | Pattern | Prevention |
|---|---------|-----------|
| FP-66 | Seeding / manual SQL workaround | The plan activates through code, not SQL. Andrew's production verification contains ZERO data-modifying SQL. |
| FP-69 | Fix one thing, leave others | Both changes (set active + supersede prior) are required. Fixing only the status without handling prior plans leaves stale active plans. |
| FP-70 | Phase deferral as completion | This HF is not complete until Calculate shows the plan AND the engine can run. |
| FP-49 | Schema fabrication | All column names verified against SCHEMA_REFERENCE_LIVE.md above. status is TEXT, not enum. |

---

## PHASE 0: CODE TRACE — ZERO CODE CHANGES

### 0A: Find where rule_sets are created in SCI execute
```bash
grep -n "rule_sets.*insert\|rule_sets.*upsert\|from('rule_sets')" web/src/app/api/import/sci/execute/route.ts
```
Paste the FULL output with line numbers.

### 0B: Find the current status value being set
```bash
grep -n "status.*draft\|status.*active\|status:" web/src/app/api/import/sci/execute/route.ts | head -10
```
Paste the output. We expect to see `status: 'draft'` or no status field (relying on DB default).

### 0C: Find how Calculate page queries rule_sets
```bash
grep -rn "rule_sets.*active\|status.*active\|rule_set.*status" web/src/app/operate/calculate/ --include="*.ts" --include="*.tsx"
```
Paste the output. This confirms the active filter exists.

### 0D: Find any other paths that create rule_sets (non-SCI)
```bash
grep -rn "from('rule_sets').*insert\|from('rule_sets').*upsert" web/src/ --include="*.ts" | grep -v "node_modules"
```
Paste the output. If other paths create rule_sets (e.g., Configure → Plan Import), they may also need the auto-activate fix.

### 0E: Check if there's a plan activation API or UI anywhere
```bash
grep -rn "activate.*plan\|plan.*activate\|status.*active.*rule" web/src/ --include="*.ts" --include="*.tsx" | grep -v "node_modules" | head -10
```
Paste the output. If an activation mechanism exists, we should use it. If not, we're confirming the Decision 114 gap.

**Commit:** `git add -A && git commit -m "HF-132 Phase 0: Plan activation gap diagnostic" && git push origin dev`

---

## PHASE 1: IMPLEMENT AUTO-ACTIVATION

### 1A: In SCI execute — set status='active' when saving a plan rule_set
Find the `.upsert()` or `.insert()` call for rule_sets and change `status: 'draft'` (or add `status: 'active'` if no status field is set).

### 1B: In SCI execute — supersede prior active rule_sets
Before the insert/upsert, add:
```typescript
// Deactivate any existing active rule_sets for this tenant
await supabase
  .from('rule_sets')
  .update({ status: 'superseded', updated_at: new Date().toISOString() })
  .eq('tenant_id', tenantId)
  .eq('status', 'active');
```

### 1C: If Phase 0D reveals other creation paths (Configure → Plan Import), apply the same auto-activate logic there too. Do NOT create a dual standard where SCI activates but Configure doesn't.

### 1D: Verify the Calculate page's active filter will now find the rule_set. Do NOT modify the Calculate page query — the query is correct (only active plans should be calculated). The fix is at the source (creation), not the consumer (calculate).

**Commit:** `git add -A && git commit -m "HF-132 Phase 1: Auto-activate plan on SCI import + supersede prior" && git push origin dev`

---

## PHASE 2: BUILD + VERIFY

### 2A: Clean build
```bash
cd web && rm -rf .next && npm run build
```
Must exit 0. Paste output.

### 2B: Verify status='active' in the code
```bash
grep -n "status.*active" web/src/app/api/import/sci/execute/route.ts
```
Paste output showing the active status set.

### 2C: Verify supersede logic exists
```bash
grep -n "superseded\|deactivate\|prior.*rule" web/src/app/api/import/sci/execute/route.ts
```
Paste output showing the supersede update.

### 2D: Verify Calculate page query unchanged
```bash
grep -n "active" web/src/app/operate/calculate/ -r --include="*.ts" --include="*.tsx"
```
Paste output confirming the active filter still exists (not removed as a shortcut).

**Commit:** `git add -A && git commit -m "HF-132 Phase 2: Build verification" && git push origin dev`

---

## PHASE 3: CREATE PR

```bash
gh pr create --base main --head dev \
  --title "HF-132: Auto-activate plan rule_sets on SCI import" \
  --body "## Problem
SCI execute creates rule_sets with status='draft'. Calculate page filters for
status='active'. No UI exists to activate plans. Tenant admin imports a plan
successfully but cannot calculate — the plan is invisible to the engine.

## Root Cause
Database default is 'draft'. SCI execute relies on the default. Decision 114
identified this gap on March 9 but it was never resolved.

## Fix
1. SCI execute sets status='active' when saving an AI-interpreted plan
2. Prior active rule_sets for the same tenant set to 'superseded'
3. Calculate page query unchanged — it correctly filters for active plans

## Vertical Slice Completion
After this HF: Patricia uploads plan → auto-active → Calculate shows plan →
engine runs → results verified against GT.
Zero manual SQL required for the complete user journey."
```

**Commit:** `git add -A && git commit -m "HF-132 Phase 3: Completion report + PR" && git push origin dev`

---

## PROOF GATES — HARD

| # | Criterion | How to Verify |
|---|-----------|---------------|
| PG-01 | rule_set created with status='active' (not 'draft') | Paste code showing status: 'active' in insert/upsert |
| PG-02 | Prior active rule_sets superseded before new creation | Paste code showing UPDATE status='superseded' WHERE status='active' |
| PG-03 | Calculate page query NOT modified (still filters for active) | Paste grep showing active filter unchanged |
| PG-04 | Build exits 0 | Paste build output |
| PG-05 | VL Admin profile unchanged | Read-only: `SELECT email, role, tenant_id FROM profiles WHERE email = 'platform@vialuce.com'` |

## PROOF GATES — SOFT

| # | Criterion | How to Verify |
|---|-----------|---------------|
| PG-S1 | Other rule_set creation paths also auto-activate | Paste grep from Phase 0D showing all paths checked |
| PG-S2 | Supersede uses tenant_id scoping (not global) | Paste code showing .eq('tenant_id', tenantId) |

---

## COMPLETION REPORT ENFORCEMENT

- File: `HF-132_COMPLETION_REPORT.md` in PROJECT ROOT
- Created BEFORE final build verification
- VERBATIM proof gate criteria with PASS/FAIL and PASTED evidence
- If this file does not exist at batch end, the batch is INCOMPLETE.

---

## PRODUCTION VERIFICATION (FOR ANDREW — AFTER PR MERGE)

**ZERO data-modifying SQL in this section. Read-only queries only.**

### Step 1: Verify existing BCL rule_sets
```sql
SELECT id, name, status, created_at
FROM rule_sets
WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
ORDER BY created_at DESC;
```
The most recent rule_set (from the HF-131 import) should still be 'draft' — HF-132 only affects NEW imports.

### Step 2: Re-import plan to trigger auto-activation
Login as Patricia → /operate/import → upload BCL_Plan_Comisiones_2025.xlsx → Confirm all

### Step 3: Verify auto-activation
```sql
SELECT id, name, status, created_at
FROM rule_sets
WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
ORDER BY created_at DESC;
```
Expected: newest rule_set has `status = 'active'`. All prior rule_sets have `status = 'superseded'` or `status = 'draft'`.

### Step 4: Navigate to /operate/calculate
The active plan should be visible. Click Calculate for October 2025.

### Step 5: Verify result
GT target: **$44,590** for October 2025.

### Step 6: Verify Meridian not regressed
Login as Meridian admin → verify MX$185,063 still holds.

---

*"The admin confirmed the classification. The AI interpreted it. The plan is ready. 'Draft' with no activation path is a dead end, not a safety gate."*

*vialuce.ai — Intelligence. Acceleration. Performance.*
