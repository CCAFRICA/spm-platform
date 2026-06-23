// OB-233 (DS-030) Obj 9 item 5 — POST /api/signals/comprehension-correction : write a
// "this characterization is wrong" judgement to the canonical signal surface. Tenant is resolved
// server-side from the caller's profile (tenant isolation); platform admins may target a selected
// tenant via body.tenantId. Capture only — acting on the signal is Out of Scope.
// Modelled exactly on web/src/app/api/signals/ui/route.ts.
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { recordComprehensionCorrection } from '@/lib/signals/comprehension-correction';

export const runtime = 'nodejs';

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function POST(req: NextRequest) {
  const auth = await createServerSupabaseClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    fieldName?: string; correction?: string; tenantId?: string | null;
  };
  // Structural-property check only (C0/AP-26): require a non-empty fieldName + correction. There is NO
  // set-membership gate — any free-form correction is accepted (open-vocabulary).
  if (!body.fieldName?.trim() || !body.correction?.trim()) {
    return NextResponse.json({ ok: false, error: 'fieldName + correction (both non-empty) required' }, { status: 400 });
  }

  const svc = await createServiceRoleClient();
  // resolve tenant from the caller's profile; platform may pass an explicit tenantId
  const { data: profile } = await svc.from('profiles').select('role, tenant_id').eq('auth_user_id', user.id).maybeSingle();
  const role = (profile as any)?.role;
  const isPlatform = role === 'platform' || role === 'vl_admin';
  const tenantId = (isPlatform && body.tenantId) ? body.tenantId : (profile as any)?.tenant_id;
  if (!tenantId) return NextResponse.json({ ok: false, error: 'no tenant' }, { status: 400 });

  const ok = await recordComprehensionCorrection(svc, {
    tenantId,
    fieldName: body.fieldName,
    correction: body.correction,
    actorId: user.id,
  });
  return NextResponse.json({ ok });
}
