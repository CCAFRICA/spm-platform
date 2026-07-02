// OB-229 / OB-233 — Summary Engine (write side).
// Production aggregation runs in Postgres via the compute_summary_artifacts RPC (Constraint 5) for
// tenants with NO comprehension yet. Once a tenant has comprehension (OB-233), aggregation runs in JS so
// it can apply (a) semantic display LABELS and (b) per-field aggregation METHODS — both read from
// comprehension_artifacts (NOT input_bindings — C6/C0b). KOREAN TEST: fields are discovered from row_data
// (typeof number); labels/methods are LLM-recognized free-form text, never field-name literals in code.
// C2 (fail-loud): the aggregation executor maps a RECOGNIZED method to a deterministic operation; an
// unrecognized method raises a structured error + a novel-method signal and HALTS — it NEVER silently
// defaults to SUM. C3: no substring inference on the method string (exact normalized match only).

import type { SupabaseClient } from '@supabase/supabase-js';
import { streamAnthropicText, parseJsonObjectTolerant } from '@/lib/ai/anthropic-stream';
import { writeSignalWithClient } from '@/lib/intelligence/canonical-signal-writer'; // OB-235 P1: one canonical surface

/* eslint-disable @typescript-eslint/no-explicit-any */

const MODEL = 'claude-sonnet-4-6';

export interface CommittedRow {
  entity_id: string | null;
  source_date: string | null;
  data_type: string | null;
  row_data: Record<string, unknown> | null;
}

export interface AggregatedArtifact {
  entity_id: string;
  summary_date: string;
  data_type: string | null;
  metrics: Record<string, number>;
  row_count: number;
}

export interface SemanticMaps {
  labelMap: Record<string, string>;  // field_name -> display_label (semantic relabel)
  methodMap: Record<string, string>; // field_name -> aggregation_method (LLM-recognized)
}

const keyOf = (entityId: string, date: string, dataType: string | null) => `${entityId}|${date}|${dataType ?? ''}`;

/** Raised when a RECOGNIZED aggregation method has no deterministic operation (C2 fail-loud — the engine
 *  records a novel-method signal and HALTS rather than silently summing). */
export class NovelAggregationMethodError extends Error {
  constructor(public readonly method: string, public readonly field: string) {
    super(`OB-233 C2: novel aggregation method "${method}" for field "${field}" — no deterministic operation; HALT (never silent SUM)`);
    this.name = 'NovelAggregationMethodError';
  }
}

interface MetricAcc { sum: number; count: number; first: number; last: number; min: number; max: number; distinct: Set<number> }

/**
 * Execute one field's aggregation from its accumulator per the RECOGNIZED method (C2 fail-loud dispatch).
 * - No method (field not yet comprehended): carry-everything baseline = SUM (C4). This is NOT the
 *   C2-prohibited "silent default on a recognized value" — there is no recognized value to dispatch on.
 * - Recognized method: exact normalized match to a deterministic operation (C3: no substring inference).
 * - Recognized-but-unexecutable method: THROW (caller logs a novel-method signal + HALTs).
 */
function finalizeMetric(method: string | undefined, acc: MetricAcc, field: string): number {
  if (!method) return acc.sum;
  const m = method.trim().toLowerCase().replace(/[\s-]+/g, '_');
  switch (m) {
    case 'sum': case 'total': case 'summation': case 'cumulative': return acc.sum;
    case 'average': case 'mean': case 'avg': return acc.count ? acc.sum / acc.count : 0;
    case 'last': case 'latest': case 'closing': case 'ending': case 'last_value': case 'point_in_time': return acc.last;
    case 'first': case 'earliest': case 'opening': case 'beginning': case 'first_value': return acc.first;
    case 'min': case 'minimum': case 'lowest': return acc.min;
    case 'max': case 'maximum': case 'highest': case 'peak': return acc.max;
    case 'count': return acc.count;
    case 'distinct_count': case 'unique_count': case 'distinct': return acc.distinct.size;
    default:
      throw new NovelAggregationMethodError(method, field); // C2: fail loud, never silent SUM
  }
}

/**
 * Method-aware aggregation per (entity, day, data_type). Field names come ONLY from the data (Korean
 * Test). T1-E902: every numeric field is aggregated (C4). `labelMap` relabels the metric key to its
 * semantic display label; `methodMap` selects each field's aggregation operation (fail-loud, C2).
 */
