/**
 * Revenue rollup materializer (OB-257 O2, ADR Decision 3 -- Option B).
 *
 * THE single writer of the summary_rollups revenue namespaces (revenue_period /
 * revenue_entity_period / revenue_dimension_period / revenue_meta). Called from BOTH the
 * import-finalize cascade and the activation endpoints -- one function, two callers, no parallel
 * writer (directive section 3.2). Serving routes read these rows and NEVER touch committed_data
 * (the MSP invariant).
 *
 * Algorithm: resolve roles (recognition, Decision 1) -> two paged committed_data scans (an
 * entity-attribute dimension map, then the measure reduce) -> candidate rollup rows ->
 * idempotency compare against the existing rows (byte-identical -> noop, no delete/insert) ->
 * delete-own-namespaces + chunked insert. Pages are processed and DISCARDED -- memory is bounded
 * by one page plus the rollup grain (the DIAG-078 OOM class must not recur).
 *
 * KOREAN TEST: zero field names -- the measure/dimension fields come exclusively from resolved
 * roles; data_type namespaces are structural vocabulary from REVENUE_ROLLUP_TYPES.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  REVENUE_MATERIALIZER_VERSION,
  REVENUE_ROLLUP_TYPES,
  type MaterializeResult,
  type RevenueMetaMetrics,
} from './types';
import { resolveRevenueRoles } from './role-resolution';
import { generateRevenueInsights } from './revenue-insights';

const PAGE = 1000;        // committed_data / summary_rollups scan page size
const INSERT_CHUNK = 500; // summary_rollups bulk-insert chunk size

/** 2dp rounding for stored sums -- stable across re-runs so the noop compare holds (the
 *  financial-route round2 idiom; display-side rounding only, no financial record is mutated). */
function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Finite-number read of a jsonb value (the financial-route n() idiom, but returning null for
 *  non-numeric so non-measure rows are SKIPPED rather than counted as zero). */
function toFiniteNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const p = Number(v);
    return Number.isFinite(p) ? p : null;
  }
  return null;
}

interface PeriodRow {
  id: string;
  label: string;
  canonical_key: string | null;
  start_date: string;
  end_date: string;
  status: string;
}

/** The insert shape for summary_rollups (id/computed_at/created_at are DB defaults). */
interface RollupInsertRow {
  tenant_id: string;
  period_id: string | null;
  data_type: string;
  entity_id: string | null;
  dimension_role: string | null;
  dimension_member: string | null;
  metrics: Record<string, unknown>;
  row_count: number;
}

/** Paged committed_data scan: each page is handed to onPage then discarded (bounded memory). */
async function scanCommittedData(
  sb: SupabaseClient,
  tenantId: string,
  columns: string,
  onPage: (rows: Record<string, unknown>[]) => void,
): Promise<void> {
  let offset = 0;
  for (;;) {
    const { data, error } = await sb
      .from('committed_data')
      .select(columns)
      .eq('tenant_id', tenantId)
      .order('id', { ascending: true }) // unique key -- no page-boundary duplicates
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`committed_data read: ${error.message}`);
    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    if (rows.length === 0) break;
    onPage(rows);
    if (rows.length < PAGE) break;
    offset += PAGE;
  }
}

/** Key-order-insensitive stringify -- jsonb does not preserve object key order, so the noop
 *  compare must not depend on it. */
function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  if (v && typeof v === 'object') {
    const rec = v as Record<string, unknown>;
    const keys = Object.keys(rec).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(rec[k] ?? null)).join(',') + '}';
  }
  return v === undefined ? 'null' : JSON.stringify(v);
}

/** Canonical form of a rollup row set for the idempotency compare: identity columns + metrics +
 *  row_count only (id/computed_at/created_at stripped -- they differ every run by construction).
 *  The meta row's metrics carry NO timestamps by design (roles + counts + version), so no
 *  further exclusion is needed for it. */
function canonicalizeRollups(
  rows: Array<Pick<RollupInsertRow, 'data_type' | 'period_id' | 'entity_id' | 'dimension_role' | 'dimension_member' | 'metrics' | 'row_count'>>,
): string {
  return rows
    .map((r) =>
      stableStringify({
        data_type: r.data_type,
        period_id: r.period_id ?? null,
        entity_id: r.entity_id ?? null,
        dimension_role: r.dimension_role ?? null,
        dimension_member: r.dimension_member ?? null,
        metrics: r.metrics ?? {},
        row_count: r.row_count ?? 0,
      }),
    )
    .sort()
    .join('\n');
}

