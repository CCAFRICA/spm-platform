/**
 * Financial Service
 *
 * Computes financial metrics from committed cheque data.
 * Provides revenue analysis, staff performance, and location rankings.
 */

import type {
  Cheque,
  PeriodSummary,
  StaffPerformance,
  LocationRanking,
} from './types';
import { ChequeImportService } from './cheque-import-service';
import { EntityService } from './entity-service';
import { getStorageKey } from './financial-constants';

// ============================================
// STORAGE HELPERS
// ============================================

function loadFromStorage<T>(key: string): T[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveToStorage<T>(key: string, data: T[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.warn('Storage save failed:', e);
  }
}

// ============================================
// PERIOD HELPERS
// ============================================

/**
 * Get period key from date
 */
function getPeriodKey(date: string, periodType: 'day' | 'week' | 'month'): string {
  const d = new Date(date);

  switch (periodType) {
    case 'day':
      return date.substring(0, 10); // YYYY-MM-DD
    case 'week':
      const startOfWeek = new Date(d);
      const day = startOfWeek.getDay();
      const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1);
      startOfWeek.setDate(diff);
      const weekYear = startOfWeek.getFullYear();
      const weekNum = Math.ceil((((startOfWeek.getTime() - new Date(weekYear, 0, 1).getTime()) / 86400000) + 1) / 7);
      return `${weekYear}-W${String(weekNum).padStart(2, '0')}`;
    case 'month':
      return date.substring(0, 7); // YYYY-MM
    default:
      return date.substring(0, 10);
  }
}

// ============================================
// FINANCIAL SERVICE CLASS
// ============================================

export class FinancialService {
  private tenantId: string;
  private importService: ChequeImportService;
  private entityService: EntityService;

  constructor(tenantId: string) {
    this.tenantId = tenantId;
    this.importService = new ChequeImportService(tenantId);
    this.entityService = new EntityService(tenantId);
  }

  // ============================================
  // CHEQUE ACCESS
  // ============================================

  /**
   * Get all committed cheques
   */
  getAllCheques(): Cheque[] {
    return this.importService.getAllCheques();
  }

  /**
   * Get cheques by location
   */
  getChequesByLocation(locationId: string, period?: string): Cheque[] {
    return this.importService.getCheques(locationId, period);
  }

  /**
   * Get cheques by staff member
   */
  getChequesByStaff(staffId: number, period?: string): Cheque[] {
    const cheques = this.getAllCheques();
    let filtered = cheques.filter(c => c.meseroId === staffId);

    if (period) {
      filtered = filtered.filter(c => c.fecha.startsWith(period));
    }

    return filtered;
  }

  // ============================================
  // PERIOD SUMMARIES
  // ============================================

  /**
   * Calculate period summary for all cheques
   */
  calculatePeriodSummary(
    cheques: Cheque[],
    period: string,
    periodType: 'day' | 'week' | 'month',
    locationId?: string,
    staffId?: number
  ): PeriodSummary {
    // Filter to valid cheques
    const validCheques = cheques.filter(c => c.pagado && !c.cancelado);
    const allCheques = cheques;

    // Count cancelled and unpaid
    const cancelledCount = allCheques.filter(c => c.cancelado).length;
    const unpaidCount = allCheques.filter(c => !c.pagado && !c.cancelado).length;

    // Calculate totals
    let totalRevenue = 0;
    let cashRevenue = 0;
    let cardRevenue = 0;
    let foodRevenue = 0;
    let beverageRevenue = 0;
    let totalTips = 0;
    let totalDiscounts = 0;
    let totalComps = 0;
    let totalTax = 0;
    let guestCount = 0;
    let itemCount = 0;

    for (const c of validCheques) {
      totalRevenue += c.total;
      cashRevenue += c.efectivo;
      cardRevenue += c.tarjeta;
      foodRevenue += c.totalAlimentos;
      beverageRevenue += c.totalBebidas;
      totalTips += c.propina;
      totalDiscounts += c.totalDescuentos;
      totalComps += c.totalCortesias;
      totalTax += c.totalImpuesto;
      guestCount += c.numeroPersonas;
      itemCount += c.totalArticulos;
    }

    const chequeCount = validCheques.length;
    const subtotal = totalRevenue - totalTax;

    // Calculate derived metrics
    const avgCheck = chequeCount > 0 ? totalRevenue / chequeCount : 0;
    const avgGuestCheck = guestCount > 0 ? totalRevenue / guestCount : 0;
    const avgItemsPerCheck = chequeCount > 0 ? itemCount / chequeCount : 0;
    const foodBevRatio = beverageRevenue > 0 ? foodRevenue / beverageRevenue : 0;
    const tipRate = subtotal > 0 ? totalTips / subtotal : 0;
    const discountRate = subtotal > 0 ? totalDiscounts / subtotal : 0;
    const cancellationRate = allCheques.length > 0 ? cancelledCount / allCheques.length : 0;

    return {
      period,
      periodType,
      locationId,
      staffId,
      chequeCount,
      guestCount,
      itemCount,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      cashRevenue: Math.round(cashRevenue * 100) / 100,
      cardRevenue: Math.round(cardRevenue * 100) / 100,
      foodRevenue: Math.round(foodRevenue * 100) / 100,
      beverageRevenue: Math.round(beverageRevenue * 100) / 100,
      totalTips: Math.round(totalTips * 100) / 100,
      totalDiscounts: Math.round(totalDiscounts * 100) / 100,
      totalComps: Math.round(totalComps * 100) / 100,
      totalTax: Math.round(totalTax * 100) / 100,
      avgCheck: Math.round(avgCheck * 100) / 100,
      avgGuestCheck: Math.round(avgGuestCheck * 100) / 100,
      avgItemsPerCheck: Math.round(avgItemsPerCheck * 100) / 100,
      foodBevRatio: Math.round(foodBevRatio * 100) / 100,
      tipRate: Math.round(tipRate * 10000) / 10000,
      discountRate: Math.round(discountRate * 10000) / 10000,
      cancellationRate: Math.round(cancellationRate * 10000) / 10000,
      cancelledCount,
      unpaidCount,
    };
  }

