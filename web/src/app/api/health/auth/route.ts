import { NextResponse } from 'next/server';

/**
 * Auth Health Check — verifies Supabase env vars are baked into the build.
 *
 * GET /api/health/auth
 *
 * Returns env var status (presence + prefix only, never full keys).
 * Use this to verify production deployments have correct configuration.
 */
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const isValidUrl = !!url && url.includes('.supabase.co');
  const isValidKey = !!key && key.startsWith('eyJ') && key.length > 100;

  return NextResponse.json({
    status: isValidUrl && isValidKey ? 'ok' : 'misconfigured',
    supabase_url_set: !!url,
    supabase_url_domain: url ? new URL(url).hostname : null,
    anon_key_set: !!key,
    anon_key_prefix: key ? key.substring(0, 20) + '...' : null,
    anon_key_valid_jwt: isValidKey,
    environment: process.env.NODE_ENV,
    vercel_env: process.env.VERCEL_ENV || 'not-vercel',
  });
}
