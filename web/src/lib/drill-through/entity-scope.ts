/**
 * OB-224 / OB-246 — resolveEntityScope: the fail-CLOSED reader of profile_scope (a manager's team).
 *
 * OB-246 (AP4 closure): the prior version returned ALL_SCOPE (fail-OPEN) on no-profile / no-row /
 * empty visible set — the single most dangerous pattern on the platform (a narrowed role silently
 * widened to the whole tenant). It now returns `{ type: 'deny' }` (least privilege) on every failure
 * path, and `{ type: 'team', entityIds }` only when profile_scope actually names a non-empty set.
 * Consumed by resolveAuthScope (lib/auth/scope.ts) for the manager branch — the single resolver.
 * `AuthScope` is a TYPE-only import here, so there is no runtime import cycle with lib/auth/scope.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { createClient } from '@/lib/supabase/client';
import type { AuthScope } from '@/lib/auth/scope';

export async function resolveEntityScope(
  profileId: string | null | undefined,
  tenantId?: string | null,
  client?: SupabaseClient<Database>,
): Promise<AuthScope> {
  if (!profileId) return { type: 'deny' };
  const sb = client ?? createClient();
  let q = sb
    .from('profile_scope')
    .select('visible_entity_ids')
    .eq('profile_id', profileId);
  if (tenantId) q = q.eq('tenant_id', tenantId);
  const { data, error } = await q.maybeSingle();

  if (error || !data) return { type: 'deny' };

  const visibleEntityIds = (data.visible_entity_ids as string[] | null) ?? [];
  // An explicit but empty scope row reads NOTHING (fail-closed), not everything.
  if (visibleEntityIds.length === 0) return { type: 'deny' };

  return { type: 'team', entityIds: visibleEntityIds };
}
