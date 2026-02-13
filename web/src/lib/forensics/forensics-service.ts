/**
 * Forensics Service
 *
 * Persists and retrieves calculation traces, comparison data, and reconciliation sessions.
 * Implements coincidental match detection and pipeline health checks.
 *
 * Storage keys follow existing pattern: vialuce_forensics_{tenantId}_{type}
 * ALL component references are dynamic from the plan — zero hardcoded names.
 */

import type {
  CalculationTrace,
  ReconciliationSession,
  ReconciliationAggregates,
  PopulationSummary,
  EmployeeReconciliation,
  ComponentAggregate,
  ColumnMapping,
  PipelineHealthResult,
  PipelineLayer,
} from './types';
import type {
  CompensationPlanConfig,
  AdditiveLookupConfig,
  PlanComponent,
  CalculationResult,
} from '@/types/compensation-plan';

// =============================================================================
// STORAGE KEYS
// =============================================================================

const TRACES_KEY = (tenantId: string) => `vialuce_forensics_${tenantId}_traces`;
const TRACES_META_KEY = (tenantId: string) => `vialuce_forensics_${tenantId}_traces_meta`;
const COMPARISON_KEY = (tenantId: string) => `vialuce_forensics_${tenantId}_comparison`;
const SESSION_KEY = (tenantId: string) => `vialuce_forensics_${tenantId}_session`;
const CHUNK_SIZE = 50;

// =============================================================================
// TRACE STORAGE
// =============================================================================

export function saveTraces(
  tenantId: string,
  runId: string,
  traces: CalculationTrace[]
): void {
  if (typeof window === 'undefined') return;

  try {
    const chunkCount = Math.ceil(traces.length / CHUNK_SIZE);

    for (let i = 0; i < chunkCount; i++) {
      const chunk = traces.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      const key = `${TRACES_KEY(tenantId)}_${runId}_${i}`;
      localStorage.setItem(key, JSON.stringify(chunk));
    }

    const meta = {
      runId,
      tenantId,
      chunkCount,
      totalTraces: traces.length,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(TRACES_META_KEY(tenantId), JSON.stringify(meta));
  } catch (error) {
    console.error('[Forensics] Failed to save traces:', error);
  }
}

export function getTraces(tenantId: string, runId?: string): CalculationTrace[] {
  if (typeof window === 'undefined') return [];

  try {
    const metaStr = localStorage.getItem(TRACES_META_KEY(tenantId));
    if (!metaStr) return [];

    const meta = JSON.parse(metaStr);
    const targetRunId = runId || meta.runId;
    if (!targetRunId) return [];

    const traces: CalculationTrace[] = [];
    for (let i = 0; i < meta.chunkCount; i++) {
      const key = `${TRACES_KEY(tenantId)}_${targetRunId}_${i}`;
      const chunkData = localStorage.getItem(key);
      if (!chunkData) break;
      const parsed = JSON.parse(chunkData);
      if (Array.isArray(parsed)) {
        traces.push(...parsed);
      }
    }
    return traces;
  } catch {
    return [];
  }
}

export function getTraceForEmployee(
  tenantId: string,
  employeeId: string
): CalculationTrace | null {
  const traces = getTraces(tenantId);
  return traces.find(t => t.employeeId === employeeId) || null;
}

// =============================================================================
// COMPARISON DATA
// =============================================================================

export function saveComparisonData(
  tenantId: string,
  data: Record<string, unknown>[],
  mapping: ColumnMapping
): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(
      COMPARISON_KEY(tenantId),
      JSON.stringify({ data, mapping, savedAt: new Date().toISOString() })
    );
  } catch (error) {
    console.error('[Forensics] Failed to save comparison data:', error);
  }
}

export function getComparisonData(
  tenantId: string
): { data: Record<string, unknown>[]; mapping: ColumnMapping } | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = localStorage.getItem(COMPARISON_KEY(tenantId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return { data: parsed.data, mapping: parsed.mapping };
  } catch {
    return null;
  }
}

export function clearComparisonData(tenantId: string): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(COMPARISON_KEY(tenantId));
}

// =============================================================================
// RECONCILIATION ENGINE
// =============================================================================

