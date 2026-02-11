/**
 * Calculation Context Resolver
 *
 * Provides employee context during calculation by resolving:
 * - Employee data from imports
 * - Metric data from committed records
 * - Period configuration
 * - Data-to-component mappings
 *
 * AI-DRIVEN: Uses AI import context for field resolution - NO HARDCODED FIELD NAMES
 */

import type { EmployeeMetrics } from '@/lib/compensation/calculation-engine';
import {
  getPlanMappings,
  resolveMetrics,
  autoMapPlan,
  saveMappings,
  getAvailableSourceFields,
} from './data-component-mapper';
import { getPlans } from '@/lib/compensation/plan-storage';
import { loadImportContext, type AIImportContext } from '@/lib/data-architecture/data-layer-service';

// ============================================
// TYPES
// ============================================

export interface EmployeeContext {
  id: string;
  tenantId: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  email?: string;
  role: string;
  department?: string;
  storeId?: string;
  storeName?: string;
  managerId?: string;
  hireDate?: string;
  status: 'active' | 'inactive' | 'terminated';
  isCertified?: boolean;
  attributes?: Record<string, unknown>;
}

export interface PeriodContext {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: 'draft' | 'open' | 'closed' | 'locked';
  type: 'monthly' | 'quarterly' | 'annual';
}

export interface CalculationContext {
  tenantId: string;
  period: PeriodContext;
  employees: EmployeeContext[];
  committedData: Map<string, Record<string, unknown>[]>;
  mappings: Map<string, Map<string, number>>;
}

// ============================================
// STORAGE KEYS
// ============================================

const STORAGE_KEYS = {
  EMPLOYEES: 'vialuce_employee_data',
  PERIODS: 'vialuce_payroll_periods',
  COMMITTED: 'data_layer_committed',
  BATCHES: 'data_layer_batches',
};

// ============================================
// CONTEXT BUILDING
// ============================================

/**
 * Build calculation context for a period
 */
export function buildCalculationContext(
  tenantId: string,
  periodId: string
): CalculationContext | null {
  const period = getPeriodById(tenantId, periodId);
  if (!period) {
    console.warn('Period not found:', periodId);
    return null;
  }

  const employees = getEmployees(tenantId);
  const committedData = getCommittedDataByEmployee(tenantId, periodId);
  const mappings = resolveMappingsForEmployees(tenantId, committedData);

  return {
    tenantId,
    period,
    employees,
    committedData,
    mappings,
  };
}

/**
 * Build EmployeeMetrics from context for a single employee
 */
export function buildEmployeeMetrics(
  context: CalculationContext,
  employee: EmployeeContext
): EmployeeMetrics | null {
  // Get resolved metrics for this employee
  const metrics = context.mappings.get(employee.id);

  if (!metrics || metrics.size === 0) {
    // Try to get metrics from committed data directly
    const employeeData = context.committedData.get(employee.id);
    if (!employeeData || employeeData.length === 0) {
      return null;
    }

    // Aggregate numeric fields from committed data
    const aggregatedMetrics: Record<string, number> = {};
    for (const record of employeeData) {
      for (const [key, value] of Object.entries(record)) {
        if (typeof value === 'number') {
          aggregatedMetrics[key] = (aggregatedMetrics[key] || 0) + value;
        } else if (typeof value === 'string') {
          const parsed = parseFloat(value.replace(/[%$,]/g, ''));
          if (!isNaN(parsed)) {
            aggregatedMetrics[key] = (aggregatedMetrics[key] || 0) + parsed;
          }
        }
      }
    }

    return {
      employeeId: employee.id,
      employeeName: `${employee.firstName} ${employee.lastName}`,
      employeeRole: employee.role,
      storeId: employee.storeId,
      storeName: employee.storeName,
      isCertified: employee.isCertified,
      period: context.period.id,
      periodStart: context.period.startDate,
      periodEnd: context.period.endDate,
      metrics: aggregatedMetrics,
    };
  }

  return {
    employeeId: employee.id,
    employeeName: `${employee.firstName} ${employee.lastName}`,
    employeeRole: employee.role,
    storeId: employee.storeId,
    storeName: employee.storeName,
    isCertified: employee.isCertified,
    period: context.period.id,
    periodStart: context.period.startDate,
    periodEnd: context.period.endDate,
    metrics: Object.fromEntries(metrics),
  };
}

/**
 * Build metrics for all employees in context
 */
export function buildAllEmployeeMetrics(
  context: CalculationContext
): EmployeeMetrics[] {
  const results: EmployeeMetrics[] = [];

  for (const employee of context.employees) {
    const metrics = buildEmployeeMetrics(context, employee);
    if (metrics) {
      results.push(metrics);
    }
  }

  return results;
}

