/**
 * Configurable Lifecycle Pipeline
 *
 * Replaces hardcoded 9-state subway with a configuration-driven gate model.
 * Two presets: LAUNCH_CONFIG (simplified) and PRODUCTION_CONFIG (full).
 * Tenants select a pipeline via settings.lifecycle_pipeline.
 */

// ──────────────────────────────────────────────
// Gate Types
// ──────────────────────────────────────────────

export type GateType =
  | 'required'          // Must be explicitly advanced by a user action
  | 'conditional'       // Auto-advances when a condition is met
  | 'external_signal'   // Waits for an external event (e.g. payment confirmation)
  | 'auto';             // Auto-advances immediately after the prior gate

export type GateKey =
  | 'DRAFT'
  | 'PREVIEW'
  | 'RECONCILE'
  | 'OFFICIAL'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'SUPERSEDED'
  | 'POSTED'
  | 'CLOSED'
  | 'PAID'
  | 'PUBLISHED';

// ──────────────────────────────────────────────
// Gate Definition
// ──────────────────────────────────────────────

export interface GateDefinition {
  key: GateKey;
  label: string;
  labelEs: string;
  description: string;
  gateType: GateType;
  /** Capabilities required to advance past this gate */
  requiredCapabilities: string[];
  /** Dot color for subway visualization */
  dotColor: string;
  /** Action label shown on the advance button */
  actionLabel: string;
  actionLabelEs: string;
  /** Whether results become visible to all roles at this gate */
  resultsPublic: boolean;
  /** Whether results become immutable at this gate */
  immutable: boolean;
}

// ──────────────────────────────────────────────
// Pipeline Configuration
// ──────────────────────────────────────────────

export interface LifecyclePipelineConfig {
  id: string;
  name: string;
  nameEs: string;
  description: string;
  /** Ordered gate keys for the linear subway (excludes branch states like REJECTED) */
  orderedGates: GateKey[];
  /** Branch states that don't appear in the linear subway */
  branchStates: GateKey[];
  /** All gate definitions */
  gates: Record<GateKey, GateDefinition>;
  /** Valid transitions from each gate */
  transitions: Partial<Record<GateKey, GateKey[]>>;
}

// ──────────────────────────────────────────────
// Gate Definition Library (shared across configs)
// ──────────────────────────────────────────────

