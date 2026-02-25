/**
 * Financial Data Service — Supabase-backed data layer for financial pages.
 *
 * Replaces the no-op localStorage services (OB-43A) with real Supabase queries
 * against committed_data (data_type='pos_cheque') and entities.
 *
 * Each page has a dedicated loader function. Raw data is cached at module level
 * so navigating between financial pages doesn't re-fetch.
 */

import { createClient, requireTenantId } from '@/lib/supabase/client';

// ═══════════════════════════════════════════════════════════════════
// Raw types
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

// ═══════════════════════════════════════════════════════════════════
// Cached data fetching
// ═══════════════════════════════════════════════════════════════════

let _cache: { tenantId: string; cheques: ChequeRecord[]; entities: EntityRecord[]; ts: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000;

async function fetchRawData(tenantId: string): Promise<{ cheques: ChequeRecord[]; entities: EntityRecord[] } | null> {
  requireTenantId(tenantId);

  if (_cache && _cache.tenantId === tenantId && Date.now() - _cache.ts < CACHE_TTL) {
    return { cheques: _cache.cheques, entities: _cache.entities };
  }

  const supabase = createClient();

  const { data: entities, error: entErr } = await supabase
    .from('entities')
    .select('id, display_name, external_id, entity_type, metadata')
    .eq('tenant_id', tenantId);

  if (entErr) throw entErr;
  if (!entities || entities.length === 0) return null;

  // Paginated fetch of cheques
  const PAGE_SIZE = 1000;
  const cheques: ChequeRecord[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from('committed_data')
      .select('entity_id, row_data')
      .eq('tenant_id', tenantId)
      .eq('data_type', 'pos_cheque')
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    for (const row of data) {
      if (!row.entity_id) continue; // skip rows without location entity
      cheques.push({ entity_id: row.entity_id, row_data: row.row_data as unknown as ChequeRowData });
    }

    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  if (cheques.length === 0) return null;

  const result = { cheques, entities: entities as EntityRecord[] };
  _cache = { tenantId, ...result, ts: Date.now() };
  return result;
}

export function clearFinancialCache(): void {
  _cache = null;
}

// ═══════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════

function n(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') { const p = parseFloat(v); return isNaN(p) ? 0 : p; }
  return 0;
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

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

// ═══════════════════════════════════════════════════════════════════
// Network Pulse
// ═══════════════════════════════════════════════════════════════════

export interface NetworkPulseData {
  networkMetrics: {
    netRevenue: number;
    revenueChange: number;
    checksServed: number;
    checksChange: number;
    avgCheck: number;
    avgCheckChange: number;
    tipRate: number;
    tipTarget: number;
    leakageRate: number;
    leakageThreshold: number;
    activeLocations: number;
    totalLocations: number;
  };
  locations: Array<{
    id: string;
    name: string;
    city: string;
    brandId: string;
    brandName: string;
    brandColor: string;
    revenue: number;
    avgCheck: number;
    weeklyData: number[];
    vsNetworkAvg: 'above' | 'within' | 'below';
  }>;
  brands: Array<{
    id: string;
    name: string;
    concept: string;
    color: string;
    locationCount: number;
    totalRevenue: number;
    avgCheck: number;
    tipRate: number;
  }>;
}

export async function loadNetworkPulseData(tenantId: string): Promise<NetworkPulseData | null> {
  const raw = await fetchRawData(tenantId);
  if (!raw) return null;

  const locations = raw.entities.filter(e => e.entity_type === 'location');
  const brandEntities = raw.entities.filter(e => e.entity_type === 'brand');

  // Per-location aggregation
  interface LocAgg {
    id: string; name: string; city: string;
    brandId: string; brandName: string; brandColor: string;
    revenue: number; cheques: number; tips: number;
    food: number; bev: number; discounts: number; comps: number;
    daily: Map<string, number>;
  }
  const locMap = new Map<string, LocAgg>();
  for (const loc of locations) {
    const m = loc.metadata || {};
    locMap.set(loc.id, {
      id: loc.id, name: loc.display_name,
      city: String(m.city || ''),
      brandId: String(m.brand_id || ''),
      brandName: String(m.brand_name || ''),
      brandColor: String(m.brand_color || '#6b7280'),
      revenue: 0, cheques: 0, tips: 0, food: 0, bev: 0,
      discounts: 0, comps: 0,
      daily: new Map(),
    });
  }

  let totalCheques = 0;
  for (const c of raw.cheques) {
    const agg = locMap.get(c.entity_id);
    if (!agg) continue;
    const rd = c.row_data;
    totalCheques++;
    agg.cheques++;
    agg.revenue += n(rd.total);
    agg.tips += n(rd.propina);
    agg.food += n(rd.total_alimentos);
    agg.bev += n(rd.total_bebidas);
    agg.discounts += n(rd.total_descuentos);
    agg.comps += n(rd.total_cortesias);
    const dt = String(rd.fecha || '').substring(0, 10);
    if (dt) agg.daily.set(dt, (agg.daily.get(dt) || 0) + n(rd.total));
  }

  const locs = Array.from(locMap.values()).filter(l => l.cheques > 0);
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
      };
    });

  // Brand aggregation
  const brandAgg = new Map<string, { id: string; name: string; concept: string; color: string; locs: number; revenue: number; cheques: number; tips: number }>();
  for (const be of brandEntities) {
    const m = be.metadata || {};
    brandAgg.set(be.id, {
      id: be.id, name: be.display_name,
      concept: String(m.concept || ''),
      color: String(m.color || '#6b7280'),
      locs: 0, revenue: 0, cheques: 0, tips: 0,
    });
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

// ═══════════════════════════════════════════════════════════════════
// Leakage Monitor
// ═══════════════════════════════════════════════════════════════════

export interface LeakagePageData {
  categories: Array<{ category: string; amount: number; count: number; trend: number }>;
  locations: Array<{
    id: string; name: string; brand: string;
    leakageAmount: number; leakageRate: number; threshold: number;
    status: 'ok' | 'warning' | 'critical';
    weeklyTrend: number[];
  }>;
  trend: Array<{ period: string; amount: number; rate: number }>;
}

export async function loadLeakageData(tenantId: string): Promise<LeakagePageData | null> {
  const raw = await fetchRawData(tenantId);
  if (!raw) return null;

  const locations = raw.entities.filter(e => e.entity_type === 'location');
  const allDates = Array.from(new Set(raw.cheques.map(c => String(c.row_data.fecha || '').substring(0, 10)))).sort();

  // Category totals
  let totalDiscounts = 0, discountCount = 0;
  let totalComps = 0, compCount = 0;
  let totalCancelRevenue = 0, cancelCount = 0;
  // Split into halves for trend
  const midDate = allDates[Math.floor(allDates.length / 2)] || '';
  let firstHalfDisc = 0, secondHalfDisc = 0;
  let firstHalfComp = 0, secondHalfComp = 0;
  let firstHalfCancel = 0, secondHalfCancel = 0;

  // Per-location per-week
  interface LocWeek { revenue: number; leakage: number; }
  const locWeekly = new Map<string, LocWeek[]>();
  const locTotals = new Map<string, { revenue: number; leakage: number; name: string; brand: string }>();

  for (const loc of locations) {
    const m = loc.metadata || {};
    locTotals.set(loc.id, { revenue: 0, leakage: 0, name: loc.display_name, brand: String(m.brand_name || '') });
    locWeekly.set(loc.id, [{ revenue: 0, leakage: 0 }, { revenue: 0, leakage: 0 }, { revenue: 0, leakage: 0 }, { revenue: 0, leakage: 0 }]);
  }

  // Weekly totals for trend
  const weekTotals = [
    { revenue: 0, leakage: 0 },
    { revenue: 0, leakage: 0 },
    { revenue: 0, leakage: 0 },
    { revenue: 0, leakage: 0 },
  ];

  for (const c of raw.cheques) {
    const rd = c.row_data;
    const disc = n(rd.total_descuentos);
    const comp = n(rd.total_cortesias);
    const isCancelled = n(rd.cancelado) === 1;
    const revenue = n(rd.total);
    const cancelRev = isCancelled ? revenue : 0;
    const chequeLeakage = disc + comp + cancelRev;
    const dt = String(rd.fecha || '').substring(0, 10);
    const isSecondHalf = dt >= midDate;

    // Category totals
    if (disc > 0) { totalDiscounts += disc; discountCount++; }
    if (comp > 0) { totalComps += comp; compCount++; }
    if (isCancelled) { totalCancelRevenue += revenue; cancelCount++; }

    if (isSecondHalf) { secondHalfDisc += disc; secondHalfComp += comp; secondHalfCancel += cancelRev; }
    else { firstHalfDisc += disc; firstHalfComp += comp; firstHalfCancel += cancelRev; }

    // Per-location
    const lt = locTotals.get(c.entity_id);
    if (lt) { lt.revenue += revenue; lt.leakage += chequeLeakage; }

    // Week index
    const wi = Math.min(weekIndex(dt, allDates), 3);
    const lw = locWeekly.get(c.entity_id);
    if (lw && lw[wi]) { lw[wi].revenue += revenue; lw[wi].leakage += chequeLeakage; }
    if (weekTotals[wi]) { weekTotals[wi].revenue += revenue; weekTotals[wi].leakage += chequeLeakage; }
  }

  // Category trend (% change first half → second half)
  const discTrend = firstHalfDisc > 0 ? ((secondHalfDisc - firstHalfDisc) / firstHalfDisc) * 100 : 0;
  const compTrend = firstHalfComp > 0 ? ((secondHalfComp - firstHalfComp) / firstHalfComp) * 100 : 0;
  const cancelTrend = firstHalfCancel > 0 ? ((secondHalfCancel - firstHalfCancel) / firstHalfCancel) * 100 : 0;

  const categories = [
    { category: 'Cancelaciones', amount: round2(totalCancelRevenue), count: cancelCount, trend: round2(cancelTrend) },
    { category: 'Descuentos', amount: round2(totalDiscounts), count: discountCount, trend: round2(discTrend) },
    { category: 'Cortesías', amount: round2(totalComps), count: compCount, trend: round2(compTrend) },
  ].sort((a, b) => b.amount - a.amount);

  const locData = Array.from(locTotals.entries())
    .filter(([, v]) => v.revenue > 0)
    .map(([id, v]) => {
      const rate = v.revenue > 0 ? (v.leakage / v.revenue) * 100 : 0;
      const lw = locWeekly.get(id) || [];
      const weeklyTrend = lw.map(w => w.revenue > 0 ? round2((w.leakage / w.revenue) * 100) : 0);
      return {
        id, name: v.name, brand: v.brand,
        leakageAmount: round2(v.leakage),
        leakageRate: round2(rate),
        threshold: 2.5,
        status: (rate > 3.5 ? 'critical' : rate > 2.5 ? 'warning' : 'ok') as 'ok' | 'warning' | 'critical',
        weeklyTrend,
      };
    })
    .sort((a, b) => b.leakageRate - a.leakageRate);

  const trend = weekTotals.map((w, i) => ({
    period: `W${i + 1}`,
    amount: round2(w.leakage),
    rate: w.revenue > 0 ? round2((w.leakage / w.revenue) * 100) : 0,
  }));

  return { categories, locations: locData, trend };
}

// ═══════════════════════════════════════════════════════════════════
// Location Benchmarks (Performance)
// ═══════════════════════════════════════════════════════════════════

export interface LocationBenchmarkData {
  id: string;
  rank: number;
  rankChange: number;
  name: string;
  city: string;
  brandId: string;
  brandName: string;
  brandColor: string;
  revenue: number;
  maxRevenue: number;
  avgCheck: number;
  brandAvgCheck: number;
  wowChange: number;
  weeklyTrend: number[];
  foodBevRatio: { food: number; bev: number };
  tipRate: number;
  networkAvgTipRate: number;
  leakage: number;
}

export async function loadPerformanceData(tenantId: string): Promise<LocationBenchmarkData[] | null> {
  const raw = await fetchRawData(tenantId);
  if (!raw) return null;

  const locations = raw.entities.filter(e => e.entity_type === 'location');
  const allDates = Array.from(new Set(raw.cheques.map(c => String(c.row_data.fecha || '').substring(0, 10)))).sort();

  interface LocPerf {
    id: string; name: string; city: string;
    brandId: string; brandName: string; brandColor: string;
    revenue: number; cheques: number; tips: number;
    food: number; bev: number; discounts: number; comps: number;
    daily: Map<string, number>;
    weeklyRevenue: [number, number, number, number];
  }

  const locMap = new Map<string, LocPerf>();
  for (const loc of locations) {
    const m = loc.metadata || {};
    locMap.set(loc.id, {
      id: loc.id, name: loc.display_name, city: String(m.city || ''),
      brandId: String(m.brand_id || ''), brandName: String(m.brand_name || ''),
      brandColor: String(m.brand_color || '#6b7280'),
      revenue: 0, cheques: 0, tips: 0, food: 0, bev: 0, discounts: 0, comps: 0,
      daily: new Map(), weeklyRevenue: [0, 0, 0, 0],
    });
  }

  for (const c of raw.cheques) {
    const agg = locMap.get(c.entity_id);
    if (!agg) continue;
    const rd = c.row_data;
    agg.revenue += n(rd.total);
    agg.cheques++;
    agg.tips += n(rd.propina);
    agg.food += n(rd.total_alimentos);
    agg.bev += n(rd.total_bebidas);
    agg.discounts += n(rd.total_descuentos);
    agg.comps += n(rd.total_cortesias);
    const dt = String(rd.fecha || '').substring(0, 10);
    if (dt) agg.daily.set(dt, (agg.daily.get(dt) || 0) + n(rd.total));
    const wi = Math.min(weekIndex(dt, allDates), 3);
    agg.weeklyRevenue[wi] += n(rd.total);
  }

  const locs = Array.from(locMap.values()).filter(l => l.cheques > 0);
  if (locs.length === 0) return null;

  // Brand avg checks
  const brandAvg = new Map<string, { revenue: number; cheques: number }>();
  for (const l of locs) {
    const b = brandAvg.get(l.brandId) || { revenue: 0, cheques: 0 };
    b.revenue += l.revenue; b.cheques += l.cheques;
    brandAvg.set(l.brandId, b);
  }

  // Network avg tip rate
  const networkTips = locs.reduce((s, l) => s + l.tips, 0);
  const networkRevenue = locs.reduce((s, l) => s + l.revenue, 0);
  const networkAvgTipRate = networkRevenue > 0 ? (networkTips / networkRevenue) * 100 : 0;

  // Rank by revenue (current = all weeks, prev = first 3 weeks)
  const byRevenue = locs.sort((a, b) => b.revenue - a.revenue);
  const maxRevenue = byRevenue[0]?.revenue || 1;
  const prevRevenue = locs.map(l => ({ id: l.id, rev: l.weeklyRevenue[0] + l.weeklyRevenue[1] + l.weeklyRevenue[2] }))
    .sort((a, b) => b.rev - a.rev);
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

// ═══════════════════════════════════════════════════════════════════
// Staff Performance
// ═══════════════════════════════════════════════════════════════════

export interface StaffMemberData {
  id: string;
  name: string;
  role: string;
  locationId: string;
  locationName: string;
  revenue: number;
  checks: number;
  avgCheck: number;
  tips: number;
  tipRate: number;
  performanceIndex: number;
  rank: number;
  prevRank: number;
  weeklyTrend: number[];
}

export async function loadStaffData(tenantId: string): Promise<StaffMemberData[] | null> {
  const raw = await fetchRawData(tenantId);
  if (!raw) return null;

  const staffEntities = raw.entities.filter(e => e.entity_type === 'person');
  const allDates = Array.from(new Set(raw.cheques.map(c => String(c.row_data.fecha || '').substring(0, 10)))).sort();

  // Map external_id (mesero_id as string) → staff entity
  const staffByExtId = new Map<string, EntityRecord>();
  for (const se of staffEntities) {
    if (se.external_id) staffByExtId.set(se.external_id, se);
  }

  // Aggregate by mesero_id
  interface StaffAgg {
    meseroId: number;
    revenue: number; checks: number; tips: number;
    weeklyRevenue: [number, number, number, number];
  }
  const staffMap = new Map<number, StaffAgg>();

  for (const c of raw.cheques) {
    const rd = c.row_data;
    if (n(rd.cancelado) === 1) continue; // skip cancelled cheques
    const mid = n(rd.mesero_id);
    if (!mid) continue;
    let agg = staffMap.get(mid);
    if (!agg) { agg = { meseroId: mid, revenue: 0, checks: 0, tips: 0, weeklyRevenue: [0, 0, 0, 0] }; staffMap.set(mid, agg); }
    agg.revenue += n(rd.total);
    agg.checks++;
    agg.tips += n(rd.propina);
    const dt = String(rd.fecha || '').substring(0, 10);
    const wi = Math.min(weekIndex(dt, allDates), 3);
    agg.weeklyRevenue[wi] += n(rd.total);
  }

  // Join to entities and compute metrics
  const staffList: Array<StaffAgg & { entity: EntityRecord }> = [];
  for (const agg of Array.from(staffMap.values())) {
    const entity = staffByExtId.get(String(agg.meseroId));
    if (!entity) continue;
    staffList.push({ ...agg, entity });
  }

  if (staffList.length === 0) return null;

  // Performance index: revenue percentile (40) + avg check percentile (30) + tip rate percentile (30)
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

  // Rank by performance index
  withIndex.sort((a, b) => b.performanceIndex - a.performanceIndex);

  // Prev rank: by revenue of first 3 weeks
  const prevSorted = [...withIndex].sort((a, b) => {
    const aRev = a.weeklyRevenue[0] + a.weeklyRevenue[1] + a.weeklyRevenue[2];
    const bRev = b.weeklyRevenue[0] + b.weeklyRevenue[1] + b.weeklyRevenue[2];
    return bRev - aRev;
  });
  const prevRankMap = new Map<number, number>();
  prevSorted.forEach((s, i) => prevRankMap.set(s.meseroId, i + 1));

  return withIndex.map((s, i) => {
    const meta = s.entity.metadata || {};
    const rank = i + 1;
    return {
      id: s.entity.id,
      name: s.entity.display_name,
      role: String(meta.role || 'Server'),
      locationId: String(meta.location_id || ''),
      locationName: String(meta.location_name || ''),
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

// ═══════════════════════════════════════════════════════════════════
// Revenue Timeline
// ═══════════════════════════════════════════════════════════════════

export interface TimelinePoint {
  label: string;
  revenue: number;
  checks: number;
  avgCheck: number;
  tips: number;
}

export interface TimelinePageData {
  data: TimelinePoint[];
  brandData: Array<Record<string, number | string>>;
  brandNames: string[];
  brandColors: Record<string, string>;
}

export async function loadTimelineData(
  tenantId: string,
  granularity: 'day' | 'week' | 'month',
): Promise<TimelinePageData | null> {
  const raw = await fetchRawData(tenantId);
  if (!raw) return null;

  const locations = raw.entities.filter(e => e.entity_type === 'location');
  const locBrandMap = new Map<string, string>();
  const brandColorMap = new Map<string, string>();
  for (const loc of locations) {
    const m = loc.metadata || {};
    locBrandMap.set(loc.id, String(m.brand_name || 'Unknown'));
    if (m.brand_name && m.brand_color) {
      brandColorMap.set(String(m.brand_name), String(m.brand_color));
    }
  }

  // Aggregate by date
  interface DateAgg { revenue: number; checks: number; tips: number; }
  const dateAll = new Map<string, DateAgg>();
  const dateBrand = new Map<string, Map<string, DateAgg>>();

  for (const c of raw.cheques) {
    const rd = c.row_data;
    const dt = String(rd.fecha || '').substring(0, 10);
    if (!dt) continue;
    const rev = n(rd.total);
    const tip = n(rd.propina);
    const brand = locBrandMap.get(c.entity_id) || 'Unknown';

    // All
    const allAgg = dateAll.get(dt) || { revenue: 0, checks: 0, tips: 0 };
    allAgg.revenue += rev; allAgg.checks++; allAgg.tips += tip;
    dateAll.set(dt, allAgg);

    // By brand
    if (!dateBrand.has(dt)) dateBrand.set(dt, new Map());
    const bm = dateBrand.get(dt)!;
    const ba = bm.get(brand) || { revenue: 0, checks: 0, tips: 0 };
    ba.revenue += rev; ba.checks++; ba.tips += tip;
    bm.set(brand, ba);
  }

  const sortedDates = Array.from(dateAll.keys()).sort();
  if (sortedDates.length === 0) return null;

  // Group by granularity
  interface PeriodAgg { label: string; revenue: number; checks: number; tips: number; brands: Map<string, DateAgg>; }

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
      // month
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

  const data: TimelinePoint[] = periods.map(p => ({
    label: p.label,
    revenue: round2(p.revenue),
    checks: p.checks,
    avgCheck: p.checks > 0 ? round2(p.revenue / p.checks) : 0,
    tips: round2(p.tips),
  }));

  // Brand comparison data
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
