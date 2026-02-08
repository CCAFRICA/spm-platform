/**
 * Calculation Context Resolver
 *
 * Provides employee context during calculation by resolving:
 * - Employee data from imports
 * - Metric data from committed records
 * - Period configuration
 * - Data-to-component mappings
 */

import type { EmployeeMetrics } from '@/lib/compensation/calculation-engine';
import { getPlanMappings, resolveMetrics } from './data-component-mapper';
import { getPlans } from '@/lib/compensation/plan-storage';

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
  EMPLOYEES: 'clearcomp_employee_data',
  PERIODS: 'clearcomp_payroll_periods',
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
 * Extract employee records from committed import data
 * Looks for roster sheets (Datos Colaborador) in the committed data
 */
function extractEmployeesFromCommittedData(tenantId: string): EmployeeContext[] {
  if (typeof window === 'undefined') return [];

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

      // Check if this record looks like an employee roster entry
      const content = record.content;
      const employeeId = extractEmployeeId(content);

      if (!employeeId || seenIds.has(employeeId)) continue;

      // Check for employee-like fields (name, role, store, etc.)
      const hasNameField = content['nombre'] || content['name'] ||
        content['first_name'] || content['firstName'] ||
        content['nombre_completo'] || content['Nombre'];

      if (!hasNameField) continue;

      seenIds.add(employeeId);

      // Extract employee context from record
      const firstName = String(content['nombre'] || content['first_name'] ||
        content['firstName'] || content['nombre_completo'] || content['Nombre'] || '').split(' ')[0];
      const lastName = String(content['apellido'] || content['apellido_paterno'] ||
        content['last_name'] || content['lastName'] || '').trim() ||
        String(content['nombre'] || content['nombre_completo'] || content['Nombre'] || '').split(' ').slice(1).join(' ');

      employees.push({
        id: employeeId,
        tenantId,
        employeeNumber: String(content['num_empleado'] || content['Num_Empleado'] ||
          content['employee_number'] || content['employeeNumber'] || employeeId),
        firstName: firstName || 'Unknown',
        lastName: lastName || 'Employee',
        email: String(content['email'] || content['correo'] || ''),
        role: String(content['puesto'] || content['Puesto'] || content['role'] ||
          content['position'] || content['cargo'] || 'sales_rep'),
        department: String(content['departamento'] || content['department'] || ''),
        storeId: String(content['no_tienda'] || content['No_Tienda'] ||
          content['store_id'] || content['storeId'] || content['tienda'] || ''),
        storeName: String(content['nombre_tienda'] || content['store_name'] ||
          content['storeName'] || ''),
        managerId: String(content['manager_id'] || content['id_gerente'] || ''),
        hireDate: String(content['fecha_ingreso'] || content['hire_date'] || ''),
        status: 'active' as const,
        isCertified: Boolean(content['certificado'] || content['certified'] ||
          content['es_certificado'] || false),
      });
    }
  } catch {
    return [];
  }

  return employees;
}

/**
 * Get committed data organized by employee
 */
function getCommittedDataByEmployee(
  tenantId: string,
  periodId: string
): Map<string, Record<string, unknown>[]> {
  const result = new Map<string, Record<string, unknown>[]>();

  if (typeof window === 'undefined') return result;

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

      // Extract employee identifier from content
      const employeeId = extractEmployeeId(record.content);
      if (!employeeId) continue;

      // Check if record matches period (if period info is in content)
      const recordPeriod = extractPeriod(record.content);
      if (recordPeriod && !periodMatches(recordPeriod, periodId)) {
        continue;
      }

      if (!result.has(employeeId)) {
        result.set(employeeId, []);
      }
      result.get(employeeId)!.push(record.content);
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

  // Get mappings for plans
  const allMappings = plans.flatMap((p) => getPlanMappings(tenantId, p.id));

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

/**
 * Extract employee ID from record content
 */
function extractEmployeeId(content: Record<string, unknown>): string | null {
  // Try common employee ID fields (including Spanish variants)
  const idFields = [
    'num_empleado',        // RetailCGMX primary key
    'Num_Empleado',        // Case variant
    'employee_id',
    'employeeId',
    'emp_id',
    'empId',
    'id',
    'employee_number',
    'employeeNumber',
    'emp_num',
    'numero_empleado',
    'id_empleado',
    'No_Empleado',
  ];

  for (const field of idFields) {
    const value = content[field];
    if (value !== undefined && value !== null) {
      return String(value).toLowerCase().replace(/\s+/g, '-');
    }
  }

  // Try to construct from name
  const firstName =
    content['first_name'] ||
    content['firstName'] ||
    content['nombre'] ||
    content['primer_nombre'];
  const lastName =
    content['last_name'] ||
    content['lastName'] ||
    content['apellido'] ||
    content['apellido_paterno'];

  if (firstName && lastName) {
    return `${String(firstName).toLowerCase()}-${String(lastName).toLowerCase()}`;
  }

  return null;
}

/**
 * Extract period from record content
 */
function extractPeriod(content: Record<string, unknown>): string | null {
  const periodFields = [
    'period',
    'periodo',
    'period_id',
    'periodId',
    'pay_period',
    'payPeriod',
    'month',
    'mes',
  ];

  for (const field of periodFields) {
    const value = content[field];
    if (value !== undefined && value !== null) {
      return String(value);
    }
  }

  return null;
}

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
