/**
 * POST /api/financial/data
 *
 * OB-99 Phase 1: Server-side financial data aggregation.
 * Replaces client-side paginated fetching (47+ requests per page)
 * with a single server-side aggregation that returns small pre-computed JSON.
 *
 * Body: { tenantId, mode, granularity?, locationFilter?, locationId?, serverId? }
 * Modes: network_pulse | leakage | performance | staff | timeline | patterns | summary | products | location_detail | server_detail
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

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

// ═══════════════════════════════════════════════════════════════════
// Server-side cache
// ═══════════════════════════════════════════════════════════════════

let _serverCache: { tenantId: string; cheques: ChequeRecord[]; entities: EntityRecord[]; ts: number } | null = null;
const SERVER_CACHE_TTL = 5 * 60 * 1000;

async function fetchRawDataServer(tenantId: string): Promise<{ cheques: ChequeRecord[]; entities: EntityRecord[] } | null> {
  if (_serverCache && _serverCache.tenantId === tenantId && Date.now() - _serverCache.ts < SERVER_CACHE_TTL) {
    return { cheques: _serverCache.cheques, entities: _serverCache.entities };
  }

  const supabase = await createServiceRoleClient();

  const { data: entities, error: entErr } = await supabase
    .from('entities')
    .select('id, display_name, external_id, entity_type, metadata')
    .eq('tenant_id', tenantId);

  if (entErr) throw entErr;
  if (!entities || entities.length === 0) return null;

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
      if (!row.entity_id) continue;
      cheques.push({ entity_id: row.entity_id, row_data: row.row_data as unknown as ChequeRowData });
    }

    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  if (cheques.length === 0) return null;

  const result = { cheques, entities: entities as EntityRecord[] };
  _serverCache = { tenantId, ...result, ts: Date.now() };
  return result;
}

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
// Aggregation: Network Pulse
// ═══════════════════════════════════════════════════════════════════

function aggregateNetworkPulse(raw: { cheques: ChequeRecord[]; entities: EntityRecord[] }) {
  const locations = raw.entities.filter(e => e.entity_type === 'location');
  const brandLookup = buildBrandLookup(raw.entities);

  interface LocAgg {
    id: string; name: string; city: string;
    brandId: string; brandName: string; brandColor: string;
    revenue: number; cheques: number; tips: number;
    food: number; bev: number; discounts: number; comps: number;
    daily: Map<string, number>;
  }
  const locMap = new Map<string, LocAgg>();
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

// ═══════════════════════════════════════════════════════════════════
// Aggregation: Leakage
// ═══════════════════════════════════════════════════════════════════

function aggregateLeakage(raw: { cheques: ChequeRecord[]; entities: EntityRecord[] }) {
  const locations = raw.entities.filter(e => e.entity_type === 'location');
  const brandLookup = buildBrandLookup(raw.entities);
  const allDates = Array.from(new Set(raw.cheques.map(c => String(c.row_data.fecha || '').substring(0, 10)))).sort();

  let totalDiscounts = 0, discountCount = 0;
  let totalComps = 0, compCount = 0;
  let totalCancelRevenue = 0, cancelCount = 0;
  const midDate = allDates[Math.floor(allDates.length / 2)] || '';
  let firstHalfDisc = 0, secondHalfDisc = 0;
  let firstHalfComp = 0, secondHalfComp = 0;
  let firstHalfCancel = 0, secondHalfCancel = 0;

  interface LocWeek { revenue: number; leakage: number; }
  const locWeekly = new Map<string, LocWeek[]>();
  const locTotals = new Map<string, { revenue: number; leakage: number; name: string; brand: string }>();

  for (const loc of locations) {
    const brand = getLocationBrand(loc, brandLookup);
    locTotals.set(loc.id, { revenue: 0, leakage: 0, name: loc.display_name, brand: brand?.name || '' });
    locWeekly.set(loc.id, [{ revenue: 0, leakage: 0 }, { revenue: 0, leakage: 0 }, { revenue: 0, leakage: 0 }, { revenue: 0, leakage: 0 }]);
  }

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

    if (disc > 0) { totalDiscounts += disc; discountCount++; }
    if (comp > 0) { totalComps += comp; compCount++; }
    if (isCancelled) { totalCancelRevenue += revenue; cancelCount++; }

    if (isSecondHalf) { secondHalfDisc += disc; secondHalfComp += comp; secondHalfCancel += cancelRev; }
    else { firstHalfDisc += disc; firstHalfComp += comp; firstHalfCancel += cancelRev; }

    const lt = locTotals.get(c.entity_id);
    if (lt) { lt.revenue += revenue; lt.leakage += chequeLeakage; }

    const wi = Math.min(weekIndex(dt, allDates), 3);
    const lw = locWeekly.get(c.entity_id);
    if (lw && lw[wi]) { lw[wi].revenue += revenue; lw[wi].leakage += chequeLeakage; }
    if (weekTotals[wi]) { weekTotals[wi].revenue += revenue; weekTotals[wi].leakage += chequeLeakage; }
  }

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
// Aggregation: Performance (Location Benchmarks)
// ═══════════════════════════════════════════════════════════════════

function aggregatePerformance(raw: { cheques: ChequeRecord[]; entities: EntityRecord[] }) {
  const locations = raw.entities.filter(e => e.entity_type === 'location');
  const brandLookup = buildBrandLookup(raw.entities);
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
    const m = (loc.metadata || {}) as Record<string, unknown>;
    const brand = getLocationBrand(loc, brandLookup);
    locMap.set(loc.id, {
      id: loc.id, name: loc.display_name, city: String(m.city || ''),
      brandId: brand?.id || '', brandName: brand?.name || '',
      brandColor: brand?.color || '#6b7280',
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
// Aggregation: Staff
// ═══════════════════════════════════════════════════════════════════

function aggregateStaff(raw: { cheques: ChequeRecord[]; entities: EntityRecord[] }) {
  const staffEntities = raw.entities.filter(e => e.entity_type === 'individual');
  const locationEntities = raw.entities.filter(e => e.entity_type === 'location');
  const allDates = Array.from(new Set(raw.cheques.map(c => String(c.row_data.fecha || '').substring(0, 10)))).sort();

  const staffByMeseroId = new Map<string, EntityRecord>();
  for (const se of staffEntities) {
    const meseroId = (se.metadata as Record<string, unknown>)?.mesero_id;
    if (meseroId != null) staffByMeseroId.set(String(meseroId), se);
  }

  const locationById = new Map<string, EntityRecord>();
  for (const le of locationEntities) locationById.set(le.id, le);

  interface StaffAgg {
    meseroId: number;
    revenue: number; checks: number; tips: number;
    weeklyRevenue: [number, number, number, number];
  }
  const staffMap = new Map<number, StaffAgg>();

  for (const c of raw.cheques) {
    const rd = c.row_data;
    if (n(rd.cancelado) === 1) continue;
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
  const prevRankMap = new Map<number, number>();
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

// ═══════════════════════════════════════════════════════════════════
// Aggregation: Timeline
// ═══════════════════════════════════════════════════════════════════

function aggregateTimeline(raw: { cheques: ChequeRecord[]; entities: EntityRecord[] }, granularity: 'day' | 'week' | 'month') {
  const locations = raw.entities.filter(e => e.entity_type === 'location');
  const brandLookup = buildBrandLookup(raw.entities);
  const locBrandMap = new Map<string, string>();
  const brandColorMap = new Map<string, string>();
  for (const loc of locations) {
    const brand = getLocationBrand(loc, brandLookup);
    locBrandMap.set(loc.id, brand?.name || 'Unknown');
    if (brand) brandColorMap.set(brand.name, brand.color);
  }

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

    const allAgg = dateAll.get(dt) || { revenue: 0, checks: 0, tips: 0 };
    allAgg.revenue += rev; allAgg.checks++; allAgg.tips += tip;
    dateAll.set(dt, allAgg);

    if (!dateBrand.has(dt)) dateBrand.set(dt, new Map());
    const bm = dateBrand.get(dt)!;
    const ba = bm.get(brand) || { revenue: 0, checks: 0, tips: 0 };
    ba.revenue += rev; ba.checks++; ba.tips += tip;
    bm.set(brand, ba);
  }

  const sortedDates = Array.from(dateAll.keys()).sort();
  if (sortedDates.length === 0) return null;

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

// ═══════════════════════════════════════════════════════════════════
// Aggregation: Patterns
// ═══════════════════════════════════════════════════════════════════

function aggregatePatterns(raw: { cheques: ChequeRecord[]; entities: EntityRecord[] }, locationFilter?: string) {
  interface Cell { revenue: number; checks: number; }
  const grid: Cell[][] = [];
  for (let d = 0; d < 7; d++) {
    grid[d] = [];
    for (let h = 0; h < 24; h++) grid[d][h] = { revenue: 0, checks: 0 };
  }

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayTotals = dayNames.map((_, i) => ({
    dayIndex: i, revenue: 0, checks: 0, tips: 0, guests: 0, days: new Set<string>(),
  }));

  const locations = raw.entities.filter(e => e.entity_type === 'location');
  const brandLookup = buildBrandLookup(raw.entities);
  const locList = locations.map(loc => {
    const brand = getLocationBrand(loc, brandLookup);
    return { id: loc.id, name: loc.display_name, brandId: brand?.id || '', brandName: brand?.name || '' };
  });

  const filteredCheques = locationFilter
    ? raw.cheques.filter(c => c.entity_id === locationFilter)
    : raw.cheques;

  let serviceTimeSum = 0, serviceTimeCount = 0;

  for (const c of filteredCheques) {
    const rd = c.row_data;
    if (n(rd.cancelado) === 1) continue;
    const fechaStr = String(rd.fecha || '');
    if (!fechaStr) continue;
    const d = new Date(fechaStr);
    if (isNaN(d.getTime())) continue;
    const dayOfWeek = d.getDay();
    const hour = d.getHours();
    const rev = n(rd.total);

    grid[dayOfWeek][hour].revenue += rev;
    grid[dayOfWeek][hour].checks++;

    const dateKey = fechaStr.substring(0, 10);
    dayTotals[dayOfWeek].revenue += rev;
    dayTotals[dayOfWeek].checks++;
    dayTotals[dayOfWeek].tips += n(rd.propina);
    dayTotals[dayOfWeek].guests += n(rd.numero_de_personas);
    dayTotals[dayOfWeek].days.add(dateKey);

    const cierreStr = String(rd.cierre || '');
    if (cierreStr && fechaStr) {
      const openTime = d.getTime();
      const closeTime = new Date(cierreStr).getTime();
      if (!isNaN(closeTime) && closeTime > openTime) {
        const minutes = (closeTime - openTime) / 60000;
        if (minutes > 0 && minutes < 480) {
          serviceTimeSum += minutes;
          serviceTimeCount++;
        }
      }
    }
  }

  const heatmap: Array<{ hour: number; day: number; revenue: number; checks: number; avgCheck: number }> = [];
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      const cell = grid[d][h];
      if (cell.checks > 0) {
        heatmap.push({ hour: h, day: d, revenue: round2(cell.revenue), checks: cell.checks, avgCheck: round2(cell.revenue / cell.checks) });
      }
    }
  }

  const dayOfWeek = dayTotals.map((dt, i) => {
    const numDays = dt.days.size || 1;
    return {
      day: dayNames[i],
      dayIndex: i,
      revenue: round2(dt.revenue / numDays),
      checks: Math.round(dt.checks / numDays),
      avgCheck: dt.checks > 0 ? round2(dt.revenue / dt.checks) : 0,
      tips: round2(dt.tips / numDays),
      avgGuests: dt.checks > 0 ? round2(dt.guests / dt.checks) : 0,
    };
  });

  let maxHourRev = 0, peakHour = 12;
  const hourTotals: number[] = Array(24).fill(0);
  for (const cell of heatmap) { hourTotals[cell.hour] += cell.revenue; }
  hourTotals.forEach((v, h) => { if (v > maxHourRev) { maxHourRev = v; peakHour = h; } });

  let maxDayRev = 0, peakDay = 'Mon';
  dayOfWeek.forEach(d => { if (d.revenue > maxDayRev) { maxDayRev = d.revenue; peakDay = d.day; } });

  const allDates = new Set<string>();
  for (const c of filteredCheques) {
    const dt = String(c.row_data.fecha || '').substring(0, 10);
    if (dt) allDates.add(dt);
  }
  const totalDays = allDates.size || 1;
  const totalRevenue = dayTotals.reduce((s, d) => s + d.revenue, 0);
  const totalChecks = dayTotals.reduce((s, d) => s + d.checks, 0);
  const avgServiceMinutes = serviceTimeCount > 0 ? round2(serviceTimeSum / serviceTimeCount) : 0;

  return {
    heatmap,
    dayOfWeek,
    peakHour,
    peakDay,
    avgDailyRevenue: round2(totalRevenue / totalDays),
    avgDailyChecks: Math.round(totalChecks / totalDays),
    avgServiceMinutes,
    locations: locList,
  };
}

// ═══════════════════════════════════════════════════════════════════
// Aggregation: Summary
// ═══════════════════════════════════════════════════════════════════

async function aggregateSummary(raw: { cheques: ChequeRecord[]; entities: EntityRecord[] }, tenantId: string) {
  const locations = raw.entities.filter(e => e.entity_type === 'location');
  const brandLookup = buildBrandLookup(raw.entities);
  const locMap = new Map<string, { name: string; brand: string; brandColor: string; revenue: number; food: number; bev: number; tips: number; discounts: number; comps: number; tax: number; cash: number; card: number; guests: number; cheques: number; cancelled: number }>();

  for (const loc of locations) {
    const brand = getLocationBrand(loc, brandLookup);
    locMap.set(loc.id, {
      name: loc.display_name,
      brand: brand?.name || '',
      brandColor: brand?.color || '#6b7280',
      revenue: 0, food: 0, bev: 0, tips: 0, discounts: 0, comps: 0, tax: 0, cash: 0, card: 0, guests: 0, cheques: 0, cancelled: 0,
    });
  }

  let totalRevenue = 0, totalFood = 0, totalBev = 0, totalTips = 0;
  let totalDiscounts = 0, totalComps = 0, totalTax = 0, totalCash = 0, totalCard = 0;
  let totalGuests = 0, totalCheques = 0, totalCancelled = 0;
  const dates = new Set<string>();

  for (const c of raw.cheques) {
    const rd = c.row_data;
    const rev = n(rd.total);
    const food = n(rd.total_alimentos);
    const bev = n(rd.total_bebidas);
    const tips = n(rd.propina);
    const disc = n(rd.total_descuentos);
    const comp = n(rd.total_cortesias);
    const tax = n(rd.total_impuesto);
    const cash = n(rd.efectivo);
    const card = n(rd.tarjeta);
    const guests = n(rd.numero_de_personas);
    const isCancelled = n(rd.cancelado) === 1;

    totalRevenue += rev; totalFood += food; totalBev += bev; totalTips += tips;
    totalDiscounts += disc; totalComps += comp; totalTax += tax;
    totalCash += cash; totalCard += card; totalGuests += guests;
    totalCheques++; if (isCancelled) totalCancelled++;

    const loc = locMap.get(c.entity_id);
    if (loc) {
      loc.revenue += rev; loc.food += food; loc.bev += bev; loc.tips += tips;
      loc.discounts += disc; loc.comps += comp; loc.tax += tax;
      loc.cash += cash; loc.card += card; loc.guests += guests;
      loc.cheques++; if (isCancelled) loc.cancelled++;
    }

    const dt = String(rd.fecha || '').substring(0, 10);
    if (dt) dates.add(dt);
  }

  // Period label from DB
  let periodLabel = '';
  const supabase = await createServiceRoleClient();
  const { data: periods } = await supabase.from('periods').select('label').eq('tenant_id', tenantId).limit(1).single();
  if (periods?.label) {
    periodLabel = periods.label;
  } else {
    const sortedDates = Array.from(dates).sort();
    periodLabel = `${sortedDates[0] || ''} — ${sortedDates[sortedDates.length - 1] || ''}`;
  }

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
    .map(l => ({
      name: l.name, brand: l.brand, brandColor: l.brandColor,
      revenue: round2(l.revenue), food: round2(l.food), bev: round2(l.bev),
      tips: round2(l.tips), discounts: round2(l.discounts), comps: round2(l.comps),
      netRevenue: round2(l.revenue - l.discounts - l.comps),
    }));

  return { periodLabel, lines, locationBreakdown };
}

// ═══════════════════════════════════════════════════════════════════
// Aggregation: Products (from products/page.tsx)
// ═══════════════════════════════════════════════════════════════════

function aggregateProducts(raw: { cheques: ChequeRecord[]; entities: EntityRecord[] }) {
  const locations = raw.entities.filter(e => e.entity_type === 'location');
  const brandLookup = buildBrandLookup(raw.entities);

  const locAgg = new Map<string, { food: number; bev: number; cheques: number }>();
  const dailyAgg = new Map<string, { food: number; bev: number }>();

  for (const c of raw.cheques) {
    const rd = c.row_data;
    const food = n(rd.total_alimentos);
    const bev = n(rd.total_bebidas);

    const la = locAgg.get(c.entity_id) || { food: 0, bev: 0, cheques: 0 };
    la.food += food;
    la.bev += bev;
    la.cheques++;
    locAgg.set(c.entity_id, la);

    const dt = String(rd.fecha || '').substring(0, 10);
    if (dt) {
      const da = dailyAgg.get(dt) || { food: 0, bev: 0 };
      da.food += food;
      da.bev += bev;
      dailyAgg.set(dt, da);
    }
  }

  let networkFood = 0, networkBev = 0;
  const locResults = locations.map(loc => {
    const agg = locAgg.get(loc.id) || { food: 0, bev: 0, cheques: 0 };
    const brand = getLocationBrand(loc, brandLookup);
    const total = agg.food + agg.bev;
    networkFood += agg.food;
    networkBev += agg.bev;
    return {
      id: loc.id,
      name: loc.display_name,
      brand: brand?.name || '',
      brandColor: brand?.color || '#6b7280',
      food: round2(agg.food),
      bev: round2(agg.bev),
      total: round2(total),
      foodPct: total > 0 ? Math.round((agg.food / total) * 1000) / 10 : 0,
      avgFoodPerCheck: agg.cheques > 0 ? round2(agg.food / agg.cheques) : 0,
      avgBevPerCheck: agg.cheques > 0 ? round2(agg.bev / agg.cheques) : 0,
      cheques: agg.cheques,
    };
  }).filter(l => l.cheques > 0);

  // Brand aggregation
  const brandAgg = new Map<string, { food: number; bev: number }>();
  for (const loc of locResults) {
    const ba = brandAgg.get(loc.brand) || { food: 0, bev: 0 };
    ba.food += loc.food;
    ba.bev += loc.bev;
    brandAgg.set(loc.brand, ba);
  }
  const brandResults = Array.from(brandAgg.entries()).map(([name, agg]) => {
    const total = agg.food + agg.bev;
    const brand = Array.from(brandLookup.values()).find(b => b.name === name);
    return {
      name,
      color: brand?.color || '#6b7280',
      food: Math.round(agg.food),
      bev: Math.round(agg.bev),
      total: Math.round(total),
      foodPct: total > 0 ? Math.round((agg.food / total) * 1000) / 10 : 0,
    };
  });

  // Weekly trend
  const sortedDates = Array.from(dailyAgg.keys()).sort();
  const weeklyTrend: Array<{ week: string; food: number; bev: number }> = [];
  let weekIdx = 0, wFood = 0, wBev = 0, dayCount = 0;
  for (const dt of sortedDates) {
    const d = dailyAgg.get(dt)!;
    wFood += d.food;
    wBev += d.bev;
    dayCount++;
    if (dayCount >= 7) {
      weekIdx++;
      weeklyTrend.push({ week: `W${weekIdx}`, food: Math.round(wFood), bev: Math.round(wBev) });
      wFood = 0; wBev = 0; dayCount = 0;
    }
  }
  if (dayCount > 0) {
    weekIdx++;
    weeklyTrend.push({ week: `W${weekIdx}`, food: Math.round(wFood), bev: Math.round(wBev) });
  }

  const networkTotal = networkFood + networkBev;

  return {
    networkFood: Math.round(networkFood),
    networkBev: Math.round(networkBev),
    networkTotal: Math.round(networkTotal),
    networkFoodPct: networkTotal > 0 ? Math.round((networkFood / networkTotal) * 1000) / 10 : 0,
    locations: locResults,
    brands: brandResults,
    weeklyTrend,
  };
}

// ═══════════════════════════════════════════════════════════════════
// Aggregation: Location Detail
// ═══════════════════════════════════════════════════════════════════

function aggregateLocationDetail(raw: { cheques: ChequeRecord[]; entities: EntityRecord[] }, locationId: string) {
  const entity = raw.entities.find(e => e.id === locationId);
  if (!entity) return null;

  const brandLookup = buildBrandLookup(raw.entities);
  const meta = (entity.metadata || {}) as Record<string, unknown>;
  const brandId = String(meta.brand_id || '');
  const brand = brandLookup.get(brandId);

  const locationCheques = raw.cheques.filter(c => c.entity_id === locationId);
  if (locationCheques.length === 0) return null;

  let revenue = 0, tips = 0, food = 0, bev = 0, discounts = 0, comps = 0, guests = 0;
  let chequeCount = 0;
  const dailyRevenue = new Map<string, number>();
  const staffAgg = new Map<string, { revenue: number; cheques: number; tips: number }>();

  for (const c of locationCheques) {
    const rd = c.row_data;
    chequeCount++;
    revenue += n(rd.total);
    tips += n(rd.propina);
    food += n(rd.total_alimentos);
    bev += n(rd.total_bebidas);
    discounts += n(rd.total_descuentos);
    comps += n(rd.total_cortesias);
    guests += n(rd.numero_de_personas);

    const dt = String(rd.fecha || '').substring(0, 10);
    if (dt) dailyRevenue.set(dt, (dailyRevenue.get(dt) || 0) + n(rd.total));

    const meseroId = String(n(rd.mesero_id));
    if (meseroId && meseroId !== '0') {
      const s = staffAgg.get(meseroId) || { revenue: 0, cheques: 0, tips: 0 };
      s.revenue += n(rd.total);
      s.cheques++;
      s.tips += n(rd.propina);
      staffAgg.set(meseroId, s);
    }
  }

  // Weekly buckets
  const sortedDates = Array.from(dailyRevenue.keys()).sort();
  const weeklyRevenue: Array<{ week: string; revenue: number }> = [];
  let weekIdx = 0, weekTotal = 0, dayCount = 0;
  for (const dt of sortedDates) {
    weekTotal += dailyRevenue.get(dt) || 0;
    dayCount++;
    if (dayCount >= 7) {
      weekIdx++;
      weeklyRevenue.push({ week: `W${weekIdx}`, revenue: Math.round(weekTotal) });
      weekTotal = 0; dayCount = 0;
    }
  }
  if (dayCount > 0) {
    weekIdx++;
    weeklyRevenue.push({ week: `W${weekIdx}`, revenue: Math.round(weekTotal) });
  }

  // Staff with names
  const staffEntities = raw.entities.filter(e => e.entity_type === 'individual');
  const staffByMeseroId = new Map<string, { id: string; name: string; role: string }>();
  for (const se of staffEntities) {
    const sm = (se.metadata || {}) as Record<string, unknown>;
    const mId = sm.mesero_id;
    if (mId != null) {
      staffByMeseroId.set(String(mId), { id: se.id, name: se.display_name, role: String(sm.role || 'Mesero') });
    }
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

// ═══════════════════════════════════════════════════════════════════
// Aggregation: Server Detail
// ═══════════════════════════════════════════════════════════════════

function aggregateServerDetail(raw: { cheques: ChequeRecord[]; entities: EntityRecord[] }, serverId: string) {
  const entity = raw.entities.find(e => e.id === serverId);
  if (!entity) return null;

  const meta = (entity.metadata || {}) as Record<string, unknown>;
  const meseroId = String(meta.mesero_id || '');
  const role = String(meta.role || 'Mesero');

  // Find location name
  const storeId = String(meta.store_id || meta.location_id || '');
  const locEntity = raw.entities.find(e => e.id === storeId);
  const locationName = locEntity?.display_name || '';

  // Filter cheques by mesero_id
  const serverCheques = raw.cheques.filter(c => String(n(c.row_data.mesero_id)) === meseroId);

  let revenue = 0, tips = 0, food = 0, bev = 0, discounts = 0, guests = 0;
  let chequeCount = 0;
  const dailyRevenue = new Map<string, number>();
  const hourlyBuckets = new Map<number, number>();

  for (const c of serverCheques) {
    const rd = c.row_data;
    chequeCount++;
    revenue += n(rd.total);
    tips += n(rd.propina);
    food += n(rd.total_alimentos);
    bev += n(rd.total_bebidas);
    discounts += n(rd.total_descuentos) + n(rd.total_cortesias);
    guests += n(rd.numero_de_personas);

    const dt = String(rd.fecha || '').substring(0, 10);
    if (dt) dailyRevenue.set(dt, (dailyRevenue.get(dt) || 0) + n(rd.total));

    const cierre = String(rd.cierre || '');
    const hourMatch = cierre.match(/(\d{1,2}):/);
    if (hourMatch) {
      const hr = parseInt(hourMatch[1]);
      hourlyBuckets.set(hr, (hourlyBuckets.get(hr) || 0) + 1);
    }
  }

  // Weekly buckets
  const sortedDates = Array.from(dailyRevenue.keys()).sort();
  const weeklyRevenue: Array<{ week: string; revenue: number }> = [];
  let weekIdx = 0, weekTotal = 0, dayCount = 0;
  for (const dt of sortedDates) {
    weekTotal += dailyRevenue.get(dt) || 0;
    dayCount++;
    if (dayCount >= 7) {
      weekIdx++;
      weeklyRevenue.push({ week: `W${weekIdx}`, revenue: Math.round(weekTotal) });
      weekTotal = 0; dayCount = 0;
    }
  }
  if (dayCount > 0) {
    weekIdx++;
    weeklyRevenue.push({ week: `W${weekIdx}`, revenue: Math.round(weekTotal) });
  }

  // Hourly pattern
  const hourlyPattern: Array<{ hour: string; cheques: number }> = [];
  for (let h = 8; h <= 23; h++) {
    hourlyPattern.push({ hour: `${h}:00`, cheques: hourlyBuckets.get(h) || 0 });
  }

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

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { tenantId, mode, granularity, locationFilter, locationId, serverId } = body as {
    tenantId: string;
    mode: string;
    granularity?: 'day' | 'week' | 'month';
    locationFilter?: string;
    locationId?: string;
    serverId?: string;
  };

  if (!tenantId || !mode) {
    return NextResponse.json({ error: 'tenantId and mode required' }, { status: 400 });
  }

  try {
    const raw = await fetchRawDataServer(tenantId);
    if (!raw) {
      return NextResponse.json({ data: null });
    }

    let data: unknown = null;

    switch (mode) {
      case 'network_pulse':
        data = aggregateNetworkPulse(raw);
        break;
      case 'leakage':
        data = aggregateLeakage(raw);
        break;
      case 'performance':
        data = aggregatePerformance(raw);
        break;
      case 'staff':
        data = aggregateStaff(raw);
        break;
      case 'timeline':
        data = aggregateTimeline(raw, granularity || 'week');
        break;
      case 'patterns':
        data = aggregatePatterns(raw, locationFilter);
        break;
      case 'summary':
        data = await aggregateSummary(raw, tenantId);
        break;
      case 'products':
        data = aggregateProducts(raw);
        break;
      case 'location_detail':
        if (!locationId) return NextResponse.json({ error: 'locationId required' }, { status: 400 });
        data = aggregateLocationDetail(raw, locationId);
        break;
      case 'server_detail':
        if (!serverId) return NextResponse.json({ error: 'serverId required' }, { status: 400 });
        data = aggregateServerDetail(raw, serverId);
        break;
      default:
        return NextResponse.json({ error: `Unknown mode: ${mode}` }, { status: 400 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('[FinancialData] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load financial data' },
      { status: 500 }
    );
  }
}
