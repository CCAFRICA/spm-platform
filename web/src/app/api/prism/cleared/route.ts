/**
 * OB-250 — the PRISM import source (the "cleared shelf").
 *
 * GET  /api/prism/cleared  — files PRISM has CLEARED for ingestion and NOT yet consumed:
 *   state='promoted' AND scan_verdict='clean' AND import_batch_id IS NULL. These are the ONLY files
 *   the PRISM import source presents (I7: uncleared files are ABSENT, not shown-disabled). RLS scopes
 *   the rows. Gated on prism_enabled — the source exists only when the capability is on.
 *
 * POST /api/prism/cleared  — CONSUME a cleared file (the act of importing, decoupled from clearing).
 *   Clearing (the membrane promote) PRODUCES availability; consuming sets import_batch_id so the file
 *   leaves this shelf and hands its already-clean bytes (clean_path, in ingestion-raw) to the EXISTING
 *   import worker (reuse, not a new pipeline). Clearing != importing (produce/consume boundary).
 */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { resolveActor } from '@/lib/prism/actor';
import { hasCapability } from '@/lib/auth/permissions';
import { isPrismEnabledForTenant } from '@/lib/prism/tenant-feature';
import type { SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CLEARED_COLS =
  'id, original_filename, mime_detected, byte_size, scan_verdict, promoted_at, clean_path, content_sha256, created_at';

export async function GET() {
  const actor = await resolveActor();
  if (!actor) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  // The PRISM import source is part of Import (consume) → gate on data.import (the importer cap).
  if (!hasCapability(actor.role, 'data.import')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  // I7 + deep-link: the source only exists when PRISM is on. Fail-closed → empty shelf, never leak.
  if (!(await isPrismEnabledForTenant(actor.tenantId))) {
    return NextResponse.json({ error: 'prism_disabled', files: [] }, { status: 403 });
  }

  const sb = (await createServerSupabaseClient()) as unknown as SupabaseClient;
  const { data, error } = await sb
    .from('file_objects')
    .select(CLEARED_COLS)
    .eq('state', 'promoted')        // cleared by the membrane
    .eq('scan_verdict', 'clean')    // clean verdict
    .is('import_batch_id', null)    // not yet consumed (produce/consume boundary)
    .order('promoted_at', { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ files: data ?? [] });
}

export async function POST(request: Request) {
  const actor = await resolveActor();
  if (!actor) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  if (!hasCapability(actor.role, 'data.import')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  if (!(await isPrismEnabledForTenant(actor.tenantId))) {
    return NextResponse.json({ error: 'prism_disabled' }, { status: 403 });
  }

  let body: { fileObjectId?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'invalid body' }, { status: 400 }); }
  const fileObjectId = (body.fileObjectId ?? '').trim();
  if (!fileObjectId) return NextResponse.json({ error: 'fileObjectId required' }, { status: 400 });

  const svc = (await createServiceRoleClient()) as unknown as SupabaseClient;

  // Re-verify the file is genuinely cleared, unconsumed, and this tenant's (server-authoritative).
  const { data: file } = await svc
    .from('file_objects')
    .select('id, tenant_id, original_filename, clean_path, state, scan_verdict, import_batch_id')
    .eq('id', fileObjectId)
    .maybeSingle();
  if (!file || file.tenant_id !== actor.tenantId) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (file.state !== 'promoted' || file.scan_verdict !== 'clean' || !file.clean_path) {
    return NextResponse.json({ error: 'file is not cleared for ingestion' }, { status: 409 });
  }
  if (file.import_batch_id) return NextResponse.json({ error: 'already consumed' }, { status: 409 });

  // CONSUME — ATOMIC CLAIM-FIRST (review fix: one clearing yields AT MOST one consume, I7). The
  // L72 pre-read is TOCTOU; the authoritative single-consume gate is the guarded UPDATE below. There
  // is no DB unique constraint on import_batch_id, so the claim itself must be atomic + checked.
  // Order: create the batch (the FK target import_batch_id points at) → claim the file with a guard
  // that REQUIRES a row (a concurrent/double-submit loser matches 0 rows under the .is(null) clause)
  // → ONLY the winner creates the processing_job; the loser undoes its orphan batch and 409s. So two
  // near-simultaneous consumers can never both create a job over the same clean_path (no double-ingest).
  const batchId = crypto.randomUUID();
  const { error: batchErr } = await svc.from('import_batches').insert({
    id: batchId,
    tenant_id: actor.tenantId,
    file_name: file.original_filename,
    file_type: 'prism-cleared',
    status: 'pending',
    metadata: { source: 'prism-cleared', file_object_id: file.id },
  });
  if (batchErr) return NextResponse.json({ error: `consume failed: ${batchErr.message}` }, { status: 500 });

  const { data: claimed, error: linkErr } = await svc
    .from('file_objects')
    .update({ import_batch_id: batchId })
    .eq('id', file.id)
    .is('import_batch_id', null) // atomic claim: only ONE concurrent consumer matches the still-null row
    .select('id')
    .maybeSingle();
  if (linkErr || !claimed) {
    // Lost the race (0 rows claimed) or a real error → undo the orphan batch; create NO job.
    await svc.from('import_batches').delete().eq('id', batchId);
    if (linkErr) return NextResponse.json({ error: `consume link failed: ${linkErr.message}` }, { status: 500 });
    return NextResponse.json({ error: 'already consumed' }, { status: 409 });
  }

  // Winner ONLY: hand the already-clean bytes to the EXISTING async import worker via a processing_job
  // over clean_path (in ingestion-raw). No new pipeline. Best-effort plumbing — the claim above is the
  // authoritative single-consume state.
  const { data: job, error: jobErr } = await svc.from('processing_jobs').insert({
    tenant_id: actor.tenantId,
    file_name: file.original_filename,
    file_storage_path: file.clean_path,
    status: 'pending',
    metadata: { source: 'prism-cleared', file_object_id: file.id, import_batch_id: batchId },
  }).select('id').maybeSingle();
  if (jobErr) console.warn('[OB-250][cleared/consume] processing_job create failed (non-blocking):', jobErr.message);

  return NextResponse.json({ consumed: true, importBatchId: batchId, processingJobId: job?.id ?? null });
}
