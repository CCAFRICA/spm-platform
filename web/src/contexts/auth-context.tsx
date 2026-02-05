'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { audit } from '@/lib/audit-service';

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'Sales Rep' | 'Manager' | 'VP' | 'Admin';
  region: string;
  team: string;
  managerId?: string;
  permissions: string[];
  dataAccessLevel: 'own' | 'team' | 'region' | 'all';
}

// Demo users
export const DEMO_USERS: User[] = [
  {
    id: 'user-sarah',
    name: 'Sarah Chen',
    email: 'sarah.chen@clearcomp.com',
    role: 'Sales Rep',
    region: 'West',
    team: 'West-Enterprise',
    managerId: 'user-mike',
    permissions: ['view_own_compensation', 'view_reports', 'submit_inquiry'],
    dataAccessLevel: 'own',
  },
  {
    id: 'user-mike',
    name: 'Mike Chen',
    email: 'mike.chen@clearcomp.com',
    role: 'Manager',
    region: 'West',
    team: 'West-Enterprise',
    managerId: 'user-lisa',
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
    id: 'user-lisa',
    name: 'Lisa Park',
    email: 'lisa.park@clearcomp.com',
    role: 'VP',
    region: 'West',
    team: 'West-Region',
    permissions: [
      'view_own_compensation',
      'view_team_compensation',
      'view_all_compensation',
      'view_reports',
      'submit_inquiry',
      'create_adjustment',
      'approve_adjustment_tier2',
      'approve_adjustment_tier3',
      'view_configuration',
    ],
    dataAccessLevel: 'region',
  },
  {
    id: 'user-admin',
    name: 'Admin User',
    email: 'admin@clearcomp.com',
    role: 'Admin',
    region: 'All',
    team: 'System',
    permissions: [
      'view_own_compensation',
      'view_team_compensation',
      'view_all_compensation',
      'view_reports',
      'submit_inquiry',
      'view_configuration',
      'edit_terminology',
      'manage_users',
      'view_audit_log',
      'import_transactions',
      'export_data',
    ],
    dataAccessLevel: 'all',
  },
];

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (userId: string) => void;
  logout: () => void;
  hasPermission: (permission: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check for existing session
    const stored = localStorage.getItem('currentUser');
    if (stored) {
      try {
        const userData = JSON.parse(stored);
        const fullUser = DEMO_USERS.find((u) => u.id === userData.id);
        if (fullUser) {
          setUser(fullUser);
        }
      } catch {
        // Ignore parse errors
      }
    }
    setIsLoading(false);
  }, []);

  const login = (userId: string) => {
    const selectedUser = DEMO_USERS.find((u) => u.id === userId);
    if (selectedUser) {
      setUser(selectedUser);
      localStorage.setItem('currentUser', JSON.stringify(selectedUser));

      audit.log({
        action: 'login',
        entityType: 'user',
        entityId: selectedUser.id,
        entityName: selectedUser.name,
        metadata: { role: selectedUser.role, region: selectedUser.region },
      });
    }
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
    localStorage.removeItem('currentUser');
  };

  const hasPermission = (permission: string): boolean => {
    if (!user) return false;
    return user.permissions.includes(permission);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
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
