/**
 * Reconciliation Bridge
 *
 * Connects the reconciliation engine to UI components and dispute resolution workflow.
 * Provides hooks, state management, and persistence for reconciliation sessions.
 */

import type {
  ReconciliationSession,
  ReconciliationSummary,
  ReconciliationItem,
  ReconciliationRule,
  MatchStatus,
} from '@/types/reconciliation';
import { getOrchestrator, getPeriodResults } from '@/lib/orchestration/calculation-orchestrator';
import { formatForReconciliation } from '@/lib/calculation/results-formatter';

// ============================================
// STORAGE KEYS
// ============================================

const STORAGE_KEYS = {
  SESSIONS: 'vialuce_reconciliation_sessions',
  ITEMS: 'vialuce_reconciliation_items',
  DISPUTES: 'vialuce_reconciliation_disputes',
  RESOLUTIONS: 'vialuce_reconciliation_resolutions',
} as const;

// ============================================
// DISPUTE TYPES
// ============================================

export type DisputeStatus =
  | 'open'
  | 'under_review'
  | 'awaiting_info'
  | 'resolved_accepted'
  | 'resolved_rejected'
  | 'escalated'
  | 'withdrawn';

export type DisputeCategory =
  | 'amount_discrepancy'
  | 'missing_transaction'
  | 'duplicate_transaction'
  | 'wrong_attribution'
  | 'rate_mismatch'
  | 'timing_issue'
  | 'other';

export interface Dispute {
  id: string;
  tenantId: string;
  sessionId: string;
  itemId: string;

  // Submitter info
  submittedBy: string;
  submittedAt: string;
  employeeId: string;
  employeeName: string;

  // Dispute details
  category: DisputeCategory;
  description: string;
  expectedAmount: number;
  actualAmount: number;
  discrepancyAmount: number;

  // Supporting evidence
  attachments?: string[];
  transactionIds?: string[];

  // Status tracking
  status: DisputeStatus;
  priority: 'low' | 'medium' | 'high' | 'critical';
  assignedTo?: string;
  dueDate?: string;

  // Resolution
  resolution?: DisputeResolution;

  // History
  history: DisputeHistoryEntry[];
  updatedAt: string;
}

export interface DisputeResolution {
  resolvedBy: string;
  resolvedAt: string;
  outcome: 'accepted' | 'partially_accepted' | 'rejected';
  adjustmentAmount?: number;
  explanation: string;
  affectedPeriods?: string[];
}

export interface DisputeHistoryEntry {
  action: string;
  performedBy: string;
  performedAt: string;
  details?: string;
  previousStatus?: DisputeStatus;
  newStatus?: DisputeStatus;
}

// ============================================
// EXTENDED SESSION (with items)
// ============================================

export interface ExtendedReconciliationSession extends ReconciliationSession {
  items?: ReconciliationItem[];
  rules?: ReconciliationRule[];
  startedAt?: string;
}

// ============================================
// RECONCILIATION SESSION MANAGEMENT
// ============================================

export interface CreateSessionParams {
  tenantId: string;
  periodId: string;
  mode: 'migration' | 'operational';
  sourceSystem: string;
  targetSystem: string;
  createdBy: string;
}

export class ReconciliationBridge {
  private tenantId: string;

  constructor(tenantId: string) {
    this.tenantId = tenantId;
  }

