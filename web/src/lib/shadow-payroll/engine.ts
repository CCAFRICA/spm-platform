/**
 * Shadow Payroll Engine
 *
 * Parallel calculation and shadow payroll comparison logic.
 */

import type {
  CalculationScenario,
  ScenarioResults,
  ScenarioSummary,
  EmployeeScenarioResult,
  PayoutBreakdown,
  ComponentDifference,
  ComparisonResults,
  ToleranceBreach,
  ScenarioValidation,
  ValidationCheck,
  ShadowComparison,
  EmployeeShadowComparison,
  CutoverReadiness,
  CutoverCriterion,
} from '@/types/shadow-payroll';

// ============================================
// SCENARIO EXECUTION
// ============================================

interface EmployeePayoutData {
  entityId: string;
  entityName?: string;
  commission: number;
  bonus: number;
  spiff: number;
  accelerator: number;
  adjustment: number;
  clawback: number;
}

/**
 * Calculate payout breakdown from employee data
 */
function calculateBreakdown(data: EmployeePayoutData): PayoutBreakdown {
  return {
    commission: data.commission,
    bonus: data.bonus,
    spiff: data.spiff,
    accelerator: data.accelerator,
    adjustment: data.adjustment,
    clawback: data.clawback,
    total:
      data.commission +
      data.bonus +
      data.spiff +
      data.accelerator +
      data.adjustment +
      data.clawback,
  };
}

/**
 * Compare two scenarios and generate results
 */
