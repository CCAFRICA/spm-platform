/**
 * Adaptive Multi-Layer Comparison Engine
 *
 * OB-38 Phase 5: Compare at every layer the data supports.
 *
 * Wraps the existing comparison engine (L1 employee, L2 component) and adds:
 *   L0 Aggregate  -- Total-level comparison with false-green detection
 *   L4 Store      -- Store-level grouping and sub-totals
 *
 * Flow:
 *   1. Run depth assessment to discover available layers
 *   2. Run comparison at each available layer
 *   3. Cross-validate: flag false greens where totals match but components diverge
 *   4. Return unified multi-layer result
 */

import type { CalculationResult } from '@/types/compensation-plan';
import type { ColumnMapping } from './ai-column-mapper';
import {
  runComparison,
  classifyDelta,
  type ComparisonResult,
  type ComparisonSummary,
  type EmployeeComparison,
  type DeltaFlag,
} from './comparison-engine';
import {
  assessComparisonDepth,
  type DepthAssessment,
  type ComparisonLayer,
} from './comparison-depth-engine';

// ============================================
// TYPES
// ============================================

export interface AggregateComparison {
  fileTotal: number;
  vlTotal: number;
  delta: number;
  deltaPercent: number;
  flag: DeltaFlag;
  employeeCountFile: number;
  employeeCountVL: number;
}

export interface StoreComparison {
  storeId: string;
  storeName: string;
  fileTotal: number;
  vlTotal: number;
  delta: number;
  deltaPercent: number;
  flag: DeltaFlag;
  employeeCount: number;
  fileEmployeeCount: number;
  vlEmployeeCount: number;
}

export interface FalseGreenAlert {
  employeeId: string;
  employeeName: string;
  totalDelta: number;
  totalFlag: DeltaFlag;
  componentFlags: Array<{
    componentName: string;
    flag: DeltaFlag;
    delta: number;
  }>;
  reason: string;
}

export interface AdaptiveComparisonResult {
  // Depth assessment
  depth: DepthAssessment;

  // L0: Aggregate comparison
  aggregate: AggregateComparison | null;

  // L1 + L2: Employee + component comparison (from existing engine)
  employeeComparison: ComparisonResult | null;
  summary: ComparisonSummary | null;

  // L4: Store-level grouping
  storeComparisons: StoreComparison[];

  // Cross-layer validation
  falseGreens: FalseGreenAlert[];

  // Layers that were actually compared
  comparedLayers: ComparisonLayer[];
}

// ============================================
// PUBLIC API
// ============================================

/**
 * Run adaptive multi-layer comparison.
 * Automatically assesses depth, then compares at every available layer.
 */
export function runAdaptiveComparison(
  fileRows: Record<string, unknown>[],
  vlResults: CalculationResult[],
  mappings: ColumnMapping[],
  employeeIdField: string,
  totalAmountField: string,
): AdaptiveComparisonResult {
  // Step 1: Assess comparison depth
  const depth = assessComparisonDepth({
    vlResults,
    fileRows,
    mappings,
    employeeIdField,
    totalAmountField,
  });

  const comparedLayers: ComparisonLayer[] = [];
  let aggregate: AggregateComparison | null = null;
  let employeeComparison: ComparisonResult | null = null;
  let summary: ComparisonSummary | null = null;
  let storeComparisons: StoreComparison[] = [];
  let falseGreens: FalseGreenAlert[] = [];

  // Step 2: L0 Aggregate (always attempt if any data exists)
  const aggregateLayer = depth.layers.find(l => l.layer === 'aggregate');
  if (aggregateLayer && aggregateLayer.status !== 'unavailable') {
    aggregate = computeAggregate(fileRows, vlResults, totalAmountField);
    comparedLayers.push('aggregate');
  }

  // Step 3: L1 Employee + L2 Component (use existing engine)
  const employeeLayer = depth.layers.find(l => l.layer === 'employee');
  if (employeeLayer && employeeLayer.status !== 'unavailable') {
    employeeComparison = runComparison(fileRows, vlResults, mappings, employeeIdField, totalAmountField);
    summary = employeeComparison.summary;
    comparedLayers.push('employee');

    // Check if component layer was used
    const componentLayer = depth.layers.find(l => l.layer === 'component');
    if (componentLayer && componentLayer.status !== 'unavailable') {
      const hasComponentData = employeeComparison.employees.some(e => e.components.length > 0);
      if (hasComponentData) {
        comparedLayers.push('component');
      }
    }
  }

  // Step 4: L4 Store grouping
  const storeLayer = depth.layers.find(l => l.layer === 'store');
  if (storeLayer && storeLayer.status !== 'unavailable' && employeeComparison) {
    storeComparisons = computeStoreComparisons(employeeComparison.employees, vlResults);
    if (storeComparisons.length > 0) {
      comparedLayers.push('store');
    }
  }

  // Step 5: Cross-validate -- detect false greens
  if (employeeComparison && comparedLayers.includes('component')) {
    falseGreens = detectFalseGreens(employeeComparison.employees);
  }

  return {
    depth,
    aggregate,
    employeeComparison,
    summary,
    storeComparisons,
    falseGreens,
    comparedLayers,
  };
}

// ============================================
// L0: AGGREGATE COMPARISON
// ============================================

