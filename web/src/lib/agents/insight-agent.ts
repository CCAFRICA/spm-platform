/**
 * Insight Agent — Foundational Agent
 *
 * Dual-mode: lightweight inline (during calculation) + full analysis (post-run).
 * Moves from "here's what happened" to "here's what to do about it."
 * Persona-aware: Admin sees governance, Manager sees coaching, Rep sees growth.
 *
 * ZERO domain language. Korean Test applies.
 * Communicates exclusively through the Synaptic Surface.
 */

import type { SynapticSurface, Synapse } from '@/lib/calculation/synaptic-types';
import { writeSynapse, readSynapses } from '@/lib/calculation/synaptic-surface';

// ──────────────────────────────────────────────
// Configuration
// ──────────────────────────────────────────────

export interface InsightConfig {
  thresholds: {
    anomalyRateAlert: number;       // default 0.05 (5%)
    confidenceDropAlert: number;    // default 0.10 (10% drop)
    zeroOutcomeAlert: number;       // default 0.10 (10% zero outcomes)
    concentrationAlert: number;     // default 0.50 (50% of total in top 10%)
  };
}

export const DEFAULT_INSIGHT_CONFIG: InsightConfig = {
  thresholds: {
    anomalyRateAlert: 0.05,
    confidenceDropAlert: 0.10,
    zeroOutcomeAlert: 0.10,
    concentrationAlert: 0.50,
  },
};

// ──────────────────────────────────────────────
// Inline Mode — O(1) checks during calculation
// ──────────────────────────────────────────────

export interface InlineInsight {
  type: 'anomaly_rate_high' | 'confidence_dropping' | 'zero_outcome_cluster' | 'concentration_risk';
  severity: number;
  metric: string;
  currentValue: number;
  threshold: number;
  entityCount: number;
  recommendation: string;
}

/**
 * Check surface stats against thresholds. O(1) — reads aggregate stats only.
 * Should be called at checkpoints (every N entities or percentage milestones).
 */
export function checkInlineInsights(
  surface: SynapticSurface,
  config: InsightConfig,
  entitiesProcessed: number
): InlineInsight[] {
  const insights: InlineInsight[] = [];
  if (entitiesProcessed === 0) return insights;

  const stats = surface.stats;
  const t = config.thresholds;

  // Check 1: Anomaly rate
  const anomalyRate = stats.anomalyCount / entitiesProcessed;
  if (anomalyRate > t.anomalyRateAlert) {
    const insight: InlineInsight = {
      type: 'anomaly_rate_high',
      severity: Math.min(1.0, anomalyRate / t.anomalyRateAlert),
      metric: 'anomaly_rate',
      currentValue: anomalyRate,
      threshold: t.anomalyRateAlert,
      entityCount: entitiesProcessed,
      recommendation: 'Review input data quality — anomaly rate exceeds threshold',
    };
    insights.push(insight);

    writeSynapse(surface, {
      type: 'pattern',
      componentIndex: -1,
      value: anomalyRate,
      detail: `inline_insight:anomaly_rate_high:${anomalyRate.toFixed(3)}`,
      timestamp: typeof performance !== 'undefined' ? performance.now() : Date.now(),
    });
  }

  // Check 2: Confidence dropping
  const confSynapses = readSynapses(surface, 'confidence', 'run');
  if (confSynapses.length > 0) {
    const avgConf = confSynapses.reduce((s, syn) => s + syn.value, 0) / confSynapses.length;
    const confDrop = 1.0 - avgConf;
    if (confDrop > t.confidenceDropAlert) {
      insights.push({
        type: 'confidence_dropping',
        severity: Math.min(1.0, confDrop / t.confidenceDropAlert),
        metric: 'avg_confidence',
        currentValue: avgConf,
        threshold: 1.0 - t.confidenceDropAlert,
        entityCount: entitiesProcessed,
        recommendation: 'Execution confidence below expected — verify rule interpretation',
      });
    }
  }

  // Check 3: Correction count (from prior reconciliation)
  if (stats.correctionCount > 0) {
    const correctionRate = stats.correctionCount / entitiesProcessed;
    if (correctionRate > t.anomalyRateAlert) {
      insights.push({
        type: 'anomaly_rate_high',
        severity: Math.min(1.0, correctionRate * 10),
        metric: 'correction_rate',
        currentValue: correctionRate,
        threshold: t.anomalyRateAlert,
        entityCount: entitiesProcessed,
        recommendation: 'Previous reconciliation corrections detected — review affected components',
      });
    }
  }

  return insights;
}

// ──────────────────────────────────────────────
// Full Analysis Mode — post-calculation
// ──────────────────────────────────────────────

export interface PrescriptiveInsight {
  id: string;
  category: 'performance' | 'data_quality' | 'process' | 'risk';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  recommendation: string;
  dataSource: string[];
  confidence: number;
}

