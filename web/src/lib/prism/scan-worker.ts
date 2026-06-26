/**
 * The scan gate (DS-031 §3.3) — scan-before-promote, made physical.
 *
 * scanFileObject(id) is the SINGLE authority that advances a file past the
 * membrane. It is the ONLY code path that writes bytes into `ingestion-raw`,
 * and it does so ONLY on a `clean` verdict. Every other outcome (infected OR
 * error OR an unexpected exception) ends in `infected_held` with the bytes
 * RETAINED in quarantine (Carry Everything, Invariant 2). The gate therefore
 * fails CLOSED: nothing reaches the clean boundary without a recorded clean
 * verdict, regardless of what triggered the scan (Invariant 1).
 *
 * Invoked fire-and-forget by the commit route (the one intake path) and also
 * exposed as POST /api/prism/scan/[id] for a storage webhook / retry. It never
 * throws to its caller.
 */

import { createServiceRoleClient } from '@/lib/supabase/server';
import { createScanProvider } from './scan-provider';
import { downloadQuarantineBytes, promoteToClean, buildCleanPath } from './storage';
import { getFileObject, patchFileObject } from './file-objects';
import { writeFileAudit } from './audit';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { FileObject } from './types';

const SCANNABLE_STATES = new Set(['received', 'quarantined', 'scanning']);

export interface ScanWorkerResult {
  id: string;
  finalState: FileObject['state'];
  verdict?: string;
  skipped?: boolean;
  detail?: string;
}

export async function scanFileObject(id: string): Promise<ScanWorkerResult> {
  const auditClient = (await createServiceRoleClient()) as unknown as SupabaseClient;

  const file = await getFileObject(id);
  if (!file) return { id, finalState: 'received', skipped: true, detail: 'file_object not found' };

  // Idempotency: never re-scan a file that already reached a terminal state.
  if (!SCANNABLE_STATES.has(file.state) || !file.quarantine_path) {
    return { id, finalState: file.state, skipped: true, detail: `not scannable from state=${file.state}` };
  }

  const tenantId = file.tenant_id;
  const auditBase = { tenantId, profileId: null as string | null, fileObjectId: id };

  try {
    // ── quarantined → scanning ──
    await patchFileObject(id, { state: 'scanning' });
    await writeFileAudit(auditClient, {
      ...auditBase,
      action: 'file.scan_started',
      changes: { from: file.state, to: 'scanning' },
      metadata: { engine: 'clamav', detection: 'magic-byte', provider: process.env.PRISM_SCAN_PROVIDER ?? 'clamd' },
    });

    // ── scan ──
    const provider = createScanProvider(downloadQuarantineBytes);
    const result = await provider.scan(file.quarantine_path);
    const scannedAt = new Date().toISOString();

    if (result.verdict === 'clean') {
      // scanning → clean (scan_passed)
      await patchFileObject(id, {
        state: 'clean',
        scan_verdict: 'clean',
        scan_engine_version: result.engineVersion,
        scanned_at: scannedAt,
      });
      await writeFileAudit(auditClient, {
        ...auditBase,
        action: 'file.scan_passed',
        changes: { verdict: 'clean', engine_version: result.engineVersion },
        metadata: { provider: provider.name, detail: result.detail },
      });

      // ── clean → promoted (the ONLY write into ingestion-raw) ──
      const cleanPath = buildCleanPath(tenantId, id, file.original_filename);
      const contentType = file.mime_detected ?? 'application/octet-stream';
      try {
        await promoteToClean(file.quarantine_path, cleanPath, contentType);
      } catch (promoteErr) {
        // Scanned clean but could not land — stay at `clean`, never falsely `promoted`.
        await patchFileObject(id, {
          metadata: { ...(file.metadata ?? {}), promote_error: String(promoteErr) },
        });
        return { id, finalState: 'clean', verdict: 'clean', detail: `promote failed: ${String(promoteErr)}` };
      }

      await patchFileObject(id, {
        state: 'promoted',
        clean_path: cleanPath,
        promoted_at: new Date().toISOString(),
        import_batch_id: null, // hand-off to Import is Slice 2+; column laid down now
      });
      await writeFileAudit(auditClient, {
        ...auditBase,
        action: 'file.promoted',
        changes: { from: 'clean', to: 'promoted', clean_path: cleanPath },
        metadata: { bucket: 'ingestion-raw' },
      });
      return { id, finalState: 'promoted', verdict: 'clean' };
    }

    // ── infected OR error → infected_held (bytes RETAINED) ──
    await patchFileObject(id, {
      state: 'infected_held',
      scan_verdict: result.verdict, // 'infected' | 'error'
      scan_engine_version: result.engineVersion,
      scanned_at: scannedAt,
    });
    await writeFileAudit(auditClient, {
      ...auditBase,
      action: 'file.scan_failed',
      changes: { verdict: result.verdict, detail: result.detail ?? null },
      metadata: { provider: provider.name, engine_version: result.engineVersion },
    });
    await writeFileAudit(auditClient, {
      ...auditBase,
      action: 'file.held',
      changes: { state: 'infected_held', reason: result.verdict },
      metadata: { retained_in: 'ingest-quarantine', detail: result.detail ?? null },
    });
    return { id, finalState: 'infected_held', verdict: result.verdict, detail: result.detail };
  } catch (err) {
    // Fail closed: any unexpected failure holds the file; it is never promoted.
    try {
      await patchFileObject(id, {
        state: 'infected_held',
        scan_verdict: 'error',
        scanned_at: new Date().toISOString(),
      });
      await writeFileAudit(auditClient, {
        ...auditBase,
        action: 'file.held',
        changes: { state: 'infected_held', reason: 'worker_error' },
        metadata: { error: String(err), retained_in: 'ingest-quarantine' },
      });
    } catch {
      /* best-effort */
    }
    return { id, finalState: 'infected_held', verdict: 'error', detail: String(err) };
  }
}
