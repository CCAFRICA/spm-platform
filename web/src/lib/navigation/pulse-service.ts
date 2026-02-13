/**
 * Pulse Service
 *
 * Provides role-aware key metrics for the Pulse section of Mission Control.
 * Each role sees metrics relevant to their responsibilities.
 *
 * OB-32: All roles now read from real data (calculation results, cycle state).
 * Falls back to "—" when no data is available.
 */

import type { PulseMetric, PulseTrend } from '@/types/navigation';
import type { UserRole } from '@/types/auth';

// =============================================================================
// PULSE METRICS
// =============================================================================

/**
 * Get pulse metrics for a user based on their role
 */
export function getPulseMetrics(
  userId: string,
  tenantId: string,
  role: UserRole,
): PulseMetric[] {
  switch (role) {
    case 'sales_rep':
      return getRepMetrics(userId, tenantId);
    case 'manager':
      return getManagerMetrics(tenantId);
    case 'admin':
      return getAdminMetrics(tenantId);
    case 'vl_admin':
      return getCCAdminMetrics();
    default:
      return [];
  }
}

// =============================================================================
// SHARED HELPERS: READ REAL DATA
// =============================================================================

interface CalcResultSummary {
  employeeId: string;
  employeeName: string;
  storeId?: string;
  totalIncentive: number;
  components: Array<{ attainment?: number; outputValue: number }>;
}

/**
 * Load the latest calculation results for a tenant from localStorage
 */
function loadLatestResults(tenantId: string): CalcResultSummary[] {
  if (typeof window === 'undefined') return [];

  try {
    // Find latest completed run
    const runsStr = localStorage.getItem('vialuce_calculation_runs');
    if (!runsStr) return [];

    const runs: Array<{ id: string; tenantId: string; status: string; startedAt: string }> = JSON.parse(runsStr);
    const tenantRuns = runs
      .filter(r => r.tenantId === tenantId && r.status === 'completed')
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

    if (tenantRuns.length === 0) return [];
    const latestRunId = tenantRuns[0].id;

    // Load chunked results
    const results: CalcResultSummary[] = [];
    for (let chunk = 0; chunk < 100; chunk++) {
      const chunkKey = `calculation_results_${latestRunId}_${chunk}`;
      const chunkData = localStorage.getItem(chunkKey);
      if (!chunkData) break;
      const parsed = JSON.parse(chunkData);
      if (Array.isArray(parsed)) {
        results.push(...parsed);
      }
    }

    return results;
  } catch {
    return [];
  }
}

/**
 * Count pending approvals from localStorage
 */
function countPendingApprovals(tenantId: string): number {
  if (typeof window === 'undefined') return 0;
  try {
    const requestsData = localStorage.getItem('approval_requests');
    if (requestsData) {
      const requests: [string, { status: string; tenantId?: string }][] = JSON.parse(requestsData);
      return requests.filter(([, req]) =>
        req.status === 'pending' && (!req.tenantId || req.tenantId === tenantId)
      ).length;
    }
    const approvalsKey = `${tenantId}_pending_approvals`;
    const approvals = localStorage.getItem(approvalsKey);
    if (approvals) {
      const parsed = JSON.parse(approvals);
      return Array.isArray(parsed) ? parsed.filter((a: { status: string }) => a.status === 'pending').length : 0;
    }
    return 0;
  } catch {
    return 0;
  }
}

/**
 * Get data freshness from latest import batch
 */
function getDataFreshness(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const batchesData = localStorage.getItem('data_layer_batches');
    if (!batchesData) return null;
    const batches: [string, { status: string; createdAt: string }][] = JSON.parse(batchesData);
    const committed = batches
      .filter(([, b]) => b.status === 'committed' && b.createdAt)
      .sort((a, b) => new Date(b[1].createdAt).getTime() - new Date(a[1].createdAt).getTime());
    if (committed.length === 0) return null;

    const lastDate = new Date(committed[0][1].createdAt);
    const now = new Date();
    const diffMs = now.getTime() - lastDate.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  } catch {
    return null;
  }
}

// =============================================================================
// ROLE-SPECIFIC METRICS — ALL WIRED TO REAL DATA
// =============================================================================

function getRepMetrics(userId: string, tenantId: string): PulseMetric[] {
  const results = loadLatestResults(tenantId);

  // Try to find this user's result by matching userId patterns (email prefix = employeeId)
  const emailPrefix = userId.replace(/-/g, '');
  const myResult = results.find(r =>
    r.employeeId === userId ||
    r.employeeId === emailPrefix ||
    userId.includes(r.employeeId)
  );

  // Calculate average attainment from components if available
  let attainment: number | string = '—';
  let earnings: number | string = '—';
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
      value: results.length > 0 ? componentCount : '—',
      format: results.length > 0 ? 'number' : 'text',
      roles: ['sales_rep'],
      route: '/perform/dashboard',
    },
  ];
}

