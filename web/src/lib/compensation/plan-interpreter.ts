/**
 * Commission Plan Interpreter
 *
 * Universal plan parser supporting 20+ calculation types.
 * Evaluates plan components against actual metrics to produce incentive payouts.
 *
 * Features:
 * - AI-powered plan interpretation using Anthropic Claude API
 * - Fallback to heuristic detection when API unavailable
 * - Support for any document format (PPTX, CSV, Excel, JSON)
 * - Bilingual support (Spanish/English)
 */

import type {
  RuleSetConfig,
  AdditiveLookupConfig,
  WeightedKPIConfig,
  PlanComponent,
  CalculationStep,
  CalculationResult,
  PlanVariant,
} from '@/types/compensation-plan';
import { isAdditiveLookupConfig, isWeightedKPIConfig } from '@/types/compensation-plan';
import {
  getAIInterpreter,
  interpretationToPlanConfig,
  type PlanInterpretation,
} from './ai-plan-interpreter';

// ============================================
// EXTENDED COMPONENT TYPES
// ============================================

/**
 * Extended component types beyond the base 4
 * These are handled via the `extended` component type
 */
export type ExtendedComponentType =
  // Base types (already supported)
  | 'matrix_lookup'
  | 'tier_lookup'
  | 'percentage'
  | 'conditional_percentage'
  // Quota-based
  | 'quota_attainment'
  | 'quota_accelerator'
  | 'quota_decelerator'
  | 'marginal_tier'
  | 'non_marginal_tier'
  // Transaction-based
  | 'per_unit'
  | 'per_transaction'
  | 'transaction_tier'
  | 'product_spiff'
  | 'category_bonus'
  // Time-based
  | 'multiplier_period'
  | 'seasonal_adjustment'
  | 'retention_bonus'
  | 'anniversary_bonus'
  // Team/Hierarchy
  | 'manager_override'
  | 'team_pool'
  | 'territory_bonus'
  | 'rollup_bonus'
  // Special
  | 'draw_against'
  | 'clawback'
  | 'guarantee'
  | 'cap'
  | 'floor';

// ============================================
// METRIC INPUT TYPES
// ============================================

export interface MetricValues {
  [metricName: string]: number;
}

export interface EmployeeContext {
  entityId: string;
  entityName: string;
  role: string;
  department?: string;
  hireDate?: string;
  attributes?: Record<string, unknown>;
}

export interface StoreContext {
  storeId: string;
  storeName: string;
  region?: string;
  attributes?: Record<string, unknown>;
}

export interface PeriodContext {
  periodId: string;
  periodName: string;
  startDate: string;
  endDate: string;
  periodType: 'monthly' | 'quarterly' | 'annual' | 'custom';
}

export interface CalculationContext {
  employee: EmployeeContext;
  store?: StoreContext;
  period: PeriodContext;
  individualMetrics: MetricValues;
  storeMetrics?: MetricValues;
  teamMetrics?: MetricValues;
  regionMetrics?: MetricValues;
  transactionData?: TransactionData[];
  previousPeriodResults?: CalculationResult;
}

export interface TransactionData {
  id: string;
  date: string;
  amount: number;
  productCategory?: string;
  productId?: string;
  quantity?: number;
  attributes?: Record<string, unknown>;
}

// ============================================
// EXTENDED COMPONENT CONFIGS
// ============================================

export interface QuotaAttainmentConfig {
  quotaMetric: string;
  actualMetric: string;
  baseAmount: number;
  payoutCurve: Array<{ attainment: number; multiplier: number }>;
}

export interface MarginalTierConfig {
  metric: string;
  tiers: Array<{
    min: number;
    max: number;
    rate: number;
    label: string;
  }>;
  currency: string;
}

export interface PerUnitConfig {
  metric: string;
  amountPerUnit: number;
  minUnits?: number;
  maxPayout?: number;
  currency: string;
}

export interface ProductSpiffConfig {
  productIds: string[];
  productCategories?: string[];
  amountPerSale: number;
  maxPayout?: number;
  effectiveStart?: string;
  effectiveEnd?: string;
  currency: string;
}

export interface ManagerOverrideConfig {
  overridePercentage: number;
  appliedTo: 'direct_reports' | 'all_subordinates';
  maxPayout?: number;
}

export interface DrawAgainstConfig {
  drawAmount: number;
  drawPeriod: 'monthly' | 'quarterly';
  recoveryMethod: 'full' | 'partial';
  recoveryPercentage?: number;
}

export interface ClawbackConfig {
  triggerMetric: string;
  thresholdValue: number;
  thresholdType: 'below' | 'above';
  clawbackPercentage: number;
  maxClawback?: number;
}

export interface CapConfig {
  maxPayout: number;
  appliesTo: 'component' | 'total';
  period: 'per_period' | 'annual';
}

export interface FloorConfig {
  minPayout: number;
  appliesTo: 'component' | 'total';
  conditions?: Array<{ metric: string; minValue: number }>;
}

// ============================================
// PLAN INTERPRETER CLASS
// ============================================

export class PlanInterpreter {
  private plan: RuleSetConfig;
  private context: CalculationContext;
  private steps: CalculationStep[] = [];
  private warnings: string[] = [];

  constructor(plan: RuleSetConfig, context: CalculationContext) {
    this.plan = plan;
    this.context = context;
  }

  /**
   * Execute the plan and return calculation result
   */
  execute(): CalculationResult {
    const config = this.plan.configuration;

    if (isAdditiveLookupConfig(config)) {
      return this.executeAdditiveLookup(config);
    } else if (isWeightedKPIConfig(config)) {
      return this.executeWeightedKPI(config);
    }

    throw new Error(`Unknown plan configuration type`);
  }

