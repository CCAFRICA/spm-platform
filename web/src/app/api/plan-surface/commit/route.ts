/* eslint-disable @typescript-eslint/no-explicit-any */ // OB-228: writes untyped rule_sets.components JSONB
/**
 * OB-228 Phase 4 — POST /api/plan-surface/commit
 *
 * Deterministic plan-edit commit (Decision 158: construction writes to rule_sets.components
 * exactly). Replaces ONE component's calculationIntent (+ synced compositional_intent) in
 * the plan's components JSONB, and emits a classification_signals row (scope='tenant',
 * Three-Scope Flywheel — one correction, four improvements). Requires icm.configure_plans.
 *
 * Body: { ruleSetId, variantId, componentId, calculationIntent, compositionalIntent?, edits }
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getServerAuthState } from '@/lib/auth/server-auth';
import { personaFromIdentity } from '@/lib/plan-surface';
import { writeSignalWithClient } from '@/lib/intelligence/canonical-signal-writer'; // OB-235 P1: one canonical surface

const PLATFORM_ROLES = new Set(['platform', 'vl_admin']);

export async function POST(request: NextRequest) {
  const auth = await getServerAuthState();
  if (!auth.isAuthenticated || !auth.profile) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const identity = auth.profile;

  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const { ruleSetId, variantId, componentId, calculationIntent, compositionalIntent, edits } = body ?? {};
  if (!ruleSetId || !componentId || !calculationIntent || typeof calculationIntent !== 'object') {
    return NextResponse.json({ error: 'Missing ruleSetId/componentId/calculationIntent' }, { status: 400 });
  }

  let sb;
  try { sb = await createServiceRoleClient(); }
  catch { return NextResponse.json({ error: 'Service unavailable' }, { status: 503 }); }

  const { data: rs } = await sb.from('rule_sets').select('id, tenant_id, components').eq('id', ruleSetId).maybeSingle();
  if (!rs) return NextResponse.json({ error: 'rule_set not found' }, { status: 404 });
  const tenantId = (rs as any).tenant_id as string;

  // Authorization: edit capability + tenant scope.
  const scope = personaFromIdentity({ id: identity.id, tenantId, role: identity.role, capabilities: identity.capabilities }, null);
  const isPlatform = PLATFORM_ROLES.has((identity.role ?? '').toLowerCase());
  if (!scope.canEdit) return NextResponse.json({ error: 'Plan editing not permitted (requires icm.configure_plans)' }, { status: 403 });
  if (!isPlatform && tenantId !== identity.tenantId) return NextResponse.json({ error: 'Tenant not in scope' }, { status: 403 });

  // Deep-clone components and replace the target component's intent (D158: exact write).
  const components = JSON.parse(JSON.stringify((rs as any).components ?? {}));
  const variants: any[] = components?.configuration?.variants ?? components?.variants ?? (Array.isArray(components) ? [{ components }] : []);
  let found = false;
  for (const v of variants) {
    if (variantId && (v.variantId ?? v.id) !== variantId) continue;
    const comps: any[] = v.components ?? v.componentList ?? [];
    for (const c of comps) {
      if ((c.id ?? c.componentId ?? c.component_id) !== componentId) continue;
      c.calculationIntent = calculationIntent;
      c.metadata = c.metadata ?? {};
      c.metadata.intent = calculationIntent; // normalize reads calculationIntent ?? intent ?? metadata.intent
      if (compositionalIntent) c.metadata.compositional_intent = compositionalIntent;
      c.metadata.lastEditedBy = identity.id;
      found = true;
      break;
    }
    if (found) break;
  }
  if (!found) return NextResponse.json({ error: 'component not found in plan' }, { status: 404 });

  const { error: upErr } = await sb.from('rule_sets').update({ components, updated_at: new Date().toISOString() }).eq('id', ruleSetId);
  if (upErr) return NextResponse.json({ error: `write failed: ${upErr.message}` }, { status: 500 });

  // Three-Scope Flywheel: emit a tenant-scoped learning signal (open-vocabulary signal_type).
  let signalEmitted = true;
  try {
    await writeSignalWithClient({
      tenantId,
      signalType: 'plan.component.edited',
      signalValue: { ruleSetId, variantId: variantId ?? null, componentId, edits: edits ?? null },
      source: 'plan-surface',
      scope: 'tenant',
      context: { actorProfileId: identity.id, surface: 'living-plan-canvas', ob: 'OB-228' },
    }, sb);
  } catch (e) {
    signalEmitted = false;
    console.warn('[plan-surface/commit] signal emit failed (non-blocking):', e instanceof Error ? e.message : e);
  }

  return NextResponse.json({ ok: true, ruleSetId, componentId, signalEmitted });
}
