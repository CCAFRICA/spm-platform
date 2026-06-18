/**
 * OB-201 — server-side active-theme reader.
 *
 * Reads the global `active_ui_theme` row from platform_settings so the root layout (a server
 * component) can emit `<html data-theme="{value}">` in the INITIAL server-rendered HTML — no
 * FOUC, no client-side theme flip. Falls back to 'current' on any error (row missing, cold
 * start), so the app is always correct and visually inert by default.
 *
 * Uses the next/headers-free service-role client (this is read from a server component; the
 * setting is global/non-tenant so service-role is appropriate).
 */

import { createServiceRoleClientSafe } from '@/lib/supabase/service-role';

export type AppTheme = 'current' | 'bliss';

/**
 * HF-309: three-level resolution. `explicit` is the per-context preference — the authed user's
 * profiles.preferences->>'theme' (root layout), or the vl-theme cookie (pre-auth/login). If set,
 * it wins; otherwise fall through to the global platform_settings default, then 'current'.
 */
export async function getResolvedTheme(explicit?: AppTheme | null | string): Promise<AppTheme> {
  if (explicit === 'bliss' || explicit === 'current') return explicit;
  return getActiveTheme(); // global default → 'current'
}

export async function getActiveTheme(): Promise<AppTheme> {
  try {
    const sb = await createServiceRoleClientSafe();
    const { data } = await sb
      .from('platform_settings')
      .select('value')
      .eq('key', 'active_ui_theme')
      .maybeSingle();
    const raw = data?.value;
    // jsonb may surface as a parsed string ('bliss') or, defensively, a quoted JSON string ('"bliss"').
    const normalized = typeof raw === 'string' ? raw.replace(/^"|"$/g, '') : '';
    return normalized === 'bliss' ? 'bliss' : 'current';
  } catch {
    return 'current';
  }
}
