#!/usr/bin/env npx tsx --env-file=.env.local
/**
 * CLT-OB45: Verify All Demo Seed Data
 *
 * Comprehensive verification of both demo tenants:
 * - Optica Luminar (22 entities, 1 rule set, 1 period)
 * - Velocidad Deportiva (35 entities, 2 rule sets, 8 periods)
 * - Auth logins for all 7 demo users
 * - DemoPersonaSwitcher configuration
 * - Data integrity (row counts, lifecycle states, narratives)
 *
 * Usage: npx tsx --env-file=.env.local scripts/verify-all-seeds.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const OL = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const VD = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';

let passed = 0;
let failed = 0;
const results: Array<{ gate: string; status: 'PASS' | 'FAIL'; detail: string }> = [];

function gate(name: string, ok: boolean, detail: string) {
  const status = ok ? 'PASS' : 'FAIL';
  if (ok) passed++;
  else failed++;
  results.push({ gate: name, status, detail });
  console.log(`  ${ok ? '✅' : '❌'} ${name}: ${detail}`);
}

// ══════════════════════════════════════════════════
// SECTION 1: Tenant Existence
// ══════════════════════════════════════════════════

async function verifyTenants() {
  console.log('\n═══ SECTION 1: Tenant Existence ═══\n');

  const { data: tenants } = await supabase.from('tenants').select('id, name, slug, settings');

  const ol = tenants?.find(t => t.id === OL);
  const vd = tenants?.find(t => t.id === VD);

  gate('Optica Luminar tenant exists', !!ol, ol ? ol.name : 'NOT FOUND');
  gate('Velocidad Deportiva tenant exists', !!vd, vd ? vd.name : 'NOT FOUND');

  // DemoPersonaSwitcher config
  const olUsers = ol?.settings?.demo_users;
  const vdUsers = vd?.settings?.demo_users;

  gate('OL has demo_users in settings', Array.isArray(olUsers) && olUsers.length === 3,
    olUsers ? `${olUsers.length} demo users` : 'MISSING');
  gate('VD has demo_users in settings', Array.isArray(vdUsers) && vdUsers.length === 3,
    vdUsers ? `${vdUsers.length} demo users` : 'MISSING');
}

// ══════════════════════════════════════════════════
// SECTION 2: Row Counts
// ══════════════════════════════════════════════════

async function verifyRowCounts() {
  console.log('\n═══ SECTION 2: Row Counts ═══\n');

  const expected: Record<string, [number, number]> = {
    entities: [22, 35],
    entity_relationships: [21, 67],
    rule_sets: [1, 2],
    rule_set_assignments: [12, 36],
    periods: [1, 8],
    committed_data: [18, 156],
    import_batches: [1, 6],
    calculation_batches: [1, 8],
    calculation_results: [12, 108],
    entity_period_outcomes: [12, 36],
  };

  for (const [table, [expOL, expVD]] of Object.entries(expected)) {
    const { count: actOL } = await supabase.from(table).select('*', { count: 'exact', head: true }).eq('tenant_id', OL);
    const { count: actVD } = await supabase.from(table).select('*', { count: 'exact', head: true }).eq('tenant_id', VD);

    gate(`OL ${table}`, actOL === expOL, `${actOL}/${expOL}`);
    gate(`VD ${table}`, actVD === expVD, `${actVD}/${expVD}`);
  }
}

// ══════════════════════════════════════════════════
// SECTION 3: Auth Logins
// ══════════════════════════════════════════════════

async function verifyAuthLogins() {
  console.log('\n═══ SECTION 3: Auth Logins ═══\n');

  const logins = [
    { email: 'platform@vialuce.com', password: 'demo-password-VL1', label: 'VL Platform Admin' },
    { email: 'admin@opticaluminar.mx', password: 'demo-password-OL1', label: 'OL Admin' },
    { email: 'gerente@opticaluminar.mx', password: 'demo-password-OL2', label: 'OL Manager' },
    { email: 'vendedor@opticaluminar.mx', password: 'demo-password-OL3', label: 'OL Sales Rep' },
    { email: 'admin@velocidaddeportiva.mx', password: 'demo-password-VD1', label: 'VD Admin' },
    { email: 'gerente@velocidaddeportiva.mx', password: 'demo-password-VD2', label: 'VD Manager' },
    { email: 'asociado@velocidaddeportiva.mx', password: 'demo-password-VD3', label: 'VD Associate' },
  ];

  for (const { email, password, label } of logins) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    gate(`${label} login (${email})`, !error, error ? error.message : 'OK');
    await supabase.auth.signOut();
  }
}

// ══════════════════════════════════════════════════
// SECTION 4: Profiles + Roles
// ══════════════════════════════════════════════════

async function verifyProfiles() {
  console.log('\n═══ SECTION 4: Profiles + Roles ═══\n');

  const { data: profiles } = await supabase.from('profiles').select('display_name, email, role, tenant_id, capabilities');

  // Platform admin
  const plat = profiles?.find(p => p.email === 'platform@vialuce.com');
  gate('Platform admin exists', !!plat, plat ? `${plat.display_name} (${plat.role})` : 'NOT FOUND');
  gate('Platform admin is vl_admin', plat?.role === 'vl_admin', plat?.role || 'N/A');
  gate('Platform admin has manage_tenants', plat?.capabilities?.includes('manage_tenants'),
    plat?.capabilities ? 'yes' : 'no');

  // OL profiles
  const olAdmin = profiles?.find(p => p.email === 'admin@opticaluminar.mx');
  const olManager = profiles?.find(p => p.email === 'gerente@opticaluminar.mx');
  const olRep = profiles?.find(p => p.email === 'vendedor@opticaluminar.mx');

  gate('OL admin profile', !!olAdmin && olAdmin.role === 'admin', olAdmin ? `${olAdmin.display_name} (${olAdmin.role})` : 'NOT FOUND');
  gate('OL manager profile', !!olManager && olManager.role === 'manager', olManager ? `${olManager.display_name} (${olManager.role})` : 'NOT FOUND');
  gate('OL viewer profile', !!olRep, olRep ? `${olRep.display_name} (${olRep.role})` : 'NOT FOUND');

  // VD profiles
  const vdAdmin = profiles?.find(p => p.email === 'admin@velocidaddeportiva.mx');
  const vdManager = profiles?.find(p => p.email === 'gerente@velocidaddeportiva.mx');
  const vdRep = profiles?.find(p => p.email === 'asociado@velocidaddeportiva.mx');

  gate('VD admin profile', !!vdAdmin && vdAdmin.role === 'admin', vdAdmin ? `${vdAdmin.display_name} (${vdAdmin.role})` : 'NOT FOUND');
  gate('VD manager profile', !!vdManager && vdManager.role === 'manager', vdManager ? `${vdManager.display_name} (${vdManager.role})` : 'NOT FOUND');
  gate('VD viewer profile', !!vdRep, vdRep ? `${vdRep.display_name} (${vdRep.role})` : 'NOT FOUND');
}

// ══════════════════════════════════════════════════
// SECTION 5: Entity Hierarchy
// ══════════════════════════════════════════════════

async function verifyEntityHierarchy() {
  console.log('\n═══ SECTION 5: Entity Hierarchy ═══\n');

  // OL: 1 org + 3 zones + 6 stores + 12 individuals
  const { data: olEntities } = await supabase.from('entities').select('entity_type').eq('tenant_id', OL);
  const olTypes = olEntities?.reduce((acc, e) => { acc[e.entity_type] = (acc[e.entity_type] || 0) + 1; return acc; }, {} as Record<string, number>);

  gate('OL org count', olTypes?.organization === 4, `${olTypes?.organization || 0} (1 org + 3 zones)`);
  gate('OL location count', olTypes?.location === 6, `${olTypes?.location || 0} stores`);
  gate('OL individual count', olTypes?.individual === 12, `${olTypes?.individual || 0} reps`);

  // VD: 1 org + 3 regions + 8 stores + 3 teams + 20 individuals
  const { data: vdEntities } = await supabase.from('entities').select('entity_type').eq('tenant_id', VD);
  const vdTypes = vdEntities?.reduce((acc, e) => { acc[e.entity_type] = (acc[e.entity_type] || 0) + 1; return acc; }, {} as Record<string, number>);

  gate('VD org count', vdTypes?.organization === 4, `${vdTypes?.organization || 0} (1 org + 3 regions)`);
  gate('VD location count', vdTypes?.location === 8, `${vdTypes?.location || 0} stores`);
  gate('VD team count', vdTypes?.team === 3, `${vdTypes?.team || 0} teams`);
  gate('VD individual count', vdTypes?.individual === 20, `${vdTypes?.individual || 0} associates`);
}

// ══════════════════════════════════════════════════
// SECTION 6: Calculation Lifecycle
// ══════════════════════════════════════════════════

async function verifyCalculationLifecycle() {
  console.log('\n═══ SECTION 6: Calculation Lifecycle ═══\n');

  // OL: 1 batch in APPROVED
  const { data: olBatches } = await supabase.from('calculation_batches').select('lifecycle_state').eq('tenant_id', OL);
  gate('OL batch lifecycle APPROVED', olBatches?.length === 1 && olBatches[0].lifecycle_state === 'APPROVED',
    olBatches?.map(b => b.lifecycle_state).join(', ') || 'NONE');

  // VD: 3 CLOSED (Jul-Sep) + 3 APPROVED (Oct-Dec) + 1 CLOSED (Q3) + 1 APPROVED (Q4)
  const { data: vdBatches } = await supabase.from('calculation_batches').select('lifecycle_state').eq('tenant_id', VD);
  const vdStates = vdBatches?.reduce((acc, b) => { acc[b.lifecycle_state] = (acc[b.lifecycle_state] || 0) + 1; return acc; }, {} as Record<string, number>);

  gate('VD CLOSED batches', vdStates?.CLOSED === 4, `${vdStates?.CLOSED || 0} CLOSED (exp 4: Jul-Sep + Q3)`);
  gate('VD APPROVED batches', vdStates?.APPROVED === 4, `${vdStates?.APPROVED || 0} APPROVED (exp 4: Oct-Dec + Q4)`);
}

// ══════════════════════════════════════════════════
// SECTION 7: Narrative Verification (VD key stories)
// ══════════════════════════════════════════════════

async function verifyNarratives() {
  console.log('\n═══ SECTION 7: VD Key Narratives ═══\n');

  // VD-A05 Diego Castillo: GATED (zero payout)
  const diegoId = 'b2000000-0004-0000-0000-000000000005';
  const { data: diegoResults } = await supabase.from('calculation_results')
    .select('total_payout')
    .eq('entity_id', diegoId)
    .eq('tenant_id', VD);

  const allZero = diegoResults?.every(r => r.total_payout === 0);
  gate('VD-A05 Diego GATED (all zero payout)', !!allZero && (diegoResults?.length || 0) > 0,
    `${diegoResults?.length || 0} results, all zero: ${allZero}`);

  // VD-A10 Lucia Gutierrez: GATED (zero payout)
  const luciaId = 'b2000000-0004-0000-0000-000000000010';
  const { data: luciaResults } = await supabase.from('calculation_results')
    .select('total_payout')
    .eq('entity_id', luciaId)
    .eq('tenant_id', VD);

  const luciaAllZero = luciaResults?.every(r => r.total_payout === 0);
  gate('VD-A10 Lucia GATED (all zero payout)', !!luciaAllZero && (luciaResults?.length || 0) > 0,
    `${luciaResults?.length || 0} results, all zero: ${luciaAllZero}`);

  // VD-A01 Carlos Mendoza: highest earner
  const carlosId = 'b2000000-0004-0000-0000-000000000001';
  const { data: carlosResults } = await supabase.from('calculation_results')
    .select('total_payout')
    .eq('entity_id', carlosId)
    .eq('tenant_id', VD);

  const carlosTotal = carlosResults?.reduce((s, r) => s + (r.total_payout || 0), 0) || 0;
  gate('VD-A01 Carlos highest earner (>0)', carlosTotal > 0, `Total payout: ${carlosTotal.toLocaleString()} MXN`);

  // VD-A12 Ana Martinez: rising star (positive payouts)
  const anaId = 'b2000000-0004-0000-0000-000000000012';
  const { data: anaResults } = await supabase.from('calculation_results')
    .select('total_payout')
    .eq('entity_id', anaId)
    .eq('tenant_id', VD);

  const anaTotal = anaResults?.reduce((s, r) => s + (r.total_payout || 0), 0) || 0;
  gate('VD-A12 Ana rising star (>0)', anaTotal > 0, `Total payout: ${anaTotal.toLocaleString()} MXN`);
}

// ══════════════════════════════════════════════════
// SECTION 8: Rule Set Structure
// ══════════════════════════════════════════════════

async function verifyRuleSets() {
  console.log('\n═══ SECTION 8: Rule Set Structure ═══\n');

  // OL: 1 rule set with 6 components
  const { data: olRS } = await supabase.from('rule_sets').select('name, components').eq('tenant_id', OL);
  const olComponents = olRS?.[0]?.components as unknown[];
  gate('OL rule set name', olRS?.[0]?.name?.includes('Plan de Comisiones'), olRS?.[0]?.name || 'NOT FOUND');
  gate('OL rule set has 6 components', olComponents?.length === 6, `${olComponents?.length || 0} components`);

  // VD: 2 rule sets
  const { data: vdRS } = await supabase.from('rule_sets').select('name, components').eq('tenant_id', VD).order('name');
  gate('VD has 2 rule sets', vdRS?.length === 2, `${vdRS?.length || 0} rule sets`);

  const floor = vdRS?.find(r => r.name.includes('Piso'));
  const online = vdRS?.find(r => r.name.includes('Online'));

  const floorComponents = floor?.components as unknown[];
  const onlineComponents = online?.components as unknown[];

  gate('VD Floor plan has 4 components', floorComponents?.length === 4, `${floorComponents?.length || 0}`);
  gate('VD Online plan has 2 components', onlineComponents?.length === 2, `${onlineComponents?.length || 0}`);
}

// ══════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════

async function main() {
  console.log('══════════════════════════════════════════');
  console.log('  CLT-OB45: Full Demo Seed Verification    ');
  console.log('══════════════════════════════════════════');

  await verifyTenants();
  await verifyRowCounts();
  await verifyAuthLogins();
  await verifyProfiles();
  await verifyEntityHierarchy();
  await verifyCalculationLifecycle();
  await verifyNarratives();
  await verifyRuleSets();

  console.log('\n═══════════════════════════════════════');
  console.log(`  TOTAL: ${passed + failed} gates`);
  console.log(`  PASSED: ${passed}`);
  console.log(`  FAILED: ${failed}`);
  console.log(`  SCORE: ${Math.round((passed / (passed + failed)) * 100)}%`);
  console.log('═══════════════════════════════════════\n');

  if (failed > 0) {
    console.log('FAILED GATES:');
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`  ❌ ${r.gate}: ${r.detail}`);
    });
    console.log('');
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
