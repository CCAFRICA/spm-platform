/**
 * Compensation Calculation Engine
 *
 * Calculates incentives based on plan configuration
 */

import type {
  CompensationPlanConfig,
  AdditiveLookupConfig,
  WeightedKPIConfig,
  CalculationResult,
  CalculationStep,
  PlanComponent,
  Band,
  Tier,
} from '@/types/compensation-plan';
import { getActivePlan, getPlan } from './plan-storage';

// ============================================
// METRICS INTERFACE
// ============================================

export interface EmployeeMetrics {
  employeeId: string;
  employeeName: string;
  employeeRole: string;
  storeId?: string;
  storeName?: string;
  isCertified?: boolean;
  period: string;
  periodStart: string;
  periodEnd: string;
  metrics: Record<string, number>;
}

// ============================================
// OB-27B: WARNING SUMMARY SYSTEM
// Prevents console flood by collecting warnings and logging summaries
// ============================================

interface WarningCounts {
  counts: Map<string, number>;
  totalEmployees: number;
  runId: string;
}

let currentWarnings: WarningCounts | null = null;

/**
 * Start a new calculation run - resets warning counters
 */
export function startCalculationRun(): void {
  currentWarnings = {
    counts: new Map(),
    totalEmployees: 0,
    runId: `run-${Date.now()}`,
  };
}

/**
 * Record a warning (increments counter instead of logging)
 */
function recordWarning(key: string): void {
  if (!currentWarnings) {
    // Fallback: log directly if no run started
    console.warn(`[CalcEngine] ${key}`);
    return;
  }
  currentWarnings.counts.set(key, (currentWarnings.counts.get(key) || 0) + 1);
}

/**
 * End calculation run and log warning summary (max 10 lines)
 */