  /**
   * Create a new reconciliation session
   */
  createSession(params: CreateSessionParams): ExtendedReconciliationSession {
    const now = new Date().toISOString();
    const session: ExtendedReconciliationSession = {
      id: `recon-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      tenantId: params.tenantId,
      periodId: params.periodId,
      mode: params.mode,
      status: 'pending',
      createdBy: params.createdBy,
      createdAt: now,
      sourceSystem: params.sourceSystem,
      targetSystem: params.targetSystem,
      startDate: now,
      endDate: now,
      startedAt: now,
      summary: {
        totalRecords: 0,
        matchedRecords: 0,
        unmatchedRecords: 0,
        discrepancies: 0,
        byType: {
          matched: 0,
          missingInSource: 0,
          missingInTarget: 0,
          amountDifference: 0,
          fieldDifference: 0,
        },
        sourceTotal: 0,
        targetTotal: 0,
        difference: 0,
        percentageDifference: 0,
        overallConfidence: 0,
        autoReconciled: 0,
        manualReviewRequired: 0,
      },
      items: [],
      rules: this.getDefaultRules(),
    };

    this.saveSession(session);
    return session;
  }

  /**
   * Run reconciliation for a session
   */
  async runReconciliation(
    sessionId: string,
    sourceData: Array<{ id: string; employeeId: string; amount: number; date: string; type: string; description?: string; [key: string]: unknown }>,
    targetData: Array<{ id: string; employeeId: string; amount: number; date: string; type: string; description?: string; [key: string]: unknown }>
  ): Promise<ExtendedReconciliationSession> {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    // Update status
    session.status = 'in_progress';
    this.saveSession(session);

    // Create items from matching
    const items: ReconciliationItem[] = [];
    const matchedTargets = new Set<string>();

    // Match source to target
    for (const source of sourceData) {
      const matches = targetData.filter((t) => !matchedTargets.has(t.id));
      const bestMatch = this.findBestMatch(source, matches, session.rules || []);

      if (bestMatch.match && bestMatch.confidence >= 80) {
        matchedTargets.add(bestMatch.match.id);

        const discrepancy = source.amount - bestMatch.match.amount;
        const status: MatchStatus =
          Math.abs(discrepancy) < 0.01 ? 'matched' : 'discrepancy';

        items.push({
          id: `item-${items.length + 1}`,
          sessionId,
          sourceRecord: {
            id: source.id,
            employeeId: source.employeeId,
            amount: source.amount,
            date: source.date,
            type: source.type,
            description: source.description,
            rawData: source as Record<string, unknown>,
          },
          targetRecord: {
            id: bestMatch.match.id,
            employeeId: bestMatch.match.employeeId,
            amount: bestMatch.match.amount,
            date: bestMatch.match.date as string,
            type: bestMatch.match.type as string,
            description: bestMatch.match.description as string | undefined,
            rawData: bestMatch.match as Record<string, unknown>,
          },
          matchStatus: status,
          matchConfidence: bestMatch.confidence,
          matchMethod: bestMatch.method,
          discrepancy: {
            fields: [],
            amountDifference: discrepancy,
            severity: Math.abs(discrepancy) > 100 ? 'high' : Math.abs(discrepancy) > 10 ? 'medium' : 'low',
          },
        });
      } else {
        items.push({
          id: `item-${items.length + 1}`,
          sessionId,
          sourceRecord: {
            id: source.id,
            employeeId: source.employeeId,
            amount: source.amount,
            date: source.date,
            type: source.type,
            description: source.description,
            rawData: source as Record<string, unknown>,
          },
          matchStatus: 'missing_target',
          matchConfidence: 0,
          matchMethod: 'exact',
          discrepancy: {
            fields: [],
            amountDifference: source.amount,
            severity: 'high',
          },
        });
      }
    }

    // Add unmatched targets
    for (const target of targetData) {
      if (!matchedTargets.has(target.id)) {
        items.push({
          id: `item-${items.length + 1}`,
          sessionId,
          targetRecord: {
            id: target.id,
            employeeId: target.employeeId,
            amount: target.amount,
            date: target.date,
            type: target.type,
            description: target.description,
            rawData: target as Record<string, unknown>,
          },
          matchStatus: 'missing_source',
          matchConfidence: 0,
          matchMethod: 'exact',
          discrepancy: {
            fields: [],
            amountDifference: -target.amount,
            severity: 'high',
          },
        });
      }
    }

    // Calculate summary
    const summary = this.calculateSummary(items, sourceData, targetData);

    // Update session
    session.items = items;
    session.summary = summary;
    session.status = 'completed';
    session.completedAt = new Date().toISOString();

    this.saveSession(session);
    this.saveItems(items);

    return session;
  }

  /**
   * Find best match for a source record
   */
  private findBestMatch(
    source: { id: string; employeeId: string; amount: number; [key: string]: unknown },
    targets: Array<{ id: string; employeeId: string; amount: number; [key: string]: unknown }>,
    rules: ReconciliationRule[]
  ): { match: typeof targets[0] | null; confidence: number; method: 'exact' | 'fuzzy' | 'rule_based' } {
    let bestMatch: typeof targets[0] | null = null;
    let bestConfidence = 0;
    let method: 'exact' | 'fuzzy' | 'rule_based' = 'exact';

    for (const target of targets) {
      // Exact match on employee ID and amount
      if (source.employeeId === target.employeeId) {
        const amountDiff = Math.abs(source.amount - target.amount);
        const amountMatch = amountDiff < 0.01 ? 100 : Math.max(0, 100 - (amountDiff / Math.max(source.amount, 1)) * 100);

        if (amountMatch > bestConfidence) {
          bestConfidence = amountMatch;
          bestMatch = target;
          method = amountMatch === 100 ? 'exact' : 'fuzzy';
        }
      }
    }

    // Try rule-based matching if no good match found
    if (bestConfidence < 80 && rules.length > 0) {
      for (const rule of rules.filter((r) => r.isActive)) {
        for (const target of targets) {
          const confidence = this.evaluateRule(source, target, rule);
          if (confidence > bestConfidence) {
            bestConfidence = confidence;
            bestMatch = target;
            method = 'rule_based';
          }
        }
      }
    }

    return { match: bestMatch, confidence: bestConfidence, method };
  }

  /**
   * Evaluate a matching rule
   */
  private evaluateRule(
    source: Record<string, unknown>,
    target: Record<string, unknown>,
    rule: ReconciliationRule
  ): number {
    let totalWeight = 0;
    let matchedWeight = 0;

    for (const criterion of rule.matchCriteria) {
      const sourceValue = source[criterion.sourceField];
      const targetValue = target[criterion.targetField];
      const weight = criterion.weight || 1;

      totalWeight += weight;

      if (criterion.matchType === 'exact' && sourceValue === targetValue) {
        matchedWeight += weight;
      } else if (criterion.matchType === 'fuzzy') {
        const similarity = this.calculateSimilarity(sourceValue, targetValue);
        matchedWeight += weight * (similarity / 100);
      } else if (criterion.matchType === 'numeric_range') {
        if (typeof sourceValue === 'number' && typeof targetValue === 'number') {
          const diff = Math.abs(sourceValue - targetValue);
          const tolerance = rule.amountTolerance?.value || 0.01;
          const toleranceAmount = rule.amountTolerance?.type === 'percentage'
            ? sourceValue * tolerance / 100
            : tolerance;
          if (diff <= toleranceAmount) {
            matchedWeight += weight;
          }
        }
      }
    }

    return totalWeight > 0 ? (matchedWeight / totalWeight) * 100 : 0;
  }

  /**
   * Calculate similarity between two values
   */
  private calculateSimilarity(a: unknown, b: unknown): number {
    if (a === b) return 100;
    if (typeof a === 'string' && typeof b === 'string') {
      const aLower = a.toLowerCase();
      const bLower = b.toLowerCase();
      if (aLower === bLower) return 100;

      // Simple character-based similarity
      const maxLen = Math.max(a.length, b.length);
      let matches = 0;
      for (let i = 0; i < Math.min(a.length, b.length); i++) {
        if (aLower[i] === bLower[i]) matches++;
      }
      return (matches / maxLen) * 100;
    }
    return 0;
  }

  /**
   * Calculate summary statistics
   */
  private calculateSummary(
    items: ReconciliationItem[],
    sourceData: Array<{ amount: number }>,
    targetData: Array<{ amount: number }>
  ): ReconciliationSummary {
    const matched = items.filter((i) => i.matchStatus === 'matched');
    const discrepancies = items.filter((i) => i.matchStatus === 'discrepancy');
    const missingSource = items.filter((i) => i.matchStatus === 'missing_source');
    const missingTarget = items.filter((i) => i.matchStatus === 'missing_target');

    const sourceTotal = sourceData.reduce((sum, s) => sum + s.amount, 0);
    const targetTotal = targetData.reduce((sum, t) => sum + t.amount, 0);
    const difference = sourceTotal - targetTotal;
    const percentageDifference = sourceTotal > 0 ? (difference / sourceTotal) * 100 : 0;

    const overallConfidence = items.length > 0
      ? items.reduce((sum, i) => sum + i.matchConfidence, 0) / items.length
      : 0;

    return {
      totalRecords: sourceData.length + targetData.length,
      matchedRecords: matched.length + discrepancies.length,
      unmatchedRecords: missingSource.length + missingTarget.length,
      discrepancies: discrepancies.length,
      byType: {
        matched: matched.length,
        missingInSource: missingSource.length,
        missingInTarget: missingTarget.length,
        amountDifference: discrepancies.length,
        fieldDifference: 0,
      },
      sourceTotal,
      targetTotal,
      difference,
      percentageDifference,
      overallConfidence,
      autoReconciled: matched.length,
      manualReviewRequired: discrepancies.length + missingSource.length + missingTarget.length,
    };
  }

  /**
   * Get default reconciliation rules
   */
  private getDefaultRules(): ReconciliationRule[] {
    const now = new Date().toISOString();
    return [
      {
        id: 'rule-employee-amount',
        tenantId: this.tenantId,
        name: 'Employee + Amount Match',
        priority: 1,
        isActive: true,
        matchCriteria: [
          { sourceField: 'employeeId', targetField: 'employeeId', matchType: 'exact', weight: 50, required: true },
          { sourceField: 'amount', targetField: 'amount', matchType: 'numeric_range', weight: 50, required: true },
        ],
        matchThreshold: 80,
        autoResolve: false,
        amountTolerance: { type: 'percentage', value: 1 },
        createdBy: 'system',
        createdAt: now,
      },
      {
        id: 'rule-employee-date-amount',
        tenantId: this.tenantId,
        name: 'Employee + Date + Amount Match',
        priority: 2,
        isActive: true,
        matchCriteria: [
          { sourceField: 'employeeId', targetField: 'employeeId', matchType: 'exact', weight: 40, required: true },
          { sourceField: 'date', targetField: 'date', matchType: 'date_range', weight: 30, required: false },
          { sourceField: 'amount', targetField: 'amount', matchType: 'numeric_range', weight: 30, required: true },
        ],
        matchThreshold: 80,
        autoResolve: false,
        amountTolerance: { type: 'percentage', value: 1 },
        dateTolerance: 1,
        createdBy: 'system',
        createdAt: now,
      },
    ];
  }

  // ============================================
  // DISPUTE MANAGEMENT
  // ============================================

  /**
   * Create a new dispute
   */
  createDispute(params: {
    sessionId: string;
    itemId: string;
    submittedBy: string;
    employeeId: string;
    employeeName: string;
    category: DisputeCategory;
    description: string;
    expectedAmount: number;
    actualAmount: number;
  }): Dispute {
    const dispute: Dispute = {
      id: `dispute-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      tenantId: this.tenantId,
      sessionId: params.sessionId,
      itemId: params.itemId,
      submittedBy: params.submittedBy,
      submittedAt: new Date().toISOString(),
      employeeId: params.employeeId,
      employeeName: params.employeeName,
      category: params.category,
      description: params.description,
      expectedAmount: params.expectedAmount,
      actualAmount: params.actualAmount,
      discrepancyAmount: params.expectedAmount - params.actualAmount,
      status: 'open',
      priority: this.calculatePriority(params.expectedAmount - params.actualAmount),
      history: [
        {
          action: 'dispute_created',
          performedBy: params.submittedBy,
          performedAt: new Date().toISOString(),
        },
      ],
      updatedAt: new Date().toISOString(),
    };

    this.saveDispute(dispute);
    return dispute;
  }

