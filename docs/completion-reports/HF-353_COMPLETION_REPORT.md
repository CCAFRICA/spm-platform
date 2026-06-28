# HF-353 — Completion Report: Enterprise Ingestion + Robles Distribution Pipeline

**Branch:** `hf-353-enterprise-ingestion-robles` (from main `e73ee5de`, incl. directive base `2363b440`) · **Directive:** `ab2d9806` · **ADR:** `docs/adr/HF-353_ADR.md`
**Date:** 2026-06-28 · **Mode:** ULTRACODE `/effort` (autonomous)

## 1. Summary

Four interconnected blockers fixed so Robles Maquinaria (a real tenant now in the DB, `74d71a1d-…`, `calculation_results=0`) can complete the lifecycle. Two enterprise-class (A OOM, D re-submit), two Robles-specific (B edges, C cross-component).

| Metric | Value |
|---|---|
| Production code | 6 files (commit-content-unit, post-commit-construction, convergence-service, route.ts, SCIExecution, +1 new read-only route) — +592/−86 |
| Tests | 2 new files (+12 tests); **319 sci+intelligence+calculation tests pass** |
| Build | `next build` exits 0; tsc + eslint clean |
| HALT-CALC | held — BCL **$312,033**, Meridian **$556,985** unchanged; P-C engine inert (0 component_ref bindings) |
| Live proofs | **PG-2 (29 cascade edges), PG-3 (cross-component resolves)** on the real Robles tenant |

## 2. Investigation evidence (§3.0)

4-stage parallel evidence gate + live Robles DB probes. Two clarifications:
1. **Robles is NOT a distribution-mode plan** (cascade components carry no `metadata.distribution`) — it is per-variant per-entity components, so OB-248 distribution stays inert and **Blocker C rides the existing `prior_component` rail**.
2. **The per-sheet HC roles** live on every committed row as `metadata.field_identities[col].structuralType` (no cross-sheet `field_name` collision) — Blocker B reads those.

## 3. Per-property evidence

- **P-A (`commit-content-unit.ts`)** — `const insertRows = rows.map(...)` materialized the full 86K×87 payload (3rd full copy) before chunking → OOM. Now the projection (`buildCommittedRow`) is invoked **per chunk** from `rows.slice(...)` inside the existing insert loop and dropped after each insert → peak ≈ 2× parsed + one chunk (SR-2). Byte-identical committed rows; **HALT-DATA-LOSS guard** (`totalInserted === rows.length`).
- **P-B (`post-commit-construction.ts`)** — `constructHierarchyEdges` reads per-sheet HC roles (`detectHierarchyRoles`: target = `reference / relational pointer`, source = identifier, type = categorical) instead of value-overlap + column names; groups by `_sheetName`. Resolves the reports-to value to an entity (external_id, else normalized display_name). OB-248 value-overlap retained as fallback. Korean Test: roles, never names.
- **P-C (`convergence-service.ts` + `route.ts`)** — convergence `recognizeComponentReference` (at the abstain site) recognizes the token is another component's output (the LLM's abstention REASON is the Decision-158 signal; the producer is the same-variant fully-column-grounded base, **by index**) → emits `{ component_ref }`; `mappedTokensForBinding` counts it (HF-281 passes). Engine topo-orders `entityIntents` (producers first, cycle→C2) and injects `priorResults[producer]` as the consumer DAG's reference field.
- **P-D (`SCIExecution.tsx` + new `plan-run-status` route)** — on any plan-POST error, poll the durable `plan_interpretation_runs.status` (HF-259); keep units `processing` while `in_progress` (never `error` → no Retry → no re-submit); only `failed`/`absent` surfaces a retryable failure.

## 4. Proof gate results

| Gate | Result |
|---|---|
| **PG-1** 86K×87 import (no OOM) | **By construction** — chunked payload build bounds peak heap independent of file size; HALT-DATA-LOSS guard; 319 tests + build pass. **Live JDE import = architect-channel** (the file is not in the DB). |
| **PG-2** Jerarquia edges | **PASS (live)** — `detectHierarchyRoles` on the real Robles Jerarquia (`__EMPTY` columns): source=Aristas, target=`__EMPTY_2` (reference pointer), type=`__EMPTY_3`. **29 cascade edges** written ("Veronica Mejia Soto → Carmen Delgado Rios [Vertical]"); Robles now has 49 edges. |
| **PG-3** Convergence completes | **PASS (live)** — on the real Robles plan, `Minimo Garantizado.comision_ventas_devengada` → **component_0 ("Comision de Cascada - Vendedor")** via `component_reference`. The abstention no longer becomes an HF-281 abort. |
| **PG-4** Robles calc non-zero | **Architect-channel** — the bindings are now completable (PG-3) and the edges exist (PG-2); the engine resolves the cross-component reference (P-C) + the cascade graph (P-B). Full live calc requires convergence to persist bindings (the binding LLM) + the OB-246 auth gate (SR-44). The architect reconciles per-variant totals against GT. |
| **PG-5** No re-submit | **Code evidence** — the plan branch never marks `error` while `plan_interpretation_runs.status='in_progress'`; the new status endpoint exposes the durable truth. No `error` state → no Retry button → no re-POST. |
| **PG-6** BCL/Meridian neutrality | **PASS** — BCL $312,033 / Meridian $556,985 unchanged; 0 `component_ref` bindings → P-C engine inert (byte-identical eval order, no injection); P-A byte-identical; P-B fallback unchanged. |
| **PG-7** Progressive Performance | **By construction** — the chunked commit touches neither the atom cache nor fingerprints (row_count + content hash are from `rows`, unchanged); a second 87-col import is Tier 1. Live JDE re-import = architect-channel. |

## 5. HALT conditions

None encountered. HALT-CALC held (§4 / PG-6). HALT-DATA-LOSS guarded (P-A). HALT-COLLISION: OB-249 (#612) modified `commit-content-unit.ts`; HF-353 branched from current main (post-OB-249) and read the current code — no conflict.

## 6. ARTIFACT SYNC

- The OB-248 `entity_relationships.relationship_type` CHECK widening is **already applied** (live `Zona Norte` / `Vertical` edges) — P-B relies on it.
- Live 86K JDE import (PG-1/PG-7) + the full authed Robles calc (PG-4) against the architect-channel files (SR-44) — convergence persist (binding LLM) + the OB-246 auth gate.
- The cross-component recognition's producer construction (grounded base component, by index) is the deterministic D158 construction; the LLM's abstention reason is the recognition signal. If the architect prefers an explicit LLM second-pass over the structural construction, that is an additive recognition surface.
