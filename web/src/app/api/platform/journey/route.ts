/**
 * User Journey API
 *
 * GET  /api/platform/journey?userId=<uuid>&tenantId=<uuid> — Fetch completed milestones
 * POST /api/platform/journey { userId, tenantId, milestone } — Mark milestone as completed
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  const tenantId = searchParams.get('tenantId');

  if (!userId || !UUID_REGEX.test(userId)) {
    return NextResponse.json({ error: 'Valid userId (UUID) required' }, { status: 400 });
  }
  if (!tenantId || !UUID_REGEX.test(tenantId)) {
    return NextResponse.json({ error: 'Valid tenantId (UUID) required' }, { status: 400 });
  }

  const supabase = await createServiceRoleClient();
  // user_journey table created via SQL migration — not yet in generated types
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as unknown as { from: (t: string) => any })
    .from('user_journey')
    .select('milestone, completed_at')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .order('completed_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ milestones: data || [] });
}

export async function POST(request: NextRequest) {
  try {
    const { userId, tenantId, milestone } = await request.json();

    if (!userId || !UUID_REGEX.test(userId)) {
      return NextResponse.json({ error: 'Valid userId (UUID) required' }, { status: 400 });
    }
    if (!tenantId || !UUID_REGEX.test(tenantId)) {
      return NextResponse.json({ error: 'Valid tenantId (UUID) required' }, { status: 400 });
    }
    if (!milestone || typeof milestone !== 'string') {
      return NextResponse.json({ error: 'milestone (string) required' }, { status: 400 });
    }

    const supabase = await createServiceRoleClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as unknown as { from: (t: string) => any })
      .from('user_journey')
      .upsert(
        {
          user_id: userId,
          tenant_id: tenantId,
          milestone,
          completed_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,tenant_id,milestone' },
      );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[POST /api/platform/journey] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
