/**
 * Auth Callback — OAuth Code Exchange
 *
 * Handles the redirect from Google OAuth.
 * Exchanges the authorization code for a Supabase session.
 * If the user is new (no profile), auto-provisions a tenant + profile.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createServiceRoleClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=no_code', request.url));
  }

  // Create a Supabase client that can set cookies on the response
  const response = NextResponse.redirect(new URL('/', request.url));

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const { data: { session }, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !session?.user) {
    console.error('[Auth Callback] Code exchange failed:', error);
    return NextResponse.redirect(new URL('/login?error=exchange_failed', request.url));
  }

  // Check if user has a profile — if not, auto-provision
  const adminClient = await createServiceRoleClient();
  const { data: profile } = await adminClient
    .from('profiles')
    .select('id, tenant_id')
    .eq('auth_user_id', session.user.id)
    .single();

  if (!profile) {
    // New Google SSO user — create tenant + profile
    try {
      const email = session.user.email || '';
      const displayName = session.user.user_metadata?.full_name || email.split('@')[0];
      const orgName = email.split('@')[1]?.split('.')[0] || 'My Organization';

      // Create tenant
      const slug = orgName.toLowerCase().replace(/[^a-z0-9]/g, '-').substring(0, 50);
      const { data: tenant, error: tenantError } = await adminClient
        .from('tenants')
        .insert({
          name: orgName,
          display_name: displayName + "'s Organization",
          slug: slug + '-' + Date.now().toString(36),
          settings: {
            billing: { tier: 'free', status: 'trialing', trial_start: new Date().toISOString() },
            gpv: {
              plan_uploaded: false,
              plan_confirmed: false,
              data_uploaded: false,
              data_confirmed: false,
              first_calculation: false,
              completed_at: null,
            },
          },
        })
        .select('id')
        .single();

      if (tenantError || !tenant) {
        console.error('[Auth Callback] Tenant creation failed:', tenantError);
        return response; // Let them in anyway, they can be provisioned later
      }

      // Create profile
      await adminClient
        .from('profiles')
        .insert({
          auth_user_id: session.user.id,
          tenant_id: tenant.id,
          email,
          display_name: displayName,
          role: 'admin',
          capabilities: ['manage_rule_sets', 'import_data', 'manage_assignments', 'view_outcomes'],
        });

    } catch (provisionError) {
      console.error('[Auth Callback] Auto-provisioning failed:', provisionError);
      // Don't block login — they'll be redirected and can be helped manually
    }
  }

  return response;
}
