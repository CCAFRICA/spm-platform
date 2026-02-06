/**
 * Quality Score Service
 *
 * Calculates and manages data quality scores.
 */

import type {
  QualityScore,
  QualityDimension,
  QualityTrendPoint,
  QualityIssue,
  DataSourceHealth,
  DataSource,
} from '@/types/data-quality';
import { getPendingItems, getQuarantineStats } from './quarantine-service';

// ============================================
// QUALITY SCORE CALCULATION
// ============================================

/**
 * Calculate overall quality score for a tenant
 */
export function calculateQualityScore(tenantId: string): QualityScore {
  const stats = getQuarantineStats(tenantId);
  const pendingItems = getPendingItems(tenantId);

  // Base score: 100
  let score = 100;

  // Deductions based on severity
  score -= stats.bySeverity.critical * 5; // -5 per critical
  score -= stats.bySeverity.warning * 2; // -2 per warning
  score -= stats.bySeverity.info * 1; // -1 per info

  // Ensure score is between 0 and 100
  score = Math.max(0, Math.min(100, score));

  // Calculate dimensions
  const dimensions = {
    completeness: calculateCompletenessScore(pendingItems),
    accuracy: calculateAccuracyScore(pendingItems, stats),
    timeliness: calculateTimelinessScore(),
    consistency: calculateConsistencyScore(pendingItems, stats),
    validity: calculateValidityScore(pendingItems, stats),
  };

  // Generate trend (last 7 days)
  const trend = generateTrend(score);

  // Get impacting issues
  const impactingIssues = getImpactingIssues(stats, pendingItems);

  // Determine status
  const status =
    score >= 90 ? 'excellent' : score >= 75 ? 'good' : score >= 50 ? 'fair' : 'poor';

  return {
    overall: Math.round(score),
    status,
    dimensions,
    trend,
    impactingIssues,
    lastUpdated: new Date().toISOString(),
  };
}

// ============================================
// DIMENSION CALCULATIONS
// ============================================

function calculateCompletenessScore(
  pendingItems: { errorType: string }[]
): QualityDimension {
  const missingFieldCount = pendingItems.filter(
    (i) => i.errorType === 'missing_field'
  ).length;

  // Start at 100, deduct for missing fields
  let score = 100 - missingFieldCount * 8;
  score = Math.max(0, Math.min(100, score));

  return {
    name: 'Completeness',
    nameEs: 'Completitud',
    score: Math.round(score),
    description: 'All required fields are present',
    descriptionEs: 'Todos los campos requeridos están presentes',
  };
}

function calculateAccuracyScore(
  pendingItems: { errorType: string }[],
  stats: { byErrorType: { anomaly: number; invalid_format: number } }
): QualityDimension {
  const anomalyCount = stats.byErrorType.anomaly;
  const invalidFormatCount = stats.byErrorType.invalid_format;

  let score = 100 - anomalyCount * 5 - invalidFormatCount * 3;
  score = Math.max(0, Math.min(100, score));

  return {
    name: 'Accuracy',
    nameEs: 'Precisión',
    score: Math.round(score),
    description: 'Data values are correct and realistic',
    descriptionEs: 'Los valores de datos son correctos y realistas',
  };
}

function calculateTimelinessScore(): QualityDimension {
  // Mock: In real implementation, would check data freshness
  const score = 95;

  return {
    name: 'Timeliness',
    nameEs: 'Oportunidad',
    score,
    description: 'Data is up-to-date and current',
    descriptionEs: 'Los datos están actualizados y son recientes',
  };
}

function calculateConsistencyScore(
  pendingItems: { errorType: string }[],
  stats: { byErrorType: { duplicate: number; referential: number } }
): QualityDimension {
  const duplicateCount = stats.byErrorType.duplicate;
  const referentialCount = stats.byErrorType.referential;

  let score = 100 - duplicateCount * 4 - referentialCount * 6;
  score = Math.max(0, Math.min(100, score));

  return {
    name: 'Consistency',
    nameEs: 'Consistencia',
    score: Math.round(score),
    description: 'Data is uniform and without duplicates',
    descriptionEs: 'Los datos son uniformes y sin duplicados',
  };
}

function calculateValidityScore(
  pendingItems: { errorType: string }[],
  stats: { byErrorType: { business_rule: number; invalid_format: number } }
): QualityDimension {
  const businessRuleCount = stats.byErrorType.business_rule;
  const invalidFormatCount = stats.byErrorType.invalid_format;

  let score = 100 - businessRuleCount * 5 - invalidFormatCount * 4;
  score = Math.max(0, Math.min(100, score));

  return {
    name: 'Validity',
    nameEs: 'Validez',
    score: Math.round(score),
    description: 'Data conforms to business rules',
    descriptionEs: 'Los datos cumplen con las reglas de negocio',
  };
}

// ============================================
// TREND GENERATION
// ============================================

