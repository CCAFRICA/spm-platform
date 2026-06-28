/**
 * OB-250 — PATCH /api/platform/tenants/[tenantId]/prism
 *
 * The privileged, audited platform-admin toggle for the per-tenant PRISM capability (I10). Writes
 * ONLY features.prism_enabled — DECOUPLED from billing (it is NOT routed through the modules PATCH,
 * which mutates settings.billing.modules + bundle_discount + monthly_total). prism_enabled is a
 * capability flag, not a priced module (a future billing layer may READ it; it is not a billing
 * object). The change is RECORDED in audit_logs (action 'tenant.prism_toggled'). VL-Admin only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { authorizePlatformObservability } from '@/lib/auth/authorize-platform-observability';
import { PRISM_FEATURE_KEY } from '@/lib/prism/capability';
import type { SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// HF-352 (M2/I5/I7): the prism toggle now shares the ONE capability gate every platform-admin route
// uses — authorizePlatformObservability() (platform.system_config). The prior inline role-string
// requireVlAdmin (profile.role==='platform') is removed: no role-string, no parallel auth path.

/** GET — the tenant's current PRISM capability state (for the toggle UI). Platform-admin only. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> },
) {
  const { tenantId } = await params;
  const gate = await authorizePlatformObservability();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const supabase = (await createServiceRoleClient()) as unknown as SupabaseClient;
  const { data: tenant } = await supabase.from('tenants').select('features').eq('id', tenantId).maybeSingle();
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
  const features = ((tenant.features as Record<string, unknown>) || {});
  return NextResponse.json({ [PRISM_FEATURE_KEY]: features[PRISM_FEATURE_KEY] === true });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> },
) {
  try {
    const { tenantId } = await params;

    const gate = await authorizePlatformObservability();
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const body = await request.json() as { enabled?: unknown };
    if (typeof body.enabled !== 'boolean') {
      return NextResponse.json({ error: 'enabled (boolean) required' }, { status: 400 });
    }
    const enabled = body.enabled;

    const supabase = (await createServiceRoleClient()) as unknown as SupabaseClient;
    const { data: tenant } = await supabase
      .from('tenants')
      .select('features')
      .eq('id', tenantId)
      .single();
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

    const features = { ...((tenant.features as Record<string, unknown>) || {}) };
    const previous = features[PRISM_FEATURE_KEY] === true;
    features[PRISM_FEATURE_KEY] = enabled;

    // ONLY features — no settings.billing mutation, no bundle/total recompute (decoupled, M1).
    const { error } = await supabase
      .from('tenants')
      .update({ features, updated_at: new Date().toISOString() })
      .eq('id', tenantId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // I10: record the privileged capability change (append-only audit_logs; SOC 2 CC6). Non-blocking.
    const { error: auditErr } = await supabase.from('audit_logs').insert({
      tenant_id: tenantId,
      profile_id: gate.caller.profileId,
      action: 'tenant.prism_toggled',
      resource_type: 'tenant',
      resource_id: tenantId,
      changes: { [PRISM_FEATURE_KEY]: { from: previous, to: enabled } },
      metadata: { source: 'platform-admin', actor_auth_user_id: gate.caller.authUserId },
    });
    if (auditErr) console.warn('[OB-250][prism-toggle] audit_logs write failed (non-blocking):', auditErr.message);

    return NextResponse.json({ [PRISM_FEATURE_KEY]: enabled, audited: !auditErr });
  } catch (err) {
    console.error('[PATCH /api/platform/tenants/[tenantId]/prism] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
