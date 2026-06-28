# ADR — HF-353 Enterprise Ingestion + Robles Distribution Pipeline Completion

**Status:** Accepted (committed before implementation, §3.0)
**Date:** 2026-06-28 · **Branch:** `hf-353-enterprise-ingestion-robles` (from main `e73ee5de`, incl. directive base `2363b440`) · **Directive:** `ab2d9806`
**Author:** CC (ULTRACODE autonomous)

Four interconnected blockers stop Robles Maquinaria (a real tenant now in the DB, `74d71a1d-…`, `calculation_results=0`) from completing the lifecycle. Evidence from a 4-stage parallel gate + a live Robles DB probe.

---

## 1. Evidence summary + fix points

| Blocker | Fix point (existing file) | Defect |
|---|---|---|
| **A** OOM | `commit-content-unit.ts:571-617` (`insertRows = rows.map(...)`) | the **entire** 86K×87 insert payload is materialized (a 3rd full data copy) before the chunked INSERT loop (`:619-643`) slices it → ~2GB peak heap. Chunking the writes does not bound memory. |
| **B** hierarchy edges | `post-commit-construction.ts:222-352` (`detectHierarchyEdges`/`constructHierarchyEdges`, my OB-248 P-I1 code) | picks source/target/type by **value-overlap cardinality + a low-cardinality type column**; on `__EMPTY` merged-header columns it finds no type column → 0 edges → C2 skip. The HC **recognized the roles** (identifier/name/categorical/reference-pointer) — the code never reads them. |
| **C** cross-component | `convergence-service.ts:3390-3409` (abstain→`match_pass:'failed'`) + `route.ts:387-404` (HF-281 gate) + `route.ts:~3070` (per-entity component loop) | convergence only offers **raw data columns** to the binding LLM, so `comision_ventas_devengada` (the cascade component's computed output) abstains → gap → HF-281 422 "calc aborted". No binding kind points a token at another component's output. |
| **D** client resubmit | `SCIExecution.tsx` plan branch (`:500-568`, `pollPlanRecovery :105-135`, `handleRetryFailed :743-761`) | a timed-out/504 response from a still-running 83s interpretation is treated as **terminal failure** → units marked `error` → "Retry failed" → re-POST. The durable truth (`plan_interpretation_runs.status`, HF-259) is exposed to nothing. |

### Live Robles grounding (the carried reality)

- **Jerarquia sheet** (`entity::Jerarquia`, 35 rows): columns `__EMPTY`=person name, `__EMPTY_1`=Rol, `__EMPTY_2`="Cobra sobre / Reporta a"=**the superior (target)**, `__EMPTY_3`="Tipo de relacion"="Vertical"=**type**, `Jerarquia…Aristas`="ID Entidad"=**source external_id (ENT-V02)**. Each row = one edge `source → reports-to`, type `Vertical`. Roles are recognized; column NAMES are noise.
- **rule_set** "Plan de Distribucion de Comisiones 2025": 6 per-role variants; `vendedor` = `[Comision de Cascada - Vendedor, Minimo Garantizado, Bono por Racha]`. `Minimo Garantizado.intent` = `conditional(comision_ventas_devengada < 7500, 7500 − comision_ventas_devengada, 0)` — references the cascade component's output. **`input_bindings` is EMPTY** (convergence aborted). The cascade component is a **plain `prime_dag`** (no `distribution` key) → Robles is a per-entity plan, not OB-248 distribution mode.

---

## 2. Premise corrections / clarifications

1. **Robles is NOT a distribution-mode plan.** Its cascade is authored as per-variant per-entity components (no `metadata.distribution`). So OB-248's distribution branch stays inert (`distributionDerivation === null`), the per-entity loop runs, and **Blocker C rides the existing `prior_component` (`prior:<idx>`) rail** in that loop — cascade (component 0) → Minimo Garantizado (component 1). No new evaluation mode.
2. **The per-sheet HC, not the global `comprehension_artifacts`.** `comprehension_artifacts.field_name` collides across sheets (`__EMPTY_2` means "—" in Personal but "reports-to" in Jerarquia). P-B must read the **Jerarquia sheet's own HC** (per-sheet `classification_signals.header_comprehension`, keyed by `sheet_name`), and there is an ordering subtlety (comprehension_artifacts is written by `generateComprehension` which finalize-import runs *after* `executePostCommitConstruction`).

---

## 3. Design decisions

**D-A — Chunked payload build (inline the map into the existing chunk loop).**
Replace `const insertRows = rows.map(...)` + `insertRows.slice(...)` with: iterate `for (i in 0..rows.length step chunkSize)`, build the chunk payload inline from `rows.slice(i, i+chunkSize)` through the **same projection**, insert (same retry/rollback), then drop the chunk reference. The outer-scope `earliestDate/latestDate/dateCount` accumulators stay (the projection still calls `extractSourceDate`). Peak heap drops from ~3× to ~2× parsed data + one chunk. **HALT-DATA-LOSS guard:** after the loop, `if (totalInserted !== rows.length) fail loud`. row_count/hash are from `rows` (unchanged); post-commit reads from the DB (transparent). Chunk size unchanged (profile: 500 sci-bulk / 5000 sci).

**D-B — Role-based edge construction (read HC roles, not column names/cardinality).**
`constructHierarchyEdges` reads the hierarchy sheet's **per-sheet HC roles** and selects: **source** = the identifier/entity-scope column, **target** = the **reference/relational-pointer** column (`scopeIsReference` — the recognized superior pointer), **type** = the categorical/relationship-label column. For each row: source entity = the row's resolved `entity_id` (else resolve the source column value); target entity = resolve the target column value against the tenant entity domain (external_id then normalized display_name); type = the type column value (open-vocab, the CHECK is now widened — confirmed live `Zona Norte` edges exist). Fail loud (C2) naming the roles present if no reference/relational-pointer role. Korean Test: column NAMES never read; roles only. Keeps the OB-248 value-overlap path as a fallback when no HC roles are available (neutrality for non-`__EMPTY` sheets).

**D-C — `component_reference` binding on the existing `prior_component` rail.**
(1) *Convergence* (`convergence-service.ts:3390-3409`): before recording an abstained token as `match_pass:'failed'`, offer the plan's **other components' output identities** to the recognizer (Decision 158); on a match, write `{ column: '', component_ref: <producerComponentIndex>, field_identity: { structuralType: 'computed', contextualIdentity: 'component_output' }, match_pass: 1, confidence }`. `component_ref` is the producer's **structural index**, never its name (Korean Test). Count `component_ref` as mapped in `mappedTokensForBinding` so `findIncompleteBindings`/HF-281 pass. (2) *Engine* (per-entity loop): topologically order the variant's components by `component_ref` dependency (cycle → C2 fail-loud), and when resolving a consumer DAG's referenced field, supply the producer's already-computed output from `priorResults[producerIndex]` (the existing `prior:<idx>` rail, `intent-executor.ts:415-419`). Neutral: tenants with no `component_ref` binding keep array-order evaluation byte-identical.

**D-D — Durable-status polling; never re-submit while `in_progress`.**
Add a read-only `GET /api/import/sci/plan-run-status` over `plan_interpretation_runs.status` (HF-259's record). The `SCIExecution` plan branch polls it (mirroring the data path's `settleFromSurface`): while `in_progress` → keep units in `processing` ("still processing"), never `error`, so no re-POST fires; `completed` → resolve; `failed`/absent-after-stall → surface a retryable failure. The data path is unchanged (byte-neutral for non-plan imports).

---

## 4. Neutrality & blast radius (HALT-CALC)

- **A** changes only how the payload is built (chunked); committed rows are byte-identical; `committed_data` unaffected for existing tenants. No calc surface.
- **B** is gated: the role-based path engages when per-sheet HC roles are present; otherwise the OB-248 value-overlap path stands. Only affects entity-sheet imports producing edges. No calc surface.
- **C** the convergence branch fires only when a token matches a component output (BCL/Meridian/MIR have none → bindings byte-identical); the engine topo-order is identity when there are no `component_ref` deps. **HALT-CALC:** BCL $312,033 / Meridian $556,985 / MIR Plan 2 = 210,000 — verified unchanged (these don't re-import/re-converge unless run).
- **D** is plan-path-only, additive read endpoint.

## 5. Proof strategy

Robles tenant exists live → **PG-2 (edges), PG-3 (convergence completes), PG-4 (calc non-zero)** are provable **live** (PG-4 calc subject to the OB-246 auth gate — run via the authed path or report the binding completeness + a structural calc). **PG-1 (86K import)** and **PG-7 (Tier 1)** are architect-channel (the JDE file isn't in the DB) — proven by construction (chunked build) + a unit/memory argument. **PG-5 (no resubmit)** is code + the new status endpoint. **PG-6 neutrality** verified. Structural unit tests for A (chunk-equivalence), B (role-based selection on `__EMPTY` fixtures), C (component_ref binding + topo order), D (status-driven state machine).

## 6. ARTIFACT SYNC

- The OB-248 ARTIFACT SYNC #1 (widen `entity_relationships.relationship_type` CHECK) is **already applied** (live `Zona Norte` edges) — P-B relies on it.
- Live 86K JDE import (PG-1/PG-7) against the architect-channel file (SR-44).
- If P-C's engine wiring needs a `metric_derivations`/binding schema field beyond existing JSONB, it fits `convergence_bindings` (no migration).