function getManagerMetrics(tenantId: string): PulseMetric[] {
  const results = loadLatestResults(tenantId);

  let teamPayout: number | string = '—';
  let teamSize: number | string = '—';
  let topPerformer: string = '—';

  if (results.length > 0) {
    // Calculate totals from all results
    teamPayout = results.reduce((sum, r) => sum + r.totalIncentive, 0);
    teamSize = results.length;

    // Find top performer
    const sorted = [...results].sort((a, b) => b.totalIncentive - a.totalIncentive);
    if (sorted.length > 0 && sorted[0].totalIncentive > 0) {
      const top = sorted[0];
      const firstName = top.employeeName?.split(' ')[0] || top.employeeId;
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
      labelEs: 'Tamaño del Equipo',
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

function getAdminMetrics(tenantId: string): PulseMetric[] {
  // Read real cycle completion from localStorage
  let cycleProgress: number | string = '—';
  if (typeof window !== 'undefined') {
    try {
      const runsStr = localStorage.getItem('vialuce_calculation_runs');
      const batchesStr = localStorage.getItem('data_layer_batches');
      let completed = 0;
      if (batchesStr) completed++; // Has import
      if (runsStr) {
        const runs = JSON.parse(runsStr);
        if (runs.some((r: { tenantId: string; status: string }) => r.tenantId === tenantId && r.status === 'completed')) {
          completed++; // Has calculations
        }
      }
      cycleProgress = completed * 20; // 5 phases, each worth 20%
    } catch { /* ignore */ }
  }

  const pendingApprovals = countPendingApprovals(tenantId);
  const freshness = getDataFreshness();

  const results = loadLatestResults(tenantId);
  const employeeCount = results.length;

  return [
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
      id: 'admin-pending-approvals',
      label: 'Pending Approvals',
      labelEs: 'Aprobaciones Pendientes',
      value: pendingApprovals,
      format: 'number',
      roles: ['admin'],
      route: '/operate/approve',
    },
    {
      id: 'admin-data-freshness',
      label: 'Data Freshness',
      labelEs: 'Frescura de Datos',
      value: freshness || '—',
      format: 'text',
      roles: ['admin'],
      route: '/operate/monitor/readiness',
    },
    {
      id: 'admin-employees',
      label: 'Employees',
      labelEs: 'Empleados',
      value: employeeCount > 0 ? employeeCount : '—',
      format: employeeCount > 0 ? 'number' : 'text',
      roles: ['admin'],
      route: '/configure/people',
    },
  ];
}

function getCCAdminMetrics(): PulseMetric[] {
  // OB-29: Read real data from localStorage, not hardcoded values
  const getRealCounts = () => {
    if (typeof window === 'undefined') {
      return { tenants: 0, users: 0, calcsToday: 0, issues: 0 };
    }

    // Count tenants with data
    const tenantKeys = Object.keys(localStorage).filter(k =>
      k.includes('data_layer_committed') || k.includes('compensation_plans')
    );
    const uniqueTenants = new Set<string>();
    tenantKeys.forEach(k => {
      const match = k.match(/_(retailco|retailcgmx|retail_conglomerate|techcorp|restaurantmx)/i);
      if (match) uniqueTenants.add(match[1]);
    });

    // Count calculation runs today
    let calcsToday = 0;
    const runsStr = localStorage.getItem('vialuce_calculation_runs');
    if (runsStr) {
      try {
        const runs = JSON.parse(runsStr);
        const today = new Date().toISOString().split('T')[0];
        calcsToday = runs.filter((r: { startedAt?: string }) =>
          r.startedAt?.startsWith(today)
        ).length;
      } catch { /* ignore */ }
    }

    return {
      tenants: uniqueTenants.size || 0,
      users: 0, // Would need auth system integration
      calcsToday,
      issues: 0, // Would need dispute system integration
    };
  };

  const counts = getRealCounts();

  return [
    {
      id: 'cc-active-tenants',
      label: 'Active Tenants',
      labelEs: 'Tenants Activos',
      value: counts.tenants > 0 ? counts.tenants : '—',
      format: counts.tenants > 0 ? 'number' : 'text',
      roles: ['vl_admin'],
    },
    {
      id: 'cc-total-users',
      label: 'Total Users',
      labelEs: 'Usuarios Totales',
      value: '—', // Requires auth system integration
      format: 'text',
      roles: ['vl_admin'],
    },
    {
      id: 'cc-calculations-today',
      label: 'Calculations Today',
      labelEs: 'Cálculos Hoy',
      value: counts.calcsToday,
      format: 'number',
      roles: ['vl_admin'],
    },
    {
      id: 'cc-issues',
      label: 'Outstanding Issues',
      labelEs: 'Problemas Pendientes',
      value: '—', // Requires dispute system integration
      format: 'text',
      roles: ['vl_admin'],
    },
  ];
}

// =============================================================================
// HELPERS
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
    case 'currency':
      const num = typeof value === 'string' ? parseFloat(value) : value;
      return new Intl.NumberFormat(currency === 'MXN' ? 'es-MX' : 'en-US', {
        style: 'currency',
        currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(num);

    case 'percentage':
      return `${value}%`;

    case 'number':
      const n = typeof value === 'string' ? parseFloat(value) : value;
      return n.toLocaleString();

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
      return '▲';
    case 'down':
      return '▼';
    case 'flat':
    default:
      return '●';
  }
}

/**
 * Get trend color class
 */
export function getTrendColor(trend: PulseTrend | undefined): string {
  switch (trend) {
    case 'up':
      return 'text-green-600';
    case 'down':
      return 'text-red-600';
    case 'flat':
    default:
      return 'text-gray-500';
  }
}

/**
 * Get the primary metric for collapsed rail view
 */
export function getPrimaryMetric(metrics: PulseMetric[]): PulseMetric | null {
  // Return the first metric as the primary one for collapsed view
  return metrics[0] || null;
}