export function runReconciliation(
  traces: CalculationTrace[],
  comparisonData: Record<string, unknown>[],
  mapping: ColumnMapping,
  plan: CompensationPlanConfig
): ReconciliationSession {
  const config = plan.configuration as AdditiveLookupConfig;
  const allComponents = config.variants?.[0]?.components || [];

  // Build employee ID column from mapping
  const empIdMapping = mapping.mappings.find(m => m.mappedTo === 'employee_id');
  const empIdColumn = empIdMapping?.sourceColumn || '';
  const totalMapping = mapping.mappings.find(m => m.mappedTo === 'total');
  const totalColumn = totalMapping?.sourceColumn || '';

  // Build component column mappings (dynamic from plan)
  const componentMappings: Array<{ componentId: string; componentName: string; sourceColumn: string }> = [];
  for (const m of mapping.mappings) {
    if (m.mappedTo.startsWith('component:')) {
      const compId = m.mappedTo.replace('component:', '');
      const comp = allComponents.find(c => c.id === compId);
      componentMappings.push({
        componentId: compId,
        componentName: comp?.name || compId,
        sourceColumn: m.sourceColumn,
      });
    }
  }

  // Index GT data by employee ID
  const gtByEmployee = new Map<string, Record<string, unknown>>();
  for (const row of comparisonData) {
    const empId = String(row[empIdColumn] || '').trim();
    if (empId) gtByEmployee.set(empId, row);
  }

  // Index VL traces by employee ID
  const vlByEmployee = new Map<string, CalculationTrace>();
  for (const trace of traces) {
    vlByEmployee.set(trace.employeeId, trace);
  }

  // Reconcile each employee
  const employeeResults: EmployeeReconciliation[] = [];
  const processedGT = new Set<string>();
  let trueMatches = 0;
  let coincidentalMatches = 0;
  let mismatches = 0;

  // Component-level accumulators (dynamic from plan)
  const componentAccum: Record<string, { vl: number; gt: number; affected: number }> = {};
  for (const comp of allComponents) {
    componentAccum[comp.id] = { vl: 0, gt: 0, affected: 0 };
  }

  let vlTotalSum = 0;
  let gtTotalSum = 0;

  for (const trace of traces) {
    vlTotalSum += trace.totalIncentive;
    const gtRow = gtByEmployee.get(trace.employeeId);

    if (!gtRow) continue;
    processedGT.add(trace.employeeId);

    const gtTotal = totalColumn ? Number(gtRow[totalColumn]) || 0 : 0;
    gtTotalSum += gtTotal;
    const diff = trace.totalIncentive - gtTotal;

    // Per-component diffs (dynamic from plan)
    const componentDiffs: Record<string, { vl: number; gt: number; diff: number }> = {};
    let allComponentsMatch = true;

    for (const cm of componentMappings) {
      const vlComp = trace.components.find(c => c.componentId === cm.componentId);
      const vlVal = vlComp?.outputValue || 0;
      const gtVal = Number(gtRow[cm.sourceColumn]) || 0;
      const compDiff = vlVal - gtVal;

      componentDiffs[cm.componentId] = { vl: vlVal, gt: gtVal, diff: compDiff };

      if (componentAccum[cm.componentId]) {
        componentAccum[cm.componentId].vl += vlVal;
        componentAccum[cm.componentId].gt += gtVal;
        if (Math.abs(compDiff) > 0.01) {
          componentAccum[cm.componentId].affected++;
          allComponentsMatch = false;
        }
      }
    }

    // Coincidental Match Detection:
    // Total matches but individual components don't → coincidental
    const totalMatches = Math.abs(diff) < 1;
    let classification: EmployeeReconciliation['matchClassification'];

    if (totalMatches && allComponentsMatch) {
      classification = 'true_match';
      trueMatches++;
    } else if (totalMatches && !allComponentsMatch) {
      classification = 'coincidental_match';
      coincidentalMatches++;
    } else {
      classification = 'mismatch';
      mismatches++;
    }

    employeeResults.push({
      employeeId: trace.employeeId,
      storeId: trace.storeId,
      variantId: trace.variant.variantId,
      vlTotal: trace.totalIncentive,
      gtTotal,
      difference: diff,
      matchClassification: classification,
      componentDiffs,
    });
  }

  // Unmatched
  const unmatchedVL = traces
    .filter(t => !gtByEmployee.has(t.employeeId))
    .map(t => t.employeeId);

  const unmatchedGT: string[] = [];
  for (const [empId] of gtByEmployee) {
    if (!processedGT.has(empId) && !vlByEmployee.has(empId)) {
      unmatchedGT.push(empId);
    }
  }

  // Build aggregates (dynamic from plan components)
  const componentTotals: ComponentAggregate[] = allComponents.map(comp => ({
    componentId: comp.id,
    componentName: comp.name,
    vlTotal: componentAccum[comp.id]?.vl || 0,
    gtTotal: componentAccum[comp.id]?.gt || 0,
    difference: (componentAccum[comp.id]?.vl || 0) - (componentAccum[comp.id]?.gt || 0),
    employeesAffected: componentAccum[comp.id]?.affected || 0,
  }));

  const aggregates: ReconciliationAggregates = {
    vlTotal: vlTotalSum,
    gtTotal: gtTotalSum,
    difference: vlTotalSum - gtTotalSum,
    componentTotals,
  };

  const population: PopulationSummary = {
    totalEmployees: traces.length,
    trueMatches,
    coincidentalMatches,
    mismatches,
    unmatchedVL,
    unmatchedGT,
  };

  const session: ReconciliationSession = {
    sessionId: `recon-${Date.now()}`,
    tenantId: traces[0]?.tenantId || '',
    planId: plan.id,
    calculationRunId: traces[0]?.calculationRunId || '',
    comparisonDataId: `comp-${Date.now()}`,
    createdAt: new Date().toISOString(),
    columnMapping: mapping,
    aggregates,
    population,
    employeeResults,
    pipelineHealth: runPipelineHealth(
      traces[0]?.tenantId || '',
      traces,
      comparisonData.length > 0 ? { data: comparisonData, mapping } : undefined,
      plan
    ),
  };

  // Persist session
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(SESSION_KEY(session.tenantId), JSON.stringify(session));
    } catch (error) {
      console.error('[Forensics] Failed to save session:', error);
    }
  }

  return session;
}

