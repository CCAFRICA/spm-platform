// OB-232 Objective 3 — Insight Engine (DS-028 Phase 2, Decision 158 / IRA Option A).
// DETERMINISTIC code builds a digest from summary_artifacts (every number already guaranteed by the
// OB-229 Summary Engine). The LLM RECOGNIZES patterns + writes narrative — it never computes a number.
// Every emitted insight passes the EP-2 validator (data-contract + allowable-form) and gets an EP-3
// structural shape before storage in intelligence_artifacts. KOREAN TEST: metric keys flow from the
// data; the prompt + code contain zero field names or domain strings.

import type { SupabaseClient } from '@supabase/supabase-js';
import { getSummaryArtifacts, rollupByEntity, networkTotals, type SummaryArtifact } from '@/lib/summary/summary-read';
import { defaultModel } from '@/lib/ai/model-policy';
import { validateInsight } from './insight-validator';
import { computeInsightShape } from './insight-shape';
import type { GeneratedInsight } from './insight-types';

/* eslint-disable @typescript-eslint/no-explicit-any */

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const round2 = (v: number) => Math.round(v * 100) / 100;
function round2obj(m: Record<string, number>): Record<string, number> {
  const o: Record<string, number> = {};
  for (const k in m) o[k] = round2(m[k]);
  return o;
}

interface EntityMeta { name: string; type: string }

// Deterministic digest: network rollup + per-entity totals + recent-vs-prior deltas. Returns the digest
// the LLM sees AND the set of every numeric it contains (so EP-2 can prove the LLM introduced nothing).
function buildDigest(arts: SummaryArtifact[], entMeta: Map<string, EntityMeta>) {
  const traceable = new Set<number>();
  const add = (v: unknown) => { if (typeof v === 'number' && Number.isFinite(v)) traceable.add(round2(v)); };
  const addObj = (m: Record<string, number>) => Object.values(m).forEach(add);

  const net = networkTotals(arts);
  const networkMetrics = round2obj(net.metrics);
  addObj(networkMetrics); add(net.row_count); add(net.entities); add(net.days);
  const perEntityAvg: Record<string, number> = {};
  for (const k in net.metrics) perEntityAvg[k] = round2(net.metrics[k] / Math.max(net.entities, 1));
  addObj(perEntityAvg);

  const dates = arts.map((a) => a.summary_date).sort();
  const dateRange = { start: dates[0] ?? null, end: dates[dates.length - 1] ?? null };

  const byEnt = rollupByEntity(arts);
  const artsByEnt = new Map<string, SummaryArtifact[]>();
  for (const a of arts) { const x = artsByEnt.get(a.entity_id) ?? []; x.push(a); artsByEnt.set(a.entity_id, x); }

  const sumMetrics = (xs: SummaryArtifact[]) => {
    const m: Record<string, number> = {};
    for (const a of xs) for (const k in a.metrics) m[k] = (m[k] ?? 0) + a.metrics[k];
    return m;
  };

  const entities = Array.from(byEnt.entries()).map(([eid, roll]) => {
    const meta = entMeta.get(eid);
    const list = (artsByEnt.get(eid) ?? []).slice().sort((a, b) => a.summary_date.localeCompare(b.summary_date));
    const mid = Math.floor(list.length / 2);
    const prior = sumMetrics(list.slice(0, mid));
    const recent = sumMetrics(list.slice(mid));
    const total = round2obj(roll.metrics);
    const recentR = round2obj(recent);
    const priorR = round2obj(prior);
    addObj(total); addObj(recentR); addObj(priorR); add(roll.row_count);
    // recent + prior carry the trend signal (LLM derives direction); the per-field delta object is
    // omitted to keep the request compact (a 42KB digest dropped the Anthropic socket).
    return {
      entity_id: eid,
      name: meta?.name ?? eid.slice(0, 8),
      entity_type: meta?.type ?? 'entity',
      row_count: roll.row_count,
      total, recent: recentR, prior: priorR,
    };
  }).sort((a, b) => b.row_count - a.row_count).slice(0, 25); // bound prompt size

  return {
    digest: {
      dateRange,
      network: { entities: net.entities, days: net.days, totalRows: net.row_count, metrics: networkMetrics, perEntityAvg },
      entities,
    },
    traceable,
  };
}

