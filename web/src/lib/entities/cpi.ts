/**
 * OB-204 F.2 — Contextual Proximity Inference (CPI). Decision 158 split:
 *   - RECOGNITION (LLM): emits compact relationship-intent JSON from STRUCTURAL signals only —
 *     containment, shared-attribute, hierarchical-by-exclusion, cardinality. No domain/language
 *     literals in the prompt's identification (Korean Test / AP-25).
 *   - CONSTRUCTION (deterministic code): validates refs against tenant entities and the
 *     relationship_type against a STRUCTURAL ENUM (never free text from the LLM), then writes
 *     entity_relationships (source='ai_inferred'). Idempotent per import. No LLM-authored SQL/rows.
 *
 * The recognizer is INJECTABLE: production uses the LLM; the A7 harness injects a deterministic
 * stub so the constructor + materializer are proven without LLM non-determinism.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { getAIService } from '@/lib/ai/ai-service';

// Structural dimensions and the relationship_type each constructs (the enum is the guard).
export type CpiDimension = 'containment' | 'shared_attribute' | 'hierarchical_by_exclusion' | 'cardinality';
const DIMENSION_TYPE: Record<CpiDimension, string> = {
  containment: 'manages',                 // a manager-identifier field → manages edge
  hierarchical_by_exclusion: 'manages',   // inferred hierarchy → manages edge (still a HINT until confirmed)
  shared_attribute: 'shares_attribute',   // co-membership of a structural attribute (zone/location)
  cardinality: 'contains',                // 1→many containment
};
const VALID_TYPES = new Set(Object.values(DIMENSION_TYPE));

export interface CpiEntity { ref: string; entityId: string; attributes: Record<string, unknown> }
export interface CpiField { name: string; semanticType: string }
export interface CpiInput { entities: CpiEntity[]; fields: CpiField[] }
export interface RelationshipIntent { sourceEntityRef: string; targetEntityRef: string; relationshipType?: string; dimension: CpiDimension; evidenceFields: string[] }
export type Recognizer = (input: CpiInput) => Promise<RelationshipIntent[]>;

export interface CpiResult { proposed: number; written: number; edges: Array<{ source: string; target: string; type: string; dimension: CpiDimension; confidence: number }>; dropped: number }

/** Default recognizer — the LLM. Emits structural relationship-intent JSON (Korean Test: structural only). */
export const llmRecognizer: Recognizer = async (input) => {
  const prompt = [
    'You are inferring STRUCTURAL relationships between records, by structure ONLY — never by the',
    'meaning of any business term. Use only: containment (a field that identifies a parent/owner',
    'record), shared_attribute (records sharing the same value of a grouping field),',
    'hierarchical_by_exclusion (records that are referenced as a parent but never appear as a child),',
    'and cardinality (one record referenced by many).',
    'Return JSON ONLY: {"relationships":[{"sourceEntityRef","targetEntityRef","dimension","evidenceFields":[]}]}.',
    'Refs are the provided entity refs. dimension is one of the four above. evidenceFields are the field',
    'names that drove the inference. Emit nothing you cannot ground in a field value.',
  ].join(' ');
  const res = await getAIService().query(prompt, { entities: input.entities.map(e => ({ ref: e.ref, attributes: e.attributes })), fields: input.fields });
  const r = res.result as { relationships?: unknown } | undefined;
  const rels = Array.isArray(r?.relationships) ? r!.relationships : (Array.isArray(res.result) ? (res.result as unknown[]) : []);
  return (rels as RelationshipIntent[]).filter(x => x && x.sourceEntityRef && x.targetEntityRef && x.dimension);
};

const todayISO = (): string => new Date().toISOString().slice(0, 10);

/** CONSTRUCTION — validate every intent against tenant entities + the type enum, then write. */
async function constructRelationships(tenantId: string, importId: string | undefined, intents: RelationshipIntent[], byRef: Map<string, string>, sb: SupabaseClient): Promise<CpiResult> {
  const rows: Array<Record<string, unknown>> = [];
  const edges: CpiResult['edges'] = [];
  let dropped = 0;
  for (const intent of intents) {
    const sourceId = byRef.get(intent.sourceEntityRef);
    const targetId = byRef.get(intent.targetEntityRef);
    const type = DIMENSION_TYPE[intent.dimension];
    // refs must resolve, type must be in the structural enum, no self-edges
    if (!sourceId || !targetId || sourceId === targetId || !type || !VALID_TYPES.has(type)) { dropped++; continue; }
    const confidence = intent.dimension === 'containment' ? 0.85 : intent.dimension === 'hierarchical_by_exclusion' ? 0.6 : 0.7;
    rows.push({
      tenant_id: tenantId, source_entity_id: sourceId, target_entity_id: targetId, relationship_type: type,
      source: 'ai_inferred', confidence,
      evidence: { dimension: intent.dimension, fields: Array.isArray(intent.evidenceFields) ? intent.evidenceFields : [] },
      context: importId ? { importId } : {}, effective_from: todayISO(), effective_to: null,
    });
    edges.push({ source: sourceId, target: targetId, type, dimension: intent.dimension, confidence });
  }
  let written = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const slice = rows.slice(i, i + 200);
    const { error } = await sb.from('entity_relationships').upsert(slice, { onConflict: 'tenant_id,source_entity_id,target_entity_id,relationship_type' });
    if (error) console.warn(`[CPI] entity_relationships upsert error: ${error.message}`);
    else written += slice.length;
  }
  return { proposed: intents.length, written, edges, dropped };
}

/**
 * Run a CPI pass for a tenant. Loads entities (refs + attributes), recognizes relationship intents,
 * constructs validated ai_inferred edges. `recognize` defaults to the LLM; the harness injects a stub.
 */
export async function runCpiPass(tenantId: string, sb: SupabaseClient, opts: { importId?: string; recognize?: Recognizer } = {}): Promise<CpiResult> {
  const { data: ents } = await sb.from('entities').select('id, external_id, display_name, metadata, temporal_attributes').eq('tenant_id', tenantId);
  const entities: CpiEntity[] = (ents ?? []).map(e => ({
    ref: (e.external_id as string) || (e.display_name as string) || (e.id as string),
    entityId: e.id as string,
    attributes: { ...((e.metadata as Record<string, unknown>) ?? {}), ...((e.temporal_attributes as Record<string, unknown>) ?? {}) },
  }));
  if (entities.length === 0) return { proposed: 0, written: 0, edges: [], dropped: 0 };
  const byRef = new Map(entities.map(e => [e.ref, e.entityId]));
  // structural field inventory (names + a coarse semantic type from the attribute shape — no header literals)
  const fieldNames = new Set<string>();
  for (const e of entities) for (const k of Object.keys(e.attributes)) fieldNames.add(k);
  const fields: CpiField[] = Array.from(fieldNames).map(name => ({ name, semanticType: 'attribute' }));

  const recognize = opts.recognize ?? llmRecognizer;
  const intents = await recognize({ entities, fields });
  return constructRelationships(tenantId, opts.importId, intents, byRef, sb);
}
