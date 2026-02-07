/**
 * Design System Tokens
 *
 * Core tokens for the ClearComp Unified Visual Language.
 * Three-layer design system: Wayfinding, State Communication, Interaction Patterns.
 */

// ============================================
// MODULE IDENTITY TOKENS
// ============================================

/**
 * Each module is a "district" with distinct character.
 * Module identity lives in the environment (ambient accents, layout signatures),
 * not on the data itself.
 */
export const MODULE_TOKENS = {
  insights: {
    accent: 'hsl(210, 70%, 50%)',
    accentLight: 'hsl(210, 70%, 95%)',
    accentBorder: 'hsl(210, 70%, 80%)',
    accentDark: 'hsl(210, 70%, 35%)',
    icon: 'BarChart3',
    layoutSignature: 'dashboard',
    label: 'Insights',
    labelEs: 'Perspectivas',
  },
  transactions: {
    accent: 'hsl(170, 60%, 45%)',
    accentLight: 'hsl(170, 60%, 95%)',
    accentBorder: 'hsl(170, 60%, 80%)',
    accentDark: 'hsl(170, 60%, 30%)',
    icon: 'Receipt',
    layoutSignature: 'table-dense',
    label: 'Transactions',
    labelEs: 'Transacciones',
  },
  performance: {
    accent: 'hsl(260, 60%, 55%)',
    accentLight: 'hsl(260, 60%, 95%)',
    accentBorder: 'hsl(260, 60%, 80%)',
    accentDark: 'hsl(260, 60%, 40%)',
    icon: 'Target',
    layoutSignature: 'mixed',
    label: 'Performance',
    labelEs: 'Rendimiento',
  },
  configuration: {
    accent: 'hsl(30, 60%, 50%)',
    accentLight: 'hsl(30, 60%, 95%)',
    accentBorder: 'hsl(30, 60%, 80%)',
    accentDark: 'hsl(30, 60%, 35%)',
    icon: 'Settings',
    layoutSignature: 'form-heavy',
    label: 'Configuration',
    labelEs: 'Configuración',
  },
  data: {
    accent: 'hsl(150, 55%, 45%)',
    accentLight: 'hsl(150, 55%, 95%)',
    accentBorder: 'hsl(150, 55%, 80%)',
    accentDark: 'hsl(150, 55%, 30%)',
    icon: 'Database',
    layoutSignature: 'table-dense',
    label: 'Data',
    labelEs: 'Datos',
  },
  acceleration: {
    accent: 'hsl(340, 65%, 55%)',
    accentLight: 'hsl(340, 65%, 95%)',
    accentBorder: 'hsl(340, 65%, 80%)',
    accentDark: 'hsl(340, 65%, 40%)',
    icon: 'Rocket',
    layoutSignature: 'card-based',
    label: 'Acceleration',
    labelEs: 'Aceleración',
  },
  operations: {
    accent: 'hsl(200, 55%, 50%)',
    accentLight: 'hsl(200, 55%, 95%)',
    accentBorder: 'hsl(200, 55%, 80%)',
    accentDark: 'hsl(200, 55%, 35%)',
    icon: 'Wrench',
    layoutSignature: 'mixed',
    label: 'Operations',
    labelEs: 'Operaciones',
  },
  approvals: {
    accent: 'hsl(260, 60%, 55%)', // Same as performance — approvals are part of performance management
    accentLight: 'hsl(260, 60%, 95%)',
    accentBorder: 'hsl(260, 60%, 80%)',
    accentDark: 'hsl(260, 60%, 40%)',
    icon: 'CheckSquare',
    layoutSignature: 'mixed',
    label: 'Approvals',
    labelEs: 'Aprobaciones',
  },
  reconciliation: {
    accent: 'hsl(45, 70%, 50%)',
    accentLight: 'hsl(45, 70%, 95%)',
    accentBorder: 'hsl(45, 70%, 80%)',
    accentDark: 'hsl(45, 70%, 35%)',
    icon: 'Scale',
    layoutSignature: 'table-dense',
    label: 'Reconciliation',
    labelEs: 'Conciliación',
  },
  admin: {
    accent: 'hsl(0, 0%, 45%)',
    accentLight: 'hsl(0, 0%, 95%)',
    accentBorder: 'hsl(0, 0%, 80%)',
    accentDark: 'hsl(0, 0%, 30%)',
    icon: 'Shield',
    layoutSignature: 'mixed',
    label: 'Admin',
    labelEs: 'Administración',
  },
  workforce: {
    accent: 'hsl(280, 50%, 55%)',
    accentLight: 'hsl(280, 50%, 95%)',
    accentBorder: 'hsl(280, 50%, 80%)',
    accentDark: 'hsl(280, 50%, 40%)',
    icon: 'Users',
    layoutSignature: 'table-dense',
    label: 'Workforce',
    labelEs: 'Personal',
  },
} as const;

export type ModuleId = keyof typeof MODULE_TOKENS;

// ============================================
// STATE COMMUNICATION TOKENS
// ============================================

/**
 * State communication uses opacity, completeness metaphor, and attention indicators.
 * NEVER use stoplight (red/yellow/green) encoding.
 * State lives on data elements, not in the environment.
 */
