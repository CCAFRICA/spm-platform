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
import { ARTIFACT_TYPES, type GeneratedInsight } from './insight-types';

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

const SYSTEM = [
  'You are an analytics insight generator for a performance-intelligence platform.',
  'You are given PRE-COMPUTED summary data — every number is already final and correct.',
  'Your job: RECOGNIZE patterns and write concise, human-readable insights.',
  'You must NEVER compute, invent, scale, or alter a number. Every numeric value in data_references',
  'MUST be copied EXACTLY from the provided data. Use entity_id values verbatim from the data (or null',
  'for network-level insights, with entity_type "network").',
  '',
  'Generate 8-10 CONCISE insights (≤2-sentence narratives) covering ALL of: "anomaly" (entity far from the network norm or a sharp',
  'recent change), "trend" (sustained recent-vs-prior direction), "coaching" (an underperformer that',
  'could improve — include recommended_action), "benchmark" (top/bottom vs perEntityAvg).',
  'severity is one of: critical, warning, info, positive.',
  '',
  'Return ONLY a JSON array, no prose, no code fences. Each element:',
  '{"artifact_type","severity","entity_id","entity_type","period_start","period_end","title",',
  '"narrative","data_references":[{"metric","value","delta_pct"}],"recommended_action"}',
  'period_start/period_end use the dateRange. data_references.value MUST be a number copied from the data.',
].join('\n');

async function callInsightLLM(digest: unknown, model: string): Promise<GeneratedInsight[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
  const body = JSON.stringify({
    model,
    max_tokens: 3500,
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
  samples: Array<{ artifact_type: string; severity: string; title: string; narrative: string; data_references: unknown; shape: unknown }>;
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

  // idempotent (Constraint 8): replace this tenant's artifacts
  if (!opts.dryRun) await sb.from('intelligence_artifacts').delete().eq('tenant_id', tenantId);

  const byType: Record<string, number> = {};
  const failures: string[] = [];
  const samples: InsightRunResult['samples'] = [];
  let stored = 0;
  let failed = 0;
  let validated = 0;

  for (const ins of insights) {
    const v = validateInsight(ins, traceable);
    if (!v.ok) { failed++; failures.push(...v.failures.slice(0, 2)); continue; }
    const shape = computeInsightShape(ins);
    validated++;
    byType[ins.artifact_type] = (byType[ins.artifact_type] ?? 0) + 1;
    if (samples.length < 8) samples.push({ artifact_type: ins.artifact_type, severity: ins.severity, title: ins.title, narrative: ins.narrative, data_references: ins.data_references, shape });
    if (opts.dryRun) continue; // EP-2 validation + EP-3 shape proven; skip persistence
    const entityId = ins.entity_id && entMeta.has(ins.entity_id) ? ins.entity_id : null; // never store an unknown FK
    const { error } = await sb.from('intelligence_artifacts').insert({
      tenant_id: tenantId,
      artifact_type: ins.artifact_type,
      severity: ins.severity,
      entity_id: entityId,
      entity_type: ins.entity_type ?? (entityId ? entMeta.get(entityId)?.type : 'network'),
      period_start: ins.period_start || null,
      period_end: ins.period_end || null,
      title: ins.title,
      narrative: ins.narrative,
      data_references: ins.data_references ?? [],
      insight_shape: shape,
      recommended_action: ins.recommended_action ?? null,
      generated_by: model,
    });
    if (error) { failed++; failures.push(error.message); continue; }
    stored++;
  }

  // ensure registry coverage is observable
  for (const t of ARTIFACT_TYPES) if (!(t in byType)) byType[t] = byType[t] ?? 0;

  return { tenantId, model, generated: insights.length, stored, failed, validated, byType, failures: failures.slice(0, 10), samples };
}
