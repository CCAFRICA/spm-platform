/**
 * OB-257 O4 — Revenue insight writer (ADR Decision 3 companion).
 *
 * FOUR deterministic RANK-BASED insight classes computed from the Revenue materializations
 * (summary_rollups REVENUE_ROLLUP_TYPES namespaces) plus entity_period_outcomes (the incentive side
 * of yield). Zero tuning constants, zero thresholds (HF-303 discipline): every class is a ranked
 * comparison — ranked deltas, ranked share shifts, ranked divergence-from-median. The only numeric
 * bounds are the 'top N' caps, which are PRESENTATION bounds (how many rows are written), never
 * qualification thresholds. No LLM anywhere on this path.
 *
 * Storage = intelligence_artifacts, discriminated by source='revenue-insight' (REVENUE_INSIGHT_SOURCE)
 * and context.kind (RevenueInsightKind) — NEVER an artifact_type enum. artifact_type stays free-form
 * prose by table contract (20260622_ob232 recovery migration): a deterministic one-sentence
 * characterization is written instead. The write is an idempotent replace of THIS writer's namespace
 * only (delete own source, then insert); the insight-engine wipe is source-scoped in the companion
 * one-line edit, ending the cross-writer wipe hazard.
 *
 * KOREAN TEST (AP-25): zero tenant field names in code. Inputs are role-keyed rollup rows; narratives
 * carry tenant DATA (display names, dimension members, period labels) read from the DB at runtime.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { round2 } from '@/lib/serving/math';
import {
  REVENUE_ROLLUP_TYPES,
  REVENUE_INSIGHT_SOURCE,
  type RevenueInsightKind,
  type RevenueInsightResult,
} from './types';

const GENERATED_BY = 'revenue-insight-engine@v1';

interface RollupRow {
  period_id: string | null;
  data_type: string;
  entity_id: string | null;
  dimension_role: string | null;
  dimension_member: string | null;
  metrics: Record<string, unknown> | null;
}

interface PeriodMeta {
  id: string;
  label: string;
  start_date: string;
  end_date: string;
}

/** The exact intelligence_artifacts insert shape this writer emits (live-schema columns only). */
interface InsightRow {
  tenant_id: string;
  entity_id: string | null;
  period_id: null; // Decision 92 precedent — period scope lives in context, never the FK
  artifact_type: string; // free-form one-sentence shape characterization (deterministic template)
  severity: string; // free-form one-sentence significance prose
  entity_type: 'individual' | null;
  title: string;
  narrative: string;
  data_references: Array<{ metric: string; value: number; delta_pct: number | null }>;
  shape_description: string; // tenant-content-free structural fingerprint
  source: typeof REVENUE_INSIGHT_SOURCE;
  context: {
    kind: RevenueInsightKind;
    generated_by: string;
    period_start: string | null;
    period_end: string | null;
  };
}

function zeroByKind(): Record<RevenueInsightKind, number> {
  return { momentum_shift: 0, mix_shift: 0, concentration_alert: 0, incentive_yield_outlier: 0 };
}

const num = (v: unknown): number => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') { const p = parseFloat(v); return Number.isFinite(p) ? p : 0; }
  return 0;
};

/** Signed percent delta vs a base; null when the base is 0 (pct undefined — absence, not simulation).
 *  |base| denominator keeps "value above base → positive" even for a negative base. */
const pctDelta = (value: number, base: number): number | null =>
  base === 0 ? null : round2(((value - base) / Math.abs(base)) * 100);

const mean = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length; // callers guarantee non-empty

