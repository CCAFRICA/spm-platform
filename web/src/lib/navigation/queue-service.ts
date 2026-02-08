/**
 * Queue Service
 *
 * Aggregates action items from multiple sources into a unified, prioritized queue.
 * Sources: approvals, data quality, disputes, reconciliation, alerts, notifications.
 */

import type { QueueItem, QueueUrgency, QueueItemType, WorkspaceId } from '@/types/navigation';
import type { UserRole } from '@/types/auth';

// =============================================================================
// QUEUE AGGREGATION
// =============================================================================

/**
 * Get all queue items for a user, filtered by their role
 */
export function getQueueItems(userId: string, tenantId: string, role: UserRole): QueueItem[] {
  const allItems: QueueItem[] = [];

  // Aggregate from various sources
  allItems.push(...getApprovalItems(userId, tenantId, role));
  allItems.push(...getDataQualityItems(tenantId, role));
  allItems.push(...getDisputeItems(userId, tenantId, role));
  allItems.push(...getReconciliationItems(tenantId, role));
  allItems.push(...getAlertItems(userId, tenantId, role));
  allItems.push(...getNotificationItems(userId, tenantId));

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
// SOURCE AGGREGATORS
// =============================================================================

function getApprovalItems(userId: string, tenantId: string, role: UserRole): QueueItem[] {
  // Only admins and managers see approval items
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
            titleEs: `Aprobación Requerida: ${a.type}`,
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
    // Return mock data for demo
  }

  // Mock approvals for demo
  if (role === 'cc_admin' || role === 'admin') {
    return [
      {
        id: 'approval-mock-1',
        type: 'approval',
        urgency: 'high',
        title: 'Compensation Adjustment',
        titleEs: 'Ajuste de Compensación',
        description: '$12,500 adjustment for Maria Rodriguez',
        descriptionEs: 'Ajuste de $12,500 para María Rodríguez',
        workspace: 'operate',
        route: '/operate/approve',
        timestamp: new Date(Date.now() - 3600000).toISOString(),
        read: false,
      },
      {
        id: 'approval-mock-2',
        type: 'approval',
        urgency: 'medium',
        title: 'Plan Amendment',
        titleEs: 'Modificación de Plan',
        description: 'West Region bonus tier update',
        descriptionEs: 'Actualización de nivel de bono Región Oeste',
        workspace: 'operate',
        route: '/operate/approve',
        timestamp: new Date(Date.now() - 7200000).toISOString(),
        read: false,
      },
    ];
  }

  return [];
}

function getDataQualityItems(tenantId: string, role: UserRole): QueueItem[] {
  // Only admins see data quality items
  if (role !== 'cc_admin' && role !== 'admin') return [];

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
    // Return mock data
  }

  // Mock data quality items
  return [
    {
      id: 'quality-mock-1',
      type: 'data_quality',
      urgency: 'critical',
      title: 'Missing Employee IDs',
      titleEs: 'IDs de Empleado Faltantes',
      description: '12 records without valid employee mapping',
      descriptionEs: '12 registros sin mapeo de empleado válido',
      workspace: 'operate',
      route: '/operate/monitor/quality',
      timestamp: new Date(Date.now() - 1800000).toISOString(),
      read: false,
    },
    {
      id: 'quality-mock-2',
      type: 'data_quality',
      urgency: 'high',
      title: 'Duplicate Transactions',
      titleEs: 'Transacciones Duplicadas',
      description: '5 potential duplicates detected',
      descriptionEs: '5 posibles duplicados detectados',
      workspace: 'operate',
      route: '/operate/monitor/quality',
      timestamp: new Date(Date.now() - 5400000).toISOString(),
      read: false,
    },
  ];
}

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
          descriptionEs: d.amount ? `Monto: $${d.amount.toLocaleString()}` : 'Revisión requerida',
          workspace: (role === 'sales_rep' ? 'perform' : 'investigate') as WorkspaceId,
          route: role === 'sales_rep' ? '/perform/inquiries' : '/investigate/disputes',
          timestamp: d.createdAt || new Date().toISOString(),
          read: false,
        }));
      }
    }
  } catch {
    // Return mock data
  }

  // Mock dispute for managers/admins
  if (role === 'admin' || role === 'cc_admin' || role === 'manager') {
    return [
      {
        id: 'dispute-mock-1',
        type: 'dispute',
        urgency: 'medium',
        title: 'Commission Dispute',
        titleEs: 'Disputa de Comisión',
        description: 'James Wilson - $2,340 difference',
        descriptionEs: 'James Wilson - diferencia de $2,340',
        workspace: 'investigate',
        route: '/investigate/disputes',
        timestamp: new Date(Date.now() - 86400000).toISOString(),
        read: false,
      },
    ];
  }

  return [];
}

function getReconciliationItems(tenantId: string, role: UserRole): QueueItem[] {
  if (role !== 'cc_admin' && role !== 'admin') return [];

  // Mock reconciliation items
  return [
    {
      id: 'recon-mock-1',
      type: 'reconciliation',
      urgency: 'high',
      title: 'Unresolved Variance',
      titleEs: 'Varianza Sin Resolver',
      description: '$8,240 variance in West Region',
      descriptionEs: 'Varianza de $8,240 en Región Oeste',
      workspace: 'operate',
      route: '/operate/reconcile',
      timestamp: new Date(Date.now() - 43200000).toISOString(),
      read: false,
    },
  ];
}

function getAlertItems(userId: string, tenantId: string, role: UserRole): QueueItem[] {
  const alerts: QueueItem[] = [];

  // Budget alerts for admins
  if (role === 'cc_admin' || role === 'admin') {
    alerts.push({
      id: 'alert-budget-1',
      type: 'alert',
      urgency: 'high',
      title: 'Budget Threshold',
      titleEs: 'Umbral de Presupuesto',
      description: 'West Region at 92% of Q1 budget',
      descriptionEs: 'Región Oeste al 92% del presupuesto Q1',
      workspace: 'design',
      route: '/design/budget',
      timestamp: new Date(Date.now() - 10800000).toISOString(),
      read: false,
    });
  }

  // Goal alerts for reps
  if (role === 'sales_rep') {
    alerts.push({
      id: 'alert-goal-1',
      type: 'alert',
      urgency: 'medium',
      title: 'Goal Milestone',
      titleEs: 'Hito de Meta',
      description: 'You are 85% to your monthly target',
      descriptionEs: 'Estás al 85% de tu meta mensual',
      workspace: 'perform',
      route: '/perform/compensation',
      timestamp: new Date(Date.now() - 21600000).toISOString(),
      read: true,
    });
  }

  return alerts;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getNotificationItems(userId: string, tenantId: string): QueueItem[] {
  // Mock notifications
  return [
    {
      id: 'notif-mock-1',
      type: 'notification',
      urgency: 'low',
      title: 'Import Complete',
      titleEs: 'Importación Completa',
      description: 'February transaction data imported',
      descriptionEs: 'Datos de transacciones de febrero importados',
      workspace: 'operate',
      route: '/operate/import',
      timestamp: new Date(Date.now() - 172800000).toISOString(),
      read: true,
    },
  ];
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
  // In a real implementation, this would update the source system
  console.log('Marking item read:', itemId);
}

/**
 * Mark all items as read
 */
export function markAllQueueItemsRead(userId: string, tenantId: string): void {
  // In a real implementation, this would update all source systems
  console.log('Marking all items read for:', userId, tenantId);
}
