/**
 * Calculation Results Formatter
 *
 * Formats calculation results for:
 * - Display in UI
 * - Export to CSV/Excel
 * - Reconciliation comparison
 * - Legacy system compatibility
 */

import type { CalculationResult, CalculationStep } from '@/types/compensation-plan';

// ============================================
// TYPES
// ============================================

export interface FormattedResult {
  employeeId: string;
  employeeName: string;
  employeeRole: string;
  storeId?: string;
  storeName?: string;
  planName: string;
  variantName?: string;
  period: string;
  periodLabel: string;
  components: FormattedComponent[];
  totalIncentive: number;
  totalIncentiveFormatted: string;
  currency: string;
  calculatedAt: string;
  warnings?: string[];
}

export interface FormattedComponent {
  order: number;
  name: string;
  type: string;
  description: string;
  calculation: string;
  value: number;
  valueFormatted: string;
  inputDetails?: Record<string, string>;
}

export interface ReconciliationFormat {
  employeeId: string;
  employeeName: string;
  period: string;
  planId: string;
  planName: string;
  componentBreakdown: Record<string, number>;
  totalIncentive: number;
  metadata: {
    calculatedAt: string;
    planVersion: number;
    variantId?: string;
  };
}

export interface LegacyExportFormat {
  EMP_ID: string;
  EMP_NAME: string;
  STORE_ID: string;
  STORE_NAME: string;
  PERIOD: string;
  PLAN_NAME: string;
  OPTICAL_BONUS: number;
  STORE_BONUS: number;
  CUSTOMER_BONUS: number;
  COLLECTION_BONUS: number;
  INSURANCE_BONUS: number;
  SERVICES_BONUS: number;
  TOTAL_INCENTIVE: number;
  CURRENCY: string;
  CALC_DATE: string;
}

export interface ExportOptions {
  format: 'csv' | 'json' | 'legacy';
  includeDetails: boolean;
  locale?: string;
  currency?: string;
}

// ============================================
// FORMATTERS
// ============================================

/**
 * Format a calculation result for display
 */
export function formatResult(
  result: CalculationResult,
  locale: string = 'en-US'
): FormattedResult {
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: result.currency || 'USD',
  });

  const periodLabel = formatPeriodLabel(result.period, locale);

  return {
    employeeId: result.employeeId,
    employeeName: result.employeeName,
    employeeRole: result.employeeRole,
    storeId: result.storeId,
    storeName: result.storeName,
    planName: result.planName,
    variantName: result.variantName,
    period: result.period,
    periodLabel,
    components: result.components.map((c) => formatComponent(c, locale)),
    totalIncentive: result.totalIncentive,
    totalIncentiveFormatted: formatter.format(result.totalIncentive),
    currency: result.currency,
    calculatedAt: result.calculatedAt,
    warnings: result.warnings,
  };
}

/**
 * Format a calculation component for display
 */
function formatComponent(
  step: CalculationStep,
  locale: string = 'en-US'
): FormattedComponent {
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: step.currency || 'USD',
  });

  const inputDetails: Record<string, string> = {};

  // Format input details
  if (step.inputs) {
    if (step.inputs.actual !== undefined) {
      inputDetails['Actual'] = formatMetricValue(step.inputs.actual, step.componentType);
    }
    if (step.inputs.target !== undefined && step.inputs.target > 0) {
      inputDetails['Target'] = formatMetricValue(step.inputs.target, step.componentType);
    }
    if (step.inputs.attainment !== undefined) {
      inputDetails['Attainment'] = `${(step.inputs.attainment * 100).toFixed(1)}%`;
    }
    if (step.inputs.additionalFactors) {
      for (const [key, value] of Object.entries(step.inputs.additionalFactors)) {
        inputDetails[formatLabel(key)] = typeof value === 'number'
          ? formatter.format(value)
          : String(value);
      }
    }
  }

  // Add lookup details
  if (step.lookupDetails) {
    if (step.lookupDetails.rowBand) {
      inputDetails['Row Band'] = step.lookupDetails.rowBand;
    }
    if (step.lookupDetails.colBand) {
      inputDetails['Column Band'] = step.lookupDetails.colBand;
    }
    if (step.lookupDetails.tierLabel) {
      inputDetails['Tier'] = step.lookupDetails.tierLabel;
    }
  }

  return {
    order: step.order,
    name: step.componentName,
    type: formatComponentType(step.componentType),
    description: step.description,
    calculation: step.calculation,
    value: step.outputValue,
    valueFormatted: formatter.format(step.outputValue),
    inputDetails: Object.keys(inputDetails).length > 0 ? inputDetails : undefined,
  };
}

/**
 * Format results for reconciliation comparison
 */