// DS-030 §4.3 — the prompt names NO fixed categories. The LLM characterizes each insight in its own
// words (free-form), so a pattern outside any four boxes (a seasonal cycle, a correlation, a phase
// shift) is emitted, not forced into a label. Korean-Test-clean: no domain/tenant strings, no fixed
// vocabulary the code later matches against.
const SYSTEM = [
  'You are an analytics insight generator for a performance-intelligence platform.',
  'You are given PRE-COMPUTED summary data — every number is already final and correct.',
  'Your job: RECOGNIZE patterns and write concise, human-readable insights.',
  'You must NEVER compute, invent, scale, or alter a number. Every numeric value in data_references',
  'MUST be copied EXACTLY from the provided data. Use entity_id values verbatim from the data, or null',
  'for network-level insights.',
  '',
  'Generate 8-10 CONCISE insights (<=2-sentence narratives). Cover the FULL DIVERSITY of patterns the',
  'data actually shows — do not force every insight into the same shape, and do not limit yourself to a',
  'fixed set of categories. Describe whatever the data reveals.',
  '',
  'For each insight, describe these IN YOUR OWN WORDS (free-form — there is no fixed list to choose from):',
  '- insight_characterization: what KIND of pattern this is, structurally (the nature of the deviation,',
  '  movement, gap, comparison, cycle, or relationship you observed).',
  '- insight_severity: how much it matters and WHY (not a fixed label — explain the magnitude/impact).',
  '- shape_description: a tenant-content-free structural fingerprint of the pattern. Describe its',
  '  structure (scope, direction, magnitude band, timeframe, measure class) with NO entity name, NO',
  '  tenant id, NO metric name, and NO numeric value.',
  '',
  'Return ONLY a JSON array, no prose, no code fences. Each element:',
  '{"insight_characterization","insight_severity","entity_id","entity_type","period_start","period_end",',
  '"title","narrative","data_references":[{"metric","value","delta_pct"}],"shape_description","recommended_action"}',
  'entity_type: a free-form description of what the entity is, or "network" for network-level insights.',
  'period_start/period_end use the dateRange. data_references.value MUST be a number copied from the data.',
].join('\n');

async function callInsightLLM(digest: unknown, model: string): Promise<GeneratedInsight[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
  const body = JSON.stringify({
    model,
    max_tokens: 3500,
    temperature: 0, // C5: recognition layer is semantically stable on reimport
    system: SYSTEM,
    messages: [{ role: 'user', content: `DATA:\n${JSON.stringify(digest)}` }],
  });
  // OB-155: fetch() can drop transiently (UND_ERR_SOCKET) — retry with backoff.
  let res: Response | null = null;
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      res = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body,
      });
      break;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  if (!res) throw new Error(`Anthropic fetch failed after retries: ${lastErr instanceof Error ? lastErr.message : lastErr}`);
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = await res.json() as any;
  const text: string = json?.content?.[0]?.text ?? '';
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start < 0 || end < 0) throw new Error(`No JSON array in LLM response: ${cleaned.slice(0, 200)}`);
  const parsed = JSON.parse(cleaned.slice(start, end + 1));
  return Array.isArray(parsed) ? parsed as GeneratedInsight[] : [];
}

export interface InsightRunResult {
  tenantId: string;
  model: string;
  generated: number;
  stored: number;
  failed: number;
  byType: Record<string, number>;
  failures: string[];
  validated: number;
  samples: Array<{ insight_characterization: string; insight_severity: string; title: string; narrative: string; data_references: unknown; shape: unknown }>;
}

