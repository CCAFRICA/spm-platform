import { useAuth } from '@/contexts/auth-context';

export function usePermissions() {
  const { user, hasPermission } = useAuth();

  return {
    // Role checks
    isAdmin: user?.role === 'Admin',
    isVP: user?.role === 'VP',
    isManager: user?.role === 'Manager' || user?.role === 'VP',
    isRep: user?.role === 'Sales Rep',

    // Permission checks
    hasPermission,

    // Common shortcuts
    canViewTeam: hasPermission('view_team_compensation'),
    canViewAll: hasPermission('view_all_compensation'),
    canApprove: hasPermission('approve_adjustment_tier2') || hasPermission('approve_adjustment_tier3'),
    canEditConfig: hasPermission('edit_terminology'),
    canManageUsers: hasPermission('manage_users'),
    canViewAudit: hasPermission('view_audit_log'),

    // Data access level
    dataAccessLevel: user?.dataAccessLevel || 'own',
  };
}
