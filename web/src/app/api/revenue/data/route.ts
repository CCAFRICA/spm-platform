/**
 * POST /api/revenue/data -- the Revenue agent's ONE serving route (OB-257 O2; ADR minor decisions).
 *
 * Body: { mode, periodId?, dimensionRole?, scopeEntityIds? } -- tenant is SESSION-derived
 * (resolveCallerTenant, OB-246 AP3), never trusted from the body for non-platform callers.
 *
 * MSP invariant: every mode is a small deterministic reduction over the materialized
 * summary_rollups rows (+ entity_period_outcomes / the period_outcomes sentinel for yield).
 * ZERO committed_data access and ZERO recognize() calls at read time -- the resolved roles are
 * read from the revenue_meta rollup row; a tenant with no meta row gets an explicit
 * notMaterialized envelope (C2 absence), never fabricated zeros.
 *
 * KOREAN TEST: no field names here -- 'location'/'category' are role keys (structural vocabulary),
 * dimension members are tenant DATA flowing through untouched.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { resolveCallerTenant } from '@/lib/auth/api-tenant'; // OB-246 AP3 -- session-derived tenant
import { pagedRows } from '@/lib/serving/paged';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isRevenueEnabledForTenant } from '@/lib/revenue/tenant-feature';
import {
  REVENUE_ROLLUP_TYPES,
  type BridgeResponse,
  type ConcentrationResponse,
  type GeographyResponse,
  type MixResponse,
  type PatternsResponse,
  type PulseResponse,
  type ResolvedRevenueRole,
  type RevenueDimensionPoint,
  type RevenueEntityPoint,
  type RevenueEnvelope,
  type RevenueMode,
  type RevenuePeriodPoint,
  type RevenueResponse,
  type RevenueRoleKey,
  type RevenueRoles,
  type RoleAbsence,
  type SellersResponse,
  type YieldResponse,
} from '@/lib/revenue/types';

// ===================================================================
// Helpers (financial-route numeric idiom: display rounding only)
// ===================================================================

function n(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'string') {
    const p = parseFloat(v);
    return isNaN(p) ? 0 : p;
  }
  return 0;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** 4dp for share FRACTIONS (0..1) -- round2 would collapse small shares to 0. */
function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}

const MODES: RevenueMode[] = ['pulse', 'bridge', 'mix', 'sellers', 'concentration', 'yield', 'patterns', 'geography'];

/** SR-39: served to scoped callers in place of tenant-aggregate sections with no entity decomposition. */
const DIMENSION_SCOPE_REASON =
  'dimension rollups aggregate the whole tenant and cannot be entity-scoped; scoped callers receive entity-grain data only';

type Grain = Exclude<RevenueRoleKey, 'measure'> | 'entity';

interface RollupRow {
  data_type: string;
  period_id: string | null;
  entity_id: string | null;
  dimension_role: string | null;
  dimension_member: string | null;
  metrics: Record<string, unknown> | null;
  row_count: number;
}

interface PeriodRow {
  id: string;
  label: string;
  canonical_key: string | null;
  start_date: string;
  end_date: string;
  status: string;
}

interface EntityInfo {
  displayName: string;
  externalId: string | null;
}

// ===================================================================
// Reads (paged; rollup row counts are grain-bounded, not volume-bounded)
// ===================================================================

