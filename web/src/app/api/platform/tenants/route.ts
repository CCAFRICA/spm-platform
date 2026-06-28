/**
 * HF-352 — GET /api/platform/tenants
 * The tenant list for the Tenant Management surface's selector. Platform-admin only
 * (authorizePlatformObservability — the ONE capability gate, no role-string). Service-role read.
 */
import { NextResponse } from 'next/server';
import { authorizePlatformObservability } from '@/lib/auth/authorize-platform-observability';
import { createServiceRoleClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const gate = await authorizePlatformObservability();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const sb = (await createServiceRoleClient()) as unknown as SupabaseClient;
  const { data, error } = await sb.from('tenants').select('id, name, slug').order('name');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tenants: data ?? [] });
}
