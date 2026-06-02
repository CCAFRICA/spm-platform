# HF-261 — ADR + Scoped Enumeration (Phase 1, READ-ONLY)

**HF:** HF-261 — Meridian Fleet (C5) Aggregate-Projection + Hub Payee Exclusion
**Date:** 2026-06-01
**HEAD SHA read:** `d7497bf6` (branch `dev`)
**Tenant:** Meridian `5035b1e8-0754-4527-b7ec-9f93f85e4c79` · rule_set `2fb555d4-53fe-42e8-9662-cae3d07da4f4`
**Classification:** read-only enumeration + ADR. **No code edited.** All DB reads via service-role tsx (temp scripts removed).
**HF number:** HF-261 confirmed next-unused (directive present; no prior HF-261 ADR/report).

> **VERDICT: HALT-3 + HALT-1.** The live read **redirects the §1.3 / Defect-1 cause**. The C5=0
> mechanism is a **convergence binding cross-keying mismatch**, not the AUD-005 "`scope_aggregate`
> reads an unpopulated `data.scopeAggregates`." That code path **was deleted in HF-238 R2**: the
> `scopeAggregates` field no longer exists, the fleet intent is **not** a `scope_aggregate` (it is a
> plain `reference` tree), and the directive's RECOMMENDED fix ("populate `data.scopeAggregates` in
> the per-entity loop") **cannot be implemented as written**. Two genuinely-different structural fix
> options exist (below). **HALT for architect disposition before any edit.** Defect 2 reproduces but
> its structural discriminator is **provenance**, not `entity_type`.

---

## §A — The three enumerated sites (DD-1/DD-2/DD-3)

### (a) Convergence fleet-binding **production** — `convergence-service.ts` `convergeBindings` (`:199`)
The persisted output for the fleet component (`component_4` and its variant twin `component_9`),
live from `rule_sets.input_bindings.convergence_bindings` (rule_set `2fb555d4`):
```json
"component_4": {
  "period":            { "column": "Mes" },
  "entity_identifier": { "column": "No_Empleado", "contextualIdentity": "employee_identifier" },
  "cargas_totales_hub":   { "column": "Cargas_Totales",  "learning_provenance": { "batch_id": "94ed4675-…" } },
  "capacidad_total_hub":  { "column": "Capacidad_Total", "learning_provenance": { "batch_id": "94ed4675-…" } }
}
```
- `convergence_version: HF-234`; learned **2026-06-01T12:35** (today — the tenant was re-imported/re-converged).
- The binding resolves the two hub measures to columns `Cargas_Totales` / `Capacidad_Total`, which live in **batch `94ed4675`** — the **hub-keyed reference batch** (`data_type='reference'`, sheet `Datos_Flota_Hub`, one row per `Hub` per `Mes`). The binding keys resolution on `entity_identifier = No_Empleado` (the **employee**).
- **No `scope` / boundary is emitted** on this binding (the field exists — `convergence-service.ts:52` `scope?`, walked at `:645` HF-224 — but is unset here).

The persisted **intent** for "Utilización de Flota" (variant `v0.c4` / `v1.c4`) is a plain PrimeNode `reference` tree — **not** a `scope_aggregate`:
```json
multiply(
  conditional(
    condition: gt( divide(ref:cargas_totales_hub, ref:capacidad_total_hub), 1.5 ),
    then: 1.5,
    else: divide(ref:cargas_totales_hub, ref:capacidad_total_hub) ),
  800 )
```
`reference` reads `context.metrics[field]` (`intent-executor.ts:152`). The metric is populated by convergence keyed on the **employee** `No_Empleado`; `Cargas_Totales`/`Capacidad_Total` exist **only** in the **hub-keyed** reference batch — **no employee row carries them** (live: rows containing `Cargas_Totales_Hub`/`cargas_totales_hub` = **0**). → metric absent → `divide(0,0)=0` (`b.isZero()→ZERO`) → `gt(0,1.5)=false` → `else=0` → `×800 = 0`. **C5 = 0, every entity, every period** — confirmed by code + persisted binding, not by a calc run (Phase 3 proves live).

**Classification: PRODUCTION-SITE.** The defect originates here: a hub-level measure bound to a hub-keyed column but resolved on the employee key, with no boundary to bridge employee→hub.

