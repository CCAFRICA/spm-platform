# HF-133: Remove Plan "Already Exists" Early Return
# Classification: HF (Hotfix)
# Fixes: "Plan already exists" short-circuit bypasses auto-activate and prevents re-import
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
3. Fix logic, not data (Rule 11).
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
components      jsonb     NOT NULL
metadata        jsonb     NOT NULL
created_by      uuid      YES
created_at      timestamptz NOT NULL DEFAULT now()
updated_at      timestamptz NOT NULL DEFAULT now()
```

### VL Admin
- platform@vialuce.com, UUID 9c179b53, role='platform', tenant_id NULL
- Must survive ALL destructive operations.

### BCL Tenant
- ID: b1c2d3e4-aaaa-bbbb-cccc-111111111111
- Multiple stale rule_sets from prior import attempts (all draft or superseded)
- The "already exists" check matches against these and returns them without re-interpretation

---

## THE PROBLEM (VERIFIED FROM VERCEL LOGS)

```
[SCI Execute] Plan already exists for Plan General — returning existing (d299b413)
```

When Patricia re-imports BCL_Plan_Comisiones_2025.xlsx, the execute pipeline finds an existing rule_set for this tenant and short-circuits — it returns the stale draft rule_set `d299b413` without:
- Re-interpreting the plan (the AI is never called)
- Running HF-132's supersede logic (never reached)
- Setting status='active' (never reached)
- Creating a new rule_set (never reached)

The "already exists" early return was added as a deduplication guard — prevent creating duplicate rule_sets from the same file. But it has three problems:

1. **It returns stale/broken rule_sets from prior failed runs** — BCL has rule_sets with empty components from the per-sheet era
2. **It bypasses the entire HF-129/130/131/132 chain** — storage retrieval, batched interpretation, XLSX extraction, and auto-activation all live on the creation path that never executes
3. **It prevents legitimate re-import** — if the user explicitly uploads a plan again, they expect it to be interpreted again, not cached

---

## THE FIX

**Remove the "already exists" early return for plan-classified content units.** When a user explicitly imports a plan through the browser, the pipeline ALWAYS interprets fresh.

The HF-132 supersede logic handles deduplication correctly: prior active plans get `status='superseded'`, the new plan is created with `status='active'`. This is the right dedup mechanism — version-based (supersede old, activate new), not cache-based (return old, skip new).

### What to change:
1. Find the "Plan already exists" check in `executeBatchedPlanInterpretation` and `executePlanPipeline`
2. Remove the early return OR change it to only match `status='active'` plans (not drafts from failed runs)
3. The supersede + create-active flow from HF-132 must be the ONLY dedup mechanism

### What NOT to change:
- Do NOT remove the supersede logic from HF-132
- Do NOT modify the Calculate page query
- Do NOT create duplicate rule_sets — the supersede handles this

---

## CC FAILURE PATTERNS TO PREVENT

| # | Pattern | Prevention |
|---|---------|-----------|
| FP-69 | Fix one path, leave others | Check BOTH sites: executeBatchedPlanInterpretation AND executePlanPipeline. Both may have the "already exists" check. |
| FP-71 | Fix present but unreachable | The entire point — HF-132's fix exists but the early return prevents it from executing. Remove the obstruction. |
| FP-70 | Phase deferral | Not complete until a re-import produces a NEW active rule_set with components. |

---

## PHASE 0: CODE TRACE — ZERO CODE CHANGES

### 0A: Find all "already exists" checks in execute route
```bash
grep -n "already exists\|existing.*plan\|plan.*exists\|returning existing\|skip.*plan\|cached\|dedup" web/src/app/api/import/sci/execute/route.ts
```
Paste the FULL output with line numbers.

### 0B: Read the early return code block (±15 lines from each match)
For each "already exists" match, paste the surrounding code showing:
- What condition triggers the early return?
- What does it check? (tenant_id? name? metadata? contentUnitId?)
- Does it check status? (if it only returns active plans, that's different from returning any plan)

### 0C: Verify HF-132's supersede logic is downstream of the early return
```bash
grep -n "superseded\|status.*active" web/src/app/api/import/sci/execute/route.ts
```
Paste output. Confirm the supersede + active logic is AFTER the early return (proving it's bypassed).

### 0D: Count current BCL rule_sets (context for understanding the match)
```bash
# Show what the "already exists" check is matching against
# This is a READ-ONLY verification query
```
In the diagnostic log, note: the early return matched d299b413. This is a stale draft from HF-131's import.

**Commit:** `git add -A && git commit -m "HF-133 Phase 0: Plan already-exists early return diagnostic" && git push origin dev`

---

## PHASE 1: REMOVE THE EARLY RETURN

### 1A: Remove or disable the "already exists" early return in executeBatchedPlanInterpretation
The plan should ALWAYS be interpreted fresh when the user explicitly imports. The supersede logic from HF-132 handles deduplication.

### 1B: Remove or disable the "already exists" early return in executePlanPipeline (if present)
Same fix for the per-unit fallback path.

### 1C: Verify the supersede + create-active flow is now the ONLY path
After removing the early return, the flow should be:
```
User imports plan
  → supersede existing active rule_sets (HF-132)
  → retrieve file from storage (HF-129)
  → batch all plan sheets (HF-130/131)
  → extract XLSX text + call AI interpreter
  → create NEW rule_set with status='active' (HF-132)
  → convergence runs
