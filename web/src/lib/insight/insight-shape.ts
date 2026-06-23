// OB-232 Enforcement Point 3 — insight structural-shape capture.
// Derives a fingerprint of the PATTERN STRUCTURE, stripped of all tenant content. By construction it
// references only structural classes (artifact_type, entity_type, severity) and a delta DIRECTION —
// never entity names, tenant ids, metric names, or values. Foundation for cross-tenant shape transfer
// (Domain Flywheel; transfer itself out of scope).

import type { GeneratedInsight, InsightShape } from './insight-types';

export function computeInsightShape(ins: GeneratedInsight): InsightShape {
  const deltas = (ins.data_references || [])
    .map((r) => r.delta_pct)
    .filter((d): d is number => typeof d === 'number' && Number.isFinite(d));
  const primaryDelta = deltas.length > 0 ? deltas[0] : null;
  const delta_direction: InsightShape['delta_direction'] =
    primaryDelta == null ? 'none' : primaryDelta > 1 ? 'increase' : primaryDelta < -1 ? 'decrease' : 'flat';

  const pattern =
    ins.artifact_type === 'anomaly'
      ? delta_direction === 'increase' ? 'spike' : delta_direction === 'decrease' ? 'drop' : 'outlier'
      : ins.artifact_type === 'trend' ? 'trend'
      : ins.artifact_type === 'coaching' ? 'gap'
      : 'benchmark';

  return {
    pattern,
    metric_class: 'measure',
    entity_type: ins.entity_type || 'network',
    severity: ins.severity,
    delta_direction,
  };
}
