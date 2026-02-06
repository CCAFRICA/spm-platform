/**
 * Demo State Definitions
 *
 * Defines pre-configured demo states for different demonstration scenarios.
 * Each state represents a specific point in a user journey.
 */

import type { Dispute, CompensationAdjustment } from '@/types/dispute';

export type DemoState =
  | 'initial' // Fresh start - Maria has pending attribution issue, no dispute submitted
  | 'disputed' // Maria has submitted her dispute, Carlos can review
  | 'resolved' // Carlos has approved, adjustment created, Maria notified
  | 'data_dirty' // Data quality issues present for Sofia to resolve
  | 'data_clean'; // All data quality issues resolved

export interface DemoStateConfig {
  id: DemoState;
  name: string;
  nameEs: string;
  description: string;
  descriptionEs: string;
  storageData: {
    disputes: Dispute[];
    adjustments: CompensationAdjustment[];
    notifications: DemoNotification[];
    quarantine?: QuarantineItem[];
  };
}

export interface DemoNotification {
  id: string;
  tenantId: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  linkTo?: string;
}

export interface QuarantineItem {
  id: string;
  tenantId: string;
  source: string;
  recordType: string;
  recordId: string;
  errorType: string;
  errorMessage: string;
  severity: 'critical' | 'warning' | 'info';
  status: 'pending' | 'resolved';
  detectedAt: string;
}

// Helper to create timestamps
function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

function hoursAgo(hours: number): string {
  const date = new Date();
  date.setHours(date.getHours() - hours);
  return date.toISOString();
}

// Maria's draft dispute for TXN-2025-0147 (attribution issue)
const MARIA_DRAFT_DISPUTE: Dispute = {
  id: 'dispute-maria-txn0147',
  tenantId: 'retailco',
  transactionId: 'TXN-2025-0147',
  employeeId: 'rc-rep-001',
  employeeName: 'Maria Rodriguez',
  storeId: 'store-101',
  storeName: 'Downtown Flagship',
  status: 'draft',
  category: 'wrong_attribution',
  component: 'comp-insurance',
  stepsCompleted: 0,
  resolvedAtStep: null,
  stepTimestamps: {
    step1StartedAt: new Date().toISOString(),
  },
  expectedAmount: 42.5,
  actualAmount: 0,
  difference: 42.5,
  justification: '',
  attachedTransactionIds: ['TXN-2025-0147'],
  attributionDetails: {
    shouldBeCreditedTo: 'rc-rep-001',
    shouldBeCreditedToName: 'Maria Rodriguez',
    currentlyCreditedTo: 'rc-rep-002',
    currentlyCreditedToName: 'James Wilson',
    requestedSplit: { 'rc-rep-001': 0.5, 'rc-rep-002': 0.5 },
  },
  resolution: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  submittedAt: null,
  resolvedAt: null,
};

// Maria's submitted dispute
const MARIA_SUBMITTED_DISPUTE: Dispute = {
  ...MARIA_DRAFT_DISPUTE,
  status: 'submitted',
  stepsCompleted: 3,
  justification:
    'I assisted the customer for 20 minutes with product demo and needs assessment before James completed the sale. Per store policy for assisted sales, I should receive 50% credit for this transaction.',
  stepTimestamps: {
    step1StartedAt: daysAgo(2),
    step1CompletedAt: daysAgo(2),
    step2StartedAt: daysAgo(2),
    step2CompletedAt: daysAgo(1),
    step3StartedAt: daysAgo(1),
    step3CompletedAt: daysAgo(1),
  },
  submittedAt: daysAgo(1),
  updatedAt: daysAgo(1),
};

// Maria's resolved dispute
const MARIA_RESOLVED_DISPUTE: Dispute = {
  ...MARIA_SUBMITTED_DISPUTE,
  status: 'resolved',
  resolvedAt: hoursAgo(2),
  updatedAt: hoursAgo(2),
  resolution: {
    outcome: 'approved',
    adjustmentAmount: 42.5,
    explanation:
      'Verified with POS system that Maria spent 20+ minutes assisting this customer. Split credit approved per store policy.',
    resolvedBy: 'rc-manager-001',
    resolvedByName: 'Carlos Mendez',
    resolvedAt: hoursAgo(2),
    adjustmentApplied: true,
    adjustmentId: 'adj-maria-0147',
  },
};

// Adjustment for resolved dispute
const MARIA_ADJUSTMENT: CompensationAdjustment = {
  id: 'adj-maria-0147',
  tenantId: 'retailco',
  disputeId: 'dispute-maria-txn0147',
  employeeId: 'rc-rep-001',
  employeeName: 'Maria Rodriguez',
  type: 'dispute_resolution',
  amount: 42.5,
  currency: 'USD',
  description: 'Split credit approved for TXN-2025-0147 per store assisted sale policy',
  period: new Date().toISOString().substring(0, 7),
  component: 'comp-insurance',
  status: 'approved',
  createdBy: 'rc-manager-001',
  createdAt: hoursAgo(2),
  appliedAt: hoursAgo(1),
};

// Notification for Maria when dispute is resolved
const MARIA_RESOLUTION_NOTIFICATION: DemoNotification = {
  id: 'notif-maria-resolved',
  tenantId: 'retailco',
  userId: 'rc-rep-001',
  type: 'dispute_resolved',
  title: 'Dispute Approved!',
  message: 'Your dispute for TXN-2025-0147 was approved. An adjustment of $42.50 will be applied.',
  read: false,
  createdAt: hoursAgo(2),
  linkTo: '/transactions/disputes/dispute-maria-txn0147',
};