export function getSession(tenantId: string): ReconciliationSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY(tenantId));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// =============================================================================
// PIPELINE HEALTH ENGINE
// =============================================================================

export function runPipelineHealth(
  tenantId: string,
  traces?: CalculationTrace[],
  comparisonData?: { data: Record<string, unknown>[]; mapping: ColumnMapping },
  plan?: CompensationPlanConfig
): PipelineHealthResult {
  const layers: PipelineHealthResult['layers'] = {
    interpretation: checkInterpretationLayer(tenantId, plan),
    metric: checkMetricLayer(tenantId),
    component: checkComponentLayer(traces, comparisonData),
    population: checkPopulationLayer(tenantId),
    outcome: checkOutcomeLayer(tenantId, traces, comparisonData),
  };

  const statuses = Object.values(layers).map(l => l.status);
  const overallStatus: PipelineHealthResult['overallStatus'] =
    statuses.includes('fail') ? 'critical' :
    statuses.includes('warning') ? 'warnings' : 'healthy';

  return {
    layers,
    overallStatus,
    generatedAt: new Date().toISOString(),
  };
}

// --- Layer 1: Interpretation ---
function checkInterpretationLayer(
  tenantId: string,
  planOverride?: CompensationPlanConfig
): PipelineLayer {
  const flags: string[] = [];

  try {
    const plan = planOverride || loadActivePlan(tenantId);
    if (!plan) {
      return { status: 'fail', flagCount: 1, flags: ['No active plan found'] };
    }

    const config = plan.configuration;
    if (config.type === 'additive_lookup') {
      const variants = config.variants || [];
      if (variants.length === 0) {
        flags.push('Plan has no variants');
      }
      for (const variant of variants) {
        const components = variant.components || [];
        if (components.length === 0) {
          flags.push(`Variant "${variant.variantName}" has no components`);
        }
        for (const comp of components) {
          checkComponentMonotonicity(comp, flags);
        }
      }
    }
  } catch {
    flags.push('Failed to read plan');
  }

  return {
    status: flags.length === 0 ? 'pass' : 'warning',
    flagCount: flags.length,
    flags,
  };
}

