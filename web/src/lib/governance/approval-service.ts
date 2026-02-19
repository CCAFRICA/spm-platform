/**
 * Approval Service
 *
 * Manages approval items for calculation cycles. Enforces separation of duties
 * (submitter cannot approve). Integrates with AI risk assessment via AIService.
 *
 * All labels and fields are dynamic -- zero hardcoded component or plan names.
 */

import { getAIService } from '@/lib/ai/ai-service';
import { createClient } from '@/lib/supabase/client';
import type { Json } from '@/lib/supabase/database.types';

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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
 * List approval items for a tenant from Supabase calculation_batches.
 * Reads PENDING_APPROVAL + recently APPROVED/REJECTED batches.
 */
export async function listApprovalItemsAsync(tenantId: string): Promise<ApprovalItem[]> {
  const supabase = createClient();

  const { data: batches } = await supabase
    .from('calculation_batches')
    .select('id, period_id, lifecycle_state, entity_count, summary, created_at')
    .eq('tenant_id', tenantId)
    .in('lifecycle_state', ['PENDING_APPROVAL', 'APPROVED', 'REJECTED'])
    .order('created_at', { ascending: false })
    .limit(20);

  if (!batches || batches.length === 0) return [];

  // Resolve period keys
  const periodIds = Array.from(new Set(batches.map(b => b.period_id).filter(Boolean))) as string[];
  const periodMap = new Map<string, string>();
  if (periodIds.length > 0) {
    const { data: periods } = await supabase
      .from('periods')
      .select('id, canonical_key, label')
      .in('id', periodIds);
    for (const p of (periods ?? [])) {
      periodMap.set(p.id, p.label || p.canonical_key);
    }
  }

  return batches.map(batch => {
    const summary = (batch.summary ?? {}) as Record<string, Json | undefined>;
    const status: ApprovalItem['status'] =
      batch.lifecycle_state === 'PENDING_APPROVAL' ? 'pending' :
      batch.lifecycle_state === 'APPROVED' ? 'approved' : 'rejected';

    return {
      itemId: batch.id,
      tenantId,
      type: 'calculation_approval' as const,
      cycleId: batch.id,
      period: periodMap.get(batch.period_id) ?? batch.period_id,
      submittedBy: (summary.submittedBy as string) ?? 'Unknown',
      submittedAt: (summary.submittedAt as string) ?? batch.created_at,
      status,
      summary: {
        totalPayout: (summary.total_payout as number) ?? (summary.totalPayout as number) ?? 0,
        entityCount: batch.entity_count ?? 0,
        componentTotals: (summary.componentTotals as Record<string, number>) ?? {},
      },
      resolution: status !== 'pending' ? {
        resolvedBy: (summary.approvedBy as string) ?? (summary.rejectedBy as string) ?? 'Unknown',
        resolvedAt: (summary.approvedAt as string) ?? (summary.rejectedAt as string) ?? '',
        action: status as 'approved' | 'rejected',
        comments: (summary.approvalComments as string) ?? (summary.rejectionReason as string) ?? '',
      } : undefined,
    };
  });
}

/**
 * Synchronous compatibility wrapper (returns empty, use listApprovalItemsAsync).
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function listApprovalItems(_tenantId: string): ApprovalItem[] {
  return []; // Use listApprovalItemsAsync for Supabase data
}

/**
 * Save is handled via lifecycle transitions — no separate persistence needed.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function saveApprovalItem(_item: ApprovalItem): void {
  // Persistence handled by transitionBatchLifecycle in calculation-service
}

/**
 * Get a single approval item by ID.
 */
export async function getApprovalItemAsync(tenantId: string, batchId: string): Promise<ApprovalItem | null> {
  const items = await listApprovalItemsAsync(tenantId);
  return items.find(i => i.itemId === batchId) ?? null;
}
