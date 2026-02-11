/**
 * Acceleration Hints Service
 *
 * Provides contextual intelligence and smart suggestions throughout
 * the navigation experience. This is NOT a standalone section -
 * acceleration is infused everywhere.
 *
 * Includes:
 * - Smart suggestions based on current context
 * - "Why this number" explanations for metrics
 * - Proactive alerts and recommendations
 * - Pattern-based navigation suggestions
 */

import type { UserRole } from '@/types/auth';
import type { CyclePhase, QueueItem, PulseMetric, WorkspaceId } from '@/types/navigation';

// =============================================================================
// SMART SUGGESTIONS
// =============================================================================

export interface SmartSuggestion {
  id: string;
  type: 'action' | 'insight' | 'alert' | 'tip';
  priority: 'high' | 'medium' | 'low';
  title: string;
  titleEs: string;
  description: string;
  descriptionEs: string;
  route?: string;
  icon: string;
}

/**
 * Get contextual suggestions based on current state
 */
export function getSmartSuggestions(
  role: UserRole,
  currentPhase: CyclePhase,
  pendingActions: number,
  workspace: WorkspaceId
): SmartSuggestion[] {
  const suggestions: SmartSuggestion[] = [];

  // Cycle-based suggestions
  if (currentPhase === 'import' && (role === 'admin' || role === 'vl_admin')) {
    suggestions.push({
      id: 'suggest-import',
      type: 'action',
      priority: 'high',
      title: 'Start data import',
      titleEs: 'Iniciar importación de datos',
      description: 'Begin the compensation cycle by importing transaction data',
      descriptionEs: 'Comienza el ciclo de compensación importando datos de transacciones',
      route: '/operate/import/enhanced',
      icon: 'Upload',
    });
  }

  if (currentPhase === 'calculate' && (role === 'admin' || role === 'vl_admin')) {
    suggestions.push({
      id: 'suggest-calculate',
      type: 'action',
      priority: 'high',
      title: 'Run calculations',
      titleEs: 'Ejecutar cálculos',
      description: 'Data is ready - run compensation calculations now',
      descriptionEs: 'Los datos están listos - ejecuta los cálculos de compensación',
      route: '/operate/calculate',
      icon: 'Calculator',
    });
  }

  if (pendingActions > 0 && (role === 'admin' || role === 'vl_admin' || role === 'manager')) {
    suggestions.push({
      id: 'suggest-approvals',
      type: 'alert',
      priority: pendingActions > 5 ? 'high' : 'medium',
      title: `${pendingActions} items need attention`,
      titleEs: `${pendingActions} elementos necesitan atención`,
      description: 'Review and process pending approvals',
      descriptionEs: 'Revisa y procesa las aprobaciones pendientes',
      route: '/operate/approve',
      icon: 'CheckCircle',
    });
  }

  // Role-based suggestions
  if (role === 'sales_rep' && workspace !== 'perform') {
    suggestions.push({
      id: 'suggest-compensation',
      type: 'tip',
      priority: 'low',
      title: 'Check your compensation',
      titleEs: 'Revisa tu compensación',
      description: 'View your current earnings and progress',
      descriptionEs: 'Ve tus ganancias actuales y progreso',
      route: '/perform/compensation',
      icon: 'Wallet',
    });
  }

  if (role === 'manager') {
    suggestions.push({
      id: 'suggest-team',
      type: 'insight',
      priority: 'medium',
      title: 'Team performance update',
      titleEs: 'Actualización de rendimiento del equipo',
      description: 'Your team is at 82% attainment this period',
      descriptionEs: 'Tu equipo está al 82% de cumplimiento este período',
      route: '/perform/team',
      icon: 'Users',
    });
  }

  return suggestions;
}

// =============================================================================
// METRIC EXPLANATIONS
// =============================================================================

export interface MetricExplanation {
  summary: string;
  summaryEs: string;
  factors: string[];
  factorsEs: string[];
  trend: string;
  trendEs: string;
  recommendation?: string;
  recommendationEs?: string;
}

/**
 * Get explanation for why a metric has its current value
 */