export function compareScenarios(
  baseData: EmployeePayoutData[],
  scenarioData: EmployeePayoutData[],
  tolerancePercentage: number = 1,
  toleranceAbsolute: number = 10
): ScenarioResults {
  const employeeResults: EmployeeScenarioResult[] = [];
  const toleranceBreaches: ToleranceBreach[] = [];

  // Create lookup for scenario data
  const scenarioMap = new Map(scenarioData.map((d) => [d.entityId, d]));
  const baseMap = new Map(baseData.map((d) => [d.entityId, d]));

  // All unique employee IDs
  const allEmployeeIds = Array.from(new Set([
    ...baseData.map((d) => d.entityId),
    ...scenarioData.map((d) => d.entityId),
  ]));

  let totalBasePayout = 0;
  let totalScenarioPayout = 0;
  let increased = 0;
  let decreased = 0;
  let unchanged = 0;
  let newPayouts = 0;
  let removedPayouts = 0;

  for (const entityId of allEmployeeIds) {
    const base = baseMap.get(entityId);
    const scenario = scenarioMap.get(entityId);

    const baseBreakdown = base
      ? calculateBreakdown(base)
      : { commission: 0, bonus: 0, spiff: 0, accelerator: 0, adjustment: 0, clawback: 0, total: 0 };
    const scenarioBreakdown = scenario
      ? calculateBreakdown(scenario)
      : { commission: 0, bonus: 0, spiff: 0, accelerator: 0, adjustment: 0, clawback: 0, total: 0 };

    const basePayout = baseBreakdown.total;
    const scenarioPayout = scenarioBreakdown.total;
    const difference = scenarioPayout - basePayout;
    const percentageDifference = basePayout !== 0 ? (difference / basePayout) * 100 : scenarioPayout !== 0 ? 100 : 0;

    totalBasePayout += basePayout;
    totalScenarioPayout += scenarioPayout;

    // Determine impact
    let impact: 'positive' | 'negative' | 'neutral';
    if (difference > toleranceAbsolute) {
      impact = 'positive';
      increased++;
    } else if (difference < -toleranceAbsolute) {
      impact = 'negative';
      decreased++;
    } else {
      impact = 'neutral';
      unchanged++;
    }

    if (!base && scenario) newPayouts++;
    if (base && !scenario) removedPayouts++;

    // Calculate component differences
    const componentDifferences: ComponentDifference[] = [];
    const components = ['commission', 'bonus', 'spiff', 'accelerator', 'adjustment', 'clawback'] as const;

    for (const component of components) {
      const baseAmount = baseBreakdown[component];
      const scenarioAmount = scenarioBreakdown[component];
      const compDiff = scenarioAmount - baseAmount;

      if (Math.abs(compDiff) > 0.01) {
        componentDifferences.push({
          component,
          componentType: component,
          baseAmount,
          scenarioAmount,
          difference: compDiff,
        });

        // Check tolerance breach
        const percentBreached = Math.abs(compDiff / (baseAmount || 1)) * 100 > tolerancePercentage;
        const absoluteBreached = Math.abs(compDiff) > toleranceAbsolute;

        if (percentBreached || absoluteBreached) {
          toleranceBreaches.push({
            entityId,
            entityName: base?.entityName || scenario?.entityName,
            component,
            baseAmount,
            scenarioAmount,
            variance: compDiff,
            variancePercentage: (compDiff / (baseAmount || 1)) * 100,
            breachType: percentBreached && absoluteBreached ? 'both' : percentBreached ? 'percentage' : 'absolute',
          });
        }
      }
    }

    // Calculate confidence
    const warnings: string[] = [];
    let confidence = 100;

    if (!base) {
      warnings.push('No base calculation found');
      confidence -= 20;
    }
    if (!scenario) {
      warnings.push('No scenario calculation found');
      confidence -= 20;
    }
    if (Math.abs(percentageDifference) > 50) {
      warnings.push('Large variance detected');
      confidence -= 15;
    }
    if (componentDifferences.length > 3) {
      warnings.push('Multiple components affected');
      confidence -= 10;
    }

    employeeResults.push({
      entityId,
      entityName: base?.entityName || scenario?.entityName,
      basePayout,
      baseBreakdown,
      scenarioPayout,
      scenarioBreakdown,
      difference,
      percentageDifference: Math.round(percentageDifference * 100) / 100,
      impact,
      componentDifferences,
      appliedModifications: [],
      confidence: Math.max(0, confidence),
      warnings,
    });
  }

  // Generate summary
  const totalDifference = totalScenarioPayout - totalBasePayout;
  const percentageDiff = totalBasePayout !== 0 ? (totalDifference / totalBasePayout) * 100 : 0;

  const impacts = employeeResults.map((r) => r.difference);
  const sortedImpacts = [...impacts].sort((a, b) => a - b);

  const summary: ScenarioSummary = {
    entitiesProcessed: employeeResults.length,
    totalBasePayout,
    totalScenarioPayout,
    totalDifference,
    percentageDifference: Math.round(percentageDiff * 100) / 100,
    byType: {
      increased,
      decreased,
      unchanged,
      newPayouts,
      removedPayouts,
    },
    averageImpact: impacts.length > 0 ? impacts.reduce((a, b) => a + b, 0) / impacts.length : 0,
    medianImpact: sortedImpacts.length > 0 ? sortedImpacts[Math.floor(sortedImpacts.length / 2)] : 0,
    maxPositiveImpact: Math.max(0, ...impacts),
    maxNegativeImpact: Math.min(0, ...impacts),
  };

  // Generate comparison results
  const componentCategories = ['commission', 'bonus', 'spiff', 'accelerator', 'adjustment', 'clawback'] as const;
  const comparison: ComparisonResults = {
    matchedCount: employeeResults.filter((r) => r.basePayout > 0 && r.scenarioPayout > 0).length,
    unmatchedCount: newPayouts + removedPayouts,
    discrepancyCount: toleranceBreaches.length,
    totalBase: totalBasePayout,
    totalScenario: totalScenarioPayout,
    totalVariance: totalDifference,
    variancePercentage: percentageDiff,
    withinTolerance: employeeResults.filter(
      (r) => Math.abs(r.percentageDifference) <= tolerancePercentage && Math.abs(r.difference) <= toleranceAbsolute
    ).length,
    outsideTolerance: toleranceBreaches.length,
    toleranceBreaches,
    byCategory: componentCategories.map((cat) => ({
      category: cat,
      baseAmount: employeeResults.reduce((sum, r) => sum + r.baseBreakdown[cat], 0),
      scenarioAmount: employeeResults.reduce((sum, r) => sum + r.scenarioBreakdown[cat], 0),
      variance: employeeResults.reduce((sum, r) => sum + r.scenarioBreakdown[cat] - r.baseBreakdown[cat], 0),
    })),
  };

  // Generate validation
  const validation = validateScenarioResults(summary, comparison, employeeResults);

  return {
    summary,
    employeeResults,
    comparison,
    validation,
  };
}

