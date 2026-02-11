'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { audit } from '@/lib/audit-service';
import type { User, TenantUser, VLAdminUser } from '@/types/auth';
import { isCCAdmin } from '@/types/auth';
import { STORAGE_KEY_USER_ROLE, STORAGE_KEY_TENANT } from '@/contexts/tenant-context';
import { migrateStorageKeys } from '@/lib/storage/storage-migration';

// VL Admin Users
const VL_ADMIN_USERS: VLAdminUser[] = [
  {
    id: 'cc-admin-001',
    email: 'admin@entityb.com',
    name: 'Platform Admin',
    role: 'vl_admin',
    tenantId: null,
    accessLevel: 'full',
    department: 'Engineering',
    status: 'active',
    createdAt: '2023-01-01T00:00:00Z',
  },
  {
    id: 'cc-admin-002',
    email: 'support@entityb.com',
    name: 'Support Admin',
    role: 'vl_admin',
    tenantId: null,
    accessLevel: 'readonly',
    department: 'Support',
    status: 'active',
    createdAt: '2023-06-15T00:00:00Z',
  },
];

// TechCorp Tenant Users
const TECHCORP_USERS: TenantUser[] = [
  {
    id: 'tc-admin-001',
    email: 'admin@techcorp.com',
    name: 'TechCorp Admin',
    role: 'admin',
    tenantId: 'techcorp',
    status: 'active',
    createdAt: '2023-01-15T00:00:00Z',
    permissions: [
      'view_all_compensation',
      'view_reports',
      'view_configuration',
      'edit_terminology',
      'manage_users',
      'view_audit_log',
      'import_transactions',
      'export_data',
    ],
    dataAccessLevel: 'all',
  },
  {
    id: 'tc-manager-001',
    email: 'mike.chen@techcorp.com',
    name: 'Mike Chen',
    role: 'manager',
    tenantId: 'techcorp',
    regionId: 'west',
    teamId: 'west-enterprise',
    status: 'active',
    createdAt: '2023-02-01T00:00:00Z',
    permissions: [
      'view_own_compensation',
      'view_team_compensation',
      'view_reports',
      'submit_inquiry',
      'create_adjustment',
      'approve_adjustment_tier2',
    ],
    dataAccessLevel: 'team',
  },
  {
    id: 'tc-rep-001',
    email: 'sarah.chen@techcorp.com',
    name: 'Sarah Chen',
    role: 'sales_rep',
    tenantId: 'techcorp',
    regionId: 'west',
    teamId: 'west-enterprise',
    managerId: 'tc-manager-001',
    status: 'active',
    createdAt: '2023-03-01T00:00:00Z',
    permissions: ['view_own_compensation', 'view_reports', 'submit_inquiry'],
    dataAccessLevel: 'own',
  },
];

// RestaurantMX Tenant Users
const RESTAURANTMX_USERS: TenantUser[] = [
  {
    id: 'rmx-admin-001',
    email: 'admin@restaurantmx.com',
    name: 'RestaurantMX Admin',
    role: 'admin',
    tenantId: 'restaurantmx',
    status: 'active',
    createdAt: '2024-01-10T00:00:00Z',
    permissions: [
      'view_all_compensation',
      'view_reports',
      'view_configuration',
      'edit_terminology',
      'manage_users',
      'view_audit_log',
      'import_transactions',
      'export_data',
    ],
    dataAccessLevel: 'all',
  },
  {
    id: 'rmx-manager-001',
    email: 'carlos.garcia@restaurantmx.com',
    name: 'Carlos García',
    role: 'manager',
    tenantId: 'restaurantmx',
    regionId: 'cdmx',
    teamId: 'polanco',
    status: 'active',
    createdAt: '2024-01-15T00:00:00Z',
    permissions: [
      'view_own_compensation',
      'view_team_compensation',
      'view_reports',
      'submit_inquiry',
      'create_adjustment',
      'approve_adjustment_tier2',
    ],
    dataAccessLevel: 'team',
  },
  {
    id: 'rmx-rep-001',
    email: 'maria.lopez@restaurantmx.com',
    name: 'María López',
    role: 'sales_rep',
    tenantId: 'restaurantmx',
    regionId: 'cdmx',
    teamId: 'polanco',
    storeId: 'MX-CDMX-001', // Franquicia
    managerId: 'rmx-manager-001',
    status: 'active',
    createdAt: '2024-02-01T00:00:00Z',
    permissions: ['view_own_compensation', 'view_reports', 'submit_inquiry'],
    dataAccessLevel: 'own',
    meseroId: 5001, // Links to mesero record for cheques
  },
];

