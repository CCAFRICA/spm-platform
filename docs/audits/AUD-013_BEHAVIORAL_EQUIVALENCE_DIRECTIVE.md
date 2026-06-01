# AUD-013 — Execute vs Execute-Bulk Behavioral Equivalence Audit

**Include `CC_STANDING_ARCHITECTURE_RULES.md` at top of context.**

---

## PROBLEM STATEMENT

HF-239 deleted `execute/route.ts` and unified the import path through `execute-bulk/route.ts`. Three behavioral regressions have surfaced since:

1. **Plan classification broken on cold-start** — fixed by HF-240 (workbook-level plan signature detection in analyzer). Root cause was NOT in execute vs execute-bulk — it was in the Level-1 classifier being plan-blind.
2. **Duplicate rule_sets from reimporting same plan** — plan supersession not firing. The user imports the same plan file twice and gets two active rule_sets instead of the second superseding the first.
3. **Transactional data classified as `target` instead of `transaction`** — BCL's monthly actuals (Monto_Colocacion, Cumplimiento_Colocacion, etc.) are stored with `data_type=target`. These were historically classified as transaction. The engine's metric resolution path may depend on `data_type`.

AUD-012 traced route structure. It did not trace behavioral outcomes. This audit compares EVERY behavioral difference between the deleted execute route and the current execute-bulk route that affects what gets written to the database.

**Read-only audit with targeted fixes. The audit probes are read-only. Fixes follow in a single HF within this same branch.**

---

## PHASE 1 — FULL EXECUTE ROUTE RECOVERY

### 1.1 — Extract full deleted execute route

```bash
git show 6ceb16a7:web/src/app/api/import/sci/execute/route.ts > /tmp/execute-route-deleted.ts
wc -l /tmp/execute-route-deleted.ts
```

### 1.2 — Extract full current execute-bulk route

```bash
cp web/src/app/api/import/sci/execute-bulk/route.ts /tmp/execute-bulk-current.ts
wc -l /tmp/execute-bulk-current.ts
```

---

## PHASE 2 — CLASSIFICATION AND DATA_TYPE ASSIGNMENT

### Probe 2A — How did execute assign data_type?

In the deleted execute route, trace how `data_type` was determined for committed_data rows. Find:

1. Every call to `commitContentUnit` — what `data_type` value was passed?
2. Was `data_type` derived from `confirmedClassification` directly (entity→entity, transaction→transaction, target→target, reference→reference)?
3. Or was there mapping/transformation logic that could produce a different `data_type` from the same classification?

Paste every `commitContentUnit` call with 10 lines of context showing the `data_type` parameter.

### Probe 2B — How does execute-bulk assign data_type?

Same extraction from the current execute-bulk route. Every `commitContentUnit` call with 10 lines of context showing the `data_type` parameter.

### Probe 2C — Side-by-side data_type mapping

Create a table:

| Classification | execute data_type | execute-bulk data_type | Match? |
|---|---|---|---|
| entity | ? | ? | ? |
| transaction | ? | ? | ? |
| target | ? | ? | ? |
| reference | ? | ? | ? |
| plan | ? | ? | ? |

If any row doesn't match, that's a regression.

### Probe 2D — What was BCL's data_type historically?

```bash
# Check if any committed_data rows survive from before clean-slate for OTHER tenants
cd web && npx tsx -e '
require("dotenv").config({ path: ".env.local" });
const { createClient } = require("@supabase/supabase-js");
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data } = await s.from("committed_data").select("tenant_id, data_type, created_at").order("created_at", { ascending: true }).limit(20);
  for (const r of data || []) { console.log(r.created_at, r.tenant_id, r.data_type); }
  console.log("---");
  const { data: d2 } = await s.from("committed_data").select("data_type").eq("tenant_id", "b1c2d3e4-aaaa-bbbb-cccc-111111111111");
  const types = {};
  for (const r of d2 || []) { types[r.data_type] = (types[r.data_type] || 0) + 1; }
  console.log("BCL data_type distribution:", JSON.stringify(types));
}
run();
'
```

### Probe 2E — Classification vs data_type in execute-bulk

The BCL log shows `classification=target@85%` for data files. Is `commitContentUnit` receiving `data_type='target'` because the classification IS target? Or is there supposed to be a mapping that converts the classification to the correct data_type?

Read `commitContentUnit` in `web/src/lib/sci/commit-content-unit.ts`. How does it determine the `data_type` column value? Does it use the classification directly, or is there a mapping?

Paste the relevant code.

---

## PHASE 3 — PLAN SUPERSESSION

### Probe 3A — How did execute handle plan supersession?

In the deleted execute route, find the supersession logic. When a second plan import creates a rule_set with the same name as an existing one:

