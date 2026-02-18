/**
 * GPV (Guided Proof of Value) State API
 *
 * Tracks per-tenant progress through the 3-step activation wizard:
 *   plan_uploaded → plan_confirmed → data_uploaded → data_confirmed → first_calculation
 *
 * GET  /api/gpv?tenantId=<uuid>  — fetch current GPV state
 * POST /api/gpv { tenantId, step } — advance a GPV step
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import type { Json } from '@/lib/supabase/database.types';
import { emitEvent } from '@/lib/events/emitter';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_STEPS = ['plan_uploaded', 'plan_confirmed', 'data_uploaded', 'data_confirmed', 'first_calculation'];

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tenantId = searchParams.get('tenantId');

  if (!tenantId || !UUID_REGEX.test(tenantId)) {
    return NextResponse.json({ error: 'Valid tenantId (UUID) required' }, { status: 400 });
  }

  const supabase = await createServiceRoleClient();
  const { data: tenant } = await supabase
    .from('tenants')
    .select('settings')
    .eq('id', tenantId)
    .single();

  const gpv = (tenant?.settings as Record<string, unknown>)?.gpv || {
    plan_uploaded: false,
    plan_confirmed: false,
    data_uploaded: false,
    data_confirmed: false,
    first_calculation: false,
    completed_at: null,
  };

  // Also return raw settings for trial status computation
  const rawSettings = (tenant?.settings || {}) as Record<string, unknown>;
  return NextResponse.json({ gpv, _settings: rawSettings });
}

export async function POST(request: NextRequest) {
  try {
    const { tenantId, step } = await request.json();

    if (!tenantId || !UUID_REGEX.test(tenantId)) {
      return NextResponse.json({ error: 'Valid tenantId (UUID) required' }, { status: 400 });
    }

    if (!VALID_STEPS.includes(step)) {
      return NextResponse.json({ error: `Invalid step. Valid: ${VALID_STEPS.join(', ')}` }, { status: 400 });
    }

    const supabase = await createServiceRoleClient();

    // Get current settings
    const { data: tenant } = await supabase
      .from('tenants')
      .select('settings')
      .eq('id', tenantId)
      .single();

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    const settings = (tenant.settings || {}) as Record<string, unknown>;
    const gpv = (settings.gpv || {}) as Record<string, unknown>;
    gpv[step] = true;

    // Mark complete if all critical steps done
    if (gpv.plan_confirmed && gpv.data_confirmed && gpv.first_calculation) {
      gpv.completed_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from('tenants')
      .update({ settings: { ...settings, gpv } as unknown as Json })
      .eq('id', tenantId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Emit event for GPV step advancement (fire-and-forget)
    const eventMap: Record<string, string> = {
      plan_confirmed: 'plan.confirmed',
      data_confirmed: 'data.committed',
      first_calculation: 'calculation.completed',
    };
    if (eventMap[step]) {
      emitEvent({
        tenant_id: tenantId,
        event_type: eventMap[step] as import('@/lib/events/emitter').PlatformEventType,
        payload: { source: 'gpv', step },
      }).catch(() => {});
    }

    return NextResponse.json({ success: true, gpv });
  } catch (err) {
    console.error('[POST /api/gpv] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
