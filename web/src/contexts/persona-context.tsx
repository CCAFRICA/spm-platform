'use client';

/**
 * Persona Context — Derives persona from authenticated user's profile.
 *
 * The persona determines:
 *   - Visual identity (background gradient, accent colors)
 *   - Data scope (what entities the user can see)
 *   - Intent framing (governance vs acceleration vs growth)
 *
 * Persona is derived from the profile role + capabilities, NOT selected manually.
 * A demo override is available for persona switcher (OB-46C).
 */

import { createContext, useContext, useState, useEffect, useMemo, type ReactNode } from 'react';
import { useAuth } from './auth-context';
import { useTenant } from './tenant-context';
import { createClient } from '@/lib/supabase/client';
import { PERSONA_TOKENS, type PersonaKey } from '@/lib/design/tokens';
import type { User, TenantUser } from '@/types/auth';

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
// Persona derivation
// ──────────────────────────────────────────────

function derivePersona(user: User | null, capabilities: string[]): PersonaKey {
  if (!user) return 'rep';

  // VL Platform Admin or tenant admin
  if (user.role === 'vl_admin' || user.role === 'admin') return 'admin';

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
  const { user, capabilities } = useAuth();
  const { currentTenant } = useTenant();

  const [override, setOverride] = useState<PersonaKey | null>(null);
  const [scope, setScope] = useState<PersonaScope>({ entityIds: [], canSeeAll: false });
  const [profileId, setProfileId] = useState<string | null>(null);
  const [entityId, setEntityId] = useState<string | null>(null);

  // Derive persona from user profile
  const derivedPersona = useMemo(() => derivePersona(user, capabilities), [user, capabilities]);
  const persona = override ?? derivedPersona;
  const tokens = PERSONA_TOKENS[persona];

  // Fetch scope from profile_scope
  useEffect(() => {
    if (!user || !currentTenant) {
      setScope({ entityIds: [], canSeeAll: false });
      setProfileId(null);
      setEntityId(null);
      return;
    }

    async function fetchScope() {
      try {
        const supabase = createClient();

        // Get the user's profile row to find profile_id and entity_id
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, entity_id')
          .eq('auth_user_id', user!.id)
          .eq('tenant_id', currentTenant!.id)
          .single();

        if (profile) {
          setProfileId(profile.id);
          setEntityId(profile.entity_id);
        }

        // Admin sees all — no need to query profile_scope
        if (user!.role === 'vl_admin' || user!.role === 'admin') {
          setScope({ entityIds: [], canSeeAll: true });
          return;
        }

        // Query profile_scope for visible entities
        if (profile?.id) {
          const { data: scopeData } = await supabase
            .from('profile_scope')
            .select('visible_entity_ids')
            .eq('profile_id', profile.id)
            .eq('tenant_id', currentTenant!.id)
            .single();

          if (scopeData?.visible_entity_ids) {
            setScope({
              entityIds: scopeData.visible_entity_ids,
              canSeeAll: false,
            });
          } else {
            // No scope row — for non-admin, scope to own entity only
            setScope({
              entityIds: profile.entity_id ? [profile.entity_id] : [],
              canSeeAll: false,
            });
          }
        }
      } catch (err) {
        console.warn('[PersonaContext] Failed to fetch scope:', err);
        // Fail safe: scope to nothing for non-admin
        if (user!.role === 'vl_admin' || user!.role === 'admin') {
          setScope({ entityIds: [], canSeeAll: true });
        } else {
          setScope({ entityIds: [], canSeeAll: false });
        }
      }
    }

    fetchScope();
  }, [user, currentTenant]);

  const value = useMemo<PersonaContextValue>(() => ({
    persona,
    tokens,
    scope,
    profileId,
    entityId,
    setPersonaOverride: setOverride,
  }), [persona, tokens, scope, profileId, entityId]);

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