// ============================================
// VALIDATION
// ============================================

/**
 * Validate scenario results
 */
function validateScenarioResults(
  summary: ScenarioSummary,
  comparison: ComparisonResults,
  employeeResults: EmployeeScenarioResult[]
): ScenarioValidation {
  const checks: ValidationCheck[] = [];
  const errors: { code: string; message: string; severity: 'error' | 'warning'; affectedEmployees?: string[]; suggestedAction?: string }[] = [];
  const warnings: { code: string; message: string; severity: 'error' | 'warning'; affectedEmployees?: string[]; suggestedAction?: string }[] = [];

  // Check 1: Total variance threshold
  const varianceCheck: ValidationCheck = {
    name: 'Total Variance Check',
    description: 'Verify total variance is within acceptable limits',
    status: 'passed',
  };

  if (Math.abs(summary.percentageDifference) > 10) {
    varianceCheck.status = 'failed';
    varianceCheck.details = `Variance of ${summary.percentageDifference.toFixed(2)}% exceeds 10% threshold`;
    errors.push({
      code: 'VARIANCE_EXCEEDED',
      message: `Total variance of ${summary.percentageDifference.toFixed(2)}% exceeds threshold`,
      severity: 'error',
      suggestedAction: 'Review scenario parameters and investigate large variances',
    });
  } else if (Math.abs(summary.percentageDifference) > 5) {
    varianceCheck.status = 'warning';
    varianceCheck.details = `Variance of ${summary.percentageDifference.toFixed(2)}% is elevated`;
    warnings.push({
      code: 'VARIANCE_ELEVATED',
      message: `Total variance of ${summary.percentageDifference.toFixed(2)}% is above normal`,
      severity: 'warning',
    });
  }
  checks.push(varianceCheck);

  // Check 2: Individual tolerance breaches
  const toleranceCheck: ValidationCheck = {
    name: 'Individual Tolerance Check',
    description: 'Verify individual employee variances are within tolerance',
    status: 'passed',
  };

  if (comparison.outsideTolerance > summary.entitiesProcessed * 0.1) {
    toleranceCheck.status = 'failed';
    toleranceCheck.details = `${comparison.outsideTolerance} employees outside tolerance (>${10}% of total)`;
    errors.push({
      code: 'TOO_MANY_BREACHES',
      message: `${comparison.outsideTolerance} employees have tolerance breaches`,
      severity: 'error',
      affectedEmployees: comparison.toleranceBreaches.map((b) => b.entityId),
      suggestedAction: 'Investigate individual tolerance breaches',
    });
  } else if (comparison.outsideTolerance > 0) {
    toleranceCheck.status = 'warning';
    toleranceCheck.details = `${comparison.outsideTolerance} employees outside tolerance`;
    warnings.push({
      code: 'TOLERANCE_BREACHES',
      message: `${comparison.outsideTolerance} employees have tolerance breaches`,
      severity: 'warning',
      affectedEmployees: comparison.toleranceBreaches.map((b) => b.entityId),
    });
  }
  checks.push(toleranceCheck);

  // Check 3: Missing data
  const dataCheck: ValidationCheck = {
    name: 'Data Completeness Check',
    description: 'Verify all expected employees have calculations',
    status: 'passed',
  };

  const missingEmployees = employeeResults.filter((r) => r.basePayout === 0 && r.scenarioPayout === 0);
  if (missingEmployees.length > 0) {
    dataCheck.status = 'warning';
    dataCheck.details = `${missingEmployees.length} employees have no payout in either scenario`;
    warnings.push({
      code: 'MISSING_DATA',
      message: `${missingEmployees.length} employees have no calculations`,
      severity: 'warning',
      affectedEmployees: missingEmployees.map((e) => e.entityId),
    });
  }
  checks.push(dataCheck);

  // Check 4: Confidence level
  const confidenceCheck: ValidationCheck = {
    name: 'Confidence Level Check',
    description: 'Verify calculation confidence is acceptable',
    status: 'passed',
  };

  const avgConfidence = employeeResults.reduce((sum, r) => sum + r.confidence, 0) / employeeResults.length;
  if (avgConfidence < 70) {
    confidenceCheck.status = 'failed';
    confidenceCheck.details = `Average confidence ${avgConfidence.toFixed(1)}% is below 70%`;
    errors.push({
      code: 'LOW_CONFIDENCE',
      message: 'Average confidence level is too low',
      severity: 'error',
      suggestedAction: 'Review data quality and calculation parameters',
    });
  } else if (avgConfidence < 85) {
    confidenceCheck.status = 'warning';
    confidenceCheck.details = `Average confidence ${avgConfidence.toFixed(1)}% is below 85%`;
  }
  checks.push(confidenceCheck);

  // Calculate overall confidence
  const passedChecks = checks.filter((c) => c.status === 'passed').length;
  const overallConfidence = Math.round((passedChecks / checks.length) * avgConfidence);

  return {
    isValid: errors.length === 0,
    confidence: overallConfidence,
    checks,
    errors,
    warnings,
  };
}