function checkComponentMonotonicity(comp: PlanComponent, flags: string[]): void {
  if (comp.componentType === 'tier_lookup' && comp.tierConfig) {
    const tiers = comp.tierConfig.tiers;
    for (let i = 1; i < tiers.length; i++) {
      if (tiers[i].min < tiers[i - 1].min) {
        flags.push(`${comp.name}: tier boundaries not monotonic at index ${i}`);
      }
    }
  }
  if (comp.componentType === 'matrix_lookup' && comp.matrixConfig) {
    const { rowBands, columnBands } = comp.matrixConfig;
    for (let i = 1; i < rowBands.length; i++) {
      if (rowBands[i].min < rowBands[i - 1].min) {
        flags.push(`${comp.name}: row bands not monotonic at index ${i}`);
      }
    }
    for (let i = 1; i < columnBands.length; i++) {
      if (columnBands[i].min < columnBands[i - 1].min) {
        flags.push(`${comp.name}: column bands not monotonic at index ${i}`);
      }
    }
  }
}

// --- Layer 2: Metric ---
function checkMetricLayer(
  tenantId: string
): PipelineLayer & { sheetsWithPeriod: number; totalSheets: number } {
  const flags: string[] = [];
  let sheetsWithPeriod = 0;
  let totalSheets = 0;

  try {
    const aggData = loadAggregatedData(tenantId);
    if (!aggData || aggData.length === 0) {
      return {
        status: 'fail', flagCount: 1,
        flags: ['No aggregated data found'],
        sheetsWithPeriod: 0, totalSheets: 0,
      };
    }

    // Count sheets from first employee's componentMetrics
    const firstEmp = aggData[0];
    const metrics = firstEmp?.componentMetrics;
    if (metrics && typeof metrics === 'object') {
      const sheets = Object.keys(metrics);
      totalSheets = sheets.length;
      // Check if employees have period info
      for (const emp of aggData.slice(0, 10)) {
        if (emp.month || emp.year) {
          sheetsWithPeriod = totalSheets; // Period detected at employee level
          break;
        }
      }
    }

    if (totalSheets === 0) {
      flags.push('No component metrics found in aggregated data');
    }
  } catch {
    flags.push('Failed to read aggregated data');
  }

  return {
    status: flags.length === 0 ? 'pass' : flags.some(f => f.includes('No')) ? 'fail' : 'warning',
    flagCount: flags.length,
    flags,
    sheetsWithPeriod,
    totalSheets,
  };
}

// --- Layer 3: Component ---
function checkComponentLayer(
  traces?: CalculationTrace[],
  comparisonData?: { data: Record<string, unknown>[]; mapping: ColumnMapping }
): PipelineLayer & { coincidentalCount: number } {
  const flags: string[] = [];
  let coincidentalCount = 0;

  if (!traces || traces.length === 0) {
    flags.push('No calculation traces available');
  }

  if (!comparisonData) {
    flags.push('Awaiting comparison data upload');
  }

  if (traces && comparisonData) {
    // Would need full reconciliation to count coincidental matches
    // This is computed during runReconciliation; here we report placeholder
    flags.push('Run reconciliation to detect coincidental matches');
  }

  return {
    status: flags.length === 0 ? 'pass' : 'warning',
    flagCount: flags.length,
    flags,
    coincidentalCount,
  };
}

// --- Layer 4: Population ---
function checkPopulationLayer(
  tenantId: string
): PipelineLayer & { employees: number; duplicates: number; periods: number } {
  const flags: string[] = [];
  let employees = 0;
  let duplicates = 0;
  let periods = 0;

  try {
    const aggData = loadAggregatedData(tenantId);
    if (!aggData || aggData.length === 0) {
      return {
        status: 'fail', flagCount: 1,
        flags: ['No aggregated data'],
        employees: 0, duplicates: 0, periods: 0,
      };
    }

    const idSet = new Set<string>();
    const periodSet = new Set<string>();

    for (const emp of aggData) {
      const id = emp.employeeId || '';
      if (idSet.has(id)) duplicates++;
      idSet.add(id);
      if (emp.month && emp.year) {
        periodSet.add(`${emp.year}-${emp.month}`);
      }
    }

    employees = idSet.size;
    periods = periodSet.size || 1;

    if (duplicates > 0) {
      flags.push(`${duplicates} duplicate employee IDs detected`);
    }
  } catch {
    flags.push('Failed to read population data');
  }

  return {
    status: flags.length === 0 ? 'pass' : duplicates > 0 ? 'warning' : 'fail',
    flagCount: flags.length,
    flags,
    employees,
    duplicates,
    periods,
  };
}