// RetailCo Tenant Users (Demo Environment)
const RETAILCO_USERS: TenantUser[] = [
  {
    id: 'rc-admin-001',
    email: 'sofia.chen@retailco.com',
    name: 'Sofia Chen',
    role: 'admin',
    tenantId: 'retailco',
    status: 'active',
    createdAt: '2018-01-15T00:00:00Z',
    permissions: [
      'view_all_compensation',
      'view_reports',
      'view_configuration',
      'edit_terminology',
      'manage_users',
      'view_audit_log',
      'import_transactions',
      'export_data',
    ],
    dataAccessLevel: 'all',
  },
  {
    id: 'rc-manager-001',
    email: 'carlos.mendez@retailco.com',
    name: 'Carlos Mendez',
    role: 'manager',
    tenantId: 'retailco',
    regionId: 'west',
    teamId: 'west-region',
    status: 'active',
    createdAt: '2019-08-01T00:00:00Z',
    permissions: [
      'view_own_compensation',
      'view_team_compensation',
      'view_reports',
      'submit_inquiry',
      'create_adjustment',
      'approve_adjustment_tier2',
    ],
    dataAccessLevel: 'team',
  },
  {
    id: 'rc-rep-001',
    email: 'maria.rodriguez@retailco.com',
    name: 'Maria Rodriguez',
    role: 'sales_rep',
    tenantId: 'retailco',
    regionId: 'west',
    teamId: 'west-region',
    storeId: 'store-101',
    managerId: 'rc-manager-001',
    status: 'active',
    createdAt: '2023-03-15T00:00:00Z',
    permissions: ['view_own_compensation', 'view_reports', 'submit_inquiry'],
    dataAccessLevel: 'own',
  },
  {
    id: 'rc-rep-002',
    email: 'james.wilson@retailco.com',
    name: 'James Wilson',
    role: 'sales_rep',
    tenantId: 'retailco',
    regionId: 'west',
    teamId: 'west-region',
    storeId: 'store-101',
    managerId: 'rc-manager-001',
    status: 'active',
    createdAt: '2022-06-10T00:00:00Z',
    permissions: ['view_own_compensation', 'view_reports', 'submit_inquiry'],
    dataAccessLevel: 'own',
  },
];

// OB-29: RetailCGMX demo users - real identities from 719-employee roster
const RETAILCGMX_USERS: TenantUser[] = [
  {
    id: 'rcgmx-admin-001',
    email: 'admin@retailcgmx.com',
    name: 'Sofia Chen',
    role: 'admin',
    tenantId: 'retail_conglomerate',
    status: 'active',
    createdAt: '2024-01-01T00:00:00Z',
    permissions: [
      'view_all_compensation',
      'view_reports',
      'view_configuration',
      'edit_terminology',
      'manage_users',
      'view_audit_log',
      'import_transactions',
      'export_data',
      'run_calculations',
      'approve_calculations',
    ],
    dataAccessLevel: 'all',
  },
  {
    id: 'rcgmx-manager-001',
    email: 'manager@retailcgmx.com',
    name: 'Roberto Hernandez',
    role: 'manager',
    tenantId: 'retail_conglomerate',
    storeId: '1',
    status: 'active',
    createdAt: '2024-01-01T00:00:00Z',
    permissions: [
      'view_own_compensation',
      'view_team_compensation',
      'view_reports',
      'submit_inquiry',
    ],
    dataAccessLevel: 'team',
  },
  {
    id: 'rcgmx-rep-001',
    email: '96568046@retailcgmx.com',
    name: 'Carlos Garcia Rodriguez',
    role: 'sales_rep',
    tenantId: 'retail_conglomerate',
    storeId: '1',
    managerId: 'rcgmx-manager-001',
    status: 'active',
    createdAt: '2024-01-01T00:00:00Z',
    permissions: ['view_own_compensation', 'view_reports', 'submit_inquiry'],
    dataAccessLevel: 'own',
  },
  {
    id: 'rcgmx-rep-002',
    email: '90125625@retailcgmx.com',
    name: 'Ana Martinez Lopez',
    role: 'sales_rep',
    tenantId: 'retail_conglomerate',
    storeId: '2',
    managerId: 'rcgmx-manager-001',
    status: 'active',
    createdAt: '2024-01-01T00:00:00Z',
    permissions: ['view_own_compensation', 'view_reports', 'submit_inquiry'],
    dataAccessLevel: 'own',
  },
];

// All static users combined
export const ALL_USERS: User[] = [
  ...VL_ADMIN_USERS,
  ...TECHCORP_USERS,
  ...RESTAURANTMX_USERS,
  ...RETAILCO_USERS,
  ...RETAILCGMX_USERS,
];

// Email to user lookup (static users)
const USER_BY_EMAIL: Record<string, User> = {};
ALL_USERS.forEach((user) => {
  USER_BY_EMAIL[user.email.toLowerCase()] = user;
});

// Storage keys for dynamic tenants/users (matches provisioning-engine.ts)
const DYNAMIC_TENANTS_KEY = 'vialuce_tenants';
const TENANT_DATA_PREFIX = 'vialuce_tenant_data_';

/**
 * Load dynamic users from all provisioned tenants in localStorage
 */
