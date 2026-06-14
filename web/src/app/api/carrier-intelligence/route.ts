/**
 * OB-205 / DS-029 Phase 1 — GET /api/carrier-intelligence[?tenantId=]
 *
 * Reads carrier state for the authenticated user's tenant and returns the
 * CarrierIntelligence payload. The Observation expression surface (/stream,
 * import completion) consumes this — no plan or calculation prerequisite.
 *
 * RLS DISCIPLINE (DS-029 §3.1): queries run on the tenant-scoped cookie client
 * (createServerSupabaseClient), NOT service-role — RLS policies on committed_data,
 * entities, etc. gate access. The same RLS the client-side /stream loader already
 * relies on (state-reader reads these tables via the browser RLS client). A query
 * ERROR (not empty) is treated as a possible RLS block and surfaced as HALT-1.
 *
 * Aggregation note: PostgREST aggregate functions are DISABLED on this project
 * ("Use of aggregate functions is not allowed"). So grouped counts use exact
 * head-counts per distinct value; date ranges use ordered limit-1; the small
 * classification_signals table is aggregated in JS. entityBound is row-level
 * (entity_id present) — distinct-entity counts would need aggregates.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { CarrierIntelligence } from '@/lib/carrier/types';

export const runtime = 'nodejs';

class CarrierQueryError extends Error {
  constructor(public table: string, detail: string) {
    super(`carrier query failed on '${table}': ${detail}`);
  }
}

const ENTITY_SAMPLE_LIMIT = 20;

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  // Tenant is resolved from the session profile — never trusted from the caller,
  // except a platform caller may select a tenant via ?tenantId.
  const { data: profile } = await supabase
    .from('profiles').select('tenant_id, role').eq('auth_user_id', user.id).maybeSingle();
  const requested = req.nextUrl.searchParams.get('tenantId');
  const isPlatform = ['platform', 'vl_admin'].includes((profile?.role as string) ?? '');
  const tenantId = (isPlatform && requested) ? requested : (profile?.tenant_id as string | null) ?? null;
  if (!tenantId) return NextResponse.json({ error: 'No tenant in session' }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const tbl = (t: string) => sb.from(t).select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId);
  const hc = async (label: string, qb: unknown): Promise<number> => {
    const { count, error } = await (qb as Promise<{ count: number | null; error: { message: string } | null }>);
    if (error) throw new CarrierQueryError(label, error.message);
    return count ?? 0;
  };
  // Distinct values of a low-cardinality column. Sample-bounded (1000) — exact for
  // proof tenants; near-certain for high-frequency columns at scale (R1 residual).
  const distinct = async (label: string, table: string, col: string): Promise<string[]> => {
    const { data, error } = await sb.from(table).select(col).eq('tenant_id', tenantId).limit(1000);
    if (error) throw new CarrierQueryError(label, error.message);
    return Array.from(new Set((data ?? []).map((r: Record<string, unknown>) => r[col]).filter((v: unknown): v is string => typeof v === 'string')));
  };
  const minMax = async (table: string, col: string, extraEq?: [string, string]): Promise<{ earliest: string | null; latest: string | null }> => {
    let asc = sb.from(table).select(col).eq('tenant_id', tenantId).not(col, 'is', null).order(col, { ascending: true }).limit(1);
    let desc = sb.from(table).select(col).eq('tenant_id', tenantId).not(col, 'is', null).order(col, { ascending: false }).limit(1);
    if (extraEq) { asc = asc.eq(extraEq[0], extraEq[1]); desc = desc.eq(extraEq[0], extraEq[1]); }
    const [a, d] = await Promise.all([asc, desc]);
    return { earliest: (a.data?.[0]?.[col] as string) ?? null, latest: (d.data?.[0]?.[col] as string) ?? null };
  };

  try {
    // ── committed_data ──
    const dataTypes = await distinct('committed_data', 'committed_data', 'data_type');
    const [totalRows, entityBound, entityUnbound, dateRange, contentUnits] = await Promise.all([
      hc('committed_data', tbl('committed_data')),
      hc('committed_data', tbl('committed_data').not('entity_id', 'is', null)),
      hc('committed_data', tbl('committed_data').is('entity_id', null)),
      minMax('committed_data', 'source_date'),
      Promise.all(dataTypes.map(async (dt) => {
        const [rowCount, range, entitiesBound] = await Promise.all([
          hc('committed_data', tbl('committed_data').eq('data_type', dt)),
          minMax('committed_data', 'source_date', ['data_type', dt]),
          hc('committed_data', tbl('committed_data').eq('data_type', dt).not('entity_id', 'is', null)),
        ]);
        return { dataType: dt, rowCount, earliest: range.earliest, latest: range.latest, entitiesBound };
      })),
    ]);
    contentUnits.sort((a, b) => b.rowCount - a.rowCount);

    // ── entities ──
    const entityTypes = await distinct('entities', 'entities', 'entity_type');
    const [entTotal, entWithExt, byType, sampleRows] = await Promise.all([
      hc('entities', tbl('entities')),
      hc('entities', tbl('entities').not('external_id', 'is', null)),
      Promise.all(entityTypes.map(async (et) => ({ entityType: et, count: await hc('entities', tbl('entities').eq('entity_type', et)) }))),
      sb.from('entities').select('id, display_name, entity_type, external_id, status').eq('tenant_id', tenantId).order('display_name', { ascending: true }).limit(ENTITY_SAMPLE_LIMIT)
        .then((r: { data: unknown[] | null; error: { message: string } | null }) => { if (r.error) throw new CarrierQueryError('entities', r.error.message); return r.data ?? []; }),
    ]);
    byType.sort((a, b) => b.count - a.count);
    // R3: bounded per-entity transaction counts (≤20 head counts, parallel).
    const sample = await Promise.all((sampleRows as Array<Record<string, unknown>>).map(async (e) => ({
      id: e.id as string,
      displayName: (e.display_name as string) ?? '—',
      entityType: (e.entity_type as string) ?? 'entity',
      externalId: (e.external_id as string | null) ?? null,
      status: (e.status as string) ?? 'unknown',
      transactionCount: await hc('committed_data', tbl('committed_data').eq('entity_id', e.id)),
    })));

    // ── import_batches ──
    const [totalBatches, batchRows] = await Promise.all([
      hc('import_batches', tbl('import_batches')),
      // HF-291 R2: fetch the two most recent batches so the card can show "vs prior import".
      sb.from('import_batches').select('file_name, row_count, completed_at, created_at').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(2)
        .then((r: { data: Array<Record<string, unknown>> | null; error: { message: string } | null }) => { if (r.error) throw new CarrierQueryError('import_batches', r.error.message); return r.data ?? []; }),
    ]);
    const latestBatchRow = (batchRows as Array<Record<string, unknown>>)[0] ?? null;
    const priorBatchRow = (batchRows as Array<Record<string, unknown>>)[1] ?? null;

    // ── classification_signals (small table — fetch + aggregate in JS) ──
    const { data: sigs, error: sigErr } = await sb.from('classification_signals')
      .select('confidence, classification, decision_source').eq('tenant_id', tenantId).limit(5000);
    if (sigErr) throw new CarrierQueryError('classification_signals', sigErr.message);
    const sigRows = (sigs ?? []) as Array<{ confidence: number | null; classification: string | null; decision_source: string | null }>;
    const confs = sigRows.map(s => s.confidence).filter((c): c is number => typeof c === 'number');
    // confidence is stored 0–1 on this carrier; express as a 0–100 percentage (tolerant of
    // any legacy 0–100 rows: only scale up when the mean is in the fractional range).
    const rawAvg = confs.length ? confs.reduce((a, b) => a + b, 0) / confs.length : null;
    const avgConfidence = rawAvg == null ? null : Math.round((rawAvg <= 1 ? rawAvg * 100 : rawAvg) * 10) / 10;
    const tally = (key: 'classification' | 'decision_source') => {
      const m = new Map<string, number>();
      for (const s of sigRows) { const v = s[key]; if (v) m.set(v, (m.get(v) ?? 0) + 1); }
      return Array.from(m.entries()).map(([k, count]) => ({ k, count })).sort((a, b) => b.count - a.count);
    };
    const byClassification = tally('classification').map(({ k, count }) => ({ classification: k, count }));
    const byDecisionSource = tally('decision_source').map(({ k, count }) => ({ source: k, count }));

    // ── pipeline readiness ──
    const [planCount, bindingCount, latestCalc, periodRows] = await Promise.all([
      hc('rule_sets', tbl('rule_sets').neq('status', 'draft')),
      hc('rule_set_assignments', tbl('rule_set_assignments')),
      sb.from('calculation_batches').select('lifecycle_state, created_at').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(1)
        .then((r: { data: Array<Record<string, unknown>> | null; error: { message: string } | null }) => { if (r.error) throw new CarrierQueryError('calculation_batches', r.error.message); return r.data?.[0] ?? null; }),
      sb.from('periods').select('id, label, start_date, end_date, status').eq('tenant_id', tenantId).order('start_date', { ascending: false })
        .then((r: { data: Array<Record<string, unknown>> | null; error: { message: string } | null }) => { if (r.error) throw new CarrierQueryError('periods', r.error.message); return r.data ?? []; }),
    ]);

    const payload: CarrierIntelligence = {
      dataSnapshot: { totalRows, contentUnits, dateRange, entityBound, entityUnbound },
      entities: { total: entTotal, byType, withExternalId: entWithExt, sample },
      imports: {
        totalBatches,
        latestBatch: latestBatchRow ? {
          fileName: (latestBatchRow.file_name as string) ?? 'import',
          rowCount: (latestBatchRow.row_count as number) ?? 0,
          completedAt: (latestBatchRow.completed_at as string | null) ?? null,
          createdAt: (latestBatchRow.created_at as string) ?? '',
        } : null,
        priorBatch: priorBatchRow ? {
          rowCount: (priorBatchRow.row_count as number) ?? 0,
          createdAt: (priorBatchRow.created_at as string) ?? '',
        } : null,
      },
      classification: { avgConfidence, byClassification, byDecisionSource },
      pipelineReadiness: {
        hasData: totalRows > 0,
        hasEntities: entTotal > 0,
        hasPlan: planCount > 0,
        hasBindings: bindingCount > 0,
        hasCalculation: !!latestCalc,
        latestLifecycleState: (latestCalc?.lifecycle_state as string | null) ?? null,
      },
      periods: (periodRows as Array<Record<string, unknown>>).map(p => ({
        id: p.id as string,
        label: (p.label as string) ?? '',
        startDate: (p.start_date as string) ?? '',
        endDate: (p.end_date as string) ?? '',
        status: (p.status as string) ?? '',
      })),
    };

    return NextResponse.json(payload);
  } catch (e) {
    if (e instanceof CarrierQueryError) {
      // HALT-1 signal: a carrier table query errored (possible RLS block).
      return NextResponse.json({ error: e.message, table: e.table, halt: 'HALT-1' }, { status: 403 });
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : 'carrier intelligence failed' }, { status: 500 });
  }
}
