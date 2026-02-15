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
  entityId: string;
  entityName: string;
  entityRole: string;
  storeId?: string;
  storeName?: string;
  ruleSetName: string;
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
  entityId: string;
  entityName: string;
  period: string;
  ruleSetId: string;
  ruleSetName: string;
  componentBreakdown: Record<string, number>;
  totalIncentive: number;
  metadata: {
    calculatedAt: string;
    ruleSetVersion: number;
    variantId?: string;
  };
}

/**
 * Legacy 30-Column Export Format
 *
 * Compatible with existing payroll and ERP systems.
 * Columns 1-12: Employee/period metadata
 * Columns 13-27: Component metrics (actual/target/attainment/bonus)
 * Columns 28-30: Totals and audit fields
 */
export interface LegacyExportFormat {
  // Columns 1-12: Employee/Period metadata
  EMP_ID: string;
  EMP_NAME: string;
  EMP_ROLE: string;
  DEPT_ID: string;
  DEPT_NAME: string;
  STORE_ID: string;
  STORE_NAME: string;
  MANAGER_ID: string;
  HIRE_DATE: string;
  PERIOD: string;
  PLAN_NAME: string;
  VARIANT_NAME: string;
  // Columns 13-16: Optical Sales
  OPTICAL_ACTUAL: number;
  OPTICAL_TARGET: number;
  OPTICAL_ATTAINMENT: number;
  OPTICAL_BONUS: number;
  // Columns 17-20: Store Performance
  STORE_ACTUAL: number;
  STORE_TARGET: number;
  STORE_ATTAINMENT: number;
  STORE_BONUS: number;
  // Columns 21-23: Customer acquisition (no target)
  CUSTOMER_ACTUAL: number;
  CUSTOMER_TARGET: number;
  CUSTOMER_BONUS: number;
  // Columns 24-26: Other components
  COLLECTION_BONUS: number;
  INSURANCE_BONUS: number;
  SERVICES_BONUS: number;
  // Columns 27-30: Totals and audit
  TOTAL_INCENTIVE: number;
  CURRENCY: string;
  CALC_DATE: string;
  CALC_VERSION: string;
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
    entityId: result.entityId,
    entityName: result.entityName,
    entityRole: result.entityRole,
    storeId: result.storeId,
    storeName: result.storeName,
    ruleSetName: result.ruleSetName,
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
    entityId: result.entityId,
    entityName: result.entityName,
    period: result.period,
    ruleSetId: result.ruleSetId,
    ruleSetName: result.ruleSetName,
    componentBreakdown,
    totalIncentive: result.totalIncentive,
    metadata: {
      calculatedAt: result.calculatedAt,
      ruleSetVersion: result.ruleSetVersion,
      variantId: result.variantId,
    },
  };
}

/**
 * Format result for legacy system export (30-column format)
 */