  /**
   * Execute additive lookup plan (RetailCo style)
   */
  private executeAdditiveLookup(config: AdditiveLookupConfig): CalculationResult {
    // Find matching variant
    const variant = this.findMatchingVariant(config.variants);

    if (!variant) {
      this.warnings.push('No matching plan variant found, using first variant');
    }

    const activeVariant = variant || config.variants[0];

    if (!activeVariant) {
      throw new Error('Plan has no variants configured');
    }

    // Process each component
    for (const component of activeVariant.components) {
      if (!component.enabled) continue;

      const step = this.evaluateComponent(component);
      this.steps.push(step);
    }

    const totalIncentive = this.steps.reduce((sum, step) => sum + step.outputValue, 0);

    return this.buildResult(totalIncentive, activeVariant);
  }

  /**
   * Execute weighted KPI plan (TechCorp style)
   */
  private executeWeightedKPI(config: WeightedKPIConfig): CalculationResult {
    // Calculate weighted attainment
    let weightedAttainment = 0;

    for (const kpi of config.kpis) {
      const metrics = this.getMetricsForLevel(kpi.measurementLevel);
      const actual = metrics[kpi.metricSource] || 0;
      const target = kpi.target;

      let attainment = target > 0 ? actual / target : 0;

      // Apply floor and cap
      if (kpi.floor && attainment < kpi.floor) attainment = 0;
      if (kpi.cap && attainment > kpi.cap) attainment = kpi.cap;

      const weightedContribution = attainment * (kpi.weight / 100);
      weightedAttainment += weightedContribution;

      this.steps.push({
        order: this.steps.length + 1,
        componentId: kpi.id,
        componentName: kpi.name,
        componentType: 'tier_lookup',
        description: `KPI: ${kpi.name} (${kpi.weight}% weight)`,
        inputs: {
          actual,
          target,
          attainment,
        },
        calculation: `${actual.toLocaleString()} / ${target.toLocaleString()} = ${(attainment * 100).toFixed(1)}% × ${kpi.weight}% weight`,
        outputValue: weightedContribution,
        currency: 'USD',
      });
    }

    // Apply multiplier curve
    const payoutMultiplier = this.interpolateCurve(config.multiplierCurve.points, weightedAttainment);

    // Calculate base bonus
    const baseBonus =
      config.targetBonusType === 'fixed'
        ? config.targetBonusValue
        : this.context.individualMetrics.base_salary * config.targetBonusValue;

    const totalIncentive = baseBonus * payoutMultiplier;

    // Add summary step
    this.steps.push({
      order: this.steps.length + 1,
      componentId: 'final_calculation',
      componentName: 'Final Payout',
      componentType: 'percentage',
      description: 'Apply multiplier curve to target bonus',
      inputs: {
        actual: weightedAttainment,
        target: 1,
        attainment: weightedAttainment,
      },
      multiplierDetails: {
        curveUsed: config.multiplierCurve.curveType,
        inputAttainment: weightedAttainment,
        outputMultiplier: payoutMultiplier,
      },
      calculation: `$${baseBonus.toLocaleString()} × ${(payoutMultiplier * 100).toFixed(1)}%`,
      outputValue: totalIncentive,
      currency: 'USD',
    });

    return this.buildResult(totalIncentive);
  }

  /**
   * Find variant matching employee criteria
   */
  private findMatchingVariant(variants: PlanVariant[]): PlanVariant | null {
    for (const variant of variants) {
      if (!variant.eligibilityCriteria) return variant;

      const matches = Object.entries(variant.eligibilityCriteria).every(([key, value]) => {
        const employeeValue = this.context.employee.attributes?.[key];
        return employeeValue === value;
      });

      if (matches) return variant;
    }

    return null;
  }

  /**
   * Evaluate a single component
   */
  private evaluateComponent(component: PlanComponent): CalculationStep {
    switch (component.componentType) {
      case 'matrix_lookup':
        return this.evaluateMatrixLookup(component);
      case 'tier_lookup':
        return this.evaluateTierLookup(component);
      case 'percentage':
        return this.evaluatePercentage(component);
      case 'conditional_percentage':
        return this.evaluateConditionalPercentage(component);
      default:
        return this.evaluateExtendedComponent(component);
    }
  }

  /**
   * Evaluate matrix lookup component
   */
  private evaluateMatrixLookup(component: PlanComponent): CalculationStep {
    const config = component.matrixConfig!;
    const metrics = this.getMetricsForLevel(component.measurementLevel);

    const rowValue = metrics[config.rowMetric] || 0;
    const colValue = metrics[config.columnMetric] || 0;

    // Find row band
    const rowIndex = config.rowBands.findIndex(
      (band) => rowValue >= band.min && rowValue < band.max
    );
    const rowBand = config.rowBands[rowIndex >= 0 ? rowIndex : 0];

    // Find column band
    const colIndex = config.columnBands.findIndex(
      (band) => colValue >= band.min && colValue < band.max
    );
    const colBand = config.columnBands[colIndex >= 0 ? colIndex : 0];

    // Get value from matrix
    const value =
      rowIndex >= 0 && colIndex >= 0
        ? config.values[rowIndex]?.[colIndex] || 0
        : 0;

    return {
      order: this.steps.length + 1,
      componentId: component.id,
      componentName: component.name,
      componentType: 'matrix_lookup',
      description: component.description,
      inputs: {
        actual: rowValue,
        target: 100,
        attainment: rowValue / 100,
        additionalFactors: { [config.columnMetric]: colValue },
      },
      lookupDetails: {
        tableType: 'matrix',
        rowBand: rowBand?.label,
        colBand: colBand?.label,
        foundValue: value,
      },
      calculation: `Matrix[${rowBand?.label || 'N/A'}, ${colBand?.label || 'N/A'}] = $${value.toLocaleString()}`,
      outputValue: value,
      currency: config.currency,
    };
  }

