/**
 * Prism storage mechanics (service-role).
 *
 * The membrane's two buckets:
 *   - ingest-quarantine : every byte lands here first, via a server-minted
 *                          signed upload URL (bytes never transit a function).
 *   - ingestion-raw     : the clean/landed boundary; written to ONLY by the
 *                          gated promotion (scan-worker), only on a clean verdict.
 *
 * There is no native bucket-to-bucket copy/move in this stack — promotion is
 * download(quarantine) → upload(ingestion-raw). Quarantine bytes are RETAINED
 * (Carry Everything); nothing is deleted in this slice.
 */

import { createServiceRoleClient } from '@/lib/supabase/server';
import { QUARANTINE_BUCKET, CLEAN_BUCKET } from './types';

function sanitize(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200);
}

/**
 * Map a magic-byte-detected MIME to a content-type the clean boundary (ingestion-raw)
 * accepts. Legacy OLE2 (.xls/.doc/.ppt) → vnd.ms-excel so clean legacy Office promotes.
 * Common types (csv/zip/pdf/txt/gzip) pass through. A genuinely unknown binary keeps
 * its detected type; if ingestion-raw rejects it the file holds at `clean` (never
 * falsely promoted) — an honest pre-existing platform constraint (the bucket is §6
 * out-of-scope, so its allowlist is not modified).
 */
export function toPromotableContentType(mime: string | null): string {
  if (!mime) return 'application/octet-stream';
  if (mime === 'application/x-ole-storage') return 'application/vnd.ms-excel';
  return mime;
}

/** Owner-scoped quarantine path: <tenant_id>/<auth_uid>/<ts>_<file>. */
export function buildQuarantinePath(tenantId: string, authUserId: string, filename: string, ts: number): string {
  return `${tenantId}/${authUserId}/${ts}_${sanitize(filename)}`;
}

/** Clean path under the tenant folder (matches ingestion-raw RLS: foldername[1] = tenant_id). */
export function buildCleanPath(tenantId: string, fileObjectId: string, filename: string): string {
  return `${tenantId}/prism/${fileObjectId}_${sanitize(filename)}`;
}

/** Mint a signed upload URL into the quarantine bucket for a specific path. */
export async function createQuarantineSignedUploadUrl(
  path: string,
): Promise<{ signedUrl: string; token: string; path: string }> {
  const sb = await createServiceRoleClient();
  const { data, error } = await sb.storage.from(QUARANTINE_BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new Error(`createSignedUploadUrl failed: ${error?.message ?? 'no data'}`);
  return { signedUrl: data.signedUrl, token: data.token, path };
}

/** Download the raw bytes of a quarantined object (service-role). */
export async function downloadQuarantineBytes(path: string): Promise<Buffer> {
  const sb = await createServiceRoleClient();
  const { data, error } = await sb.storage.from(QUARANTINE_BUCKET).download(path);
  if (error || !data) throw new Error(`quarantine download failed: ${error?.message ?? 'no data'}`);
  return Buffer.from(await data.arrayBuffer());
}

/**
 * Promote: copy bytes from quarantine into ingestion-raw. Called ONLY by the
 * scan worker on a clean verdict. Quarantine bytes are left in place (retained).
 */
export async function promoteToClean(
  quarantinePath: string,
  cleanPath: string,
  contentType: string,
): Promise<void> {
  const sb = await createServiceRoleClient();
  const { data: blob, error: dlErr } = await sb.storage.from(QUARANTINE_BUCKET).download(quarantinePath);
  if (dlErr || !blob) throw new Error(`promote download failed: ${dlErr?.message ?? 'no data'}`);
  const buffer = Buffer.from(await blob.arrayBuffer());
  const { error: upErr } = await sb.storage
    .from(CLEAN_BUCKET)
    .upload(cleanPath, buffer, { contentType, upsert: false });
  if (upErr) throw new Error(`promote upload failed: ${upErr.message}`);
}
