'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { audit } from '@/lib/audit-service';
import type { User, TenantUser, VLAdminUser } from '@/types/auth';
import { isVLAdmin } from '@/types/auth';
import { STORAGE_KEY_USER_ROLE, STORAGE_KEY_TENANT } from '@/contexts/tenant-context';
import { migrateStorageKeys } from '@/lib/storage/storage-migration';
// Supabase is always configured — no fallback mode

// ──────────────────────────────────────────────
// Demo Users (used when Supabase is NOT configured)
// ──────────────────────────────────────────────

// VL Admin Users
const VL_ADMIN_USERS: VLAdminUser[] = [
  {
    id: 'cc-admin-001',
    email: 'admin@vialuce.com',
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
    email: 'support@vialuce.com',
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
    storeId: 'MX-CDMX-001',
    managerId: 'rmx-manager-001',
    status: 'active',
    createdAt: '2024-02-01T00:00:00Z',
    permissions: ['view_own_compensation', 'view_reports', 'submit_inquiry'],
    dataAccessLevel: 'own',
    meseroId: 5001,
  },
];

// RetailCo Tenant Users
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

// OB-29: RetailCGMX demo users
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

// All static demo users
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
    const tenantsJson = localStorage.getItem(DYNAMIC_TENANTS_KEY);
    if (!tenantsJson) return [];

    const tenants = JSON.parse(tenantsJson) as Array<{ id: string }>;

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

function findUserByEmail(email: string): User | undefined {
  const normalizedEmail = email.toLowerCase().trim();
  const staticUser = USER_BY_EMAIL[normalizedEmail];
  if (staticUser) return staticUser;
  const dynamicUsers = loadDynamicUsers();
  return dynamicUsers.find(u => u.email.toLowerCase() === normalizedEmail);
}

function findUserById(userId: string): User | undefined {
  const staticUser = ALL_USERS.find(u => u.id === userId);
  if (staticUser) return staticUser;
  const dynamicUsers = loadDynamicUsers();
  return dynamicUsers.find(u => u.id === userId);
}

// ──────────────────────────────────────────────
// Auth Context
// ──────────────────────────────────────────────