  /**
   * Evaluate tier lookup component
   */
  private evaluateTierLookup(component: PlanComponent): CalculationStep {
    const config = component.tierConfig!;
    const metrics = this.getMetricsForLevel(component.measurementLevel);

    const metricValue = metrics[config.metric] || 0;

    // Find matching tier
    const tier = config.tiers.find(
      (t) => metricValue >= t.min && metricValue < t.max
    );

    const value = tier?.value || 0;

    return {
      order: this.steps.length + 1,
      componentId: component.id,
      componentName: component.name,
      componentType: 'tier_lookup',
      description: component.description,
      inputs: {
        actual: metricValue,
        target: 100,
        attainment: metricValue / 100,
      },
      lookupDetails: {
        tableType: 'tier',
        tierLabel: tier?.label,
        foundValue: value,
      },
      calculation: `${metricValue.toFixed(1)}% → ${tier?.label || 'No tier'} = $${value.toLocaleString()}`,
      outputValue: value,
      currency: config.currency,
    };
  }

  /**
   * Evaluate percentage component
   */
  private evaluatePercentage(component: PlanComponent): CalculationStep {
    const config = component.percentageConfig!;
    const metrics = this.getMetricsForLevel(component.measurementLevel);

    const baseValue = metrics[config.appliedTo] || 0;
    let value = baseValue * config.rate;

    // Apply threshold
    if (config.minThreshold && baseValue < config.minThreshold) {
      value = 0;
    }

    // Apply cap
    if (config.maxPayout && value > config.maxPayout) {
      value = config.maxPayout;
      this.warnings.push(`${component.name} capped at maximum payout`);
    }

    return {
      order: this.steps.length + 1,
      componentId: component.id,
      componentName: component.name,
      componentType: 'percentage',
      description: component.description,
      inputs: {
        actual: baseValue,
        target: 0,
        attainment: 0,
      },
      calculation: `$${baseValue.toLocaleString()} × ${(config.rate * 100).toFixed(1)}% = $${value.toLocaleString()}`,
      outputValue: value,
      currency: 'USD',
    };
  }

  /**
   * Evaluate conditional percentage component
   */
  private evaluateConditionalPercentage(component: PlanComponent): CalculationStep {
    const config = component.conditionalConfig!;
    const metrics = this.getMetricsForLevel(component.measurementLevel);

    const baseValue = metrics[config.appliedTo] || 0;

    // Find matching condition
    let matchedRate = 0;
    let matchedLabel = 'No condition met';

    for (const condition of config.conditions) {
      const conditionValue = metrics[condition.metric] || 0;
      if (conditionValue >= condition.min && conditionValue < condition.max) {
        matchedRate = condition.rate;
        matchedLabel = condition.label;
        break;
      }
    }

    const value = baseValue * matchedRate;

    return {
      order: this.steps.length + 1,
      componentId: component.id,
      componentName: component.name,
      componentType: 'conditional_percentage',
      description: component.description,
      inputs: {
        actual: baseValue,
        target: 0,
        attainment: 0,
      },
      calculation: `$${baseValue.toLocaleString()} × ${(matchedRate * 100).toFixed(1)}% (${matchedLabel}) = $${value.toLocaleString()}`,
      outputValue: value,
      currency: 'USD',
    };
  }

  /**
   * Evaluate extended component types
   */
  private evaluateExtendedComponent(component: PlanComponent): CalculationStep {
    const extendedType = (component as { extendedType?: ExtendedComponentType }).extendedType;
    const extendedConfig = (component as { extendedConfig?: unknown }).extendedConfig;

    switch (extendedType) {
      case 'marginal_tier':
        return this.evaluateMarginalTier(component, extendedConfig as MarginalTierConfig);
      case 'per_unit':
        return this.evaluatePerUnit(component, extendedConfig as PerUnitConfig);
      case 'product_spiff':
        return this.evaluateProductSpiff(component, extendedConfig as ProductSpiffConfig);
      case 'quota_attainment':
        return this.evaluateQuotaAttainment(component, extendedConfig as QuotaAttainmentConfig);
      case 'draw_against':
        return this.evaluateDrawAgainst(component, extendedConfig as DrawAgainstConfig);
      case 'clawback':
        return this.evaluateClawback(component, extendedConfig as ClawbackConfig);
      case 'cap':
        return this.evaluateCap(component, extendedConfig as CapConfig);
      case 'floor':
        return this.evaluateFloor(component, extendedConfig as FloorConfig);
      default:
        this.warnings.push(`Unknown component type: ${component.componentType}`);
        return {
          order: this.steps.length + 1,
          componentId: component.id,
          componentName: component.name,
          componentType: component.componentType,
          description: `Unknown component type: ${component.componentType}`,
          inputs: { actual: 0, target: 0, attainment: 0 },
          calculation: 'Unknown component type',
          outputValue: 0,
          currency: 'USD',
        };
    }
  }

