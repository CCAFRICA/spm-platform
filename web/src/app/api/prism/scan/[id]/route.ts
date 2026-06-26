/**
 * POST /api/prism/scan/[id] — trigger (or retry) the scan gate for a file.
 *
 * The commit route already fires the scan inline (the one path); this endpoint
 * is the webhook / retry surface so a storage object-create trigger or an
 * operator can (re)drive the gate. Promotion is still gated on a clean verdict
 * inside scanFileObject — this route cannot promote anything by itself.
 *
 * Auth: a storage webhook authenticates with PRISM_SCAN_WEBHOOK_SECRET; an
 * operator authenticates via session + data.import (and tenant scope).
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveActor } from '@/lib/prism/actor';
import { getFileObject } from '@/lib/prism/file-objects';
import { scanFileObject } from '@/lib/prism/scan-worker';
import { hasCapability } from '@/lib/auth/permissions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const secret = request.headers.get('x-prism-scan-secret');
  const webhookOk =
    !!process.env.PRISM_SCAN_WEBHOOK_SECRET && secret === process.env.PRISM_SCAN_WEBHOOK_SECRET;

  if (!webhookOk) {
    const actor = await resolveActor();
    if (!actor) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
    if (!hasCapability(actor.role, 'data.import')) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    const file = await getFileObject(id);
    if (!file) return NextResponse.json({ error: 'not found' }, { status: 404 });
    const elevated = ['platform', 'vl_admin'].includes(actor.role);
    if (file.tenant_id !== actor.tenantId && !elevated) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
  }

  const result = await scanFileObject(id);
  return NextResponse.json(result);
}
