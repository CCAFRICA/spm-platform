/**
 * Server-Side Auth Resolution — OB-178 / DS-019 Section 4.3
 *
 * Resolves auth state on the server. Client components receive the result as props.
 * No client-side cookie reading for session initialization.
 *
 * Called from Server Components (layout.tsx) to hydrate AuthProvider.
 */

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { resolveIdentity } from '@/lib/auth/resolve-identity';

export interface ServerAuthState {
  user: { id: string; email: string } | null;
  profile: {
    id: string;
    role: string;
    tenantId: string | null;
    displayName: string;
    email: string;
    capabilities: string[];
    locale: string | null;
    avatarUrl: string | null;
    themePreference: 'current' | 'bliss' | null; // HF-309: per-user theme preference
  } | null;
  isAuthenticated: boolean;
}

export async function getServerAuthState(): Promise<ServerAuthState> {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return { user: null, profile: null, isAuthenticated: false };
    }

    // HF-282: canonical reader (resolveIdentity) — replaces the local array+find.
    // Array-tolerant, deterministic winner, alias-normalized, anomaly-logging.
    const identity = await resolveIdentity(supabase, user.id);

    if (!identity) {
      return {
        user: { id: user.id, email: user.email || '' },
        profile: null,
        isAuthenticated: true,
      };
    }

    return {
      user: { id: user.id, email: user.email || '' },
      profile: {
        id: identity.id,
        role: identity.role,
        tenantId: identity.tenantId,
        displayName: identity.displayName,
        email: identity.email,
        capabilities: identity.capabilities,
        locale: identity.locale,
        avatarUrl: identity.avatarUrl,
        themePreference: identity.themePreference,
      },
      isAuthenticated: true,
    };
  } catch (err) {
    console.error('[OB-178] getServerAuthState error:', err);
    return { user: null, profile: null, isAuthenticated: false };
  }
}
