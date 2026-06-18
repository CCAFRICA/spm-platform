# AUD-006: Import-to-Calculate Pipeline — Live Codebase Audit

**Date:** 2026-06-17
**Category:** AUD — systemic audit (no code changes)
**Output:** `docs/audits/AUD-006_IMPORT_TO_CALCULATE_PIPELINE_AUDIT.md` (committed to repo)
**Context:** HF-301 (PR #534, merged, main HEAD `5e41eff3`) removed the whole-tenant `resolveEntitiesAtCalcTime` call from the calc route. This audit traces the full pipeline from file upload through calculation result as it exists NOW on main, documents what each phase does, identifies remaining scaling risks, and establishes a definitive reference for the import→calculate chain.

---

## §0 — DISCIPLINE

`CC_STANDING_ARCHITECTURE_RULES.md` applies. **This is a read-only audit.** No code changes. No branch. Work on main. The deliverable is a single committed markdown file in `docs/audits/`.

---

## §1 — SETUP

```bash
cd ~/spm-platform
git checkout main && git pull origin main
git rev-parse HEAD
# Confirm HF-301 is present:
git log --oneline -5
```

Verify `docs/audits/` exists:
```bash
mkdir -p docs/audits
ls docs/audits/ | grep -i "AUD-006"
# Must be empty — this is the first commit of AUD-006
```

---

## §2 — TRACE THE PIPELINE

Read the live code for each phase below. For each one: paste the operative code (the function signature + the 10-30 lines that do the work — not the entire file), then state in one sentence what it does and whether it is period-scoped or whole-tenant.

### Phase 1: File Upload + Analysis
```bash
wc -l web/src/app/api/import/sci/analyze/route.ts
```
Read the POST handler. What does it return? How does it classify content units?

### Phase 2: Import Execution (Route B — the one MIR uses)
```bash
wc -l web/src/app/api/import/sci/execute-bulk/route.ts
```
Read the file. Trace and paste:
- **2a.** The main POST handler flow — what does it do in order?
- **2b.** `processContentUnit` dispatch — how does classification route to pipelines?
- **2c.** `processDataUnit` — how are committed_data rows built? Show the `insertRows` construction. What are `entity_id`, `period_id`, `source_date` set to?
- **2d.** `processEntityUnit` — how are entities created? What fields are extracted?
- **2e.** `processReferenceUnit` — how does it differ from processDataUnit?
- **2f.** Post-commit — what happens AFTER all content units process? Is there a finalize call? What did OB-182 remove?

### Phase 3: Plan Interpretation
```bash
wc -l web/src/lib/sci/plan-interpretation.ts
```
Read the main exported function. Paste the orchestration flow (Phase A skeleton, Phase B component construction, save to rule_sets). How does supersession work (HF-300)?

### Phase 4: Finalize Import (HF-300)
```bash
find web/src -path "*/finalize*" -name "*.ts" | head -5
```
Read the handler. What work does it do? What scans the whole tenant? What timed out at 300s?

### Phase 5: Entity Resolution
```bash
wc -l web/src/lib/sci/entity-resolution.ts
```
Read `resolveEntitiesFromCommittedData`. Paste the main function body. Is it whole-tenant? What does it scan?

### Phase 6: Calc-Time Entity Resolution
```bash
find web/src -name "calc-time-entity*" | head -5
wc -l web/src/lib/sci/calc-time-entity-resolution.ts 2>/dev/null
```
If the file exists, read and paste. How does it differ from Phase 5?

### Phase 7: Calculation Route
```bash
wc -l web/src/app/api/calculation/run/route.ts
```
This is large. Read it in sections. Find and paste each sub-phase IN EXECUTION ORDER:

- **7a. Setup** — what is fetched first? (period, rule_set, superseded batches)
- **7b. Entity population** — how are entities loaded? Is it whole-tenant?
- **7c. Data fetch** — the OB-152 hybrid. Paste the three query strategies (source_date, period_id fallback, OB-128 null-both). For each: what filter? Period-scoped or whole-tenant?
- **7d. OB-183 in-memory entity resolution** — paste the `calcTimeResolved` loop. What Map does it populate? What are the keys?
- **7e. HF-301 marker** — confirm `resolveEntitiesAtCalcTime` is removed. Paste the HF-301 comment that replaced it.
- **7f. HF-126/HF-189 assignment self-heal** — paste the block. Is it whole-tenant or period-scoped? How many entities does it touch?
- **7g. Convergence** — paste the block. Is it gated? Single rule_set or all? (HF-165)
- **7h. Per-entity calculation loop** — paste the outer loop. What does it iterate? How does it resolve metrics?

### Phase 8: Convergence Service
```bash
wc -l web/src/lib/intelligence/convergence-service.ts
```
Read `convergeBindings`. Paste the function signature and the main loop. What data does it read? Period-scoped or whole-tenant?

---

## §3 — PRODUCE THE AUDIT DOCUMENT

After tracing all phases, write `docs/audits/AUD-006_IMPORT_TO_CALCULATE_PIPELINE_AUDIT.md` with this structure:

```markdown
# AUD-006: Import-to-Calculate Pipeline Audit

**Date:** 2026-06-17
**Main HEAD:** [SHA]
**Auditor:** CC (live codebase read)

## Pipeline Overview
[One paragraph: the end-to-end flow from upload to calculation result]

## Phase Map
[For each phase 1-8: file path, line count, one-sentence description, scope (period/tenant/global)]

## Import Pipeline (Phases 1-4)
[For each sub-phase: the operative code (pasted), what it does, scope, scaling notes]

## Calculation Pipeline (Phases 5-8)
[For each sub-phase: the operative code (pasted), what it does, scope, scaling notes]

## Scaling Risk Assessment
[For each whole-tenant operation that remains after HF-301:
  - What it does
  - Current MIR impact (estimated time at 166k rows / 553 entities / 5 plans)
  - At what scale it becomes a problem
  - Whether it is on the calc hot path or import path]

## HF-301 Verification
[Confirm the resolveEntitiesAtCalcTime call is removed. Paste the HF-301 marker.]

## Data State (MIR tenant, from architect-confirmed SQL)
- 165,897 committed_data rows; 162,571 with source_date; 3,326 null-both
- January 2025: 26,304 rows by source_date
- 553 entities; 5 active rule_sets; 0 assignments; 164,256 NULL entity_id
- entity_id_field populated on 99.98% of rows
- 6 periods with correct date ranges

## Open Items
[Any findings from the trace that warrant attention — remaining whole-tenant scans,
 dead code paths, unreachable phases, or structural risks]
```

---

## §4 — COMMIT

```bash
git add docs/audits/AUD-006_IMPORT_TO_CALCULATE_PIPELINE_AUDIT.md
git commit -m "AUD-006: Import-to-calculate pipeline audit — live codebase trace"
git push origin main
```

State the commit SHA.

---

*AUD-006 · Import-to-Calculate Pipeline Audit · 2026-06-17*