  /**
   * Evaluate marginal tier (each tier's rate applies only to amount within that tier)
   */
  private evaluateMarginalTier(component: PlanComponent, config: MarginalTierConfig): CalculationStep {
    const metrics = this.getMetricsForLevel(component.measurementLevel);
    const metricValue = metrics[config.metric] || 0;

    let totalValue = 0;
    const tierBreakdown: string[] = [];

    for (const tier of config.tiers) {
      if (metricValue <= tier.min) break;

      const tierAmount = Math.min(metricValue, tier.max) - tier.min;
      const tierValue = tierAmount * tier.rate;
      totalValue += tierValue;

      if (tierValue > 0) {
        tierBreakdown.push(`${tier.label}: $${tierAmount.toLocaleString()} × ${(tier.rate * 100).toFixed(1)}%`);
      }
    }

    return {
      order: this.steps.length + 1,
      componentId: component.id,
      componentName: component.name,
      componentType: 'tier_lookup',
      description: `Marginal tier calculation: ${component.description}`,
      inputs: {
        actual: metricValue,
        target: 0,
        attainment: 0,
      },
      calculation: tierBreakdown.join(' + ') || 'No tiers reached',
      outputValue: totalValue,
      currency: config.currency,
    };
  }

  /**
   * Evaluate per-unit commission
   */
  private evaluatePerUnit(component: PlanComponent, config: PerUnitConfig): CalculationStep {
    const metrics = this.getMetricsForLevel(component.measurementLevel);
    const units = metrics[config.metric] || 0;

    let eligibleUnits = units;
    if (config.minUnits && units < config.minUnits) {
      eligibleUnits = 0;
    }

    let value = eligibleUnits * config.amountPerUnit;

    if (config.maxPayout && value > config.maxPayout) {
      value = config.maxPayout;
      this.warnings.push(`${component.name} capped at maximum payout`);
    }

    return {
      order: this.steps.length + 1,
      componentId: component.id,
      componentName: component.name,
      componentType: 'percentage',
      description: component.description,
      inputs: {
        actual: units,
        target: config.minUnits || 0,
        attainment: config.minUnits ? units / config.minUnits : 1,
      },
      calculation: `${eligibleUnits.toLocaleString()} units × $${config.amountPerUnit} = $${value.toLocaleString()}`,
      outputValue: value,
      currency: config.currency,
    };
  }

  /**
   * Evaluate product SPIFF
   */
  private evaluateProductSpiff(component: PlanComponent, config: ProductSpiffConfig): CalculationStep {
    const transactions = this.context.transactionData || [];

    // Filter qualifying transactions
    const qualifying = transactions.filter((tx) => {
      if (config.productIds.length > 0 && !config.productIds.includes(tx.productId || '')) {
        return false;
      }
      if (
        config.productCategories &&
        config.productCategories.length > 0 &&
        !config.productCategories.includes(tx.productCategory || '')
      ) {
        return false;
      }
      if (config.effectiveStart && tx.date < config.effectiveStart) return false;
      if (config.effectiveEnd && tx.date > config.effectiveEnd) return false;
      return true;
    });

    let value = qualifying.length * config.amountPerSale;

    if (config.maxPayout && value > config.maxPayout) {
      value = config.maxPayout;
    }

    return {
      order: this.steps.length + 1,
      componentId: component.id,
      componentName: component.name,
      componentType: 'percentage',
      description: component.description,
      inputs: {
        actual: qualifying.length,
        target: 0,
        attainment: 0,
      },
      calculation: `${qualifying.length} qualifying sales × $${config.amountPerSale} = $${value.toLocaleString()}`,
      outputValue: value,
      currency: config.currency,
    };
  }

  /**
   * Evaluate quota attainment with curve
   */
  private evaluateQuotaAttainment(component: PlanComponent, config: QuotaAttainmentConfig): CalculationStep {
    const metrics = this.getMetricsForLevel(component.measurementLevel);
    const quota = metrics[config.quotaMetric] || 0;
    const actual = metrics[config.actualMetric] || 0;

    const attainment = quota > 0 ? actual / quota : 0;
    const multiplier = this.interpolateCurve(config.payoutCurve, attainment);
    const value = config.baseAmount * multiplier;

    return {
      order: this.steps.length + 1,
      componentId: component.id,
      componentName: component.name,
      componentType: 'percentage',
      description: component.description,
      inputs: {
        actual,
        target: quota,
        attainment,
      },
      multiplierDetails: {
        curveUsed: 'quota_attainment',
        inputAttainment: attainment,
        outputMultiplier: multiplier,
      },
      calculation: `${(attainment * 100).toFixed(1)}% attainment → ${(multiplier * 100).toFixed(1)}% × $${config.baseAmount.toLocaleString()}`,
      outputValue: value,
      currency: 'USD',
    };
  }

  /**
   * Evaluate draw against commission
   */
  private evaluateDrawAgainst(component: PlanComponent, config: DrawAgainstConfig): CalculationStep {
    const currentTotal = this.steps.reduce((sum, s) => sum + s.outputValue, 0);
    const drawAmount = config.drawAmount;

    let adjustment = 0;
    if (currentTotal < drawAmount) {
      // Earned less than draw - pay the difference (draw is guaranteed minimum)
      adjustment = 0; // No additional draw needed, commission will be brought up to draw
    } else {
      // Earned more than draw - recover draw
      if (config.recoveryMethod === 'full') {
        adjustment = -drawAmount;
      } else {
        adjustment = -drawAmount * (config.recoveryPercentage || 1);
      }
    }

    return {
      order: this.steps.length + 1,
      componentId: component.id,
      componentName: component.name,
      componentType: 'percentage',
      description: `Draw against: ${config.recoveryMethod} recovery`,
      inputs: {
        actual: currentTotal,
        target: drawAmount,
        attainment: currentTotal / drawAmount,
      },
      calculation:
        adjustment < 0
          ? `Recover draw: -$${Math.abs(adjustment).toLocaleString()}`
          : `Draw guarantee: no adjustment needed`,
      outputValue: adjustment,
      currency: 'USD',
    };
  }

