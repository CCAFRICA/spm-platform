// OB-250 — server-side PRISM tenant-feature read (the API-route half of the deep-link gate).
//
// The PRISM API routes (prepare/commit/files/cleared) are the FUNCTIONAL gate: even if a page shell
// is reached by deep link, no PRISM data is served and no PRISM action is accepted when the tenant
// has prism_enabled off. Uses a service-role read so it is deterministic (no RLS surprise) and works
// for the platform-cookie-selected tenant. Derives from the ONE predicate (isPrismEnabled) — I1.

import { createServiceRoleClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isPrismEnabled } from './capability';

/** Is PRISM enabled for this tenant? Reads tenants.features (service-role) and applies the single
 *  predicate. Absent/unreadable → false (fail-closed). */
export async function isPrismEnabledForTenant(tenantId: string | null | undefined): Promise<boolean> {
  if (!tenantId) return false;
  try {
    const sb = (await createServiceRoleClient()) as unknown as SupabaseClient;
    const { data } = await sb.from('tenants').select('features').eq('id', tenantId).maybeSingle();
    return isPrismEnabled((data?.features ?? null) as Record<string, unknown> | null);
  } catch {
    return false; // fail-closed
  }
}