export const STATE_TOKENS = {
  confidence: {
    high: { opacity: 1.0, ring: 'full', label: 'Confirmed', labelEs: 'Confirmado' },
    medium: { opacity: 0.7, ring: 'three-quarter', label: 'Probable', labelEs: 'Probable' },
    low: { opacity: 0.4, ring: 'half', label: 'Uncertain', labelEs: 'Incierto' },
    unknown: { opacity: 0.2, ring: 'quarter', label: 'Unverified', labelEs: 'Sin verificar' },
  },
  actionNeeded: {
    none: { pulse: false, elevation: 'flat', intensity: 0 },
    optional: { pulse: false, elevation: 'subtle', intensity: 1 },
    recommended: { pulse: false, elevation: 'raised', intensity: 2 },
    required: { pulse: true, elevation: 'prominent', intensity: 3 },
    urgent: { pulse: true, elevation: 'prominent', intensity: 4 },
  },
  progress: {
    notStarted: { fill: 0, label: 'Not Started', labelEs: 'Sin iniciar' },
    inProgress: { fill: 0.5, label: 'In Progress', labelEs: 'En progreso' },
    nearComplete: { fill: 0.85, label: 'Nearly Complete', labelEs: 'Casi completo' },
    complete: { fill: 1.0, label: 'Complete', labelEs: 'Completo' },
  },
} as const;

export type ConfidenceLevel = keyof typeof STATE_TOKENS.confidence;
export type ActionLevel = keyof typeof STATE_TOKENS.actionNeeded;
export type ProgressLevel = keyof typeof STATE_TOKENS.progress;

// ============================================
// LAYOUT TOKENS
// ============================================

export const LAYOUT_TOKENS = {
  density: {
    compact: { gap: '0.5rem', padding: '0.75rem', fontSize: '0.8125rem' },
    standard: { gap: '0.75rem', padding: '1rem', fontSize: '0.875rem' },
    relaxed: { gap: '1rem', padding: '1.25rem', fontSize: '1rem' },
  },
  signatures: {
    dashboard: { columns: 'auto-fill', minColWidth: '300px', gap: '1rem' },
    'table-dense': { columns: '1fr', gap: '0.5rem' },
    mixed: { columns: '2fr 1fr', gap: '1rem' },
    'form-heavy': { columns: '1fr', maxWidth: '800px', gap: '0.75rem' },
    'card-based': { columns: 'auto-fill', minColWidth: '280px', gap: '1rem' },
  },
} as const;

export type LayoutDensity = keyof typeof LAYOUT_TOKENS.density;
export type LayoutSignature = keyof typeof LAYOUT_TOKENS.signatures;

// ============================================
// TRANSITION TOKENS
// ============================================

export const TRANSITION_TOKENS = {
  moduleSwitch: { duration: '200ms', easing: 'cubic-bezier(0.4, 0, 0.2, 1)' },
  sectionDrill: { duration: '150ms', easing: 'cubic-bezier(0.4, 0, 0.2, 1)' },
  contentReveal: { duration: '300ms', easing: 'cubic-bezier(0, 0, 0.2, 1)' },
} as const;

// ============================================
// IMPACT RATING COLORS
// ============================================

/**
 * Impact rating uses a gradient from cool to warm — NOT stoplight colors.
 * Low impact: cool blue → Mid impact: warm amber → High impact: deep coral → Critical: intense magenta
 */
export const IMPACT_COLORS = {
  1: 'hsl(210, 60%, 55%)', // Cool blue
  2: 'hsl(200, 55%, 50%)',
  3: 'hsl(185, 50%, 48%)',
  4: 'hsl(45, 65%, 50%)',  // Warm amber
  5: 'hsl(35, 70%, 50%)',
  6: 'hsl(25, 75%, 50%)',
  7: 'hsl(15, 80%, 50%)',  // Deep coral
  8: 'hsl(5, 75%, 50%)',
  9: 'hsl(340, 70%, 50%)', // Intense magenta
  10: 'hsl(320, 75%, 45%)',
} as const;

export function getImpactColor(rating: number): string {
  const clamped = Math.max(1, Math.min(10, Math.round(rating)));
  return IMPACT_COLORS[clamped as keyof typeof IMPACT_COLORS];
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get module from URL path
 */
export function getModuleFromPath(path: string): ModuleId | null {
  const segments = path.split('/').filter(Boolean);
  if (segments.length === 0) return 'insights'; // Dashboard is insights

  const firstSegment = segments[0];

  const moduleMap: Record<string, ModuleId> = {
    insights: 'insights',
    transactions: 'transactions',
    performance: 'performance',
    configuration: 'configuration',
    data: 'data',
    acceleration: 'acceleration',
    operations: 'operations',
    approvals: 'approvals',
    reconciliation: 'reconciliation',
    admin: 'admin',
    workforce: 'workforce',
  };

  return moduleMap[firstSegment] || null;
}

/**
 * Get confidence level from numeric score
 */
export function getConfidenceLevel(score: number): ConfidenceLevel {
  if (score >= 85) return 'high';
  if (score >= 60) return 'medium';
  if (score >= 30) return 'low';
  return 'unknown';
}

/**
 * Get progress level from numeric value (0-1)
 */
export function getProgressLevel(value: number): ProgressLevel {
  if (value >= 1) return 'complete';
  if (value >= 0.85) return 'nearComplete';
  if (value > 0) return 'inProgress';
  return 'notStarted';
}