async function readRollups(sb: SupabaseClient, tenantId: string): Promise<RollupRow[]> {
  try {
    return await pagedRows<RollupRow>((from, to) =>
      sb
        .from('summary_rollups')
        .select('data_type, period_id, entity_id, dimension_role, dimension_member, metrics, row_count')
        .eq('tenant_id', tenantId)
        .in('data_type', Object.values(REVENUE_ROLLUP_TYPES))
        .order('id', { ascending: true })
        .range(from, to),
    );
  } catch (err) {
    throw new Error(`summary_rollups read: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** entities lookup for ids appearing in entityPeriod rollups ONLY (chunked .in reads). */
async function loadEntities(sb: SupabaseClient, ids: string[]): Promise<Map<string, EntityInfo>> {
  const out = new Map<string, EntityInfo>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await sb
      .from('entities')
      .select('id, display_name, external_id')
      .in('id', ids.slice(i, i + 200));
    if (error) throw new Error(`entities read: ${error.message}`);
    for (const e of (data ?? []) as Array<{ id: string; display_name: string; external_id: string | null }>) {
      out.set(e.id, { displayName: e.display_name, externalId: e.external_id ?? null });
    }
  }
  return out;
}

async function readEntityPeriodOutcomes(
  sb: SupabaseClient,
  tenantId: string,
): Promise<Array<{ entity_id: string; period_id: string; total_payout: number }>> {
  try {
    return await pagedRows<{ entity_id: string; period_id: string; total_payout: number }>((from, to) =>
      sb
        .from('entity_period_outcomes')
        .select('entity_id, period_id, total_payout')
        .eq('tenant_id', tenantId)
        .order('id', { ascending: true })
        .range(from, to),
    );
  } catch (err) {
    throw new Error(`entity_period_outcomes read: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ===================================================================
// Envelope construction
// ===================================================================

/** Roles come from the meta rollup row (write-time recognition output) -- NEVER recognize() here. */
function readRolesFromMeta(meta: RollupRow): RevenueRoles {
  const raw = ((meta.metrics ?? {}) as Record<string, unknown>).roles as Record<string, unknown> | undefined;
  const readOne = (key: RevenueRoleKey): ResolvedRevenueRole => {
    const r = raw?.[key] as Record<string, unknown> | undefined;
    if (r && r.status === 'resolved' && typeof r.field_name === 'string') {
      return {
        status: 'resolved',
        field_name: r.field_name,
        display_label: typeof r.display_label === 'string' ? r.display_label : null,
        confidence: typeof r.confidence === 'number' ? r.confidence : 0,
      };
    }
    const reason = r && typeof r.reason === 'string' ? r.reason : 'role not present in the revenue meta rollup';
    return { status: 'unresolved', reason };
  };
  return { measure: readOne('measure'), location: readOne('location'), category: readOne('category') };
}

function rolesToAbsences(roles: RevenueRoles): RoleAbsence[] {
  const out: RoleAbsence[] = [];
  for (const key of Object.keys(roles) as RevenueRoleKey[]) {
    const r = roles[key];
    if (r.status === 'unresolved') out.push({ role: key, reason: r.reason });
  }
  return out;
}

/** C2: a never-materialized tenant gets an explicit envelope with the named reason -- every mode
 *  returns its own empty shape so page components render the absence, not a crash or zeros. */
function notMaterializedResponse(mode: RevenueMode): RevenueResponse {
  const reason = 'revenue rollups have not been materialized for this tenant (activation has not run)';
  const roles: RevenueRoles = {
    measure: { status: 'unresolved', reason },
    location: { status: 'unresolved', reason },
    category: { status: 'unresolved', reason },
  };
  const env: RevenueEnvelope = {
    roles,
    absences: rolesToAbsences(roles),
    periods: [],
    currentPeriodId: null,
    priorPeriodId: null,
    notMaterialized: { reason },
  };
  switch (mode) {
    case 'pulse': return { mode, ...env, pace: { current: 0, trailingMean: null, deltaPct: null, trailingCount: 0 } };
    case 'bridge': return { mode, ...env, dimensionRole: 'entity', current: null, prior: null, deltas: [] };
    case 'mix': return { mode, ...env, dimensionRole: 'entity', composition: [], shifts: [] };
    case 'sellers': return { mode, ...env, entities: [], distribution: { cumulativeShare: [] } };
    case 'concentration': return { mode, ...env, topShares: [], decliners: [] };
    case 'yield': return { mode, ...env, periodYield: [], entityYield: [], componentPayouts: [] };
    case 'patterns': return { mode, ...env, series: [] };
    case 'geography': return { mode, ...env, members: [] };
  }
}

// ===================================================================
// POST -- all 8 modes
// ===================================================================

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      tenantId?: string;
      mode?: string;
      periodId?: string;
      dimensionRole?: Exclude<RevenueRoleKey, 'measure'>;
      scopeEntityIds?: string[];
    };
    const mode = body.mode as RevenueMode | undefined;
    if (!mode || !MODES.includes(mode)) {
      return NextResponse.json({ error: `mode required (one of: ${MODES.join(', ')})` }, { status: 400 });
    }

    const auth = await resolveCallerTenant(body.tenantId);
    if (!auth.ok) return auth.response;
    const tenantId = auth.caller.tenantId;

    // Functional entitlement gate (ADR minor decisions; PRISM precedent): deny, not decorate.
    if (!(await isRevenueEnabledForTenant(tenantId))) {
      return NextResponse.json({ error: 'revenue agent not enabled for tenant' }, { status: 403 });
    }

    const sb = (await createServiceRoleClient()) as unknown as SupabaseClient;
    const rollups = await readRollups(sb, tenantId);
    const metaRow = rollups.find((r) => r.data_type === REVENUE_ROLLUP_TYPES.meta) ?? null;
    if (!metaRow) return NextResponse.json(notMaterializedResponse(mode));

    const roles = readRolesFromMeta(metaRow);
    const absences = rolesToAbsences(roles);

    const epRows = rollups.filter((r) => r.data_type === REVENUE_ROLLUP_TYPES.entityPeriod && r.entity_id && r.period_id);
    // SR-39 (fail-closed): an EXPLICIT scope governs EVERYTHING derivable per entity -- an empty
    // array means "no entities visible" (empty results, never tenant data). Tenant-aggregate data
    // that cannot be decomposed by entity is withheld from scoped callers with a named absence.
    const scope = body.scopeEntityIds;
    const scopedEpRows = scope !== undefined ? epRows.filter((r) => scope.includes(r.entity_id!)) : epRows;

    // Period series: the tenant's periods joined to their revenue_period rollups, ascending by
    // start_date. Only materialized periods appear (a period with no revenue rows has no rollup).
    const { data: periodData, error: perErr } = await sb
      .from('periods')
      .select('id, label, canonical_key, start_date, end_date, status')
      .eq('tenant_id', tenantId)
      .order('start_date', { ascending: true });
    if (perErr) throw new Error(`periods read: ${perErr.message}`);
    const periodRollupByPid = new Map<string, RollupRow>();
    for (const r of rollups) {
      if (r.data_type === REVENUE_ROLLUP_TYPES.period && r.period_id) periodRollupByPid.set(r.period_id, r);
    }
    // SR-39: a scoped caller's period series is recomputed from the SCOPED entityPeriod rollups --
    // the tenant-level revenue_period rows aggregate entities outside the caller's visibility, so
    // serving them would leak tenant totals. scope=[] therefore yields an empty series (fail-closed).
    const scopedPeriodAgg = new Map<string, { primary: number; rowCount: number; entities: Set<string> }>();
    if (scope !== undefined) {
      for (const r of scopedEpRows) {
        const m = (r.metrics ?? {}) as Record<string, unknown>;
        let agg = scopedPeriodAgg.get(r.period_id!);
        if (!agg) {
          agg = { primary: 0, rowCount: 0, entities: new Set() };
          scopedPeriodAgg.set(r.period_id!, agg);
        }
        agg.primary += n(m.primary);
        agg.rowCount += n(m.row_count);
        agg.entities.add(r.entity_id!);
      }
    }
    const periodPoints: RevenuePeriodPoint[] = [];
    for (const p of (periodData ?? []) as PeriodRow[]) {
      if (scope !== undefined) {
        const agg = scopedPeriodAgg.get(p.id);
        if (!agg) continue;
        periodPoints.push({
          periodId: p.id,
          label: p.label,
          canonicalKey: p.canonical_key ?? null,
          startDate: p.start_date,
          endDate: p.end_date,
          status: p.status,
          primary: round2(agg.primary),
          rowCount: agg.rowCount,
          entityCount: agg.entities.size,
        });
        continue;
      }
      const r = periodRollupByPid.get(p.id);
      if (!r) continue;
      const m = (r.metrics ?? {}) as Record<string, unknown>;
      periodPoints.push({
        periodId: p.id,
        label: p.label,
        canonicalKey: p.canonical_key ?? null,
        startDate: p.start_date,
        endDate: p.end_date,
        status: p.status,
        primary: round2(n(m.primary)),
        rowCount: n(m.row_count),
        entityCount: n(m.entity_count),
      });
    }

    // current = latest materialized period (or the explicit periodId); prior = the one before it.
    let currentIdx = periodPoints.length - 1;
    if (body.periodId) {
      const i = periodPoints.findIndex((p) => p.periodId === body.periodId);
      if (i >= 0) currentIdx = i;
    }
    const current = currentIdx >= 0 ? periodPoints[currentIdx] : null;
    const prior = currentIdx >= 1 ? periodPoints[currentIdx - 1] : null;
    const curId = current?.periodId ?? null;
    const priId = prior?.periodId ?? null;

    const envelope: RevenueEnvelope = {
      roles,
      absences,
      periods: periodPoints,
      currentPeriodId: curId,
      priorPeriodId: priId,
    };

    const dimRowsFor = (role: string): RollupRow[] =>
      rollups.filter(
        (r) => r.data_type === REVENUE_ROLLUP_TYPES.dimensionPeriod && r.dimension_role === role && r.period_id && r.dimension_member != null,
      );

    // Grain for bridge/mix: the requested dimension role, else location when resolved, else the
    // entity grain served from entityPeriod rollups with display names.
    const resolveGrain = (): Grain => {
      if (body.dimensionRole === 'location' || body.dimensionRole === 'category') return body.dimensionRole;
      // SR-39: dimension rollups aggregate the whole tenant -- a scoped caller defaults to the
      // entity grain, the only grain that can honor the scope.
      if (scope !== undefined) return 'entity';
      return roles.location.status === 'resolved' ? 'location' : 'entity';
    };

    /** key -> { label, byPeriod } for a grain (dimension members, or entities by display name). */
    const grainSeries = async (grain: Grain): Promise<Map<string, { label: string; byPeriod: Record<string, number> }>> => {
      const out = new Map<string, { label: string; byPeriod: Record<string, number> }>();
      if (grain === 'entity') {
        // entity grain serves the SCOPED rows (SR-39); unscoped callers see every entity unchanged
        const ids = Array.from(new Set(scopedEpRows.map((r) => r.entity_id!)));
        const ents = await loadEntities(sb, ids);
        for (const r of scopedEpRows) {
          const key = r.entity_id!;
          let g = out.get(key);
          if (!g) {
            g = { label: ents.get(key)?.displayName ?? key, byPeriod: {} };
            out.set(key, g);
          }
          g.byPeriod[r.period_id!] = round2((g.byPeriod[r.period_id!] ?? 0) + n((r.metrics ?? {}).primary));
        }
      } else {
        for (const r of dimRowsFor(grain)) {
          const key = r.dimension_member!;
          let g = out.get(key);
          if (!g) {
            g = { label: key, byPeriod: {} };
            out.set(key, g);
          }
          g.byPeriod[r.period_id!] = round2((g.byPeriod[r.period_id!] ?? 0) + n((r.metrics ?? {}).primary));
        }
      }
      return out;
    };

    /** Ranked entity points for the current/prior pair (sellers + concentration share the build). */
    const buildEntityPoints = async (rows: RollupRow[]): Promise<RevenueEntityPoint[]> => {
      const byEntity = new Map<string, Record<string, number>>();
      for (const r of rows) {
        let bp = byEntity.get(r.entity_id!);
        if (!bp) {
          bp = {};
          byEntity.set(r.entity_id!, bp);
        }
        bp[r.period_id!] = round2((bp[r.period_id!] ?? 0) + n((r.metrics ?? {}).primary));
      }
      const ids = Array.from(byEntity.keys());
      const ents = await loadEntities(sb, ids);
      const list = ids.map((id) => {
        const bp = byEntity.get(id)!;
        return {
          entityId: id,
          displayName: ents.get(id)?.displayName ?? id,
          externalId: ents.get(id)?.externalId ?? null,
          primary: curId ? round2(bp[curId] ?? 0) : 0,
          prior: priId ? round2(bp[priId] ?? 0) : null,
          byPeriod: bp,
        };
      });
      list.sort((a, b) => b.primary - a.primary);
      const priorRankOf = new Map<string, number>();
      if (priId) {
        const byPrior = [...list].sort((a, b) => (b.prior ?? 0) - (a.prior ?? 0));
        byPrior.forEach((e, i) => priorRankOf.set(e.entityId, i + 1));
      }
      return list.map((e, i) => ({ ...e, rank: i + 1, priorRank: priId ? (priorRankOf.get(e.entityId) ?? null) : null }));
    };

    // -- pulse: period series + deterministic pace (labeled arithmetic -- current vs the trailing
    // mean of ALL prior materialized periods; no ML claim) ------------------------------------
    if (mode === 'pulse') {
      const trailing = currentIdx > 0 ? periodPoints.slice(0, currentIdx) : [];
      const trailingMean = trailing.length > 0 ? trailing.reduce((s, p) => s + p.primary, 0) / trailing.length : null;
      const currentPrimary = current?.primary ?? 0;
      const res: PulseResponse = {
        mode,
        ...envelope,
        pace: {
          current: round2(currentPrimary),
          trailingMean: trailingMean !== null ? round2(trailingMean) : null,
          deltaPct: trailingMean !== null && trailingMean > 0 ? round2(((currentPrimary - trailingMean) / trailingMean) * 100) : null,
          trailingCount: trailing.length,
        },
      };
      return NextResponse.json(res);
    }

    // -- bridge: per-member current-vs-prior deltas at the resolved grain. Totals are the PERIOD
    // rollup sums (the truth) -- member deltas may not fully bridge them when some rows carry no
    // dimension member (honest partial decomposition). -----------------------------------------
    if (mode === 'bridge') {
      const grain = resolveGrain();
      // SR-39: a scoped caller explicitly requesting a dimension grain gets an empty decomposition
      // with a named absence (pages render absences) -- never the tenant-wide dimension rollups.
      if (scope !== undefined && grain !== 'entity') {
        absences.push({ role: grain, reason: DIMENSION_SCOPE_REASON });
        const res: BridgeResponse = {
          mode,
          ...envelope,
          dimensionRole: grain,
          current: current ? { periodId: current.periodId, total: round2(current.primary) } : null,
          prior: prior ? { periodId: prior.periodId, total: round2(prior.primary) } : null,
          deltas: [],
        };
        return NextResponse.json(res);
      }
      const series = await grainSeries(grain);
      const deltas: BridgeResponse['deltas'] = [];
      for (const [key, g] of Array.from(series.entries())) {
        const c = curId ? (g.byPeriod[curId] ?? 0) : 0;
        const p = priId ? (g.byPeriod[priId] ?? 0) : 0;
        if (c === 0 && p === 0) continue;
        deltas.push({ key, label: g.label, current: round2(c), prior: round2(p), delta: round2(c - p) });
      }
      deltas.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
      const res: BridgeResponse = {
        mode,
        ...envelope,
        dimensionRole: grain,
        current: current ? { periodId: current.periodId, total: round2(current.primary) } : null,
        prior: prior ? { periodId: prior.periodId, total: round2(prior.primary) } : null,
        deltas,
      };
      return NextResponse.json(res);
    }

    // -- mix: per-period member shares (fractions of the grain total) + ranked share shifts in
    // percentage points between prior and current ---------------------------------------------
    if (mode === 'mix') {
      const grain = resolveGrain();
      // SR-39: same dimension-grain withholding as bridge -- empty composition, named absence.
      if (scope !== undefined && grain !== 'entity') {
        absences.push({ role: grain, reason: DIMENSION_SCOPE_REASON });
        const res: MixResponse = { mode, ...envelope, dimensionRole: grain, composition: [], shifts: [] };
        return NextResponse.json(res);
      }
      const series = await grainSeries(grain);
      const composition: MixResponse['composition'] = periodPoints.map((pp) => {
        let total = 0;
        for (const g of Array.from(series.values())) total += g.byPeriod[pp.periodId] ?? 0;
        const shares: MixResponse['composition'][number]['shares'] = [];
        for (const [key, g] of Array.from(series.entries())) {
          const v = g.byPeriod[pp.periodId] ?? 0;
          if (v === 0) continue;
          shares.push({ key, label: g.label, value: round2(v), share: total > 0 ? round4(v / total) : 0 });
        }
        shares.sort((a, b) => b.value - a.value);
        return { periodId: pp.periodId, shares };
      });
      const shifts: MixResponse['shifts'] = [];
      if (curId && priId) {
        const curMap = new Map(composition.find((c) => c.periodId === curId)?.shares.map((s) => [s.key, s]) ?? []);
        const priMap = new Map(composition.find((c) => c.periodId === priId)?.shares.map((s) => [s.key, s]) ?? []);
        const keys = new Set([...Array.from(curMap.keys()), ...Array.from(priMap.keys())]);
        for (const key of Array.from(keys)) {
          const cs = curMap.get(key)?.share ?? 0;
          const ps = priMap.get(key)?.share ?? 0;
          const label = curMap.get(key)?.label ?? priMap.get(key)?.label ?? key;
          shifts.push({ key, label, currentShare: cs, priorShare: ps, shiftPts: round2((cs - ps) * 100) });
        }
        shifts.sort((a, b) => Math.abs(b.shiftPts) - Math.abs(a.shiftPts));
      }
      const res: MixResponse = { mode, ...envelope, dimensionRole: grain, composition, shifts };
      return NextResponse.json(res);
    }

    // -- sellers: entities ranked by current-period revenue + Lorenz/Pareto cumulative share ---
    if (mode === 'sellers') {
      const entities = await buildEntityPoints(scopedEpRows);
      const total = entities.reduce((s, e) => s + e.primary, 0);
      let cum = 0;
      const cumulativeShare = entities.map((e, i) => {
        cum += e.primary;
        return { rank: i + 1, share: total > 0 ? round4(cum / total) : 0 };
      });
      const res: SellersResponse = { mode, ...envelope, entities, distribution: { cumulativeShare } };
      return NextResponse.json(res);
    }

    // -- concentration: CR1/CR4/CR8 concentration ratios (top-n entity share of the total -- the
    // standard industrial-organization concentration measure), current vs prior, plus decliners -
    if (mode === 'concentration') {
      const entities = await buildEntityPoints(scopedEpRows);
      const curTotal = entities.reduce((s, e) => s + e.primary, 0);
      const priorTotal = entities.reduce((s, e) => s + (e.prior ?? 0), 0);
      const byPrior = [...entities].sort((a, b) => (b.prior ?? 0) - (a.prior ?? 0));
      const topShares = [1, 4, 8].map((nTop) => ({
        n: nTop,
        share: curTotal > 0 ? round4(entities.slice(0, nTop).reduce((s, e) => s + e.primary, 0) / curTotal) : 0,
        priorShare: priId && priorTotal > 0 ? round4(byPrior.slice(0, nTop).reduce((s, e) => s + (e.prior ?? 0), 0) / priorTotal) : null,
      }));
      // Decliners: pct trend between the first-half mean and second-half mean of each entity's
      // byPeriod series; only trendPct<0, ranked most-negative first; top 10 is a PRESENTATION
      // bound (the full ranking is derivable from the served byPeriod records).
      const decliners: ConcentrationResponse['decliners'] = [];
      const pids = periodPoints.map((p) => p.periodId);
      const mid = Math.floor(pids.length / 2);
      const firstIds = pids.slice(0, mid);
      const secondIds = pids.slice(mid);
      if (firstIds.length > 0 && secondIds.length > 0) {
        for (const e of entities) {
          const firstMean = firstIds.reduce((s, pid) => s + (e.byPeriod[pid] ?? 0), 0) / firstIds.length;
          const secondMean = secondIds.reduce((s, pid) => s + (e.byPeriod[pid] ?? 0), 0) / secondIds.length;
          if (firstMean <= 0) continue; // no honest trend base -- skip, never fabricate
          const trendPct = round2(((secondMean - firstMean) / firstMean) * 100);
          if (trendPct < 0) decliners.push({ entityId: e.entityId, displayName: e.displayName, byPeriod: e.byPeriod, trendPct });
        }
        decliners.sort((a, b) => a.trendPct - b.trendPct);
      }
      const res: ConcentrationResponse = { mode, ...envelope, topShares, decliners: decliners.slice(0, 10) };
      return NextResponse.json(res);
    }

    // -- yield: revenue per incentive dollar -- revenue rollups joined with the payout
    // materializations (entity_period_outcomes + the period_outcomes sentinel). yield=null when
    // payout is 0 (no division fabrication). componentPayouts is the COST-side decomposition:
    // component-level revenue attribution does not exist in the data (ADR minor decisions). ----
    if (mode === 'yield') {
      const outcomes = await readEntityPeriodOutcomes(sb, tenantId);
      // SR-39: payout follows the same entity scope as revenue -- period AND entity sums.
      const scopedOutcomes = scope !== undefined ? outcomes.filter((o) => scope.includes(o.entity_id)) : outcomes;
      const payoutByPeriod = new Map<string, number>();
      const payoutByEntityPeriod = new Map<string, number>();
      for (const o of scopedOutcomes) {
        const payout = n(o.total_payout);
        payoutByPeriod.set(o.period_id, (payoutByPeriod.get(o.period_id) ?? 0) + payout);
        const k = `${o.entity_id} ${o.period_id}`;
        payoutByEntityPeriod.set(k, (payoutByEntityPeriod.get(k) ?? 0) + payout);
      }
      const periodYield: YieldResponse['periodYield'] = periodPoints.map((pp) => {
        const revenue = round2(pp.primary);
        const payout = round2(payoutByPeriod.get(pp.periodId) ?? 0);
        return { periodId: pp.periodId, revenue, payout, yield: payout > 0 ? round2(revenue / payout) : null };
      });
      const entityYield: YieldResponse['entityYield'] = [];
      if (curId) {
        const rows = scopedEpRows.filter((r) => r.period_id === curId);
        const ents = await loadEntities(sb, Array.from(new Set(rows.map((r) => r.entity_id!))));
        for (const r of rows) {
          const revenue = round2(n((r.metrics ?? {}).primary));
          const payout = round2(payoutByEntityPeriod.get(`${r.entity_id} ${curId}`) ?? 0);
          entityYield.push({
            entityId: r.entity_id!,
            displayName: ents.get(r.entity_id!)?.displayName ?? r.entity_id!,
            revenue,
            payout,
            yield: payout > 0 ? round2(revenue / payout) : null,
          });
        }
        entityYield.sort((a, b) => b.revenue - a.revenue);
      }
      let componentPayouts: YieldResponse['componentPayouts'] = [];
      if (scope !== undefined) {
        // SR-39: the component decomposition comes from the tenant-level period_outcomes sentinel --
        // it has no entity decomposition, so scoped callers get a named absence instead.
        absences.push({ role: 'measure', reason: DIMENSION_SCOPE_REASON });
      } else if (curId) {
        const { data, error } = await sb
          .from('summary_artifacts')
          .select('metrics')
          .eq('tenant_id', tenantId)
          .eq('data_type', 'period_outcomes')
          .eq('period_id', curId)
          .limit(1);
        if (error) throw new Error(`period_outcomes sentinel read: ${error.message}`);
        const m = ((data ?? [])[0] as { metrics?: Record<string, unknown> } | undefined)?.metrics;
        const byName = (m?.component_totals_by_name ?? {}) as Record<string, unknown>;
        componentPayouts = Object.entries(byName)
          .map(([name, v]) => ({ name, payout: round2(n(v)) }))
          .sort((a, b) => b.payout - a.payout);
      }
      const res: YieldResponse = { mode, ...envelope, periodYield, entityYield, componentPayouts };
      return NextResponse.json(res);
    }

    // -- patterns: the period revenue series (month-snapshot tenants -- no sub-day grain exists) -
    if (mode === 'patterns') {
      const res: PatternsResponse = {
        mode,
        ...envelope,
        series: periodPoints.map((p) => ({ periodId: p.periodId, label: p.label, primary: round2(p.primary) })),
      };
      return NextResponse.json(res);
    }

    // -- geography: dimensionPeriod rows for the 'location' role; unresolved -> the envelope's
    // absences carry the meta reason and members stays empty (C2, never a fabricated grain) ----
    const members: RevenueDimensionPoint[] = [];
    if (scope !== undefined) {
      // SR-39: geography is dimension-grain by definition -- withheld from scoped callers.
      absences.push({ role: 'location', reason: DIMENSION_SCOPE_REASON });
    } else if (roles.location.status === 'resolved') {
      const series = await grainSeries('location');
      for (const [member, g] of Array.from(series.entries())) {
        members.push({
          member,
          primary: curId ? round2(g.byPeriod[curId] ?? 0) : 0,
          prior: priId ? round2(g.byPeriod[priId] ?? 0) : null,
          byPeriod: g.byPeriod,
        });
      }
      members.sort((a, b) => b.primary - a.primary);
    }
    const res: GeographyResponse = { mode: 'geography', ...envelope, members };
    return NextResponse.json(res);
  } catch (error) {
    console.error('[RevenueData] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load revenue data' },
      { status: 500 },
    );
  }
}