const median = (xs: number[]): number => {
  const s = xs.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

export async function generateRevenueInsights(
  sb: SupabaseClient,
  tenantId: string,
): Promise<RevenueInsightResult> {
  const byKind = zeroByKind();

  // ── Reads ────────────────────────────────────────────────────────────────────
  // summary_rollups may be absent pre-migration (HALT-3 window) — a read error returns a structured
  // result (C2), never a throw, and never touches the artifact namespace.
  const { data: rollupData, error: rollupErr } = await sb
    .from('summary_rollups')
    .select('period_id, data_type, entity_id, dimension_role, dimension_member, metrics')
    .eq('tenant_id', tenantId)
    .in('data_type', [
      REVENUE_ROLLUP_TYPES.period,
      REVENUE_ROLLUP_TYPES.entityPeriod,
      REVENUE_ROLLUP_TYPES.dimensionPeriod,
    ]);
  if (rollupErr) return { written: 0, byKind, error: `summary_rollups read failed: ${rollupErr.message}` };
  const rollups = (rollupData ?? []) as RollupRow[];

  const periodIds = Array.from(new Set(rollups.map((r) => r.period_id).filter((x): x is string => !!x)));
  let periods: PeriodMeta[] = [];
  if (periodIds.length > 0) {
    const { data: perData, error: perErr } = await sb
      .from('periods')
      .select('id, label, start_date, end_date')
      .in('id', periodIds);
    if (perErr) return { written: 0, byKind, error: `periods read failed: ${perErr.message}` };
    // deterministic ascending order: start_date, then id as tie-break
    periods = ((perData ?? []) as PeriodMeta[])
      .slice()
      .sort((a, b) => a.start_date.localeCompare(b.start_date) || a.id.localeCompare(b.id));
  }

  const { data: entData, error: entErr } = await sb
    .from('entities')
    .select('id, display_name')
    .eq('tenant_id', tenantId);
  if (entErr) return { written: 0, byKind, error: `entities read failed: ${entErr.message}` };
  const entityName = new Map<string, string>();
  for (const e of (entData ?? []) as Array<{ id: string; display_name: string | null }>) {
    if (e.display_name) entityName.set(e.id, e.display_name);
  }
  const nameOf = (id: string) => entityName.get(id) ?? id.slice(0, 8);

  // ── Shared derived maps ──────────────────────────────────────────────────────
  const periodRollups = rollups.filter((r) => r.data_type === REVENUE_ROLLUP_TYPES.period && r.period_id);
  const entityRollups = rollups.filter(
    (r) => r.data_type === REVENUE_ROLLUP_TYPES.entityPeriod && r.entity_id && r.period_id,
  );
  const dimRollups = rollups.filter(
    (r) => r.data_type === REVENUE_ROLLUP_TYPES.dimensionPeriod && r.period_id && r.dimension_role && r.dimension_member != null,
  );

  const primaryByPeriod = new Map<string, number>();
  for (const r of periodRollups) primaryByPeriod.set(r.period_id as string, num(r.metrics?.['primary']));

  const rows: InsightRow[] = [];

  // ── Class 1: momentum_shift ──────────────────────────────────────────────────
  // Latest period primary vs the trailing mean of ALL prior periods (needs >= 2 periods). One
  // network-level insight with the signed delta_pct, plus the entities ranked by |own delta_pct vs
  // their OWN trailing mean| — top 3 is a presentation bound, not a qualification threshold.
  const momentumPeriods = periods.filter((p) => primaryByPeriod.has(p.id));
  if (momentumPeriods.length >= 2) {
    const latest = momentumPeriods[momentumPeriods.length - 1];
    const priors = momentumPeriods.slice(0, -1);
    const current = primaryByPeriod.get(latest.id) as number;
    const trailing = mean(priors.map((p) => primaryByPeriod.get(p.id) as number));
    const deltaPct = pctDelta(current, trailing);
    const window = { period_start: priors[0].start_date, period_end: latest.end_date };
    if (deltaPct !== null) {
      const dir = deltaPct >= 0 ? 'above' : 'below';
      rows.push({
        tenant_id: tenantId,
        entity_id: null,
        period_id: null,
        artifact_type: 'Latest-period network total compared against the trailing mean of all prior periods.',
        severity: `The latest period sits ${Math.abs(deltaPct)}% ${dir} the trailing mean of ${priors.length} prior period(s).`,
        entity_type: null,
        title: `Network momentum: ${latest.label} ${deltaPct >= 0 ? 'up' : 'down'} ${Math.abs(deltaPct)}% vs trailing mean`,
        narrative: `${latest.label} closed at ${round2(current)} against a trailing mean of ${round2(trailing)} across ${priors.length} prior period(s) — a ${deltaPct >= 0 ? '+' : ''}${deltaPct}% shift.`,
        data_references: [
          { metric: 'primary', value: round2(current), delta_pct: deltaPct },
          { metric: 'trailing_mean_primary', value: round2(trailing), delta_pct: null },
        ],
        shape_description: `network-scope latest-period versus trailing-mean comparison of a period-grain measure, ${deltaPct >= 0 ? 'upward' : 'downward'}`,
        source: REVENUE_INSIGHT_SOURCE,
        context: { kind: 'momentum_shift', generated_by: GENERATED_BY, ...window },
      });
      byKind.momentum_shift++;
    }

    // per-entity: each entity's latest value vs its OWN trailing mean over the prior periods it appears in
    const byEntityPeriod = new Map<string, Map<string, number>>();
    for (const r of entityRollups) {
      const perMap = byEntityPeriod.get(r.entity_id as string) ?? new Map<string, number>();
      perMap.set(r.period_id as string, num(r.metrics?.['primary']));
      byEntityPeriod.set(r.entity_id as string, perMap);
    }
    const entityDeltas: Array<{ entityId: string; current: number; trailing: number; deltaPct: number }> = [];
    for (const [entityId, perMap] of Array.from(byEntityPeriod.entries())) {
      const cur = perMap.get(latest.id);
      if (cur === undefined) continue; // absent from the latest period — nothing to compare
      const trail = priors.map((p) => perMap.get(p.id)).filter((v): v is number => v !== undefined);
      if (trail.length === 0) continue; // no prior presence — no trailing mean exists
      const dp = pctDelta(cur, mean(trail));
      if (dp === null || dp === 0) continue; // zero base (pct undefined) or zero movement — not a shift
      entityDeltas.push({ entityId, current: cur, trailing: mean(trail), deltaPct: dp });
    }
    entityDeltas.sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct) || a.entityId.localeCompare(b.entityId));
    for (const d of entityDeltas.slice(0, 3)) { // top 3 = presentation bound
      const dir = d.deltaPct >= 0 ? 'above' : 'below';
      rows.push({
        tenant_id: tenantId,
        entity_id: d.entityId,
        period_id: null,
        artifact_type: "Latest-period entity total compared against the entity's own trailing mean.",
        severity: `This entity moved ${Math.abs(d.deltaPct)}% ${dir} its own trailing mean.`,
        entity_type: 'individual',
        title: `${nameOf(d.entityId)}: ${d.deltaPct >= 0 ? 'up' : 'down'} ${Math.abs(d.deltaPct)}% vs own trailing mean`,
        narrative: `${nameOf(d.entityId)} produced ${round2(d.current)} in ${latest.label} against a personal trailing mean of ${round2(d.trailing)} — a ${d.deltaPct >= 0 ? '+' : ''}${d.deltaPct}% shift.`,
        data_references: [
          { metric: 'primary', value: round2(d.current), delta_pct: d.deltaPct },
          { metric: 'trailing_mean_primary', value: round2(d.trailing), delta_pct: null },
        ],
        shape_description: `entity-scope latest-period versus own-trailing-mean comparison of a period-grain measure, ${d.deltaPct >= 0 ? 'upward' : 'downward'}`,
        source: REVENUE_INSIGHT_SOURCE,
        context: { kind: 'momentum_shift', generated_by: GENERATED_BY, ...window },
      });
      byKind.momentum_shift++;
    }
  }

  // ── Class 2: mix_shift ───────────────────────────────────────────────────────
  // For each resolved dimension role with rollups: latest vs prior period share-of-total per member;
  // members ranked by |share shift in points| — top 3 per role is a presentation bound.
  const dimensionRoles = Array.from(new Set(dimRollups.map((r) => r.dimension_role as string))).sort();
  for (const role of dimensionRoles) {
    const roleRows = dimRollups.filter((r) => r.dimension_role === role);
    const rolePeriods = periods.filter((p) => roleRows.some((r) => r.period_id === p.id));
    if (rolePeriods.length < 2) continue; // a share SHIFT needs a latest AND a prior period
    const latest = rolePeriods[rolePeriods.length - 1];
    const prior = rolePeriods[rolePeriods.length - 2];
    const memberTotals = (periodId: string): Map<string, number> => {
      const m = new Map<string, number>();
      for (const r of roleRows.filter((x) => x.period_id === periodId)) {
        const key = r.dimension_member as string;
        m.set(key, (m.get(key) ?? 0) + num(r.metrics?.['primary']));
      }
      return m;
    };
    const cur = memberTotals(latest.id);
    const prev = memberTotals(prior.id);
    const curTotal = Array.from(cur.values()).reduce((s, v) => s + v, 0);
    const prevTotal = Array.from(prev.values()).reduce((s, v) => s + v, 0);
    if (curTotal === 0 || prevTotal === 0) continue; // shares undefined against a zero total
    const members = Array.from(new Set([...Array.from(cur.keys()), ...Array.from(prev.keys())]));
    const shifts = members
      .map((member) => {
        const currentShare = (cur.get(member) ?? 0) / curTotal;
        const priorShare = (prev.get(member) ?? 0) / prevTotal;
        return {
          member,
          currentValue: cur.get(member) ?? 0,
          currentShare,
          priorShare,
          shiftPts: round2((currentShare - priorShare) * 100),
        };
      })
      .filter((s) => s.shiftPts !== 0); // a member that did not move is not a shift
    shifts.sort((a, b) => Math.abs(b.shiftPts) - Math.abs(a.shiftPts) || a.member.localeCompare(b.member));
    for (const s of shifts.slice(0, 3)) { // top 3 per role = presentation bound
      const dir = s.shiftPts >= 0 ? 'gained' : 'lost';
      rows.push({
        tenant_id: tenantId,
        entity_id: null,
        period_id: null,
        artifact_type: 'Share-of-total shift for one dimension member between the latest and prior periods.',
        severity: `This member's share of the ${role} mix moved ${Math.abs(s.shiftPts)} points between periods.`,
        entity_type: null,
        title: `Mix shift: ${s.member} ${dir} ${Math.abs(s.shiftPts)} pts of ${role} share in ${latest.label}`,
        narrative: `${s.member} held ${round2(s.currentShare * 100)}% of the ${role} mix in ${latest.label} versus ${round2(s.priorShare * 100)}% in ${prior.label} — a ${s.shiftPts >= 0 ? '+' : ''}${s.shiftPts}-point shift on ${round2(s.currentValue)} of revenue.`,
        data_references: [
          { metric: 'share_pts', value: round2(s.currentShare * 100), delta_pct: null },
          { metric: 'prior_share_pts', value: round2(s.priorShare * 100), delta_pct: null },
          { metric: 'primary', value: round2(s.currentValue), delta_pct: null },
        ],
        shape_description: `dimension-member share-of-total shift between two consecutive periods, ${s.shiftPts >= 0 ? 'toward' : 'away from'} this member`,
        source: REVENUE_INSIGHT_SOURCE,
        context: { kind: 'mix_shift', generated_by: GENERATED_BY, period_start: prior.start_date, period_end: latest.end_date },
      });
      byKind.mix_shift++;
    }
  }

  // ── Class 3: concentration_alert ─────────────────────────────────────────────
  // CR1/CR4/CR8 (concentration ratios, industrial organization): share of total revenue held by the
  // top 1/4/8 entities, latest vs prior period. Emit any ratio that MOVED, ranked by |move| — top 2
  // is a presentation bound.
  const entityPeriodsOrdered = periods.filter((p) => entityRollups.some((r) => r.period_id === p.id));
  if (entityPeriodsOrdered.length >= 2) {
    const latest = entityPeriodsOrdered[entityPeriodsOrdered.length - 1];
    const prior = entityPeriodsOrdered[entityPeriodsOrdered.length - 2];
    const crFor = (periodId: string): { cr1: number; cr4: number; cr8: number } | null => {
      const vals = entityRollups
        .filter((r) => r.period_id === periodId)
        .map((r) => num(r.metrics?.['primary']))
        .sort((a, b) => b - a);
      const total = vals.reduce((s, v) => s + v, 0);
      if (total === 0) return null; // ratios undefined against a zero total
      const cr = (k: number) => round2((vals.slice(0, k).reduce((s, v) => s + v, 0) / total) * 100);
      return { cr1: cr(1), cr4: cr(4), cr8: cr(8) };
    };
    const curCR = crFor(latest.id);
    const prevCR = crFor(prior.id);
    if (curCR && prevCR) {
      const moves = (['cr1', 'cr4', 'cr8'] as const)
        .map((ratio) => ({ ratio, current: curCR[ratio], prior: prevCR[ratio], movePts: round2(curCR[ratio] - prevCR[ratio]) }))
        .filter((m) => m.movePts !== 0); // emit only ratios that moved
      moves.sort((a, b) => Math.abs(b.movePts) - Math.abs(a.movePts) || a.ratio.localeCompare(b.ratio));
      for (const m of moves.slice(0, 2)) { // top 2 = presentation bound
        const topN = parseInt(m.ratio.slice(2), 10);
        const dir = m.movePts >= 0 ? 'rose' : 'fell';
        rows.push({
          tenant_id: tenantId,
          entity_id: null,
          period_id: null,
          artifact_type: 'Concentration-ratio movement between the latest and prior periods.',
          severity: `The top-${topN} share of revenue moved ${Math.abs(m.movePts)} points between periods.`,
          entity_type: null,
          title: `Concentration: CR${topN} ${dir} ${Math.abs(m.movePts)} pts in ${latest.label}`,
          narrative: `The top ${topN} entit${topN === 1 ? 'y' : 'ies'} held ${m.current}% of revenue in ${latest.label} versus ${m.prior}% in ${prior.label} — a ${m.movePts >= 0 ? '+' : ''}${m.movePts}-point move.`,
          data_references: [
            { metric: m.ratio, value: m.current, delta_pct: null },
            { metric: `prior_${m.ratio}`, value: m.prior, delta_pct: null },
          ],
          shape_description: `top-N concentration-ratio movement between two consecutive periods, ${m.movePts >= 0 ? 'rising' : 'falling'}`,
          source: REVENUE_INSIGHT_SOURCE,
          context: { kind: 'concentration_alert', generated_by: GENERATED_BY, period_start: prior.start_date, period_end: latest.end_date },
        });
        byKind.concentration_alert++;
      }
    }
  }

  // ── Class 4: incentive_yield_outlier ─────────────────────────────────────────
  // Latest period per-entity yield = revenue / payout (payout==0 skipped — yield undefined), ranked
  // by divergence from the tenant MEDIAN yield; top 2 high + top 2 low are presentation bounds.
  let yieldReadError: string | undefined;
  if (entityPeriodsOrdered.length >= 1) {
    const latest = entityPeriodsOrdered[entityPeriodsOrdered.length - 1];
    const { data: epoData, error: epoErr } = await sb
      .from('entity_period_outcomes')
      .select('entity_id, total_payout')
      .eq('tenant_id', tenantId)
      .eq('period_id', latest.id);
    if (epoErr) {
      // C2: named, surfaced skip — the other three classes still write
      yieldReadError = `entity_period_outcomes read failed (incentive_yield_outlier skipped): ${epoErr.message}`;
    } else {
      const payoutByEntity = new Map<string, number>();
      for (const r of (epoData ?? []) as Array<{ entity_id: string; total_payout: unknown }>) {
        payoutByEntity.set(r.entity_id, num(r.total_payout));
      }
      const yields: Array<{ entityId: string; revenue: number; payout: number; yieldRatio: number }> = [];
      for (const r of entityRollups.filter((x) => x.period_id === latest.id)) {
        const payout = payoutByEntity.get(r.entity_id as string);
        if (payout === undefined || payout === 0) continue; // no payout row or zero payout — yield undefined
        const revenue = num(r.metrics?.['primary']);
        yields.push({ entityId: r.entity_id as string, revenue, payout, yieldRatio: revenue / payout });
      }
      if (yields.length > 0) {
        const med = median(yields.map((y) => y.yieldRatio));
        const divergent = yields
          .map((y) => ({ ...y, divergence: y.yieldRatio - med }))
          .filter((y) => y.divergence !== 0); // an entity AT the median is not an outlier
        const highs = divergent
          .filter((y) => y.divergence > 0)
          .sort((a, b) => b.divergence - a.divergence || a.entityId.localeCompare(b.entityId))
          .slice(0, 2); // top 2 high = presentation bound
        const lows = divergent
          .filter((y) => y.divergence < 0)
          .sort((a, b) => a.divergence - b.divergence || a.entityId.localeCompare(b.entityId))
          .slice(0, 2); // top 2 low = presentation bound
        for (const y of [...highs, ...lows]) {
          const dp = pctDelta(y.yieldRatio, med);
          const dir = y.divergence > 0 ? 'above' : 'below';
          rows.push({
            tenant_id: tenantId,
            entity_id: y.entityId,
            period_id: null,
            artifact_type: 'Per-entity revenue-per-incentive-dollar divergence from the tenant median.',
            severity: `Yield of ${round2(y.yieldRatio)} versus a tenant median of ${round2(med)}${dp !== null ? ` (${Math.abs(dp)}% ${dir})` : ''}.`,
            entity_type: 'individual',
            title: `${nameOf(y.entityId)}: incentive yield ${dir} the tenant median`,
            narrative: `In ${latest.label}, ${nameOf(y.entityId)} produced ${round2(y.revenue)} in revenue on ${round2(y.payout)} of incentive payout — a yield of ${round2(y.yieldRatio)} per incentive unit versus the tenant median of ${round2(med)}.`,
            data_references: [
              { metric: 'yield', value: round2(y.yieldRatio), delta_pct: dp },
              { metric: 'primary', value: round2(y.revenue), delta_pct: null },
              { metric: 'payout', value: round2(y.payout), delta_pct: null },
            ],
            shape_description: `entity-scope ratio-of-two-measures divergence from the population median, ${y.divergence > 0 ? 'above' : 'below'}`,
            source: REVENUE_INSIGHT_SOURCE,
            context: { kind: 'incentive_yield_outlier', generated_by: GENERATED_BY, period_start: latest.start_date, period_end: latest.end_date },
          });
          byKind.incentive_yield_outlier++;
        }
      }
    }
  }

  // ── Write: idempotent replace of OWN namespace only (never another writer's rows) ──
  const { error: delErr } = await sb
    .from('intelligence_artifacts')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('source', REVENUE_INSIGHT_SOURCE);
  if (delErr) return { written: 0, byKind: zeroByKind(), error: `insight wipe failed: ${delErr.message}` };
  if (rows.length > 0) {
    const { error: insErr } = await sb.from('intelligence_artifacts').insert(rows);
    if (insErr) return { written: 0, byKind: zeroByKind(), error: `insight insert failed: ${insErr.message}` };
  }

  return { written: rows.length, byKind, ...(yieldReadError ? { error: yieldReadError } : {}) };
}