  /**
   * Get period summary for location
   */
  getLocationSummary(
    locationId: string,
    period: string,
    periodType: 'day' | 'week' | 'month' = 'month'
  ): PeriodSummary {
    const cheques = this.getChequesByLocation(locationId, period);
    return this.calculatePeriodSummary(cheques, period, periodType, locationId);
  }

  /**
   * Get network-wide summary
   */
  getNetworkSummary(
    period: string,
    periodType: 'day' | 'week' | 'month' = 'month'
  ): PeriodSummary {
    const cheques = this.getAllCheques().filter(c => c.fecha.startsWith(period));
    return this.calculatePeriodSummary(cheques, period, periodType);
  }

  /**
   * Get summaries by period
   */
  getSummariesByPeriod(periodType: 'day' | 'week' | 'month' = 'month'): PeriodSummary[] {
    const cheques = this.getAllCheques();
    const periodMap = new Map<string, Cheque[]>();

    // Group cheques by period
    for (const c of cheques) {
      const periodKey = getPeriodKey(c.fecha, periodType);
      if (!periodMap.has(periodKey)) {
        periodMap.set(periodKey, []);
      }
      periodMap.get(periodKey)!.push(c);
    }

    // Calculate summary for each period
    const summaries: PeriodSummary[] = [];
    Array.from(periodMap.entries()).forEach(([period, periodCheques]) => {
      summaries.push(this.calculatePeriodSummary(periodCheques, period, periodType));
    });

    // Sort by period
    summaries.sort((a, b) => a.period.localeCompare(b.period));

    return summaries;
  }

  // ============================================
  // STAFF PERFORMANCE
  // ============================================

  /**
   * Calculate staff performance metrics
   */
  getStaffPerformance(
    staffId: number,
    period: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _periodType: 'day' | 'week' | 'month' = 'month'
  ): StaffPerformance {
    const cheques = this.getChequesByStaff(staffId, period);
    const validCheques = cheques.filter(c => c.pagado && !c.cancelado);

    let totalRevenue = 0;
    let totalTips = 0;
    let guestCount = 0;
    let locationId = '';

    for (const c of validCheques) {
      totalRevenue += c.total;
      totalTips += c.propina;
      guestCount += c.numeroPersonas;
      if (!locationId) locationId = c.numeroFranquicia;
    }

    const chequeCount = validCheques.length;
    const avgCheck = chequeCount > 0 ? totalRevenue / chequeCount : 0;
    const subtotal = totalRevenue * 0.86; // Estimate pre-tax
    const tipRate = subtotal > 0 ? totalTips / subtotal : 0;

    // Get staff name from entity service
    const staff = this.entityService.getStaffMember(String(staffId));

    return {
      staffId,
      staffName: staff?.name,
      locationId,
      period,
      chequeCount,
      guestCount,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      avgCheck: Math.round(avgCheck * 100) / 100,
      totalTips: Math.round(totalTips * 100) / 100,
      tipRate: Math.round(tipRate * 10000) / 10000,
    };
  }

