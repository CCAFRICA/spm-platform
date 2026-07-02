/**
 * OB-252 — PATCH /api/platform/tenants/[tenantId]/entitlement
 *
 * The Observatory Tenant Admin surface's AGENT ENTITLEMENT writer (Section B). ONE deterministic
 * writer for every per-agent feature flag (Intelligence/performance, Compensation/compensation,
 * Finance/financial, PRISM/prism_enabled). `tenants.features` is the single source of truth (I3);
 * this route does NOT touch settings.billing (entitlement is decoupled from billing, the PRISM
 * precedent).
 *
 * The accepted `featureKey` set is DERIVED structurally from the workspaces that declare a
 * featureFlag (toggleableFeatureKeys) — no hardcoded list (Korean Test). Platform Core has no
 * featureFlag, so it can never be toggled (PG-7). Every change writes a before→after audit row (I4).
 * Pure boolean logic, ZERO LLM (Decision 158 / I2).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { authorizePlatformObservability } from '@/lib/auth/authorize-platform-observability';
import { toggleableFeatureKeys } from '@/lib/navigation/workspace-config';
import { isFeatureEnabled } from '@/lib/tenant/feature-flags';
import { writeAuditLog } from '@/lib/audit/audit-logger';
import { REVENUE_FEATURE_KEY, type MaterializeResult } from '@/lib/revenue/types';
import { materializeRevenueRollups } from '@/lib/revenue/materializer';
import type { SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // the inline revenue activation pages the whole committed_data set (same budget as /api/revenue/activate)

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> },
) {
  try {
    const { tenantId } = await params;
    const gate = await authorizePlatformObservability();
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const body = (await request.json()) as { featureKey?: unknown; enabled?: unknown };
    if (typeof body.featureKey !== 'string') {
      return NextResponse.json({ error: 'featureKey (string) required' }, { status: 400 });
    }
    if (typeof body.enabled !== 'boolean') {
      return NextResponse.json({ error: 'enabled (boolean) required' }, { status: 400 });
    }
    const featureKey = body.featureKey;
    const enabled = body.enabled;

    // Validate against the structurally-derived toggleable set — reject anything that is not a
    // real agent feature flag (e.g. Platform Core has none; a typo cannot silently write garbage).
    if (!toggleableFeatureKeys().includes(featureKey)) {
      return NextResponse.json(
        { error: `featureKey '${featureKey}' is not a toggleable agent entitlement`, allowed: toggleableFeatureKeys() },
        { status: 400 },
      );
    }

    const supabase = (await createServiceRoleClient()) as unknown as SupabaseClient;
    const { data: tenant, error: readErr } = await supabase
      .from('tenants')
      .select('features')
      .eq('id', tenantId)
      .maybeSingle();
    if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

    const features = { ...((tenant.features as Record<string, unknown>) || {}) };
    // Audit honesty (I4 / SOC 2 CC6): the EFFECTIVE prior entitlement, not the raw-stored value. A
    // default-ON agent (e.g. compensation) with no explicit key is effectively true; recording the
    // raw `=== true` (false) would log a misleading from:false→to:false when toggling it off.
    const previous = isFeatureEnabled(features, featureKey);
    features[featureKey] = enabled;

    // ONLY features — no settings.billing mutation (decoupled, PRISM precedent). Persist the explicit
    // value (so the entitlement is concrete in the JSONB even when it equals the default).
    const { error: writeErr } = await supabase
      .from('tenants')
      .update({ features, updated_at: new Date().toISOString() })
      .eq('id', tenantId);
    if (writeErr) return NextResponse.json({ error: writeErr.message }, { status: 500 });

    // I4 audit (append-only audit_logs; SOC 2 CC6) — ONLY when the effective entitlement changed.
    const changed = previous !== enabled;
    if (changed) {
      await writeAuditLog(supabase, {
        tenant_id: tenantId,
        profile_id: gate.caller.profileId,
        action: 'tenant.entitlement_toggled',
        resource_type: 'tenant',
        resource_id: tenantId,
        changes: { [featureKey]: { from: previous, to: enabled } },
        metadata: { source: 'observatory-tenant-admin', actor_auth_user_id: gate.caller.authUserId },
      });
    }

    // OB-257 (directive section 3.5 PG-2): the entitlement toggle IS the activation trigger.
    // Flipping revenue_enabled false->true runs the ONE revenue materializer inline (same function
    // the import-finalize cascade and /api/revenue/activate call -- single cascade, no parallel
    // writer). Activation failure must NOT fail the toggle -- the features write + audit above are
    // already durable; the failure is reported in the response's activation field (re-runnable via
    // /api/revenue/activate).
    let activation: MaterializeResult | { ok: false; error: string } | undefined;
    if (featureKey === REVENUE_FEATURE_KEY && enabled === true && previous === false) {
      try {
        activation = await materializeRevenueRollups(supabase, tenantId);
      } catch (err) {
        activation = { ok: false, error: err instanceof Error ? err.message : String(err) };
        console.error('[PATCH entitlement] revenue activation failed (toggle preserved):', activation.error);
      }
    }

    return NextResponse.json({ featureKey, enabled, changed, features, ...(activation !== undefined ? { activation } : {}) });
  } catch (err) {
    console.error('[PATCH /api/platform/tenants/[tenantId]/entitlement] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
