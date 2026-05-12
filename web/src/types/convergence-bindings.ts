/**
 * Convergence binding types (Decision 111, HF-108/109/111/216).
 *
 * `convergence_bindings` declares, per component, which committed_data batch +
 * column + entity-identifier the calculation engine uses to resolve metric
 * values. The shape is persisted on `rule_sets.input_bindings.convergence_bindings`
 * (JSONB).
 */

export interface ConvergenceBindingEntry {
  source_batch_id: string;
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
}
