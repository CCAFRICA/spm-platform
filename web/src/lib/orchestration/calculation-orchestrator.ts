/**
 * Calculation Orchestrator
 *
 * Bridges data → plans → calculation → results for end-to-end processing.
 * Provides the integration layer between import pipeline, plan storage,
 * calculation engine, and result storage.
 */

import type { CalculationResult } from '@/types/compensation-plan';
import {
  calculateIncentive,
  startCalculationRun,
  endCalculationRun,
  type EmployeeMetrics,
} from '@/lib/compensation/calculation-engine';
import { getPlans } from '@/lib/compensation/plan-storage';
import { audit } from '@/lib/audit-service';
import {
  buildCalculationContext,
  buildEmployeeMetrics,
  type CalculationContext,
} from '@/lib/calculation/context-resolver';
import { loadImportContext, type AIImportContext } from '@/lib/data-architecture/data-layer-service';
import {
  buildComponentMetrics,
  extractMetricConfig,
  findSheetForComponent,
  type SheetMetrics,
} from './metric-resolver';
import type { PlanComponent } from '@/types/compensation-plan';

// ============================================
// STORAGE KEYS
// ============================================

const STORAGE_KEYS = {
  CALCULATIONS: 'vialuce_calculations',
  CALCULATION_RUNS: 'vialuce_calculation_runs',
  EMPLOYEE_DATA: 'vialuce_employee_data',
  TRANSACTION_DATA: 'vialuce_transaction_data',
  METRIC_AGGREGATES: 'vialuce_metric_aggregates',
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
  // OB-21: Plan-driven metric resolution - stores active plan's components
  private planComponents: PlanComponent[] = [];
  // OB-27B: Log flag to avoid console spam
  private _ob27bLogged = false;

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

      // OB-21: Extract all plan components for plan-driven metric resolution
      if (activePlan.configuration.type === 'additive_lookup') {
        this.planComponents = activePlan.configuration.variants.flatMap(v => v.components);
        console.log(`[Orchestrator] OB-21: Loaded ${this.planComponents.length} plan components for metric resolution`);
      }

      // Process each employee
      const results: CalculationResult[] = [];
      const errors: Array<{ employeeId: string; error: string }> = [];

      // OB-27B: Start calculation run for warning summary
      startCalculationRun();

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

      // OB-27B: End calculation run and log warning summary
      endCalculationRun(employees.length);

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

      // Log audit event for calculation completion
      audit.log({
        action: 'create',
        entityType: 'payment',
        entityId: run.id,
        entityName: `Calculation Run ${run.runType}`,
        metadata: {
          tenantId: config.tenantId,
          periodId: config.periodId,
          runType: run.runType,
          employeeCount: run.processedEmployees,
          totalCompensation: run.totalPayout,
          errorCount: run.errorCount,
        },
      });

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
   * OB-22: Added period filtering to only process employees for selected period
   * HOTFIX: periodId is a hash, not a date — look up period metadata to get year/month
   */
  private getEmployeesForRun(config: CalculationRunConfig): EmployeeData[] {
    const allEmployees = this.getEmployees();

    // HOTFIX: Look up period from storage to get actual year/month
    const { selectedYear, selectedMonth } = this.resolvePeriodYearMonth(config.periodId, config.tenantId);

    console.log(`[Orchestrator] Period filter: ${config.periodId} -> year=${selectedYear}, month=${selectedMonth}`);
    console.log(`[Orchestrator] Total employees before period filter: ${allEmployees.length}`);

    const filtered = allEmployees.filter((emp) => {
      // Filter by status
      if (!config.options?.includeInactive && emp.status !== 'active') {
        return false;
      }

      // OB-22: Filter by period - match against employee's month/year attributes
      // HOTFIX: Skip period filtering if we couldn't resolve period year/month
      if (!isNaN(selectedYear) && !isNaN(selectedMonth)) {
        const attrs = emp.attributes as Record<string, unknown> | undefined;
        if (attrs?.month !== undefined || attrs?.year !== undefined) {
          const empMonth = this.parseMonthToNumber(String(attrs?.month || ''));
          const empYear = Number(attrs?.year);

          // HOTFIX: Only compare fields that are actually populated
          // If field is empty/falsy, skip that check (treat as match)
          const monthMatch = !empMonth || empMonth === selectedMonth;
          const yearMatch = !empYear || empYear === selectedYear;

          if (!monthMatch || !yearMatch) {
            return false;
          }
        }
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

    console.log(`[Orchestrator] Employees after period filter: ${filtered.length}`);
    return filtered;
  }

  /**
   * OB-22: Parse month name (Spanish or English or number) to month number (1-12)
   */
  private parseMonthToNumber(month: string): number {
    const monthStr = month.toLowerCase().trim();

    // Spanish month names
    const spanishMonths: Record<string, number> = {
      'enero': 1, 'febrero': 2, 'marzo': 3, 'abril': 4,
      'mayo': 5, 'junio': 6, 'julio': 7, 'agosto': 8,
      'septiembre': 9, 'octubre': 10, 'noviembre': 11, 'diciembre': 12
    };

    // English month names
    const englishMonths: Record<string, number> = {
      'january': 1, 'february': 2, 'march': 3, 'april': 4,
      'may': 5, 'june': 6, 'july': 7, 'august': 8,
      'september': 9, 'october': 10, 'november': 11, 'december': 12
    };

    // Short forms (English + Spanish unique ones)
    const shortMonths: Record<string, number> = {
      'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4,
      'may': 5, 'jun': 6, 'jul': 7, 'aug': 8,
      'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12,
      'ene': 1, 'abr': 4, 'ago': 8, 'dic': 12
    };

    // Try numeric first
    const numMonth = parseInt(monthStr, 10);
    if (!isNaN(numMonth) && numMonth >= 1 && numMonth <= 12) {
      return numMonth;
    }

    // Try full names
    if (spanishMonths[monthStr]) return spanishMonths[monthStr];
    if (englishMonths[monthStr]) return englishMonths[monthStr];

    // Try short forms
    const shortForm = monthStr.substring(0, 3);
    if (shortMonths[shortForm]) return shortMonths[shortForm];

    console.warn(`[Orchestrator] Could not parse month: "${month}"`);
    return 0;
  }

  /**
   * HOTFIX: Resolve period year/month from period ID
   * periodId is a hash like "period-177068616..." — need to look up actual period metadata
   */
  private resolvePeriodYearMonth(periodId: string, tenantId: string): { selectedYear: number; selectedMonth: number } {
    // Try to look up period from storage
    try {
      // Try tenant-specific periods first
      const tenantPeriodsKey = `vialuce_periods_${tenantId}`;
      const tenantPeriodsData = localStorage.getItem(tenantPeriodsKey);
      if (tenantPeriodsData) {
        const periods = JSON.parse(tenantPeriodsData) as Array<{ id: string; startDate?: string; name?: string }>;
        const period = periods.find(p => p.id === periodId);
        if (period?.startDate) {
          // HOTFIX: Parse date string directly to avoid timezone shift
          // "2024-01-01" or "2024-01-01T00:00:00Z" -> year=2024, month=1
          const parsed = this.parseDateStringToYearMonth(period.startDate);
          if (parsed) return parsed;
        }
        // Try parsing from name (e.g., "January 2024")
        if (period?.name) {
          const parsed = this.parseYearMonthFromLabel(period.name);
          if (parsed) return parsed;
        }
      }

      // Try global periods storage
      const globalPeriodsKey = 'vialuce_payroll_periods';
      const globalPeriodsData = localStorage.getItem(globalPeriodsKey);
      if (globalPeriodsData) {
        const periods = JSON.parse(globalPeriodsData) as Array<{ id: string; startDate?: string; name?: string }>;
        const period = periods.find(p => p.id === periodId);
        if (period?.startDate) {
          // HOTFIX: Parse date string directly to avoid timezone shift
          const parsed = this.parseDateStringToYearMonth(period.startDate);
          if (parsed) return parsed;
        }
        if (period?.name) {
          const parsed = this.parseYearMonthFromLabel(period.name);
          if (parsed) return parsed;
        }
      }

      // Try parsing periodId itself (legacy format "2024-01")
      if (periodId.match(/^\d{4}-\d{2}$/)) {
        const [year, month] = periodId.split('-').map(Number);
        return { selectedYear: year, selectedMonth: month };
      }

    } catch (e) {
      console.warn(`[Orchestrator] Failed to resolve period metadata:`, e);
    }

    // SAFE FALLBACK: Cannot determine period — skip period filtering
    console.warn(`[Orchestrator] HOTFIX: Cannot resolve period ${periodId} — skipping period filter`);
    return { selectedYear: NaN, selectedMonth: NaN };
  }

  /**
   * HOTFIX: Parse date string directly without timezone conversion
   * Handles: "2024-01-01", "2024-01-01T00:00:00Z", "2024-01-15T12:30:00.000Z"
   * Returns year/month from the STRING, not from Date object (avoids timezone shift)
   */
  private parseDateStringToYearMonth(dateStr: string): { selectedYear: number; selectedMonth: number } | null {
    // Try to extract YYYY-MM from the beginning of the string
    const match = dateStr.match(/^(\d{4})-(\d{2})/);
    if (match) {
      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10);
      if (!isNaN(year) && month >= 1 && month <= 12) {
        return { selectedYear: year, selectedMonth: month };
      }
    }
    // Fallback to UTC methods if string parsing fails
    try {
      const date = new Date(dateStr);
      if (!isNaN(date.getTime())) {
        return { selectedYear: date.getUTCFullYear(), selectedMonth: date.getUTCMonth() + 1 };
      }
    } catch {
      // Ignore parse errors
    }
    return null;
  }

  /**
   * Parse year/month from a period label like "January 2024" or "Enero 2024 (draft)"
   */
  private parseYearMonthFromLabel(label: string): { selectedYear: number; selectedMonth: number } | null {
    const monthNames: Record<string, number> = {
      'january': 1, 'february': 2, 'march': 3, 'april': 4,
      'may': 5, 'june': 6, 'july': 7, 'august': 8,
      'september': 9, 'october': 10, 'november': 11, 'december': 12,
      'enero': 1, 'febrero': 2, 'marzo': 3, 'abril': 4,
      'mayo': 5, 'junio': 6, 'julio': 7, 'agosto': 8,
      'septiembre': 9, 'octubre': 10, 'noviembre': 11, 'diciembre': 12
    };

    const match = label.toLowerCase().match(/(\w+)\s+(\d{4})/);
    if (match) {
      const monthNum = monthNames[match[1]];
      const year = parseInt(match[2], 10);
      if (monthNum && !isNaN(year)) {
        return { selectedYear: year, selectedMonth: monthNum };
      }
    }
    return null;
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

    // OB-27B: Normalize whitespace and derive from role string
    // Handles "OPTOMETRISTA  NO CERTIFICADO" (double spaces) correctly
    const role = (employee.role || '').toUpperCase().replace(/\s+/g, ' ').trim();

    // Check for "NO CERTIFICADO" first (more specific match)
    const hasNoCertificado = role.includes('NO CERTIFICADO') ||
                             role.includes('NO-CERTIFICADO') ||
                             role.includes('NON-CERTIFICADO') ||
                             role.includes('NO CERT') ||
                             role.includes('NON-CERT');

    // Then check for "CERTIFICADO" (must come AFTER the NO check)
    const hasCertificado = role.includes('CERTIFICADO') || role.includes('CERTIFIED');

    // Certified if contains CERTIFICADO but NOT "NO CERTIFICADO"
    const isCertified = hasCertificado && !hasNoCertificado;

    // OB-27B: Log variant resolution for diagnostic
    if (hasCertificado || hasNoCertificado) {
      console.log(`[Orchestrator] Variant resolution: "${employee.role}" -> normalized: "${role}" -> isCertified: ${isCertified}`);
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
   * HF-018: SCOPED METRICS PER COMPONENT
   *
   * Each plan component receives metrics ONLY from its corresponding data sheet.
   * This prevents "metric bleed" where one sheet's values could be used for
   * a different component's calculation.
   *
   * PRINCIPLE: AI-First semantic matching between component names and sheet names.
   * No hardcoded sheet-to-component mappings.
   */
  private extractMetricsWithAIMappings(employee: EmployeeData): Record<string, number> | null {
    const attrs = employee.attributes as Record<string, unknown> | undefined;
    if (!attrs) return null;

    const metrics: Record<string, number> = {};

    // Get componentMetrics from employee (aggregated by sheet name)
    const componentMetrics = attrs.componentMetrics as Record<string, SheetMetrics> | undefined;

    // HF-018 R2: TARGETED DIAGNOSTIC for store 7967 only
    const isStore7967 = String(employee.storeId) === '7967';
    if (isStore7967) {
      console.log(`[HF-018 TRACE] Employee ${employee.id} (store ${employee.storeId})`);
      console.log(`[HF-018 TRACE] componentMetrics keys: ${componentMetrics ? Object.keys(componentMetrics).join(', ') : 'NONE'}`);
      if (componentMetrics) {
        // Log Clientes Nuevos sheet specifically
        const clientesSheet = Object.entries(componentMetrics).find(([k]) => k.toLowerCase().includes('clientes'));
        if (clientesSheet) {
          console.log(`[HF-018 TRACE] ${clientesSheet[0]}: attainment=${clientesSheet[1].attainment}, goal=${clientesSheet[1].goal}, amount=${clientesSheet[1].amount}`);
        }
      }
    }

    if (!componentMetrics || this.planComponents.length === 0) {
      // FALLBACK: Extract from flat numeric attributes (backward compatibility)
      for (const [key, value] of Object.entries(attrs)) {
        if (key.startsWith('_') || key === 'componentMetrics') continue;
        if (typeof value === 'number') {
          metrics[key] = value;
        }
      }
      return Object.keys(metrics).length > 0 ? metrics : null;
    }

    // HF-018: Build component-to-sheet mapping using semantic matching
    const componentSheetMap = new Map<string, string>();

    for (const component of this.planComponents) {
      // Strategy 1: AI Import Context mapping
      let matchedSheet = findSheetForComponent(
        component.name,
        component.id,
        this.aiImportContext?.sheets || []
      );

      // Strategy 2: Pattern-based matching against actual sheet names
      if (!matchedSheet) {
        for (const sheetName of Object.keys(componentMetrics)) {
          const matched = findSheetForComponent(
            component.name,
            component.id,
            [{ sheetName, matchedComponent: null }]
          );
          if (matched === sheetName) {
            matchedSheet = sheetName;
            break;
          }
        }
      }

      // Strategy 3: Loose name matching fallback
      if (!matchedSheet) {
        const compNameNorm = component.name.toLowerCase().replace(/[-\s]/g, '_');
        const compIdNorm = component.id.toLowerCase().replace(/[-\s]/g, '_');
        for (const sheetName of Object.keys(componentMetrics)) {
          const sheetNorm = sheetName.toLowerCase().replace(/[-\s]/g, '_');
          if (sheetNorm.includes(compNameNorm) || compNameNorm.includes(sheetNorm) ||
              sheetNorm.includes(compIdNorm) || compIdNorm.includes(sheetNorm)) {
            matchedSheet = sheetName;
            break;
          }
        }
      }

      if (matchedSheet) {
        componentSheetMap.set(component.id, matchedSheet);
      }
    }

    // HF-018: Now build metrics - each component uses ONLY its matched sheet
    for (const component of this.planComponents) {
      const matchedSheet = componentSheetMap.get(component.id);

      if (!matchedSheet) {
        // No sheet matched - this component's metrics will be undefined → $0
        continue;
      }

      const sheetMetrics = componentMetrics[matchedSheet];
      if (!sheetMetrics) {
        continue;
      }

      // Extract metric config from this plan component
      const metricConfig = extractMetricConfig(component);

      // HF-018: Build SCOPED enrichedMetrics from THIS SHEET ONLY
      const sheetDataAny = sheetMetrics as Record<string, unknown>;
      const enrichedMetrics: SheetMetrics = {
        attainment: sheetMetrics.attainment,
        amount: sheetMetrics.amount,
        goal: sheetMetrics.goal,
      };

      // OB-29: ZERO-GOAL GUARD (Universal Rule)
      // If goal is zero/null/undefined, the metric is "not measured" for this employee.
      const goalValue = enrichedMetrics.goal;
      const isZeroGoal = goalValue === undefined || goalValue === null || goalValue === 0;

      // HF-018 R2: Trace Clientes Nuevos for store 7967
      if (isStore7967 && component.id === 'clientes-nuevos') {
        console.log(`[HF-018 TRACE] Clientes Nuevos: matchedSheet="${matchedSheet}"`);
        console.log(`[HF-018 TRACE] Clientes Nuevos: sheetMetrics.goal=${sheetMetrics.goal}, isZeroGoal=${isZeroGoal}`);
        console.log(`[HF-018 TRACE] Clientes Nuevos: sheetMetrics.attainment=${sheetMetrics.attainment} (BEFORE guard)`);
      }

      if (isZeroGoal) {
        // Zero goal = not measured. Clear any attainment.
        enrichedMetrics.attainment = undefined;
      } else {
        // Use candidate attainment if primary is missing
        if (enrichedMetrics.attainment === undefined && sheetDataAny._candidateAttainment !== undefined) {
          enrichedMetrics.attainment = sheetDataAny._candidateAttainment as number;
        }

        // Compute attainment from amount/goal if still missing
        if (enrichedMetrics.attainment === undefined &&
            enrichedMetrics.amount !== undefined &&
            enrichedMetrics.goal !== undefined &&
            enrichedMetrics.goal > 0) {
          enrichedMetrics.attainment = (enrichedMetrics.amount / enrichedMetrics.goal) * 100;
        }

        // Normalize: if < 5, assume decimal ratio and multiply by 100
        if (enrichedMetrics.attainment !== undefined &&
            enrichedMetrics.attainment > 0 && enrichedMetrics.attainment < 5) {
          enrichedMetrics.attainment = enrichedMetrics.attainment * 100;
        }
      }

      // Build metrics using plan's own metric names
      // OB-29 Phase 3B: Pass componentType for tier_lookup contextual validation
      const resolved = buildComponentMetrics(metricConfig, enrichedMetrics, component.componentType);

      // HF-018 R2: Trace Clientes Nuevos resolved metrics for store 7967
      if (isStore7967 && component.id === 'clientes-nuevos') {
        console.log(`[HF-018 TRACE] Clientes Nuevos: enrichedMetrics.attainment=${enrichedMetrics.attainment} (AFTER guard)`);
        console.log(`[HF-018 TRACE] Clientes Nuevos: resolved=${JSON.stringify(resolved)}`);
      }

      // Merge into employee's metrics
      for (const [key, value] of Object.entries(resolved)) {
        if (metrics[key] === undefined) {
          metrics[key] = value;
        }
      }
    }

    // HF-018 R2: Log final metrics for store 7967
    if (isStore7967) {
      console.log(`[HF-018 TRACE] Final metrics: new_customers_attainment=${metrics['new_customers_attainment']}`);
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

  /**
   * OB-22: Chunked storage for calculation results
   * Prevents localStorage quota exceeded errors for large result sets
   */
  private static readonly CHUNK_SIZE = 100; // Results per chunk (~50KB each, well under limits)
  private static readonly CALC_CHUNK_PREFIX = 'vialuce_calculations_chunk_';
  private static readonly CALC_INDEX_KEY = 'vialuce_calculations_index';

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

    const allResults = [...filtered, ...newResults];

    // OB-22: Use chunked storage
    this.saveResultsChunked(allResults);
  }

  /**
   * OB-22: Save results in chunks to avoid localStorage limits
   */
  private saveResultsChunked(results: (CalculationResult & { runId?: string })[]): void {
    // Clear old chunks first
    this.clearOldChunks();

    // Split into chunks
    const chunks: (CalculationResult & { runId?: string })[][] = [];
    for (let i = 0; i < results.length; i += CalculationOrchestrator.CHUNK_SIZE) {
      chunks.push(results.slice(i, i + CalculationOrchestrator.CHUNK_SIZE));
    }

    console.log(`[Orchestrator] OB-22: Saving ${results.length} results in ${chunks.length} chunks`);

    // Save each chunk
    for (let i = 0; i < chunks.length; i++) {
      const chunkKey = `${CalculationOrchestrator.CALC_CHUNK_PREFIX}${i}`;
      try {
        localStorage.setItem(chunkKey, JSON.stringify(chunks[i]));
      } catch (error) {
        console.error(`[Orchestrator] Failed to save chunk ${i}:`, error);
        // Try smaller chunk size on failure
        break;
      }
    }

    // Save index
    const index = {
      chunkCount: chunks.length,
      totalResults: results.length,
      savedAt: new Date().toISOString(),
      tenantId: this.tenantId,
    };
    localStorage.setItem(CalculationOrchestrator.CALC_INDEX_KEY, JSON.stringify(index));
  }

  /**
   * OB-22: Clear old calculation chunks
   */
  private clearOldChunks(): void {
    // Read current index to find how many chunks exist
    const indexStr = localStorage.getItem(CalculationOrchestrator.CALC_INDEX_KEY);
    if (indexStr) {
      try {
        const index = JSON.parse(indexStr);
        for (let i = 0; i < (index.chunkCount || 0); i++) {
          localStorage.removeItem(`${CalculationOrchestrator.CALC_CHUNK_PREFIX}${i}`);
        }
      } catch {
        // Ignore parse errors
      }
    }

    // Also clear legacy single-key storage
    localStorage.removeItem(STORAGE_KEYS.CALCULATIONS);
  }

  /**
   * OB-22: Load results from chunked storage
   */
  private getAllResults(): (CalculationResult & { runId?: string })[] {
    if (typeof window === 'undefined') return [];

    // Try chunked storage first
    const indexStr = localStorage.getItem(CalculationOrchestrator.CALC_INDEX_KEY);
    if (indexStr) {
      try {
        const index = JSON.parse(indexStr);
        const results: (CalculationResult & { runId?: string })[] = [];

        for (let i = 0; i < (index.chunkCount || 0); i++) {
          const chunkKey = `${CalculationOrchestrator.CALC_CHUNK_PREFIX}${i}`;
          const chunkStr = localStorage.getItem(chunkKey);
          if (chunkStr) {
            const chunk = JSON.parse(chunkStr);
            results.push(...chunk);
          }
        }

        if (results.length > 0) {
          console.log(`[Orchestrator] OB-22: Loaded ${results.length} results from ${index.chunkCount} chunks`);
          return results;
        }
      } catch (error) {
        console.error('[Orchestrator] Error loading chunked results:', error);
      }
    }

    // Fallback to legacy single-key storage
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
