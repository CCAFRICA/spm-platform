/**
 * Lifecycle Utilities — Pure functions for calculation lifecycle states.
 *
 * No localStorage. No Supabase. Just state labels, colors, and transitions.
 * Used by pages that display lifecycle state from Supabase calculation_batches.
 */

export type CalculationState =
  | 'DRAFT'
  | 'PREVIEW'
  | 'RECONCILE'
  | 'OFFICIAL'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'SUPERSEDED'
  | 'POSTED'
  | 'CLOSED'
  | 'PAID'
  | 'PUBLISHED';

/** Ordered states for subway visualization (excludes REJECTED branch) */
export const LIFECYCLE_STATES_ORDERED: CalculationState[] = [
  'DRAFT', 'PREVIEW', 'RECONCILE', 'OFFICIAL', 'PENDING_APPROVAL',
  'APPROVED', 'POSTED', 'CLOSED', 'PAID', 'PUBLISHED',
];

/** Valid transitions from each state */
const VALID_TRANSITIONS: Record<CalculationState, CalculationState[]> = {
  DRAFT: ['PREVIEW'],
  PREVIEW: ['DRAFT', 'RECONCILE', 'OFFICIAL'],
  RECONCILE: ['PREVIEW', 'OFFICIAL'],
  OFFICIAL: ['PENDING_APPROVAL', 'SUPERSEDED'],
  PENDING_APPROVAL: ['APPROVED', 'REJECTED'],
  APPROVED: ['POSTED'],
  REJECTED: ['OFFICIAL'],
  SUPERSEDED: [],  // Terminal: old batch superseded by new one
  POSTED: ['CLOSED'],
  CLOSED: ['PAID'],
  PAID: ['PUBLISHED'],
  PUBLISHED: [],
};

type UserRole = 'vl_admin' | 'platform_admin' | 'manager' | 'sales_rep' | 'approver' | 'admin';

/**
 * Get display label for a lifecycle state.
 */
export function getStateLabel(state: CalculationState | string): string {
  const labels: Record<string, string> = {
    DRAFT: 'Draft',
    PREVIEW: 'Preview',
    RECONCILE: 'Reconcile',
    OFFICIAL: 'Official',
    PENDING_APPROVAL: 'Pending Approval',
    APPROVED: 'Approved',
    REJECTED: 'Rejected',
    SUPERSEDED: 'Superseded',
    POSTED: 'Posted',
    CLOSED: 'Closed',
    PAID: 'Paid',
    PUBLISHED: 'Published',
  };
  return labels[state] || state;
}

/**
 * Get status color classes for a lifecycle state.
 */
export function getStateColor(state: CalculationState | string): string {
  const colors: Record<string, string> = {
    DRAFT: 'bg-gray-100 text-gray-700',
    PREVIEW: 'bg-blue-100 text-blue-700',
    RECONCILE: 'bg-cyan-100 text-cyan-700',
    OFFICIAL: 'bg-purple-100 text-purple-700',
    PENDING_APPROVAL: 'bg-yellow-100 text-yellow-700',
    APPROVED: 'bg-green-100 text-green-700',
    REJECTED: 'bg-red-100 text-red-700',
    SUPERSEDED: 'bg-stone-100 text-stone-700',
    POSTED: 'bg-teal-100 text-teal-700',
    CLOSED: 'bg-indigo-100 text-indigo-700',
    PAID: 'bg-emerald-100 text-emerald-700',
    PUBLISHED: 'bg-sky-100 text-sky-700',
  };
  return colors[state] || 'bg-gray-100 text-gray-700';
}

/**
 * Get allowed transitions from a given state.
 */
export function getAllowedTransitions(state: CalculationState): CalculationState[] {
  return VALID_TRANSITIONS[state] || [];
}

/**
 * Check if a transition is valid.
 */
export function canTransition(from: CalculationState, to: CalculationState): boolean {
  return (VALID_TRANSITIONS[from] || []).includes(to);
}

/**
 * Check if calculation results are visible for a given role and state.
 */
export function canViewResults(state: CalculationState | string, role: string): boolean {
  const r = role as UserRole;
  switch (state) {
    case 'DRAFT':
    case 'PREVIEW':
    case 'RECONCILE':
    case 'OFFICIAL':
      return r === 'vl_admin' || r === 'platform_admin' || r === 'admin';
    case 'PENDING_APPROVAL':
    case 'APPROVED':
      return r === 'vl_admin' || r === 'platform_admin' || r === 'admin' || r === 'approver';
    case 'POSTED':
    case 'CLOSED':
    case 'PAID':
    case 'PUBLISHED':
      return true;
    case 'REJECTED':
    case 'SUPERSEDED':
      return r === 'vl_admin' || r === 'platform_admin' || r === 'admin';
    default:
      return false;
  }
}
