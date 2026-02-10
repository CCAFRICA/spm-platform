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

// CLT-08 DIAG: Track first employee for diagnostic logging
let _diagEngineLogged = false;
export function resetEngineDiag() { _diagEngineLogged = false; }

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

  // CLT-08 DIAG: Log for first employee only
  const shouldLog = !_diagEngineLogged;
  if (shouldLog) {
    _diagEngineLogged = true;
    console.log('DIAG-ENGINE: === CALCULATION ENGINE ENTRY ===');
    console.log('DIAG-ENGINE: Employee:', employeeMetrics.employeeId, employeeMetrics.employeeName);
    console.log('DIAG-ENGINE: isCertified:', employeeMetrics.isCertified);
    console.log('DIAG-ENGINE: Available metrics:', JSON.stringify(employeeMetrics.metrics, null, 2));
  }

  // Find matching variant based on eligibility criteria
  const variant = findMatchingVariant(config, employeeMetrics);
  if (!variant) {
    warnings.push('No matching plan variant found, using first variant');
  }
  const selectedVariant = variant || config.variants[0];

  if (shouldLog) {
    console.log('DIAG-ENGINE: Selected variant:', selectedVariant.variantName);
    console.log('DIAG-ENGINE: Enabled components:', selectedVariant.components.filter(c => c.enabled).map(c => c.name));
  }

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
      const step = calculateComponent(component, employeeMetrics, shouldLog);
      components.push(step);
      totalIncentive += step.outputValue;
    });

  if (shouldLog) {
    console.log('DIAG-ENGINE: === CALCULATION COMPLETE ===');
    console.log('DIAG-ENGINE: Total Incentive:', totalIncentive);
    components.forEach(c => {
      console.log(`DIAG-ENGINE: Component "${c.componentName}": $${c.outputValue}`);
    });
  }

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
  metrics: EmployeeMetrics,
  shouldLog: boolean = false
): CalculationStep {
  if (shouldLog) {
    console.log(`DIAG-ENGINE: --- Component: "${component.name}" (${component.componentType}) ---`);
  }

  let result: CalculationStep;
  switch (component.componentType) {
    case 'matrix_lookup':
      result = calculateMatrixLookup(component, metrics, shouldLog);
      break;
    case 'tier_lookup':
      result = calculateTierLookup(component, metrics, shouldLog);
      break;
    case 'percentage':
      result = calculatePercentage(component, metrics, shouldLog);
      break;
    case 'conditional_percentage':
      result = calculateConditionalPercentage(component, metrics, shouldLog);
      break;
    default:
      result = createZeroStep(component, 'Unknown component type');
  }

  if (shouldLog) {
    console.log(`DIAG-ENGINE: Result: $${result.outputValue}`);
  }

  return result;
}

