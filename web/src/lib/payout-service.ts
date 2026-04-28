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
  entityCount: number;
  notes?: string;
}

class PayoutService {
  initialize(): void {
    // no-op: localStorage removed
  }

  getAllBatches(): PayoutBatch[] {
    return [];
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

    approvalService.createRequest({
      requestType: 'payout_batch',
      tier: 2,
      changeData: {
        batchId: batch.id,
        periodLabel: batch.periodLabel,
        totalAmount: batch.totalAmount,
        entityCount: batch.entityCount,
      },
      reason: comment || `Approved payout batch for ${batch.periodLabel}`,
    });

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

    return batch;
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
      totalEmployees: pending.reduce((sum, b) => sum + b.entityCount, 0),
    };
  }

  updateEmployeeInBatch(batchId: string, entityId: string, updates: Partial<PayoutEmployee>): PayoutBatch | null {
    const batches = this.getAllBatches();
    const batch = batches.find(b => b.id === batchId);

    if (!batch) return null;

    const employee = batch.employees.find(e => e.id === entityId);
    if (employee) {
      Object.assign(employee, updates);
      employee.total = employee.baseEarnings + employee.incentives + employee.adjustments;
      batch.totalAmount = batch.employees.reduce((sum, e) => sum + e.total, 0);
    }

    return batch;
  }
}

export const payoutService = new PayoutService();
