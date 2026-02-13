/**
 * Queue Service
 *
 * Aggregates action items from multiple sources into a unified, prioritized queue.
 * Sources: approvals, data quality, disputes, reconciliation, alerts, notifications.
 *
 * IMPORTANT: No mock data. All items are derived from actual system state.
 */

import type { QueueItem, QueueUrgency, QueueItemType, WorkspaceId } from '@/types/navigation';
import type { UserRole } from '@/types/auth';

// Storage keys for checking real system state
const STORAGE_KEYS = {
  PLANS: 'compensation_plans',
  BATCHES: 'data_layer_batches',
  COMMITTED: 'data_layer_committed',
  CALCULATIONS: 'vialuce_calculations',
  CALCULATION_RUNS: 'vialuce_calculation_runs',
  PERIODS: 'vialuce_payroll_periods',
  RECONCILIATION: 'vialuce_reconciliation_sessions',
};

// =============================================================================
// QUEUE AGGREGATION
// =============================================================================

/**
 * Get all queue items for a user, filtered by their role
 * Items are derived from REAL system state - no hardcoded mock data
 */
export function getQueueItems(userId: string, tenantId: string, role: UserRole): QueueItem[] {
  const allItems: QueueItem[] = [];

  // Aggregate from various sources based on real system state
  allItems.push(...getOnboardingItems(tenantId, role));
  allItems.push(...getPipelineItems(tenantId, role));
  allItems.push(...getApprovalItems(userId, tenantId, role));
  allItems.push(...getDataQualityItems(tenantId, role));
  allItems.push(...getDisputeItems(userId, tenantId, role));
  allItems.push(...getCalculationItems(tenantId, role));

  // Sort by urgency and timestamp
  return sortQueueItems(allItems);
}

/**
 * Sort queue items by urgency (critical first) then by timestamp (newest first)
 */
function sortQueueItems(items: QueueItem[]): QueueItem[] {
  const urgencyOrder: Record<QueueUrgency, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };

  return items.sort((a, b) => {
    const urgencyDiff = urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
    if (urgencyDiff !== 0) return urgencyDiff;
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });
}

// =============================================================================
// REAL STATE-BASED ITEM GENERATORS
// =============================================================================

/**
 * Generate onboarding items for new tenants with no data
 */
function getOnboardingItems(tenantId: string, role: UserRole): QueueItem[] {
  if (role !== 'vl_admin' && role !== 'admin') return [];

  const items: QueueItem[] = [];
  const hasPlans = hasTenantPlans(tenantId);
  const hasData = hasTenantCommittedData(tenantId);
  const hasPeriods = hasTenantPeriods(tenantId);

  // No plans at all - suggest importing one
  if (!hasPlans) {
    items.push({
      id: `onboard-plan-${tenantId}`,
      type: 'notification',
      urgency: 'high',
      title: 'Import Commission Plan',
      titleEs: 'Importar Plan de Comisiones',
      description: 'Start by importing your compensation plan document',
      descriptionEs: 'Comience importando su documento de plan de compensacion',
      workspace: 'operate',
      route: '/admin/launch/plan-import',
      timestamp: new Date().toISOString(),
      read: false,
    });
  }

  // Has plan but no data
  if (hasPlans && !hasData) {
    items.push({
      id: `onboard-data-${tenantId}`,
      type: 'notification',
      urgency: 'medium',
      title: 'Import Data Package',
      titleEs: 'Importar Paquete de Datos',
      description: 'Import your Excel data package with employee performance metrics',
      descriptionEs: 'Importe su paquete de datos Excel con metricas de rendimiento',
      workspace: 'operate',
      route: '/data/import/enhanced',
      timestamp: new Date().toISOString(),
      read: false,
    });
  }

  // Has data but no periods
  if (hasData && !hasPeriods) {
    items.push({
      id: `onboard-periods-${tenantId}`,
      type: 'notification',
      urgency: 'medium',
      title: 'Configure Payroll Periods',
      titleEs: 'Configurar Periodos de Nomina',
      description: 'Set up payroll periods for calculation processing',
      descriptionEs: 'Configure los periodos de nomina para el procesamiento de calculos',
      workspace: 'configure',
      route: '/configure/periods',
      timestamp: new Date().toISOString(),
      read: false,
    });
  }

  return items;
}

