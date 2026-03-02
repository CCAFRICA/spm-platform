// OB-136 Phase 0 Diagnostic — check binding state across tenants
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

async function run() {
  // 1. Probe phantom table
  const { data: phantom, error: phantomErr } = await sb.from('input_bindings').select('*').limit(1);
  console.log('=== PHANTOM TABLE PROBE ===');
  console.log('Result:', JSON.stringify(phantom));
  console.log('Error:', phantomErr?.message || 'none', phantomErr?.code || '');

  // 2. PTC rule_sets with input_bindings
  const PTC = 'dfc1041e-7c39-4657-81e5-40b1cea5680c';
  const { data: ptcRS } = await sb.from('rule_sets')
    .select('id, name, status, input_bindings')
    .eq('tenant_id', PTC);

  console.log('\n=== PIPELINE TEST CO RULE SETS ===');
  for (const rs of ptcRS || []) {
    const b = rs.input_bindings as Record<string, unknown> | null;
    const hasKeys = b && Object.keys(b).length > 0;
    console.log('ID:', rs.id);
    console.log('Name:', rs.name);
    console.log('Status:', rs.status);
    console.log('Has bindings:', hasKeys);
    console.log('input_bindings:', JSON.stringify(b)?.slice(0, 800));
    const md = (b as any)?.metric_derivations;
    if (Array.isArray(md)) {
      console.log('metric_derivations count:', md.length);
      if (md.length > 0) console.log('First derivation:', JSON.stringify(md[0]));
    }
    console.log('');
  }

  // 3. LAB tenant (working)
  const LAB = '9b2bb4e3-6828-4451-b3fb-dc384509494f';
  const { data: labRS } = await sb.from('rule_sets')
    .select('name, input_bindings')
    .eq('tenant_id', LAB).limit(2);

  console.log('=== LAB TENANT (WORKING) ===');
  for (const rs of labRS || []) {
    console.log('Plan:', rs.name);
    const b = rs.input_bindings as Record<string, unknown> | null;
    console.log('Keys:', Object.keys(b || {}));
    const md = (b as any)?.metric_derivations;
    console.log('metric_derivations count:', Array.isArray(md) ? md.length : 0);
    console.log('First 800:', JSON.stringify(b)?.slice(0, 800));
    console.log('');
  }

  // 4. MBC tenant (working)
  const MBC = '7e31a1d0-8c14-41c0-9f01-471f3842834c';
  const { data: mbcRS } = await sb.from('rule_sets')
    .select('name, input_bindings')
    .eq('tenant_id', MBC).limit(1);

  console.log('=== MBC TENANT (WORKING) ===');
  for (const rs of mbcRS || []) {
    console.log('Plan:', rs.name);
    const b = rs.input_bindings as Record<string, unknown> | null;
    console.log('Keys:', Object.keys(b || {}));
    const md = (b as any)?.metric_derivations;
    console.log('metric_derivations count:', Array.isArray(md) ? md.length : 0);
    console.log('First 800:', JSON.stringify(b)?.slice(0, 800));
  }

  // 5. Entity + period + assignment state for PTC
  const { count: entityCount } = await sb.from('entities')
    .select('*', { count: 'exact', head: true }).eq('tenant_id', PTC);
  console.log('\n=== PTC STATE ===');
  console.log('Entities:', entityCount);

  const { count: assignCount } = await sb.from('rule_set_assignments')
    .select('*', { count: 'exact', head: true }).eq('tenant_id', PTC);
  console.log('Assignments:', assignCount);

  const { data: periods } = await sb.from('periods')
    .select('label, start_date, end_date').eq('tenant_id', PTC);
  console.log('Periods:', periods?.length);
  for (const p of periods || []) console.log(' ', p.label, p.start_date, '→', p.end_date);

  // 6. Committed data types
  const { data: cdSample } = await sb.from('committed_data')
    .select('data_type').eq('tenant_id', PTC).limit(1000);
  const typeCount: Record<string, number> = {};
  for (const r of cdSample || []) typeCount[r.data_type] = (typeCount[r.data_type] || 0) + 1;
  console.log('\nCommitted data types (sample):');
  for (const [t, c] of Object.entries(typeCount).sort()) console.log(' ', t, ':', c);
  console.log('Sample size:', cdSample?.length);
}

run().catch(console.error);
