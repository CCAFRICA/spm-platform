/**
 * Pulse Service
 *
 * Provides role-aware key metrics for the Pulse section of Mission Control.
 * Each role sees metrics relevant to their responsibilities.
 *
 * OB-43A: Supabase cutover — all data reads from Supabase, no localStorage.
 */

import type { PulseMetric, PulseTrend } from '@/types/navigation';
import type { UserRole } from '@/types/auth';
import {
  listCalculationBatches,
  getCalculationResults,
  getProfileCount,
  getBatchCountToday,
  getTenantCount,
} from '@/lib/supabase/calculation-service';
import { getRuleSets } from '@/lib/supabase/rule-set-service';

// =============================================================================
// PULSE METRICS (async — reads from Supabase)
// =============================================================================

interface CalcResultSummary {
  entityId: string;
  entityName: string;
  storeId?: string;
  totalIncentive: number;
  components: Array<{ attainment?: number; outputValue: number }>;
}

/**
 * Get pulse metrics for a user based on their role (async)
 */
export async function getPulseMetrics(
  userId: string,
  tenantId: string,
  role: UserRole,
): Promise<PulseMetric[]> {
  switch (role) {
    case 'sales_rep':
      return getRepMetrics(userId, tenantId);
    case 'manager':
      return getManagerMetrics(tenantId);
    case 'admin':
      return getAdminMetrics(tenantId);
    case 'vl_admin':
      return getVLAdminMetrics(tenantId);
    default:
      return [];
  }
}

// =============================================================================
// SHARED HELPER: Load latest results from Supabase
// =============================================================================

async function loadLatestResults(tenantId: string): Promise<CalcResultSummary[]> {
  try {
    const batches = await listCalculationBatches(tenantId);
    if (batches.length === 0) return [];

    const latest = batches[0];
    const rows = await getCalculationResults(tenantId, latest.id);

    return rows.map(r => {
      const meta = (r.metadata as Record<string, unknown>) || {};
      const comps = Array.isArray(r.components) ? r.components : [];
      return {
        entityId: r.entity_id,
        entityName: (meta.entityName as string) || r.entity_id,
        storeId: (meta.storeId as string) || undefined,
        totalIncentive: r.total_payout || 0,
        components: comps.map((c: unknown) => {
          const comp = c as Record<string, unknown>;
          return {
            attainment: typeof comp.attainment === 'number' ? comp.attainment : undefined,
            outputValue: Number(comp.outputValue || 0),
          };
        }),
      };
    });
  } catch {
    return [];
  }
}

// =============================================================================
// ROLE-SPECIFIC METRICS — ALL WIRED TO SUPABASE
// =============================================================================

async function getRepMetrics(userId: string, tenantId: string): Promise<PulseMetric[]> {
  const results = await loadLatestResults(tenantId);

  const emailPrefix = userId.replace(/-/g, '');
  const myResult = results.find(r =>
    r.entityId === userId ||
    r.entityId === emailPrefix ||
    userId.includes(r.entityId)
  );

  let attainment: number | string = '\u2014';
  let earnings: number | string = '\u2014';
  let componentCount = 0;

  if (myResult) {
    earnings = myResult.totalIncentive;
    const attainments = myResult.components
      .map(c => c.attainment)
      .filter((a): a is number => typeof a === 'number' && a > 0);
    if (attainments.length > 0) {
      attainment = Math.round(attainments.reduce((s, a) => s + a, 0) / attainments.length * 100);
    }
    componentCount = myResult.components.filter(c => c.outputValue > 0).length;
  }

  return [
    {
      id: 'rep-attainment',
      label: 'Attainment',
      labelEs: 'Cumplimiento',
      value: attainment,
      format: typeof attainment === 'number' ? 'percentage' : 'text',
      roles: ['sales_rep'],
      route: '/perform/compensation',
    },
    {
      id: 'rep-earnings',
      label: 'Current Earnings',
      labelEs: 'Ganancias Actuales',
      value: earnings,
      format: typeof earnings === 'number' ? 'currency' : 'text',
      roles: ['sales_rep'],
      route: '/perform/compensation',
    },
    {
      id: 'rep-components',
      label: 'Active Components',
      labelEs: 'Componentes Activos',
      value: results.length > 0 ? componentCount : '\u2014',
      format: results.length > 0 ? 'number' : 'text',
      roles: ['sales_rep'],
      route: '/perform/dashboard',
    },
  ];
}

async function getManagerMetrics(tenantId: string): Promise<PulseMetric[]> {
  const results = await loadLatestResults(tenantId);

  let teamPayout: number | string = '\u2014';
  let teamSize: number | string = '\u2014';
  let topPerformer: string = '\u2014';

  if (results.length > 0) {
    teamPayout = results.reduce((sum, r) => sum + r.totalIncentive, 0);
    teamSize = results.length;

    const sorted = [...results].sort((a, b) => b.totalIncentive - a.totalIncentive);
    if (sorted.length > 0 && sorted[0].totalIncentive > 0) {
      const top = sorted[0];
      const firstName = top.entityName?.split(' ')[0] || top.entityId;
      topPerformer = firstName;
    }
  }

  return [
    {
      id: 'mgr-team-payout',
      label: 'Team Payout',
      labelEs: 'Pago del Equipo',
      value: teamPayout,
      format: typeof teamPayout === 'number' ? 'currency' : 'text',
      roles: ['manager'],
      route: '/perform/team',
    },
    {
      id: 'mgr-team-size',
      label: 'Team Size',
      labelEs: 'Tamano del Equipo',
      value: teamSize,
      format: typeof teamSize === 'number' ? 'number' : 'text',
      roles: ['manager'],
      route: '/perform/team',
    },
    {
      id: 'mgr-top-performer',
      label: 'Top Performer',
      labelEs: 'Mejor Rendimiento',
      value: topPerformer,
      format: 'text',
      roles: ['manager'],
      route: '/perform/team/rankings',
    },
  ];
}

