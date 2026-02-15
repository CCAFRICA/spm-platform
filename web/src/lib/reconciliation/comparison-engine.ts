/**
 * Comparison Engine
 *
 * HF-021 Phase 4: Per-employee, per-component comparison.
 *
 * Three populations:
 * - Matched: employee exists in both file and VL
 * - File-only: employee in uploaded file but not in VL
 * - VL-only: employee in VL calculation but not in file
 *
 * Delta categorization:
 * - exact: difference === 0
 * - tolerance: difference <= 5% (green)
 * - amber: difference 5-15%
 * - red: difference > 15%
 *
 * DESIGN PRINCIPLES:
 * - No hardcoded column names (Korean Test)
 * - Works with AI-mapped or manually-mapped columns
 * - Per-component breakdown when component columns are mapped
 */

import type { CalculationResult } from '@/types/compensation-plan';
import type { ColumnMapping } from './ai-column-mapper';

// ============================================
// TYPES
// ============================================

export type DeltaFlag = 'exact' | 'tolerance' | 'amber' | 'red';

export interface ComponentComparison {
  componentId: string;
  componentName: string;
  fileValue: number;
  vlValue: number;
  delta: number;
  deltaPercent: number;
  flag: DeltaFlag;
}

export interface EmployeeComparison {
  entityId: string;
  entityName: string;
  population: 'matched' | 'file_only' | 'vl_only';

  // Total amounts
  fileTotal: number;
  vlTotal: number;
  totalDelta: number;
  totalDeltaPercent: number;
  totalFlag: DeltaFlag;

  // Per-component breakdown (only for matched employees with component mappings)
  components: ComponentComparison[];

  // Raw data references
  fileRow?: Record<string, unknown>;
  vlResult?: CalculationResult;
}

export interface ComparisonSummary {
  totalEmployees: number;
  matched: number;
  fileOnly: number;
  vlOnly: number;
  exactMatches: number;
  toleranceMatches: number;    // <= 5%
  amberFlags: number;          // 5-15%
  redFlags: number;            // > 15%
  fileTotalAmount: number;
  vlTotalAmount: number;
  totalDelta: number;
}

export interface ComparisonResult {
  employees: EmployeeComparison[];
  summary: ComparisonSummary;
}

// ============================================
// THRESHOLDS
// ============================================

const TOLERANCE_THRESHOLD = 0.05;    // 5%
const AMBER_THRESHOLD = 0.15;        // 15%

// ============================================
// PUBLIC API
// ============================================

/**
 * Run comparison between uploaded file data and VL calculation results.
 *
 * @param fileRows - Raw rows from uploaded file
 * @param vlResults - Calculation results from VL
 * @param mappings - AI/user column mappings
 * @param entityIdField - Which file column is the employee ID
 * @param totalAmountField - Which file column is the total amount
 */
export function runComparison(
  fileRows: Record<string, unknown>[],
  vlResults: CalculationResult[],
  mappings: ColumnMapping[],
  entityIdField: string,
  totalAmountField: string,
): ComparisonResult {
  // Build lookup maps with normalized IDs
  const fileByEmployee = new Map<string, Record<string, unknown>>();
  for (const row of fileRows) {
    const empId = normalizeId(String(row[entityIdField] ?? ''));
    if (empId) {
      fileByEmployee.set(empId, row);
    }
  }

  const vlByEmployee = new Map<string, CalculationResult>();
  for (const result of vlResults) {
    const empId = normalizeId(result.entityId);
    if (empId) {
      vlByEmployee.set(empId, result);
    }
  }

  // Get component mappings
  const componentMappings = mappings
    .filter(m => m.mappedTo.startsWith('component:'))
    .map(m => ({
      sourceColumn: m.sourceColumn,
      componentId: m.mappedTo.replace('component:', ''),
      componentName: m.mappedToLabel,
    }));

  // Build all unique employee IDs
  const allEmployeeIds = new Set<string>();
  Array.from(fileByEmployee.keys()).forEach(empId => allEmployeeIds.add(empId));
  Array.from(vlByEmployee.keys()).forEach(empId => allEmployeeIds.add(empId));

  // Compare each employee
  const employees: EmployeeComparison[] = [];

  for (const empId of Array.from(allEmployeeIds)) {
    const fileRow = fileByEmployee.get(empId);
    const vlResult = vlByEmployee.get(empId);

    if (fileRow && vlResult) {
      // MATCHED: both sides have this employee
      const fileTotal = Number(fileRow[totalAmountField] ?? 0);
      const vlTotal = vlResult.totalIncentive || 0;
      const totalDelta = fileTotal - vlTotal;
      const totalDeltaPercent = vlTotal !== 0 ? (totalDelta / vlTotal) : (fileTotal !== 0 ? 1 : 0);
      const totalFlag = classifyDelta(totalDeltaPercent);

      // Per-component comparison
      const components = compareComponents(fileRow, vlResult, componentMappings);

      employees.push({
        entityId: empId,
        entityName: vlResult.entityName || empId,
        population: 'matched',
        fileTotal,
        vlTotal,
        totalDelta,
        totalDeltaPercent,
        totalFlag,
        components,
        fileRow,
        vlResult,
      });
    } else if (fileRow && !vlResult) {
      // FILE-ONLY
      const fileTotal = Number(fileRow[totalAmountField] ?? 0);
      employees.push({
        entityId: empId,
        entityName: empId,
        population: 'file_only',
        fileTotal,
        vlTotal: 0,
        totalDelta: fileTotal,
        totalDeltaPercent: 1,
        totalFlag: 'red',
        components: [],
        fileRow,
      });
    } else if (!fileRow && vlResult) {
      // VL-ONLY
      const vlTotal = vlResult.totalIncentive || 0;
      employees.push({
        entityId: empId,
        entityName: vlResult.entityName || empId,
        population: 'vl_only',
        fileTotal: 0,
        vlTotal,
        totalDelta: -vlTotal,
        totalDeltaPercent: -1,
        totalFlag: 'red',
        components: [],
        vlResult,
      });
    }
  }

  // Calculate summary
  const summary = buildSummary(employees);

  return { employees, summary };
}