// ============================================
// DATA RESOLUTION
// ============================================

/**
 * Get period by ID
 */
function getPeriodById(tenantId: string, periodId: string): PeriodContext | null {
  if (typeof window === 'undefined') return null;

  const stored = localStorage.getItem(STORAGE_KEYS.PERIODS);
  if (!stored) return null;

  try {
    const periods: Array<PeriodContext & { tenantId: string }> = JSON.parse(stored);
    const period = periods.find(
      (p) => p.id === periodId && (!p.tenantId || p.tenantId === tenantId)
    );
    return period || null;
  } catch {
    return null;
  }
}

/**
 * Get employees for tenant - checks stored data, then committed data, then demo fallback
 */
function getEmployees(tenantId: string): EmployeeContext[] {
  if (typeof window === 'undefined') return [];

  // PRIORITY 1: Committed import data (real imported employees take precedence)
  const committedEmployees = extractEmployeesFromCommittedData(tenantId);
  if (committedEmployees.length > 0) {
    return committedEmployees;
  }

  // PRIORITY 2: Stored employee data (backward compatibility)
  const stored = localStorage.getItem(STORAGE_KEYS.EMPLOYEES);
  if (stored) {
    try {
      const employees: EmployeeContext[] = JSON.parse(stored);
      const filtered = employees.filter((e) => e.tenantId === tenantId);
      if (filtered.length > 0) {
        return filtered;
      }
    } catch {
      // Continue to next source
    }
  }

  // PRIORITY 3: Demo fallback (only when no real data exists)
  return getDefaultEmployees(tenantId);
}

/**
 * AI-DRIVEN: Find a source field name by its semantic type using AI import context.
 * Returns the original column name from the data, or null if not found.
 * This is the ONLY way to resolve field names - never hardcode column names.
 */
function findFieldBySemantic(
  aiContext: AIImportContext | null,
  sheetName: string,
  ...semanticTypes: string[]
): string | null {
  if (!aiContext?.sheets) return null;

  const sheetInfo = aiContext.sheets.find(
    s => s.sheetName === sheetName || s.sheetName.toLowerCase() === sheetName.toLowerCase()
  );
  if (!sheetInfo?.fieldMappings) return null;

  for (const semanticType of semanticTypes) {
    const mapping = sheetInfo.fieldMappings.find(
      fm => fm.semanticType.toLowerCase() === semanticType.toLowerCase()
    );
    if (mapping) return mapping.sourceColumn;
  }

  return null;
}

/**
 * AI-DRIVEN: Extract value from content using AI semantic mapping (NO HARDCODED FALLBACKS)
 */
function extractFieldValue(
  aiContext: AIImportContext | null,
  content: Record<string, unknown>,
  sheetName: string,
  semanticTypes: string[]
): string {
  const fieldName = findFieldBySemantic(aiContext, sheetName, ...semanticTypes);
  if (fieldName && content[fieldName] !== undefined && content[fieldName] !== null) {
    return String(content[fieldName]).trim();
  }
  return '';
}

/**
 * AI-DRIVEN: Extract employee records from committed import data
 * Uses ONLY AI semantic mappings - NO HARDCODED FIELD NAMES
 */
