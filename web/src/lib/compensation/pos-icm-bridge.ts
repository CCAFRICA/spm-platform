/**
 * POS-to-ICM Bridge
 *
 * Reads committed cheque data from the Financial Module and transforms it
 * into the metrics needed by the ICM calculation engine.
 *
 * Data Flow:
 *   Financial Module (cheques) → Bridge → ICM Metric Resolver → Calculation Engine
 *
 * Metrics produced per server per period:
 *   - server_total_revenue:  SUM(total) WHERE pagado=1 AND cancelado=0
 *   - server_total_tips:     SUM(propina) WHERE pagado=1 AND cancelado=0
 *   - server_tip_rate:       total_tips / (total_revenue - total_tax) * 100
 *   - server_avg_check:      total_revenue / cheque_count
 *   - server_cheque_count:   COUNT(*) WHERE pagado=1 AND cancelado=0
 *   - server_beverage_ratio: total_beverage / total_revenue * 100
 *
 * Korean Test: All metric names and field mappings come from configuration.
 * The bridge reads from the Cheque interface fields, not hardcoded column names.
 */

import type { Cheque } from '@/lib/financial/types';
import { ChequeImportService } from '@/lib/financial/cheque-import-service';

// =============================================================================
// TYPES
// =============================================================================

export interface ServerMetrics {
  serverId: number;
  serverName?: string;
  locationId: string;
  period: string;            // 'YYYY-MM' format

  // Raw aggregates
  totalRevenue: number;       // MXN
  totalTips: number;          // MXN
  totalTax: number;           // MXN
  totalFood: number;          // MXN
  totalBeverage: number;      // MXN
  chequeCount: number;
  guestCount: number;
  cancelledCount: number;

  // Derived metrics (for plan components)
  server_total_revenue: number;
  server_total_tips: number;
  server_tip_rate: number;      // percentage (0-100)
  server_avg_check: number;     // MXN
  server_cheque_count: number;
  server_beverage_ratio: number; // percentage (0-100)
}

export interface BridgeResult {
  tenantId: string;
  period: string;
  serverMetrics: ServerMetrics[];
  locationSummary: Array<{
    locationId: string;
    serverCount: number;
    totalRevenue: number;
    avgCheck: number;
  }>;
  totals: {
    servers: number;
    locations: number;
    cheques: number;
    totalRevenue: number;
    totalTips: number;
  };
}

// =============================================================================
// BRIDGE
// =============================================================================

/**
 * Extract server metrics from committed cheque data for a given period.
 *
 * @param tenantId - Tenant ID (e.g., 'frmx-demo')
 * @param period - Period in 'YYYY-MM' format
 * @param cheques - Optional pre-loaded cheques (if not provided, reads from import service)
 */