function calculateMatrixLookup(
  component: PlanComponent,
  metrics: EmployeeMetrics,
  shouldLog: boolean = false
): CalculationStep {
  const config = component.matrixConfig!;

  // PHASE 3 VALIDATION: Check for empty configuration
  if (!config.rowBands || config.rowBands.length === 0) {
    console.warn(`DIAG-VALIDATE: Component "${component.name}" has EMPTY rowBands!`);
    return createZeroStep(component, 'Matrix has no row bands configured');
  }
  if (!config.columnBands || config.columnBands.length === 0) {
    console.warn(`DIAG-VALIDATE: Component "${component.name}" has EMPTY columnBands!`);
    return createZeroStep(component, 'Matrix has no column bands configured');
  }
  if (!config.values || config.values.length === 0) {
    console.warn(`DIAG-VALIDATE: Component "${component.name}" has EMPTY values matrix!`);
    return createZeroStep(component, 'Matrix has no values configured');
  }

  const rowValue = metrics.metrics[config.rowMetric] ?? 0;
  const colValue = metrics.metrics[config.columnMetric] ?? 0;

  // PHASE 3 VALIDATION: Warn when metric is missing (not just 0)
  const rowMetricMissing = !(config.rowMetric in metrics.metrics);
  const colMetricMissing = !(config.columnMetric in metrics.metrics);
  if (rowMetricMissing && shouldLog) {
    console.warn(`DIAG-VALIDATE: Metric "${config.rowMetric}" NOT FOUND in employee metrics!`);
    console.warn(`DIAG-VALIDATE: Available metrics: ${Object.keys(metrics.metrics).join(', ')}`);
  }
  if (colMetricMissing && shouldLog) {
    console.warn(`DIAG-VALIDATE: Metric "${config.columnMetric}" NOT FOUND in employee metrics!`);
  }

  if (shouldLog) {
    console.log(`DIAG-ENGINE: Matrix lookup config:`);
    console.log(`DIAG-ENGINE:   rowMetric="${config.rowMetric}" -> value=${rowValue}${rowMetricMissing ? ' (MISSING!)' : ''}`);
    console.log(`DIAG-ENGINE:   columnMetric="${config.columnMetric}" -> value=${colValue}${colMetricMissing ? ' (MISSING!)' : ''}`);
    console.log(`DIAG-ENGINE:   rowBands: ${JSON.stringify(config.rowBands.map(b => `${b.min}-${b.max}`))}`);
    console.log(`DIAG-ENGINE:   columnBands: ${JSON.stringify(config.columnBands.map(b => `${b.min}-${b.max}`))}`);
  }

  const rowBand = findBand(config.rowBands, rowValue);
  const colBand = findBand(config.columnBands, colValue);

  const rowIndex = config.rowBands.indexOf(rowBand);
  const colIndex = config.columnBands.indexOf(colBand);

  const lookupValue = config.values[rowIndex]?.[colIndex] ?? 0;

  if (shouldLog) {
    console.log(`DIAG-ENGINE:   Matched rowBand[${rowIndex}]: ${rowBand.label} (${rowBand.min}-${rowBand.max})`);
    console.log(`DIAG-ENGINE:   Matched colBand[${colIndex}]: ${colBand.label} (${colBand.min}-${colBand.max})`);
    console.log(`DIAG-ENGINE:   Lookup value at [${rowIndex}][${colIndex}]: ${lookupValue}`);
  }

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
    calculation: `${config.rowMetricLabel}: ${rowValue.toFixed(1)}% (${rowBand.label}) × ${config.columnMetricLabel}: $${colValue.toLocaleString()} (${colBand.label}) = $${lookupValue.toLocaleString()}`,
    outputValue: lookupValue,
    currency: config.currency,
  };
}

function calculateTierLookup(
  component: PlanComponent,
  metrics: EmployeeMetrics,
  shouldLog: boolean = false
): CalculationStep {
  const config = component.tierConfig!;

  // PHASE 3 VALIDATION: Check for empty configuration
  if (!config.tiers || config.tiers.length === 0) {
    console.warn(`DIAG-VALIDATE: Component "${component.name}" has EMPTY tiers!`);
    return createZeroStep(component, 'Tier lookup has no tiers configured');
  }

  const value = metrics.metrics[config.metric] ?? 0;

  // PHASE 3 VALIDATION: Warn when metric is missing
  const metricMissing = !(config.metric in metrics.metrics);
  if (metricMissing && shouldLog) {
    console.warn(`DIAG-VALIDATE: Metric "${config.metric}" NOT FOUND in employee metrics!`);
    console.warn(`DIAG-VALIDATE: Available metrics: ${Object.keys(metrics.metrics).join(', ')}`);
  }

  if (shouldLog) {
    console.log(`DIAG-ENGINE: Tier lookup config:`);
    console.log(`DIAG-ENGINE:   metric="${config.metric}" -> value=${value}${metricMissing ? ' (MISSING!)' : ''}`);
    console.log(`DIAG-ENGINE:   tiers: ${JSON.stringify(config.tiers.map(t => `${t.min}-${t.max}:$${t.value}`))}`);
  }

  const tier = findTier(config.tiers, value);

  if (shouldLog) {
    console.log(`DIAG-ENGINE:   Matched tier: ${tier.label} ($${tier.value})`);
  }

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
    calculation: `${config.metricLabel}: ${value.toFixed(1)}% → ${tier.label} = $${tier.value.toLocaleString()}`,
    outputValue: tier.value,
    currency: config.currency,
  };
}

