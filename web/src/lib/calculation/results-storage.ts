/**
 * Calculation Results Storage Service
 *
 * OB-29 Phase 7: Manages calculation results with lifecycle
 * - preview → approved → published
 * - Per-employee result persistence
 * - Chunked storage for large datasets (719+ employees)
 *
 * DESIGN PRINCIPLES:
 * - Results are IMMUTABLE once published
 * - Each calculation run creates a new version
 * - Results include full audit trail (who/when/why)
 */

import type { CalculationResult } from '@/types/compensation-plan';

// ============================================
// TYPES
// ============================================

export type CalculationStatus = 'preview' | 'approved' | 'published';

export interface CalculationRun {
  id: string;
  tenantId: string;
  period: string;  // YYYY-MM format
  status: CalculationStatus;
  planId: string;
  planName: string;
  planVersion: number;

  // Summary stats
  totalEmployees: number;
  totalPayout: number;
  currency: string;

  // Audit trail
  calculatedBy: string;
  calculatedAt: string;
  approvedBy?: string;
  approvedAt?: string;
  publishedBy?: string;
  publishedAt?: string;

  // Warnings/notes
  warnings?: string[];
  notes?: string;
}

export interface StoredResult {
  runId: string;
  result: CalculationResult;
}

// Storage keys
const STORAGE_KEY_RUNS = 'calculation_runs';
const STORAGE_KEY_RESULTS_PREFIX = 'calculation_results_';
const CHUNK_SIZE = 50; // Results per localStorage key

// ============================================
// RUN MANAGEMENT
// ============================================

/**
 * Get all calculation runs for a tenant
 */
export function getCalculationRuns(tenantId: string): CalculationRun[] {
  const runs = getAllRuns();
  return runs.filter((r) => r.tenantId === tenantId);
}

/**
 * Get a specific calculation run by ID
 */
export function getCalculationRun(runId: string): CalculationRun | null {
  const runs = getAllRuns();
  return runs.find((r) => r.id === runId) || null;
}

/**
 * Get the latest run for a tenant/period
 */
export function getLatestRun(tenantId: string, period: string): CalculationRun | null {
  const runs = getCalculationRuns(tenantId)
    .filter((r) => r.period === period)
    .sort((a, b) => new Date(b.calculatedAt).getTime() - new Date(a.calculatedAt).getTime());

  return runs[0] || null;
}

/**
 * Get the published run for a tenant/period (if any)
 */
export function getPublishedRun(tenantId: string, period: string): CalculationRun | null {
  const runs = getCalculationRuns(tenantId)
    .filter((r) => r.period === period && r.status === 'published');

  return runs[0] || null;
}

/**
 * Create a new calculation run with preview status
 */