function computeAggregate(
  fileRows: Record<string, unknown>[],
  vlResults: CalculationResult[],
  totalAmountField: string,
): AggregateComparison {
  const fileTotal = fileRows.reduce((sum, row) => {
    const val = parseFloat(String(row[totalAmountField] || '0'));
    return sum + (isNaN(val) ? 0 : val);
  }, 0);

  const vlTotal = vlResults.reduce((sum, r) => sum + (r.totalIncentive || 0), 0);

  const delta = fileTotal - vlTotal;
  const deltaPercent = vlTotal !== 0 ? (delta / vlTotal) : (fileTotal !== 0 ? 1 : 0);

  return {
    fileTotal,
    vlTotal,
    delta,
    deltaPercent,
    flag: classifyDelta(deltaPercent),
    employeeCountFile: fileRows.length,
    employeeCountVL: vlResults.length,
  };
}

// ============================================
// L4: STORE-LEVEL GROUPING
// ============================================

function computeStoreComparisons(
  employees: EmployeeComparison[],
  vlResults: CalculationResult[],
): StoreComparison[] {
  // Build store-to-employee mapping from VL results
  const storeMap = new Map<string, {
    storeName: string;
    fileTotal: number;
    vlTotal: number;
    employeeIds: Set<string>;
    fileEmployeeIds: Set<string>;
    vlEmployeeIds: Set<string>;
  }>();

  // Assign employees to stores using VL result storeId
  const vlByEmployee = new Map<string, CalculationResult>();
  for (const r of vlResults) {
    vlByEmployee.set(normalizeId(r.employeeId), r);
  }

  for (const emp of employees) {
    const vlResult = emp.vlResult || vlByEmployee.get(normalizeId(emp.employeeId));
    const storeId = vlResult?.storeId || 'unknown';
    const storeName = vlResult?.storeName || storeId;

    if (!storeMap.has(storeId)) {
      storeMap.set(storeId, {
        storeName,
        fileTotal: 0,
        vlTotal: 0,
        employeeIds: new Set<string>(),
        fileEmployeeIds: new Set<string>(),
        vlEmployeeIds: new Set<string>(),
      });
    }

    const store = storeMap.get(storeId)!;
    store.employeeIds.add(emp.employeeId);
    store.fileTotal += emp.fileTotal;
    store.vlTotal += emp.vlTotal;

    if (emp.population === 'matched' || emp.population === 'file_only') {
      store.fileEmployeeIds.add(emp.employeeId);
    }
    if (emp.population === 'matched' || emp.population === 'vl_only') {
      store.vlEmployeeIds.add(emp.employeeId);
    }
  }

  // Convert to array and compute deltas
  const comparisons: StoreComparison[] = [];
  storeMap.forEach((store, storeId) => {
    if (storeId === 'unknown' && store.employeeIds.size === 0) return;

    const delta = store.fileTotal - store.vlTotal;
    const deltaPercent = store.vlTotal !== 0 ? (delta / store.vlTotal) : (store.fileTotal !== 0 ? 1 : 0);

    comparisons.push({
      storeId,
      storeName: store.storeName,
      fileTotal: store.fileTotal,
      vlTotal: store.vlTotal,
      delta,
      deltaPercent,
      flag: classifyDelta(deltaPercent),
      employeeCount: store.employeeIds.size,
      fileEmployeeCount: store.fileEmployeeIds.size,
      vlEmployeeCount: store.vlEmployeeIds.size,
    });
  });

  // Sort by absolute delta descending (biggest discrepancies first)
  comparisons.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  return comparisons;
}

// ============================================
// FALSE GREEN DETECTION
// ============================================

/**
 * Detect false greens: employees where total matches (exact/tolerance)
 * but one or more components are amber/red.
 * These are the HIGHEST PRIORITY findings because they indicate
 * offsetting errors that mask real discrepancies.
 */
function detectFalseGreens(employees: EmployeeComparison[]): FalseGreenAlert[] {
  const alerts: FalseGreenAlert[] = [];

  for (const emp of employees) {
    if (emp.population !== 'matched') continue;
    if (emp.components.length === 0) continue;

    // Total looks OK?
    const totalOk = emp.totalFlag === 'exact' || emp.totalFlag === 'tolerance';
    if (!totalOk) continue;

    // But components have issues?
    const badComponents = emp.components.filter(c =>
      c.flag === 'amber' || c.flag === 'red'
    );

    if (badComponents.length > 0) {
      alerts.push({
        employeeId: emp.employeeId,
        employeeName: emp.employeeName,
        totalDelta: emp.totalDelta,
        totalFlag: emp.totalFlag,
        componentFlags: badComponents.map(c => ({
          componentName: c.componentName,
          flag: c.flag,
          delta: c.delta,
        })),
        reason: `Total within tolerance (${(emp.totalDeltaPercent * 100).toFixed(1)}%) ` +
          `but ${badComponents.length} component(s) have significant differences. ` +
          `Offsetting errors may be masking real discrepancies.`,
      });
    }
  }

  // Sort by number of bad components descending
  alerts.sort((a, b) => b.componentFlags.length - a.componentFlags.length);

  return alerts;
}

// ============================================
// HELPERS
// ============================================

function normalizeId(id: string): string {
  let normalized = String(id).trim();
  if (/^\d+$/.test(normalized)) {
    normalized = String(parseInt(normalized, 10));
  }
  return normalized;
}
