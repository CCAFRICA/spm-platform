/**
 * Employee Reconciliation Trace
 *
 * CLT-14: Provides detailed tracing of the calculation pipeline for a single employee.
 * Used to debug and verify compensation calculations by showing each step:
 *
 * 1. Data Loading - Raw aggregated data from import
 * 2. Plan Resolution - Which plan and variant were selected
 * 3. Component Matching - How plan components matched to data sheets
 * 4. Metric Extraction - How values were extracted and transformed
 * 5. Calculation Steps - Each component's calculation with inputs → lookup → output
 *
 * NO HARDCODED VALUES - Uses AI semantic mappings throughout
 */

import type { RuleSetConfig, CalculationResult, PlanComponent, Band, Tier } from '@/types/compensation-plan';
import { loadAggregatedData, loadImportContext } from '@/lib/data-architecture/data-layer-service';
import { getPlans } from '@/lib/compensation/plan-storage';
import { findSheetForComponent, inferSemanticType } from '@/lib/orchestration/metric-resolver';

// ============================================
// TYPES
// ============================================

export interface TraceStep {
  stepNumber: number;
  stepName: string;
  description: string;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  warnings?: string[];
  errors?: string[];
}

export interface ComponentTrace {
  componentId: string;
  componentName: string;
  componentType: string;
  matchedSheet: string | null;
  sheetMatchMethod: 'ai_context' | 'pattern_match' | 'none';
  rawSheetData: Record<string, unknown> | null;
  extractedMetrics: Record<string, number>;
  metricMappings: Array<{
    planMetric: string;
    semanticType: string;
    sourceValue: unknown;
    extractedValue: number;
  }>;
  calculationInputs: Record<string, number>;
  lookupDetails: Record<string, unknown> | null;
  calculationFormula: string;
  outputValue: number;
  warnings?: string[];
}

export interface VariantSelectionTrace {
  selectedVariantId: string;
  selectedVariantName: string;
  selectionReason: string;
  eligibilityCriteria: Record<string, unknown> | null;
  employeeCriteria: Record<string, unknown>;
  allVariants: Array<{
    variantId: string;
    variantName: string;
    matched: boolean;
    reason: string;
  }>;
}

export interface EmployeeReconciliationTrace {
  traceId: string;
  generatedAt: string;
  tenantId: string;
  entityId: string;
  entityName: string;
  entityRole: string;
  isCertified: boolean;
  period: {
    month: number | null;
    year: number | null;
    formatted: string;
  };

  // Step 1: Data Loading
  dataLoading: {
    aggregatedDataFound: boolean;
    componentMetricsCount: number;
    rawAggregatedData: Record<string, unknown>;
    componentMetrics: Record<string, Record<string, unknown>>;
  };

  // Step 2: Plan Resolution
  planResolution: {
    ruleSetId: string;
    ruleSetName: string;
    ruleSetType: string;
    planStatus: string;
    totalPlansForTenant: number;
    selectionMethod: string;
  };

  // Step 3: Variant Selection
  variantSelection: VariantSelectionTrace;

  // Step 4: Component Traces
  components: ComponentTrace[];

  // Step 5: Final Calculation
  finalCalculation: {
    componentTotals: Array<{
      componentId: string;
      componentName: string;
      value: number;
    }>;
    totalIncentive: number;
    currency: string;
    calculationResult: CalculationResult | null;
  };

  // Validation
  validation: {
    allComponentsMatched: boolean;
    allMetricsExtracted: boolean;
    calculationComplete: boolean;
    warnings: string[];
    errors: string[];
  };
}

// ============================================
// MAIN TRACE FUNCTION
// ============================================

/**
 * Generate a detailed reconciliation trace for a single employee.
 * This traces the entire calculation pipeline from data loading to final result.
 */
