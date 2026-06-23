// OB-233 (DS-030 §4.3 / §4.5) — Insight Engine types. NO fixed taxonomies.
// The LLM emits FREE-FORM characterizations (insight_characterization, insight_severity,
// shape_description) at temperature 0; deterministic code validates only STRUCTURAL properties
// (insight-validator) and hashes the shape (insight-shape). There is no artifact_type / severity
// registry and no enum: a seasonal cycle, phase shift, correlation, or any pattern outside four
// boxes is emitted and stored (C0). KOREAN TEST: zero fixed vocabulary in any language.
//
// Storage note: insight_characterization -> intelligence_artifacts.artifact_type and
// insight_severity -> .severity. Those columns stay TEXT (no schema change); they now hold the
// free-form strings verbatim and are never compared against a set.

export interface InsightDataRef {
  metric: string;        // a metric key — comes from the summary data, never hardcoded
  value: number;         // the observed value — MUST trace to a summary_artifacts metric (validator)
  delta_pct?: number;
  comparison?: string;
}

export interface GeneratedInsight {
  insight_characterization: string;  // free-form: what KIND of pattern this is, structurally
  insight_severity: string;          // free-form: how much it matters and why
  entity_id: string | null;
  entity_type: string | null;        // free-form entity description, or null for network-level
  period_start: string | null;
  period_end: string | null;
  title: string;
  narrative: string;
  data_references: InsightDataRef[];
  shape_description?: string;         // free-form, tenant-content-free structural fingerprint (DS-030 §4.5)
  recommended_action?: string | null;
}

// DS-030 §4.5 — tenant-content-free structural fingerprint. Free-form prose + a deterministic hash.
// No fixed field set, no implied value set (C0). The hash is over the description for now (Residual:
// replace with structural-feature-extraction hash, DS-030 §9.5).
export interface InsightShape {
  shape_description: string;
  structural_fingerprint_hash: string;
}
