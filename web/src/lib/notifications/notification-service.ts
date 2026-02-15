/**
 * Notification Service
 *
 * Manages notification CRUD operations.
 * Provides real-time notification management for the demo.
 *
 * NOTE: localStorage removed (OB-43A). Returns in-memory defaults.
 */

import type { Notification, NotificationType, NotificationPriority } from '@/types/notification';
import { NOTIFICATION_TEMPLATES } from '@/types/notification';

// ============================================
// NOTIFICATION CRUD
// ============================================

/**
 * Get all notifications for a specific user
 */
export function getNotifications(userId: string, tenantId: string): Notification[] {
  // localStorage removed -- return empty
  void userId;
  void tenantId;
  return [];
}

/**
 * Get count of unread notifications for a user
 */
export function getUnreadCount(userId: string, tenantId: string): number {
  const notifications = getNotifications(userId, tenantId);
  return notifications.filter((n) => !n.read).length;
}

/**
 * Get a single notification by ID
 */
export function getNotification(notificationId: string): Notification | null {
  const all = getAllNotificationsInternal();
  return all.find((n) => n.id === notificationId) || null;
}

/**
 * Create a new notification
 */
export function createNotification(data: {
  tenantId: string;
  userId: string;
  type: NotificationType;
  title: string;
  titleEs?: string;
  message: string;
  messageEs?: string;
  priority?: NotificationPriority;
  linkTo?: string;
  metadata?: Record<string, unknown>;
}): Notification {
  const notification: Notification = {
    id: `notif-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    tenantId: data.tenantId,
    userId: data.userId,
    type: data.type,
    priority: data.priority || 'normal',
    title: data.title,
    titleEs: data.titleEs,
    message: data.message,
    messageEs: data.messageEs,
    read: false,
    createdAt: new Date().toISOString(),
    linkTo: data.linkTo,
    metadata: data.metadata,
  };

  // localStorage removed -- save is a no-op

  return notification;
}

/**
 * Create a notification from a template
 */
export function createFromTemplate(
  type: NotificationType,
  tenantId: string,
  userId: string,
  replacements: Record<string, string>,
  linkTo?: string,
  metadata?: Record<string, unknown>
): Notification {
  const template = NOTIFICATION_TEMPLATES[type];

  // Replace placeholders in messages
  let message = template.message;
  let messageEs = template.messageEs;

  Object.entries(replacements).forEach(([key, value]) => {
    const placeholder = `{${key}}`;
    message = message.replace(placeholder, value);
    messageEs = messageEs.replace(placeholder, value);
  });

  return createNotification({
    tenantId,
    userId,
    type,
    title: template.title,
    titleEs: template.titleEs,
    message,
    messageEs,
    priority: template.priority,
    linkTo,
    metadata,
  });
}

/**
 * Mark a notification as read
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function markAsRead(_notificationId: string): boolean {
  // localStorage removed -- no-op
  return true;
}

/**
 * Mark all notifications as read for a user
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function markAllAsRead(_userId: string, _tenantId: string): number {
  // localStorage removed -- no-op
  return 0;
}

/**
 * Delete a notification
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function deleteNotification(_notificationId: string): boolean {
  // localStorage removed -- no-op
  return true;
}

/**
 * Delete all notifications for a user
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function clearNotifications(_userId: string, _tenantId: string): number {
  // localStorage removed -- no-op
  return 0;
}

// ============================================
// DISPUTE-SPECIFIC NOTIFICATIONS
// ============================================

/**
 * Notify user when their dispute is resolved
 */
export function notifyDisputeResolved(
  tenantId: string,
  userId: string,
  disputeId: string,
  transactionId: string,
  outcome: 'approved' | 'denied' | 'partial',
  adjustmentAmount?: number
): Notification {
  const outcomeText =
    outcome === 'approved'
      ? 'approved'
      : outcome === 'partial'
        ? 'partially approved'
        : 'denied';

  const outcomeTextEs =
    outcome === 'approved'
      ? 'aprobada'
      : outcome === 'partial'
        ? 'aprobada parcialmente'
        : 'denegada';

  let message = `Your dispute for ${transactionId} has been ${outcomeText}.`;
  let messageEs = `Tu disputa para ${transactionId} ha sido ${outcomeTextEs}.`;

  if (adjustmentAmount && adjustmentAmount > 0) {
    message += ` An adjustment of $${adjustmentAmount.toFixed(2)} will be applied.`;
    messageEs += ` Se aplicar\u00e1 un ajuste de $${adjustmentAmount.toFixed(2)}.`;
  }

  return createNotification({
    tenantId,
    userId,
    type: 'dispute_resolved',
    title: outcome === 'approved' ? 'Dispute Approved!' : outcome === 'partial' ? 'Dispute Partially Approved' : 'Dispute Denied',
    titleEs: outcome === 'approved' ? '\u00a1Disputa Aprobada!' : outcome === 'partial' ? 'Disputa Aprobada Parcialmente' : 'Disputa Denegada',
    message,
    messageEs,
    priority: 'high',
    linkTo: `/transactions/disputes/${disputeId}`,
    metadata: {
      disputeId,
      transactionId,
      outcome,
      adjustmentAmount,
    },
  });
}

/**
 * Notify user when their dispute is submitted
 */
export function notifyDisputeSubmitted(
  tenantId: string,
  userId: string,
  disputeId: string,
  transactionId: string
): Notification {
  return createFromTemplate(
    'dispute_submitted',
    tenantId,
    userId,
    { transactionId },
    `/transactions/disputes/${disputeId}`,
    { disputeId, transactionId }
  );
}

/**
 * Notify manager when a new dispute needs review
 */
export function notifyManagerNewDispute(
  tenantId: string,
  managerId: string,
  disputeId: string,
  transactionId: string,
  entityName: string
): Notification {
  return createNotification({
    tenantId,
    userId: managerId,
    type: 'dispute_submitted',
    title: 'New Dispute to Review',
    titleEs: 'Nueva Disputa para Revisar',
    message: `${entityName} submitted a dispute for ${transactionId}.`,
    messageEs: `${entityName} envi\u00f3 una disputa para ${transactionId}.`,
    priority: 'normal',
    linkTo: `/transactions/disputes/${disputeId}`,
    metadata: {
      disputeId,
      transactionId,
      entityName,
    },
  });
}

/**
 * Notify user when an adjustment is applied
 */
export function notifyAdjustmentApplied(
  tenantId: string,
  userId: string,
  amount: number,
  currency: string = 'USD'
): Notification {
  const formattedAmount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount);

  return createFromTemplate(
    'adjustment_applied',
    tenantId,
    userId,
    { amount: formattedAmount },
    '/my-compensation',
    { amount, currency }
  );
}

// ============================================
// HELPERS
// ============================================

function getAllNotificationsInternal(): Notification[] {
  // localStorage removed -- return empty
  return [];
}

/**
 * Initialize notifications (no-op, localStorage removed)
 */
export function initializeNotifications(): void {
  // localStorage removed -- no-op
}

/**
 * Reset all notifications (no-op, localStorage removed)
 */
export function resetNotifications(): void {
  // localStorage removed -- no-op
}