export function explainMetric(metric: PulseMetric): MetricExplanation {
  switch (metric.id) {
    case 'rep-attainment':
      return {
        summary: 'Your quota attainment based on closed deals this period',
        summaryEs: 'Tu cumplimiento de cuota basado en ventas cerradas este período',
        factors: [
          'Closed revenue: $78,000 of $100,000 target',
          'Deal count: 12 closed, 3 pending',
          'Largest deal: $15,000 (Enterprise Account)',
        ],
        factorsEs: [
          'Ingresos cerrados: $78,000 de $100,000 objetivo',
          'Conteo de ventas: 12 cerradas, 3 pendientes',
          'Mayor venta: $15,000 (Cuenta Empresarial)',
        ],
        trend: 'Up 5% from last month - strong momentum!',
        trendEs: '¡Subió 5% desde el mes pasado - buen impulso!',
        recommendation: 'Focus on closing pending deals to exceed target',
        recommendationEs: 'Enfócate en cerrar ventas pendientes para superar la meta',
      };

    case 'mgr-team-attainment':
      return {
        summary: 'Average attainment across your direct reports',
        summaryEs: 'Cumplimiento promedio de tus reportes directos',
        factors: [
          '8 of 10 reps above 70% attainment',
          'Top performer: Sarah C. at 142%',
          '2 reps need attention (below 50%)',
        ],
        factorsEs: [
          '8 de 10 vendedores arriba del 70% de cumplimiento',
          'Mejor desempeño: Sarah C. al 142%',
          '2 vendedores necesitan atención (debajo del 50%)',
        ],
        trend: 'Up 3% from last month',
        trendEs: 'Subió 3% desde el mes pasado',
        recommendation: 'Schedule 1:1s with underperforming reps',
        recommendationEs: 'Programa reuniones 1:1 con vendedores de bajo rendimiento',
      };

    case 'admin-pending-approvals':
      return {
        summary: 'Items awaiting your approval decision',
        summaryEs: 'Elementos esperando tu decisión de aprobación',
        factors: [
          '5 compensation adjustments',
          '4 plan amendments',
          '3 exception requests',
        ],
        factorsEs: [
          '5 ajustes de compensación',
          '4 modificaciones de plan',
          '3 solicitudes de excepción',
        ],
        trend: 'Down 3 from yesterday - good progress',
        trendEs: 'Bajó 3 desde ayer - buen progreso',
        recommendation: 'Prioritize high-value adjustments first',
        recommendationEs: 'Prioriza ajustes de alto valor primero',
      };

    default:
      return {
        summary: 'Metric calculated from system data',
        summaryEs: 'Métrica calculada de datos del sistema',
        factors: ['Based on current period data'],
        factorsEs: ['Basado en datos del período actual'],
        trend: 'Tracking normally',
        trendEs: 'Seguimiento normal',
      };
  }
}

// =============================================================================
// PROACTIVE ALERTS
// =============================================================================

export interface ProactiveAlert {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  titleEs: string;
  message: string;
  messageEs: string;
  action?: {
    label: string;
    labelEs: string;
    route: string;
  };
  dismissible: boolean;
}

/**
 * Get proactive alerts based on system state
 */
export function getProactiveAlerts(
  role: UserRole,
  cyclePhase: CyclePhase,
  queueItems: QueueItem[]
): ProactiveAlert[] {
  const alerts: ProactiveAlert[] = [];

  // Critical queue items
  const criticalItems = queueItems.filter(i => i.urgency === 'critical');
  if (criticalItems.length > 0 && (role === 'admin' || role === 'vl_admin')) {
    alerts.push({
      id: 'alert-critical-queue',
      severity: 'critical',
      title: `${criticalItems.length} critical items`,
      titleEs: `${criticalItems.length} elementos críticos`,
      message: 'These require immediate attention',
      messageEs: 'Estos requieren atención inmediata',
      action: {
        label: 'View now',
        labelEs: 'Ver ahora',
        route: '/operate/approve',
      },
      dismissible: false,
    });
  }

  // Cycle deadline approaching
  const now = new Date();
  const dayOfMonth = now.getDate();
  if (dayOfMonth >= 25 && cyclePhase !== 'closed' && (role === 'admin' || role === 'vl_admin')) {
    alerts.push({
      id: 'alert-cycle-deadline',
      severity: 'warning',
      title: 'Month-end approaching',
      titleEs: 'Fin de mes se acerca',
      message: `Cycle at ${cyclePhase} phase - ${30 - dayOfMonth} days remaining`,
      messageEs: `Ciclo en fase ${cyclePhase} - ${30 - dayOfMonth} días restantes`,
      action: {
        label: 'View cycle',
        labelEs: 'Ver ciclo',
        route: '/operate',
      },
      dismissible: true,
    });
  }

  // Data quality issues
  const dataQualityItems = queueItems.filter(i => i.type === 'data_quality');
  if (dataQualityItems.length > 0 && (role === 'admin' || role === 'vl_admin')) {
    alerts.push({
      id: 'alert-data-quality',
      severity: 'warning',
      title: 'Data quality issues detected',
      titleEs: 'Problemas de calidad de datos detectados',
      message: `${dataQualityItems.length} records need review`,
      messageEs: `${dataQualityItems.length} registros necesitan revisión`,
      action: {
        label: 'Review issues',
        labelEs: 'Revisar problemas',
        route: '/operate/monitor/quality',
      },
      dismissible: true,
    });
  }

  return alerts;
}

// =============================================================================
// NAVIGATION PATTERNS
// =============================================================================

/**
 * Get recommended next action based on navigation history
 */
export function getRecommendedNextAction(
  currentPath: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  role: UserRole
): { route: string; label: string; labelEs: string } | null {
  // Common navigation patterns
  const patterns: Record<string, { route: string; label: string; labelEs: string }> = {
    '/operate/import': {
      route: '/operate/calculate',
      label: 'Run calculations',
      labelEs: 'Ejecutar cálculos',
    },
    '/operate/calculate': {
      route: '/operate/reconcile',
      label: 'Review reconciliation',
      labelEs: 'Revisar conciliación',
    },
    '/operate/reconcile': {
      route: '/operate/approve',
      label: 'Process approvals',
      labelEs: 'Procesar aprobaciones',
    },
    '/perform/compensation': {
      route: '/perform/transactions',
      label: 'View transactions',
      labelEs: 'Ver transacciones',
    },
    '/design/plans': {
      route: '/design/modeling',
      label: 'Test in sandbox',
      labelEs: 'Probar en sandbox',
    },
  };

  return patterns[currentPath] || null;
}