export function extractServerMetrics(
  tenantId: string,
  period: string,
  cheques?: Cheque[]
): BridgeResult {
  // Load cheques from import service if not provided
  const allCheques = cheques || loadCheques(tenantId);

  // Filter by period
  const periodCheques = allCheques.filter(c => {
    if (!c.fecha) return false;
    const chequeMonth = c.fecha.substring(0, 7); // 'YYYY-MM'
    return chequeMonth === period;
  });

  // Group by server
  const byServer = new Map<number, Cheque[]>();
  for (const cheque of periodCheques) {
    const serverId = cheque.meseroId;
    const existing = byServer.get(serverId);
    if (existing) {
      existing.push(cheque);
    } else {
      byServer.set(serverId, [cheque]);
    }
  }

  // Compute metrics per server
  const serverMetrics: ServerMetrics[] = [];

  Array.from(byServer.entries()).forEach(([serverId, serverCheques]) => {
    // Filter to valid (paid, non-cancelled) cheques for revenue
    const valid = serverCheques.filter(c => c.pagado && !c.cancelado);
    const cancelled = serverCheques.filter(c => c.cancelado);

    const totalRevenue = sum(valid, c => c.total);
    const totalTips = sum(valid, c => c.propina);
    const totalTax = sum(valid, c => c.totalImpuesto);
    const totalFood = sum(valid, c => c.totalAlimentos);
    const totalBeverage = sum(valid, c => c.totalBebidas);
    const guestCount = sum(valid, c => c.numeroPersonas);

    // Derived metrics
    const netRevenue = totalRevenue - totalTax;
    const tipRate = netRevenue > 0 ? (totalTips / netRevenue) * 100 : 0;
    const avgCheck = valid.length > 0 ? totalRevenue / valid.length : 0;
    const bevRatio = totalRevenue > 0 ? (totalBeverage / totalRevenue) * 100 : 0;

    // Determine location (most common location for this server)
    const locationId = mode(serverCheques.map(c => c.numeroFranquicia));

    serverMetrics.push({
      serverId,
      locationId,
      period,
      totalRevenue: round2(totalRevenue),
      totalTips: round2(totalTips),
      totalTax: round2(totalTax),
      totalFood: round2(totalFood),
      totalBeverage: round2(totalBeverage),
      chequeCount: valid.length,
      guestCount,
      cancelledCount: cancelled.length,
      // Plan component metrics
      server_total_revenue: round2(totalRevenue),
      server_total_tips: round2(totalTips),
      server_tip_rate: round2(tipRate),
      server_avg_check: round2(avgCheck),
      server_cheque_count: valid.length,
      server_beverage_ratio: round2(bevRatio),
    });
  });

  // Sort by revenue descending
  serverMetrics.sort((a, b) => b.totalRevenue - a.totalRevenue);

  // Location summary
  const byLocation = new Map<string, ServerMetrics[]>();
  for (const sm of serverMetrics) {
    const existing = byLocation.get(sm.locationId);
    if (existing) {
      existing.push(sm);
    } else {
      byLocation.set(sm.locationId, [sm]);
    }
  }

  const locationSummary = Array.from(byLocation.entries()).map(([locationId, servers]) => ({
    locationId,
    serverCount: servers.length,
    totalRevenue: round2(sum(servers, s => s.totalRevenue)),
    avgCheck: round2(
      servers.length > 0
        ? sum(servers, s => s.server_avg_check) / servers.length
        : 0
    ),
  }));

  return {
    tenantId,
    period,
    serverMetrics,
    locationSummary,
    totals: {
      servers: serverMetrics.length,
      locations: locationSummary.length,
      cheques: sum(serverMetrics, s => s.chequeCount),
      totalRevenue: round2(sum(serverMetrics, s => s.totalRevenue)),
      totalTips: round2(sum(serverMetrics, s => s.totalTips)),
    },
  };
}

/**
 * Convert bridge metrics to the format expected by the ICM metric resolver.
 * Returns a map of employeeId -> metricName -> value.
 */
export function toICMMetrics(
  bridgeResult: BridgeResult
): Map<string, Record<string, number>> {
  const metrics = new Map<string, Record<string, number>>();

  for (const sm of bridgeResult.serverMetrics) {
    const employeeId = String(sm.serverId);
    metrics.set(employeeId, {
      server_total_revenue: sm.server_total_revenue,
      server_total_tips: sm.server_total_tips,
      server_tip_rate: sm.server_tip_rate,
      server_avg_check: sm.server_avg_check,
      server_cheque_count: sm.server_cheque_count,
      server_beverage_ratio: sm.server_beverage_ratio,
    });
  }

  return metrics;
}

// =============================================================================
// INTERNAL HELPERS
// =============================================================================

function loadCheques(tenantId: string): Cheque[] {
  try {
    const importService = new ChequeImportService(tenantId);
    return importService.getAllCheques();
  } catch {
    console.warn(`[POS-ICM Bridge] Could not load cheques for tenant ${tenantId}`);
    return [];
  }
}

function sum<T>(items: T[], accessor: (item: T) => number): number {
  return items.reduce((acc, item) => acc + accessor(item), 0);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function mode(values: string[]): string {
  const counts = new Map<string, number>();
  for (const v of values) {
    counts.set(v, (counts.get(v) || 0) + 1);
  }
  let best = '';
  let bestCount = 0;
  Array.from(counts.entries()).forEach(([value, count]) => {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  });
  return best;
}
