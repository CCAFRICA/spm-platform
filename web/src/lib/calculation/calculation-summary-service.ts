/**
 * Calculation Summary Service
 *
 * Computes and stores a pre-aggregated CalculationSummary from calculation traces.
 * Used by the Results Dashboard for fast rendering without re-aggregating raw data.
 * Outlier detection uses standard deviation (>3 sigma from mean).
 *
 * All component names, variant labels, and store IDs come from the data -- zero hardcoded.
 */

import type { CalculationTrace } from '@/lib/forensics/types';
import { getAIService } from '@/lib/ai/ai-service';

export interface CalculationSummary {
  runId: string;
  tenantId: string;
  period: string;
  totalPayout: number;
  entityCount: number;
  averagePayout: number;
  componentTotals: ComponentTotal[];
  storeTotals: StoreTotal[];
  variantDistribution: VariantGroup[];
  outliers: OutlierEmployee[];
  priorPeriodDelta?: { totalChange: number; percentChange: number };
  aiBriefing?: string;
  aiBriefingAvailable: boolean;
  generatedAt: string;
}

export interface ComponentTotal {
  componentId: string;
  componentName: string;
  total: number;
  entityCount: number;
}

export interface StoreTotal {
  storeId: string;
  total: number;
  entityCount: number;
}

export interface VariantGroup {
  variant: string;
  count: number;
  totalPayout: number;
  avgPayout: number;
}

export interface OutlierEmployee {
  entityId: string;
  entityName: string;
  storeId?: string;
  total: number;
  zScore: number;
}

const SUMMARY_PREFIX = 'vialuce_calc_summary_';

/**
 * Build a CalculationSummary from traces.
 */
