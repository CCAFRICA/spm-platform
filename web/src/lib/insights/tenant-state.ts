/**
 * OB-227 — getTenantOnboardingState: the empty-tenant → first-payout journey state for the
 * OnboardingChecklist. One simple COUNT per substrate table; no hardcoded names (Korean Test).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { createClient } from '@/lib/supabase/client';
import type { TenantOnboardingState } from './types';

export async function getTenantOnboardingState(
  tenantId: string,
  client?: SupabaseClient<Database>,
): Promise<TenantOnboardingState> {
  const blank: TenantOnboardingState = {
    has_plan: false, plan_name: null, has_data: false, import_count: 0,
    has_periods: false, period_count: 0, has_calculations: false, calculation_count: 0,
    has_results: false, latest_lifecycle_state: null,
  };
  if (!tenantId) return blank;
  const sb = client ?? createClient();

  const head = { count: 'exact' as const, head: true };
  const [plan, imports, committed, periods, calcs, results, latestBatch] = await Promise.all([
    sb.from('rule_sets').select('id, name').eq('tenant_id', tenantId).eq('status', 'active').limit(1),
    sb.from('import_batches').select('id', head).eq('tenant_id', tenantId),
    // OB-251 (P-D2): readiness reads LIVE committed_data — the table Clean Slate actually wipes
    // (tenant-deletion.ts 'data' category). import_batches is an append-only receipt log that
    // SURVIVES Clean Slate, so reading it left the cockpit showing "7 imports" after a wipe. Reading
    // committed_data presence self-heals: an empty data layer reads as the "upload your data" state.
    sb.from('committed_data').select('id', head).eq('tenant_id', tenantId),
    sb.from('periods').select('id', head).eq('tenant_id', tenantId),
    sb.from('calculation_batches').select('id', head).eq('tenant_id', tenantId),
    sb.from('entity_period_outcomes').select('id', head).eq('tenant_id', tenantId),
    sb.from('calculation_batches').select('lifecycle_state, created_at').eq('tenant_id', tenantId)
      .order('created_at', { ascending: false }).limit(1),
  ]);

  const planRow = plan.data?.[0];
  const hasData = (committed.count ?? 0) > 0; // live data presence, not import-batch history
  return {
    has_plan: !!planRow,
    plan_name: (planRow?.name as string | undefined) ?? null,
    has_data: hasData,
    // "N imports" reflects live data: zero when the data layer is empty (post Clean Slate), even
    // though the import_batches receipt rows survive.
    import_count: hasData ? (imports.count ?? 0) : 0,
    has_periods: (periods.count ?? 0) > 0,
    period_count: periods.count ?? 0,
    has_calculations: (calcs.count ?? 0) > 0,
    calculation_count: calcs.count ?? 0,
    has_results: (results.count ?? 0) > 0,
    latest_lifecycle_state: (latestBatch.data?.[0]?.lifecycle_state as string | undefined) ?? null,
  };
}
