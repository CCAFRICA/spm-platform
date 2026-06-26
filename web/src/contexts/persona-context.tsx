'use client';

/**
 * Persona Context — persona TOKEN (visual identity + intent framing) + the VL-admin demo override.
 *
 * OB-246: scope is resolved ONCE in auth-context (Decision 39, one lifecycle). HF-345: the persona override
 * itself is now HOISTED into auth-context (it drives effectiveScope + effectiveCapabilities — auth concerns).
 * persona-context therefore only DERIVES the persona token from the authenticated user + the hoisted override,
 * and exposes a backward-compatible `PersonaScope` MAPPED from `useAuth().effectiveScope` so the Financial
 * surfaces + ManagerDashboard + statements that read `usePersona().scope` narrow correctly in a VL-admin
 * preview. The override is still gated to `isVLAdmin` (in auth-context) — a real user's persona/scope are
 * entirely their authenticated values.
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react';
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
  const { user, capabilities, isVLAdmin, effectiveScope, ownEntityId, profileId, personaOverride, setPersonaOverride } = useAuth();

  // HF-345: the override is hoisted to auth-context (already isVLAdmin-gated there). It drives ONLY the
  // persona token here — a real user (override null) gets their derived persona.
  const effectiveOverride = isVLAdmin ? personaOverride : null;
  const derivedPersona = useMemo(() => derivePersona(user, capabilities), [user, capabilities]);
  const persona = effectiveOverride ?? derivedPersona;
  const tokens = PERSONA_TOKENS[persona];

  // Backward-compatible PersonaScope mapped from the EFFECTIVE scope (narrows in a VL-admin preview;
  // = the authenticated scope for every real user — Decision 39). The override changes the token, and
  // (HF-345) the effectiveScope it drives, never the REAL `useAuth().scope` used for security checks.
  const scope = useMemo<PersonaScope>(() => authScopeToPersonaScope(effectiveScope), [effectiveScope]);

  // entityId: the effective own entity (the sample entity in a rep preview), else the real linkage.
  const entityId = effectiveScope.type === 'own' ? effectiveScope.entityId : ownEntityId;

  const value = useMemo<PersonaContextValue>(() => ({
    persona,
    tokens,
    scope,
    profileId,
    entityId,
    setPersonaOverride,
  }), [persona, tokens, scope, profileId, entityId, setPersonaOverride]);

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
