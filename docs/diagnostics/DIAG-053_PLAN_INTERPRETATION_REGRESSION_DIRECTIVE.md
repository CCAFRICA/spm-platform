# DIAG-053 — Plan Interpretation Regression (Post-HF-239)

**Include `CC_STANDING_ARCHITECTURE_RULES.md` at top of context.**

---

## PROBLEM STATEMENT

Plan interpretation is broken in production after HF-239 (PR #424) merged. HF-239 deleted `execute/route.ts` and merged plan interpretation into `execute-bulk/route.ts`. Prior to HF-239, plan ingestion through `execute` worked reliably across months of processing for BCL, Meridian, and CRP.

Post-HF-239, importing `BCL_Plan_Comisiones_2025.xlsx` through the browser resulted in:
- Analyzer classified all 3 sheets as entity@90% + reference@80% (not plan)
- Execute-bulk processed them as entity and reference data
- No AI plan interpretation ran
- No rule_set was created
- BCL has no plan and calculation is impossible

**This is a production regression. Fix priority.**

---

## PHASE 1 — DIAGNOSTIC PROBES (READ-ONLY)

### Probe 1 — Execute-bulk plan wiring

Paste the following from `web/src/app/api/import/sci/execute-bulk/route.ts`:

1A. The `case 'plan'` arm in the `processContentUnit` dispatcher — paste 10 lines above and below

1B. The batched plan interpretation dispatch block in the POST handler (before the per-unit dispatch loop) — paste the full block including the plan unit collection, the batch call, and the handled-unit-ID tracking

1C. The imports at the top of the file — confirm `plan-interpretation.ts` is imported

### Probe 2 — UI dispatch

Paste the following from `web/src/components/sci/SCIExecution.tsx`:

2A. The `executeUnits` function in full — this is the function that dispatches content units to the API after user confirmation

2B. The `executeLegacyUnit` function in full (if it still exists)

2C. Every fetch call to `/api/import/sci/execute-bulk` — paste 20 lines of context around each

2D. How does the UI determine which units are plan-classified? Is it reading `confirmedClassification` from the proposal? Show the code that collects plan units for dispatch.

### Probe 3 — Classification flow

3A. When the analyzer proposes `entity@90%` for a plan sheet, and the user overrides to `plan` in the UI — does the override flow through to `confirmedClassification` in the execution request body? Trace the data flow from the override UI control to the fetch body.

3B. If the user does NOT override — is there any server-side mechanism that detects plan content and triggers plan interpretation regardless of classification? Was there one in the deleted `execute/route.ts`? Run:

```bash
git show 6ceb16a7:web/src/app/api/import/sci/execute/route.ts | grep -n "plan" | head -30
```

(6ceb16a7 is the last commit with execute/route.ts — pre-HF-239 merge)

### Probe 4 — Pre-HF-239 plan import mechanism

4A. How was BCL's plan originally imported? Check classification_signals or import_batches for BCL's rule_set creation history:

```bash
# Find BCL's rule_set creation evidence
npx tsx -e '
require("dotenv").config({ path: ".env.local" });
const { createClient } = require("@supabase/supabase-js");
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data } = await s.from("rule_sets").select("id, name, status, metadata, created_at").eq("tenant_id", "b1c2d3e4-aaaa-bbbb-cccc-111111111111");
  for (const r of data || []) { console.log(JSON.stringify(r, null, 2)); }
}
run();
'
```

Wait — BCL was clean-slated. There are no rule_sets. Check other tenants for how plans were historically imported:

```bash
npx tsx -e '
require("dotenv").config({ path: ".env.local" });
const { createClient } = require("@supabase/supabase-js");
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data } = await s.from("rule_sets").select("name, status, metadata, created_at").neq("status", "superseded").limit(10);
  for (const r of data || []) { console.log(r.name, r.status, r.metadata?.source, r.created_at); }
}
run();
'
```

4B. In the deleted execute route, was `executeBatchedPlanInterpretation` called from the POST handler based on the UI sending `confirmedClassification: 'plan'`? Or was there server-side detection? Show:

```bash
git show 6ceb16a7:web/src/app/api/import/sci/execute/route.ts | sed -n '680,710p'
```

This is the section where plan units were collected and batched.

4C. In the pre-HF-239 SCIExecution.tsx, how were plan units dispatched? Show:

```bash
git show 6ceb16a7:web/src/components/sci/SCIExecution.tsx | grep -n "plan\|execute\b" | head -30
```

---

## PHASE 2 — ROOT CAUSE IDENTIFICATION

After Phase 1 probes, identify which of these is the failure:

**A. UI never sends plan-classified units.** The analyzer classified sheets as entity/reference. The user did not override. Execute-bulk received entity+reference units. The `case 'plan'` arm never fired. Root cause: classification, not execution.

**B. UI sends plan-classified units but execute-bulk doesn't handle them.** The `case 'plan'` arm exists but has a bug (wrong function signature, missing import, incorrect request body mapping). Root cause: HF-239 extraction error.

**C. UI plan dispatch path is broken.** The plan-specific fetch call in SCIExecution.tsx was adapted incorrectly during HF-239. The request body shape doesn't match execute-bulk's expected shape. Root cause: HF-239 UI adaptation error.

**D. Pre-HF-239, plans went through a separate UI flow** (e.g., a "Plan Import" button, not the SCI data import). HF-239 only unified the SCI import path. The separate plan import flow may be unaffected or may have been broken by deleting execute.

State which root cause applies, with evidence from the probes.

---

## PHASE 3 — FIX

Implement the fix based on the identified root cause. The fix must ensure:

1. When a user classifies or overrides sheets as "plan" in the SCI UI, plan interpretation fires
2. The AI interpretation call runs (via the extracted `plan-interpretation.ts` module)
3. A rule_set is created with populated `input_bindings` and `components`
4. Plan comprehension signals are emitted

**Verification gate:** After the fix, import `BCL_Plan_Comisiones_2025.xlsx` through the browser. Override classification to "plan" if needed. Confirm:
- AI plan interpretation runs (log shows `[SCI Execute] Batched plan interpretation starting`)
- rule_set created (query rule_sets for BCL tenant — show name, status, component count)
- `input_bindings` populated (show non-empty)

Paste all verification evidence into the completion report.

---

## COMPLETION REPORT

Save to `docs/completion-reports/DIAG-053_COMPLETION_REPORT.md` and commit.

Must include:

1. **Phase 1 probe results** — all pasted code and query output
2. **Root cause identification** — which of A/B/C/D, with evidence
3. **Fix description** — what changed, which files, why
4. **Verification evidence** — log output showing plan interpretation fired, rule_set query showing created plan
5. **Build verification** — `npm run build` clean, `localhost:3000` responding

---

## BUILD AND DEPLOY

1. Kill dev server
2. `rm -rf .next`
3. `npm run build` — zero errors
4. `npm run dev` — `localhost:3000` responds
5. Git from repo root (`spm-platform`)
6. Branch: `diag-053-plan-interpretation-fix` off `main`
7. `gh pr create --base main --head diag-053-plan-interpretation-fix` with title: "DIAG-053: Plan interpretation regression fix — restore plan import through unified execute-bulk route"
8. PR body: "Diagnoses and fixes plan interpretation regression introduced by HF-239 route unification. [Root cause inserted by CC after Phase 2]. Plan import verified against BCL tenant."
