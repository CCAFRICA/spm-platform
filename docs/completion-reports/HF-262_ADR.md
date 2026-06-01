# HF-262 — Lever-Selection ADR (Phase 1, READ-ONLY)

**HF:** HF-262 — Meridian Fleet (C5) Reference-Row→Member Projection + Hub Payee Exclusion
**Date:** 2026-06-01 · **HEAD SHA read:** `2473868e` (branch `dev`)
**Tenant:** Meridian `5035b1e8-0754-4527-b7ec-9f93f85e4c79` · rule_set `2fb555d4-53fe-42e8-9662-cae3d07da4f4`
**Cites:** `AUD-005_..._e85a7678.md` (calc SSOT) · `DIAG-58_AGGREGATE_SCOPE_CAPABILITY_OUTPUT.md` (Condition A)
**Classification:** read-only ADR. **No code edited, no SQL, no calc run.**

> **VERDICT: HALT-1.** DIAG-58's Condition-A determination is **confirmed, not contradicted** (HALT-3
> not triggered). But Phase-1 reading establishes a **load-bearing fact the L1/L2 framing understates:**
> the fleet `calculationIntent` is a persisted `reference` tree, and the engine executes it from
> persisted data (`transformVariant(defaultComponents)`, `run/route.ts:366`). **L1/L2 only make the
> scope prime *able* to match siblings — they do not make the fleet intent *use* the scope prime.** The
> fix therefore **necessarily includes a fleet-intent emission change** (reference-tree → `scope→aggregate`),
> which is the §3.1(d) convergence-touch (SR-42) surface. This raises real AP-17/scope questions that
> require architect disposition before any edit.

---

## §A — Confirmation of DIAG-58 (HALT-3 check) — NOT contradicted
- `scope` prime (`intent-executor.ts:223-238`): matches siblings on `entityMetadata[boundary]`,
  self-excluded by `entityId`; downstream `aggregate` sums `row[field]`. **Peer-entity aggregation.**
- Reference-row→member projection: **absent** (no path admits a single boundary-keyed reference row and
  projects it onto members). Confirmed again at HEAD. Condition A holds → proceed to lever selection.

---

## §B — The four lever surfaces (Phase-1 reads)

### (a) Projection lever surfaces
- **Scope prime** (`intent-executor.ts:223-238`) — the one mechanism; reads `entityMetadata[boundary]`.
- **Entity-metadata population at import** — entity-resolution **always inserts `metadata: {}`**
  (`entity-resolution.ts:283-290`); per-entity attributes go to `temporal_attributes` (HF-199 D3), **not**
  `metadata`. The only post-creation `entities.metadata` writer is `store-metadata-population.ts:93-121`
  (HF-239), which sets `store_id/volume_tier/volume_key` keyed on a **literal field list**
  `['storeId','num_tienda','No_Tienda','Tienda']` (`:28`) — no hub. ⇒ Meridian hub & employee entities
  carry no hub boundary in `metadata`; **L1 requires a new, de-literalized metadata population** (resolve
  the grouping field by field-identity/provenance, not a literal — extending the store-field literal would
  be **AP-25/HALT-5**).
- **L2 alternative** — match a **row** boundary field inside the scope prime. The reference row carries
  `Hub`; employee rows carry `Hub_Asignado` (different column names) ⇒ L2 needs a cross-name reconciliation
  resolved by identity (else literal/HALT-5), and changes the scope prime's matching contract.

### (b) Hub-exclusion lever surfaces
- **Assignment self-heal** (`run/route.ts:398-433`, HF-126/189): assigns **all** tenant entities, no
  provenance filter → 12 hubs assigned.
- **Roster population filter** (`run/route.ts:1007-1052`, OB-147): would exclude non-roster, but
  `rosterSheetName` detection is Tier-2 `__`-parent heuristic + Tier-3 **literal** keyword list
  `['datos colaborador','roster','employee','empleados']` (`:1025`) — Meridian's `Plantilla` matches none →
  filter inert → hubs calculated/paid.
- **Provenance signal** (from HF-261, re-confirmed): hub = no person-roster (`entity`/`Plantilla`) row;
  `external_id` = hub name; origin reference sheet; `metadata={}`. Structural, no literal.
- **`dataByEntity` is built from ALL entities' committed_data** (`run/route.ts:634-710`), **unfiltered by
  `calculationEntityIds`** (computed later, `:1046`). ⇒ **hubs can be excluded as payees while their
  reference rows remain in `allEntityRowsForPeriod` (`:1709`) as the fleet scope SOURCE.** (Directive's
  "source not recipient" requirement is satisfiable.)

### (c) `undefined===undefined` guard site
- `intent-executor.ts:229-235`: `r.entityMetadata[node.boundary] === boundaryValue`. When `boundaryValue`
  is `undefined` (entity lacks the boundary attr — true for every entity today, since `metadata={}` or
  lacks the hub key), it matches **all** metadata-less siblings. Introducing a hub boundary makes this a
  live hazard. Guard MUST reject null/undefined `boundaryValue` (skip aggregation). DIAG-58 latent footgun.