/**
 * Generate pipeline status items based on actual workflow state
 */
function getPipelineItems(tenantId: string, role: UserRole): QueueItem[] {
  if (role !== 'vl_admin' && role !== 'admin') return [];

  const items: QueueItem[] = [];

  // Check for draft plans that need activation
  const draftPlans = getTenantDraftPlans(tenantId);
  const hasActivePlan = hasTenantActivePlan(tenantId);

  if (draftPlans.length > 0 && !hasActivePlan) {
    items.push({
      id: `pipeline-activate-plan-${tenantId}`,
      type: 'alert',
      urgency: 'high',
      title: 'Plan Pending Activation',
      titleEs: 'Plan Pendiente de Activacion',
      description: `${draftPlans.length} plan(s) in draft status need activation`,
      descriptionEs: `${draftPlans.length} plan(es) en borrador necesitan activacion`,
      workspace: 'operate',
      route: '/operate/calculate',
      timestamp: new Date().toISOString(),
      read: false,
    });
  }

  // Check for committed data ready for calculation
  const hasCommittedData = hasTenantCommittedData(tenantId);
  const hasCalculations = hasTenantCalculations(tenantId);

  if (hasActivePlan && hasCommittedData && !hasCalculations) {
    items.push({
      id: `pipeline-ready-calc-${tenantId}`,
      type: 'alert',
      urgency: 'high',
      title: 'Data Ready for Calculation',
      titleEs: 'Datos Listos para Calculo',
      description: 'Committed data available - run calculations to generate payouts',
      descriptionEs: 'Datos confirmados disponibles - ejecute calculos para generar pagos',
      workspace: 'operate',
      route: '/operate/calculate',
      timestamp: new Date().toISOString(),
      read: false,
    });
  }

  return items;
}

/**
 * Get approval items from localStorage
 */
function getApprovalItems(userId: string, tenantId: string, role: UserRole): QueueItem[] {
  if (role === 'sales_rep') return [];

  try {
    const approvalsKey = `${tenantId}_pending_approvals`;
    const approvals = localStorage.getItem(approvalsKey);

    if (approvals) {
      const parsed = JSON.parse(approvals);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((a: { status: string; assignedTo?: string }) =>
            a.status === 'pending' && (!a.assignedTo || a.assignedTo === userId)
          )
          .slice(0, 5)
          .map((a: { id: string; type: string; amount?: number; employeeName?: string; createdAt: string }) => ({
            id: `approval-${a.id}`,
            type: 'approval' as QueueItemType,
            urgency: (a.amount && a.amount > 10000 ? 'high' : 'medium') as QueueUrgency,
            title: `Approval Required: ${a.type}`,
            titleEs: `Aprobacion Requerida: ${a.type}`,
            description: a.employeeName ? `For ${a.employeeName}` : 'Review and approve',
            descriptionEs: a.employeeName ? `Para ${a.employeeName}` : 'Revisar y aprobar',
            workspace: 'operate' as WorkspaceId,
            route: '/operate/approve',
            timestamp: a.createdAt || new Date().toISOString(),
            read: false,
          }));
      }
    }
  } catch {
    // No stored approvals
  }

  return [];
}

/**
 * Get data quality items from stored issues
 */
