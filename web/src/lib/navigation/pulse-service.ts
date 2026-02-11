/**
 * Pulse Service
 *
 * Provides role-aware key metrics for the Pulse section of Mission Control.
 * Each role sees metrics relevant to their responsibilities.
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
  currency: string = 'USD'
): PulseMetric[] {
  switch (role) {
    case 'sales_rep':
      return getRepMetrics(userId, tenantId, currency);
    case 'manager':
      return getManagerMetrics(userId, tenantId, currency);
    case 'admin':
      return getAdminMetrics(tenantId, currency);
    case 'vl_admin':
      return getCCAdminMetrics();
    default:
      return [];
  }
}

// =============================================================================
// ROLE-SPECIFIC METRICS
// =============================================================================

function getRepMetrics(userId: string, tenantId: string, currency: string): PulseMetric[] {
  // In a real implementation, these would come from actual data sources
  const currencySymbol = currency === 'MXN' ? '$' : '$';

  return [
    {
      id: 'rep-attainment',
      label: 'Attainment',
      labelEs: 'Cumplimiento',
      value: 78,
      format: 'percentage',
      trend: 'up',
      trendValue: '+5% vs. last month',
      trendValueEs: '+5% vs. mes anterior',
      roles: ['sales_rep'],
      route: '/perform/compensation',
    },
    {
      id: 'rep-earnings',
      label: 'Current Earnings',
      labelEs: 'Ganancias Actuales',
      value: currency === 'MXN' ? 45680 : 3240,
      format: 'currency',
      trend: 'up',
      trendValue: currency === 'MXN' ? `+${currencySymbol}8,200 MTD` : `+${currencySymbol}580 MTD`,
      trendValueEs: currency === 'MXN' ? `+${currencySymbol}8,200 este mes` : `+${currencySymbol}580 este mes`,
      roles: ['sales_rep'],
      route: '/perform/compensation',
    },
    {
      id: 'rep-goal-progress',
      label: 'Goal Progress',
      labelEs: 'Progreso de Meta',
      value: '4 of 5',
      format: 'text',
      roles: ['sales_rep'],
      route: '/perform/dashboard',
    },
    {
      id: 'rep-rank',
      label: 'Team Rank',
      labelEs: 'Posición en Equipo',
      value: '#3',
      format: 'text',
      trend: 'up',
      trendValue: 'Up 2 spots',
      trendValueEs: 'Subió 2 posiciones',
      roles: ['sales_rep'],
      route: '/perform/team/rankings',
    },
  ];
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getManagerMetrics(userId: string, tenantId: string, currency: string): PulseMetric[] {
  return [
    {
      id: 'mgr-team-attainment',
      label: 'Team Attainment',
      labelEs: 'Cumplimiento del Equipo',
      value: 82,
      format: 'percentage',
      trend: 'up',
      trendValue: '+3% vs. last month',
      trendValueEs: '+3% vs. mes anterior',
      roles: ['manager'],
      route: '/perform/team',
    },
    {
      id: 'mgr-team-payout',
      label: 'Team Payout',
      labelEs: 'Pago del Equipo',
      value: currency === 'MXN' ? 524000 : 124000,
      format: 'currency',
      trend: 'flat',
      trendValue: 'On budget',
      trendValueEs: 'En presupuesto',
      roles: ['manager'],
      route: '/perform/team',
    },
    {
      id: 'mgr-exceptions',
      label: 'Exceptions',
      labelEs: 'Excepciones',
      value: 3,
      format: 'number',
      trend: 'down',
      trendValue: '-2 from last week',
      trendValueEs: '-2 desde la semana pasada',
      roles: ['manager'],
      route: '/investigate/disputes',
    },
    {
      id: 'mgr-top-performer',
      label: 'Top Performer',
      labelEs: 'Mejor Rendimiento',
      value: 'Sarah C. (142%)',
      format: 'text',
      roles: ['manager'],
      route: '/perform/team/rankings',
    },
  ];
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getAdminMetrics(tenantId: string, currency: string): PulseMetric[] {
  return [
    {
      id: 'admin-cycle-progress',
      label: 'Cycle Progress',
      labelEs: 'Progreso del Ciclo',
      value: 60,
      format: 'percentage',
      roles: ['admin'],
      route: '/operate',
    },
    {
      id: 'admin-pending-approvals',
      label: 'Pending Approvals',
      labelEs: 'Aprobaciones Pendientes',
      value: 12,
      format: 'number',
      trend: 'down',
      trendValue: '-3 from yesterday',
      trendValueEs: '-3 desde ayer',
      roles: ['admin'],
      route: '/operate/approve',
    },
    {
      id: 'admin-data-freshness',
      label: 'Data Freshness',
      labelEs: 'Frescura de Datos',
      value: '2h ago',
      format: 'text',
      roles: ['admin'],
      route: '/operate/monitor/readiness',
    },
    {
      id: 'admin-quality-score',
      label: 'Data Quality',
      labelEs: 'Calidad de Datos',
      value: 94,
      format: 'percentage',
      trend: 'up',
      trendValue: '+2% this period',
      trendValueEs: '+2% este período',
      roles: ['admin'],
      route: '/operate/monitor/quality',
    },
  ];
}

function getCCAdminMetrics(): PulseMetric[] {
  return [
    {
      id: 'cc-active-tenants',
      label: 'Active Tenants',
      labelEs: 'Tenants Activos',
      value: 4,
      format: 'number',
      roles: ['vl_admin'],
    },
    {
      id: 'cc-total-users',
      label: 'Total Users',
      labelEs: 'Usuarios Totales',
      value: 156,
      format: 'number',
      trend: 'up',
      trendValue: '+12 this month',
      trendValueEs: '+12 este mes',
      roles: ['vl_admin'],
    },
    {
      id: 'cc-calculations-today',
      label: 'Calculations Today',
      labelEs: 'Cálculos Hoy',
      value: 8,
      format: 'number',
      roles: ['vl_admin'],
    },
    {
      id: 'cc-issues',
      label: 'Outstanding Issues',
      labelEs: 'Problemas Pendientes',
      value: 2,
      format: 'number',
      trend: 'down',
      trendValue: '-5 from last week',
      trendValueEs: '-5 desde la semana pasada',
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