// --- Layer 5: Outcome ---
function checkOutcomeLayer(
  tenantId: string,
  traces?: CalculationTrace[],
  comparisonData?: { data: Record<string, unknown>[]; mapping: ColumnMapping }
): PipelineLayer & { vlTotal: number; gtTotal?: number } {
  const flags: string[] = [];
  let vlTotal = 0;
  let gtTotal: number | undefined;

  if (traces && traces.length > 0) {
    vlTotal = traces.reduce((sum, t) => sum + t.totalIncentive, 0);
  } else {
    // Try loading from calculation results
    vlTotal = loadLatestVLTotal(tenantId);
  }

  if (vlTotal === 0) {
    flags.push('No VL calculation total available');
  }

  if (comparisonData) {
    const totalMapping = comparisonData.mapping.mappings.find(m => m.mappedTo === 'total');
    if (totalMapping) {
      gtTotal = comparisonData.data.reduce(
        (sum, row) => sum + (Number(row[totalMapping.sourceColumn]) || 0),
        0
      );
      const diff = vlTotal - gtTotal;
      const pct = gtTotal > 0 ? (Math.abs(diff) / gtTotal * 100).toFixed(1) : '0';
      if (Math.abs(diff) > 5000) {
        flags.push(`VL-GT difference: $${diff.toLocaleString()} (${pct}%)`);
      }
    }
  }

  return {
    status: flags.length === 0 ? 'pass' : vlTotal === 0 ? 'fail' : 'warning',
    flagCount: flags.length,
    flags,
    vlTotal,
    gtTotal,
  };
}

// =============================================================================
// HELPERS — load data from localStorage
// =============================================================================

function loadActivePlan(tenantId: string): CompensationPlanConfig | null {
  if (typeof window === 'undefined') return null;
  try {
    const plansStr = localStorage.getItem('compensation_plans');
    if (!plansStr) return null;
    const plans: CompensationPlanConfig[] = JSON.parse(plansStr, (_, v) =>
      v === 'INFINITY' ? Infinity : v
    );
    return plans.find(p => p.tenantId === tenantId && p.status === 'active') ||
           plans.find(p => p.tenantId === tenantId) ||
           null;
  } catch {
    return null;
  }
}

function loadAggregatedData(tenantId: string): Array<Record<string, unknown>> {
  if (typeof window === 'undefined') return [];
  try {
    // Try chunked format first
    const metaStr = localStorage.getItem(`data_layer_committed_aggregated_${tenantId}_meta`);
    if (metaStr) {
      const meta = JSON.parse(metaStr);
      const results: Array<Record<string, unknown>> = [];
      for (let i = 0; i < (meta.chunkCount || 100); i++) {
        const chunkKey = `data_layer_committed_aggregated_${tenantId}_chunk_${i}`;
        const chunkData = localStorage.getItem(chunkKey);
        if (!chunkData) break;
        results.push(...JSON.parse(chunkData));
      }
      return results;
    }

    // Try single-key format
    const raw = localStorage.getItem(`data_layer_committed_aggregated_${tenantId}`);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function loadLatestVLTotal(tenantId: string): number {
  if (typeof window === 'undefined') return 0;
  try {
    const runsStr = localStorage.getItem('vialuce_calculation_runs');
    if (!runsStr) return 0;
    const runs = JSON.parse(runsStr);
    const latest = runs
      .filter((r: { tenantId: string; status: string }) => r.tenantId === tenantId && r.status === 'completed')
      .sort((a: { startedAt: string }, b: { startedAt: string }) =>
        new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
      )[0];
    return latest?.totalPayout || 0;
  } catch {
    return 0;
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  loadActivePlan,
  loadAggregatedData,
};
