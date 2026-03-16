# HF-129: SCI Execute — Plan Document Retrieval from Storage
# Classification: HF (Hotfix)
# Fixes: CLT167-F06 (SCI classifies but cannot execute), CLT167-F07 (Acknowledged ≠ Interpreted)
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

## SCHEMA REFERENCE

### storage.objects (relevant columns)
```
bucket_id    text
name         text     -- e.g. "b1c2d3e4-.../1773451614374_BCL_Plan_Comisiones_2025.xlsx"
created_at   timestamptz
metadata     jsonb
```

### import_batches (relevant columns)
```
id           uuid
tenant_id    uuid
file_name    text
status       text
metadata     jsonb
created_at   timestamptz
```

### rule_sets (expected output)
```
id           uuid
tenant_id    uuid
name         text
status       text
components   jsonb
```

### VL Admin
- platform@vialuce.com, UUID 9c179b53, role='platform', tenant_id NULL
- Must survive ALL destructive operations.

### BCL Tenant
- ID: b1c2d3e4-aaaa-bbbb-cccc-111111111111
- File in storage: `b1c2d3e4-aaaa-bbbb-cccc-111111111111/1773451614374_BCL_Plan_Comisiones_2025.xlsx` (7,986 bytes)
- Current state: 0 rule_sets, 85 entities, 170 committed_data rows

---

## THE PROBLEM

SCI classify correctly identifies BCL_Plan_Comisiones_2025.xlsx as plan content (72%, 83%, 73% across 3 sheets). The file uploads successfully to Supabase Storage `ingestion-raw` bucket. But SCI execute logs:

```
[SCI Execute] Plan content unit Plan General — no document data, deferred
[SCI Execute] Plan content unit Tablas de Tasas — no document data, deferred
[SCI Execute] Plan content unit Metas Mensuales — no document data, deferred
```

The UI shows green checkmarks with "Acknowledged" for all 3 sheets and "No active plan" — the plan interpreter never fires.

**Root cause hypothesis:** The SCI execute pipeline checks for document data (the file content to pass to the AI plan interpreter) but does not retrieve it from Supabase Storage. The classify step reads the file from the browser upload (in-memory) and does not pass the storage path to execute. Execute has no way to locate the file.

---

## WHAT THIS HF DOES

1. Find the exact code path that logs "no document data, deferred"
2. Trace backward to understand what "document data" means in context
3. Fix the pipeline so execute retrieves the file from Supabase Storage using the known path
4. Verify: AI plan interpreter fires → rule_set created with components

This is a **vertical slice**: code fix → plan interpreted → rule_set exists → Calculate button can fire.

---

## CC FAILURE PATTERNS TO PREVENT

| # | Pattern | Prevention |
|---|---------|-----------|
| FP-21 | Dual code path | There must be ONE path for plan document retrieval. Not a fallback chain with in-memory AND storage AND something else. |
| FP-69 | Fix one thing, leave others | If the storage retrieval fix applies to all content types (not just plan), fix all of them. |
| FP-66 | Seeding instead of importing | Do NOT seed BCL plan data. The plan must come through the AI interpreter. |
| FP-70 | Phase deferral as completion | ALL phases mandatory. If plan interpreter doesn't fire, this HF is INCOMPLETE. |

---

## PHASE 0: CODE TRACE — ZERO CODE CHANGES

### 0A: Find the "no document data" log line
```bash
grep -rn "no document data" web/src/ --include="*.ts" --include="*.tsx"
```
Paste the FULL output — file path, line number, surrounding context.

### 0B: Read the surrounding function (±30 lines from the log line)
Understand:
- What variable is checked for "document data"?
- Where does that variable come from? (function parameter? metadata lookup? storage fetch?)
- What would make it non-null?

Paste the relevant code block.

### 0C: Trace the call chain from the import UI confirmation to SCI execute
```bash
grep -rn "sci/execute\|SCI.*Execute\|executePlan\|executeContentUnit" web/src/ --include="*.ts" --include="*.tsx" | head -20
```
Paste the output.

### 0D: Check if the import batch stores the storage path
```bash
grep -rn "storage_path\|storagePath\|ingestion-raw\|storage.*upload\|getPublicUrl\|createSignedUrl" web/src/ --include="*.ts" --include="*.tsx" | head -20
```
Paste the output.

### 0E: Check how Meridian's plan import worked (it DID create rule_sets)
Meridian used PPTX plan import through a different code path (Configure → Plan Import, not Operate → SCI). Check:
```bash
grep -rn "interpret.*plan\|planInterpreter\|plan.*interpret\|aiService.*plan" web/src/ --include="*.ts" --include="*.tsx" | head -20
```
Paste the output. This shows the working path that SCI needs to connect to.

**Commit:** `git add -A && git commit -m "HF-129 Phase 0: Code trace — no document data deferred" && git push origin dev`

---

## PHASE 1: IMPLEMENT THE FIX

Based on Phase 0 findings, implement the fix. The fix MUST:

