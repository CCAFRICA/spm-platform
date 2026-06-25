/**
 * POST /api/financial/data
 *
 * OB-99 Phase 1: Server-side financial data aggregation.
 * Replaces client-side paginated fetching (47+ requests per page)
 * with a single server-side aggregation that returns small pre-computed JSON.
 *
 * Body: { tenantId, mode, granularity?, locationFilter?, locationId?, serverId?, scopeEntityIds? }
 * Modes: network_pulse | leakage | performance | staff | timeline | patterns | summary | products | location_detail | server_detail
 * scopeEntityIds: Optional persona-based entity filtering (F-8/F-9). When provided, only cheques for these entity_ids are included.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js'; // OB-229
import { getSummaryArtifacts } from '@/lib/summary/summary-read'; // OB-229
import { recognize } from '@/lib/comprehension/surface-binding-recognition'; // HF-337

// ═══════════════════════════════════════════════════════════════════
// Types (shared with financial-data-service.ts)
// ═══════════════════════════════════════════════════════════════════

interface ChequeRowData {
  numero_franquicia: string;
  turno_id: number;
  folio: number;
  numero_cheque: number;
  fecha: string;
  cierre: string;
  numero_de_personas: number;
  mesero_id: number;
  pagado: number;
  cancelado: number;
  total_articulos: number;
  total: number;
  efectivo: number;
  tarjeta: number;
  propina: number;
  descuento: number;
  subtotal: number;
  subtotal_con_descuento: number;
  total_impuesto: number;
  total_descuentos: number;
  total_cortesias: number;
  total_alimentos: number;
  total_bebidas: number;
}

interface ChequeRecord {
  entity_id: string;
  row_data: ChequeRowData;
}

interface EntityRecord {
  id: string;
  display_name: string;
  external_id: string | null;
  entity_type: string;
  metadata: Record<string, unknown> | null;
}

interface BrandInfo {
  id: string;
  name: string;
  code: string;
  color: string;
  format: string;
  avgTicketRange: [number, number];
  benchmarkChequesMin: number;
  benchmarkChequesMax: number;
}

// OB-237 T-FIN: the whole-table raw-cheque fetch (and its in-process cache) are RETIRED. Every mode now
// reads pre-computed materializations (summary_artifacts / summary_artifacts_fine) or a bounded
// committed_data query (cheques drill-through). No mode loads all 263K cheques into memory anymore.

// ═══════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════

function n(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') { const p = parseFloat(v); return isNaN(p) ? 0 : p; }
  return 0;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function makeBuckets(daily: Map<string, number>, count: number): number[] {
  const sorted = Array.from(daily.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  if (sorted.length === 0) return Array(count).fill(0);
  const size = Math.ceil(sorted.length / count);
  const buckets: number[] = [];
  for (let i = 0; i < count; i++) {
    const start = i * size;
    const end = Math.min(start + size, sorted.length);
    let sum = 0;
    for (let j = start; j < end; j++) sum += sorted[j][1];
    buckets.push(Math.round(sum));
  }
  return buckets;
}

function weekIndex(dateStr: string, allDates: string[]): number {
  if (allDates.length === 0) return 0;
  const first = allDates[0];
  const d = new Date(dateStr);
  const s = new Date(first);
  const diff = d.getTime() - s.getTime();
  return Math.floor(diff / (7 * 24 * 60 * 60 * 1000));
}

function percentileRank(sorted: number[], value: number): number {
  if (sorted.length <= 1) return 1;
  let below = 0;
  for (const v of sorted) {
    if (v < value) below++;
  }
  return below / (sorted.length - 1);
}

const BRAND_PALETTE = ['#ef4444', '#22c55e', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899'];

function buildBrandLookup(entities: EntityRecord[]): Map<string, BrandInfo> {
  const brands = entities.filter(e => e.entity_type === 'organization' && (e.metadata as Record<string, unknown>)?.role === 'brand');
  const lookup = new Map<string, BrandInfo>();
  brands.forEach((b, i) => {
    const m = (b.metadata || {}) as Record<string, unknown>;
    lookup.set(b.id, {
      id: b.id,
      name: b.display_name,
      code: b.external_id || '',
      color: BRAND_PALETTE[i % BRAND_PALETTE.length],
      format: String(m.format || ''),
      avgTicketRange: (m.avg_ticket_range as [number, number]) || [0, 0],
      benchmarkChequesMin: n(m.benchmark_cheques_per_day_min),
      benchmarkChequesMax: n(m.benchmark_cheques_per_day_max),
    });
  });
  return lookup;
}

function getLocationBrand(loc: EntityRecord, brandLookup: Map<string, BrandInfo>): BrandInfo | null {
  const brandId = String((loc.metadata as Record<string, unknown>)?.brand_id || '');
  return brandLookup.get(brandId) || null;
}

// ═══════════════════════════════════════════════════════════════════
// OB-237 T-FIN: summary_artifacts_fine reader (entity, mesero/sub_entity, date, hour grain).
// The fine sibling materialization unblocks the sub-entity / hourly modes (staff, location_detail
// staff-section, patterns, server_detail) that the (entity, day) summary_artifacts cannot serve.
// Paged (entity×mesero×date×hour can far exceed the 1000-row cap). Optional entity / mesero filters
// push the predicate into the indexed query so per-request rows fetched stay small.
// ═══════════════════════════════════════════════════════════════════

interface FineArtifact {
  entity_id: string;
  sub_entity_id: string;       // String(row_data.mesero_id)
  summary_date: string;        // committed_data.source_date (== fecha day-string)
  hour: number;                // new Date(row_data.fecha).getHours()
  metrics: Record<string, number>;
  row_count: number;
}

async function getFineArtifacts(
  sb: SupabaseClient,
  tenantId: string,
  q: { entityId?: string; subEntityId?: string } = {},
): Promise<FineArtifact[]> {
  const PAGE = 1000;
  const out: FineArtifact[] = [];
  let offset = 0;
  for (;;) {
    let query = sb
      .from('summary_artifacts_fine')
      .select('entity_id, sub_entity_id, summary_date, hour, metrics, row_count')
      .eq('tenant_id', tenantId)
      .eq('data_type', 'pos_cheque');
    if (q.entityId) query = query.eq('entity_id', q.entityId);
    if (q.subEntityId) query = query.eq('sub_entity_id', q.subEntityId);
    // .order('id') — unique key. summary_date is NON-unique; paging on it lets PostgREST return
    // overlapping/duplicate rows across page boundaries (server_detail counted 4371 vs the true 4368).
    const { data, error } = await query
      .order('id', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`summary_artifacts_fine read: ${error.message}`);
    if (!data || data.length === 0) break;
    out.push(...(data as FineArtifact[]));
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════
// OB-237 RESIDUAL: write-time rollup reader (the THIRD materialization tier). staff_rollup (per
// location×mesero, ~40 rows) and patterns_rollup (per entity×day-of-week, ~140 rows) are pre-aggregated
// from summary_artifacts_fine at materialization time so the staff/patterns surfaces read a small set
// instead of reducing 88K fine rows in JS. metrics is a free-form rollup blob (not the per-field sums of
// the fine tier), so it is typed loosely here. Small reads — single page suffices, but page defensively.
// ═══════════════════════════════════════════════════════════════════
interface RollupRow {
  entity_id: string;
  sub_entity_id: string;
  metrics: Record<string, unknown>;
  row_count: number;
}

async function getRollupRows(
  sb: SupabaseClient,
  tenantId: string,
  dataType: string,
  entityId?: string,
): Promise<RollupRow[]> {
  const PAGE = 1000;
  const out: RollupRow[] = [];
  let offset = 0;
  for (;;) {
    let query = sb
      .from('summary_artifacts_fine')
      .select('entity_id, sub_entity_id, metrics, row_count')
      .eq('tenant_id', tenantId)
      .eq('data_type', dataType);
    if (entityId) query = query.eq('entity_id', entityId);
    const { data, error } = await query.order('id', { ascending: true }).range(offset, offset + PAGE - 1);
    if (error) throw new Error(`${dataType} read: ${error.message}`);
    if (!data || data.length === 0) break;
    out.push(...(data as RollupRow[]));
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════
// Aggregation: Network Pulse
// ═══════════════════════════════════════════════════════════════════

// OB-229: source-agnostic per-location accumulator (shared by the raw and summary-backed paths).
interface NpLocAgg {
  id: string; name: string; city: string;
  brandId: string; brandName: string; brandColor: string;
  revenue: number; cheques: number; tips: number;
  food: number; bev: number; discounts: number; comps: number;
  daily: Map<string, number>;
}

function newNpLocMap(locations: EntityRecord[], brandLookup: Map<string, BrandInfo>): Map<string, NpLocAgg> {
  const locMap = new Map<string, NpLocAgg>();
  for (const loc of locations) {
    const m = (loc.metadata || {}) as Record<string, unknown>;
    const brand = getLocationBrand(loc, brandLookup);
    locMap.set(loc.id, {
      id: loc.id, name: loc.display_name,
      city: String(m.city || ''),
      brandId: brand?.id || '',
      brandName: brand?.name || '',
      brandColor: brand?.color || '#6b7280',
      revenue: 0, cheques: 0, tips: 0, food: 0, bev: 0,
      discounts: 0, comps: 0,
      daily: new Map(),
    });
  }
  return locMap;
}

// OB-229: shared finalize — identical output shape whether locMap was filled from raw cheques or from
// pre-computed summary_artifacts. The ONLY difference between paths is how locMap is populated.
function finalizeNetworkPulse(locMap: Map<string, NpLocAgg>, locations: EntityRecord[], brandLookup: Map<string, BrandInfo>) {
  const locs = Array.from(locMap.values()).filter(l => l.cheques > 0);
  const totalCheques = locs.reduce((s, l) => s + l.cheques, 0);
  const totalRevenue = locs.reduce((s, l) => s + l.revenue, 0);
  const totalTips = locs.reduce((s, l) => s + l.tips, 0);
  const totalDiscounts = locs.reduce((s, l) => s + l.discounts, 0);
  const totalComps = locs.reduce((s, l) => s + l.comps, 0);
  const avgCheck = totalCheques > 0 ? totalRevenue / totalCheques : 0;
  const tipRate = totalRevenue > 0 ? (totalTips / totalRevenue) * 100 : 0;
  const leakageRate = totalRevenue > 0 ? ((totalDiscounts + totalComps) / totalRevenue) * 100 : 0;

  const locResults = locs
    .sort((a, b) => b.revenue - a.revenue)
    .map(l => {
      const locAvg = l.cheques > 0 ? l.revenue / l.cheques : 0;
      const ratio = avgCheck > 0 ? locAvg / avgCheck : 1;
      return {
        id: l.id, name: l.name, city: l.city,
        brandId: l.brandId, brandName: l.brandName, brandColor: l.brandColor,
        revenue: round2(l.revenue),
        avgCheck: round2(locAvg),
        weeklyData: makeBuckets(l.daily, 7),
        vsNetworkAvg: (ratio > 1.05 ? 'above' : ratio < 0.95 ? 'below' : 'within') as 'above' | 'within' | 'below',
        tipRate: l.revenue > 0 ? round2((l.tips / l.revenue) * 100) : 0,
        leakageRate: l.revenue > 0 ? round2(((l.discounts + l.comps) / l.revenue) * 100) : 0,
      };
    });

  const brandAgg = new Map<string, { id: string; name: string; concept: string; color: string; locs: number; revenue: number; cheques: number; tips: number }>();
  for (const [, brand] of Array.from(brandLookup.entries())) {
    brandAgg.set(brand.id, { id: brand.id, name: brand.name, concept: brand.format, color: brand.color, locs: 0, revenue: 0, cheques: 0, tips: 0 });
  }
  for (const l of locs) {
    const b = brandAgg.get(l.brandId);
    if (b) { b.locs++; b.revenue += l.revenue; b.cheques += l.cheques; b.tips += l.tips; }
  }

  return {
    networkMetrics: {
      netRevenue: round2(totalRevenue),
      revenueChange: 0,
      checksServed: totalCheques,
      checksChange: 0,
      avgCheck: round2(avgCheck),
      avgCheckChange: 0,
      tipRate: round2(tipRate),
      tipTarget: 12,
      leakageRate: round2(leakageRate),
      leakageThreshold: 3,
      activeLocations: locs.length,
      totalLocations: locations.length,
    },
    locations: locResults,
    brands: Array.from(brandAgg.values()).map(b => ({
      id: b.id, name: b.name, concept: b.concept, color: b.color,
      locationCount: b.locs,
      totalRevenue: round2(b.revenue),
      avgCheck: b.cheques > 0 ? round2(b.revenue / b.cheques) : 0,
      tipRate: b.revenue > 0 ? b.tips / b.revenue : 0,
    })),
  };
}

// OB-237 T-FIN: the raw aggregateNetworkPulse (whole-table cheque scan) is retired — network_pulse is now
// served exclusively from summary_artifacts via aggregateNetworkPulseFromSummaries (value-matched).

// OB-229 summary-backed path: populate locMap from summary_artifacts (O(1)) instead of fetching+looping
// 263K raw cheques. Byte-equivalent to the raw path BY CONSTRUCTION: metrics.total = Σ cheque.total per
// (entity, day); row_count = the real cheque count; summary_date = the daily key. Returns null if the
// tenant has no summaries yet (caller falls back to raw). The financial field names (total/propina/…)
// live in this financial-domain CONSUMER, not in the domain-agnostic engine (Korean Test unaffected).
async function aggregateNetworkPulseFromSummaries(
  sb: SupabaseClient,
  tenantId: string,
  entities: EntityRecord[],
  scopeEntityIds?: string[],
): Promise<ReturnType<typeof finalizeNetworkPulse> | null> {
  let arts = await getSummaryArtifacts(sb, tenantId, { dataType: 'pos_cheque' });
  if (arts.length === 0) return null;
  if (scopeEntityIds !== undefined) arts = arts.filter(a => scopeEntityIds.includes(a.entity_id));
  const locations = entities.filter(e => e.entity_type === 'location');
  const brandLookup = buildBrandLookup(entities);
  // HF-337 Surface Binding Recognition: resolve each financial measure to the comprehended field that
  // satisfies its FREE-FORM purpose (recognition, not a hardcoded semantic key — the OB-233 break was
  // m.revenue/m.tips, whose keys are now comprehension display_labels). Cached per (tenant
  // comprehension-fingerprint x surface) in surface_bindings; re-encounter reads the binding (no LLM).
  // The financial measure->purpose authoring lives in THIS financial consumer; the recognizer + store
  // hold no domain vocabulary (Korean Test).
  const MEASURES = [
    { key: 'revenue',   surface: 'financial.network_pulse.revenue',       purpose: 'the primary monetary amount of money earned or charged as the gross outcome of each transaction or sale' },
    { key: 'tips',      surface: 'financial.network_pulse.tips',          purpose: 'the gratuity or tip amount the customer adds on top of the charge' },
    { key: 'food',      surface: 'financial.network_pulse.food',          purpose: 'the portion of the charge attributable to food, or the primary product category' },
    { key: 'bev',       surface: 'financial.network_pulse.beverage',      purpose: 'the portion of the charge attributable to beverages, or a secondary product category' },
    { key: 'discounts', surface: 'financial.network_pulse.discount',      purpose: 'the amount discounted or reduced from the charge' },
    { key: 'comps',     surface: 'financial.network_pulse.complimentary', purpose: 'the amount given away as complimentary or comped (a zero-charge item)' },
  ] as const;
  const summaryKeyFor: Record<string, string> = {};
  for (const meas of MEASURES) {
    const r = await recognize(sb, tenantId, meas.surface, meas.purpose);
    // OB-237 T1: resolve to field_name (the actual committed_data / summary_artifacts.metrics key —
    // lowercase, domain-agnostic) NOT display_label (a human label that may diverge, e.g. propina ->
    // "Propinas"). summary_artifacts is now keyed by raw field name (the OB-229 jsonb_each key).
    if (r.status === 'resolved' && r.fields[0]) summaryKeyFor[meas.key] = r.fields[0].field_name ?? r.fields[0].display_label;
  }
  // Graceful degradation (C2 / strict-2): no measure resolved -> the opinionated financial lens has
  // nothing to bind; return null so the caller renders the raw aggregation (comprehension-driven
  // salience over row_data) — never a silent blank.
  if (Object.keys(summaryKeyFor).length === 0) return null;
  const mv = (m: Record<string, number>, key: string) => (summaryKeyFor[key] ? (m[summaryKeyFor[key]] ?? 0) : 0);

  const locMap = newNpLocMap(locations, brandLookup);
  for (const a of arts) {
    const agg = locMap.get(a.entity_id);
    if (!agg) continue;
    const m = a.metrics || {};
    agg.cheques += a.row_count;
    agg.revenue += mv(m, 'revenue');
    agg.tips += mv(m, 'tips');
    agg.food += mv(m, 'food');
    agg.bev += mv(m, 'bev');
    agg.discounts += mv(m, 'discounts');
    agg.comps += mv(m, 'comps');
    agg.daily.set(a.summary_date, (agg.daily.get(a.summary_date) || 0) + mv(m, 'revenue'));
  }
  return finalizeNetworkPulse(locMap, locations, brandLookup);
}

// OB-237 P0: leakage from summary_artifacts (entity, day). Discount/comp amounts from metrics; cancelled
// revenue + the conditional counts (discount_count/comp_count/cancelled_count) from the OB-237 conditional
// metrics. Grouped by summary_date (deterministic truth date). Shape-identical to aggregateLeakage.
async function aggregateLeakageFromSummaries(
  sb: SupabaseClient,
  tenantId: string,
  entities: EntityRecord[],
  scopeEntityIds?: string[],
) {
  let arts = await getSummaryArtifacts(sb, tenantId, { dataType: 'pos_cheque' });
  if (arts.length === 0) return null;
  if (scopeEntityIds !== undefined) arts = arts.filter(a => scopeEntityIds.includes(a.entity_id));

  const keyFor = async (surface: string, purpose: string): Promise<string | null> => {
    const r = await recognize(sb, tenantId, surface, purpose);
    return r.status === 'resolved' && r.fields[0] ? (r.fields[0].field_name ?? r.fields[0].display_label) : null;
  };
  const revKey = await keyFor('financial.network_pulse.revenue', 'the primary monetary amount of money earned or charged as the gross outcome of each transaction or sale');
  const discKey = await keyFor('financial.network_pulse.discount', 'the amount discounted or reduced from the charge');
  const compKey = await keyFor('financial.network_pulse.complimentary', 'the amount given away as complimentary or comped (a zero-charge item)');
  if (!revKey) return null;
  const mv = (m: Record<string, number>, key: string | null) => (key ? (m[key] ?? 0) : 0);

  const locations = entities.filter(e => e.entity_type === 'location');
  const brandLookup = buildBrandLookup(entities);
  const allDates = Array.from(new Set(arts.map(a => a.summary_date).filter(Boolean))).sort();
  const midDate = allDates[Math.floor(allDates.length / 2)] || '';

  let totalDiscounts = 0, discountCount = 0, totalComps = 0, compCount = 0, totalCancelRevenue = 0, cancelCount = 0;
  let firstHalfDisc = 0, secondHalfDisc = 0, firstHalfComp = 0, secondHalfComp = 0, firstHalfCancel = 0, secondHalfCancel = 0;
  interface LocWeek { revenue: number; leakage: number; }
  const locWeekly = new Map<string, LocWeek[]>();
  const locTotals = new Map<string, { revenue: number; leakage: number; name: string; brand: string }>();
  for (const loc of locations) {
    const brand = getLocationBrand(loc, brandLookup);
    locTotals.set(loc.id, { revenue: 0, leakage: 0, name: loc.display_name, brand: brand?.name || '' });
    locWeekly.set(loc.id, [{ revenue: 0, leakage: 0 }, { revenue: 0, leakage: 0 }, { revenue: 0, leakage: 0 }, { revenue: 0, leakage: 0 }]);
  }
  const weekTotals = [{ revenue: 0, leakage: 0 }, { revenue: 0, leakage: 0 }, { revenue: 0, leakage: 0 }, { revenue: 0, leakage: 0 }];

  for (const a of arts) {
    const m = a.metrics || {};
    const disc = mv(m, discKey), comp = mv(m, compKey), revenue = mv(m, revKey);
    const cancelRev = Number(m.cancelled_revenue ?? 0);
    const chequeLeakage = disc + comp + cancelRev;
    const dt = a.summary_date;
    const isSecondHalf = dt >= midDate;

    totalDiscounts += disc; discountCount += Number(m.discount_count ?? 0);
    totalComps += comp; compCount += Number(m.comp_count ?? 0);
    totalCancelRevenue += cancelRev; cancelCount += Number(m.cancelled_count ?? 0);

    if (isSecondHalf) { secondHalfDisc += disc; secondHalfComp += comp; secondHalfCancel += cancelRev; }
    else { firstHalfDisc += disc; firstHalfComp += comp; firstHalfCancel += cancelRev; }

    const lt = locTotals.get(a.entity_id);
    if (lt) { lt.revenue += revenue; lt.leakage += chequeLeakage; }
    const wi = Math.min(weekIndex(dt, allDates), 3);
    const lw = locWeekly.get(a.entity_id);
    if (lw && lw[wi]) { lw[wi].revenue += revenue; lw[wi].leakage += chequeLeakage; }
    if (weekTotals[wi]) { weekTotals[wi].revenue += revenue; weekTotals[wi].leakage += chequeLeakage; }
  }

  const discTrend = firstHalfDisc > 0 ? ((secondHalfDisc - firstHalfDisc) / firstHalfDisc) * 100 : 0;
  const compTrend = firstHalfComp > 0 ? ((secondHalfComp - firstHalfComp) / firstHalfComp) * 100 : 0;
  const cancelTrend = firstHalfCancel > 0 ? ((secondHalfCancel - firstHalfCancel) / firstHalfCancel) * 100 : 0;

  const categories = [
    { category: 'Cancelaciones', key: 'cancelaciones', amount: round2(totalCancelRevenue), count: cancelCount, trend: round2(cancelTrend) },
    { category: 'Descuentos', key: 'descuentos', amount: round2(totalDiscounts), count: discountCount, trend: round2(discTrend) },
    { category: 'Cortesías', key: 'cortesias', amount: round2(totalComps), count: compCount, trend: round2(compTrend) },
  ].sort((a, b) => b.amount - a.amount);

  const locData = Array.from(locTotals.entries())
    .filter(([, v]) => v.revenue > 0)
    .map(([id, v]) => {
      const rate = v.revenue > 0 ? (v.leakage / v.revenue) * 100 : 0;
      const lw = locWeekly.get(id) || [];
      const weeklyTrend = lw.map(w => w.revenue > 0 ? round2((w.leakage / w.revenue) * 100) : 0);
      return { id, name: v.name, brand: v.brand, leakageAmount: round2(v.leakage), leakageRate: round2(rate), threshold: 2.5, status: (rate > 3.5 ? 'critical' : rate > 2.5 ? 'warning' : 'ok') as 'ok' | 'warning' | 'critical', weeklyTrend };
    })
    .sort((a, b) => b.leakageRate - a.leakageRate);

  const trend = weekTotals.map((w, i) => ({ period: `W${i + 1}`, amount: round2(w.leakage), rate: w.revenue > 0 ? round2((w.leakage / w.revenue) * 100) : 0 }));
  return { categories, locations: locData, trend };
}

// OB-237 T1: per-location performance from summary_artifacts (entity, day). Same per-location metrics +
// brand benchmarks + weekly buckets as aggregatePerformance, read from the materialization (raw field
// keys == recognize().field_name). Grand revenue across locations value-matches the committed_data truth.
async function aggregatePerformanceFromSummaries(
  sb: SupabaseClient,
  tenantId: string,
  entities: EntityRecord[],
  scopeEntityIds?: string[],
) {
  let arts = await getSummaryArtifacts(sb, tenantId, { dataType: 'pos_cheque' });
  if (arts.length === 0) return null;
  if (scopeEntityIds !== undefined) arts = arts.filter(a => scopeEntityIds.includes(a.entity_id));

  const locations = entities.filter(e => e.entity_type === 'location');
  const brandLookup = buildBrandLookup(entities);
  interface LocPerf { id: string; name: string; city: string; brandId: string; brandName: string; brandColor: string; revenue: number; cheques: number; tips: number; food: number; bev: number; discounts: number; comps: number; daily: Map<string, number>; weeklyRevenue: [number, number, number, number]; }
  const locMap = new Map<string, LocPerf>();
  for (const loc of locations) {
    const m = (loc.metadata || {}) as Record<string, unknown>;
    const brand = getLocationBrand(loc, brandLookup);
    locMap.set(loc.id, { id: loc.id, name: loc.display_name, city: String(m.city || ''), brandId: brand?.id || '', brandName: brand?.name || '', brandColor: brand?.color || '#6b7280', revenue: 0, cheques: 0, tips: 0, food: 0, bev: 0, discounts: 0, comps: 0, daily: new Map(), weeklyRevenue: [0, 0, 0, 0] });
  }

  const allDates = Array.from(new Set(arts.map(a => a.summary_date).filter(Boolean))).sort();
  for (const a of arts) {
    const agg = locMap.get(a.entity_id);
    if (!agg) continue;
    const m = a.metrics || {};
    agg.revenue += n(m.total); agg.cheques += a.row_count; agg.tips += n(m.propina);
    agg.food += n(m.total_alimentos); agg.bev += n(m.total_bebidas);
    agg.discounts += n(m.total_descuentos); agg.comps += n(m.total_cortesias);
    const dt = a.summary_date;
    if (dt) agg.daily.set(dt, (agg.daily.get(dt) || 0) + n(m.total));
    const wi = Math.min(weekIndex(dt, allDates), 3);
    agg.weeklyRevenue[wi] += n(m.total);
  }

  const locs = Array.from(locMap.values()).filter(l => l.cheques > 0);
  if (locs.length === 0) return null;

  const brandAvg = new Map<string, { revenue: number; cheques: number }>();
  for (const l of locs) {
    const b = brandAvg.get(l.brandId) || { revenue: 0, cheques: 0 };
    b.revenue += l.revenue; b.cheques += l.cheques;
    brandAvg.set(l.brandId, b);
  }
  const networkTips = locs.reduce((s, l) => s + l.tips, 0);
  const networkRevenue = locs.reduce((s, l) => s + l.revenue, 0);
  const networkAvgTipRate = networkRevenue > 0 ? (networkTips / networkRevenue) * 100 : 0;

  const byRevenue = locs.sort((a, b) => b.revenue - a.revenue);
  const maxRevenue = byRevenue[0]?.revenue || 1;
  const prevRevenue = locs.map(l => ({ id: l.id, rev: l.weeklyRevenue[0] + l.weeklyRevenue[1] + l.weeklyRevenue[2] })).sort((a, b) => b.rev - a.rev);
  const prevRankMap = new Map<string, number>();
  prevRevenue.forEach((pr, i) => prevRankMap.set(pr.id, i + 1));

  return byRevenue.map((l, i) => {
    const rank = i + 1;
    const prevRank = prevRankMap.get(l.id) || rank;
    const bAvg = brandAvg.get(l.brandId);
    const brandAvgCheck = bAvg && bAvg.cheques > 0 ? bAvg.revenue / bAvg.cheques : 0;
    const lastWeek = l.weeklyRevenue[3] || 0;
    const prevWeek = l.weeklyRevenue[2] || 0;
    const wowChange = prevWeek > 0 ? ((lastWeek - prevWeek) / prevWeek) * 100 : 0;
    const totalFoodBev = l.food + l.bev;
    const foodPct = totalFoodBev > 0 ? Math.round((l.food / totalFoodBev) * 100) : 50;
    const leakage = l.revenue > 0 ? ((l.discounts + l.comps) / l.revenue) * 100 : 0;
    return {
      id: l.id, rank, rankChange: prevRank - rank,
      name: l.name, city: l.city,
      brandId: l.brandId, brandName: l.brandName, brandColor: l.brandColor,
      revenue: round2(l.revenue), maxRevenue: round2(maxRevenue),
      avgCheck: l.cheques > 0 ? round2(l.revenue / l.cheques) : 0,
      brandAvgCheck: round2(brandAvgCheck),
      wowChange: round2(wowChange),
      weeklyTrend: makeBuckets(l.daily, 7),
      foodBevRatio: { food: foodPct, bev: 100 - foodPct },
      tipRate: l.revenue > 0 ? round2((l.tips / l.revenue) * 100) : 0,
      networkAvgTipRate: round2(networkAvgTipRate),
      leakage: round2(leakage),
    };
  });
}


// OB-237 T-FIN: staff from summary_artifacts_fine (entity, mesero, date, hour). Mirrors aggregateStaff
// EXACTLY — per-mesero revenue/checks/tips/weeklyRevenue, percentile performanceIndex, ranking, staff
// entity join by metadata.mesero_id. The fine totals are UNCONDITIONAL (include cancelled cheques); the
// raw staff path EXCLUDES cancelled cheques, so the non-cancelled aggregate is reconstructed by
// subtracting the cancelled_revenue/cancelled_count/cancelled_tips conditional metrics (per fine row, so
// the per-week bucket subtraction is exact). Grand SUM(non-cancelled revenue) value-matches the
// deterministic committed_data truth (SUM(total WHERE cancelado<>1)).
async function aggregateStaffFromFine(
  sb: SupabaseClient,
  tenantId: string,
  entities: EntityRecord[],
  scopeEntityIds?: string[],
) {
  // OB-237 RESIDUAL: read the staff_rollup tier (~40 pre-aggregated (location, mesero) rows) instead of
  // reducing the 88K-row fine table. metrics already carry excl-cancelled revenue/checks/tips + the four
  // weekly buckets, computed at materialization time by the same skip/cancel/weekIndex rule this loop used.
  let rows = await getRollupRows(sb, tenantId, 'staff_rollup');
  if (rows.length === 0) return null;
  if (scopeEntityIds !== undefined) rows = rows.filter(r => scopeEntityIds.includes(r.entity_id));

  const staffEntities = entities.filter(e => e.entity_type === 'individual');
  const locationEntities = entities.filter(e => e.entity_type === 'location');

  const staffByMeseroId = new Map<string, EntityRecord>();
  for (const se of staffEntities) {
    const meseroId = (se.metadata as Record<string, unknown>)?.mesero_id;
    if (meseroId != null) staffByMeseroId.set(String(meseroId), se);
  }
  const locationById = new Map<string, EntityRecord>();
  for (const le of locationEntities) locationById.set(le.id, le);

  interface StaffAgg { meseroId: string; revenue: number; checks: number; tips: number; weeklyRevenue: [number, number, number, number]; }
  const staffMap = new Map<string, StaffAgg>();

  // Group rollup rows by mesero (summing across locations to match the prior mesero-keyed aggregate;
  // scopeEntityIds already filtered on entity_id/location above).
  for (const r of rows) {
    const mid = r.sub_entity_id;
    if (!mid || mid === '0' || mid === '') continue;
    const m = r.metrics || {};
    let agg = staffMap.get(mid);
    if (!agg) { agg = { meseroId: mid, revenue: 0, checks: 0, tips: 0, weeklyRevenue: [0, 0, 0, 0] }; staffMap.set(mid, agg); }
    agg.revenue += n(m.revenue);
    agg.checks += n(m.checks);
    agg.tips += n(m.tips);
    agg.weeklyRevenue[0] += n(m.week0);
    agg.weeklyRevenue[1] += n(m.week1);
    agg.weeklyRevenue[2] += n(m.week2);
    agg.weeklyRevenue[3] += n(m.week3);
  }

  const staffList: Array<StaffAgg & { entity: EntityRecord }> = [];
  for (const agg of Array.from(staffMap.values())) {
    const entity = staffByMeseroId.get(String(agg.meseroId));
    if (!entity) continue;
    staffList.push({ ...agg, entity });
  }
  if (staffList.length === 0) return null;

  const revenues = staffList.map(s => s.revenue).sort((a, b) => a - b);
  const avgChecks = staffList.map(s => s.checks > 0 ? s.revenue / s.checks : 0).sort((a, b) => a - b);
  const tipRates = staffList.map(s => s.revenue > 0 ? s.tips / s.revenue : 0).sort((a, b) => a - b);

  const withIndex = staffList.map(s => {
    const avgCheck = s.checks > 0 ? s.revenue / s.checks : 0;
    const tipRate = s.revenue > 0 ? s.tips / s.revenue : 0;
    const pi = Math.round(
      percentileRank(revenues, s.revenue) * 40 +
      percentileRank(avgChecks, avgCheck) * 30 +
      percentileRank(tipRates, tipRate) * 30
    );
    return { ...s, avgCheck, tipRate, performanceIndex: Math.max(50, Math.min(100, pi + 50)) };
  });
  withIndex.sort((a, b) => b.performanceIndex - a.performanceIndex);

  const prevSorted = [...withIndex].sort((a, b) => {
    const aRev = a.weeklyRevenue[0] + a.weeklyRevenue[1] + a.weeklyRevenue[2];
    const bRev = b.weeklyRevenue[0] + b.weeklyRevenue[1] + b.weeklyRevenue[2];
    return bRev - aRev;
  });
  const prevRankMap = new Map<string, number>();
  prevSorted.forEach((s, i) => prevRankMap.set(s.meseroId, i + 1));

  return withIndex.map((s, i) => {
    const meta = (s.entity.metadata || {}) as Record<string, unknown>;
    const rank = i + 1;
    const locEntity = locationById.get(String(meta.location_id || ''));
    return {
      id: s.entity.id,
      name: s.entity.display_name,
      role: String(meta.role || 'Server'),
      locationId: String(meta.location_id || ''),
      locationName: locEntity?.display_name || String(meta.location_ext_id || ''),
      revenue: round2(s.revenue),
      checks: s.checks,
      avgCheck: round2(s.avgCheck),
      tips: round2(s.tips),
      tipRate: round2(s.tipRate * 100),
      performanceIndex: s.performanceIndex,
      rank,
      prevRank: prevRankMap.get(s.meseroId) || rank,
      weeklyTrend: s.weeklyRevenue.map(v => Math.round(v)),
    };
  });
}

// OB-237 T1: shared timeline finalizer — groups (date -> revenue/checks/tips) maps into periods and
// builds the {data, brandData, brandNames, brandColors} response. Identical logic to the raw
// aggregateTimeline tail so the wired output is shape-identical.
interface TlDateAgg { revenue: number; checks: number; tips: number; }
function buildTimelineResponse(
  dateAll: Map<string, TlDateAgg>,
  dateBrand: Map<string, Map<string, TlDateAgg>>,
  brandColorMap: Map<string, string>,
  granularity: 'day' | 'week' | 'month',
) {
  const sortedDates = Array.from(dateAll.keys()).sort();
  if (sortedDates.length === 0) return null;

  interface PeriodAgg { label: string; revenue: number; checks: number; tips: number; brands: Map<string, TlDateAgg>; }

  function groupIntoPeriods(): PeriodAgg[] {
    const periods: PeriodAgg[] = [];
    if (granularity === 'day') {
      for (const dt of sortedDates) {
        const d = new Date(dt);
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const label = `${dayNames[d.getDay()]} ${d.getDate()}`;
        const all = dateAll.get(dt)!;
        periods.push({ label, ...all, brands: dateBrand.get(dt) || new Map() });
      }
    } else if (granularity === 'week') {
      let currentWeek: PeriodAgg | null = null;
      let weekNum = 1;
      const firstDate = new Date(sortedDates[0]);
      for (const dt of sortedDates) {
        const d = new Date(dt);
        const diff = Math.floor((d.getTime() - firstDate.getTime()) / (7 * 24 * 60 * 60 * 1000));
        if (!currentWeek || diff >= weekNum) {
          if (currentWeek) periods.push(currentWeek);
          weekNum = diff + 1;
          currentWeek = { label: `W${periods.length + 1}`, revenue: 0, checks: 0, tips: 0, brands: new Map() };
        }
        const all = dateAll.get(dt)!;
        currentWeek.revenue += all.revenue;
        currentWeek.checks += all.checks;
        currentWeek.tips += all.tips;
        const brandDay = dateBrand.get(dt) || new Map();
        for (const [brand, ba] of Array.from(brandDay.entries())) {
          const existing = currentWeek.brands.get(brand) || { revenue: 0, checks: 0, tips: 0 };
          existing.revenue += ba.revenue; existing.checks += ba.checks; existing.tips += ba.tips;
          currentWeek.brands.set(brand, existing);
        }
      }
      if (currentWeek) periods.push(currentWeek);
    } else {
      const monthMap = new Map<string, PeriodAgg>();
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      for (const dt of sortedDates) {
        const d = new Date(dt);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        const label = `${monthNames[d.getMonth()]} ${d.getFullYear()}`;
        if (!monthMap.has(key)) monthMap.set(key, { label, revenue: 0, checks: 0, tips: 0, brands: new Map() });
        const p = monthMap.get(key)!;
        const all = dateAll.get(dt)!;
        p.revenue += all.revenue; p.checks += all.checks; p.tips += all.tips;
        const brandDay = dateBrand.get(dt) || new Map();
        for (const [brand, ba] of Array.from(brandDay.entries())) {
          const existing = p.brands.get(brand) || { revenue: 0, checks: 0, tips: 0 };
          existing.revenue += ba.revenue; existing.checks += ba.checks; existing.tips += ba.tips;
          p.brands.set(brand, existing);
        }
      }
      for (const p of Array.from(monthMap.values())) periods.push(p);
    }
    return periods;
  }

  const periods = groupIntoPeriods();
  const data = periods.map(p => ({
    label: p.label,
    revenue: round2(p.revenue),
    checks: p.checks,
    avgCheck: p.checks > 0 ? round2(p.revenue / p.checks) : 0,
    tips: round2(p.tips),
  }));
  const allBrands = Array.from(new Set(Array.from(brandColorMap.keys())));
  const brandData = periods.map(p => {
    const row: Record<string, number | string> = { label: p.label };
    for (const brand of allBrands) {
      const ba = p.brands.get(brand);
      row[brand] = ba ? round2(ba.revenue) : 0;
    }
    return row;
  });
  const brandColors: Record<string, string> = {};
  for (const [name, color] of Array.from(brandColorMap.entries())) brandColors[name] = color;
  return { data, brandData, brandNames: allBrands, brandColors };
}

// OB-237 T1: timeline from summary_artifacts (entity, day) — reads pre-computed daily metrics instead
// of 263K base cheques. revenue/tips resolved via HF-337 recognition to the field_name (raw metric key);
// checks = the materialized row_count. Grouped by summary_date (== committed_data.source_date), the
// deterministic truth date — the raw path's cheque.fecha grouping (+ its no-ORDER-BY pagination) is the
// buggy one being retired.
async function aggregateTimelineFromSummaries(
  sb: SupabaseClient,
  tenantId: string,
  entities: EntityRecord[],
  granularity: 'day' | 'week' | 'month',
  scopeEntityIds?: string[],
): Promise<ReturnType<typeof buildTimelineResponse> | null> {
  let arts = await getSummaryArtifacts(sb, tenantId, { dataType: 'pos_cheque' });
  if (arts.length === 0) return null;
  if (scopeEntityIds !== undefined) arts = arts.filter(a => scopeEntityIds.includes(a.entity_id));

  const keyFor = async (surface: string, purpose: string): Promise<string | null> => {
    const r = await recognize(sb, tenantId, surface, purpose);
    return r.status === 'resolved' && r.fields[0] ? (r.fields[0].field_name ?? r.fields[0].display_label) : null;
  };
  const revKey = await keyFor('financial.network_pulse.revenue', 'the primary monetary amount of money earned or charged as the gross outcome of each transaction or sale');
  const tipKey = await keyFor('financial.network_pulse.tips', 'the gratuity or tip amount the customer adds on top of the charge');
  if (!revKey) return null; // no revenue binding resolvable -> caller renders null (never a silent blank)
  const mv = (m: Record<string, number>, key: string | null) => (key ? (m[key] ?? 0) : 0);

  const locations = entities.filter(e => e.entity_type === 'location');
  const brandLookup = buildBrandLookup(entities);
  const locBrandMap = new Map<string, string>();
  const brandColorMap = new Map<string, string>();
  for (const loc of locations) {
    const brand = getLocationBrand(loc, brandLookup);
    locBrandMap.set(loc.id, brand?.name || 'Unknown');
    if (brand) brandColorMap.set(brand.name, brand.color);
  }

  const dateAll = new Map<string, TlDateAgg>();
  const dateBrand = new Map<string, Map<string, TlDateAgg>>();
  for (const a of arts) {
    const dt = a.summary_date;
    if (!dt) continue;
    const m = a.metrics || {};
    const rev = mv(m, revKey);
    const tip = mv(m, tipKey);
    const checks = a.row_count;
    const brand = locBrandMap.get(a.entity_id) || 'Unknown';

    const allAgg = dateAll.get(dt) || { revenue: 0, checks: 0, tips: 0 };
    allAgg.revenue += rev; allAgg.checks += checks; allAgg.tips += tip;
    dateAll.set(dt, allAgg);

    if (!dateBrand.has(dt)) dateBrand.set(dt, new Map());
    const bm = dateBrand.get(dt)!;
    const ba = bm.get(brand) || { revenue: 0, checks: 0, tips: 0 };
    ba.revenue += rev; ba.checks += checks; ba.tips += tip;
    bm.set(brand, ba);
  }
  return buildTimelineResponse(dateAll, dateBrand, brandColorMap, granularity);
}

// OB-237 T1: financial P&L summary from summary_artifacts (entity, day). Reads the same field keys the
// raw aggregateSummary sums (the summary is keyed by raw committed_data field names == recognize().field_name),
// so grand totals value-match the deterministic committed_data truth. Shape-identical to aggregateSummary.
async function aggregateSummaryFromSummaries(
  sb: SupabaseClient,
  tenantId: string,
  entities: EntityRecord[],
  monthFilter?: string,
) {
  let arts = await getSummaryArtifacts(sb, tenantId, { dataType: 'pos_cheque' });
  if (arts.length === 0) return null;
  const availableMonths = Array.from(new Set(arts.map(a => (a.summary_date || '').substring(0, 7)).filter(Boolean))).sort();
  if (monthFilter) arts = arts.filter(a => (a.summary_date || '').substring(0, 7) === monthFilter);

  const locations = entities.filter(e => e.entity_type === 'location');
  const brandLookup = buildBrandLookup(entities);
  const locMap = new Map<string, { name: string; brand: string; brandColor: string; revenue: number; food: number; bev: number; tips: number; discounts: number; comps: number; tax: number; cash: number; card: number; guests: number; cheques: number; cancelled: number }>();
  for (const loc of locations) {
    const brand = getLocationBrand(loc, brandLookup);
    locMap.set(loc.id, { name: loc.display_name, brand: brand?.name || '', brandColor: brand?.color || '#6b7280', revenue: 0, food: 0, bev: 0, tips: 0, discounts: 0, comps: 0, tax: 0, cash: 0, card: 0, guests: 0, cheques: 0, cancelled: 0 });
  }

  let totalRevenue = 0, totalFood = 0, totalBev = 0, totalTips = 0;
  let totalDiscounts = 0, totalComps = 0, totalTax = 0, totalCash = 0, totalCard = 0;
  let totalGuests = 0, totalCheques = 0, totalCancelled = 0;
  const dates = new Set<string>();
  for (const a of arts) {
    const m = a.metrics || {};
    const rev = n(m.total), food = n(m.total_alimentos), bev = n(m.total_bebidas), tips = n(m.propina);
    const disc = n(m.total_descuentos), comp = n(m.total_cortesias), tax = n(m.total_impuesto);
    const cash = n(m.efectivo), card = n(m.tarjeta), guests = n(m.numero_de_personas);
    const cancelled = n(m.cancelado), cheques = a.row_count;

    totalRevenue += rev; totalFood += food; totalBev += bev; totalTips += tips;
    totalDiscounts += disc; totalComps += comp; totalTax += tax;
    totalCash += cash; totalCard += card; totalGuests += guests;
    totalCheques += cheques; totalCancelled += cancelled;

    const loc = locMap.get(a.entity_id);
    if (loc) {
      loc.revenue += rev; loc.food += food; loc.bev += bev; loc.tips += tips;
      loc.discounts += disc; loc.comps += comp; loc.tax += tax;
      loc.cash += cash; loc.card += card; loc.guests += guests;
      loc.cheques += cheques; loc.cancelled += cancelled;
    }
    if (a.summary_date) dates.add(a.summary_date);
  }

  let periodLabel = '';
  const { data: periods } = await sb.from('periods').select('label').eq('tenant_id', tenantId).limit(1).single();
  if (periods?.label) periodLabel = periods.label;
  else { const sd = Array.from(dates).sort(); periodLabel = `${sd[0] || ''} — ${sd[sd.length - 1] || ''}`; }
  if (monthFilter) periodLabel = monthFilter;

  const netRevenue = totalRevenue - totalDiscounts - totalComps;
  const lines = [
    { label: 'Gross Revenue', amount: round2(totalRevenue), isSubtotal: true },
    { label: '  Food Sales', amount: round2(totalFood), percent: totalRevenue > 0 ? round2((totalFood / totalRevenue) * 100) : 0 },
    { label: '  Beverage Sales', amount: round2(totalBev), percent: totalRevenue > 0 ? round2((totalBev / totalRevenue) * 100) : 0 },
    { label: 'Less: Discounts', amount: -round2(totalDiscounts) },
    { label: 'Less: Comps / Cortesías', amount: -round2(totalComps) },
    { label: 'Net Revenue', amount: round2(netRevenue), isTotal: true },
    { label: 'Tax Collected (IVA)', amount: round2(totalTax), percent: totalRevenue > 0 ? round2((totalTax / totalRevenue) * 100) : 0 },
    { label: 'Tips Collected', amount: round2(totalTips), percent: totalRevenue > 0 ? round2((totalTips / totalRevenue) * 100) : 0 },
    { label: 'Cash Payments', amount: round2(totalCash), percent: totalRevenue > 0 ? round2((totalCash / totalRevenue) * 100) : 0 },
    { label: 'Card Payments', amount: round2(totalCard), percent: totalRevenue > 0 ? round2((totalCard / totalRevenue) * 100) : 0 },
    { label: 'Total Checks', amount: totalCheques },
    { label: 'Cancelled Checks', amount: totalCancelled, percent: totalCheques > 0 ? round2((totalCancelled / totalCheques) * 100) : 0 },
    { label: 'Total Guests', amount: totalGuests },
    { label: 'Average Check', amount: totalCheques > 0 ? round2(totalRevenue / totalCheques) : 0 },
    { label: 'Average Guests/Check', amount: totalCheques > 0 ? round2(totalGuests / totalCheques) : 0 },
  ];
  const locationBreakdown = Array.from(locMap.values())
    .filter(l => l.cheques > 0)
    .sort((a, b) => b.revenue - a.revenue)
    .map(l => ({ name: l.name, brand: l.brand, brandColor: l.brandColor, revenue: round2(l.revenue), food: round2(l.food), bev: round2(l.bev), tips: round2(l.tips), discounts: round2(l.discounts), comps: round2(l.comps), netRevenue: round2(l.revenue - l.discounts - l.comps) }));

  return { periodLabel, lines, locationBreakdown, availableMonths, selectedMonth: monthFilter ?? null };
}

// OB-237 T1: products (food vs beverage category split) from summary_artifacts (entity, day). food/bev
// resolved via HF-337 recognition to field_name (total_alimentos / total_bebidas — both in metrics);
// cheques = row_count. Shape-identical to aggregateProducts; value-matches the committed_data truth.
async function aggregateProductsFromSummaries(
  sb: SupabaseClient,
  tenantId: string,
  entities: EntityRecord[],
  scopeEntityIds?: string[],
) {
  let arts = await getSummaryArtifacts(sb, tenantId, { dataType: 'pos_cheque' });
  if (arts.length === 0) return null;
  if (scopeEntityIds !== undefined) arts = arts.filter(a => scopeEntityIds.includes(a.entity_id));

  const keyFor = async (surface: string, purpose: string): Promise<string | null> => {
    const r = await recognize(sb, tenantId, surface, purpose);
    return r.status === 'resolved' && r.fields[0] ? (r.fields[0].field_name ?? r.fields[0].display_label) : null;
  };
  const foodKey = await keyFor('financial.network_pulse.food', 'the portion of the charge attributable to food, or the primary product category');
  const bevKey = await keyFor('financial.network_pulse.beverage', 'the portion of the charge attributable to beverages, or a secondary product category');
  if (!foodKey && !bevKey) return null;
  const mv = (m: Record<string, number>, key: string | null) => (key ? (m[key] ?? 0) : 0);

  const locations = entities.filter(e => e.entity_type === 'location');
  const brandLookup = buildBrandLookup(entities);
  const locAgg = new Map<string, { food: number; bev: number; cheques: number }>();
  const dailyAgg = new Map<string, { food: number; bev: number }>();
  for (const a of arts) {
    const m = a.metrics || {};
    const food = mv(m, foodKey), bev = mv(m, bevKey), cheques = a.row_count;
    const la = locAgg.get(a.entity_id) || { food: 0, bev: 0, cheques: 0 };
    la.food += food; la.bev += bev; la.cheques += cheques;
    locAgg.set(a.entity_id, la);
    const dt = a.summary_date;
    if (dt) { const da = dailyAgg.get(dt) || { food: 0, bev: 0 }; da.food += food; da.bev += bev; dailyAgg.set(dt, da); }
  }

  let networkFood = 0, networkBev = 0;
  const locResults = locations.map(loc => {
    const agg = locAgg.get(loc.id) || { food: 0, bev: 0, cheques: 0 };
    const brand = getLocationBrand(loc, brandLookup);
    const total = agg.food + agg.bev;
    networkFood += agg.food;
    networkBev += agg.bev;
    return {
      id: loc.id, name: loc.display_name, brand: brand?.name || '', brandColor: brand?.color || '#6b7280',
      food: round2(agg.food), bev: round2(agg.bev), total: round2(total),
      foodPct: total > 0 ? Math.round((agg.food / total) * 1000) / 10 : 0,
      avgFoodPerCheck: agg.cheques > 0 ? round2(agg.food / agg.cheques) : 0,
      avgBevPerCheck: agg.cheques > 0 ? round2(agg.bev / agg.cheques) : 0,
      cheques: agg.cheques,
    };
  }).filter(l => l.cheques > 0);

  const brandAgg = new Map<string, { food: number; bev: number }>();
  for (const loc of locResults) {
    const ba = brandAgg.get(loc.brand) || { food: 0, bev: 0 };
    ba.food += loc.food; ba.bev += loc.bev;
    brandAgg.set(loc.brand, ba);
  }
  const brandResults = Array.from(brandAgg.entries()).map(([name, agg]) => {
    const total = agg.food + agg.bev;
    const brand = Array.from(brandLookup.values()).find(b => b.name === name);
    return { name, color: brand?.color || '#6b7280', food: Math.round(agg.food), bev: Math.round(agg.bev), total: Math.round(total), foodPct: total > 0 ? Math.round((agg.food / total) * 1000) / 10 : 0 };
  });

  const sortedDates = Array.from(dailyAgg.keys()).sort();
  const weeklyTrend: Array<{ week: string; food: number; bev: number }> = [];
  let weekIdx = 0, wFood = 0, wBev = 0, dayCount = 0;
  for (const dt of sortedDates) {
    const d = dailyAgg.get(dt)!;
    wFood += d.food; wBev += d.bev; dayCount++;
    if (dayCount >= 7) { weekIdx++; weeklyTrend.push({ week: `W${weekIdx}`, food: Math.round(wFood), bev: Math.round(wBev) }); wFood = 0; wBev = 0; dayCount = 0; }
  }
  if (dayCount > 0) { weekIdx++; weeklyTrend.push({ week: `W${weekIdx}`, food: Math.round(wFood), bev: Math.round(wBev) }); }

  const networkTotal = networkFood + networkBev;
  return {
    networkFood: Math.round(networkFood), networkBev: Math.round(networkBev), networkTotal: Math.round(networkTotal),
    networkFoodPct: networkTotal > 0 ? Math.round((networkFood / networkTotal) * 1000) / 10 : 0,
    locations: locResults, brands: brandResults, weeklyTrend,
  };
}


// OB-237 T-FIN: patterns (7×24 day-of-week × hour heatmap) from summary_artifacts_fine. Mirrors
// aggregatePatterns EXACTLY. day-of-week is derived from summary_date via new Date(y, mo-1, d).getDay()
// — proven (0/263,250 mismatches) to reproduce the raw path's new Date(fecha).getDay() (the date-only
// UTC-parse would shift the weekday; the local-constructed date does not). hour is the materialized
// column (new Date(fecha).getHours() at population). All metrics EXCLUDE cancelled cheques (the raw
// path `continue`s on cancelado=1), reconstructed by subtracting the cancelled_* conditional metrics.
// avgServiceMinutes from the materialized service_minutes_sum / service_count (cierre−fecha, 0<min<480).
async function aggregatePatternsFromFine(
  sb: SupabaseClient,
  tenantId: string,
  entities: EntityRecord[],
  locationFilter?: string,
) {
  // OB-237 RESIDUAL: read the patterns_rollup tier (~140 pre-aggregated (entity, day-of-week) rows, each
  // carrying its per-hour cells + dow totals + distinct-day count + service time) instead of reducing the
  // 88K fine table. locationFilter pushes the entity predicate into the indexed read.
  const rows = await getRollupRows(sb, tenantId, 'patterns_rollup', locationFilter);
  if (rows.length === 0) return null;
  // patterns_meta carries the GLOBAL per-dow distinct-day counts — the network heatmap divides per-dow
  // revenue by the UNION of dates across entities, which is NOT summable from per-entity counts. A single
  // filtered location reads its own row's num_days instead.
  const metaRows = locationFilter ? [] : await getRollupRows(sb, tenantId, 'patterns_meta');
  const meta = (metaRows[0]?.metrics ?? {}) as { dow_days?: Record<string, number>; total_days?: number };

  interface Cell { revenue: number; checks: number; }
  const grid: Cell[][] = [];
  for (let d = 0; d < 7; d++) { grid[d] = []; for (let h = 0; h < 24; h++) grid[d][h] = { revenue: 0, checks: 0 }; }

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayTotals = dayNames.map((_, i) => ({ dayIndex: i, revenue: 0, checks: 0, tips: 0, guests: 0 }));
  const numDaysByDow = Array(7).fill(0) as number[];

  const locations = entities.filter(e => e.entity_type === 'location');
  const brandLookup = buildBrandLookup(entities);
  const locList = locations.map(loc => {
    const brand = getLocationBrand(loc, brandLookup);
    return { id: loc.id, name: loc.display_name, brandId: brand?.id || '', brandName: brand?.name || '' };
  });

  let serviceTimeSum = 0, serviceTimeCount = 0;

  for (const r of rows) {
    const dow = Number(r.sub_entity_id);
    if (!Number.isInteger(dow) || dow < 0 || dow > 6) continue;
    const m = r.metrics || {};
    const hours = (m.hours ?? {}) as Record<string, { r: number; c: number }>;
    for (const [hStr, cell] of Object.entries(hours)) {
      const h = Number(hStr);
      grid[dow][h].revenue += n(cell.r);
      grid[dow][h].checks += n(cell.c);
    }
    dayTotals[dow].revenue += n(m.revenue);
    dayTotals[dow].checks += n(m.checks);
    dayTotals[dow].tips += n(m.tips);
    dayTotals[dow].guests += n(m.guests);
    serviceTimeSum += n(m.service_minutes_sum);
    serviceTimeCount += n(m.service_count);
    if (locationFilter) numDaysByDow[dow] += n(m.num_days); // one row per dow for a single location
  }
  // network: per-dow distinct days = the global union (meta). location: the entity's own counts (above).
  if (!locationFilter) for (let d = 0; d < 7; d++) numDaysByDow[d] = n(meta.dow_days?.[String(d)]);
  const totalDays = (locationFilter ? numDaysByDow.reduce((s, v) => s + v, 0) : n(meta.total_days)) || 1;

  const heatmap: Array<{ hour: number; day: number; revenue: number; checks: number; avgCheck: number }> = [];
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      const cell = grid[d][h];
      if (cell.checks > 0) heatmap.push({ hour: h, day: d, revenue: round2(cell.revenue), checks: cell.checks, avgCheck: round2(cell.revenue / cell.checks) });
    }
  }

  const dayOfWeek = dayTotals.map((dt, i) => {
    const numDays = numDaysByDow[i] || 1;
    return {
      day: dayNames[i], dayIndex: i,
      revenue: round2(dt.revenue / numDays),
      checks: Math.round(dt.checks / numDays),
      avgCheck: dt.checks > 0 ? round2(dt.revenue / dt.checks) : 0,
      tips: round2(dt.tips / numDays),
      avgGuests: dt.checks > 0 ? round2(dt.guests / dt.checks) : 0,
    };
  });

  let maxHourRev = 0, peakHour = 12;
  const hourTotals: number[] = Array(24).fill(0);
  for (const cell of heatmap) hourTotals[cell.hour] += cell.revenue;
  hourTotals.forEach((v, h) => { if (v > maxHourRev) { maxHourRev = v; peakHour = h; } });

  let maxDayRev = 0, peakDay = 'Mon';
  dayOfWeek.forEach(d => { if (d.revenue > maxDayRev) { maxDayRev = d.revenue; peakDay = d.day; } });

  const totalRevenue = dayTotals.reduce((s, d) => s + d.revenue, 0);
  const totalChecks = dayTotals.reduce((s, d) => s + d.checks, 0);
  const avgServiceMinutes = serviceTimeCount > 0 ? round2(serviceTimeSum / serviceTimeCount) : 0;

  return {
    heatmap, dayOfWeek, peakHour, peakDay,
    avgDailyRevenue: round2(totalRevenue / totalDays),
    avgDailyChecks: Math.round(totalChecks / totalDays),
    avgServiceMinutes,
    locations: locList,
  };
}


// OB-237 T-FIN: location_detail from the materializations. Entity-level totals come from the (entity,
// day) summary_artifacts (reuse getSummaryArtifacts — the raw path includes cancelled cheques in the
// location totals, so the UNCONDITIONAL metrics match exactly). The per-server staff section comes from
// summary_artifacts_fine filtered to this entity, grouped by sub_entity_id (mesero) — also unconditional
// (the raw staff section does not skip cancelled). Weekly buckets use the same 7-day sequential grouping
// over sorted daily revenue as the raw path. Shape-identical to aggregateLocationDetail.
async function aggregateLocationDetailFromFine(
  sb: SupabaseClient,
  tenantId: string,
  entities: EntityRecord[],
  locationId: string,
) {
  const entity = entities.find(e => e.id === locationId);
  if (!entity) return null;

  const brandLookup = buildBrandLookup(entities);
  const meta = (entity.metadata || {}) as Record<string, unknown>;
  const brandId = String(meta.brand_id || '');
  const brand = brandLookup.get(brandId);

  // Entity-level totals from the (entity, day) summary (unconditional — matches the raw location totals).
  const dayArts = await getSummaryArtifacts(sb, tenantId, { dataType: 'pos_cheque', entityId: locationId });
  if (dayArts.length === 0) return null;

  let revenue = 0, tips = 0, food = 0, bev = 0, discounts = 0, comps = 0, guests = 0, chequeCount = 0;
  const dailyRevenue = new Map<string, number>();
  for (const a of dayArts) {
    const m = a.metrics || {};
    revenue += n(m.total); tips += n(m.propina); food += n(m.total_alimentos); bev += n(m.total_bebidas);
    discounts += n(m.total_descuentos); comps += n(m.total_cortesias); guests += n(m.numero_de_personas);
    chequeCount += a.row_count;
    const dt = a.summary_date;
    if (dt) dailyRevenue.set(dt, (dailyRevenue.get(dt) || 0) + n(m.total));
  }
  if (chequeCount === 0) return null;

  // Per-server staff section from the fine table (this entity), grouped by mesero (unconditional).
  const fineArts = await getFineArtifacts(sb, tenantId, { entityId: locationId });
  const staffAgg = new Map<string, { revenue: number; cheques: number; tips: number }>();
  for (const a of fineArts) {
    const meseroId = a.sub_entity_id;
    if (!meseroId || meseroId === '0' || meseroId === '') continue;
    const m = a.metrics || {};
    const s = staffAgg.get(meseroId) || { revenue: 0, cheques: 0, tips: 0 };
    s.revenue += n(m.total); s.cheques += a.row_count; s.tips += n(m.propina);
    staffAgg.set(meseroId, s);
  }

  // Weekly buckets (sequential 7-day grouping over sorted daily revenue — identical to the raw path).
  const sortedDates = Array.from(dailyRevenue.keys()).sort();
  const weeklyRevenue: Array<{ week: string; revenue: number }> = [];
  let weekIdx = 0, weekTotal = 0, dayCount = 0;
  for (const dt of sortedDates) {
    weekTotal += dailyRevenue.get(dt) || 0; dayCount++;
    if (dayCount >= 7) { weekIdx++; weeklyRevenue.push({ week: `W${weekIdx}`, revenue: Math.round(weekTotal) }); weekTotal = 0; dayCount = 0; }
  }
  if (dayCount > 0) { weekIdx++; weeklyRevenue.push({ week: `W${weekIdx}`, revenue: Math.round(weekTotal) }); }

  // Staff names.
  const staffEntities = entities.filter(e => e.entity_type === 'individual');
  const staffByMeseroId = new Map<string, { id: string; name: string; role: string }>();
  for (const se of staffEntities) {
    const sm = (se.metadata || {}) as Record<string, unknown>;
    const mId = sm.mesero_id;
    if (mId != null) staffByMeseroId.set(String(mId), { id: se.id, name: se.display_name, role: String(sm.role || 'Mesero') });
  }

  const staff = Array.from(staffAgg.entries())
    .map(([meseroId, agg]) => {
      const staffEntity = staffByMeseroId.get(meseroId);
      return {
        id: staffEntity?.id || meseroId,
        name: staffEntity?.name || `Mesero ${meseroId}`,
        role: staffEntity?.role || 'Mesero',
        revenue: round2(agg.revenue),
        cheques: agg.cheques,
        avgCheck: agg.cheques > 0 ? round2(agg.revenue / agg.cheques) : 0,
        tips: round2(agg.tips),
        tipRate: agg.revenue > 0 ? Math.round((agg.tips / agg.revenue) * 1000) / 10 : 0,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);

  return {
    id: entity.id,
    name: entity.display_name,
    city: String(meta.city || meta.ciudad || ''),
    brandName: brand?.name || '',
    brandColor: brand?.color || '#ef4444',
    revenue: round2(revenue),
    cheques: chequeCount,
    avgCheck: chequeCount > 0 ? round2(revenue / chequeCount) : 0,
    tips: round2(tips),
    tipRate: revenue > 0 ? Math.round((tips / revenue) * 1000) / 10 : 0,
    food: round2(food),
    bev: round2(bev),
    discounts: round2(discounts),
    comps: round2(comps),
    leakageRate: revenue > 0 ? Math.round(((discounts + comps) / revenue) * 1000) / 10 : 0,
    guests,
    avgGuests: chequeCount > 0 ? Math.round((guests / chequeCount) * 10) / 10 : 0,
    weeklyRevenue,
    staff,
  };
}


// OB-237 T-FIN: server_detail from summary_artifacts_fine filtered to this server's mesero (sub_entity_id),
// across all entities (the raw path filters cheques by mesero_id globally). Mirrors aggregateServerDetail:
// revenue/tips/food/bev/discounts(=total_descuentos+total_cortesias)/guests, daily revenue → weekly
// buckets, hourly pattern, performanceIndex/tier. All UNCONDITIONAL (the raw path does not skip cancelled
// for a server). Grand revenue/checks/tips value-match the deterministic committed_data truth for the
// server's mesero_id. The hourly pattern is keyed on the materialized `hour` (new Date(fecha).getHours())
// — the cleaner "when the cheque occurred" signal; the raw path keyed it on a literal cierre-string-hour
// (a close-time quirk). The total cheque count is unchanged; only the hour-bucket distribution differs.
async function aggregateServerDetailFromFine(
  sb: SupabaseClient,
  tenantId: string,
  entities: EntityRecord[],
  serverId: string,
) {
  const entity = entities.find(e => e.id === serverId);
  if (!entity) return null;

  const meta = (entity.metadata || {}) as Record<string, unknown>;
  const meseroId = String(meta.mesero_id || '');
  const role = String(meta.role || 'Mesero');

  const storeId = String(meta.store_id || meta.location_id || '');
  const locEntity = entities.find(e => e.id === storeId);
  const locationName = locEntity?.display_name || '';

  if (!meseroId) return null;
  const arts = await getFineArtifacts(sb, tenantId, { subEntityId: meseroId });

  let revenue = 0, tips = 0, food = 0, bev = 0, discounts = 0, guests = 0, chequeCount = 0;
  const dailyRevenue = new Map<string, number>();
  const hourlyBuckets = new Map<number, number>();

  for (const a of arts) {
    const m = a.metrics || {};
    revenue += n(m.total);
    tips += n(m.propina);
    food += n(m.total_alimentos);
    bev += n(m.total_bebidas);
    discounts += n(m.total_descuentos) + n(m.total_cortesias);
    guests += n(m.numero_de_personas);
    chequeCount += a.row_count;
    const dt = a.summary_date;
    if (dt) dailyRevenue.set(dt, (dailyRevenue.get(dt) || 0) + n(m.total));
    hourlyBuckets.set(a.hour, (hourlyBuckets.get(a.hour) || 0) + a.row_count);
  }
  if (chequeCount === 0) return null;

  const sortedDates = Array.from(dailyRevenue.keys()).sort();
  const weeklyRevenue: Array<{ week: string; revenue: number }> = [];
  let weekIdx = 0, weekTotal = 0, dayCount = 0;
  for (const dt of sortedDates) {
    weekTotal += dailyRevenue.get(dt) || 0; dayCount++;
    if (dayCount >= 7) { weekIdx++; weeklyRevenue.push({ week: `W${weekIdx}`, revenue: Math.round(weekTotal) }); weekTotal = 0; dayCount = 0; }
  }
  if (dayCount > 0) { weekIdx++; weeklyRevenue.push({ week: `W${weekIdx}`, revenue: Math.round(weekTotal) }); }

  const hourlyPattern: Array<{ hour: string; cheques: number }> = [];
  for (let h = 8; h <= 23; h++) hourlyPattern.push({ hour: `${h}:00`, cheques: hourlyBuckets.get(h) || 0 });

  const avgCheck = chequeCount > 0 ? revenue / chequeCount : 0;
  const tipRate = revenue > 0 ? (tips / revenue) * 100 : 0;
  const performanceIndex = Math.min(100, Math.round(
    (avgCheck > 0 ? Math.min(avgCheck / 500, 1) * 40 : 0) +
    (tipRate > 0 ? Math.min(tipRate / 20, 1) * 30 : 0) +
    (chequeCount > 0 ? Math.min(chequeCount / 500, 1) * 30 : 0)
  ));

  const getTier = (idx: number) => {
    if (idx >= 85) return { tier: 'Estrella', color: 'bg-yellow-100 text-yellow-700' };
    if (idx >= 70) return { tier: 'Destacado', color: 'bg-blue-100 text-blue-700' };
    if (idx >= 50) return { tier: 'Estandar', color: 'bg-zinc-700 text-zinc-300' };
    return { tier: 'En Desarrollo', color: 'bg-red-100 text-red-700' };
  };
  const tierInfo = getTier(performanceIndex);

  return {
    id: entity.id,
    name: entity.display_name,
    role,
    locationName,
    meseroId,
    revenue: round2(revenue),
    cheques: chequeCount,
    avgCheck: round2(avgCheck),
    tips: round2(tips),
    tipRate: Math.round(tipRate * 10) / 10,
    guests,
    avgGuests: chequeCount > 0 ? Math.round((guests / chequeCount) * 10) / 10 : 0,
    food: round2(food),
    bev: round2(bev),
    discounts: round2(discounts),
    performanceIndex,
    tier: tierInfo.tier,
    tierColor: tierInfo.color,
    weeklyRevenue,
    hourlyPattern,
  };
}

// ═══════════════════════════════════════════════════════════════════
// Route Handler
// ═══════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════
// Aggregation: Cheques (HF-324 O3 drill-through) — OB-237 T-FIN BOUNDED rewrite.
// Was a filter over the whole-table raw-cheque fetch (retired). Now a BOUNDED committed_data
// query: the location (entity_id) / server (mesero_id) / leakage-category predicates push into the
// indexed query (incl. JSONB row_data->>field), and only a CAP-sized page is read+returned. total_count
// comes from a cheap head-count with the same predicates. scopeEntityIds (SR-39 fail-closed) restricts to
// the permitted entities — an EXPLICIT empty array denies (zero cheques), an ABSENT scope spans the tenant.
// ═══════════════════════════════════════════════════════════════════
async function aggregateChequesBounded(
  sb: SupabaseClient,
  tenantId: string,
  filters: { entityId?: string; meseroId?: string; leakageCategory?: string; scopeEntityIds?: string[] },
) {
  const CAP = 200;

  // SR-39 fail-closed scope: explicit empty array → no cheques.
  const scope = filters.scopeEntityIds;
  if (scope !== undefined && scope.length === 0) {
    return { cheques: [], total_count: 0, capped: false };
  }

  // Build the predicate set once (reused for the count head and the page read). `q` is a PostgREST
  // filter builder; the JSONB predicates (row_data->>field) push into the indexed query.
  type FilterBuilder = { eq: (c: string, v: unknown) => FilterBuilder; in: (c: string, v: unknown[]) => FilterBuilder; gt: (c: string, v: unknown) => FilterBuilder };
  const applyFilters = <T extends FilterBuilder>(q: T): T => {
    let query = q.eq('tenant_id', tenantId).eq('data_type', 'pos_cheque');
    if (filters.entityId) query = query.eq('entity_id', filters.entityId);
    else if (scope !== undefined) query = query.in('entity_id', scope);
    if (filters.meseroId) query = query.eq('row_data->>mesero_id', filters.meseroId);
    const cat = filters.leakageCategory;
    if (cat === 'cancelaciones') query = query.eq('row_data->>cancelado', '1');
    else if (cat === 'descuentos') query = query.gt('row_data->total_descuentos', '0');
    else if (cat === 'cortesias') query = query.gt('row_data->total_cortesias', '0');
    return query as T;
  };

  // location-name lookup (small — locations only).
  const { data: locs } = await sb
    .from('entities')
    .select('id, display_name')
    .eq('tenant_id', tenantId)
    .eq('entity_type', 'location');
  const locName = new Map((locs ?? []).map((e: { id: string; display_name: string }) => [e.id, e.display_name]));

  // total_count: cheap count-only head with the same predicates.
  const { count } = await applyFilters(
    sb.from('committed_data').select('*', { count: 'exact', head: true }) as unknown as FilterBuilder,
  ) as unknown as { count: number | null };
  const total = count ?? 0;

  // Bounded page (CAP rows), newest first by source_date then id (deterministic).
  const pageQuery = applyFilters(
    sb.from('committed_data').select('entity_id, row_data') as unknown as FilterBuilder,
  ) as unknown as ReturnType<ReturnType<SupabaseClient['from']>['select']>;
  const { data, error } = await pageQuery
    .order('source_date', { ascending: false })
    .order('id', { ascending: false })
    .limit(CAP);
  if (error) throw new Error(`committed_data cheques read: ${error.message}`);

  const cheques = ((data ?? []) as ChequeRecord[]).map(c => {
    const rd = c.row_data;
    return {
      numero_cheque: n(rd.numero_cheque),
      fecha: String(rd.fecha ?? ''),
      total: round2(n(rd.total)),
      mesero_id: n(rd.mesero_id),
      location: locName.get(c.entity_id) ?? c.entity_id,
      total_descuentos: round2(n(rd.total_descuentos)),
      total_cortesias: round2(n(rd.total_cortesias)),
      cancelado: n(rd.cancelado),
    };
  });
  return { cheques, total_count: total, capped: total > CAP };
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { tenantId, mode, granularity, locationFilter, locationId, serverId, scopeEntityIds, meseroId, leakageCategory, monthFilter } = body as {
    tenantId: string;
    mode: string;
    granularity?: 'day' | 'week' | 'month';
    locationFilter?: string;
    locationId?: string;
    serverId?: string;
    scopeEntityIds?: string[];
    meseroId?: string;        // HF-324 O3: cheques mode — filter by server
    leakageCategory?: string; // HF-324 O3: cheques mode — 'cancelaciones'|'descuentos'|'cortesias'
    monthFilter?: string;     // HF-324 O2: summary mode — 'YYYY-MM' period filter
  };

  if (!tenantId || !mode) {
    return NextResponse.json({ error: 'tenantId and mode required' }, { status: 400 });
  }

  try {
    // OB-229 / OB-237 T-FIN: network_pulse reads pre-computed summary_artifacts in O(1) — eliminating the
    // bulk-cheque 97s/164MB aggregation path. Only entities (≈tens of rows) are fetched, not 263K cheques.
    // SINGLE PATH (AP-17): the raw fallback is retired; returns null data when the tenant has no summaries.
    if (mode === 'network_pulse') {
      const sbSum = await createServiceRoleClient();
      const { data: entRows } = await sbSum
        .from('entities')
        .select('id, display_name, external_id, entity_type, metadata')
        .eq('tenant_id', tenantId);
      const np = await aggregateNetworkPulseFromSummaries(sbSum, tenantId, (entRows ?? []) as EntityRecord[], scopeEntityIds);
      return NextResponse.json({ data: np });
    }

    // OB-237 T1: timeline served from summary_artifacts (single path — the raw aggregateTimeline path is
    // retired; AP-17). Returns null data when no summaries exist (the materialization is the source).
    // Value-matched against the deterministic committed_data truth on Sabor before retirement.
    if (mode === 'timeline') {
      const sbSum = await createServiceRoleClient();
      const { data: entRows } = await sbSum
        .from('entities')
        .select('id, display_name, external_id, entity_type, metadata')
        .eq('tenant_id', tenantId);
      const tl = await aggregateTimelineFromSummaries(sbSum, tenantId, (entRows ?? []) as EntityRecord[], granularity || 'week', scopeEntityIds);
      return NextResponse.json({ data: tl });
    }

    // OB-237 T1: summary (financial P&L) served from summary_artifacts (single path; AP-17).
    if (mode === 'summary') {
      const sbSum = await createServiceRoleClient();
      const { data: entRows } = await sbSum
        .from('entities')
        .select('id, display_name, external_id, entity_type, metadata')
        .eq('tenant_id', tenantId);
      const sm = await aggregateSummaryFromSummaries(sbSum, tenantId, (entRows ?? []) as EntityRecord[], monthFilter);
      return NextResponse.json({ data: sm });
    }

    // OB-237 T1: performance (per-location benchmarks) served from summary_artifacts (single path; AP-17).
    if (mode === 'performance') {
      const sbSum = await createServiceRoleClient();
      const { data: entRows } = await sbSum
        .from('entities')
        .select('id, display_name, external_id, entity_type, metadata')
        .eq('tenant_id', tenantId);
      const pf = await aggregatePerformanceFromSummaries(sbSum, tenantId, (entRows ?? []) as EntityRecord[], scopeEntityIds);
      return NextResponse.json({ data: pf });
    }

    // OB-237 T1: products (food vs beverage category split) from summary_artifacts (single path; AP-17).
    if (mode === 'products') {
      const sbSum = await createServiceRoleClient();
      const { data: entRows } = await sbSum
        .from('entities')
        .select('id, display_name, external_id, entity_type, metadata')
        .eq('tenant_id', tenantId);
      const pr = await aggregateProductsFromSummaries(sbSum, tenantId, (entRows ?? []) as EntityRecord[], scopeEntityIds);
      return NextResponse.json({ data: pr });
    }

    // OB-237 P0: leakage served from summary_artifacts + conditional metrics (single path; AP-17).
    if (mode === 'leakage') {
      const sbSum = await createServiceRoleClient();
      const { data: entRows } = await sbSum
        .from('entities')
        .select('id, display_name, external_id, entity_type, metadata')
        .eq('tenant_id', tenantId);
      const lk = await aggregateLeakageFromSummaries(sbSum, tenantId, (entRows ?? []) as EntityRecord[], scopeEntityIds);
      return NextResponse.json({ data: lk });
    }

    // OB-237 T-FIN: staff served from summary_artifacts_fine (entity, mesero, date, hour) — single path
    // (the raw aggregateStaff path is retired; AP-17). Value-matched against deterministic committed_data.
    if (mode === 'staff') {
      const sbSum = await createServiceRoleClient();
      const { data: entRows } = await sbSum
        .from('entities')
        .select('id, display_name, external_id, entity_type, metadata')
        .eq('tenant_id', tenantId);
      const st = await aggregateStaffFromFine(sbSum, tenantId, (entRows ?? []) as EntityRecord[], scopeEntityIds);
      return NextResponse.json({ data: st });
    }

    // OB-237 T-FIN: patterns (7×24 heatmap) served from summary_artifacts_fine (single path; AP-17).
    if (mode === 'patterns') {
      const sbSum = await createServiceRoleClient();
      const { data: entRows } = await sbSum
        .from('entities')
        .select('id, display_name, external_id, entity_type, metadata')
        .eq('tenant_id', tenantId);
      const pt = await aggregatePatternsFromFine(sbSum, tenantId, (entRows ?? []) as EntityRecord[], locationFilter);
      return NextResponse.json({ data: pt });
    }

    // OB-237 T-FIN: location_detail served from summary_artifacts (entity totals) + summary_artifacts_fine
    // (per-server staff section) — single path (AP-17).
    if (mode === 'location_detail') {
      if (!locationId) return NextResponse.json({ error: 'locationId required' }, { status: 400 });
      const sbSum = await createServiceRoleClient();
      const { data: entRows } = await sbSum
        .from('entities')
        .select('id, display_name, external_id, entity_type, metadata')
        .eq('tenant_id', tenantId);
      const ld = await aggregateLocationDetailFromFine(sbSum, tenantId, (entRows ?? []) as EntityRecord[], locationId);
      return NextResponse.json({ data: ld });
    }

    // OB-237 T-FIN: server_detail served from summary_artifacts_fine (this mesero) — single path (AP-17).
    if (mode === 'server_detail') {
      if (!serverId) return NextResponse.json({ error: 'serverId required' }, { status: 400 });
      const sbSum = await createServiceRoleClient();
      const { data: entRows } = await sbSum
        .from('entities')
        .select('id, display_name, external_id, entity_type, metadata')
        .eq('tenant_id', tenantId);
      const sd = await aggregateServerDetailFromFine(sbSum, tenantId, (entRows ?? []) as EntityRecord[], serverId);
      return NextResponse.json({ data: sd });
    }

    // HF-324 O3 / OB-237 T-FIN: cheques drill-through. Now a BOUNDED committed_data query (filter by
    // entity_id / mesero_id / leakage-category, LIMIT'd) instead of the retired whole-table raw-cheque
    // fetch. The predicates push into the indexed query so only a small page is read.
    if (mode === 'cheques') {
      const sbDrill = await createServiceRoleClient();
      const ch = await aggregateChequesBounded(sbDrill, tenantId, { entityId: locationId, meseroId, leakageCategory, scopeEntityIds });
      return NextResponse.json({ data: ch });
    }

    return NextResponse.json({ error: `Unknown mode: ${mode}` }, { status: 400 });
  } catch (error) {
    console.error('[FinancialData] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load financial data' },
      { status: 500 }
    );
  }
}
