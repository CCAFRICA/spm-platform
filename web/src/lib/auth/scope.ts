/**
 * OB-246 — AuthScope: the ONE authorization-scope type for the platform.
 *
 * Decision 39 (scope derives from authenticated identity) + DS-014 §4 (capability matrix) +
 * Saltzer & Schroeder "fail-safe defaults": least privilege is a TYPE property here, not a runtime
 * policy check. A discriminated union makes "scoped to nothing" (`deny`) structurally distinct from
 * "all tenant rows" (`all`) — closing DIAG-077 AP1 (the empty-`visibleEntityIds`-means-all trap) and
 * AP4 (fail-OPEN reader). The resolver fails CLOSED on every failure path.
 *
 * Resolved ONCE in auth-context `initAuth` (one lifecycle, one isLoading — no second context, the
 * HF-343 `useAuthScope` regression lesson). Threaded through the single data conduit getEntityResults.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { createClient } from '@/lib/supabase/client';
import { resolveRole, type Role } from '@/lib/auth/permissions';
import { resolveEntityScope } from '@/lib/drill-through/entity-scope';

export type AuthScope =
  | { type: 'all' }
  | { type: 'team'; entityIds: string[] }
  | { type: 'own'; entityId: string }
  | { type: 'deny' };

export const ALL_SCOPE: AuthScope = { type: 'all' };
export const DENY_SCOPE: AuthScope = { type: 'deny' };

/** True iff the scope reads the whole tenant (admin/platform). */
export const scopeCanViewAll = (s: AuthScope): boolean => s.type === 'all';
/** True iff the scope can read team-level aggregates (all or team). */
export const scopeCanViewTeam = (s: AuthScope): boolean => s.type === 'all' || s.type === 'team';
/** True iff the scope reads NOTHING (unlinked / unknown role). */
export const scopeIsDenied = (s: AuthScope): boolean => s.type === 'deny';
/** True iff the scope is narrower than the whole tenant (for "scoped" UI affordances). */
export const scopeIsScoped = (s: AuthScope): boolean => s.type !== 'all';

/**
 * The entity-id set to apply as a `.in('entity_id', …)` filter, or `null` for "no filter" (all).
 * `deny` returns `[]` — callers MUST short-circuit on scopeIsDenied (an empty `.in([])` also yields
 * zero rows, so this is fail-closed even if a caller forgets). NEVER returns null for deny.
 */
export function scopeFilterIds(s: AuthScope): string[] | null {
  switch (s.type) {
    case 'all': return null;
    case 'team': return s.entityIds;
    case 'own': return [s.entityId];
    case 'deny': return [];
  }
}

/** Stable string key for React effect deps (scope identity changes when the entity set changes). */
export function scopeKey(s: AuthScope): string {
  switch (s.type) {
    case 'all': return 'all';
    case 'deny': return 'deny';
    case 'own': return `own:${s.entityId}`;
    case 'team': return `team:${[...s.entityIds].sort().join(',')}`;
  }
}

/**
 * Legacy bridge — map AuthScope to the persona-context PersonaScope shape `{entityIds, canSeeAll}`
 * so the Financial surfaces + ManagerDashboard that read `usePersona().scope` keep working unchanged
 * (HALT-C: persona-context reads scope from useAuth() instead of computing its own).
 *   all  → { entityIds: [],          canSeeAll: true }   (admin byte-identical: financialScope=undefined)
 *   team → { entityIds: entityIds,   canSeeAll: false }
 *   own  → { entityIds: [entityId],  canSeeAll: false }
 *   deny → { entityIds: [],          canSeeAll: false }   (explicit empty scope = fail-closed at server)
 */
export function authScopeToPersonaScope(s: AuthScope): { entityIds: string[]; canSeeAll: boolean } {
  switch (s.type) {
    case 'all': return { entityIds: [], canSeeAll: true };
    case 'team': return { entityIds: s.entityIds, canSeeAll: false };
    case 'own': return { entityIds: [s.entityId], canSeeAll: false };
    case 'deny': return { entityIds: [], canSeeAll: false };
  }
}

/** Minimal profile shape the resolver needs (subset of AuthProfile). */
export interface ScopeProfile {
  id: string;
  role: string;
  tenantId: string | null;
}

export interface ResolvedScope {
  scope: AuthScope;
  /** entities.profile_id linkage for this profile (own-entity), or null if unlinked. */
  ownEntityId: string | null;
  /** Canonical resolved role, or null for an unknown role string (→ deny). */
  viewRole: Role | null;
}

