# HF-216 — Architecture Decision Record

**Date:** 2026-05-11
**Branch:** `dev` (post-fast-forward to `b23b5666`)
**Sequence:** HF-216
**Defect anchor:** DIAG-039 (Meridian Logistics, c4 Fleet Utilization)
**Decision candidate:** Decision 158 — `convergence_bindings.entity_identifier.via` shape

---

## ARCHITECTURE DECISION RECORD

```
Problem: Convergence binding entity-axis is single-column. Meridian's c4 Fleet
Utilization component requires a two-stage join (employee → roster's
Hub_Asignado → Hub-keyed measure column). The binding can only express the
final hop; the engine correctly executes an under-specified binding and
produces wrong values ($2 instead of ~$610 for Norma January c4).

Option A: Extend convergence_bindings.entity_identifier with optional `via`
  field (single-stage join descriptor: roster_data_type + roster_field +
  entity_field). Resolver pre-builds an external_id → roster_field_value
  index, translates lookup key before resolveColumnFromBatch. Backward
  compatible (when via absent, behavior unchanged).
  - Scale test 10x: Y — index is O(rosterRows); lookup is O(1); independent of plan size.
  - AI-first / no hardcoding: Y — via shape is structural (data_type + field names),
    no language-specific literals.
  - Transport: N/A — internal resolver; no HTTP body changes.
  - Atomicity: Y — via-declared-but-unresolved entity returns null + emits
    [CalcRecon-T3] EXCEPTION; no partial state.

Option B: Modify intent-executor / executeRatioOp to perform join at execute
  time. Per-row joins inside the calculation primitive.
  - Scale test 10x: N — per-row lookup inside primitive; bloats engine surface.
  - AI-first: borderline — primitive learns about external schema concept (data_type).
  - REJECTED: violates HF-216 directive's explicit non-scope ("does NOT modify
    intent-executor or any execution primitive").

Option C: Pre-materialize a fact table joining roster to measures at import time.
  - Scale test 10x: N — increases storage; new sync surface for re-imports.
  - AI-first: borderline — import-time join shape becomes new convention.
  - Atomicity: N — fact table can drift from source if import fails partway.
  - REJECTED: schema-layer churn for a single-tenant data shape; backfill complexity.

CHOSEN: Option A — directive-dispositioned shape; Korean Test compliant; backward
compatible; isolated to resolver layer; rolls out for new tenants only when the
convergence agent learns to emit via (deferred to HF-217+).

REJECTED: Option B (violates non-scope), Option C (schema churn + atomicity).
```

## Governing Principles Evaluation

- **G1 — Standard Identification.** Schema-as-data-contract (DS-009 §5.1, Decision 111). The convergence binding shape is the canonical declaration surface for the calculation engine's entity-axis resolution. Extending it preserves the architectural-compliance property of "the binding declares the join".
- **G2 — Architectural Embodiment.** Compliance with "single canonical entity-axis declaration" is preserved structurally: when `via` is absent, the existing single-column behavior holds verbatim. When `via` is present, the join is declared in the binding (not inferred at runtime, not hardcoded in the engine).
- **G3 — Traceability.** `rule_sets.input_bindings.convergence_bindings.{component_N}.entity_identifier.via` is auditable in the database row alone. Architect-channel inspection of a row tells the auditor whether a two-stage join is declared.
- **G4 — Discipline Identification.** Relational algebra (join-via-key, single-stage). The `via` shape names a foreign-key-style traversal from one data_type to another in the committed_data store.
- **G5 — Abstraction Test.** Universal across domains: any tenant where an employee-axis plan consumes a non-employee-axis measure (location-keyed, store-keyed, hub-keyed, region-keyed) can express the join with this shape. Not domain-specific to logistics or to Meridian.
- **G6 — Innovation Boundary.** No innovation; this is the canonical SQL-join expressed as a JSONB shape. Decision 158 candidate ratifies the shape.

## Anti-Pattern Registry — checked

- AP-1 through AP-25: zero violations.
- AP-5 (hardcoded field dictionaries): not violated — via shape names data_type/field strings supplied per-tenant in the binding, not hardcoded in source.
- AP-13 (assume column names): not violated — schema verified against SCHEMA_REFERENCE_LIVE.md before this work began.
- AP-18 / AP-19 (schema-fabrication): not violated — `rule_sets.input_bindings` is jsonb (verified), `committed_data.row_data` is jsonb (verified), `committed_data.data_type` is text (verified).

## Korean Test

The `via` shape contains three string fields (`roster_data_type`, `roster_field`, `entity_field`) populated per-tenant by the architect-channel backfill (Phase 4) and ultimately by the convergence agent (deferred HF-217+). None of these are hardcoded in source. The English-language values ("entity", "Hub_Asignado", "No_Empleado") are Meridian-specific data, not engine-side convention. A Korean tenant emitting Hangul column names emits Hangul values for `roster_field` / `entity_field`; the resolver indexes them as opaque strings.

## Scale analysis

- Current Meridian: 79 entities × 3 periods × 5 components; roster index = 79 entries; rosterJoinIndex.size = 1 (one via-spec across components 0–4).
- 10x: 800 entities × 5 components ≈ 4000 binding-component pairs; rosterJoinIndex.size remains small (bounded by distinct via-spec count, which is typically 1–3 per plan).
- 100x: 8000 entities; index build is O(committed_data rows) — single pass before entity loop; lookup is Map.get() O(1).
- Memory: one Map<string,string> per via-spec; for 8000 entities, ~250KB at 30 bytes/entry.

## Decision

Implement Option A per HF-216 directive Phase 1–7 sequence.
