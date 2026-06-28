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
 * Concurrency: the received|quarantined → scanning transition is an ATOMIC
 * compare-and-swap (claimForScanning) so the commit fire-and-forget and the
 * webhook/retry route cannot double-scan or stomp a promoted row. A file left
 * at `clean` by a transient promote failure is recoverable via the promote-retry
 * path below (re-invoking the gate re-attempts only the promotion).
 *
 * Invoked fire-and-forget by the commit route (the one intake path) and exposed
 * as POST /api/prism/scan/[id] for a storage webhook / retry (the production
 * trigger when fire-and-forget is unreliable, e.g. serverless). Never throws to
 * its caller.
 */

import { createServiceRoleClient } from '@/lib/supabase/server';
import { createScanProvider } from './scan-provider';
import { downloadQuarantineBytes, promoteToClean, buildCleanPath, toPromotableContentType } from './storage';
import { getFileObject, patchFileObject, claimForScanning } from './file-objects';
import { writeFileAudit } from './audit';
import { getPrismScanMode, type PrismScanMode } from './capability';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { FileObject } from './types';

export interface ScanWorkerResult {
  id: string;
  finalState: FileObject['state'];
  verdict?: string;
  skipped?: boolean;
  detail?: string;
}

/** Promote a clean file into ingestion-raw (the ONLY writer of the clean boundary). */
async function promoteCleanFile(auditClient: SupabaseClient, file: FileObject): Promise<ScanWorkerResult> {
  const cleanPath = buildCleanPath(file.tenant_id, file.id, file.original_filename);
  const contentType = toPromotableContentType(file.mime_detected);
  try {
    await promoteToClean(file.quarantine_path!, cleanPath, contentType);
  } catch (promoteErr) {
    // Scanned clean but could not land — stay at `clean`, never falsely `promoted`.
    // Recoverable: re-invoking scanFileObject re-attempts the promote (see below).
    await patchFileObject(file.id, { metadata: { ...(file.metadata ?? {}), promote_error: String(promoteErr) } });
    return { id: file.id, finalState: 'clean', verdict: 'clean', detail: `promote failed: ${String(promoteErr)}` };
  }
  await patchFileObject(file.id, {
    state: 'promoted',
    clean_path: cleanPath,
    promoted_at: new Date().toISOString(),
    import_batch_id: null, // hand-off to Import is Slice 2+; column laid down now
  });
  await writeFileAudit(auditClient, {
    tenantId: file.tenant_id,
    profileId: null,
    action: 'file.promoted',
    fileObjectId: file.id,
    changes: { from: 'clean', to: 'promoted', clean_path: cleanPath },
    metadata: { bucket: 'ingestion-raw', content_type: contentType },
  });
  return { id: file.id, finalState: 'promoted', verdict: 'clean' };
}

export async function scanFileObject(id: string): Promise<ScanWorkerResult> {
  const auditClient = (await createServiceRoleClient()) as unknown as SupabaseClient;

  const file = await getFileObject(id);
  if (!file) return { id, finalState: 'received', skipped: true, detail: 'file_object not found' };
  if (!file.quarantine_path) {
    return { id, finalState: file.state, skipped: true, detail: 'no quarantine_path' };
  }

  // Promote-retry: already scanned clean but never landed (transient promote failure).
  if (file.state === 'clean' && !file.clean_path) {
    return await promoteCleanFile(auditClient, file);
  }

  // Atomic claim: only one invocation transitions received|quarantined → scanning.
  const claimed = await claimForScanning(id);
  if (!claimed) {
    const current = await getFileObject(id);
    return { id, finalState: current?.state ?? file.state, skipped: true, detail: 'not claimable (already owned/terminal)' };
  }

  const tenantId = file.tenant_id;
  const auditBase = { tenantId, profileId: null as string | null, fileObjectId: id };

  // OB-250 §1.7 NESTING: the scanner mode (enforce/interim) is a NESTED control under prism_enabled
  // (tenants.settings.prism.mode), meaningful only when PRISM is active — which it inherently is
  // whenever a file reaches the scan gate (the membrane is the PRISM path). Default 'enforce' =
  // today's fail-closed behavior (byte-identical). Recorded for observability; this ESTABLISHES the
  // nesting structure (the interim behavior + per-agent toggle UI are out of scope, §1.7/§2).
  let prismScanMode: PrismScanMode = 'enforce';
  try {
    const { data: tRow } = await auditClient.from('tenants').select('settings').eq('id', tenantId).maybeSingle();
    prismScanMode = getPrismScanMode((tRow?.settings ?? null) as Record<string, unknown> | null);
  } catch { /* default 'enforce' — never block the gate on a settings read */ }

  try {
    await writeFileAudit(auditClient, {
      ...auditBase,
      action: 'file.scan_started',
      changes: { from: file.state, to: 'scanning' },
      metadata: { engine: 'clamav', detection: 'magic-byte', provider: process.env.PRISM_SCAN_PROVIDER ?? 'clamd', prism_scan_mode: prismScanMode },
    });

    const provider = createScanProvider(downloadQuarantineBytes);
    const result = await provider.scan(file.quarantine_path);
    const scannedAt = new Date().toISOString();

    if (result.verdict === 'clean') {
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
      // The ONLY write into ingestion-raw — gated on the clean verdict above.
      return await promoteCleanFile(auditClient, {
        ...file,
        state: 'clean',
        scan_verdict: 'clean',
        scan_engine_version: result.engineVersion,
        scanned_at: scannedAt,
      });
    }

    // infected OR error → infected_held (bytes RETAINED, Carry Everything).
    await patchFileObject(id, {
      state: 'infected_held',
      scan_verdict: result.verdict,
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
      await patchFileObject(id, { state: 'infected_held', scan_verdict: 'error', scanned_at: new Date().toISOString() });
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
