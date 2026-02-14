/**
 * Calculation Lifecycle State Machine
 *
 * Enforces state transitions for the calculation cycle:
 * DRAFT -> PREVIEW -> RECONCILE -> OFFICIAL -> PENDING_APPROVAL -> APPROVED -> POSTED -> CLOSED -> PAID -> PUBLISHED
 *
 * OFFICIAL creates an immutable snapshot. Subsequent PREVIEW does not overwrite it.
 * POSTED is required before results are visible to Sales Reps.
 * PUBLISHED is the terminal state -- period is complete.
 */

export type CalculationState =
  | 'DRAFT'
  | 'PREVIEW'
  | 'RECONCILE'
  | 'OFFICIAL'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'POSTED'
  | 'CLOSED'
  | 'PAID'
  | 'PUBLISHED';

export interface CalculationCycle {
  cycleId: string;
  tenantId: string;
  planId: string;
  period: string;
  state: CalculationState;
  previewRunId?: string;
  officialRunId?: string;
  officialSnapshot?: OfficialSnapshot;
  submittedBy?: string;
  submittedAt?: string;
  approvedBy?: string;
  approvedAt?: string;
  approvalComments?: string;
  rejectionReason?: string;
  postedBy?: string;
  postedAt?: string;
  closedBy?: string;
  closedAt?: string;
  paidAt?: string;
  paidBy?: string;
  publishedAt?: string;
  publishedBy?: string;
  auditTrail: AuditEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface OfficialSnapshot {
  timestamp: string;
  runId: string;
  totalPayout: number;
  employeeCount: number;
  componentTotals: Record<string, number>;
  immutable: true;
}

export interface AuditEntry {
  timestamp: string;
  action: string;
  actor: string;
  fromState: CalculationState;
  toState: CalculationState;
  details: string;
}

// Valid state transitions -- canonical 9-state lifecycle + REJECTED
const VALID_TRANSITIONS: Record<CalculationState, CalculationState[]> = {
  DRAFT:              ['PREVIEW'],
  PREVIEW:            ['DRAFT', 'RECONCILE', 'OFFICIAL', 'PREVIEW'],
  RECONCILE:          ['PREVIEW', 'OFFICIAL'],
  OFFICIAL:           ['PREVIEW', 'PENDING_APPROVAL'],
  PENDING_APPROVAL:   ['OFFICIAL', 'APPROVED', 'REJECTED'],
  REJECTED:           ['OFFICIAL'],
  APPROVED:           ['OFFICIAL', 'POSTED'],
  POSTED:             ['APPROVED', 'CLOSED'],
  CLOSED:             ['POSTED', 'PAID'],
  PAID:               ['CLOSED', 'PUBLISHED'],
  PUBLISHED:          [],
};

// Ordered states for subway visualization (excludes REJECTED branch)
export const LIFECYCLE_STATES_ORDERED: CalculationState[] = [
  'DRAFT', 'PREVIEW', 'RECONCILE', 'OFFICIAL', 'PENDING_APPROVAL',
  'APPROVED', 'POSTED', 'CLOSED', 'PAID', 'PUBLISHED',
];

type UserRole = 'vl_admin' | 'platform_admin' | 'manager' | 'sales_rep' | 'approver';

const STORAGE_PREFIX = 'vialuce_cycle_';

export function getCycleStorageKey(tenantId: string, period: string): string {
  return `${STORAGE_PREFIX}${tenantId}_${period}`;
}

/**
 * Load the calculation cycle for a tenant/period.
 */
export function loadCycle(tenantId: string, period: string): CalculationCycle | null {
  if (typeof window === 'undefined') return null;
  const key = getCycleStorageKey(tenantId, period);
  const stored = localStorage.getItem(key);
  if (!stored) return null;
  try {
    return JSON.parse(stored) as CalculationCycle;
  } catch {
    return null;
  }
}

/**
 * Save a calculation cycle.
 */
export function saveCycle(cycle: CalculationCycle): void {
  if (typeof window === 'undefined') return;
  const key = getCycleStorageKey(cycle.tenantId, cycle.period);
  cycle.updatedAt = new Date().toISOString();
  try {
    localStorage.setItem(key, JSON.stringify(cycle));
  } catch (err) {
    console.error('[Lifecycle] Failed to save cycle:', err);
  }
}

/**
 * Create a new calculation cycle in DRAFT state.
 */
export function createCycle(tenantId: string, planId: string, period: string): CalculationCycle {
  const cycle: CalculationCycle = {
    cycleId: `cycle-${tenantId}-${period}-${Date.now()}`,
    tenantId,
    planId,
    period,
    state: 'DRAFT',
    auditTrail: [{
      timestamp: new Date().toISOString(),
      action: 'created',
      actor: 'system',
      fromState: 'DRAFT',
      toState: 'DRAFT',
      details: 'Calculation cycle created',
    }],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  saveCycle(cycle);
  return cycle;
}

/**
 * Get allowed transitions from a given state.
 */
export function getAllowedTransitions(state: CalculationState): CalculationState[] {
  return VALID_TRANSITIONS[state] || [];
}

/**
 * Transition a cycle to a new state with enforced rules.
 * Throws on invalid transitions with clear error message.
 */
export function transitionCycle(
  cycle: CalculationCycle,
  toState: CalculationState,
  actor: string,
  details: string,
  extra?: {
    runId?: string;
    snapshot?: OfficialSnapshot;
    approvalComments?: string;
    rejectionReason?: string;
  }
): CalculationCycle {
  const fromState = cycle.state;
  const allowed = VALID_TRANSITIONS[fromState];

  if (!allowed || !allowed.includes(toState)) {
    throw new Error(
      `Invalid state transition: ${fromState} -> ${toState}. ` +
      `Allowed transitions from ${fromState}: ${(allowed || []).join(', ') || 'none (terminal state)'}`
    );
  }

  // Separation of duties: approver must differ from submitter
  if (toState === 'APPROVED' && actor === cycle.submittedBy) {
    throw new Error(
      'Approval requires a different user than the submitter (separation of duties).'
    );
  }

  // Create updated cycle (immutable pattern)
  const now = new Date().toISOString();
  const updated: CalculationCycle = {
    ...cycle,
    state: toState,
    auditTrail: [
      ...cycle.auditTrail,
      {
        timestamp: now,
        action: `transition_${fromState}_to_${toState}`.toLowerCase(),
        actor,
        fromState,
        toState,
        details,
      },
    ],
  };

  // State-specific updates
  switch (toState) {
    case 'PREVIEW':
      updated.previewRunId = extra?.runId || updated.previewRunId;
      break;

    case 'OFFICIAL':
      // Create immutable snapshot -- subsequent Preview does NOT overwrite this
      if (extra?.snapshot) {
        updated.officialSnapshot = { ...extra.snapshot, immutable: true };
        updated.officialRunId = extra.snapshot.runId;
      }
      break;

    case 'PENDING_APPROVAL':
      updated.submittedBy = actor;
      updated.submittedAt = now;
      break;

    case 'APPROVED':
      updated.approvedBy = actor;
      updated.approvedAt = now;
      updated.approvalComments = extra?.approvalComments;
      break;

    case 'REJECTED':
      updated.rejectionReason = extra?.rejectionReason;
      break;

    case 'POSTED':
      updated.postedBy = actor;
      updated.postedAt = now;
      break;

    case 'CLOSED':
      updated.closedBy = actor;
      updated.closedAt = now;
      break;

    case 'PAID':
      updated.paidBy = actor;
      updated.paidAt = now;
      break;

    case 'PUBLISHED':
      updated.publishedBy = actor;
      updated.publishedAt = now;
      break;
  }

  saveCycle(updated);
  return updated;
}

/**
 * Check if calculation results are visible for a given role and state.
 * POSTED and later states are visible to all roles.
 * Pre-POSTED states are admin/approver only.
 */
export function canViewResults(state: CalculationState, role: UserRole): boolean {
  switch (state) {
    case 'DRAFT':
    case 'PREVIEW':
    case 'RECONCILE':
    case 'OFFICIAL':
      // Only admins can see pre-approval results
      return role === 'vl_admin' || role === 'platform_admin';

    case 'PENDING_APPROVAL':
      // Admins and approvers can see during approval
      return role === 'vl_admin' || role === 'platform_admin' || role === 'approver';

    case 'APPROVED':
      // Admins can see approved but not-yet-posted results
      return role === 'vl_admin' || role === 'platform_admin' || role === 'approver';

    case 'POSTED':
    case 'CLOSED':
    case 'PAID':
    case 'PUBLISHED':
      // All roles can see posted results
      return true;

    case 'REJECTED':
      // Only admins see rejected results
      return role === 'vl_admin' || role === 'platform_admin';

    default:
      return false;
  }
}

/**
 * Get the most recent approved (or later) cycle for a tenant.
 */
export function getApprovedCycle(tenantId: string): CalculationCycle | null {
  if (typeof window === 'undefined') return null;

  const postApprovalStates: CalculationState[] = [
    'APPROVED', 'POSTED', 'CLOSED', 'PAID', 'PUBLISHED',
  ];

  const cycles: CalculationCycle[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(`${STORAGE_PREFIX}${tenantId}_`)) {
      try {
        const cycle = JSON.parse(localStorage.getItem(key) || '') as CalculationCycle;
        if (postApprovalStates.includes(cycle.state)) {
          cycles.push(cycle);
        }
      } catch {
        // Skip invalid entries
      }
    }
  }

  if (cycles.length === 0) return null;
  cycles.sort((a, b) => (b.approvedAt || '').localeCompare(a.approvedAt || ''));
  return cycles[0];
}

/**
 * List all cycles for a tenant, sorted by most recent first.
 */
export function listCycles(tenantId: string): CalculationCycle[] {
  if (typeof window === 'undefined') return [];

  const cycles: CalculationCycle[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(`${STORAGE_PREFIX}${tenantId}_`)) {
      try {
        const cycle = JSON.parse(localStorage.getItem(key) || '') as CalculationCycle;
        cycles.push(cycle);
      } catch {
        // Skip invalid entries
      }
    }
  }

