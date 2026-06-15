/**
 * Workspace Configuration — Agent-Governed Navigation (OB-211 Phase A)
 *
 * The source of truth for navigation, governed by the four capability-map AGENTS. The
 * user-facing identity is the agent (label); internal IDs are retained for minimal blast
 * radius (SR-34). Grouping only — every route path is unchanged.
 *
 *   Performance (decide)   — performance intelligence (/stream HOME + persona surfaces)
 *   Calculation (calculate)— run the engine, reconcile, sign off, results, export
 *   Finance (finance)      — LICENSABLE agent: the Financial module, gated per tenant via
 *                            tenants.features (a non-Finance tenant never sees it)
 *   Platform Core          — always-on foundation; Configure (periods/people/users) lives here
 *
 * "Consolidate" (OB-207's false three-verb peer) is REMOVED: reconciliation → Calculation,
 * financial → the Finance agent. /operate/results → Calculation (the sign-off→export flow).
 * /stream is the canonical landing for every persona (Decision 128); its workspace is `decide`.
 */

import type { Workspace, WorkspaceId, WorkspaceSection } from '@/types/navigation';
import type { UserRole } from '@/types/auth';
import { hasCapability } from '@/lib/auth/permissions';

// =============================================================================
// WORKSPACE DEFINITIONS (agent-governed)
// =============================================================================

