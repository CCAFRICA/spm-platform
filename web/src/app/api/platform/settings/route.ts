/**
 * Platform Settings API — Authenticated CRUD for feature flags
 *
 * GET  /api/platform/settings  → All settings (platform admin only)
 * PATCH /api/platform/settings → Update a single setting (platform admin only)
 *
 * Uses service role client for DB access after validating platform scope.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';

// GET: Return all platform settings (platform admin only)
export async function GET() {
  try {
    // Verify caller is platform admin (matches observatory route pattern)
    const authClient = await createServerSupabaseClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const serviceClient = await createServiceRoleClient();
    const { data: profile } = await serviceClient
      .from('profiles')
      .select('id, role')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (!profile || profile.role !== 'vl_admin') {
      return NextResponse.json({ error: 'Forbidden — platform admin only' }, { status: 403 });
    }

    const { data: settings, error } = await serviceClient
      .from('platform_settings')
      .select('*')
      .order('key');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ settings });
  } catch (err) {
    console.error('[Platform Settings GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH: Update a single setting (platform admin only)
export async function PATCH(request: NextRequest) {
  try {
    const authClient = await createServerSupabaseClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const serviceClient = await createServiceRoleClient();
    const { data: profile } = await serviceClient
      .from('profiles')
      .select('id, role')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (!profile || profile.role !== 'vl_admin') {
      return NextResponse.json({ error: 'Forbidden — platform admin only' }, { status: 403 });
    }

    const body = await request.json();
    const { key, value } = body;

    if (!key || value === undefined) {
      return NextResponse.json({ error: 'key and value required' }, { status: 400 });
    }

    const { data: updated, error } = await serviceClient
      .from('platform_settings')
      .update({
        value: JSON.stringify(value),
        updated_by: profile.id, // profile.id (FK to profiles), NOT auth user.id
        updated_at: new Date().toISOString(),
      })
      .eq('key', key)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ setting: updated });
  } catch (err) {
    console.error('[Platform Settings PATCH]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
