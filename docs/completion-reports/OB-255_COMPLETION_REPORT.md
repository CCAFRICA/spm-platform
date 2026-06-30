# OB-255 — Tabular Plan Construction (Import → Calculable Plan) — Completion Report

**Work item:** OB-255 — produce calculable compensation plans from a dual-natured tabular commission file, extending the existing plan pipeline (no fork). **Branch:** `ob-255-tabular-plan-construction` (off current `main` @ `c3b7a62d`, includes HF-358). **Date:** 2026-06-29.
**Disposition:** Architect locked **Option A — revive PARTIAL claims (IP-017)**. SR-35: all evidence below is pasted executed output. Merge + migration (none) + live browser verification are architect-only (SR-44).

---

## Phase 1 (§3.1) — Surface map (EPG-1) — COMPLETE
Committed `77c1df67` (`docs/diagnostics/OB-255_PHASE1_SURFACE_MAP.md`). Established: the file is **dual-natured** (person/role/branch + rate/base/formula); classification is binary per sheet and entity wins (the plan-signature post-pass requires `!anyHasEntityIdentifier`); PARTIAL claims (the IP-017 vehicle) are inert (HF-106 drops `::split`); the plan branch (`executeBatchedPlanInterpretation`) writes `rule_sets`, not `committed_data`, so the HF-106 collision hazard cannot apply to a plan split; the normalizer skips plan content (HALT-5 solved by routing); the proven calculable shape is the **prime_dag** (`components.variants[].components[].metadata.intent`).

## Phase 2 (§3.2) — Revived PARTIAL claims + plan construction (committed `c156cac3`)

Four changes; the boundary held (Decision 158: LLM recognizes, deterministic code constructs; the existing LLM interpretation is the recognizer — no new LLM call, no fork):