// Default quarantine items for data quality demo
const DEFAULT_QUARANTINE_ITEMS: QuarantineItem[] = [
  {
    id: 'q-001',
    tenantId: 'retailco',
    source: 'POS',
    recordType: 'transaction',
    recordId: 'TXN-MISSING-001',
    errorType: 'missing_field',
    errorMessage: 'Transaction missing store_id',
    severity: 'critical',
    status: 'pending',
    detectedAt: hoursAgo(8),
  },
  {
    id: 'q-002',
    tenantId: 'retailco',
    source: 'POS',
    recordType: 'transaction',
    recordId: 'TXN-2025-0201',
    errorType: 'duplicate',
    errorMessage: 'Duplicate transaction detected',
    severity: 'warning',
    status: 'pending',
    detectedAt: hoursAgo(6),
  },
  {
    id: 'q-003',
    tenantId: 'retailco',
    source: 'POS',
    recordType: 'transaction',
    recordId: 'TXN-2025-0215',
    errorType: 'anomaly',
    errorMessage: 'Unusually high amount detected ($15,000)',
    severity: 'warning',
    status: 'pending',
    detectedAt: hoursAgo(4),
  },
  {
    id: 'q-004',
    tenantId: 'retailco',
    source: 'POS',
    recordType: 'transaction',
    recordId: 'TXN-2025-0220',
    errorType: 'invalid_format',
    errorMessage: 'Invalid date: 2025-02-30',
    severity: 'warning',
    status: 'pending',
    detectedAt: hoursAgo(3),
  },
  {
    id: 'q-005',
    tenantId: 'retailco',
    source: 'HR',
    recordType: 'employee',
    recordId: 'emp-new-001',
    errorType: 'missing_field',
    errorMessage: 'Employee missing certification status',
    severity: 'info',
    status: 'pending',
    detectedAt: hoursAgo(2),
  },
];

// Define all demo states
export const DEMO_STATES: DemoStateConfig[] = [
  {
    id: 'initial',
    name: 'Fresh Demo',
    nameEs: 'Demo Inicial',
    description: 'Maria has an attribution issue but hasn\'t submitted a dispute yet. Start here to show the full dispute flow.',
    descriptionEs: 'María tiene un problema de atribución pero no ha enviado una disputa. Comienza aquí para mostrar el flujo completo.',
    storageData: {
      disputes: [MARIA_DRAFT_DISPUTE],
      adjustments: [],
      notifications: [],
      quarantine: DEFAULT_QUARANTINE_ITEMS,
    },
  },
  {
    id: 'disputed',
    name: 'Dispute Submitted',
    nameEs: 'Disputa Enviada',
    description: 'Maria has submitted her dispute. Switch to Carlos to demonstrate the manager review process.',
    descriptionEs: 'María ha enviado su disputa. Cambia a Carlos para demostrar el proceso de revisión del gerente.',
    storageData: {
      disputes: [MARIA_SUBMITTED_DISPUTE],
      adjustments: [],
      notifications: [],
      quarantine: DEFAULT_QUARANTINE_ITEMS,
    },
  },
  {
    id: 'resolved',
    name: 'Dispute Resolved',
    nameEs: 'Disputa Resuelta',
    description: 'Carlos has approved Maria\'s dispute. Maria has a notification and an adjustment applied.',
    descriptionEs: 'Carlos ha aprobado la disputa de María. María tiene una notificación y un ajuste aplicado.',
    storageData: {
      disputes: [MARIA_RESOLVED_DISPUTE],
      adjustments: [MARIA_ADJUSTMENT],
      notifications: [MARIA_RESOLUTION_NOTIFICATION],
      quarantine: DEFAULT_QUARANTINE_ITEMS,
    },
  },
  {
    id: 'data_dirty',
    name: 'Data Quality Issues',
    nameEs: 'Problemas de Calidad',
    description: 'Multiple data quality issues in quarantine. Use Sofia to demonstrate the data quality resolution workflow.',
    descriptionEs: 'Múltiples problemas de calidad de datos en cuarentena. Usa a Sofia para demostrar el flujo de resolución.',
    storageData: {
      disputes: [MARIA_DRAFT_DISPUTE],
      adjustments: [],
      notifications: [],
      quarantine: DEFAULT_QUARANTINE_ITEMS,
    },
  },
  {
    id: 'data_clean',
    name: 'Data Clean',
    nameEs: 'Datos Limpios',
    description: 'All data quality issues resolved. Good for showing the "healthy" state of the system.',
    descriptionEs: 'Todos los problemas de calidad resueltos. Ideal para mostrar el estado "saludable" del sistema.',
    storageData: {
      disputes: [MARIA_DRAFT_DISPUTE],
      adjustments: [],
      notifications: [],
      quarantine: [],
    },
  },
];

// Get state config by ID
export function getDemoState(stateId: DemoState): DemoStateConfig | undefined {
  return DEMO_STATES.find((s) => s.id === stateId);
}

// Get display name based on locale
export function getDemoStateName(stateId: DemoState, isSpanish: boolean): string {
  const state = getDemoState(stateId);
  if (!state) return stateId;
  return isSpanish ? state.nameEs : state.name;
}

// Get description based on locale
export function getDemoStateDescription(stateId: DemoState, isSpanish: boolean): string {
  const state = getDemoState(stateId);
  if (!state) return '';
  return isSpanish ? state.descriptionEs : state.description;
}