// ============================================
// SHADOW PAYROLL COMPARISON
// ============================================

interface SystemPayrollData {
  entityId: string;
  entityName?: string;
  amount: number;
  components: Record<string, number>;
}

/**
 * Compare legacy and new system payroll runs
 */
export function compareShadowPayroll(
  legacyData: SystemPayrollData[],
  newData: SystemPayrollData[],
  tolerancePercentage: number = 1,
  toleranceAbsolute: number = 10
): ShadowComparison {
  const legacyMap = new Map(legacyData.map((d) => [d.entityId, d]));
  const newMap = new Map(newData.map((d) => [d.entityId, d]));

  const allEmployeeIds = Array.from(new Set([
    ...legacyData.map((d) => d.entityId),
    ...newData.map((d) => d.entityId),
  ]));

  const employeeComparisons: EmployeeShadowComparison[] = [];
  let exactMatches = 0;
  let withinTolerance = 0;
  let outsideTolerance = 0;
  let onlyInLegacy = 0;
  let onlyInNew = 0;

  let totalLegacy = 0;
  let totalNew = 0;

  for (const entityId of allEmployeeIds) {
    const legacy = legacyMap.get(entityId);
    const newRecord = newMap.get(entityId);

    const legacyAmount = legacy?.amount || 0;
    const newAmount = newRecord?.amount || 0;

    totalLegacy += legacyAmount;
    totalNew += newAmount;

    const variance = newAmount - legacyAmount;
    const variancePercentage = legacyAmount !== 0 ? (variance / legacyAmount) * 100 : newAmount !== 0 ? 100 : 0;

    // Determine status
    let status: EmployeeShadowComparison['status'];
    if (!legacy) {
      status = 'new_only';
      onlyInNew++;
    } else if (!newRecord) {
      status = 'legacy_only';
      onlyInLegacy++;
    } else if (variance === 0) {
      status = 'exact_match';
      exactMatches++;
    } else if (
      Math.abs(variancePercentage) <= tolerancePercentage &&
      Math.abs(variance) <= toleranceAbsolute
    ) {
      status = 'within_tolerance';
      withinTolerance++;
    } else {
      status = 'outside_tolerance';
      outsideTolerance++;
    }

    // Component comparison
    const allComponents = new Set([
      ...Object.keys(legacy?.components || {}),
      ...Object.keys(newRecord?.components || {}),
    ]);

    const componentComparisons = Array.from(allComponents).map((component) => {
      const legacyComp = legacy?.components[component] || 0;
      const newComp = newRecord?.components[component] || 0;
      const compVariance = newComp - legacyComp;
      const compWithinTolerance =
        Math.abs(compVariance) <= toleranceAbsolute ||
        (legacyComp !== 0 && Math.abs(compVariance / legacyComp) * 100 <= tolerancePercentage);

      return {
        component,
        legacyAmount: legacyComp,
        newAmount: newComp,
        variance: compVariance,
        withinTolerance: compWithinTolerance,
      };
    });

    employeeComparisons.push({
      entityId,
      entityName: legacy?.entityName || newRecord?.entityName,
      legacyAmount,
      newAmount,
      variance,
      variancePercentage: Math.round(variancePercentage * 100) / 100,
      status,
      componentComparisons,
      investigationRequired: status === 'outside_tolerance',
    });
  }

  const totalVariance = totalNew - totalLegacy;
  const totalVariancePercentage = totalLegacy !== 0 ? (totalVariance / totalLegacy) * 100 : 0;

  // Calculate overall confidence
  const matchRate = (exactMatches + withinTolerance) / employeeComparisons.length;
  const varianceScore = Math.max(0, 100 - Math.abs(totalVariancePercentage) * 10);
  const overallConfidence = Math.round((matchRate * 70 + varianceScore * 0.3));

  // Determine cutover readiness
  const readyForCutover =
    outsideTolerance === 0 &&
    onlyInLegacy === 0 &&
    Math.abs(totalVariancePercentage) < 0.5;

  return {
    totalLegacy,
    totalNew,
    variance: totalVariance,
    variancePercentage: Math.round(totalVariancePercentage * 100) / 100,
    exactMatches,
    withinTolerance,
    outsideTolerance,
    onlyInLegacy,
    onlyInNew,
    overallConfidence,
    readyForCutover,
    employeeComparisons,
  };
}

