/**
 * OB-204 F.3 — inferred-edge review operations (confirm / reject) + the inferred-edge list.
 * The graph is TEMPORAL: reject never deletes (end-dates effective_to). Confirm flips the source so
 * the edge becomes scope-bearing (§4A.2 — only confirmed/explicit `manages` edges materialize).
 * Every confirm/reject re-materializes the affected manager's profile_scope.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { materializeProfileScope } from '@/lib/entities/profile-scope';

const todayISO = (): string => new Date().toISOString().slice(0, 10);

/** Re-materialize the profile linked to an edge's SOURCE entity (the manager), if any. */
async function rematerializeForSourceEntity(sourceEntityId: string, sb: SupabaseClient): Promise<void> {
  const { data: ent } = await sb.from('entities').select('profile_id').eq('id', sourceEntityId).maybeSingle();
  const profileId = ent?.profile_id as string | null;
  if (profileId) await materializeProfileScope(profileId, sb);
}

export async function confirmRelationship(relId: string, sb: SupabaseClient): Promise<{ ok: boolean; source?: string }> {
  const { data, error } = await sb.from('entity_relationships').update({ source: 'human_confirmed' }).eq('id', relId).select('source_entity_id').maybeSingle();
  if (error || !data) return { ok: false };
  await rematerializeForSourceEntity(data.source_entity_id as string, sb);
  return { ok: true, source: 'human_confirmed' };
}

export async function rejectRelationship(relId: string, sb: SupabaseClient): Promise<{ ok: boolean }> {
  // temporal end-date — never delete (the graph is a history)
  const { data, error } = await sb.from('entity_relationships').update({ effective_to: todayISO() }).eq('id', relId).select('source_entity_id').maybeSingle();
  if (error || !data) return { ok: false };
  await rematerializeForSourceEntity(data.source_entity_id as string, sb);
  return { ok: true };
}

export interface InferredEdge {
  id: string; relationshipType: string; confidence: number; dimension: string | null; evidenceFields: string[];
  sourceEntityId: string; targetEntityId: string; sourceLabel: string; targetLabel: string;
}

/** Confidence-ranked inferred (ai_inferred), still-active edges for the review panel. */
export async function listInferredEdges(tenantId: string, sb: SupabaseClient): Promise<InferredEdge[]> {
  const { data: rels } = await sb.from('entity_relationships')
    .select('id, relationship_type, confidence, evidence, source_entity_id, target_entity_id')
    .eq('tenant_id', tenantId).eq('source', 'ai_inferred').is('effective_to', null)
    .order('confidence', { ascending: false });
  if (!rels || rels.length === 0) return [];
  const ids = Array.from(new Set(rels.flatMap(r => [r.source_entity_id as string, r.target_entity_id as string])));
  const { data: ents } = await sb.from('entities').select('id, display_name, external_id').in('id', ids);
  const label = new Map((ents ?? []).map(e => [e.id as string, ((e.display_name as string) || (e.external_id as string) || (e.id as string))]));
  return rels.map(r => {
    const ev = (r.evidence as { dimension?: string; fields?: string[] } | null) ?? {};
    return {
      id: r.id as string, relationshipType: r.relationship_type as string, confidence: Number(r.confidence),
      dimension: ev.dimension ?? null, evidenceFields: Array.isArray(ev.fields) ? ev.fields : [],
      sourceEntityId: r.source_entity_id as string, targetEntityId: r.target_entity_id as string,
      sourceLabel: label.get(r.source_entity_id as string) ?? '?', targetLabel: label.get(r.target_entity_id as string) ?? '?',
    };
  });
}
