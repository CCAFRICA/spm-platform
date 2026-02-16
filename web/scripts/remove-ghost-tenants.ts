#!/usr/bin/env npx tsx
/**
 * Remove ghost tenants from Supabase.
 * Only removes tenants that are NOT Optica Luminar or Velocidad Deportiva.
 */

import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const KEEP_IDS = [
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890', // Optica Luminar
  'b2c3d4e5-f6a7-8901-bcde-f12345678901', // Velocidad Deportiva
];

async function main() {
  const { data: tenants } = await sb.from('tenants').select('id,name');
  const ghosts = (tenants || []).filter(t => !KEEP_IDS.includes(t.id));

  if (ghosts.length === 0) {
    console.log('No ghost tenants found.');
    return;
  }

  for (const ghost of ghosts) {
    console.log(`Removing ghost tenant: ${ghost.name} (${ghost.id})`);

    // Delete dependent data first (order matters for FK constraints)
    const tables = [
      'entity_period_outcomes',
      'calculation_results',
      'calculation_batches',
      'committed_data',
      'import_batches',
      'rule_set_assignments',
      'rule_sets',
      'entity_relationships',
      'reassignment_events',
      'entities',
      'periods',
      'profiles',
    ];

    for (const table of tables) {
      const { count, error } = await sb.from(table).delete().eq('tenant_id', ghost.id).select('*', { count: 'exact', head: true });
      if (error) {
        // Try without count
        const { error: e2 } = await sb.from(table).delete().eq('tenant_id', ghost.id);
        if (e2 && !e2.message.includes('0 rows')) {
          console.log(`  ${table}: ${e2.message}`);
        }
      }
    }

    // Delete tenant itself
    const { error: tErr } = await sb.from('tenants').delete().eq('id', ghost.id);
    if (tErr) console.log(`  tenants: ${tErr.message}`);
    else console.log(`  Tenant ${ghost.name} removed`);
  }

  // Verify
  const { data: remaining } = await sb.from('tenants').select('id,name');
  console.log('\nRemaining tenants:');
  remaining?.forEach(t => console.log(`  ${t.name} (${t.id})`));
}

main().catch(console.error);