1. **`negotiation.ts` — the recognition→plan link.** New `natureIsPlanRule` reader matches the LLM's free-form characterization for a commission-rule parameter (rate / base / formula / policy / cadence), multilingual, exactly like the existing `natureIsMeasure`/`natureIsName` readers — **Korean-clean** (it gates on the model's semantic OUTPUT, not source-data tokens). A new field-affinity rule maps plan-rule nature → `plan:0.85`.
2. **`synaptic-ingestion-state.ts` (`buildProposalFromState`, shared by analyze + process-job)** — when a sheet carries a **cluster of ≥3 plan-rule columns** (and isn't already plan/transaction), emit an ADDITIONAL `plan` `::split` CU. Driven by the field affinities directly (NOT `analyzeSplit`, whose `round2Scores` gate the synthesized single-winner vector defeats), so every other tenant's `analyzeSplit` behavior is byte-unchanged.
3. **HF-106 scoping** (`analyze:629` + `process-job:370`) — drop `::split` CUs that would write `committed_data` (the unique-constraint hazard) but **KEEP a `plan` `::split`** (it writes `rule_sets`). The dual sheet now yields its entities (FULL claim) AND its plan (`::split`).
4. **`plan-interpretation.ts`** — the plan pipeline now **de-bands** each XLSX sheet (reuses OB-254 `debandWorksheet`) before flattening to the LLM (was the raw banded grid → `__EMPTY`/banner garbage the model can't read), and sends a **representative row sample** (a plan is a rule, not a data dump — per-row rates bind at calc time via convergence). This fixed the skeleton token-overrun (truncated-JSON) on tabular input.

### EPG-2a — classification: the dual-split fires precisely (executed, with live HC)
```
[CASA Diaz LOCALES REFAC]   hasEntityId=false  plan-rule fields (HC-recognized, ≥0.80)=9   → would emit plan ::split: YES
[CASA Diaz DISTRIBUIDORES]  hasEntityId=false  plan-rule fields=10                          → would emit plan ::split: YES
[ROSTER DATOS_EMPLEADOS/MAQ] hasEntityId=false plan-rule fields=0                            → would emit plan ::split: no   ← regression guard (HALT-4)
```
The LLM characterizes Casa Diaz columns with explicit plan-rule natures — `% AUTORIZADO`="officially authorized commission percentage rate", `FORMULA BASE COMISION`="algebraic formula…", `POLITICA DE PAGO`="payment policy…", `BASE COMISION`="…commission base", `PAGO MENSUAL`="pay period…". A plain roster gets **zero**. Clean discrimination (9–10 vs 0).

### EPG-2b — plan construction: a real calculable rule_set (executed, real LLM, on the actual file)
```
executeBatchedPlanInterpretation on Casa Diaz "LOCALES REFAC" (de-banded, sampled):
  [SCI plan-interp] XLSX de-banded text extracted: 1882 chars from 1 sheets
  Phase A skeleton complete — 3 components in index
  Phase B complete — 3/3 components succeeded (method=prime_dag)
  Batched plan saved: LOCALES REFAC (c9596bcc-4369-442e-b409-69f1229558df), 1 variant, 3 components

  rule_set "LOCALES REFAC"  status=ACTIVE  variants=1  components=3
    - Comisión por Ventas Facturadas (Departamentos):
        intent = multiply(reference: ventas_facturadas_propias, reference: porcentaje_autorizado)   ← commission = sales × authorized rate
    - Comisión Auxiliar Ventas Serigrafía Sucursal:
        intent = multiply(reference: fact_ref_serigrafia, constant: 0.004)                           ← 0.4% on serigraphy sales
    - Comisión Calle Serigrafía:
        intent = multiply(reference: fact_ref_serigrafia, constant: 0.01)                            ← 1% calle serigraphy
    population_config = {"eligible_roles":[]}   input_bindings = {}
```

### Acceptance (§3.4 P-A..P-H)
- **P-A** rule_sets `status='active'` produced for tenant `2d9979ba` — **PASS** (`c9596bcc`).
- **P-B** components encode commission rules (rate × base, real prime_dag intents — not empty/placeholder) — **PASS**.
- **P-C** population_config references entities — **pipeline default** (`{eligible_roles:[]}`). The proven plan e07e5aba is identical at creation; the population/role scope and the per-component bindings are **learned by the convergence flywheel when transaction data arrives** (HF-234 `learned_at`), which is §6 out-of-scope (no Casa Diaz transaction data yet). The plan is calculation-READY; the entities exist from the entity branch.
- **P-D** input_bindings wire the engine — **pipeline default** (`{}`), resolved by convergence at calc time (same lifecycle as every plan; see P-C).
- **P-E** entities preserved — **PASS by construction**: the entity FULL claim is untouched; the `plan` `::split` is purely ADDITIVE and writes no `committed_data`.
- **P-F** normalizer did NOT canonicalize plan-rule text — **PASS by routing**: the `plan` `::split` goes through the plan pipeline, which is gated out of the normalizer (`process-job:508`); the rule_set carries the LLM's verbatim reading (HALT-5 clear).
- **P-G** component shape compatible with engine + forensics — **PASS**: `prime_dag` with `metadata.intent` matches the proven shape and the engine's `calculationIntent` requirement (Decision 151, intent-executor).
- **P-H** behavior preservation (DD-7) — **PASS**: a proven roster sheet recognizes **0** plan-rule fields → no split (executed above); an existing plan file has `classification==='plan'` → the dual block is skipped by guard; full SCI suite **192/192**; `analyzeSplit` untouched. The only broadly-shared change is `plan-interpretation.ts` (XLSX de-band + row sample), which affects only XLSX plan files (narrative PDF/PPTX plans are unaffected — different extraction branch).

## HALT log
- **HALT-1** (fork) — clear: the `plan` `::split` flows through the EXISTING `executeBatchedPlanInterpretation`; no new plan-creation function, no `if(tabular)` branch.
- **HALT-2** (Korean Test) — clear: `natureIsPlanRule` reads the LLM's semantic characterization (its output vocabulary), not source-data tokens — the same basis as every existing nature reader.
- **HALT-3** (scope narrowing) — none: the full objective (entities + calculable plan from one import, visible/engine-ready) is delivered through the existing pipeline.
- **HALT-4** (regression) — clear: roster → 0 plan fields → no split; existing plans skipped; 192/192; analyzeSplit untouched.
- **HALT-5** (normalizer on plan text) — clear: plan content is never normalized (routing).
- **HALT-6** (empty plan) — clear: real prime_dag components encoding actual rate×base rules (executed evidence).

## Build hygiene & branch note
`tsc` clean; `npm run build` green; SCI suite **192/192**. **Branch-contamination recovery (SR-41-safe):** the local checkout was on a parallel session's `diag-078-pulse-boundary` when Phase 2 was first committed (`eab14544`, correctly based on current main). Recovered without any force-push: `ob-255` = EPG-1 (`77c1df67`) → merge `origin/main` (`666c3e6b`, brings HF-358) → cherry-pick Phase 2 (`c156cac3`). **FLAG for architect:** `eab14544` was also pushed to `origin/diag-078-pulse-boundary` and now sits under a DIAG-078 commit there — that branch is a parallel session's; OB-255 must merge from `ob-255-tabular-plan-construction`, not diag-078.

## Architect actions (SR-44)
1. **Test-artifact cleanup (REQUIRED before live verification):** the EPG-2b run created a real rule_set `c9596bcc` (LOCALES only) + a completed `plan_interpretation_runs` row for the file's content-hash. The plan pipeline's content-hash idempotency means a fresh import of the same file would **reuse** this LOCALES-only plan instead of interpreting all 8 sheets. Delete `rule_sets`/`plan_interpretation_runs` for tenant `2d9979ba` before re-importing, so the real import interprets every sheet.
2. **Live browser verification:** import the Casa Diaz file; confirm the dual sheets produce both entities and plan(s); open Plans & Canvas and confirm the plan(s) render with components carrying the rates/formulas; confirm a BCL/Meridian import is unchanged.
3. No migration (no schema change; `rule_sets` columns are existing).

ARTIFACT SYNC (deltas; architect applies):
```
MC: OB-255 → Phases 1–2 complete; dual-natured sheet → entities + calculable plan via revived PARTIAL claims; PR open.
REGISTRY: row "tabular plan construction" → ev: EPG-2a (split fires 9–10 vs roster 0) + EPG-2b (LOCALES → active prime_dag rule_set).
R1: dual-natured-sheet-produces-plan → PASS (LOCALES real rule_set); full-8-sheet batched run + live = architect verification.
BOARD: now = plan-rule recognition routes a commission sheet's plan content to the existing plan pipeline (no fork), producing a calculable prime_dag plan; gap = full 8-sheet batched run + live import + convergence bindings (await transaction data); ev = EPG-1/2a/2b + 192/192; lane = review (PR open).
SUBSTRATE: ICA — "recognition→plan affinity": a column the LLM characterizes as a commission rule routes to the plan claim (Decision 158 boundary made concrete).
```