export function buildCalculationSummary(
  traces: CalculationTrace[],
  runId: string,
  tenantId: string,
  period: string
): CalculationSummary {
  if (traces.length === 0) {
    return {
      runId, tenantId, period,
      totalPayout: 0, entityCount: 0, averagePayout: 0,
      componentTotals: [], storeTotals: [], variantDistribution: [], outliers: [],
      aiBriefingAvailable: false, generatedAt: new Date().toISOString(),
    };
  }

  const totalPayout = traces.reduce((sum, t) => sum + t.totalIncentive, 0);
  const entityCount = traces.length;
  const averagePayout = entityCount > 0 ? totalPayout / entityCount : 0;

  // Component totals (dynamic from traces)
  const compMap = new Map<string, { id: string; name: string; total: number; count: number }>();
  for (const trace of traces) {
    for (const comp of trace.components) {
      const existing = compMap.get(comp.componentId);
      if (existing) {
        existing.total += comp.outputValue;
        existing.count += comp.outputValue > 0 ? 1 : 0;
      } else {
        compMap.set(comp.componentId, {
          id: comp.componentId, name: comp.componentName,
          total: comp.outputValue, count: comp.outputValue > 0 ? 1 : 0,
        });
      }
    }
  }
  const componentTotals: ComponentTotal[] = Array.from(compMap.values())
    .map(c => ({ componentId: c.id, componentName: c.name, total: c.total, entityCount: c.count }))
    .sort((a, b) => b.total - a.total);

  // Store totals
  const storeMap = new Map<string, { total: number; count: number }>();
  for (const trace of traces) {
    const sid = trace.storeId || 'unknown';
    const existing = storeMap.get(sid);
    if (existing) {
      existing.total += trace.totalIncentive;
      existing.count++;
    } else {
      storeMap.set(sid, { total: trace.totalIncentive, count: 1 });
    }
  }
  const storeTotals: StoreTotal[] = Array.from(storeMap.entries())
    .map(([storeId, data]) => ({ storeId, total: data.total, entityCount: data.count }))
    .sort((a, b) => b.total - a.total);

  // Variant distribution
  const variantMap = new Map<string, { count: number; totalPayout: number }>();
  for (const trace of traces) {
    const vName = trace.variant?.variantName || 'Default';
    const existing = variantMap.get(vName);
    if (existing) {
      existing.count++;
      existing.totalPayout += trace.totalIncentive;
    } else {
      variantMap.set(vName, { count: 1, totalPayout: trace.totalIncentive });
    }
  }
  const variantDistribution: VariantGroup[] = Array.from(variantMap.entries())
    .map(([variant, data]) => ({
      variant, count: data.count, totalPayout: data.totalPayout,
      avgPayout: data.count > 0 ? data.totalPayout / data.count : 0,
    }));

  // Outlier detection (>3 standard deviations)
  const payouts = traces.map(t => t.totalIncentive);
  const mean = averagePayout;
  const variance = payouts.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / payouts.length;
  const stdDev = Math.sqrt(variance);
  const outliers: OutlierEmployee[] = stdDev > 0
    ? traces
        .filter(t => Math.abs(t.totalIncentive - mean) > 3 * stdDev)
        .map(t => ({
          entityId: t.entityId,
          entityName: t.entityName,
          storeId: t.storeId,
          total: t.totalIncentive,
          zScore: (t.totalIncentive - mean) / stdDev,
        }))
        .sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore))
    : [];

  return {
    runId, tenantId, period,
    totalPayout, entityCount, averagePayout,
    componentTotals, storeTotals, variantDistribution, outliers,
    aiBriefingAvailable: false,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Generate AI briefing for a calculation summary.
 * Captures training signal. Degrades gracefully if AI unavailable.
 */
export async function generateAIBriefing(
  summary: CalculationSummary,
  tenantId: string
): Promise<string | null> {
  try {
    const aiService = getAIService();
    const response = await aiService.execute(
      {
        task: 'recommendation',
        input: {
          analysisData: {
            totalPayout: summary.totalPayout,
            entityCount: summary.entityCount,
            averagePayout: summary.averagePayout,
            componentTotals: summary.componentTotals,
            outlierCount: summary.outliers.length,
            variantDistribution: summary.variantDistribution,
          },
          context: {
            type: 'calculation_briefing',
            instructions: [
              'Generate 2-4 key observations about this compensation calculation cycle.',
              'Each observation should follow thermostat format: metric, diagnosis, recommendation.',
              'Use plain language. Reference specific data patterns, not names.',
              'If outliers exist, mention them. If one component dominates, note it.',
            ].join(' '),
          },
        },
        options: { responseFormat: 'text' },
      },
      true,
      { tenantId, userId: 'system' }
    );
    const text = typeof response.result === 'string'
      ? response.result
      : (response.result as Record<string, unknown>)?.text as string || JSON.stringify(response.result);
    return text || null;
  } catch (error) {
    console.warn('[CalcSummary] AI briefing generation failed (non-fatal):', error);
    return null;
  }
}

/**
 * Save a calculation summary to localStorage.
 */
export function saveSummary(summary: CalculationSummary): void {
  if (typeof window === 'undefined') return;
  const key = `${SUMMARY_PREFIX}${summary.tenantId}_${summary.runId}`;
  localStorage.setItem(key, JSON.stringify(summary));
}

/**
 * Load a calculation summary.
 */
export function loadSummary(tenantId: string, runId: string): CalculationSummary | null {
  if (typeof window === 'undefined') return null;
  const key = `${SUMMARY_PREFIX}${tenantId}_${runId}`;
  const stored = localStorage.getItem(key);
  if (!stored) return null;
  try {
    return JSON.parse(stored) as CalculationSummary;
  } catch {
    return null;
  }
}

/**
 * Get the most recent summary for a tenant.
 */
export function getLatestSummary(tenantId: string): CalculationSummary | null {
  if (typeof window === 'undefined') return null;
  let latest: CalculationSummary | null = null;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(`${SUMMARY_PREFIX}${tenantId}_`)) {
      try {
        const summary = JSON.parse(localStorage.getItem(key) || '') as CalculationSummary;
        if (!latest || summary.generatedAt > latest.generatedAt) {
          latest = summary;
        }
      } catch {
        // skip
      }
    }
  }
  return latest;
}
