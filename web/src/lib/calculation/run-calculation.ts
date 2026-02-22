/**
 * Calculation Orchestrator — Supabase-Only
 *
 * Reads rule_sets, entities, committed_data from Supabase.
 * Evaluates tier_lookup, percentage, matrix_lookup, conditional_percentage.
 * Writes calculation_batches, calculation_results, entity_period_outcomes.
 * Zero localStorage.
 */

import { createClient } from '@/lib/supabase/client';
import type { Json } from '@/lib/supabase/database.types';
import {
  createCalculationBatch,
  writeCalculationResults,
  transitionBatchLifecycle,
} from '@/lib/supabase/calculation-service';
import type {
  PlanComponent,
  TierConfig,
  MatrixConfig,
  PercentageConfig,
  ConditionalConfig,
} from '@/types/compensation-plan';
import {
  inferSemanticType,
  findSheetForComponent,
} from '@/lib/orchestration/metric-resolver';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

interface CalculationInput {
  tenantId: string;
  periodId: string;
  ruleSetId: string;
  userId: string;
}

export interface ComponentResult {
  componentId: string;
  componentName: string;
  componentType: string;
  payout: number;
  metricValues: Record<string, number>;
  details: Record<string, unknown>;
}

export interface CalculationRunResult {
  success: boolean;
  batchId: string;
  entityCount: number;
  totalPayout: number;
  error?: string;
}

// ──────────────────────────────────────────────
// Component Evaluators
// ──────────────────────────────────────────────

export function evaluateTierLookup(config: TierConfig, metrics: Record<string, number>): { payout: number; details: Record<string, unknown> } {
  const metricValue = metrics[config.metric] ?? metrics['attainment'] ?? 0;

  for (const tier of config.tiers) {
    const min = Number.isFinite(tier.min) ? tier.min : -Infinity;
    const max = Number.isFinite(tier.max) ? tier.max : Infinity;

    if (metricValue >= min && metricValue <= max) {
      return {
        payout: tier.value,
        details: {
          metric: config.metric,
          metricValue,
          matchedTier: tier.label,
          tierMin: min,
          tierMax: max,
          tierPayout: tier.value,
        },
      };
    }
  }

  return { payout: 0, details: { metric: config.metric, metricValue, matchedTier: 'none' } };
}

export function evaluatePercentage(config: PercentageConfig, metrics: Record<string, number>): { payout: number; details: Record<string, unknown> } {
  const base = metrics[config.appliedTo] ?? metrics['amount'] ?? 0;
  let payout = base * config.rate;

  if (config.minThreshold && base < config.minThreshold) {
    payout = 0;
  }
  if (config.maxPayout && payout > config.maxPayout) {
    payout = config.maxPayout;
  }

  return {
    payout,
    details: {
      appliedTo: config.appliedTo,
      baseAmount: base,
      rate: config.rate,
      calculatedPayout: payout,
    },
  };
}

export function evaluateMatrixLookup(config: MatrixConfig, metrics: Record<string, number>): { payout: number; details: Record<string, unknown> } {
  const rowValue = metrics[config.rowMetric] ?? 0;
  const colValue = metrics[config.columnMetric] ?? 0;

  // Find row band index
  let rowIdx = -1;
  for (let i = 0; i < config.rowBands.length; i++) {
    const band = config.rowBands[i];
    const min = Number.isFinite(band.min) ? band.min : -Infinity;
    const max = Number.isFinite(band.max) ? band.max : Infinity;
    if (rowValue >= min && rowValue <= max) {
      rowIdx = i;
      break;
    }
  }

  // Find column band index
  let colIdx = -1;
  for (let i = 0; i < config.columnBands.length; i++) {
    const band = config.columnBands[i];
    const min = Number.isFinite(band.min) ? band.min : -Infinity;
    const max = Number.isFinite(band.max) ? band.max : Infinity;
    if (colValue >= min && colValue <= max) {
      colIdx = i;
      break;
    }
  }

  const payout = (rowIdx >= 0 && colIdx >= 0) ? (config.values[rowIdx]?.[colIdx] ?? 0) : 0;

  return {
    payout,
    details: {
      rowMetric: config.rowMetric,
      rowValue,
      rowBand: rowIdx >= 0 ? config.rowBands[rowIdx].label : 'none',
      colMetric: config.columnMetric,
      colValue,
      colBand: colIdx >= 0 ? config.columnBands[colIdx].label : 'none',
      matrixPayout: payout,
    },
  };
}

