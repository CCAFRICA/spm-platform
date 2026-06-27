/**
 * OB-IGF-16 — Vigil Observatory API (platform admin only).
 *
 * GET → proxies the VG governance Vigil dashboard. VP's server calls VG with a
 * server-side service token (kept off the client) and returns the payload to the
 * Vigil tab. Read-only; VP never writes to VG. Platform-admin gate mirrors
 * /api/platform/ai-metrics. On VG unreachable/misconfig, returns 200 with
 * { available:false, ... } so the tab renders a clear message rather than crashing.
 */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { fetchVigilDashboard } from '@/lib/vigil/dashboard-client';

export async function GET() {
  try {
    const authClient = await createServerSupabaseClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const serviceClient = await createServiceRoleClient();
    const { data: profile } = await serviceClient
      .from('profiles')
      .select('id, role')
      .eq('auth_user_id', user.id)
      .maybeSingle();
    if (!profile || profile.role !== 'platform') {
      return NextResponse.json({ error: 'Forbidden — platform admin only' }, { status: 403 });
    }

    const result = await fetchVigilDashboard();
    if (!result.ok) {
      return NextResponse.json(
        { available: false, reason: result.reason, error: result.error },
        { status: 200, headers: { 'Cache-Control': 'no-store' } }
      );
    }
    return NextResponse.json(
      { available: true, ...result.data },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown_error';
    return NextResponse.json({ available: false, reason: 'unreachable', error: message }, { status: 200 });
  }
}
