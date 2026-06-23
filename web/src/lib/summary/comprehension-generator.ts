// OB-233 (DS-030 §4.1) — comprehension generator. Reads row_data samples for EVERY field (C4) and the
// LLM (temperature 0, C5) RECOGNIZES a FREE-FORM comprehension artifact per field; deterministic code
// idempotent-upserts it to comprehension_artifacts on (tenant_id, field_name). Comprehension is a
// property of the DATA, not a plan: this runs for every import, every tenant, regardless of whether any
// rule_set exists (C0b), and NEVER writes input_bindings (C6/C0b). The calc-time convergeBindings path
// is separate and untouched. KOREAN TEST: zero hardcoded field->meaning mapping and no fixed vocabulary;
// the artifact is free-form text in the data's own language (no structuralType/contextualIdentity, C0).
// Evolved from HF-336's batched classifyFields (one LLM call per data_type — never per field; HALT-2).

import type { SupabaseClient } from '@supabase/supabase-js';
import { streamAnthropicText, stripFences, parseJsonObjectTolerant } from '@/lib/ai/anthropic-stream';

/* eslint-disable @typescript-eslint/no-explicit-any */

const MODEL = 'claude-sonnet-4-6';

export interface ComprehensionArtifact {
  field_name: string;
  characterization: string;
  data_nature: string | null;
  relationships: string | null;
  aggregation_behavior: string | null;
  identifies: string | null;
}

interface SampledField { field: string; samples: unknown[]; types: string[] }

/** Sample distinct fields + example values from the tenant's committed_data row_data for one data_type. */
async function sampleFields(sb: SupabaseClient, tenantId: string, dataType: string): Promise<SampledField[]> {
  const { data } = await sb.from('committed_data').select('row_data')
    .eq('tenant_id', tenantId).eq('data_type', dataType).limit(50);
  const acc = new Map<string, { samples: unknown[]; types: Set<string> }>();
  for (const r of (data ?? []) as any[]) {
    const rd = r.row_data || {};
    for (const k in rd) {
      let e = acc.get(k);
      if (!e) { e = { samples: [], types: new Set() }; acc.set(k, e); }
      if (e.samples.length < 3) e.samples.push(rd[k]);
      e.types.add(typeof rd[k]);
    }
  }
  return Array.from(acc.entries()).map(([field, e]) => ({ field, samples: e.samples, types: Array.from(e.types) }));
}

/** Distinct data_types for the tenant (each sheet/content unit classifies to one structural class). */
async function distinctDataTypes(sb: SupabaseClient, tenantId: string): Promise<string[]> {
  const { data } = await sb.from('committed_data').select('data_type').eq('tenant_id', tenantId).limit(5000);
  const s = new Set<string>();
  for (const r of (data ?? []) as any[]) if (r.data_type) s.add(r.data_type);
  return Array.from(s);
}

/** LLM (temp 0) produces the FREE-FORM comprehension artifact per field (recognition, C1). One batched
 *  call for all fields of a data_type. `hints` carries any prior free-form note (read-only, never rewritten). */
async function comprehendFields(
  fields: SampledField[], dataType: string, hints: Record<string, string>,
): Promise<Record<string, Omit<ComprehensionArtifact, 'field_name'>>> {
  const system = [
    'You comprehend data fields for a domain-agnostic intelligence platform. You are given the fields of',
    `one data set (data_type="${dataType}") with sample values. For EACH field, describe IN YOUR OWN WORDS`,
    "(free-form — there is no fixed list to choose from; use the data's own language):",
    '- characterization: what this field MEANS (what it measures / identifies / represents).',
    '- data_nature: the nature of the value (units, whether it accumulates, its granularity) — or null.',
    '- relationships: how it relates to other fields (comparisons, ratios, groupings) — or null.',
    '- aggregation_behavior: how this field should be aggregated across rows and WHY (e.g. summed across',
    '  entities, averaged, a point-in-time last value, a count) — describe the behavior, do not pick a code.',
    '- identifies: if this field IDENTIFIES an entity (a person, a location, an account, ...), describe what',
    '  kind of entity it identifies; otherwise null.',
    'Return ONLY a JSON object: { "<field>": { "characterization","data_nature","relationships",',
    '"aggregation_behavior","identifies" }, ... }. No prose, no code fences. Any field may be null except characterization.',
  ].join('\n');
  // One batched call over a field subset (8000-token headroom; parseJsonObjectTolerant salvages complete
  // entries on truncation). Pulled out so incomplete coverage can be RETRIED (C2, HF-337 1b).
  const callOnce = async (subset: SampledField[]): Promise<Record<string, any>> => {
    const payload = subset.map((f) => ({ field: f.field, samples: f.samples, prior_note: hints[f.field] ?? null }));
    const text = await streamAnthropicText({ model: MODEL, system, user: JSON.stringify(payload), maxTokens: 8000, label: `comprehend:${dataType}` });
    return parseJsonObjectTolerant(stripFences(text));
  };
  let parsed = await callOnce(fields);
  // C2 (HF-337 1b): incomplete field coverage (truncated comprehension) is a STRUCTURED FAILURE — log the
  // named shortfall and RETRY the missing fields. Never silently persist partial comprehension as success.
  let missing = fields.filter((f) => !parsed[f.field]);
  if (missing.length > 0) {
    console.warn(`[HF-337] comprehension.incomplete_coverage data_type=${dataType} expected=${fields.length} received=${fields.length - missing.length} missing=[${missing.map((f) => f.field).join(', ')}] — retrying missing fields`);
    try {
      parsed = { ...parsed, ...(await callOnce(missing)) };
      missing = fields.filter((f) => !parsed[f.field]);
    } catch (e) {
      console.warn(`[HF-337] comprehension retry failed: ${e instanceof Error ? e.message : e}`);
    }
  }
  if (missing.length > 0) {
    // Surface the residual shortfall (these use the field-name fallback below) — flagged, not silent.
    console.warn(`[HF-337] comprehension.uncharacterized_after_retry data_type=${dataType} fields=[${missing.map((f) => f.field).join(', ')}] — field-name fallback (logged, not silent)`);
  }
  const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const out: Record<string, Omit<ComprehensionArtifact, 'field_name'>> = {};
  for (const k in parsed) {
    const v = parsed[k] || {};
    out[k] = {
      characterization: str(v.characterization) ?? k, // NOT NULL column; fall back to the field name itself
      data_nature: str(v.data_nature),
      relationships: str(v.relationships),
      aggregation_behavior: str(v.aggregation_behavior),
      identifies: str(v.identifies),
    };
  }
  return out;
}

