/**
 * POST /api/prism/prepare — mint a signed upload URL into ingest-quarantine.
 *
 * Step 1 of the ONE Prism intake path: prepare → PUT (direct-to-storage) → commit.
 * The server controls the object path (owner-scoped: <tenant>/<auth_uid>/...), so
 * bytes land only where the membrane expects them. Bytes never transit a function.
 *
 * Premise correction (OB-245 §3.2): the directive said to "re-point the existing
 * signed-URL flow away from ingestion-raw", but no signed-URL flow ever targeted
 * ingestion-raw (the only createSignedUploadUrl targets the `imports` bucket;
 * ingestion-raw is fed by legacy direct .upload() calls that are out of scope).
 * This is the faithful realization: a new signed-URL prepare into quarantine.
 */

import { NextResponse } from 'next/server';
import { resolveActor } from '@/lib/prism/actor';
import { buildQuarantinePath, createQuarantineSignedUploadUrl } from '@/lib/prism/storage';
import { hasCapability } from '@/lib/auth/permissions';
import { isPrismEnabledForTenant } from '@/lib/prism/tenant-feature';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const actor = await resolveActor();
  if (!actor) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  // OB-247 R2: the membrane delivery capability is data.upload (held by the operator AND
  // the CDA). data.import stays for the full import wizard. Both roles can deliver a file.
  if (!hasCapability(actor.role, 'data.upload')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  // OB-250: PRISM tenant-capability gate (deep-link/data protection, SR-39). The membrane path is
  // gateable per tenant; local import (/api/import/sci/*) is unaffected (I6). Fail-closed when off.
  if (!(await isPrismEnabledForTenant(actor.tenantId))) {
    return NextResponse.json({ error: 'prism_disabled' }, { status: 403 });
  }

  let body: { filename?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }
  const filename = (body.filename ?? '').trim();
  if (!filename) return NextResponse.json({ error: 'filename required' }, { status: 400 });

  const ts = Date.now();
  const path = buildQuarantinePath(actor.tenantId, actor.authUserId, filename, ts);
  try {
    const { signedUrl, token } = await createQuarantineSignedUploadUrl(path);
    return NextResponse.json({ path, signedUrl, token, bucket: 'ingest-quarantine' });
  } catch (err) {
    return NextResponse.json({ error: `prepare failed: ${String(err)}` }, { status: 500 });
  }
}
