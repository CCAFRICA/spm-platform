// src/app/api/platform/vigil/promote/route.ts
// OB-IGF-030 — promote a signal to a work item from the Vigil tab. Platform-admin
// gated; proxies to VG /api/vigil/work-items/promote server-side.

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { promoteSignal } from '@/lib/vigil/dashboard-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const authClient = await createServerSupabaseClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const serviceClient = await createServiceRoleClient();
    const { data: profile } = await serviceClient.from('profiles').select('id, role').eq('auth_user_id', user.id).maybeSingle();
    if (!profile || profile.role !== 'platform') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const b = (await request.json().catch(() => null)) as { signal_id?: string } | null;
    if (!b || typeof b.signal_id !== 'string') return NextResponse.json({ error: 'missing_signal_id' }, { status: 400 });
    const r = await promoteSignal(b.signal_id);
    return NextResponse.json(r.data, { status: r.ok ? 200 : r.status, headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'unknown' }, { status: 500 });
  }
}
