// OB-257 — server-side Revenue tenant-feature read (the API-route half of the deep-link gate).
//
// The Revenue API routes (data/activate/insights) are the FUNCTIONAL gate: even if a page shell is
// reached by deep link, no Revenue data is served and no Revenue action is accepted when the tenant
// has revenue_enabled off. Mirrors the PRISM precedent (lib/prism/tenant-feature.ts) — the pattern
// the Financial agent's API routes lack (OB-257 P0 item 3 gap, not replicated here).

import { createServiceRoleClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isFeatureEnabled } from '@/lib/tenant/feature-flags';
import { REVENUE_FEATURE_KEY } from './types';

/** Is the Revenue agent enabled for this tenant? Reads tenants.features (service-role) and applies
 *  the single canonical predicate. Absent/unreadable → false (fail-closed). */
export async function isRevenueEnabledForTenant(tenantId: string | null | undefined): Promise<boolean> {
  if (!tenantId) return false;
  try {
    const sb = (await createServiceRoleClient()) as unknown as SupabaseClient;
    const { data } = await sb.from('tenants').select('features').eq('id', tenantId).maybeSingle();
    return isFeatureEnabled((data?.features ?? null) as Record<string, unknown> | null, REVENUE_FEATURE_KEY);
  } catch {
    return false; // fail-closed
  }
}