// ============================================
// CUTOVER READINESS
// ============================================

/**
 * Assess cutover readiness based on shadow comparison
 */
export function assessCutoverReadiness(
  comparison: ShadowComparison,
  periodId: string,
  userId: string
): CutoverReadiness {
  const criteria: CutoverCriterion[] = [];
  const recommendations: string[] = [];
  const blockers: string[] = [];

  // Criterion 1: Variance threshold
  const varianceCriterion: CutoverCriterion = {
    name: 'Total Variance',
    description: 'Overall variance between legacy and new system is within 0.5%',
    weight: 25,
    status: 'not_evaluated',
    score: 0,
  };

  if (Math.abs(comparison.variancePercentage) <= 0.5) {
    varianceCriterion.status = 'passed';
    varianceCriterion.score = 100;
  } else if (Math.abs(comparison.variancePercentage) <= 2) {
    varianceCriterion.status = 'warning';
    varianceCriterion.score = 70;
    varianceCriterion.details = `Variance is ${comparison.variancePercentage.toFixed(2)}%`;
    recommendations.push('Investigate root cause of variance before cutover');
  } else {
    varianceCriterion.status = 'failed';
    varianceCriterion.score = 0;
    varianceCriterion.details = `Variance of ${comparison.variancePercentage.toFixed(2)}% exceeds threshold`;
    blockers.push(`Total variance of ${comparison.variancePercentage.toFixed(2)}% must be reduced`);
  }
  criteria.push(varianceCriterion);

  // Criterion 2: Individual matches
  const matchCriterion: CutoverCriterion = {
    name: 'Individual Match Rate',
    description: 'At least 95% of employees have matching or within-tolerance payouts',
    weight: 25,
    status: 'not_evaluated',
    score: 0,
  };

  const matchRate =
    (comparison.exactMatches + comparison.withinTolerance) /
    comparison.employeeComparisons.length;

  if (matchRate >= 0.95) {
    matchCriterion.status = 'passed';
    matchCriterion.score = 100;
  } else if (matchRate >= 0.9) {
    matchCriterion.status = 'warning';
    matchCriterion.score = 80;
    matchCriterion.details = `Match rate is ${(matchRate * 100).toFixed(1)}%`;
    recommendations.push('Review employees outside tolerance before cutover');
  } else {
    matchCriterion.status = 'failed';
    matchCriterion.score = matchRate * 100;
    matchCriterion.details = `Match rate of ${(matchRate * 100).toFixed(1)}% is below 90%`;
    blockers.push(`Match rate must be improved from ${(matchRate * 100).toFixed(1)}%`);
  }
  criteria.push(matchCriterion);

  // Criterion 3: No legacy-only records
  const legacyCriterion: CutoverCriterion = {
    name: 'Legacy Coverage',
    description: 'All legacy employees are present in new system',
    weight: 25,
    status: 'not_evaluated',
    score: 0,
  };

  if (comparison.onlyInLegacy === 0) {
    legacyCriterion.status = 'passed';
    legacyCriterion.score = 100;
  } else {
    legacyCriterion.status = 'failed';
    legacyCriterion.score = 0;
    legacyCriterion.details = `${comparison.onlyInLegacy} employees only in legacy system`;
    blockers.push(`${comparison.onlyInLegacy} employees missing from new system`);
  }
  criteria.push(legacyCriterion);

  // Criterion 4: Investigation complete
  const investigationCriterion: CutoverCriterion = {
    name: 'Investigation Complete',
    description: 'All tolerance breaches have been investigated',
    weight: 25,
    status: 'not_evaluated',
    score: 0,
  };

  const investigatedCount = comparison.employeeComparisons.filter(
    (e) => e.investigationRequired && e.investigatedAt
  ).length;
  const requiresInvestigation = comparison.employeeComparisons.filter(
    (e) => e.investigationRequired
  ).length;

  if (requiresInvestigation === 0) {
    investigationCriterion.status = 'passed';
    investigationCriterion.score = 100;
  } else if (investigatedCount === requiresInvestigation) {
    investigationCriterion.status = 'passed';
    investigationCriterion.score = 100;
    investigationCriterion.details = `All ${requiresInvestigation} breaches investigated`;
  } else {
    investigationCriterion.status = 'failed';
    investigationCriterion.score = (investigatedCount / requiresInvestigation) * 100;
    investigationCriterion.details = `${investigatedCount}/${requiresInvestigation} investigations complete`;
    blockers.push(`${requiresInvestigation - investigatedCount} tolerance breaches need investigation`);
  }
  criteria.push(investigationCriterion);

  // Calculate overall score
  const totalWeight = criteria.reduce((sum, c) => sum + c.weight, 0);
  const weightedScore = criteria.reduce((sum, c) => sum + c.score * c.weight, 0) / totalWeight;

  const isReady = blockers.length === 0 && weightedScore >= 90;

  if (!isReady && recommendations.length === 0) {
    recommendations.push('Address all blockers before proceeding with cutover');
  }

  return {
    periodId,
    assessedAt: new Date().toISOString(),
    assessedBy: userId,
    isReady,
    confidenceScore: Math.round(weightedScore),
    criteria,
    recommendations,
    blockers,
  };
}

