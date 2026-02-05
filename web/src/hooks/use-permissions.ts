import { useAuth } from '@/contexts/auth-context';
import { isCCAdmin, isTenantUser } from '@/types/auth';

export function usePermissions() {
  const { user, hasPermission, isCCAdmin: isCCAdminUser } = useAuth();

  // CC Admin has all permissions
  const isAdmin = isCCAdminUser || user?.role === 'admin';

  return {
    // Role checks
    isCCAdmin: isCCAdminUser,
    isAdmin,
    isManager: user?.role === 'manager' || isAdmin,
    isRep: user?.role === 'sales_rep',

    // Permission checks
    hasPermission,

    // Common shortcuts - CC Admin has all permissions
    canViewTeam: isCCAdminUser || hasPermission('view_team_compensation'),
    canViewAll: isCCAdminUser || hasPermission('view_all_compensation'),
    canApprove: isCCAdminUser || hasPermission('approve_adjustment_tier2') || hasPermission('approve_adjustment_tier3'),
    canEditConfig: isCCAdminUser || hasPermission('edit_terminology'),
    canManageUsers: isCCAdminUser || hasPermission('manage_users'),
    canViewAudit: isCCAdminUser || hasPermission('view_audit_log'),
    canImportData: isCCAdminUser || hasPermission('import_transactions'),

    // Data access level - CC Admin has 'all' access
    dataAccessLevel: user && isCCAdmin(user) ? 'all' : (user && isTenantUser(user) ? user.dataAccessLevel : 'own'),
  };
}
