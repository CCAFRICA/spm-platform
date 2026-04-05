# Decision 147: Plan Intelligence Forward
## Convergence Consumes Plan Agent Comprehension — Not Independent Re-Derivation
### vialuce Performance Intelligence Platform
### April 4, 2026

---

## Decision Statement

When the plan agent interprets a plan document and understands the semantic relationship between a metric label and the data fields that produce it, that understanding MUST be persisted as a structured seed derivation and forwarded to the convergence service. The convergence service MUST consume plan agent seeds as its highest-confidence input before attempting any independent derivation.

Intelligence gained by one agent must be available to all other agents. The convergence service is a consumer of shared intelligence, not an independent re-deriver.

**Status: LOCKED**

---

## The Problem

CRP Plan 4 (scope_aggregate) produces $0 instead of $136,530.42. The entire pipeline below convergence is verified — 32 entities exist, 32 assigned, variant matching correct, metadata populated. The blocker is singular: the convergence service fails to map "Equipment Revenue" → `sum(total_amount) WHERE product_category = 'Capital Equipment'`. The `input_bindings` come back empty. Without a MetricDerivationRule, the metric resolves to 0 for all entities.

The plan agent — when it read the CRP Plan 4 PDF — correctly understood this relationship. It produced `sourceSpec: { field: "equipment_revenue", scope: "district", aggregation: "sum" }`. The semantic mapping (equipment_revenue = Capital Equipment product category sales) was comprehended by the AI during interpretation.

That comprehension was then discarded. The convergence service made an independent AI call to re-derive the same mapping from metric labels and committed_data values. On April 2 with tenant flywheel patterns, the AI made this connection. On April 5 with a clean slate, it did not. Same data, different result. Non-deterministic.

This is not a convergence tuning problem. This is a violation of three documented architectural principles:

1. **Synaptic State Specification (Feb 22, 2026):** "Agents read from and write to a shared surface. Intelligence propagates within a single run — not after it completes."

2. **TMR Addendum 10 (March 1, 2026):** "Convergence is not a third call — it's the surface itself. When both data synapses and plan synapses exist on the same surface, the convergence is observable. The matching is a read operation, not a computation."

3. **CRR Specification:** "No component operates in isolation; every signal is visible to every other component."

The convergence service was implemented as a standalone function (`convergeBindings`) that queries the database independently, builds its own data capability profile, and attempts AI semantic matching from scratch. It does not read from the synaptic surface. It does not receive the plan agent's comprehension. It operates in isolation — exactly what the architecture says must never happen.

---

## The Principle

**Plan Intelligence Forward (PIF):** When the plan agent produces Level 2 comprehension — metric semantics, field-to-concept mappings, categorical filter conditions, aggregation logic — that comprehension must be persisted as structured seed derivations on the rule_set. The convergence service reads these seeds as its highest-confidence signal and validates them against actual data capabilities. Independent AI re-derivation is a fallback for metrics where no plan agent seed exists, not the primary path.

This principle applies to ALL metric types, not just scope_aggregate. Any metric label that the plan agent understood during PDF interpretation should produce a seed derivation that convergence can consume.

---

## Architecture

### What the Plan Agent Understands (and currently discards)

When the plan agent interprets a plan PDF, it comprehends relationships like:

| Metric Label | Semantic Understanding | Currently Stored | Currently Lost |
|---|---|---|---|
| equipment_revenue | sum of total_amount WHERE product_category = 'Capital Equipment' | sourceSpec.field = "equipment_revenue" | The filter condition and source field mapping |
| consumable_revenue | sum of total_amount WHERE product_category = 'Consumables' | sourceSpec.field = "consumable_revenue" | The filter condition and source field mapping |
| equipment_deal_count | count of transactions WHERE product_category = 'Capital Equipment' | sourceSpec.field = "equipment_deal_count" | The count operation and filter |
| cross_sell_count | count of transactions WHERE product_category = 'Consumables' AND entity has equipment sales | sourceSpec.field = "cross_sell_count" | The cross-reference condition |
| quota_attainment | ratio of consumable_revenue to monthly_quota | sourceSpec as ratio | The numerator/denominator field mapping |

The calculationIntent preserves the metric LABEL but not the metric DERIVATION. The AI understood "equipment_revenue means revenue from Capital Equipment sales" but stored only `field: "equipment_revenue"` — a label with no derivation logic.

### What Must Be Persisted

The plan agent must output `metricSemantics` — an array of seed derivation rules — alongside `calculationIntent`. Each seed maps a metric label to its derivation from raw data:

```typescript
interface MetricSemantic {
  metric: string;              // Metric label (e.g., "equipment_revenue")
  operation: 'sum' | 'count' | 'delta' | 'ratio';
  source_field?: string;       // Field to aggregate (e.g., "total_amount")
  filters?: Array<{
    field: string;             // Filter field (e.g., "product_category")
    operator: 'eq' | 'neq' | 'contains';
    value: string | number;    // Filter value (e.g., "Capital Equipment")
  }>;
  numerator_metric?: string;   // For ratio operations
  denominator_metric?: string; // For ratio operations
  confidence: number;          // Plan agent's confidence in this mapping
  reasoning?: string;          // Brief explanation for auditability
}
```

This structure is intentionally compatible with the existing `MetricDerivationRule` type. The convergence service can consume it directly or validate it against data capabilities and promote it to a MetricDerivationRule.

### How Convergence Consumes Seeds

The convergence service's matching sequence becomes:

1. **Read plan agent seeds** from the rule_set's components or metadata. For each component, extract metricSemantics if present.

2. **Validate seeds against data capabilities.** For each seed:
   - Does the filter field exist in committed_data? (e.g., does `product_category` exist?)
   - Does the filter value exist in the data? (e.g., does `Capital Equipment` appear as a product_category value?)
   - Is the source_field numeric and summable? (e.g., is `total_amount` a numeric field?)
   - If all checks pass → seed is confirmed → write MetricDerivationRule with confidence from plan agent

3. **Deterministic passes for unresolved metrics.** Pass 1 (structural), Pass 2 (contextual), Pass 3 (token overlap) — unchanged.

4. **AI semantic derivation (Pass 4)** — only for metrics where no plan agent seed exists AND Passes 1–3 failed. This becomes the fallback, not the primary path.

### What This Eliminates

- Non-deterministic convergence failure for any metric the plan agent understood
- Redundant AI calls (the plan agent already did the semantic reasoning)
- The "intelligence lost in translation" gap between plan interpretation and convergence

### What This Preserves

- Korean Test compliance — seeds are structural (field names, values, operations), not language-dependent
- The convergence service's existing 3-pass matching for non-seed metrics
- AI Pass 4 as fallback for genuinely novel metrics
- Validation of seeds against actual data — the plan agent's understanding is a hint, not an unchecked override

---

## Storage

Seeds are stored in `rule_sets.components` JSONB alongside existing `calculationIntent`. Each component that references a derived metric includes a `metricSemantics` array. No new tables required.

When convergence validates a seed and confirms it, the resulting MetricDerivationRule is written to `rule_sets.input_bindings` as today. The seed is the source; the MetricDerivationRule is the runtime artifact.

---

## Scope

This decision applies to all plan interpretations going forward. Existing rule_sets without metricSemantics will continue to use the convergence service's existing matching paths (Passes 1–4). No migration required — seeds are additive.

---

## Relationship to Standing Principles

| Principle | How Decision 147 Honors It |
|-----------|---------------------------|
| Synaptic State | Intelligence flows from plan agent to convergence via shared data, not independent re-derivation |
| TMR Addendum 10 | Convergence reads plan intelligence, validates against data — matching becomes a read + validate, not a computation |
| Korean Test | Seeds are structural (field names, values, operations) — no language-dependent matching |
| LLM Intelligence Principle | "If we are limiting the LLM then we are wasting the intelligence we have gained" — the plan agent's intelligence is preserved and forwarded |
| Decision 64 (Dual Intelligence) | Plan Intelligence Profile now explicitly feeds Convergence Layer as designed |
| Carry Everything | The plan agent's semantic understanding is carried forward, not discarded after interpretation |
| Three-Tier Resolution | AI proposes seeds (plan interpretation) → deterministic validation (convergence) → human confirms (review) |
| Standing Rule 34 | Fix is structural (plan agent output + convergence consumption), not a data fix |

---

## What This Decision Does NOT Do

- It does NOT eliminate the convergence service or its existing matching logic
- It does NOT make seeds authoritative without validation — convergence still checks against actual data
- It does NOT require changes to the calculation engine — the engine already consumes MetricDerivationRules from input_bindings
- It does NOT require a new database table — seeds live in existing JSONB columns
- It does NOT bypass human review for low-confidence seeds — existing confidence thresholds apply

---

*Decision 147 — Locked. April 4, 2026.*
*"The plan agent already understood. The fix is not teaching convergence to understand — it is giving convergence what the plan agent already knows."*
