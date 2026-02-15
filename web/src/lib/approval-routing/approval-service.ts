/**
 * Approval Routing Service
 *
 * Core engine for the universal approval system.
 * Every sensitive action flows through this service.
 */

import type {
  ApprovalRequest,
  ApprovalContext,
  ApprovalRule,
  ApprovalChain,
  ApprovalFilters,
  ApprovalStats,
  ApprovalDomain,
  ApprovalAuditEntry,
} from './types';
import {
  calculateImpactRating,
  generateImpactDetails,
  generateRecommendation,
} from './impact-calculator';
import { getSeededApprovalRequests } from '../demo/foundation-demo-data';

// Storage keys
const STORAGE_KEYS = {
  REQUESTS: 'approval_requests',
  RULES: 'approval_rules',
} as const;

// In-memory cache
const requestsCache = new Map<string, ApprovalRequest>();
const rulesCache = new Map<string, ApprovalRule>();

// ============================================
// INITIALIZATION
// ============================================

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function loadFromStorage<T>(_key: string): Map<string, T> {
  return new Map();
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function saveToStorage<T>(_key: string, _map: Map<string, T>): void {
  // No-op: localStorage removed
}

export function initializeApprovalService(): void {
  const requests = loadFromStorage<ApprovalRequest>(STORAGE_KEYS.REQUESTS);
  const rules = loadFromStorage<ApprovalRule>(STORAGE_KEYS.RULES);

  requests.forEach((v, k) => requestsCache.set(k, v));
  rules.forEach((v, k) => rulesCache.set(k, v));

  // Seed default rules if none exist
  if (rulesCache.size === 0) {
    seedDefaultRules();
  }

  // Load seeded approval requests into memory cache if empty
  if (requestsCache.size === 0) {
    const seededRequests = getSeededApprovalRequests();
    seededRequests.forEach((request) => {
      requestsCache.set(request.id, request);
    });
  }
}

function persistRequests(): void {
  saveToStorage(STORAGE_KEYS.REQUESTS, requestsCache);
}

function persistRules(): void {
  saveToStorage(STORAGE_KEYS.RULES, rulesCache);
}

// ============================================
// CREATE APPROVAL REQUEST
// ============================================

/**
 * Create a new approval request
 */
export function createApprovalRequest(context: ApprovalContext): ApprovalRequest {
  // Calculate impact rating
  const impactRating = calculateImpactRating(context);

  // Generate impact details
  const impactDetails = generateImpactDetails(context, impactRating.dimensions);

  // Generate recommendation
  const recommendation = generateRecommendation(impactRating, context);

  // Resolve approval chain based on rules
  const chain = resolveApprovalChain(context.tenantId, context.domain, impactRating.overall);

  // Calculate SLA
  const sla = getSLAForRequest(context.tenantId, context.domain, impactRating.overall);
  const dueBy = sla ? new Date(Date.now() + sla.dueInHours * 60 * 60 * 1000).toISOString() : undefined;
  const escalateAfter = sla ? new Date(Date.now() + sla.escalateAfterHours * 60 * 60 * 1000).toISOString() : undefined;

  const request: ApprovalRequest = {
    id: `apr-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    tenantId: context.tenantId,
    domain: context.domain,
    requestedBy: context.requestedBy,
    requestedAt: new Date().toISOString(),
    status: 'pending',
    summary: context.summary,
    impactRating,
    impactDetails,
    recommendation,
    chain,
    auditTrail: [
      {
        timestamp: new Date().toISOString(),
        action: 'created',
        userId: context.requestedBy,
        details: `Approval request created with impact rating ${impactRating.overall.toFixed(1)}`,
      },
    ],
    dueBy,
    escalateAfter,
    escalateTo: sla?.escalateTo,
    sourceEntityId: context.sourceEntityId,
    sourceEntityType: context.sourceEntityType,
  };

  requestsCache.set(request.id, request);
  persistRequests();

  return request;
}

// ============================================
// PROCESS DECISIONS
// ============================================

/**
 * Process an approval decision
 */
export function processDecision(
  requestId: string,
  decision: 'approved' | 'rejected' | 'escalated',
  decidedBy: string,
  notes?: string
): ApprovalRequest | null {
  const request = requestsCache.get(requestId);
  if (!request || request.status !== 'pending') return null;

  const now = new Date().toISOString();

  // Update current chain step
  const currentStep = request.chain.steps[request.chain.currentStep];
  if (currentStep) {
    currentStep.status = decision === 'approved' ? 'approved' : decision === 'rejected' ? 'rejected' : 'escalated';
    currentStep.decidedAt = now;
    currentStep.decidedBy = decidedBy;
    currentStep.notes = notes;
  }

  // Add audit entry
  const auditEntry: ApprovalAuditEntry = {
    timestamp: now,
    action: decision,
    userId: decidedBy,
    details: notes || `Request ${decision} by user`,
  };
  request.auditTrail.push(auditEntry);

  // Handle decision
  if (decision === 'approved') {
    // Check if there are more steps in sequential chain
    if (
      request.chain.type === 'sequential' &&
      request.chain.currentStep < request.chain.steps.length - 1
    ) {
      // Advance to next step
      request.chain.currentStep++;
      request.auditTrail.push({
        timestamp: now,
        action: 'advanced',
        userId: 'system',
        details: `Advanced to step ${request.chain.currentStep + 1}`,
      });
    } else {
      // All steps complete
      request.status = 'approved';
      request.resolution = {
        decidedBy,
        decidedAt: now,
        decision: 'approved',
        notes,
      };
    }
  } else if (decision === 'rejected') {
    request.status = 'rejected';
    request.resolution = {
      decidedBy,
      decidedAt: now,
      decision: 'rejected',
      notes,
    };
  } else if (decision === 'escalated') {
    request.status = 'escalated';
    // Add escalation step to chain
    request.chain.steps.push({
      stepNumber: request.chain.steps.length + 1,
      approverRole: request.escalateTo || 'admin',
      status: 'pending',
    });
    request.chain.currentStep = request.chain.steps.length - 1;
    request.auditTrail.push({
      timestamp: now,
      action: 'escalated',
      userId: decidedBy,
      details: `Escalated to ${request.escalateTo || 'admin'}`,
    });
    request.status = 'pending'; // Reset to pending for new approver
  }

  requestsCache.set(requestId, request);
  persistRequests();

  return request;
}

/**
 * Escalate a request
 */
export function escalateRequest(
  requestId: string,
  reason: string,
  escalatedBy: string
): ApprovalRequest | null {
  return processDecision(requestId, 'escalated', escalatedBy, reason);
}

/**
 * Delegate a request to another user
 */
export function delegateRequest(
  requestId: string,
  delegatedTo: string,
  delegatedBy: string,
  reason?: string
): ApprovalRequest | null {
  const request = requestsCache.get(requestId);
  if (!request || request.status !== 'pending') return null;

  const now = new Date().toISOString();

  // Update current step
  const currentStep = request.chain.steps[request.chain.currentStep];
  if (currentStep) {
    currentStep.approverId = delegatedTo;
    currentStep.status = 'delegated';
  }

  // Add new step for delegatee
  request.chain.steps.push({
    stepNumber: request.chain.steps.length + 1,
    approverId: delegatedTo,
    status: 'pending',
  });
  request.chain.currentStep = request.chain.steps.length - 1;

  request.auditTrail.push({
    timestamp: now,
    action: 'delegated',
    userId: delegatedBy,
    details: `Delegated to ${delegatedTo}${reason ? `: ${reason}` : ''}`,
  });

  requestsCache.set(requestId, request);
  persistRequests();

  return request;
}

// ============================================
// CHAIN RESOLUTION
// ============================================

/**
 * Resolve approval chain based on rules and impact
 */
function resolveApprovalChain(
  tenantId: string,
  domain: ApprovalDomain,
  impactRating: number
): ApprovalChain {
  // Find matching rules
  const matchingRules = Array.from(rulesCache.values())
    .filter((rule) => rule.active && rule.domain === domain && rule.tenantId === tenantId)
    .sort((a, b) => b.priority - a.priority);

  for (const rule of matchingRules) {
    if (evaluateConditions(rule.conditions, impactRating)) {
      return {
        type: rule.chainDefinition.type,
        steps: rule.chainDefinition.steps.map((step, index) => ({
          ...step,
          stepNumber: index + 1,
          status: index === 0 ? 'pending' : 'pending',
        })),
        currentStep: 0,
      };
    }
  }

  // Default chain based on impact
  return getDefaultChain(impactRating);
}

function evaluateConditions(
  conditions: ApprovalRule['conditions'],
  impactRating: number
): boolean {
  for (const condition of conditions) {
    let value: number | string;

    // Extract value from field path
    if (condition.field === 'impactRating.overall') {
      value = impactRating;
    } else {
      continue; // Skip unsupported fields for now
    }

    // Evaluate condition
    switch (condition.operator) {
      case 'gt':
        if (!(value > (condition.value as number))) return false;
        break;
      case 'gte':
        if (!(value >= (condition.value as number))) return false;
        break;
      case 'lt':
        if (!(value < (condition.value as number))) return false;
        break;
      case 'lte':
        if (!(value <= (condition.value as number))) return false;
        break;
      case 'eq':
        if (value !== condition.value) return false;
        break;
      case 'in':
        if (!Array.isArray(condition.value) || !(condition.value as (number | string)[]).includes(value)) return false;
        break;
      case 'between':
        if (
          !Array.isArray(condition.value) ||
          value < (condition.value as number[])[0] ||
          value > (condition.value as number[])[1]
        )
          return false;
        break;
    }
  }
  return true;
}

function getDefaultChain(impactRating: number): ApprovalChain {
  if (impactRating >= 8) {
    // Two-step approval for high impact
    return {
      type: 'sequential',
      steps: [
        { stepNumber: 1, approverRole: 'manager', status: 'pending' },
        { stepNumber: 2, approverRole: 'admin', status: 'pending' },
      ],
      currentStep: 0,
    };
  } else if (impactRating >= 5) {
    // Manager approval for medium impact
    return {
      type: 'single',
      steps: [{ stepNumber: 1, approverRole: 'manager', status: 'pending' }],
      currentStep: 0,
    };
  } else {
    // Single approver for low impact
    return {
      type: 'single',
      steps: [{ stepNumber: 1, approverRole: 'approver', status: 'pending' }],
      currentStep: 0,
    };
  }
}

function getSLAForRequest(
  tenantId: string,
  domain: ApprovalDomain,
  impactRating: number
): { dueInHours: number; escalateAfterHours: number; escalateTo: string } | null {
  const matchingRules = Array.from(rulesCache.values())
    .filter((rule) => rule.active && rule.domain === domain && rule.tenantId === tenantId)
    .sort((a, b) => b.priority - a.priority);

  for (const rule of matchingRules) {
    if (evaluateConditions(rule.conditions, impactRating)) {
      return rule.sla;
    }
  }

  // Default SLA
  return {
    dueInHours: impactRating >= 8 ? 4 : impactRating >= 5 ? 24 : 72,
    escalateAfterHours: impactRating >= 8 ? 2 : impactRating >= 5 ? 12 : 48,
    escalateTo: 'admin',
  };
}

// ============================================
// QUERIES
// ============================================

/**
 * Get approval request by ID
 */
export function getApprovalRequest(requestId: string): ApprovalRequest | null {
  return requestsCache.get(requestId) || null;
}

/**
 * Get pending approvals for a user
 */
export function getMyApprovals(
  userId: string,
  tenantId: string,
  role?: string
): ApprovalRequest[] {
  return Array.from(requestsCache.values())
    .filter((request) => {
      if (request.tenantId !== tenantId) return false;
      if (request.status !== 'pending') return false;

      const currentStep = request.chain.steps[request.chain.currentStep];
      if (!currentStep) return false;

      // Check if this user is the assigned approver
      if (currentStep.approverId === userId) return true;

      // Check if user has the required role
      if (role && currentStep.approverRole === role) return true;

      return false;
    })
    .sort((a, b) => b.impactRating.overall - a.impactRating.overall);
}

/**
 * Get all approvals with filters
 */
export function getApprovals(
  tenantId: string,
  filters?: ApprovalFilters
): ApprovalRequest[] {
  let results = Array.from(requestsCache.values()).filter(
    (r) => r.tenantId === tenantId
  );

  if (filters) {
    if (filters.domain) {
      const domains = Array.isArray(filters.domain) ? filters.domain : [filters.domain];
      results = results.filter((r) => domains.includes(r.domain));
    }

    if (filters.status) {
      const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
      results = results.filter((r) => statuses.includes(r.status));
    }

    if (filters.requestedBy) {
      results = results.filter((r) => r.requestedBy === filters.requestedBy);
    }

    if (filters.dateRange) {
      const start = new Date(filters.dateRange.start).getTime();
      const end = new Date(filters.dateRange.end).getTime();
      results = results.filter((r) => {
        const date = new Date(r.requestedAt).getTime();
        return date >= start && date <= end;
      });
    }

    if (filters.minImpactRating !== undefined) {
      results = results.filter((r) => r.impactRating.overall >= filters.minImpactRating!);
    }

    if (filters.maxImpactRating !== undefined) {
      results = results.filter((r) => r.impactRating.overall <= filters.maxImpactRating!);
    }
  }

  return results.sort(
    (a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime()
  );
}

/**
 * Get approval history
 */
export function getApprovalHistory(
  tenantId: string,
  domain?: ApprovalDomain,
  limit: number = 50
): ApprovalRequest[] {
  return Array.from(requestsCache.values())
    .filter((r) => {
      if (r.tenantId !== tenantId) return false;
      if (r.status === 'pending') return false;
      if (domain && r.domain !== domain) return false;
      return true;
    })
    .sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime())
    .slice(0, limit);
}

/**
 * Get approval statistics
 */
export function getApprovalStats(tenantId: string): ApprovalStats {
  const requests = Array.from(requestsCache.values()).filter(
    (r) => r.tenantId === tenantId
  );

  const stats: ApprovalStats = {
    pending: 0,
    approved: 0,
    rejected: 0,
    escalated: 0,
    avgResolutionTimeHours: 0,
    byDomain: {} as Record<ApprovalDomain, number>,
    overdueSla: 0,
  };

  let totalResolutionTime = 0;
  let resolvedCount = 0;
  const now = Date.now();

  for (const request of requests) {
    // Status counts
    if (request.status === 'pending') {
      stats.pending++;
      if (request.dueBy && new Date(request.dueBy).getTime() < now) {
        stats.overdueSla++;
      }
    } else if (request.status === 'approved') {
      stats.approved++;
    } else if (request.status === 'rejected') {
      stats.rejected++;
    } else if (request.status === 'escalated') {
      stats.escalated++;
    }

    // Domain counts
    stats.byDomain[request.domain] = (stats.byDomain[request.domain] || 0) + 1;

    // Resolution time
    if (request.resolution) {
      const created = new Date(request.requestedAt).getTime();
      const resolved = new Date(request.resolution.decidedAt).getTime();
      totalResolutionTime += resolved - created;
      resolvedCount++;
    }
  }

  if (resolvedCount > 0) {
    stats.avgResolutionTimeHours = Math.round(
      totalResolutionTime / resolvedCount / (1000 * 60 * 60)
    );
  }

  return stats;
}

// ============================================
// RULES MANAGEMENT
// ============================================

/**
 * Get approval rules for a tenant
 */
export function getApprovalRules(tenantId: string): ApprovalRule[] {
  return Array.from(rulesCache.values())
    .filter((r) => r.tenantId === tenantId)
    .sort((a, b) => b.priority - a.priority);
}

/**
 * Create or update an approval rule
 */
export function saveApprovalRule(rule: ApprovalRule): void {
  rulesCache.set(rule.id, rule);
  persistRules();
}

/**
 * Delete an approval rule
 */
export function deleteApprovalRule(ruleId: string): void {
  rulesCache.delete(ruleId);
  persistRules();
}

// ============================================
// DEFAULT RULES
// ============================================

function seedDefaultRules(): void {
  const defaultRules: ApprovalRule[] = [
    {
      id: 'rule-high-impact',
      tenantId: 'default',
      domain: 'import_batch',
      name: 'High Impact Import',
      nameEs: 'Importación de Alto Impacto',
      description: 'Two-step approval for high impact imports',
      descriptionEs: 'Aprobación de dos pasos para importaciones de alto impacto',
      conditions: [{ field: 'impactRating.overall', operator: 'gte', value: 7 }],
      chainDefinition: {
        type: 'sequential',
        steps: [
          { stepNumber: 1, approverRole: 'manager' },
          { stepNumber: 2, approverRole: 'admin' },
        ],
      },
      sla: {
        dueInHours: 4,
        escalateAfterHours: 2,
        escalateTo: 'admin',
      },
      active: true,
      priority: 100,
    },
    {
      id: 'rule-medium-impact',
      tenantId: 'default',
      domain: 'import_batch',
      name: 'Medium Impact Import',
      nameEs: 'Importación de Impacto Medio',
      description: 'Manager approval for medium impact imports',
      descriptionEs: 'Aprobación de gerente para importaciones de impacto medio',
      conditions: [
        { field: 'impactRating.overall', operator: 'gte', value: 4 },
        { field: 'impactRating.overall', operator: 'lt', value: 7 },
      ],
      chainDefinition: {
        type: 'single',
        steps: [{ stepNumber: 1, approverRole: 'manager' }],
      },
      sla: {
        dueInHours: 24,
        escalateAfterHours: 12,
        escalateTo: 'admin',
      },
      active: true,
      priority: 50,
    },
  ];

  for (const rule of defaultRules) {
    rulesCache.set(rule.id, rule);
  }
  persistRules();
}

// Initialize on module load
if (typeof window !== 'undefined') {
  initializeApprovalService();
}
