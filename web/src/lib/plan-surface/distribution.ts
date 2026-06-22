/* eslint-disable @typescript-eslint/no-explicit-any */ // OB-228: data layer walks untyped rule_sets.components / committed_data.row_data JSONB (substrate is dynamic by design)
/**
 * OB-228 — getComponentDistribution (Concept ① real-data overlay).
 *
 * Buckets the tenant's actual entities/transactions against a component's prime-DAG
 * structure, for one period. AGGREGATED SERVER-SIDE (§A.2): fetches the period's
 * committed rows once (source_date-scoped — Phase 1: period_id is NULL on MIR data),
 * aggregates in process, returns BUCKET COUNTS ONLY — never a per-row payload to the
 * client. If the component's bound column is absent from committed_data (HALT-2),
 * returns resolved=false with an empty bucket set + note — NEVER a fabricated bucket.
 *
 * Scale note (DS-029 §8 / DIAG-075): in-process aggregation over a period-scoped,
 * single-purpose fetch is correct-shape at current + 10x volume; SQL GROUP-BY
 * (RPC/view) is the enterprise follow-up. Hard fetch cap guards a runaway.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { createClient } from '@/lib/supabase/client';
import { getPlanStructure } from './structure';
import { analyzeComponent } from './prime-dag-view';
import type { ComponentDistribution, DistributionBucket } from './types';

const FETCH_CAP = 80_000; // runaway guard; MIR period max ~13K
const PAGE = 1000;
const MAX_BUCKETS = 12;

const numOf = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v))) return Number(v);
  return null;
};

export async function getComponentDistribution(
  ruleSetId: string,
  componentId: string,
  periodId: string,
  client?: SupabaseClient<Database>,
): Promise<ComponentDistribution> {
  const sb = client ?? createClient();
  const empty = (note: string, measureColumn: string | null = null): ComponentDistribution =>
    ({ componentId, periodId, buckets: [], totalEntities: 0, resolved: false, measureColumn, grain: 'row', note });

  // 1. resolve component + tenant + period window
  const { data: rs } = await sb.from('rule_sets').select('id, tenant_id').eq('id', ruleSetId).maybeSingle();
  const tenantId = (rs as any)?.tenant_id as string | undefined;
  if (!tenantId) return empty('rule_set not found');

  const plan = await getPlanStructure(ruleSetId, sb);
  const component = plan?.variants.flatMap((v) => v.components).find((c) => c.id === componentId);
  if (!component) return empty('component not found');
  const view = analyzeComponent(component);

  const { data: period } = await sb.from('periods').select('start_date, end_date').eq('id', periodId).maybeSingle();
  if (!period) return empty('period not found');

  // 2. determine the columns we need
  const groupCol = view.scopeBoundary;            // per-entity rollup key, if any
  const bandCol = view.bandReferenceField;        // band key, if banded
  const measureCol = view.measureField;           // numeric/categorical measure
  const need = [groupCol, bandCol, measureCol].filter(Boolean) as string[];
  if (need.length === 0) return empty('component has no resolvable field reference');

  // 3. fetch the period's rows (source_date scoped), only those carrying a needed column
  const rows: Record<string, unknown>[] = [];
  for (let offset = 0; offset < FETCH_CAP; offset += PAGE) {
    const { data, error } = await sb
      .from('committed_data')
      .select('row_data')
      .eq('tenant_id', tenantId)
      .gte('source_date', (period as any).start_date)
      .lte('source_date', (period as any).end_date)
      .order('source_date', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) return empty(`query error: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const r of data) {
      const rd = (r as any).row_data as Record<string, unknown>;
      if (rd && need.some((c) => c in rd)) rows.push(rd);
    }
    if (data.length < PAGE) break;
  }

  if (rows.length === 0) return empty(`no committed rows in period carry [${need.join(', ')}] — binding unresolved (HALT-2)`, measureCol);

  // 4. bucket by structure
  // 4a. scope rollup → per-entity aggregate, then band/bin
  if (groupCol && rows.some((r) => groupCol in r)) {
    const groups = new Map<string, number>();
    for (const r of rows) {
      const key = String(r[groupCol] ?? '∅');
      if (!(groupCol in r)) continue;
      const op = view.measureVia?.split(':')[1] ?? 'sum';
      const cur = groups.get(key);
      if (op === 'count') groups.set(key, (cur ?? 0) + 1);
      else {
        const v = measureCol ? numOf(r[measureCol]) : 1;
        if (v !== null) groups.set(key, (cur ?? 0) + v);
        else if (cur === undefined) groups.set(key, 0);
      }
    }
    const values = Array.from(groups.values());
    const buckets = view.breaks?.length ? bandBuckets(values, view.breaks) : binBuckets(values);
    return { componentId, periodId, buckets, totalEntities: groups.size, resolved: true, measureColumn: measureCol, grain: 'entity', note: `${groups.size} ${groupCol} grouped by ${view.measureVia ?? 'sum'}(${measureCol ?? '—'})` };
  }

  // 4b. banded reference → bucket rows by band value
  if (bandCol && rows.some((r) => bandCol in r)) {
    const present = rows.filter((r) => bandCol in r);
    const vals = present.map((r) => r[bandCol]);
    const numeric = vals.filter((v) => numOf(v) !== null);
    if (view.breaks?.length && numeric.length >= present.length * 0.5) {
      const buckets = bandBuckets(numeric.map((v) => numOf(v)!), view.breaks, view.bandOutputs ?? undefined);
      return { componentId, periodId, buckets, totalEntities: present.length, resolved: true, measureColumn: bandCol, grain: 'row', note: `transactions across ${bandCol} bands` };
    }
    return { componentId, periodId, buckets: categoricalBuckets(vals), totalEntities: present.length, resolved: true, measureColumn: bandCol, grain: 'row', note: `transactions across ${bandCol} values` };
  }

  // 4c. categorical/filter measure → distinct-value buckets
  if (measureCol && rows.some((r) => measureCol in r)) {
    const present = rows.filter((r) => measureCol in r);
    const vals = present.map((r) => r[measureCol]);
    const numeric = vals.filter((v) => numOf(v) !== null);
    if (numeric.length >= present.length * 0.6 && new Set(numeric.map((v) => numOf(v))).size > MAX_BUCKETS) {
      return { componentId, periodId, buckets: binBuckets(numeric.map((v) => numOf(v)!)), totalEntities: present.length, resolved: true, measureColumn: measureCol, grain: 'row', note: `distribution of ${measureCol}` };
    }
    return { componentId, periodId, buckets: categoricalBuckets(vals), totalEntities: present.length, resolved: true, measureColumn: measureCol, grain: 'row', note: `distribution of ${measureCol}` };
  }

  return empty(`bound column not present in period rows (HALT-2)`, measureCol);
}

// ── bucketers ──

function bandBuckets(values: number[], breaks: number[], outputs?: (number | string)[]): DistributionBucket[] {
  const sorted = [...breaks].sort((a, b) => a - b);
  const counts = new Array(sorted.length + 1).fill(0);
  for (const v of values) {
    let idx = sorted.findIndex((b) => v < b);
    if (idx === -1) idx = sorted.length;
    counts[idx]++;
  }
  return counts.map((entityCount, i) => {
    const lo = i === 0 ? undefined : sorted[i - 1];
    const hi = i < sorted.length ? sorted[i] : undefined;
    const base = lo === undefined ? `< ${fmt(hi!)}` : hi === undefined ? `≥ ${fmt(lo)}` : `${fmt(lo)}–${fmt(hi)}`;
    const out = outputs && outputs[i] !== undefined ? ` (${typeof outputs[i] === 'number' ? rate(outputs[i] as number) : outputs[i]})` : '';
    return { label: base + out, rangeMin: lo, rangeMax: hi, entityCount };
  });
}

function binBuckets(values: number[], binCount = 8): DistributionBucket[] {
  if (values.length === 0) return [];
  const min = Math.min(...values), max = Math.max(...values);
  if (min === max) return [{ label: fmt(min), rangeMin: min, rangeMax: max, entityCount: values.length }];
  const width = (max - min) / binCount;
  const buckets: DistributionBucket[] = [];
  for (let i = 0; i < binCount; i++) {
    const lo = min + i * width;
    const hi = i === binCount - 1 ? max : min + (i + 1) * width;
    const count = values.filter((v) => (i === binCount - 1 ? v >= lo && v <= hi : v >= lo && v < hi)).length;
    buckets.push({ label: `${fmt(lo)}–${fmt(hi)}`, rangeMin: lo, rangeMax: hi, entityCount: count });
  }
  return buckets;
}

function categoricalBuckets(values: unknown[]): DistributionBucket[] {
  const counts = new Map<string, number>();
  for (const v of values) {
    const k = v === null || v === undefined || v === '' ? '∅' : String(v);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  if (sorted.length <= MAX_BUCKETS) return sorted.map(([label, entityCount]) => ({ label, entityCount }));
  const top = sorted.slice(0, MAX_BUCKETS - 1).map(([label, entityCount]) => ({ label, entityCount }));
  const other = sorted.slice(MAX_BUCKETS - 1).reduce((s, [, c]) => s + c, 0);
  return [...top, { label: 'Other', entityCount: other }];
}

function fmt(n: number): string {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (a >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  if (a < 1 && a > 0) return n.toFixed(3);
  return String(Math.round(n));
}
function rate(n: number): string { return Math.abs(n) <= 1 ? `${(n * 100).toFixed(1)}%` : String(n); }
