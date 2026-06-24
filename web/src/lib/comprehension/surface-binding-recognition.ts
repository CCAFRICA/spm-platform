// HF-337 P2a (DS-030 §3.2) — Surface Binding Recognition: the consumer-side mirror of Decision 158.
//
// A product SURFACE declares a FREE-FORM analytical purpose (natural language it authors). The LLM
// RECOGNIZES which comprehended field(s) satisfy it — free-form purpose meeting free-form
// characterization, the LLM bridging them. Deterministic code CONSTRUCTS: persists the recognized
// binding keyed on the data's own structural fingerprint + the surface, and emits a signal (the
// expression-layer flywheel seed). Re-encounter READS the persisted binding (no LLM call). No field
// satisfies the purpose -> a typed structured-unresolved (C2) -> the consumer renders comprehension-
// driven salience, never a silent blank.
//
// THE REGISTRY BRIGHT LINE (Korean Test / No-Fixed-Taxonomy / Decision 158): there is NO enumerated set
// of purposes, roles, fields, or structural properties here, and NO property schema the LLM must
// classify into. Code NEVER substring-matches the characterization text (C3). The binding store grows
// by ENCOUNTER (recognition emits it), never by MAINTENANCE (no developer edits a list). The store is
// keyed on `structural_fingerprint_hash` (a hash of the data's own comprehension shape) + a fixed
// product `surface_id` — never a developer-authored intent/role/field key.

import { createHash } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { streamAnthropicText, stripFences, parseJsonObjectTolerant } from '@/lib/ai/anthropic-stream';
import { defaultModel } from '@/lib/ai/model-policy';
import { writeSignalWithClient } from '@/lib/intelligence/canonical-signal-writer'; // OB-235 P1: one canonical surface
// OB-235 P-EXP: cross-tenant binding inheritance — a discounted, receiving-comprehension-verified prior.
import { findCrossTenantPrior, verifyInheritedBinding, discountConfidence } from '@/lib/learning/expression/binding-inheritance';

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ResolvedField {
  field_name: string;       // the comprehended source field that satisfies the purpose
  display_label: string | null; // its display label = the summary_artifacts.metrics key
  confidence: number;
}

export type RecognitionResult =
  // OB-235 P-EXP: `inherited` flags a binding adopted from a verified cross-tenant prior (discounted, no LLM).
  | { status: 'resolved'; fields: ResolvedField[]; confidence: number; fingerprint: string; fromCache: boolean; inherited?: boolean }
  | { status: 'unresolved'; reason: string; fingerprint: string; fromCache: boolean };

const SEP = '␟'; // unit separator — Korean-clean join (no language content)

/** The tenant's comprehension STRUCTURAL fingerprint: a deterministic hash of its comprehended field
 *  set. Same comprehension shape -> same hash -> binding reused (Progressive Performance at tenant
 *  scope). It is a hash of the data's own shape, not a developer key (registry bright line). The
 *  (fingerprint, surface_id) pair is OB-235's tenant_id-dropped cross-tenant match key. */
function comprehensionFingerprint(fieldNames: string[]): string {
  return createHash('sha256').update(fieldNames.slice().sort().join(SEP)).digest('hex');
}

const SYSTEM = [
  'You match a data analysis SURFACE to the comprehended field(s) that satisfy its purpose.',
  'You are given a free-form analytical PURPOSE and the list of comprehended FIELDS (each with a free-form',
  'characterization of what it means). Decide which field(s) — if any — satisfy the purpose, by MEANING.',
  'There is NO fixed list of answers and NO categories: judge each field by its characterization against',
  'the purpose, in the data\'s own terms.',
  'Return ONLY a JSON object: {"satisfying_fields":[{"field":"<exact field name>","confidence":0.0-1.0}],',
  '"unresolved":<true if NO field satisfies the purpose>}. Order by confidence, best first. If nothing',
  'satisfies the purpose, return an empty array and unresolved=true — do not force a weak match.',
].join('\n');

