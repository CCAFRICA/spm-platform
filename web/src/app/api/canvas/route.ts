/**
 * GET /api/canvas?tenant_id=...
 *
 * Returns entities + relationships for the organizational canvas.
 * Uses service role client to bypass RLS for admin-level visualization.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    // 1. Validate authenticated user
    const authClient = await createServerSupabaseClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // 2. Get tenant_id from query params
    const tenantId = request.nextUrl.searchParams.get('tenant_id');
    if (!tenantId) {
      return NextResponse.json({ error: 'Missing tenant_id parameter' }, { status: 400 });
    }

    // 3. Service role client (bypasses RLS)
    const supabase = await createServiceRoleClient();

    // 4. Fetch entities + relationships in parallel
    const [entitiesRes, relationshipsRes] = await Promise.all([
      supabase
        .from('entities')
        .select('id, entity_type, status, external_id, display_name, metadata')
        .eq('tenant_id', tenantId)
        .order('entity_type')
        .order('display_name'),
      supabase
        .from('entity_relationships')
        .select('id, source_entity_id, target_entity_id, relationship_type, confidence')
        .eq('tenant_id', tenantId),
    ]);

    if (entitiesRes.error) {
      console.error('[GET /api/canvas] Entities query failed:', entitiesRes.error);
      return NextResponse.json({ error: entitiesRes.error.message }, { status: 500 });
    }

    if (relationshipsRes.error) {
      console.error('[GET /api/canvas] Relationships query failed:', relationshipsRes.error);
      return NextResponse.json({ error: relationshipsRes.error.message }, { status: 500 });
    }

    return NextResponse.json({
      entities: entitiesRes.data ?? [],
      relationships: relationshipsRes.data ?? [],
    });
  } catch (err) {
    console.error('[GET /api/canvas] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
