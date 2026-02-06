import { approvalService } from './approval-service';

export type PayoutStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'processing' | 'completed';

export interface PayoutEmployee {
  id: string;
  name: string;
  role: string;
  location: string;
  baseEarnings: number;
  incentives: number;
  adjustments: number;
  total: number;
  transactions: number;
  disputes: number;
}

export interface PayoutBatch {
  id: string;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  status: PayoutStatus;
  createdAt: string;
  createdBy: string;
  approvedAt?: string;
  approvedBy?: string;
  rejectedAt?: string;
  rejectedBy?: string;
  rejectionReason?: string;
  employees: PayoutEmployee[];
  totalAmount: number;
  employeeCount: number;
  notes?: string;
}

// Demo data for January 2025 payout
const DEMO_EMPLOYEES: PayoutEmployee[] = [
  {
    id: 'maria-rodriguez',
    name: 'Maria Rodriguez',
    role: 'Sales Associate',
    location: 'Downtown Flagship',
    baseEarnings: 0,
    incentives: 1359.00,
    adjustments: 0,
    total: 1359.00,
    transactions: 12,
    disputes: 1,
  },
  {
    id: 'james-wilson',
    name: 'James Wilson',
    role: 'Senior Sales Associate',
    location: 'Downtown Flagship',
    baseEarnings: 0,
    incentives: 1842.50,
    adjustments: 0,
    total: 1842.50,
    transactions: 18,
    disputes: 0,
  },
  {
    id: 'sarah-chen',
    name: 'Sarah Chen',
    role: 'Sales Associate',
    location: 'Westside Mall',
    baseEarnings: 0,
    incentives: 1125.00,
    adjustments: 75.00,
    total: 1200.00,
    transactions: 10,
    disputes: 0,
  },
  {
    id: 'david-kim',
    name: 'David Kim',
    role: 'Sales Associate',
    location: 'Airport Location',
    baseEarnings: 0,
    incentives: 987.50,
    adjustments: 0,
    total: 987.50,
    transactions: 8,
    disputes: 0,
  },
  {
    id: 'lisa-thompson',
    name: 'Lisa Thompson',
    role: 'Lead Sales Associate',
    location: 'Downtown Flagship',
    baseEarnings: 0,
    incentives: 2156.00,
    adjustments: -50.00,
    total: 2106.00,
    transactions: 22,
    disputes: 0,
  },
];

const DEMO_BATCHES: PayoutBatch[] = [
  {
    id: 'PAYOUT-2025-01',
    periodLabel: 'January 2025',
    periodStart: '2025-01-01',
    periodEnd: '2025-01-31',
    status: 'pending_approval',
    createdAt: '2025-01-28T10:00:00Z',
    createdBy: 'System',
    employees: DEMO_EMPLOYEES,
    totalAmount: DEMO_EMPLOYEES.reduce((sum, e) => sum + e.total, 0),
    employeeCount: DEMO_EMPLOYEES.length,
    notes: 'Monthly incentive payout for RetailCo Optical Sales team. Note: 1 pending dispute for Maria Rodriguez (TXN-2025-0147).',
  },
  {
    id: 'PAYOUT-2024-12',
    periodLabel: 'December 2024',
    periodStart: '2024-12-01',
    periodEnd: '2024-12-31',
    status: 'completed',
    createdAt: '2024-12-28T10:00:00Z',
    createdBy: 'System',
    approvedAt: '2024-12-29T14:30:00Z',
    approvedBy: 'Mike Chen',
    employees: DEMO_EMPLOYEES.map(e => ({
      ...e,
      incentives: e.incentives * 1.15,
      total: e.total * 1.15,
    })),
    totalAmount: DEMO_EMPLOYEES.reduce((sum, e) => sum + e.total, 0) * 1.15,
    employeeCount: DEMO_EMPLOYEES.length,
  },
  {
    id: 'PAYOUT-2024-11',
    periodLabel: 'November 2024',
    periodStart: '2024-11-01',
    periodEnd: '2024-11-30',
    status: 'completed',
    createdAt: '2024-11-28T10:00:00Z',
    createdBy: 'System',
    approvedAt: '2024-11-29T09:15:00Z',
    approvedBy: 'Mike Chen',
    employees: DEMO_EMPLOYEES.map(e => ({
      ...e,
      incentives: e.incentives * 0.95,
      total: e.total * 0.95,
    })),
    totalAmount: DEMO_EMPLOYEES.reduce((sum, e) => sum + e.total, 0) * 0.95,
    employeeCount: DEMO_EMPLOYEES.length,
  },
];

