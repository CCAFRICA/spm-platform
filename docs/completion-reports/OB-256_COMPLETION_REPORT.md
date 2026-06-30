# OB-256 — Plan Fidelity and Import Accuracy (W-1..W-6) — Completion Report

**Work item:** OB-256 — column-name references + UI truth. **Branch:** `ob-256-plan-fidelity` (off `main` @ `56f18a01`). **Date:** 2026-06-30.
**Governing constraint:** NO new engine / convergence / registry / validator / category-flag code. Changes only **what the LLM produces** (the plan-interpretation prompt + skeleton sizing) and **what the UI displays**. SR-35: all evidence is pasted executed output. Merge + browser verification are architect-only (SR-44).

---

## The six fixes

| # | Issue | Fix (file) |
|---|---|---|
| **W-1** | Abstract reference names (the chain-breaker) | `anthropic-adapter.ts` plan_component prompt — every `reference`/`predicate` `field` on tabular input is the EXACT column header verbatim |
| **W-2** | Per-person rate collapsed to a constant | same prompt — varying column → `reference`; uniform → `constant` |
| **W-3** | MAQUINARIA (2) skeleton truncation | `ai-service.ts` skeleton `maxTokens` 4096→16384 + skeleton omits `rateTableCellCount` for a per-row column rate |
| **W-4** | Classification rationale "by elimination" | `proposal-intelligence.ts` `buildVerdictSummary` — report the recognized columns when the winner's evidence is field affinities |
| **W-5** | Intelligence Summary ignores plan creation | `session-telemetry-accumulator.ts` + `execute-bulk` + `ImportReadyState.tsx` — `plans:{created,components}` counter |
| **W-6** | Competing execute-bulk requests | `page.tsx` `handleConfirmAll` — per-proposal in-flight ref guard |

**No fork (HALT-1/HALT-2 clear):** the prompt handles tabular and narrative in one path — the instruction is gated on "the input shows a `=== Sheet: … ===` header row"; a narrative PDF/PPTX has no header row, so it keeps its prose-name behavior. No registry, no `if(tabular)` branch, no engine/convergence change.

---

## EPG-1 (W-1, W-2, W-3) — plan interpretation on the actual file, all 8 sheets (executed, real LLM)

Run through the real interpretation path (`orchestratePerComponentInterpretation` on the de-banded sheet content — the same call `executeBatchedPlanInterpretation` makes), inspecting every `reference`/`predicate` `field` against the sheet's actual de-banded column set:
```
PASS LOCALES REFAC          comp=2   failed=0  col-name-fields=4/4
PASS FORANEAS REFAC         comp=2   failed=0  col-name-fields=4/4
PASS MAQUINARIA             comp=11  failed=0  col-name-fields=23/23
PASS MAQUINARIA (2)         comp=4   failed=0  col-name-fields=7/7      ← was: skeleton truncated @ pos 8320 (W-3)
PASS COMISIÓN GARANTIZADA   comp=1   failed=0  col-name-fields=1/1
PASS DISTRIBUIDORES         comp=4   failed=0  col-name-fields=3/3
PASS DIST Y SUC             comp=4   failed=0  col-name-fields=10/10    ← was: 4 invented category-base names
PASS PULL (EXTERNOS)        comp=1   failed=0  col-name-fields=2/2
=== 8/8 PASS: complete plan + column-name references + zero abstract names + zero component failures ===
```

**W-1 — column-name references (HALT-4 clear).** Sample intents (every reference is a verbatim column header from the file, zero abstract names like the prior `porcentaje_autorizado` / `ventas_facturadas_confeccion`):
```
LOCALES "Comisión Pull de Ventas":         multiply(reference: "BASE COMISION", reference: "% AUTORIZADO")
FORANEAS "Comisión Confección":            multiply(reference: "BASE COMISION", reference: "% AUTORIZADO CONFECC % AUTORIZ CONFECC")
FORANEAS "Comisión Serigrafía":            multiply(reference: "BASE COMISION", reference: "% AUTORIZADO SERIG")
DIST Y SUC (category-varying base):        all 10 fields (references + filter predicates) are column headers, 0 invented
```

**W-2 — reference, not constant (per-person rates).** Every rate is a `reference` to its column (`consts=[]` on the rate path); the engine reads each entity's own `% AUTORIZADO` value at calc time (Decision 111 — the existing path, no new code).

