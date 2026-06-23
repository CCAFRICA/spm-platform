// OB-233 (DS-030 Obj 9) — GET the tenant's comprehension report (comprehension_artifacts).
// Domain-agnostic: returns whatever fields were comprehended; the client renders them generically with
// NO domain conditionals (C3). Tenant is resolved server-side from the caller's profile; platform admins
// may target a tenant via ?tenantId=. This is the read behind the "here's what I understood" report that
// replaces a configuration form (DS-030 §5.3) — comprehension is a property of the data, not a plan.
import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
/* eslint-disable @typescript-eslint/no-explicit-any */

export async function GET(req: NextRequest) {
  const auth = await createServerSupabaseClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, fields: [] }, { status: 401 });

  const svc = await createServiceRoleClient();
  const { data: profile } = await svc.from('profiles').select('role, tenant_id').eq('auth_user_id', user.id).maybeSingle();
  const role = (profile as any)?.role;
  const isPlatform = role === 'platform' || role === 'vl_admin';
  const qpTenant = req.nextUrl.searchParams.get('tenantId');
  const tenantId = (isPlatform && qpTenant) ? qpTenant : (profile as any)?.tenant_id;
  if (!tenantId) return NextResponse.json({ ok: false, fields: [] }, { status: 400 });

  // comprehension_artifacts is newer than the generated Database types; query via the generic client
  // (same pattern as summary-read.ts for summary_artifacts).
  const { data, error } = await (svc as unknown as SupabaseClient).from('comprehension_artifacts')
    .select('field_name, characterization, data_nature, relationships, aggregation_behavior, identifies, display_label, aggregation_method')
    .eq('tenant_id', tenantId).order('field_name');
  if (error) return NextResponse.json({ ok: false, fields: [], error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, fields: data ?? [] });
}