const GATE_LIBRARY: Record<GateKey, GateDefinition> = {
  DRAFT: {
    key: 'DRAFT',
    label: 'Draft',
    labelEs: 'Borrador',
    description: 'Rule set configured, no calculations run yet',
    gateType: 'required',
    requiredCapabilities: ['manage_rule_sets'],
    dotColor: 'bg-zinc-500',
    actionLabel: 'Run Preview',
    actionLabelEs: 'Ejecutar Vista Previa',
    resultsPublic: false,
    immutable: false,
  },
  PREVIEW: {
    key: 'PREVIEW',
    label: 'Preview',
    labelEs: 'Vista Previa',
    description: 'Calculation run in preview mode, results visible to admin only',
    gateType: 'required',
    requiredCapabilities: ['manage_rule_sets'],
    dotColor: 'bg-blue-500',
    actionLabel: 'Run Official',
    actionLabelEs: 'Ejecutar Oficial',
    resultsPublic: false,
    immutable: false,
  },
  RECONCILE: {
    key: 'RECONCILE',
    label: 'Reconcile',
    labelEs: 'Reconciliacion',
    description: 'Results under review, comparing against external sources',
    gateType: 'required',
    requiredCapabilities: ['manage_rule_sets'],
    dotColor: 'bg-cyan-500',
    actionLabel: 'Mark Official',
    actionLabelEs: 'Marcar como Oficial',
    resultsPublic: false,
    immutable: false,
  },
  OFFICIAL: {
    key: 'OFFICIAL',
    label: 'Official',
    labelEs: 'Oficial',
    description: 'Results locked, ready for approval',
    gateType: 'required',
    requiredCapabilities: ['manage_rule_sets'],
    dotColor: 'bg-purple-500',
    actionLabel: 'Submit for Approval',
    actionLabelEs: 'Enviar a Aprobacion',
    resultsPublic: false,
    immutable: true,
  },
  PENDING_APPROVAL: {
    key: 'PENDING_APPROVAL',
    label: 'Pending Approval',
    labelEs: 'Pendiente de Aprobacion',
    description: 'Awaiting authorized reviewer action',
    gateType: 'external_signal',
    requiredCapabilities: ['approve_outcomes'],
    dotColor: 'bg-yellow-500',
    actionLabel: 'Approve',
    actionLabelEs: 'Aprobar',
    resultsPublic: false,
    immutable: true,
  },
  APPROVED: {
    key: 'APPROVED',
    label: 'Approved',
    labelEs: 'Aprobado',
    description: 'Results approved by authorized reviewer',
    gateType: 'required',
    requiredCapabilities: ['manage_rule_sets'],
    dotColor: 'bg-emerald-500',
    actionLabel: 'Post Results',
    actionLabelEs: 'Publicar Resultados',
    resultsPublic: false,
    immutable: true,
  },
  REJECTED: {
    key: 'REJECTED',
    label: 'Rejected',
    labelEs: 'Rechazado',
    description: 'Approval rejected, returns to OFFICIAL for re-work',
    gateType: 'required',
    requiredCapabilities: ['manage_rule_sets'],
    dotColor: 'bg-red-500',
    actionLabel: 'Return to Official',
    actionLabelEs: 'Regresar a Oficial',
    resultsPublic: false,
    immutable: true,
  },
  SUPERSEDED: {
    key: 'SUPERSEDED',
    label: 'Superseded',
    labelEs: 'Superado',
    description: 'Old batch superseded by new one',
    gateType: 'auto',
    requiredCapabilities: [],
    dotColor: 'bg-stone-500',
    actionLabel: '',
    actionLabelEs: '',
    resultsPublic: false,
    immutable: true,
  },
  POSTED: {
    key: 'POSTED',
    label: 'Posted',
    labelEs: 'Publicado',
    description: 'Results visible to all roles in Perform workspace',
    gateType: 'required',
    requiredCapabilities: ['manage_rule_sets'],
    dotColor: 'bg-teal-500',
    actionLabel: 'Close Period',
    actionLabelEs: 'Cerrar Periodo',
    resultsPublic: true,
    immutable: true,
  },
  CLOSED: {
    key: 'CLOSED',
    label: 'Closed',
    labelEs: 'Cerrado',
    description: 'Period locked, no further modifications',
    gateType: 'required',
    requiredCapabilities: ['manage_rule_sets'],
    dotColor: 'bg-indigo-500',
    actionLabel: 'Mark as Paid',
    actionLabelEs: 'Confirmar Pago',
    resultsPublic: true,
    immutable: true,
  },
  PAID: {
    key: 'PAID',
    label: 'Paid',
    labelEs: 'Pagado',
    description: 'Payment confirmed and recorded',
    gateType: 'external_signal',
    requiredCapabilities: ['manage_rule_sets'],
    dotColor: 'bg-amber-500',
    actionLabel: 'Publish',
    actionLabelEs: 'Publicar Resultados',
    resultsPublic: true,
    immutable: true,
  },
  PUBLISHED: {
    key: 'PUBLISHED',
    label: 'Published',
    labelEs: 'Finalizado',
    description: 'Terminal state, audit trail sealed',
    gateType: 'auto',
    requiredCapabilities: [],
    dotColor: 'bg-sky-500',
    actionLabel: '',
    actionLabelEs: '',
    resultsPublic: true,
    immutable: true,
  },
};

// ──────────────────────────────────────────────
// LAUNCH_CONFIG — Simplified pipeline for onboarding
// ──────────────────────────────────────────────
// Skips RECONCILE and PENDING_APPROVAL — admin can go straight
// from Preview → Official → Posted without approver gate.

export const LAUNCH_CONFIG: LifecyclePipelineConfig = {
  id: 'launch',
  name: 'Launch Pipeline',
  nameEs: 'Pipeline de Lanzamiento',
  description: 'Simplified pipeline for fast go-live. Skips reconciliation and approval gates.',
  orderedGates: [
    'DRAFT', 'PREVIEW', 'OFFICIAL', 'POSTED', 'CLOSED', 'PAID', 'PUBLISHED',
  ],
  branchStates: ['SUPERSEDED'],
  gates: GATE_LIBRARY,
  transitions: {
    DRAFT: ['PREVIEW'],
    PREVIEW: ['DRAFT', 'OFFICIAL'],
    OFFICIAL: ['POSTED', 'SUPERSEDED'],
    POSTED: ['CLOSED'],
    CLOSED: ['PAID'],
    PAID: ['PUBLISHED'],
    PUBLISHED: [],
    SUPERSEDED: [],
  },
};

// ──────────────────────────────────────────────
// PRODUCTION_CONFIG — Full 12-state pipeline
// ──────────────────────────────────────────────
// Complete lifecycle with reconciliation, approval gating,
// rejection loop, and separation of duties.

export const PRODUCTION_CONFIG: LifecyclePipelineConfig = {
  id: 'production',
  name: 'Production Pipeline',
  nameEs: 'Pipeline de Produccion',
  description: 'Full lifecycle with reconciliation, approval gates, and separation of duties.',
  orderedGates: [
    'DRAFT', 'PREVIEW', 'RECONCILE', 'OFFICIAL', 'PENDING_APPROVAL',
    'APPROVED', 'POSTED', 'CLOSED', 'PAID', 'PUBLISHED',
  ],
  branchStates: ['REJECTED', 'SUPERSEDED'],
  gates: GATE_LIBRARY,
  transitions: {
    DRAFT: ['PREVIEW'],
    PREVIEW: ['DRAFT', 'RECONCILE', 'OFFICIAL'],
    RECONCILE: ['PREVIEW', 'OFFICIAL'],
    OFFICIAL: ['PENDING_APPROVAL', 'SUPERSEDED'],
    PENDING_APPROVAL: ['APPROVED', 'REJECTED'],
    APPROVED: ['POSTED'],
    REJECTED: ['OFFICIAL'],
    POSTED: ['CLOSED'],
    CLOSED: ['PAID'],
    PAID: ['PUBLISHED'],
    PUBLISHED: [],
    SUPERSEDED: [],
  },
};

