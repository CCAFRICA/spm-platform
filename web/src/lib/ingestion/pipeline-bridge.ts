/**
 * Pipeline Bridge — DS-005 compatibility layer.
 *
 * Connects the new UploadZone (which uploads to Supabase Storage + creates
 * ingestion events) with the existing client-side import logic (parseCSV,
 * XLSX parsing, column mapping, etc.).
 *
 * The bridge ensures:
 * 1. Every file gets an ingestion event (audit trail)
 * 2. Existing import flows continue working unchanged
 * 3. File content is available for client-side parsing
 */

import { type UploadResult } from './upload-service';
import { type FileCategory } from './file-validator';

// ── Bridge Result ──

export interface BridgeResult {
  /** The raw File object for client-side processing */
  file: File;
  /** File content as text (for CSV/TSV/JSON parsing) */
  content: string;
  /** Ingestion event ID from DS-005 pipeline (null if upload-only mode) */
  eventId: string | null;
  /** SHA-256 hash */
  fileHash: string | null;
  /** Supabase Storage path */
  storagePath: string | null;
}

/**
 * Read file content for client-side processing.
 * Used by legacy import flows that need the raw text/binary.
 */
export async function readFileContent(file: File): Promise<string> {
  return file.text();
}

/**
 * Read file as ArrayBuffer for binary formats (XLSX, ZIP, etc.).
 */
export async function readFileBuffer(file: File): Promise<ArrayBuffer> {
  return file.arrayBuffer();
}

/**
 * Convert an UploadResult + File into a BridgeResult.
 * Call this when the UploadZone fires onFileUploaded.
 */
export async function bridgeUploadResult(
  file: File,
  uploadResult: UploadResult | null
): Promise<BridgeResult> {
  const content = await readFileContent(file);
  return {
    file,
    content,
    eventId: uploadResult?.eventId ?? null,
    fileHash: uploadResult?.fileHash ?? null,
    storagePath: uploadResult?.storagePath ?? null,
  };
}

/**
 * Determine the appropriate file categories for an import context.
 */
export function categoriesForContext(
  context: 'data-import' | 'plan-import' | 'reconciliation'
): FileCategory[] {
  switch (context) {
    case 'data-import':
      return ['spreadsheets', 'text'];
    case 'plan-import':
      return ['spreadsheets', 'text', 'documents'];
    case 'reconciliation':
      return ['spreadsheets', 'text'];
    default:
      return ['spreadsheets', 'text', 'documents', 'archives'];
  }
}
