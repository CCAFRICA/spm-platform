import { useAuth } from '@/contexts/auth-context';
import { isVLAdmin, isTenantUser } from '@/types/auth';

export function usePermissions() {
  const { user, hasPermission, isVLAdmin: isVLAdminUser } = useAuth();

  // VL Admin has all permissions
  const isAdmin = isVLAdminUser || user?.role === 'admin';

  return {
    // Role checks
    isVLAdmin: isVLAdminUser,
    isAdmin,
    isManager: user?.role === 'manager' || isAdmin,
    isRep: user?.role === 'sales_rep',

    // Permission checks
    hasPermission,

    // Common shortcuts - VL Admin has all permissions
    canViewTeam: isVLAdminUser || hasPermission('view_team_compensation'),
    canViewAll: isVLAdminUser || hasPermission('view_all_compensation'),
    canApprove: isVLAdminUser || hasPermission('approve_adjustment_tier2') || hasPermission('approve_adjustment_tier3'),
    canEditConfig: isVLAdminUser || hasPermission('edit_terminology'),
    canManageUsers: isVLAdminUser || hasPermission('manage_users'),
    canViewAudit: isVLAdminUser || hasPermission('view_audit_log'),
    canImportData: isVLAdminUser || hasPermission('import_transactions'),

    // Data access level - VL Admin has 'all' access
    dataAccessLevel: user && isVLAdmin(user) ? 'all' : (user && isTenantUser(user) ? user.dataAccessLevel : 'own'),
  };
}
