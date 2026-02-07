/**
 * Foundation Demo Data
 *
 * Seeds demo data for F1-F4 modules:
 * - Data Architecture (Import Batches, Records)
 * - Approval Routing (Approval Requests)
 * - Import Pipeline
 * - Rollback (Checkpoints)
 */

import type { ImportBatch, Checkpoint } from '../data-architecture/types';
import type { ApprovalRequest } from '../approval-routing/types';

// ============================================
// STORAGE KEYS
// ============================================

export const FOUNDATION_STORAGE_KEYS = {
  IMPORT_BATCHES: 'foundation_import_batches',
  RAW_RECORDS: 'foundation_raw_records',
  TRANSFORMED_RECORDS: 'foundation_transformed_records',
  COMMITTED_RECORDS: 'foundation_committed_records',
  APPROVAL_REQUESTS: 'foundation_approval_requests',
  CHECKPOINTS: 'foundation_checkpoints',
};

// ============================================
// HELPER FUNCTIONS
// ============================================

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

// ============================================
// DEMO IMPORT BATCHES
// ============================================

const DEMO_IMPORT_BATCHES: ImportBatch[] = [
  {
    id: 'batch-001',
    tenantId: 'retailco',
    sourceSystem: 'POS Export',
    sourceFormat: 'csv',
    fileName: 'january_transactions.csv',
    importedAt: daysAgo(5),
    importedBy: 'sofia',
    status: 'approved',
    approvalId: 'approval-batch-001',
    summary: {
      totalRecords: 1247,
      cleanRecords: 1180,
      autoCorrectedRecords: 52,
      quarantinedRecords: 12,
      rejectedRecords: 3,
      dataQualityScore: 94,
      financialImpact: {
        totalCompensationValue: 87500,
        currency: 'USD',
        affectedEmployees: 45,
        affectedPeriods: ['2025-01'],
      },
      anomalyFlags: [],
    },
  },
  {
    id: 'batch-002',
    tenantId: 'retailco',
    sourceSystem: 'HRIS Sync',
    sourceFormat: 'json',
    fileName: 'employee_updates_q1.json',
    importedAt: daysAgo(3),
    importedBy: 'admin',
    status: 'approved',
    approvalId: 'approval-batch-002',
    summary: {
      totalRecords: 156,
      cleanRecords: 150,
      autoCorrectedRecords: 4,
      quarantinedRecords: 2,
      rejectedRecords: 0,
      dataQualityScore: 98,
      financialImpact: {
        totalCompensationValue: 0,
        currency: 'USD',
        affectedEmployees: 156,
        affectedPeriods: ['2025-Q1'],
      },
      anomalyFlags: [],
    },
  },
  {
    id: 'batch-003',
    tenantId: 'retailco',
    sourceSystem: 'Salesforce',
    sourceFormat: 'csv',
    fileName: 'opportunities_feb.csv',
    importedAt: hoursAgo(12),
    importedBy: 'sofia',
    status: 'awaiting_approval',
    approvalId: 'approval-batch-003',
    summary: {
      totalRecords: 523,
      cleanRecords: 480,
      autoCorrectedRecords: 28,
      quarantinedRecords: 10,
      rejectedRecords: 5,
      dataQualityScore: 89,
      financialImpact: {
        totalCompensationValue: 125000,
        currency: 'USD',
        affectedEmployees: 32,
        affectedPeriods: ['2025-02'],
      },
      anomalyFlags: [
        {
          type: 'value_outlier',
          severity: 'warning',
          message: '3 records with amounts 3x above average',
          affectedRecords: 3,
        },
      ],
    },
  },
  {
    id: 'batch-004',
    tenantId: 'retailco',
    sourceSystem: 'Manual Entry',
    sourceFormat: 'csv',
    fileName: 'commission_adjustments.csv',
    importedAt: hoursAgo(4),
    importedBy: 'carlos',
    status: 'awaiting_approval',
    approvalId: 'approval-batch-004',
    summary: {
      totalRecords: 15,
      cleanRecords: 12,
      autoCorrectedRecords: 2,
      quarantinedRecords: 1,
      rejectedRecords: 0,
      dataQualityScore: 86,
      financialImpact: {
        totalCompensationValue: 8750,
        currency: 'USD',
        affectedEmployees: 8,
        affectedPeriods: ['2025-01', '2025-02'],
      },
      anomalyFlags: [],
    },
  },
  {
    id: 'batch-005',
    tenantId: 'retailco',
    sourceSystem: 'Legacy ERP',
    sourceFormat: 'tsv',
    fileName: 'historical_corrections.tsv',
    importedAt: daysAgo(10),
    importedBy: 'admin',
    status: 'rolled_back',
    summary: {
      totalRecords: 89,
      cleanRecords: 75,
      autoCorrectedRecords: 8,
      quarantinedRecords: 4,
      rejectedRecords: 2,
      dataQualityScore: 82,
      financialImpact: {
        totalCompensationValue: 15200,
        currency: 'USD',
        affectedEmployees: 12,
        affectedPeriods: ['2024-Q4'],
      },
      anomalyFlags: [],
    },
  },
];