export function endCalculationRun(totalEmployees: number): void {
  if (!currentWarnings) return;

  currentWarnings.totalEmployees = totalEmployees;

  if (currentWarnings.counts.size === 0) {
    console.log(`[CalcEngine] Calculation complete: ${totalEmployees} employees, no warnings`);
    currentWarnings = null;
    return;
  }

  console.log(`[CalcEngine] Calculation complete: ${totalEmployees} employees, ${currentWarnings.counts.size} warning types`);

  // Sort by count descending, limit to 10
  const sorted = Array.from(currentWarnings.counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  for (const [key, count] of sorted) {
    const pct = Math.round((count / totalEmployees) * 100);
    console.warn(`[CalcEngine] ${key}: ${count}/${totalEmployees} employees (${pct}%)`);
  }

  if (currentWarnings.counts.size > 10) {
    console.warn(`[CalcEngine] ... and ${currentWarnings.counts.size - 10} more warning types`);
  }

  currentWarnings = null;
}

// ============================================
// MAIN CALCULATION FUNCTION
// ============================================

export function calculateIncentive(
  employeeMetrics: EmployeeMetrics,
  tenantId: string,
  planIdOverride?: string
): CalculationResult | null {
  // Get plan - either by override or active for role
  const plan = planIdOverride
    ? getPlan(planIdOverride)
    : getActivePlan(tenantId, employeeMetrics.employeeRole);

  if (!plan) {
    console.warn('No active plan found for', employeeMetrics.employeeRole);
    return null;
  }

  // Calculate based on plan type
  if (plan.configuration.type === 'additive_lookup') {
    return calculateAdditiveLookup(employeeMetrics, plan);
  } else {
    return calculateWeightedKPI(employeeMetrics, plan);
  }
}

// ============================================
// ADDITIVE LOOKUP CALCULATION
// ============================================

function calculateAdditiveLookup(
  employeeMetrics: EmployeeMetrics,
  plan: CompensationPlanConfig
): CalculationResult {
  const config = plan.configuration as AdditiveLookupConfig;
  const warnings: string[] = [];

  // Find matching variant based on eligibility criteria
  const variant = findMatchingVariant(config, employeeMetrics);
  if (!variant) {
    warnings.push('No matching plan variant found, using first variant');
  }
  const selectedVariant = variant || config.variants[0];

  const components: CalculationStep[] = [];
  let totalIncentive = 0;

  // Determine currency from first component with a config
  let currency = 'USD';
  const firstComponent = selectedVariant.components.find((c) => c.enabled);
  if (firstComponent) {
    currency =
      firstComponent.matrixConfig?.currency ||
      firstComponent.tierConfig?.currency ||
      'USD';
  }

  // Process each enabled component
  selectedVariant.components
    .filter((c) => c.enabled)
    .sort((a, b) => a.order - b.order)
    .forEach((component) => {
      const step = calculateComponent(component, employeeMetrics);
      components.push(step);
      totalIncentive += step.outputValue;
    });

  return {
    employeeId: employeeMetrics.employeeId,
    employeeName: employeeMetrics.employeeName,
    employeeRole: employeeMetrics.employeeRole,
    storeId: employeeMetrics.storeId,
    storeName: employeeMetrics.storeName,
    planId: plan.id,
    planName: plan.name,
    planVersion: plan.version,
    planType: plan.planType,
    variantId: selectedVariant.variantId,
    variantName: selectedVariant.variantName,
    period: employeeMetrics.period,
    periodStart: employeeMetrics.periodStart,
    periodEnd: employeeMetrics.periodEnd,
    components,
    totalIncentive,
    currency,
    calculatedAt: new Date().toISOString(),
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

function findMatchingVariant(config: AdditiveLookupConfig, metrics: EmployeeMetrics) {
  return config.variants.find((variant) => {
    if (!variant.eligibilityCriteria) return true;

    // Check certification match
    if (
      'isCertified' in variant.eligibilityCriteria &&
      variant.eligibilityCriteria.isCertified !== metrics.isCertified
    ) {
      return false;
    }

    return true;
  });
}

// ============================================
// COMPONENT CALCULATIONS
// ============================================

function calculateComponent(
  component: PlanComponent,
  metrics: EmployeeMetrics
): CalculationStep {
  let result: CalculationStep;

  switch (component.componentType) {
    case 'matrix_lookup':
      result = calculateMatrixLookup(component, metrics);
      break;
    case 'tier_lookup':
      result = calculateTierLookup(component, metrics);
      break;
    case 'percentage':
      result = calculatePercentage(component, metrics);
      break;
    case 'conditional_percentage':
      result = calculateConditionalPercentage(component, metrics);
      break;
    default:
      console.error(`[CalcEngine] ${component.name}: Unknown component type "${component.componentType}"`);
      result = createZeroStep(component, `Unknown component type: ${component.componentType}`);
  }

  return result;
}

function calculateMatrixLookup(
  component: PlanComponent,
  metrics: EmployeeMetrics
): CalculationStep {
  const config = component.matrixConfig!;

  // Validation: Check for empty configuration
  if (!config.rowBands || config.rowBands.length === 0) {
    return createZeroStep(component, 'Matrix has no row bands configured');
  }
  if (!config.columnBands || config.columnBands.length === 0) {
    return createZeroStep(component, 'Matrix has no column bands configured');
  }
  if (!config.values || config.values.length === 0) {
    return createZeroStep(component, 'Matrix has no values configured');
  }

  // OB-27: NO SILENT FALLBACKS - log when metrics are missing
  // OB-27B: Use recordWarning for summary pattern (prevents console flood)
  // OB-29 Phase 3B: Check for undefined/null/NaN/Infinity (zero-goal guard)
  const rowValue = metrics.metrics[config.rowMetric];
  const colValue = metrics.metrics[config.columnMetric];

  if (rowValue === undefined || rowValue === null || !Number.isFinite(rowValue)) {
    recordWarning(`${component.name}: Metric not measured ("${config.rowMetric}")`);
    return createZeroStep(component, `Metric not measured: ${config.rowMetric}`);
  }
  if (colValue === undefined || colValue === null || !Number.isFinite(colValue)) {
    recordWarning(`${component.name}: Metric not measured ("${config.columnMetric}")`);
    return createZeroStep(component, `Metric not measured: ${config.columnMetric}`);
  }

  const rowBand = findBand(config.rowBands, rowValue);
  const colBand = findBand(config.columnBands, colValue);

  const rowIndex = config.rowBands.indexOf(rowBand);
  const colIndex = config.columnBands.indexOf(colBand);

  const lookupValue = config.values[rowIndex]?.[colIndex] ?? 0;

  return {
    order: component.order,
    componentId: component.id,
    componentName: component.name,
    componentType: component.componentType,
    description: component.description,
    inputs: {
      actual: rowValue,
      target: 100, // Assuming percentage-based attainment
      attainment: rowValue / 100,
      additionalFactors: {
        [config.columnMetric]: colValue,
      },
    },
    lookupDetails: {
      tableType: 'matrix',
      rowBand: rowBand.label,
      colBand: colBand.label,
      foundValue: lookupValue,
    },
    // OB-27: Component trace for successful calculation
    componentTrace: {
      step1_aiContext: component.id,
      step2_sheetClassification: component.name,
      step3_metricsExtracted: [config.rowMetric, config.columnMetric],
      step4_calcTypeResolved: true,
      step5_lookupSuccess: lookupValue > 0,
      step6_resultValue: lookupValue,
      failureReason: lookupValue === 0 ? 'Lookup returned 0' : undefined,
    },
    calculation: `${config.rowMetricLabel}: ${rowValue.toFixed(1)}% (${rowBand.label}) × ${config.columnMetricLabel}: $${colValue.toLocaleString()} (${colBand.label}) = $${lookupValue.toLocaleString()}`,
    outputValue: lookupValue,
    currency: config.currency,
  };
}

function calculateTierLookup(
  component: PlanComponent,
  metrics: EmployeeMetrics
): CalculationStep {
  const config = component.tierConfig!;

  // Validation: Check for empty configuration
  if (!config.tiers || config.tiers.length === 0) {
    return createZeroStep(component, 'Tier lookup has no tiers configured');
  }

  // OB-27: NO SILENT FALLBACKS - log when metrics are missing
  // OB-27B: Use recordWarning for summary pattern (prevents console flood)
  // OB-29 Phase 3B: Check for undefined/null/NaN/Infinity (zero-goal guard)
  const value = metrics.metrics[config.metric];

  // OB-29: Detailed logging for zero-goal diagnosis
  if (value === undefined) {
    recordWarning(`${component.name}: Metric "${config.metric}" is undefined (zero-goal or missing data)`);
    return createZeroStep(component, `Metric not available: ${config.metric} (zero-goal or no data)`);
  }
  if (value === null) {
    recordWarning(`${component.name}: Metric "${config.metric}" is null`);
    return createZeroStep(component, `Metric is null: ${config.metric}`);
  }
  if (!Number.isFinite(value)) {
    recordWarning(`${component.name}: Metric "${config.metric}" is ${value} (Infinity/NaN from zero-goal)`);
    return createZeroStep(component, `Invalid metric value (${value}): ${config.metric}`);
  }

  const tier = findTier(config.tiers, value);

  return {
    order: component.order,
    componentId: component.id,
    componentName: component.name,
    componentType: component.componentType,
    description: component.description,
    inputs: {
      actual: value,
      target: 100,
      attainment: value / 100,
    },
    lookupDetails: {
      tableType: 'tier',
      tierLabel: tier.label,
      foundValue: tier.value,
    },
    // OB-27: Component trace for successful calculation
    componentTrace: {
      step1_aiContext: component.id,
      step2_sheetClassification: component.name,
      step3_metricsExtracted: [config.metric],
      step4_calcTypeResolved: true,
      step5_lookupSuccess: tier.value > 0,
      step6_resultValue: tier.value,
      failureReason: tier.value === 0 ? 'Tier value is 0' : undefined,
    },
    calculation: `${config.metricLabel}: ${value.toFixed(1)}% → ${tier.label} = $${tier.value.toLocaleString()}`,
    outputValue: tier.value,
    currency: config.currency,
  };
}

function calculatePercentage(
  component: PlanComponent,
  metrics: EmployeeMetrics
): CalculationStep {
  const config = component.percentageConfig!;

  // OB-27: NO SILENT FALLBACKS - log when metrics are missing
  // OB-29 Phase 3B: Check for undefined/null/NaN/Infinity (zero-goal guard)
  const baseValue = metrics.metrics[config.appliedTo];
  if (baseValue === undefined || baseValue === null || !Number.isFinite(baseValue)) {
    recordWarning(`${component.name}: Metric not measured ("${config.appliedTo}")`);
    return createZeroStep(component, `Metric not measured: ${config.appliedTo}`);
  }

  // Check minimum threshold
  if (config.minThreshold && baseValue < config.minThreshold) {
    return createZeroStep(component, `Below minimum threshold of $${config.minThreshold}`);
  }

  let result = baseValue * config.rate;

  // Apply max payout cap
  if (config.maxPayout && result > config.maxPayout) {
    result = config.maxPayout;
  }

  return {
    order: component.order,
    componentId: component.id,
    componentName: component.name,
    componentType: component.componentType,
    description: component.description,
    inputs: {
      actual: baseValue,
      target: 0,
      attainment: 1,
    },
    // OB-27: Component trace for successful calculation
    componentTrace: {
      step1_aiContext: component.id,
      step2_sheetClassification: component.name,
      step3_metricsExtracted: [config.appliedTo],
      step4_calcTypeResolved: true,
      step5_lookupSuccess: true,
      step6_resultValue: result,
      failureReason: result === 0 ? 'Base value or rate is 0' : undefined,
    },
    calculation: `$${baseValue.toLocaleString()} × ${(config.rate * 100).toFixed(1)}% = $${result.toLocaleString()}`,
    outputValue: result,
    currency: 'USD',
  };
}

function calculateConditionalPercentage(
  component: PlanComponent,
  metrics: EmployeeMetrics
): CalculationStep {
  const config = component.conditionalConfig!;

  // Validation: Check for empty conditions
  if (!config.conditions || config.conditions.length === 0) {
    return createZeroStep(component, 'Conditional percentage has no conditions configured');
  }

  // OB-27: NO SILENT FALLBACKS - log when metrics are missing
  // OB-29 Phase 3B: Check for undefined/null/NaN/Infinity (zero-goal guard)
  const baseValue = metrics.metrics[config.appliedTo];
  if (baseValue === undefined || baseValue === null || !Number.isFinite(baseValue)) {
    recordWarning(`${component.name}: Metric not measured ("${config.appliedTo}")`);
    return createZeroStep(component, `Metric not measured: ${config.appliedTo}`);
  }

  // Find matching condition
  const conditionMetric = config.conditions[0]?.metric;
  if (!conditionMetric) {
    return createZeroStep(component, 'Conditional percentage has no condition metric configured');
  }

  const conditionValue = metrics.metrics[conditionMetric];
  if (conditionValue === undefined || conditionValue === null || !Number.isFinite(conditionValue)) {
    recordWarning(`${component.name}: Condition metric not measured ("${conditionMetric}")`);
    return createZeroStep(component, `Condition metric not measured: ${conditionMetric}`);
  }

  const matchingCondition = config.conditions.find(
    (c) => conditionValue >= c.min && conditionValue < c.max
  ) || config.conditions[config.conditions.length - 1];

  const rate = matchingCondition?.rate ?? 0;
  const result = baseValue * rate;

  return {
    order: component.order,
    componentId: component.id,
    componentName: component.name,
    componentType: component.componentType,
    description: component.description,
    inputs: {
      actual: conditionValue,
      target: 100,
      attainment: conditionValue / 100,
      additionalFactors: {
        [config.appliedTo]: baseValue,
      },
    },
    // OB-27: Component trace for successful calculation
    componentTrace: {
      step1_aiContext: component.id,
      step2_sheetClassification: component.name,
      step3_metricsExtracted: [conditionMetric, config.appliedTo],
      step4_calcTypeResolved: true,
      step5_lookupSuccess: true,
      step6_resultValue: result,
      failureReason: result === 0 ? 'Rate or base value is 0' : undefined,
    },
    calculation: `${matchingCondition?.metricLabel}: ${conditionValue.toFixed(1)}% → Rate: ${(rate * 100).toFixed(1)}% × $${baseValue.toLocaleString()} = $${result.toLocaleString()}`,
    outputValue: result,
    currency: 'USD',
  };
}

// ============================================
// WEIGHTED KPI CALCULATION
// ============================================

function calculateWeightedKPI(
  employeeMetrics: EmployeeMetrics,
  plan: CompensationPlanConfig
): CalculationResult {
  const config = plan.configuration as WeightedKPIConfig;
  const components: CalculationStep[] = [];

  // Calculate weighted attainment for each KPI
  let weightedAttainment = 0;

  config.kpis.forEach((kpi, index) => {
    const actual = employeeMetrics.metrics[kpi.metricSource] ?? 0;
    const attainment = actual / kpi.target;
    const weightedContribution = attainment * (kpi.weight / 100);
    weightedAttainment += weightedContribution;

    components.push({
      order: index + 1,
      componentId: kpi.id,
      componentName: kpi.name,
      componentType: 'tier_lookup', // Using tier as proxy for KPI display
      description: kpi.description || '',
      inputs: {
        actual,
        target: kpi.target,
        attainment,
      },
      calculation: `${actual.toLocaleString()} / ${kpi.target.toLocaleString()} = ${(attainment * 100).toFixed(1)}% × ${kpi.weight}% weight = ${(weightedContribution * 100).toFixed(1)}%`,
      outputValue: weightedContribution,
      currency: 'USD',
    });
  });

  // Apply multiplier curve
  const multiplier = getMultiplierFromCurve(weightedAttainment, config.multiplierCurve);

  // Calculate final payout
  let targetBonus = config.targetBonusValue;
  if (config.targetBonusType === 'salary_multiplier') {
    const salary = employeeMetrics.metrics['base_salary'] ?? 0;
    targetBonus = salary * config.targetBonusValue;
  }

  const totalIncentive = targetBonus * multiplier;

  // Add final multiplier step
  components.push({
    order: components.length + 1,
    componentId: 'multiplier',
    componentName: 'Payout Multiplier',
    componentType: 'percentage',
    description: 'Applied based on weighted attainment curve',
    inputs: {
      actual: weightedAttainment * 100,
      target: 100,
      attainment: weightedAttainment,
    },
    multiplierDetails: {
      curveUsed: config.multiplierCurve.curveType,
      inputAttainment: weightedAttainment,
      outputMultiplier: multiplier,
    },
    calculation: `Weighted attainment: ${(weightedAttainment * 100).toFixed(1)}% → Multiplier: ${multiplier.toFixed(2)}x × Target: $${targetBonus.toLocaleString()} = $${totalIncentive.toLocaleString()}`,
    outputValue: totalIncentive,
    currency: 'USD',
  });

  return {
    employeeId: employeeMetrics.employeeId,
    employeeName: employeeMetrics.employeeName,
    employeeRole: employeeMetrics.employeeRole,
    storeId: employeeMetrics.storeId,
    storeName: employeeMetrics.storeName,
    planId: plan.id,
    planName: plan.name,
    planVersion: plan.version,
    planType: plan.planType,
    period: employeeMetrics.period,
    periodStart: employeeMetrics.periodStart,
    periodEnd: employeeMetrics.periodEnd,
    components,
    totalIncentive,
    currency: 'USD',
    calculatedAt: new Date().toISOString(),
  };
}

function getMultiplierFromCurve(
  attainment: number,
  curve: WeightedKPIConfig['multiplierCurve']
): number {
  const points = curve.points.sort((a, b) => a.attainment - b.attainment);

  // Below floor
  if (attainment < curve.floor) {
    return 0;
  }

  // Find surrounding points for interpolation
  for (let i = 0; i < points.length - 1; i++) {
    const lower = points[i];
    const upper = points[i + 1];

    if (attainment >= lower.attainment && attainment <= upper.attainment) {
      // Linear interpolation
      const ratio = (attainment - lower.attainment) / (upper.attainment - lower.attainment);
      return lower.payout + ratio * (upper.payout - lower.payout);
    }
  }

  // Above last point - return capped or extrapolated
  const lastPoint = points[points.length - 1];
  if (attainment > lastPoint.attainment) {
    return Math.min(lastPoint.payout, curve.cap);
  }

  return points[0]?.payout ?? 0;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function findBand(bands: Band[], value: number): Band {
  // OB-29 Phase 3B: Safety guard - return lowest band for non-finite values
  if (!Number.isFinite(value)) {
    return bands[0] || { min: 0, max: 0, label: 'Unknown' };
  }
  const found = bands.find((b) => value >= b.min && value < b.max);
  return found || bands[bands.length - 1] || { min: 0, max: 0, label: 'Unknown' };
}

function findTier(tiers: Tier[], value: number): Tier {
  // OB-29 Phase 3B: Safety guard - return zero-value tier for non-finite values
  if (!Number.isFinite(value)) {
    return { min: 0, max: 0, label: 'Not Measured', value: 0 };
  }
  const found = tiers.find((t) => value >= t.min && value < t.max);
  return found || tiers[tiers.length - 1] || { min: 0, max: 0, label: 'Unknown', value: 0 };
}

function createZeroStep(component: PlanComponent, reason: string): CalculationStep {
  return {
    order: component.order,
    componentId: component.id,
    componentName: component.name,
    componentType: component.componentType,
    description: component.description,
    inputs: { actual: 0, target: 0, attainment: 0 },
    // OB-27: Track why component produced $0
    componentTrace: {
      step1_aiContext: null,
      step2_sheetClassification: null,
      step3_metricsExtracted: [],
      step4_calcTypeResolved: true,
      step5_lookupSuccess: false,
      step6_resultValue: 0,
      failureReason: reason,
    },
    calculation: reason,
    outputValue: 0,
    currency: 'USD',
  };
}

// ============================================
// CALCULATE WITH MODIFIED CONFIG (for scenario modeling)
// ============================================

export function calculateIncentiveWithConfig(
  employeeMetrics: EmployeeMetrics,
  config: AdditiveLookupConfig,
  basePlan: CompensationPlanConfig
): CalculationResult | null {
  // Create a temporary plan with the modified config
  const tempPlan: CompensationPlanConfig = {
    ...basePlan,
    configuration: config,
  };

  return calculateAdditiveLookup(employeeMetrics, tempPlan);
}

// ============================================
// BATCH CALCULATION
// ============================================

export function calculateBatch(
  employees: EmployeeMetrics[],
  tenantId: string
): CalculationResult[] {
  return employees
    .map((emp) => calculateIncentive(emp, tenantId))
    .filter((result): result is CalculationResult => result !== null);
}

// ============================================
// DEMO DATA HELPERS
// ============================================

export function getMariaMetrics(): EmployeeMetrics {
  return {
    employeeId: 'maria-rodriguez',
    employeeName: 'Maria Rodriguez',
    employeeRole: 'sales_rep',
    storeId: 'store-101',
    storeName: 'Downtown Flagship',
    isCertified: true,
    period: '2025-01',
    periodStart: '2025-01-01',
    periodEnd: '2025-01-31',
    metrics: {
      // Optical sales (for matrix lookup)
      optical_attainment: 96, // 96% of quota
      optical_volume: 142500, // YTD sales

      // Store performance
      store_attainment: 105, // Store at 105%

      // New customers
      new_customers_attainment: 102, // 102% of target

      // Collections
      collection_rate: 103, // 103% collection

      // Insurance - NOTE: This is where the attribution error shows
      insurance_collection_rate: 100,
      insurance_premium_total: 520, // Should be higher but TXN-2025-0147 not credited

      // Services
      services_revenue: 2400,
    },
  };
}

export function getJamesMetrics(): EmployeeMetrics {
  return {
    employeeId: 'james-wilson',
    employeeName: 'James Wilson',
    employeeRole: 'sales_rep',
    storeId: 'store-101',
    storeName: 'Downtown Flagship',
    isCertified: true,
    period: '2025-01',
    periodStart: '2025-01-01',
    periodEnd: '2025-01-31',
    metrics: {
      optical_attainment: 105,
      optical_volume: 168000,
      store_attainment: 105,
      new_customers_attainment: 110,
      collection_rate: 103,
      insurance_collection_rate: 100,
      insurance_premium_total: 1370, // Includes the disputed $850 from TXN-2025-0147
      services_revenue: 3200,
    },
  };
}
