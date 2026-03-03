/**
 * OB-148 Phase 2E: Fix Óptica row band boundary gaps
 * 
 * The row bands use integer max (79, 99, 119) but attainment values are decimal.
 * Values like 119.16, 79.5, 99.3 fall between bands → $0 payout.
 * Fix: change max to .99 to close the gaps.
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);
const tenantId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('OB-148 PHASE 2E: FIX ÓPTICA ROW BAND GAPS');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const { data: rs } = await supabase
    .from('rule_sets')
    .select('id, components')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .single();

  if (!rs) { console.error('No active rule set'); return; }

  const components = rs.components as Array<Record<string, any>>;
  const optica = components.find(c => String(c.name).includes('ptica') && c.componentType === 'matrix_lookup');

  if (!optica) { console.error('No Óptica component'); return; }

  const mc = optica.matrixConfig;
  console.log('OLD row bands:');
  for (const b of mc.rowBands) {
    console.log(`  ${b.label}: min=${b.min}, max=${b.max}`);
  }

  // Fix: change max values to .99 to close gaps
  mc.rowBands = [
    { min: 0, max: 79.99, label: '0-79%' },
    { min: 80, max: 99.99, label: '80-99%' },
    { min: 100, max: 119.99, label: '100-119%' },
    { min: 120, max: 999, label: '120%+' },
  ];

  console.log('\nNEW row bands:');
  for (const b of mc.rowBands) {
    console.log(`  ${b.label}: min=${b.min}, max=${b.max}`);
  }

  // Save
  const { error } = await supabase
    .from('rule_sets')
    .update({ components })
    .eq('id', rs.id);

  if (error) { console.error('Update error:', error.message); return; }

  // Verify
  const { data: verify } = await supabase
    .from('rule_sets')
    .select('components')
    .eq('id', rs.id)
    .single();

  const verifyComps = verify?.components as Array<Record<string, any>>;
  const verifyOptica = verifyComps.find(c => String(c.name).includes('ptica'));
  console.log('\nVERIFY row bands:');
  for (const b of verifyOptica?.matrixConfig?.rowBands ?? []) {
    console.log(`  ${b.label}: min=${b.min}, max=${b.max}`);
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('Óptica row band gaps fixed: 79→79.99, 99→99.99, 119→119.99');
  console.log('═══════════════════════════════════════════════════════════════');
}

main().catch(console.error);