function getDataQualityItems(tenantId: string, role: UserRole): QueueItem[] {
  if (role !== 'vl_admin' && role !== 'admin') return [];

  try {
    const qualityKey = `${tenantId}_data_quality_issues`;
    const issues = localStorage.getItem(qualityKey);

    if (issues) {
      const parsed = JSON.parse(issues);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((i: { status: string }) => i.status === 'pending')
          .slice(0, 3)
          .map((i: { id: string; severity: string; field: string; message: string; createdAt: string }) => ({
            id: `quality-${i.id}`,
            type: 'data_quality' as QueueItemType,
            urgency: (i.severity === 'critical' ? 'critical' : i.severity === 'warning' ? 'high' : 'medium') as QueueUrgency,
            title: `Data Issue: ${i.field}`,
            titleEs: `Problema de Datos: ${i.field}`,
            description: i.message,
            descriptionEs: i.message,
            workspace: 'operate' as WorkspaceId,
            route: '/operate/monitor/quality',
            timestamp: i.createdAt || new Date().toISOString(),
            read: false,
          }));
      }
    }
  } catch {
    // No stored quality issues
  }

  return [];
}

/**
 * Get dispute items from stored disputes
 */
function getDisputeItems(userId: string, tenantId: string, role: UserRole): QueueItem[] {
  try {
    const disputesKey = `${tenantId}_disputes`;
    const disputes = localStorage.getItem(disputesKey);

    if (disputes) {
      const parsed = JSON.parse(disputes);
      if (Array.isArray(parsed)) {
        const filtered = role === 'sales_rep'
          ? parsed.filter((d: { userId: string; status: string }) => d.userId === userId && d.status !== 'resolved')
          : parsed.filter((d: { status: string }) => d.status === 'pending');

        return filtered.slice(0, 3).map((d: { id: string; type: string; amount?: number; createdAt: string }) => ({
          id: `dispute-${d.id}`,
          type: 'dispute' as QueueItemType,
          urgency: 'medium' as QueueUrgency,
          title: d.type || 'Dispute',
          titleEs: d.type || 'Disputa',
          description: d.amount ? `Amount: $${d.amount.toLocaleString()}` : 'Review required',
          descriptionEs: d.amount ? `Monto: $${d.amount.toLocaleString()}` : 'Revision requerida',
          workspace: (role === 'sales_rep' ? 'perform' : 'investigate') as WorkspaceId,
          route: role === 'sales_rep' ? '/perform/inquiries' : '/investigate/disputes',
          timestamp: d.createdAt || new Date().toISOString(),
          read: false,
        }));
      }
    }
  } catch {
    // No stored disputes
  }

  return [];
}

/**
 * Get calculation error items from stored runs
 */
function getCalculationItems(tenantId: string, role: UserRole): QueueItem[] {
  if (role !== 'vl_admin' && role !== 'admin') return [];

  const items: QueueItem[] = [];

  try {
    const runsStored = localStorage.getItem(STORAGE_KEYS.CALCULATION_RUNS);
    if (runsStored) {
      const runs: Array<{
        id: string;
        tenantId: string;
        status: string;
        errorCount: number;
        startedAt: string;
      }> = JSON.parse(runsStored);

      // Find runs with errors
      const errorRuns = runs
        .filter(r => r.tenantId === tenantId && r.status === 'completed' && r.errorCount > 0)
        .slice(0, 2);

      for (const run of errorRuns) {
        items.push({
          id: `calc-errors-${run.id}`,
          type: 'alert' as QueueItemType,
          urgency: 'high' as QueueUrgency,
          title: 'Calculation Errors',
          titleEs: 'Errores de Calculo',
          description: `${run.errorCount} errors in last calculation run`,
          descriptionEs: `${run.errorCount} errores en la ultima ejecucion`,
          workspace: 'investigate' as WorkspaceId,
          route: '/investigate/calculations',
          timestamp: run.startedAt,
          read: false,
        });
      }
    }
  } catch {
    // No calculation runs
  }

  return items;
}

// =============================================================================
// SYSTEM STATE HELPERS
// =============================================================================

