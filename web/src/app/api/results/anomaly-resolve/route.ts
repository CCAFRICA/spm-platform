/**
 * OB-207 Inc2 Pass2 §5 — POST /api/results/anomaly-resolve
 *
 * Wires the Admin anomaly "Resolve" action to a concrete result: an `audit_logs` row
 * (Action Proximity / TMR-5). FP-49: audit_logs uses `profile_id` (NOT actor_id) —
 * confirmed live. No new schema. Tenant-scoped; the actor is the resolving admin's profile.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const authClient = await createServerSupabaseClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { tenantId, batchId, anomalyType, description, entityCount } = body ?? {};
  if (!tenantId || !anomalyType) return NextResponse.json({ error: 'tenantId and anomalyType are required' }, { status: 400 });

  // Resolve the actor's profile (the audit row's profile_id) from the session.
  const { data: profile } = await authClient
    .from('profiles').select('id, tenant_id, role').eq('auth_user_id', user.id).maybeSingle();
  const profileId = (profile?.id as string | undefined) ?? null;

  // SR-39 isolation: never write an audit row for a tenant the caller does not belong to.
  // A platform admin may act across tenants; everyone else is pinned to their own tenant.
  const isPlatform = ['platform', 'vl_admin'].includes((profile?.role as string) ?? '');
  if (!isPlatform && profile?.tenant_id !== tenantId) {
    return NextResponse.json({ error: 'cross-tenant write refused' }, { status: 403 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sb: any;
  try { sb = await createServiceRoleClient(); } catch { sb = authClient; }

  const { error } = await sb.from('audit_logs').insert({
    tenant_id: tenantId,
    profile_id: profileId,
    action: 'anomaly.resolved',
    resource_type: 'calculation_batch',
    resource_id: batchId ?? null,
    changes: { anomalyType, description: description ?? null, entityCount: entityCount ?? null, disposition: 'acknowledged' },
    metadata: { surface: 'admin_results', source: 'OB-207-inc2-pass2' },
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
