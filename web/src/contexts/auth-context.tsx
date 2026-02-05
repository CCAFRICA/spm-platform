'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { audit } from '@/lib/audit-service';
import type { User, TenantUser, CCAdminUser } from '@/types/auth';
import { isCCAdmin } from '@/types/auth';
import { STORAGE_KEY_USER_ROLE, STORAGE_KEY_TENANT } from '@/contexts/tenant-context';

// CC Admin Users
const CC_ADMIN_USERS: CCAdminUser[] = [
  {
    id: 'cc-admin-001',
    email: 'admin@entityb.com',
    name: 'Platform Admin',
    role: 'cc_admin',
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
    role: 'cc_admin',
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
    managerId: 'rmx-manager-001',
    status: 'active',
    createdAt: '2024-02-01T00:00:00Z',
    permissions: ['view_own_compensation', 'view_reports', 'submit_inquiry'],
    dataAccessLevel: 'own',
  },
];

// All users combined
export const ALL_USERS: User[] = [
  ...CC_ADMIN_USERS,
  ...TECHCORP_USERS,
  ...RESTAURANTMX_USERS,
];

// Email to user lookup
const USER_BY_EMAIL: Record<string, User> = {};
ALL_USERS.forEach((user) => {
  USER_BY_EMAIL[user.email.toLowerCase()] = user;
});

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isCCAdmin: boolean;
  login: (email: string, password?: string) => Promise<boolean>;
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
    // Check for existing session
    const stored = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY_USER) : null;
    if (stored) {
      try {
        const userData = JSON.parse(stored);
        const fullUser = ALL_USERS.find((u) => u.id === userData.id);
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

  const login = async (email: string, _password?: string): Promise<boolean> => {
    const normalizedEmail = email.toLowerCase().trim();
    const foundUser = USER_BY_EMAIL[normalizedEmail];

    if (!foundUser) {
      return false;
    }

    setUser(foundUser);
    localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(foundUser));
    localStorage.setItem(STORAGE_KEY_USER_ROLE, foundUser.role);

    // Set tenant for non-CC Admin users
    if (!isCCAdmin(foundUser)) {
      localStorage.setItem(STORAGE_KEY_TENANT, foundUser.tenantId);
    } else {
      // Clear tenant selection for CC Admin
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
    // CC Admins have all permissions
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
export { CC_ADMIN_USERS, TECHCORP_USERS, RESTAURANTMX_USERS };