```
No short-circuits. No cache. No early returns.

**Commit:** `git add -A && git commit -m "HF-133 Phase 1: Remove plan already-exists early return" && git push origin dev`

---

## PHASE 2: BUILD + VERIFY

### 2A: Clean build
```bash
cd web && rm -rf .next && npm run build
```
Must exit 0. Paste output.

### 2B: Verify "already exists" check is gone
```bash
grep -n "already exists\|returning existing\|skip.*plan" web/src/app/api/import/sci/execute/route.ts
```
Should return ZERO matches (or only in comments).

### 2C: Verify supersede + active logic still present
```bash
grep -n "superseded\|status.*active" web/src/app/api/import/sci/execute/route.ts
```
Should still show the HF-132 supersede and active-on-create lines.

**Commit:** `git add -A && git commit -m "HF-133 Phase 2: Build verification" && git push origin dev`

---

## PHASE 3: CREATE PR

```bash
gh pr create --base main --head dev \
  --title "HF-133: Remove plan already-exists early return — enable re-import" \
  --body "## Problem
SCI execute has an 'already exists' early return that short-circuits when a
tenant has any existing rule_set. This bypasses HF-132's auto-activate code,
HF-130/131's batched interpretation, and HF-129's storage retrieval.

The user re-imports a plan and gets the stale draft from a prior failed attempt.

## Root Cause
Deduplication via cache (return existing) conflicts with deduplication via
versioning (supersede old, create new). The cache check runs first and prevents
the versioning path from executing.

## Fix
Remove the 'already exists' early return. The HF-132 supersede + create-active
flow is the correct dedup mechanism. Every explicit user import interprets fresh.

## Chain Completion
HF-129: Storage → execute (wire)
HF-130: Per-sheet → batched AI (backend)
HF-131: Per-unit HTTP → grouped HTTP (frontend)
HF-132: Draft → auto-active + supersede (status)
HF-133: Cache → fresh interpretation (early return removed)

After this: Patricia imports plan → fresh AI interpretation → active rule_set
with components → Calculate → verify GT \$44,590"
```

**Commit:** `git add -A && git commit -m "HF-133 Phase 3: Completion report + PR" && git push origin dev`

---

## PROOF GATES — HARD

| # | Criterion | How to Verify |
|---|-----------|---------------|
| PG-01 | "already exists" early return removed from executeBatchedPlanInterpretation | Paste grep showing zero matches |
| PG-02 | "already exists" early return removed from executePlanPipeline (if existed) | Paste grep showing zero matches |
| PG-03 | HF-132 supersede + active logic still present | Paste grep showing supersede lines |
| PG-04 | Build exits 0 | Paste build output |
| PG-05 | VL Admin profile unchanged | Read-only: `SELECT email, role FROM profiles WHERE email = 'platform@vialuce.com'` |

## PROOF GATES — SOFT

| # | Criterion | How to Verify |
|---|-----------|---------------|
| PG-S1 | No other early returns bypass the interpretation path | Paste grep for "return" within the plan execution functions |
| PG-S2 | Idempotent: re-importing same plan supersedes old, creates new | Code review of supersede + upsert sequence |

---

## COMPLETION REPORT ENFORCEMENT

- File: `HF-133_COMPLETION_REPORT.md` in PROJECT ROOT
- Created BEFORE final build verification
- VERBATIM proof gate criteria with PASS/FAIL and PASTED evidence
- If this file does not exist at batch end, the batch is INCOMPLETE.

---

## PRODUCTION VERIFICATION (FOR ANDREW — AFTER PR MERGE)

**ZERO data-modifying SQL. Read-only queries only.**

### Step 1: Login as Patricia → /operate/import → upload BCL_Plan_Comisiones_2025.xlsx → Confirm all

### Step 2: Check Vercel logs
- Must NOT show "Plan already exists — returning existing"
- Must show "Batched plan interpretation: 3 sheets"
- Must show "Batched plan saved: ... status active"

### Step 3: Verify rule_set
```sql
SELECT id, name, status, created_at
FROM rule_sets
WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
ORDER BY created_at DESC
LIMIT 5;
```
Newest rule_set should be `status = 'active'`. All prior should be `superseded` or `draft`.

### Step 4: Navigate to /operate/calculate → Calculate October 2025

### Step 5: Verify result against GT: **$44,590**

### Step 6: Verify Meridian not regressed — MX$185,063

---

*"A user who explicitly imports a plan expects it to be interpreted. A cache that returns stale failures is not deduplication — it's obstruction."*

*vialuce.ai — Intelligence. Acceleration. Performance.*
