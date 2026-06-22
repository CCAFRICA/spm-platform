/**
 * OB-230 — resolve an admin-action target user from either a profile id or an auth_user_id.
 * Shared by all /api/admin/users/[id]/* action routes (one resolution path).
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export interface TargetUser {
  profileId: string;
  authUserId: string | null;
  tenantId: string | null;
  email: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function resolveTargetUser(sb: SupabaseClient, id: string): Promise<TargetUser | null> {
  const cols = 'id, auth_user_id, tenant_id, email';
  let { data } = await sb.from('profiles').select(cols).eq('id', id).maybeSingle();
  if (!data) {
    const r = await sb.from('profiles').select(cols).eq('auth_user_id', id).maybeSingle();
    data = r.data;
  }
  if (!data) return null;
  const d = data as any;
  return {
    profileId: d.id,
    authUserId: d.auth_user_id ?? (id !== d.id ? id : null),
    tenantId: d.tenant_id ?? null,
    email: d.email,
  };
}
