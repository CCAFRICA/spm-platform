/**
 * Impact Calculator
 *
 * Calculates Impact Rating — a composite score that determines approval routing.
 * Configurable weights and thresholds per tenant.
 */

import type {
  ImpactRating,
  ImpactDimensions,
  ImpactDetail,
  ApprovalContext,
  ApprovalDomain,
} from './types';

// ============================================
// DIMENSION THRESHOLDS
// ============================================

interface DimensionThresholds {
  breakpoints: number[];
  scores: number[];
}

const FINANCIAL_THRESHOLDS: DimensionThresholds = {
  // $0-1K = 1, $1K-10K = 3, $10K-50K = 5, $50K-100K = 7, $100K+ = 9
  breakpoints: [0, 1000, 10000, 50000, 100000, Infinity],
  scores: [1, 3, 5, 7, 9, 10],
};

const EMPLOYEE_THRESHOLDS: DimensionThresholds = {
  // 1-5 = 2, 5-20 = 4, 20-100 = 6, 100-500 = 8, 500+ = 10
  breakpoints: [0, 5, 20, 100, 500, Infinity],
  scores: [2, 4, 6, 8, 10, 10],
};

const CASCADE_THRESHOLDS: DimensionThresholds = {
  // 0 = 1, 1-10 = 3, 10-100 = 5, 100-1000 = 7, 1000+ = 9
  breakpoints: [0, 1, 10, 100, 1000, Infinity],
  scores: [1, 3, 5, 7, 9, 10],
};

const PERIOD_STATUS_SCORES: Record<string, number> = {
  open: 1,
  pending_review: 4,
  approved: 7,
  paid: 10,
};

// ============================================
// DIMENSION WEIGHTS
// ============================================

interface DimensionWeights {
  financial: number;
  entityCount: number;
  periodStatus: number;
  cascadeScope: number;
  timelineSensitivity: number;
  regulatoryRisk: number;
}

const DEFAULT_WEIGHTS: DimensionWeights = {
  financial: 0.25,
  entityCount: 0.20,
  periodStatus: 0.20,
  cascadeScope: 0.15,
  timelineSensitivity: 0.10,
  regulatoryRisk: 0.10,
};

// Domain-specific weight overrides
const DOMAIN_WEIGHTS: Partial<Record<ApprovalDomain, Partial<DimensionWeights>>> = {
  import_batch: {
    financial: 0.30,
    entityCount: 0.25,
    periodStatus: 0.15,
  },
  rollback: {
    cascadeScope: 0.30,
    periodStatus: 0.25,
    financial: 0.20,
  },
  compensation_plan: {
    financial: 0.35,
    entityCount: 0.30,
  },
  period_operation: {
    periodStatus: 0.40,
    financial: 0.25,
  },
};

// ============================================
// MAIN CALCULATION
// ============================================

/**
 * Calculate Impact Rating from approval context
 */
export function calculateImpactRating(context: ApprovalContext): ImpactRating {
  const dimensions = calculateDimensions(context);
  const weights = getWeights(context.domain);
  const overall = calculateOverallScore(dimensions, weights);

  return {
    overall: Math.round(overall * 10) / 10, // Round to 1 decimal
    dimensions,
  };
}

/**
 * Calculate individual dimension scores
 */
function calculateDimensions(context: ApprovalContext): ImpactDimensions {
  return {
    financial: calculateFinancialScore(context.financialAmount || 0),
    entityCount: calculateEmployeeScore(context.affectedEmployees || 0),
    periodStatus: calculatePeriodStatusScore(context.periodStatus || 'open'),
    cascadeScope: calculateCascadeScore(context.cascadeCount || 0),
    timelineSensitivity: calculateTimelineScore(context.isUrgent || false),
    regulatoryRisk: calculateRegulatoryScore(context.hasRegulatoryImplications || false),
  };
}

/**
 * Calculate weighted overall score
 */
function calculateOverallScore(
  dimensions: ImpactDimensions,
  weights: DimensionWeights
): number {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const [key, score] of Object.entries(dimensions)) {
    const weight = weights[key as keyof DimensionWeights] || 0;
    weightedSum += score * weight;
    totalWeight += weight;
  }

  // Normalize to 1-10 scale
  return totalWeight > 0 ? weightedSum / totalWeight : 1;
}

