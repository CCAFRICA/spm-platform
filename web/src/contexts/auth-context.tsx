'use client';

/**
 * Auth Context — Supabase Auth Only
 *
 * No demo users. No localStorage auth. No fallback.
 * User profiles come from the Supabase profiles table.
 * Capabilities are stored on the profile.
 *
 * Navigation to /login is triggered in TWO places (defense-in-depth):
 *   1. logout() — immediate window.location.href = '/login' (primary)
 *   2. AuthShellProtected — backup redirect if isAuthenticated becomes false
 */

import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { SessionExpiryWarning } from '@/components/session/SessionExpiryWarning';
import { useRouter, usePathname } from 'next/navigation';
import type { PersonaKey } from '@/lib/design/tokens';
import type { User, TenantUser, VLAdminUser } from '@/types/auth';
import { isVLAdmin } from '@/types/auth';
import {
  signInWithEmail,
  signOut,
  fetchCurrentProfile,
  getAuthUser,
  onAuthStateChange,
  clearSupabaseLocalStorage,
  SESSION_ABSENT,
  type AuthProfile,
} from '@/lib/supabase/auth-service';
// OB-246: the ONE authorization scope, resolved in this lifecycle (no second context/hook — HF-343 lesson).
import {
  type AuthScope,
  resolveAuthScope,
  resolveSampleScope,
  initialScopeFromRole,
  scopeCanViewAll,
  scopeCanViewTeam,
  scopeIsDenied,
  DENY_SCOPE,
} from '@/lib/auth/scope';
import { resolveRole, getCapabilities, type Role } from '@/lib/auth/permissions';

// HF-345: the VL-admin selected tenant for persona-preview sample resolution. auth-context sits ABOVE
// tenant-context, so it reads the selection from the same sessionStorage/cookie tenant-context uses for
// VL admins (tenant-context.tsx:155-160). Only consulted for a VL admin override (real users never reach it).
function readSelectedTenantId(): string | null {
  if (typeof window === 'undefined') return null;
  const ss = sessionStorage.getItem('vialuce_admin_tenant');
  if (ss) return ss;
  const m = document.cookie.match(/vialuce-tenant-id=([^;]+)/);
  return m ? m[1] : null;
}