  cycles.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return cycles;
}

/**
 * Get display label for a state.
 */
export function getStateLabel(state: CalculationState): string {
  const labels: Record<CalculationState, string> = {
    DRAFT: 'Draft',
    PREVIEW: 'Preview',
    RECONCILE: 'Reconcile',
    OFFICIAL: 'Official',
    PENDING_APPROVAL: 'Pending Approval',
    APPROVED: 'Approved',
    REJECTED: 'Rejected',
    POSTED: 'Posted',
    CLOSED: 'Closed',
    PAID: 'Paid',
    PUBLISHED: 'Published',
  };
  return labels[state] || state;
}

/**
 * Get status color for a state.
 */
export function getStateColor(state: CalculationState): string {
  const colors: Record<CalculationState, string> = {
    DRAFT: 'bg-gray-100 text-gray-700',
    PREVIEW: 'bg-blue-100 text-blue-700',
    RECONCILE: 'bg-cyan-100 text-cyan-700',
    OFFICIAL: 'bg-purple-100 text-purple-700',
    PENDING_APPROVAL: 'bg-yellow-100 text-yellow-700',
    APPROVED: 'bg-green-100 text-green-700',
    REJECTED: 'bg-red-100 text-red-700',
    POSTED: 'bg-teal-100 text-teal-700',
    CLOSED: 'bg-indigo-100 text-indigo-700',
    PAID: 'bg-emerald-100 text-emerald-700',
    PUBLISHED: 'bg-sky-100 text-sky-700',
  };
  return colors[state] || 'bg-gray-100 text-gray-700';
}
