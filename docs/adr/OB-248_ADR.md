# ADR — OB-248 Distribution Capability: Fan-Out Calculation via Graph-Resolved Recipients

**Status:** Accepted (committed before Tier 1 implementation, per directive §3.0)
**Date:** 2026-06-27 · **Branch:** `ob-248-distribution-capability` · **Directive commit:** `c993891c`
**Author:** CC (ULTRACODE autonomous) · **Design authority:** Robles Maquinaria Import/Plan-Interpretation/Convergence Requirements (architect-channel)

This ADR documents the evidenced extension points (§3.0 Evidence Gate), the chosen shape for each of the 12 properties, the blast radius, and why every extension lives inside an existing file (§0.2 compliance). It records the premise corrections discovered during the Evidence Gate and the load-bearing design decisions.

---

## 1. Evidence Gate summary — what exists that distribution extends

A four-stage parallel investigation (326K tokens, 102 tool-calls) plus a live-DB probe established the substrate. Key confirmed facts:

| Stage | Surface | Status |
|---|---|---|
| Import | `entity_relationships` (mig `001_core_tables.sql:77-98`) | Typed (`relationship_type`), directed (`source/target_entity_id`), temporal (`effective_from/to`). **Distribution-ready as-is.** |
| Import | `executePostCommitConstruction` (`post-commit-construction.ts:49`) | Singular post-commit entry; already writes `entity_relationships` via `discoverSharedAttributeRelationships` (`:97-191`) and bulk `upsert(onConflict tenant,source,target,type)` (`:181`). |
| Import | `committed_data` write (`commit-content-unit.ts:448-494`) | Strictly **1:1** (`rows.map`), `entity_id/period_id` NULL (bound at calc). **No row explosion** — P-I3 neutrality invariant. |
| Import | reference path | `reference_data`/`reference_items` (mig 018) exist but are **dormant — no import writer** (presence-counted only). Reference/factor sheets ingest via the **same `committed_data` path** (distinguished by `data_type`) and are joined at calc time by `reference-join.ts:resolveReferenceJoinRows` (value-overlap, Korean-Test-clean). |
| Comprehension | `InterpretedComponent` (`ai-plan-interpreter.ts:72-110`) | Per-component recognition shape; `composesInto` was added at `:109` as one optional field — **the exact precedent for a `distributesTo` field.** |
| Comprehension | `interpretationToPlanConfig` (`ai-plan-interpreter.ts:359`) + `foldComposedModifiers` (`:328`) | The singular interpretation→config seam; distribution is an **expand-branch** beside the existing `foldComposedModifiers(...)` call at `:371` (the structural inverse of `composesInto`'s fold). |
| Comprehension | factor model / modifiers | Factor multiply = nested `{prime:'arithmetic',op:'multiply',inputs:[host,mod]}` (`:348-352`) — same machinery as `composesInto`. Modifier shapes ride the already-open `IntentModifier` (`intent-types.ts:212`); the comment at `intent-types.ts:205` literally anticipates cross-recipient `tope` / cross-period `streak` / cascade-wide `devolución`. |
| Convergence | `convergeBindings` (`intelligence/convergence-service.ts:262-868`) | Singular convergence entry; 3 callers; builds `derivations: MetricDerivationRule[]`; reads prior `classification_signals` as `observations` (Decision-158 recognition read surface). |
| Convergence | `MetricDerivationRule` (`run-calculation.ts:70-102`) | `{metric, operation, source_pattern, filters, …, scope?, ai_context?}`. **`ai_context` is the open Carry-Everything slot (HF-226).** Persisted at `run/route.ts:296` (`input_bindings.metric_derivations`), read for execution at `run-calculation.ts:912`. |
| Convergence | fingerprinted signal | `writeSignal` (`canonical-signal-writer.ts:185-208`, `structural_fingerprint` column); convergence emits `convergence:binding_selection`/`:calculation_validation`; read back as `observations.withinRun/crossRun` (Progressive Performance flywheel). |
| Engine | `POST` (`api/calculation/run/route.ts:86`) | **The only top-level function** — entire engine nested inside. Per-entity loop at `:2143`; per-component `executeIntent` at `:2975`; **exactly one `entityResults.push` per entity at `:3179`.** |
| Engine | `evaluate` (`intent-executor.ts:171`) | 10 prime kinds (constant, reference, arithmetic, compare, logical, conditional, filter, scope, prior_period, aggregate). P-E1 extends the **context** (`buildEvalContext:393`), not the algebra. |
| Engine | `calculation_results` write (`route.ts:3298-3353`) | DELETE-before-INSERT; `entityResults.map` **1:1**; `resultIdByEntity` keyed by `entity_id`. **This is the cardinality change point.** |
| Engine | `calculation_traces` (`calculation-service.ts:444`) | **Already N-per-result_id** with `committed_data_id` + `transaction_ref` — P-E4 reversal lineage has an existing home. |
| Engine | temporal reads | Prior-period self-read `route.ts:1455` (window 12 → `periodHistoryMap` → `entityData.periodHistory` at `:2957`) — **P-E3 streak source already on the calc path.** |

---

## 2. Premise corrections (directive assumptions vs reality)

The directive was written against an idealized map. Seven corrections, none fatal — each strengthens the §0.2 single-path discipline:

1. **`traverseGraph` BFS does NOT exist.** Only single-hop SQL fan-out + the `.in('relationship_type', SET)` filter + an in-memory recursive depth walk exist. Multi-hop recipient traversal is genuinely new code → added as **pure helper functions inside existing files** (`intent-executor.ts`), explicitly permitted by §0.2 rule 2 ("new utility functions within existing files are expected"). Reuses the `.in(type-set)` + `effective_to IS NULL` idiom for the DB fetch.
2. **Convergence service path:** `web/src/lib/intelligence/convergence-service.ts` (the directive cited `lib/sci/...`). Plan interpreter: `web/src/lib/compensation/ai-plan-interpreter.ts`. Both confirmed.
3. **`input_bindings` is a JSONB column on `rule_sets`, not a table.** The directive's `input_bindings.metric_derivations` = `rule_sets.input_bindings.metric_derivations`. Live key in production is `convergence_bindings` (HF-234) + `metric_derivations` (legacy). **No migration for P-V2** — fits existing JSONB (confirms §6).
4. **`reference_data`/`reference_items` are dormant.** P-I2 ("reference table ingestion … reuse HF-329") needs **no new import write surface**: factor/rate sheets ride the unchanged `committed_data` 1:1 path keyed by `data_type` and are read by the existing value-overlap `reference-join`. P-I2 is therefore largely already satisfied by the existing import; distribution only consumes it.
5. **`entity_relationships.relationship_type` carries a CLOSED `CHECK` (8 values) — a pre-existing registry** that conflicts with STANDING RULE: NO REGISTRY. See Decision D1.
6. **`MetricDerivationRule.operation` is a closed union.** Adding a `'distribution'` discriminator is acceptable (it is a *structural* discriminator like a `PrimeNode.prime` kind, not a domain taxonomy) — see Decision D3.
7. **The calc loop axis is per-entity.** Distribution fans out **inside** the per-originator iteration (each originator's sale rows → recipients), so `calculation_results` becomes one-per-(recipient, sale); the `resultIdByEntity` map keyed by `entity_id` must be re-keyed (an entity recurs across sales) — see Decision D5.

---

## 3. Chosen architecture — the unified distribution path

Distribution reuses the modern **prime_dag + convergence_bindings** path maximally. The mental model:

- **Per-recipient amount = `evaluate(factorModelDAG, recipientContext)`** where `factorModelDAG` is a multiply DAG of `reference` leaves (`sale_net × base_rate × factor₁ × factor₂ …`) — evaluated by the **existing** `evaluate()`, unchanged (P-E1: "extends the context, not the algebra"). `recipientContext` supplies the recipient's base rate (Anexo reference keyed by recipient identity) and the row's product/channel factors (factor reference tables keyed by row attributes).
- **Recipient resolution** = traverse `entity_relationships` from the originator following the **contract's** edge-type set (multi-hop, temporal-filtered) + overlay edges conditioned on row attributes → an ordered recipient list with edge-type provenance. New pure helper.
- **Fan-out** = for each committed sale row of an originator, for each resolved recipient, build `recipientContext`, evaluate the factor model → amount; emit one recipient-keyed row per (recipient, sale).
- **Modifiers** = caps/cliffs/floors/streaks/reversals, parameters all from the contract:
  - *Tope (P-E2)*: post-evaluation pass over one transaction's cascade — proportional reduction to the cap.
  - *Volume cliff (P-E3)*: own-period aggregate compared to a threshold → binary rate multiplier.
  - *Floor (P-E3)*: `max(computed, floor)` per originator/period on one component.
  - *Streak (P-E3)*: read `periodHistory` (existing prior-period feed) for N consecutive periods → bonus or reset.
  - *Reversal/retro (P-E4)*: a return/correction row references an original sale; trace its cascade (`calculation_traces` by `transaction_ref`/`committed_data_id`) and emit negated rows (reversal) or delta rows (retro recompute).

**Recognition vs construction boundary (Decision 158):** the LLM *recognizes* the distribution shape (recipient roles, inclusion conditions, factor-model structure, modifier shapes) → stored as a structural description on the component (`distributesTo`) and as signals. Deterministic code *constructs* the bound derivation (convergence) and *executes* the fan-out, traversal, factor evaluation, constraint pass, temporal reads, and reversal trace (engine). No "the LLM chose to fan out" framing anywhere.

### Contract shape (extends existing structures, no parallel JSONB key)

- **Recognition (comprehension):** `InterpretedComponent.distributesTo?` — `{ recipientRoles: [{role, edgeKind, hops, inclusion}], factorModel: <multiply DAG shape>, modifiers: [<structural modifier descr>] }`. Carried into `rule_sets.components[].metadata`.
- **Binding (convergence):** appends ONE `MetricDerivationRule` with `operation:'distribution'` to the existing `metric_derivations` array. Its bound spec rides a typed `distribution` field (defined on `MetricDerivationRule`): `{ originator: {entityColumn}, recipientResolution: {edgeTypes[], overlayConditions[]}, factorModel: {saleAmount, baseRateRef, factorRefs[]}, modifiers: [{kind-structural, params}] }`. No `input_bindings.distribution` sibling key (avoids a second engine read surface).
- **Execution (engine):** the per-entity loop reads `metric_derivations.find(d => d.operation==='distribution')`; present → distribution mode for that rule-set; absent → byte-identical per-entity path.

---

## 4. Load-bearing decisions

**D1 — Edge types are open-vocabulary, carried in the contract; the closed CHECK is widened via ARTIFACT SYNC.**
The hierarchy sheet's relationship characterization is recognized by the LLM; import writes `entity_relationships.relationship_type` from the recognized value (open vocabulary) and preserves the full recognized role in `context`. The convergence contract records recipient-role → edge-type-set; the engine traverses filtering by the **contract's** type set (`.in(relationship_type, contractTypes)`). **No `relationship_type` literal appears in engine/convergence/import code.** The pre-existing closed `CHECK` (8 values) is a registry that conflicts with STANDING RULE: NO REGISTRY → **ARTIFACT SYNC: migration dropping the closed CHECK in favor of structural validation (non-empty text).** Rationale: this is the correct open-vocabulary fix and unblocks live Robles edge creation (architect-channel). CC's structural proof does not depend on it (pure traversal over synthetic edges/contract).

**D2 — Recipient resolution and the fan-out are pure functions in `intent-executor.ts`; the DB edge fetch is in `route.ts`.**
The engine loads the tenant's active edges once into an in-memory adjacency map (mirroring `getEntityGraph`), then per-row fan-out is **pure in-memory traversal** — fully unit-testable without a DB. `resolveDistributionRecipients(adjacency, originator, recipientSpec, rowAttributes)` and `applyCrossRecipientCap(cascade, cap)` are pure exports in `intent-executor.ts` (the calculation evaluation module). This satisfies §0.2 (utility functions in an existing file) and maximizes structural provability.

**D3 — `operation:'distribution'` is a structural discriminator, not a registry.**
Adding `'distribution'` to the `MetricDerivationRule.operation` union is structurally analogous to a `PrimeNode.prime` kind (a closed *structural* set, which is permitted — it is the algebra, not a taxonomy of domain values). The distribution spec is carried in a typed `distribution?` field on `MetricDerivationRule` (not buried in `ai_context`, for type safety), keeping the existing typed surface intact and avoiding a parallel JSONB key.

**D4 — The factor model is a PrimeNode multiply DAG evaluated by the existing `evaluate()`; only the evaluation CONTEXT is extended (P-E1).**
No new prime kind. Recipient-specific reference values (base rate keyed by recipient identity; product/channel factors keyed by row attributes) are supplied through the `EvalContext`/`EntityData` the recipient is evaluated under. Caps/cliffs/floors compose from `conditional`+`compare`+`arithmetic`; streaks/reversals from `prior_period` over `periodHistory`.

**D5 — `calculation_results` becomes one-per-(recipient, sale) for distribution rule-sets; the trace FK map re-keys.**
Per directive P-E1/PG-4 ("one per recipient per sale"). `entity_period_outcomes` continues to aggregate per (entity, period) — distribution rows sum naturally. The source-sale linkage is stored in `calculation_results.metadata` (source `committed_data_id` + `transaction_ref`) **and** via `calculation_traces` (existing `committed_data_id`/`transaction_ref` + `result_id` FK). `resultIdByEntity` (keyed by `entity_id`, which now recurs) is re-keyed by a per-result discriminator so trace FKs bind correctly. The DELETE-before-INSERT cleanup is unchanged (still scoped by `rule_set_id`+`period_id`).

**D6 — Every branch is gated on structural PRESENCE of a distribution recognition/derivation; absence = byte-identical.**
Comprehension: `distributesTo` absent → `normalizeComponents`/`foldComposedModifiers`/`interpretationToPlanConfig` byte-identical (the `composesInto` precedent). Convergence: no distribution signal → `derivations` byte-identical. Engine: no `operation:'distribution'` derivation → the per-entity loop, the single `entityResults.push`, and the 1:1 `calculation_results` map all execute exactly as today. This is the HALT-CALC neutrality guarantee (PG-7), structural not incidental.

---

## 5. §0.2 anti-parallel-path compliance map

| Property | File extended (existing) | New execution surface? |
|---|---|---|
| P-I1 hierarchy ingestion | `lib/sci/post-commit-construction.ts` (+ recognition in `lib/sci/header-comprehension.ts`) | No |
| P-I2 reference ingestion | none (rides existing `committed_data` + `reference-join.ts`) | No |
| P-I3 neutrality | (invariant — no change to non-distribution path) | No |
| P-C1/C2/C3 recognition | `lib/compensation/ai-plan-interpreter.ts`, `lib/ai/anthropic-adapter.ts` (prompt), `lib/compensation/plan-orchestration.ts` (mirror), `lib/calculation/intent-types.ts` (types) | No |
| P-V1/V2/V3 convergence | `lib/intelligence/convergence-service.ts`, `lib/calculation/run-calculation.ts` (type) | No |
| P-E1 fan-out eval | `lib/calculation/intent-executor.ts` (pure helpers), `app/api/calculation/run/route.ts` (loop branch) | No |
| P-E2 tope | `lib/calculation/intent-executor.ts` (`applyCrossRecipientCap`) | No |
| P-E3 cliff/floor/streak | `lib/calculation/intent-executor.ts` + `route.ts` (reuses `periodHistory`) | No |
| P-E4 reversal/retro | `app/api/calculation/run/route.ts` + `lib/supabase/calculation-service.ts` (trace read) | No |
| Tests | `**/__tests__/ob248-*.test.ts` | Allowed (test) |
| Types | `intent-types.ts`, `run-calculation.ts` | Allowed (types in existing files) |

**Verification gate (PG-9d):** `find web/src -name "*.ts" -newer c993891c -not -path "*test*" -not -path "*__tests__*"` must list **zero** files that are new execution surfaces. (`web/scripts/_ob248_*.ts` proof/probe scripts live outside `web/src` and are excluded by scope.)

---

## 6. Blast radius & neutrality

Every changed surface is multi-producer/multi-consumer and exercised by all sealed tenants (BCL, Meridian, MIR, Sabor). Neutrality is **structural**: each distribution branch is gated on the presence of a distribution recognition/derivation, which no sealed tenant carries. Proven live by PG-7 (BCL → $312,033, Meridian → $556,985, MIR Plan 2 → 210,000, MIR Plan 5 → 0). Any movement = HALT-CALC.

## 7. Proof strategy

- **Structural unit tests** (`__tests__/ob248-*.test.ts`): pure traversal, factor-model fan-out, tope, cliff/floor/streak, reversal/retro — assert structural invariants of the distribution against synthetic contracts/edges (carried reality, not registries). These prove P-V1/P-E1..E4 deterministically without a Robles tenant.
- **Live neutrality (PG-7):** real calc on BCL/Meridian/MIR.
- **Live Robles reconciliation:** architect-channel (no Robles tenant in the DB; `RoblesMaquinaria_Resultados_Esperados.xlsx` is architect-only). CC reports calculated values verbatim; the architect reconciles (SR-44). PG-1/2/4/8 with real Robles data are therefore architect-channel; CC proves the *capability* structurally + reports the contract/prompt extensions for review.

## 8. ARTIFACT SYNC items (architect applies)

1. **Migration:** drop the closed `CHECK` on `entity_relationships.relationship_type` (and reconsider `source`) → open-vocabulary text, structural validation only (STANDING RULE: NO REGISTRY). Required for live Robles hierarchy ingestion with recognized edge types.
2. **OB-237 sentinel repopulation:** distribution adds `calculation_results`/`entity_period_outcomes` rows; the `summary_artifacts data_type='period_outcomes'` O(1) sentinel is downstream (script-populated) and must be repopulated for distribution tenants after calc.
3. **Live Robles import + reconciliation** against the sealed GT (SR-44).