// HF-373 Phase F (D8): the aggregation is split into an incremental accumulator + a finalizer so
// the paged read can feed rows page-by-page and RELEASE them (pre-HF-373 backfillSummariesJs
// retained the tenant's ENTIRE row set in memory — the DIAG-078 OOM class). Group state is bounded
// by (entities × days × data_types), not row count. aggregateCommittedRows remains the one-shot
// composition of the two (same behavior, existing tests unchanged).
export type AggregationState = Map<string, { meta: { entity_id: string; summary_date: string; data_type: string | null }; rowCount: number; fields: Map<string, MetricAcc> }>;

export function createAggregationState(): AggregationState {
  return new Map();
}

/** Feed one page of rows into the state. Returns how many rows were skipped (no entity/day placement). */
export function accumulateCommittedRows(groups: AggregationState, rows: CommittedRow[]): number {
  let skipped = 0;
  for (const r of rows) {
    if (!r.entity_id || !r.source_date) { skipped += 1; continue; } // HALT-2 / Residual-4: cannot place per-entity/day
    const k = keyOf(r.entity_id, r.source_date, r.data_type ?? null);
    let g = groups.get(k);
    if (!g) { g = { meta: { entity_id: r.entity_id, summary_date: r.source_date, data_type: r.data_type ?? null }, rowCount: 0, fields: new Map() }; groups.set(k, g); }
    g.rowCount += 1;
    const rd = r.row_data || {};
    for (const field in rd) {
      const v = rd[field];
      if (typeof v === 'number' && Number.isFinite(v)) {
        let a = g.fields.get(field);
        if (!a) { a = { sum: 0, count: 0, first: v, last: v, min: v, max: v, distinct: new Set() }; g.fields.set(field, a); }
        a.sum += v; a.count += 1; a.last = v; if (v < a.min) a.min = v; if (v > a.max) a.max = v; a.distinct.add(v);
        // a.first stays the first row's value (set at accumulator creation)
      }
    }
  }
  return skipped;
}

/** Finalize the state into artifacts (throws NovelAggregationMethodError — C2 — on a novel method). */
export function finalizeAggregatedArtifacts(
  groups: AggregationState,
  labelMap?: Record<string, string>,
  methodMap?: Record<string, string>,
): AggregatedArtifact[] {
  const out: AggregatedArtifact[] = [];
  for (const g of Array.from(groups.values())) {
    const metrics: Record<string, number> = {};
    for (const [field, acc] of Array.from(g.fields)) {
      const value = finalizeMetric(methodMap?.[field], acc, field); // throws on novel method (C2)
      const key = labelMap?.[field] ?? field;                       // semantic relabel (or raw key)
      metrics[key] = (metrics[key] ?? 0) + value;                  // same-label fields combine (HF-336)
    }
    out.push({ entity_id: g.meta.entity_id, summary_date: g.meta.summary_date, data_type: g.meta.data_type, metrics, row_count: g.rowCount });
  }
  return out;
}

export function aggregateCommittedRows(
  rows: CommittedRow[],
  labelMap?: Record<string, string>,
  methodMap?: Record<string, string>,
): AggregatedArtifact[] {
  const groups = createAggregationState();
  accumulateCommittedRows(groups, rows);
  return finalizeAggregatedArtifacts(groups, labelMap, methodMap);
}

/**
 * OB-233 Obj 4 — read the tenant's comprehension into {field -> display_label} + {field -> method}.
 * Reads comprehension_artifacts (NOT input_bindings — C6/C0b). Empty maps when no comprehension exists
 * (the engine then takes the raw-key SQL RPC path, unchanged from OB-229).
 */
export async function buildSemanticMaps(sb: SupabaseClient, tenantId: string): Promise<SemanticMaps> {
  const labelMap: Record<string, string> = {};
  const methodMap: Record<string, string> = {};
  const { data } = await sb.from('comprehension_artifacts')
    .select('field_name, display_label, aggregation_method').eq('tenant_id', tenantId);
  for (const r of (data ?? []) as any[]) {
    if (typeof r.display_label === 'string' && r.display_label.trim()) labelMap[r.field_name] = r.display_label.trim();
    if (typeof r.aggregation_method === 'string' && r.aggregation_method.trim()) methodMap[r.field_name] = r.aggregation_method.trim();
  }
  return { labelMap, methodMap };
}