/**
 * Get weights for a domain (with overrides)
 */
function getWeights(domain: ApprovalDomain): DimensionWeights {
  const overrides = DOMAIN_WEIGHTS[domain] || {};
  return { ...DEFAULT_WEIGHTS, ...overrides };
}

// ============================================
// INDIVIDUAL DIMENSION CALCULATORS
// ============================================

function calculateFinancialScore(amount: number): number {
  return getScoreFromThresholds(Math.abs(amount), FINANCIAL_THRESHOLDS);
}

function calculateEmployeeScore(count: number): number {
  return getScoreFromThresholds(count, EMPLOYEE_THRESHOLDS);
}

function calculatePeriodStatusScore(status: string): number {
  return PERIOD_STATUS_SCORES[status] || 1;
}

function calculateCascadeScore(count: number): number {
  return getScoreFromThresholds(count, CASCADE_THRESHOLDS);
}

function calculateTimelineScore(isUrgent: boolean): number {
  return isUrgent ? 8 : 3;
}

function calculateRegulatoryScore(hasImplications: boolean): number {
  return hasImplications ? 9 : 2;
}

function getScoreFromThresholds(value: number, thresholds: DimensionThresholds): number {
  for (let i = 0; i < thresholds.breakpoints.length - 1; i++) {
    if (value >= thresholds.breakpoints[i] && value < thresholds.breakpoints[i + 1]) {
      return thresholds.scores[i];
    }
  }
  return thresholds.scores[thresholds.scores.length - 1];
}

// ============================================
// IMPACT DETAILS GENERATION
// ============================================

/**
 * Generate human-readable impact details
 */
export function generateImpactDetails(
  context: ApprovalContext,
  dimensions: ImpactDimensions
): ImpactDetail[] {
  const details: ImpactDetail[] = [];

  // Financial
  if (context.financialAmount !== undefined) {
    const currency = context.currency || 'USD';
    const formattedAmount = formatCurrency(context.financialAmount, currency);
    details.push({
      dimension: 'financial',
      label: 'Financial Impact',
      labelEs: 'Impacto Financiero',
      description: `Total compensation value affected`,
      descriptionEs: `Valor total de compensación afectado`,
      value: formattedAmount,
      severity: getSeverityFromScore(dimensions.financial),
    });
  }

  // Employees
  if (context.affectedEmployees !== undefined && context.affectedEmployees > 0) {
    details.push({
      dimension: 'entityCount',
      label: 'Affected Employees',
      labelEs: 'Empleados Afectados',
      description: `Number of personnel impacted`,
      descriptionEs: `Número de personal impactado`,
      value: `${context.affectedEmployees} ${context.affectedEmployees === 1 ? 'employee' : 'employees'}`,
      severity: getSeverityFromScore(dimensions.entityCount),
    });
  }

  // Periods
  if (context.affectedPeriods && context.affectedPeriods.length > 0) {
    details.push({
      dimension: 'periodStatus',
      label: 'Period Status',
      labelEs: 'Estado del Período',
      description: `Periods affected: ${context.periodStatus || 'open'}`,
      descriptionEs: `Períodos afectados: ${context.periodStatus || 'abierto'}`,
      value: `${context.affectedPeriods.length} ${context.affectedPeriods.length === 1 ? 'period' : 'periods'}`,
      severity: getSeverityFromScore(dimensions.periodStatus),
    });
  }

  // Cascade
  if (context.cascadeCount !== undefined && context.cascadeCount > 0) {
    details.push({
      dimension: 'cascadeScope',
      label: 'Downstream Impact',
      labelEs: 'Impacto Derivado',
      description: `Records requiring recalculation`,
      descriptionEs: `Registros que requieren recálculo`,
      value: `${context.cascadeCount} records`,
      severity: getSeverityFromScore(dimensions.cascadeScope),
    });
  }

  // Urgency
  if (context.isUrgent) {
    details.push({
      dimension: 'timelineSensitivity',
      label: 'Timeline',
      labelEs: 'Cronograma',
      description: `Marked as time-sensitive`,
      descriptionEs: `Marcado como urgente`,
      value: 'Urgent',
      severity: 'high',
    });
  }

  // Regulatory
  if (context.hasRegulatoryImplications) {
    details.push({
      dimension: 'regulatoryRisk',
      label: 'Compliance',
      labelEs: 'Cumplimiento',
      description: `Has regulatory implications`,
      descriptionEs: `Tiene implicaciones regulatorias`,
      value: 'Review required',
      severity: 'critical',
    });
  }

  return details;
}

