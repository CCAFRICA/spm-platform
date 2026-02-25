/**
 * Financial Data Service — Client-side API layer for financial pages.
 *
 * OB-99 Phase 1: Rewritten to call server-side API route instead of
 * making paginated client-side Supabase queries.
 *
 * Before: 47+ paginated .from('committed_data').select() calls per page load
 * After:  1 fetch('/api/financial/data') call per page load
 *
 * All aggregation now happens server-side. This file is a thin client
 * that calls the API route and returns typed results.
 */

// ═══════════════════════════════════════════════════════════════════
// Types — exported for use by page components
// ═══════════════════════════════════════════════════════════════════

export interface BrandInfo {
  id: string;
  name: string;
  code: string;
  color: string;
  format: string;
  avgTicketRange: [number, number];
  benchmarkChequesMin: number;
  benchmarkChequesMax: number;
}

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
    tipRate: number;
    leakageRate: number;
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

export interface HeatmapCell {
  hour: number;
  day: number;
  revenue: number;
  checks: number;
  avgCheck: number;
}

export interface DayOfWeekData {
  day: string;
  dayIndex: number;
  revenue: number;
  checks: number;
  avgCheck: number;
  tips: number;
  avgGuests: number;
}

export interface PatternsPageData {
  heatmap: HeatmapCell[];
  dayOfWeek: DayOfWeekData[];
  peakHour: number;
  peakDay: string;
  avgDailyRevenue: number;
  avgDailyChecks: number;
  avgServiceMinutes: number;
  locations: Array<{ id: string; name: string; brandId: string; brandName: string }>;
}

export interface SummaryLineItem {
  label: string;
  amount: number;
  percent?: number;
  isSubtotal?: boolean;
  isTotal?: boolean;
}

export interface SummaryPageData {
  periodLabel: string;
  lines: SummaryLineItem[];
  locationBreakdown: Array<{
    name: string;
    brand: string;
    brandColor: string;
    revenue: number;
    food: number;
    bev: number;
    tips: number;
    discounts: number;
    comps: number;
    netRevenue: number;
  }>;
}

export interface ProductMixData {
  networkFood: number;
  networkBev: number;
  networkTotal: number;
  networkFoodPct: number;
  locations: Array<{
    id: string;
    name: string;
    brand: string;
    brandColor: string;
    food: number;
    bev: number;
    total: number;
    foodPct: number;
    avgFoodPerCheck: number;
    avgBevPerCheck: number;
    cheques: number;
  }>;
  brands: Array<{
    name: string;
    color: string;
    food: number;
    bev: number;
    total: number;
    foodPct: number;
  }>;
  weeklyTrend: Array<{
    week: string;
    food: number;
    bev: number;
  }>;
}

export interface LocationDetailData {
  id: string;
  name: string;
  city: string;
  brandName: string;
  brandColor: string;
  revenue: number;
  cheques: number;
  avgCheck: number;
  tips: number;
  tipRate: number;
  food: number;
  bev: number;
  discounts: number;
  comps: number;
  leakageRate: number;
  guests: number;
  avgGuests: number;
  weeklyRevenue: Array<{ week: string; revenue: number }>;
  staff: Array<{
    id: string;
    name: string;
    role: string;
    revenue: number;
    cheques: number;
    avgCheck: number;
    tips: number;
    tipRate: number;
  }>;
}

export interface ServerDetailData {
  id: string;
  name: string;
  role: string;
  locationName: string;
  meseroId: string;
  revenue: number;
  cheques: number;
  avgCheck: number;
  tips: number;
  tipRate: number;
  guests: number;
  avgGuests: number;
  food: number;
  bev: number;
  discounts: number;
  performanceIndex: number;
  tier: string;
  tierColor: string;
  weeklyRevenue: Array<{ week: string; revenue: number }>;
  hourlyPattern: Array<{ hour: string; cheques: number }>;
}

// ═══════════════════════════════════════════════════════════════════
// Persona scope type (for F-8/F-9 filtering)
// ═══════════════════════════════════════════════════════════════════

export interface FinancialScope {
  scopeEntityIds?: string[];
}

// ═══════════════════════════════════════════════════════════════════
// API caller
// ═══════════════════════════════════════════════════════════════════

async function fetchFinancialData<T>(
  tenantId: string,
  mode: string,
  params?: Record<string, unknown> | FinancialScope
): Promise<T | null> {
  const res = await fetch('/api/financial/data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenantId, mode, ...(params || {}) }),
  });

  if (!res.ok) {
    console.error(`[FinancialData] ${mode} failed:`, res.status);
    return null;
  }

  const { data } = await res.json();
  return data as T | null;
}

// ═══════════════════════════════════════════════════════════════════
// Cache clear (no-op now — cache is server-side)
// ═══════════════════════════════════════════════════════════════════

export function clearFinancialCache(): void {
  // Cache is now managed server-side in the API route
}

// ═══════════════════════════════════════════════════════════════════
// Loader functions — 1 API call each
// All accept optional FinancialScope for persona-based filtering (F-8/F-9)
// ═══════════════════════════════════════════════════════════════════

export async function loadNetworkPulseData(tenantId: string, scope?: FinancialScope): Promise<NetworkPulseData | null> {
  return fetchFinancialData<NetworkPulseData>(tenantId, 'network_pulse', scope);
}

export async function loadLeakageData(tenantId: string, scope?: FinancialScope): Promise<LeakagePageData | null> {
  return fetchFinancialData<LeakagePageData>(tenantId, 'leakage', scope);
}

export async function loadPerformanceData(tenantId: string, scope?: FinancialScope): Promise<LocationBenchmarkData[] | null> {
  return fetchFinancialData<LocationBenchmarkData[]>(tenantId, 'performance', scope);
}

export async function loadStaffData(tenantId: string, scope?: FinancialScope): Promise<StaffMemberData[] | null> {
  return fetchFinancialData<StaffMemberData[]>(tenantId, 'staff', scope);
}

export async function loadTimelineData(
  tenantId: string,
  granularity: 'day' | 'week' | 'month',
  scope?: FinancialScope,
): Promise<TimelinePageData | null> {
  return fetchFinancialData<TimelinePageData>(tenantId, 'timeline', { granularity, ...scope });
}

export async function loadPatternsData(tenantId: string, locationFilter?: string, scope?: FinancialScope): Promise<PatternsPageData | null> {
  return fetchFinancialData<PatternsPageData>(tenantId, 'patterns', { ...(locationFilter ? { locationFilter } : {}), ...scope });
}

export async function loadSummaryData(tenantId: string, scope?: FinancialScope): Promise<SummaryPageData | null> {
  return fetchFinancialData<SummaryPageData>(tenantId, 'summary', scope);
}

export async function loadProductMixData(tenantId: string, scope?: FinancialScope): Promise<ProductMixData | null> {
  return fetchFinancialData<ProductMixData>(tenantId, 'products', scope);
}

export async function loadLocationDetailData(tenantId: string, locationId: string): Promise<LocationDetailData | null> {
  return fetchFinancialData<LocationDetailData>(tenantId, 'location_detail', { locationId });
}

export async function loadServerDetailData(tenantId: string, serverId: string): Promise<ServerDetailData | null> {
  return fetchFinancialData<ServerDetailData>(tenantId, 'server_detail', { serverId });
}
