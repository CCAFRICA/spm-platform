/**
 * POST /api/prism/commit — record an uploaded object and enter the membrane.
 *
 * Step 3 of the one intake path (after prepare + the direct PUT to quarantine).
 * The server computes the fingerprint and type from the ACTUAL stored bytes
 * (never trusting the client or the filename): content_sha256 (server-authoritative
 * integrity) and mime_detected (magic byte — Korean Test, Invariant 3). It then
 * inserts the file_objects row (received), records file.received + file.quarantined,
 * and triggers the scan gate. Confirmation returned to the user is a render of the
 * recorded state — never optimistic (DS-031 §6A).
 */

import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { resolveActor } from '@/lib/prism/actor';
import { downloadQuarantineBytes } from '@/lib/prism/storage';
import { detectMimeFromBytes } from '@/lib/prism/mime-detect';
import { insertFileObject, patchFileObject } from '@/lib/prism/file-objects';
import { writeFileAudit } from '@/lib/prism/audit';
import { scanFileObject } from '@/lib/prism/scan-worker';
import { hasCapability } from '@/lib/auth/permissions';
import { createServiceRoleClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const actor = await resolveActor();
  if (!actor) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  if (!hasCapability(actor.role, 'data.import')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  let body: { path?: string; filename?: string; clientSha256?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }
  const path = (body.path ?? '').trim();
  const filename = (body.filename ?? '').trim();
  if (!path || !filename) return NextResponse.json({ error: 'path and filename required' }, { status: 400 });

  // Authorization: the actor may only commit objects under their own owner prefix.
  const expectedPrefix = `${actor.tenantId}/${actor.authUserId}/`;
  if (!path.startsWith(expectedPrefix) || path.includes('..')) {
    return NextResponse.json({ error: 'path outside owner scope' }, { status: 403 });
  }

  // Pull the actual stored bytes and derive integrity + type from CONTENT.
  let bytes: Buffer;
  try {
    bytes = await downloadQuarantineBytes(path);
  } catch (err) {
    return NextResponse.json({ error: `object not found in quarantine: ${String(err)}` }, { status: 404 });
  }
  const contentSha256 = createHash('sha256').update(bytes).digest('hex');
  const mimeDetected = detectMimeFromBytes(bytes);
  const byteSize = bytes.byteLength;

  const auditClient = (await createServiceRoleClient()) as unknown as SupabaseClient;

  // Insert the lifecycle row (received) and record the user's action.
  let fileObject;
  try {
    fileObject = await insertFileObject({
      tenantId: actor.tenantId,
      ownerId: actor.authUserId,
      contentSha256,
      originalFilename: filename,
      mimeDetected,
      byteSize,
      quarantinePath: path,
      metadata: {
        submitted_via: 'prism.submit',
        client_sha256: body.clientSha256 ?? null,
        sha256_match: body.clientSha256 ? body.clientSha256 === contentSha256 : null,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: `commit failed: ${String(err)}` }, { status: 500 });
  }

  await writeFileAudit(auditClient, {
    tenantId: actor.tenantId,
    profileId: actor.profileId,
    action: 'file.received',
    fileObjectId: fileObject.id,
    changes: { state: 'received', content_sha256: contentSha256, mime_detected: mimeDetected, byte_size: byteSize },
    metadata: { surface: 'prism.submit', filename },
  });

  // Confirm physical isolation in quarantine.
  await patchFileObject(fileObject.id, { state: 'quarantined' });
  await writeFileAudit(auditClient, {
    tenantId: actor.tenantId,
    profileId: actor.profileId,
    action: 'file.quarantined',
    fileObjectId: fileObject.id,
    changes: { from: 'received', to: 'quarantined' },
    metadata: { bucket: 'ingest-quarantine', quarantine_path: path },
  });

  // Trigger the scan gate. Fire-and-forget so the spine can show the live
  // scanning→clean→promoted progression; the gate is the sole promoter.
  void scanFileObject(fileObject.id).catch((e) => console.error('[prism] scan worker error', e));

  return NextResponse.json({
    id: fileObject.id,
    state: 'quarantined',
    content_sha256: contentSha256,
    mime_detected: mimeDetected,
    byte_size: byteSize,
    message: 'Arrived safely — scanning now',
  });
}
