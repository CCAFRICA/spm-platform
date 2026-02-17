/**
 * Batch Manager — DS-005 batch upload session management.
 *
 * Groups multiple file uploads into a single batch session.
 * Tracks batch-level status and provides summary statistics.
 */

import { type UploadResult } from './upload-service';

// ── Types ──

export interface BatchSession {
  id: string;
  tenantId: string;
  label: string;
  createdAt: string;
  files: BatchFile[];
  status: 'open' | 'complete' | 'partial' | 'failed';
}

export interface BatchFile {
  fileName: string;
  fileSize: number;
  eventId: string | null;
  fileHash: string | null;
  storagePath: string | null;
  status: 'pending' | 'uploading' | 'done' | 'error';
  error?: string;
}

export interface BatchSummaryData {
  totalFiles: number;
  completedFiles: number;
  failedFiles: number;
  totalBytes: number;
  uploadedBytes: number;
  status: BatchSession['status'];
}

// ── Batch Manager ──

/**
 * Create a new batch session.
 */
export function createBatch(tenantId: string, label?: string): BatchSession {
  return {
    id: crypto.randomUUID(),
    tenantId,
    label: label || `Import ${new Date().toLocaleString()}`,
    createdAt: new Date().toISOString(),
    files: [],
    status: 'open',
  };
}

/**
 * Add a file to a batch session (before upload starts).
 */
export function addFileToBatch(batch: BatchSession, file: File): BatchSession {
  return {
    ...batch,
    files: [
      ...batch.files,
      {
        fileName: file.name,
        fileSize: file.size,
        eventId: null,
        fileHash: null,
        storagePath: null,
        status: 'pending',
      },
    ],
  };
}

/**
 * Update a file in the batch after upload completes.
 */
export function updateBatchFile(
  batch: BatchSession,
  fileName: string,
  result: UploadResult | null,
  error?: string
): BatchSession {
  const files = batch.files.map(f => {
    if (f.fileName !== fileName) return f;
    if (error) {
      return { ...f, status: 'error' as const, error };
    }
    return {
      ...f,
      status: 'done' as const,
      eventId: result?.eventId ?? null,
      fileHash: result?.fileHash ?? null,
      storagePath: result?.storagePath ?? null,
    };
  });

  return { ...batch, files };
}

/**
 * Close a batch and compute final status.
 */
export function closeBatch(batch: BatchSession): BatchSession {
  const done = batch.files.filter(f => f.status === 'done').length;
  const failed = batch.files.filter(f => f.status === 'error').length;
  const total = batch.files.length;

  let status: BatchSession['status'];
  if (done === total) status = 'complete';
  else if (failed === total) status = 'failed';
  else if (done > 0) status = 'partial';
  else status = 'failed';

  return { ...batch, status };
}

/**
 * Get summary statistics for a batch.
 */
export function getBatchSummary(batch: BatchSession): BatchSummaryData {
  const completedFiles = batch.files.filter(f => f.status === 'done').length;
  const failedFiles = batch.files.filter(f => f.status === 'error').length;
  const totalBytes = batch.files.reduce((sum, f) => sum + f.fileSize, 0);
  const uploadedBytes = batch.files
    .filter(f => f.status === 'done')
    .reduce((sum, f) => sum + f.fileSize, 0);

  return {
    totalFiles: batch.files.length,
    completedFiles,
    failedFiles,
    totalBytes,
    uploadedBytes,
    status: batch.status,
  };
}

/**
 * Register a batch session via API (optional — for server-side tracking).
 */
export async function registerBatch(
  tenantId: string,
  batchId: string,
  label: string
): Promise<void> {
  try {
    await fetch('/api/ingest/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenant_id: tenantId, batch_id: batchId, label }),
    });
  } catch {
    // Non-blocking — batch registration is optional
    console.warn('[BatchManager] Failed to register batch server-side');
  }
}
