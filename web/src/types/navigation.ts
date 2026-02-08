/**
 * Navigation Types - Mission Control Architecture
 *
 * Core types for the workspace-based navigation system including:
 * - Workspaces and their sections
 * - Cycle state (compensation lifecycle)
 * - Queue items (action items)
 * - Pulse metrics (role-aware KPIs)
 * - Command palette entries
 */

import type { UserRole } from './auth';

// =============================================================================
// WORKSPACE TYPES
// =============================================================================

export type WorkspaceId = 'operate' | 'perform' | 'investigate' | 'design' | 'configure' | 'govern';

export interface Workspace {
  id: WorkspaceId;
  label: string;
  labelEs: string;
  icon: string; // Lucide icon name
  description: string;
  descriptionEs: string;
  defaultRoute: string;
  sections: WorkspaceSection[];
  roles: UserRole[]; // Which roles see this workspace
  accentColor: string; // HSL color for workspace theming
}

export interface WorkspaceSection {
  id: string;
  label: string;
  labelEs: string;
  routes: WorkspaceRoute[];
}

export interface WorkspaceRoute {
  path: string;
  label: string;
  labelEs: string;
  icon: string;
  roles: UserRole[];
  accelerationHints?: AccelerationHint[];
}

export interface AccelerationHint {
  type: 'recommendation' | 'alert' | 'pacing' | 'prediction';
  source: string; // Which service provides this
  position: 'inline' | 'badge' | 'sidebar';
}

// =============================================================================
// CYCLE TYPES (Compensation Lifecycle)
// =============================================================================

export type CyclePhase = 'import' | 'calculate' | 'reconcile' | 'approve' | 'pay' | 'closed';

export interface CycleState {
  currentPhase: CyclePhase;
  periodLabel: string; // "March 2025"
  periodId: string;
  phaseStatuses: Record<CyclePhase, PhaseStatus>;
  pendingActions: number;
  completionPercentage: number;
}

export interface PhaseStatus {
  state: 'not_started' | 'in_progress' | 'completed' | 'blocked' | 'warning';
  detail?: string;
  detailEs?: string;
  actionCount?: number;
}

export const CYCLE_PHASE_ORDER: CyclePhase[] = ['import', 'calculate', 'reconcile', 'approve', 'pay', 'closed'];

export const CYCLE_PHASE_LABELS: Record<CyclePhase, { en: string; es: string }> = {
  import: { en: 'Import', es: 'Importar' },
  calculate: { en: 'Calculate', es: 'Calcular' },
  reconcile: { en: 'Reconcile', es: 'Conciliar' },
  approve: { en: 'Approve', es: 'Aprobar' },
  pay: { en: 'Pay', es: 'Pagar' },
  closed: { en: 'Closed', es: 'Cerrado' },
};

// =============================================================================
// QUEUE TYPES (Action Items)
// =============================================================================

export type QueueItemType = 'approval' | 'data_quality' | 'dispute' | 'alert' | 'notification' | 'exception' | 'reconciliation';
export type QueueUrgency = 'critical' | 'high' | 'medium' | 'low';

export interface QueueItem {
  id: string;
  type: QueueItemType;
  urgency: QueueUrgency;
  title: string;
  titleEs: string;
  description: string;
  descriptionEs: string;
  workspace: WorkspaceId;
  route: string;
  timestamp: string;
  read: boolean;
  metadata?: Record<string, unknown>;
}

export const QUEUE_URGENCY_ORDER: QueueUrgency[] = ['critical', 'high', 'medium', 'low'];

export const QUEUE_TYPE_CONFIG: Record<QueueItemType, { icon: string; color: string; label: string; labelEs: string }> = {
  approval: { icon: 'CheckCircle', color: 'text-amber-600', label: 'Approval', labelEs: 'Aprobación' },
  data_quality: { icon: 'AlertTriangle', color: 'text-red-600', label: 'Data Quality', labelEs: 'Calidad de Datos' },
  dispute: { icon: 'MessageCircle', color: 'text-blue-600', label: 'Dispute', labelEs: 'Disputa' },
  alert: { icon: 'Bell', color: 'text-orange-600', label: 'Alert', labelEs: 'Alerta' },
  notification: { icon: 'Info', color: 'text-gray-600', label: 'Notification', labelEs: 'Notificación' },
  exception: { icon: 'XCircle', color: 'text-red-700', label: 'Exception', labelEs: 'Excepción' },
  reconciliation: { icon: 'GitCompare', color: 'text-purple-600', label: 'Reconciliation', labelEs: 'Conciliación' },
};

export const QUEUE_URGENCY_CONFIG: Record<QueueUrgency, { color: string; bgColor: string; label: string; labelEs: string }> = {
  critical: { color: 'text-red-700', bgColor: 'bg-red-100', label: 'Critical', labelEs: 'Crítico' },
  high: { color: 'text-amber-700', bgColor: 'bg-amber-100', label: 'High', labelEs: 'Alto' },
  medium: { color: 'text-blue-700', bgColor: 'bg-blue-100', label: 'Medium', labelEs: 'Medio' },
  low: { color: 'text-gray-600', bgColor: 'bg-gray-100', label: 'Low', labelEs: 'Bajo' },
};

// =============================================================================
// PULSE TYPES (Role-Aware Metrics)
// =============================================================================

export type PulseMetricFormat = 'currency' | 'percentage' | 'number' | 'text';
export type PulseTrend = 'up' | 'down' | 'flat';

export interface PulseMetric {
  id: string;
  label: string;
  labelEs: string;
  value: string | number;
  format: PulseMetricFormat;
  trend?: PulseTrend;
  trendValue?: string;
  trendValueEs?: string;
  roles: UserRole[];
  route?: string; // Where clicking navigates
}

// =============================================================================
// COMMAND PALETTE TYPES
// =============================================================================

export type CommandCategory = 'page' | 'action' | 'person' | 'recent';

export interface CommandItem {
  id: string;
  label: string;
  labelEs: string;
  description?: string;
  descriptionEs?: string;
  workspace: WorkspaceId;
  route: string;
  icon: string;
  keywords: string[]; // For search matching
  category: CommandCategory;
}

// =============================================================================
// NAVIGATION SIGNALS (Analytics/Training)
// =============================================================================

export type NavigationSignalType = 'search' | 'command_select' | 'workspace_switch' | 'queue_click' | 'cycle_click' | 'pulse_click';

export interface NavigationSignal {
  type: NavigationSignalType;
  query?: string;
  selectedItem?: string;
  fromWorkspace?: WorkspaceId;
  toWorkspace?: WorkspaceId;
  timestamp: string;
  userId: string;
  tenantId: string;
}

// =============================================================================
// NAVIGATION CONTEXT STATE
// =============================================================================

export interface NavigationState {
  activeWorkspace: WorkspaceId;
  isRailCollapsed: boolean;
  isCommandPaletteOpen: boolean;
  cycleState: CycleState | null;
  queueItems: QueueItem[];
  pulseMetrics: PulseMetric[];
  recentPages: string[];
}
