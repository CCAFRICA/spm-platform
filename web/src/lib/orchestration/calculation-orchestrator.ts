/**
 * Calculation Orchestrator
 *
 * Bridges data → plans → calculation → results for end-to-end processing.
 * Provides the integration layer between import pipeline, plan storage,
 * calculation engine, and result storage.
 */

import type { CalculationResult } from '@/types/compensation-plan';
import { calculateIncentive, type EmployeeMetrics, resetEngineDiag } from '@/lib/compensation/calculation-engine';
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
  private _diagLogged: boolean = false;

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
    // CLT-08 DIAG: Reset diagnostic flags for new run
    this._diagLogged = false;
    resetEngineDiag();

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
   * OB-20 Phase 2: Derive isCertified from employee role
   * Looks for "CERTIFICADO" in the role string (but not "NO CERTIFICADO")
   * TODO: Make this AI-driven from plan interpretation in the future
   */
  private deriveIsCertified(employee: EmployeeData): boolean {
    // Check explicit attribute first
    if (employee.attributes?.isCertified !== undefined) {
      return Boolean(employee.attributes.isCertified);
    }

    // Derive from role string
    const role = (employee.role || '').toUpperCase();
    const hasCertificado = role.includes('CERTIFICADO');
    const hasNoCertificado = role.includes('NO CERTIFICADO') || role.includes('NO-CERTIFICADO') || role.includes('NON-CERTIFICADO');

    // Certified if contains CERTIFICADO but NOT "NO CERTIFICADO"
    const isCertified = hasCertificado && !hasNoCertificado;

    // DIAG: Log for first employee
    if (!this._diagLogged) {
      console.log(`DIAG-VARIANT: Employee ${employee.id} role="${employee.role}" → isCertified=${isCertified}`);
    }

    return isCertified;
  }

  /**
   * Get employee metrics for a period
   * AI-DRIVEN: Uses AI import context to extract metrics from aggregated data
   */
  private getEmployeeMetrics(employee: EmployeeData, periodId: string): EmployeeMetrics | null {
    // AI-DRIVEN PRIORITY 0: Extract metrics from aggregated employee attributes using AI mappings
    const aiMetrics = this.extractMetricsWithAIMappings(employee);
    if (aiMetrics && Object.keys(aiMetrics).length > 0) {
      // DIAG: Log metrics being passed to engine for first employee
      if (!this._diagLogged || employee.id === 'DIAG_LOG_ALWAYS') {
        console.log('DIAG-ORCH: === METRICS PASSED TO ENGINE ===');
        console.log('DIAG-ORCH: Employee:', employee.id);
        console.log('DIAG-ORCH: Metric keys:', Object.keys(aiMetrics));
        console.log('DIAG-ORCH: Full metrics:', JSON.stringify(aiMetrics, null, 2));
        // Check for expected plan metrics
        console.log('DIAG-ORCH: Plan expects: optical_attainment =', aiMetrics['optical_attainment']);
        console.log('DIAG-ORCH: Plan expects: optical_volume =', aiMetrics['optical_volume']);
        console.log('DIAG-ORCH: Plan expects: store_attainment =', aiMetrics['store_attainment']);
        console.log('DIAG-ORCH: Plan expects: new_customers_attainment =', aiMetrics['new_customers_attainment']);
        console.log('DIAG-ORCH: Plan expects: collection_rate =', aiMetrics['collection_rate']);
        console.log('DIAG-ORCH: Plan expects: insurance_collection_rate =', aiMetrics['insurance_collection_rate']);
        console.log('DIAG-ORCH: Plan expects: insurance_premium_total =', aiMetrics['insurance_premium_total']);
        console.log('DIAG-ORCH: Plan expects: services_revenue =', aiMetrics['services_revenue']);
      }
      return {
        employeeId: employee.id,
        employeeName: `${employee.firstName} ${employee.lastName}`,
        employeeRole: employee.role,
        storeId: employee.storeId,
        storeName: employee.storeName,
        isCertified: this.deriveIsCertified(employee),
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
        isCertified: this.deriveIsCertified(employee),
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
        isCertified: this.deriveIsCertified(employee),
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

    // AI-DRIVEN: Extract metrics from componentMetrics structure
    const componentMetrics = attrs.componentMetrics as Record<string, { attainment?: number; amount?: number; goal?: number }> | undefined;

    // DIAG: Log for first employee
    const isFirstEmployee = employee.id === Object.keys(attrs)[0] || !this._diagLogged;
    if (isFirstEmployee && !this._diagLogged) {
      this._diagLogged = true;
      console.log('DIAG-ORCH: === ORCHESTRATOR METRIC EXTRACTION ===');
      console.log('DIAG-ORCH: Employee ID:', employee.id);
      console.log('DIAG-ORCH: Employee Name:', `${employee.firstName} ${employee.lastName}`);
      console.log('DIAG-ORCH: componentMetrics present:', !!componentMetrics);
      if (componentMetrics) {
        console.log('DIAG-ORCH: componentMetrics sheets:', Object.keys(componentMetrics));
        for (const [sheet, values] of Object.entries(componentMetrics)) {
          console.log(`DIAG-ORCH: componentMetrics["${sheet}"] =`, JSON.stringify(values));
        }
      }
      console.log('DIAG-ORCH: AI Import Context sheets:', this.aiImportContext?.sheets?.map(s => ({
        name: s.sheetName,
        component: s.matchedComponent
      })));
    }

    if (componentMetrics) {
      // componentMetrics has: { sheetName: { attainment, amount, goal } }
      for (const [sheetName, sheetMetrics] of Object.entries(componentMetrics)) {
        // AI-DRIVEN: Find component name from AI import context
        const sheetInfo = this.aiImportContext?.sheets.find(
          s => s.sheetName === sheetName || s.sheetName.toLowerCase() === sheetName.toLowerCase()
        );
        const componentKey = sheetInfo?.matchedComponent || sheetName;

        // CLT-08 FIX: Map to plan's expected metric names based on component type
        // The plan expects: optical_attainment, store_attainment, etc.
        // We need to translate componentKey to the plan's metric naming convention
        const planMetricBase = this.translateToPlanMetricName(componentKey, sheetName);

        // Add metrics with plan-expected names
        if (sheetMetrics.attainment !== undefined) {
          metrics[`${planMetricBase}_attainment`] = sheetMetrics.attainment;

          // PHASE 4 FIX: RetailCGMX plan-specific metric aliases
          // Plan expects store_sales_attainment, collections_attainment, store_goal_attainment
          if (planMetricBase === 'store') {
            metrics['store_sales_attainment'] = sheetMetrics.attainment;
            metrics['store_goal_attainment'] = sheetMetrics.attainment; // For insurance conditional
          }
          if (planMetricBase === 'collection') {
            metrics['collection_rate'] = sheetMetrics.attainment;
            metrics['collections_attainment'] = sheetMetrics.attainment;
          }
          if (planMetricBase === 'insurance') {
            metrics['insurance_collection_rate'] = sheetMetrics.attainment;
          }
          // Also keep the original keys for debugging
          metrics[`${componentKey}_attainment`] = sheetMetrics.attainment;
          metrics[`${sheetName}_attainment`] = sheetMetrics.attainment;
        }
        if (sheetMetrics.amount !== undefined) {
          metrics[`${planMetricBase}_volume`] = sheetMetrics.amount;
          metrics[`${planMetricBase}_amount`] = sheetMetrics.amount;

          // PHASE 4 FIX: RetailCGMX plan-specific metric aliases
          // Plan expects store_optical_sales, individual_insurance_sales, individual_warranty_sales
          if (planMetricBase === 'optical') {
            metrics['store_optical_sales'] = sheetMetrics.amount;
          }
          if (planMetricBase === 'insurance') {
            metrics['insurance_premium_total'] = sheetMetrics.amount;
            metrics['individual_insurance_sales'] = sheetMetrics.amount;
          }
          if (planMetricBase === 'services') {
            metrics['services_revenue'] = sheetMetrics.amount;
            metrics['individual_warranty_sales'] = sheetMetrics.amount;
          }
          metrics[`${componentKey}_amount`] = sheetMetrics.amount;
          metrics[`${sheetName}_amount`] = sheetMetrics.amount;
        }
        if (sheetMetrics.goal !== undefined) {
          metrics[`${planMetricBase}_goal`] = sheetMetrics.goal;
          metrics[`${componentKey}_goal`] = sheetMetrics.goal;
          metrics[`${sheetName}_goal`] = sheetMetrics.goal;
        }

        // Calculate attainment if we have amount and goal but no attainment
        if (sheetMetrics.attainment === undefined && sheetMetrics.amount !== undefined && sheetMetrics.goal && sheetMetrics.goal > 0) {
          const calculatedAttainment = (sheetMetrics.amount / sheetMetrics.goal) * 100;
          metrics[`${planMetricBase}_attainment`] = calculatedAttainment;

          // PHASE 4 FIX: RetailCGMX plan-specific aliases for calculated attainment
          if (planMetricBase === 'store') {
            metrics['store_sales_attainment'] = calculatedAttainment;
            metrics['store_goal_attainment'] = calculatedAttainment;
          }
          if (planMetricBase === 'collection') {
            metrics['collection_rate'] = calculatedAttainment;
            metrics['collections_attainment'] = calculatedAttainment;
          }
          if (planMetricBase === 'insurance') {
            metrics['insurance_collection_rate'] = calculatedAttainment;
          }
          metrics[`${componentKey}_attainment`] = calculatedAttainment;
          metrics[`${sheetName}_attainment`] = calculatedAttainment;
        }

        // DIAG: Log what metrics we created for first employee
        if (isFirstEmployee) {
          console.log(`DIAG-ORCH: Sheet "${sheetName}" -> componentKey="${componentKey}" -> planMetricBase="${planMetricBase}"`);
          console.log(`DIAG-ORCH:   Created metrics: ${planMetricBase}_attainment, ${planMetricBase}_volume, etc.`);
        }
      }
    }

    // Fallback: Extract from flat numeric attributes (backward compatibility)
    if (Object.keys(metrics).length === 0) {
      for (const [key, value] of Object.entries(attrs)) {
        if (key.startsWith('_') || key === 'componentMetrics') continue;
        if (typeof value === 'number') {
          metrics[key] = value;
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

      // Log sample for diagnostic
      if (aggregated.length > 0) {
        console.log(`[Orchestrator] Sample record keys:`, Object.keys(aggregated[0]));
        if (aggregated[0].componentMetrics) {
          console.log(`[Orchestrator] Sample componentMetrics sheets:`, Object.keys(aggregated[0].componentMetrics as object));
        }
      }

      return aggregated.map((record): EmployeeData => {
        // AI-DRIVEN: Use fields directly from aggregated record (set by AI-driven aggregation)
        const name = String(record.name || '');
        const nameParts = name.split(' ');

        return {
          id: String(record.employeeId || ''),
          tenantId: this.tenantId,
          employeeNumber: String(record.employeeId || ''),
          firstName: nameParts[0] || 'Employee',
          lastName: nameParts.slice(1).join(' ') || String(record.employeeId || ''),
          email: `${record.employeeId}@import.local`,
          role: String(record.role || ''),
          department: '',
          storeId: String(record.storeId || ''),
          managerId: '',
          hireDate: '',
          status: 'active' as const,
          storeName: String(record.storeRange || ''),
          // AI-DRIVEN: Pass componentMetrics for metric extraction
          attributes: {
            componentMetrics: record.componentMetrics,
            month: record.month,
            year: record.year,
            storeRange: record.storeRange,
            _hasData: record._hasData,
          },
        };
      });
    } catch (error) {
      console.error('[Orchestrator] Failed to parse aggregated data:', error);
      return [];
    }
  }

  /**
   * CLT-08 FIX: Translate component/sheet name to plan's expected metric prefix
   *
   * The plan expects metric names like: optical_attainment, store_attainment, etc.
   * The import creates metrics by sheet name: Base_Venta_Individual, etc.
   *
   * This mapping bridges the gap.
   */
  private translateToPlanMetricName(componentKey: string, sheetName: string): string {
    const key = componentKey.toLowerCase().replace(/[-\s]/g, '_');
    const sheet = sheetName.toLowerCase().replace(/[-\s]/g, '_');

    // Mapping from AI import component/sheet names to plan metric prefixes
    const PLAN_METRIC_MAP: Record<string, string> = {
      // Component-based mappings (from AI matchedComponent)
      'venta_optica': 'optical',
      'venta_optica_certificado': 'optical',
      'venta_optica_no_certificado': 'optical',
      'optical_sales': 'optical',
      'venta_individual': 'optical',
      'venta_tienda': 'store',
      'store_sales': 'store',
      'store_performance': 'store',
      'clientes_nuevos': 'new_customers',
      'new_customers': 'new_customers',
      'cobranza': 'collection',
      'cobranza_tienda': 'collection',  // CLT-08 FIX: Added missing entry
      'collections': 'collection',
      'seguros': 'insurance',
      'venta_seguros': 'insurance',
      'insurance': 'insurance',
      'club_proteccion': 'insurance',
      'servicios': 'services',
      'venta_servicios': 'services',
      'services': 'services',
      'garantia_extendida': 'services',

      // Sheet-based mappings (when component match fails)
      'base_venta_individual': 'optical',
      'base_venta_tienda': 'store',
      'base_clientes_nuevos': 'new_customers',
      'base_cobranza': 'collection',
      'base_cobranza_tienda': 'collection',
      'base_club_proteccion': 'insurance',
      'base_garantia_extendida': 'services',
    };

    // Try exact match on componentKey
    if (PLAN_METRIC_MAP[key]) {
      return PLAN_METRIC_MAP[key];
    }

    // Try exact match on sheetName
    if (PLAN_METRIC_MAP[sheet]) {
      return PLAN_METRIC_MAP[sheet];
    }

    // CLT-08 FIX: Fuzzy substring matching as fallback
    const SUBSTRING_MAP: [string, string][] = [
      ['optica', 'optical'],
      ['venta_individual', 'optical'],
      ['tienda', 'store'],
      ['cliente', 'new_customers'],
      ['cobranza', 'collection'],
      ['seguro', 'insurance'],
      ['proteccion', 'insurance'],
      ['servicio', 'services'],
      ['garantia', 'services'],
    ];

    for (const [substr, metric] of SUBSTRING_MAP) {
      if (key.includes(substr) || sheet.includes(substr)) {
        return metric;
      }
    }

    // Last resort: return the componentKey as-is
    console.warn(`DIAG-ORCH: No translation found for componentKey="${key}", sheet="${sheet}"`);
    return key;
  }

  /**
   * AI-DRIVEN: Find a source field name by its semantic type using AI import context.
   * Returns the original column name from the data, or null if not found.
   * This is the ONLY way to resolve field names - never hardcode column names.
   */
  private findFieldBySemantic(
    sheetName: string,
    ...semanticTypes: string[]
  ): string | null {
    if (!this.aiImportContext?.sheets) return null;

    const sheetInfo = this.aiImportContext.sheets.find(
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
  private extractFieldValue(
    content: Record<string, unknown>,
    sheetName: string,
    semanticTypes: string[]
  ): string {
    const fieldName = this.findFieldBySemantic(sheetName, ...semanticTypes);
    if (fieldName && content[fieldName] !== undefined && content[fieldName] !== null) {
      return String(content[fieldName]).trim();
    }
    return '';
  }

  /**
   * AI-DRIVEN: Extract employee records from committed import data (roster sheets)
   * Uses ONLY AI semantic mappings - NO HARDCODED FIELD NAMES
   */
  private extractEmployeesFromCommittedData(): EmployeeData[] {
    if (typeof window === 'undefined') return [];

    // AI-DRIVEN: Check for AI import context
    if (!this.aiImportContext) {
      console.warn('[Orchestrator] NO AI IMPORT CONTEXT - cannot extract employees. Re-import data to generate mappings.');
      return [];
    }

    const employees: EmployeeData[] = [];
    const seenIds = new Set<string>();

    // Get roster sheet info from AI context
    const rosterSheet = this.aiImportContext.rosterSheet;
    const rosterSheetInfo = this.aiImportContext.sheets.find(s => s.classification === 'roster');
    if (!rosterSheet || !rosterSheetInfo) {
      console.warn('[Orchestrator] NO ROSTER SHEET IDENTIFIED in AI context - cannot extract employees.');
      return [];
    }
    console.log(`[Orchestrator] AI identified roster sheet: "${rosterSheet}"`);

    // Get tenant batch IDs
    const batchesStored = localStorage.getItem(STORAGE_KEYS.DATA_LAYER_BATCHES);
    console.log(`[Orchestrator] Looking for batches, tenantId: ${this.tenantId}`);
    if (!batchesStored) {
      console.log('[Orchestrator] No batches found in localStorage');
      return [];
    }

    let tenantBatchIds: string[] = [];
    try {
      const batches: [string, { tenantId: string }][] = JSON.parse(batchesStored);
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
    if (!committedStored) {
      console.log('[Orchestrator] No committed records in localStorage');
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
      let rosterRecordCount = 0;

      for (const [, record] of committed) {
        if (
          !tenantBatchIds.includes(record.importBatchId) ||
          record.status !== 'active'
        ) {
          continue;
        }
        matchingBatchCount++;

        const content = record.content;
        const sheetName = String(content._sheetName || '');

        // AI-DRIVEN: Only process roster sheet records
        if (sheetName.toLowerCase() !== rosterSheet.toLowerCase()) {
          continue;
        }
        rosterRecordCount++;

        // AI-DRIVEN: Extract employee ID using semantic mapping
        const employeeId = this.extractFieldValue(content, sheetName, ['employeeId', 'employee_id']);

        if (!employeeId || employeeId.length < 3 || seenIds.has(employeeId)) {
          continue;
        }
        seenIds.add(employeeId);

        // AI-DRIVEN: Extract all fields using semantic mappings
        const fullName = this.extractFieldValue(content, sheetName, ['name', 'employeeName', 'fullName']);
        const firstName = fullName.split(' ')[0] || 'Unknown';
        const lastName = fullName.split(' ').slice(1).join(' ') || 'Employee';

        employees.push({
          id: employeeId.toLowerCase().replace(/\s+/g, '-'),
          tenantId: this.tenantId,
          employeeNumber: employeeId,
          firstName,
          lastName,
          email: this.extractFieldValue(content, sheetName, ['email']),
          role: this.extractFieldValue(content, sheetName, ['role', 'position', 'employeeType', 'jobTitle']) || 'sales_rep',
          department: this.extractFieldValue(content, sheetName, ['department']),
          storeId: this.extractFieldValue(content, sheetName, ['storeId', 'locationId', 'store']),
          storeName: this.extractFieldValue(content, sheetName, ['storeName', 'locationName']),
          managerId: this.extractFieldValue(content, sheetName, ['managerId']),
          hireDate: this.extractFieldValue(content, sheetName, ['hireDate', 'startDate']),
          status: 'active' as const,
          attributes: {},
        });
      }
      console.log(`[Orchestrator] Records matching batch: ${matchingBatchCount}`);
      console.log(`[Orchestrator] Roster records found: ${rosterRecordCount}`);
      console.log(`[Orchestrator] Final employee count: ${employees.length}`);
    } catch (e) {
      console.error('[Orchestrator] Error extracting employees:', e);
      return [];
    }

    return employees;
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
