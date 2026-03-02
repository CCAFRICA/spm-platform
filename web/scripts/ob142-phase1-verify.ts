// OB-142 Phase 1C: Verify seed data
// Run: cd web && set -a && source .env.local && set +a && npx tsx scripts/ob142-phase1-verify.ts

import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

async function verify() {
  console.log('=== OB-142 Phase 1C: Seed Verification ===\n');

  const { count: entities } = await supabase.from('entities').select('*', { count: 'exact', head: true }).eq('tenant_id', TID);
  const { data: rs } = await supabase.from('rule_sets').select('id, name, status').eq('tenant_id', TID);
  const { count: cd } = await supabase.from('committed_data').select('*', { count: 'exact', head: true }).eq('tenant_id', TID);
  const { data: periods } = await supabase.from('periods').select('id, label, canonical_key').eq('tenant_id', TID);
  const { count: assignments } = await supabase.from('rule_set_assignments').select('*', { count: 'exact', head: true }).eq('tenant_id', TID);
  const { count: calcResults } = await supabase.from('calculation_results').select('*', { count: 'exact', head: true }).eq('tenant_id', TID);
  const { count: batches } = await supabase.from('calculation_batches').select('*', { count: 'exact', head: true }).eq('tenant_id', TID);

  console.log(`Entities: ${entities} (expect 22) ${entities === 22 ? 'PASS' : 'FAIL'}`);
  console.log(`Rule sets: ${rs?.map(r => `${r.name} [${r.status}]`).join(', ')}`);
  console.log(`  Active rule set: ${rs?.find(r => r.status === 'active')?.name || 'NONE'} ${rs?.find(r => r.status === 'active') ? 'PASS' : 'FAIL'}`);
  console.log(`  Component count: ${rs?.find(r => r.status === 'active')?.id ? '6 (from seed definition)' : 'N/A'}`);
  console.log(`Committed data: ${cd} (expect 18) ${cd === 18 ? 'PASS' : 'FAIL'}`);
  console.log(`Periods: ${periods?.length} (expect 1) ${periods?.length === 1 ? 'PASS' : 'FAIL'}`);
  periods?.forEach(p => console.log(`  ${p.label} (${p.canonical_key})`));
  console.log(`Assignments: ${assignments} (expect 12) ${assignments === 12 ? 'PASS' : 'FAIL'}`);
  console.log(`Calculation results: ${calcResults} (expect 12) ${calcResults === 12 ? 'PASS' : 'FAIL'}`);
  console.log(`Calculation batches: ${batches} (expect 1) ${batches === 1 ? 'PASS' : 'FAIL'}`);

  const allPass = entities === 22 && cd === 18 && periods?.length === 1 && assignments === 12 && calcResults === 12 && batches === 1;
  console.log(`\nOverall: ${allPass ? 'ALL PASS' : 'SOME FAIL'}`);
}

verify().catch(console.error);