function generateTrend(currentScore: number): QualityTrendPoint[] {
  const trend: QualityTrendPoint[] = [];
  const today = new Date();

  // Generate 7 days of trend data with slight variations
  for (let i = 6; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);

    // Add some random variation to simulate historical data
    const variation = Math.random() * 10 - 5; // -5 to +5
    let historicalScore = currentScore + variation + (i * 0.5); // Slight improvement trend
    historicalScore = Math.max(0, Math.min(100, historicalScore));

    trend.push({
      date: date.toISOString().split('T')[0],
      score: Math.round(historicalScore),
    });
  }

  // Ensure the last point matches current score
  trend[trend.length - 1].score = currentScore;

  return trend;
}

// ============================================
// IMPACTING ISSUES
// ============================================

function getImpactingIssues(
  stats: {
    bySeverity: { critical: number; warning: number };
    byErrorType: Record<string, number>;
  },
  pendingItems: { errorType: string; severity: string }[]
): QualityIssue[] {
  const issues: QualityIssue[] = [];

  // Missing fields
  const missingFieldCount = stats.byErrorType.missing_field || 0;
  if (missingFieldCount > 0) {
    const criticalMissing = pendingItems.filter(
      (i) => i.errorType === 'missing_field' && i.severity === 'critical'
    ).length;
    issues.push({
      issue: 'Missing required fields',
      issueEs: 'Campos requeridos faltantes',
      impact: criticalMissing * 5 + (missingFieldCount - criticalMissing) * 2,
      count: missingFieldCount,
      severity: criticalMissing > 0 ? 'critical' : 'warning',
    });
  }

  // Duplicates
  const duplicateCount = stats.byErrorType.duplicate || 0;
  if (duplicateCount > 0) {
    issues.push({
      issue: 'Duplicate records',
      issueEs: 'Registros duplicados',
      impact: duplicateCount * 4,
      count: duplicateCount,
      severity: 'warning',
    });
  }

  // Anomalies
  const anomalyCount = stats.byErrorType.anomaly || 0;
  if (anomalyCount > 0) {
    issues.push({
      issue: 'Data anomalies',
      issueEs: 'Anomalías de datos',
      impact: anomalyCount * 5,
      count: anomalyCount,
      severity: 'warning',
    });
  }

  // Invalid formats
  const invalidFormatCount = stats.byErrorType.invalid_format || 0;
  if (invalidFormatCount > 0) {
    issues.push({
      issue: 'Invalid data formats',
      issueEs: 'Formatos de datos inválidos',
      impact: invalidFormatCount * 3,
      count: invalidFormatCount,
      severity: 'warning',
    });
  }

  // Sort by impact
  return issues.sort((a, b) => b.impact - a.impact);
}

// ============================================
// DATA SOURCE HEALTH
// ============================================

/**
 * Get health status for all data sources
 */
export function getDataSourceHealth(tenantId: string): DataSourceHealth[] {
  const stats = getQuarantineStats(tenantId);

  const sources: DataSource[] = ['POS', 'Inventory', 'HR', 'Manual', 'Import'];
  const sourceNames: Record<DataSource, { name: string; nameEs: string }> = {
    POS: { name: 'Point of Sale', nameEs: 'Punto de Venta' },
    Inventory: { name: 'Inventory', nameEs: 'Inventario' },
    HR: { name: 'Human Resources', nameEs: 'Recursos Humanos' },
    Manual: { name: 'Manual Entry', nameEs: 'Entrada Manual' },
    Import: { name: 'Data Import', nameEs: 'Importación' },
  };

  // Mock record counts
  const recordCounts: Record<DataSource, number> = {
    POS: 15420,
    Inventory: 2850,
    HR: 125,
    Manual: 340,
    Import: 5200,
  };

  const now = new Date();
  const lastHour = new Date(now.getTime() - 60 * 60 * 1000);
  const nextHour = new Date(now.getTime() + 60 * 60 * 1000);

  return sources.map((source) => {
    const errorCount = stats.bySource[source] || 0;
    const recordCount = recordCounts[source];
    const errorRate = recordCount > 0 ? (errorCount / recordCount) * 100 : 0;

    let status: 'healthy' | 'warning' | 'error' = 'healthy';
    if (errorRate > 1) status = 'error';
    else if (errorRate > 0.1) status = 'warning';

    return {
      source,
      sourceName: sourceNames[source].name,
      sourceNameEs: sourceNames[source].nameEs,
      status,
      lastSync: lastHour.toISOString(),
      nextSync: nextHour.toISOString(),
      recordCount,
      errorCount,
      errorRate: Math.round(errorRate * 100) / 100,
    };
  });
}

/**
 * Get quality status label
 */
export function getQualityStatusLabel(
  status: 'excellent' | 'good' | 'fair' | 'poor',
  isSpanish: boolean
): string {
  const labels = {
    excellent: { en: 'Excellent', es: 'Excelente' },
    good: { en: 'Good', es: 'Bueno' },
    fair: { en: 'Fair', es: 'Regular' },
    poor: { en: 'Poor', es: 'Deficiente' },
  };

  return isSpanish ? labels[status].es : labels[status].en;
}

/**
 * Get quality status color
 */
export function getQualityStatusColor(
  status: 'excellent' | 'good' | 'fair' | 'poor'
): string {
  const colors = {
    excellent: 'text-green-600',
    good: 'text-blue-600',
    fair: 'text-amber-600',
    poor: 'text-red-600',
  };

  return colors[status];
}