  /**
   * Get all staff performance for a period
   */
  getAllStaffPerformance(
    period: string,
    periodType: 'day' | 'week' | 'month' = 'month'
  ): StaffPerformance[] {
    const cheques = this.getAllCheques().filter(c => c.fecha.startsWith(period));
    const staffIds = new Set<number>();

    for (const c of cheques) {
      staffIds.add(c.meseroId);
    }

    const performances: StaffPerformance[] = [];
    Array.from(staffIds).forEach((staffId) => {
      performances.push(this.getStaffPerformance(staffId, period, periodType));
    });

    // Sort by revenue (descending)
    performances.sort((a, b) => b.totalRevenue - a.totalRevenue);

    // Add rankings
    performances.forEach((p, i) => {
      p.revenueRank = i + 1;
    });

    // Sort by avgCheck and add ranking
    const byAvgCheck = [...performances].sort((a, b) => b.avgCheck - a.avgCheck);
    byAvgCheck.forEach((p, i) => {
      p.avgCheckRank = i + 1;
    });

    // Sort by tipRate and add ranking
    const byTipRate = [...performances].sort((a, b) => b.tipRate - a.tipRate);
    byTipRate.forEach((p, i) => {
      p.tipRank = i + 1;
    });

    return performances;
  }

  // ============================================
  // LOCATION RANKINGS
  // ============================================

  /**
   * Get location rankings for a metric
   */
  getLocationRankings(
    metric: 'revenue' | 'avgCheck' | 'tipRate' | 'chequeCount',
    period: string
  ): LocationRanking[] {
    const locations = this.entityService.getLocations();
    const rankings: LocationRanking[] = [];

    // Calculate metric for each location
    const locationMetrics: Array<{ locationId: string; value: number }> = [];

    for (const location of locations) {
      const summary = this.getLocationSummary(location.id, period);
      let value = 0;

      switch (metric) {
        case 'revenue':
          value = summary.totalRevenue;
          break;
        case 'avgCheck':
          value = summary.avgCheck;
          break;
        case 'tipRate':
          value = summary.tipRate;
          break;
        case 'chequeCount':
          value = summary.chequeCount;
          break;
      }

      locationMetrics.push({ locationId: location.id, value });
    }

    // Sort by value (descending)
    locationMetrics.sort((a, b) => b.value - a.value);

    // Calculate network average
    const totalValue = locationMetrics.reduce((sum, lm) => sum + lm.value, 0);
    const networkAvg = locationMetrics.length > 0 ? totalValue / locationMetrics.length : 0;

    // Build rankings
    locationMetrics.forEach((lm, i) => {
      const location = locations.find(l => l.id === lm.locationId);
      const percentile = locationMetrics.length > 0
        ? ((locationMetrics.length - i) / locationMetrics.length) * 100
        : 0;

      rankings.push({
        locationId: lm.locationId,
        locationName: location?.name || lm.locationId,
        rank: i + 1,
        metric,
        value: Math.round(lm.value * 100) / 100,
        networkAvg: Math.round(networkAvg * 100) / 100,
        percentile: Math.round(percentile),
      });
    });

    // Cache rankings
    const key = getStorageKey('LOCATION_RANKINGS', this.tenantId);
    const existing = loadFromStorage<LocationRanking>(key);
    const filtered = existing.filter(r => !(r.metric === metric));
    saveToStorage(key, [...filtered, ...rankings]);

    return rankings;
  }

  // ============================================
  // QUICK METRICS
  // ============================================

  /**
   * Get quick revenue summary
   */
  getTotalRevenue(period?: string): number {
    let cheques = this.getAllCheques();

    if (period) {
      cheques = cheques.filter(c => c.fecha.startsWith(period));
    }

    return cheques
      .filter(c => c.pagado && !c.cancelado)
      .reduce((sum, c) => sum + c.total, 0);
  }

  /**
   * Get average check amount
   */
  getAverageCheck(period?: string): number {
    let cheques = this.getAllCheques();

    if (period) {
      cheques = cheques.filter(c => c.fecha.startsWith(period));
    }

    const validCheques = cheques.filter(c => c.pagado && !c.cancelado);
    const total = validCheques.reduce((sum, c) => sum + c.total, 0);

    return validCheques.length > 0 ? total / validCheques.length : 0;
  }