// ============================================
// DEMO APPROVAL REQUESTS
// ============================================

const DEMO_APPROVAL_REQUESTS: ApprovalRequest[] = [
  {
    id: 'approval-batch-003',
    domain: 'import_batch',
    tenantId: 'retailco',
    requestedBy: 'sofia',
    requestedAt: hoursAgo(12),
    status: 'pending',
    summary: {
      title: 'Import Batch #003',
      titleEs: 'Lote de Importacion #003',
      description: '523 records from Salesforce',
      descriptionEs: '523 registros de Salesforce',
      actionType: 'Import 523 records',
      actionTypeEs: 'Importar 523 registros',
    },
    impactRating: {
      overall: 6,
      dimensions: {
        financial: 7,
        employeeCount: 5,
        periodStatus: 4,
        cascadeScope: 3,
        timelineSensitivity: 5,
        regulatoryRisk: 2,
      },
    },
    impactDetails: [
      {
        dimension: 'financial',
        label: 'Financial Impact',
        labelEs: 'Impacto Financiero',
        description: '$125,000 in commissions affected',
        descriptionEs: '$125,000 en comisiones afectadas',
        value: '$125,000',
        severity: 'high',
      },
      {
        dimension: 'employeeCount',
        label: 'Employees Affected',
        labelEs: 'Empleados Afectados',
        description: '32 sales representatives',
        descriptionEs: '32 representantes de ventas',
        value: '32 employees',
        severity: 'medium',
      },
    ],
    recommendation: {
      action: 'review',
      confidence: 75,
      reasoning: 'Medium-high impact import requires careful review before approval.',
      reasoningEs: 'Importacion de impacto medio-alto requiere revision cuidadosa.',
    },
    chain: {
      type: 'sequential',
      currentStep: 0,
      steps: [
        {
          stepNumber: 1,
          approverRole: 'data_manager',
          status: 'pending',
        },
        {
          stepNumber: 2,
          approverRole: 'finance_admin',
          status: 'pending',
        },
      ],
    },
    auditTrail: [
      {
        timestamp: hoursAgo(12),
        action: 'created',
        userId: 'sofia',
        userName: 'Sofia Martinez',
        details: 'Approval request created for import batch',
      },
    ],
    sourceEntityId: 'batch-003',
    sourceEntityType: 'import_batch',
  },
  {
    id: 'approval-batch-004',
    domain: 'import_batch',
    tenantId: 'retailco',
    requestedBy: 'carlos',
    requestedAt: hoursAgo(4),
    status: 'pending',
    summary: {
      title: 'Import Batch #004',
      titleEs: 'Lote de Importacion #004',
      description: '15 commission adjustments',
      descriptionEs: '15 ajustes de comision',
      actionType: 'Import 15 records',
      actionTypeEs: 'Importar 15 registros',
    },
    impactRating: {
      overall: 4,
      dimensions: {
        financial: 4,
        employeeCount: 3,
        periodStatus: 5,
        cascadeScope: 2,
        timelineSensitivity: 4,
        regulatoryRisk: 1,
      },
    },
    impactDetails: [
      {
        dimension: 'financial',
        label: 'Financial Impact',
        labelEs: 'Impacto Financiero',
        description: '$8,750 in adjustments',
        descriptionEs: '$8,750 en ajustes',
        value: '$8,750',
        severity: 'medium',
      },
    ],
    recommendation: {
      action: 'approve',
      confidence: 85,
      reasoning: 'Low-impact batch with standard adjustments. Safe to approve.',
      reasoningEs: 'Lote de bajo impacto con ajustes estandar. Seguro para aprobar.',
    },
    chain: {
      type: 'single',
      currentStep: 0,
      steps: [
        {
          stepNumber: 1,
          approverRole: 'finance_admin',
          status: 'pending',
        },
      ],
    },
    auditTrail: [
      {
        timestamp: hoursAgo(4),
        action: 'created',
        userId: 'carlos',
        userName: 'Carlos Mendez',
        details: 'Approval request created for commission adjustments',
      },
    ],
    sourceEntityId: 'batch-004',
    sourceEntityType: 'import_batch',
  },
  {
    id: 'approval-plan-update',
    domain: 'compensation_plan',
    tenantId: 'retailco',
    requestedBy: 'admin',
    requestedAt: daysAgo(1),
    status: 'pending',
    summary: {
      title: 'Q2 Plan Rate Change',
      titleEs: 'Cambio de Tasa Plan Q2',
      description: 'Increase base rate from 3% to 3.5%',
      descriptionEs: 'Aumentar tasa base de 3% a 3.5%',
      actionType: 'Compensation Plan Update',
      actionTypeEs: 'Actualizacion de Plan',
    },
    impactRating: {
      overall: 8,
      dimensions: {
        financial: 9,
        employeeCount: 8,
        periodStatus: 6,
        cascadeScope: 7,
        timelineSensitivity: 5,
        regulatoryRisk: 3,
      },
    },
    impactDetails: [
      {
        dimension: 'financial',
        label: 'Financial Impact',
        labelEs: 'Impacto Financiero',
        description: '$450,000 annual compensation increase',
        descriptionEs: '$450,000 incremento anual de compensacion',
        value: '$450,000',
        severity: 'critical',
      },
      {
        dimension: 'employeeCount',
        label: 'Employees Affected',
        labelEs: 'Empleados Afectados',
        description: 'All 156 sales representatives',
        descriptionEs: 'Los 156 representantes de ventas',
        value: '156 employees',
        severity: 'high',
      },
      {
        dimension: 'cascadeScope',
        label: 'Downstream Impact',
        labelEs: 'Impacto Derivado',
        description: '3,420 commission calculations will be recalculated',
        descriptionEs: '3,420 calculos de comision seran recalculados',
        value: '3,420 recalculations',
        severity: 'high',
      },
    ],
    recommendation: {
      action: 'escalate',
      confidence: 90,
      reasoning: 'High-impact plan change affecting all reps. Requires executive approval.',
      reasoningEs: 'Cambio de plan de alto impacto. Requiere aprobacion ejecutiva.',
    },
    chain: {
      type: 'sequential',
      currentStep: 0,
      steps: [
        {
          stepNumber: 1,
          approverRole: 'comp_admin',
          status: 'pending',
        },
        {
          stepNumber: 2,
          approverRole: 'finance_director',
          status: 'pending',
        },
        {
          stepNumber: 3,
          approverId: 'cfo',
          approverName: 'CFO',
          status: 'pending',
        },
      ],
    },
    auditTrail: [
      {
        timestamp: daysAgo(1),
        action: 'created',
        userId: 'admin',
        userName: 'System Admin',
        details: 'Approval request created for Q2 plan rate change',
      },
    ],
    sourceEntityId: 'plan-q2-2025',
    sourceEntityType: 'compensation_plan',
  },
  {
    id: 'approval-adjustment-001',
    domain: 'manual_adjustment',
    tenantId: 'retailco',
    requestedBy: 'carlos',
    requestedAt: daysAgo(2),
    status: 'approved',
    summary: {
      title: 'Manual Adjustment - Maria Rodriguez',
      titleEs: 'Ajuste Manual - Maria Rodriguez',
      description: 'Split credit for TXN-2025-0147',
      descriptionEs: 'Credito dividido para TXN-2025-0147',
      actionType: 'Manual Adjustment',
      actionTypeEs: 'Ajuste Manual',
    },
    impactRating: {
      overall: 2,
      dimensions: {
        financial: 2,
        employeeCount: 1,
        periodStatus: 3,
        cascadeScope: 1,
        timelineSensitivity: 2,
        regulatoryRisk: 1,
      },
    },
    impactDetails: [
      {
        dimension: 'financial',
        label: 'Financial Impact',
        labelEs: 'Impacto Financiero',
        description: 'Single adjustment of $42.50',
        descriptionEs: 'Ajuste unico de $42.50',
        value: '$42.50',
        severity: 'low',
      },
    ],
    recommendation: {
      action: 'approve',
      confidence: 95,
      reasoning: 'Low-impact single adjustment with proper documentation.',
      reasoningEs: 'Ajuste individual de bajo impacto con documentacion adecuada.',
    },
    chain: {
      type: 'single',
      currentStep: 1,
      steps: [
        {
          stepNumber: 1,
          approverRole: 'store_manager',
          status: 'approved',
          decidedBy: 'carlos',
          decidedAt: daysAgo(1),
        },
      ],
    },
    resolution: {
      decidedBy: 'carlos',
      decidedAt: daysAgo(1),
      decision: 'approved',
      notes: 'Verified with POS system. Split credit approved per store policy.',
    },
    auditTrail: [
      {
        timestamp: daysAgo(2),
        action: 'created',
        userId: 'carlos',
        userName: 'Carlos Mendez',
        details: 'Approval request created for manual adjustment',
      },
      {
        timestamp: daysAgo(1),
        action: 'approved',
        userId: 'carlos',
        userName: 'Carlos Mendez',
        details: 'Approved after verification with POS system',
      },
    ],
    sourceEntityId: 'adj-maria-0147',
    sourceEntityType: 'adjustment',
  },
];

