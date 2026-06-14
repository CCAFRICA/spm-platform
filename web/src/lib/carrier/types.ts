/**
 * OB-205 / DS-029 Phase 1 — Carrier Intelligence payload.
 *
 * The shape the Observation expression surface reads from the substrate carrier
 * (committed_data, entities, import_batches, classification_signals, rule_sets,
 * rule_set_assignments, periods, calculation_batches). Cold CRL tier: structural
 * carrier state, no plan or calculation prerequisite.
 *
 * Korean Test: every label in this payload is DATA the tenant imported (data_type
 * values, entity_type values, classification values) — never a domain literal.
 *
 * Extensions beyond DS-029 §3.1 (additive, documented):
 *  - contentUnits carry earliest/latest/entitiesBound so the Content Unit Browser
 *    renders from this payload (R2: the dedicated content-unit route is skipped).
 *  - entities.sample carries a bounded ≤20 entity set with transactionCount so the
 *    Entity Explorer renders without an N+1 secondary route (R3).
 */

export interface CarrierContentUnit {
  dataType: string;
  rowCount: number;
  earliest: string | null;
  latest: string | null;
  /** committed_data rows in this unit bound to an entity (entity_id IS NOT NULL).
   *  Row-level binding — distinct-entity count would require DB aggregates (disabled). */
  entitiesBound: number;
}

export interface CarrierEntitySample {
  id: string;
  displayName: string;
  entityType: string;
  externalId: string | null;
  status: string;
  /** committed_data rows referencing this entity. */
  transactionCount: number;
}

export interface CarrierIntelligence {
  dataSnapshot: {
    totalRows: number;
    contentUnits: CarrierContentUnit[];
    dateRange: { earliest: string | null; latest: string | null };
    /** committed_data rows WHERE entity_id IS NOT NULL (row-level binding). */
    entityBound: number;
    /** committed_data rows WHERE entity_id IS NULL. */
    entityUnbound: number;
  };
  entities: {
    total: number;
    byType: Array<{ entityType: string; count: number }>;
    withExternalId: number;
    sample: CarrierEntitySample[];
  };
  imports: {
    totalBatches: number;
    latestBatch: {
      fileName: string;
      rowCount: number;
      completedAt: string | null;
      createdAt: string;
    } | null;
  };
  classification: {
    avgConfidence: number | null;
    byClassification: Array<{ classification: string; count: number }>;
    byDecisionSource: Array<{ source: string; count: number }>;
  };
  pipelineReadiness: {
    hasData: boolean;
    hasEntities: boolean;
    hasPlan: boolean;
    hasBindings: boolean;
    hasCalculation: boolean;
    latestLifecycleState: string | null;
  };
  periods: Array<{
    id: string;
    label: string;
    startDate: string;
    endDate: string;
    status: string;
  }>;
}

/** Carrier pipeline stages — the Cold-tier stepper (DS-029 §4.4). */
export const CARRIER_PIPELINE_STAGES = ['Import', 'Classify', 'Bind', 'Calculate', 'Reconcile'] as const;
export type CarrierPipelineStage = typeof CARRIER_PIPELINE_STAGES[number];