/**
 * OB-233 Obj 4 — ONE batched LLM call (temp 0, cached; C1) that recognizes a concise display_label + an
 * aggregation_method per field FROM its free-form characterization/aggregation_behavior, and writes them
 * back onto the comprehension row. Idempotent: only fields missing a label or method are sent. The
 * RECOGNIZED method is dispatched fail-loud at aggregation time (C2) — recognition here is free-form (C0).
 */
export async function recognizeLabelsAndMethods(sb: SupabaseClient, tenantId: string): Promise<number> {
  const { data } = await sb.from('comprehension_artifacts')
    .select('field_name, characterization, aggregation_behavior, display_label, aggregation_method')
    .eq('tenant_id', tenantId);
  const rows = (data ?? []) as any[];
  const pending = rows.filter((r) => !r.display_label || !r.aggregation_method);
  if (pending.length === 0) return 0;

  const system = [
    'You are given comprehended data fields, each with a free-form characterization and an',
    'aggregation_behavior description. For EACH field produce:',
    "- display_label: a concise human-readable label (a few words) in the data's own language.",
    '- aggregation_method: a single concise word for HOW to aggregate the field across rows, taken from',
    '  what its aggregation_behavior describes (for example: sum, average, last, first, min, max, count).',
    '  If the behavior is additive, use "sum". Choose the word that best fits the described behavior.',
    'Return ONLY a JSON object { "<field>": { "display_label","aggregation_method" }, ... }. No prose, no code fences.',
  ].join('\n');
  const payload = pending.map((r) => ({ field: r.field_name, characterization: r.characterization, aggregation_behavior: r.aggregation_behavior }));
  const text = await streamAnthropicText({ model: MODEL, system, user: JSON.stringify(payload), maxTokens: 8000, label: 'label+method' });
  const parsed = parseJsonObjectTolerant(text);
  const now = new Date().toISOString();
  let updated = 0;
  for (const r of pending) {
    const v = parsed[r.field_name];
    const label = typeof v?.display_label === 'string' && v.display_label.trim() ? v.display_label.trim() : null;
    const method = typeof v?.aggregation_method === 'string' && v.aggregation_method.trim() ? v.aggregation_method.trim() : null;
    if (!label && !method) continue;
    const patch: Record<string, unknown> = { updated_at: now };
    if (label) patch.display_label = label;
    if (method) patch.aggregation_method = method;
    const { error } = await sb.from('comprehension_artifacts').update(patch).eq('tenant_id', tenantId).eq('field_name', r.field_name);
    if (!error) updated += 1;
  }
  return updated;
}

/**
 * Production path: the SQL aggregation RPC (architect-applied migration). Sums ALL numeric fields under
 * raw keys. Used only when the tenant has NO comprehension. Returns null if the RPC is not present.
 */
export async function runSummaryEngineRpc(
  sb: SupabaseClient,
  tenantId: string,
): Promise<{ written: number; skipped: number } | null> {
  const { data, error } = await sb.rpc('compute_summary_artifacts', { p_tenant_id: tenantId });
  if (error) {
    console.warn('[OB-229] compute_summary_artifacts RPC unavailable/failed:', error.message);
    return null;
  }
  const row = (Array.isArray(data) ? data[0] : data) as any;
  return { written: row?.artifacts_written ?? 0, skipped: row?.rows_skipped ?? 0 };
}

/**
 * JS aggregation + idempotent upsert (the comprehension-aware path). Applies labelMap + methodMap.
 * On a novel aggregation method it records a signal and re-throws (C2 HALT) — never writes a wrong summary.
 * Pages committed_data to respect the PostgREST 1000-row cap.
 */
