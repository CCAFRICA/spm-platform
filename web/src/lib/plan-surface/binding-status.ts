/* eslint-disable @typescript-eslint/no-explicit-any */ // OB-228: probes untyped row_data JSONB keys
/**
 * OB-228 Phase 5 — precise binding-resolution probe. For each distinct bound column,
 * a targeted EXISTENCE query (does any committed_data row carry that JSONB key) — accurate
 * across sheets of any size, unlike a bounded row sample (which under-samples small sheets
 * like a roster/quota tab and yields false "unresolved" verdicts). Cheap: one limit-1
 * query per DISTINCT column (a handful), not per component.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';

export async function resolveBindingColumns(
  sb: SupabaseClient<Database>,
  tenantId: string,
  columns: (string | null)[],
): Promise<Set<string>> {
  const distinct = Array.from(new Set(columns.filter((c): c is string => !!c)));
  const present = new Set<string>();
  await Promise.all(distinct.map(async (col) => {
    const { data, error } = await (sb as any)
      .from('committed_data')
      .select('id')
      .eq('tenant_id', tenantId)
      .not(`row_data->>${col}`, 'is', null)
      .limit(1);
    if (!error && data && data.length > 0) present.add(col);
  }));
  return present;
}
