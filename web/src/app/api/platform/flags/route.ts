/**
 * Platform Flags API — Public read-only feature flags
 *
 * GET /api/platform/flags → Returns boolean flags as JSON
 *
 * Public: No auth required. Used by middleware to determine routing behavior.
 * Uses service role client to bypass RLS.
 *
 * Includes 60-second in-memory cache to minimize DB hits per request.
 */

import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

// In-memory cache: { flags, timestamp }
let flagsCache: { flags: Record<string, boolean>; ts: number } | null = null;
const CACHE_TTL_MS = 60_000; // 60 seconds

const SAFE_DEFAULTS: Record<string, boolean> = {
  landing_page_enabled: false,
  gpv_enabled: false,
  public_signup_enabled: false,
};

export async function GET() {
  // Return cached flags if fresh
  if (flagsCache && Date.now() - flagsCache.ts < CACHE_TTL_MS) {
    return NextResponse.json(flagsCache.flags);
  }

  try {
    const serviceClient = await createServiceRoleClient();
    const { data: settings, error } = await serviceClient
      .from('platform_settings')
      .select('key, value');

    if (error || !settings) {
      // On error, return safe defaults (all features OFF)
      return NextResponse.json(SAFE_DEFAULTS);
    }

    const flags: Record<string, boolean> = {};
    settings.forEach((s: { key: string; value: unknown }) => {
      flags[s.key] = s.value === true || s.value === 'true';
    });

    // Update cache
    flagsCache = { flags, ts: Date.now() };

    return NextResponse.json(flags);
  } catch {
    return NextResponse.json(SAFE_DEFAULTS);
  }
}
