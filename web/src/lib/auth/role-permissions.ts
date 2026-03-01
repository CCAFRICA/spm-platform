/**
 * Role-Based Permission Configuration
 *
 * Three levels of access control:
 * 1. Workspace-level — checked by middleware (server-side)
 * 2. Page-level — checked by RequireRole HOC (client-side)
 * 3. Action-level — checked by useCanPerform hook (inline)
 *
 * SCHEMA_TRUTH.md roles: vl_admin, admin, tenant_admin, manager, viewer
 * Auth types roles: vl_admin, admin, manager, sales_rep
 * Both sets are supported in all permission maps.
 */

// Workspace-level access (checked by middleware)
export const WORKSPACE_ACCESS: Record<string, string[]> = {
  '/admin':         ['vl_admin'],
  '/operate':       ['vl_admin', 'admin', 'tenant_admin'],
  '/configure':     ['vl_admin', 'admin', 'tenant_admin'],
  '/configuration': ['vl_admin', 'admin', 'tenant_admin'],
  '/govern':        ['vl_admin', 'admin', 'tenant_admin'],
  '/data':          ['vl_admin', 'admin', 'tenant_admin'],
  '/perform':       ['vl_admin', 'admin', 'tenant_admin', 'manager', 'viewer', 'sales_rep'],
  '/insights':      ['vl_admin', 'admin', 'tenant_admin', 'manager', 'viewer', 'sales_rep'],
  '/my-compensation': ['vl_admin', 'admin', 'tenant_admin', 'manager', 'viewer', 'sales_rep'],
  '/financial':     ['vl_admin', 'admin', 'tenant_admin', 'manager'],
  '/transactions':  ['vl_admin', 'admin', 'tenant_admin', 'manager', 'viewer', 'sales_rep'],
  '/performance':   ['vl_admin', 'admin', 'tenant_admin', 'manager', 'viewer', 'sales_rep'],
};

// Page-level access (checked by RequireRole HOC — finer grain)
export const PAGE_ACCESS: Record<string, string[]> = {
  '/admin/launch/calculate':       ['vl_admin', 'admin'],
  '/admin/launch/reconciliation':  ['vl_admin'],
  '/admin/launch/plan-import':     ['vl_admin', 'admin'],
  '/admin/launch':                 ['vl_admin'],
  '/operate/calculate':            ['vl_admin', 'admin'],
  '/operate/approve':              ['vl_admin', 'admin', 'manager'],
  '/operate/pay':                  ['vl_admin', 'admin'],
  '/operate/results':              ['vl_admin', 'admin'],
  '/govern/calculation-approvals': ['vl_admin', 'admin'],
  '/configure/users':              ['vl_admin', 'admin'],
  '/configure/personnel':          ['vl_admin', 'admin'],
  '/data/import/enhanced':         ['vl_admin', 'admin'],
  '/operate/import':               ['vl_admin', 'admin'],
};

// Action-level permissions (checked inline via useCanPerform)
export const ACTION_PERMISSIONS: Record<string, string[]> = {
  'import_data':     ['vl_admin', 'admin', 'tenant_admin'],
  'run_calculation': ['vl_admin', 'admin'],
  'approve_results': ['vl_admin', 'admin', 'manager'],
  'publish_results': ['vl_admin', 'admin'],
  'manage_users':    ['vl_admin', 'admin'],
  'manage_tenants':  ['vl_admin'],
  'toggle_features': ['vl_admin'],
  'submit_dispute':  ['vl_admin', 'admin', 'manager', 'viewer', 'sales_rep'],
  'view_team':       ['vl_admin', 'admin', 'manager'],
  'export_payroll':  ['vl_admin', 'admin'],
};

/**
 * Check if a role can access a workspace path prefix.
 * Unmatched paths (dashboard, login, etc.) are open by default.
 */
export function canAccessWorkspace(role: string, path: string): boolean {
  // Sort by longest prefix first for best match
  const matchedWorkspace = Object.keys(WORKSPACE_ACCESS)
    .filter(prefix => path.startsWith(prefix))
    .sort((a, b) => b.length - a.length)[0];

  if (!matchedWorkspace) return true;
  return WORKSPACE_ACCESS[matchedWorkspace].includes(role);
}

/**
 * Check if a role can access a specific page.
 * Unlisted pages fall back to workspace-level access.
 */
export function canAccessPage(role: string, path: string): boolean {
  const pageRoles = PAGE_ACCESS[path];
  if (!pageRoles) return true;
  return pageRoles.includes(role);
}

/**
 * Check if a role can perform a specific action.
 * Unknown actions are denied by default.
 */
export function canPerformAction(role: string, action: string): boolean {
  const actionRoles = ACTION_PERMISSIONS[action];
  if (!actionRoles) return false;
  return actionRoles.includes(role);
}
