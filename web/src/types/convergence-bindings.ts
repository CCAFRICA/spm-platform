/**
 * Convergence binding types (Decision 111, HF-108/109/111/216).
 *
 * `convergence_bindings` declares, per component, which column + entity-identifier
 * the calculation engine uses to resolve metric values. The shape is persisted on
 * `rule_sets.input_bindings.convergence_bindings` (JSONB).
 *
 * HF-222 Phase 3 — schema-class root closure:
 *   The prior single batch-id field that collapsed two semantics (learning
 *   provenance vs. data-location read-filter) is retired. The fields now are:
 *     - `column` (data-location: read by column name across operative-period batches)
 *     - `learning_provenance.{batch_id, learned_at}` (audit metadata; period-agnostic)
 *   Data-location resolution is column-name-keyed throughout; no batch_id mediation.
 *   See VG substrate entry T1-E-PG3 for the class naming and compliance rule.
 */

export interface ConvergenceBindingEntry {
  column: string;
  field_identity?: { structuralType?: string; contextualIdentity?: string };
  match_pass?: number;
  confidence?: number;
  // HF-111: Scale factor for percentage columns (e.g., 100 when ratio → percentage).
  scale_factor?: number;
  // HF-216: Optional via-join for entity-axis bridging across data_types.
  // When present on entity_identifier binding, the resolver performs a
  // two-stage lookup: entity external_id → roster_field value → measure column.
  via?: {
    roster_data_type: string;
    roster_field: string;
    entity_field: string;
  };
  // HF-222 Phase 3: learning provenance (audit metadata only; never used as
  // data-location read-filter). Records the batch where convergence learned the
  // column identity, plus the timestamp of the binding-write decision.
  learning_provenance?: {
    batch_id: string;
    learned_at: string;
  };
  // HF-227: filters live on the binding (Decision 111 single-structure
  // completion). Engine consumers pass binding.filters directly to
  // resolveColumnFromBatch; the HF-226 findMetricFilters cross-structure
  // bridge is retired. Empty / absent means "no filter" — rowMatchesFilters
  // returns true for empty arrays.
  // Operator union mirrors MetricDerivationRule['filters'][number]['operator']
  // so binding.filters can pass directly to resolveColumnFromBatch.
  filters?: Array<{
    field: string;
    operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains';
    value: string | number | boolean;
  }>;
}
