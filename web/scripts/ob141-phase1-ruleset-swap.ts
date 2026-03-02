// OB-141 Phase 1: Rule set swap — reactivate original, archive imported
// Run: cd web && set -a && source .env.local && set +a && npx tsx scripts/ob141-phase1-ruleset-swap.ts

import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Verified IDs from Phase 0
const TENANT_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const ORIGINAL_RS_ID = 'b1b2c3d4-e5f6-7890-abcd-ef1234567890';
const IMPORTED_RS_ID = '7657fc95-6dcf-4340-8745-d0ba71ffe88e';

async function swapRuleSets() {
  console.log('=== PRE-SWAP STATE ===');
  const { data: before } = await supabase
    .from('rule_sets')
    .select('id, name, status')
    .eq('tenant_id', TENANT_ID);
  console.table(before);

  // Archive imported plan
  const { error: archiveErr } = await supabase
    .from('rule_sets')
    .update({ status: 'archived' })
    .eq('id', IMPORTED_RS_ID);
  if (archiveErr) {
    console.error('ABORT: Failed to archive imported plan:', archiveErr);
    process.exit(1);
  }

  // Reactivate original plan
  const { error: activateErr } = await supabase
    .from('rule_sets')
    .update({ status: 'active' })
    .eq('id', ORIGINAL_RS_ID);
  if (activateErr) {
    console.error('ABORT: Failed to activate original plan:', activateErr);
    process.exit(1);
  }

  console.log('\n=== POST-SWAP STATE ===');
  const { data: after } = await supabase
    .from('rule_sets')
    .select('id, name, status')
    .eq('tenant_id', TENANT_ID);
  console.table(after);

  // Verify
  const original = after?.find(rs => rs.id === ORIGINAL_RS_ID);
  const imported = after?.find(rs => rs.id === IMPORTED_RS_ID);
  console.log(`\nOriginal "${original?.name}": ${original?.status} ${original?.status === 'active' ? 'PASS' : 'FAIL'}`);
  console.log(`Imported "${imported?.name}": ${imported?.status} ${imported?.status === 'archived' ? 'PASS' : 'FAIL'}`);
}

swapRuleSets().catch(console.error);