interface LoginOptions {
  navigate?: boolean;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isVLAdmin: boolean;
  /** True when using Supabase Auth (not demo mode) */
  isSupabaseAuth: boolean;
  login: (email: string, password?: string, options?: LoginOptions) => Promise<boolean>;
  logout: () => void;
  hasPermission: (permission: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const STORAGE_KEY_USER = 'vialuce_current_user';

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const supabaseEnabled = true;

  // ──────────────────────────────────────────
  // Initialize: Supabase auth listener or demo restore
  // ──────────────────────────────────────────
  useEffect(() => {
    if (typeof window !== 'undefined') {
      migrateStorageKeys();
    }

    if (supabaseEnabled) {
      // Supabase Auth mode
      initSupabaseAuth();
    } else {
      // Demo mode: restore from localStorage
      initDemoAuth();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function initSupabaseAuth() {
    try {
      const { fetchCurrentProfile, onAuthStateChange } = await import('@/lib/supabase/auth-service');

      // Check current session
      const profile = await fetchCurrentProfile();
      if (profile) {
        setUser(mapProfileToUser(profile));
      }

      // Listen for auth changes
      onAuthStateChange(async (event) => {
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          const p = await fetchCurrentProfile();
          if (p) setUser(mapProfileToUser(p));
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
        }
      });
    } catch (e) {
      console.warn('Supabase auth init failed, falling back to demo:', e);
      initDemoAuth();
    } finally {
      setIsLoading(false);
    }
  }

  function initDemoAuth() {
    const stored = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY_USER) : null;
    if (stored) {
      try {
        const userData = JSON.parse(stored);
        const fullUser = findUserById(userData.id);
        if (fullUser) {
          setUser(fullUser);
          localStorage.setItem(STORAGE_KEY_USER_ROLE, fullUser.role);
        }
      } catch {
        // Ignore parse errors
      }
    }
    setIsLoading(false);
  }

  /**
   * Map a Supabase profile to the User type used throughout the app.
   */
  function mapProfileToUser(profile: { id: string; tenantId: string; displayName: string; email: string; role: string; capabilities: string[]; locale: string | null; avatarUrl: string | null }): User {
    const capabilities = profile.capabilities || [];

    if (profile.role === 'vl_admin') {
      return {
        id: profile.id,
        email: profile.email,
        name: profile.displayName,
        role: 'vl_admin',
        tenantId: null,
        accessLevel: capabilities.includes('manage_tenants') ? 'full' : 'readonly',
        status: 'active',
        createdAt: new Date().toISOString(),
        avatar: profile.avatarUrl || undefined,
      };
    }

    // Map capabilities to legacy permissions
    const permissionMap: Record<string, string[]> = {
      view_outcomes: ['view_own_compensation', 'view_all_compensation'],
      approve_outcomes: ['approve_adjustment_tier2'],
      export_results: ['export_data'],
      manage_rule_sets: ['view_configuration', 'edit_terminology'],
      manage_assignments: ['manage_users'],
      import_data: ['import_transactions'],
      view_audit: ['view_audit_log'],
    };

    const permissions = new Set<string>(['view_reports']);
    for (const cap of capabilities) {
      const mapped = permissionMap[cap];
      if (mapped) mapped.forEach(p => permissions.add(p));
    }

    return {
      id: profile.id,
      email: profile.email,
      name: profile.displayName,
      role: profile.role as 'admin' | 'manager' | 'sales_rep',
      tenantId: profile.tenantId,
      status: 'active',
      createdAt: new Date().toISOString(),
      permissions: Array.from(permissions),
      dataAccessLevel: profile.role === 'admin' ? 'all' : profile.role === 'manager' ? 'team' : 'own',
      avatar: profile.avatarUrl || undefined,
    };
  }

  // ──────────────────────────────────────────
  // Login
  // ──────────────────────────────────────────
  const login = useCallback(async (email: string, password?: string, options?: LoginOptions): Promise<boolean> => {
    const shouldNavigate = options?.navigate !== false;

    if (supabaseEnabled && password) {
      // Supabase Auth mode with password
      try {
        const { signInWithEmail, fetchCurrentProfile } = await import('@/lib/supabase/auth-service');
        await signInWithEmail(email, password);
        const profile = await fetchCurrentProfile();
        if (!profile) return false;

        const mappedUser = mapProfileToUser(profile);
        setUser(mappedUser);

        audit.log({
          action: 'login',
          entityType: 'user',
          entityId: mappedUser.id,
          entityName: mappedUser.name,
          metadata: { role: mappedUser.role, supabase: true },
        });

        if (shouldNavigate) {
          if (isVLAdmin(mappedUser)) {
            router.push('/select-tenant');
          } else {
            router.push('/');
          }
        }
        return true;
      } catch {
        return false;
      }
    }

    // Demo mode: email-only login
    const foundUser = findUserByEmail(email);
    if (!foundUser) return false;

    setUser(foundUser);
    localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(foundUser));
    localStorage.setItem(STORAGE_KEY_USER_ROLE, foundUser.role);

    if (!isVLAdmin(foundUser)) {
      localStorage.setItem(STORAGE_KEY_TENANT, foundUser.tenantId);
    } else {
      localStorage.removeItem(STORAGE_KEY_TENANT);
    }

    audit.log({
      action: 'login',
      entityType: 'user',
      entityId: foundUser.id,
      entityName: foundUser.name,
      metadata: {
        role: foundUser.role,
        tenantId: isVLAdmin(foundUser) ? null : foundUser.tenantId,
      },
    });

    if (shouldNavigate) {
      if (isVLAdmin(foundUser)) {
        router.push('/select-tenant');
      } else {
        router.push('/');
      }
    }

    return true;
  }, [supabaseEnabled, router]);

  // ──────────────────────────────────────────
  // Logout
  // ──────────────────────────────────────────
  const logout = useCallback(async () => {
    if (user) {
      audit.log({
        action: 'logout',
        entityType: 'user',
        entityId: user.id,
        entityName: user.name,
      });
    }

    if (supabaseEnabled) {
      try {
        const { signOut } = await import('@/lib/supabase/auth-service');
        await signOut();
      } catch {
        // Continue with local cleanup
      }
    }

    setUser(null);
    localStorage.removeItem(STORAGE_KEY_USER);
    localStorage.removeItem(STORAGE_KEY_USER_ROLE);
    localStorage.removeItem(STORAGE_KEY_TENANT);
    router.push('/login');
  }, [user, supabaseEnabled, router]);

  // ──────────────────────────────────────────
  // Permissions
  // ──────────────────────────────────────────
  const hasPermission = useCallback((permission: string): boolean => {
    if (!user) return false;
    if (isVLAdmin(user)) return true;
    return user.permissions.includes(permission);
  }, [user]);

  const isUserVLAdmin = user ? isVLAdmin(user) : false;

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        isVLAdmin: isUserVLAdmin,
        isSupabaseAuth: supabaseEnabled,
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
