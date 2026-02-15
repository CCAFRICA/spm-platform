/**
 * Approval Service
 *
 * Manages approval items for calculation cycles. Enforces separation of duties
 * (submitter cannot approve). Integrates with AI risk assessment via AIService.
 *
 * All labels and fields are dynamic -- zero hardcoded component or plan names.
 */

import { getAIService } from '@/lib/ai/ai-service';

export interface ApprovalItem {
  itemId: string;
  tenantId: string;
  type: 'calculation_approval';
  cycleId: string;
  period: string;
  submittedBy: string;
  submittedAt: string;
  status: 'pending' | 'approved' | 'rejected';
  summary: {
    totalPayout: number;
    entityCount: number;
    componentTotals: Record<string, number>;
    aiBriefing?: string;
    riskAssessment?: RiskAssessment;
  };
  resolution?: {
    resolvedBy: string;
    resolvedAt: string;
    action: 'approved' | 'rejected';
    comments: string;
  };
}

export interface RiskAssessment {
  riskLevel: 'LOW' | 'MODERATE' | 'HIGH';
  observations: RiskObservation[];
  generatedAt: string;
  aiAvailable: boolean;
}

export interface RiskObservation {
  category: string;
  finding: string;
  severity: 'info' | 'warning' | 'critical';
  recommendation: string;
}

const APPROVAL_PREFIX = 'vialuce_approvals_';

/**
 * Create a new approval item.
 */
export function createApprovalItem(
  tenantId: string,
  cycleId: string,
  period: string,
  submittedBy: string,
  summary: ApprovalItem['summary']
): ApprovalItem {
  const item: ApprovalItem = {
    itemId: `approval-${cycleId}-${Date.now()}`,
    tenantId,
    type: 'calculation_approval',
    cycleId,
    period,
    submittedBy,
    submittedAt: new Date().toISOString(),
    status: 'pending',
    summary,
  };
  saveApprovalItem(item);
  return item;
}

/**
 * Resolve an approval item (approve or reject).
 * Enforces separation of duties.
 */
export function resolveApproval(
  item: ApprovalItem,
  resolvedBy: string,
  action: 'approved' | 'rejected',
  comments: string
): ApprovalItem {
  if (resolvedBy === item.submittedBy) {
    throw new Error('Approval requires a different user than the submitter (separation of duties).');
  }
  if (item.status !== 'pending') {
    throw new Error(`Cannot resolve approval in ${item.status} state.`);
  }

  const updated: ApprovalItem = {
    ...item,
    status: action,
    resolution: {
      resolvedBy,
      resolvedAt: new Date().toISOString(),
      action,
      comments,
    },
  };
  saveApprovalItem(updated);
  return updated;
}

/**
 * Generate AI risk assessment for an approval submission.
 * Captures training signal. Degrades gracefully if AI unavailable.
 */
export async function generateRiskAssessment(
  summary: ApprovalItem['summary'],
  tenantId: string
): Promise<RiskAssessment> {
  try {
    const aiService = getAIService();
    const response = await aiService.execute(
      {
        task: 'recommendation',
        input: {
          analysisData: {
            totalPayout: summary.totalPayout,
            entityCount: summary.entityCount,
            componentTotals: summary.componentTotals,
          },
          context: {
            type: 'approval_risk_assessment',
            instructions: [
              'Assess the risk of approving this compensation calculation.',
              'Identify: large period-over-period changes, component concentration,',
              'unexpected zero-payout populations, and positive confirmations.',
              'Return a risk level (LOW, MODERATE, HIGH) and 2-4 observations.',
              'Each observation: category, finding, severity, recommendation.',
            ].join(' '),
          },
        },
        options: { responseFormat: 'json' },
      },
      true,
      { tenantId, userId: 'system' }
    );

    // Parse AI response
    const result = response.result as Record<string, unknown> | undefined;
    if (result) {
      return {
        riskLevel: (result.riskLevel as string || 'MODERATE') as RiskAssessment['riskLevel'],
        observations: Array.isArray(result.observations)
          ? result.observations.map((o: Record<string, unknown>) => ({
              category: String(o.category || 'General'),
              finding: String(o.finding || ''),
              severity: (o.severity as 'info' | 'warning' | 'critical') || 'info',
              recommendation: String(o.recommendation || ''),
            }))
          : [{
              category: 'General',
              finding: 'AI analysis completed',
              severity: 'info' as const,
              recommendation: 'Review the summary cards before approving.',
            }],
        generatedAt: new Date().toISOString(),
        aiAvailable: true,
      };
    }
    throw new Error('No result from AI');
  } catch (error) {
    console.warn('[Approval] AI risk assessment failed (non-fatal):', error);
    return {
      riskLevel: 'MODERATE',
      observations: [{
        category: 'System',
        finding: 'AI risk assessment unavailable',
        severity: 'warning',
        recommendation: 'Review manually before approving.',
      }],
      generatedAt: new Date().toISOString(),
      aiAvailable: false,
    };
  }
}

/**
 * List pending approval items for a tenant.
 */
export function listApprovalItems(tenantId: string, status?: string): ApprovalItem[] {
  if (typeof window === 'undefined') return [];
  const key = `${APPROVAL_PREFIX}${tenantId}`;
  const stored = localStorage.getItem(key);
  if (!stored) return [];
  try {
    const items: ApprovalItem[] = JSON.parse(stored);
    if (status) return items.filter(i => i.status === status);
    return items;
  } catch {
    return [];
  }
}

/**
 * Save an approval item.
 */
function saveApprovalItem(item: ApprovalItem): void {
  if (typeof window === 'undefined') return;
  const key = `${APPROVAL_PREFIX}${item.tenantId}`;
  const stored = localStorage.getItem(key);
  let items: ApprovalItem[] = [];
  if (stored) {
    try {
      items = JSON.parse(stored);
    } catch { /* reset */ }
  }
  const idx = items.findIndex(i => i.itemId === item.itemId);
  if (idx >= 0) {
    items[idx] = item;
  } else {
    items.push(item);
  }
  localStorage.setItem(key, JSON.stringify(items));
}

/**
 * Get a single approval item by ID.
 */
export function getApprovalItem(tenantId: string, itemId: string): ApprovalItem | null {
  const items = listApprovalItems(tenantId);
  return items.find(i => i.itemId === itemId) || null;
}