// HF-345: persona override → its canonical role for the effective-capability set.
function overrideRole(persona: PersonaKey): 'admin' | 'manager' | 'member' {
  return persona === 'admin' ? 'admin' : persona === 'manager' ? 'manager' : 'member';
}

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
  profileLocale: string | null;
  // OB-246: authorization scope — resolved from the authenticated profile.role (Decision 39). ONE
  // isLoading governs user + capabilities + scope. `scope` is the REAL authenticated scope (used for any
  // security check); never narrowed by the persona override.
  scope: AuthScope;
  // HF-345: what DATA consumers read. = scope for real users / no override / admin-preview. For a VL admin
  // previewing manager/rep, a representative narrowed scope (within entitlement — Decision 39, corrected).
  effectiveScope: AuthScope;
  // HF-345: capabilities the menu/UI gates against. = capabilities, except a VL-admin manager/rep preview
  // uses that persona's ROLE_CAPABILITIES set.
  effectiveCapabilities: string[];
  // HF-345: the active VL-admin persona preview (null = none / not a VL admin). Hoisted from persona-context.
  personaOverride: PersonaKey | null;
  setPersonaOverride: (persona: PersonaKey | null) => void;
  /** Canonical resolved role of the authenticated user (null until resolved / unknown role). */
  viewRole: Role | null;
  /** entities.profile_id linkage for this profile (own-entity), null when unlinked. */
  ownEntityId: string | null;
  /** profiles.id of the authenticated user (null until resolved). */
  profileId: string | null;
  canViewAll: boolean;
  canViewTeam: boolean;
  isDenied: boolean;
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

  // Platform admin: role is 'platform' or has manage_tenants capability
  const isPlatformAdmin = profile.role === 'platform' || capabilities.includes('manage_tenants');

  if (isPlatformAdmin) {
    return {
      id: profile.id,
      email: profile.email,
      name: profile.displayName,
      role: 'platform',
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

// HF-050: Routes where initAuth should NOT run.
// On these routes, there is no expectation of an active session.
// Running initAuth on /login can resurrect stale localStorage tokens.
const AUTH_SKIP_ROUTES = ['/login', '/landing', '/signup'];

// OB-178: AuthProvider accepts optional server-resolved initial state
interface AuthProviderProps {
  children: ReactNode;
  initialAuthState?: {
    user: { id: string; email: string } | null;
    profile: {
      id: string;
      role: string;
      tenantId: string | null;
      displayName: string;
      email: string;
      capabilities: string[];
      locale: string | null;
      avatarUrl: string | null;
    } | null;
    isAuthenticated: boolean;
  };
}

export function AuthProvider({ children, initialAuthState }: AuthProviderProps) {
  const router = useRouter();
  const pathname = usePathname();

  // OB-178: Initialize from server state if available, otherwise null (client-side init)
  const [user, setUser] = useState<User | null>(() => {
    if (initialAuthState?.profile) {
      return mapProfileToUser({
        id: initialAuthState.profile.id,
        authUserId: initialAuthState.user?.id || '',
        tenantId: initialAuthState.profile.tenantId,
        displayName: initialAuthState.profile.displayName,
        email: initialAuthState.profile.email,
        role: initialAuthState.profile.role,
        capabilities: initialAuthState.profile.capabilities,
        locale: initialAuthState.profile.locale,
        avatarUrl: initialAuthState.profile.avatarUrl,
      });
    }
    return null;
  });
  const [capabilities, setCapabilities] = useState<string[]>(
    initialAuthState?.profile?.capabilities || []
  );
  const [profileLocale, setProfileLocale] = useState<string | null>(
    initialAuthState?.profile?.locale || null
  );
  // OB-246: scope seeded synchronously from the SSR role (admin/platform → all; everyone else → deny
  // until initAuth re-resolves — a fail-closed transient that never over-shows). No second lifecycle.
  const [scope, setScope] = useState<AuthScope>(() => initialScopeFromRole(initialAuthState?.profile?.role));
  const [viewRole, setViewRole] = useState<Role | null>(() =>
    initialAuthState?.profile?.role ? resolveRole(initialAuthState.profile.role) : null
  );
  const [ownEntityId, setOwnEntityId] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(initialAuthState?.profile?.id ?? null);
  const [isLoading, setIsLoading] = useState(!initialAuthState);

  // HF-345: computed early — drives the persona-override gate + effective scope/capabilities below.
  const isUserVLAdmin = user ? isVLAdmin(user) : false;

  // HF-345: the persona override is HOISTED here from persona-context — it now drives effectiveScope +
  // effectiveCapabilities (a VL admin previewing a narrower persona narrows WITHIN entitlement — Decision 39,
  // corrected). Gated to isVLAdmin: a real member/manager never carries an override, so their scope + menu
  // remain exactly the authenticated values OB-246 built.
  const [personaOverride, setPersonaOverrideState] = useState<PersonaKey | null>(() => {
    if (typeof window !== 'undefined') {
      const stored = sessionStorage.getItem('vl_persona_override');
      if (stored === 'admin' || stored === 'manager' || stored === 'rep') return stored;
    }
    return null;
  });
  // effectiveScope: what DATA consumers read. Default = scope (real). A VL-admin manager/rep override
  // resolves a representative sample below (the only async; inside the existing lifecycle — HALT-C).
  const [effectiveScope, setEffectiveScope] = useState<AuthScope>(scope);
  // HF-345 review: the VL-admin selected tenant captured into state so a tenant switch (which navigates →
  // initAuth re-runs) RE-RUNS the sample resolution (the `scope` dep alone is the stable ALL_SCOPE ref for a
  // VL admin, so it would not re-trigger). Real users never use this (effectiveScope = scope for them).
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(() => readSelectedTenantId());

  // OB-246: set user + capabilities + locale + SCOPE together from one profile (one lifecycle). The
  // scope read awaits resolveAuthScope (≤1 indexed query; zero for admin) so the single isLoading that
  // clears in initAuth's finally also governs scope readiness — no intermediate wrong-render.
  async function applyProfileState(profile: AuthProfile) {
    setUser(mapProfileToUser(profile));
    setCapabilities(profile.capabilities || []);
    setProfileLocale(profile.locale);
    setProfileId(profile.id);
    const resolved = await resolveAuthScope({ id: profile.id, role: profile.role, tenantId: profile.tenantId });
    setScope(resolved.scope);
    setOwnEntityId(resolved.ownEntityId);
    setViewRole(resolved.viewRole);
  }

  function clearAuthState() {
    setUser(null);
    setCapabilities([]);
    setProfileLocale(null);
    setScope(DENY_SCOPE);
    setOwnEntityId(null);
    setViewRole(null);
    setProfileId(null);
  }

  // Initialize: check Supabase session + listen for auth changes
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    async function initAuth() {
      try {
        // HF-050: Skip auth initialization on public routes.
        // On /login, /landing, /signup there is no valid session to recover.
        // Running initAuth here can resurrect stale localStorage tokens.
        if (AUTH_SKIP_ROUTES.includes(pathname)) {
          return; // isLoading set false in finally
        }

        // HF-331 (OB-178 Phase C closure): server-verified user is the SOLE session source.
        // The prior getSession() cookie-presence pre-check was the stale-read race (a stale
        // pre-MFA / aal1 cookie could be read before the cookie updated — Symptom A/B root).
        // getAuthUser() round-trips to the Supabase Auth server and authenticates the token.
        // If it returns null, clear any stale cookies (preserving the pre-HF stale-cookie
        // signOut so middleware stops redirecting /login → /); on a genuinely unauthenticated
        // session signOut() is a harmless no-op (and public routes are already short-circuited
        // above via AUTH_SKIP_ROUTES).
        const authUser = await getAuthUser();
        if (!authUser) {
          await signOut().catch(() => {});
          return; // isLoading set false in finally
        }

        // 3. Both session AND user confirmed — NOW fetch profile.
        const profile = await fetchCurrentProfile();
        if (profile && profile !== SESSION_ABSENT) {
          await applyProfileState(profile); // OB-246: resolves scope inside the single isLoading window
        }
        // HF-345 review: capture the (possibly newly-selected) VL-admin tenant — initAuth re-runs on every
        // pathname change, so a tenant switch (which navigates) refreshes this → effectiveScope re-resolves.
        setSelectedTenantId(readSelectedTenantId());
        // If profile is null (missing row) or SESSION_ABSENT, user stays null.
        // AuthShellProtected will handle the redirect. Do NOT redirect here.

        // 4. Set up auth listener for future sign-in/sign-out events
        unsubscribe = onAuthStateChange(async (event) => {
          if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
            const p = await fetchCurrentProfile();
            if (p && p !== SESSION_ABSENT) {
              await applyProfileState(p);
            }
          } else if (event === 'SIGNED_OUT') {
            clearAuthState();
            // Do NOT redirect here — AuthShellProtected handles navigation
          }
        });
      } catch (e) {
        // On ANY error, stay unauthenticated. Do NOT redirect.
        console.error('Auth init failed:', e);
      } finally {
        setIsLoading(false);
      }
    }

    initAuth();
    return () => unsubscribe?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // ── HF-345: persona override (hoisted) — gate, persist, and derive effective scope ──
  // AP2: a non-VL-admin must never carry an override (a forged/stale key is cleared). Gated on !isLoading
  // (review): during the auth-loading window `user` is null → isUserVLAdmin false, so clearing then would
  // wipe a legitimate VL admin's persisted preview before auth resolves. Only clear once auth has settled.
  useEffect(() => {
    if (!isLoading && personaOverride !== null && !isUserVLAdmin) setPersonaOverrideState(null);
  }, [personaOverride, isUserVLAdmin, isLoading]);

  // Persist the override (survives navigation for a VL admin) — same sessionStorage key persona-context used.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (personaOverride) sessionStorage.setItem('vl_persona_override', personaOverride);
    else sessionStorage.removeItem('vl_persona_override');
  }, [personaOverride]);

  // effectiveScope = scope for a real user / no override / admin preview (synchronous). A VL-admin
  // manager/rep preview resolves a representative sample (the ONLY async — within this lifecycle, HALT-C).
  useEffect(() => {
    if (!isUserVLAdmin || !personaOverride || personaOverride === 'admin') {
      setEffectiveScope(scope);
      return;
    }
    let cancelled = false;
    resolveSampleScope(personaOverride, profileId, selectedTenantId)
      .then(s => { if (!cancelled) setEffectiveScope(s); })
      .catch(() => { if (!cancelled) setEffectiveScope(DENY_SCOPE); });
    return () => { cancelled = true; };
  }, [isUserVLAdmin, personaOverride, scope, profileId, selectedTenantId]);

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
      if (profile === SESSION_ABSENT) {
        // HF-284: the session was absent at fetch time (e.g. killed mid-login by a
        // stale bookkeeping cookie). Distinct from a missing profile row.
        return { success: false, error: 'Your session could not be established — please sign in again.' };
      }
      if (!profile) {
        return { success: false, error: 'Account found but profile is missing. Contact your administrator.' };
      }

      const mappedUser = mapProfileToUser(profile);
      await applyProfileState(profile); // OB-246: user + caps + locale + scope set together

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
  // Clears Supabase session, resets state, and navigates to /login.
  // Uses window.location.href for full page navigation — clears all client
  // state (React, providers, cached RSC payloads) and hits middleware fresh.
  const logout = useCallback(async () => {
    try {
      await signOut();
    } catch {
      // Continue with cleanup even if signOut fails
    }
    clearAuthState();

    // HF-043: Explicitly clear ALL auth-related cookies.
    if (typeof document !== 'undefined') {
      // Clear tenant cookie
      document.cookie = 'vialuce-tenant-id=; path=/; max-age=0';
      // OB-178: Clear provider-agnostic session cookies
      document.cookie = 'vialuce-session-start=; path=/; max-age=0';
      document.cookie = 'vialuce-last-activity=; path=/; max-age=0';
      // Force-clear all Supabase auth cookies
      document.cookie.split(';').forEach(c => {
        const name = c.trim().split('=')[0];
        if (name.startsWith('sb-')) {
          document.cookie = `${name}=; path=/; max-age=0`;
        }
      });
    }
    // Clear sessionStorage tenant selection
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem('vialuce_admin_tenant');
    }

    // HF-050: Clear ALL Supabase keys from localStorage.
    // signOut() already calls clearSupabaseLocalStorage(), but call again
    // here as belt-and-suspenders in case signOut() threw above.
    clearSupabaseLocalStorage();

    // Full page navigation — always works, always hits middleware
    window.location.href = '/login';
  }, []);

  // ── Permissions (legacy check) ──
  const hasPermission = useCallback((permission: string): boolean => {
    if (!user) return false;
    if (isVLAdmin(user)) return true;
    return 'permissions' in user && (user as TenantUser).permissions.includes(permission);
  }, [user]);

  // HF-345: only a VL admin may set the override (the gate persona-context used; now hoisted here).
  const setPersonaOverride = useCallback((p: PersonaKey | null) => {
    if (!isUserVLAdmin) return;
    setPersonaOverrideState(p);
  }, [isUserVLAdmin]);

  // HF-345: capabilities the menu/UI gate against. For a VL admin previewing a narrower persona, the
  // override role's capability set (from permissions.ts ROLE_CAPABILITIES) — narrowing within entitlement.
  // Everyone else (real users, admin-preview, no override) = the authenticated capabilities (unchanged).
  const effectiveCapabilities = useMemo(() => {
    if (isUserVLAdmin && personaOverride && personaOverride !== 'admin') {
      return Array.from(getCapabilities(overrideRole(personaOverride)));
    }
    return capabilities;
  }, [isUserVLAdmin, personaOverride, capabilities]);

  // ── Capabilities (entity model check) ──
  const hasCapability = useCallback((capability: string): boolean => {
    // HF-345: a VL admin previewing a narrower persona is gated against THAT persona's capability set
    // (narrowing within entitlement — always safe). Real users + admin-preview + no-override unchanged.
    if (isUserVLAdmin && personaOverride && personaOverride !== 'admin') {
      return effectiveCapabilities.includes(capability);
    }
    // OB-246 (DS-014 §4): platform/admin inherit ALL capabilities (the REAL authenticated role).
    if (user && (user.role === 'platform' || user.role === 'admin')) return true;
    return capabilities.includes(capability);
  }, [isUserVLAdmin, personaOverride, effectiveCapabilities, user, capabilities]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        isVLAdmin: isUserVLAdmin,
        capabilities,
        profileLocale,
        scope,
        effectiveScope,
        effectiveCapabilities,
        personaOverride,
        setPersonaOverride,
        viewRole,
        ownEntityId,
        profileId,
        // HF-345: convenience flags follow effectiveScope (= scope for real users) so preview UI is consistent.
        canViewAll: scopeCanViewAll(effectiveScope),
        canViewTeam: scopeCanViewTeam(effectiveScope),
        isDenied: scopeIsDenied(effectiveScope),
        login,
        logout,
        hasPermission,
        hasCapability,
      }}
    >
      {children}
      {/* HF-147: Session expiry warning — only shown when authenticated */}
      {!!user && <SessionExpiryWarning />}
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
