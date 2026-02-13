/**
 * Access Control Service
 *
 * Centralized permission enforcement for the application.
 * This service provides:
 * 1. Route/page-level access control
 * 2. Data filtering based on user's access level
 * 3. Feature-level permission checks
 * 4. UI element visibility controls
 */

import type { User } from '@/types/auth';
import { isVLAdmin, isTenantUser } from '@/types/auth';

// Permission types
export type Permission =
  | 'view_own_compensation'
  | 'view_team_compensation'
  | 'view_all_compensation'
  | 'view_reports'
  | 'view_configuration'
  | 'edit_terminology'
  | 'manage_users'
  | 'view_audit_log'
  | 'import_transactions'
  | 'export_data'
  | 'submit_inquiry'
  | 'create_adjustment'
  | 'approve_adjustment_tier2'
  | 'approve_adjustment_tier3'
  | 'approve_payout';

// Data access levels
export type DataAccessLevel = 'own' | 'team' | 'region' | 'all';

// Module/Page definitions
export type AppModule =
  | 'dashboard'
  | 'my_compensation'
  | 'transactions'
  | 'disputes'
  | 'dispute_queue'
  | 'insights'
  | 'performance'
  | 'plans'
  | 'scenarios'
  | 'approvals'
  | 'payout_approvals'
  | 'personnel'
  | 'teams'
  | 'configuration'
  | 'data_import'
  | 'audit_log';

// Module access rules by role
const MODULE_ACCESS: Record<string, AppModule[]> = {
  sales_rep: [
    'dashboard',
    'my_compensation',
    'transactions',
    'disputes',
    'plans',
  ],
  manager: [
    'dashboard',
    'my_compensation',
    'transactions',
    'disputes',
    'dispute_queue',
    'insights',
    'performance',
    'plans',
    'scenarios',
    'approvals',
    'personnel',
    'teams',
  ],
  admin: [
    'dashboard',
    'my_compensation',
    'transactions',
    'disputes',
    'dispute_queue',
    'insights',
    'performance',
    'plans',
    'scenarios',
    'approvals',
    'payout_approvals',
    'personnel',
    'teams',
    'configuration',
    'data_import',
    'audit_log',
  ],
  vl_admin: [
    // VL Admin has access to everything
    'dashboard',
    'my_compensation',
    'transactions',
    'disputes',
    'dispute_queue',
    'insights',
    'performance',
    'plans',
    'scenarios',
    'approvals',
    'payout_approvals',
    'personnel',
    'teams',
    'configuration',
    'data_import',
    'audit_log',
  ],
};

// Route to module mapping
const ROUTE_TO_MODULE: Record<string, AppModule> = {
  '/': 'dashboard',
  '/my-compensation': 'my_compensation',
  '/transactions': 'transactions',
  '/transactions/inquiries': 'disputes',
  '/transactions/disputes': 'dispute_queue',
  '/insights': 'insights',
  '/insights/compensation': 'insights',
  '/insights/performance': 'insights',
  '/insights/disputes': 'insights',
  '/performance': 'performance',
  '/performance/plans': 'plans',
  '/performance/scenarios': 'scenarios',
  '/performance/approvals': 'approvals',
  '/performance/approvals/payouts': 'payout_approvals',
  '/workforce/personnel': 'personnel',
  '/workforce/teams': 'teams',
  '/configuration': 'configuration',
  '/data/import': 'data_import',
  '/admin/audit': 'audit_log',
};

/**
 * Access Control Service
 */
class AccessControlService {
  /**
   * Check if user has access to a specific module
   */
  canAccessModule(user: User | null, module: AppModule): boolean {
    if (!user) return false;

    // VL Admin has access to everything
    if (isVLAdmin(user)) return true;

    const allowedModules = MODULE_ACCESS[user.role] || [];
    return allowedModules.includes(module);
  }

  /**
   * Check if user can access a specific route
   */
  canAccessRoute(user: User | null, pathname: string): boolean {
    if (!user) return false;

    // VL Admin has access to everything
    if (isVLAdmin(user)) return true;

    // Find matching module for route
    const appModule = this.getModuleForRoute(pathname);
    if (!appModule) {
      // Unknown routes are allowed by default (for dynamic routes)
      return true;
    }

    return this.canAccessModule(user, appModule);
  }