export function evaluateConditionalPercentage(config: ConditionalConfig, metrics: Record<string, number>): { payout: number; details: Record<string, unknown> } {
  const base = metrics[config.appliedTo] ?? metrics['amount'] ?? 0;

  for (const condition of config.conditions) {
    const conditionValue = metrics[condition.metric] ?? 0;
    const min = Number.isFinite(condition.min) ? condition.min : -Infinity;
    const max = Number.isFinite(condition.max) ? condition.max : Infinity;

    if (conditionValue >= min && conditionValue <= max) {
      const payout = base * condition.rate;
      return {
        payout,
        details: {
          appliedTo: config.appliedTo,
          baseAmount: base,
          matchedCondition: condition.metricLabel,
          conditionMetric: condition.metric,
          conditionValue,
          rate: condition.rate,
          calculatedPayout: payout,
        },
      };
    }
  }

  return { payout: 0, details: { appliedTo: config.appliedTo, baseAmount: base, matchedCondition: 'none' } };
}

export function evaluateComponent(component: PlanComponent, metrics: Record<string, number>): ComponentResult {
  let payout = 0;
  let details: Record<string, unknown> = {};

  if (!component.enabled) {
    return {
      componentId: component.id,
      componentName: component.name,
      componentType: component.componentType,
      payout: 0,
      metricValues: metrics,
      details: { skipped: true, reason: 'component disabled' },
    };
  }

  switch (component.componentType) {
    case 'tier_lookup':
      if (component.tierConfig) {
        const r = evaluateTierLookup(component.tierConfig, metrics);
        payout = r.payout;
        details = r.details;
      }
      break;
    case 'percentage':
      if (component.percentageConfig) {
        const r = evaluatePercentage(component.percentageConfig, metrics);
        payout = r.payout;
        details = r.details;
      }
      break;
    case 'matrix_lookup':
      if (component.matrixConfig) {
        const r = evaluateMatrixLookup(component.matrixConfig, metrics);
        payout = r.payout;
        details = r.details;
      }
      break;
    case 'conditional_percentage':
      if (component.conditionalConfig) {
        const r = evaluateConditionalPercentage(component.conditionalConfig, metrics);
        payout = r.payout;
        details = r.details;
      }
      break;
  }

  return {
    componentId: component.id,
    componentName: component.name,
    componentType: component.componentType,
    payout,
    metricValues: metrics,
    details,
  };
}

// ──────────────────────────────────────────────
// Metric Aggregation from committed_data
// ──────────────────────────────────────────────

export function aggregateMetrics(
  rows: Array<{ row_data: Json }>
): Record<string, number> {
  const result: Record<string, number> = {};

  for (const row of rows) {
    const data = (row.row_data && typeof row.row_data === 'object' && !Array.isArray(row.row_data))
      ? row.row_data as Record<string, Json | undefined>
      : {};

    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'number') {
        result[key] = (result[key] || 0) + value;
      }
    }
  }

  return result;
}

// ──────────────────────────────────────────────
// Sheet-Aware Metric Resolution
// ──────────────────────────────────────────────

/** AI context sheet info — passed from import_batches.metadata */
export interface AIContextSheet {
  sheetName: string;
  matchedComponent: string | null;
}