// ============================================
// DEMO CHECKPOINTS
// ============================================

const DEMO_CHECKPOINTS: Checkpoint[] = [
  {
    id: 'checkpoint-001',
    tenantId: 'retailco',
    name: 'January Close',
    description: 'System state after January 2025 month-end close',
    createdAt: daysAgo(7),
    createdBy: 'admin',
    snapshotData: {
      batchIds: ['batch-001', 'batch-002'],
      recordCounts: {
        raw: 1403,
        transformed: 1380,
        committed: 1330,
      },
    },
  },
  {
    id: 'checkpoint-002',
    tenantId: 'retailco',
    name: 'Pre-Rate Change',
    description: 'Checkpoint before Q2 rate changes implementation',
    createdAt: daysAgo(2),
    createdBy: 'sofia',
    snapshotData: {
      batchIds: ['batch-001', 'batch-002', 'batch-003', 'batch-004'],
      recordCounts: {
        raw: 1941,
        transformed: 1890,
        committed: 1820,
      },
    },
  },
];

// ============================================
// SEEDING FUNCTIONS
// ============================================

/**
 * Seed all foundation demo data
 */
export function seedFoundationDemoData(): void {
  if (typeof window === 'undefined') return;

  // Seed import batches
  localStorage.setItem(
    FOUNDATION_STORAGE_KEYS.IMPORT_BATCHES,
    JSON.stringify(DEMO_IMPORT_BATCHES)
  );

  // Seed approval requests
  localStorage.setItem(
    FOUNDATION_STORAGE_KEYS.APPROVAL_REQUESTS,
    JSON.stringify(DEMO_APPROVAL_REQUESTS)
  );

  // Seed checkpoints
  localStorage.setItem(
    FOUNDATION_STORAGE_KEYS.CHECKPOINTS,
    JSON.stringify(DEMO_CHECKPOINTS)
  );

  console.log('[Foundation Demo] Demo data seeded successfully');
}