  /**
   * Get food to beverage ratio
   */
  getFoodBevRatio(period?: string): number {
    let cheques = this.getAllCheques();

    if (period) {
      cheques = cheques.filter(c => c.fecha.startsWith(period));
    }

    const validCheques = cheques.filter(c => c.pagado && !c.cancelado);
    const foodTotal = validCheques.reduce((sum, c) => sum + c.totalAlimentos, 0);
    const bevTotal = validCheques.reduce((sum, c) => sum + c.totalBebidas, 0);

    return bevTotal > 0 ? foodTotal / bevTotal : 0;
  }

  /**
   * Get tip rate
   */
  getTipRate(period?: string): number {
    let cheques = this.getAllCheques();

    if (period) {
      cheques = cheques.filter(c => c.fecha.startsWith(period));
    }

    const validCheques = cheques.filter(c => c.pagado && !c.cancelado);
    const tips = validCheques.reduce((sum, c) => sum + c.propina, 0);
    const subtotal = validCheques.reduce((sum, c) => sum + (c.total - c.totalImpuesto), 0);

    return subtotal > 0 ? tips / subtotal : 0;
  }

  /**
   * Get discount rate
   */
  getDiscountRate(period?: string): number {
    let cheques = this.getAllCheques();

    if (period) {
      cheques = cheques.filter(c => c.fecha.startsWith(period));
    }

    const validCheques = cheques.filter(c => c.pagado && !c.cancelado);
    const discounts = validCheques.reduce((sum, c) => sum + c.totalDescuentos, 0);
    const subtotal = validCheques.reduce((sum, c) => sum + c.subtotal, 0);

    return subtotal > 0 ? discounts / subtotal : 0;
  }

  /**
   * Get cancellation rate
   */
  getCancellationRate(period?: string): number {
    let cheques = this.getAllCheques();

    if (period) {
      cheques = cheques.filter(c => c.fecha.startsWith(period));
    }

    const cancelled = cheques.filter(c => c.cancelado).length;

    return cheques.length > 0 ? cancelled / cheques.length : 0;
  }

  // ============================================
  // DASHBOARD SUMMARY
  // ============================================

  /**
   * Get dashboard summary
   */
  getDashboardSummary(period?: string): {
    totalRevenue: number;
    avgCheck: number;
    totalCheques: number;
    totalGuests: number;
    foodBevRatio: number;
    tipRate: number;
    discountRate: number;
    cancellationRate: number;
    locationCount: number;
    staffCount: number;
  } {
    let cheques = this.getAllCheques();

    if (period) {
      cheques = cheques.filter(c => c.fecha.startsWith(period));
    }

    const validCheques = cheques.filter(c => c.pagado && !c.cancelado);

    const totalRevenue = validCheques.reduce((sum, c) => sum + c.total, 0);
    const totalGuests = validCheques.reduce((sum, c) => sum + c.numeroPersonas, 0);
    const foodTotal = validCheques.reduce((sum, c) => sum + c.totalAlimentos, 0);
    const bevTotal = validCheques.reduce((sum, c) => sum + c.totalBebidas, 0);
    const tips = validCheques.reduce((sum, c) => sum + c.propina, 0);
    const discounts = validCheques.reduce((sum, c) => sum + c.totalDescuentos, 0);
    const subtotal = validCheques.reduce((sum, c) => sum + c.subtotal, 0);

    const locations = new Set<string>();
    const staff = new Set<number>();
    for (const c of cheques) {
      locations.add(c.numeroFranquicia);
      staff.add(c.meseroId);
    }

    return {
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      avgCheck: validCheques.length > 0 ? Math.round((totalRevenue / validCheques.length) * 100) / 100 : 0,
      totalCheques: validCheques.length,
      totalGuests,
      foodBevRatio: bevTotal > 0 ? Math.round((foodTotal / bevTotal) * 100) / 100 : 0,
      tipRate: subtotal > 0 ? Math.round((tips / subtotal) * 10000) / 10000 : 0,
      discountRate: subtotal > 0 ? Math.round((discounts / subtotal) * 10000) / 10000 : 0,
      cancellationRate: cheques.length > 0
        ? Math.round((cheques.filter(c => c.cancelado).length / cheques.length) * 10000) / 10000
        : 0,
      locationCount: locations.size,
      staffCount: staff.size,
    };
  }
}

/**
 * Get financial service instance for tenant
 */
export function getFinancialService(tenantId: string): FinancialService {
  return new FinancialService(tenantId);
}
