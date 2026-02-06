/**
 * Alert System Types
 *
 * Types for configurable alerts and notification preferences.
 */

export type AlertChannel = 'in_app' | 'email' | 'sms' | 'push';

export type AlertTrigger =
  | 'quota_attainment'
  | 'payout_ready'
  | 'dispute_status'
  | 'plan_change'
  | 'approval_required'
  | 'data_quality'
  | 'goal_progress'
  | 'team_performance'
  | 'custom';

export type AlertCondition =
  | 'above_threshold'
  | 'below_threshold'
  | 'equals'
  | 'changes'
  | 'new_item'
  | 'status_change';

export type AlertFrequency = 'immediate' | 'daily_digest' | 'weekly_digest' | 'never';

export interface AlertRule {
  id: string;
  tenantId: string;
  name: string;
  nameEs: string;
  description: string;
  descriptionEs: string;

  // Trigger configuration
  trigger: AlertTrigger;
  condition: AlertCondition;
  threshold?: number;
  thresholdUnit?: string;

  // Target audience
  targetType: 'user' | 'role' | 'team' | 'all';
  targetIds: string[];

  // Delivery
  channels: AlertChannel[];
  frequency: AlertFrequency;

  // Status
  enabled: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;

  // Stats
  lastTriggered?: string;
  triggerCount: number;
}

export interface UserAlertPreferences {
  userId: string;
  tenantId: string;

  // Global preferences
  globalEnabled: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart?: string; // HH:mm
  quietHoursEnd?: string;

  // Channel preferences
  channels: {
    in_app: boolean;
    email: boolean;
    sms: boolean;
    push: boolean;
  };

  // Per-trigger preferences
  triggerPreferences: Record<AlertTrigger, {
    enabled: boolean;
    channels: AlertChannel[];
    frequency: AlertFrequency;
  }>;

  // Digest settings
  digestTime: string; // HH:mm for daily digest
  digestDay: number; // 0-6 for weekly digest (0 = Sunday)

  updatedAt: string;
}

export interface AlertEvent {
  id: string;
  ruleId: string;
  ruleName: string;
  trigger: AlertTrigger;
  tenantId: string;

  // Event data
  eventData: Record<string, unknown>;
  message: string;
  messageEs: string;

  // Delivery tracking
  deliveredTo: {
    userId: string;
    channels: AlertChannel[];
    deliveredAt: string;
  }[];

  createdAt: string;
}

// Trigger configuration metadata
export const ALERT_TRIGGERS: Record<AlertTrigger, {
  name: string;
  nameEs: string;
  description: string;
  descriptionEs: string;
  icon: string;
  supportsThreshold: boolean;
  defaultCondition: AlertCondition;
}> = {
  quota_attainment: {
    name: 'Quota Attainment',
    nameEs: 'Cumplimiento de Cuota',
    description: 'Alert when quota attainment reaches a threshold',
    descriptionEs: 'Alerta cuando el cumplimiento de cuota alcanza un umbral',
    icon: 'Target',
    supportsThreshold: true,
    defaultCondition: 'above_threshold',
  },
  payout_ready: {
    name: 'Payout Ready',
    nameEs: 'Pago Listo',
    description: 'Alert when compensation payout is ready',
    descriptionEs: 'Alerta cuando el pago de compensaci\u00f3n est\u00e1 listo',
    icon: 'DollarSign',
    supportsThreshold: false,
    defaultCondition: 'new_item',
  },
  dispute_status: {
    name: 'Dispute Status',
    nameEs: 'Estado de Disputa',
    description: 'Alert on dispute status changes',
    descriptionEs: 'Alerta sobre cambios en estado de disputa',
    icon: 'AlertTriangle',
    supportsThreshold: false,
    defaultCondition: 'status_change',
  },
  plan_change: {
    name: 'Plan Changes',
    nameEs: 'Cambios de Plan',
    description: 'Alert when compensation plan is modified',
    descriptionEs: 'Alerta cuando el plan de compensaci\u00f3n es modificado',
    icon: 'FileText',
    supportsThreshold: false,
    defaultCondition: 'changes',
  },
  approval_required: {
    name: 'Approval Required',
    nameEs: 'Aprobaci\u00f3n Requerida',
    description: 'Alert when approval is needed',
    descriptionEs: 'Alerta cuando se requiere aprobaci\u00f3n',
    icon: 'ClipboardCheck',
    supportsThreshold: false,
    defaultCondition: 'new_item',
  },
  data_quality: {
    name: 'Data Quality Issues',
    nameEs: 'Problemas de Calidad de Datos',
    description: 'Alert on data quality issues',
    descriptionEs: 'Alerta sobre problemas de calidad de datos',
    icon: 'ShieldAlert',
    supportsThreshold: true,
    defaultCondition: 'above_threshold',
  },
  goal_progress: {
    name: 'Goal Progress',
    nameEs: 'Progreso de Metas',
    description: 'Alert on goal progress milestones',
    descriptionEs: 'Alerta sobre hitos de progreso de metas',
    icon: 'TrendingUp',
    supportsThreshold: true,
    defaultCondition: 'above_threshold',
  },
  team_performance: {
    name: 'Team Performance',
    nameEs: 'Rendimiento del Equipo',
    description: 'Alert on team performance metrics',
    descriptionEs: 'Alerta sobre m\u00e9tricas de rendimiento del equipo',
    icon: 'Users',
    supportsThreshold: true,
    defaultCondition: 'below_threshold',
  },
  custom: {
    name: 'Custom Alert',
    nameEs: 'Alerta Personalizada',
    description: 'Custom configured alert',
    descriptionEs: 'Alerta configurada personalizada',
    icon: 'Bell',
    supportsThreshold: true,
    defaultCondition: 'equals',
  },
};

// Channel metadata
export const ALERT_CHANNELS: Record<AlertChannel, {
  name: string;
  nameEs: string;
  icon: string;
  available: boolean; // Some channels may not be implemented yet
}> = {
  in_app: {
    name: 'In-App',
    nameEs: 'En la App',
    icon: 'Bell',
    available: true,
  },
  email: {
    name: 'Email',
    nameEs: 'Correo',
    icon: 'Mail',
    available: true,
  },
  sms: {
    name: 'SMS',
    nameEs: 'SMS',
    icon: 'MessageSquare',
    available: false,
  },
  push: {
    name: 'Push Notification',
    nameEs: 'Notificaci\u00f3n Push',
    icon: 'Smartphone',
    available: false,
  },
};
