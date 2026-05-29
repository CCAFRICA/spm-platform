# ARCHITECTURE DECISION RECORD — HF-253

*Per-Variant Binding Scope + Distribution Signal in Column Mapping*
*Standing Rules Section B — committed BEFORE any implementation code.*

```
ARCHITECTURE DECISION RECORD — HF-253
=====================================
Problem: Cross-variant column contention (one-column-once over a globally-flattened
component list) forces a variant's ratio-numerator reference off the correct column;
the column-mapping prompt lacks the distribution signal needed to pick the right
column among the remainder. Result: Ejecutivo Captacion numerator bound to a ratio
column (Pct_Meta_Depositos, ~0-1.3) instead of the raw-measure column
(Depositos_Nuevos_Netos) -> ratio ~= 0.95/100000 -> below lowest band -> $0 for all
72 Ejecutivo entities. Senior variant (depositos_netos -> Depositos_Nuevos_Netos)
reconciles. Both causes live in web/src/lib/intelligence/convergence-service.ts.

Option A: Scope binding per variant (variantId carried through extractComponents;
  boundColumnToField + resolveColumnMappingsViaAI call scoped per variant) AND surface
  columnStats (min/max/mean, already in scope) in the mapping prompt.
  - Scale test (10x): Outer loop over variants (2-4), unaffected by row count. PASS.
  - AI-first: No hardcoded names; variantId is structural; stats are runtime-derived. PASS.
  - Transport: No HTTP-body row data introduced. PASS.
  - Atomicity: Binding production is in-memory; no partial DB state. PASS.

Option B: Detection-only — widen HF-203 plausibility to reject too-small ratios.
  - Rejected: rejection surfaces a gap, does not re-bind correctly; leaves the
    contention + prose-only-mapping causes operative. Does not fix the symptom.

Option C: Persist dataType into field_identities and gate on it.
  - Rejected (this HF): broader change touching ingestion + the carried identity
    contract; a kind-as-gate at the binding boundary risks the closed-enum /
    developer-registration anti-pattern (DS-021 G3 / AP-26). Out of scope; see §6A.

CHOSEN: Option A — minimal, structural, domain-agnostic, closes both interacting causes.
REJECTED: Option B (detection != fix), Option C (scope overreach + registry risk).
```

## GOVERNING PRINCIPLES EVALUATION (Decisions 123 & 124)

```
G1 - Standard Identification: No regulatory/financial numeric standard governs the
     binding-production grouping itself (the calculation precision standard, Decision
     122, is downstream in the engine and is NOT touched here). The governing standard
     for THIS decision is the platform's own AI-First principle (Section A.1) and the
     Korean Test invariant (AP-25 / IGF-T1-E910 v2): structural, language-agnostic
     resolution.
G2 - Architectural Embodiment: Per-variant scoping embodies the engine's variant-router
     contract (HF-119: exactly one variant evaluated per entity) structurally — columns
     that are never contended at calculation time are no longer contended at binding
     time. The exclusion map's lifetime now equals the variant's scope, so the
     one-column-once invariant holds WHERE it is true (within a variant) and is absent
     WHERE it is false (across variants). The distribution signal makes the column
     choice a property of the data's magnitude, not of prose-label similarity.
G3 - Traceability: variantId is the persisted structural key (components.variants[].
     variantId); the grouping is auditable from the rule_set JSONB alone. The stats are
     the same min/max/mean already persisted on columnStats. No hidden state.
G4 - Discipline Identification: scoping/lifetime of a mutual-exclusion constraint is a
     resource-contention question (the constraint must scope to the contention domain).
     The contention domain here is "one entity's one variant," established by HF-119.
G5 - Abstraction Test: holds across domains — "a uniqueness constraint must be scoped to
     the set over which the resource is actually shared" is universal, not SPM-specific.
G6 - Innovation Boundary: no new concept; reuses the persisted variant grouping and the
     already-computed column statistics. No speculative mechanism introduced.

Relevant gates: G2, G3, G4, G5 (passed). G1/G6 identified as not-numeric-standard-bound
for this localized binding-production change.
```

## SCALE ANALYSIS (Standing Rule 25)

| Volume | Behavior under HF-253 |
|---|---|
| Current (BCL ~119K rows, 2 variants) | One extra outer loop over 2 variant groups; 2 AI mapping calls instead of 1. Row processing unchanged. |
| 10x (~1.2M rows, 2-4 variants) | Mapping call count scales with variant count (2-4), NOT row count. Row-volume paths (inventory, committed_data reads) unchanged. |
| 100x | Same — variant count is a plan property bounded by plan design (typically 2-4), independent of data volume. |

No HTTP-body row transport introduced (AP-1). No per-row DB calls added (AP-4). Binding
production remains in-memory; no partial DB state on failure (AP-14).

## ANTI-PATTERN CHECK

- AP-5/AP-6 (no hardcoded field names / language patterns): variantId is a structural
  key; stats are numeric. EPG-4 greps for zero new domain column literals.
- AP-13 (verify schema, don't assume): variantId key verified against persisted shape
  (DIAG-051 confirmed `v.variantId` present: "ejecutivo-senior", "ejecutivo").
- AP-17 (single pipeline): no second code path; the existing single binding pipeline is
  scoped, not duplicated. Non-variant plans take the same path (one implicit group).
- AP-26 (no closed-vocabulary registry): no enum/registry added.

## SCOPE BOUNDARY (DD-7)

Exactly Cause A (per-variant binding scope) + Cause B (distribution signal). Out of
scope: HF-203 widening, dataType persistence into field_identities, and any change to
matchComponentsToData / inventoryData / engine / constructor / CompositionalIntent
emission.