  /**
   * Update dispute status
   */
  updateDisputeStatus(
    disputeId: string,
    newStatus: DisputeStatus,
    userId: string,
    details?: string
  ): Dispute | null {
    const dispute = this.getDispute(disputeId);
    if (!dispute) return null;

    const previousStatus = dispute.status;
    dispute.status = newStatus;
    dispute.updatedAt = new Date().toISOString();
    dispute.history.push({
      action: 'status_changed',
      performedBy: userId,
      performedAt: new Date().toISOString(),
      details,
      previousStatus,
      newStatus,
    });

    this.saveDispute(dispute);
    return dispute;
  }

  /**
   * Assign dispute to a user
   */
  assignDispute(disputeId: string, assigneeId: string, assignedBy: string): Dispute | null {
    const dispute = this.getDispute(disputeId);
    if (!dispute) return null;

    dispute.assignedTo = assigneeId;
    dispute.status = dispute.status === 'open' ? 'under_review' : dispute.status;
    dispute.updatedAt = new Date().toISOString();
    dispute.history.push({
      action: 'assigned',
      performedBy: assignedBy,
      performedAt: new Date().toISOString(),
      details: `Assigned to ${assigneeId}`,
    });

    this.saveDispute(dispute);
    return dispute;
  }

  /**
   * Resolve a dispute
   */
  resolveDispute(
    disputeId: string,
    resolution: Omit<DisputeResolution, 'resolvedAt'>,
    resolvedBy: string
  ): Dispute | null {
    const dispute = this.getDispute(disputeId);
    if (!dispute) return null;

    const previousStatus = dispute.status;
    dispute.resolution = {
      ...resolution,
      resolvedBy,
      resolvedAt: new Date().toISOString(),
    };
    dispute.status =
      resolution.outcome === 'rejected' ? 'resolved_rejected' : 'resolved_accepted';
    dispute.updatedAt = new Date().toISOString();
    dispute.history.push({
      action: 'resolved',
      performedBy: resolvedBy,
      performedAt: new Date().toISOString(),
      details: `Resolved as ${resolution.outcome}: ${resolution.explanation}`,
      previousStatus,
      newStatus: dispute.status,
    });

    this.saveDispute(dispute);

    // If accepted, create adjustment in orchestrator
    if (resolution.outcome !== 'rejected' && resolution.adjustmentAmount) {
      this.createAdjustment(dispute, resolution.adjustmentAmount);
    }

    return dispute;
  }