/**
 * Clear all foundation demo data
 */
export function clearFoundationDemoData(): void {
  if (typeof window === 'undefined') return;

  Object.values(FOUNDATION_STORAGE_KEYS).forEach((key) => {
    localStorage.removeItem(key);
  });

  console.log('[Foundation Demo] Demo data cleared');
}

/**
 * Check if foundation demo data is seeded
 */
export function isFoundationDataSeeded(): boolean {
  if (typeof window === 'undefined') return false;

  return localStorage.getItem(FOUNDATION_STORAGE_KEYS.IMPORT_BATCHES) !== null;
}

/**
 * Get seeded import batches
 */
export function getSeededImportBatches(): ImportBatch[] {
  if (typeof window === 'undefined') return [];

  const stored = localStorage.getItem(FOUNDATION_STORAGE_KEYS.IMPORT_BATCHES);
  if (!stored) return [];

  try {
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

/**
 * Get seeded approval requests
 */
export function getSeededApprovalRequests(): ApprovalRequest[] {
  if (typeof window === 'undefined') return [];

  const stored = localStorage.getItem(FOUNDATION_STORAGE_KEYS.APPROVAL_REQUESTS);
  if (!stored) return [];

  try {
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

/**
 * Get seeded checkpoints
 */
export function getSeededCheckpoints(): Checkpoint[] {
  if (typeof window === 'undefined') return [];

  const stored = localStorage.getItem(FOUNDATION_STORAGE_KEYS.CHECKPOINTS);
  if (!stored) return [];

  try {
    return JSON.parse(stored);
  } catch {
    return [];
  }
}