  /**
   * Evaluate clawback
   */
  private evaluateClawback(component: PlanComponent, config: ClawbackConfig): CalculationStep {
    const metrics = this.getMetricsForLevel(component.measurementLevel);
    const triggerValue = metrics[config.triggerMetric] || 0;
    const currentTotal = this.steps.reduce((sum, s) => sum + s.outputValue, 0);

    let clawbackAmount = 0;
    const triggered =
      config.thresholdType === 'below'
        ? triggerValue < config.thresholdValue
        : triggerValue > config.thresholdValue;

    if (triggered) {
      clawbackAmount = currentTotal * config.clawbackPercentage;
      if (config.maxClawback && clawbackAmount > config.maxClawback) {
        clawbackAmount = config.maxClawback;
      }
    }

    return {
      order: this.steps.length + 1,
      componentId: component.id,
      componentName: component.name,
      componentType: 'percentage',
      description: `Clawback: ${config.triggerMetric} ${config.thresholdType} ${config.thresholdValue}`,
      inputs: {
        actual: triggerValue,
        target: config.thresholdValue,
        attainment: triggerValue / config.thresholdValue,
      },
      calculation: triggered
        ? `Clawback ${(config.clawbackPercentage * 100).toFixed(0)}%: -$${clawbackAmount.toLocaleString()}`
        : 'No clawback triggered',
      outputValue: -clawbackAmount,
      currency: 'USD',
    };
  }

  /**
   * Evaluate cap
   */
  private evaluateCap(component: PlanComponent, config: CapConfig): CalculationStep {
    const currentTotal = this.steps.reduce((sum, s) => sum + s.outputValue, 0);
    const adjustment = currentTotal > config.maxPayout ? config.maxPayout - currentTotal : 0;

    return {
      order: this.steps.length + 1,
      componentId: component.id,
      componentName: component.name,
      componentType: 'percentage',
      description: `Cap at $${config.maxPayout.toLocaleString()}`,
      inputs: {
        actual: currentTotal,
        target: config.maxPayout,
        attainment: currentTotal / config.maxPayout,
      },
      calculation:
        adjustment < 0
          ? `Cap applied: -$${Math.abs(adjustment).toLocaleString()}`
          : 'Under cap, no adjustment',
      outputValue: adjustment,
      currency: 'USD',
    };
  }

  /**
   * Evaluate floor
   */
  private evaluateFloor(component: PlanComponent, config: FloorConfig): CalculationStep {
    const currentTotal = this.steps.reduce((sum, s) => sum + s.outputValue, 0);
    const metrics = this.getMetricsForLevel(component.measurementLevel);

    // Check conditions
    let conditionsMet = true;
    if (config.conditions) {
      conditionsMet = config.conditions.every((c) => (metrics[c.metric] || 0) >= c.minValue);
    }

    const adjustment =
      conditionsMet && currentTotal < config.minPayout ? config.minPayout - currentTotal : 0;

    return {
      order: this.steps.length + 1,
      componentId: component.id,
      componentName: component.name,
      componentType: 'percentage',
      description: `Floor at $${config.minPayout.toLocaleString()}`,
      inputs: {
        actual: currentTotal,
        target: config.minPayout,
        attainment: currentTotal / config.minPayout,
      },
      calculation:
        adjustment > 0
          ? `Floor applied: +$${adjustment.toLocaleString()}`
          : conditionsMet
            ? 'Above floor, no adjustment'
            : 'Conditions not met for floor',
      outputValue: adjustment,
      currency: 'USD',
    };
  }

  /**
   * Get metrics for measurement level
   */
  private getMetricsForLevel(level: string): MetricValues {
    switch (level) {
      case 'individual':
        return this.context.individualMetrics;
      case 'store':
        return { ...this.context.individualMetrics, ...this.context.storeMetrics };
      case 'team':
        return { ...this.context.individualMetrics, ...this.context.teamMetrics };
      case 'region':
        return { ...this.context.individualMetrics, ...this.context.regionMetrics };
      case 'bu':
        return { ...this.context.individualMetrics, ...this.context.teamMetrics };
      case 'blended':
        return {
          ...this.context.individualMetrics,
          ...this.context.teamMetrics,
          ...this.context.storeMetrics,
        };
      default:
        return this.context.individualMetrics;
    }
  }

  /**
   * Interpolate curve to get multiplier
   */
  private interpolateCurve(
    points: Array<{ attainment: number; multiplier?: number; payout?: number }>,
    attainment: number
  ): number {
    if (points.length === 0) return 0;

    // Sort points by attainment
    const sorted = [...points].sort((a, b) => a.attainment - b.attainment);

    // Below first point
    if (attainment <= sorted[0].attainment) {
      return sorted[0].multiplier ?? sorted[0].payout ?? 0;
    }

    // Above last point
    if (attainment >= sorted[sorted.length - 1].attainment) {
      return sorted[sorted.length - 1].multiplier ?? sorted[sorted.length - 1].payout ?? 0;
    }

    // Find surrounding points and interpolate
    for (let i = 0; i < sorted.length - 1; i++) {
      const p1 = sorted[i];
      const p2 = sorted[i + 1];

      if (attainment >= p1.attainment && attainment <= p2.attainment) {
        const v1 = p1.multiplier ?? p1.payout ?? 0;
        const v2 = p2.multiplier ?? p2.payout ?? 0;
        const ratio = (attainment - p1.attainment) / (p2.attainment - p1.attainment);
        return v1 + (v2 - v1) * ratio;
      }
    }

    return 0;
  }

