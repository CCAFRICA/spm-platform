/**
 * HF-352 — GET /api/platform/tenants/[tenantId]/data-summary
 * Per-category row counts for one tenant — what the admin is about to wipe (and the before/after
 * proof source). Platform-admin only. Tenant-scoped reads only. No mutation.
 */
import { NextRequest, NextResponse } from 'next/server';
import { authorizePlatformObservability } from '@/lib/auth/authorize-platform-observability';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { CLEAN_SLATE_CATEGORIES } from '@/lib/platform/tenant-deletion';
import type { SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ tenantId: string }> }) {
  const gate = await authorizePlatformObservability();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const { tenantId } = await params;

  const sb = (await createServiceRoleClient()) as unknown as SupabaseClient;
  const { data: tenant } = await sb.from('tenants').select('name, slug').eq('id', tenantId).maybeSingle();
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

  const categories = [];
  for (const cat of CLEAN_SLATE_CATEGORIES) {
    const tables = [];
    for (const t of cat.tables) {
      const { count, error } = await sb.from(t).select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId);
      tables.push({ table: t, count: error ? null : (count ?? 0) });
    }
    categories.push({ key: cat.key, label: cat.label, tables, total: tables.reduce((n, x) => n + (x.count ?? 0), 0) });
  }
  return NextResponse.json({ tenantId, tenantName: tenant.name, tenantSlug: tenant.slug, categories });
}
