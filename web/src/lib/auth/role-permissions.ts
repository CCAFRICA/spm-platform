/**
 * Role-Based Permission Configuration
 *
 * Three levels of access control:
 * 1. Workspace-level — checked by middleware (server-side)
 * 2. Page-level — checked by RequireRole HOC (client-side)
 * 3. Action-level — checked by useCanPerform hook (inline)
 *
 * SCHEMA_TRUTH.md roles: platform, admin, tenant_admin, manager, viewer
 * Auth types roles: platform, admin, manager, sales_rep
 * Both sets are supported in all permission maps.
 */

// Workspace-level access (checked by middleware)
export const WORKSPACE_ACCESS: Record<string, string[]> = {
  '/admin':         ['platform'],
  '/operate':       ['platform', 'admin', 'tenant_admin'],
  '/configure':     ['platform', 'admin', 'tenant_admin'],
  '/configuration': ['platform', 'admin', 'tenant_admin'],
  '/govern':        ['platform', 'admin', 'tenant_admin'],
  '/data':          ['platform', 'admin', 'tenant_admin'],
  '/perform':       ['platform', 'admin', 'tenant_admin', 'manager', 'viewer', 'sales_rep'],
  '/insights':      ['platform', 'admin', 'tenant_admin', 'manager', 'viewer', 'sales_rep'],
  '/my-compensation': ['platform', 'admin', 'tenant_admin', 'manager', 'viewer', 'sales_rep'],
  '/financial':     ['platform', 'admin', 'tenant_admin', 'manager'],
  '/transactions':  ['platform', 'admin', 'tenant_admin', 'manager', 'viewer', 'sales_rep'],
  '/performance':   ['platform', 'admin', 'tenant_admin', 'manager', 'viewer', 'sales_rep'],
};

// Page-level access (checked by RequireRole HOC — finer grain)
export const PAGE_ACCESS: Record<string, string[]> = {
  '/admin/launch/calculate':       ['platform', 'admin'],
  '/admin/launch/reconciliation':  ['platform'],
  '/admin/launch/plan-import':     ['platform', 'admin'],
  '/admin/launch':                 ['platform'],
  '/operate/calculate':            ['platform', 'admin'],
  '/operate/approve':              ['platform', 'admin', 'manager'],
  '/operate/pay':                  ['platform', 'admin'],
  '/operate/results':              ['platform', 'admin'],
  '/govern/calculation-approvals': ['platform', 'admin'],
  '/configure/users':              ['platform', 'admin'],
  '/configure/personnel':          ['platform', 'admin'],
  '/data/import/enhanced':         ['platform', 'admin'],
  '/operate/import':               ['platform', 'admin'],
};

// Action-level permissions (checked inline via useCanPerform)
export const ACTION_PERMISSIONS: Record<string, string[]> = {
  'import_data':     ['platform', 'admin', 'tenant_admin'],
  'run_calculation': ['platform', 'admin'],
  'approve_results': ['platform', 'admin', 'manager'],
  'publish_results': ['platform', 'admin'],
  'manage_users':    ['platform', 'admin'],
  'manage_tenants':  ['platform'],
  'toggle_features': ['platform'],
  'submit_dispute':  ['platform', 'admin', 'manager', 'viewer', 'sales_rep'],
  'view_team':       ['platform', 'admin', 'manager'],
  'export_payroll':  ['platform', 'admin'],
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