function calculatePercentage(
  component: PlanComponent,
  metrics: EmployeeMetrics,
  shouldLog: boolean = false
): CalculationStep {
  const config = component.percentageConfig!;

  const baseValue = metrics.metrics[config.appliedTo] ?? 0;

  // PHASE 3 VALIDATION: Warn when metric is missing
  const metricMissing = !(config.appliedTo in metrics.metrics);
  if (metricMissing && shouldLog) {
    console.warn(`DIAG-VALIDATE: Metric "${config.appliedTo}" NOT FOUND in employee metrics!`);
    console.warn(`DIAG-VALIDATE: Available metrics: ${Object.keys(metrics.metrics).join(', ')}`);
  }

  if (shouldLog) {
    console.log(`DIAG-ENGINE: Percentage config:`);
    console.log(`DIAG-ENGINE:   appliedTo="${config.appliedTo}" -> value=${baseValue}${metricMissing ? ' (MISSING!)' : ''}`);
    console.log(`DIAG-ENGINE:   rate=${config.rate}`);
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

  if (shouldLog) {
    console.log(`DIAG-ENGINE:   Result: ${baseValue} * ${config.rate} = ${result}`);
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
    calculation: `$${baseValue.toLocaleString()} × ${(config.rate * 100).toFixed(1)}% = $${result.toLocaleString()}`,
    outputValue: result,
    currency: 'USD',
  };
}

function calculateConditionalPercentage(
  component: PlanComponent,
  metrics: EmployeeMetrics,
  shouldLog: boolean = false
): CalculationStep {
  const config = component.conditionalConfig!;

  // PHASE 3 VALIDATION: Check for empty conditions
  if (!config.conditions || config.conditions.length === 0) {
    console.warn(`DIAG-VALIDATE: Component "${component.name}" has EMPTY conditions!`);
    return createZeroStep(component, 'Conditional percentage has no conditions configured');
  }

  const baseValue = metrics.metrics[config.appliedTo] ?? 0;

  // Find matching condition
  const conditionMetric = config.conditions[0]?.metric;
  const conditionValue = metrics.metrics[conditionMetric] ?? 0;

  // PHASE 3 VALIDATION: Warn when metrics are missing
  const baseMissing = !(config.appliedTo in metrics.metrics);
  const conditionMissing = conditionMetric ? !(conditionMetric in metrics.metrics) : false;
  if (baseMissing && shouldLog) {
    console.warn(`DIAG-VALIDATE: Metric "${config.appliedTo}" NOT FOUND in employee metrics!`);
    console.warn(`DIAG-VALIDATE: Available metrics: ${Object.keys(metrics.metrics).join(', ')}`);
  }
  if (conditionMissing && shouldLog) {
    console.warn(`DIAG-VALIDATE: Condition metric "${conditionMetric}" NOT FOUND in employee metrics!`);
  }

  if (shouldLog) {
    console.log(`DIAG-ENGINE: Conditional percentage config:`);
    console.log(`DIAG-ENGINE:   appliedTo="${config.appliedTo}" -> value=${baseValue}${baseMissing ? ' (MISSING!)' : ''}`);
    console.log(`DIAG-ENGINE:   conditionMetric="${conditionMetric}" -> value=${conditionValue}${conditionMissing ? ' (MISSING!)' : ''}`);
    console.log(`DIAG-ENGINE:   conditions: ${JSON.stringify(config.conditions.map(c => `${c.min}-${c.max}:${c.rate}`))}`);
  }

  const matchingCondition = config.conditions.find(
    (c) => conditionValue >= c.min && conditionValue < c.max
  ) || config.conditions[config.conditions.length - 1];

  const rate = matchingCondition?.rate ?? 0;
  const result = baseValue * rate;

  if (shouldLog) {
    console.log(`DIAG-ENGINE:   Matched condition: ${matchingCondition?.label} (rate=${rate})`);
    console.log(`DIAG-ENGINE:   Result: ${baseValue} * ${rate} = ${result}`);
  }

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
  const found = bands.find((b) => value >= b.min && value < b.max);
  return found || bands[bands.length - 1] || { min: 0, max: 0, label: 'Unknown' };
}

function findTier(tiers: Tier[], value: number): Tier {
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