// ============================================
// WHAT-IF ANALYSIS
// ============================================

/**
 * Apply modifications to base data for what-if analysis
 */
export function applyScenarioModifications(
  baseData: EmployeePayoutData[],
  modifications: Array<{
    type: 'rate_change' | 'quota_change' | 'multiplier';
    target?: string;
    component?: string;
    factor: number;
  }>
): EmployeePayoutData[] {
  return baseData.map((employee) => {
    const modified = { ...employee };

    for (const mod of modifications) {
      // Check if modification applies to this employee
      if (mod.target && mod.target !== employee.entityId) {
        continue;
      }

      switch (mod.type) {
        case 'rate_change':
          if (mod.component) {
            const numericFields = ['commission', 'bonus', 'spiff', 'accelerator', 'adjustment', 'clawback'] as const;
            type NumericField = typeof numericFields[number];
            if (numericFields.includes(mod.component as NumericField)) {
              modified[mod.component as NumericField] *= mod.factor;
            }
          }
          break;

        case 'multiplier':
          // Apply multiplier to all components
          modified.commission *= mod.factor;
          modified.bonus *= mod.factor;
          modified.spiff *= mod.factor;
          break;

        case 'quota_change':
          // Quota changes affect commission proportionally
          modified.commission *= mod.factor;
          break;
      }
    }

    return modified;
  });
}

/**
 * Run what-if scenario analysis
 */
export function runWhatIfScenario(
  scenario: CalculationScenario,
  baseData: EmployeePayoutData[]
): ScenarioResults {
  const modifications = (scenario.parameters.modifications || []).map((m) => ({
    type: m.type as 'rate_change' | 'quota_change' | 'multiplier',
    target: m.target,
    component: m.field,
    factor: typeof m.newValue === 'number' && typeof m.oldValue === 'number'
      ? m.newValue / m.oldValue
      : 1,
  }));

  const modifiedData = applyScenarioModifications(baseData, modifications);

  return compareScenarios(baseData, modifiedData);
}