/**
 * Materialize the tenant's revenue rollups from committed_data into summary_rollups.
 * Idempotent: a re-run over unchanged data is a detected noop (no delete/insert). Fail-loud:
 * an unresolved measure writes ONLY the meta row (a readable named absence) and returns ok:false;
 * any storage error throws.
 */
export async function materializeRevenueRollups(
  sb: SupabaseClient,
  tenantId: string,
  trace?: (msg: string) => void,
): Promise<MaterializeResult> {
  const t0 = Date.now();
  const t = trace ?? (() => {});
  const allTypes = Object.values(REVENUE_ROLLUP_TYPES);

  // (a) Roles -- recognition-resolved (Decision 1). measure is REQUIRED; location/category optional.
  const { roles } = await resolveRevenueRoles(sb, tenantId);
  t(`revenue-roles measure=${roles.measure.status} location=${roles.location.status} category=${roles.category.status}`);

  if (roles.measure.status === 'unresolved') {
    // FAIL LOUD (C2): no rollups without a measure -- but the ABSENCE itself is materialized as the
    // meta row so the serving layer renders the named reason instead of a silent blank.
    const metaMetrics: RevenueMetaMetrics = {
      roles,
      attribution: { rows_scanned: 0, rows_with_measure: 0, rows_attributed_to_period: 0, rows_unattributed: 0 },
      materializer_version: REVENUE_MATERIALIZER_VERSION,
    };
    const { error: delErr } = await sb
      .from('summary_rollups')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('data_type', REVENUE_ROLLUP_TYPES.meta);
    if (delErr) throw new Error(`summary_rollups meta delete: ${delErr.message}`);
    const { error: insErr } = await sb.from('summary_rollups').insert({
      tenant_id: tenantId,
      period_id: null,
      data_type: REVENUE_ROLLUP_TYPES.meta,
      entity_id: null,
      dimension_role: null,
      dimension_member: null,
      metrics: metaMetrics,
      row_count: 0,
    } satisfies RollupInsertRow);
    if (insErr) throw new Error(`summary_rollups meta insert: ${insErr.message}`);
    return {
      ok: false,
      roles,
      rowsScanned: 0,
      rollupsWritten: { period: 0, entityPeriod: 0, dimensionPeriod: 0 },
      durationMs: Date.now() - t0,
      noop: false,
      error: `revenue measure unresolved: ${roles.measure.reason}`,
    };
  }
  const measureField = roles.measure.field_name;

  // (b) Periods -- the attribution frame (structural temporal role: period_id ?? source_date range).
  const { data: periodData, error: perErr } = await sb
    .from('periods')
    .select('id, label, canonical_key, start_date, end_date, status')
    .eq('tenant_id', tenantId)
    .order('start_date', { ascending: true });
  if (perErr) throw new Error(`periods read: ${perErr.message}`);
  const periods = (periodData ?? []) as PeriodRow[];
  const periodIds = new Set(periods.map((p) => p.id));

  // (c) PASS 1 -- entity-attribute dimension map. Dimensions can be carried on entity rows (a roster
  // sheet) rather than on the measure rows themselves, so build entityId -> member per resolved
  // OPTIONAL dimension role. Map size is bounded by entity count; pages are discarded.
  const dimRoles: Array<{ role: 'location' | 'category'; field: string }> = [];
  if (roles.location.status === 'resolved') dimRoles.push({ role: 'location', field: roles.location.field_name });
  if (roles.category.status === 'resolved') dimRoles.push({ role: 'category', field: roles.category.field_name });
  const entityDimMap = new Map<string, Map<string, string>>();
  for (const d of dimRoles) entityDimMap.set(d.role, new Map());
  if (dimRoles.length > 0) {
    await scanCommittedData(sb, tenantId, 'entity_id, data_type, row_data', (rows) => {
      for (const r of rows) {
        const entityId = (r.entity_id as string | null) ?? null;
        if (!entityId) continue;
        const rowData = (r.row_data ?? {}) as Record<string, unknown>;
        for (const d of dimRoles) {
          const v = rowData[d.field];
          if (v != null) entityDimMap.get(d.role)!.set(entityId, String(v)); // last write wins
        }
      }
    });
    t(`revenue-pass1 dimensionEntities=${dimRoles.map((d) => `${d.role}:${entityDimMap.get(d.role)!.size}`).join(' ')}`);
  }

  // (d) PASS 2 -- measure reduce. Accumulators are keyed by the rollup grain (small by
  // construction); the raw pages are never retained.
  interface PeriodAgg { primary: number; rowCount: number; entities: Set<string> }
  interface KeyedAgg { primary: number; rowCount: number }
  const perPeriod = new Map<string, PeriodAgg>();
  const perEntityPeriod = new Map<string, KeyedAgg & { entityId: string; periodId: string }>();
  const perDimension = new Map<string, KeyedAgg & { role: string; member: string; periodId: string }>();
  let rowsScanned = 0;
  let rowsWithMeasure = 0;
  let rowsAttributed = 0;
  let rowsUnattributed = 0;
  let rowsWithoutEntity = 0;

  // period_id wins when set and known; else the first period whose date range contains
  // source_date; else unattributable (counted, skipped -- never guessed).
  const attributePeriod = (periodId: unknown, sourceDate: unknown): string | null => {
    if (typeof periodId === 'string' && periodIds.has(periodId)) return periodId;
    if (sourceDate != null) {
      const d = String(sourceDate).slice(0, 10);
      for (const p of periods) {
        if (p.start_date.slice(0, 10) <= d && d <= p.end_date.slice(0, 10)) return p.id;
      }
    }
    return null;
  };

  await scanCommittedData(sb, tenantId, 'entity_id, period_id, source_date, row_data', (rows) => {
    rowsScanned += rows.length;
    for (const r of rows) {
      const rowData = (r.row_data ?? {}) as Record<string, unknown>;
      const measure = toFiniteNumber(rowData[measureField]);
      if (measure === null) continue; // not a measure-bearing row
      rowsWithMeasure++;
      const pid = attributePeriod(r.period_id, r.source_date);
      if (!pid) {
        rowsUnattributed++;
        continue;
      }
      rowsAttributed++;
      const entityId = (r.entity_id as string | null) ?? null;

      let pa = perPeriod.get(pid);
      if (!pa) {
        pa = { primary: 0, rowCount: 0, entities: new Set() };
        perPeriod.set(pid, pa);
      }
      pa.primary += measure;
      pa.rowCount++;

      if (entityId) {
        pa.entities.add(entityId);
        const k = `${entityId} ${pid}`;
        let ea = perEntityPeriod.get(k);
        if (!ea) {
          ea = { entityId, periodId: pid, primary: 0, rowCount: 0 };
          perEntityPeriod.set(k, ea);
        }
        ea.primary += measure;
        ea.rowCount++;
      } else {
        rowsWithoutEntity++; // period rollup keeps the sum; no entityPeriod row can be keyed
      }

      for (const d of dimRoles) {
        const own = rowData[d.field];
        const member = own != null
          ? String(own)
          : (entityId ? entityDimMap.get(d.role)!.get(entityId) : undefined);
        if (member === undefined) continue; // absent on the row AND its entity -- skip for this dim
        const k = `${d.role} ${member} ${pid}`;
        let da = perDimension.get(k);
        if (!da) {
          da = { role: d.role, member, periodId: pid, primary: 0, rowCount: 0 };
          perDimension.set(k, da);
        }
        da.primary += measure;
        da.rowCount++;
      }
    }
  });
  t(`revenue-pass2 scanned=${rowsScanned} withMeasure=${rowsWithMeasure} attributed=${rowsAttributed} unattributed=${rowsUnattributed}`);

  // (e) Candidate rollup rows -- sums rounded to 2dp so a re-run is byte-stable for the compare.
  const candidates: RollupInsertRow[] = [];
  for (const [pid, pa] of Array.from(perPeriod.entries())) {
    candidates.push({
      tenant_id: tenantId,
      period_id: pid,
      data_type: REVENUE_ROLLUP_TYPES.period,
      entity_id: null,
      dimension_role: null,
      dimension_member: null,
      metrics: { primary: round2(pa.primary), row_count: pa.rowCount, entity_count: pa.entities.size },
      row_count: pa.rowCount,
    });
  }
  for (const ea of Array.from(perEntityPeriod.values())) {
    candidates.push({
      tenant_id: tenantId,
      period_id: ea.periodId,
      data_type: REVENUE_ROLLUP_TYPES.entityPeriod,
      entity_id: ea.entityId,
      dimension_role: null,
      dimension_member: null,
      metrics: { primary: round2(ea.primary), row_count: ea.rowCount },
      row_count: ea.rowCount,
    });
  }
  for (const da of Array.from(perDimension.values())) {
    candidates.push({
      tenant_id: tenantId,
      period_id: da.periodId,
      data_type: REVENUE_ROLLUP_TYPES.dimensionPeriod,
      entity_id: null,
      dimension_role: da.role, // the ROLE KEY ('location' | 'category'), not a field name
      dimension_member: da.member,
      metrics: { primary: round2(da.primary), row_count: da.rowCount },
      row_count: da.rowCount,
    });
  }
  const metaMetrics: RevenueMetaMetrics = {
    roles,
    attribution: {
      rows_scanned: rowsScanned,
      rows_with_measure: rowsWithMeasure,
      rows_attributed_to_period: rowsAttributed,
      rows_unattributed: rowsUnattributed,
    },
    materializer_version: REVENUE_MATERIALIZER_VERSION,
    rows_without_entity: rowsWithoutEntity, // measure rows summed at period grain but un-keyable per entity
  };
  candidates.push({
    tenant_id: tenantId,
    period_id: null,
    data_type: REVENUE_ROLLUP_TYPES.meta,
    entity_id: null,
    dimension_role: null,
    dimension_member: null,
    metrics: metaMetrics,
    row_count: rowsScanned,
  });
  const rollupsWritten = {
    period: perPeriod.size,
    entityPeriod: perEntityPeriod.size,
    dimensionPeriod: perDimension.size,
  };

  // (f) Idempotency/noop: compare canonicalized candidate rows against the existing namespace rows.
  // Identical -> return noop WITHOUT deleting/inserting (the re-run evidence PG-2 reads).
  const existing: RollupInsertRow[] = [];
  {
    let offset = 0;
    for (;;) {
      const { data, error } = await sb
        .from('summary_rollups')
        .select('data_type, period_id, entity_id, dimension_role, dimension_member, metrics, row_count')
        .eq('tenant_id', tenantId)
        .in('data_type', allTypes)
        .order('id', { ascending: true })
        .range(offset, offset + PAGE - 1);
      if (error) throw new Error(`summary_rollups read: ${error.message}`);
      const rows = (data ?? []) as unknown as RollupInsertRow[];
      if (rows.length === 0) break;
      existing.push(...rows);
      if (rows.length < PAGE) break;
      offset += PAGE;
    }
  }
  const noop = canonicalizeRollups(existing) === canonicalizeRollups(candidates);

  // (g) Write: idempotent replace of ONLY the revenue namespaces (never anyone else's rows).
  if (noop) {
    t(`revenue-rollups-noop rows=${candidates.length} (identical to existing -- no delete/insert)`);
  } else {
    const { error: delErr } = await sb
      .from('summary_rollups')
      .delete()
      .eq('tenant_id', tenantId)
      .in('data_type', allTypes);
    if (delErr) throw new Error(`summary_rollups delete: ${delErr.message}`);
    for (let i = 0; i < candidates.length; i += INSERT_CHUNK) {
      const { error: insErr } = await sb.from('summary_rollups').insert(candidates.slice(i, i + INSERT_CHUNK));
      if (insErr) throw new Error(`summary_rollups insert: ${insErr.message}`);
    }
    t(`revenue-rollups-written period=${rollupsWritten.period} entityPeriod=${rollupsWritten.entityPeriod} dimensionPeriod=${rollupsWritten.dimensionPeriod} (+1 meta)`);
  }

  // (h) Insights (O4) -- off the materialization critical path: a failure is LOUD (trace + console)
  // and reported in the result error field, but never fails the rollup write above.
  let insightError: string | undefined;
  try {
    const ir = await generateRevenueInsights(sb, tenantId);
    if (ir.error) insightError = `revenue insights: ${ir.error}`;
    t(`revenue-insights-done written=${ir.written}${ir.error ? ` error=${ir.error}` : ''}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    insightError = `revenue insights: ${msg}`;
    console.error(`[Revenue Materializer] REVENUE INSIGHTS FAILED (rollups intact; insights missing until next run): ${msg}`);
    t(`revenue-insights-FAILED ${msg}`);
  }

  // (i) Result -- counts + roles + duration (the activation route returns this verbatim, PG-2).
  return {
    ok: true,
    roles,
    rowsScanned,
    rollupsWritten,
    durationMs: Date.now() - t0,
    noop,
    ...(insightError ? { error: insightError } : {}),
  };
}
