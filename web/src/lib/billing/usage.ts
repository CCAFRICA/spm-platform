/**
 * Tenant usage calculation from metering events
 * OB-57: MCP/MTP usage for current billing period
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface TenantUsage {
  mcp: number;          // calculation runs (metric computation points)
  mtp: number;          // transaction commits (metric transaction points)
  aiCalls: number;      // AI inference calls
  userInvites: number;  // users invited this period
}

export async function getTenantUsage(
  tenantId: string,
  supabase: SupabaseClient
): Promise<TenantUsage> {
  // Current period = first of current month
  const now = new Date();
  const periodKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const { data: events } = await supabase
    .from('usage_metering')
    .select('metric_name, metric_value')
    .eq('tenant_id', tenantId)
    .eq('period_key', periodKey);

  const safeEvents = events ?? [];

  const sum = (name: string) =>
    safeEvents.filter(e => e.metric_name === name).reduce((s, e) => s + (e.metric_value || 0), 0);

  return {
    mcp: sum('calculation_run') + sum('calc_batch_created'),
    mtp: sum('transaction_committed') + sum('data_committed'),
    aiCalls: sum('ai_inference'),
    userInvites: sum('user_invited'),
  };
}
