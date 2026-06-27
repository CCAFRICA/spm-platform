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

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const actor = await resolveActor();
  if (!actor) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  if (!hasCapability(actor.role, 'data.import')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
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
