/**
 * Interaction Patterns
 *
 * Core interaction rules that are identical across all modules.
 * Three concentric rings: Core Platform Language → Module Extensions → Role Adaptations
 */

// ============================================
// CORE PLATFORM LANGUAGE (IDENTICAL EVERYWHERE)
// ============================================

/**
 * Approval action configuration — looks identical in every module
 */
export const APPROVAL_ACTION = {
  buttonVariant: 'default' as const,
  buttonClass: 'bg-emerald-600 hover:bg-emerald-700 text-white',
  icon: 'Check',
  label: 'Approve',
  labelEs: 'Aprobar',
  requiresConfirmation: false,
} as const;

/**
 * Reject action configuration
 */
export const REJECT_ACTION = {
  buttonVariant: 'outline' as const,
  buttonClass: 'border-slate-300 hover:bg-slate-100',
  icon: 'X',
  label: 'Reject',
  labelEs: 'Rechazar',
  requiresConfirmation: true,
  confirmationTitle: 'Confirm Rejection',
  confirmationTitleEs: 'Confirmar Rechazo',
} as const;

/**
 * Destructive action types — ALWAYS require confirmation with impact preview
 */
export const DESTRUCTIVE_ACTIONS = [
  'delete',
  'rollback',
  'reject',
  'terminate',
  'remove',
  'revoke',
  'cancel',
  'void',
] as const;

export type DestructiveAction = typeof DESTRUCTIVE_ACTIONS[number];

/**
 * Check if an action is destructive
 */
export function isDestructiveAction(action: string): boolean {
  return DESTRUCTIVE_ACTIONS.includes(action as DestructiveAction);
}

/**
 * Confirmation dialog configuration for destructive actions
 */
export interface DestructiveConfirmation {
  title: string;
  titleEs: string;
  description: string;
  descriptionEs: string;
  confirmLabel: string;
  confirmLabelEs: string;
  cancelLabel: string;
  cancelLabelEs: string;
  requiresImpactPreview: boolean;
  requiresReasonInput: boolean;
}

export const DESTRUCTIVE_CONFIRMATIONS: Record<DestructiveAction, DestructiveConfirmation> = {
  delete: {
    title: 'Delete Item',
    titleEs: 'Eliminar Elemento',
    description: 'This action cannot be undone. Are you sure you want to proceed?',
    descriptionEs: 'Esta acción no se puede deshacer. ¿Está seguro de continuar?',
    confirmLabel: 'Delete',
    confirmLabelEs: 'Eliminar',
    cancelLabel: 'Cancel',
    cancelLabelEs: 'Cancelar',
    requiresImpactPreview: true,
    requiresReasonInput: false,
  },
  rollback: {
    title: 'Rollback Changes',
    titleEs: 'Revertir Cambios',
    description: 'This will undo committed changes. Review the impact before proceeding.',
    descriptionEs: 'Esto deshará los cambios comprometidos. Revise el impacto antes de continuar.',
    confirmLabel: 'Rollback',
    confirmLabelEs: 'Revertir',
    cancelLabel: 'Cancel',
    cancelLabelEs: 'Cancelar',
    requiresImpactPreview: true,
    requiresReasonInput: true,
  },
  reject: {
    title: 'Reject Request',
    titleEs: 'Rechazar Solicitud',
    description: 'Please provide a reason for rejection.',
    descriptionEs: 'Por favor proporcione una razón para el rechazo.',
    confirmLabel: 'Reject',
    confirmLabelEs: 'Rechazar',
    cancelLabel: 'Cancel',
    cancelLabelEs: 'Cancelar',
    requiresImpactPreview: false,
    requiresReasonInput: true,
  },
  terminate: {
    title: 'Terminate',
    titleEs: 'Terminar',
    description: 'This will permanently end the process.',
    descriptionEs: 'Esto terminará permanentemente el proceso.',
    confirmLabel: 'Terminate',
    confirmLabelEs: 'Terminar',
    cancelLabel: 'Cancel',
    cancelLabelEs: 'Cancelar',
    requiresImpactPreview: true,
    requiresReasonInput: true,
  },
  remove: {
    title: 'Remove Item',
    titleEs: 'Eliminar Elemento',
    description: 'This item will be removed.',
    descriptionEs: 'Este elemento será eliminado.',
    confirmLabel: 'Remove',
    confirmLabelEs: 'Eliminar',
    cancelLabel: 'Cancel',
    cancelLabelEs: 'Cancelar',
    requiresImpactPreview: false,
    requiresReasonInput: false,
  },
  revoke: {
    title: 'Revoke Access',
    titleEs: 'Revocar Acceso',
    description: 'This will immediately revoke access.',
    descriptionEs: 'Esto revocará el acceso inmediatamente.',
    confirmLabel: 'Revoke',
    confirmLabelEs: 'Revocar',
    cancelLabel: 'Cancel',
    cancelLabelEs: 'Cancelar',
    requiresImpactPreview: true,
    requiresReasonInput: true,
  },
  cancel: {
    title: 'Cancel Operation',
    titleEs: 'Cancelar Operación',
    description: 'Are you sure you want to cancel?',
    descriptionEs: '¿Está seguro de que desea cancelar?',
    confirmLabel: 'Yes, Cancel',
    confirmLabelEs: 'Sí, Cancelar',
    cancelLabel: 'No, Continue',
    cancelLabelEs: 'No, Continuar',
    requiresImpactPreview: false,
    requiresReasonInput: false,
  },
  void: {
    title: 'Void Transaction',
    titleEs: 'Anular Transacción',
    description: 'This will void the transaction and cannot be undone.',
    descriptionEs: 'Esto anulará la transacción y no se puede deshacer.',
    confirmLabel: 'Void',
    confirmLabelEs: 'Anular',
    cancelLabel: 'Cancel',
    cancelLabelEs: 'Cancelar',
    requiresImpactPreview: true,
    requiresReasonInput: true,
  },
};

