/**
 * Agent Registry — Declarative Agent Definitions
 *
 * Each agent:
 *   - Has a unique ID and description
 *   - Declares which event types it observes
 *   - Implements an evaluate() function that returns AgentAction[]
 *
 * Agents are pure functions: given context, return actions.
 */

import type { AgentDefinition, AgentContext, AgentAction } from './types';
import type { PlatformEventType } from '@/lib/events/emitter';

// ---------------------------------------------------------------------------
// 1. Compensation Agent
// ---------------------------------------------------------------------------

const compensationAgent: AgentDefinition = {
  id: 'compensation',
  name: 'Compensation Agent',
  description: 'Monitors calculation accuracy, detects outliers, flags anomalies',
  observes: [
    'calculation.completed',
    'calculation.outlier_detected',
    'data.committed',
    'lifecycle.advanced',
  ],
  enabled: true,

  async evaluate(ctx: AgentContext): Promise<AgentAction[]> {
    const actions: AgentAction[] = [];
    const calcEvents = ctx.recentEvents.filter(e => e.event_type === 'calculation.completed');

    if (calcEvents.length > 0) {
      const latest = calcEvents[0];
      const entityCount = (latest.payload?.entity_count as number) || 0;
      const outlierCount = (latest.payload?.outlier_count as number) || 0;

      // Flag if outlier ratio > 10%
      if (entityCount > 0 && outlierCount > 0 && (outlierCount / entityCount) > 0.10) {
        actions.push({
          agentId: 'compensation',
          type: 'alert',
          title: `${outlierCount} outliers detected in latest calculation`,
          description: `${Math.round((outlierCount / entityCount) * 100)}% of ${entityCount} entities flagged as outliers. Review recommended before advancing lifecycle.`,
          severity: 'warning',
          actionUrl: '/investigate',
          actionLabel: 'Review Outliers',
          persona: 'admin',
        });
      }

      // Info: calculation completed
      if (entityCount > 0) {
        actions.push({
          agentId: 'compensation',
          type: 'insight',
          title: 'Calculation completed successfully',
          description: `Processed ${entityCount} entities. Ready for reconciliation review.`,
          severity: 'info',
          actionUrl: '/investigate/reconciliation',
          actionLabel: 'View Reconciliation',
          persona: 'admin',
        });
      }
    }

    // Check for data.committed without subsequent calculation
    const dataEvents = ctx.recentEvents.filter(e => e.event_type === 'data.committed');
    if (dataEvents.length > 0 && calcEvents.length === 0) {
      actions.push({
        agentId: 'compensation',
        type: 'recommendation',
        title: 'New data committed — calculation pending',
        description: 'Data has been committed but no calculation has been run yet. Consider running a calculation to ensure results are current.',
        severity: 'info',
        actionUrl: '/operate/calculate',
        actionLabel: 'Run Calculation',
        persona: 'admin',
      });
    }

    return actions;
  },
};

// ---------------------------------------------------------------------------
// 2. Coaching Agent
// ---------------------------------------------------------------------------

const coachingAgent: AgentDefinition = {
  id: 'coaching',
  name: 'Coaching Agent',
  description: 'Surfaces performance patterns for managers to act on',
  observes: ['calculation.completed', 'data.committed'],
  enabled: true,

  async evaluate(ctx: AgentContext): Promise<AgentAction[]> {
    const actions: AgentAction[] = [];
    const calcEvents = ctx.recentEvents.filter(e => e.event_type === 'calculation.completed');

    if (calcEvents.length > 0) {
      actions.push({
        agentId: 'coaching',
        type: 'insight',
        title: 'New results available for team review',
        description: 'Latest calculation results are ready. Review your team\'s performance and identify coaching opportunities.',
        severity: 'info',
        actionUrl: '/',
        actionLabel: 'View Team Dashboard',
        persona: 'manager',
      });
    }

    return actions;
  },
};

// ---------------------------------------------------------------------------
// 3. Resolution Agent
// ---------------------------------------------------------------------------

const resolutionAgent: AgentDefinition = {
  id: 'resolution',
  name: 'Resolution Agent',
  description: 'Pre-screens disputes and suggests resolutions',
  observes: ['dispute.submitted', 'calculation.completed'],
  enabled: true,

  async evaluate(ctx: AgentContext): Promise<AgentAction[]> {
    const actions: AgentAction[] = [];
    const disputeEvents = ctx.recentEvents.filter(e => e.event_type === 'dispute.submitted');

    if (disputeEvents.length > 0) {
      actions.push({
        agentId: 'resolution',
        type: 'action_required',
        title: `${disputeEvents.length} new dispute${disputeEvents.length > 1 ? 's' : ''} submitted`,
        description: 'Review submitted disputes and take action. Early resolution reduces cycle time.',
        severity: disputeEvents.length > 3 ? 'critical' : 'warning',
        actionUrl: '/govern',
        actionLabel: 'Review Disputes',
        persona: 'admin',
      });
    }

    return actions;
  },
};

// ---------------------------------------------------------------------------
// 4. Compliance Agent
// ---------------------------------------------------------------------------