  /**
   * Create adjustment from resolved dispute
   */
  private createAdjustment(dispute: Dispute, adjustmentAmount: number): void {
    const orchestrator = getOrchestrator(this.tenantId);

    // Store adjustment as metric
    orchestrator.saveMetricAggregate({
      employeeId: dispute.employeeId,
      periodId: dispute.sessionId.split('-')[1] || 'current',
      tenantId: this.tenantId,
      metrics: {
        dispute_adjustment: adjustmentAmount,
      },
      sources: {
        dispute_adjustment: `dispute:${dispute.id}`,
      },
      lastUpdated: new Date().toISOString(),
    });
  }

  /**
   * Calculate dispute priority based on amount
   */
  private calculatePriority(amount: number): Dispute['priority'] {
    const absAmount = Math.abs(amount);
    if (absAmount >= 1000) return 'critical';
    if (absAmount >= 500) return 'high';
    if (absAmount >= 100) return 'medium';
    return 'low';
  }

  // ============================================
  // STORAGE OPERATIONS
  // ============================================

  getSession(sessionId: string): ExtendedReconciliationSession | null {
    const sessions = this.getAllSessions();
    const session = sessions.find((s) => s.id === sessionId) || null;
    if (session) {
      // Load items
      session.items = this.getSessionItems(sessionId);
    }
    return session;
  }

