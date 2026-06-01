# HF-240 — Restore Cold-Start Plan Classification

**Include `CC_STANDING_ARCHITECTURE_RULES.md` at top of context.**

---

## PROBLEM STATEMENT

Plan import is broken in production. `BCL_Plan_Comisiones_2025.xlsx` is classified as entity+reference on cold-start. No rule_set is created. No AI plan interpretation runs. This worked before HF-239 (PR #424) deleted `execute/route.ts`.

DIAG-053 claimed "both routes use identical gating logic" and proposed a UI override banner. That is not acceptable. The platform must classify plans correctly on cold-start without user intervention. It did before. Something in the deletion or the unification broke it.

**This HF finds exactly what `execute/route.ts` did for plan detection that `execute-bulk/route.ts` does not do, and restores it.**

---

## PHASE 1 — FULL DIFF OF PLAN HANDLING

### 1.1 — Extract the FULL deleted execute route's plan handling

The deleted file is at git commit `6ceb16a7` (last commit with execute/route.ts). Extract EVERY line related to plan detection, classification, and interpretation:

```bash
git show 6ceb16a7:web/src/app/api/import/sci/execute/route.ts > /tmp/execute-route-pre-hf239.ts
```

Read the full file. Find:

1A. Every reference to "plan" in the file — not grep, READ the full flow:
```bash
grep -n "plan\|Plan\|PLAN\|classification.*plan\|isPlan\|planUnit\|planConfig\|planImport\|documentMetadata\|interpret" /tmp/execute-route-pre-hf239.ts
```
Paste full output.

1B. The POST handler's full unit processing flow — from request body parsing to the dispatch loop. Paste lines 80-250 (or wherever the POST handler body starts through the dispatch). Include ANY logic that routes units to plan interpretation based on something OTHER than `confirmedClassification === 'plan'`.

1C. The `executePlanPipeline` function in full (lines 972-1215). Does it have its own classification detection? Does it check `documentMetadata`, file extension, or content structure?

1D. Was there a content-type or document-type based routing? Did the execute route detect `.xlsx` files with multiple sheets containing rate-table structures and auto-route them to plan interpretation?

### 1.2 — Extract execute-bulk's current plan handling

Read the current execute-bulk POST handler. Paste the full unit processing flow from request body parsing through dispatch.

### 1.3 — Side-by-side diff

Compare the two plan handling paths. Identify EVERY difference. Not just the gating filter — the entire flow. Include:
- How units arrive (request body shape)
- How plan units are identified
- What happens to non-plan-classified units that might contain plan content
- Whether execute had fallback plan detection that execute-bulk lacks

---

## PHASE 2 — ANALYZER DIFF

HF-239's completion report says "No changes to analyzer or agents.ts." Verify:

```bash
git diff 6ceb16a7..HEAD -- web/src/app/api/import/sci/analyze/route.ts web/src/lib/sci/agents.ts
```

If the diff is empty, the analyzer is truly unchanged. If not, paste the full diff.

Also check: did any HF between the last known working plan import and now change the analyzer weights?

```bash
git log --oneline 6ceb16a7..HEAD -- web/src/app/api/import/sci/analyze/ web/src/lib/sci/agents.ts
```

Paste output.

---

## PHASE 3 — HISTORICAL VERIFICATION

How was BCL's plan ORIGINALLY classified on first import (cold-start, no flywheel)?

```bash
# Check classification_signals for plan classification events across all tenants
cd web && npx tsx -e '
require("dotenv").config({ path: ".env.local" });
const { createClient } = require("@supabase/supabase-js");
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data } = await s.from("classification_signals").select("signal_type, signal_value, metadata, created_at").order("created_at", { ascending: true }).limit(20);
  for (const r of data || []) { console.log(r.created_at, r.signal_type, JSON.stringify(r.signal_value).substring(0,200)); }
}
run();
'
```

Check if any historical classification signal records show BCL's plan file being classified as "plan" on cold-start. If all classification_signals were wiped by the clean-slate, check Meridian and CRP (which may not have been clean-slated yet, or may have signals from before clean-slate).

---

## PHASE 4 — FIX

Based on Phase 1-3 evidence, implement the fix. The fix must satisfy:

1. `BCL_Plan_Comisiones_2025.xlsx` classifies as "plan" on cold-start with empty flywheel
2. No user override required
3. AI plan interpretation fires automatically
4. rule_set is created with populated components and input_bindings

The fix lives in the correct layer — if the analyzer needs to recognize multi-sheet XLSX plan workbooks structurally, fix the analyzer. If execute had server-side reclassification that execute-bulk lacks, restore it. If the execute route's POST handler had plan content detection beyond `confirmedClassification === 'plan'`, add the equivalent to execute-bulk.

**Do NOT add a UI override banner as the fix.** The banner from DIAG-053 PR #425 should be reverted if it merged — it masks the classification failure instead of fixing it.

---

## VERIFICATION

After the fix, verify end-to-end:

1. Clean the flywheel for BCL: delete BCL's `structural_fingerprints` rows
2. Re-analyze `BCL_Plan_Comisiones_2025.xlsx` through the browser
3. Confirm the analyzer classifies at least the primary plan sheets as "plan"
4. Execute the import — confirm AI plan interpretation runs
5. Query rule_sets for BCL — paste showing name, status, component count, input_bindings non-empty

Paste all verification evidence.

---

## COMPLETION REPORT

Save to `docs/completion-reports/HF-240_COMPLETION_REPORT.md` and commit.

Must include:
1. Phase 1 diff evidence — what execute did that execute-bulk didn't
2. Phase 2 analyzer diff — unchanged or changed
3. Phase 3 historical evidence
4. Root cause (precise, not "flywheel was empty")
5. Fix description
6. Verification evidence (plan classified correctly on cold-start, rule_set created)
7. Build verification

---

## BUILD AND DEPLOY

1. Kill dev server
2. `rm -rf .next`
3. `npm run build` — zero errors
4. `npm run dev` — `localhost:3000` responds
5. Git from repo root (`spm-platform`)
6. Branch: `hf-240-restore-plan-classification` off `main`
7. `gh pr create --base main --head hf-240-restore-plan-classification` with title: "HF-240: Restore cold-start plan classification — fix regression from HF-239 route unification"
8. PR body: "[Root cause from Phase 1-3]. Plan XLSX files now classify correctly on cold-start without user override. AI plan interpretation fires automatically through the unified execute-bulk route."
