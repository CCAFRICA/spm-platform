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

/** The tenant-wide (admin/platform) scope. Exported so auth-context can seed it synchronously. */
export const ALL_SCOPE: EntityScope = {
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
 * HF-343 — THE single authenticated-scope resolver. Keyed off the authenticated `profiles.role`
 * (Decision 39), never the cosmetic persona override. Structural (Korean Test): resolves entity
 * visibility from role + profile_scope/entity linkage with zero domain/language logic.
 *
 * REGRESSION FIX (eradicate the parallel auth path): this is a pure UTILITY called ONCE by
 * auth-context during initialization — NOT from a hook, NOT during page render, NOT a second loading
 * lifecycle. It takes the already-resolved `profileId` (profiles.id) the auth init already holds, so
 * it issues at most ONE query (zero for admin/platform).
 *
 *   platform / admin → ALL_SCOPE (tenant-wide; zero queries)
 *   manager          → profile_scope.visible_entity_ids (one query); fail-closed to own entity when
 *                      no scope row (least privilege — OB-211 WS7 precedent)
 *   member / viewer  → own linked entity only (one query, entities.profile_id); DENY when unlinked
 *                      (HALT-C, fail closed)
 *
 * @param role      authenticated role string (any alias — resolved via permissions.resolveRole)
 * @param profileId profiles.id (already resolved by auth-context from fetchCurrentProfile)
 * @param tenantId  the profile's tenant
 */
export async function resolveAuthenticatedScope(
  role: string | null | undefined,
  profileId: string | null | undefined,
  tenantId: string | null | undefined,
  client?: SupabaseClient<Database>,
): Promise<EntityScope> {
  const canonical = role ? resolveRole(role) : null;
  if (canonical === 'admin' || canonical === 'platform') return ALL_SCOPE; // zero queries
  if (!profileId || !tenantId) return ownScope(null); // no identity/tenant → fail closed (DENY)

  const sb = client ?? createClient();

  if (canonical === 'manager') {
    const teamScope = await resolveEntityScope(profileId, sb); // ONE query (profile_scope)
    if (scopeIsNarrowed(teamScope)) return teamScope;          // real team set
    const own = await resolveOwnEntityId(profileId, tenantId, sb); // fallback (no scope row)
    return { ...ownScope(own), scopeType: 'graph_derived' };   // own only (least privilege), never ALL
  }

  // member / viewer / unknown → own linked entity (DENY when unlinked — HALT-C)
  const own = await resolveOwnEntityId(profileId, tenantId, sb); // ONE query (entities.profile_id)
  return ownScope(own);
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