### (b) `scopeAggregates` **population** — DOES NOT EXIST at HEAD
- `intent-executor.ts:40` — *"HF-238 R2 Closure 2: **scopeAggregates field deleted**. The scope prime computes hierarchical aggregates on the fly from `allEntityRows`."*
- `intent-executor.ts:344` — *"scope_aggregate pre-population block removed … no `scope_aggregate:*` synthetic key in `context.metrics` any longer."*
- `scope_aggregate` now translates (`legacy-intent-to-dag.ts:130`) to `scope(boundary) → aggregate(op, field)`; the `scope` prime (`intent-executor.ts:223-238`) narrows `allEntityRows` to **peer ENTITIES** sharing `entityMetadata[boundary]`, **self-excluded** ("manager does not earn override on own revenue"), and `aggregate` sums `row[field]` over those peers. `allEntityRows` is built from entity-keyed `committed_data` (`run/route.ts:1708-1720`, wired `:2445`).

**Classification: POPULATION-SITE — ABSENT.** The directive's target (`data.scopeAggregates`, `intent-executor.ts:811`) is gone; the file is 431 lines. **This is the HALT-3 divergence.** The new scope prime is **peer-entity** aggregation; it does **not** project a single hub-reference row onto members (hub totals are not per-employee values to sum over peers).

### (c) Hub-as-payee **admission** — `run/route.ts` (assignment + population filter)
- **Assignment (self-heal):** `run/route.ts:398-433` (HF-126/HF-189) assigns **ALL tenant entities** to the rule set with `assignment_type:'direct'`, `metadata:{}` — **no provenance/roster discrimination**. → all 79 entities (incl. 12 hubs) get a `rule_set_assignment`.
- **Population filter:** `run/route.ts:1035-1052` narrows `calculationEntityIds` to `rosterSheetName` members — but `rosterSheetName` detection (OB-147, `:1007-1033`) is Tier-2 parent-sheet (`__`) heuristic + Tier-3 keyword fallback `['datos colaborador','roster','employee','empleados']`. Meridian's roster sheet is **`Plantilla`** — matches **no** keyword and has no `__` children → **`rosterSheetName = null`** → filter never engages → all 79 (incl. 12 hubs) are calculated and paid.

**Classification: ASSIGNMENT-SITE** (`:398-433`) + **POPULATION-FILTER read-only-context** (`:1035-1052`). Note: extending the Tier-3 keyword list with "plantilla" would be an **AP-25 / HALT-5 literal violation** — the discriminator must be structural (provenance), not a sheet-name keyword.

### Classification table (DD-3)
| Ref | Site | file:line | Class |
|---|---|---|---|
| (a) | convergence fleet-binding emission | `convergence-service.ts:199` (`convergeBindings`) | **production-site** |
| (a) | persisted fleet intent + bindings | `rule_sets` (2fb555d4) `component_4`/`_9` | production-site (live artifact) |
| (b) | `scopeAggregates` population | `intent-executor.ts:40,344` (DELETED) | **population-site — absent** |
| (b) | scope-prime resolution (new) | `intent-executor.ts:223-238`; `run/route.ts:1708,2445` | read-only-context |
| (c) | assignment self-heal (all entities) | `run/route.ts:398-433` | **assignment-site** |
| (c) | roster population filter (fails: Plantilla) | `run/route.ts:1007-1052` | read-only-context |

---

## §B — Live state (calculated/observed values verbatim; no reconciliation verdict)

- **Entities:** 79 total, **all `entity_type='individual'`** (0 hub-typed). By provenance: **67 with a roster (`entity`/`Plantilla`) row = employees**; **12 without = hubs**, whose `external_id` IS the hub name (`Tijuana Hub`, `CDMX Hub`, …), provenance sheets `Datos_Flota_Hub` (reference) + `Datos_Rendimiento` (transaction), `metadata = {}`.
- **Assignments:** 79, all on `individual` entities (= 67 employees + 12 hubs).
- **committed_data:** `entity` 67 · `reference` 36 (12 hubs × 3 months) · `transaction` 201.
  - `reference` (sheet `Datos_Flota_Hub`) row keys: `Hub, Mes, Año, Region, Cargas_Totales, Capacidad_Total, Tasa_Utilizacion` — **hub-keyed**.
  - `transaction` (sheet `Datos_Rendimiento`) row keys include `No_Empleado, Hub, Cargas_Flota_Hub, Capacidad_Flota_Hub, Volumen_Rutas_Hub, Tasa_Utilizacion_Hub` — **employee-keyed, with hub fleet values denormalized onto each employee row.**
