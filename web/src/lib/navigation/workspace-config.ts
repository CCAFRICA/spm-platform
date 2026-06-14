/**
 * Workspace Configuration — Agent-Navigation Spine (OB-207)
 *
 * The source of truth for navigation. Reorganized around the four Capability-Board
 * agents: three ACTS the user performs through + the always-on Platform Core
 * foundation (resolves CLT-84-F20 metaphor-mix). Grouping only — every route path
 * is unchanged from the prior 4-workspace model (OB-97).
 *
 *   Decide        — performance intelligence (/stream HOME + persona results)
 *   Calculate     — run the engine (cockpit + import + calculate)
 *   Consolidate   — reconcile + the Financial module (committed_data via DS-029)
 *   Platform Core — always-on foundation; Configure lives here
 *
 * /stream is the canonical landing for every persona (Decision 128); the active
 * workspace when on /stream is `decide`.
 */

import type { Workspace, WorkspaceId, WorkspaceSection } from '@/types/navigation';
import type { UserRole } from '@/types/auth';
import { hasCapability } from '@/lib/auth/permissions';

// =============================================================================
// WORKSPACE DEFINITIONS
// =============================================================================

export const WORKSPACES: Record<WorkspaceId, Workspace> = {
  // ── DECIDE — performance intelligence (HOME for every persona) ──
  decide: {
    id: 'decide',
    label: 'Decide',
    labelEs: 'Decidir',
    icon: 'Zap',
    description: 'Performance intelligence and results',
    descriptionEs: 'Inteligencia de rendimiento y resultados',
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
      {
        id: 'results',
        label: 'Results',
        labelEs: 'Resultados',
        routes: [
          { path: '/operate/results', label: 'Results', labelEs: 'Resultados', icon: 'BarChart3', roles: ['platform', 'admin', 'manager'], requiredCapability: 'view.all_results' },
        ],
      },
    ],
  },

  // ── CALCULATE — run the deterministic engine ──
  calculate: {
    id: 'calculate',
    label: 'Calculate',
    labelEs: 'Calcular',
    icon: 'Calculator',
    description: 'Run the current compensation cycle',
    descriptionEs: 'Ejecutar el ciclo de compensación actual',
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
    ],
  },

  // ── CONSOLIDATE — reconcile + the Financial module (committed_data, A.24) ──
  consolidate: {
    id: 'consolidate',
    label: 'Consolidate',
    labelEs: 'Consolidar',
    icon: 'GitCompare',
    description: 'Reconciliation and financial intelligence',
    descriptionEs: 'Conciliación e inteligencia financiera',
    defaultRoute: '/operate/reconciliation',
    accentColor: 'hsl(45, 93%, 47%)', // Gold
    roles: ['platform', 'admin', 'manager', 'sales_rep'],
    sections: [
      {
        id: 'reconciliation',
        label: 'Reconciliation',
        labelEs: 'Conciliación',
        routes: [
          { path: '/operate/reconciliation', label: 'Reconciliation', labelEs: 'Conciliación', icon: 'GitCompare', roles: ['platform', 'admin'], requiredCapability: 'data.reconcile' },
        ],
      },
      {
        id: 'financial-network',
        label: 'Financial',
        labelEs: 'Finanzas',
        featureFlag: 'financial',
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

  // ── PLATFORM CORE — always-on foundation (Configure lives here) ──
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
  // OB-207: /stream is HOME for every persona (Decision 128); it lives under Decide.
  return 'decide';
}

/**
 * Get all routes from a workspace that are accessible to a role.
 * DS-014: capability-based filtering via the single PDP (hasCapability).
 * OB-207 Inc2: optional `enabledFeatures` (the live tenants.features map) drops sections
 * whose featureFlag is not enabled — module gating on the live field (FP-49). When omitted,
 * gating is capability-only (backward-compatible).
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

  // OB-207: explicit path → agent mapping (route paths are unchanged; only grouping moved).
  if (path.startsWith('/stream')) return 'decide';
  if (path.startsWith('/operate/results')) return 'decide';
  if (path.startsWith('/operate/reconciliation')) return 'consolidate';
  if (path.startsWith('/financial')) return 'consolidate';
  if (path.startsWith('/configure')) return 'platform-core';
  if (path.startsWith('/operate')) return 'calculate'; // cockpit, import, calculate
  if (path.startsWith('/perform')) return 'decide';
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
