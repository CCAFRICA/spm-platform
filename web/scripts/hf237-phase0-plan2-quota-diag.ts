// HF-237 Phase 0: Plan 2 quota resolution diagnostic.
// Dumps metric_derivations + components.calculationMethod + sample committed_data quota rows.
import { createClient } from '@supabase/supabase-js';

const TENANT = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

(async () => {
  // Plan 2 metric_derivations
  const { data: rs } = await sb
    .from('rule_sets')
    .select('input_bindings')
    .eq('tenant_id', TENANT)
    .eq('name', 'Consumables Commission Plan')
    .single();
  console.log('=== Plan 2 metric_derivations ===');
  const derivations = ((rs?.input_bindings as Record<string, unknown> | null)?.metric_derivations as Array<Record<string, unknown>> | undefined) ?? [];
  for (const d of derivations) {
    console.log(JSON.stringify(d));
  }

  // Plan 2 components (full)
  const { data: rs2 } = await sb
    .from('rule_sets')
    .select('components')
    .eq('tenant_id', TENANT)
    .eq('name', 'Consumables Commission Plan')
    .single();
  console.log('\n=== Plan 2 components (verbatim) ===');
  console.log(JSON.stringify(rs2?.components, null, 2));

  // committed_data quota rows
  const { data: rows } = await sb
    .from('committed_data')
    .select('row_data, metadata, data_type')
    .eq('tenant_id', TENANT)
    .eq('data_type', 'target')
    .limit(30);
  console.log('\n=== committed_data data_type=target rows (Plan 2 quota source) ===');
  console.log('row count: ' + (rows?.length ?? 0));
  for (const r of (rows ?? [])) {
    console.log(JSON.stringify(r.row_data));
  }

  // Also search for entities with monthly_quota in row_data
  const { data: rows2 } = await sb
    .from('committed_data')
    .select('data_type, row_data')
    .eq('tenant_id', TENANT)
    .not('row_data->>monthly_quota', 'is', null)
    .limit(10);
  console.log('\n=== committed_data rows containing monthly_quota field ===');
  for (const r of (rows2 ?? [])) {
    console.log(JSON.stringify({ data_type: r.data_type, row_data: r.row_data }));
  }
})();