function extractEmployeesFromCommittedData(tenantId: string): EmployeeContext[] {
  if (typeof window === 'undefined') return [];

  // AI-DRIVEN: Load AI import context
  const aiContext = loadImportContext(tenantId);
  if (!aiContext) {
    console.warn('[ContextResolver] NO AI IMPORT CONTEXT - cannot extract employees. Re-import data to generate mappings.');
    return [];
  }

  // AI-DRIVEN: Get roster sheet from AI context
  const rosterSheet = aiContext.rosterSheet;
  if (!rosterSheet) {
    console.warn('[ContextResolver] NO ROSTER SHEET IDENTIFIED in AI context - cannot extract employees.');
    return [];
  }
  console.log(`[ContextResolver] AI identified roster sheet: "${rosterSheet}"`);

  const employees: EmployeeContext[] = [];
  const seenIds = new Set<string>();

  // Get tenant batch IDs
  const batchesStored = localStorage.getItem(STORAGE_KEYS.BATCHES);
  if (!batchesStored) return [];

  let tenantBatchIds: string[] = [];
  try {
    const batches: [string, { tenantId: string; sourceFile?: string }][] = JSON.parse(batchesStored);
    tenantBatchIds = batches
      .filter(([, batch]) => batch.tenantId === tenantId)
      .map(([id]) => id);
  } catch {
    return [];
  }

  if (tenantBatchIds.length === 0) return [];

  // Get committed records
  const committedStored = localStorage.getItem(STORAGE_KEYS.COMMITTED);
  if (!committedStored) return [];

  try {
    const committed: [
      string,
      {
        importBatchId: string;
        status: string;
        content: Record<string, unknown>;
      }
    ][] = JSON.parse(committedStored);

    for (const [, record] of committed) {
      if (
        !tenantBatchIds.includes(record.importBatchId) ||
        record.status !== 'active'
      ) {
        continue;
      }

      const content = record.content;
      const sheetName = String(content._sheetName || '');

      // AI-DRIVEN: Only process roster sheet records
      if (sheetName.toLowerCase() !== rosterSheet.toLowerCase()) {
        continue;
      }

      // AI-DRIVEN: Extract employee ID using semantic mapping
      const employeeId = extractFieldValue(aiContext, content, sheetName, ['employeeId', 'employee_id']);

      if (!employeeId || employeeId.length < 3 || seenIds.has(employeeId)) continue;
      seenIds.add(employeeId);

      // AI-DRIVEN: Extract all fields using semantic mappings
      const fullName = extractFieldValue(aiContext, content, sheetName, ['name', 'employeeName', 'fullName']);
      const firstName = fullName.split(' ')[0] || 'Unknown';
      const lastName = fullName.split(' ').slice(1).join(' ') || 'Employee';

      employees.push({
        id: employeeId.toLowerCase().replace(/\s+/g, '-'),
        tenantId,
        employeeNumber: employeeId,
        firstName,
        lastName,
        email: extractFieldValue(aiContext, content, sheetName, ['email']),
        role: extractFieldValue(aiContext, content, sheetName, ['role', 'position', 'employeeType', 'jobTitle']) || 'sales_rep',
        department: extractFieldValue(aiContext, content, sheetName, ['department']),
        storeId: extractFieldValue(aiContext, content, sheetName, ['storeId', 'locationId', 'store']),
        storeName: extractFieldValue(aiContext, content, sheetName, ['storeName', 'locationName']),
        managerId: extractFieldValue(aiContext, content, sheetName, ['managerId']),
        hireDate: extractFieldValue(aiContext, content, sheetName, ['hireDate', 'startDate']),
        status: 'active' as const,
      });
    }
  } catch {
    return [];
  }

  return employees;
}

/**
 * AI-DRIVEN: Get committed data organized by employee
 * Uses AI semantic mappings for field resolution
 */
function getCommittedDataByEmployee(
  tenantId: string,
  periodId: string
): Map<string, Record<string, unknown>[]> {
  const result = new Map<string, Record<string, unknown>[]>();

  if (typeof window === 'undefined') return result;

  // AI-DRIVEN: Load AI import context
  const aiContext = loadImportContext(tenantId);
  if (!aiContext) {
    console.warn('[ContextResolver] NO AI IMPORT CONTEXT for getCommittedDataByEmployee');
    return result;
  }

  // Get tenant batch IDs
  const batchesStored = localStorage.getItem(STORAGE_KEYS.BATCHES);
  if (!batchesStored) return result;

  let tenantBatchIds: string[] = [];
  try {
    const batches: [string, { tenantId: string }][] = JSON.parse(batchesStored);
    tenantBatchIds = batches
      .filter(([, batch]) => batch.tenantId === tenantId)
      .map(([id]) => id);
  } catch {
    return result;
  }

  // Get committed records
  const committedStored = localStorage.getItem(STORAGE_KEYS.COMMITTED);
  if (!committedStored) return result;

  try {
    const committed: [
      string,
      {
        importBatchId: string;
        status: string;
        content: Record<string, unknown>;
      }
    ][] = JSON.parse(committedStored);

    for (const [, record] of committed) {
      if (
        !tenantBatchIds.includes(record.importBatchId) ||
        record.status !== 'active'
      ) {
        continue;
      }

      const content = record.content;
      const sheetName = String(content._sheetName || '');

      // AI-DRIVEN: Extract employee ID using semantic mapping
      const employeeId = extractFieldValue(aiContext, content, sheetName, ['employeeId', 'employee_id']);
      if (!employeeId) continue;

      // AI-DRIVEN: Check if record matches period using semantic mapping
      const recordPeriod = extractFieldValue(aiContext, content, sheetName, ['period', 'month']);
      if (recordPeriod && !periodMatches(recordPeriod, periodId)) {
        continue;
      }

      const normalizedId = employeeId.toLowerCase().replace(/\s+/g, '-');
      if (!result.has(normalizedId)) {
        result.set(normalizedId, []);
      }
      result.get(normalizedId)!.push(content);
    }
  } catch {
    return result;
  }

  return result;
}

/**
 * Resolve mappings for all employees' data
 */
