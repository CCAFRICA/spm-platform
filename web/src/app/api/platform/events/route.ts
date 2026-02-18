/**
 * Platform Events API
 *
 * POST /api/platform/events — Insert a platform event
 * GET  /api/platform/events?tenantId=<uuid>&since=<iso>&limit=<n> — Fetch recent events
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { runAgentLoop } from '@/lib/agents/runner';
import type { PlatformEventType } from '@/lib/events/emitter';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  try {
    const event = await request.json();

    if (!event.tenant_id || !UUID_REGEX.test(event.tenant_id)) {
      return NextResponse.json({ error: 'Valid tenant_id (UUID) required' }, { status: 400 });
    }

    if (!event.event_type) {
      return NextResponse.json({ error: 'event_type required' }, { status: 400 });
    }

    const supabase = await createServiceRoleClient();
    // platform_events table created via SQL migration — not yet in generated types
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('platform_events')
      .insert({
        tenant_id: event.tenant_id,
        event_type: event.event_type as PlatformEventType,
        actor_id: event.actor_id || null,
        entity_id: event.entity_id || null,
        payload: event.payload || {},
        processed_by: [],
      });

    if (error) {
      console.error('[POST /api/platform/events] Insert error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Fire-and-forget: trigger agent loop
    runAgentLoop(event.tenant_id, event.event_type).catch(err =>
      console.error('[POST /api/platform/events] Agent loop failed:', err)
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[POST /api/platform/events] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tenantId = searchParams.get('tenantId');
  const since = searchParams.get('since');
  const limit = parseInt(searchParams.get('limit') || '50', 10);

  if (!tenantId || !UUID_REGEX.test(tenantId)) {
    return NextResponse.json({ error: 'Valid tenantId (UUID) required' }, { status: 400 });
  }

  const supabase = await createServiceRoleClient();
  // platform_events table created via SQL migration — not yet in generated types
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from('platform_events')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(Math.min(limit, 200));

  if (since) {
    query = query.gte('created_at', since);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ events: data || [] });
}