export async function backfillSummariesJs(
  sb: SupabaseClient,
  tenantId: string,
  labelMap: Record<string, string>,
  methodMap: Record<string, string>,
  log: (m: string) => void = () => {},
): Promise<{ written: number; skipped: number; scanned: number }> {
  // HF-373 Phase F (D8): KEYSET pagination + incremental aggregation. The pre-HF-373 shape —
  // `.order('id')` (uuid PK, no (tenant_id, id) composite index) + OFFSET `.range()` + full row
  // retention — timed out structurally: even a 186-row tenant's PAGE 0 exceeded the ~8s statement
  // timeout on the 672K-row shared table (the planner walks the whole table in id order), and a
  // 263K-row tenant died of OFFSET depth (timeout from offset ~50K), while every page's rows were
  // retained in memory (DIAG-078 OOM class). Keyset (`.gt('id', last)`) makes every page an index
  // range scan under the 20260704_hf373 composite index, no page re-sorts prior pages, and each
  // page is released after accumulation. A failure here still throws — finalize-import surfaces it
  // on the job record (never a silent pass).
  const PAGE = 1000;
  let scanned = 0;
  let skipped = 0;
  let lastId: string | null = null;
  const groups = createAggregationState();
  for (;;) {
    let q = sb
      .from('committed_data')
      .select('id, entity_id, source_date, data_type, row_data')
      .eq('tenant_id', tenantId)
      .order('id', { ascending: true })
      .limit(PAGE);
    if (lastId) q = q.gt('id', lastId);
    const { data, error } = await q;
    if (error) throw new Error(`committed_data read: ${error.message}`);
    if (!data || data.length === 0) break;
    scanned += data.length;
    skipped += accumulateCommittedRows(groups, data as CommittedRow[]);
    lastId = (data[data.length - 1] as { id: string }).id;
    log(`scanned ${scanned}`);
    if (data.length < PAGE) break;
  }

  let artifacts: AggregatedArtifact[];
  try {
    artifacts = finalizeAggregatedArtifacts(groups, labelMap, methodMap);
  } catch (err) {
    if (err instanceof NovelAggregationMethodError) {
      // C2 fail-loud: record a novel-method signal on the open-vocabulary surface, then HALT.
      try {
        await writeSignalWithClient({
          tenantId, entityId: null,
          signalType: 'summary.novel_aggregation_method',
          signalValue: { method: err.method, field: err.field },
          source: 'summary-engine', context: { halt: true },
        }, sb);
      } catch { /* signal logging is best-effort; the HALT below is the contract */ }
    }
    throw err;
  }

  // idempotent replace (Constraint 6)
  const { error: delErr } = await sb.from('summary_artifacts').delete().eq('tenant_id', tenantId);
  if (delErr) throw new Error(`summary_artifacts delete: ${delErr.message}`);

  let written = 0;
  const now = new Date().toISOString();
  for (let i = 0; i < artifacts.length; i += 500) {
    const batch = artifacts.slice(i, i + 500).map((a) => ({
      tenant_id: tenantId,
      entity_id: a.entity_id,
      summary_date: a.summary_date,
      period_id: null,
      data_type: a.data_type,
      metrics: a.metrics,
      row_count: a.row_count,
      computed_at: now,
      created_at: now,
    }));
    const { error } = await sb.from('summary_artifacts').insert(batch);
    if (error) throw new Error(`summary_artifacts insert: ${error.message}`);
    written += batch.length;
    log(`inserted ${written}/${artifacts.length}`);
  }
  return { written, skipped, scanned };
}

/**
 * Engine entry point (import-trigger + admin API). OB-233: recognize labels+methods (cached), then read
 * the comprehension maps. A tenant WITH comprehension takes the JS path (semantic keys + method-aware,
 * fail-loud). A tenant WITHOUT comprehension keeps the fast raw-key SQL RPC (unchanged from OB-229).
 */
export async function runSummaryEngine(
  sb: SupabaseClient,
  tenantId: string,
  log: (m: string) => void = () => {},
): Promise<{ written: number; skipped: number; via: 'rpc' | 'js' }> {
  try {
    const n = await recognizeLabelsAndMethods(sb, tenantId);
    if (n > 0) log(`recognized label+method for ${n} fields`);
  } catch (err) {
    log(`label/method recognition failed (continuing): ${err instanceof Error ? err.message : err}`);
  }
  const { labelMap, methodMap } = await buildSemanticMaps(sb, tenantId);
  if (Object.keys(labelMap).length === 0 && Object.keys(methodMap).length === 0) {
    const rpc = await runSummaryEngineRpc(sb, tenantId);
    if (rpc) return { ...rpc, via: 'rpc' };
  }
  const js = await backfillSummariesJs(sb, tenantId, labelMap, methodMap, log);
  return { written: js.written, skipped: js.skipped, via: 'js' };
}
