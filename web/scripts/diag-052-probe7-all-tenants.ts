// DIAG-052 Probe 7: blast-radius — rule_sets / committed_data / calc_results /
// input_bindings state per tenant; most recent calculation_results.created_at.

import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const TENANT_IDS = [
  'b1c2d3e4-aaaa-bbbb-cccc-111111111111', // BCL
  'e44bbcb1-2710-4880-8c7d-a1bd902720b7', // CRP
  '5035b1e8-0754-4527-b7ec-9f93f85e4c79', // Meridian
];

(async () => {
  const { data: tenants } = await sb.from('tenants').select('id, name').in('id', TENANT_IDS);
  const tName = new Map((tenants ?? []).map(t => [t.id, t.name]));

  console.log('=== PROBE 7 — All-tenant state snapshot ===\n');

  for (const tid of TENANT_IDS) {
    console.log(`──── ${tName.get(tid) ?? tid} [${tid}] ────`);

    const { count: rsCount } = await sb
      .from('rule_sets')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tid);

    const { count: cdCount } = await sb
      .from('committed_data')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tid);

    const { count: crCount } = await sb
      .from('calculation_results')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tid);

    const { data: latest } = await sb
      .from('calculation_results')
      .select('created_at, batch_id')
      .eq('tenant_id', tid)
      .order('created_at', { ascending: false })
      .limit(1);

    const { data: rsRows } = await sb
      .from('rule_sets')
      .select('id, name, input_bindings, status')
      .eq('tenant_id', tid);

    console.log(`  rule_sets: ${rsCount}`);
    console.log(`  committed_data rows: ${cdCount}`);
    console.log(`  calculation_results rows: ${crCount}`);
    console.log(`  latest calculation_results: ${latest && latest[0] ? `${latest[0].created_at} (batch ${latest[0].batch_id})` : '(none)'}`);

    for (const rs of (rsRows ?? [])) {
      const ib = rs.input_bindings as Record<string, unknown> | null;
      let state: string;
      if (ib === null) state = 'NULL';
      else if (typeof ib !== 'object') state = `<scalar ${typeof ib}>`;
      else if (Object.keys(ib).length === 0) state = '{} (empty)';
      else {
        const topKeys = Object.keys(ib);
        const cb = ib.convergence_bindings;
        const md = ib.metric_derivations;
        const cbCount = cb && typeof cb === 'object' ? Object.keys(cb).length : 0;
        const mdCount = Array.isArray(md) ? md.length : 0;
        state = `populated — keys=[${topKeys.join(',')}], convergence_bindings=${cbCount}, metric_derivations=${mdCount}`;
      }
      console.log(`    • "${rs.name}" [${rs.id}] status=${rs.status}`);
      console.log(`      input_bindings: ${state}`);
    }
    console.log();
  }
})();