export function formatForReconciliation(result: CalculationResult): ReconciliationFormat {
  const componentBreakdown: Record<string, number> = {};

  for (const component of result.components) {
    componentBreakdown[component.componentId] = component.outputValue;
  }

  return {
    employeeId: result.employeeId,
    employeeName: result.employeeName,
    period: result.period,
    planId: result.planId,
    planName: result.planName,
    componentBreakdown,
    totalIncentive: result.totalIncentive,
    metadata: {
      calculatedAt: result.calculatedAt,
      planVersion: result.planVersion,
      variantId: result.variantId,
    },
  };
}

/**
 * Format result for legacy system export
 */
export function formatForLegacyExport(result: CalculationResult): LegacyExportFormat {
  // Map component names to legacy column names
  const componentMap: Record<string, keyof LegacyExportFormat> = {
    'comp-optical': 'OPTICAL_BONUS',
    'optical': 'OPTICAL_BONUS',
    'Optical Sales': 'OPTICAL_BONUS',
    'comp-store': 'STORE_BONUS',
    'store': 'STORE_BONUS',
    'Store Performance': 'STORE_BONUS',
    'comp-customers': 'CUSTOMER_BONUS',
    'customers': 'CUSTOMER_BONUS',
    'New Customers': 'CUSTOMER_BONUS',
    'comp-collections': 'COLLECTION_BONUS',
    'collections': 'COLLECTION_BONUS',
    'Collections': 'COLLECTION_BONUS',
    'comp-insurance': 'INSURANCE_BONUS',
    'insurance': 'INSURANCE_BONUS',
    'Insurance Sales': 'INSURANCE_BONUS',
    'comp-services': 'SERVICES_BONUS',
    'services': 'SERVICES_BONUS',
    'Additional Services': 'SERVICES_BONUS',
  };

  const legacyResult: LegacyExportFormat = {
    EMP_ID: result.employeeId,
    EMP_NAME: result.employeeName,
    STORE_ID: result.storeId || '',
    STORE_NAME: result.storeName || '',
    PERIOD: result.period,
    PLAN_NAME: result.planName,
    OPTICAL_BONUS: 0,
    STORE_BONUS: 0,
    CUSTOMER_BONUS: 0,
    COLLECTION_BONUS: 0,
    INSURANCE_BONUS: 0,
    SERVICES_BONUS: 0,
    TOTAL_INCENTIVE: result.totalIncentive,
    CURRENCY: result.currency,
    CALC_DATE: result.calculatedAt,
  };

  // Map components to legacy columns
  for (const component of result.components) {
    const legacyKey =
      componentMap[component.componentId] ||
      componentMap[component.componentName];

    if (legacyKey && legacyKey in legacyResult) {
      (legacyResult[legacyKey] as number) = component.outputValue;
    }
  }

  return legacyResult;
}

/**
 * Export results to CSV format
 */
export function exportToCSV(
  results: CalculationResult[],
  options: ExportOptions = { format: 'csv', includeDetails: false }
): string {
  if (results.length === 0) return '';

  if (options.format === 'legacy') {
    return exportLegacyCSV(results);
  }

  const headers = [
    'Employee ID',
    'Employee Name',
    'Role',
    'Store ID',
    'Store Name',
    'Period',
    'Plan Name',
    'Total Incentive',
    'Currency',
    'Calculated At',
  ];

  if (options.includeDetails) {
    // Get all unique component names
    const componentNames = new Set<string>();
    for (const result of results) {
      for (const component of result.components) {
        componentNames.add(component.componentName);
      }
    }
    headers.push(...Array.from(componentNames));
  }

  const rows = results.map((result) => {
    const row = [
      result.employeeId,
      result.employeeName,
      result.employeeRole,
      result.storeId || '',
      result.storeName || '',
      result.period,
      result.planName,
      result.totalIncentive.toFixed(2),
      result.currency,
      result.calculatedAt,
    ];

    if (options.includeDetails) {
      const componentValues = new Map<string, number>();
      for (const component of result.components) {
        componentValues.set(component.componentName, component.outputValue);
      }

      // Get all unique component names in order
      const componentNames = new Set<string>();
      for (const r of results) {
        for (const c of r.components) {
          componentNames.add(c.componentName);
        }
      }

      for (const name of Array.from(componentNames)) {
        row.push((componentValues.get(name) || 0).toFixed(2));
      }
    }

    return row;
  });

  return [headers.join(','), ...rows.map((r) => r.map(escapeCSV).join(','))].join('\n');
}

/**
 * Export to legacy CSV format
 */