export function generateEmployeeTrace(
  tenantId: string,
  entityId: string,
  planIdOverride?: string
): EmployeeReconciliationTrace | null {
  const traceId = `trace-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const generatedAt = new Date().toISOString();
  const warnings: string[] = [];
  const errors: string[] = [];

  // ============================================
  // STEP 1: DATA LOADING
  // ============================================

  const aggregatedEmployees = loadAggregatedData(tenantId);
  if (!aggregatedEmployees || aggregatedEmployees.length === 0) {
    errors.push('No aggregated employee data found. Run calculation first.');
    return createErrorTrace(traceId, generatedAt, tenantId, entityId, errors);
  }

  // Find the employee in aggregated data
  const employee = aggregatedEmployees.find(
    emp => String(emp.entityId) === String(entityId) ||
           String(emp.employeeNumber) === String(entityId)
  );

  if (!employee) {
    errors.push(`Employee ${entityId} not found in aggregated data. Available IDs: ${
      aggregatedEmployees.slice(0, 5).map(e => String(e.entityId)).join(', ')
    }...`);
    return createErrorTrace(traceId, generatedAt, tenantId, entityId, errors);
  }

  const componentMetrics = (employee.componentMetrics || {}) as Record<string, Record<string, unknown>>;

  // ============================================
  // STEP 2: PLAN RESOLUTION
  // ============================================

  const plans = getPlans(tenantId);
  const activePlans = plans.filter(p => p.status === 'active');

  let selectedPlan: RuleSetConfig | null = null;
  let selectionMethod = '';

  if (planIdOverride) {
    selectedPlan = plans.find(p => p.id === planIdOverride) || null;
    selectionMethod = `Explicit override: ${planIdOverride}`;
  } else if (activePlans.length > 0) {
    selectedPlan = activePlans[0];
    selectionMethod = 'First active plan for tenant';
  }

  if (!selectedPlan) {
    errors.push(`No plan found. Override: ${planIdOverride}, Active plans: ${activePlans.length}`);
    return createErrorTrace(traceId, generatedAt, tenantId, entityId, errors);
  }

  // ============================================
  // STEP 3: VARIANT SELECTION
  // ============================================

  // Determine isCertified from role
  const roleStr = String(employee.role || '').toUpperCase();
  const isCertified = roleStr.includes('CERTIFICADO') && !roleStr.includes('NO CERTIFICADO');

  const variantSelection = traceVariantSelection(selectedPlan, isCertified);

  // ============================================
  // STEP 4: COMPONENT MATCHING & METRIC EXTRACTION
  // ============================================

  const aiContext = loadImportContext(tenantId);
  const aiContextSheets = aiContext?.sheets?.map(s => ({
    sheetName: s.sheetName,
    matchedComponent: s.matchedComponent || null,
  })) || [];

  const componentTraces: ComponentTrace[] = [];

  if (selectedPlan.configuration.type === 'additive_lookup') {
    const variant = selectedPlan.configuration.variants.find(
      v => v.variantId === variantSelection.selectedVariantId
    );

    if (variant) {
      for (const component of variant.components.filter(c => c.enabled)) {
        const trace = traceComponentCalculation(
          component,
          componentMetrics,
          aiContextSheets,
          warnings
        );
        componentTraces.push(trace);
      }
    }
  }

  // ============================================
  // STEP 5: FINAL CALCULATION SUMMARY
  // ============================================

  const componentTotals = componentTraces.map(ct => ({
    componentId: ct.componentId,
    componentName: ct.componentName,
    value: ct.outputValue,
  }));

  const totalIncentive = componentTotals.reduce((sum, ct) => sum + ct.value, 0);

  // ============================================
  // VALIDATION
  // ============================================

  const allComponentsMatched = componentTraces.every(ct => ct.matchedSheet !== null);
  const allMetricsExtracted = componentTraces.every(
    ct => Object.keys(ct.extractedMetrics).length > 0 || ct.warnings?.length === 0
  );

  if (!allComponentsMatched) {
    warnings.push('Some components could not be matched to data sheets');
  }

  // ============================================
  // BUILD TRACE
  // ============================================

  // Extract employee properties with proper type handling
  const empName = employee.name ? String(employee.name) :
    `${employee.firstName ? String(employee.firstName) : ''} ${employee.lastName ? String(employee.lastName) : ''}`.trim() || 'Unknown';
  const empRole = employee.role ? String(employee.role) : 'Unknown';
  const empMonth = typeof employee.month === 'number' ? employee.month : null;
  const empYear = typeof employee.year === 'number' ? employee.year : null;

  return {
    traceId,
    generatedAt,
    tenantId,
    entityId: String(employee.entityId),
    entityName: empName,
    entityRole: empRole,
    isCertified,
    period: {
      month: empMonth,
      year: empYear,
      formatted: `${empMonth || '?'}/${empYear || '?'}`,
    },
    dataLoading: {
      aggregatedDataFound: true,
      componentMetricsCount: Object.keys(componentMetrics).length,
      rawAggregatedData: sanitizeForTrace(employee),
      componentMetrics: sanitizeForTrace(componentMetrics) as Record<string, Record<string, unknown>>,
    },
    planResolution: {
      ruleSetId: selectedPlan.id,
      ruleSetName: selectedPlan.name,
      ruleSetType: selectedPlan.ruleSetType,
      planStatus: selectedPlan.status,
      totalPlansForTenant: plans.length,
      selectionMethod,
    },
    variantSelection,
    components: componentTraces,
    finalCalculation: {
      componentTotals,
      totalIncentive,
      currency: 'MXN', // TODO: Get from plan
      calculationResult: null, // Can be populated by running actual calculation
    },
    validation: {
      allComponentsMatched,
      allMetricsExtracted,
      calculationComplete: totalIncentive > 0 || componentTraces.length === 0,
      warnings,
      errors,
    },
  };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function traceVariantSelection(
  plan: RuleSetConfig,
  isCertified: boolean
): VariantSelectionTrace {
  if (plan.configuration.type !== 'additive_lookup') {
    return {
      selectedVariantId: 'default',
      selectedVariantName: 'Default (Weighted KPI)',
      selectionReason: 'Plan uses weighted KPI, no variants',
      eligibilityCriteria: null,
      employeeCriteria: { isCertified },
      allVariants: [],
    };
  }

  const variants = plan.configuration.variants;
  const allVariantsTrace: VariantSelectionTrace['allVariants'] = [];
  let selectedVariant = variants[0];
  let selectionReason = 'Fallback to first variant';

  for (const variant of variants) {
    const criteria = variant.eligibilityCriteria;
    let matched = true;
    let reason = 'No eligibility criteria';

    if (criteria) {
      if ('isCertified' in criteria) {
        if (criteria.isCertified === isCertified) {
          reason = `isCertified match: ${isCertified}`;
        } else {
          matched = false;
          reason = `isCertified mismatch: employee=${isCertified}, variant=${criteria.isCertified}`;
        }
      }
    }

    allVariantsTrace.push({
      variantId: variant.variantId,
      variantName: variant.variantName,
      matched,
      reason,
    });

    if (matched && selectionReason === 'Fallback to first variant') {
      selectedVariant = variant;
      selectionReason = reason;
    }
  }

  return {
    selectedVariantId: selectedVariant.variantId,
    selectedVariantName: selectedVariant.variantName,
    selectionReason,
    eligibilityCriteria: selectedVariant.eligibilityCriteria || null,
    employeeCriteria: { isCertified },
    allVariants: allVariantsTrace,
  };
}

function traceComponentCalculation(
  component: PlanComponent,
  componentMetrics: Record<string, Record<string, unknown>>,
  aiContextSheets: Array<{ sheetName: string; matchedComponent: string | null }>,
  globalWarnings: string[]
): ComponentTrace {
  const warnings: string[] = [];

  // Find matching sheet
  const matchedSheet = findSheetForComponent(
    component.name,
    component.id,
    aiContextSheets
  );

  const sheetMatchMethod: ComponentTrace['sheetMatchMethod'] = matchedSheet
    ? (aiContextSheets.some(s => s.sheetName === matchedSheet && s.matchedComponent) ? 'ai_context' : 'pattern_match')
    : 'none';

  if (!matchedSheet) {
    warnings.push(`No sheet matched for component "${component.name}"`);
  }

  // Get raw sheet data
  const rawSheetData = matchedSheet ? (componentMetrics[matchedSheet] || null) : null;

  // Extract metrics based on component type
  const extractedMetrics: Record<string, number> = {};
  const metricMappings: ComponentTrace['metricMappings'] = [];

  if (rawSheetData) {
    // Extract based on component type
    const metricsToExtract: string[] = [];

    if (component.matrixConfig) {
      metricsToExtract.push(component.matrixConfig.rowMetric, component.matrixConfig.columnMetric);
    }
    if (component.tierConfig) {
      metricsToExtract.push(component.tierConfig.metric);
    }
    if (component.percentageConfig) {
      metricsToExtract.push(component.percentageConfig.appliedTo);
    }
    if (component.conditionalConfig) {
      metricsToExtract.push(component.conditionalConfig.appliedTo);
      if (component.conditionalConfig.conditions?.[0]?.metric) {
        metricsToExtract.push(component.conditionalConfig.conditions[0].metric);
      }
    }

    for (const metricName of metricsToExtract) {
      const semanticType = inferSemanticType(metricName);
      let sourceValue: unknown = null;
      let extractedValue = 0;

      // Try to get value from semantic type first, then direct lookup
      if (semanticType !== 'unknown' && rawSheetData[semanticType] !== undefined) {
        sourceValue = rawSheetData[semanticType];
      } else if (rawSheetData[metricName] !== undefined) {
        sourceValue = rawSheetData[metricName];
      }

      if (sourceValue !== null && sourceValue !== undefined) {
        extractedValue = typeof sourceValue === 'number' ? sourceValue : parseFloat(String(sourceValue)) || 0;
        extractedMetrics[metricName] = extractedValue;
      } else {
        warnings.push(`Could not extract metric "${metricName}" (semantic: ${semanticType})`);
      }

      metricMappings.push({
        planMetric: metricName,
        semanticType,
        sourceValue,
        extractedValue,
      });
    }
  }

  // Build calculation formula and compute output value
  let calculationFormula = '';
  let outputValue = 0;
  let lookupDetails: Record<string, unknown> | null = null;

  switch (component.componentType) {
    case 'matrix_lookup':
      if (component.matrixConfig) {
        const config = component.matrixConfig;
        const rowValue = extractedMetrics[config.rowMetric] || 0;
        const colValue = extractedMetrics[config.columnMetric] || 0;

        // Perform actual matrix lookup
        const rowBand = findBandForValue(config.rowBands, rowValue);
        const colBand = findBandForValue(config.columnBands, colValue);
        const rowIndex = config.rowBands.indexOf(rowBand);
        const colIndex = config.columnBands.indexOf(colBand);
        outputValue = config.values?.[rowIndex]?.[colIndex] ?? 0;

        calculationFormula = `${config.rowMetricLabel || config.rowMetric}: ${rowValue.toFixed(1)}% (${rowBand.label}) × ${config.columnMetricLabel || config.columnMetric}: $${colValue.toLocaleString()} (${colBand.label}) = $${outputValue.toLocaleString()}`;
        lookupDetails = {
          rowMetric: config.rowMetric,
          rowValue,
          rowBand: rowBand.label,
          rowIndex,
          columnMetric: config.columnMetric,
          columnValue: colValue,
          colBand: colBand.label,
          colIndex,
          lookupValue: outputValue,
        };
      }
      break;

    case 'tier_lookup':
      if (component.tierConfig) {
        const config = component.tierConfig;
        const value = extractedMetrics[config.metric] || 0;

        // Perform actual tier lookup
        const tier = findTierForValue(config.tiers, value);
        outputValue = tier.value;

        calculationFormula = `${config.metricLabel || config.metric}: ${value.toFixed(1)}% → ${tier.label} = $${outputValue.toLocaleString()}`;
        lookupDetails = {
          metric: config.metric,
          value,
          tierLabel: tier.label,
          tierMin: tier.min,
          tierMax: tier.max,
          lookupValue: outputValue,
        };
      }
      break;

    case 'percentage':
      if (component.percentageConfig) {
        const config = component.percentageConfig;
        const base = extractedMetrics[config.appliedTo] || 0;
        outputValue = base * config.rate;
        calculationFormula = `$${base.toLocaleString()} × ${(config.rate * 100).toFixed(1)}% = $${outputValue.toLocaleString()}`;
        lookupDetails = {
          appliedTo: config.appliedTo,
          baseValue: base,
          rate: config.rate,
        };
      }
      break;

    case 'conditional_percentage':
      if (component.conditionalConfig) {
        const config = component.conditionalConfig;
        const base = extractedMetrics[config.appliedTo] || 0;

        // Find matching condition rate based on metric value
        let rate = 0;
        let matchedCondition: { metric: string; value: number; label: string } | null = null;

        for (const cond of config.conditions || []) {
          const condValue = extractedMetrics[cond.metric] || 0;
          if (condValue >= cond.min && condValue < cond.max) {
            rate = cond.rate;
            matchedCondition = { metric: cond.metric, value: condValue, label: cond.label };
            break;
          }
        }

        outputValue = base * rate;

        const condMetric = matchedCondition?.metric || config.conditions?.[0]?.metric || 'unknown';
        const condValue = matchedCondition?.value || 0;

        calculationFormula = `Condition: ${condMetric}=${condValue.toFixed(1)}% (${matchedCondition?.label || 'no match'}) → rate=${(rate * 100).toFixed(1)}% × $${base.toLocaleString()} = $${outputValue.toLocaleString()}`;
        lookupDetails = {
          conditionMetric: condMetric,
          conditionValue: condValue,
          matchedLabel: matchedCondition?.label,
          baseValue: base,
          rate,
        };
      }
      break;
  }

  if (warnings.length > 0) {
    globalWarnings.push(...warnings.map(w => `[${component.name}] ${w}`));
  }

  return {
    componentId: component.id,
    componentName: component.name,
    componentType: component.componentType,
    matchedSheet,
    sheetMatchMethod,
    rawSheetData: sanitizeForTrace(rawSheetData),
    extractedMetrics,
    metricMappings,
    calculationInputs: extractedMetrics,
    lookupDetails,
    calculationFormula,
    outputValue,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

function createErrorTrace(
  traceId: string,
  generatedAt: string,
  tenantId: string,
  entityId: string,
  errors: string[]
): EmployeeReconciliationTrace {
  return {
    traceId,
    generatedAt,
    tenantId,
    entityId,
    entityName: 'Unknown',
    entityRole: 'Unknown',
    isCertified: false,
    period: { month: null, year: null, formatted: '?/?' },
    dataLoading: {
      aggregatedDataFound: false,
      componentMetricsCount: 0,
      rawAggregatedData: {},
      componentMetrics: {},
    },
    planResolution: {
      ruleSetId: '',
      ruleSetName: '',
      ruleSetType: '',
      planStatus: '',
      totalPlansForTenant: 0,
      selectionMethod: 'None - Error occurred',
    },
    variantSelection: {
      selectedVariantId: '',
      selectedVariantName: '',
      selectionReason: 'Error occurred',
      eligibilityCriteria: null,
      employeeCriteria: {},
      allVariants: [],
    },
    components: [],
    finalCalculation: {
      componentTotals: [],
      totalIncentive: 0,
      currency: 'MXN',
      calculationResult: null,
    },
    validation: {
      allComponentsMatched: false,
      allMetricsExtracted: false,
      calculationComplete: false,
      warnings: [],
      errors,
    },
  };
}

function sanitizeForTrace(obj: unknown): Record<string, unknown> {
  if (!obj || typeof obj !== 'object') return {};

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    // Skip internal/metadata keys
    if (key.startsWith('_')) continue;

    // Limit deep nesting
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      result[key] = sanitizeForTrace(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

// ============================================
// LOOKUP HELPERS (same logic as calculation-engine)
// ============================================

function findBandForValue(bands: Band[], value: number): Band {
  const found = bands.find((b) => value >= b.min && value < b.max);
  return found || bands[bands.length - 1] || { min: 0, max: 0, label: 'Unknown' };
}

function findTierForValue(tiers: Tier[], value: number): Tier {
  const found = tiers.find((t) => value >= t.min && value < t.max);
  return found || tiers[tiers.length - 1] || { min: 0, max: 0, label: 'Unknown', value: 0 };
}

// ============================================
// BATCH TRACE
// ============================================

/**
 * Generate traces for multiple employees (useful for validation)
 */
export function generateBatchTraces(
  tenantId: string,
  entityIds: string[],
  planIdOverride?: string
): EmployeeReconciliationTrace[] {
  return entityIds.map(id => generateEmployeeTrace(tenantId, id, planIdOverride)).filter(Boolean) as EmployeeReconciliationTrace[];
}

/**
 * Generate a summary comparison of traces (useful for finding patterns)
 */
export function summarizeTraces(
  traces: EmployeeReconciliationTrace[]
): {
  totalEmployees: number;
  withErrors: number;
  withWarnings: number;
  byVariant: Record<string, number>;
  avgTotalIncentive: number;
  componentMatchRates: Record<string, number>;
} {
  const byVariant: Record<string, number> = {};
  const componentMatches: Record<string, { matched: number; total: number }> = {};
  let totalIncentive = 0;

  for (const trace of traces) {
    // Count by variant
    const variantId = trace.variantSelection.selectedVariantId;
    byVariant[variantId] = (byVariant[variantId] || 0) + 1;

    // Sum incentives
    totalIncentive += trace.finalCalculation.totalIncentive;

    // Track component match rates
    for (const comp of trace.components) {
      if (!componentMatches[comp.componentName]) {
        componentMatches[comp.componentName] = { matched: 0, total: 0 };
      }
      componentMatches[comp.componentName].total++;
      if (comp.matchedSheet) {
        componentMatches[comp.componentName].matched++;
      }
    }
  }

  const componentMatchRates: Record<string, number> = {};
  for (const [name, stats] of Object.entries(componentMatches)) {
    componentMatchRates[name] = stats.total > 0 ? (stats.matched / stats.total) * 100 : 0;
  }

  return {
    totalEmployees: traces.length,
    withErrors: traces.filter(t => t.validation.errors.length > 0).length,
    withWarnings: traces.filter(t => t.validation.warnings.length > 0).length,
    byVariant,
    avgTotalIncentive: traces.length > 0 ? totalIncentive / traces.length : 0,
    componentMatchRates,
  };
}