1. **Retrieve the file from Supabase Storage** during SCI execute for plan-classified content units
2. **Use the service role client** (not the browser client) — the execute pipeline runs server-side
3. **Pass the file content to the existing AI plan interpreter** — the same interpreter that works for Meridian's PPTX path
4. **Store the resulting rule_set** with components in the rule_sets table
5. **NOT create a new plan interpretation path** — reuse the existing working one

### Expected flow after fix:
```
User confirms → SCI execute → content_type === 'plan' →
  retrieve file from storage (service role) →
  parse XLSX → extract sheet data →
  call AI plan interpreter (existing working path) →
  create rule_set with components →
  activate rule_set
```

### Storage retrieval pattern:
```typescript
// Service role client can read any bucket
const { data, error } = await supabaseServiceRole
  .storage
  .from('ingestion-raw')
  .download(storagePath);
```

### CRITICAL: Where does storagePath come from?
The import batch or the content unit proposal must store the storage path. If it's not stored, the classify step must be updated to include it in the proposal metadata.

**Commit:** `git add -A && git commit -m "HF-129 Phase 1: SCI execute retrieves plan document from storage" && git push origin dev`

---

## PHASE 2: BUILD + VERIFY

### 2A: Clean build
```bash
cd web && rm -rf .next && npm run build
```
Must exit 0. Paste output.

### 2B: Verify the fix connects to the existing plan interpreter
```bash
grep -n "interpret\|planInterpreter\|AIService" <the-file-you-modified> | head -10
```
Paste output showing the connection to the existing working interpreter.

### 2C: Verify no new plan interpretation path was created
```bash
grep -rn "class.*PlanInterpreter\|function.*interpretPlan\|planInterpret" web/src/ --include="*.ts" | wc -l
```
Should be the SAME count as before this HF. Do not create duplicate interpretation paths (FP-21).

**Commit:** `git add -A && git commit -m "HF-129 Phase 2: Build verification" && git push origin dev`

---

## PHASE 3: CREATE PR

```bash
gh pr create --base main --head dev \
  --title "HF-129: SCI execute retrieves plan document from storage" \
  --body "## Problem
SCI classify correctly identifies plan content (72-83%) and file uploads to storage.
But SCI execute logs 'no document data, deferred' — the plan interpreter never fires.

## Root Cause
Execute pipeline does not retrieve the file from Supabase Storage. The classify step
reads the file in-memory from the browser upload but does not pass the storage path
to execute.

## Fix
Execute now retrieves plan documents from storage using the service role client and
passes them to the existing AI plan interpreter.

## Verification
BCL tenant: plan import → rule_set created with components → Calculate unblocked.

## CLT Findings
CLT167-F06: SCI classifies but cannot execute → FIXED
CLT167-F07: Acknowledged ≠ Interpreted → FIXED (plan now interpreted, not just acknowledged)"
```

**Commit:** `git add -A && git commit -m "HF-129 Phase 3: Completion report + PR" && git push origin dev`

---

## PROOF GATES — HARD

| # | Criterion | How to Verify |
|---|-----------|---------------|
| PG-01 | "no document data, deferred" code path now has storage retrieval | Paste the code showing storage.download() call |
| PG-02 | Storage retrieval uses service role client | Paste the import/instantiation showing service role |
| PG-03 | Retrieved document passed to EXISTING plan interpreter (not new one) | Paste the function call showing reuse of existing interpreter |
| PG-04 | Build exits 0 | Paste build output |
| PG-05 | No new plan interpretation functions created | Paste grep count (same as before HF) |
| PG-06 | VL Admin profile unchanged | SQL query confirming platform@vialuce.com exists |

## PROOF GATES — SOFT

| # | Criterion | How to Verify |
|---|-----------|---------------|
| PG-S1 | Storage path stored in import_batch or proposal metadata | Paste the code showing where path is written |
| PG-S2 | Fix applies to all plan content units, not just first sheet | Paste the loop/iteration showing all units processed |

---

## COMPLETION REPORT ENFORCEMENT

- File: `HF-129_COMPLETION_REPORT.md` in PROJECT ROOT
- Created BEFORE final build verification
- Contains VERBATIM proof gate criteria with PASS/FAIL and PASTED evidence
- If this file does not exist at batch end, the batch is INCOMPLETE.

---

## PRODUCTION VERIFICATION (FOR ANDREW — AFTER PR MERGE)

1. **Login as Patricia (BCL admin)** on vialuce.ai
2. Navigate to `/operate/import`
3. Upload `BCL_Plan_Comisiones_2025.xlsx` (or re-trigger the existing import if the file is already in queue)
4. **Verify:** All 3 sheets show "Interpreted" (not "Acknowledged")
5. **Verify in Supabase:**
   ```sql
   SELECT id, name, status, 
          jsonb_array_length(components) as component_count
   FROM rule_sets 
   WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
   ```
   Should show 1 rule_set with 4 components (C1, C2, C3, C4).
6. **Navigate to /operate/calculate** → Calculate October 2025
7. **Verify result against GT:** $44,590

---

*"The file is in storage. The classification is correct. The interpreter is proven. The only missing piece is the wire between storage and interpreter."*

*vialuce.ai — Intelligence. Acceleration. Performance.*