/**
 * Find which sheet (data_type) feeds a given plan component.
 *
 * OB-75: Uses AI Import Context (persisted in import_batches.metadata)
 * instead of hardcoded SHEET_COMPONENT_PATTERNS.
 * Korean Test: PASSES — AI determined the mapping at import time,
 * so the calculation engine is language-agnostic.
 *
 * Fallback: if no AI context available, uses findSheetForComponent()
 * from metric-resolver which has both AI-first and legacy pattern matching.
 */
export function findMatchingSheet(
  componentName: string,
  availableSheets: string[],
  aiContextSheets?: AIContextSheet[]
): string | null {
  // Use AI context (from import_batches.metadata) if available
  if (aiContextSheets && aiContextSheets.length > 0) {
    const match = findSheetForComponent(
      componentName,
      componentName, // componentId = componentName for matching
      aiContextSheets
    );
    // Only return if the matched sheet is actually in our available data
    if (match && availableSheets.includes(match)) {
      return match;
    }
  }

  // Fallback: try direct name matching against available sheets
  // This handles cases where sheet data_type directly contains a recognizable name
  const normComponent = componentName.toLowerCase().replace(/[-\s]/g, '_');
  for (const sheet of availableSheets) {
    const normSheet = sheet.toLowerCase().replace(/[-\s]/g, '_');
    if (normSheet.includes(normComponent) || normComponent.includes(normSheet)) {
      return sheet;
    }
  }

  return null;
}

/**
 * Get all metric names a component expects from its configuration.
 */
export function getExpectedMetricNames(component: PlanComponent): string[] {
  const names: string[] = [];
  if (component.tierConfig?.metric) names.push(component.tierConfig.metric);
  if (component.matrixConfig?.rowMetric) names.push(component.matrixConfig.rowMetric);
  if (component.matrixConfig?.columnMetric) names.push(component.matrixConfig.columnMetric);
  if (component.percentageConfig?.appliedTo) names.push(component.percentageConfig.appliedTo);
  if (component.conditionalConfig?.appliedTo) names.push(component.conditionalConfig.appliedTo);
  if (component.conditionalConfig?.conditions) {
    for (const c of component.conditionalConfig.conditions) {
      if (c.metric) names.push(c.metric);
    }
  }
  return names;
}

/**
 * Build metrics for a specific component using sheet-aware resolution.
 *
 * OB-75: Uses AI Import Context (from import_batches.metadata) to find
 * the matching sheet — zero hardcoded patterns in the calculation path.
 *
 * 1. Find the matching sheet via AI context (Korean Test: PASSES)
 * 2. Aggregate metrics from ONLY that sheet's rows (not all sheets)
 * 3. Resolve plan-specific metric names to semantic values via inferSemanticType
 *
 * This prevents cross-sheet aggregation corruption (e.g., summing attainment
 * across optical + store + customer sheets into a meaningless number).
 */