### (d) Convergence / intent-emission — **the load-bearing surface**
- The fleet `calculationIntent` is a persisted `reference` tree (`multiply(conditional(divide(ref:cargas_totales_hub, ref:capacidad_total_hub) vs 1.5), 800)`); `reference` reads `context.metrics[field]` and **never touches the scope prime or `allEntityRows`.**
- Calc executes it from persisted data: `componentIntents = transformVariant(defaultComponents)` (`:366`); `entityIntents` → `executeIntent` (`:2369-2450`). The intent shape is fixed by `rule_sets.components[].calculationIntent`.
- Convergence derives `scope` only from the plan intent's leaf (`convergence-service.ts:643-651`, `scope = leaf.sourceSpec?.scope`); the fleet leaf has **no scope** today.
- ⇒ **For the fix to flow through the one scope mechanism, the fleet intent must be re-shaped to `scope(hubBoundary)→aggregate(sum,loads)` ÷ `scope(hubBoundary)→aggregate(sum,capacity)`.** That is a fleet-only emission change (plan-interpretation/convergence) **and** requires the new intent to be **re-persisted** (re-import/supersession or a structural calc-time transform). L1/L2 are prerequisites for the boundary match; they do not by themselves change the intent.

### Classification table (DD-3)
| Ref | Site | file:line | Class |
|---|---|---|---|
| (a) | scope prime (the one path) | `intent-executor.ts:223-238` | projection-lever |
| (a) | entity-metadata population (L1) | `entity-resolution.ts:283-290`; `store-metadata-population.ts:93-121` | projection-lever (needs de-literalization) |
| (a) | row-field match (L2) | `intent-executor.ts:229-236` | projection-lever (literal risk) |
| (b) | assignment self-heal | `run/route.ts:398-433` | exclusion-lever (c-i) |
| (b) | roster population filter | `run/route.ts:1007-1052` | exclusion-lever (c-ii) |
| (b) | `dataByEntity` (source retained) | `run/route.ts:634-710, 1709` | read-only-context |
| (c) | boundary-match guard | `intent-executor.ts:229-235` | guard-site |
| (d) | fleet intent shape / emission | `rule_sets.components`; `convergence-service.ts:643-651`; `run/route.ts:366` | convergence-emission (load-bearing) |

---

## §C — Recommended levers (for architect disposition)

**Fleet (Defect 1) — RECOMMEND L1 + required emission change (d):**
1. **(d)** Re-shape the fleet component's intent to `scope(hubBoundary)→aggregate(sum,loads)` ÷ `scope(hubBoundary)→aggregate(sum,capacity)`, applied by the existing fleet conditional/rate. Routes through the **one** scope prime (AP-17). Fleet-component-only; the four non-fleet intents untouched.
2. **L1** Populate the hub boundary into `entities.metadata` for hubs **and** employees, **structurally** (resolve the grouping field by field-identity/provenance — the same signal that marks hub provenance — *not* the store-field literal list). The hub entity's metadata-boundary admits its reference rows into each member's scoped set; employees' metadata-boundary is the match key.
3. **(iii)** Guard the scope-prime boundary match against null/undefined.

**Reject L2** (row-field match): needs `Hub`↔`Hub_Asignado` cross-name reconciliation (literal/HALT-5 risk) and mutates the scope prime's matching contract more invasively than L1.

**Reject metrics-injection** (compute per-hub aggregate, inject as the employee's `cargas_totales_hub` metric so the persisted reference-tree resolves): avoids re-emission **but is a second/parallel projection path outside the scope prime → AP-17 / HALT-6 violation** as the directive defines it. Flagged, not recommended.

**Hub exclusion (Defect 2) — RECOMMEND (c-ii):** recognize roster **provenance** at the population filter (`:1035-1052`) — exclude entities lacking a person-roster row — which also **de-literalizes the Tier-3 keyword list** (AP-25 side benefit) and keeps hubs in `dataByEntity` as scope source. (c-i at assignment is viable but does not de-literalize and risks dropping hub source data if over-applied.) Phantom hub results/assignments remediated per disposition (re-import supersession vs explicit cleanup; SQL → §0 gate).

**Isolation (DD-7):** all recommended changes touch only the fleet intent (d), the boundary metadata/guard (a/c), and the payee filter (b). The four non-fleet components bind to employee-keyed transaction columns and resolve via `reference`/`ratio` on `No_Empleado` — **untouched**.

---

## §D — Open questions requiring disposition (HALT-1)
1. **Approve the fleet emission change (d)** — re-shaping the fleet intent to `scope_aggregate`. This is the SR-42 convergence-touch the directive pre-dispositioned in principle; confirm the **mechanism**: (A) re-interpretation/re-import re-persists the scope-shaped intent, (B) convergence production emits the scope on the fleet binding and the intent is re-derived, or (C) a structural calc-time transform. (A/B change persisted data → re-import/supersession; C is calc-only.)
2. **Confirm AP-17 reading:** emitting a `scope_aggregate` for the fleet (so it uses the existing scope prime) is "extending the one path," not a second path — vs the rejected metrics-injection. Confirm HALT-6 is satisfied by the recommendation.
3. **L1 metadata population:** approve a de-literalized boundary-population (field-identity/provenance) rather than extending the store-field literal list.
4. **Exclusion lever:** (c-ii) population-provenance (recommended) vs (c-i) assignment.
5. **Data remediation:** re-import supersession vs explicit cleanup SQL for the 12 phantom hub entities/assignments/results (and the metadata backfill) — determines whether Phase 2 authors a migration (AP-8/FP-49 gate).

**No edits performed. Awaiting architect disposition on §C/§D before Phase 2.**

*HF-262 ADR — read-only lever selection at `2473868e`. HALT-1. DIAG-58 Condition A confirmed. No code, no SQL, no calc run.*