/** entities.profile_id linkage → the profile's own entity id, or null. Structural (Decision 39), not email match. */
async function readOwnEntityId(
  profileId: string,
  tenantId: string | null,
  sb: SupabaseClient<Database>,
): Promise<string | null> {
  if (!profileId) return null;
  let q = sb.from('entities').select('id').eq('profile_id', profileId);
  if (tenantId) q = q.eq('tenant_id', tenantId);
  const { data } = await q.maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

/**
 * Resolve the authoritative AuthScope from the authenticated profile. Role-aware, fail-CLOSED.
 *   platform/admin → { all }                 (zero scope queries — DS-014: admin reads the tenant)
 *   manager        → { team: profile_scope } else fail-closed to { own } else { deny }
 *   member/viewer  → { own: entities.profile_id } else { deny }
 *   unknown role   → { deny }
 * Never throws — any error path resolves to deny (least privilege).
 */
export async function resolveAuthScope(
  profile: ScopeProfile,
  client?: SupabaseClient<Database>,
): Promise<ResolvedScope> {
  try {
    const viewRole = resolveRole(profile.role);
    if (!viewRole) return { scope: DENY_SCOPE, ownEntityId: null, viewRole: null };

    if (viewRole === 'platform' || viewRole === 'admin') {
      // Admin/platform read the whole tenant — zero additional queries (directive 1a).
      return { scope: ALL_SCOPE, ownEntityId: null, viewRole };
    }

    const sb = client ?? createClient();

    if (viewRole === 'manager') {
      // profile_scope (fail-closed reader) names the team; empty/missing → deny from there.
      const teamScope = await resolveEntityScope(profile.id, profile.tenantId, sb);
      if (teamScope.type === 'team') return { scope: teamScope, ownEntityId: null, viewRole };
      // No team → fail CLOSED to own entity only (AP4), then deny if unlinked.
      const own = await readOwnEntityId(profile.id, profile.tenantId, sb);
      return own
        ? { scope: { type: 'own', entityId: own }, ownEntityId: own, viewRole }
        : { scope: DENY_SCOPE, ownEntityId: null, viewRole };
    }

    // member / viewer
    const own = await readOwnEntityId(profile.id, profile.tenantId, sb);
    return own
      ? { scope: { type: 'own', entityId: own }, ownEntityId: own, viewRole }
      : { scope: DENY_SCOPE, ownEntityId: null, viewRole };
  } catch {
    return { scope: DENY_SCOPE, ownEntityId: null, viewRole: null };
  }
}

// ── HF-345: VL-admin persona PREVIEW sample scope ────────────────────────────────────────────────
// When a VL admin (entitled to ALL) previews a narrower persona, resolve a representative scope so the
// preview demonstrates what that role experiences (DS-014 §8.2). Narrowing within entitlement is always
// safe (Decision 39, corrected). Runs ONLY for a VL admin override — real users never reach this.

const SAMPLE_TTL = 300_000; // 5 min
const sampleCache = new Map<string, { scope: AuthScope; ts: number }>();

/**
 * Representative scope for a VL admin previewing `persona` in `tenantId`. Fail-CLOSED to deny when the
 * tenant has no usable entities. Cached by `tenantId:persona` (HALT-A — ≤3 indexed reads otherwise).
 *   admin   → all (current behavior)
 *   rep     → own linked entity, else highest-payout entity, else any individual, else deny
 *   manager → profile_scope team, else first 10 individual entities, else deny
 */
export async function resolveSampleScope(
  persona: 'admin' | 'manager' | 'rep',
  profileId: string | null,
  tenantId: string | null,
  client?: SupabaseClient<Database>,
): Promise<AuthScope> {
  if (persona === 'admin') return ALL_SCOPE;
  // HF-345 review: a manager/rep preview with NO selected tenant fails CLOSED (deny) — never ALL (it cannot
  // pick a representative entity without a tenant, and showing the whole tenant would not be a narrowed preview).
  if (!tenantId) return DENY_SCOPE;
  // Cache key includes profileId — the rep 'own' / manager profile_scope branches depend on it.
  const key = `${tenantId}:${persona}:${profileId ?? ''}`;
  const hit = sampleCache.get(key);
  if (hit && Date.now() - hit.ts < SAMPLE_TTL) return hit.scope;

  const sb = client ?? createClient();
  let resolved: AuthScope = DENY_SCOPE;
  try {
    if (persona === 'rep') {
      const own = profileId ? await readOwnEntityId(profileId, tenantId, sb) : null;
      if (own) {
        resolved = { type: 'own', entityId: own };
      } else {
        // highest-payout entity for the tenant (the getRepDashboardData null→top fallback)
        const { data: top } = await sb
          .from('entity_period_outcomes')
          .select('entity_id, total_payout')
          .eq('tenant_id', tenantId)
          .order('total_payout', { ascending: false })
          .limit(1)
          .maybeSingle();
        const topId = (top?.entity_id as string | undefined) ?? null;
        if (topId) {
          resolved = { type: 'own', entityId: topId };
        } else {
          const { data: anyEnt } = await sb
            .from('entities').select('id')
            .eq('tenant_id', tenantId).eq('entity_type', 'individual').limit(1).maybeSingle();
          const anyId = (anyEnt?.id as string | undefined) ?? null;
          resolved = anyId ? { type: 'own', entityId: anyId } : DENY_SCOPE;
        }
      }
    } else {
      // manager
      const team = profileId ? await resolveEntityScope(profileId, tenantId, sb) : DENY_SCOPE;
      if (team.type === 'team') {
        resolved = team;
      } else {
        const { data: ents } = await sb
          .from('entities').select('id')
          .eq('tenant_id', tenantId).eq('entity_type', 'individual').limit(10);
        const ids = (ents ?? []).map(e => e.id as string);
        resolved = ids.length ? { type: 'team', entityIds: ids } : DENY_SCOPE;
      }
    }
  } catch {
    resolved = DENY_SCOPE;
  }
  sampleCache.set(key, { scope: resolved, ts: Date.now() });
  return resolved;
}

/**
 * Synchronous best-effort seed for the auth-context useState initializer (SSR fast path).
 * admin/platform → all (correct, no query needed); everyone else → deny until initAuth re-resolves
 * (fail-closed transient — strictly safe, never over-shows).
 */
export function initialScopeFromRole(role: string | null | undefined): AuthScope {
  if (!role) return DENY_SCOPE;
  const resolved = resolveRole(role);
  return resolved === 'platform' || resolved === 'admin' ? ALL_SCOPE : DENY_SCOPE;
}