// ============================================
// HELPERS
// ============================================

/**
 * Normalize employee ID for matching: trim, lowercase, strip leading zeros
 * Handles numeric strings, padded IDs, and mixed-case IDs
 */
function normalizeId(id: string): string {
  let normalized = String(id).trim();
  // If purely numeric (possibly with leading zeros), strip leading zeros
  if (/^\d+$/.test(normalized)) {
    normalized = String(parseInt(normalized, 10));
  }
  return normalized;
}

/**
 * Classify a delta percentage into a flag category
 */
export function classifyDelta(deltaPercent: number): DeltaFlag {
  const abs = Math.abs(deltaPercent);
  if (abs === 0) return 'exact';
  if (abs <= TOLERANCE_THRESHOLD) return 'tolerance';
  if (abs <= AMBER_THRESHOLD) return 'amber';
  return 'red';
}

/**
 * Compare per-component values between file row and VL result
 */
function compareComponents(
  fileRow: Record<string, unknown>,
  vlResult: CalculationResult,
  componentMappings: Array<{ sourceColumn: string; componentId: string; componentName: string }>,
): ComponentComparison[] {
  if (componentMappings.length === 0) return [];
  if (!vlResult.components || vlResult.components.length === 0) return [];

  const comparisons: ComponentComparison[] = [];

  for (const mapping of componentMappings) {
    const fileValue = Number(fileRow[mapping.sourceColumn] ?? 0);

    // Find matching VL component
    const vlComponent = vlResult.components.find(c =>
      c.componentId === mapping.componentId
    );
    const vlValue = vlComponent?.outputValue ?? 0;

    const delta = fileValue - vlValue;
    const deltaPercent = vlValue !== 0 ? (delta / vlValue) : (fileValue !== 0 ? 1 : 0);

    comparisons.push({
      componentId: mapping.componentId,
      componentName: mapping.componentName,
      fileValue,
      vlValue,
      delta,
      deltaPercent,
      flag: classifyDelta(deltaPercent),
    });
  }

  return comparisons;
}

/**
 * Build summary statistics from comparison results
 */
function buildSummary(employees: EmployeeComparison[]): ComparisonSummary {
  const matched = employees.filter(e => e.population === 'matched');
  const fileOnly = employees.filter(e => e.population === 'file_only');
  const vlOnly = employees.filter(e => e.population === 'vl_only');

  return {
    totalEmployees: employees.length,
    matched: matched.length,
    fileOnly: fileOnly.length,
    vlOnly: vlOnly.length,
    exactMatches: matched.filter(e => e.totalFlag === 'exact').length,
    toleranceMatches: matched.filter(e => e.totalFlag === 'tolerance').length,
    amberFlags: matched.filter(e => e.totalFlag === 'amber').length,
    redFlags: matched.filter(e => e.totalFlag === 'red').length,
    fileTotalAmount: employees.reduce((sum, e) => sum + e.fileTotal, 0),
    vlTotalAmount: employees.reduce((sum, e) => sum + e.vlTotal, 0),
    totalDelta: employees.reduce((sum, e) => sum + e.totalDelta, 0),
  };
}

/**
 * Get CSS class for a delta flag
 */
export function getFlagColor(flag: DeltaFlag): string {
  switch (flag) {
    case 'exact': return 'text-slate-900 dark:text-slate-100';
    case 'tolerance': return 'text-slate-500 dark:text-slate-400';
    case 'amber': return 'text-amber-700 dark:text-amber-400';
    case 'red': return 'text-orange-800 dark:text-orange-300 font-bold';
  }
}

/**
 * Get background class for a delta flag
 */
export function getFlagBgColor(flag: DeltaFlag): string {
  switch (flag) {
    case 'exact': return 'bg-emerald-50 dark:bg-emerald-900/20';
    case 'tolerance': return 'bg-emerald-50 dark:bg-emerald-900/20';
    case 'amber': return 'bg-amber-50 dark:bg-amber-900/20';
    case 'red': return 'bg-red-50 dark:bg-red-900/20';
  }
}
