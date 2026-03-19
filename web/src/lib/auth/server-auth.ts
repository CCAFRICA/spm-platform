/**
 * Server-Side Auth Resolution — OB-178 / DS-019 Section 4.3
 *
 * Resolves auth state on the server. Client components receive the result as props.
 * No client-side cookie reading for session initialization.
 *
 * Called from Server Components (layout.tsx) to hydrate AuthProvider.
 */

import { createServerSupabaseClient } from '@/lib/supabase/server';

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

    // Resolve profile from our database
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, auth_user_id, tenant_id, display_name, email, role, capabilities, locale, avatar_url')
      .eq('auth_user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(10);

    if (!profiles || profiles.length === 0) {
      return {
        user: { id: user.id, email: user.email || '' },
        profile: null,
        isAuthenticated: true,
      };
    }

    // Prefer platform-level profile
    const profile =
      profiles.find(p => p.role === 'platform') ||
      profiles.find(p => ((p.capabilities as string[]) || []).includes('manage_tenants')) ||
      profiles[0];

    return {
      user: { id: user.id, email: user.email || '' },
      profile: {
        id: profile.id,
        role: profile.role,
        tenantId: profile.tenant_id,
        displayName: profile.display_name,
        email: profile.email,
        capabilities: (profile.capabilities as string[]) || [],
        locale: profile.locale,
        avatarUrl: profile.avatar_url,
      },
      isAuthenticated: true,
    };
  } catch (err) {
    console.error('[OB-178] getServerAuthState error:', err);
    return { user: null, profile: null, isAuthenticated: false };
  }
}
