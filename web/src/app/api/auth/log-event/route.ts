/**
 * POST /api/auth/log-event
 *
 * HF-149: Server-side auth event logging endpoint.
 * Called by client-side code (login, logout, MFA pages) where the
 * service role key is not available. Uses service role client to
 * INSERT into platform_events (bypasses RLS).
 *
 * The caller's auth state is resolved from the request cookies
 * to populate actor_id and tenant_id.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { SESSION_COOKIE_OPTIONS } from '@/lib/supabase/cookie-config';
import type { AuthEventType } from '@/lib/auth/auth-logger';

// HF-150: Reject GET requests (F10 — redirects hitting this endpoint as GET)
export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      eventType: AuthEventType;
      payload: Record<string, unknown>;
    };

    const { eventType, payload } = body;
    if (!eventType) {
      return NextResponse.json({ error: 'eventType required' }, { status: 400 });
    }

    // HF-150: Accept explicit actor_id/email/tenant_id from payload (logout case).
    // When cookies are about to be destroyed, the caller passes these explicitly.
    let actorId: string | null = (payload.actor_id as string) || null;
    let tenantId: string | null = (payload.tenant_id as string) || null;
    const explicitEmail = payload.email as string | undefined;

    // If not provided explicitly, resolve from cookies (login/MFA case)
    if (!actorId) {
      try {
        const supabaseAuth = createServerClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          {
            cookieOptions: SESSION_COOKIE_OPTIONS,
            cookies: {
              getAll() { return req.cookies.getAll(); },
              setAll() { /* read-only */ },
            },
          },
        );
        const { data: { user } } = await supabaseAuth.auth.getUser();
        if (user) {
          actorId = user.id;
          if (!explicitEmail) payload.email = user.email;
          // Resolve tenant from profile
          const { data: profiles } = await supabaseAuth
            .from('profiles')
            .select('tenant_id')
            .eq('auth_user_id', user.id)
            .limit(1);
          if (!tenantId) tenantId = profiles?.[0]?.tenant_id || null;
        }
      } catch {
        // Actor resolution failure is non-blocking
      }
    }

    // Insert using service role client (bypasses RLS)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    await supabase.from('platform_events').insert({
      tenant_id: tenantId, // NULL for platform-scope events
      event_type: eventType,
      actor_id: actorId,
      payload: {
        ...payload,
        timestamp: new Date().toISOString(),
        ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown',
        user_agent: req.headers.get('user-agent') || 'unknown',
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[HF-150] Auth log-event API error:', err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
