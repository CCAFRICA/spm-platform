/* eslint-disable @typescript-eslint/no-explicit-any */ // OB-228: reads untyped metadata/signal JSONB
/**
 * OB-228 Phase 5 — The Provenance Thread (Concept ④). River Test made interactive:
 * every value traces to origin. The static provenance (source sentence, construction
 * method, confidence, binding + match reason) is read from the component itself
 * (metadata.compositional_intent). Correction history is read from classification_signals.
 * RECOGNITION only (Decision 158) — advisory, never alters a value.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { createClient } from '@/lib/supabase/client';
import type { CanonicalComponent, ProvenanceData } from './types';

/** Static provenance from the component (no DB). The source sentence lives in
 *  metadata.compositional_intent.metadata.note (Phase 1 finding). */
export function getProvenance(component: CanonicalComponent, planConfidence?: number): ProvenanceData {
  const ci = (component.config?.compositionalIntent ?? (component.metadata as any)?.compositional_intent) as any;
  const sourceNote = ci?.metadata?.note ?? ci?.note ?? null;
  const constructionMethod = ci?.construction_method ?? (component.metadata as any)?.construction_method ?? null;
  return {
    componentId: component.id,
    componentName: component.name,
    sourceNote: typeof sourceNote === 'string' ? sourceNote : null,
    constructionMethod: typeof constructionMethod === 'string' ? constructionMethod : null,
    confidence: component.confidence ?? planConfidence,
    binding: {
      column: component.binding.column,
      matchReason: component.binding.matchReason,
      tokenOverlap: component.binding.tokenOverlap,
      fieldRefs: component.binding.fieldRefs,
    },
    corrections: [],
  };
}

/** Correction history for a component (classification_signals emitted by plan edits/acks). */
export async function getCorrectionHistory(
  ruleSetId: string,
  componentId: string,
  client?: SupabaseClient<Database>,
): Promise<ProvenanceData['corrections']> {
  const sb = client ?? createClient();
  const { data: rs } = await sb.from('rule_sets').select('tenant_id').eq('id', ruleSetId).maybeSingle();
  const tenantId = (rs as any)?.tenant_id;
  if (!tenantId) return [];
  const { data } = await sb
    .from('classification_signals')
    .select('id, signal_type, signal_value, created_at')
    .eq('tenant_id', tenantId)
    .like('signal_type', 'plan.%')
    .order('created_at', { ascending: false })
    .limit(50);
  return ((data as any[]) ?? [])
    .filter((s) => (s.signal_value?.componentId ?? null) === componentId)
    .map((s) => ({ id: s.id, signalType: s.signal_type, at: s.created_at ?? null, detail: s.signal_value }));
}