// ──────────────────────────────────────────────
// Config Registry
// ──────────────────────────────────────────────

const PIPELINE_CONFIGS: Record<string, LifecyclePipelineConfig> = {
  launch: LAUNCH_CONFIG,
  production: PRODUCTION_CONFIG,
};

/**
 * Get a pipeline config by ID.
 * Falls back to PRODUCTION_CONFIG if unknown.
 */
export function getPipelineConfig(configId: string): LifecyclePipelineConfig {
  return PIPELINE_CONFIGS[configId] || PRODUCTION_CONFIG;
}

/**
 * List all available pipeline configs.
 */
export function listPipelineConfigs(): Array<{ id: string; name: string; nameEs: string; description: string }> {
  return Object.values(PIPELINE_CONFIGS).map(c => ({
    id: c.id,
    name: c.name,
    nameEs: c.nameEs,
    description: c.description,
  }));
}

// ──────────────────────────────────────────────
// Config-Driven Helpers
// ──────────────────────────────────────────────

/**
 * Get the gate definition for a state key.
 */
export function getGateDefinition(key: GateKey): GateDefinition {
  return GATE_LIBRARY[key];
}

/**
 * Get allowed transitions from a state within a config.
 */
export function getAllowedTransitionsForConfig(
  config: LifecyclePipelineConfig,
  currentState: GateKey
): GateKey[] {
  return config.transitions[currentState] || [];
}

/**
 * Check if a transition is valid within a config.
 */
export function canTransitionInConfig(
  config: LifecyclePipelineConfig,
  from: GateKey,
  to: GateKey
): boolean {
  return (config.transitions[from] || []).includes(to);
}

/**
 * Check if a state is in the ordered gates (linear subway) for a config.
 */
export function isLinearState(config: LifecyclePipelineConfig, state: GateKey): boolean {
  return config.orderedGates.includes(state);
}

/**
 * Map any state to the nearest linear subway state for display.
 */
export function toLinearState(config: LifecyclePipelineConfig, state: GateKey): GateKey {
  if (config.orderedGates.includes(state)) return state;
  // Branch state fallbacks
  switch (state) {
    case 'PENDING_APPROVAL':
      return config.orderedGates.includes('PENDING_APPROVAL') ? 'PENDING_APPROVAL' : 'OFFICIAL';
    case 'REJECTED':
      return 'OFFICIAL';
    case 'SUPERSEDED':
      return 'DRAFT';
    default:
      return 'DRAFT';
  }
}

/**
 * Get the index of a state in the ordered gates.
 * Returns -1 for branch states not in the linear subway.
 */
export function getGateIndex(config: LifecyclePipelineConfig, state: GateKey): number {
  return config.orderedGates.indexOf(state);
}

/**
 * Check if results are visible for a given state and role in this config.
 */
export function canViewResultsInConfig(
  config: LifecyclePipelineConfig,
  state: GateKey,
  role: string
): boolean {
  const gate = config.gates[state];
  if (!gate) return false;

  // Admin/VL Admin can always view
  if (role === 'vl_admin' || role === 'platform_admin' || role === 'admin') return true;

  // Approvers can see during approval
  if (state === 'PENDING_APPROVAL' && role === 'approver') return true;

  // All roles can see when results are public
  return gate.resultsPublic;
}

/**
 * Get the state color class (Tailwind) for a gate key.
 */
export function getGateColor(key: GateKey): string {
  const colors: Record<GateKey, string> = {
    DRAFT: 'bg-gray-100 text-gray-700',
    PREVIEW: 'bg-blue-100 text-blue-700',
    RECONCILE: 'bg-cyan-100 text-cyan-700',
    OFFICIAL: 'bg-purple-100 text-purple-700',
    PENDING_APPROVAL: 'bg-yellow-100 text-yellow-700',
    APPROVED: 'bg-green-100 text-green-700',
    REJECTED: 'bg-red-100 text-red-700',
    SUPERSEDED: 'bg-stone-100 text-stone-700',
    POSTED: 'bg-teal-100 text-teal-700',
    CLOSED: 'bg-indigo-100 text-indigo-700',
    PAID: 'bg-emerald-100 text-emerald-700',
    PUBLISHED: 'bg-sky-100 text-sky-700',
  };
  return colors[key] || 'bg-gray-100 text-gray-700';
}
