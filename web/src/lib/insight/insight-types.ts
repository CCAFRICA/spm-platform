// OB-232 — Insight Engine canonical registries + types.
// The artifact-type and severity registries are STRUCTURAL classes (not domain strings) — like the
// structural interaction types. The validator (EP-2) fails loud on anything outside these registries.

export const ARTIFACT_TYPES = ['anomaly', 'trend', 'coaching', 'benchmark'] as const;
export type ArtifactType = (typeof ARTIFACT_TYPES)[number];

export const SEVERITIES = ['critical', 'warning', 'info', 'positive'] as const;
export type Severity = (typeof SEVERITIES)[number];

export interface InsightDataRef {
  metric: string;        // a metric key — comes from the summary data, never hardcoded
  value: number;         // the observed value — MUST trace to a summary_artifacts metric (EP-2)
  delta_pct?: number;
  comparison?: string;
}

export interface GeneratedInsight {
  artifact_type: ArtifactType;
  severity: Severity;
  entity_id: string | null;
  entity_type: string | null; // 'location' | 'individual' | 'organization' | 'network'
  period_start: string | null;
  period_end: string | null;
  title: string;
  narrative: string;
  data_references: InsightDataRef[];
  recommended_action?: string | null;
}

// EP-3 — tenant-content-free structural fingerprint. Contains ZERO tenant data by construction.
export interface InsightShape {
  pattern: string;                 // spike | drop | outlier | trend | gap | benchmark
  metric_class: string;            // 'measure' (summary metrics are numeric measures)
  entity_type: string;             // location | individual | organization | network
  severity: Severity;
  delta_direction: 'increase' | 'decrease' | 'flat' | 'none';
}
