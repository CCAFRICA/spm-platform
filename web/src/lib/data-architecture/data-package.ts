/**
 * Data Package Service
 *
 * Coordinates imported data files, detected periods, and data completeness.
 * Binds files to plans to periods for calculation readiness assessment.
 *
 * Period detection reads from committed aggregated data -- zero hardcoded periods.
 * Component completeness reads from plan components -- zero hardcoded component names.
 */

import { getPlans } from '@/lib/compensation/plan-storage';
import type { AdditiveLookupConfig } from '@/types/compensation-plan';

export interface DataPackage {
  packageId: string;
  tenantId: string;
  ruleSetId: string;
  period: string;
  status: 'assembling' | 'complete' | 'committed';
  files: DataPackageFile[];
  periodSelection: {
    selectedPeriod: string;
    cumulativeComponents: string[];
    pointInTimeComponents: string[];
  };
  dataCompleteness: DataCompleteness[];
  createdAt: string;
  updatedAt: string;
}

export interface DataPackageFile {
  fileId: string;
  fileName: string;
  importDate: string;
  sheetCount: number;
  recordCount: number;
  periodsDetected: string[];
}

export interface DataCompleteness {
  componentId: string;
  componentName: string;
  hasData: boolean;
  coverage: number; // 0-1
  sourceSheet: string;
  employeesWithData: number;
  totalEmployees: number;
}

const PACKAGE_PREFIX = 'vialuce_data_package_';

/**
 * Detect available periods from committed aggregated data.
 * Reads month/year fields from employee records -- handles any format.
 */
export function detectAvailablePeriods(tenantId: string): string[] {
  if (typeof window === 'undefined') return [];

  const key = `data_layer_committed_aggregated_${tenantId}`;
  const stored = localStorage.getItem(key);
  if (!stored) return [];

  try {
    const data: Array<Record<string, unknown>> = JSON.parse(stored);
    const periodSet = new Set<string>();

    for (const record of data) {
      const month = record.month;
      const year = record.year;
      if (month !== undefined && year !== undefined) {
        const monthStr = String(month).padStart(2, '0');
        const yearStr = String(year);
        periodSet.add(`${yearStr}-${monthStr}`);
      }
    }

    const periods = Array.from(periodSet).sort();
    return periods;
  } catch {
    return [];
  }
}

/**
 * Assess data completeness for each plan component in a given period.
 * Reads from committed data and plan definition -- zero hardcoded names.
 */
export function assessDataCompleteness(
  tenantId: string,
  ruleSetId: string,
  period?: string
): DataCompleteness[] {
  if (typeof window === 'undefined') return [];

  // Load plan
  const plans = getPlans(tenantId);
  const plan = plans.find(p => p.id === ruleSetId);
  if (!plan) return [];

  const config = plan.configuration as AdditiveLookupConfig;
  if (!config?.variants) return [];

  // Get all components from all variants (deduplicated by ID)
  const componentMap = new Map<string, { id: string; name: string }>();
  for (const variant of config.variants) {
    for (const comp of variant.components) {
      if (!componentMap.has(comp.id)) {
        componentMap.set(comp.id, { id: comp.id, name: comp.name });
      }
    }
  }

  // Load committed data
  const dataKey = `data_layer_committed_aggregated_${tenantId}`;
  const stored = localStorage.getItem(dataKey);
  if (!stored) {
    return Array.from(componentMap.values()).map(c => ({
      componentId: c.id,
      componentName: c.name,
      hasData: false,
      coverage: 0,
      sourceSheet: '',
      employeesWithData: 0,
      totalEmployees: 0,
    }));
  }

  const data: Array<Record<string, unknown>> = JSON.parse(stored);

  // Filter by period if specified
  let filtered = data;
  if (period) {
    const [year, month] = period.split('-');
    filtered = data.filter(r => {
      const rMonth = String(r.month || '').padStart(2, '0');
      const rYear = String(r.year || '');
      return rMonth === month && rYear === year;
    });
  }

  const totalEmployees = filtered.length;

  // Load AI import context for sheet-to-component mapping
  const aiContextKey = `vialuce_ai_import_context_${tenantId}`;
  const aiContextStr = localStorage.getItem(aiContextKey);
  const aiSheets: Array<{ sheetName: string; matchedComponent?: string }> = [];
  if (aiContextStr) {
    try {
      const ctx = JSON.parse(aiContextStr);
      if (ctx.sheets) aiSheets.push(...ctx.sheets);
    } catch { /* skip */ }
  }

  return Array.from(componentMap.values()).map(comp => {
    // Find which sheet maps to this component
    const matchedSheet = aiSheets.find(
      s => s.matchedComponent === comp.id || s.matchedComponent === comp.name
    );
    const sheetName = matchedSheet?.sheetName || '';

    // Count employees that have data for this component's sheet
    let employeesWithData = 0;
    for (const record of filtered) {
      const compMetrics = record.componentMetrics as Record<string, unknown> | undefined;
      if (compMetrics) {
        // Check if any sheet key contains data for this component
        const hasSheetData = sheetName
          ? compMetrics[sheetName] !== undefined
          : Object.keys(compMetrics).length > 0;
        if (hasSheetData) employeesWithData++;
      }
    }

    const coverage = totalEmployees > 0 ? employeesWithData / totalEmployees : 0;

    return {
      componentId: comp.id,
      componentName: comp.name,
      hasData: employeesWithData > 0,
      coverage,
      sourceSheet: sheetName,
      employeesWithData,
      totalEmployees,
    };
  });
}

