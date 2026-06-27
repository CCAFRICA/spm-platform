/**
 * file_objects lifecycle row helpers (service-role).
 *
 * All writes go through the service-role client (bypasses RLS); the gate logic
 * in scan-worker.ts is the single authority over state transitions. Reads for
 * the user-facing spine go through the RLS-bound session client (see the
 * /api/prism/files route), NOT these helpers.
 *
 * file_objects is a new table not yet in the generated Database types, so we
 * use a loosely-typed client view and map rows to the FileObject interface
 * (the same `as unknown as` boundary the repo uses for not-yet-typed tables).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceRoleClient } from '@/lib/supabase/server';
import type { FileObject, FileObjectState, ScanVerdict } from './types';

async function srv(): Promise<SupabaseClient> {
  return (await createServiceRoleClient()) as unknown as SupabaseClient;
}

export interface InsertFileObjectInput {
  tenantId: string;
  ownerId: string;
  contentSha256: string;
  originalFilename: string;
  mimeDetected: string | null;
  byteSize: number | null;
  quarantinePath: string;
  classification?: string | null;
  metadata?: Record<string, unknown>;
}

export async function insertFileObject(input: InsertFileObjectInput): Promise<FileObject> {
  const sb = await srv();
  const { data, error } = await sb
    .from('file_objects')
    .insert({
      tenant_id: input.tenantId,
      owner_id: input.ownerId,
      content_sha256: input.contentSha256,
      original_filename: input.originalFilename,
      mime_detected: input.mimeDetected,
      byte_size: input.byteSize,
      state: 'received' satisfies FileObjectState,
      quarantine_path: input.quarantinePath,
      classification: input.classification ?? null,
      metadata: input.metadata ?? {},
    })
    .select('*')
    .single();
  if (error || !data) throw new Error(`insertFileObject failed: ${error?.message ?? 'no data'}`);
  return data as FileObject;
}

/**
 * Atomically claim a file for scanning: received|quarantined → scanning, but ONLY
 * if it is still in one of those states. Postgres serializes concurrent UPDATEs on
 * the row, so exactly one caller's WHERE matches → exactly one claim. Returns true
 * if THIS call won the claim; false means another invocation already owns it (or it
 * has moved past), in which case the caller must NOT scan/promote (prevents the
 * commit fire-and-forget racing the webhook into a double-scan / state stomp).
 */
export async function claimForScanning(id: string): Promise<boolean> {
  const sb = await srv();
  const { data, error } = await sb
    .from('file_objects')
    .update({ state: 'scanning' satisfies FileObjectState })
    .eq('id', id)
    .in('state', ['received', 'quarantined'])
    .select('id');
  if (error) throw new Error(`claimForScanning failed: ${error.message}`);
  return Array.isArray(data) && data.length > 0;
}

export async function getFileObject(id: string): Promise<FileObject | null> {
  const sb = await srv();
  const { data } = await sb.from('file_objects').select('*').eq('id', id).maybeSingle();
  return (data as FileObject) ?? null;
}

export interface FileObjectPatch {
  state?: FileObjectState;
  scan_verdict?: ScanVerdict;
  scan_engine_version?: string | null;
  scanned_at?: string | null;
  promoted_at?: string | null;
  clean_path?: string | null;
  import_batch_id?: string | null;
  metadata?: Record<string, unknown>;
}

export async function patchFileObject(id: string, patch: FileObjectPatch): Promise<FileObject> {
  const sb = await srv();
  const { data, error } = await sb.from('file_objects').update(patch).eq('id', id).select('*').single();
  if (error || !data) throw new Error(`patchFileObject failed: ${error?.message ?? 'no data'}`);
  return data as FileObject;
}
