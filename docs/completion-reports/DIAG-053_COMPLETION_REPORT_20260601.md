# DIAG-053 — Aggregate-Scope Capability State (Post-HF-238 Prime-DAG Engine)

**Directive:** `docs/diagnostics/DIAG-050_DIRECTIVE_20260601.md` (number provisional in directive).
**Renumbered:** **DIAG-053.** DIAG-050 is taken (`DIAG-050_DIRECTIVE_20260518.md` + `DIAG-050_BINDING_LIFECYCLE_TRACE_OUTPUT.md`); the sequence runs through DIAG-052 (`POST_HF238_REGRESSION_TRIAGE`, #422). Next-unused = **053**, per the directive's provisional-number clause.
**Date:** 2026-06-01 · **HEAD SHA:** `e85a7678` · **Classification:** READ-ONLY (no code, no SQL, no state mutation).
**Deliverable 1:** `docs/code-references/AUD-005_CALC_EXECUTION_LIVE_REFERENCE_e85a7678.md` (refreshed reference).

> **DETERMINATION: CONDITION A (additive gap).** Code-justified AND runtime-confirmed.
> Peer-entity aggregation (CRP-Plan-4 class) is **complete**; reference-row→member projection
> (Meridian fleet class) is **absent** and was **never** implemented (pre- or post-HF-238).
> HF-238 did **not** delete the fleet capability — it refactored the peer-entity path. Not a regression.

---

## §1 — The stale-audit problem (why this DIAG exists)
Calc-execution reasoning for the Meridian fleet defect cited **AUD-005 `5314c365`** (2026-05-06), which
**predates HF-238 (PR #420, `63212283`, merged ~2026-05-20)** — the prime-DAG engine rebuild. HF-238 R2
Closure C2 deleted the `scopeAggregates` reference-form path. The only calc-execution audit in project
knowledge therefore describes a **deleted engine**. Deliverable 1 refreshes it to HEAD `e85a7678`;
AUD-005 `5314c365` is retained for historical citation only.

## §2 — Phase 1: surface inventory + classification (pasted in Deliverable 1)
Post-HF-238 engine = single `evaluate()` walker over a 10-member `PrimeNode` union; one path
(`intent-executor.ts:2-9`). Surfaces extracted verbatim in the refreshed reference §2-§5. Classification
table in reference §6 (prime-definition / context-population / translation / read-only-context).

## §3 — Phase 2: both aggregate shapes traced through the current engine

### (a) Peer-entity aggregation (CRP Plan 4 / district-override) — **COMPLETE**
`scope` prime (`intent-executor.ts:223-238`) filters `allEntityRows` to siblings where
`entityMetadata[boundary] === entity.metadata[boundary]`, self-excluded by `entityId`; downstream
`aggregate` (`:250-292`) sums `row[field]`. `allEntityRowsForPeriod` (`run/route.ts:1704-1720`) supplies
entity-keyed rows. For a manager bound to a district-scoped aggregate, reps share the district boundary
in their entity metadata and carry the field in their rows → resolves nonzero. **Structurally complete.**

### (b) Reference-row→member projection (Meridian fleet) — **ABSENT**
The scope prime matches on **entity metadata** (`entityMetadata[boundary]`), not on a row's data field.
A hub reference row enters `allEntityRows` as `{entityMetadata: <hub entity metadata>, row: {Cargas_Totales,…}}`,
but live Meridian hub entities carry `metadata = {}` (HF-261 ADR; re-verified) → `entityMetadata[boundary]`
is `undefined` → never matched to an employee's hub value. **There is no code path that admits a
boundary-keyed reference row and projects it onto members.** The Meridian fleet intent is moreover a
plain `reference` tree (no `scope` prime at all), so it relies on convergence resolving the hub columns
onto the employee key — which it cannot (the columns are hub-keyed). Either way: no projection mechanism.

### (c) Condition determination — **CONDITION A**, with the regression branch positively excluded
The deleted pre-HF-238 `aggregateScopeRows` (HF-155/OB-186, removed in `63212283`) resolved scope from
**`entities.metadata`** (`district`/`region`/`store_id`), iterated `dataByEntity` matching peers whose
**metadata** shared the boundary, and summed their rows — i.e. **peer-entity aggregation, the same
semantic class** as the post-HF-238 scope prime (pre-computed map → on-the-fly prime). Pasted from the
HF-238 diff:
```
-  // Resolves scope from entities.metadata (district, region, store_id)
-  const entityDistrict = entityMetadata.district || entityMetadata.store_id;
-  for (const [otherId, otherSheetMap] of Array.from(dataByEntity.entries())) {
-    const otherScope = scopeField === 'district' ? (otherMetaData.district || otherMetaData.store_id) : otherMetaData.region;
-    ... sum numeric fields over otherSheetMap rows ...
-  if (entityDistrict) aggregateScopeRows('district', entityDistrict, 'district');
```
Reference-row→member projection was **never** present (not in `scopeAggregates`, not in the scope prime).
⇒ peer-entity = complete; projection = additive. **Condition A. Not ambiguous → HALT-3 not triggered.**

## §4 — Phase 3: read-only runtime confirmation (non-mutating)
**Path chosen:** (1) read existing persisted `calculation_results`; (2) a non-mutating engine harness
importing the **real** `evaluate()`/`buildEvalContext` (no DB writes). CRP "Plan 4" **does not exist** as a
live rule_set (CRP's live plans: "Consumables Commission Plan" [active], "Capital Equipment Commission
Plan" [archived]; **0 persisted CRP results**), so the peer-entity shape was confirmed by exercising the
real primes directly rather than via CRP persisted results.

**Persisted results — Meridian fleet (C5):** latest batch `e1098ffa` (2026-06-01T12:36, 79 entities,
`componentType="prime_dag"`). Per-component payout sums (calculated, verbatim — no reconciliation verdict):
```
Rendimiento de Ingreso : 48900
Entrega a Tiempo       : 18450
Cuentas Nuevas         : 68500
Registro de Seguridad  : 30000
Utilización de Flota   :     0   ← fleet zero across all 79 entities
```

**Engine harness (real primes, non-mutating):**
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
capability." (c2) shows the fleet *formula* is sound (960 = clamp(1200/1000=1.2 ≤ 1.5)×800); C5=0 is pure
input-resolution starvation, not a formula or engine-arithmetic fault.

**Latent footgun (separate observation, not the determination):** when an entity lacks the boundary
attribute, `boundaryValue = undefined` matches every sibling whose `entityMetadata[boundary]` is also
`undefined` (`undefined === undefined`), spuriously aggregating metadata-less rows (harness `note` line =
500). Recorded for hardening; not part of the capability finding.

## §5 — Conclusion & handoff
- **Condition A (additive gap).** The fix HF must **extend the one scope mechanism** to project a
  boundary-keyed reference row onto members — keeping a single path (AP-17) — e.g. by populating the
  boundary key into reference-provenance entity metadata, or by a matching path that reads the row's
  boundary field. **Design is out of scope here** (§6); cite the refreshed reference `e85a7678`.
- **CRP Plan 4 is NOT regressed** by the missing fleet shape (different class; peer-entity mechanism
  proven complete). CRP Plan 4 does not currently exist as a live rule_set — if/when re-introduced it
  uses the complete peer-entity path.
- **No PR** (read-only diagnostic); artifacts committed to `dev`.

## §6 — Residuals
- **AUD-005 supersession:** calc-execution citations move to `e85a7678`; `5314c365` historical. The
  HF-261 redraft must re-cite the refreshed reference.
- **AUD-0015 (`dede922b`)** ingestion trace not refreshed here (different surface).
- **`undefined===undefined` scope-match footgun** — hardening candidate; out of scope.
- **Convergence Pass 5 (HF-238 C6, open)** — if the fleet binding's shape is decided by convergence
  production, C6 is adjacent. Flagged, not absorbed.

*DIAG-053 — read-only at `e85a7678`. Condition A determined (code + runtime). No edits, no SQL, no mutation.*