  getSessions(periodId?: string): ExtendedReconciliationSession[] {
    let sessions = this.getAllSessions().filter((s) => s.tenantId === this.tenantId);

    if (periodId) {
      sessions = sessions.filter((s) => s.periodId === periodId);
    }

    return sessions.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  private getAllSessions(): ExtendedReconciliationSession[] {
    if (typeof window === 'undefined') return [];

    const stored = localStorage.getItem(STORAGE_KEYS.SESSIONS);
    if (!stored) return [];

    try {
      return JSON.parse(stored);
    } catch {
      return [];
    }
  }

  private saveSession(session: ExtendedReconciliationSession): void {
    if (typeof window === 'undefined') return;

    const sessions = this.getAllSessions();
    const index = sessions.findIndex((s) => s.id === session.id);

    // Don't store items in session - they're stored separately
    const { items, ...sessionWithoutItems } = session;
    void items; // Intentionally not storing items in session

    if (index >= 0) {
      sessions[index] = sessionWithoutItems as ExtendedReconciliationSession;
    } else {
      sessions.push(sessionWithoutItems as ExtendedReconciliationSession);
    }

    localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(sessions));
  }

  private getSessionItems(sessionId: string): ReconciliationItem[] {
    if (typeof window === 'undefined') return [];

    const stored = localStorage.getItem(STORAGE_KEYS.ITEMS);
    if (!stored) return [];

    try {
      const items: ReconciliationItem[] = JSON.parse(stored);
      return items.filter((i) => i.sessionId === sessionId);
    } catch {
      return [];
    }
  }

