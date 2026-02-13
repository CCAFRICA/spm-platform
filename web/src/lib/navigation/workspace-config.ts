/**
 * Workspace Configuration
 *
 * Master configuration for all workspaces, their sections, and route mappings.
 * This is the source of truth for the navigation architecture.
 */

import type { Workspace, WorkspaceId, WorkspaceSection } from '@/types/navigation';
import type { UserRole } from '@/types/auth';

// =============================================================================
// WORKSPACE DEFINITIONS
// =============================================================================

export const WORKSPACES: Record<WorkspaceId, Workspace> = {
  operate: {
    id: 'operate',
    label: 'Operate',
    labelEs: 'Operar',
    icon: 'Zap',
    description: 'Run the current compensation cycle',
    descriptionEs: 'Ejecutar el ciclo de compensación actual',
    defaultRoute: '/operate',
    accentColor: 'hsl(262, 83%, 58%)', // Purple
    roles: ['vl_admin', 'admin'],
    sections: [
      {
        id: 'import',
        label: 'Import',
        labelEs: 'Importar',
        routes: [
          { path: '/operate/import', label: 'Data Import', labelEs: 'Importar Datos', icon: 'Upload', roles: ['vl_admin', 'admin'] },
          { path: '/operate/import/enhanced', label: 'Enhanced Import', labelEs: 'Importación Avanzada', icon: 'Sparkles', roles: ['vl_admin', 'admin'] },
          { path: '/operate/import/history', label: 'Import History', labelEs: 'Historial de Importación', icon: 'History', roles: ['vl_admin', 'admin'] },
          { path: '/operate/normalization', label: 'Product Normalization', labelEs: 'Normalización de Productos', icon: 'Layers', roles: ['vl_admin', 'admin'] },
        ],
      },
      {
        id: 'calculate',
        label: 'Calculate',
        labelEs: 'Calcular',
        routes: [
          { path: '/operate/calculate', label: 'Run Calculations', labelEs: 'Ejecutar Cálculos', icon: 'Calculator', roles: ['vl_admin', 'admin'] },
          { path: '/operate/results', label: 'Results Dashboard', labelEs: 'Panel de Resultados', icon: 'BarChart3', roles: ['vl_admin', 'admin'] },
          { path: '/operate/calculate/rate-tables', label: 'Rate Tables', labelEs: 'Tablas de Tarifas', icon: 'Table', roles: ['vl_admin', 'admin'] },
          { path: '/operate/calculate/ranges', label: 'Performance Ranges', labelEs: 'Rangos de Rendimiento', icon: 'Sliders', roles: ['vl_admin', 'admin'] },
        ],
      },
      {
        id: 'reconcile',
        label: 'Reconcile',
        labelEs: 'Conciliar',
        routes: [
          { path: '/operate/reconcile', label: 'Reconciliation', labelEs: 'Conciliación', icon: 'GitCompare', roles: ['vl_admin', 'admin'] },
          { path: '/operate/reconcile/mismatches', label: 'Mismatch Review', labelEs: 'Revisión de Diferencias', icon: 'AlertTriangle', roles: ['vl_admin', 'admin'] },
        ],
      },
      {
        id: 'approve',
        label: 'Approve',
        labelEs: 'Aprobar',
        routes: [
          { path: '/operate/approve', label: 'Approval Queue', labelEs: 'Cola de Aprobaciones', icon: 'CheckSquare', roles: ['vl_admin', 'admin'] },
          { path: '/operate/approve/compensation', label: 'Compensation Approvals', labelEs: 'Aprobaciones de Compensación', icon: 'DollarSign', roles: ['vl_admin', 'admin'] },
          { path: '/operate/approve/batch', label: 'Batch Approvals', labelEs: 'Aprobaciones en Lote', icon: 'Layers', roles: ['vl_admin', 'admin'] },
        ],
      },
      {
        id: 'pay',
        label: 'Pay',
        labelEs: 'Pagar',
        routes: [
          { path: '/operate/pay', label: 'Payroll Overview', labelEs: 'Resumen de Nómina', icon: 'Wallet', roles: ['vl_admin', 'admin'] },
          { path: '/operate/pay/calendar', label: 'Payroll Calendar', labelEs: 'Calendario de Nómina', icon: 'Calendar', roles: ['vl_admin', 'admin'] },
          { path: '/operate/pay/cycle', label: 'Payroll Cycle', labelEs: 'Ciclo de Nómina', icon: 'RefreshCw', roles: ['vl_admin', 'admin'] },
        ],
      },
      {
        id: 'monitor',
        label: 'Monitor',
        labelEs: 'Monitorear',
        routes: [
          { path: '/operate/monitor/operations', label: 'Daily Operations', labelEs: 'Operaciones Diarias', icon: 'Activity', roles: ['vl_admin', 'admin'] },
          { path: '/operate/monitor/readiness', label: 'Data Readiness', labelEs: 'Preparación de Datos', icon: 'Database', roles: ['vl_admin', 'admin'] },
          { path: '/operate/monitor/quality', label: 'Data Quality', labelEs: 'Calidad de Datos', icon: 'ShieldCheck', roles: ['vl_admin', 'admin'] },
        ],
      },
    ],
  },

  perform: {
    id: 'perform',
    label: 'Perform',
    labelEs: 'Rendimiento',
    icon: 'TrendingUp',
    description: 'View performance and compensation',
    descriptionEs: 'Ver rendimiento y compensación',
    defaultRoute: '/perform',
    accentColor: 'hsl(142, 76%, 36%)', // Green
    roles: ['vl_admin', 'admin', 'manager', 'sales_rep'],
    sections: [
      {
        id: 'dashboard',
        label: 'Dashboard',
        labelEs: 'Panel',
        routes: [
          { path: '/perform', label: 'Overview', labelEs: 'Resumen', icon: 'LayoutDashboard', roles: ['vl_admin', 'admin', 'manager', 'sales_rep'] },
          { path: '/perform/dashboard', label: 'Performance Dashboard', labelEs: 'Panel de Rendimiento', icon: 'BarChart3', roles: ['vl_admin', 'admin', 'manager', 'sales_rep'] },
        ],
      },
      {
        id: 'compensation',
        label: 'My Compensation',
        labelEs: 'Mi Compensación',
        routes: [
          { path: '/perform/compensation', label: 'My Compensation', labelEs: 'Mi Compensación', icon: 'Wallet', roles: ['vl_admin', 'admin', 'manager', 'sales_rep'] },
          { path: '/perform/statement', label: 'Statement', labelEs: 'Estado de Cuenta', icon: 'FileText', roles: ['vl_admin', 'admin', 'manager', 'sales_rep'] },
        ],
      },
      {
        id: 'transactions',
        label: 'Transactions',
        labelEs: 'Transacciones',
        routes: [
          { path: '/perform/transactions', label: 'My Transactions', labelEs: 'Mis Transacciones', icon: 'Receipt', roles: ['vl_admin', 'admin', 'manager', 'sales_rep'] },
          { path: '/perform/transactions/find', label: 'Find Transaction', labelEs: 'Buscar Transacción', icon: 'Search', roles: ['vl_admin', 'admin', 'manager', 'sales_rep'] },
        ],
      },
      {
        id: 'team',
        label: 'Team',
        labelEs: 'Equipo',
        routes: [
          { path: '/perform/team', label: 'Team Performance', labelEs: 'Rendimiento del Equipo', icon: 'Users', roles: ['vl_admin', 'admin', 'manager'] },
          { path: '/perform/team/rankings', label: 'Rankings', labelEs: 'Clasificaciones', icon: 'Trophy', roles: ['vl_admin', 'admin', 'manager'] },
        ],
      },
      {
        id: 'trends',
        label: 'Trends',
        labelEs: 'Tendencias',
        routes: [
          { path: '/perform/trends', label: 'Performance Trends', labelEs: 'Tendencias de Rendimiento', icon: 'LineChart', roles: ['vl_admin', 'admin', 'manager', 'sales_rep'] },
          { path: '/perform/trends/analytics', label: 'Analytics', labelEs: 'Análisis', icon: 'PieChart', roles: ['vl_admin', 'admin', 'manager'] },
        ],
      },
      {
        id: 'inquiries',
        label: 'Inquiries',
        labelEs: 'Consultas',
        routes: [
          { path: '/perform/inquiries', label: 'My Inquiries', labelEs: 'Mis Consultas', icon: 'HelpCircle', roles: ['vl_admin', 'admin', 'manager', 'sales_rep'] },
          { path: '/perform/inquiries/new', label: 'Submit Inquiry', labelEs: 'Enviar Consulta', icon: 'PlusCircle', roles: ['vl_admin', 'admin', 'manager', 'sales_rep'] },
        ],
      },
    ],
  },

  investigate: {
    id: 'investigate',
    label: 'Investigate',
    labelEs: 'Investigar',
    icon: 'Search',
    description: 'Drill into data and trace issues',
    descriptionEs: 'Profundizar en datos y rastrear problemas',
    defaultRoute: '/investigate',
    accentColor: 'hsl(199, 89%, 48%)', // Blue
    roles: ['vl_admin', 'admin', 'manager'],
    sections: [
      {
        id: 'search',
        label: 'Search',
        labelEs: 'Buscar',
        routes: [
          { path: '/investigate', label: 'Search Center', labelEs: 'Centro de Búsqueda', icon: 'Search', roles: ['vl_admin', 'admin', 'manager'] },
        ],
      },
      {
        id: 'transactions',
        label: 'Transactions',
        labelEs: 'Transacciones',
        routes: [
          { path: '/investigate/transactions', label: 'Transaction Search', labelEs: 'Buscar Transacciones', icon: 'Receipt', roles: ['vl_admin', 'admin', 'manager'] },
        ],
      },
      {
        id: 'employees',
        label: 'Employees',
        labelEs: 'Empleados',
        routes: [
          { path: '/investigate/employees', label: 'Employee Lookup', labelEs: 'Buscar Empleado', icon: 'User', roles: ['vl_admin', 'admin', 'manager'] },
          { path: '/investigate/employees/history', label: 'Assignment History', labelEs: 'Historial de Asignaciones', icon: 'History', roles: ['vl_admin', 'admin'] },
        ],
      },
      {
        id: 'calculations',
        label: 'Calculations',
        labelEs: 'Cálculos',
        routes: [
          { path: '/investigate/calculations', label: 'Calculation Detail', labelEs: 'Detalle de Cálculo', icon: 'Calculator', roles: ['vl_admin', 'admin'] },
          { path: '/investigate/calculations/breakdown', label: 'Step Breakdown', labelEs: 'Desglose de Pasos', icon: 'GitBranch', roles: ['vl_admin', 'admin'] },
        ],
      },
      {
        id: 'audit',
        label: 'Audit Trail',
        labelEs: 'Rastro de Auditoría',
        routes: [
          { path: '/investigate/audit', label: 'Change Log', labelEs: 'Registro de Cambios', icon: 'FileSearch', roles: ['vl_admin', 'admin'] },
          { path: '/investigate/audit/approvals', label: 'Approval History', labelEs: 'Historial de Aprobaciones', icon: 'ClipboardCheck', roles: ['vl_admin', 'admin'] },
        ],
      },
      {
        id: 'disputes',
        label: 'Disputes',
        labelEs: 'Disputas',
        routes: [
          { path: '/investigate/disputes', label: 'Dispute Queue', labelEs: 'Cola de Disputas', icon: 'MessageCircle', roles: ['vl_admin', 'admin', 'manager'] },
          { path: '/investigate/disputes/history', label: 'Resolution History', labelEs: 'Historial de Resoluciones', icon: 'CheckCircle', roles: ['vl_admin', 'admin'] },
        ],
      },
      {
        id: 'adjustments',
        label: 'Adjustments',
        labelEs: 'Ajustes',
        routes: [
          { path: '/investigate/adjustments', label: 'Adjustments', labelEs: 'Ajustes', icon: 'Edit', roles: ['vl_admin', 'admin'] },
          { path: '/investigate/adjustments/history', label: 'Adjustment History', labelEs: 'Historial de Ajustes', icon: 'History', roles: ['vl_admin', 'admin'] },
        ],
      },
      {
        id: 'forensics',
        label: 'Forensics',
        labelEs: 'Forense',
        routes: [
          { path: '/investigate/reconciliation', label: 'Reconciliation Studio', labelEs: 'Estudio de Conciliación', icon: 'GitCompare', roles: ['vl_admin', 'admin'] },
          { path: '/investigate/plan-validation', label: 'Plan Validation', labelEs: 'Validación del Plan', icon: 'ShieldCheck', roles: ['vl_admin', 'admin'] },
        ],
      },
    ],
  },

  design: {
    id: 'design',
    label: 'Design',
    labelEs: 'Diseñar',
    icon: 'Palette',
    description: 'Build and modify compensation rules',
    descriptionEs: 'Crear y modificar reglas de compensación',
    defaultRoute: '/design',
    accentColor: 'hsl(328, 85%, 46%)', // Pink
    roles: ['vl_admin', 'admin'],
    sections: [
      {
        id: 'plans',
        label: 'Plans',
        labelEs: 'Planes',
        routes: [
          { path: '/design/plans', label: 'Plan Management', labelEs: 'Gestión de Planes', icon: 'FileText', roles: ['vl_admin', 'admin'] },
          { path: '/design/plans/new', label: 'Create Plan', labelEs: 'Crear Plan', icon: 'PlusCircle', roles: ['vl_admin', 'admin'] },
        ],
      },
      {
        id: 'incentives',
        label: 'Incentives',
        labelEs: 'Incentivos',
        routes: [
          { path: '/design/incentives', label: 'Incentive Builder', labelEs: 'Constructor de Incentivos', icon: 'Sparkles', roles: ['vl_admin', 'admin'] },
          { path: '/design/incentives/campaigns', label: 'Campaigns', labelEs: 'Campañas', icon: 'Target', roles: ['vl_admin', 'admin'] },
        ],
      },
      {
        id: 'goals',
        label: 'Goals',
        labelEs: 'Metas',
        routes: [
          { path: '/design/goals', label: 'Goal Setting', labelEs: 'Establecer Metas', icon: 'Target', roles: ['vl_admin', 'admin'] },
          { path: '/design/goals/templates', label: 'Goal Templates', labelEs: 'Plantillas de Metas', icon: 'Copy', roles: ['vl_admin', 'admin'] },
        ],
      },
      {
        id: 'modeling',
        label: 'Modeling',
        labelEs: 'Modelado',
        routes: [
          { path: '/design/modeling', label: 'Sandbox', labelEs: 'Sandbox', icon: 'FlaskConical', roles: ['vl_admin', 'admin'] },
          { path: '/design/modeling/scenarios', label: 'Scenario Comparison', labelEs: 'Comparación de Escenarios', icon: 'GitCompare', roles: ['vl_admin', 'admin'] },
        ],
      },
      {
        id: 'budget',
        label: 'Budget',
        labelEs: 'Presupuesto',
        routes: [
          { path: '/design/budget', label: 'Budget Planning', labelEs: 'Planificación de Presupuesto', icon: 'Wallet', roles: ['vl_admin', 'admin'] },
          { path: '/design/budget/projections', label: 'Projections', labelEs: 'Proyecciones', icon: 'TrendingUp', roles: ['vl_admin', 'admin'] },
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
    roles: ['vl_admin', 'admin'],
    sections: [
      {
        id: 'people',
        label: 'People',
        labelEs: 'Personas',
        routes: [
          { path: '/configure/people', label: 'Personnel', labelEs: 'Personal', icon: 'Users', roles: ['vl_admin', 'admin'] },
          { path: '/configure/people/roles', label: 'Roles & Permissions', labelEs: 'Roles y Permisos', icon: 'Shield', roles: ['vl_admin', 'admin'] },
        ],
      },
      {
        id: 'organization',
        label: 'Organization',
        labelEs: 'Organización',
        routes: [
          { path: '/configure/organization/teams', label: 'Teams', labelEs: 'Equipos', icon: 'Users', roles: ['vl_admin', 'admin'] },
          { path: '/configure/organization/locations', label: 'Locations', labelEs: 'Ubicaciones', icon: 'MapPin', roles: ['vl_admin', 'admin'] },
          { path: '/configure/organization/hierarchy', label: 'Hierarchy', labelEs: 'Jerarquía', icon: 'Network', roles: ['vl_admin', 'admin'] },
        ],
      },
      {
        id: 'periods',
        label: 'Periods',
        labelEs: 'Períodos',
        routes: [
          { path: '/configure/periods', label: 'Payroll Periods', labelEs: 'Períodos de Nómina', icon: 'Calendar', roles: ['vl_admin', 'admin'] },
          { path: '/configure/periods/lifecycle', label: 'Period Lifecycle', labelEs: 'Ciclo de Vida del Período', icon: 'RefreshCw', roles: ['vl_admin', 'admin'] },
        ],
      },
      {
        id: 'data-specs',
        label: 'Data Specs',
        labelEs: 'Especificaciones de Datos',
        routes: [
          { path: '/configure/data-specs', label: 'Field Requirements', labelEs: 'Requisitos de Campos', icon: 'FileSpreadsheet', roles: ['vl_admin', 'admin'] },
          { path: '/configure/data-specs/templates', label: 'Import Templates', labelEs: 'Plantillas de Importación', icon: 'FileDown', roles: ['vl_admin', 'admin'] },
        ],
      },
      {
        id: 'system',
        label: 'System',
        labelEs: 'Sistema',
        routes: [
          { path: '/configure/system', label: 'Tenant Settings', labelEs: 'Configuración del Tenant', icon: 'Settings', roles: ['vl_admin', 'admin'] },
          { path: '/configure/system/terminology', label: 'Terminology', labelEs: 'Terminología', icon: 'Languages', roles: ['vl_admin', 'admin'] },
          { path: '/configure/system/integrations', label: 'Integrations', labelEs: 'Integraciones', icon: 'Plug', roles: ['vl_admin', 'admin'] },
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
    roles: ['vl_admin', 'admin', 'manager'],
    featureFlag: 'financial',
    sections: [
      {
        id: 'network',
        label: 'Network',
        labelEs: 'Red',
        routes: [
          { path: '/financial', label: 'Network Pulse', labelEs: 'Pulso de Red', icon: 'Activity', roles: ['vl_admin', 'admin', 'manager'] },
        ],
      },
      {
        id: 'analysis',
        label: 'Analysis',
        labelEs: 'Analisis',
        routes: [
          { path: '/financial/timeline', label: 'Revenue Timeline', labelEs: 'Cronologia de Ingresos', icon: 'LineChart', roles: ['vl_admin', 'admin', 'manager'] },
          { path: '/financial/performance', label: 'Location Benchmarks', labelEs: 'Benchmarks de Ubicacion', icon: 'BarChart3', roles: ['vl_admin', 'admin', 'manager'] },
          { path: '/financial/staff', label: 'Staff Performance', labelEs: 'Rendimiento de Personal', icon: 'Users', roles: ['vl_admin', 'admin', 'manager'] },
        ],
      },
      {
        id: 'controls',
        label: 'Controls',
        labelEs: 'Controles',
        routes: [
          { path: '/financial/leakage', label: 'Leakage Monitor', labelEs: 'Monitor de Fugas', icon: 'ShieldAlert', roles: ['vl_admin', 'admin'] },
        ],
      },
    ],
  },

  govern: {
    id: 'govern',
    label: 'Govern',
    labelEs: 'Gobernar',
    icon: 'Shield',
    description: 'Compliance and oversight',
    descriptionEs: 'Cumplimiento y supervisión',
    defaultRoute: '/govern',
    accentColor: 'hsl(220, 70%, 50%)', // Navy
    roles: ['vl_admin', 'admin', 'manager'],
    sections: [
      {
        id: 'audit-reports',
        label: 'Audit Reports',
        labelEs: 'Informes de Auditoría',
        routes: [
          { path: '/govern/audit-reports', label: 'Audit Reports', labelEs: 'Informes de Auditoría', icon: 'FileSearch', roles: ['vl_admin', 'admin'] },
          { path: '/govern/audit-reports/download', label: 'Download Reports', labelEs: 'Descargar Informes', icon: 'Download', roles: ['vl_admin', 'admin'] },
        ],
      },
      {
        id: 'data-lineage',
        label: 'Data Lineage',
        labelEs: 'Linaje de Datos',
        routes: [
          { path: '/govern/data-lineage', label: 'Data Traceability', labelEs: 'Trazabilidad de Datos', icon: 'GitBranch', roles: ['vl_admin', 'admin'] },
        ],
      },
      {
        id: 'approvals',
        label: 'Approvals',
        labelEs: 'Aprobaciones',
        routes: [
          { path: '/govern/calculation-approvals', label: 'Calculation Approvals', labelEs: 'Aprobaciones de Cálculo', icon: 'ShieldCheck', roles: ['vl_admin', 'admin'] },
          { path: '/govern/approvals', label: 'Approval History', labelEs: 'Historial de Aprobaciones', icon: 'CheckCircle', roles: ['vl_admin', 'admin', 'manager'] },
          { path: '/govern/approvals/routing', label: 'Routing Audit', labelEs: 'Auditoría de Enrutamiento', icon: 'Route', roles: ['vl_admin', 'admin'] },
        ],
      },
      {
        id: 'reconciliation',
        label: 'Reconciliation',
        labelEs: 'Conciliación',
        routes: [
          { path: '/govern/reconciliation', label: 'Reconciliation History', labelEs: 'Historial de Conciliación', icon: 'GitCompare', roles: ['vl_admin', 'admin'] },
          { path: '/govern/reconciliation/variances', label: 'Variance Reports', labelEs: 'Informes de Varianza', icon: 'BarChart', roles: ['vl_admin', 'admin'] },
        ],
      },
      {
        id: 'access',
        label: 'Access',
        labelEs: 'Acceso',
        routes: [
          { path: '/govern/access', label: 'Access Logs', labelEs: 'Registros de Acceso', icon: 'Key', roles: ['vl_admin', 'admin'] },
          { path: '/govern/access/permissions', label: 'Permission Audit', labelEs: 'Auditoría de Permisos', icon: 'Shield', roles: ['vl_admin', 'admin'] },
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
export function getDefaultWorkspaceForRole(role: UserRole): WorkspaceId {
  switch (role) {
    case 'vl_admin':
    case 'admin':
      return 'operate';
    case 'manager':
      return 'perform';
    case 'sales_rep':
      return 'perform';
    default:
      return 'perform';
  }
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
