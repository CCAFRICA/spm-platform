'use client';

/**
 * Auth Context — Supabase Auth Only
 *
 * No demo users. No localStorage auth. No fallback.
 * User profiles come from the Supabase profiles table.
 * Capabilities are stored on the profile.
 */

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { User, TenantUser, VLAdminUser } from '@/types/auth';
import { isVLAdmin } from '@/types/auth';
import {
  signInWithEmail,
  signOut,
  fetchCurrentProfile,
  getSession,
  onAuthStateChange,
  type AuthProfile,
} from '@/lib/supabase/auth-service';

// ──────────────────────────────────────────────
// Context Type
// ──────────────────────────────────────────────

interface LoginResult {
  success: boolean;
  error?: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isVLAdmin: boolean;
  capabilities: string[];
  login: (email: string, password: string) => Promise<LoginResult>;
  logout: () => void;
  hasPermission: (permission: string) => boolean;
  hasCapability: (capability: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ──────────────────────────────────────────────
// Profile → User mapping
// ──────────────────────────────────────────────

function mapProfileToUser(profile: AuthProfile): User {
  const capabilities = profile.capabilities || [];

  // Platform admin: either role is 'vl_admin' or has manage_tenants capability
  const isPlatformAdmin = profile.role === 'vl_admin' || capabilities.includes('manage_tenants');

  if (isPlatformAdmin) {
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
    } as VLAdminUser;
  }

  // Map capabilities to legacy permissions for backward compat
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
  } as TenantUser;
}

// ──────────────────────────────────────────────
// Provider
// ──────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [capabilities, setCapabilities] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize: check Supabase session + listen for auth changes
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    async function initAuth() {
      try {
        // Check local session first (no network request).
        // If no session cookie exists, skip profile fetch entirely —
        // avoids 500 errors and unnecessary Supabase calls on /login.
        const session = await getSession();

        if (session) {
          const profile = await fetchCurrentProfile();
          if (profile) {
            setUser(mapProfileToUser(profile));
            setCapabilities(profile.capabilities || []);
          }
        }

        // Always set up the auth listener so login/logout events are handled
        unsubscribe = onAuthStateChange(async (event) => {
          if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
            const p = await fetchCurrentProfile();
            if (p) {
              setUser(mapProfileToUser(p));
              setCapabilities(p.capabilities || []);
            }
          } else if (event === 'SIGNED_OUT') {
            setUser(null);
            setCapabilities([]);
          }
        });
      } catch (e) {
        console.error('Auth init failed:', e);
      } finally {
        setIsLoading(false);
      }
    }

    initAuth();
    return () => unsubscribe?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Login ──
  const login = useCallback(async (email: string, password: string): Promise<LoginResult> => {
    try {
      await signInWithEmail(email, password);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Authentication failed';
      if (msg.includes('Invalid login credentials')) {
        return { success: false, error: 'Invalid email or password.' };
      }
      if (msg.includes('Email not confirmed')) {
        return { success: false, error: 'Please confirm your email before signing in.' };
      }
      console.error('[Auth] signIn error:', msg);
      return { success: false, error: `Authentication error: ${msg}` };
    }

    try {
      const profile = await fetchCurrentProfile();
      if (!profile) {
        return { success: false, error: 'Account found but profile is missing. Contact your administrator.' };
      }

      const mappedUser = mapProfileToUser(profile);
      setUser(mappedUser);
      setCapabilities(profile.capabilities || []);

      if (isVLAdmin(mappedUser)) {
        router.push('/select-tenant');
      } else {
        router.push('/');
      }
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Profile load failed';
      console.error('[Auth] profile error:', msg);
      return { success: false, error: `Profile error: ${msg}` };
    }
  }, [router]);

  // ── Logout ──
  const logout = useCallback(async () => {
    try {
      await signOut();
    } catch {
      // Continue with cleanup
    }
    setUser(null);
    setCapabilities([]);
    router.push('/login');
  }, [router]);

  // ── Permissions (legacy check) ──
  const hasPermission = useCallback((permission: string): boolean => {
    if (!user) return false;
    if (isVLAdmin(user)) return true;
    return 'permissions' in user && (user as TenantUser).permissions.includes(permission);
  }, [user]);

  // ── Capabilities (entity model check) ──
  const hasCapability = useCallback((capability: string): boolean => {
    return capabilities.includes(capability);
  }, [capabilities]);

  const isUserVLAdmin = user ? isVLAdmin(user) : false;

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        isVLAdmin: isUserVLAdmin,
        capabilities,
        login,
        logout,
        hasPermission,
        hasCapability,
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
