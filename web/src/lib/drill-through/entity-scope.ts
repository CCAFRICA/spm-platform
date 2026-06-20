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
import type { EntityScope } from './types';

const ALL_SCOPE: EntityScope = {
  visibleEntityIds: [],
  visibleRuleSetIds: [],
  visiblePeriodIds: [],
  scopeType: 'all',
};

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
