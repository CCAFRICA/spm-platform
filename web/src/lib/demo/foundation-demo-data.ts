/**
 * Foundation Demo Data
 *
 * Seeds demo data for F1-F4 modules:
 * - Data Architecture (Import Batches, Records)
 * - Approval Routing (Approval Requests)
 * - Import Pipeline
 * - Rollback (Checkpoints)
 *
 * localStorage removed -- seeding/clearing are no-ops, getters return empty.
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function hoursAgo(hours: number): string {
  const date = new Date();
  date.setHours(date.getHours() - hours);
  return date.toISOString();
}

// ============================================
// SEEDING FUNCTIONS
// ============================================

/**
 * Seed all foundation demo data
 */
export function seedFoundationDemoData(): void {
  // No-op: localStorage removed
  console.log('[Foundation Demo] Demo data seeded successfully');
}

/**
 * Clear all foundation demo data
 */
export function clearFoundationDemoData(): void {
  // No-op: localStorage removed
  console.log('[Foundation Demo] Demo data cleared');
}

/**
 * Check if foundation demo data is seeded
 */
export function isFoundationDataSeeded(): boolean {
  return false;
}

/**
 * Get seeded import batches
 */
export function getSeededImportBatches(): ImportBatch[] {
  return [];
}

/**
 * Get seeded approval requests
 */
export function getSeededApprovalRequests(): ApprovalRequest[] {
  return [];
}

/**
 * Get seeded checkpoints
 */
export function getSeededCheckpoints(): Checkpoint[] {
  return [];
}