export const WORKSPACES: Record<WorkspaceId, Workspace> = {
  // ── PERFORMANCE (decide) — performance intelligence (HOME for every persona) ──
  decide: {
    id: 'decide',
    label: 'Performance',
    labelEs: 'Rendimiento',
    icon: 'Zap',
    description: 'Performance intelligence — see, benchmark, act',
    descriptionEs: 'Inteligencia de rendimiento — ver, comparar, actuar',
    defaultRoute: '/stream',
    accentColor: 'hsl(239, 84%, 67%)', // Indigo
    roles: ['platform', 'admin', 'manager', 'sales_rep'],
    sections: [
      {
        id: 'intelligence',
        label: 'Intelligence',
        labelEs: 'Inteligencia',
        routes: [
          { path: '/stream', label: 'Intelligence', labelEs: 'Inteligencia', icon: 'Zap', roles: ['platform', 'admin', 'manager', 'sales_rep'], requiredCapability: 'view.intelligence_stream' },
        ],
      },
    ],
  },

  // ── CALCULATION (calculate) — run the engine; reconcile; sign off; results; export ──
  calculate: {
    id: 'calculate',
    label: 'Calculation',
    labelEs: 'Cálculo',
    icon: 'Calculator',
    description: 'Run the engine, reconcile, sign off, and export results',
    descriptionEs: 'Ejecutar el motor, conciliar, aprobar y exportar resultados',
    defaultRoute: '/operate',
    accentColor: 'hsl(262, 83%, 58%)', // Purple
    roles: ['platform', 'admin'],
    sections: [
      {
        id: 'cockpit',
        label: 'Lifecycle',
        labelEs: 'Ciclo de Vida',
        routes: [
          { path: '/operate', label: 'Lifecycle Cockpit', labelEs: 'Cabina del Ciclo', icon: 'Activity', roles: ['platform', 'admin'], requiredCapability: 'data.import' },
          { path: '/operate/lifecycle', label: 'Operations Center', labelEs: 'Centro de Operaciones', icon: 'Zap', roles: ['platform', 'admin'], requiredCapability: 'data.advance_lifecycle' },
        ],
      },
      {
        id: 'import',
        label: 'Import',
        labelEs: 'Importar',
        routes: [
          { path: '/operate/import', label: 'Import Data', labelEs: 'Importar Datos', icon: 'Upload', roles: ['platform', 'admin'], requiredCapability: 'data.import' },
          { path: '/operate/import/history', label: 'Import History', labelEs: 'Historial', icon: 'History', roles: ['platform', 'admin'], requiredCapability: 'data.import' },
        ],
      },
      {
        id: 'calculate',
        label: 'Calculate',
        labelEs: 'Calcular',
        routes: [
          { path: '/operate/calculate', label: 'Calculate', labelEs: 'Calcular', icon: 'Calculator', roles: ['platform', 'admin'], requiredCapability: 'data.calculate' },
        ],
      },
      // OB-211 Phase A: Results moved here (decide→Calculation) — the sign-off context that leads to export.
      {
        id: 'results',
        label: 'Results',
        labelEs: 'Resultados',
        routes: [
          { path: '/operate/results', label: 'Results', labelEs: 'Resultados', icon: 'BarChart3', roles: ['platform', 'admin', 'manager'], requiredCapability: 'view.all_results' },
        ],
      },
      // OB-211 Phase A: Reconciliation moved here (consolidate→Calculation).
      {
        id: 'reconciliation',
        label: 'Reconciliation',
        labelEs: 'Conciliación',
        routes: [
          { path: '/operate/reconciliation', label: 'Reconciliation', labelEs: 'Conciliación', icon: 'GitCompare', roles: ['platform', 'admin'], requiredCapability: 'data.reconcile' },
        ],
      },
    ],
  },

  // ── FINANCE (finance) — LICENSABLE agent; gated per tenant via tenants.features ──
  finance: {
    id: 'finance',
    label: 'Finance',
    labelEs: 'Finanzas',
    icon: 'Layers',
    description: 'Financial intelligence — licensed module',
    descriptionEs: 'Inteligencia financiera — módulo licenciado',
    defaultRoute: '/financial',
    accentColor: 'hsl(45, 93%, 47%)', // Gold
    // OB-211 Phase A: WORKSPACE-level gate — ChromeSidebar (the existing ws.featureFlag check)
    // drops the WHOLE Finance agent for a tenant without the feature (the menu reflection of
    // WS7-A's route gate). A non-Finance tenant never sees Finance in the nav.
    featureFlag: 'financial',
    roles: ['platform', 'admin', 'manager', 'sales_rep'],
    sections: [
      {
        id: 'financial-network',
        label: 'Financial',
        labelEs: 'Finanzas',
        routes: [
          { path: '/financial', label: 'Overview', labelEs: 'Resumen', icon: 'Layers', roles: ['platform', 'admin', 'manager', 'sales_rep'] },
          { path: '/financial/pulse', label: 'Network Pulse', labelEs: 'Pulso de Red', icon: 'Activity', roles: ['platform', 'admin', 'manager', 'sales_rep'] },
          { path: '/financial/timeline', label: 'Revenue Timeline', labelEs: 'Cronología de Ingresos', icon: 'LineChart', roles: ['platform', 'admin', 'manager', 'sales_rep'] },
          { path: '/financial/performance', label: 'Location Benchmarks', labelEs: 'Benchmarks de Ubicación', icon: 'BarChart3', roles: ['platform', 'admin', 'manager', 'sales_rep'] },
          { path: '/financial/staff', label: 'Staff Performance', labelEs: 'Rendimiento de Personal', icon: 'Users', roles: ['platform', 'admin', 'manager', 'sales_rep'] },
          { path: '/financial/leakage', label: 'Leakage Monitor', labelEs: 'Monitor de Fugas', icon: 'ShieldAlert', roles: ['platform', 'admin', 'manager'] },
        ],
      },
    ],
  },

  // ── PLATFORM CORE — always-on substrate (Configure-as-settings lives here) ──
  'platform-core': {
    id: 'platform-core',
    label: 'Platform Core',
    labelEs: 'Núcleo de Plataforma',
    icon: 'Settings',
    description: 'Foundation — configure and maintain the system',
    descriptionEs: 'Fundamento — configurar y mantener el sistema',
    defaultRoute: '/configure/periods',
    accentColor: 'hsl(215, 16%, 47%)', // Slate
    roles: ['platform', 'admin'],
    sections: [
      {
        id: 'periods',
        label: 'Periods',
        labelEs: 'Períodos',
        routes: [
          { path: '/configure/periods', label: 'Periods', labelEs: 'Períodos', icon: 'Calendar', roles: ['platform', 'admin'], requiredCapability: 'tenant.configure_periods' },
        ],
      },
      {
        id: 'people',
        label: 'People',
        labelEs: 'Personas',
        routes: [
          { path: '/configure/people', label: 'Personnel', labelEs: 'Personal', icon: 'Users', roles: ['platform', 'admin'], requiredCapability: 'view.all_entities' },
        ],
      },
      {
        id: 'system',
        label: 'System',
        labelEs: 'Sistema',
        routes: [
          { path: '/configure/users', label: 'Users', labelEs: 'Usuarios', icon: 'Shield', roles: ['platform', 'admin'], requiredCapability: 'tenant.manage_users' },
        ],
      },
    ],
  },
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get workspaces visible to a specific role.
 * DS-014: Uses hasCapability for capability-based filtering with role alias support.
 */
export function getWorkspacesForRole(role: UserRole): Workspace[] {
  return Object.values(WORKSPACES).filter(ws => {
    // If any route in the workspace has a requiredCapability, check via permissions.ts
    const firstCapability = ws.sections.flatMap(s => s.routes).find(r => r.requiredCapability)?.requiredCapability;
    if (firstCapability) {
      return hasCapability(role, firstCapability);
    }
    // Fallback to legacy roles check
    return ws.roles.includes(role);
  });
}

/**
 * Get the default workspace for a role
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function getDefaultWorkspaceForRole(role: UserRole): WorkspaceId {
  // /stream is HOME for every persona (Decision 128); it lives under Performance (decide).
  return 'decide';
}

/**
 * Get all routes from a workspace that are accessible to a role.
 * DS-014: capability-based filtering via the single PDP (hasCapability).
 * OB-207 Inc2: optional `enabledFeatures` (the live tenants.features map) drops sections
 * whose featureFlag is not enabled — module gating on the live field (FP-49). When omitted,
 * gating is capability-only (backward-compatible). NOTE (OB-211 Phase A): the Finance agent
 * is gated at the WORKSPACE level (ChromeSidebar's ws.featureFlag check), so the whole agent
 * drops for a non-Finance tenant regardless of this section-level path.
 */
export function getWorkspaceRoutesForRole(
  workspaceId: WorkspaceId,
  role: UserRole,
  enabledFeatures?: Record<string, boolean>,
): WorkspaceSection[] {
  const workspace = WORKSPACES[workspaceId];
  if (!workspace) return [];

  return workspace.sections
    .filter(section => {
      if (!section.featureFlag) return true;        // not module-gated
      if (!enabledFeatures) return true;            // caller didn't supply features → capability-only
      return !!enabledFeatures[section.featureFlag]; // module gated on the live tenant feature
    })
    .map(section => ({
      ...section,
      routes: section.routes.filter(route => {
        if (route.requiredCapability) {
          return hasCapability(role, route.requiredCapability);
        }
        return route.roles.includes(role);
      }),
    })).filter(section => section.routes.length > 0);
}

/**
 * Find which workspace a route belongs to
 */
export function getWorkspaceForRoute(path: string): WorkspaceId | null {
  for (const workspace of Object.values(WORKSPACES)) {
    for (const section of workspace.sections) {
      for (const route of section.routes) {
        if (path === route.path || path.startsWith(route.path + '/')) {
          return workspace.id;
        }
      }
    }
    // Check if path starts with workspace default route
    if (path.startsWith(`/${workspace.id}`)) {
      return workspace.id;
    }
  }

  // OB-211 Phase A: explicit path → agent mapping (route paths unchanged; only grouping moved).
  if (path.startsWith('/stream')) return 'decide';                          // Performance
  if (path.startsWith('/operate/results')) return 'calculate';             // → Calculation (sign-off→export)
  if (path.startsWith('/operate/reconciliation')) return 'calculate';      // → Calculation
  if (path.startsWith('/financial')) return 'finance';                     // → the licensable Finance agent
  if (path.startsWith('/configure')) return 'platform-core';
  if (path.startsWith('/operate')) return 'calculate';                     // cockpit, import, calculate
  if (path.startsWith('/perform')) return 'decide';                        // Performance
  // Legacy/eliminated route prefixes → nearest agent.
  if (path.startsWith('/investigate')) return 'calculate';
  if (path.startsWith('/design')) return 'platform-core';
  if (path.startsWith('/govern')) return 'platform-core';
  if (path.startsWith('/admin')) return 'platform-core';

  return null;
}

/**
 * Get flat list of all routes for command palette search
 */
export function getAllRoutes(): Array<{ workspace: WorkspaceId; section: string; route: { path: string; label: string; labelEs: string; icon: string } }> {
  const routes: Array<{ workspace: WorkspaceId; section: string; route: { path: string; label: string; labelEs: string; icon: string } }> = [];

  for (const workspace of Object.values(WORKSPACES)) {
    for (const section of workspace.sections) {
      for (const route of section.routes) {
        routes.push({
          workspace: workspace.id,
          section: section.label,
          route: {
            path: route.path,
            label: route.label,
            labelEs: route.labelEs,
            icon: route.icon,
          },
        });
      }
    }
  }

  return routes;
}
