/**
 * OB-224 — getEntityResults: the top drill-through layer (entity → payout grid).
 *
 * Reads the materialized entity_period_outcomes when present (one row per entity+period with
 * total_payout + component_breakdown), and falls back to calculation_results grouped by entity
 * when a period has no materialized outcomes (substrate §3.1: outcomes exist for Meridian/BCL/MIR
 * only). Scope-aware: an empty scope.visibleEntityIds means "all" (admin). Korean Test: entity
 * labels and component names come from the DATA.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { createClient } from '@/lib/supabase/client';
import type { EntityResult, EntityScope, PeriodOption } from './types';

const num = (v: unknown): number =>
  typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v)) ? Number(v) : 0;

const asObj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/**
 * component_breakdown / components is stored either as an array of component objects
 * ({componentName|name, payout}) or as a flat name→number record. Normalize to a record.
 */
function breakdownToRecord(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (Array.isArray(v)) {
    for (const el of v) {
      const o = asObj(el);
      const name = String(o.componentName ?? o.name ?? '').trim();
      if (name) out[name] = num(o.payout);
    }
  } else if (v && typeof v === 'object') {
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (typeof val === 'number') out[k] = val;
      else {
        const o = asObj(val);
        if ('payout' in o) out[k] = num(o.payout);
      }
    }
  }
  return out;
}

interface PartialResult {
  entityId: string;
  periodId: string;
  totalPayout: number;
  lifecycleState: string | null;
  breakdown: unknown;
}

/** Join entity display labels + period labels onto partial rows and finalize the EntityResult shape. */
async function decorate(
  sb: SupabaseClient<Database>,
  rows: PartialResult[],
): Promise<EntityResult[]> {
  const entityIds = Array.from(new Set(rows.map(r => r.entityId)));
  const periodIds = Array.from(new Set(rows.map(r => r.periodId).filter(Boolean)));

  const entityById = new Map<string, { external_id: string | null; display_name: string | null }>();
  for (let i = 0; i < entityIds.length; i += 300) {
    const chunk = entityIds.slice(i, i + 300);
    const { data } = await sb.from('entities').select('id, external_id, display_name').in('id', chunk);
    for (const e of data ?? []) entityById.set(e.id as string, { external_id: e.external_id as string | null, display_name: e.display_name as string | null });
  }
  const periodById = new Map<string, string>();
  if (periodIds.length) {
    const { data } = await sb.from('periods').select('id, label').in('id', periodIds as string[]);
    for (const p of data ?? []) periodById.set(p.id as string, (p.label as string) ?? (p.id as string));
  }

  return rows
    .map(r => {
      const ent = entityById.get(r.entityId);
      const breakdown = breakdownToRecord(r.breakdown);
      return {
        entityId: r.entityId,
        externalId: ent?.external_id ?? r.entityId.slice(0, 8),
        displayName: ent?.display_name ?? ent?.external_id ?? r.entityId.slice(0, 8),
        totalPayout: r.totalPayout,
        componentCount: Object.keys(breakdown).length,
        periodId: r.periodId,
        periodLabel: periodById.get(r.periodId) ?? r.periodId,
        lifecycleState: r.lifecycleState,
        componentBreakdown: Object.keys(breakdown).length ? breakdown : undefined,
      } as EntityResult;
    })
    .sort((a, b) => b.totalPayout - a.totalPayout);
}

export async function getEntityResults(
  tenantId: string,
  scope: EntityScope,
  filters?: { periodId?: string; batchId?: string },
  client?: SupabaseClient<Database>,
): Promise<EntityResult[]> {
  if (!tenantId) return [];
  const sb = client ?? createClient();
  const scoped = scope.visibleEntityIds.length > 0 ? scope.visibleEntityIds : null;

  // Preferred path: materialized entity_period_outcomes for a specific period.
  if (filters?.periodId) {
    let q = sb
      .from('entity_period_outcomes')
      .select('entity_id, period_id, total_payout, component_breakdown, lowest_lifecycle_state')
      .eq('tenant_id', tenantId)
      .eq('period_id', filters.periodId);
    if (scoped) q = q.in('entity_id', scoped);
    const { data: outcomes } = await q;
    if (outcomes && outcomes.length > 0) {
      return decorate(
        sb,
        outcomes.map(o => ({
          entityId: o.entity_id as string,
          periodId: o.period_id as string,
          totalPayout: num(o.total_payout),
          lifecycleState: (o.lowest_lifecycle_state as string | null) ?? null,
          breakdown: o.component_breakdown,
        })),
      );
    }
    // fall through to calculation_results when this period has no materialized outcomes
  }

  // Fallback path: calculation_results grouped by entity (latest result per entity).
  let q = sb
    .from('calculation_results')
    .select('id, entity_id, period_id, batch_id, total_payout, components, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });
  if (filters?.periodId) q = q.eq('period_id', filters.periodId);
  if (filters?.batchId) q = q.eq('batch_id', filters.batchId);
  if (scoped) q = q.in('entity_id', scoped);
  const { data: results } = await q;

  const latestByEntity = new Map<string, PartialResult>();
  for (const r of results ?? []) {
    const entityId = r.entity_id as string;
    if (latestByEntity.has(entityId)) continue; // first = latest (created_at desc)
    latestByEntity.set(entityId, {
      entityId,
      periodId: r.period_id as string,
      totalPayout: num(r.total_payout),
      lifecycleState: null,
      breakdown: r.components,
    });
  }
  return decorate(sb, Array.from(latestByEntity.values()));
}

/**
 * Periods that have calculation results for a tenant, most-recent first. Powers the period
 * selectors on the rebuilt /data/transactions and /insights/my-team surfaces.
 */
export async function getPeriodsWithResults(
  tenantId: string,
  client?: SupabaseClient<Database>,
): Promise<PeriodOption[]> {
  if (!tenantId) return [];
  const sb = client ?? createClient();
  const { data } = await sb.from('calculation_results').select('period_id').eq('tenant_id', tenantId);
  const ids = Array.from(new Set((data ?? []).map(r => r.period_id as string).filter(Boolean)));
  if (!ids.length) return [];
  const { data: periods } = await sb.from('periods').select('id, label, start_date').in('id', ids);
  // OB-227 Fix B: sort by periods.start_date DESC (chronological, Decision 92/93), NOT by label
  // string. A localeCompare on human labels put "November 2025" ahead of "March 2026", freezing
  // every most-recent-first caller (compensation/my-team/analytics/performance/approvals/…) on the
  // wrong period. ISO date strings sort chronologically.
  return (periods ?? [])
    .map(p => ({
      id: p.id as string,
      label: (p.label as string) ?? (p.id as string),
      start_date: (p.start_date as string) ?? undefined,
    }))
    .sort((a, b) => (b.start_date ?? '').localeCompare(a.start_date ?? ''));
}
