/**
 * HF-352 — POST /api/platform/tenants/[tenantId]/delete
 * Complete tenant removal (the tenant record + all associated data). Platform-admin only (I5).
 * Two-step server-enforced (I2). Dependents-first, per-table reported, 23503-guarded (I3/I8).
 *
 * I6 (audit survival, the review blocker): the deletion erases the tenant's own audit_logs, so the
 * deletion audit is written to platform_events with tenant_id=NULL (platform-scoped, NOT cascade-bound
 * to the target) BEFORE the sweep, and verified persisted — so the record survives the deletion.
 */
import { NextRequest, NextResponse } from 'next/server';
import { authorizePlatformObservability } from '@/lib/auth/authorize-platform-observability';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { verifyChallenge } from '@/lib/platform/confirm-challenge';
import { runDeleteTenant } from '@/lib/platform/tenant-deletion';
import type { SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ tenantId: string }> }) {
  const gate = await authorizePlatformObservability();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const { tenantId } = await params;

  let body: { confirmName?: unknown; challenge?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid body' }, { status: 400 }); }

  const sb = (await createServiceRoleClient()) as unknown as SupabaseClient;
  const { data: tenant } = await sb.from('tenants').select('name').eq('id', tenantId).maybeSingle();
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

  // I2 — server-enforced confirmation (typed name + signed challenge), before any delete.
  const confirmName = typeof body.confirmName === 'string' ? body.confirmName : '';
  if (!confirmName || !tenant.name || confirmName !== tenant.name) {
    return NextResponse.json({ error: 'confirmation name does not match the tenant' }, { status: 403 });
  }
  if (typeof body.challenge !== 'string' || !verifyChallenge('delete-tenant', tenantId, body.challenge, Date.now())) {
    return NextResponse.json({ error: 'missing or invalid confirmation challenge' }, { status: 403 });
  }

  // I6 — audit FAIL-CLOSED to a tenant-survivable store (platform_events, tenant_id=NULL), BEFORE the
  // sweep. If this write fails, abort with NO deletes (never delete a tenant un-audited).
  const auditPayload = {
    target_tenant_id: tenantId, target_tenant_name: tenant.name, phase: 'initiated',
    actor: { profileId: gate.caller.profileId, authUserId: gate.caller.authUserId, email: gate.caller.email },
  };
  const { error: auditErr } = await sb.from('platform_events').insert({
    tenant_id: null, event_type: 'tenant.deleted', actor_id: gate.caller.authUserId, payload: auditPayload,
  });
  if (auditErr) return NextResponse.json({ error: 'aborted: audit write failed (fail-closed)', detail: auditErr.message }, { status: 500 });

  // Destructive sweep + the tenant row.
  const result = await runDeleteTenant(sb, tenantId);

  // Result audit (best-effort) — tenant_id=NULL survives.
  await sb.from('platform_events').insert({
    tenant_id: null, event_type: 'tenant.deleted', actor_id: gate.caller.authUserId,
    payload: { ...auditPayload, phase: result.tenantDeleted ? 'completed' : 'partial', totalDeleted: result.totalDeleted, tenantDeleted: result.tenantDeleted, blockingRelation: result.blockingRelation ?? null, perTable: result.results },
  });

  if (!result.tenantDeleted) {
    return NextResponse.json({
      ok: false, tenantId, tenantName: tenant.name,
      error: result.blockingRelation ? `tenant delete blocked by ${result.blockingRelation}` : (result.error ?? 'tenant row not deleted'),
      blockingRelation: result.blockingRelation ?? null, results: result.results, totalDeleted: result.totalDeleted, audited: true,
    }, { status: 409 });
  }

  return NextResponse.json({ ok: true, tenantId, tenantName: tenant.name, tenantDeleted: true, results: result.results, totalDeleted: result.totalDeleted, audited: true });
}