export interface Alert {
  id: string;
  severity: 'warning' | 'critical';
  title: string;
  description: string;
  dataSource: string[];
}

export interface CoachingAction {
  id: string;
  title: string;
  description: string;
  targetEntityCount: number;
  dataSource: string[];
}

export interface GovernanceFlag {
  id: string;
  title: string;
  description: string;
  severity: 'warning' | 'critical';
  dataSource: string[];
}

export interface GrowthSignal {
  id: string;
  title: string;
  description: string;
  currentValue: number;
  targetValue: number;
  dataSource: string[];
}

export interface CalculationSummary {
  entityCount: number;
  componentCount: number;
  totalOutcome: number;
  avgOutcome: number;
  medianOutcome: number;
  zeroOutcomeCount: number;
  concordanceRate: number;
  topEntities: Array<{ entityId: string; outcome: number }>;
  bottomEntities: Array<{ entityId: string; outcome: number }>;
}

export interface FullAnalysis {
  batchId: string;
  timestamp: string;
  runSummary: {
    entityCount: number;
    componentCount: number;
    totalOutcome: number;
    synapsesWritten: number;
    anomalyCount: number;
    correctionCount: number;
    avgConfidence: number;
  };
  insights: PrescriptiveInsight[];
  alerts: Alert[];
  coachingActions: CoachingAction[];
  governanceFlags: GovernanceFlag[];
  growthSignals: GrowthSignal[];
  inlineInsights: InlineInsight[];
}

/**
 * Generate full analysis from surface stats and calculation summary.
 * Deterministic — no LLM call. Produces structured insights from data.
 * AP-18: Every insight has dataSource. Empty dataSource → stripped.
 */