async function getAdminMetrics(tenantId: string): Promise<PulseMetric[]> {
  let cycleProgress: number | string = '\u2014';
  let profileCount = 0;
  let calcsToday = 0;

  try {
    const [batches, ruleSets, profiles, batchesToday] = await Promise.all([
      listCalculationBatches(tenantId),
      getRuleSets(tenantId),
      getProfileCount(tenantId),
      getBatchCountToday(tenantId),
    ]);

    profileCount = profiles;
    calcsToday = batchesToday;

    let completed = 0;
    if (ruleSets.length > 0) completed++;
    if (batches.length > 0) completed++;
    cycleProgress = completed * 20;
  } catch { /* ignore */ }

  return [
    {
      id: 'admin-total-users',
      label: 'Total Users',
      labelEs: 'Usuarios Totales',
      value: profileCount > 0 ? profileCount : '\u2014',
      format: profileCount > 0 ? 'number' : 'text',
      roles: ['admin'],
      route: '/workforce/personnel',
    },
    {
      id: 'admin-calculations-today',
      label: 'Calculations Today',
      labelEs: 'Calculos Hoy',
      value: calcsToday,
      format: 'number',
      roles: ['admin'],
      route: '/operate/results',
    },
    {
      id: 'admin-cycle-progress',
      label: 'Cycle Progress',
      labelEs: 'Progreso del Ciclo',
      value: cycleProgress,
      format: typeof cycleProgress === 'number' ? 'percentage' : 'text',
      roles: ['admin'],
      route: '/operate',
    },
    {
      id: 'admin-employees',
      label: 'Employees',
      labelEs: 'Empleados',
      value: profileCount > 0 ? profileCount : '\u2014',
      format: profileCount > 0 ? 'number' : 'text',
      roles: ['admin'],
      route: '/workforce/personnel',
    },
  ];
}

async function getVLAdminMetrics(tenantId: string): Promise<PulseMetric[]> {
  let tenantCount = 0;
  let profileCount = 0;
  let calcsToday = 0;

  try {
    [tenantCount, profileCount, calcsToday] = await Promise.all([
      getTenantCount(),
      getProfileCount(tenantId),
      getBatchCountToday(tenantId),
    ]);
  } catch { /* ignore */ }

  return [
    {
      id: 'cc-active-tenants',
      label: 'Active Tenants',
      labelEs: 'Tenants Activos',
      value: tenantCount > 0 ? tenantCount : '\u2014',
      format: tenantCount > 0 ? 'number' : 'text',
      roles: ['vl_admin'],
    },
    {
      id: 'cc-total-users',
      label: 'Total Users',
      labelEs: 'Usuarios Totales',
      value: profileCount > 0 ? profileCount : '\u2014',
      format: profileCount > 0 ? 'number' : 'text',
      roles: ['vl_admin'],
    },
    {
      id: 'cc-calculations-today',
      label: 'Calculations Today',
      labelEs: 'Calculos Hoy',
      value: calcsToday,
      format: 'number',
      roles: ['vl_admin'],
    },
    {
      id: 'cc-issues',
      label: 'Outstanding Issues',
      labelEs: 'Problemas Pendientes',
      value: '\u2014',
      format: 'text',
      roles: ['vl_admin'],
    },
  ];
}

// =============================================================================
// HELPERS (pure functions — no localStorage)
// =============================================================================

/**
 * Format a metric value for display
 */
export function formatMetricValue(
  value: string | number,
  format: PulseMetric['format'],
  currency: string = 'USD'
): string {
  switch (format) {
    case 'currency': {
      const num = typeof value === 'string' ? parseFloat(value) : value;
      return new Intl.NumberFormat(currency === 'MXN' ? 'es-MX' : 'en-US', {
        style: 'currency',
        currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(num);
    }

    case 'percentage':
      return `${value}%`;

    case 'number': {
      const n = typeof value === 'string' ? parseFloat(value) : value;
      return n.toLocaleString();
    }

    case 'text':
    default:
      return String(value);
  }
}

/**
 * Get trend arrow character
 */
export function getTrendArrow(trend: PulseTrend | undefined): string {
  switch (trend) {
    case 'up':
      return '\u25B2';
    case 'down':
      return '\u25BC';
    case 'flat':
    default:
      return '\u25CF';
  }
}

/**
 * Get trend color class
 */
export function getTrendColor(trend: PulseTrend | undefined): string {
  switch (trend) {
    case 'up':
      return 'text-emerald-400';
    case 'down':
      return 'text-rose-400';
    case 'flat':
    default:
      return 'text-zinc-500';
  }
}

/**
 * Get the primary metric for collapsed rail view
 */
export function getPrimaryMetric(metrics: PulseMetric[]): PulseMetric | null {
  return metrics[0] || null;
}