export function buildMetricsForComponent(
  component: PlanComponent,
  entityRowsBySheet: Map<string, Array<{ row_data: Json }>>,
  storeDataBySheet?: Map<string, Array<{ row_data: Json }>>,
  aiContextSheets?: AIContextSheet[]
): Record<string, number> {
  const allSheets = Array.from(entityRowsBySheet.keys());
  const matchingSheet = findMatchingSheet(component.name, allSheets, aiContextSheets);

  // If matched, use only that sheet. Otherwise try store-level data.
  let relevantRows: Array<{ row_data: Json }>;

  if (matchingSheet) {
    relevantRows = entityRowsBySheet.get(matchingSheet) || [];
  } else if (storeDataBySheet) {
    // Try store-level sheets (also AI-context aware)
    const storeSheets = Array.from(storeDataBySheet.keys());
    const storeMatch = findMatchingSheet(component.name, storeSheets, aiContextSheets);
    relevantRows = storeMatch ? (storeDataBySheet.get(storeMatch) || []) : [];
  } else {
    relevantRows = [];
  }

  // If no sheet match found at all, fall back to all entity rows
  if (relevantRows.length === 0) {
    relevantRows = [];
    Array.from(entityRowsBySheet.values()).forEach(rows => {
      relevantRows.push(...rows);
    });
  }

  const rawMetrics = aggregateMetrics(relevantRows);

  // Compute attainment from goal + actual when not explicitly present
  if (rawMetrics['attainment'] === undefined && rawMetrics['goal'] && rawMetrics['goal'] > 0) {
    const actual = rawMetrics['amount'] ?? rawMetrics['quantity'] ?? 0;
    rawMetrics['attainment'] = actual / rawMetrics['goal'];
  }

  // Resolve plan-specific metric names to semantic values
  const resolvedMetrics = { ...rawMetrics };
  const expectedNames = getExpectedMetricNames(component);

  for (const metricName of expectedNames) {
    if (resolvedMetrics[metricName] !== undefined) continue; // Already present
    const semanticType = inferSemanticType(metricName);
    if (semanticType !== 'unknown' && rawMetrics[semanticType] !== undefined) {
      resolvedMetrics[metricName] = rawMetrics[semanticType];
    }
  }

  // Normalize attainment from decimal (0-3) to percentage (0-300) scale
  // Plans define tier/matrix bands in percentage (e.g., 100-105 for 100%-105%)
  // Data often stores attainment as decimal ratio (e.g., 1.35 for 135%)
  for (const metricName of expectedNames) {
    const semanticType = inferSemanticType(metricName);
    if (semanticType === 'attainment' && resolvedMetrics[metricName] !== undefined) {
      const v = resolvedMetrics[metricName];
      if (v > 0 && v < 3) {
        resolvedMetrics[metricName] = v * 100;
      }
    }
  }

  return resolvedMetrics;
}

// ──────────────────────────────────────────────
// Main Orchestrator
// ──────────────────────────────────────────────