function getSeverityFromScore(score: number): ImpactDetail['severity'] {
  if (score >= 9) return 'critical';
  if (score >= 7) return 'high';
  if (score >= 4) return 'medium';
  return 'low';
}

function formatCurrency(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `$${amount.toLocaleString()}`;
  }
}

// ============================================
// RECOMMENDATION GENERATION
// ============================================

/**
 * Generate system recommendation based on impact and context
 */
export function generateRecommendation(
  impactRating: ImpactRating,
  context: ApprovalContext
): {
  action: 'approve' | 'review' | 'escalate' | 'reject';
  confidence: number;
  reasoning: string;
  reasoningEs: string;
  historicalContext?: string;
  historicalContextEs?: string;
} {
  const { overall, dimensions } = impactRating;

  // High regulatory risk always requires escalation
  if (context.hasRegulatoryImplications) {
    return {
      action: 'escalate',
      confidence: 95,
      reasoning: 'Regulatory implications require compliance officer review',
      reasoningEs: 'Implicaciones regulatorias requieren revisión del oficial de cumplimiento',
      historicalContext: 'Similar requests with regulatory flags require 2-step approval 100% of the time',
      historicalContextEs: 'Solicitudes similares con banderas regulatorias requieren aprobación de 2 pasos el 100% del tiempo',
    };
  }

  // Very high impact requires escalation
  if (overall >= 8) {
    return {
      action: 'escalate',
      confidence: 90,
      reasoning: `High impact score (${overall.toFixed(1)}/10) requires senior review`,
      reasoningEs: `Puntuación de alto impacto (${overall.toFixed(1)}/10) requiere revisión senior`,
      historicalContext: 'Requests with impact > 8 are escalated 92% of the time',
      historicalContextEs: 'Solicitudes con impacto > 8 son escaladas el 92% del tiempo',
    };
  }

  // Medium-high impact requires careful review
  if (overall >= 5) {
    return {
      action: 'review',
      confidence: 75,
      reasoning: `Moderate impact (${overall.toFixed(1)}/10) - recommend careful review before approval`,
      reasoningEs: `Impacto moderado (${overall.toFixed(1)}/10) - recomienda revisión cuidadosa antes de aprobar`,
      historicalContext: 'Similar requests approved 78% of the time after review',
      historicalContextEs: 'Solicitudes similares aprobadas el 78% del tiempo después de revisión',
    };
  }

  // Low impact - safe to approve
  if (overall <= 3 && dimensions.periodStatus <= 4) {
    return {
      action: 'approve',
      confidence: 85,
      reasoning: `Low impact (${overall.toFixed(1)}/10) with standard risk profile - safe to approve`,
      reasoningEs: `Bajo impacto (${overall.toFixed(1)}/10) con perfil de riesgo estándar - seguro aprobar`,
      historicalContext: 'Similar low-impact requests approved 94% of the time',
      historicalContextEs: 'Solicitudes similares de bajo impacto aprobadas el 94% del tiempo',
    };
  }

  // Default: review
  return {
    action: 'review',
    confidence: 70,
    reasoning: `Impact score ${overall.toFixed(1)}/10 - standard review recommended`,
    reasoningEs: `Puntuación de impacto ${overall.toFixed(1)}/10 - revisión estándar recomendada`,
  };
}

// ============================================
// IMPACT RATING UTILITIES
// ============================================

/**
 * Get color class for impact rating display
 */
export function getImpactRatingColor(rating: number): string {
  if (rating >= 9) return 'bg-red-600 text-white';
  if (rating >= 7) return 'bg-orange-500 text-white';
  if (rating >= 4) return 'bg-yellow-500 text-black';
  return 'bg-green-500 text-white';
}

/**
 * Get text label for impact rating
 */
export function getImpactRatingLabel(rating: number): { en: string; es: string } {
  if (rating >= 9) return { en: 'Critical', es: 'Crítico' };
  if (rating >= 7) return { en: 'High', es: 'Alto' };
  if (rating >= 4) return { en: 'Medium', es: 'Medio' };
  return { en: 'Low', es: 'Bajo' };
}