const complianceAgent: AgentDefinition = {
  id: 'compliance',
  name: 'Compliance Agent',
  description: 'Validates audit trails, flags separation-of-duty violations',
  observes: [
    'lifecycle.advanced',
    'lifecycle.approved',
    'lifecycle.approval_requested',
  ],
  enabled: true,

  async evaluate(ctx: AgentContext): Promise<AgentAction[]> {
    const actions: AgentAction[] = [];
    const lifecycleEvents = ctx.recentEvents.filter(e =>
      e.event_type === 'lifecycle.advanced' || e.event_type === 'lifecycle.approved'
    );

    // Check for same-user advance + approve (SOD violation)
    const advancers = new Set(lifecycleEvents.filter(e => e.event_type === 'lifecycle.advanced').map(e => e.actor_id));
    const approvers = new Set(lifecycleEvents.filter(e => e.event_type === 'lifecycle.approved').map(e => e.actor_id));

    const sodViolations = Array.from(advancers).filter(a => a && approvers.has(a));
    if (sodViolations.length > 0) {
      actions.push({
        agentId: 'compliance',
        type: 'alert',
        title: 'Separation of Duty concern detected',
        description: `The same user advanced and approved the lifecycle. This may violate SOD controls. Review audit trail.`,
        severity: 'critical',
        actionUrl: '/admin/audit',
        actionLabel: 'View Audit Trail',
        persona: 'admin',
      });
    }

    return actions;
  },
};

// ---------------------------------------------------------------------------
// 5. Expansion Agent
// ---------------------------------------------------------------------------

const expansionAgent: AgentDefinition = {
  id: 'expansion',
  name: 'Expansion Agent',
  description: 'Detects usage patterns suggesting readiness for upgrades or new modules',
  observes: [
    'calculation.completed',
    'user.feature_used',
    'data.committed',
    'user.first_login',
  ],
  enabled: true,

  async evaluate(ctx: AgentContext): Promise<AgentAction[]> {
    const actions: AgentAction[] = [];
    const billing = (ctx.tenantSettings.billing || {}) as Record<string, unknown>;
    const currentTier = (billing.tier as string) || 'free';
    const currentModules = (billing.modules as string[]) || [];

    // Signal 1: Entity count approaching tier limit (80%)
    const calcEvents = ctx.recentEvents.filter(e => e.event_type === 'calculation.completed');
    if (calcEvents.length > 0) {
      const latestCalc = calcEvents[0];
      const entityCount = (latestCalc.payload?.entity_count as number) || 0;

      const tierLimits: Record<string, number> = {
        free: 10, inicio: 50, crecimiento: 200, profesional: 1000, empresarial: 10000,
      };
      const limit = tierLimits[currentTier] || 50;

      if (entityCount > 0 && entityCount >= limit * 0.8) {
        const tierNames: Record<string, string> = {
          free: 'Inicio', inicio: 'Crecimiento', crecimiento: 'Profesional', profesional: 'Empresarial',
        };
        const nextTier = tierNames[currentTier];
        if (nextTier) {
          actions.push({
            agentId: 'expansion',
            type: 'recommendation',
            title: `Approaching ${currentTier} entity limit`,
            description: `You're using ${entityCount} of ${limit} entities (${Math.round((entityCount / limit) * 100)}%). Consider upgrading to ${nextTier} for room to grow.`,
            severity: entityCount >= limit * 0.95 ? 'warning' : 'info',
            actionUrl: '/upgrade',
            actionLabel: 'View Plans',
            persona: 'admin',
          });
        }
      }

      // Signal 2: Multiple calculations but no Manager module
      if (calcEvents.length >= 3 && !currentModules.includes('manager')) {
        actions.push({
          agentId: 'expansion',
          type: 'recommendation',
          title: 'Unlock Coaching for your managers',
          description: `You've run ${calcEvents.length} calculations. The Manager Acceleration module gives your managers coaching insights and 1:1 preparation tools.`,
          severity: 'info',
          actionUrl: '/upgrade',
          actionLabel: 'Add Module',
          persona: 'admin',
        });
      }
    }

    // Signal 3: Many active users but no Dispute module
    const userEvents = ctx.recentEvents.filter(e => e.event_type === 'user.first_login');
    const uniqueUsers = new Set(userEvents.map(e => e.actor_id).filter(Boolean));
    if (uniqueUsers.size >= 5 && !currentModules.includes('dispute')) {
      actions.push({
        agentId: 'expansion',
        type: 'recommendation',
        title: 'Consider Dispute Resolution',
        description: `You have ${uniqueUsers.size} active users. The Dispute Resolution module provides structured workflows for commission inquiries.`,
        severity: 'info',
        actionUrl: '/upgrade',
        actionLabel: 'Add Module',
        persona: 'admin',
      });
    }

    return actions;
  },
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const AGENTS: AgentDefinition[] = [
  compensationAgent,
  coachingAgent,
  resolutionAgent,
  complianceAgent,
  expansionAgent,
];

export function getAgent(agentId: string): AgentDefinition | undefined {
  return AGENTS.find(a => a.id === agentId);
}

export function getAgentsForEvent(eventType: string): AgentDefinition[] {
  return AGENTS.filter(a => a.enabled && a.observes.includes(eventType as PlatformEventType));
}

export function getAllAgents(): AgentDefinition[] {
  return AGENTS;
}