  /**
   * Build final result
   */
  private buildResult(totalIncentive: number, variant?: PlanVariant): CalculationResult {
    return {
      entityId: this.context.employee.entityId,
      entityName: this.context.employee.entityName,
      entityRole: this.context.employee.role,
      storeId: this.context.store?.storeId,
      storeName: this.context.store?.storeName,
      ruleSetId: this.plan.id,
      ruleSetName: this.plan.name,
      ruleSetVersion: this.plan.version,
      ruleSetType: this.plan.ruleSetType,
      variantId: variant?.variantId,
      variantName: variant?.variantName,
      period: this.context.period.periodName,
      periodStart: this.context.period.startDate,
      periodEnd: this.context.period.endDate,
      components: this.steps,
      totalIncentive,
      currency: 'USD',
      calculatedAt: new Date().toISOString(),
      warnings: this.warnings.length > 0 ? this.warnings : undefined,
    };
  }
}

// ============================================
// CONVENIENCE FUNCTIONS
// ============================================

/**
 * Calculate incentive for an employee given a plan and metrics
 */
export function calculatePlanIncentive(
  plan: RuleSetConfig,
  context: CalculationContext
): CalculationResult {
  const interpreter = new PlanInterpreter(plan, context);
  return interpreter.execute();
}

/**
 * Validate plan configuration
 */
export function validatePlanConfiguration(
  plan: RuleSetConfig
): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check basic fields
  if (!plan.id) errors.push('Plan ID is required');
  if (!plan.name) errors.push('Plan name is required');
  if (!plan.tenantId) errors.push('Tenant ID is required');

  const config = plan.configuration;

  if (isAdditiveLookupConfig(config)) {
    if (!config.variants || config.variants.length === 0) {
      errors.push('At least one plan variant is required');
    }

    for (const variant of config.variants || []) {
      if (!variant.components || variant.components.length === 0) {
        warnings.push(`Variant ${variant.variantName} has no components`);
      }

      for (const component of variant.components || []) {
        if (component.componentType === 'matrix_lookup' && !component.matrixConfig) {
          errors.push(`Component ${component.name} is missing matrix configuration`);
        }
        if (component.componentType === 'tier_lookup' && !component.tierConfig) {
          errors.push(`Component ${component.name} is missing tier configuration`);
        }
      }
    }
  } else if (isWeightedKPIConfig(config)) {
    const totalWeight = config.kpis.reduce((sum, k) => sum + k.weight, 0);
    if (Math.abs(totalWeight - 100) > 0.01) {
      errors.push(`KPI weights must sum to 100, got ${totalWeight}`);
    }

    if (!config.multiplierCurve || config.multiplierCurve.points.length === 0) {
      errors.push('Multiplier curve is required');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Get required metrics for a plan
 */
export function getRequiredMetrics(plan: RuleSetConfig): string[] {
  const metrics: Set<string> = new Set();

  const config = plan.configuration;

  if (isAdditiveLookupConfig(config)) {
    for (const variant of config.variants) {
      for (const component of variant.components) {
        if (component.matrixConfig) {
          metrics.add(component.matrixConfig.rowMetric);
          metrics.add(component.matrixConfig.columnMetric);
        }
        if (component.tierConfig) {
          metrics.add(component.tierConfig.metric);
        }
        if (component.percentageConfig) {
          metrics.add(component.percentageConfig.appliedTo);
        }
        if (component.conditionalConfig) {
          metrics.add(component.conditionalConfig.appliedTo);
          for (const cond of component.conditionalConfig.conditions) {
            metrics.add(cond.metric);
          }
        }
      }
    }
  } else if (isWeightedKPIConfig(config)) {
    for (const kpi of config.kpis) {
      metrics.add(kpi.metricSource);
    }
  }

  return Array.from(metrics);
}

// ============================================
// AI-POWERED INTERPRETATION
// ============================================

/**
 * Result of document interpretation (AI or heuristic)
 */
export interface DocumentInterpretationResult {
  success: boolean;
  method: 'ai' | 'heuristic';
  interpretation?: PlanInterpretation;
  planConfig?: RuleSetConfig;
  error?: string;
  confidence: number;
}

/**
 * Detected component for heuristic fallback
 */
export interface HeuristicDetectedComponent {
  id: string;
  name: string;
  type: PlanComponent['componentType'];
  metricSource: string;
  measurementLevel: string;
  confidence: number;
  reasoning: string;
}

/**
 * Interpret a plan document using AI first, with heuristic fallback
 *
 * @param documentContent - The extracted text/table content from the document
 * @param tenantId - Current tenant ID
 * @param userId - Current user ID
 * @param locale - Current locale for reasoning messages
 * @returns Interpretation result with plan configuration
 */
export async function interpretPlanDocument(
  documentContent: string,
  tenantId: string,
  userId: string,
  locale: 'en-US' | 'es-MX' = 'en-US'
): Promise<DocumentInterpretationResult> {
  console.log('\n========== PLAN INTERPRETER DEBUG ==========');
  console.log('Document content length:', documentContent.length, 'chars');
  console.log('Tenant ID:', tenantId);
  console.log('User ID:', userId);
  console.log('Locale:', locale);

  // Try AI interpretation via server-side API route
  try {
    console.log('Calling /api/interpret-plan API route...');
    const response = await fetch('/api/interpret-plan', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        documentContent,
        tenantId,
        userId,
      }),
    });

    console.log('API response status:', response.status);

    if (response.ok) {
      const data = await response.json();
      console.log('API response success:', data.success);
      console.log('API method:', data.method);
      console.log('API confidence:', data.confidence);

      if (data.success && data.interpretation) {
        console.log('Interpretation received:');
        console.log('  Plan name:', data.interpretation.ruleSetName);
        console.log('  Employee types:', data.interpretation.employeeTypes?.length || 0);
        console.log('  Components:', data.interpretation.components?.length || 0);
        data.interpretation.components?.forEach((comp: { name: string; type: string; confidence: number }, i: number) => {
          console.log(`    ${i + 1}. ${comp.name} (${comp.type}) - ${comp.confidence}% confidence`);
        });

        // Convert to plan config
        const planConfig = interpretationToPlanConfig(data.interpretation, tenantId, userId);

        return {
          success: true,
          method: 'ai',
          interpretation: data.interpretation,
          planConfig,
          confidence: data.interpretation.confidence || data.confidence,
        };
      } else {
        console.warn('API returned success but no interpretation:', data.error);
      }
    } else {
      const errorData = await response.json().catch(() => ({}));
      console.warn('API route failed:', response.status, errorData);
    }
  } catch (error) {
    console.warn('AI interpretation via API route failed, falling back to heuristics:', error);
  }

  console.log('Falling back to heuristic detection...');
  console.log('==========================================\n');

  // Fallback to heuristic detection
  try {
    const heuristicResult = detectComponentsHeuristically(documentContent, locale);

    // Build a minimal plan config from heuristics
    const now = new Date().toISOString();
    const ruleSetId = crypto.randomUUID();

    const planConfig: RuleSetConfig = {
      id: ruleSetId,
      tenantId,
      name: 'Imported Plan',
      description: 'Plan imported via heuristic detection. Manual configuration recommended.',
      ruleSetType: 'additive_lookup',
      status: 'draft',
      effectiveDate: now,
      endDate: null,
      eligibleRoles: ['sales_rep'],
      version: 1,
      previousVersionId: null,
      createdBy: userId,
      createdAt: now,
      updatedBy: userId,
      updatedAt: now,
      approvedBy: null,
      approvedAt: null,
      configuration: {
        type: 'additive_lookup',
        variants: [
          {
            variantId: 'default',
            variantName: 'Default',
            description: 'Default variant from heuristic detection',
            components: heuristicResult.components.map((c, index) =>
              convertHeuristicComponent(c, index)
            ),
          },
        ],
      },
    };

    // Build interpretation-like response for UI compatibility
    const interpretation: PlanInterpretation = {
      ruleSetName: 'Imported Plan',
      description: 'Detected via heuristic pattern matching',
      currency: 'USD',
      employeeTypes: [{ id: 'default', name: 'Default Employee Type' }],
      components: heuristicResult.components.map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type === 'tier_lookup' ? 'tiered_lookup' : c.type,
        appliesToEmployeeTypes: ['all'],
        calculationMethod: {
          type: 'tiered_lookup',
          metric: c.metricSource,
          tiers: [],
        },
        confidence: c.confidence,
        reasoning: c.reasoning,
      })),
      requiredInputs: [],
      workedExamples: [],
      confidence: heuristicResult.overallConfidence,
      reasoning: heuristicResult.overallReasoning,
    };

    return {
      success: true,
      method: 'heuristic',
      interpretation,
      planConfig,
      confidence: heuristicResult.overallConfidence,
    };
  } catch (error) {
    return {
      success: false,
      method: 'heuristic',
      error: error instanceof Error ? error.message : 'Unknown error during interpretation',
      confidence: 0,
    };
  }
}

