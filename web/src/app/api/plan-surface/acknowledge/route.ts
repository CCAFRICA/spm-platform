/* eslint-disable @typescript-eslint/no-explicit-any */ // OB-228: writes untyped signal JSONB
/**
 * OB-228 Phase 5 — POST /api/plan-surface/acknowledge
 * Concept ③ acknowledge affordance. An admin acknowledging a confidence/anomaly flag
 * emits a tenant-scoped classification_signals row (Three-Scope Flywheel — recognition
 * fed back as a learning signal). Requires icm.configure_plans.
 * Body: { ruleSetId, componentId, severity, reason }
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getServerAuthState } from '@/lib/auth/server-auth';
import { personaFromIdentity } from '@/lib/plan-surface';

const PLATFORM_ROLES = new Set(['platform', 'vl_admin']);

export async function POST(request: NextRequest) {
  const auth = await getServerAuthState();
  if (!auth.isAuthenticated || !auth.profile) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const identity = auth.profile;

  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const { ruleSetId, componentId, severity, reason } = body ?? {};
  if (!ruleSetId || !componentId) return NextResponse.json({ error: 'Missing ruleSetId/componentId' }, { status: 400 });

  let sb;
  try { sb = await createServiceRoleClient(); }
  catch { return NextResponse.json({ error: 'Service unavailable' }, { status: 503 }); }

  const { data: rs } = await sb.from('rule_sets').select('tenant_id').eq('id', ruleSetId).maybeSingle();
  if (!rs) return NextResponse.json({ error: 'rule_set not found' }, { status: 404 });
  const tenantId = (rs as any).tenant_id as string;
  const scope = personaFromIdentity({ id: identity.id, tenantId, role: identity.role, capabilities: identity.capabilities }, null);
  const isPlatform = PLATFORM_ROLES.has((identity.role ?? '').toLowerCase());
  if (!scope.canEdit) return NextResponse.json({ error: 'Not permitted' }, { status: 403 });
  if (!isPlatform && tenantId !== identity.tenantId) return NextResponse.json({ error: 'Tenant not in scope' }, { status: 403 });

  const { error } = await sb.from('classification_signals').insert({
    tenant_id: tenantId,
    signal_type: 'plan.confidence.acknowledged',
    signal_value: { ruleSetId, componentId, severity: severity ?? null, reason: reason ?? null },
    source: 'plan-surface',
    scope: 'tenant',
    context: { actorProfileId: identity.id, surface: 'living-plan-canvas', ob: 'OB-228' },
  });
  if (error) return NextResponse.json({ error: `signal failed: ${error.message}` }, { status: 500 });
  return NextResponse.json({ ok: true });
}