class PayoutService {
  private getStorageKey(): string {
    return 'payout_batches';
  }

  initialize(): void {
    const existing = this.getAllBatches();
    if (existing.length === 0) {
      localStorage.setItem(this.getStorageKey(), JSON.stringify(DEMO_BATCHES));
    }
  }

  getAllBatches(): PayoutBatch[] {
    try {
      const stored = localStorage.getItem(this.getStorageKey());
      if (!stored) {
        // Initialize with demo data
        localStorage.setItem(this.getStorageKey(), JSON.stringify(DEMO_BATCHES));
        return DEMO_BATCHES;
      }
      return JSON.parse(stored);
    } catch {
      return DEMO_BATCHES;
    }
  }

  getBatchById(id: string): PayoutBatch | null {
    const batches = this.getAllBatches();
    return batches.find(b => b.id === id) || null;
  }

  getPendingBatches(): PayoutBatch[] {
    return this.getAllBatches().filter(b => b.status === 'pending_approval');
  }

  getCompletedBatches(): PayoutBatch[] {
    return this.getAllBatches().filter(b => b.status === 'completed');
  }

  approveBatch(batchId: string, approverName: string, comment?: string): PayoutBatch | null {
    const batches = this.getAllBatches();
    const batch = batches.find(b => b.id === batchId);

    if (!batch || batch.status !== 'pending_approval') {
      return null;
    }

    batch.status = 'approved';
    batch.approvedAt = new Date().toISOString();
    batch.approvedBy = approverName;

    // Create approval record
    approvalService.createRequest({
      requestType: 'payout_batch',
      tier: 2,
      changeData: {
        batchId: batch.id,
        periodLabel: batch.periodLabel,
        totalAmount: batch.totalAmount,
        employeeCount: batch.employeeCount,
      },
      reason: comment || `Approved payout batch for ${batch.periodLabel}`,
    });

    localStorage.setItem(this.getStorageKey(), JSON.stringify(batches));

    // Simulate processing and completion after approval
    setTimeout(() => {
      this.completeBatch(batchId);
    }, 2000);

    return batch;
  }

  rejectBatch(batchId: string, rejectorName: string, reason: string): PayoutBatch | null {
    const batches = this.getAllBatches();
    const batch = batches.find(b => b.id === batchId);

    if (!batch || batch.status !== 'pending_approval') {
      return null;
    }

    batch.status = 'rejected';
    batch.rejectedAt = new Date().toISOString();
    batch.rejectedBy = rejectorName;
    batch.rejectionReason = reason;

    localStorage.setItem(this.getStorageKey(), JSON.stringify(batches));
    return batch;
  }

  private completeBatch(batchId: string): void {
    const batches = this.getAllBatches();
    const batch = batches.find(b => b.id === batchId);

    if (batch && batch.status === 'approved') {
      batch.status = 'completed';
      localStorage.setItem(this.getStorageKey(), JSON.stringify(batches));
    }
  }

  getStats(): {
    pendingCount: number;
    pendingAmount: number;
    completedCount: number;
    completedAmount: number;
    totalEmployees: number;
  } {
    const batches = this.getAllBatches();
    const pending = batches.filter(b => b.status === 'pending_approval');
    const completed = batches.filter(b => b.status === 'completed');

    return {
      pendingCount: pending.length,
      pendingAmount: pending.reduce((sum, b) => sum + b.totalAmount, 0),
      completedCount: completed.length,
      completedAmount: completed.reduce((sum, b) => sum + b.totalAmount, 0),
      totalEmployees: pending.reduce((sum, b) => sum + b.employeeCount, 0),
    };
  }

  // For demo: update employee in batch
  updateEmployeeInBatch(batchId: string, employeeId: string, updates: Partial<PayoutEmployee>): PayoutBatch | null {
    const batches = this.getAllBatches();
    const batch = batches.find(b => b.id === batchId);

    if (!batch) return null;

    const employee = batch.employees.find(e => e.id === employeeId);
    if (employee) {
      Object.assign(employee, updates);
      employee.total = employee.baseEarnings + employee.incentives + employee.adjustments;
      batch.totalAmount = batch.employees.reduce((sum, e) => sum + e.total, 0);
    }

    localStorage.setItem(this.getStorageKey(), JSON.stringify(batches));
    return batch;
  }
}

export const payoutService = new PayoutService();