export function formatForLegacyExport(result: CalculationResult): LegacyExportFormat {
  // Component type identification patterns
  const opticalPatterns = ['comp-optical', 'optical', 'Optical Sales', 'Venta Óptica'];
  const storePatterns = ['comp-store', 'store', 'Store Performance', 'Tienda'];
  const customerPatterns = ['comp-customers', 'customers', 'New Customers', 'Clientes Nuevos'];
  const collectionPatterns = ['comp-collections', 'collections', 'Collections', 'Cobranza'];
  const insurancePatterns = ['comp-insurance', 'insurance', 'Insurance Sales', 'Seguros'];
  const servicesPatterns = ['comp-services', 'services', 'Additional Services', 'Servicios'];

  const matchesComponent = (component: { componentId: string; componentName: string }, patterns: string[]) =>
    patterns.some(p =>
      component.componentId.toLowerCase().includes(p.toLowerCase()) ||
      component.componentName.toLowerCase().includes(p.toLowerCase())
    );

  const legacyResult: LegacyExportFormat = {
    // Columns 1-12: Employee/Period metadata
    EMP_ID: result.entityId,
    EMP_NAME: result.entityName,
    EMP_ROLE: result.entityRole || '',
    DEPT_ID: result.departmentId || '',
    DEPT_NAME: result.departmentName || '',
    STORE_ID: result.storeId || '',
    STORE_NAME: result.storeName || '',
    MANAGER_ID: result.managerId || '',
    HIRE_DATE: result.hireDate || '',
    PERIOD: result.period,
    PLAN_NAME: result.ruleSetName,
    VARIANT_NAME: result.variantName || 'Standard',
    // Columns 13-16: Optical Sales
    OPTICAL_ACTUAL: 0,
    OPTICAL_TARGET: 0,
    OPTICAL_ATTAINMENT: 0,
    OPTICAL_BONUS: 0,
    // Columns 17-20: Store Performance
    STORE_ACTUAL: 0,
    STORE_TARGET: 0,
    STORE_ATTAINMENT: 0,
    STORE_BONUS: 0,
    // Columns 21-23: Customer acquisition
    CUSTOMER_ACTUAL: 0,
    CUSTOMER_TARGET: 0,
    CUSTOMER_BONUS: 0,
    // Columns 24-26: Other components
    COLLECTION_BONUS: 0,
    INSURANCE_BONUS: 0,
    SERVICES_BONUS: 0,
    // Columns 27-30: Totals and audit
    TOTAL_INCENTIVE: result.totalIncentive,
    CURRENCY: result.currency,
    CALC_DATE: result.calculatedAt,
    CALC_VERSION: `v${result.ruleSetVersion || 1}`,
  };

  // Map components to legacy columns with full detail
  for (const component of result.components) {
    const inputs = component.inputs || {};

    if (matchesComponent(component, opticalPatterns)) {
      legacyResult.OPTICAL_ACTUAL = inputs.actual || 0;
      legacyResult.OPTICAL_TARGET = inputs.target || 0;
      legacyResult.OPTICAL_ATTAINMENT = inputs.attainment ? inputs.attainment * 100 : 0;
      legacyResult.OPTICAL_BONUS = component.outputValue;
    } else if (matchesComponent(component, storePatterns)) {
      legacyResult.STORE_ACTUAL = inputs.actual || 0;
      legacyResult.STORE_TARGET = inputs.target || 0;
      legacyResult.STORE_ATTAINMENT = inputs.attainment ? inputs.attainment * 100 : 0;
      legacyResult.STORE_BONUS = component.outputValue;
    } else if (matchesComponent(component, customerPatterns)) {
      legacyResult.CUSTOMER_ACTUAL = inputs.actual || 0;
      legacyResult.CUSTOMER_TARGET = inputs.target || 0;
      legacyResult.CUSTOMER_BONUS = component.outputValue;
    } else if (matchesComponent(component, collectionPatterns)) {
      legacyResult.COLLECTION_BONUS = component.outputValue;
    } else if (matchesComponent(component, insurancePatterns)) {
      legacyResult.INSURANCE_BONUS = component.outputValue;
    } else if (matchesComponent(component, servicesPatterns)) {
      legacyResult.SERVICES_BONUS = component.outputValue;
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
      result.entityId,
      result.entityName,
      result.entityRole,
      result.storeId || '',
      result.storeName || '',
      result.period,
      result.ruleSetName,
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
 * Export to legacy CSV format (30 columns)
 */
function exportLegacyCSV(results: CalculationResult[]): string {
  // 30-column header structure
  const headers = [
    // Columns 1-12: Employee/Period metadata
    'EMP_ID',
    'EMP_NAME',
    'EMP_ROLE',
    'DEPT_ID',
    'DEPT_NAME',
    'STORE_ID',
    'STORE_NAME',
    'MANAGER_ID',
    'HIRE_DATE',
    'PERIOD',
    'PLAN_NAME',
    'VARIANT_NAME',
    // Columns 13-16: Optical Sales
    'OPTICAL_ACTUAL',
    'OPTICAL_TARGET',
    'OPTICAL_ATTAINMENT',
    'OPTICAL_BONUS',
    // Columns 17-20: Store Performance
    'STORE_ACTUAL',
    'STORE_TARGET',
    'STORE_ATTAINMENT',
    'STORE_BONUS',
    // Columns 21-23: Customer acquisition
    'CUSTOMER_ACTUAL',
    'CUSTOMER_TARGET',
    'CUSTOMER_BONUS',
    // Columns 24-26: Other components
    'COLLECTION_BONUS',
    'INSURANCE_BONUS',
    'SERVICES_BONUS',
    // Columns 27-30: Totals and audit
    'TOTAL_INCENTIVE',
    'CURRENCY',
    'CALC_DATE',
    'CALC_VERSION',
  ];

  const rows = results.map((result) => {
    const legacy = formatForLegacyExport(result);
    return [
      // Columns 1-12: Employee/Period metadata
      legacy.EMP_ID,
      legacy.EMP_NAME,
      legacy.EMP_ROLE,
      legacy.DEPT_ID,
      legacy.DEPT_NAME,
      legacy.STORE_ID,
      legacy.STORE_NAME,
      legacy.MANAGER_ID,
      legacy.HIRE_DATE,
      legacy.PERIOD,
      legacy.PLAN_NAME,
      legacy.VARIANT_NAME,
      // Columns 13-16: Optical Sales
      legacy.OPTICAL_ACTUAL.toFixed(2),
      legacy.OPTICAL_TARGET.toFixed(2),
      legacy.OPTICAL_ATTAINMENT.toFixed(1),
      legacy.OPTICAL_BONUS.toFixed(2),
      // Columns 17-20: Store Performance
      legacy.STORE_ACTUAL.toFixed(2),
      legacy.STORE_TARGET.toFixed(2),
      legacy.STORE_ATTAINMENT.toFixed(1),
      legacy.STORE_BONUS.toFixed(2),
      // Columns 21-23: Customer acquisition
      legacy.CUSTOMER_ACTUAL.toFixed(0),
      legacy.CUSTOMER_TARGET.toFixed(0),
      legacy.CUSTOMER_BONUS.toFixed(2),
      // Columns 24-26: Other components
      legacy.COLLECTION_BONUS.toFixed(2),
      legacy.INSURANCE_BONUS.toFixed(2),
      legacy.SERVICES_BONUS.toFixed(2),
      // Columns 27-30: Totals and audit
      legacy.TOTAL_INCENTIVE.toFixed(2),
      legacy.CURRENCY,
      legacy.CALC_DATE,
      legacy.CALC_VERSION,
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
    if (!byPlan[result.ruleSetName]) {
      byPlan[result.ruleSetName] = { count: 0, total: 0, average: 0 };
    }
    byPlan[result.ruleSetName].count++;
    byPlan[result.ruleSetName].total += result.totalIncentive;

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