function loadDynamicUsers(): TenantUser[] {
  if (typeof window === 'undefined') return [];

  const dynamicUsers: TenantUser[] = [];

  try {
    // Get all dynamic tenants
    const tenantsJson = localStorage.getItem(DYNAMIC_TENANTS_KEY);
    if (!tenantsJson) return [];

    const tenants = JSON.parse(tenantsJson) as Array<{ id: string }>;

    // Load users from each tenant's data store
    for (const tenant of tenants) {
      const usersKey = `${TENANT_DATA_PREFIX}${tenant.id}_users`;
      const usersJson = localStorage.getItem(usersKey);
      if (usersJson) {
        const users = JSON.parse(usersJson) as Array<{
          id: string;
          email: string;
          name?: string;
          role: string;
          status: string;
          createdAt: string;
        }>;

        // Convert to TenantUser format
        for (const u of users) {
          dynamicUsers.push({
            id: u.id,
            email: u.email,
            name: u.name || u.email.split('@')[0],
            role: u.role as 'admin' | 'manager' | 'sales_rep',
            tenantId: tenant.id,
            status: u.status as 'active' | 'inactive',
            createdAt: u.createdAt,
            permissions: u.role === 'admin'
              ? [
                  'view_all_compensation',
                  'view_reports',
                  'view_configuration',
                  'edit_terminology',
                  'manage_users',
                  'view_audit_log',
                  'import_transactions',
                  'export_data',
                ]
              : ['view_own_compensation', 'view_reports'],
            dataAccessLevel: u.role === 'admin' ? 'all' : 'own',
          });
        }
      }
    }
  } catch (e) {
    console.warn('Failed to load dynamic users:', e);
  }

  return dynamicUsers;
}

/**
 * Find a user by email, checking both static and dynamic users
 */
function findUserByEmail(email: string): User | undefined {
  const normalizedEmail = email.toLowerCase().trim();

  // Check static users first
  const staticUser = USER_BY_EMAIL[normalizedEmail];
  if (staticUser) return staticUser;

  // Check dynamic users from localStorage
  const dynamicUsers = loadDynamicUsers();
  return dynamicUsers.find(u => u.email.toLowerCase() === normalizedEmail);
}

/**
 * Find a user by ID, checking both static and dynamic users
 */
function findUserById(userId: string): User | undefined {
  // Check static users first
  const staticUser = ALL_USERS.find(u => u.id === userId);
  if (staticUser) return staticUser;

  // Check dynamic users from localStorage
  const dynamicUsers = loadDynamicUsers();
  return dynamicUsers.find(u => u.id === userId);
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isCCAdmin: boolean;
  login: (email: string) => Promise<boolean>;
  logout: () => void;
  hasPermission: (permission: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const STORAGE_KEY_USER = 'entityb_current_user';

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Migrate old clearcomp_ storage keys to vialuce_ prefix
    if (typeof window !== 'undefined') {
      migrateStorageKeys();
    }

    // Check for existing session
    const stored = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY_USER) : null;
    if (stored) {
      try {
        const userData = JSON.parse(stored);
        // Check both static and dynamic users
        const fullUser = findUserById(userData.id);
        if (fullUser) {
          setUser(fullUser);
          // Ensure role is stored for tenant context
          localStorage.setItem(STORAGE_KEY_USER_ROLE, fullUser.role);
        }
      } catch {
        // Ignore parse errors
      }
    }
    setIsLoading(false);
  }, []);

  const login = async (email: string): Promise<boolean> => {
    // Check both static and dynamic users
    const foundUser = findUserByEmail(email);

    if (!foundUser) {
      return false;
    }

    setUser(foundUser);
    localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(foundUser));
    localStorage.setItem(STORAGE_KEY_USER_ROLE, foundUser.role);

    // Set tenant for non-VL Admin users
    if (!isCCAdmin(foundUser)) {
      localStorage.setItem(STORAGE_KEY_TENANT, foundUser.tenantId);
    } else {
      // Clear tenant selection for VL Admin
      localStorage.removeItem(STORAGE_KEY_TENANT);
    }

    audit.log({
      action: 'login',
      entityType: 'user',
      entityId: foundUser.id,
      entityName: foundUser.name,
      metadata: {
        role: foundUser.role,
        tenantId: isCCAdmin(foundUser) ? null : foundUser.tenantId,
      },
    });

    // Route based on user type
    if (isCCAdmin(foundUser)) {
      router.push('/select-tenant');
    } else {
      router.push('/');
    }

    return true;
  };

  const logout = () => {
    if (user) {
      audit.log({
        action: 'logout',
        entityType: 'user',
        entityId: user.id,
        entityName: user.name,
      });
    }
    setUser(null);
    localStorage.removeItem(STORAGE_KEY_USER);
    localStorage.removeItem(STORAGE_KEY_USER_ROLE);
    localStorage.removeItem(STORAGE_KEY_TENANT);
    router.push('/login');
  };

  const hasPermission = (permission: string): boolean => {
    if (!user) return false;
    // VL Admins have all permissions
    if (isCCAdmin(user)) return true;
    return user.permissions.includes(permission);
  };

  const isUserCCAdmin = user ? isCCAdmin(user) : false;

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        isCCAdmin: isUserCCAdmin,
        login,
        logout,
        hasPermission,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}

// Export user lists for use elsewhere
export { VL_ADMIN_USERS, TECHCORP_USERS, RESTAURANTMX_USERS, RETAILCO_USERS };
