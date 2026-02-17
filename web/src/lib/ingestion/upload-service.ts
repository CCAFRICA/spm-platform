/**
 * Upload Service — DS-005 core upload pipeline.
 *
 * 1. Client-side SHA-256 hash computation (Web Crypto API)
 * 2. Supabase Storage upload (standard upload, TUS for large files)
 * 3. Ingestion event creation via API route
 * 4. Progress tracking for UI
 */

import { createClient } from '@/lib/supabase/client';
import { validateFile, type FileCategory } from './file-validator';

// ── Types ──

export interface UploadOptions {
  tenantId: string;
  file: File;
  batchId?: string;
  acceptCategories?: FileCategory[];
  onProgress?: (progress: UploadProgress) => void;
}

export interface UploadProgress {
  phase: 'validating' | 'hashing' | 'uploading' | 'registering';
  bytesUploaded: number;
  bytesTotal: number;
  percentage: number;
}

export interface UploadResult {
  eventId: string;
  storagePath: string;
  fileHash: string;
  status: 'received';
}

export interface UploadError {
  type: 'validation' | 'hash' | 'upload' | 'registration';
  message: string;
}

// ── SHA-256 Hashing ──

async function computeSHA256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── Upload Pipeline ──

/**
 * Upload a file to the Ingestion Facility.
 *
 * Flow: validate → hash → upload to Storage → register event
 */
export async function uploadFile(options: UploadOptions): Promise<UploadResult> {
  const { tenantId, file, batchId, acceptCategories, onProgress } = options;

  // Phase 1: Validate
  onProgress?.({ phase: 'validating', bytesUploaded: 0, bytesTotal: file.size, percentage: 0 });
  const validation = validateFile(file, acceptCategories);
  if (!validation.valid) {
    throw { type: 'validation', message: validation.error } as UploadError;
  }

  // Phase 2: Compute SHA-256
  onProgress?.({ phase: 'hashing', bytesUploaded: 0, bytesTotal: file.size, percentage: 0 });
  let fileHash: string;
  try {
    fileHash = await computeSHA256(file);
  } catch (err) {
    throw { type: 'hash', message: `Failed to compute SHA-256: ${err}` } as UploadError;
  }
  onProgress?.({ phase: 'hashing', bytesUploaded: file.size, bytesTotal: file.size, percentage: 100 });

  // Phase 3: Upload to Supabase Storage
  const storagePath = buildStoragePath(tenantId, batchId, file.name);
  onProgress?.({ phase: 'uploading', bytesUploaded: 0, bytesTotal: file.size, percentage: 0 });

  const supabase = createClient();
  const { error: uploadError } = await supabase.storage
    .from('ingestion-raw')
    .upload(storagePath, file, {
      cacheControl: '3600',
      upsert: false,
    });

  if (uploadError) {
    throw { type: 'upload', message: `Storage upload failed: ${uploadError.message}` } as UploadError;
  }
  onProgress?.({ phase: 'uploading', bytesUploaded: file.size, bytesTotal: file.size, percentage: 100 });

  // Phase 4: Register ingestion event via API
  onProgress?.({ phase: 'registering', bytesUploaded: file.size, bytesTotal: file.size, percentage: 100 });

  const res = await fetch('/api/ingest/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tenant_id: tenantId,
      file_name: file.name,
      file_size_bytes: file.size,
      file_type: file.type || detectMimeFromExtension(file.name),
      file_hash_sha256: fileHash,
      storage_path: storagePath,
      batch_id: batchId || null,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw { type: 'registration', message: `Event registration failed: ${err.error}` } as UploadError;
  }

  const { event_id } = await res.json();

  return {
    eventId: event_id,
    storagePath,
    fileHash,
    status: 'received',
  };
}

// ── Helpers ──

function buildStoragePath(tenantId: string, batchId: string | undefined, fileName: string): string {
  const sanitized = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const timestamp = Date.now();
  if (batchId) {
    return `${tenantId}/${batchId}/${timestamp}_${sanitized}`;
  }
  return `${tenantId}/${timestamp}_${sanitized}`;
}

function detectMimeFromExtension(fileName: string): string {
  const ext = fileName.toLowerCase().split('.').pop();
  const map: Record<string, string> = {
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xls: 'application/vnd.ms-excel',
    csv: 'text/csv',
    tsv: 'text/tab-separated-values',
    txt: 'text/plain',
    pdf: 'application/pdf',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    zip: 'application/zip',
    gz: 'application/gzip',
  };
  return map[ext || ''] || 'application/octet-stream';
}

/**
 * Progress an ingestion event to a new status (immutable chain).
 */
export async function progressEventStatus(
  eventId: string,
  newStatus: string,
  data?: { classification_result?: unknown; validation_result?: unknown; record_count?: number }
): Promise<{ newEventId: string; status: string }> {
  const res = await fetch(`/api/ingest/event/${eventId}/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      new_status: newStatus,
      ...data,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(`Failed to progress status: ${err.error}`);
  }

  const result = await res.json();
  return { newEventId: result.new_event_id, status: result.status };
}