export function generateFullAnalysis(
  batchId: string,
  surface: SynapticSurface,
  summary: CalculationSummary,
  config: InsightConfig = DEFAULT_INSIGHT_CONFIG,
  inlineInsights: InlineInsight[] = []
): FullAnalysis {
  const insights: PrescriptiveInsight[] = [];
  const alerts: Alert[] = [];
  const coachingActions: CoachingAction[] = [];
  const governanceFlags: GovernanceFlag[] = [];
  const growthSignals: GrowthSignal[] = [];

  const stats = surface.stats;

  // Compute avg confidence from run synapses
  const confSynapses = readSynapses(surface, 'confidence', 'run');
  const avgConf = confSynapses.length > 0
    ? confSynapses.reduce((s, syn) => s + syn.value, 0) / confSynapses.length
    : 1.0;

  // ── Insight: Zero outcome concentration ──
  if (summary.zeroOutcomeCount > 0) {
    const zeroRate = summary.zeroOutcomeCount / Math.max(summary.entityCount, 1);
    if (zeroRate > config.thresholds.zeroOutcomeAlert) {
      insights.push({
        id: 'zero_outcome_cluster',
        category: 'data_quality',
        severity: zeroRate > 0.25 ? 'critical' : 'warning',
        title: 'Zero outcome concentration detected',
        description: `${summary.zeroOutcomeCount} of ${summary.entityCount} entities (${(zeroRate * 100).toFixed(1)}%) produced zero outcomes`,
        recommendation: 'Verify input data completeness for affected entities',
        dataSource: ['calculation_summary.zeroOutcomeCount', 'calculation_summary.entityCount'],
        confidence: 0.9,
      });

      governanceFlags.push({
        id: 'gov_zero_outcomes',
        title: 'Zero outcome entities require review',
        description: `${summary.zeroOutcomeCount} entities have zero outcomes — review before lifecycle advancement`,
        severity: zeroRate > 0.25 ? 'critical' : 'warning',
        dataSource: ['calculation_summary.zeroOutcomeCount'],
      });
    }
  }

  // ── Insight: Anomaly rate ──
  const anomalyRate = stats.anomalyCount / Math.max(summary.entityCount, 1);
  if (anomalyRate > config.thresholds.anomalyRateAlert) {
    insights.push({
      id: 'high_anomaly_rate',
      category: 'risk',
      severity: anomalyRate > 0.15 ? 'critical' : 'warning',
      title: 'Elevated anomaly rate',
      description: `${stats.anomalyCount} anomalies detected across ${summary.entityCount} entities (${(anomalyRate * 100).toFixed(1)}% rate)`,
      recommendation: 'Investigate anomalous entities before approving results',
      dataSource: ['surface.stats.anomalyCount', 'calculation_summary.entityCount'],
      confidence: 0.85,
    });

    alerts.push({
      id: 'alert_anomaly_rate',
      severity: anomalyRate > 0.15 ? 'critical' : 'warning',
      title: 'Anomaly rate exceeds threshold',
      description: `${(anomalyRate * 100).toFixed(1)}% anomaly rate (threshold: ${(config.thresholds.anomalyRateAlert * 100).toFixed(0)}%)`,
      dataSource: ['surface.stats.anomalyCount'],
    });
  }

  // ── Insight: Confidence drop ──
  if (avgConf < 1.0 - config.thresholds.confidenceDropAlert) {
    insights.push({
      id: 'low_confidence',
      category: 'process',
      severity: avgConf < 0.7 ? 'critical' : 'warning',
      title: 'Low execution confidence',
      description: `Average confidence: ${(avgConf * 100).toFixed(1)}% — some components may have interpretation uncertainty`,
      recommendation: 'Review component rule interpretations for low-confidence patterns',
      dataSource: ['surface.runSynapses.confidence'],
      confidence: 0.8,
    });
  }

  // ── Insight: Concentration risk ──
  if (summary.topEntities.length > 0 && summary.totalOutcome > 0) {
    const top10Outcome = summary.topEntities.reduce((s, e) => s + e.outcome, 0);
    const concentrationRatio = top10Outcome / summary.totalOutcome;
    if (concentrationRatio > config.thresholds.concentrationAlert) {
      insights.push({
        id: 'concentration_risk',
        category: 'risk',
        severity: concentrationRatio > 0.7 ? 'critical' : 'warning',
        title: 'Outcome concentration risk',
        description: `Top ${summary.topEntities.length} entities account for ${(concentrationRatio * 100).toFixed(1)}% of total outcomes`,
        recommendation: 'Verify high-outcome entities have complete and accurate data',
        dataSource: ['calculation_summary.topEntities', 'calculation_summary.totalOutcome'],
        confidence: 0.85,
      });
    }
  }

  // ── Insight: Concordance ──
  if (summary.concordanceRate < 100) {
    insights.push({
      id: 'concordance_gap',
      category: 'process',
      severity: summary.concordanceRate < 95 ? 'critical' : 'info',
      title: 'Dual-path concordance gap',
      description: `${summary.concordanceRate.toFixed(1)}% concordance between execution paths`,
      recommendation: summary.concordanceRate < 95
        ? 'Critical: execution paths diverge significantly — investigate component transformations'
        : 'Minor concordance gap — monitor in subsequent runs',
      dataSource: ['calculation_summary.concordanceRate'],
      confidence: 0.95,
    });
  }

  // ── Coaching: Performance distribution ──
  if (summary.bottomEntities.length > 0 && summary.totalOutcome > 0) {
    coachingActions.push({
      id: 'coach_bottom_performers',
      title: 'Bottom performers identified',
      description: `${summary.bottomEntities.length} entities in bottom tier — investigate input factors`,
      targetEntityCount: summary.bottomEntities.length,
      dataSource: ['calculation_summary.bottomEntities'],
    });
  }

  // ── Growth: Average performance ──
  if (summary.avgOutcome > 0) {
    growthSignals.push({
      id: 'growth_avg_outcome',
      title: 'Average outcome benchmark',
      description: `Current average outcome: ${summary.avgOutcome.toFixed(2)}`,
      currentValue: summary.avgOutcome,
      targetValue: summary.avgOutcome * 1.1, // 10% improvement target
      dataSource: ['calculation_summary.avgOutcome'],
    });
  }

  // ── AP-18 Gate: Strip any insights without dataSource ──
  const validInsights = insights.filter(i => i.dataSource.length > 0);
  const validAlerts = alerts.filter(a => a.dataSource.length > 0);

  return {
    batchId,
    timestamp: new Date().toISOString(),
    runSummary: {
      entityCount: summary.entityCount,
      componentCount: summary.componentCount,
      totalOutcome: summary.totalOutcome,
      synapsesWritten: stats.totalSynapsesWritten,
      anomalyCount: stats.anomalyCount,
      correctionCount: stats.correctionCount,
      avgConfidence: avgConf,
    },
    insights: validInsights,
    alerts: validAlerts,
    coachingActions,
    governanceFlags,
    growthSignals,
    inlineInsights,
  };
}

// ──────────────────────────────────────────────
// Persona Routing
// ──────────────────────────────────────────────

export interface PersonaInsights {
  insights: PrescriptiveInsight[];
  alerts?: Alert[];
  governance?: GovernanceFlag[];
  coaching?: CoachingAction[];
  growth?: GrowthSignal[];
}

export function routeToPersona(analysis: FullAnalysis, persona: 'admin' | 'manager' | 'rep'): PersonaInsights {
  switch (persona) {
    case 'admin':
      return {
        insights: analysis.insights.filter(i => i.category === 'process' || i.category === 'risk'),
        alerts: analysis.alerts,
        governance: analysis.governanceFlags,
      };
    case 'manager':
      return {
        insights: analysis.insights.filter(i => i.category === 'performance' || i.category === 'data_quality'),
        coaching: analysis.coachingActions,
      };
    case 'rep':
      return {
        insights: analysis.insights.filter(i => i.category === 'performance' && i.severity === 'info'),
        growth: analysis.growthSignals,
      };
  }
}
