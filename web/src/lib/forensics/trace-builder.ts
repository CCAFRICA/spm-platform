/**
 * Trace Builder
 *
 * Converts existing CalculationResult objects into CalculationTrace objects.
 * This is OBSERVABILITY ONLY -- it reads from results the engine already produced.
 * It does NOT modify any calculation values or add new calculations.
 *
 * All component references are dynamic from the plan -- zero hardcoded names.
 */

import type { CalculationResult, CalculationStep, CompensationPlanConfig, AdditiveLookupConfig, PlanComponent } from '@/types/compensation-plan';
import type { CalculationTrace, ComponentTrace, VariantTrace, MetricTrace, LookupTrace, DataProvenance, ComponentFlag } from './types';

/**
 * Build CalculationTrace objects from engine results.
 * Reads what the engine already computed -- adds no new logic.
 */
export function buildTraces(
  results: CalculationResult[],
  runId: string,
  tenantId: string,
  plan?: CompensationPlanConfig | null
): CalculationTrace[] {
  return results.map(result => buildTrace(result, runId, tenantId, plan));
}

function buildTrace(
  result: CalculationResult,
  runId: string,
  tenantId: string,
  plan?: CompensationPlanConfig | null
): CalculationTrace {
  const variant = extractVariant(result, plan);

  // OB-34: Resolve plan components for measurement period lookup
  const config = plan?.configuration as AdditiveLookupConfig | undefined;
  const matchedVariant = config?.variants?.find(v => v.variantId === result.variantId);
  const planComponents = matchedVariant?.components || config?.variants?.[0]?.components || [];

  const components = result.components.map(step => buildComponentTrace(step, planComponents));
  const flags = collectFlags(result);

  return {
    traceId: `trace-${result.employeeId}-${runId}`,
    calculationRunId: runId,
    employeeId: result.employeeId,
    employeeName: result.employeeName,
    employeeRole: result.employeeRole,
    storeId: result.storeId,
    tenantId,
    timestamp: result.calculatedAt,
    variant,
    components,
    totalIncentive: result.totalIncentive,
    currency: result.currency,
    flags,
    // OB-34: Carry Everything -- full engine output for observability
    _rawResult: result,
    _rawInputs: {
      metrics: result.components.reduce((acc, step) => {
        acc[step.componentId] = { ...step.inputs };
        return acc;
      }, {} as Record<string, unknown>),
      planComponent: planComponents.length > 0 ? planComponents : undefined,
    },
  };
}

function extractVariant(
  result: CalculationResult,
  plan?: CompensationPlanConfig | null
): VariantTrace {
  const config = plan?.configuration as AdditiveLookupConfig | undefined;
  const matchedVariant = config?.variants?.find(v => v.variantId === result.variantId);

  return {
    variantId: result.variantId || 'default',
    variantName: result.variantName || 'Default',
    selectionReasoning: matchedVariant?.eligibilityCriteria
      ? `Matched via eligibility criteria: ${JSON.stringify(matchedVariant.eligibilityCriteria)}`
      : `Variant assigned: ${result.variantName || 'default'}`,
    eligibilityFields: matchedVariant?.eligibilityCriteria || {},
  };
}

function buildComponentTrace(step: CalculationStep, planComponents: PlanComponent[]): ComponentTrace {
  const metrics = extractMetrics(step);
  const lookup = extractLookup(step);
  // OB-34: Find matching plan component to derive measurementPeriod
  const matchingPlan = planComponents.find(pc => pc.id === step.componentId);
  const dataProvenance = extractProvenance(step, matchingPlan);
  const flags = extractComponentFlags(step);
  const sentence = buildCalculationSentence(step);

  return {
    componentId: step.componentId,
    componentName: step.componentName,
    calculationType: step.componentType,
    measurementLevel: step.sourceData ? 'store' : 'individual',
    enabled: true,
    metrics,
    lookup,
    dataProvenance,
    outputValue: step.outputValue,
    calculationSentence: sentence,
    flags,
  };
}

function extractMetrics(step: CalculationStep): MetricTrace[] {
  const metrics: MetricTrace[] = [];
  const sheet = step.sourceData?.sheetName || '';
  const columns = step.sourceData?.columns || {};

  if (step.inputs.attainment !== undefined && step.inputs.attainment !== 0) {
    metrics.push({
      metricName: 'attainment',
      semanticType: 'attainment',
      resolvedValue: step.inputs.attainment,
      resolutionPath: step.componentTrace?.step1_aiContext ? 'ai_mapped' : 'computed',
      sourceSheet: sheet,
      sourceField: columns['attainment'] || '',
      confidence: step.componentTrace?.step5_lookupSuccess ? 1.0 : 0.5,
    });
  }

  if (step.inputs.actual !== undefined && step.inputs.actual !== 0) {
    metrics.push({
      metricName: 'amount',
      semanticType: 'amount',
      resolvedValue: step.inputs.actual,
      resolutionPath: step.componentTrace?.step1_aiContext ? 'ai_mapped' : 'raw_field',
      sourceSheet: sheet,
      sourceField: columns['amount'] || columns['actual'] || '',
      confidence: 1.0,
    });
  }

  if (step.inputs.target !== undefined && step.inputs.target !== 0) {
    metrics.push({
      metricName: 'goal',
      semanticType: 'goal',
      resolvedValue: step.inputs.target,
      resolutionPath: 'raw_field',
      sourceSheet: sheet,
      sourceField: columns['goal'] || columns['target'] || '',
      confidence: 1.0,
    });
  }

  // Additional factors (matrix column metrics, condition metrics, etc.)
  if (step.inputs.additionalFactors) {
    for (const [key, value] of Object.entries(step.inputs.additionalFactors)) {
      metrics.push({
        metricName: key,
        semanticType: 'amount',
        resolvedValue: value,
        resolutionPath: 'raw_field',
        sourceSheet: sheet,
        sourceField: columns[key] || key,
        confidence: 1.0,
      });
    }
  }

  return metrics;
}

