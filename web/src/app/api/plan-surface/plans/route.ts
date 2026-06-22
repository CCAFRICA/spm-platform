/* eslint-disable @typescript-eslint/no-explicit-any */ // OB-228: data layer walks untyped rule_sets.components / committed_data.row_data JSONB (substrate is dynamic by design)
/**
 * OB-228 — GET /api/plan-surface/plans?tenantId=...
 *
 * The persona-resolution seam (Concept ⑧) + the canvas data feed (Concept ①).
 * Resolves the caller's identity from the session, derives persona + scope
 * (personaFromIdentity reads role/capabilities; profile_scope read for visibility),
 * and returns the persona-scoped PlanStructure[]. Service-role client for the data
 * read (server-side, RLS-bypassing) — never row data through the body; PlanStructure
 * is aggregated structure, not per-row payload.
 *
 * Platform/vl_admin callers may target any tenantId; tenant-scoped callers are pinned
 * to their own tenant (fail-closed). No data fabrication; returns 200 with [] on empty.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getServerAuthState } from '@/lib/auth/server-auth';
import { personaFromIdentity, getVisiblePlans } from '@/lib/plan-surface';
import { buildPlanTopology } from '@/lib/plan-surface/confidence';
import { resolveBindingColumns } from '@/lib/plan-surface/binding-status';

const PLATFORM_ROLES = new Set(['platform', 'vl_admin']);

export async function GET(request: NextRequest) {
  const auth = await getServerAuthState();
  if (!auth.isAuthenticated || !auth.profile) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const identity = auth.profile;

  const requestedTenant = request.nextUrl.searchParams.get('tenantId');
  const isPlatform = PLATFORM_ROLES.has((identity.role ?? '').toLowerCase());
  const effectiveTenant = isPlatform ? (requestedTenant ?? identity.tenantId) : identity.tenantId;
  if (!effectiveTenant) {
    return NextResponse.json({ error: 'No tenant in scope' }, { status: 400 });
  }
  if (!isPlatform && requestedTenant && requestedTenant !== identity.tenantId) {
    return NextResponse.json({ error: 'Tenant not in scope' }, { status: 403 });
  }

  let sb;
  try { sb = await createServiceRoleClient(); }
  catch { return NextResponse.json({ error: 'Service unavailable' }, { status: 503 }); }

  // profile_scope (empty platform-wide in Phase 1 → admin defaults all-visible)
  const { data: scopeRow } = await sb
    .from('profile_scope')
    .select('visible_rule_set_ids, visible_entity_ids, visible_period_ids')
    .eq('profile_id', identity.id)
    .maybeSingle();

  const scope = personaFromIdentity(
    { id: identity.id, tenantId: effectiveTenant, role: identity.role, capabilities: identity.capabilities },
    scopeRow as any,
  );

  try {
    const plans = await getVisiblePlans(effectiveTenant, scope, sb as any);

    // Concept ③ — confidence/anomaly topology. Precise per-column existence probe (accurate
    // across sheets of any size; period-agnostic — an interpreter-token binding never appears
    // in ANY period, the stable anomaly). One limit-1 query per DISTINCT bound column.
    const allColumns = plans.flatMap((p) => p.variants.flatMap((v) => v.components.map((c) => c.binding.column)));
    const present = await resolveBindingColumns(sb as any, effectiveTenant, allColumns);
    for (const p of plans) {
      const resolvedByComponent: Record<string, boolean> = {};
      for (const v of p.variants) for (const c of v.components) {
        resolvedByComponent[c.id] = c.binding.column ? present.has(c.binding.column) : false;
      }
      p.topology = buildPlanTopology(p, resolvedByComponent);
    }

    return NextResponse.json({ persona: scope, tenantId: effectiveTenant, plans });
  } catch (err) {
    console.error('[GET /api/plan-surface/plans]', err);
    return NextResponse.json({ persona: scope, tenantId: effectiveTenant, plans: [] });
  }
}