/** Read prior free-form characterizations as HINTS only (never rewritten — C0/Obj 3). HF-336 stored a
 *  contextualIdentity per column inside input_bindings; OB-231 made that slot free-form. We pass it to the
 *  LLM as a prior note. This is a READ of input_bindings for a hint; it is never written back. */
async function readHints(sb: SupabaseClient, tenantId: string): Promise<Record<string, string>> {
  const hints: Record<string, string> = {};
  try {
    const { data } = await sb.from('rule_sets').select('input_bindings').eq('tenant_id', tenantId).eq('status', 'active');
    for (const rs of (data ?? []) as any[]) {
      const cb = rs?.input_bindings?.convergence_bindings;
      if (!cb || typeof cb !== 'object') continue;
      for (const comp of Object.values(cb)) {
        if (!comp || typeof comp !== 'object') continue;
        for (const b of Object.values(comp as Record<string, any>)) {
          const col = b?.column; const ci = b?.field_identity?.contextualIdentity;
          if (typeof col === 'string' && typeof ci === 'string' && ci.trim()) hints[col] = ci.trim();
        }
      }
    }
  } catch { /* hints are best-effort */ }
  return hints;
}

export interface ComprehensionGenResult {
  tenantId: string;
  fieldsComprehended: number;
  dataTypes: number;
  sample: ComprehensionArtifact[];
}

/** Generate + persist comprehension for EVERY field of EVERY data_type (C4), idempotent on
 *  (tenant_id, field_name). Plan-independent (C0b). NEVER writes input_bindings (C6). The upsert omits
 *  display_label/aggregation_method so a previously-cached label/method is preserved, never blanked
 *  without replacement (DS-030 §4.2). */
export async function generateComprehension(
  sb: SupabaseClient,
  tenantId: string,
  opts: { sourceImportBatchId?: string | null } = {},
): Promise<ComprehensionGenResult> {
  const dataTypes = await distinctDataTypes(sb, tenantId);
  if (dataTypes.length === 0) return { tenantId, fieldsComprehended: 0, dataTypes: 0, sample: [] };
  const hints = await readHints(sb, tenantId);

  // One batched LLM call PER data_type, run concurrently (HALT-2: never per-field; parallel not serial).
  const perType = await Promise.all(dataTypes.map(async (dt) => {
    const fields = await sampleFields(sb, tenantId, dt);
    if (fields.length === 0) return [] as ComprehensionArtifact[];
    const comp = await comprehendFields(fields, dt, hints);
    return fields.map((f) => ({
      field_name: f.field,
      ...(comp[f.field] ?? { characterization: f.field, data_nature: null, relationships: null, aggregation_behavior: null, identifies: null }),
    }));
  }));

  // dedupe by field_name across data_types (the (tenant_id, field_name) key — Residual 5: a field name
  // assumed to mean one thing per tenant). First occurrence wins.
  const byField = new Map<string, ComprehensionArtifact>();
  for (const arts of perType) for (const a of arts) if (!byField.has(a.field_name)) byField.set(a.field_name, a);
  const artifacts = Array.from(byField.values());
  if (artifacts.length === 0) return { tenantId, fieldsComprehended: 0, dataTypes: dataTypes.length, sample: [] };

  const now = new Date().toISOString();
  const rows = artifacts.map((a) => ({
    tenant_id: tenantId,
    field_name: a.field_name,
    characterization: a.characterization,
    data_nature: a.data_nature,
    relationships: a.relationships,
    aggregation_behavior: a.aggregation_behavior,
    identifies: a.identifies,
    source_import_batch_id: opts.sourceImportBatchId ?? null,
    updated_at: now,
  }));

  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await sb.from('comprehension_artifacts')
      .upsert(rows.slice(i, i + 500), { onConflict: 'tenant_id,field_name' });
    if (error) throw new Error(`comprehension_artifacts upsert: ${error.message}`);
  }
  return { tenantId, fieldsComprehended: artifacts.length, dataTypes: dataTypes.length, sample: artifacts.slice(0, 5) };
}