/**
 * Save a data package.
 */
export function saveDataPackage(pkg: DataPackage): void {
  if (typeof window === 'undefined') return;
  const key = `${PACKAGE_PREFIX}${pkg.tenantId}_${pkg.period}`;
  pkg.updatedAt = new Date().toISOString();
  localStorage.setItem(key, JSON.stringify(pkg));
}

/**
 * Load a data package.
 */
export function loadDataPackage(tenantId: string, period: string): DataPackage | null {
  if (typeof window === 'undefined') return null;
  const key = `${PACKAGE_PREFIX}${tenantId}_${period}`;
  const stored = localStorage.getItem(key);
  if (!stored) return null;
  try {
    return JSON.parse(stored) as DataPackage;
  } catch {
    return null;
  }
}

/**
 * Create or update a data package for a calculation run.
 */
export function createOrUpdatePackage(
  tenantId: string,
  ruleSetId: string,
  period: string
): DataPackage {
  let pkg = loadDataPackage(tenantId, period);
  if (!pkg) {
    pkg = {
      packageId: `pkg-${tenantId}-${period}-${Date.now()}`,
      tenantId,
      ruleSetId,
      period,
      status: 'assembling',
      files: [],
      periodSelection: {
        selectedPeriod: period,
        cumulativeComponents: [],
        pointInTimeComponents: [],
      },
      dataCompleteness: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  // Refresh completeness
  pkg.dataCompleteness = assessDataCompleteness(tenantId, ruleSetId, period);

  // Determine cumulative vs point-in-time from plan
  const plans = getPlans(tenantId);
  const plan = plans.find(p => p.id === ruleSetId);
  if (plan) {
    const config = plan.configuration as AdditiveLookupConfig;
    const cumulative: string[] = [];
    const pointInTime: string[] = [];
    for (const variant of (config?.variants || [])) {
      for (const comp of variant.components) {
        if (comp.measurementPeriod === 'cumulative') {
          if (!cumulative.includes(comp.id)) cumulative.push(comp.id);
        } else {
          if (!pointInTime.includes(comp.id)) pointInTime.push(comp.id);
        }
      }
    }
    pkg.periodSelection.cumulativeComponents = cumulative;
    pkg.periodSelection.pointInTimeComponents = pointInTime;
  }

  const hasAllData = pkg.dataCompleteness.every(c => c.coverage > 0);
  pkg.status = hasAllData ? 'complete' : 'assembling';

  saveDataPackage(pkg);
  return pkg;
}