**W-3 — MAQUINARIA (2) no truncation.** Skeleton completes (the 16384 ceiling); all components emit cleanly (`failed=0`). The skeleton-level fix (omit `rateTableCellCount` for a per-row column rate) also closed a Phase-B `exhaustive_emission` failure that the W-2 reference rule otherwise induced — without it, MAQUINARIA (2) would persist 0 plans (atomicity). HALT-5 clear (8/8, none truncate).

## EPG-3 (W-4) + EPG-4 (W-5) — deterministic unit tests (`ob256-fidelity.test.ts`, 4/4)
```
✔ W-4: plan ::split verdict reports the recognized commission-rule columns, not "by elimination"
       → "This looks like plan rules: 3 columns recognized as plan rules content — "% AUTORIZADO", "BASE COMISION", …"
✔ W-4: a winner with NO affinities still falls back to the honest "by elimination" line (no over-firing)
✔ W-5: projectImportTelemetry surfaces plan creation counts (2 plans / 20 components from unit-states)
✔ W-5: a plan-free import reports zero plans (no false counts)
```
W-5 wiring: `execute-bulk` calls `accumulateUnitCommitFields({plansCreated:1, componentsCreated:<count>})` per successful plan unit; `projectImportTelemetry` sums them into `plans:{created,components}`; `ImportReadyState` renders "Compensation Plans Created / Plan Components Built" when > 0. The settle-audit's `compareTelemetry` does not compare `plans`, so the batch/signal-scan auditor's zero produces no false divergence.

## EPG-5 (W-6) — import debounce (code inspection)
`page.tsx handleConfirmAll`: `if (confirmingProposalRef.current === state.proposal.proposalId) return; confirmingProposalRef.current = state.proposal.proposalId;` — a synchronous ref guard set before any dispatch. A second click during the async storage-await (phase still 'proposal' in the stale closure) is rejected → one execute-bulk dispatch per proposal; a later different import (new proposalId) proceeds.

## Acceptance (§3.6)
- **A-1 / A-2 / A-4** — 8 plans, real prime_dag components, **column-name references**, per-person rates as references — **PASS** (EPG-1, all 8 sheets at the interpretation level, the substance the persisted upsert carries; OB-255-continuation already proved the same `executeBatchedPlanInterpretation` persists these as 8 active rule_sets).
- **A-3 — convergence binds** — the references are now the EXACT column names the entity branch commits to `committed_data` (Carry Everything commits the de-banded columns `% AUTORIZADO`, `BASE COMISION`, …). Convergence matches by name (Decision 111, unchanged), so the references resolve where the old abstract names produced "Critical: Bound column absent." Name-alignment proven (refs ⊆ de-banded committed columns); the live re-import confirms the badge clears.
- **A-5 (W-4), A-6 (W-5), A-7 (W-6)** — PASS (above).
- **A-8 — DD-7 / narrative preserved (HALT-6 clear)** — the prompt instruction is gated on the tabular `=== Sheet: … ===` header marker; a narrative PDF/PPTX has none, so its interpretation is unchanged by construction. The engine/convergence are untouched (HALT-1). SCI suite **208/208** (no regression).
- **A-9** — `tsc` clean; `npm run build` green (BUILD_ID present); dev on :3000.

## Scope note for the architect (SR-44)
The 8 plans are proven at the interpretation level (the LLM now emits column-name references on every sheet). The DB currently holds the OB-255-continuation plans (abstract names) for tenant `2d9979ba`; per §3.6 a **Clean Slate + re-import** persists the corrected (column-name) plans and clears the "Critical" badges — this is the architect's live browser verification (the content-hash idempotency would otherwise reuse the old plans). CC did not auto-delete tenant data (the operator interrupted such a delete on a prior OB). No migration; no engine/convergence change.

ARTIFACT SYNC (deltas; architect applies):
```
MC: OB-256 → plan fidelity (column-name refs) + import-UI truth; prompt+UI only, no engine/convergence; PR open.
REGISTRY: row "tabular plan construction" → ev: 8/8 sheets emit column-name references (executed, real LLM).
R1: tabular-plan-references-are-column-names → PASS (8/8, zero abstract); convergence binds by name (unchanged).
BOARD: now = the plan interpretation emits actual column-name references (convergence-bindable) + UI counts plans + honest rationale; gap = live Clean Slate re-import to persist corrected plans + clear badges (architect); ev = EPG-1 8/8 + 4/4 unit + 208/208; lane = review (PR open).
SUBSTRATE: ICA — "reference the input's column, never invent": a tabular plan's references bind only when they ARE the source column headers (Decision 158 boundary made concrete for tabular plans).
```
