/**
 * HF-282 Phase 1 — Canonical post-auth identity resolution.
 *
 * THE only sanctioned `profiles`-by-`auth_user_id` read. Architect disposition
 * (2026-06-10): one auth user maps to exactly one profiles row; role inheritance
 * is a presentation concern, never duplicate identity rows. SOC 2 CC6 (unique
 * identification -> single authorization record).
 *
 * Contract:
 *  - array-tolerant during the migration window (no `.single()` / `.maybeSingle()`
 *    anywhere in this module — those ERROR on >1 row, which is the DIAG-060 defect);
 *  - deterministic winner: first alias-normalized `platform` row, else first row
 *    carrying the `manage_tenants` capability (retained for DD-7: existing
 *    consumers fetchCurrentProfile/server-auth used this tiebreaker), else the
 *    oldest row (created_at ascending);
 *  - role compared via `resolveRole` (alias-normalized; NEVER raw literal equality
 *    against `'vl_admin'`) — Korean Test / AP-25: zero account/email/tenant literals;
 *  - loud on anomaly: query error / zero rows / duplicate rows each emit a named
 *    `identity.resolve.*` event through the non-blocking logAuthEvent channel.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveRole, type Role } from '@/lib/auth/permissions';
import { logAuthEvent, logAuthEventClient } from '@/lib/auth/auth-logger';

/**
 * HF-283 A1.1 — the single app-side canonical declaration of the platform-role
 * alias set. `'vl_admin'` is the legacy alias of canonical `'platform'`.
 * `resolveRole` (permissions.ts) derives its platform mapping from this constant,
 * and `public.is_platform()` (the DB predicate, HF-283 migration) is its paired
 * DB-side declaration. Remove `'vl_admin'` from BOTH surfaces together when the
 * legacy literal is purged data-side (Platform-Created-Users OB). Consumers
 * reference this only at call-time (avoids the resolve-identity <-> permissions
 * module-init cycle).
 */
export const PLATFORM_ROLE_VALUES = ['platform', 'vl_admin'] as const;

export interface ResolvedIdentity {
  /** profiles.id of the winning row. */
  id: string;
  authUserId: string;
  /** NULL for platform-scope identities. */
  tenantId: string | null;
  displayName: string;
  email: string;
  /** Raw persisted role string (may be a retired alias, e.g. 'vl_admin'). */
  role: string;
  /** Alias-normalized canonical role (resolveRole(role)); null if unknown. */
  canonicalRole: Role | null;
  capabilities: string[];
  locale: string | null;
  avatarUrl: string | null;
  /** HF-309: per-user theme preference (profiles.preferences->>'theme'); null = no preference.
   *  HF-312: 'vialuce' added — without it the resolver normalized a stored 'vialuce' to null, so the
   *  theme silently reverted on reload (the OB-221 "toggle does nothing" defect). */
  themePreference: 'current' | 'bliss' | 'vialuce' | null;
}

function mapToResolvedIdentity(row: Record<string, unknown>): ResolvedIdentity {
  const role = String(row.role ?? '');
  return {
    id: String(row.id ?? ''),
    authUserId: String(row.auth_user_id ?? ''),
    tenantId: (row.tenant_id as string | null) ?? null,
    displayName: String(row.display_name ?? ''),
    email: String(row.email ?? ''),
    role,
    canonicalRole: resolveRole(role),
    capabilities: (row.capabilities as string[]) || [],
    locale: (row.locale as string | null) ?? null,
    avatarUrl: (row.avatar_url as string | null) ?? null,
    themePreference: (() => {
      // HF-309: preferences is select('*')-fetched already (no extra query). Theme name only.
      const prefs = (row.preferences as Record<string, unknown> | null) ?? null;
      const t = prefs && typeof prefs.theme === 'string' ? prefs.theme : null;
      return t === 'bliss' || t === 'current' || t === 'vialuce' ? t : null; // HF-312: pass vialuce through
    })(),
  };
}

/**
 * Resolve the canonical identity for an authenticated user. Returns null when no
 * profile exists or the query errors (callers treat null as unauthenticated /
 * profile-missing, exactly as the prior reads did — DD-7).
 */
export async function resolveIdentity(
  client: SupabaseClient,
  authUserId: string,
): Promise<ResolvedIdentity | null> {
  const { data: rows, error } = await client
    .from('profiles')
    .select('*')
    .eq('auth_user_id', authUserId)
    .order('created_at', { ascending: true })
    .limit(10);

  if (error) {
    // HF-284: emit via the client-capable path. resolveIdentity runs client-side on
    // the login profile-fetch, where logAuthEvent no-ops (no service key) — which is
    // why these two branches were silent on the browser path (DIAG-062 E6).
    void logAuthEventClient('identity.resolve.query_error', { authUserId, error: error.message });
    return null;
  }
  if (!rows || rows.length === 0) {
    void logAuthEventClient('identity.resolve.zero_rows', { authUserId });
    return null;
  }
  if (rows.length > 1) {
    void logAuthEvent(
      'identity.resolve.duplicate_rows',
      { authUserId, count: rows.length, roles: rows.map(r => r.role), ids: rows.map(r => r.id) },
      authUserId,
    );
  }

  // Winner rule. Among alias-normalized-platform rows, prefer the canonical row the
  // running system + the Phase 4 keep-predicate designate: raw role 'platform' with
  // id === auth_user_id. This both preserves DD-7 (the prior reads used raw
  // role==='platform' for the platform@ two-row case → the 03-07 row, not the older
  // vl_admin row) AND makes the reader pick exactly the row the dedup migration keeps.
  // A user with ONLY a vl_admin row still resolves as platform (alias-normalized).
  const platformNorm = rows.filter(r => resolveRole(r.role) === 'platform');
  const winner =
    platformNorm.find(r => r.role === 'platform' && r.id === r.auth_user_id) ||
    platformNorm.find(r => r.role === 'platform') ||
    platformNorm.find(r => r.id === r.auth_user_id) ||
    platformNorm[0] ||
    rows.find(r => ((r.capabilities as string[]) || []).includes('manage_tenants')) ||
    rows[0];

  return mapToResolvedIdentity(winner);
}
