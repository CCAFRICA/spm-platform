/**
 * Statistical Anomaly Detection
 *
 * OB-71 Mission 4: Pure math analysis on calculation results.
 * No AI calls — detects patterns via statistics.
 *
 * Anomaly types:
 * 1. identical_values: N entities with exact same payout
 * 2. outlier_high/outlier_low: > 2 standard deviations from mean
 * 3. zero_payout: $0 when other entities have payouts
 * 4. missing_entity: has assignment but no calculation result
 */

export interface Anomaly {
  type: 'identical_values' | 'outlier_high' | 'outlier_low' | 'zero_payout' | 'missing_entity';
  entityCount: number;
  description: string;
  entities: string[];       // entity_ids (first 10)
  value?: number;
  threshold?: number;
}

export interface AnomalyReport {
  anomalies: Anomaly[];
  stats: {
    mean: number;
    stdDev: number;
    median: number;
    min: number;
    max: number;
    total: number;
    entityCount: number;
  };
}

interface PayoutRecord {
  entityId: string;
  entityName?: string;
  totalPayout: number;
}

/**
 * Detect anomalies in a set of payout records.
 * Returns anomalies sorted by severity (entity count descending).
 */
export function detectAnomalies(
  records: PayoutRecord[],
  assignedEntityIds?: string[]
): AnomalyReport {
  const anomalies: Anomaly[] = [];

  if (records.length === 0) {
    return {
      anomalies: [],
      stats: { mean: 0, stdDev: 0, median: 0, min: 0, max: 0, total: 0, entityCount: 0 },
    };
  }

  const payouts = records.map(r => r.totalPayout);
  const total = payouts.reduce((s, v) => s + v, 0);
  const mean = total / payouts.length;
  const sorted = [...payouts].sort((a, b) => a - b);
  const median = sorted.length % 2 === 0
    ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : sorted[Math.floor(sorted.length / 2)];
  const variance = payouts.reduce((s, v) => s + (v - mean) ** 2, 0) / payouts.length;
  const stdDev = Math.sqrt(variance);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];

  // 1. Identical values — N entities with the exact same payout (threshold: 3+)
  const valueCounts = new Map<number, string[]>();
  for (const r of records) {
    const key = Math.round(r.totalPayout * 100) / 100; // round to cents
    if (!valueCounts.has(key)) valueCounts.set(key, []);
    valueCounts.get(key)!.push(r.entityId);
  }
  for (const [value, entityIds] of Array.from(valueCounts.entries())) {
    if (entityIds.length >= 3) {
      anomalies.push({
        type: 'identical_values',
        entityCount: entityIds.length,
        description: `${entityIds.length} entities have identical payout of $${value.toLocaleString()}`,
        entities: entityIds.slice(0, 10),
        value,
      });
    }
  }

  // 2. Outliers — > 2 standard deviations from mean
  if (stdDev > 0) {
    const highThreshold = mean + 2 * stdDev;
    const lowThreshold = mean - 2 * stdDev;

    const highOutliers = records.filter(r => r.totalPayout > highThreshold);
    if (highOutliers.length > 0) {
      anomalies.push({
        type: 'outlier_high',
        entityCount: highOutliers.length,
        description: `${highOutliers.length} entities have payouts > 2 standard deviations above mean ($${highThreshold.toFixed(0)})`,
        entities: highOutliers.map(r => r.entityId).slice(0, 10),
        threshold: highThreshold,
      });
    }

    const lowOutliers = records.filter(r => r.totalPayout < lowThreshold && r.totalPayout > 0);
    if (lowOutliers.length > 0) {
      anomalies.push({
        type: 'outlier_low',
        entityCount: lowOutliers.length,
        description: `${lowOutliers.length} entities have payouts > 2 standard deviations below mean ($${Math.max(0, lowThreshold).toFixed(0)})`,
        entities: lowOutliers.map(r => r.entityId).slice(0, 10),
        threshold: lowThreshold,
      });
    }
  }

  // 3. Zero payouts — entities with $0 when others have payouts
  if (mean > 0) {
    const zeroEntities = records.filter(r => r.totalPayout === 0);
    if (zeroEntities.length > 0) {
      anomalies.push({
        type: 'zero_payout',
        entityCount: zeroEntities.length,
        description: `${zeroEntities.length} entities have $0 payout — verify data completeness`,
        entities: zeroEntities.map(r => r.entityId).slice(0, 10),
        value: 0,
      });
    }
  }

  // 4. Missing entities — have assignments but no calculation results
  if (assignedEntityIds && assignedEntityIds.length > 0) {
    const calculatedIds = new Set(records.map(r => r.entityId));
    const missing = assignedEntityIds.filter(id => !calculatedIds.has(id));
    if (missing.length > 0) {
      anomalies.push({
        type: 'missing_entity',
        entityCount: missing.length,
        description: `${missing.length} assigned entities have no calculation results`,
        entities: missing.slice(0, 10),
      });
    }
  }

  // Sort by entity count descending (most impactful first)
  anomalies.sort((a, b) => b.entityCount - a.entityCount);

  return {
    anomalies,
    stats: { mean, stdDev, median, min, max, total, entityCount: records.length },
  };
}
