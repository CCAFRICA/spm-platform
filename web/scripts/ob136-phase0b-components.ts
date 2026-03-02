// OB-136 Phase 0B — check plan components + LAB's working path
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

async function run() {
  // 1. PTC plan components
  const PTC = 'dfc1041e-7c39-4657-81e5-40b1cea5680c';
  const { data: ptcRS } = await sb.from('rule_sets')
    .select('id, name, components, input_bindings')
    .eq('tenant_id', PTC);

  console.log('=== PTC PLAN COMPONENTS ===');
  for (const rs of ptcRS || []) {
    console.log('Plan:', rs.name);
    const comps = rs.components as Record<string, unknown> | null;
    const variants = ((comps as any)?.variants as any[]) ?? [];
    const compList = (variants[0]?.components as any[]) ?? [];
    console.log('Component count:', compList.length);
    for (const c of compList) {
      console.log('  -', c.name || c.id, '| calculationMethod:', JSON.stringify(c.calculationMethod)?.slice(0, 100));
      console.log('    tierConfig metric:', (c.tierConfig as any)?.metric);
      console.log('    calculationIntent:', JSON.stringify(c.calculationIntent)?.slice(0, 200));
    }
    console.log('');
  }

  // 2. LAB plan components + how it calculates
  const LAB = '9b2bb4e3-6828-4451-b3fb-dc384509494f';
  const { data: labRS } = await sb.from('rule_sets')
    .select('id, name, components, input_bindings')
    .eq('tenant_id', LAB).limit(1);

  console.log('=== LAB PLAN COMPONENTS ===');
  for (const rs of labRS || []) {
    console.log('Plan:', rs.name);
    const comps = rs.components as Record<string, unknown> | null;
    const variants = ((comps as any)?.variants as any[]) ?? [];
    const compList = (variants[0]?.components as any[]) ?? [];
    console.log('Component count:', compList.length);
    for (const c of compList) {
      console.log('  -', c.name || c.id, '| enabled:', c.enabled !== false);
    }
    console.log('input_bindings:', JSON.stringify(rs.input_bindings));
  }

  // 3. Check how LAB's plan-readiness would look (admin page uses different query?)
  const { count: labAssign } = await sb.from('rule_set_assignments')
    .select('*', { count: 'exact', head: true }).eq('tenant_id', LAB);
  console.log('\nLAB assignments:', labAssign);

  const { count: labData } = await sb.from('committed_data')
    .select('*', { count: 'exact', head: true }).eq('tenant_id', LAB);
  console.log('LAB committed_data:', labData);

  // 4. Does LAB use /operate/calculate or /admin/launch/calculate?
  // Check the admin calculate page's binding logic
  console.log('\n=== CHECK: Does admin calculate page also use phantom table? ===');
  console.log('(Check grep output separately)');

  // 5. Check PTC committed_data data_types (full count)
  const { count: ptcDataCount } = await sb.from('committed_data')
    .select('*', { count: 'exact', head: true }).eq('tenant_id', PTC);
  console.log('\nPTC total committed_data rows:', ptcDataCount);

  // Check distinct data_types
  const { data: allData } = await sb.from('committed_data')
    .select('data_type')
    .eq('tenant_id', PTC)
    .limit(5000);
  const counts: Record<string, number> = {};
  for (const r of allData || []) {
    counts[r.data_type] = (counts[r.data_type] || 0) + 1;
  }
  console.log('PTC data_types (from 5000 sample):');
  for (const [t, c] of Object.entries(counts).sort()) console.log(' ', t, ':', c);
}

run().catch(console.error);
