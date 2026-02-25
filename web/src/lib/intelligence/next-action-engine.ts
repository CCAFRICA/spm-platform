/**
 * Next-Action Engine — Context-aware recommendations
 *
 * OB-98 Phase 6: After each lifecycle event, surface the logical next step.
 * Pure function: context in → NextAction out.
 *
 * Korean Test: zero hardcoded domain terms. All labels are generic.
 */

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface NextAction {
  id: string;
  icon: string;       // lucide icon name
  message: string;    // human-readable recommendation
  actionLabel: string; // button/link text
  actionRoute: string; // navigation target
  priority: 'info' | 'action' | 'success';
}

export interface NextActionContext {
  persona: 'admin' | 'manager' | 'rep';
  lifecycleState: string | null;
  hasCalculationResults: boolean;
  hasReconciliation: boolean;
  reconciliationMatch: number | null; // 0-100 percent
  anomalyCount: number;
  entityCount: number;
  repAttainment?: number;
  repBestOpportunityComponent?: string;
  repBestOpportunityGap?: string;
}

// ──────────────────────────────────────────────
// Engine
// ──────────────────────────────────────────────

export function computeNextAction(ctx: NextActionContext): NextAction | null {
  const { persona, lifecycleState, hasCalculationResults, hasReconciliation, reconciliationMatch, anomalyCount } = ctx;
  const state = (lifecycleState || '').toUpperCase();

  // ── Admin / Manager: lifecycle-driven recommendations ──
  if (persona === 'admin' || persona === 'manager') {
    // No calculation results at all
    if (!hasCalculationResults) {
      return {
        id: 'na-no-data',
        icon: 'PlayCircle',
        message: 'Data is ready. Run a calculation to generate results for this period.',
        actionLabel: 'Run Calculation',
        actionRoute: '/operate',
        priority: 'action',
      };
    }

    // Draft or Preview — calculation done but not yet reconciled
    if (state === 'DRAFT' || state === 'PREVIEW') {
      if (anomalyCount > 0) {
        return {
          id: 'na-review-anomalies',
          icon: 'AlertTriangle',
          message: `Calculation complete. ${anomalyCount} anomal${anomalyCount === 1 ? 'y' : 'ies'} detected — review before advancing.`,
          actionLabel: 'Review Results',
          actionRoute: '/operate/results',
          priority: 'action',
        };
      }
      return {
        id: 'na-run-reconciliation',
        icon: 'CheckSquare',
        message: 'Calculation complete. Validate accuracy by uploading a benchmark file.',
        actionLabel: 'Run Reconciliation',
        actionRoute: '/operate/reconciliation',
        priority: 'action',
      };
    }

    // Reconcile state
    if (state === 'RECONCILE') {
      if (hasReconciliation && reconciliationMatch !== null) {
        if (reconciliationMatch >= 100) {
          return {
            id: 'na-reconciled-perfect',
            icon: 'CheckCircle',
            message: 'Reconciliation complete — 100% match. Ready to advance to official.',
            actionLabel: 'Advance Lifecycle',
            actionRoute: '/operate',
            priority: 'success',
          };
        }
        return {
          id: 'na-reconciled-delta',
          icon: 'AlertCircle',
          message: `Reconciliation shows ${reconciliationMatch.toFixed(1)}% match. Review component-level deltas.`,
          actionLabel: 'Review Reconciliation',
          actionRoute: '/operate/reconciliation',
          priority: 'action',
        };
      }
      return {
        id: 'na-need-reconciliation',
        icon: 'Upload',
        message: 'Upload a benchmark file to validate calculation accuracy.',
        actionLabel: 'Upload Benchmark',
        actionRoute: '/operate/reconciliation',
        priority: 'action',
      };
    }

    // Official or later — results are published
    if (state === 'OFFICIAL' || state === 'PENDING_APPROVAL') {
      return {
        id: 'na-pending-approval',
        icon: 'Clock',
        message: 'Results are official. Awaiting approval to proceed.',
        actionLabel: 'View Status',
        actionRoute: '/operate',
        priority: 'info',
      };
    }

    if (state === 'APPROVED') {
      return {
        id: 'na-post-results',
        icon: 'Send',
        message: 'Results approved. Post to make visible to all participants.',
        actionLabel: 'Post Results',
        actionRoute: '/operate',
        priority: 'action',
      };
    }

    if (state === 'POSTED' || state === 'PUBLISHED') {
      return {
        id: 'na-published',
        icon: 'CheckCircle2',
        message: 'Results published and visible to all participants.',
        actionLabel: 'View Dashboard',
        actionRoute: '/perform',
        priority: 'success',
      };
    }
  }

  // ── Rep: performance-driven recommendations ──
  if (persona === 'rep') {
    if (!hasCalculationResults) {
      return {
        id: 'na-rep-no-data',
        icon: 'Clock',
        message: 'Your results for this period are not yet available.',
        actionLabel: 'View Compensation',
        actionRoute: '/perform/compensation',
        priority: 'info',
      };
    }

    if (ctx.repAttainment !== undefined && ctx.repAttainment < 100 && ctx.repBestOpportunityComponent) {
      return {
        id: 'na-rep-opportunity',
        icon: 'Target',
        message: `Focus: ${ctx.repBestOpportunityGap || 'close the gap'} in ${ctx.repBestOpportunityComponent} to reach the next tier.`,
        actionLabel: 'View Trajectory',
        actionRoute: '/perform',
        priority: 'action',
      };
    }

    if (ctx.repAttainment !== undefined && ctx.repAttainment >= 100) {
      return {
        id: 'na-rep-on-target',
        icon: 'Star',
        message: `You're at ${ctx.repAttainment.toFixed(0)}% attainment — above target. Look for accelerator opportunities.`,
        actionLabel: 'View Components',
        actionRoute: '/perform',
        priority: 'success',
      };
    }
  }

  return null;
}