export function createCalculationRun(params: {
  tenantId: string;
  period: string;
  planId: string;
  planName: string;
  planVersion: number;
  totalEmployees: number;
  totalPayout: number;
  currency: string;
  calculatedBy: string;
  warnings?: string[];
  notes?: string;
}): CalculationRun {
  const now = new Date().toISOString();

  const run: CalculationRun = {
    id: `run-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    tenantId: params.tenantId,
    period: params.period,
    status: 'preview',
    planId: params.planId,
    planName: params.planName,
    planVersion: params.planVersion,
    totalEmployees: params.totalEmployees,
    totalPayout: params.totalPayout,
    currency: params.currency,
    calculatedBy: params.calculatedBy,
    calculatedAt: now,
    warnings: params.warnings,
    notes: params.notes,
  };

  const runs = getAllRuns();
  runs.push(run);
  saveRuns(runs);

  console.log(`[ResultsStorage] Created run ${run.id}: ${run.totalEmployees} employees, ${formatCurrency(run.totalPayout, run.currency)}`);

  return run;
}

/**
 * Approve a calculation run (preview → approved)
 */
export function approveCalculationRun(runId: string, approvedBy: string): CalculationRun | null {
  const runs = getAllRuns();
  const runIndex = runs.findIndex((r) => r.id === runId);

  if (runIndex === -1) return null;

  const run = runs[runIndex];
  if (run.status !== 'preview') {
    console.warn(`[ResultsStorage] Cannot approve run ${runId}: status is ${run.status}`);
    return null;
  }

  runs[runIndex] = {
    ...run,
    status: 'approved',
    approvedBy,
    approvedAt: new Date().toISOString(),
  };

  saveRuns(runs);
  console.log(`[ResultsStorage] Approved run ${runId} by ${approvedBy}`);

  return runs[runIndex];
}

/**
 * Publish a calculation run (approved → published)
 * This makes results visible to employees
 */
export function publishCalculationRun(runId: string, publishedBy: string): CalculationRun | null {
  const runs = getAllRuns();
  const runIndex = runs.findIndex((r) => r.id === runId);

  if (runIndex === -1) return null;

  const run = runs[runIndex];
  if (run.status !== 'approved') {
    console.warn(`[ResultsStorage] Cannot publish run ${runId}: status is ${run.status}`);
    return null;
  }

  // Archive any existing published runs for the same tenant/period
  const now = new Date().toISOString();
  runs.forEach((r, i) => {
    if (
      r.id !== runId &&
      r.tenantId === run.tenantId &&
      r.period === run.period &&
      r.status === 'published'
    ) {
      // Keep the run but it's no longer the active published one
      // (In a real system, we might move to 'archived' status)
      runs[i] = { ...r, status: 'approved' };
    }
  });

  runs[runIndex] = {
    ...run,
    status: 'published',
    publishedBy,
    publishedAt: now,
  };

  saveRuns(runs);
  console.log(`[ResultsStorage] Published run ${runId} by ${publishedBy}`);

  return runs[runIndex];
}

/**
 * Delete a calculation run and its results
 * Only allowed for preview runs
 */
export function deleteCalculationRun(runId: string): boolean {
  const runs = getAllRuns();
  const run = runs.find((r) => r.id === runId);

  if (!run) return false;
  if (run.status !== 'preview') {
    console.warn(`[ResultsStorage] Cannot delete run ${runId}: status is ${run.status}`);
    return false;
  }

  // Delete results
  deleteResultsForRun(runId);

  // Delete run
  const filtered = runs.filter((r) => r.id !== runId);
  saveRuns(filtered);

  console.log(`[ResultsStorage] Deleted run ${runId}`);
  return true;
}

// ============================================
// RESULTS STORAGE (Chunked)
// ============================================

/**
 * Save calculation results for a run
 * Uses chunked storage to handle large datasets
 */
export function saveCalculationResults(runId: string, results: CalculationResult[]): void {
  if (typeof window === 'undefined') return;

  // Clear any existing results for this run
  deleteResultsForRun(runId);

  // Save in chunks
  const chunks = Math.ceil(results.length / CHUNK_SIZE);
  for (let i = 0; i < chunks; i++) {
    const chunkResults = results.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
    const key = `${STORAGE_KEY_RESULTS_PREFIX}${runId}_${i}`;
    localStorage.setItem(key, JSON.stringify(chunkResults));
  }

  // Save chunk count for retrieval
  localStorage.setItem(`${STORAGE_KEY_RESULTS_PREFIX}${runId}_meta`, JSON.stringify({ chunks }));

  console.log(`[ResultsStorage] Saved ${results.length} results for run ${runId} in ${chunks} chunks`);
}

/**
 * Get all calculation results for a run
 */
export function getCalculationResults(runId: string): CalculationResult[] {
  if (typeof window === 'undefined') return [];

  const metaKey = `${STORAGE_KEY_RESULTS_PREFIX}${runId}_meta`;
  const metaStr = localStorage.getItem(metaKey);
  if (!metaStr) return [];

  try {
    const meta = JSON.parse(metaStr);
    const results: CalculationResult[] = [];

    for (let i = 0; i < meta.chunks; i++) {
      const key = `${STORAGE_KEY_RESULTS_PREFIX}${runId}_${i}`;
      const chunkStr = localStorage.getItem(key);
      if (chunkStr) {
        const chunkResults = JSON.parse(chunkStr);
        results.push(...chunkResults);
      }
    }

    return results;
  } catch {
    return [];
  }
}

/**
 * Get a single employee's result from a run
 */
export function getEmployeeResult(runId: string, employeeId: string): CalculationResult | null {
  const results = getCalculationResults(runId);
  return results.find((r) => r.employeeId === employeeId) || null;
}

/**
 * Get a single employee's published result for a period
 * This is what the My Compensation page should use
 */
export function getPublishedEmployeeResult(
  tenantId: string,
  period: string,
  employeeId: string
): CalculationResult | null {
  const run = getPublishedRun(tenantId, period);
  if (!run) {
    console.log(`[ResultsStorage] No published run found for ${tenantId}/${period}`);
    return null;
  }

  return getEmployeeResult(run.id, employeeId);
}

/**
 * Get an employee's latest result (published or preview for admins)
 */
export function getLatestEmployeeResult(
  tenantId: string,
  period: string,
  employeeId: string
): { result: CalculationResult | null; status: CalculationStatus | null } {
  const run = getLatestRun(tenantId, period);
  if (!run) {
    return { result: null, status: null };
  }

  const result = getEmployeeResult(run.id, employeeId);
  return { result, status: run.status };
}

/**
 * Delete all results for a run
 */
function deleteResultsForRun(runId: string): void {
  if (typeof window === 'undefined') return;

  const metaKey = `${STORAGE_KEY_RESULTS_PREFIX}${runId}_meta`;
  const metaStr = localStorage.getItem(metaKey);

  if (metaStr) {
    try {
      const meta = JSON.parse(metaStr);
      for (let i = 0; i < meta.chunks; i++) {
        const key = `${STORAGE_KEY_RESULTS_PREFIX}${runId}_${i}`;
        localStorage.removeItem(key);
      }
    } catch {
      // Ignore
    }
  }

  localStorage.removeItem(metaKey);
}

// ============================================
// HELPERS
// ============================================

function getAllRuns(): CalculationRun[] {
  if (typeof window === 'undefined') return [];

  const stored = localStorage.getItem(STORAGE_KEY_RUNS);
  if (!stored) return [];

  try {
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

function saveRuns(runs: CalculationRun[]): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY_RUNS, JSON.stringify(runs));
  }
}

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount);
}

// ============================================
// CURRENT PERIOD HELPERS
// ============================================

/**
 * Get the current period string (YYYY-MM)
 */
export function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Get the previous period string (YYYY-MM)
 */
export function getPreviousPeriod(): string {
  const now = new Date();
  now.setMonth(now.getMonth() - 1);
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Format a period for display
 */
export function formatPeriod(period: string, locale: string = 'en-US'): string {
  const [year, month] = period.split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1);
  return date.toLocaleDateString(locale, { year: 'numeric', month: 'long' });
}

// ============================================
// CLEANUP
// ============================================

/**
 * Clean up old preview runs (older than 7 days)
 */
export function cleanupOldPreviews(tenantId: string): number {
  const runs = getAllRuns();
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  let cleaned = 0;

  const filtered = runs.filter((r) => {
    if (
      r.tenantId === tenantId &&
      r.status === 'preview' &&
      new Date(r.calculatedAt).getTime() < cutoff
    ) {
      deleteResultsForRun(r.id);
      cleaned++;
      return false;
    }
    return true;
  });

  if (cleaned > 0) {
    saveRuns(filtered);
    console.log(`[ResultsStorage] Cleaned up ${cleaned} old preview runs`);
  }

  return cleaned;
}

/**
 * Get storage usage statistics
 */
export function getStorageStats(): {
  totalRuns: number;
  totalResults: number;
  estimatedSizeKB: number;
} {
  if (typeof window === 'undefined') {
    return { totalRuns: 0, totalResults: 0, estimatedSizeKB: 0 };
  }

  let totalResults = 0;
  let totalSize = 0;

  const runs = getAllRuns();

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(STORAGE_KEY_RESULTS_PREFIX)) {
      const value = localStorage.getItem(key);
      if (value) {
        totalSize += value.length;
        if (!key.endsWith('_meta')) {
          try {
            const chunk = JSON.parse(value);
            totalResults += chunk.length;
          } catch {
            // Ignore
          }
        }
      }
    }
  }

  return {
    totalRuns: runs.length,
    totalResults,
    estimatedSizeKB: Math.round(totalSize / 1024),
  };
}