/**
 * Recognize which comprehended field(s) satisfy a surface's free-form purpose. Read-path first (cached
 * binding -> no LLM), then a single temp-0 recognition on miss, then construct (persist binding + emit
 * signal). Structured-unresolved when nothing satisfies (never null/blank).
 */
export async function recognize(
  sb: SupabaseClient,
  tenantId: string,
  surfaceId: string,
  purposeText: string,
): Promise<RecognitionResult> {
  // 1. comprehension (the free-form recognition input)
  const { data: comp } = await sb.from('comprehension_artifacts')
    .select('field_name, characterization, data_nature, relationships, aggregation_behavior, identifies, display_label')
    .eq('tenant_id', tenantId);
  const rows = (comp ?? []) as any[];
  const fingerprint = comprehensionFingerprint(rows.map((r) => r.field_name));
  if (rows.length === 0) return { status: 'unresolved', reason: 'no comprehension for tenant', fingerprint, fromCache: false };
  const labelOf = new Map<string, string | null>(rows.map((r) => [r.field_name, r.display_label ?? null]));

  // 2. read-path first (memoization, SR-2): cached binding for (tenant, fingerprint, surface) -> no LLM
  const { data: cached } = await sb.from('surface_bindings')
    .select('resolved_fields, confidence')
    .eq('tenant_id', tenantId).eq('structural_fingerprint_hash', fingerprint).eq('surface_id', surfaceId).maybeSingle();
  if (cached) {
    const fields = ((cached as any).resolved_fields ?? []) as ResolvedField[];
    return fields.length > 0
      ? { status: 'resolved', fields, confidence: (cached as any).confidence ?? 0, fingerprint, fromCache: true }
      : { status: 'unresolved', reason: 'cached: no satisfying field', fingerprint, fromCache: true };
  }

  // 2b. OB-235 P-EXP (ADDITIVE miss-path step; the read-back at step 2 is untouched): before the cold LLM
  //     recognition, look for an ESTABLISHED cross-tenant binding for this comprehension fingerprint + surface
  //     (tenant_id DROPPED). A binding is a DONOR-tenant LLM judgement, so it is never asserted: VERIFY the
  //     inherited field's characterization in THIS (receiving) tenant's comprehension against the surface's
  //     purpose. PASS → adopt as a ×0.6 discounted prior, skip the LLM (persist our OWN row + emit the
  //     signal — the consolidation feeds the flywheel). FAIL/none → discard and fall through to the LLM below.
  const prior = await findCrossTenantPrior(sb, tenantId, fingerprint, surfaceId);
  if (prior) {
    const charByField = new Map<string, string>(rows.map((r) => [r.field_name,
      [r.characterization, r.data_nature, r.relationships, r.aggregation_behavior, r.identifies].filter(Boolean).join(' ')]));
    const v = verifyInheritedBinding(prior, charByField);
    if (v.verified) {
      const inheritedFields: ResolvedField[] = prior.resolvedFields
        .filter((f) => labelOf.has(f.field_name)) // only fields THIS tenant actually comprehends
        .map((f) => ({ field_name: f.field_name, display_label: labelOf.get(f.field_name) ?? null, confidence: discountConfidence(f.confidence) }));
      if (inheritedFields.length > 0) {
        const confidence = Math.max(...inheritedFields.map((f) => f.confidence));
        const now0 = new Date().toISOString();
        // persist the RECEIVING tenant's own row (discounted, recognized_by='inherited') so re-encounter is a
        // pure cache hit (PG-PATHA holds) — additive to, not a mutation of, the step-4 self-recognition persist.
        try {
          await sb.from('surface_bindings').upsert({
            tenant_id: tenantId, structural_fingerprint_hash: fingerprint, surface_id: surfaceId,
            purpose_text: purposeText, resolved_fields: inheritedFields, confidence, recognized_by: 'inherited', updated_at: now0,
          }, { onConflict: 'tenant_id,structural_fingerprint_hash,surface_id' });
        } catch (e) { console.warn('[OB-235 P-EXP] inherited surface_bindings upsert failed:', e instanceof Error ? e.message : e); }
        try {
          await writeSignalWithClient({
            tenantId, entityId: null,
            signalType: 'surface_binding_recognition',
            signalValue: { surface_id: surfaceId, structural_fingerprint_hash: fingerprint, resolved_fields: inheritedFields, purpose: purposeText, inherited_from: prior.donorTenantId, verification_score: v.score },
            source: 'binding-inheritance', context: { confidence, inherited: true, discounted: true },
          }, sb);
        } catch (e) { console.warn('[OB-235 P-EXP] inherited binding signal failed:', e instanceof Error ? e.message : e); }
        console.log(`[OB-235 P-EXP] inherited cross-tenant binding for surface=${surfaceId} from donor=${prior.donorTenantId.slice(0, 8)} (verified score=${v.score.toFixed(3)}; discounted conf=${confidence}) — LLM skipped`);
        return { status: 'resolved', fields: inheritedFields, confidence, fingerprint, fromCache: false, inherited: true };
      }
    }
    console.log(`[OB-235 P-EXP] cross-tenant prior DISCARDED for surface=${surfaceId} (receiving-comprehension verification ${v.verified ? 'matched no comprehended field' : `failed: score=${v.score.toFixed(3)}`}) — falling through to own LLM recognition`);
  }

  // 3. miss -> ONE temp-0 LLM recognition (free-form purpose x free-form characterization; no property boxes)
  const model = defaultModel();
  const user = JSON.stringify({
    purpose: purposeText,
    fields: rows.map((r) => ({
      field: r.field_name, characterization: r.characterization, data_nature: r.data_nature,
      relationships: r.relationships, aggregation_behavior: r.aggregation_behavior, identifies: r.identifies,
    })),
  });
  const text = await streamAnthropicText({ model, system: SYSTEM, user, maxTokens: 1500, label: `recognize:${surfaceId}` });
  const parsed = parseJsonObjectTolerant(stripFences(text));
  const known = new Set(rows.map((r) => r.field_name));
  const resolved: ResolvedField[] = (Array.isArray(parsed.satisfying_fields) ? parsed.satisfying_fields : [])
    .filter((f: any) => f && typeof f.field === 'string' && known.has(f.field)) // only real comprehended fields
    .map((f: any) => ({ field_name: f.field, display_label: labelOf.get(f.field) ?? null, confidence: typeof f.confidence === 'number' ? f.confidence : 0 }));
  const confidence = resolved.length ? Math.max(...resolved.map((r) => r.confidence)) : 0;

  // 4. construct (deterministic) — BOTH writes mandatory (P2c dual-write gate). Persist even when
  //    unresolved (resolved_fields=[]) so re-encounter reads the cached unresolved (no repeat LLM).
  const now = new Date().toISOString();
  try {
    await sb.from('surface_bindings').upsert({
      tenant_id: tenantId, structural_fingerprint_hash: fingerprint, surface_id: surfaceId,
      purpose_text: purposeText, resolved_fields: resolved, confidence, recognized_by: model, updated_at: now,
    }, { onConflict: 'tenant_id,structural_fingerprint_hash,surface_id' });
  } catch (e) { console.warn('[HF-337] surface_bindings upsert failed:', e instanceof Error ? e.message : e); }
  try {
    await writeSignalWithClient({
      tenantId, entityId: null,
      signalType: 'surface_binding_recognition', // expression-layer flywheel seed (OB-235 signal source)
      signalValue: { surface_id: surfaceId, structural_fingerprint_hash: fingerprint, resolved_fields: resolved, purpose: purposeText },
      source: 'surface-binding-recognition', context: { confidence, unresolved: resolved.length === 0 },
    }, sb);
  } catch (e) { console.warn('[HF-337] binding-recognition signal failed:', e instanceof Error ? e.message : e); }

  return resolved.length > 0
    ? { status: 'resolved', fields: resolved, confidence, fingerprint, fromCache: false }
    : { status: 'unresolved', reason: 'no field satisfies the purpose', fingerprint, fromCache: false };
}
