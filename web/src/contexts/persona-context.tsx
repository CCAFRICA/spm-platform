'use client';

/**
 * Persona Context — persona TOKEN (visual identity + intent framing) + the VL-admin demo override.
 *
 * OB-246: this context NO LONGER computes data scope. Scope is resolved ONCE in auth-context
 * (`useAuth().scope`, keyed off the authenticated profile.role — Decision 39, AP6 closure: one scope,
 * one lifecycle). persona-context exposes a backward-compatible `PersonaScope` MAPPED from
 * `useAuth().scope` (HALT-C) so existing consumers (the Financial surfaces, ManagerDashboard) keep
 * working unchanged. The override drives ONLY the persona token and is gated to `isVLAdmin` (AP2):
 * a manufactured/stale `vl_persona_override` sessionStorage key cannot widen a real user's view or
 * scope — it is inert at the point of use, cleared by effect, and rejected by the setter.
 */

import { createContext, useContext, useState, useEffect, useMemo, useCallback, type ReactNode } from 'react';
import { useAuth } from './auth-context';
import { PERSONA_TOKENS, type PersonaKey } from '@/lib/design/tokens';
import { authScopeToPersonaScope } from '@/lib/auth/scope';
import type { User } from '@/types/auth';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

interface PersonaScope {
  entityIds: string[];
  canSeeAll: boolean;
}

interface PersonaContextValue {
  persona: PersonaKey;
  tokens: typeof PERSONA_TOKENS[PersonaKey];
  scope: PersonaScope;
  profileId: string | null;
  entityId: string | null;
  setPersonaOverride: (persona: PersonaKey | null) => void;
}

const PersonaContext = createContext<PersonaContextValue | undefined>(undefined);

// ──────────────────────────────────────────────
// Persona derivation (visual/intent token only — NOT scope)
// ──────────────────────────────────────────────

function derivePersona(user: User | null, capabilities: string[]): PersonaKey {
  if (!user) return 'rep';

  // VL Platform Admin or tenant admin
  if (user.role === 'platform' || user.role === 'admin') return 'admin';

  // Manager capability or manages relationships
  if (
    capabilities.includes('manage_team') ||
    capabilities.includes('approve_outcomes')
  ) {
    return 'manager';
  }

  // Also check role-based detection for managers
  if (user.role === 'manager') return 'manager';

  // Default: individual contributor
  return 'rep';
}

// ──────────────────────────────────────────────
// Provider
// ──────────────────────────────────────────────

export function PersonaProvider({ children }: { children: ReactNode }) {
  const { user, capabilities, isVLAdmin, scope: authScope, ownEntityId, profileId } = useAuth();

  // OB-89: persist persona override in sessionStorage so it survives navigation (VL admin only).
  const [override, setOverride] = useState<PersonaKey | null>(() => {
    if (typeof window !== 'undefined') {
      const stored = sessionStorage.getItem('vl_persona_override');
      if (stored === 'admin' || stored === 'manager' || stored === 'rep') return stored;
    }
    return null;
  });

  // OB-246 AP2: a non-VL-admin must never carry an override — a forged/stale sessionStorage key is
  // cleared as soon as auth resolves. (The render below ALSO ignores it; this keeps storage clean.)
  useEffect(() => {
    if (override !== null && !isVLAdmin) setOverride(null);
  }, [override, isVLAdmin]);

  // OB-89: sync override to sessionStorage.
  useEffect(() => {
    if (override) {
      sessionStorage.setItem('vl_persona_override', override);
    } else {
      sessionStorage.removeItem('vl_persona_override');
    }
  }, [override]);

  // OB-246 AP2: the override is applied ONLY for a VL admin, at the point of use — so even a
  // first-paint forged key cannot change the rendered persona for a real member/manager.
  const effectiveOverride = isVLAdmin ? override : null;
  const derivedPersona = useMemo(() => derivePersona(user, capabilities), [user, capabilities]);
  const persona = effectiveOverride ?? derivedPersona;
  const tokens = PERSONA_TOKENS[persona];

  // OB-246 HALT-C: scope is a backward-compatible VIEW of the ONE auth-resolved scope. persona-context
  // no longer runs its own async fetchScope lifecycle. The override changes the persona TOKEN, never
  // data scope (Decision 39) — a VL admin previewing 'rep' still reads their authenticated (admin) scope.
  const scope = useMemo<PersonaScope>(() => authScopeToPersonaScope(authScope), [authScope]);

  // OB-246 AP2: only a VL admin may set the override.
  const setPersonaOverride = useCallback((p: PersonaKey | null) => {
    if (!isVLAdmin) return;
    setOverride(p);
  }, [isVLAdmin]);

  const value = useMemo<PersonaContextValue>(() => ({
    persona,
    tokens,
    scope,
    profileId,
    entityId: ownEntityId,
    setPersonaOverride,
  }), [persona, tokens, scope, profileId, ownEntityId, setPersonaOverride]);

  return (
    <PersonaContext.Provider value={value}>
      {children}
    </PersonaContext.Provider>
  );
}

// ──────────────────────────────────────────────
// Hook
// ──────────────────────────────────────────────

export function usePersona(): PersonaContextValue {
  const context = useContext(PersonaContext);
  if (!context) {
    throw new Error('usePersona must be used within PersonaProvider');
  }
  return context;
}
