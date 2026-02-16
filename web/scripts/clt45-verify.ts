#!/usr/bin/env npx tsx
/**
 * CLT-45 Section 2: Supabase Data Verification
 * Checks gates 6-20 from the production verification checklist.
 */

import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const sbAnon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

let passed = 0;
let failed = 0;

function gate(num: number, name: string, ok: boolean, detail?: string) {
  const icon = ok ? '✅' : '❌';
  console.log(`  ${icon} Gate ${num}: ${name}${detail ? ` — ${detail}` : ''}`);
  if (ok) passed++;
  else failed++;
}

async function main() {
  console.log('=== CLT-45 Section 2: Supabase Data Verification ===\n');

  // Gate 6-7: Tenants exist with demo_users
  const { data: tenants, error: tErr } = await sb.from('tenants').select('id,name,slug,settings');
  if (tErr) console.error('  Tenant query error:', tErr.message);
  const ol = tenants?.find(t => t.name.includes('Optica'));
  const vd = tenants?.find(t => t.name.includes('Velocidad'));
  const olDemoUsers = (ol?.settings as any)?.demo_users?.length || 0;
  const vdDemoUsers = (vd?.settings as any)?.demo_users?.length || 0;

  gate(6, 'Optica Luminar tenant exists, demo_users: 3', !!ol && olDemoUsers === 3, `${ol?.name || 'NOT FOUND'} | demo_users: ${olDemoUsers}`);
  gate(7, 'Velocidad Deportiva tenant exists, demo_users: 3', !!vd && vdDemoUsers === 3, `${vd?.name || 'NOT FOUND'} | demo_users: ${vdDemoUsers}`);

  // Gate 8: Platform admin scope
  const { data: profiles } = await sb.from('profiles').select('email,role,capabilities');
  const platformProfile = profiles?.find(p => p.email === 'platform@vialuce.com');
  const platformRole = platformProfile?.role;
  const hasManageTenants = (platformProfile?.capabilities as string[])?.includes('manage_tenants');
  gate(8, 'platform@vialuce.com role = vl_admin or has manage_tenants', platformRole === 'vl_admin' || hasManageTenants, `role=${platformRole}, manage_tenants=${hasManageTenants}`);

  // Gate 9-10: Entity counts
  if (ol) {
    const { count: olCount } = await sb.from('entities').select('*', { count: 'exact', head: true }).eq('tenant_id', ol.id);
    gate(9, 'OL entity count = 22', olCount === 22, `${olCount}`);
  } else {
    gate(9, 'OL entity count = 22', false, 'tenant not found');
  }

  if (vd) {
    const { count: vdCount } = await sb.from('entities').select('*', { count: 'exact', head: true }).eq('tenant_id', vd.id);
    gate(10, 'VD entity count = 35', vdCount === 35, `${vdCount}`);
  } else {
    gate(10, 'VD entity count = 35', false, 'tenant not found');
  }

  // Gates 11-16: VD data counts
  if (vd) {
    const tid = vd.id;
    const tables: [string, number, number][] = [
      ['rule_sets', 2, 11],
      ['rule_set_assignments', 36, 12],
      ['periods', 8, 13],
      ['committed_data', 156, 14],
      ['calculation_results', 108, 15],
      ['entity_period_outcomes', 36, 16],
    ];
    for (const [table, expected, gateNum] of tables) {
      const { count } = await sb.from(table).select('*', { count: 'exact', head: true }).eq('tenant_id', tid);
      gate(gateNum, `VD ${table} = ${expected}`, count === expected, `${count}`);
    }
  } else {
    for (let g = 11; g <= 16; g++) gate(g, `VD data check`, false, 'tenant not found');
  }

  // Gate 17: A05 attendance gate (all payouts = 0)
  if (vd) {
    const { data: a05Entities } = await sb.from('entities').select('id,display_name,external_id')
      .eq('tenant_id', vd.id).like('external_id', '%A05%');
    if (a05Entities?.length) {
      const a05 = a05Entities[0];
      const { data: results } = await sb.from('calculation_results').select('total_payout')
        .eq('entity_id', a05.id);
      const allZero = results?.every(r => r.total_payout === 0);
      gate(17, 'A05 Diego Castillo: all payouts = 0', !!allZero, `${a05.display_name} (${a05.external_id}) — ${results?.length} results, all zero: ${allZero}`);
    } else {
      gate(17, 'A05 Diego Castillo: all payouts = 0', false, 'entity not found');
    }
  } else {
    gate(17, 'A05 Diego Castillo: all payouts = 0', false, 'tenant not found');
  }

  // Gates 18-20: Auth verification
  console.log('\n  --- Auth Verification ---');
  const authUsers = [
    { email: 'platform@vialuce.com', pw: 'demo-password-VL1', gate: 18 },
    { email: 'admin@opticaluminar.mx', pw: 'demo-password-OL1', gate: 19 },
    { email: 'admin@velocidaddeportiva.mx', pw: 'demo-password-VD1', gate: 20 },
  ];

  for (const u of authUsers) {
    const { data, error } = await sbAnon.auth.signInWithPassword({ email: u.email, password: u.pw });
    gate(u.gate, `Auth: ${u.email}`, !error, error ? `FAIL: ${error.message}` : 'OK');
    if (data?.session) await sbAnon.auth.signOut();
  }

  console.log(`\n=== Section 2 Results: ${passed}/${passed + failed} gates passed ===`);
}

main().catch(err => { console.error('Verification failed:', err); process.exit(1); });
