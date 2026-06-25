/**
 * OB-224 — resolveEntityScope: the READ side of profile_scope.
 *
 * profile_scope is WRITTEN by materializeProfileScope (lib/entities/profile-scope.ts, OB-204).
 * This is its long-deferred §9 successor: a thin reader. It deliberately adds NO third writer
 * (AP-17 — the two existing materializers are the writers). No row, or an empty visible set, or
 * an unreadable row all resolve to "all" (admin default), which is the only persona configured
 * today (substrate §3.1: profile_scope has 0 rows).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { createClient } from '@/lib/supabase/client';
import { resolveRole } from '@/lib/auth/permissions';
import type { EntityScope } from './types';

const ALL_SCOPE: EntityScope = {
  visibleEntityIds: [],
  visibleRuleSetIds: [],
  visiblePeriodIds: [],
  scopeType: 'all',
};

// HF-343 — the EntityScope "empty visibleEntityIds = all" contract (types.ts) is admin-safe but
// DENY-unsafe: a narrowed role whose visible set resolves to ZERO entities (a member with no
// linked entity — HALT-C) must read NOTHING, never the whole tenant. These predicates separate the
// two empty-set meanings so the read layer can fail closed.

/** A scope that grants visibility to NO entities (narrowed role, empty set). Read paths return []
 *  for it — they MUST NOT fall back to "all". Distinct from ALL_SCOPE (scopeType 'all' = admin). */
export function scopeIsDeny(s: EntityScope): boolean {
  return s.scopeType !== 'all' && s.visibleEntityIds.length === 0;
}

/** A scope narrowed to a specific, non-empty entity set (member own-entity / manager team). Read
 *  paths must filter by `s.visibleEntityIds` and (for OB-237 tenant-wide sentinels) bypass them. */
export function scopeIsNarrowed(s: EntityScope): boolean {
  return s.scopeType !== 'all' && s.visibleEntityIds.length > 0;
}

/** Build a narrowed/own scope from a single entity id (or DENY when null). */
function ownScope(entityId: string | null): EntityScope {
  return { visibleEntityIds: entityId ? [entityId] : [], visibleRuleSetIds: [], visiblePeriodIds: [], scopeType: 'explicit' };
}

/** The profile's OWN data entity, via the canonical `entities.profile_id` join (Decision 39 — scope
 *  derives from authenticated identity, not a cosmetic switcher). Null when unlinked (HALT-C). */
async function resolveOwnEntityId(
  profileId: string | null,
  tenantId: string,
  sb: SupabaseClient<Database>,
): Promise<string | null> {
  if (!profileId || !tenantId) return null;
  const { data } = await sb.from('entities').select('id').eq('profile_id', profileId).eq('tenant_id', tenantId).maybeSingle();
  return (data?.id as string | null) ?? null;
}

/**
 * HF-343 Phase 1 — THE single authenticated-scope resolver consumed by every `/perform` read path.
 * Keyed off the authenticated `profiles.role` (Decision 39), never the cosmetic persona override.
 * Structural (Korean Test): resolves entity visibility from role + profile_scope/entity linkage with
 * zero domain/language logic.
 *
 *   platform / admin → ALL_SCOPE (tenant-wide; existing behavior)
 *   manager          → profile_scope.visible_entity_ids (team set); fail-closed to own entity when
 *                      no scope row (least privilege — OB-211 WS7 precedent)
 *   member / viewer  → own linked entity only; DENY (read nothing) when unlinked (HALT-C, fail closed)
 *
 * @param viewRole   authenticated role string (any alias — resolved via permissions.resolveRole)
 * @param authUserId the Supabase auth user id (profiles.auth_user_id), used to find the profile
 * @param opts.sampleWhenUnlinked  VL-admin demo only: when a member/viewer view resolves to no own
 *                      entity, scope to one sample individual entity (so "view as rep" demos render).
 *                      Real members never set this → they DENY when unlinked.
 */
export async function resolveAuthenticatedScope(
  viewRole: string | null | undefined,
  authUserId: string | null | undefined,
  tenantId: string,
  opts?: { sampleWhenUnlinked?: boolean },
  client?: SupabaseClient<Database>,
): Promise<EntityScope> {
  const canonical = viewRole ? resolveRole(viewRole) : null;
  if (canonical === 'admin' || canonical === 'platform') return ALL_SCOPE;
  if (!tenantId) return ownScope(null); // no tenant context → fail closed

  const sb = client ?? createClient();

  // the authenticated profile for this auth user, in this tenant
  let profileId: string | null = null;
  if (authUserId) {
    const { data } = await sb.from('profiles').select('id').eq('auth_user_id', authUserId).eq('tenant_id', tenantId).maybeSingle();
    profileId = (data?.id as string | null) ?? null;
  }
  const ownEntityId = await resolveOwnEntityId(profileId, tenantId, sb);

  if (canonical === 'manager') {
    const teamScope = await resolveEntityScope(profileId, sb); // profile_scope reader
    if (scopeIsNarrowed(teamScope)) return teamScope;          // real team set
    return { ...ownScope(ownEntityId), scopeType: 'graph_derived' }; // no profile_scope → own only (least privilege)
  }

  // member / viewer / unknown → own linked entity
  if (ownEntityId) return ownScope(ownEntityId);

  // unlinked: VL-admin demo picks a sample individual; a real member DENYs (HALT-C)
  if (opts?.sampleWhenUnlinked) {
    const { data: sample } = await sb
      .from('entities').select('id').eq('tenant_id', tenantId).eq('entity_type', 'individual').limit(1).maybeSingle();
    return ownScope((sample?.id as string | null) ?? null);
  }
  return ownScope(null); // DENY
}

export async function resolveEntityScope(
  profileId: string | null | undefined,
  client?: SupabaseClient<Database>,
): Promise<EntityScope> {
  if (!profileId) return ALL_SCOPE;
  const sb = client ?? createClient();
  const { data, error } = await sb
    .from('profile_scope')
    .select('scope_type, visible_entity_ids, visible_rule_set_ids, visible_period_ids')
    .eq('profile_id', profileId)
    .maybeSingle();

  if (error || !data) return ALL_SCOPE;

  const visibleEntityIds = (data.visible_entity_ids as string[] | null) ?? [];
  // An explicit but empty scope row is still "all" per the §3.1 resolution rule.
  if (visibleEntityIds.length === 0) return ALL_SCOPE;

  const rawType = (data.scope_type as string | null) ?? '';
  return {
    visibleEntityIds,
    visibleRuleSetIds: (data.visible_rule_set_ids as string[] | null) ?? [],
    visiblePeriodIds: (data.visible_period_ids as string[] | null) ?? [],
    scopeType: rawType === 'graph_derived' ? 'graph_derived' : 'explicit',
  };
}