function extractLookup(step: CalculationStep): LookupTrace {
  const base: LookupTrace = {
    type: step.componentType,
  };

  if (!step.lookupDetails) return base;

  if (step.lookupDetails.tableType === 'tier') {
    return {
      ...base,
      type: 'tier',
      tierLabel: step.lookupDetails.tierLabel,
      lookupData: step.lookupDetails,
    };
  }

  if (step.lookupDetails.tableType === 'matrix') {
    return {
      ...base,
      type: 'matrix',
      rowLabel: step.lookupDetails.rowBand,
      columnLabel: step.lookupDetails.colBand,
      lookupData: step.lookupDetails,
    };
  }

  if (step.componentType === 'percentage') {
    return {
      ...base,
      type: 'percentage',
      rate: step.inputs.additionalFactors?.['rate'],
      baseAmount: step.inputs.actual,
    };
  }

  if (step.componentType === 'conditional_percentage') {
    return {
      ...base,
      type: 'conditional',
      conditionValue: step.inputs.attainment,
      lookupData: step.lookupDetails,
    };
  }

  return base;
}

function extractProvenance(step: CalculationStep, planComponent?: PlanComponent): DataProvenance {
  // OB-34: Derive measurementPeriod from plan component instead of hardcoding
  const mp = planComponent?.measurementPeriod || 'current';
  const periodType = mp === 'cumulative' ? 'cumulative' : 'point_in_time';

  return {
    sourceSheet: step.sourceData?.sheetName || '',
    topology: step.sourceData?.sheetName ? 'mapped' : 'unknown',
    storeId: step.sourceData?.rowIdentifier,
    periodResolution: {
      detectedPeriod: null,
      periodDetectionMethod: 'from_calculation',
      measurementPeriod: periodType,
      recordsInScope: 1,
      periodKey: '',
    },
    allFields: step.sourceData?.columns || {},
    stages: [
      {
        stageName: 'metric_extraction',
        values: {
          metricsExtracted: step.componentTrace?.step3_metricsExtracted || [],
          sheetClassification: step.componentTrace?.step2_sheetClassification || null,
        },
        mutationDetected: false,
      },
      {
        stageName: 'calculation',
        values: {
          calcTypeResolved: step.componentTrace?.step4_calcTypeResolved ?? false,
          lookupSuccess: step.componentTrace?.step5_lookupSuccess ?? false,
          resultValue: step.componentTrace?.step6_resultValue ?? 0,
        },
        mutationDetected: false,
      },
    ],
  };
}

function extractComponentFlags(step: CalculationStep): ComponentFlag[] {
  const flags: ComponentFlag[] = [];

  if (step.outputValue === 0 && step.componentTrace?.failureReason) {
    flags.push({
      type: 'zero_output',
      message: step.componentTrace.failureReason,
      severity: 'warning',
    });
  }

  if (!step.componentTrace?.step5_lookupSuccess) {
    flags.push({
      type: 'lookup_failed',
      message: `Lookup did not succeed for ${step.componentName}`,
      severity: 'warning',
    });
  }

  if (step.inputs.target === 0 && step.inputs.actual > 0) {
    flags.push({
      type: 'zero_goal',
      message: 'Goal is zero but actual value exists',
      severity: 'error',
    });
  }

  return flags;
}

function buildCalculationSentence(step: CalculationStep): string {
  if (step.calculation) return step.calculation;

  switch (step.componentType) {
    case 'tier_lookup':
      return `Attainment ${step.inputs.attainment}% maps to tier "${step.lookupDetails?.tierLabel || '?'}" = $${step.outputValue}`;
    case 'matrix_lookup':
      return `Row "${step.lookupDetails?.rowBand || '?'}" x Column "${step.lookupDetails?.colBand || '?'}" = $${step.outputValue}`;
    case 'percentage':
      return `$${step.inputs.actual} x rate = $${step.outputValue}`;
    case 'conditional_percentage':
      return `Condition at ${step.inputs.attainment}% -> rate applied to $${step.inputs.actual} = $${step.outputValue}`;
    default:
      return step.calculation || `Output: $${step.outputValue}`;
  }
}

function collectFlags(result: CalculationResult): string[] {
  const flags: string[] = [];
  if (result.warnings) {
    flags.push(...result.warnings);
  }
  for (const step of result.components) {
    if (step.outputValue === 0 && step.componentTrace?.failureReason) {
      flags.push(`${step.componentName}: ${step.componentTrace.failureReason}`);
    }
  }
  return flags;
}
