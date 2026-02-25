/**
 * Queue Service
 *
 * Aggregates action items from multiple sources into a unified, prioritized queue.
 *
 * OB-43A: Supabase cutover — all data reads from Supabase, no localStorage.
 * IMPORTANT: No mock data. All items are derived from actual system state.
 */

import type { QueueItem, QueueUrgency, QueueItemType, WorkspaceId } from '@/types/navigation';
import type { UserRole } from '@/types/auth';
import {
  listCalculationBatches,
} from '@/lib/supabase/calculation-service';
import { getRuleSets } from '@/lib/supabase/rule-set-service';

// =============================================================================
// QUEUE AGGREGATION (async — reads from Supabase)
// =============================================================================

/**
 * Get all queue items for a user, filtered by their role
 * Items are derived from REAL Supabase state — no localStorage
 */
export async function getQueueItems(userId: string, tenantId: string, role: UserRole): Promise<QueueItem[]> {
  const allItems: QueueItem[] = [];

  allItems.push(...await getOnboardingItems(tenantId, role));
  allItems.push(...await getPipelineItems(tenantId, role));
  allItems.push(...await getLifecycleItems(tenantId, role));

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
// SUPABASE-BASED ITEM GENERATORS
// =============================================================================

/**
 * Generate onboarding items for new tenants with no data
 */
async function getOnboardingItems(tenantId: string, role: UserRole): Promise<QueueItem[]> {
  if (role !== 'vl_admin' && role !== 'admin') return [];

  const items: QueueItem[] = [];

  try {
    const ruleSets = await getRuleSets(tenantId);
    const hasPlans = ruleSets.length > 0;
    const hasActivePlan = ruleSets.some(r => r.status === 'active');

    const batches = await listCalculationBatches(tenantId);
    const hasData = batches.length > 0;

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

    if (hasPlans && !hasActivePlan) {
      items.push({
        id: `pipeline-activate-plan-${tenantId}`,
        type: 'alert' as QueueItemType,
        urgency: 'high' as QueueUrgency,
        title: 'Plan Pending Activation',
        titleEs: 'Plan Pendiente de Activacion',
        description: 'Draft plan(s) need activation before calculations',
        descriptionEs: 'Plan(es) en borrador necesitan activacion',
        workspace: 'operate' as WorkspaceId,
        route: '/operate/calculate',
        timestamp: new Date().toISOString(),
        read: false,
      });
    }

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
  } catch {
    // Supabase unavailable
  }

  return items;
}

/**
 * Generate pipeline status items based on actual workflow state
 */
async function getPipelineItems(tenantId: string, role: UserRole): Promise<QueueItem[]> {
  if (role !== 'vl_admin' && role !== 'admin') return [];

  const items: QueueItem[] = [];

  try {
    const ruleSets = await getRuleSets(tenantId);
    const hasActivePlan = ruleSets.some(r => r.status === 'active');
    const batches = await listCalculationBatches(tenantId);
    const hasCalculations = batches.length > 0;

    if (hasActivePlan && !hasCalculations) {
      items.push({
        id: `pipeline-ready-calc-${tenantId}`,
        type: 'alert' as QueueItemType,
        urgency: 'high' as QueueUrgency,
        title: 'Data Ready for Calculation',
        titleEs: 'Datos Listos para Calculo',
        description: 'Committed data available - run calculations to generate payouts',
        descriptionEs: 'Datos confirmados disponibles - ejecute calculos para generar pagos',
        workspace: 'operate' as WorkspaceId,
        route: '/operate/calculate',
        timestamp: new Date().toISOString(),
        read: false,
      });
    }
  } catch {
    // Supabase unavailable
  }

  return items;
}

/**
 * Generate queue items from calculation lifecycle state (Supabase batches)
 */
async function getLifecycleItems(tenantId: string, role: UserRole): Promise<QueueItem[]> {
  if (role !== 'vl_admin' && role !== 'admin') return [];

  const items: QueueItem[] = [];

  try {
    const batches = await listCalculationBatches(tenantId);
    const activeBatch = batches.find(b => !b.superseded_by) || batches[0] || null;
    if (!activeBatch) return [];

    const state = activeBatch.lifecycle_state;

    if (state === 'PENDING_APPROVAL') {
      items.push({
        id: `lifecycle-pending-${activeBatch.id}`,
        type: 'approval' as QueueItemType,
        urgency: 'high' as QueueUrgency,
        title: 'Calculation Awaiting Approval',
        titleEs: 'Calculo Pendiente de Aprobacion',
        description: `${activeBatch.period_id} submitted for approval`,
        descriptionEs: `${activeBatch.period_id} enviado para aprobacion`,
        workspace: 'operate' as WorkspaceId,
        route: '/operate/calculate',
        timestamp: activeBatch.created_at,
        read: false,
      });
    } else if (state === 'APPROVED') {
      items.push({
        id: `lifecycle-approved-${activeBatch.id}`,
        type: 'notification' as QueueItemType,
        urgency: 'medium' as QueueUrgency,
        title: 'Post Results to All Roles',
        titleEs: 'Publicar Resultados a Todos los Roles',
        description: `${activeBatch.period_id} approved - post results or export payroll`,
        descriptionEs: `${activeBatch.period_id} aprobado - publicar resultados o exportar nomina`,
        workspace: 'operate' as WorkspaceId,
        route: '/operate/calculate',
        timestamp: activeBatch.created_at,
        read: false,
      });
    } else if (state === 'POSTED') {
      items.push({
        id: `lifecycle-posted-${activeBatch.id}`,
        type: 'notification' as QueueItemType,
        urgency: 'low' as QueueUrgency,
        title: 'Results Posted - Close Period',
        titleEs: 'Resultados Publicados - Cerrar Periodo',
        description: `${activeBatch.period_id} results visible to all roles - close period when ready`,
        descriptionEs: `${activeBatch.period_id} resultados visibles a todos los roles - cerrar periodo cuando listo`,
        workspace: 'operate' as WorkspaceId,
        route: '/operate/calculate',
        timestamp: activeBatch.created_at,
        read: false,
      });
    }
  } catch {
    // Supabase unavailable
  }

  return items;
}

// =============================================================================
// QUEUE HELPERS (pure functions — no localStorage)
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
  console.log('Marking item as read:', itemId);
}

/**
 * Get queue items grouped by workspace
 */
export function getQueueItemsByWorkspace(items: QueueItem[]): Record<WorkspaceId, QueueItem[]> {
  // OB-97: 4 workspace model
  const grouped: Record<WorkspaceId, QueueItem[]> = {
    perform: [],
    operate: [],
    configure: [],
    financial: [],
  };

  for (const item of items) {
    if (grouped[item.workspace]) {
      grouped[item.workspace].push(item);
    }
  }

  return grouped;
}