// ============================================
// FEEDBACK PATTERNS
// ============================================

/**
 * Every action produces visible feedback
 */
export const FEEDBACK_TYPES = {
  success: {
    icon: 'CheckCircle',
    defaultDuration: 3000,
    defaultTitle: 'Success',
    defaultTitleEs: 'Éxito',
  },
  error: {
    icon: 'XCircle',
    defaultDuration: 5000,
    defaultTitle: 'Error',
    defaultTitleEs: 'Error',
  },
  warning: {
    icon: 'AlertTriangle',
    defaultDuration: 4000,
    defaultTitle: 'Warning',
    defaultTitleEs: 'Advertencia',
  },
  info: {
    icon: 'Info',
    defaultDuration: 3000,
    defaultTitle: 'Info',
    defaultTitleEs: 'Información',
  },
} as const;

export type FeedbackType = keyof typeof FEEDBACK_TYPES;

// ============================================
// UNDO PATTERN
// ============================================

/**
 * Undo available for non-destructive actions within current session
 */
export interface UndoAction {
  id: string;
  actionType: string;
  description: string;
  descriptionEs: string;
  timestamp: string;
  canUndo: boolean;
  undoDeadline?: string; // After this time, undo expires
  originalState: unknown;
}

export const UNDO_CONFIG = {
  defaultTimeoutMs: 30000, // 30 seconds to undo
  maxUndoStackSize: 10,
  persistAcrossNavigation: false,
} as const;

// ============================================
// KEYBOARD SHORTCUTS
// ============================================

export const KEYBOARD_SHORTCUTS = {
  search: { key: 'k', modifiers: ['cmd'] as const, description: 'Open search', descriptionEs: 'Abrir búsqueda' },
  closeModal: { key: 'Escape', modifiers: [] as const, description: 'Close modal/panel', descriptionEs: 'Cerrar modal/panel' },
  save: { key: 's', modifiers: ['cmd'] as const, description: 'Save changes', descriptionEs: 'Guardar cambios' },
  undo: { key: 'z', modifiers: ['cmd'] as const, description: 'Undo last action', descriptionEs: 'Deshacer última acción' },
  redo: { key: 'z', modifiers: ['cmd', 'shift'] as const, description: 'Redo', descriptionEs: 'Rehacer' },
  help: { key: '?', modifiers: [] as const, description: 'Show help', descriptionEs: 'Mostrar ayuda' },
} as const;

// ============================================
// LOADING STATES
// ============================================

export const LOADING_PATTERNS = {
  button: 'spinner', // Show spinner inside button
  table: 'skeleton', // Show skeleton rows
  card: 'skeleton', // Show skeleton card
  page: 'skeleton', // Show skeleton layout
  inline: 'dots', // Show animated dots
} as const;

// ============================================
// EMPTY STATES
// ============================================

export interface EmptyStateConfig {
  icon: string;
  title: string;
  titleEs: string;
  description: string;
  descriptionEs: string;
  actionLabel?: string;
  actionLabelEs?: string;
  actionHref?: string;
}

export const DEFAULT_EMPTY_STATES: Record<string, EmptyStateConfig> = {
  noData: {
    icon: 'Inbox',
    title: 'No data yet',
    titleEs: 'Sin datos aún',
    description: 'Data will appear here once available.',
    descriptionEs: 'Los datos aparecerán aquí cuando estén disponibles.',
  },
  noResults: {
    icon: 'Search',
    title: 'No results found',
    titleEs: 'Sin resultados',
    description: 'Try adjusting your search or filters.',
    descriptionEs: 'Intente ajustar su búsqueda o filtros.',
  },
  noAccess: {
    icon: 'Lock',
    title: 'Access restricted',
    titleEs: 'Acceso restringido',
    description: 'You do not have permission to view this content.',
    descriptionEs: 'No tiene permiso para ver este contenido.',
  },
};