  private saveItems(items: ReconciliationItem[]): void {
    if (typeof window === 'undefined') return;

    const stored = localStorage.getItem(STORAGE_KEYS.ITEMS);
    let allItems: ReconciliationItem[] = [];

    try {
      allItems = stored ? JSON.parse(stored) : [];
    } catch {
      allItems = [];
    }

    // Remove existing items for this session
    const sessionId = items[0]?.sessionId;
    if (sessionId) {
      allItems = allItems.filter((i) => i.sessionId !== sessionId);
    }

    allItems.push(...items);
    localStorage.setItem(STORAGE_KEYS.ITEMS, JSON.stringify(allItems));
  }

  getDispute(disputeId: string): Dispute | null {
    const disputes = this.getAllDisputes();
    return disputes.find((d) => d.id === disputeId) || null;
  }

  getDisputes(filters?: {
    status?: DisputeStatus;
    sessionId?: string;
    employeeId?: string;
    assignedTo?: string;
  }): Dispute[] {
    let disputes = this.getAllDisputes().filter((d) => d.tenantId === this.tenantId);

    if (filters?.status) {
      disputes = disputes.filter((d) => d.status === filters.status);
    }
    if (filters?.sessionId) {
      disputes = disputes.filter((d) => d.sessionId === filters.sessionId);
    }
    if (filters?.employeeId) {
      disputes = disputes.filter((d) => d.employeeId === filters.employeeId);
    }
    if (filters?.assignedTo) {
      disputes = disputes.filter((d) => d.assignedTo === filters.assignedTo);
    }

    return disputes.sort(
      (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
    );
  }

  getOpenDisputes(): Dispute[] {
    return this.getDisputes().filter((d) =>
      ['open', 'under_review', 'awaiting_info', 'escalated'].includes(d.status)
    );
  }

  private getAllDisputes(): Dispute[] {
    if (typeof window === 'undefined') return [];

    const stored = localStorage.getItem(STORAGE_KEYS.DISPUTES);
    if (!stored) return [];

    try {
      return JSON.parse(stored);
    } catch {
      return [];
    }
  }

  private saveDispute(dispute: Dispute): void {
    if (typeof window === 'undefined') return;

    const disputes = this.getAllDisputes();
    const index = disputes.findIndex((d) => d.id === dispute.id);

    if (index >= 0) {
      disputes[index] = dispute;
    } else {
      disputes.push(dispute);
    }

    localStorage.setItem(STORAGE_KEYS.DISPUTES, JSON.stringify(disputes));
  }

  // ============================================
  // ANALYTICS
  // ============================================

  getDisputeStats(): {
    total: number;
    open: number;
    resolved: number;
    avgResolutionTime: number;
    byCategory: Record<DisputeCategory, number>;
    totalDiscrepancyAmount: number;
  } {
    const disputes = this.getDisputes();

    const resolved = disputes.filter((d) =>
      ['resolved_accepted', 'resolved_rejected', 'withdrawn'].includes(d.status)
    );

    const resolutionTimes = resolved
      .filter((d) => d.resolution)
      .map((d) => {
        const submitted = new Date(d.submittedAt).getTime();
        const resolvedAt = new Date(d.resolution!.resolvedAt).getTime();
        return (resolvedAt - submitted) / (1000 * 60 * 60 * 24); // days
      });

    const byCategory = disputes.reduce(
      (acc, d) => {
        acc[d.category] = (acc[d.category] || 0) + 1;
        return acc;
      },
      {} as Record<DisputeCategory, number>
    );

    return {
      total: disputes.length,
      open: disputes.length - resolved.length,
      resolved: resolved.length,
      avgResolutionTime:
        resolutionTimes.length > 0
          ? resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length
          : 0,
      byCategory,
      totalDiscrepancyAmount: disputes.reduce((sum, d) => sum + Math.abs(d.discrepancyAmount), 0),
    };
  }
}

// ============================================
// SINGLETON & CONVENIENCE FUNCTIONS
// ============================================

const bridges: Map<string, ReconciliationBridge> = new Map();

export function getReconciliationBridge(tenantId: string): ReconciliationBridge {
  if (!bridges.has(tenantId)) {
    bridges.set(tenantId, new ReconciliationBridge(tenantId));
  }
  return bridges.get(tenantId)!;
}

/**
 * Create a new reconciliation session
 */
export function createReconciliationSession(params: CreateSessionParams): ExtendedReconciliationSession {
  return getReconciliationBridge(params.tenantId).createSession(params);
}

/**
 * Get all disputes for a tenant
 */
export function getDisputes(
  tenantId: string,
  filters?: Parameters<ReconciliationBridge['getDisputes']>[0]
): Dispute[] {
  return getReconciliationBridge(tenantId).getDisputes(filters);
}

/**
 * Create a new dispute
 */
export function createDispute(
  tenantId: string,
  params: Parameters<ReconciliationBridge['createDispute']>[0]
): Dispute {
  return getReconciliationBridge(tenantId).createDispute(params);
}

/**
 * Resolve a dispute
 */
export function resolveDispute(
  tenantId: string,
  disputeId: string,
  resolution: Omit<DisputeResolution, 'resolvedAt'>,
  resolvedBy: string
): Dispute | null {
  return getReconciliationBridge(tenantId).resolveDispute(disputeId, resolution, resolvedBy);
}

// ============================================
// CALCULATION-TO-RECONCILIATION WIRING
// ============================================

export interface LegacyRecord {
  employeeId: string;
  employeeName?: string;
  period: string;
  totalIncentive: number;
  components?: Record<string, number>;
}

/**
 * Reconcile ViaLuce calculation results against legacy system output
 */
export async function reconcileCalculationsWithLegacy(
  tenantId: string,
  periodId: string,
  legacyData: LegacyRecord[],
  userId: string
): Promise<ExtendedReconciliationSession> {
  const bridge = getReconciliationBridge(tenantId);

  // Create reconciliation session
  const session = bridge.createSession({
    tenantId,
    periodId,
    mode: 'migration',
    sourceSystem: 'ViaLuce',
    targetSystem: 'Legacy',
    createdBy: userId,
  });

  // Get ViaLuce results for this period
  const viaLuceResults = getPeriodResults(tenantId, periodId);

  // Convert to reconciliation format
  const sourceData = viaLuceResults.map((result) => {
    const formatted = formatForReconciliation(result);
    return {
      id: `cc-${result.employeeId}-${result.period}`,
      employeeId: result.employeeId,
      amount: result.totalIncentive,
      date: result.period,
      type: 'incentive',
      description: `ViaLuce: ${result.planName}`,
      components: formatted.componentBreakdown,
    };
  });

  // Convert legacy data to reconciliation format
  const targetData = legacyData.map((record, index) => ({
    id: `legacy-${record.employeeId}-${record.period}-${index}`,
    employeeId: record.employeeId,
    amount: record.totalIncentive,
    date: record.period,
    type: 'incentive',
    description: `Legacy: ${record.employeeName || record.employeeId}`,
    components: record.components,
  }));

  // Run reconciliation
  return bridge.runReconciliation(session.id, sourceData, targetData);
}

/**
 * Get calculation results formatted for reconciliation
 */
export function getCalculationResultsForReconciliation(
  tenantId: string,
  periodId: string
): Array<{
  id: string;
  employeeId: string;
  employeeName: string;
  amount: number;
  date: string;
  type: string;
  description: string;
  components: Record<string, number>;
}> {
  const results = getPeriodResults(tenantId, periodId);

  return results.map((result) => {
    const formatted = formatForReconciliation(result);
    return {
      id: `cc-${result.employeeId}-${result.period}`,
      employeeId: result.employeeId,
      employeeName: result.employeeName,
      amount: result.totalIncentive,
      date: result.period,
      type: 'incentive',
      description: `${result.planName} (${result.variantName || 'default'})`,
      components: formatted.componentBreakdown,
    };
  });
}

/**
 * Parse legacy CSV data for reconciliation
 */
export function parseLegacyCSV(csvContent: string): LegacyRecord[] {
  const lines = csvContent.trim().split('\n');
  if (lines.length < 2) return [];

  // Parse header
  const headers = lines[0].split(',').map((h) => h.trim().toUpperCase());

  // Find column indices
  const empIdIdx = headers.findIndex((h) =>
    ['EMP_ID', 'EMPLOYEE_ID', 'EMPLOYEEID', 'ID_EMPLEADO'].includes(h)
  );
  const empNameIdx = headers.findIndex((h) =>
    ['EMP_NAME', 'EMPLOYEE_NAME', 'EMPLOYEENAME', 'NOMBRE'].includes(h)
  );
  const periodIdx = headers.findIndex((h) =>
    ['PERIOD', 'PERIODO', 'PAY_PERIOD', 'MONTH'].includes(h)
  );
  const totalIdx = headers.findIndex((h) =>
    ['TOTAL', 'TOTAL_INCENTIVE', 'INCENTIVE', 'AMOUNT', 'MONTO'].includes(h)
  );

  if (empIdIdx === -1 || totalIdx === -1) {
    console.warn('Could not find required columns in legacy CSV');
    return [];
  }

  // Parse data rows
  const records: LegacyRecord[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map((v) => v.trim().replace(/^"|"$/g, ''));

    const record: LegacyRecord = {
      employeeId: values[empIdIdx] || '',
      employeeName: empNameIdx >= 0 ? values[empNameIdx] : undefined,
      period: periodIdx >= 0 ? values[periodIdx] : '',
      totalIncentive: parseFloat(values[totalIdx]?.replace(/[$,]/g, '') || '0'),
    };

    // Parse component columns
    const componentHeaders = [
      'OPTICAL_BONUS',
      'STORE_BONUS',
      'CUSTOMER_BONUS',
      'COLLECTION_BONUS',
      'INSURANCE_BONUS',
      'SERVICES_BONUS',
    ];

    record.components = {};
    for (const compHeader of componentHeaders) {
      const idx = headers.indexOf(compHeader);
      if (idx >= 0 && values[idx]) {
        record.components[compHeader] = parseFloat(values[idx].replace(/[$,]/g, '') || '0');
      }
    }

    if (record.employeeId) {
      records.push(record);
    }
  }

  return records;
}