/**
 * Detect components using heuristic pattern matching
 */
function detectComponentsHeuristically(
  content: string,
  locale: 'en-US' | 'es-MX'
): {
  components: HeuristicDetectedComponent[];
  overallConfidence: number;
  overallReasoning: string;
} {
  const components: HeuristicDetectedComponent[] = [];
  const contentLower = content.toLowerCase();

  // Pattern definitions with bilingual reasoning
  const patterns = {
    matrix: {
      keywords: ['matrix', 'matriz', 'attainment', 'cumplimiento', 'quota', 'cuota', 'tier', 'nivel'],
      tableIndicators: ['%', '<', '>', '80', '90', '100', '105', '110'],
      name: locale === 'es-MX' ? 'Matriz de Rendimiento' : 'Performance Matrix',
      reasoning:
        locale === 'es-MX'
          ? 'Detectado patrón de matriz con columnas de rendimiento y valores de pago'
          : 'Detected matrix pattern with attainment columns and payout values',
    },
    tier: {
      keywords: ['tier', 'nivel', 'threshold', 'umbral', 'min', 'max', 'range', 'rango'],
      name: locale === 'es-MX' ? 'Bono por Niveles' : 'Tiered Bonus',
      reasoning:
        locale === 'es-MX'
          ? 'Detectada estructura de niveles con umbrales mínimos y máximos'
          : 'Detected tier structure with min/max thresholds',
    },
    percentage: {
      keywords: ['rate', 'tasa', 'percentage', 'porcentaje', 'commission', 'comisión', '%'],
      name: locale === 'es-MX' ? 'Comisión Porcentual' : 'Percentage Commission',
      reasoning:
        locale === 'es-MX'
          ? 'Detectada columna de porcentaje/tasa indicando comisión'
          : 'Detected percentage/rate column indicating commission',
    },
    conditional: {
      keywords: ['if', 'si', 'when', 'cuando', 'conditional', 'condicional', 'then', 'entonces'],
      name: locale === 'es-MX' ? 'Porcentaje Condicional' : 'Conditional Percentage',
      reasoning:
        locale === 'es-MX'
          ? 'Detectadas reglas condicionales basadas en métricas'
          : 'Detected conditional rules based on metrics',
    },
  };

  // Score each pattern type
  const patternScores: Record<string, number> = {};

  for (const [patternType, config] of Object.entries(patterns)) {
    let score = 0;
    for (const keyword of config.keywords) {
      const matches = (contentLower.match(new RegExp(keyword, 'g')) || []).length;
      score += matches * 10;
    }

    if (patternType === 'matrix' && 'tableIndicators' in config) {
      for (const indicator of config.tableIndicators) {
        if (contentLower.includes(indicator)) {
          score += 5;
        }
      }
    }

    patternScores[patternType] = score;
  }

  // Create components for detected patterns
  let componentIndex = 0;

  if (patternScores.matrix > 30) {
    components.push({
      id: `comp-${Date.now()}-${componentIndex++}`,
      name: patterns.matrix.name,
      type: 'matrix_lookup',
      metricSource: 'attainment',
      measurementLevel: 'individual',
      confidence: Math.min(95, 60 + patternScores.matrix / 2),
      reasoning: patterns.matrix.reasoning,
    });
  }

  if (patternScores.tier > 20) {
    components.push({
      id: `comp-${Date.now()}-${componentIndex++}`,
      name: patterns.tier.name,
      type: 'tier_lookup',
      metricSource: 'performance',
      measurementLevel: 'individual',
      confidence: Math.min(90, 55 + patternScores.tier / 2),
      reasoning: patterns.tier.reasoning,
    });
  }

  if (patternScores.percentage > 15) {
    components.push({
      id: `comp-${Date.now()}-${componentIndex++}`,
      name: patterns.percentage.name,
      type: 'percentage',
      metricSource: 'sales',
      measurementLevel: 'individual',
      confidence: Math.min(85, 50 + patternScores.percentage / 2),
      reasoning: patterns.percentage.reasoning,
    });
  }

  if (patternScores.conditional > 25) {
    components.push({
      id: `comp-${Date.now()}-${componentIndex++}`,
      name: patterns.conditional.name,
      type: 'conditional_percentage',
      metricSource: 'sales',
      measurementLevel: 'individual',
      confidence: Math.min(80, 45 + patternScores.conditional / 2),
      reasoning: patterns.conditional.reasoning,
    });
  }

  // If no patterns detected, create a generic component
  if (components.length === 0) {
    components.push({
      id: `comp-${Date.now()}-0`,
      name: locale === 'es-MX' ? 'Componente Personalizado' : 'Custom Component',
      type: 'tier_lookup',
      metricSource: 'metric',
      measurementLevel: 'individual',
      confidence: 35,
      reasoning:
        locale === 'es-MX'
          ? 'No se detectaron patrones específicos - se requiere configuración manual'
          : 'No specific patterns detected - manual configuration required',
    });
  }

  const overallConfidence = Math.round(
    components.reduce((sum, c) => sum + c.confidence, 0) / components.length
  );

  const overallReasoning =
    locale === 'es-MX'
      ? `Análisis heurístico completado. ${components.length} componente(s) detectado(s) con confianza promedio de ${overallConfidence}%.`
      : `Heuristic analysis complete. ${components.length} component(s) detected with average confidence of ${overallConfidence}%.`;

  return {
    components,
    overallConfidence,
    overallReasoning,
  };
}

