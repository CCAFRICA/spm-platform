// src/app/api/platform/vigil/work-items/[id]/route.ts
// HF-IGF-017 Gap C — update a work item from the Vigil tab. Platform-admin gated;
// proxies to VG PATCH /api/vigil/work-items/:id server-side (VG token off the client).

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { updateWorkItem, type WorkItemPatch } from '@/lib/vigil/dashboard-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authClient = await createServerSupabaseClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const serviceClient = await createServiceRoleClient();
    const { data: profile } = await serviceClient.from('profiles').select('id, role').eq('auth_user_id', user.id).maybeSingle();
    if (!profile || profile.role !== 'platform') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const b = (await request.json().catch(() => null)) as WorkItemPatch | null;
    if (!b || typeof b !== 'object') return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
    const patch: WorkItemPatch = {
      status: typeof b.status === 'string' ? b.status : undefined,
      priority: typeof b.priority === 'string' ? b.priority : undefined,
      resolution_note: typeof b.resolution_note === 'string' ? b.resolution_note : undefined,
      verified: typeof b.verified === 'boolean' ? b.verified : undefined,
    };
    const r = await updateWorkItem(params.id, patch);
    return NextResponse.json(r.data, { status: r.ok ? 200 : r.status, headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'unknown' }, { status: 500 });
  }
}
