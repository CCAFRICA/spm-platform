/**
 * POST /api/audit  (OB-213 Phase 3A)
 *
 * Persist an audit event to audit_logs. Identity is resolved from the authed session
 * (no client-supplied tenant_id/profile_id trust). Maps the UI AuditLogEntry shape
 * (entityType/entityId) → the DB columns (resource_type/resource_id). The in-memory
 * audit-service now POSTs here so emit sites persist (AUD-009 class-layer fix).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const auth = await createServerSupabaseClient();
    const { data: { user } } = await auth.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { data: profiles } = await auth.from('profiles').select('id, tenant_id').eq('auth_user_id', user.id).limit(1);
    const profile = profiles?.[0];
    if (!profile) return NextResponse.json({ error: 'No profile for user' }, { status: 403 });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const { action, entityType, entityId, changes, metadata } = body;
    if (!action || !entityType) {
      return NextResponse.json({ error: 'action and entityType are required' }, { status: 400 });
    }

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
    const sb = await createServiceRoleClient();
    // audit_logs is not in the generated Database types — relaxed insert.
    const relaxed = sb as unknown as {
      from: (t: string) => { insert: (r: Record<string, unknown>) => Promise<{ error: { message: string } | null }> };
    };
    const { error } = await relaxed.from('audit_logs').insert({
      tenant_id: profile.tenant_id,
      profile_id: profile.id,
      action: String(action),
      resource_type: String(entityType),
      resource_id: entityId ? String(entityId) : null,
      changes: changes ?? null,
      ip_address: ip,
      metadata: metadata ?? {},
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'audit insert failed' }, { status: 500 });
  }
}
