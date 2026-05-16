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
      .update({ input_bindings: {} })
      .eq('tenant_id', tid)
      .select('id, name');
    if (error) {
      console.error(`${name}: ERROR ${error.message}`);
      continue;
    }
    console.log(`${name}: cleared input_bindings on ${(data ?? []).length} rule_set(s)`);
    for (const rs of (data ?? [])) {
      console.log(`  - ${rs.name} (${rs.id})`);
    }
  }
}

main();
