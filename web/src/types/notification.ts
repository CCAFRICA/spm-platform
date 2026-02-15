/**
 * Notification Types - ViaLuce SPM Platform
 *
 * Types for the notification system
 */

export type NotificationType =
  | 'dispute_submitted'
  | 'dispute_resolved'
  | 'adjustment_applied'
  | 'plan_approved'
  | 'plan_rejected'
  | 'data_quality_alert'
  | 'goal_achieved'
  | 'payout_ready'
  | 'system';

export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface Notification {
  id: string;
  tenantId: string;
  userId: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  titleEs?: string;
  message: string;
  messageEs?: string;
  read: boolean;
  createdAt: string;
  readAt?: string;
  linkTo?: string;
  metadata?: Record<string, unknown>;
}

// Notification templates for different events
export interface NotificationTemplate {
  type: NotificationType;
  title: string;
  titleEs: string;
  message: string;
  messageEs: string;
  priority: NotificationPriority;
}

export const NOTIFICATION_TEMPLATES: Record<NotificationType, NotificationTemplate> = {
  dispute_submitted: {
    type: 'dispute_submitted',
    title: 'Dispute Submitted',
    titleEs: 'Disputa Enviada',
    message: 'Your dispute for {transactionId} has been submitted for review.',
    messageEs: 'Tu disputa para {transactionId} ha sido enviada para revisión.',
    priority: 'normal',
  },
  dispute_resolved: {
    type: 'dispute_resolved',
    title: 'Dispute Resolved',
    titleEs: 'Disputa Resuelta',
    message: 'Your dispute for {transactionId} has been {outcome}.',
    messageEs: 'Tu disputa para {transactionId} ha sido {outcome}.',
    priority: 'high',
  },
  adjustment_applied: {
    type: 'adjustment_applied',
    title: 'Adjustment Applied',
    titleEs: 'Ajuste Aplicado',
    message: 'An adjustment of {amount} has been applied to your compensation.',
    messageEs: 'Un ajuste de {amount} ha sido aplicado a tu compensación.',
    priority: 'high',
  },
  plan_approved: {
    type: 'plan_approved',
    title: 'Plan Approved',
    titleEs: 'Plan Aprobado',
    message: 'The compensation plan "{ruleSetName}" has been approved.',
    messageEs: 'El plan de compensación "{ruleSetName}" ha sido aprobado.',
    priority: 'normal',
  },
  plan_rejected: {
    type: 'plan_rejected',
    title: 'Plan Rejected',
    titleEs: 'Plan Rechazado',
    message: 'The compensation plan "{ruleSetName}" has been rejected.',
    messageEs: 'El plan de compensación "{ruleSetName}" ha sido rechazado.',
    priority: 'high',
  },
  data_quality_alert: {
    type: 'data_quality_alert',
    title: 'Data Quality Alert',
    titleEs: 'Alerta de Calidad de Datos',
    message: '{count} data quality issues require your attention.',
    messageEs: '{count} problemas de calidad de datos requieren tu atención.',
    priority: 'high',
  },
  goal_achieved: {
    type: 'goal_achieved',
    title: 'Goal Achieved!',
    titleEs: '¡Meta Alcanzada!',
    message: 'Congratulations! You have achieved your {goalName} goal.',
    messageEs: '¡Felicidades! Has alcanzado tu meta de {goalName}.',
    priority: 'normal',
  },
  payout_ready: {
    type: 'payout_ready',
    title: 'Payout Ready',
    titleEs: 'Pago Listo',
    message: 'Your payout of {amount} is ready for processing.',
    messageEs: 'Tu pago de {amount} está listo para procesar.',
    priority: 'high',
  },
  system: {
    type: 'system',
    title: 'System Notification',
    titleEs: 'Notificación del Sistema',
    message: '{message}',
    messageEs: '{message}',
    priority: 'low',
  },
};

// Type colors for UI
export const NOTIFICATION_TYPE_COLORS: Record<NotificationType, string> = {
  dispute_submitted: 'text-amber-600',
  dispute_resolved: 'text-emerald-600',
  adjustment_applied: 'text-blue-600',
  plan_approved: 'text-emerald-600',
  plan_rejected: 'text-red-600',
  data_quality_alert: 'text-red-600',
  goal_achieved: 'text-purple-600',
  payout_ready: 'text-emerald-600',
  system: 'text-slate-600',
};

// Priority colors for UI
export const NOTIFICATION_PRIORITY_COLORS: Record<NotificationPriority, string> = {
  low: 'bg-slate-100 text-slate-600',
  normal: 'bg-blue-100 text-blue-600',
  high: 'bg-amber-100 text-amber-600',
  urgent: 'bg-red-100 text-red-600',
};