function hasTenantPlans(tenantId: string): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.PLANS);
    if (!stored) return false;
    const plans = JSON.parse(stored);
    // For VL Admin (tenantId='platform'), check if ANY plans exist
    if (tenantId === 'platform') return plans.length > 0;
    return plans.some((p: { tenantId: string }) => p.tenantId === tenantId);
  } catch {
    return false;
  }
}

function hasTenantActivePlan(tenantId: string): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.PLANS);
    if (!stored) return false;
    const plans = JSON.parse(stored);
    if (tenantId === 'platform') return plans.some((p: { status: string }) => p.status === 'active');
    return plans.some((p: { tenantId: string; status: string }) =>
      p.tenantId === tenantId && p.status === 'active'
    );
  } catch {
    return false;
  }
}

function getTenantDraftPlans(tenantId: string): string[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.PLANS);
    if (!stored) return [];
    const plans = JSON.parse(stored);
    return plans
      .filter((p: { tenantId: string; status: string }) =>
        (tenantId === 'platform' || p.tenantId === tenantId) && p.status === 'draft'
      )
      .map((p: { id: string }) => p.id);
  } catch {
    return [];
  }
}

function hasTenantCommittedData(tenantId: string): boolean {
  try {
    const batchesStored = localStorage.getItem(STORAGE_KEYS.BATCHES);
    if (!batchesStored) return false;

    const batches: [string, { tenantId: string; status?: string }][] = JSON.parse(batchesStored);
    // For VL Admin (tenantId='platform'), check any tenant's batches
    const tenantBatchIds = batches
      .filter(([, b]) => tenantId === 'platform' || b.tenantId === tenantId)
      .map(([id]) => id);

    if (tenantBatchIds.length === 0) return false;

    const committedStored = localStorage.getItem(STORAGE_KEYS.COMMITTED);
    if (!committedStored) return false;

    const committed: [string, { importBatchId: string; status: string }][] = JSON.parse(committedStored);
    return committed.some(([, r]) =>
      tenantBatchIds.includes(r.importBatchId) && r.status === 'active'
    );
  } catch {
    return false;
  }
}

function hasTenantPeriods(tenantId: string): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.PERIODS);
    if (!stored) return false;
    const periods = JSON.parse(stored);
    return Array.isArray(periods) && periods.some((p: { tenantId?: string }) =>
      !p.tenantId || p.tenantId === tenantId
    );
  } catch {
    return false;
  }
}

function hasTenantCalculations(tenantId: string): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.CALCULATION_RUNS);
    if (!stored) return false;
    const runs = JSON.parse(stored);
    return runs.some((r: { tenantId: string; status: string }) =>
      (tenantId === 'platform' || r.tenantId === tenantId) && r.status === 'completed'
    );
  } catch {
    return false;
  }
}

// =============================================================================
// QUEUE HELPERS
// =============================================================================

/**
 * Get count of unread items
 */
export function getUnreadQueueCount(items: QueueItem[]): number {
  return items.filter(item => !item.read).length;
}

/**
 * Get count by urgency level
 */
export function getQueueCountByUrgency(items: QueueItem[]): Record<QueueUrgency, number> {
  return {
    critical: items.filter(i => i.urgency === 'critical').length,
    high: items.filter(i => i.urgency === 'high').length,
    medium: items.filter(i => i.urgency === 'medium').length,
    low: items.filter(i => i.urgency === 'low').length,
  };
}

/**
 * Mark item as read
 */
export function markQueueItemRead(itemId: string): void {
  // Implementation would update the source storage
  console.log('Marking item as read:', itemId);
}

/**
 * Get queue items grouped by workspace
 */
export function getQueueItemsByWorkspace(items: QueueItem[]): Record<WorkspaceId, QueueItem[]> {
  const grouped: Record<WorkspaceId, QueueItem[]> = {
    perform: [],
    investigate: [],
    design: [],
    configure: [],
    govern: [],
    operate: [],
    financial: [],
  };

  for (const item of items) {
    if (grouped[item.workspace]) {
      grouped[item.workspace].push(item);
    }
  }

  return grouped;
}
