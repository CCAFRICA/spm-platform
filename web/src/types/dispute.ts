/**
 * Dispute Types - ViaLuce SPM Platform
 *
 * Data models for the dispute/inquiry system
 */

export type DisputeStatus = 'draft' | 'submitted' | 'in_review' | 'resolved';

export type DisputeCategory =
  | 'wrong_attribution'
  | 'missing_transaction'
  | 'incorrect_amount'
  | 'wrong_rate'
  | 'split_error'
  | 'timing_issue'
  | 'other';

export type DisputeOutcome = 'approved' | 'partial' | 'denied';

export interface Dispute {
  id: string;
  tenantId: string;
  transactionId: string;
  employeeId: string;
  employeeName: string;
  storeId: string;
  storeName: string;
  status: DisputeStatus;
  category: DisputeCategory;
  component: string; // Which compensation component is disputed

  // Funnel tracking - key for analytics
  stepsCompleted: number;
  resolvedAtStep: number | null; // If resolved before submission (self-service success)
  stepTimestamps: {
    step1StartedAt?: string;
    step1CompletedAt?: string;
    step2StartedAt?: string;
    step2CompletedAt?: string;
    step3StartedAt?: string;
    step3CompletedAt?: string;
  };

  // Amounts
  expectedAmount: number;
  actualAmount: number;
  difference: number;

  // Evidence & justification
  justification: string;
  attachedTransactionIds: string[];
  systemAnalysis?: string;

  // For wrong_attribution specifically
  attributionDetails?: {
    shouldBeCreditedTo: string;
    shouldBeCreditedToName: string;
    currentlyCreditedTo: string;
    currentlyCreditedToName: string;
    requestedSplit?: Record<string, number>;
  };

  // Resolution
  resolution: DisputeResolution | null;

  // Timestamps
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  resolvedAt: string | null;
}

export interface DisputeResolution {
  outcome: DisputeOutcome;
  adjustmentAmount: number;
  explanation: string;
  resolvedBy: string;
  resolvedByName: string;
  resolvedAt: string;
  adjustmentApplied: boolean;
  adjustmentId?: string;
}

export interface CompensationAdjustment {
  id: string;
  tenantId: string;
  disputeId: string | null;
  employeeId: string;
  employeeName: string;
  type: 'dispute_resolution' | 'manual_correction' | 'retroactive';
  amount: number;
  currency: string;
  description: string;
  period: string;
  component?: string;
  status: 'pending' | 'approved' | 'applied' | 'rejected';
  createdBy: string;
  createdAt: string;
  appliedAt: string | null;
}

export interface PastDisputeSummary {
  id: string;
  category: DisputeCategory;
  outcome: DisputeOutcome;
  amount: number;
  resolvedAt: string;
}

// Category metadata for UI
export const DISPUTE_CATEGORIES: Record<
  DisputeCategory,
  { label: string; description: string; icon: string }
> = {
  wrong_attribution: {
    label: 'Wrong Attribution',
    description: 'Transaction was credited to the wrong person',
    icon: 'user-x',
  },
  missing_transaction: {
    label: 'Missing Transaction',
    description: 'A transaction is not showing in my records',
    icon: 'file-question',
  },
  incorrect_amount: {
    label: 'Incorrect Amount',
    description: 'The transaction amount is wrong',
    icon: 'calculator',
  },
  wrong_rate: {
    label: 'Wrong Rate Applied',
    description: 'The commission/incentive rate is incorrect',
    icon: 'percent',
  },
  split_error: {
    label: 'Split Error',
    description: 'The transaction split is incorrect',
    icon: 'split',
  },
  timing_issue: {
    label: 'Timing Issue',
    description: 'Transaction is in the wrong period',
    icon: 'calendar',
  },
  other: {
    label: 'Other',
    description: 'Other compensation issue',
    icon: 'help-circle',
  },
};

// Helper to create a new dispute draft
export function createDisputeDraft(
  tenantId: string,
  transactionId: string,
  employeeId: string,
  employeeName: string,
  storeId: string,
  storeName: string,
  component: string
): Dispute {
  const now = new Date().toISOString();

  return {
    id: `dispute-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    tenantId,
    transactionId,
    employeeId,
    employeeName,
    storeId,
    storeName,
    status: 'draft',
    category: 'other',
    component,
    stepsCompleted: 0,
    resolvedAtStep: null,
    stepTimestamps: {
      step1StartedAt: now,
    },
    expectedAmount: 0,
    actualAmount: 0,
    difference: 0,
    justification: '',
    attachedTransactionIds: [transactionId],
    resolution: null,
    createdAt: now,
    updatedAt: now,
    submittedAt: null,
    resolvedAt: null,
  };
}