function resolveMappingsForEmployees(
  tenantId: string,
  committedData: Map<string, Record<string, unknown>[]>
): Map<string, Map<string, number>> {
  const result = new Map<string, Map<string, number>>();

  // Get active plans for tenant
  const plans = getPlans(tenantId).filter((p) => p.status === 'active');
  if (plans.length === 0) return result;

  // Get mappings for plans - if none exist, auto-generate them
  const allMappings = plans.flatMap((p) => getPlanMappings(tenantId, p.id));

  // If no stored mappings, auto-generate from available fields
  if (allMappings.length === 0) {
    const sourceFields = getAvailableSourceFields(tenantId);
    if (sourceFields.length > 0) {
      for (const plan of plans) {
        const autoResult = autoMapPlan(plan, sourceFields);
        if (autoResult.mappings.length > 0) {
          // Save auto-generated mappings for future use
          saveMappings(autoResult.mappings);
          allMappings.push(...autoResult.mappings);
        }
      }
    }
  }

  for (const [employeeId, records] of Array.from(committedData.entries())) {
    const employeeMetrics = new Map<string, number>();

    // Aggregate data from all records
    const aggregatedData: Record<string, unknown> = {};
    for (const record of records) {
      for (const [key, value] of Object.entries(record)) {
        if (typeof value === 'number') {
          aggregatedData[key] = ((aggregatedData[key] as number) || 0) + value;
        } else if (aggregatedData[key] === undefined) {
          aggregatedData[key] = value;
        }
      }
    }

    // Resolve metrics using mappings
    const resolved = resolveMetrics(aggregatedData, allMappings);
    for (const [metric, value] of Object.entries(resolved)) {
      employeeMetrics.set(metric, value);
    }

    // Also include raw numeric data that wasn't mapped
    for (const [key, value] of Object.entries(aggregatedData)) {
      if (typeof value === 'number' && !employeeMetrics.has(key)) {
        employeeMetrics.set(key, value);
      }
    }

    result.set(employeeId, employeeMetrics);
  }

  return result;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

// NOTE: extractEmployeeId and extractPeriod with hardcoded field names have been REMOVED
// Use extractFieldValue() with AI semantic mappings instead

/**
 * Check if record period matches target period
 */
function periodMatches(recordPeriod: string, targetPeriod: string): boolean {
  const normalize = (p: string) =>
    p.toLowerCase().replace(/[^a-z0-9]/g, '');

  // Exact match
  if (normalize(recordPeriod) === normalize(targetPeriod)) {
    return true;
  }

  // Try parsing as dates
  const targetMatch = targetPeriod.match(/(\d{4})-(\d{2})/);
  if (targetMatch) {
    const [, year, month] = targetMatch;
    return (
      recordPeriod.includes(year) &&
      (recordPeriod.includes(month) ||
        recordPeriod.includes(String(parseInt(month))))
    );
  }

  return false;
}

/**
 * Get default demo employees
 */
function getDefaultEmployees(tenantId: string): EmployeeContext[] {
  if (tenantId === 'retailco') {
    return [
      {
        id: 'maria-rodriguez',
        tenantId,
        employeeNumber: 'EMP-001',
        firstName: 'Maria',
        lastName: 'Rodriguez',
        role: 'sales_rep',
        storeId: 'store-101',
        storeName: 'Downtown Flagship',
        status: 'active',
        isCertified: true,
      },
      {
        id: 'james-wilson',
        tenantId,
        employeeNumber: 'EMP-002',
        firstName: 'James',
        lastName: 'Wilson',
        role: 'sales_rep',
        storeId: 'store-101',
        storeName: 'Downtown Flagship',
        status: 'active',
        isCertified: true,
      },
      {
        id: 'sarah-chen',
        tenantId,
        employeeNumber: 'EMP-003',
        firstName: 'Sarah',
        lastName: 'Chen',
        role: 'sales_rep',
        storeId: 'store-102',
        storeName: 'Mall Location',
        status: 'active',
        isCertified: false,
      },
    ];
  }

  if (tenantId === 'retailcgmx') {
    return [
      {
        id: 'ana-garcia',
        tenantId,
        employeeNumber: 'EMP-MX-001',
        firstName: 'Ana',
        lastName: 'García',
        role: 'sales_rep',
        storeId: 'store-mx-001',
        storeName: 'Polanco',
        status: 'active',
        isCertified: true,
      },
      {
        id: 'carlos-martinez',
        tenantId,
        employeeNumber: 'EMP-MX-002',
        firstName: 'Carlos',
        lastName: 'Martínez',
        role: 'sales_rep',
        storeId: 'store-mx-001',
        storeName: 'Polanco',
        status: 'active',
        isCertified: true,
      },
    ];
  }

  return [];
}

// ============================================
// EXPORTS
// ============================================

export {
  getEmployees,
  getPeriodById,
  getCommittedDataByEmployee,
};