/**
 * Convert heuristic component to PlanComponent
 */
function convertHeuristicComponent(
  heuristic: HeuristicDetectedComponent,
  order: number
): PlanComponent {
  const base = {
    id: heuristic.id,
    name: heuristic.name,
    description: heuristic.reasoning,
    order: order + 1,
    enabled: true,
    measurementLevel: heuristic.measurementLevel as 'individual' | 'store' | 'team' | 'region',
  };

  switch (heuristic.type) {
    case 'matrix_lookup':
      return {
        ...base,
        componentType: 'matrix_lookup',
        matrixConfig: {
          rowMetric: heuristic.metricSource,
          rowMetricLabel: heuristic.metricSource,
          rowBands: [
            { min: 0, max: 79.99, label: '< 80%' },
            { min: 80, max: 99.99, label: '80-100%' },
            { min: 100, max: Infinity, label: '100%+' },
          ],
          columnMetric: 'volume',
          columnMetricLabel: 'Volume',
          columnBands: [
            { min: 0, max: 99999, label: '< $100K' },
            { min: 100000, max: Infinity, label: '$100K+' },
          ],
          values: [
            [0, 0],
            [500, 750],
            [1000, 1500],
          ],
          currency: 'USD',
        },
      };

    case 'percentage':
      return {
        ...base,
        componentType: 'percentage',
        percentageConfig: {
          rate: 0.05,
          appliedTo: heuristic.metricSource,
          appliedToLabel: heuristic.metricSource,
        },
      };

    case 'conditional_percentage':
      return {
        ...base,
        componentType: 'conditional_percentage',
        conditionalConfig: {
          conditions: [
            { metric: 'attainment', metricLabel: 'Attainment', min: 0, max: 100, rate: 0.03, label: '< 100%' },
            { metric: 'attainment', metricLabel: 'Attainment', min: 100, max: Infinity, rate: 0.05, label: '100%+' },
          ],
          appliedTo: heuristic.metricSource,
          appliedToLabel: heuristic.metricSource,
        },
      };

    case 'tier_lookup':
    default:
      return {
        ...base,
        componentType: 'tier_lookup',
        tierConfig: {
          metric: heuristic.metricSource,
          metricLabel: heuristic.metricSource,
          tiers: [
            { min: 0, max: 79.99, label: '< 80%', value: 0 },
            { min: 80, max: 99.99, label: '80-100%', value: 500 },
            { min: 100, max: Infinity, label: '100%+', value: 1000 },
          ],
          currency: 'USD',
        },
      };
  }
}

/**
 * Check if AI interpreter is available
 */
export function isAIInterpreterAvailable(): boolean {
  return getAIInterpreter().isConfigured();
}


/**
 * Re-export AI interpreter types for convenience
 */
export type { PlanInterpretation, InterpretedComponent } from './ai-plan-interpreter';
export { AIPlainInterpreter, getAIInterpreter } from './ai-plan-interpreter';