1. Does it check for existing rule_sets by name + tenant_id?
2. Does it set the old one to `status = 'superseded'`?
3. Where in the flow does this happen — in `executePlanPipeline`, in `executeBatchedPlanInterpretation`, or in a shared module?

Paste the supersession code from the deleted route.

### Probe 3B — How does execute-bulk handle plan supersession?

Find the equivalent code in the current flow. The plan interpretation was extracted to `plan-interpretation.ts`. Read:

```bash
grep -n "supersed\|existing\|duplicate\|upsert\|status.*active\|status.*superseded" web/src/lib/sci/plan-interpretation.ts
```

Paste the full output. Then paste the supersession block with 20 lines of context.

### Probe 3C — Is the supersession broken or missing?

Compare 3A and 3B. Is the logic identical? Is it present but not firing? Is it absent?

---

## PHASE 4 — CONTENT UNIT DISPATCH DIFFERENCES

### Probe 4A — Execute's per-classification side effects

For each classification type in execute, list EVERY side effect beyond commitContentUnit:

```
entity:
  - [list every DB write, entity creation, attribute projection, etc.]
transaction:
  - [list every DB write, entity resolution, etc.]
target:
  - [list every DB write, etc.]
reference:
  - [list every DB write, etc.]
plan:
  - [list every DB write, rule_set creation, comprehension signals, etc.]
```

### Probe 4B — Execute-bulk's per-classification side effects

Same list for execute-bulk. Include HF-239's additions (flywheel, assignments, store metadata).

### Probe 4C — Difference table

| Side effect | execute | execute-bulk | Status |
|---|---|---|---|
| [each side effect] | present/absent | present/absent | match/gap |

Every gap is a regression candidate.

---

## PHASE 5 — CONVERGENCE AND BINDING BEHAVIOR

### Probe 5A — Execute's binding write behavior

Did execute ever write `input_bindings` during import? When? Under what conditions? Paste the code.

### Probe 5B — Execute-bulk's binding behavior post-HF-239

HF-239 deleted the three `input_bindings: {}` clearing calls. What DOES execute-bulk write to `input_bindings` now? Anything? Or does it leave whatever was there untouched?

### Probe 5C — Calc-time convergence versioning

The calc-time convergence gate checks `convergence_version`. What version does execute-bulk write after plan import? What version did execute write? If they differ, calc-time convergence may re-derive when it shouldn't, or skip when it should run.

---

## PHASE 6 — FIX ALL GAPS

After Phases 2-5 identify every behavioral difference:

### 6.1 — Fix data_type assignment

If the classification-to-data_type mapping is wrong (target instead of transaction for actuals data), fix it at the correct layer. If `commitContentUnit` uses classification directly and the classifier is producing `target` instead of `transaction`, the fix is in the classifier or in a mapping layer between classification and data_type.

### 6.2 — Fix plan supersession

If supersession logic is present in `plan-interpretation.ts` but not firing, fix the gate condition. If it's absent, restore it from the deleted execute route.

### 6.3 — Fix any other gaps from Phase 4

Every side-effect gap identified in Probe 4C gets addressed.

---

## VERIFICATION

After all fixes:

1. Delete BCL's duplicate rule_sets and all committed_data (clean-slate Section 1 from the architect's SQL script)
2. Re-import plan → confirm single rule_set created, `componentType=prime_dag`
3. Re-import plan again → confirm supersession (old rule_set status=superseded, new one created OR same one updated)
4. Import BCL data files → confirm `data_type=transaction` (not target) for actuals data
5. Calculate all periods → report per-period totals

Paste all verification evidence.

---

## COMPLETION REPORT

Save to `docs/completion-reports/AUD-013_COMPLETION_REPORT.md` and commit.

Must include:
1. Full difference table from Probe 4C
2. Data_type mapping comparison from Probe 2C
3. Supersession comparison from Probe 3C
4. Every fix applied with before/after evidence
5. Verification results
6. Build verification

---

## BUILD AND DEPLOY

1. Kill dev server
2. `rm -rf .next`
3. `npm run build` — zero errors
4. `npm run dev` — `localhost:3000` responds
5. Git from repo root (`spm-platform`)
6. Branch: `aud-013-behavioral-equivalence` off `main`
7. `gh pr create --base main --head aud-013-behavioral-equivalence` with title: "AUD-013: Execute/Execute-Bulk behavioral equivalence — audit + fix data_type assignment, plan supersession, and side-effect gaps"
8. PR body: "Forensic behavioral equivalence audit recovering deleted execute route from git. Identifies and fixes every behavioral difference between the pre-HF-239 execute route and the current execute-bulk route. Covers data_type assignment, plan supersession, per-classification side effects, and convergence binding behavior."
