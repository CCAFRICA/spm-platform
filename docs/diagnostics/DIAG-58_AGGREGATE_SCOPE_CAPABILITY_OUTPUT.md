# DIAG-58 — Aggregate-Scope Capability State (Post-HF-238 Prime-DAG Engine) — FINDINGS / OUTPUT

**Directive:** `docs/diagnostics/DIAG-050_DIRECTIVE_20260601.md` (number provisional in directive; architect-sequenced to **DIAG-58**).
**Date:** 2026-06-01 · **HEAD SHA:** `e85a7678` · **Classification:** READ-ONLY (no code, no SQL, no state mutation).
**Refreshed reference (companion):** `docs/code-references/AUD-005_CALC_EXECUTION_LIVE_REFERENCE_e85a7678.md`

> **DETERMINATION: CONDITION A (additive gap).** Code-justified AND runtime-confirmed.
> Peer-entity aggregation (CRP-Plan-4 class) is **complete**; reference-row→member projection
> (Meridian fleet class) is **absent** and was **never** implemented (pre- or post-HF-238).
> HF-238 did **not** delete the fleet capability — it refactored the peer-entity path. **Not a regression.**

---

## §1 — Why this DIAG exists (stale-audit problem)
Calc-execution reasoning for the Meridian fleet defect cited **AUD-005 `5314c365`** (2026-05-06), which
**predates HF-238 (PR #420, `63212283`, merged ~2026-05-20)** — the prime-DAG engine rebuild. HF-238 R2
Closure C2 deleted the `scopeAggregates` reference-form path. The only calc-execution audit in project
knowledge therefore described a **deleted engine**. The companion reference refreshes it to HEAD
`e85a7678`; AUD-005 `5314c365` is retained for historical citation only.

## §2 — Surface inventory + classification (Phase 1)
Post-HF-238 engine = a single `evaluate()` walker over a 10-member `PrimeNode` union; one path
(`intent-executor.ts:2-9`). componentType on results = `"prime_dag"` (verified live, Meridian batch
`e1098ffa`).

| Surface | file:line | Class |
|---|---|---|
| `PrimeNode` union / `VALID_PRIMES` (10 primes) | `intent-types.ts:389-432` | prime-definition |
| `scope` prime | `intent-executor.ts:223-238` | prime-definition |
| `aggregate` prime | `intent-executor.ts:250-292` | prime-definition |
| `prior_period` prime (HF-238 C5) | `intent-executor.ts:240-248` | prime-definition |
| `buildEvalContext` (+ deleted `scopeAggregates`) | `intent-executor.ts:310-354, 40-44` | context-population |
| `scope_aggregate` → DAG translation | `legacy-intent-to-dag.ts:130-156` | translation |
| `allEntityRowsForPeriod` build + wire | `run/route.ts:1704-1720, 2436-2450` | read-only-context |

The 10 primes: `arithmetic, aggregate, filter, conditional, scope, compare, logical, constant, reference, prior_period`.

## §3 — Both aggregate shapes traced through the current engine (Phase 2, pasted code)

### (a) Peer-entity aggregation (CRP Plan 4 / district-override) — **COMPLETE**
`scope` prime — `intent-executor.ts:223-238`:
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
Downstream `aggregate` (`:250-292`) reduces `activeRows` by `row[field]`. `allEntityRowsForPeriod`
(`run/route.ts:1704-1720`) supplies entity-keyed rows. A manager bound to a district-scoped aggregate:
reps share the district boundary in their **entity metadata** and carry the field in their rows →
resolves nonzero. **Structurally complete.**

### (b) Reference-row→member projection (Meridian fleet) — **ABSENT**
The scope prime matches on **`entityMetadata[boundary]`** (the sibling ENTITY's metadata), **not** on a
row's data field. A hub reference row enters `allEntityRows` as
`{entityMetadata: <hub entity metadata>, row: {Cargas_Totales,…}}`, but live Meridian hub entities carry
`metadata = {}` → `entityMetadata[boundary]` is `undefined` → never matched to an employee's hub value.
**No code path admits a boundary-keyed reference row and projects it onto members.** The Meridian fleet
intent is moreover a plain `reference` tree (no `scope` prime at all), relying on convergence resolving
the hub columns onto the employee key — which it cannot (the columns are hub-keyed). Either way: no
projection mechanism.

`scope_aggregate` translation — `legacy-intent-to-dag.ts:130-156` (the only route a `scope_aggregate`
source could take; confirms it composes to the same peer-entity `scope`→`aggregate`):
```ts
case 'scope_aggregate': {
  const { field, scope, aggregation } = s.sourceSpec;
  return { prime:'scope', boundary: scope,
           downstream: { prime:'aggregate', op, field: stripMetricPrefix(field) } };
}
```

### (c) Condition determination — **CONDITION A**, regression branch positively excluded
The deleted pre-HF-238 `aggregateScopeRows` (HF-155/OB-186, removed in `63212283`) resolved scope from
**`entities.metadata`** (`district`/`region`/`store_id`), iterated `dataByEntity` matching peers whose
**metadata** shared the boundary, and summed their rows — **peer-entity aggregation, the same semantic
class** as the post-HF-238 scope prime (pre-computed map → on-the-fly prime). Pasted from the HF-238 diff
(`git show 63212283`, deleted lines):
```
-  // Resolves scope from entities.metadata (district, region, store_id)
-  const entityDistrict = entityMetadata.district || entityMetadata.store_id;
-  for (const [otherId, otherSheetMap] of Array.from(dataByEntity.entries())) {
-    const otherScope = scopeField === 'district' ? (otherMetaData.district || otherMetaData.store_id) : otherMetaData.region;
-    ... sum numeric fields over otherSheetMap rows ...
-  if (entityDistrict) aggregateScopeRows('district', entityDistrict, 'district');
-  if (entityRegion)   aggregateScopeRows('region', entityRegion, 'region');
```
Reference-row→member projection was **never** present (not in `scopeAggregates`, not in the scope prime).
⇒ peer-entity = complete; projection = additive. **Condition A. Not ambiguous → HALT-3 not triggered.**

## §4 — Read-only runtime confirmation (Phase 3, non-mutating)
**Path chosen:** (1) read existing persisted `calculation_results`; (2) a non-mutating engine harness
importing the **real** `evaluate()`/`buildEvalContext` (no DB writes). CRP "Plan 4" **does not exist** as a
live rule_set (CRP live plans: "Consumables Commission Plan" [active], "Capital Equipment Commission Plan"
[archived]; **0 persisted CRP results**), so the peer-entity shape was confirmed by exercising the real
primes directly rather than via CRP persisted results.

**Persisted results — Meridian fleet (C5):** latest batch `e1098ffa` (2026-06-01T12:36, 79 entities,
`componentType="prime_dag"`). Per-component payout sums (calculated, verbatim — no reconciliation verdict):
```
Rendimiento de Ingreso : 48900
Entrega a Tiempo       : 18450
Cuentas Nuevas         : 68500
Registro de Seguridad  : 30000
Utilización de Flota   :     0   ← fleet zero across all 79 entities
```

**Engine harness (real primes, non-mutating) — output verbatim:**
```
(a)  peer-entity scope+aggregate (mgr over D1 reps, self-excluded)        = 300   → mechanism COMPLETE
(b)  reference-row projection, faithful (emp carries hub boundary;
       hub-ref row entity-meta = {} as live)                              =   0   → projection ABSENT
(b′) hypothetical (IF hub-ref entity metadata carried boundary=hub)       = 500   → would match, but NOT live state
(c)  persisted fleet intent, employee context (no hub keys resolved)      =   0   → matches batch e1098ffa
(c2) same persisted intent WITH hub metrics present (1200/1000)           = 960   → formula sound; defect is resolution
```
**Direct Condition-A evidence:** the peer-entity aggregate resolves **nonzero (300)** while the Meridian
fleet resolves **zero (0)** through the *same* engine — distinguishing "broken in code" from "absent
capability." (c2) shows the fleet *formula* is sound (960 = clamp(1200/1000 = 1.2 ≤ 1.5) × 800); C5=0 is
pure input-resolution starvation, not a formula or engine-arithmetic fault.

**Latent footgun (separate observation, not the determination):** when an entity lacks the boundary
attribute, `boundaryValue = undefined` matches every sibling whose `entityMetadata[boundary]` is also
`undefined` (`undefined === undefined`), spuriously aggregating metadata-less rows (harness `note` line =
500). Recorded for hardening; not part of the capability finding.

## §5 — Conclusion & handoff
- **Condition A (additive gap).** The fix HF must **extend the one scope mechanism** to project a
  boundary-keyed reference row onto members — keeping a single path (AP-17) — e.g. by populating the
  boundary key into reference-provenance entity metadata, or a matching path that reads the row's
  boundary field. **Design is out of scope here**; cite the refreshed reference `e85a7678`.
- **CRP Plan 4 is NOT regressed** by the missing fleet shape (different class; peer-entity mechanism
  proven complete). It does not currently exist as a live rule_set; if/when re-introduced it uses the
  complete peer-entity path.

## §6 — Residuals
- **AUD-005 supersession:** calc-execution citations move to `e85a7678`; `5314c365` historical. The HF-261 redraft must re-cite the refreshed reference.
- **AUD-0015 (`dede922b`)** ingestion trace not refreshed here (different surface).
- **`undefined===undefined` scope-match footgun** — hardening candidate; out of scope.
- **Convergence Pass 5 (HF-238 C6, open)** — if the fleet binding's shape is decided by convergence production, C6 is adjacent. Flagged, not absorbed.

*DIAG-58 — read-only findings at `e85a7678`. Condition A (code + runtime). No edits, no SQL, no mutation.*
