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
import { PRISM_FEATURE_KEY } from '@/lib/prism/capability';

// OB-250: the Data-Operations workspace label — a single configurable string (NOT "PRISM", which
// stays internal). Change here to relabel everywhere the workspace is named.
export const DATA_OPERATIONS_LABEL = 'Data Operations';
export const DATA_OPERATIONS_LABEL_ES = 'Operaciones de Datos';

// =============================================================================
// WORKSPACE DEFINITIONS (agent-governed)
// =============================================================================

export const WORKSPACES: Record<WorkspaceId, Workspace> = {
  // ── INTELLIGENCE (decide) — performance intelligence (HOME for every persona) ──
  // OB-234 T1-A: agent rename Performance → Intelligence (experiential only; route paths,
  // `calculation_results`, and /api/calculation/* are unchanged — SR-34 minimal blast radius).
  decide: {
    id: 'decide',
    label: 'Intelligence',
    labelEs: 'Inteligencia',
    icon: 'Zap',
    description: 'Performance intelligence — see, benchmark, act',
    descriptionEs: 'Inteligencia de rendimiento — ver, comparar, actuar',
    defaultRoute: '/stream',
    accentColor: 'hsl(239, 84%, 67%)', // Indigo
    roles: ['platform', 'admin', 'manager', 'sales_rep'],
    sections: [
      {
        id: 'dashboards',
        label: 'Dashboards',
        labelEs: 'Tableros',
        routes: [
          { path: '/stream', label: 'Intelligence', labelEs: 'Inteligencia', icon: 'Zap', roles: ['platform', 'admin', 'manager', 'sales_rep'], requiredCapability: 'view.intelligence_stream' },
          { path: '/perform', label: 'Performance Overview', labelEs: 'Resumen de Rendimiento', icon: 'Gauge', roles: ['platform', 'admin', 'manager', 'sales_rep'], requiredCapability: 'view.own_results' },
        ],
      },
      // OB-213 Phase 1 / OB-322 O-1: Insights suite — exactly five sub-pages. My Team and
      // Sales & Finance were removed (their routes redirect to /insights). OB-322 O-8: the
      // "Performance" sub-page is retitled "Attainment" to disambiguate from the agent name.
      {
        id: 'insights',
        label: 'Insights',
        labelEs: 'Perspectivas',
        routes: [
          { path: '/insights', label: 'Overview', labelEs: 'Resumen', icon: 'Lightbulb', roles: ['platform', 'admin', 'manager', 'sales_rep'], requiredCapability: 'view.team_results' },
          { path: '/insights/analytics', label: 'Analytics', labelEs: 'Analítica', icon: 'BarChart3', roles: ['platform', 'admin', 'manager', 'sales_rep'], requiredCapability: 'view.team_results' },
          { path: '/insights/performance', label: 'Attainment', labelEs: 'Cumplimiento', icon: 'TrendingUp', roles: ['platform', 'admin', 'manager', 'sales_rep'], requiredCapability: 'view.team_results' },
          { path: '/insights/compensation', label: 'Compensation', labelEs: 'Compensación', icon: 'DollarSign', roles: ['platform', 'admin', 'manager', 'sales_rep'], requiredCapability: 'view.team_results' },
          { path: '/insights/trends', label: 'Trends', labelEs: 'Tendencias', icon: 'LineChart', roles: ['platform', 'admin', 'manager', 'sales_rep'], requiredCapability: 'view.team_results' },
        ],
      },
      // OB-213 Phase 1: Acceleration (KEEP).
      {
        id: 'acceleration',
        label: 'Acceleration',
        labelEs: 'Aceleración',
        routes: [
          { path: '/acceleration', label: 'Accelerator Participants', labelEs: 'Participantes', icon: 'Rocket', roles: ['platform', 'admin', 'manager'], requiredCapability: 'view.team_results' },
        ],
      },
    ],
  },

  // ── COMPENSATION (calculate) — run the engine; reconcile; sign off; results; export ──
  // OB-234 T1-A: agent rename Calculation → Compensation (experiential only; the `calculate`
  // workspace id, route paths, and /api/calculation/* are unchanged — SR-34 minimal blast radius).
  calculate: {
    id: 'calculate',
    label: 'Compensation',
    labelEs: 'Compensación',
    icon: 'Calculator',
    description: 'Run the engine, reconcile, sign off, and export results',
    descriptionEs: 'Ejecutar el motor, conciliar, aprobar y exportar resultados',
    defaultRoute: '/operate',
    accentColor: 'hsl(262, 83%, 58%)', // Purple
    roles: ['platform', 'admin'],
    sections: [
      // HF-332: Plans & Canvas relocated here from Platform Core > Configure. The Living Plan
      // Surface (OB-228) is meaningful only to viewers entitled to the Calculate agent; the menu
      // visibility now matches the route's own `icm.configure_plans` gate (capability-filtered by
      // getWorkspaceRoutesForRole). Route path unchanged (/configure/plans) — DD-7 reachability.
      {
        id: 'plans',
        label: 'Plans & Canvas',
        labelEs: 'Planes y Lienzo',
        routes: [
          { path: '/configure/plans', label: 'Plans & Canvas', labelEs: 'Planes y Lienzo', icon: 'LayoutGrid', roles: ['platform', 'admin'], requiredCapability: 'icm.configure_plans' },
        ],
      },
      {
        id: 'cockpit',
        label: 'Lifecycle',
        labelEs: 'Ciclo de Vida',
        routes: [
          { path: '/operate', label: 'Lifecycle Cockpit', labelEs: 'Cabina del Ciclo', icon: 'Activity', roles: ['platform', 'admin'], requiredCapability: 'data.import' },
          { path: '/operate/lifecycle', label: 'Operations Center', labelEs: 'Centro de Operaciones', icon: 'Zap', roles: ['platform', 'admin'], requiredCapability: 'data.advance_lifecycle' },
        ],
      },
      // OB-213 Phase 1: Import Data + History moved to Platform Core > Data Integration (§1A).
      {
        id: 'calculate-results',
        label: 'Calculate & Results',
        labelEs: 'Calcular y Resultados',
        routes: [
          { path: '/operate/calculate', label: 'Run Calculations', labelEs: 'Ejecutar Cálculos', icon: 'Calculator', roles: ['platform', 'admin'], requiredCapability: 'data.calculate' },
          { path: '/operate/results', label: 'Results Table', labelEs: 'Tabla de Resultados', icon: 'BarChart3', roles: ['platform', 'admin', 'manager'], requiredCapability: 'view.all_results' },
        ],
      },
      {
        id: 'reconciliation',
        label: 'Reconcile',
        labelEs: 'Conciliar',
        routes: [
          { path: '/operate/reconciliation', label: 'Reconciliation', labelEs: 'Conciliación', icon: 'GitCompare', roles: ['platform', 'admin'], requiredCapability: 'data.reconcile' },
        ],
      },
      // OB-213 Phase 1: Calculation vertical slices (KEEP).
      {
        id: 'statements',
        label: 'Statements',
        labelEs: 'Estados de Cuenta',
        routes: [
          { path: '/perform/statements', label: 'Commission Statement', labelEs: 'Estado de Comisiones', icon: 'FileText', roles: ['platform', 'admin', 'manager', 'sales_rep'], requiredCapability: 'statement.view' },
        ],
      },
      {
        id: 'disputes',
        label: 'Dispute Resolution',
        labelEs: 'Resolución de Disputas',
        routes: [
          { path: '/performance/adjustments', label: 'Credits & Corrections', labelEs: 'Créditos y Correcciones', icon: 'Scale', roles: ['platform', 'admin', 'manager'], requiredCapability: 'dispute.resolve' },
        ],
      },
      {
        id: 'approvals',
        label: 'Payout Approvals',
        labelEs: 'Aprobaciones de Pago',
        routes: [
          { path: '/approvals', label: 'Approval Center', labelEs: 'Centro de Aprobación', icon: 'CheckCircle', roles: ['platform', 'admin'], requiredCapability: 'data.approve_results' },
        ],
      },
      {
        id: 'payroll',
        label: 'Payroll Reports',
        labelEs: 'Reportes de Nómina',
        routes: [
          { path: '/operate/pay', label: 'Payroll Overview', labelEs: 'Resumen de Nómina', icon: 'Wallet', roles: ['platform', 'admin'], requiredCapability: 'view.all_results' },
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
          { path: '/financial', label: 'Overview', labelEs: 'Resumen', icon: 'Layers', roles: ['platform', 'admin', 'manager', 'sales_rep'], requiredCapability: 'view.team_results' },
          { path: '/financial/pulse', label: 'Network Pulse', labelEs: 'Pulso de Red', icon: 'Activity', roles: ['platform', 'admin', 'manager', 'sales_rep'], requiredCapability: 'view.team_results' },
          { path: '/financial/timeline', label: 'Revenue Timeline', labelEs: 'Cronología de Ingresos', icon: 'LineChart', roles: ['platform', 'admin', 'manager', 'sales_rep'], requiredCapability: 'view.team_results' },
          { path: '/financial/performance', label: 'Location Benchmarks', labelEs: 'Benchmarks de Ubicación', icon: 'BarChart3', roles: ['platform', 'admin', 'manager', 'sales_rep'], requiredCapability: 'view.team_results' },
          { path: '/financial/staff', label: 'Staff Performance', labelEs: 'Rendimiento de Personal', icon: 'Users', roles: ['platform', 'admin', 'manager', 'sales_rep'], requiredCapability: 'view.team_results' },
          { path: '/financial/leakage', label: 'Leakage Monitor', labelEs: 'Monitor de Fugas', icon: 'ShieldAlert', roles: ['platform', 'admin', 'manager'], requiredCapability: 'view.team_results' },
        ],
      },
      // OB-213 Phase 1: Financial Analytics (KEEP) — gated with the whole Finance agent.
      {
        id: 'financial-analytics',
        label: 'Financial Analytics',
        labelEs: 'Analítica Financiera',
        routes: [
          { path: '/financial/patterns', label: 'Operational Patterns', labelEs: 'Patrones Operativos', icon: 'Activity', roles: ['platform', 'admin', 'manager', 'sales_rep'], requiredCapability: 'view.team_results' },
          { path: '/financial/products', label: 'Product Mix', labelEs: 'Mezcla de Productos', icon: 'Package', roles: ['platform', 'admin', 'manager', 'sales_rep'], requiredCapability: 'view.team_results' },
          { path: '/financial/summary', label: 'Operating Summary', labelEs: 'Resumen Operativo', icon: 'ClipboardList', roles: ['platform', 'admin', 'manager', 'sales_rep'], requiredCapability: 'view.team_results' },
        ],
      },
    ],
  },

  // ── DATA OPERATIONS — PRISM acquisition surfaces; gated per tenant via featureFlag:'prism_enabled' ──
  // OB-250: the consolidated PRISM home (deliver into PRISM, watch scan/hold, see what was cleaned).
  // Two-gate visibility = featureFlag:'prism_enabled' (tenant, enforced by the 3 sidebars' ws.featureFlag
  // filter + the canonical getAccessibleWorkspaces) AND requiredCapability:'data.import' (user). The
  // licensable Finance agent is the exact precedent. Quarantine/hold-resolution deliberately is NOT here
  // (it stays ungated under Import — I5 non-orphaning). Server deep-link enforcement: middleware
  // WORKSPACE_FEATURES + the /api/prism/* isPrismEnabled gate (the menu hide is not a security gate).
  'data-operations': {
    id: 'data-operations',
    label: DATA_OPERATIONS_LABEL,
    labelEs: DATA_OPERATIONS_LABEL_ES,
    icon: 'DatabaseZap',
    description: 'Deliver, scan, and clean incoming data before it is imported',
    descriptionEs: 'Entregar, escanear y limpiar datos antes de importarlos',
    defaultRoute: '/data/submit',
    accentColor: 'hsl(173, 80%, 40%)', // Teal
    featureFlag: PRISM_FEATURE_KEY, // TENANT gate (prism_enabled)
    roles: ['platform', 'admin'],
    sections: [
      {
        id: 'deliver',
        label: 'Deliver',
        labelEs: 'Entregar',
        routes: [
          { path: '/data/submit', label: 'Deliver Data', labelEs: 'Entregar Datos', icon: 'Upload', roles: ['platform', 'admin'], requiredCapability: 'data.import' },
        ],
      },
      {
        id: 'in-progress',
        label: 'In Progress',
        labelEs: 'En Progreso',
        routes: [
          { path: '/data/in-progress', label: 'Scan & Hold', labelEs: 'Escaneo y Retención', icon: 'Clock', roles: ['platform', 'admin'], requiredCapability: 'data.import' },
        ],
      },
      {
        id: 'cleaned',
        label: 'Cleaned',
        labelEs: 'Depurados',
        routes: [
          { path: '/data-operations/cleaned', label: 'What Was Cleaned', labelEs: 'Qué Se Depuró', icon: 'Sparkles', roles: ['platform', 'admin'], requiredCapability: 'data.import' },
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
      // OB-250: "Import" — ALWAYS available (ungated by prism_enabled), gated only on data.import
      // (I6: local import is unconditional; PRISM never blocks importing). The PRISM acquisition
      // surfaces (Submit / In Progress) moved OUT to the gated Data-Operations workspace. Quarantine
      // Resolution STAYS HERE, ungated by the flag (I5: held files must remain resolvable when PRISM
      // is off — never orphaned). Import History stays too. Route paths unchanged (DD-7).
      {
        id: 'import',
        label: 'Import',
        labelEs: 'Importar',
        routes: [
          { path: '/operate/import', label: 'Import Data', labelEs: 'Importar Datos', icon: 'Upload', roles: ['platform', 'admin'], requiredCapability: 'data.import' },
          { path: '/operate/import/history', label: 'Import History', labelEs: 'Historial', icon: 'History', roles: ['platform', 'admin'], requiredCapability: 'data.import' },
          { path: '/operate/import/quarantine', label: 'Quarantine Resolution', labelEs: 'Resolución de Cuarentena', icon: 'ShieldAlert', roles: ['platform', 'admin'], requiredCapability: 'data.import' },
        ],
      },
      // Configure: entities, periods, terminology, locations.
      // HF-332: Plans & Canvas moved OUT of here to the Calculate agent (it is a Calculate-entitled
      // surface, gated on icm.configure_plans). It no longer appears under Platform Core > Configure.
      {
        id: 'configure',
        label: 'Configure',
        labelEs: 'Configurar',
        routes: [
          { path: '/configure/people', label: 'Entities', labelEs: 'Entidades', icon: 'Users', roles: ['platform', 'admin'], requiredCapability: 'view.all_entities' },
          { path: '/configure/periods', label: 'Periods', labelEs: 'Períodos', icon: 'Calendar', roles: ['platform', 'admin'], requiredCapability: 'tenant.configure_periods' },
          { path: '/configuration/terminology', label: 'Terminology', labelEs: 'Terminología', icon: 'Languages', roles: ['platform', 'admin'], requiredCapability: 'tenant.edit_settings' },
          { path: '/configuration/locations', label: 'Locations', labelEs: 'Ubicaciones', icon: 'MapPin', roles: ['platform', 'admin'], requiredCapability: 'tenant.edit_settings' },
        ],
      },
      // People & Access: user management + RBAC editor (KEEP).
      {
        id: 'people-access',
        label: 'People & Access',
        labelEs: 'Personas y Acceso',
        routes: [
          { path: '/configure/users', label: 'User Management', labelEs: 'Gestión de Usuarios', icon: 'Shield', roles: ['platform', 'admin'], requiredCapability: 'tenant.manage_users' },
          { path: '/admin/access-control', label: 'RBAC Editor', labelEs: 'Editor de RBAC', icon: 'KeyRound', roles: ['platform', 'admin'], requiredCapability: 'tenant.manage_users' },
        ],
      },
      // Audit Trail (KEEP).
      {
        id: 'audit',
        label: 'Audit Trail',
        labelEs: 'Registro de Auditoría',
        routes: [
          { path: '/admin/audit', label: 'Audit Trail', labelEs: 'Registro de Auditoría', icon: 'ScrollText', roles: ['platform', 'admin'], requiredCapability: 'view.audit_trail' },
        ],
      },
      // Data Visibility (KEEP) — Data Console aliases the /data hub (page exists).
      {
        id: 'data-visibility',
        label: 'Data Visibility',
        labelEs: 'Visibilidad de Datos',
        routes: [
          { path: '/data', label: 'Data Console', labelEs: 'Consola de Datos', icon: 'Database', roles: ['platform', 'admin', 'manager'], requiredCapability: 'view.team_results' },
          { path: '/data/quality', label: 'Data Quality', labelEs: 'Calidad de Datos', icon: 'CheckSquare', roles: ['platform', 'admin'], requiredCapability: 'data.import' },
          { path: '/data/transactions', label: 'Transactions', labelEs: 'Transacciones', icon: 'Receipt', roles: ['platform', 'admin', 'manager'], requiredCapability: 'view.team_results' },
          { path: '/data/reports', label: 'Reports', labelEs: 'Reportes', icon: 'FileBarChart', roles: ['platform', 'admin', 'manager'], requiredCapability: 'view.team_results' },
        ],
      },
      // Notifications (KEEP).
      {
        id: 'notifications',
        label: 'Notifications',
        labelEs: 'Notificaciones',
        routes: [
          { path: '/notifications', label: 'Notification Center', labelEs: 'Centro de Notificaciones', icon: 'Bell', roles: ['platform', 'admin', 'manager', 'sales_rep'] },
        ],
      },
      // OB-213 3C: Govern section removed — /govern is a redirect stub to /configure (OB-97 folded
      // governance into Configure), so a "Governance Center" nav item would be a redirect shell.
      // Integrations (KEEP).
      {
        id: 'integrations',
        label: 'Integrations',
        labelEs: 'Integraciones',
        routes: [
          { path: '/integrations/catalog', label: 'Integrations Catalog', labelEs: 'Catálogo de Integraciones', icon: 'Plug', roles: ['platform', 'admin'], requiredCapability: 'tenant.edit_settings' },
        ],
      },
      // Operations (KEEP) — Messaging, Rollback, New Tenant (VL Admin only).
      {
        id: 'operations',
        label: 'Operations',
        labelEs: 'Operaciones',
        routes: [
          { path: '/operations/messaging', label: 'Messaging', labelEs: 'Mensajería', icon: 'MessageSquare', roles: ['platform', 'admin'], requiredCapability: 'tenant.edit_settings' },
          { path: '/operations/rollback', label: 'Rollback', labelEs: 'Reversión', icon: 'Undo2', roles: ['platform', 'admin'], requiredCapability: 'tenant.edit_settings' },
          { path: '/admin/tenants/new', label: 'New Tenant', labelEs: 'Nuevo Inquilino', icon: 'Building2', roles: ['platform'], requiredCapability: 'platform.provision_tenant' },
          // HF-352: the reachable home for clean-slate / delete-tenant / agent-feature toggles. Gated
          // on platform.system_config (platform-admin only; the /admin middleware gate maps to it too).
          { path: '/admin/tenants', label: 'Tenant Management', labelEs: 'Gestión de Inquilinos', icon: 'DatabaseZap', roles: ['platform'], requiredCapability: 'platform.system_config' },
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
        // OB-246 (AP5): ONE PDP — capability gate only. The §9 `route.roles.includes(role)` fallback
        // (a raw string compare against the non-canonical 'sales_rep' alias) is retired. A route with
        // NO requiredCapability is intentionally universal (only /notifications) → visible to all.
        if (route.requiredCapability) {
          return hasCapability(role, route.requiredCapability);
        }
        return true;
      }),
    })).filter(section => section.routes.length > 0);
}

/**
 * Find which workspace a route belongs to
 */
export function getWorkspaceForRoute(path: string): WorkspaceId | null {
  // OB-250 B2: the PRISM subpaths must resolve to 'data-operations' BEFORE the generic /data match
  // (platform-core's data-visibility owns the bare '/data' prefix; `path.startsWith('/data/')` would
  // otherwise swallow /data/submit and /data/in-progress). These exact checks run first, so routing
  // is correct regardless of WORKSPACES insertion order.
  if (path === '/data/submit' || path.startsWith('/data/submit/')) return 'data-operations';
  if (path === '/data/in-progress' || path.startsWith('/data/in-progress/')) return 'data-operations';
  if (path.startsWith('/data-operations')) return 'data-operations';

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
