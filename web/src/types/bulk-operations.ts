/**
 * Bulk Operations Types
 *
 * Types for multi-select actions, batch processing, and progress tracking.
 */

export type BulkOperationType =
  | 'approve'
  | 'reject'
  | 'export'
  | 'delete'
  | 'archive'
  | 'assign'
  | 'update_status'
  | 'send_notification';

export type BulkOperationStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface BulkOperation {
  id: string;
  type: BulkOperationType;
  status: BulkOperationStatus;
  targetType: 'transaction' | 'dispute' | 'user' | 'plan' | 'payout';
  targetIds: string[];
  totalItems: number;
  processedItems: number;
  successCount: number;
  failureCount: number;
  errors: BulkOperationError[];
  createdBy: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  options?: Record<string, unknown>;
}

export interface BulkOperationError {
  itemId: string;
  itemName?: string;
  error: string;
  errorEs: string;
}

export interface BulkOperationResult {
  operationId: string;
  success: boolean;
  message: string;
  messageEs: string;
  processed: number;
  succeeded: number;
  failed: number;
  errors: BulkOperationError[];
}

export interface BulkSelectionState {
  selectedIds: Set<string>;
  selectAll: boolean;
  excludedIds: Set<string>;
}

export interface BulkActionConfig {
  type: BulkOperationType;
  name: string;
  nameEs: string;
  description: string;
  descriptionEs: string;
  icon: string;
  requiresConfirmation: boolean;
  confirmationMessage?: string;
  confirmationMessageEs?: string;
  allowedTargets: BulkOperation['targetType'][];
  minSelection: number;
  maxSelection?: number;
}

// Bulk action configurations
export const BULK_ACTIONS: Record<BulkOperationType, BulkActionConfig> = {
  approve: {
    type: 'approve',
    name: 'Approve',
    nameEs: 'Aprobar',
    description: 'Approve selected items',
    descriptionEs: 'Aprobar elementos seleccionados',
    icon: 'CheckCircle',
    requiresConfirmation: true,
    confirmationMessage: 'Are you sure you want to approve these items?',
    confirmationMessageEs: '¿Está seguro de aprobar estos elementos?',
    allowedTargets: ['dispute', 'plan', 'payout'],
    minSelection: 1,
  },
  reject: {
    type: 'reject',
    name: 'Reject',
    nameEs: 'Rechazar',
    description: 'Reject selected items',
    descriptionEs: 'Rechazar elementos seleccionados',
    icon: 'XCircle',
    requiresConfirmation: true,
    confirmationMessage: 'Are you sure you want to reject these items?',
    confirmationMessageEs: '¿Está seguro de rechazar estos elementos?',
    allowedTargets: ['dispute', 'plan', 'payout'],
    minSelection: 1,
  },
  export: {
    type: 'export',
    name: 'Export',
    nameEs: 'Exportar',
    description: 'Export selected items',
    descriptionEs: 'Exportar elementos seleccionados',
    icon: 'Download',
    requiresConfirmation: false,
    allowedTargets: ['transaction', 'dispute', 'user', 'plan', 'payout'],
    minSelection: 1,
  },
  delete: {
    type: 'delete',
    name: 'Delete',
    nameEs: 'Eliminar',
    description: 'Delete selected items',
    descriptionEs: 'Eliminar elementos seleccionados',
    icon: 'Trash2',
    requiresConfirmation: true,
    confirmationMessage: 'Are you sure you want to delete these items? This cannot be undone.',
    confirmationMessageEs: '¿Está seguro de eliminar estos elementos? Esta acción no se puede deshacer.',
    allowedTargets: ['dispute', 'plan'],
    minSelection: 1,
  },
  archive: {
    type: 'archive',
    name: 'Archive',
    nameEs: 'Archivar',
    description: 'Archive selected items',
    descriptionEs: 'Archivar elementos seleccionados',
    icon: 'Archive',
    requiresConfirmation: true,
    confirmationMessage: 'Are you sure you want to archive these items?',
    confirmationMessageEs: '¿Está seguro de archivar estos elementos?',
    allowedTargets: ['transaction', 'dispute', 'payout'],
    minSelection: 1,
  },
  assign: {
    type: 'assign',
    name: 'Assign',
    nameEs: 'Asignar',
    description: 'Assign selected items to a user',
    descriptionEs: 'Asignar elementos seleccionados a un usuario',
    icon: 'UserPlus',
    requiresConfirmation: false,
    allowedTargets: ['dispute', 'plan'],
    minSelection: 1,
  },
  update_status: {
    type: 'update_status',
    name: 'Update Status',
    nameEs: 'Actualizar Estado',
    description: 'Update status of selected items',
    descriptionEs: 'Actualizar estado de elementos seleccionados',
    icon: 'RefreshCw',
    requiresConfirmation: false,
    allowedTargets: ['transaction', 'dispute', 'payout'],
    minSelection: 1,
  },
  send_notification: {
    type: 'send_notification',
    name: 'Send Notification',
    nameEs: 'Enviar Notificación',
    description: 'Send notification to selected users',
    descriptionEs: 'Enviar notificación a usuarios seleccionados',
    icon: 'Bell',
    requiresConfirmation: true,
    confirmationMessage: 'Send notification to selected users?',
    confirmationMessageEs: '¿Enviar notificación a usuarios seleccionados?',
    allowedTargets: ['user'],
    minSelection: 1,
  },
};
