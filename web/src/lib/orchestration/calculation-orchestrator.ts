/**
 * Calculation Orchestrator
 *
 * Bridges data → plans → calculation → results for end-to-end processing.
 * Provides the integration layer between import pipeline, plan storage,
 * calculation engine, and result storage.
 */

import type { CalculationResult } from '@/types/compensation-plan';
import { calculateIncentive, type EmployeeMetrics } from '@/lib/compensation/calculation-engine';
import { getPlans } from '@/lib/compensation/plan-storage';
import {
  buildCalculationContext,
  buildEmployeeMetrics,
  type CalculationContext,
} from '@/lib/calculation/context-resolver';
import { loadImportContext, type AIImportContext } from '@/lib/data-architecture/data-layer-service';

// ============================================
// STORAGE KEYS
// ============================================

const STORAGE_KEYS = {
  CALCULATIONS: 'clearcomp_calculations',
  CALCULATION_RUNS: 'clearcomp_calculation_runs',
  EMPLOYEE_DATA: 'clearcomp_employee_data',
  TRANSACTION_DATA: 'clearcomp_transaction_data',
  METRIC_AGGREGATES: 'clearcomp_metric_aggregates',
  // Data layer keys for committed import data
  DATA_LAYER_COMMITTED: 'data_layer_committed',
  DATA_LAYER_BATCHES: 'data_layer_batches',
} as const;

// ============================================
// ORCHESTRATOR TYPES
// ============================================

export interface CalculationRunConfig {
  tenantId: string;
  periodId: string;
  runType: 'preview' | 'official' | 'adjustment';
  scope: {
    employeeIds?: string[];
    departmentIds?: string[];
    storeIds?: string[];
    planIds?: string[];
  };
  options?: {
    includeInactive?: boolean;
    forceRecalculate?: boolean;
    dryRun?: boolean;
  };
}

export interface CalculationRun {
  id: string;
  tenantId: string;
  periodId: string;
  runType: 'preview' | 'official' | 'adjustment';
  status: 'pending' | 'running' | 'completed' | 'failed';
  scope: CalculationRunConfig['scope'];

  // Progress
  totalEmployees: number;
  processedEmployees: number;
  successCount: number;
  errorCount: number;

  // Timing
  startedAt: string;
  completedAt?: string;
  durationMs?: number;

  // Summary
  totalPayout?: number;
  averagePayout?: number;

  // Errors
  errors?: Array<{
    employeeId: string;
    error: string;
  }>;

  // Metadata
  createdBy: string;
  notes?: string;
}

export interface EmployeeData {
  id: string;
  tenantId: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  department?: string;
  storeId?: string;
  storeName?: string;
  managerId?: string;
  hireDate?: string;
  terminationDate?: string;
  status: 'active' | 'inactive' | 'terminated';
  attributes?: Record<string, unknown>;
}

export interface MetricAggregate {
  employeeId: string;
  periodId: string;
  tenantId: string;
  metrics: Record<string, number>;
  sources: Record<string, string>; // metric -> source (e.g., 'import', 'calculated', 'manual')
  lastUpdated: string;
}

export interface OrchestrationResult {
  success: boolean;
  run: CalculationRun;
  results: CalculationResult[];
  summary: {
    totalPayout: number;
    employeesProcessed: number;
    plansUsed: string[];
    byPlan: Record<string, { count: number; total: number }>;
    byDepartment: Record<string, { count: number; total: number }>;
  };
}

// ============================================
// CALCULATION ORCHESTRATOR
// ============================================

export class CalculationOrchestrator {
  private tenantId: string;
  private calculationContext: CalculationContext | null = null;
  private aiImportContext: AIImportContext | null = null;

  constructor(tenantId: string) {
    // OB-16: Normalize tenantId - strip trailing underscores to prevent data mismatch
    const normalizedId = tenantId.replace(/_+$/g, '');
    if (normalizedId !== tenantId) {
      console.warn(`[Orchestrator] WARNING: tenantId "${tenantId}" had trailing underscore(s) - normalized to "${normalizedId}"`);
    }
    this.tenantId = normalizedId;

    // AI-DRIVEN: Load AI import context for metric extraction
    this.aiImportContext = loadImportContext(normalizedId);
    if (this.aiImportContext) {
      console.log(`[Orchestrator] Loaded AI import context: ${this.aiImportContext.sheets.length} sheets, roster=${this.aiImportContext.rosterSheet}`);
    }
  }

