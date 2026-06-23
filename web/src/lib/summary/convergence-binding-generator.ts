// HF-336 — standalone convergence binding generator (the SCI convergence pipeline is ICM-coupled;
// the directive permits a standalone generator). The LLM RECOGNIZES each field's structural type +
// semantic role (Decision 158); deterministic code persists BCL-shaped convergence_bindings to
// rule_sets.input_bindings. KOREAN TEST: zero hardcoded field→role mapping — the LLM assigns roles
// from field names + sample values; the code only carries the platform role VOCABULARY (semantic-roles.ts).

import type { SupabaseClient } from '@supabase/supabase-js';
import { SEMANTIC_ROLES, STRUCTURAL_TYPES, type StructuralType } from './semantic-roles';

/* eslint-disable @typescript-eslint/no-explicit-any */

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

export interface FieldIdentity { structuralType: StructuralType; contextualIdentity: string; confidence: number }
export interface BindingEntry {
  column: string;
  confidence: number;
  field_identity: FieldIdentity;
  learning_provenance: { batch_id: string | null; learned_at: string; source: string };
}

/** Sample distinct fields + example values from the tenant's committed_data row_data. */
async function sampleFields(sb: SupabaseClient, tenantId: string, dataType: string): Promise<{ field: string; samples: unknown[]; types: Set<string> }[]> {
  const { data } = await sb.from('committed_data').select('row_data').eq('tenant_id', tenantId).eq('data_type', dataType).limit(50);
  const acc = new Map<string, { samples: unknown[]; types: Set<string> }>();
  for (const r of (data ?? []) as any[]) {
    const rd = r.row_data || {};
    for (const k in rd) {
      const v = rd[k];
      let e = acc.get(k);
      if (!e) { e = { samples: [], types: new Set() }; acc.set(k, e); }
      if (e.samples.length < 3) e.samples.push(v);
      e.types.add(typeof v);
    }
  }
  return Array.from(acc.entries()).map(([field, e]) => ({ field, ...e }));
}

/** LLM assigns {structuralType, contextualIdentity} per field (recognition). */
async function classifyFields(fields: { field: string; samples: unknown[] }[], dataType: string): Promise<Record<string, FieldIdentity>> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
  const system = [
    'You classify data fields for a domain-agnostic analytics platform.',
    `For each field (given its name + sample values, data_type="${dataType}"), assign:`,
    `- structuralType: one of ${STRUCTURAL_TYPES.join(', ')} (measure=numeric quantity to aggregate; identifier=id/ref; temporal=date/time; category=enum/label).`,
    `- contextualIdentity: a snake_case semantic ROLE. PREFER one of these platform roles when it fits: ${SEMANTIC_ROLES.join(', ')}.`,
    '  If none fits, emit a clear snake_case role. NEVER reuse the raw field name verbatim — emit its MEANING.',
    'Return ONLY a JSON object: { "<field>": { "structuralType": "...", "contextualIdentity": "...", "confidence": 0.0-1.0 }, ... }. No prose, no code fences.',
  ].join('\n');
  const payload = fields.map((f) => ({ field: f.field, samples: f.samples }));
  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 4000, system, messages: [{ role: 'user', content: JSON.stringify(payload) }] }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = await res.json() as any;
  const text: string = json?.content?.[0]?.text ?? '';
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  const s = cleaned.indexOf('{'); const e = cleaned.lastIndexOf('}');
  const parsed = JSON.parse(cleaned.slice(s, e + 1)) as Record<string, any>;
  const out: Record<string, FieldIdentity> = {};
  for (const k in parsed) {
    const v = parsed[k];
    const st = STRUCTURAL_TYPES.includes(v?.structuralType) ? v.structuralType : 'measure';
    const ci = typeof v?.contextualIdentity === 'string' && v.contextualIdentity.trim() ? v.contextualIdentity.trim() : k;
    out[k] = { structuralType: st, contextualIdentity: ci, confidence: typeof v?.confidence === 'number' ? v.confidence : 0.8 };
  }
  return out;
}

export interface BindingGenResult {
  tenantId: string;
  ruleSetsUpdated: number;
  fieldsBound: number;
  sample: Record<string, FieldIdentity>;
}

/** Generate + persist convergence bindings for a tenant. Idempotent (replaces input_bindings). */
export async function generateConvergenceBindings(
  sb: SupabaseClient,
  tenantId: string,
  dataType: string,
): Promise<BindingGenResult> {
  const fields = await sampleFields(sb, tenantId, dataType);
  if (fields.length === 0) return { tenantId, ruleSetsUpdated: 0, fieldsBound: 0, sample: {} };

  const identities = await classifyFields(fields, dataType);
  const learnedAt = new Date().toISOString();
  const bindings: Record<string, BindingEntry> = {};
  // Key bindings by COLUMN (unique) so every field is mapped — keying by contextualIdentity would
  // collide when two fields share a role (e.g. descuento + total_descuentos → discount), leaking the
  // overwritten field's raw key into summary_artifacts. Same-role fields then aggregate under that role.
  for (const f of fields) {
    const id = identities[f.field];
    if (!id) continue;
    bindings[f.field] = {
      column: f.field,
      confidence: id.confidence,
      field_identity: id,
      learning_provenance: { batch_id: null, learned_at: learnedAt, source: 'hf-336-standalone' },
    };
  }

  const input_bindings = {
    convergence_bindings: { component_0: bindings },
    _provenance: { source: 'HF-336', data_type: dataType, learned_at: learnedAt },
  };

  // persist to the tenant's active rule sets (idempotent replace)
  const { data: ruleSets } = await sb.from('rule_sets').select('id').eq('tenant_id', tenantId).eq('status', 'active');
  let updated = 0;
  for (const rs of (ruleSets ?? []) as any[]) {
    const { error } = await sb.from('rule_sets').update({ input_bindings }).eq('id', rs.id);
    if (!error) updated += 1;
  }
  return { tenantId, ruleSetsUpdated: updated, fieldsBound: Object.keys(bindings).length, sample: identities };
}
