/**
 * OB-204 F.4 — Profile-scope materializer.
 *
 * Traverses the CONFIRMED/EXPLICIT `manages` subgraph from a profile's linked entity and upserts
 * profile_scope.visible_entity_ids. §4A.2: inferred (ai_inferred) edges are HINTS — they never feed
 * scope; only `source IN ('human_confirmed','human_created','imported_explicit')` materialize.
 * Temporal: only edges with effective_to IS NULL (active) count — a rejected/end-dated edge drops out.
 *
 * Consumption (RLS read policies, manager team views) is explicitly NOT wired here — this build
 * proves scope CONTENTS (A7), not scope ENFORCEMENT (§9 successor reads profile_scope).
 */
import type { SupabaseClient } from '@supabase/supabase-js';

const SCOPE_SOURCES = ['human_confirmed', 'human_created', 'imported_explicit'];

export interface MaterializeResult {
  profileId: string;
  managerEntityId: string | null;
  visibleEntityIds: string[];
}

/**
 * Recompute and persist a profile's graph-derived scope. Set = the manager's own entity plus the
 * direct reports reachable by active, confirmed/explicit `manages` edges. Idempotent.
 */
export async function materializeProfileScope(profileId: string, sb: SupabaseClient): Promise<MaterializeResult> {
  // the profile's linked entity (the manager, when this profile manages anyone)
  const { data: prof } = await sb.from('profiles').select('id, tenant_id').eq('id', profileId).maybeSingle();
  const tenantId = (prof?.tenant_id as string | null) ?? null;
  const { data: linked } = await sb.from('entities').select('id').eq('profile_id', profileId).maybeSingle();
  const managerEntityId = (linked?.id as string | null) ?? null;

  const visible = new Set<string>();
  if (managerEntityId && tenantId) {
    visible.add(managerEntityId);   // a manager sees their own entity
    const { data: edges } = await sb.from('entity_relationships')
      .select('target_entity_id, source, effective_to')
      .eq('tenant_id', tenantId)
      .eq('source_entity_id', managerEntityId)
      .eq('relationship_type', 'manages');
    for (const e of (edges ?? [])) {
      if (SCOPE_SOURCES.includes(e.source as string) && (e.effective_to == null)) {
        visible.add(e.target_entity_id as string);
      }
    }
  }
  const visibleEntityIds = Array.from(visible);

  if (tenantId) {
    // check-then-write (no assumption about a unique index — FP-49). One scope row per profile.
    const row = {
      tenant_id: tenantId, profile_id: profileId, scope_type: 'graph_derived',
      visible_entity_ids: visibleEntityIds, visible_rule_set_ids: [], visible_period_ids: [],
      metadata: { derived_from: 'manages_subgraph', edge_count: visibleEntityIds.length },
      materialized_at: new Date().toISOString(),
    };
    const { data: existing } = await sb.from('profile_scope').select('id').eq('profile_id', profileId).maybeSingle();
    if (existing) await sb.from('profile_scope').update(row).eq('id', existing.id);
    else await sb.from('profile_scope').insert(row);
  }
  return { profileId, managerEntityId, visibleEntityIds };
}
