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

  // OB-89: Persist persona override in sessionStorage so it survives navigation
  const [override, setOverride] = useState<PersonaKey | null>(() => {
    if (typeof window !== 'undefined') {
      const stored = sessionStorage.getItem('vl_persona_override');
      if (stored === 'admin' || stored === 'manager' || stored === 'rep') return stored;
    }
    return null;
  });
  const [scope, setScope] = useState<PersonaScope>({ entityIds: [], canSeeAll: false });
  const [profileId, setProfileId] = useState<string | null>(null);
  const [entityId, setEntityId] = useState<string | null>(null);

  // OB-89: Sync override to sessionStorage
  useEffect(() => {
    if (override) {
      sessionStorage.setItem('vl_persona_override', override);
    } else {
      sessionStorage.removeItem('vl_persona_override');
    }
  }, [override]);

  // Derive persona from user profile
  const derivedPersona = useMemo(() => derivePersona(user, capabilities), [user, capabilities]);
  const persona = override ?? derivedPersona;
  const tokens = PERSONA_TOKENS[persona];

  // Fetch scope from profile + override persona
  // HF-060: Added `override` to deps so scope recalculates when DemoPersonaSwitcher changes persona.
  // Uses effective persona (override ?? derived) instead of user.role so that demo
  // persona switching actually changes data scope, not just visual identity.
  useEffect(() => {
    if (!user || !currentTenant) {
      setScope({ entityIds: [], canSeeAll: false });
      setProfileId(null);
      setEntityId(null);
      return;
    }

    const effectivePersona = override ?? derivePersona(user, capabilities);

    async function fetchScope() {
      try {
        const supabase = createClient();

        // Get the user's profile row to find profile_id
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('auth_user_id', user!.id)
          .eq('tenant_id', currentTenant!.id)
          .maybeSingle();

        let linkedEntityId: string | null = null;

        if (profile) {
          setProfileId(profile.id);

          // Profile→entity linkage goes through entities.profile_id (not profiles.entity_id)
          const { data: linkedEntity } = await supabase
            .from('entities')
            .select('id')
            .eq('profile_id', profile.id)
            .eq('tenant_id', currentTenant!.id)
            .maybeSingle();

          linkedEntityId = linkedEntity?.id ?? null;
        }

        // Admin persona sees all — no need to query profile_scope
        if (effectivePersona === 'admin') {
          setEntityId(linkedEntityId);
          setScope({ entityIds: [], canSeeAll: true });
          return;
        }

        // Rep persona: scope to a single server's store
        if (effectivePersona === 'rep') {
          // If the user has a linked individual entity, use it
          if (linkedEntityId) {
            const { data: linkedEnt } = await supabase
              .from('entities')
              .select('id, metadata')
              .eq('id', linkedEntityId)
              .maybeSingle();
            const meta = (linkedEnt?.metadata || {}) as Record<string, unknown>;
            const storeId = String(meta.store_id || meta.location_id || '');
            setEntityId(linkedEntityId);
            setScope({
              entityIds: storeId ? [storeId] : [linkedEntityId],
              canSeeAll: false,
            });
            return;
          }

          // VL Admin demo override: pick a sample individual entity from the tenant
          const { data: sampleIndividual } = await supabase
            .from('entities')
            .select('id, metadata')
            .eq('tenant_id', currentTenant!.id)
            .eq('entity_type', 'individual')
            .limit(1)
            .maybeSingle();

          if (sampleIndividual) {
            const meta = (sampleIndividual.metadata || {}) as Record<string, unknown>;
            const storeId = String(meta.store_id || meta.location_id || '');
            setEntityId(sampleIndividual.id);
            setScope({
              entityIds: storeId ? [storeId] : [],
              canSeeAll: false,
            });
          } else {
            setEntityId(null);
            setScope({ entityIds: [], canSeeAll: false });
          }
          return;
        }

        // Manager persona: scope to one brand's locations
        if (effectivePersona === 'manager') {
          // OB-100: Run profile_scope + entities queries in parallel
          const [scopeResult, orgsResult] = await Promise.all([
            profile?.id
              ? supabase
                  .from('profile_scope')
                  .select('visible_entity_ids')
                  .eq('profile_id', profile.id)
                  .eq('tenant_id', currentTenant!.id)
                  .maybeSingle()
              : Promise.resolve({ data: null }),
            supabase
              .from('entities')
              .select('id, entity_type, metadata')
              .eq('tenant_id', currentTenant!.id)
              .in('entity_type', ['organization', 'location']),
          ]);

          // Check profile_scope first
          const scopeData = scopeResult.data as { visible_entity_ids?: string[] } | null;
          if (scopeData?.visible_entity_ids?.length) {
            setEntityId(linkedEntityId);
            setScope({
              entityIds: scopeData.visible_entity_ids,
              canSeeAll: false,
            });
            return;
          }

          // VL Admin demo override: scope to first brand's locations
          const allOrgs = orgsResult.data as Array<{ id: string; entity_type: string; metadata: unknown }> | null;

          if (allOrgs) {
            const brandEntities = allOrgs.filter(e =>
              (e.metadata as Record<string, unknown>)?.role === 'brand'
            );
            const firstBrand = brandEntities[0];

            if (firstBrand) {
              const brandLocations = allOrgs.filter(e =>
                e.entity_type === 'location' &&
                String((e.metadata as Record<string, unknown>)?.brand_id || '') === firstBrand.id
              );
              setEntityId(linkedEntityId);
              setScope({
                entityIds: brandLocations.map(l => l.id),
                canSeeAll: false,
              });
              return;
            }
          }

          // Fallback: manager with no brand data sees all
          setEntityId(linkedEntityId);
          setScope({ entityIds: [], canSeeAll: true });
          return;
        }

        // Fallback for any other persona: try profile_scope
        if (profile?.id) {
          const { data: scopeData } = await supabase
            .from('profile_scope')
            .select('visible_entity_ids')
            .eq('profile_id', profile.id)
            .eq('tenant_id', currentTenant!.id)
            .maybeSingle();

          if (scopeData?.visible_entity_ids) {
            setScope({
              entityIds: scopeData.visible_entity_ids,
              canSeeAll: false,
            });
          } else {
            setScope({
              entityIds: linkedEntityId ? [linkedEntityId] : [],
              canSeeAll: false,
            });
          }
        }
      } catch (err) {
        console.warn('[PersonaContext] Failed to fetch scope:', err);
        if (effectivePersona === 'admin') {
          setScope({ entityIds: [], canSeeAll: true });
        } else {
          setScope({ entityIds: [], canSeeAll: false });
        }
      }
    }

    fetchScope();
  }, [user, currentTenant, override, capabilities]);

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
