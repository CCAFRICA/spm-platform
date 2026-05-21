import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const TENANTS: Array<[string, string]> = [
  ['CRP', 'e44bbcb1-2710-4880-8c7d-a1bd902720b7'],
  ['Meridian', '5035b1e8-0754-4527-b7ec-9f93f85e4c79'],
  ['BCL', 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'],
];

async function main() {
  for (const [name, tid] of TENANTS) {
    const { data, error } = await sb
      .from('rule_sets')
      .select('id, name, input_bindings')
      .eq('tenant_id', tid)
      .order('created_at', { ascending: false });
    if (error) { console.error(`${name} error:`, error.message); continue; }
    console.log(`\n=== ${name} (${tid}) — ${(data ?? []).length} rule_sets ===`);
    for (const rs of (data ?? [])) {
      const ib = (rs.input_bindings ?? {}) as Record<string, unknown>;
      const cb = ib.convergence_bindings as Record<string, unknown> | undefined;
      const md = ib.metric_derivations as Array<Record<string, unknown>> | undefined;
      const hasConvergence = !!cb && Object.keys(cb).length > 0;
      const hasDerivations = Array.isArray(md) && md.length > 0;
      console.log(`  ${rs.name}:`);
      console.log(`    convergence_bindings: ${hasConvergence ? Object.keys(cb!).length + ' components' : 'NONE'}`);
      console.log(`    metric_derivations:   ${hasDerivations ? md!.length + ' rules' : 'NONE'}`);
      if (hasDerivations) {
        for (const d of md!) {
          const f = d.filters as Array<unknown> | undefined;
          console.log(`      ${d.metric}: op=${d.operation} source_field=${d.source_field ?? 'N/A'} filters=${JSON.stringify(f ?? [])}`);
        }
      }
    }
  }
}

main();