  /**
   * Get the module for a given route
   */
  getModuleForRoute(pathname: string): AppModule | null {
    // Exact match
    if (ROUTE_TO_MODULE[pathname]) {
      return ROUTE_TO_MODULE[pathname];
    }

    // Check for dynamic routes (e.g., /transactions/[id])
    for (const [route, module] of Object.entries(ROUTE_TO_MODULE)) {
      if (pathname.startsWith(route) && route !== '/') {
        return module;
      }
    }

    return null;
  }

  /**
   * Get user's data access level
   */
  getDataAccessLevel(user: User | null): DataAccessLevel {
    if (!user) return 'own';
    if (isVLAdmin(user)) return 'all';
    if (isTenantUser(user)) return user.dataAccessLevel;
    return 'own';
  }

  /**
   * Check if user has a specific permission
   */
  hasPermission(user: User | null, permission: Permission): boolean {
    if (!user) return false;
    if (isVLAdmin(user)) return true;
    if (isTenantUser(user)) {
      return user.permissions.includes(permission);
    }
    return false;
  }

  /**
   * Filter a list of items based on user's data access level
   *
   * @param user - The current user
   * @param items - Array of items to filter
   * @param getOwnerId - Function to get owner ID from an item
   * @param getTeamId - Optional function to get team ID from an item
   */
  filterByAccess<T>(
    user: User | null,
    items: T[],
    getOwnerId: (item: T) => string,
    getTeamId?: (item: T) => string | undefined
  ): T[] {
    if (!user) return [];

    const accessLevel = this.getDataAccessLevel(user);

    switch (accessLevel) {
      case 'all':
        return items;

      case 'team':
        if (!isTenantUser(user) || !user.teamId) return items;
        return items.filter(item => {
          // Include own items
          if (getOwnerId(item) === user.id) return true;
          // Include team items if getTeamId is provided
          if (getTeamId) {
            const itemTeamId = getTeamId(item);
            return itemTeamId === user.teamId;
          }
          return false;
        });

      case 'own':
      default:
        return items.filter(item => getOwnerId(item) === user.id);
    }
  }

  /**
   * Check if user can view data for a specific user ID
   */
  canViewUserData(currentUser: User | null, targetUserId: string): boolean {
    if (!currentUser) return false;
    if (isVLAdmin(currentUser)) return true;

    const accessLevel = this.getDataAccessLevel(currentUser);

    switch (accessLevel) {
      case 'all':
        return true;
      case 'team':
        // Would need team membership check - for now allow
        return true;
      case 'own':
      default:
        return currentUser.id === targetUserId;
    }
  }

  /**
   * Get list of modules user can access (for navigation filtering)
   */
  getAccessibleModules(user: User | null): AppModule[] {
    if (!user) return [];
    if (isVLAdmin(user)) return MODULE_ACCESS.vl_admin;
    return MODULE_ACCESS[user.role] || [];
  }

  /**
   * Check if user can perform manager-level actions
   */
  isManagerOrAbove(user: User | null): boolean {
    if (!user) return false;
    if (isVLAdmin(user)) return true;
    return ['manager', 'admin'].includes(user.role);
  }

  /**
   * Check if user can perform admin-level actions
   */
  isAdmin(user: User | null): boolean {
    if (!user) return false;
    if (isVLAdmin(user)) return true;
    return user.role === 'admin';
  }
}

// Export singleton instance
export const accessControl = new AccessControlService();

// Export helper functions for common checks
export function canAccessModule(user: User | null, module: AppModule): boolean {
  return accessControl.canAccessModule(user, module);
}

export function canAccessRoute(user: User | null, pathname: string): boolean {
  return accessControl.canAccessRoute(user, pathname);
}

export function getDataAccessLevel(user: User | null): DataAccessLevel {
  return accessControl.getDataAccessLevel(user);
}

export function filterByAccess<T>(
  user: User | null,
  items: T[],
  getOwnerId: (item: T) => string,
  getTeamId?: (item: T) => string | undefined
): T[] {
  return accessControl.filterByAccess(user, items, getOwnerId, getTeamId);
}
