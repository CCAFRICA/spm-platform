/**
 * HF-309 §3.3/§3.4 — per-user theme preference.
 *
 * POST { theme: "current" | "bliss" }
 *   1. Merges the theme into the authenticated user's profiles.preferences (jsonb).
 *   2. Sets the vl-theme cookie (for pre-auth surfaces like the login page).
 *
 * HALT-2 (hard security constraint): the cookie value is ONLY the theme name string — never a
 * user id, tenant id, session token, or any auth data. The body theme is validated to be exactly
 * "current" | "bliss" before it is written anywhere. The cookie is non-sensitive, non-identifying.
 *
 * SR-39 does not fire: presentation-layer preference only; existing profiles RLS unchanged.
 */

import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';

const VALID = new Set(['current', 'bliss']);

export async function POST(request: NextRequest) {
  try {
    const authClient = await createServerSupabaseClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const theme = body?.theme;
    if (typeof theme !== 'string' || !VALID.has(theme)) {
      return NextResponse.json({ error: 'theme must be "current" or "bliss"' }, { status: 400 });
    }

    // Merge into preferences for THIS user's profile row(s) only (scoped by auth_user_id).
    // `preferences` was just added (HF-309) and is not yet in the generated Database types — use a
    // structurally-typed (untyped-schema) client so the live column is read/written, same pattern
    // as the OB-212 agent_invocations writer.
    const sb = (await createServiceRoleClient()) as unknown as SupabaseClient;
    const { data: rows, error: readErr } = await sb
      .from('profiles')
      .select('id, preferences')
      .eq('auth_user_id', user.id);
    if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });

    for (const row of rows ?? []) {
      const prefs = (row.preferences && typeof row.preferences === 'object') ? row.preferences : {};
      await sb.from('profiles').update({ preferences: { ...prefs, theme } }).eq('id', row.id);
    }

    const res = NextResponse.json({ theme });
    // HALT-2: theme name string ONLY — no user/tenant/session/auth data.
    res.cookies.set('vl-theme', theme, {
      path: '/',
      sameSite: 'lax',
      secure: true,
      maxAge: 31536000, // 1 year
    });
    return res;
  } catch (err) {
    console.error('[HF-309 user theme]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