- **Structural grouping key is clean and present:** employee roster `Hub_Asignado` ∈ {12 hub names} === reference `Hub` ∈ {same 12 hub names} (exact 12=12 match). Resolvable by field-identity + provenance — **no literal required in code**.
- **Isolation:** the four non-fleet components bind to **employee-keyed** transaction columns (e.g. `component_0` → `Ingreso_Meta`/`Ingreso_Real`, batch `50b6d0d5`); they resolve on `No_Empleado` and are untouched by any fleet/hub fix.

*(CC asserts no "correct/expected/matches" verdict — the architect reconciles against the reference file.)*

---

## §C — ADR: proposed fix shapes (architect disposition required — HALT-1)

The directive's RECOMMENDED shape (`scope_aggregate` + populate `data.scopeAggregates`) is **not viable**: that field/path is deleted (HF-238 R2) and the fleet intent is not a `scope_aggregate`. The real cause is the **binding cross-key** at site (a). Two structural, Korean-Test-clean options:

**Fleet (Defect 1):**
- **Option A — re-target the binding (minimal).** Bind `cargas_totales_hub`/`capacidad_total_hub` to the **employee-keyed transaction columns** `Cargas_Flota_Hub`/`Capacidad_Flota_Hub` (already denormalized per employee on `Datos_Rendimiento`). Resolves directly on `No_Empleado`; **no aggregation, no projection, no scope prime, no new population path.** The intent tree is unchanged. ⚠️ Architect-channel semantics check: confirm `*_Flota_Hub` (transaction) carry the intended hub totals (column names differ from reference `Cargas_Totales`/`Capacidad_Total`) — CC will not assert equivalence.
- **Option B — aggregate-projection (directive's "ratio+aggregate").** Per-hub sum the reference `Cargas_Totales`/`Capacidad_Total`, project onto each employee by `Hub_Asignado===Hub`. Requires a real projection mechanism: the new `scope` prime is **peer-entity** aggregation (self-excluded) and does **not** fit single hub-reference rows, so this needs either (B1) convergence to emit a hub-scoped `scope_aggregate` **and** the executor/route to admit hub-reference rows into the scoped set keyed by the hub boundary, or (B2) a per-hub aggregate computed in the per-entity loop and exposed as a resolvable metric. Larger surface; touches the engine, not just the binding.

**Hub payee exclusion (Defect 2):** structural discriminator = **provenance** (no person-roster row; reference-sheet origin; `external_id`=hub name; empty metadata) — **not** `entity_type` (uniformly `individual`) and **not** a name literal. Lever options:
- **(c-i)** exclude reference/scope-provenance entities at **assignment** self-heal (`:398-433`), or
- **(c-ii)** make the **population filter** (`:1035-1052`) recognize roster provenance structurally (entity has a person-roster row) rather than by sheet-name keyword — which also de-literalizes the existing Tier-3 fallback.

**Isolation confirmation:** every option above touches only the fleet binding (a) and the hub-admission lever (c). The four non-fleet components' bindings/intents/resolution are not modified (DD-7).

---

## §D — Decision / HALT

- **HALT-3 (cause divergence) — FIRED.** C5=0 is a convergence binding cross-keying mismatch (hub-keyed reference columns resolved per-employee), **not** the AUD-005 unpopulated-`scopeAggregates` finding (deleted code; intent is not `scope_aggregate`). Do **not** implement the recommended shape.
- **HALT-1 (ADR disposition) — FIRED.** Architect to choose: **Fleet → Option A (re-target binding) or B (aggregate-projection)**; **Hub exclusion → (c-i) assignment or (c-ii) population-provenance**; and to confirm the `*_Flota_Hub` semantics (Option A) against the reference.
- **HALT-5 (Korean Test) — flagged, not blocking:** all proposed levers are structural (field-identity + provenance). The existing roster Tier-3 keyword list is itself a latent AP-25 literal; (c-ii) would remediate it. No fix path requires a tenant/language literal.
- **Entity-state note:** Meridian was re-imported/re-converged **today** (learned_at 2026-06-01T12:35); live counts (67 employees + 12 hubs = 79) match the directive's figures. No reconciliation verdict offered.

**No edits performed. Awaiting architect disposition on §C before Phase 2.**

*HF-261 ADR — read-only enumeration at `d7497bf6`. HALT-3 + HALT-1. No code, no SQL, no calc run.*