function exportLegacyCSV(results: CalculationResult[]): string {
  const headers = [
    'EMP_ID',
    'EMP_NAME',
    'STORE_ID',
    'STORE_NAME',
    'PERIOD',
    'PLAN_NAME',
    'OPTICAL_BONUS',
    'STORE_BONUS',
    'CUSTOMER_BONUS',
    'COLLECTION_BONUS',
    'INSURANCE_BONUS',
    'SERVICES_BONUS',
    'TOTAL_INCENTIVE',
    'CURRENCY',
    'CALC_DATE',
  ];

  const rows = results.map((result) => {
    const legacy = formatForLegacyExport(result);
    return [
      legacy.EMP_ID,
      legacy.EMP_NAME,
      legacy.STORE_ID,
      legacy.STORE_NAME,
      legacy.PERIOD,
      legacy.PLAN_NAME,
      legacy.OPTICAL_BONUS.toFixed(2),
      legacy.STORE_BONUS.toFixed(2),
      legacy.CUSTOMER_BONUS.toFixed(2),
      legacy.COLLECTION_BONUS.toFixed(2),
      legacy.INSURANCE_BONUS.toFixed(2),
      legacy.SERVICES_BONUS.toFixed(2),
      legacy.TOTAL_INCENTIVE.toFixed(2),
      legacy.CURRENCY,
      legacy.CALC_DATE,
    ];
  });

  return [headers.join(','), ...rows.map((r) => r.map(escapeCSV).join(','))].join('\n');
}

// ============================================
// HELPERS
// ============================================

function formatPeriodLabel(period: string, locale: string = 'en-US'): string {
  // Try to parse as YYYY-MM
  const match = period.match(/^(\d{4})-(\d{2})$/);
  if (match) {
    const [, year, month] = match;
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString(locale, { year: 'numeric', month: 'long' });
  }

  return period;
}

function formatComponentType(type: string): string {
  const typeLabels: Record<string, string> = {
    matrix_lookup: 'Matrix Lookup',
    tier_lookup: 'Tier Lookup',
    percentage: 'Percentage',
    conditional_percentage: 'Conditional %',
  };

  return typeLabels[type] || type;
}

function formatLabel(key: string): string {
  return key
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatMetricValue(value: number, componentType: string): string {
  if (componentType === 'percentage' || componentType === 'conditional_percentage') {
    return `$${value.toLocaleString()}`;
  }

  // Most metrics are percentages
  if (value > 0 && value < 200) {
    return `${value.toFixed(1)}%`;
  }

  return value.toLocaleString();
}

function escapeCSV(value: string | number): string {
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// ============================================
// BATCH OPERATIONS
// ============================================

/**
 * Format multiple results for display
 */
export function formatResults(
  results: CalculationResult[],
  locale: string = 'en-US'
): FormattedResult[] {
  return results.map((r) => formatResult(r, locale));
}

/**
 * Get summary statistics for results
 */
export function getResultsSummary(results: CalculationResult[]): {
  totalEmployees: number;
  totalPayout: number;
  averagePayout: number;
  minPayout: number;
  maxPayout: number;
  byPlan: Record<string, { count: number; total: number; average: number }>;
  byStore: Record<string, { count: number; total: number; average: number }>;
  byComponent: Record<string, { count: number; total: number; average: number }>;
} {
  if (results.length === 0) {
    return {
      totalEmployees: 0,
      totalPayout: 0,
      averagePayout: 0,
      minPayout: 0,
      maxPayout: 0,
      byPlan: {},
      byStore: {},
      byComponent: {},
    };
  }

  const byPlan: Record<string, { count: number; total: number; average: number }> = {};
  const byStore: Record<string, { count: number; total: number; average: number }> = {};
  const byComponent: Record<string, { count: number; total: number; average: number }> = {};

  let totalPayout = 0;
  let minPayout = Infinity;
  let maxPayout = -Infinity;

  for (const result of results) {
    totalPayout += result.totalIncentive;
    minPayout = Math.min(minPayout, result.totalIncentive);
    maxPayout = Math.max(maxPayout, result.totalIncentive);

    // By plan
    if (!byPlan[result.planName]) {
      byPlan[result.planName] = { count: 0, total: 0, average: 0 };
    }
    byPlan[result.planName].count++;
    byPlan[result.planName].total += result.totalIncentive;

    // By store
    const storeName = result.storeName || 'Unknown';
    if (!byStore[storeName]) {
      byStore[storeName] = { count: 0, total: 0, average: 0 };
    }
    byStore[storeName].count++;
    byStore[storeName].total += result.totalIncentive;

    // By component
    for (const component of result.components) {
      if (!byComponent[component.componentName]) {
        byComponent[component.componentName] = { count: 0, total: 0, average: 0 };
      }
      byComponent[component.componentName].count++;
      byComponent[component.componentName].total += component.outputValue;
    }
  }

  // Calculate averages
  for (const key of Object.keys(byPlan)) {
    byPlan[key].average = byPlan[key].total / byPlan[key].count;
  }
  for (const key of Object.keys(byStore)) {
    byStore[key].average = byStore[key].total / byStore[key].count;
  }
  for (const key of Object.keys(byComponent)) {
    byComponent[key].average = byComponent[key].total / byComponent[key].count;
  }

  return {
    totalEmployees: results.length,
    totalPayout,
    averagePayout: totalPayout / results.length,
    minPayout: minPayout === Infinity ? 0 : minPayout,
    maxPayout: maxPayout === -Infinity ? 0 : maxPayout,
    byPlan,
    byStore,
    byComponent,
  };
}
