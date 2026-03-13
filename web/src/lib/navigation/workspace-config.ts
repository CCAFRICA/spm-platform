/**
 * Workspace Configuration — 4 Workspace Model (OB-97)
 *
 * Master configuration for all workspaces, their sections, and route mappings.
 * This is the source of truth for the navigation architecture.
 *
 * Workspaces:
 *   Perform  — See data (READ)
 *   Operate  — Do things (ACT)
 *   Configure — Set up (SETUP)
 *   Financial — Module workspace (MODULE, feature-flagged)
 *
 * Eliminated (OB-97): Investigate → Operate, Design → Configure, Govern → Configure
 */

import type { Workspace, WorkspaceId, WorkspaceSection } from '@/types/navigation';
import type { UserRole } from '@/types/auth';

// =============================================================================
// WORKSPACE DEFINITIONS
// =============================================================================

export const WORKSPACES: Record<WorkspaceId, Workspace> = {
  perform: {
    id: 'perform',
    label: 'Perform',
    labelEs: 'Rendimiento',
    icon: 'TrendingUp',
    description: 'View performance and compensation',
    descriptionEs: 'Ver rendimiento y compensación',
    defaultRoute: '/stream',
    accentColor: 'hsl(142, 76%, 36%)', // Green
    roles: ['platform', 'admin', 'manager', 'sales_rep'],
    sections: [
      {
        id: 'intelligence',
        label: 'Intelligence',
        labelEs: 'Inteligencia',
        routes: [
          { path: '/stream', label: 'Intelligence', labelEs: 'Inteligencia', icon: 'Zap', roles: ['platform', 'admin', 'manager', 'sales_rep'] },
        ],
      },
      {
        id: 'results',
        label: 'Results',
        labelEs: 'Resultados',
        routes: [
          { path: '/operate/results', label: 'Results', labelEs: 'Resultados', icon: 'BarChart3', roles: ['platform', 'admin', 'manager'] },
        ],
      },
    ],
  },

  operate: {
    id: 'operate',
    label: 'Operate',
    labelEs: 'Operar',
    icon: 'Zap',
    description: 'Run the current compensation cycle',
    descriptionEs: 'Ejecutar el ciclo de compensación actual',
    defaultRoute: '/operate',
    accentColor: 'hsl(262, 83%, 58%)', // Purple
    roles: ['platform', 'admin'],
    sections: [
      {
        id: 'overview',
        label: 'Overview',
        labelEs: 'Resumen',
        routes: [
          { path: '/operate', label: 'Operations Overview', labelEs: 'Resumen de Operaciones', icon: 'Activity', roles: ['platform', 'admin'] },
        ],
      },
      {
        id: 'lifecycle',
        label: 'Operations',
        labelEs: 'Operaciones',
        routes: [
          { path: '/operate/lifecycle', label: 'Operations Center', labelEs: 'Centro de Operaciones', icon: 'Zap', roles: ['platform', 'admin'] },
        ],
      },
      {
        id: 'import',
        label: 'Import',
        labelEs: 'Importar',
        routes: [
          { path: '/operate/import/enhanced', label: 'Import Data', labelEs: 'Importar Datos', icon: 'Upload', roles: ['platform', 'admin'] },
          { path: '/operate/import/history', label: 'Import History', labelEs: 'Historial', icon: 'History', roles: ['platform', 'admin'] },
        ],
      },
      {
        id: 'calculate',
        label: 'Calculate',
        labelEs: 'Calcular',
        routes: [
          { path: '/operate/calculate', label: 'Calculate', labelEs: 'Calcular', icon: 'Calculator', roles: ['platform', 'admin'] },
        ],
      },
      {
        id: 'reconciliation',
        label: 'Reconciliation',
        labelEs: 'Conciliación',
        routes: [
          { path: '/operate/reconciliation', label: 'Reconciliation', labelEs: 'Conciliación', icon: 'GitCompare', roles: ['platform', 'admin'] },
        ],
      },
    ],
  },

  configure: {
    id: 'configure',
    label: 'Configure',
    labelEs: 'Configurar',
    icon: 'Settings',
    description: 'Set up and maintain the system',
    descriptionEs: 'Configurar y mantener el sistema',
    defaultRoute: '/configure',
    accentColor: 'hsl(24, 95%, 53%)', // Orange
    roles: ['platform', 'admin'],
    sections: [
      {
        id: 'plans',
        label: 'Plans',
        labelEs: 'Planes',
        routes: [
          { path: '/operate/import/enhanced', label: 'Plan Import', labelEs: 'Importar Plan', icon: 'FileText', roles: ['platform', 'admin'] },
        ],
      },
      {
        id: 'periods',
        label: 'Periods',
        labelEs: 'Períodos',
        routes: [
          { path: '/configure/periods', label: 'Periods', labelEs: 'Períodos', icon: 'Calendar', roles: ['platform', 'admin'] },
        ],
      },
      {
        id: 'people',
        label: 'People',
        labelEs: 'Personas',
        routes: [
          { path: '/configure/people', label: 'Personnel', labelEs: 'Personal', icon: 'Users', roles: ['platform', 'admin'] },
        ],
      },
      {
        id: 'system',
        label: 'System',
        labelEs: 'Sistema',
        routes: [
          { path: '/configure/users', label: 'Users', labelEs: 'Usuarios', icon: 'Shield', roles: ['platform', 'admin'] },
        ],
      },
    ],
  },

  financial: {
    id: 'financial',
    label: 'Financial',
    labelEs: 'Finanzas',
    icon: 'Activity',
    description: 'POS analytics and financial intelligence',
    descriptionEs: 'Analisis POS e inteligencia financiera',
    defaultRoute: '/financial',
    accentColor: 'hsl(45, 93%, 47%)', // Gold
    roles: ['platform', 'admin', 'manager', 'sales_rep'],
    featureFlag: 'financial',
    sections: [
      {
        id: 'network',
        label: 'Network',
        labelEs: 'Red',
        routes: [
          { path: '/financial', label: 'Overview', labelEs: 'Resumen', icon: 'Layers', roles: ['platform', 'admin', 'manager', 'sales_rep'] },
          { path: '/financial/pulse', label: 'Network Pulse', labelEs: 'Pulso de Red', icon: 'Activity', roles: ['platform', 'admin', 'manager', 'sales_rep'] },
        ],
      },
      {
        id: 'analysis',
        label: 'Analysis',
        labelEs: 'Análisis',
        routes: [
          { path: '/financial/timeline', label: 'Revenue Timeline', labelEs: 'Cronología de Ingresos', icon: 'LineChart', roles: ['platform', 'admin', 'manager', 'sales_rep'] },
          { path: '/financial/performance', label: 'Location Benchmarks', labelEs: 'Benchmarks de Ubicación', icon: 'BarChart3', roles: ['platform', 'admin', 'manager', 'sales_rep'] },
          { path: '/financial/staff', label: 'Staff Performance', labelEs: 'Rendimiento de Personal', icon: 'Users', roles: ['platform', 'admin', 'manager', 'sales_rep'] },
          { path: '/financial/patterns', label: 'Operational Patterns', labelEs: 'Patrones Operativos', icon: 'Clock', roles: ['platform', 'admin', 'manager', 'sales_rep'] },
          { path: '/financial/summary', label: 'Monthly Summary', labelEs: 'Resumen Mensual', icon: 'FileText', roles: ['platform', 'admin', 'manager', 'sales_rep'] },
          { path: '/financial/products', label: 'Product Mix', labelEs: 'Mezcla de Productos', icon: 'ShoppingBag', roles: ['platform', 'admin', 'manager', 'sales_rep'] },
        ],
      },
      {
        id: 'controls',
        label: 'Controls',
        labelEs: 'Controles',
        routes: [
          { path: '/financial/leakage', label: 'Leakage Monitor', labelEs: 'Monitor de Fugas', icon: 'ShieldAlert', roles: ['platform', 'admin', 'manager'] },
        ],
      },
    ],
  },
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get workspaces visible to a specific role
 */
export function getWorkspacesForRole(role: UserRole): Workspace[] {
  return Object.values(WORKSPACES).filter(ws => ws.roles.includes(role));
}

/**
 * Get the default workspace for a role
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function getDefaultWorkspaceForRole(role: UserRole): WorkspaceId {
  return 'perform';
}

/**
 * Get all routes from a workspace that are accessible to a role
 */
export function getWorkspaceRoutesForRole(workspaceId: WorkspaceId, role: UserRole): WorkspaceSection[] {
  const workspace = WORKSPACES[workspaceId];
  if (!workspace) return [];

  return workspace.sections.map(section => ({
    ...section,
    routes: section.routes.filter(route => route.roles.includes(role)),
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

  // OB-165: Intelligence Stream → perform workspace
  if (path.startsWith('/stream')) return 'perform';

  // OB-97: Routes under eliminated workspaces → map to new home
  if (path.startsWith('/investigate')) return 'operate';
  if (path.startsWith('/design')) return 'configure';
  if (path.startsWith('/govern')) return 'configure';
  // Admin routes live in operate/configure
  if (path.startsWith('/admin')) return 'operate';

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