export async function generateInsights(
  sb: SupabaseClient,
  tenantId: string,
  opts: { dataType?: string; dryRun?: boolean } = {},
): Promise<InsightRunResult> {
  const model = defaultModel();
  const arts = await getSummaryArtifacts(sb, tenantId, opts.dataType ? { dataType: opts.dataType } : {});
  if (arts.length === 0) return { tenantId, model, generated: 0, stored: 0, failed: 0, byType: {}, failures: ['no summary_artifacts'], validated: 0, samples: [] };

  const { data: ents } = await sb.from('entities').select('id, display_name, entity_type').eq('tenant_id', tenantId);
  const entMeta = new Map<string, EntityMeta>();
  for (const e of (ents ?? []) as any[]) entMeta.set(e.id, { name: e.display_name, type: e.entity_type });

  const { digest, traceable } = buildDigest(arts, entMeta);
  const insights = await callInsightLLM(digest, model);

  // Data-driven novelty (C0, no registry): the set of characterizations already recorded as flywheel
  // signals. A characterization absent from this set is flagged novel by the validator and logged
  // here (never rejected). entityIds backs the validator's structural entity_id check.
  const entityIds = new Set<string>(entMeta.keys());
  const seenCharacterizations = new Set<string>();
  try {
    const { data: priorSigs } = await sb.from('classification_signals')
      .select('signal_value').eq('tenant_id', tenantId).eq('signal_type', 'insight.characterization');
    for (const s of (priorSigs ?? []) as any[]) {
      const c = s?.signal_value?.characterization;
      if (typeof c === 'string' && c.trim()) seenCharacterizations.add(c.trim());
    }
  } catch { /* novelty is best-effort; never blocks generation */ }

  // idempotent (Constraint 8): replace this tenant's artifacts
  if (!opts.dryRun) await sb.from('intelligence_artifacts').delete().eq('tenant_id', tenantId);

  const byType: Record<string, number> = {};
  const failures: string[] = [];
  const samples: InsightRunResult['samples'] = [];
  let stored = 0;
  let failed = 0;
  let validated = 0;

  for (const ins of insights) {
    const v = validateInsight(ins, traceable, { entityIds, seenCharacterizations });
    if (!v.ok) { failed++; failures.push(...v.failures.slice(0, 2)); continue; }
    const shape = computeInsightShape(ins);
    validated++;
    byType[ins.insight_characterization] = (byType[ins.insight_characterization] ?? 0) + 1;

    // Log a flywheel signal for a never-before-seen characterization (DS-030 §4.2/§4.4): the system
    // learns new pattern-types from the data, with NO developer registry to grow (C0, AP-26).
    if (v.novelCharacterization && !opts.dryRun) {
      seenCharacterizations.add(v.novelCharacterization);
      try {
        await sb.from('classification_signals').insert({
          tenant_id: tenantId,
          entity_id: null, // a pattern-type signal is tenant-scoped, not entity-scoped
          signal_type: 'insight.characterization', // structural namespace (open-vocabulary; never set-validated)
          signal_value: { characterization: v.novelCharacterization, severity: ins.insight_severity, shape: ins.shape_description ?? null },
          source: 'insight-engine',
          context: { novel: true },
        });
      } catch { /* signal logging is best-effort */ }
    }

    if (samples.length < 8) samples.push({ insight_characterization: ins.insight_characterization, insight_severity: ins.insight_severity, title: ins.title, narrative: ins.narrative, data_references: ins.data_references, shape });
    if (opts.dryRun) continue; // validation + shape proven; skip persistence
    const entityId = ins.entity_id && entMeta.has(ins.entity_id) ? ins.entity_id : null; // never store an unknown FK
    // OB-233 §8.5 — writer reconciled to the LIVE intelligence_artifacts schema (the live table is
    // OB-233-aligned: separate shape_description + structural_fingerprint_hash, source, context). The
    // date range is already validated in-memory by validateInsight (structural-coherence) above; only the
    // storage mapping changes. period_id=null (Decision 92). recommended_action/generated_by/period_*
    // are folded into context (jsonb) so no insight data is lost — recommended_action lives in context
    // for now (PC-4: zero consumers; promote to a first-class column when the Performance tier consumes it).
    const { error } = await sb.from('intelligence_artifacts').insert({
      tenant_id: tenantId,
      artifact_type: ins.insight_characterization, // free-form (TEXT column unchanged; no enum)
      severity: ins.insight_severity,              // free-form (TEXT column unchanged; no enum)
      entity_id: entityId,
      entity_type: ins.entity_type ?? (entityId ? entMeta.get(entityId)?.type ?? null : 'network'),
      period_id: null,
      title: ins.title,
      narrative: ins.narrative,
      data_references: ins.data_references ?? [],
      shape_description: shape.shape_description,
      structural_fingerprint_hash: shape.structural_fingerprint_hash,
      source: 'insight-engine',
      context: {
        recommended_action: ins.recommended_action ?? null,
        generated_by: model,
        period_start: ins.period_start || null,
        period_end: ins.period_end || null,
      },
    });
    if (error) { failed++; failures.push(error.message); continue; }
    stored++;
  }

  return { tenantId, model, generated: insights.length, stored, failed, validated, byType, failures: failures.slice(0, 10), samples };
}