  /**
   * Execute a calculation run
   */
  async executeRun(config: CalculationRunConfig, userId: string): Promise<OrchestrationResult> {
    // Create run record
    const run = this.createRun(config, userId);
    this.saveRun(run);

    try {
      // Update status
      run.status = 'running';
      run.startedAt = new Date().toISOString();
      this.saveRun(run);

      // Build calculation context for this period
      this.calculationContext = buildCalculationContext(config.tenantId, config.periodId);

      // Get employees to process
      const employees = this.getEmployeesForRun(config);
      run.totalEmployees = employees.length;
      this.saveRun(run);

      // Get available plans
      const plans = getPlans(config.tenantId);
      const activePlans = plans.filter((p) => p.status === 'active');

      if (activePlans.length === 0) {
        throw new Error('No active compensation plans found');
      }

      // Use the first active plan (or could be selected via config in future)
      const activePlan = activePlans[0];
      console.log(`[Orchestrator] Using active plan: ${activePlan.name} (${activePlan.id})`);

      // Process each employee
      const results: CalculationResult[] = [];
      const errors: Array<{ employeeId: string; error: string }> = [];

      for (const employee of employees) {
        try {
          // FIXED: Pass the active plan ID to avoid role-based lookup failures
          const result = await this.calculateForEmployee(employee, config.periodId, activePlan.id);
          if (result) {
            results.push(result);
            run.successCount++;
          }
        } catch (error) {
          errors.push({
            employeeId: employee.id,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
          run.errorCount++;
        }

        run.processedEmployees++;
        this.saveRun(run);
      }

      // Finalize run
      run.status = 'completed';
      run.completedAt = new Date().toISOString();
      run.durationMs = new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime();
      run.errors = errors.length > 0 ? errors : undefined;

      // Calculate summary
      const totalPayout = results.reduce((sum, r) => sum + r.totalIncentive, 0);
      run.totalPayout = totalPayout;
      run.averagePayout = results.length > 0 ? totalPayout / results.length : 0;

      this.saveRun(run);

      // Store results if not dry run
      if (!config.options?.dryRun) {
        this.saveResults(results, run.id);
      }

      // Build summary
      const summary = this.buildSummary(results);

      return {
        success: true,
        run,
        results,
        summary,
      };
    } catch (error) {
      run.status = 'failed';
      run.completedAt = new Date().toISOString();
      run.errors = [
        {
          employeeId: 'system',
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      ];
      this.saveRun(run);

      return {
        success: false,
        run,
        results: [],
        summary: {
          totalPayout: 0,
          employeesProcessed: 0,
          plansUsed: [],
          byPlan: {},
          byDepartment: {},
        },
      };
    }
  }

  /**
   * Calculate incentive for a single employee
   * FIXED: Accept planId to use loaded plan instead of role-based lookup
   */
  private async calculateForEmployee(
    employee: EmployeeData,
    periodId: string,
    planId: string
  ): Promise<CalculationResult | null> {
    // Get metrics for this employee/period
    const metrics = this.getEmployeeMetrics(employee, periodId);

    if (!metrics) {
      throw new Error(`No metrics found for employee ${employee.id} in period ${periodId}`);
    }

    // Execute calculation with explicit plan ID (bypasses role-based lookup)
    const result = calculateIncentive(metrics, this.tenantId, planId);

    return result;
  }

  /**
   * Get employees for a calculation run
   */
  private getEmployeesForRun(config: CalculationRunConfig): EmployeeData[] {
    const allEmployees = this.getEmployees();

    return allEmployees.filter((emp) => {
      // Filter by status
      if (!config.options?.includeInactive && emp.status !== 'active') {
        return false;
      }

      // Filter by scope
      if (config.scope.employeeIds && !config.scope.employeeIds.includes(emp.id)) {
        return false;
      }

      if (config.scope.storeIds && emp.storeId && !config.scope.storeIds.includes(emp.storeId)) {
        return false;
      }

      if (
        config.scope.departmentIds &&
        emp.department &&
        !config.scope.departmentIds.includes(emp.department)
      ) {
        return false;
      }

      return true;
    });
  }

  /**
   * Get employee metrics for a period
   * AI-DRIVEN: Uses AI import context to extract metrics from aggregated data
   */
  private getEmployeeMetrics(employee: EmployeeData, periodId: string): EmployeeMetrics | null {
    // AI-DRIVEN PRIORITY 0: Extract metrics from aggregated employee attributes using AI mappings
    const aiMetrics = this.extractMetricsWithAIMappings(employee);
    if (aiMetrics && Object.keys(aiMetrics).length > 0) {
      return {
        employeeId: employee.id,
        employeeName: `${employee.firstName} ${employee.lastName}`,
        employeeRole: employee.role,
        storeId: employee.storeId,
        storeName: employee.storeName,
        isCertified: employee.attributes?.isCertified as boolean | undefined,
        period: periodId,
        periodStart: this.getPeriodStart(periodId),
        periodEnd: this.getPeriodEnd(periodId),
        metrics: aiMetrics,
      };
    }

    // PRIORITY 1: Try to get pre-computed aggregated metrics
    const aggregate = this.getMetricAggregate(employee.id, periodId);
    if (aggregate) {
      return {
        employeeId: employee.id,
        employeeName: `${employee.firstName} ${employee.lastName}`,
        employeeRole: employee.role,
        storeId: employee.storeId,
        storeName: employee.storeName,
        isCertified: employee.attributes?.isCertified as boolean | undefined,
        period: periodId,
        periodStart: this.getPeriodStart(periodId),
        periodEnd: this.getPeriodEnd(periodId),
        metrics: aggregate.metrics,
      };
    }

    // PRIORITY 2: Try to use calculation context with data-component mapper
    if (this.calculationContext) {
      const contextEmployee = this.calculationContext.employees.find(
        (e) => e.id === employee.id
      );
      if (contextEmployee) {
        const metrics = buildEmployeeMetrics(this.calculationContext, contextEmployee);
        if (metrics) {
          return metrics;
        }
      }
    }

    // PRIORITY 3: Try to calculate metrics from transactions
    const calculatedMetrics = this.calculateMetricsFromTransactions(employee, periodId);
    if (calculatedMetrics) {
      return {
        employeeId: employee.id,
        employeeName: `${employee.firstName} ${employee.lastName}`,
        employeeRole: employee.role,
        storeId: employee.storeId,
        storeName: employee.storeName,
        isCertified: employee.attributes?.isCertified as boolean | undefined,
        period: periodId,
        periodStart: this.getPeriodStart(periodId),
        periodEnd: this.getPeriodEnd(periodId),
        metrics: calculatedMetrics,
      };
    }

    return null;
  }

  /**
   * AI-DRIVEN: Extract metrics using AI import context
   * Uses sheet-to-component mappings and field semantic types from AI analysis
   */
  private extractMetricsWithAIMappings(employee: EmployeeData): Record<string, number> | null {
    const attrs = employee.attributes as Record<string, unknown> | undefined;
    if (!attrs) return null;

    const metrics: Record<string, number> = {};

    // Method 1: If sheetMetrics available, use AI context to map sheets to components
    const sheetMetrics = attrs.sheetMetrics as Record<string, Record<string, number>> | undefined;
    if (sheetMetrics && this.aiImportContext) {
      for (const sheetInfo of this.aiImportContext.sheets) {
        if (sheetInfo.classification !== 'component_data') continue;

        const sheetData = sheetMetrics[sheetInfo.sheetName];
        if (!sheetData) continue;

        // Use AI's field mappings to identify semantic types
        for (const fieldMapping of sheetInfo.fieldMappings) {
          const value = sheetData[fieldMapping.sourceColumn];
          if (typeof value === 'number') {
            // Create metric key from component + semantic type
            const componentKey = sheetInfo.matchedComponent || sheetInfo.sheetName;
            const metricKey = `${componentKey}_${fieldMapping.semanticType}`;
            metrics[metricKey] = (metrics[metricKey] || 0) + value;

            // Also store by semantic type directly for common lookups
            if (fieldMapping.semanticType === 'attainment') {
              metrics[`${componentKey}_attainment`] = value;
            } else if (fieldMapping.semanticType === 'amount') {
              metrics[`${componentKey}_amount`] = value;
            } else if (fieldMapping.semanticType === 'goal') {
              metrics[`${componentKey}_goal`] = value;
            }
          }
        }

        // Also include all numeric fields from the sheet with component prefix
        for (const [field, value] of Object.entries(sheetData)) {
          if (typeof value === 'number') {
            const componentKey = sheetInfo.matchedComponent || sheetInfo.sheetName;
            const metricKey = `${componentKey}_${field}`;
            if (!(metricKey in metrics)) {
              metrics[metricKey] = value;
            }
          }
        }
      }
    }

    // Method 2: Extract from flat attributes (when sheetMetrics not available)
    // Look for known semantic patterns in attribute keys
    for (const [key, value] of Object.entries(attrs)) {
      if (key.startsWith('_') || key === 'sheetMetrics') continue;
      if (typeof value !== 'number') continue;

      // Include numeric attributes as metrics
      // This handles: amount, goal, attainment, quantity, recordCount, etc
      metrics[key] = value;
    }

    // Method 3: Calculate attainment if we have amount and goal but no attainment
    for (const key of Object.keys(metrics)) {
      if (key.endsWith('_amount')) {
        const prefix = key.replace('_amount', '');
        const goalKey = `${prefix}_goal`;
        const attainmentKey = `${prefix}_attainment`;
        if (metrics[goalKey] && metrics[goalKey] > 0 && !metrics[attainmentKey]) {
          metrics[attainmentKey] = (metrics[key] / metrics[goalKey]) * 100;
        }
      }
    }

    return Object.keys(metrics).length > 0 ? metrics : null;
  }

  /**
   * Calculate metrics from transaction data
   */
  private calculateMetricsFromTransactions(
    employee: EmployeeData,
    periodId: string
  ): Record<string, number> | null {
    const transactions = this.getTransactions(employee.id, periodId);

    if (transactions.length === 0) {
      return null;
    }

    // Aggregate by category
    const metrics: Record<string, number> = {};

    for (const tx of transactions) {
      const category = tx.category || 'uncategorized';
      const metricKey = `${category}_volume`;
      metrics[metricKey] = (metrics[metricKey] || 0) + tx.amount;

      // Count transactions
      const countKey = `${category}_count`;
      metrics[countKey] = (metrics[countKey] || 0) + 1;
    }

    // Get quota targets to calculate attainment
    const quotas = this.getQuotas(employee.id, periodId);

    for (const [metric, actual] of Object.entries(metrics)) {
      if (metric.endsWith('_volume')) {
        const quotaKey = metric.replace('_volume', '_quota');
        const quota = quotas[quotaKey] || quotas.default_quota || 100000;
        const attainmentKey = metric.replace('_volume', '_attainment');
        metrics[attainmentKey] = (actual / quota) * 100;
      }
    }

    return metrics;
  }

  /**
   * Build calculation summary
   */
  private buildSummary(results: CalculationResult[]): OrchestrationResult['summary'] {
    const byPlan: Record<string, { count: number; total: number }> = {};
    const byDepartment: Record<string, { count: number; total: number }> = {};
    const plansUsed = new Set<string>();

    for (const result of results) {
      // By plan
      plansUsed.add(result.planId);
      if (!byPlan[result.planId]) {
        byPlan[result.planId] = { count: 0, total: 0 };
      }
      byPlan[result.planId].count++;
      byPlan[result.planId].total += result.totalIncentive;

      // By department (using storeId as proxy if no department)
      const dept = result.storeId || 'Unknown';
      if (!byDepartment[dept]) {
        byDepartment[dept] = { count: 0, total: 0 };
      }
      byDepartment[dept].count++;
      byDepartment[dept].total += result.totalIncentive;
    }

    return {
      totalPayout: results.reduce((sum, r) => sum + r.totalIncentive, 0),
      employeesProcessed: results.length,
      plansUsed: Array.from(plansUsed),
      byPlan,
      byDepartment,
    };
  }

  // ============================================
  // STORAGE HELPERS
  // ============================================

  private createRun(config: CalculationRunConfig, userId: string): CalculationRun {
    return {
      id: `run-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      tenantId: config.tenantId,
      periodId: config.periodId,
      runType: config.runType,
      status: 'pending',
      scope: config.scope,
      totalEmployees: 0,
      processedEmployees: 0,
      successCount: 0,
      errorCount: 0,
      startedAt: new Date().toISOString(),
      createdBy: userId,
    };
  }

  private saveRun(run: CalculationRun): void {
    if (typeof window === 'undefined') return;

    const runs = this.getRuns();
    const index = runs.findIndex((r) => r.id === run.id);

    if (index >= 0) {
      runs[index] = run;
    } else {
      runs.push(run);
    }

    localStorage.setItem(STORAGE_KEYS.CALCULATION_RUNS, JSON.stringify(runs));
  }

  getRuns(periodId?: string): CalculationRun[] {
    if (typeof window === 'undefined') return [];

    const stored = localStorage.getItem(STORAGE_KEYS.CALCULATION_RUNS);
    if (!stored) return [];

    try {
      const runs: CalculationRun[] = JSON.parse(stored);
      let filtered = runs.filter((r) => r.tenantId === this.tenantId);

      if (periodId) {
        filtered = filtered.filter((r) => r.periodId === periodId);
      }

      return filtered.sort(
        (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
      );
    } catch {
      return [];
    }
  }

  getRun(runId: string): CalculationRun | null {
    const runs = this.getRuns();
    return runs.find((r) => r.id === runId) || null;
  }

  private saveResults(results: CalculationResult[], runId: string): void {
    if (typeof window === 'undefined') return;

    const existing = this.getAllResults();

    // Add run ID to each result
    const newResults = results.map((r) => ({
      ...r,
      runId,
    }));

    // Remove old results for same period/employees
    const filtered = existing.filter((e) => {
      const matchingNew = newResults.find(
        (n) => n.employeeId === e.employeeId && n.period === e.period
      );
      return !matchingNew;
    });

    localStorage.setItem(STORAGE_KEYS.CALCULATIONS, JSON.stringify([...filtered, ...newResults]));
  }

  private getAllResults(): (CalculationResult & { runId?: string })[] {
    if (typeof window === 'undefined') return [];

    const stored = localStorage.getItem(STORAGE_KEYS.CALCULATIONS);
    if (!stored) return [];

    try {
      return JSON.parse(stored);
    } catch {
      return [];
    }
  }

  getResults(periodId: string): CalculationResult[] {
    return this.getAllResults().filter(
      (r) => r.period === periodId || r.period === periodId.substring(0, 7)
    );
  }

  getEmployeeResult(employeeId: string, periodId: string): CalculationResult | null {
    const results = this.getResults(periodId);
    return results.find((r) => r.employeeId === employeeId) || null;
  }

  // ============================================
  // DATA LAYER HELPERS
  // ============================================

  private getEmployees(): EmployeeData[] {
    if (typeof window === 'undefined') return [];

    // OB-16C PRIORITY 0: Aggregated data (bypasses 5MB localStorage limit)
    const aggregatedEmployees = this.loadAggregatedEmployees();
    if (aggregatedEmployees.length > 0) {
      console.log(`[Orchestrator] Using ${aggregatedEmployees.length} employees from AGGREGATED data`);
      return aggregatedEmployees;
    }

    // PRIORITY 1: Committed import data (real imported employees take precedence)
    // This ensures when a data import is committed, those employees are used
    const committedEmployees = this.extractEmployeesFromCommittedData();
    if (committedEmployees.length > 0) {
      console.log(`[Orchestrator] Using ${committedEmployees.length} employees from committed import data`);
      return committedEmployees;
    }

    // PRIORITY 2: Stored employee data (backward compatibility)
    const stored = localStorage.getItem(STORAGE_KEYS.EMPLOYEE_DATA);
    if (stored) {
      try {
        const employees: EmployeeData[] = JSON.parse(stored);
        const filtered = employees.filter((e) => e.tenantId === this.tenantId);
        if (filtered.length > 0) {
          console.log(`[Orchestrator] Using ${filtered.length} employees from stored data`);
          return filtered;
        }
      } catch {
        // Continue to next source
      }
    }

    // NO DEMO FALLBACK - Return empty array with clear error message
    // Demo data masks real issues and is a compliance violation in production
    console.error(`[Orchestrator] ERROR: No employee data found for tenant "${this.tenantId}". Import data first.`);
    console.log(`[Orchestrator] Checked: aggregated (0), committed data (0), stored data (0 for this tenant)`);
    return [];
  }

  /**
   * OB-16C: Load employees from aggregated data (handles large imports)
   */
  private loadAggregatedEmployees(): EmployeeData[] {
    const storageKey = `data_layer_committed_aggregated_${this.tenantId}`;
    const stored = localStorage.getItem(storageKey);

    if (!stored) {
      console.log(`[Orchestrator] No aggregated data found for tenant ${this.tenantId}`);
      return [];
    }

    try {
      const aggregated: Array<Record<string, unknown>> = JSON.parse(stored);
      console.log(`[Orchestrator] Found ${aggregated.length} aggregated employee records`);

      return aggregated.map((record): EmployeeData => ({
        id: String(record.employeeId || ''),
        tenantId: this.tenantId,
        employeeNumber: String(record.employeeId || record.num_empleado || ''),
        firstName: String(record.nombre || record.name || record.firstName || 'Imported'),
        lastName: String(record.apellido || record.lastName || 'Employee'),
        email: String(record.email || `${record.employeeId}@import.local`),
        role: String(record.puesto || record.role || record.cargo || 'imported'),
        department: String(record.departamento || record.department || ''),
        storeId: String(record.storeId || record.tienda || record.no_tienda || ''),
        managerId: String(record.managerId || ''),
        hireDate: String(record.fecha_ingreso || record.hireDate || ''),
        status: 'active' as const,
        // Include aggregated metrics as attributes
        attributes: {
          amount: Number(record.amount || record.monto || record.venta || 0),
          goal: Number(record.goal || record.meta || 0),
          attainment: Number(record.attainment || record.cumplimiento || 0),
          quantity: Number(record.quantity || record.cantidad || 0),
          recordCount: Number(record.recordCount || 1),
        },
      }));
    } catch (error) {
      console.error('[Orchestrator] Failed to parse aggregated data:', error);
      return [];
    }
  }

  /**
   * Extract employee records from committed import data (roster sheets)
   */
  private extractEmployeesFromCommittedData(): EmployeeData[] {
    if (typeof window === 'undefined') return [];

    const employees: EmployeeData[] = [];
    const seenIds = new Set<string>();

    // Get tenant batch IDs
    const batchesStored = localStorage.getItem(STORAGE_KEYS.DATA_LAYER_BATCHES);
    console.log(`[Orchestrator] Looking for batches, tenantId: ${this.tenantId}`);
    console.log(`[Orchestrator] Batches in storage: ${batchesStored ? 'YES' : 'NO'}`);
    if (!batchesStored) {
      console.log('[Orchestrator] No batches found in localStorage');
      return [];
    }

    let tenantBatchIds: string[] = [];
    try {
      const batches: [string, { tenantId: string }][] = JSON.parse(batchesStored);
      console.log(`[Orchestrator] Total batches: ${batches.length}`);
      const allTenantIds = batches.map(([, b]) => b.tenantId);
      console.log(`[Orchestrator] TenantIds in batches: ${Array.from(new Set(allTenantIds)).join(', ')}`);
      tenantBatchIds = batches
        .filter(([, batch]) => batch.tenantId === this.tenantId)
        .map(([id]) => id);
      console.log(`[Orchestrator] Batches matching tenantId '${this.tenantId}': ${tenantBatchIds.length}`);
    } catch (e) {
      console.error('[Orchestrator] Error parsing batches:', e);
      return [];
    }

    if (tenantBatchIds.length === 0) {
      console.log(`[Orchestrator] No batches found for tenant ${this.tenantId}`);
      return [];
    }

    // Get committed records
    const committedStored = localStorage.getItem(STORAGE_KEYS.DATA_LAYER_COMMITTED);
    console.log(`[Orchestrator] Committed in storage: ${committedStored ? 'YES' : 'NO'}`);
    if (committedStored) {
      console.log(`[Orchestrator] Committed storage size: ${Math.round(committedStored.length / 1024)} KB`);
    }
    if (!committedStored) {
      console.log('[Orchestrator] No committed records in localStorage');
      // OB-16B: List all localStorage keys for diagnostics
      console.log('[Orchestrator] Available localStorage keys:', Object.keys(localStorage).filter(k => k.includes('data_layer') || k.includes('committed') || k.includes('batch')));
      return [];
    }

    try {
      const committed: [
        string,
        {
          importBatchId: string;
          status: string;
          content: Record<string, unknown>;
        }
      ][] = JSON.parse(committedStored);
      console.log(`[Orchestrator] Total committed records: ${committed.length}`);

      let matchingBatchCount = 0;
      let hasNameCount = 0;
      let hasIdCount = 0;

      for (const [, record] of committed) {
        if (
          !tenantBatchIds.includes(record.importBatchId) ||
          record.status !== 'active'
        ) {
          continue;
        }
        matchingBatchCount++;

        const content = record.content;
        const employeeId = this.extractEmployeeIdFromContent(content);

        if (!employeeId || seenIds.has(employeeId)) {
          if (employeeId) hasIdCount++;
          continue;
        }
        hasIdCount++;

        // Check for employee-like fields (name, role, store, etc.)
        const hasNameField = content['nombre'] || content['name'] ||
          content['first_name'] || content['firstName'] ||
          content['nombre_completo'] || content['Nombre'];

        if (!hasNameField) continue;
        hasNameCount++;

        seenIds.add(employeeId);

        // Extract employee data from record
        const firstName = String(content['nombre'] || content['first_name'] ||
          content['firstName'] || content['nombre_completo'] || content['Nombre'] || '').split(' ')[0];
        const lastName = String(content['apellido'] || content['apellido_paterno'] ||
          content['last_name'] || content['lastName'] || '').trim() ||
          String(content['nombre'] || content['nombre_completo'] || content['Nombre'] || '').split(' ').slice(1).join(' ');

        employees.push({
          id: employeeId,
          tenantId: this.tenantId,
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
          attributes: {
            isCertified: Boolean(content['certificado'] || content['certified'] ||
              content['es_certificado'] || false),
          },
        });
      }
      console.log(`[Orchestrator] Records matching batch: ${matchingBatchCount}`);
      console.log(`[Orchestrator] Records with employee ID: ${hasIdCount}`);
      console.log(`[Orchestrator] Records with name field: ${hasNameCount}`);
      console.log(`[Orchestrator] Final employee count: ${employees.length}`);
    } catch (e) {
      console.error('[Orchestrator] Error extracting employees:', e);
      return [];
    }

    return employees;
  }

  /**
   * Extract employee ID from record content
   */
  private extractEmployeeIdFromContent(content: Record<string, unknown>): string | null {
    const idFields = [
      'num_empleado',
      'Num_Empleado',
      'employee_id',
      'employeeId',
      'emp_id',
      'empId',
      'employee_number',
      'employeeNumber',
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

    return null;
  }

  saveEmployees(employees: EmployeeData[]): void {
    if (typeof window === 'undefined') return;

    const existing = this.getEmployees().filter((e) => e.tenantId !== this.tenantId);
    const updated = [...existing, ...employees.map((e) => ({ ...e, tenantId: this.tenantId }))];

    localStorage.setItem(STORAGE_KEYS.EMPLOYEE_DATA, JSON.stringify(updated));
  }

  private getMetricAggregate(employeeId: string, periodId: string): MetricAggregate | null {
    if (typeof window === 'undefined') return null;

    const stored = localStorage.getItem(STORAGE_KEYS.METRIC_AGGREGATES);
    if (!stored) return null;

    try {
      const aggregates: MetricAggregate[] = JSON.parse(stored);
      return (
        aggregates.find(
          (a) =>
            a.employeeId === employeeId && a.periodId === periodId && a.tenantId === this.tenantId
        ) || null
      );
    } catch {
      return null;
    }
  }

  saveMetricAggregate(aggregate: MetricAggregate): void {
    if (typeof window === 'undefined') return;

    const stored = localStorage.getItem(STORAGE_KEYS.METRIC_AGGREGATES);
    let aggregates: MetricAggregate[] = [];

    try {
      aggregates = stored ? JSON.parse(stored) : [];
    } catch {
      aggregates = [];
    }

    // Remove existing for same employee/period
    aggregates = aggregates.filter(
      (a) =>
        !(
          a.employeeId === aggregate.employeeId &&
          a.periodId === aggregate.periodId &&
          a.tenantId === aggregate.tenantId
        )
    );

    aggregates.push({
      ...aggregate,
      tenantId: this.tenantId,
      lastUpdated: new Date().toISOString(),
    });

    localStorage.setItem(STORAGE_KEYS.METRIC_AGGREGATES, JSON.stringify(aggregates));
  }

  private getTransactions(
    employeeId: string,
    periodId: string
  ): Array<{ amount: number; category?: string }> {
    if (typeof window === 'undefined') return [];

    const stored = localStorage.getItem(STORAGE_KEYS.TRANSACTION_DATA);
    if (!stored) return [];

    try {
      const transactions: Array<{
        employeeId: string;
        periodId: string;
        tenantId: string;
        amount: number;
        category?: string;
      }> = JSON.parse(stored);

      return transactions.filter(
        (t) =>
          t.employeeId === employeeId && t.periodId === periodId && t.tenantId === this.tenantId
      );
    } catch {
      return [];
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private getQuotas(employeeId: string, periodId: string): Record<string, number> {
    // In a real implementation, this would load from quota assignments
    // using employeeId and periodId. For now, return defaults.
    return {
      default_quota: 100000,
      optical_quota: 150000,
      insurance_quota: 10000,
      services_quota: 5000,
    };
  }

  private getPeriodStart(periodId: string): string {
    // Parse period ID (e.g., "2025-01" -> "2025-01-01")
    if (periodId.length === 7) {
      return `${periodId}-01`;
    }
    return periodId;
  }

  private getPeriodEnd(periodId: string): string {
    // Parse period ID (e.g., "2025-01" -> "2025-01-31")
    if (periodId.length === 7) {
      const [year, month] = periodId.split('-').map(Number);
      const lastDay = new Date(year, month, 0).getDate();
      return `${periodId}-${String(lastDay).padStart(2, '0')}`;
    }
    return periodId;
  }

  // Demo data removed - OB-13A: Never use demo employees in production calculations
}

// ============================================
// SINGLETON & CONVENIENCE FUNCTIONS
// ============================================

const orchestrators: Map<string, CalculationOrchestrator> = new Map();

export function getOrchestrator(tenantId: string): CalculationOrchestrator {
  if (!orchestrators.has(tenantId)) {
    orchestrators.set(tenantId, new CalculationOrchestrator(tenantId));
  }
  return orchestrators.get(tenantId)!;
}

/**
 * Execute a calculation run for a period
 */
export async function runPeriodCalculation(
  tenantId: string,
  periodId: string,
  userId: string,
  options?: CalculationRunConfig['options']
): Promise<OrchestrationResult> {
  const orchestrator = getOrchestrator(tenantId);

  return orchestrator.executeRun(
    {
      tenantId,
      periodId,
      runType: 'official',
      scope: {},
      options,
    },
    userId
  );
}

/**
 * Preview calculation for a period without storing results
 */
export async function previewPeriodCalculation(
  tenantId: string,
  periodId: string,
  userId: string
): Promise<OrchestrationResult> {
  const orchestrator = getOrchestrator(tenantId);

  return orchestrator.executeRun(
    {
      tenantId,
      periodId,
      runType: 'preview',
      scope: {},
      options: { dryRun: true },
    },
    userId
  );
}

/**
 * Get calculation results for a period
 */
export function getPeriodResults(tenantId: string, periodId: string): CalculationResult[] {
  const orchestrator = getOrchestrator(tenantId);
  return orchestrator.getResults(periodId);
}

/**
 * Get calculation runs for a period
 */
export function getPeriodRuns(tenantId: string, periodId?: string): CalculationRun[] {
  const orchestrator = getOrchestrator(tenantId);
  return orchestrator.getRuns(periodId);
}
