// OB-232 EP-1 — POST /api/signals/ui : write a UI interaction to the canonical signal surface.
// Tenant is resolved server-side from the caller's profile (tenant isolation); platform admins may
// target a selected tenant via body.tenantId. Fire-and-forget from the client; never blocks the UI.
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { recordUiSignal } from '@/lib/signals/ui-signal';

export const runtime = 'nodejs';

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function POST(req: NextRequest) {
  const auth = await createServerSupabaseClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    signalType?: string; surface?: string; entityId?: string | null; metricKey?: string | null; sessionId?: string | null; tenantId?: string | null;
  };
  // Structural-property check only (C0/AP-26): require a non-empty signalType + surface. There is NO
  // set-membership gate — any free-form interaction characterization is accepted (open-vocabulary).
  if (!body.signalType?.trim() || !body.surface) {
    return NextResponse.json({ ok: false, error: 'signalType (structural) + surface required' }, { status: 400 });
  }

  const svc = await createServiceRoleClient();
  // resolve tenant from the caller's profile; platform may pass an explicit tenantId
  const { data: profile } = await svc.from('profiles').select('role, tenant_id').eq('auth_user_id', user.id).maybeSingle();
  const role = (profile as any)?.role;
  const isPlatform = role === 'platform' || role === 'vl_admin';
  const tenantId = (isPlatform && body.tenantId) ? body.tenantId : (profile as any)?.tenant_id;
  if (!tenantId) return NextResponse.json({ ok: false, error: 'no tenant' }, { status: 400 });

  const ok = await recordUiSignal(svc, {
    tenantId,
    signalType: body.signalType,
    surface: body.surface,
    entityId: body.entityId ?? null,
    metricKey: body.metricKey ?? null,
    sessionId: body.sessionId ?? null,
    actorId: user.id,
  });
  return NextResponse.json({ ok });
}