export async function runCalculation(input: CalculationInput): Promise<CalculationRunResult> {
  const { tenantId, periodId, ruleSetId, userId } = input;
  const supabase = createClient();

  console.log(`[RunCalculation] Starting: tenant=${tenantId}, period=${periodId}, ruleSet=${ruleSetId}`);

  // ── 1. Fetch rule set ──
  const { data: ruleSet, error: rsErr } = await supabase
    .from('rule_sets')
    .select('id, name, components, input_bindings, population_config, metadata')
    .eq('id', ruleSetId)
    .single();

  if (rsErr || !ruleSet) {
    return { success: false, batchId: '', entityCount: 0, totalPayout: 0, error: `Rule set not found: ${rsErr?.message}` };
  }

  // Parse components from JSONB
  const componentsJson = ruleSet.components as Record<string, unknown>;
  const variants = (componentsJson?.variants as Array<Record<string, unknown>>) ?? [];
  const defaultVariant = variants[0];
  const components: PlanComponent[] = (defaultVariant?.components as PlanComponent[]) ?? [];

  if (components.length === 0) {
    return { success: false, batchId: '', entityCount: 0, totalPayout: 0, error: 'Rule set has no components' };
  }

  console.log(`[RunCalculation] Rule set "${ruleSet.name}" has ${components.length} components`);

  // ── 2. Fetch entities with assignments ──
  const { data: assignments, error: aErr } = await supabase
    .from('rule_set_assignments')
    .select('entity_id')
    .eq('tenant_id', tenantId)
    .eq('rule_set_id', ruleSetId);

  if (aErr) {
    return { success: false, batchId: '', entityCount: 0, totalPayout: 0, error: `Failed to fetch assignments: ${aErr.message}` };
  }

  const entityIds = (assignments ?? []).map(a => a.entity_id);
  if (entityIds.length === 0) {
    return { success: false, batchId: '', entityCount: 0, totalPayout: 0, error: 'No entities assigned to this rule set' };
  }

  // Fetch entity display info
  const { data: entities } = await supabase
    .from('entities')
    .select('id, external_id, display_name')
    .in('id', entityIds);

  const entityMap = new Map((entities ?? []).map(e => [e.id, e]));

  // ── 3. Fetch period info ──
  const { data: period } = await supabase
    .from('periods')
    .select('id, canonical_key')
    .eq('id', periodId)
    .single();

  if (!period) {
    return { success: false, batchId: '', entityCount: 0, totalPayout: 0, error: 'Period not found' };
  }

  // ── 4. Fetch committed data for this period (entity-level + store-level) ──
  const { data: committedData } = await supabase
    .from('committed_data')
    .select('entity_id, data_type, row_data')
    .eq('tenant_id', tenantId)
    .eq('period_id', periodId);

  // Group entity-level data by entity_id → data_type → rows
  const dataByEntity = new Map<string, Map<string, Array<{ row_data: Json }>>>();
  const flatDataByEntity = new Map<string, Array<{ row_data: Json }>>();

  // Store-level data (NULL entity_id) grouped by storeId → data_type → rows
  const storeData = new Map<string | number, Map<string, Array<{ row_data: Json }>>>();

  for (const row of (committedData ?? [])) {
    if (row.entity_id) {
      if (!dataByEntity.has(row.entity_id)) {
        dataByEntity.set(row.entity_id, new Map());
      }
      const entitySheets = dataByEntity.get(row.entity_id)!;
      const sheetName = row.data_type || '_unknown';
      if (!entitySheets.has(sheetName)) {
        entitySheets.set(sheetName, []);
      }
      entitySheets.get(sheetName)!.push({ row_data: row.row_data });

      if (!flatDataByEntity.has(row.entity_id)) {
        flatDataByEntity.set(row.entity_id, []);
      }
      flatDataByEntity.get(row.entity_id)!.push({ row_data: row.row_data });
    } else {
      const rd = row.row_data as Record<string, unknown> | null;
      const storeKey = (rd?.['storeId'] ?? rd?.['num_tienda'] ?? rd?.['No_Tienda'] ?? rd?.['Tienda']) as string | number | undefined;
      if (storeKey !== undefined) {
        if (!storeData.has(storeKey)) {
          storeData.set(storeKey, new Map());
        }
        const storeSheets = storeData.get(storeKey)!;
        const sheetName = row.data_type || '_unknown';
        if (!storeSheets.has(sheetName)) {
          storeSheets.set(sheetName, []);
        }
        storeSheets.get(sheetName)!.push({ row_data: row.row_data });
      }
    }
  }

  console.log(`[RunCalculation] ${entityIds.length} entities, ${committedData?.length ?? 0} data rows`);

  // ── 4b. Fetch AI Import Context (OB-75: Korean Test) ──
  const aiContextSheets: AIContextSheet[] = [];
  try {
    const { data: batchRows } = await supabase
      .from('committed_data')
      .select('import_batch_id')
      .eq('tenant_id', tenantId)
      .eq('period_id', periodId)
      .not('import_batch_id', 'is', null)
      .limit(100);

    const batchIds = Array.from(new Set((batchRows ?? []).map(r => r.import_batch_id).filter((id): id is string => id !== null)));

    if (batchIds.length > 0) {
      const { data: batches } = await supabase
        .from('import_batches')
        .select('id, metadata')
        .in('id', batchIds);

      for (const b of (batches ?? [])) {
        const meta = b.metadata as Record<string, unknown> | null;
        const aiCtx = meta?.ai_context as { sheets?: AIContextSheet[] } | undefined;
        if (aiCtx?.sheets) {
          aiContextSheets.push(...aiCtx.sheets);
        }
      }
    }

    console.log(`[RunCalculation] AI context: ${aiContextSheets.length} sheet mappings`);
  } catch (aiErr) {
    console.warn('[RunCalculation] AI context fetch failed (non-blocking):', aiErr);
  }

  // ── 5. Create calculation batch ──
  const batch = await createCalculationBatch(tenantId, {
    periodId,
    ruleSetId,
    entityCount: entityIds.length,
    createdBy: userId,
  });

  // ── 6. Evaluate each entity ──
  const entityResults: Array<{
    entityId: string;
    ruleSetId: string;
    periodId: string;
    totalPayout: number;
    components: Json;
    metrics: Json;
    attainment: Json;
    metadata: Json;
  }> = [];

  let grandTotal = 0;

  for (const entityId of entityIds) {
    const entityInfo = entityMap.get(entityId);
    const entitySheetData = dataByEntity.get(entityId) || new Map();
    const entityRowsFlat = flatDataByEntity.get(entityId) || [];

    // Find this entity's store ID (use FIRST occurrence, not sum)
    const allEntityMetrics = aggregateMetrics(entityRowsFlat);
    let entityStoreId: string | number | undefined;
    for (const row of entityRowsFlat) {
      const rd = (row.row_data && typeof row.row_data === 'object' && !Array.isArray(row.row_data))
        ? row.row_data as Record<string, unknown> : {};
      const sid = rd['storeId'] ?? rd['num_tienda'] ?? rd['No_Tienda'];
      if (sid !== undefined && sid !== null) {
        entityStoreId = sid as string | number;
        break;
      }
    }
    const entityStoreData = entityStoreId !== undefined ? storeData.get(entityStoreId) : undefined;

    // Evaluate each component with sheet-aware metrics
    const componentResults: ComponentResult[] = [];
    let entityTotal = 0;

    for (const component of components) {
      const metrics = buildMetricsForComponent(
        component,
        entitySheetData,
        entityStoreData,
        aiContextSheets
      );
      const result = evaluateComponent(component, metrics);
      componentResults.push(result);
      entityTotal += result.payout;
    }

    grandTotal += entityTotal;

    entityResults.push({
      entityId,
      ruleSetId,
      periodId,
      totalPayout: entityTotal,
      components: componentResults.map(c => ({
        componentId: c.componentId,
        componentName: c.componentName,
        componentType: c.componentType,
        payout: c.payout,
        details: c.details,
      })) as unknown as Json,
      metrics: allEntityMetrics as unknown as Json,
      attainment: { overall: allEntityMetrics['attainment'] ?? 0 } as unknown as Json,
      metadata: {
        entityName: entityInfo?.display_name ?? entityId,
        externalId: entityInfo?.external_id ?? '',
      } as unknown as Json,
    });
  }

  console.log(`[RunCalculation] Calculated ${entityResults.length} entities, total payout: ${grandTotal}`);

  // ── 7. Write results ──
  try {
    await writeCalculationResults(tenantId, batch.id, entityResults);
  } catch (writeErr) {
    return {
      success: false,
      batchId: batch.id,
      entityCount: entityResults.length,
      totalPayout: grandTotal,
      error: `Failed to write results: ${writeErr instanceof Error ? writeErr.message : 'unknown'}`,
    };
  }

  // ── 8. Transition to PREVIEW ──
  await transitionBatchLifecycle(tenantId, batch.id, 'PREVIEW', {
    summary: {
      total_payout: grandTotal,
      entity_count: entityResults.length,
      component_count: components.length,
      rule_set_name: ruleSet.name,
    },
    completedAt: new Date().toISOString(),
  });

  // ── 9. Write metering event ──
  try {
    const now = new Date();
    const meterPeriodKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    await supabase.from('usage_metering').insert({
      tenant_id: tenantId,
      metric_name: 'calculation_run',
      metric_value: entityResults.length,
      period_key: meterPeriodKey,
      dimensions: {
        batch_id: batch.id,
        rule_set_id: ruleSetId,
        period_id: periodId,
        total_payout: grandTotal,
        component_count: components.length,
      },
    });
  } catch (meterErr) {
    console.warn('[RunCalculation] Metering failed (non-blocking):', meterErr);
  }

  console.log(`[RunCalculation] Complete: batch=${batch.id}, entities=${entityResults.length}, total=${grandTotal}`);

  return {
    success: true,
    batchId: batch.id,
    entityCount: entityResults.length,
    totalPayout: grandTotal,
  };
}
