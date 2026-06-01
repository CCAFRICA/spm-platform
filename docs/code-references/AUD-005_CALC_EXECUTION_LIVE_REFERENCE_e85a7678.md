# AUD-005 — CALC-EXECUTION LIVE CODE REFERENCE (post-HF-238 Prime-DAG Engine)

## Generated at SHA: `e85a7678da579e60531a86a19f08bb1857853e59` (branch `dev`)
## Date: 2026-06-01 · Refresh trigger: DIAG-053 (HF-238 engine rebuild) · Classification: read-only live-code SSOT
## Supersedes for calc-execution citation: `AUD-005_..._5314c365.md` (2026-05-06, **pre-HF-238 — describes a DELETED engine**)
## Companion: `AUD-0015_..._dede922b.md` (ingestion/interpretation half — separately pinned, NOT refreshed here)

> **Why this refresh.** AUD-005 `5314c365` predates **HF-238 (PR #420, `63212283`)**, which rebuilt
> the calc engine to a prime-DAG architecture. HF-238 R2 Closure C2 deleted the `scopeAggregates`
> reference-form path. Every calc-execution surface changed; the `5314c365` reference is historical.
> This document is the current-SHA SSOT for calc execution. Retain `5314c365` for historical citation.
>
> **Evidence standard.** Real `file:line` at the header SHA with pasted signatures/dispatch.

---

## §0 — Engine shape (one path)
Post-HF-238, calc execution is a **single recursive `evaluate()` walker** over a 10-member `PrimeNode`
union. All stored intents flow through translation adapters at the storage boundary
(`legacy-intent-to-dag.ts`) into `PrimeNode` trees; there is no second execution path
(`intent-executor.ts:2-9`). componentType on results = `"prime_dag"` (verified live, Meridian batch
`e1098ffa`).

## §1 — FILE INVENTORY (calc-execution spine, current SHA)
| File | Lines | Role |
|---|---|---|
| `web/src/lib/calculation/intent-types.ts` | 438 | `PrimeNode` union, `VALID_PRIMES`, `EvalContext`, legacy `IntentOperation`/`IntentSource` |
| `web/src/lib/calculation/intent-executor.ts` | 431 | `evaluate()` (the one engine surface), `buildEvalContext`, `executeIntent` |
| `web/src/lib/calculation/legacy-intent-to-dag.ts` | ~170 | stored-shape → `PrimeNode` translation (incl. `scope_aggregate`) |
| `web/src/app/api/calculation/run/route.ts` | 3010 | orchestrator; builds `allEntityRowsForPeriod`, wires `EntityData`, calls `executeIntent` |
| `web/src/lib/calculation/decimal-precision.ts` | — | Decimal/Banker's-rounding boundary (Decision 122) |

## §2 — PrimeNode vocabulary  (`intent-types.ts:389-432`)
```ts
export type PrimeNode =
  | { prime: 'arithmetic'; op: 'add'|'subtract'|'multiply'|'divide'; inputs: [PrimeNode, PrimeNode] }
  | { prime: 'aggregate'; op: 'sum'|'count'|'avg'|'min'|'max'; field: string }
  | { prime: 'filter'; predicate: PrimePredicate; downstream: PrimeNode }
  | { prime: 'conditional'; condition: PrimeNode; then: PrimeNode; else: PrimeNode }
  | { prime: 'scope'; boundary: string; downstream: PrimeNode; temporal_range?: ScopeTemporalRange }
  | { prime: 'compare'; op: 'gt'|'gte'|'lt'|'lte'|'eq'|'neq'; inputs: [PrimeNode, PrimeNode] }
  | { prime: 'logical'; op: 'and'|'or'|'not'; inputs: PrimeNode[] }
  | { prime: 'constant'; value: number; meta?: ConstantScaleMeta }
  | { prime: 'reference'; field: string }
  | { prime: 'prior_period'; downstream: PrimeNode };
// VALID_PRIMES (:421-432): the 10 discriminators above.
```
`EvalContext` (`:402-418`): `entity:{metadata}`, `activeRows[]`, `allEntityRows:[{entityMetadata,row}]`,
`metrics:Record<string,number>`, `priorPeriodRows?`.

## §3 — The five context-narrowing / data-reading primes (the scope-relevant set)

### `scope` prime — `intent-executor.ts:223-238`  **[prime-definition; the aggregate-scope core]**
```ts
case 'scope': {
  const boundaryValue = context.entity.metadata[node.boundary];
  const selfEntityId = context.entity.metadata.entityId;
  const siblings = context.allEntityRows
    .filter(r => r.entityMetadata[node.boundary] === boundaryValue
              && r.entityMetadata.entityId !== selfEntityId)   // self-excluded (manager-override semantics)
    .map(r => r.row);
  return evaluate(node.downstream, { ...context, activeRows: siblings });
}
```
**Matching key = `entityMetadata[boundary]`** (the sibling ENTITY's metadata), NOT the row's data
fields. Self-excluded by `entityId`. → **peer-ENTITY aggregation.**

### `aggregate` prime — `intent-executor.ts:250-292` **[prime-definition]**
Reduces `context.activeRows` by `row[node.field]` (sum/count/avg/min/max); empty set → `ZERO`.

### `prior_period` prime — `intent-executor.ts:240-248` (HF-238 C5) **[prime-definition]**
Switches `activeRows` to `context.priorPeriodRows ?? []` for the downstream.

### `filter` prime — `intent-executor.ts:218-221`; `reference` prime — `:151-154` (reads `context.metrics[field]`).

### `scope_aggregate` translation — `legacy-intent-to-dag.ts:130-156` **[translation]**
```ts
case 'scope_aggregate': {
  const { field, scope, aggregation } = s.sourceSpec;
  // HF-238 Phase 3: scope prime narrows allEntityRows to siblings sharing the boundary
  // (self-excluded); aggregate reduces. Replaces the Phase 1 reference-form translation.
  return { prime:'scope', boundary: scope,
           downstream: { prime:'aggregate', op, field: stripMetricPrefix(field) } };
}
```

## §4 — Context population  (`intent-executor.ts:310-354`, `buildEvalContext`) **[context-population]**
Builds `metrics` from `data.metrics` + synthetic keys (`group:`, `attr:`, `prior:`, `cross_data:`).
`:344-346` verbatim: *"HF-238 R2 Closure 2: **scope_aggregate pre-population block removed**. The scope
prime in evaluate() narrows allEntityRows directly; there is no `scope_aggregate:*` synthetic key in
context.metrics any longer."* `EntityData.scopeAggregates` field **deleted** (`:40-44`).

## §5 — `allEntityRows` build + wire  (`run/route.ts`) **[read-only-context]**
- **Build (`:1704-1720`):** `allEntityRowsForPeriod` iterates `dataByEntity` (entity-keyed
  committed_data); each element = `{ entityMetadata: {...entityMap.get(eid).metadata, entityId}, row: row_data }`.
- **Wire (`:2436-2450`):** `EntityData.allEntityRows = allEntityRowsForPeriod`; `executeIntent(ci, entityData)`.
- **Consequence:** the scope prime's sibling pool is the set of **entity-keyed** rows; an entity's
  `entityMetadata` is whatever `entities.metadata` holds. Reference-provenance entities (e.g. Meridian
  hubs) carry `metadata = {}` (live), so they contribute rows whose `entityMetadata[boundary]` is
  `undefined`.

## §6 — Classification table (DD-3)
| Surface | file:line | Class |
|---|---|---|
| `PrimeNode` union / `VALID_PRIMES` | `intent-types.ts:389-432` | prime-definition |
| `scope` prime | `intent-executor.ts:223-238` | prime-definition |
| `aggregate` prime | `intent-executor.ts:250-292` | prime-definition |
| `prior_period` prime | `intent-executor.ts:240-248` | prime-definition |
| `buildEvalContext` (+ deleted scopeAggregates) | `intent-executor.ts:310-354,40-44` | context-population |
| `scope_aggregate` → DAG | `legacy-intent-to-dag.ts:130-156` | translation |
| `allEntityRowsForPeriod` build/wire | `run/route.ts:1704-1720, 2436-2450` | read-only-context |

## §7 — Aggregate-scope capability boundary (the DIAG-053 finding, anchored here)
- **Peer-entity aggregation (sum a field across sibling ENTITIES sharing a metadata boundary, self-excluded): IMPLEMENTED & COMPLETE.** This is the CRP-Plan-4 / district-override class. Runtime: `scope(district)→aggregate(sum,revenue)` over D1 reps = **300** (DIAG-053 harness).
- **Reference-row→member projection (take ONE boundary-keyed reference row carrying hub totals and resolve it as each member's input): NOT IMPLEMENTED.** The scope prime keys on `entityMetadata[boundary]`; a hub reference row's entity metadata is `{}` (live) → never matched. Runtime: faithful projection attempt = **0**. The Meridian fleet shape has no engine path.
- **Pre-HF-238 parity:** the deleted `aggregateScopeRows` (HF-155/OB-186) ALSO matched on `entities.metadata` (`district`/`region`/`store_id`) over peer entities — same semantic class. Reference-row projection was **never** present. ⇒ **Condition A (additive gap), not a regression.**
- **Latent footgun (separate):** when an entity lacks the boundary attribute, `boundaryValue=undefined` matches every sibling whose `entityMetadata[boundary]` is also `undefined` (`undefined===undefined`), spuriously aggregating metadata-less rows. Observed in DIAG-053; not the fleet determination — recorded for hardening.

*AUD-005 (calc-execution) refreshed to `e85a7678` by DIAG-053. No code edited. Refresh on any calc-surface change.*

### Refresh log
| SHA | Date | Trigger |
|---|---|---|
| `f6e3dca1` | (prior) | original AUD-005 calc-execution reference |
| `5314c365` | 2026-05-06 | post-HF-205 (pre-HF-238 — now historical) |
| `e85a7678` | 2026-06-01 | **DIAG-053 — HF-238 prime-DAG engine rebuild** |
