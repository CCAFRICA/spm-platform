// OB-142 Phase 1: Delete Optica Luminar tenant — full wipe in FK order
// Run: cd web && set -a && source .env.local && set +a && npx tsx scripts/ob142-phase1-delete-tenant.ts

import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function deleteTenant() {
  // Find Optica Luminar tenant
  const { data: tenants } = await supabase.from('tenants').select('id, name, slug');
  const ol = tenants?.find(t => t.name?.includes('Optica') || t.name?.includes('Luminar') || t.slug?.includes('optica'));
  if (!ol) { console.error('Tenant not found'); process.exit(1); }
  const TID = ol.id;
  console.log(`Deleting tenant: ${ol.name} (${TID})`);

  // Delete in FK order — batch large tables
  const tables = [
    'calculation_results', 'calculation_batches', 'entity_period_outcomes',
    'rule_set_assignments', 'committed_data', 'classification_signals',
    'import_batches', 'entities', 'entity_relationships',
    'rule_sets', 'periods', 'disputes', 'approval_requests', 'audit_logs'
  ];

  for (const table of tables) {
    let deleted = 0;
    while (true) {
      const { data: batch, error: selectErr } = await supabase
        .from(table).select('id').eq('tenant_id', TID).limit(200);
      if (selectErr) {
        // Table might not exist or have different schema
        console.log(`  ${table}: skipped (${selectErr.message})`);
        break;
      }
      if (!batch || batch.length === 0) break;
      const { error: delErr } = await supabase.from(table).delete().in('id', batch.map(r => r.id));
      if (delErr) {
        console.log(`  ${table}: delete error at ${deleted} rows (${delErr.message})`);
        // Try deleting one by one for FK issues
        for (const row of batch) {
          await supabase.from(table).delete().eq('id', row.id);
        }
      }
      deleted += batch.length;
    }
    if (deleted > 0) console.log(`  ${table}: ${deleted} rows deleted`);
    else console.log(`  ${table}: 0 rows`);
  }

  // Delete profiles
  const { data: profiles } = await supabase.from('profiles').select('id').eq('tenant_id', TID);
  if (profiles?.length) {
    await supabase.from('profiles').delete().in('id', profiles.map(p => p.id));
    console.log(`  profiles: ${profiles.length} deleted`);
  } else {
    console.log('  profiles: 0 rows');
  }

  // Delete usage_metering
  const { data: meters } = await supabase.from('usage_metering').select('id').eq('tenant_id', TID).limit(200);
  if (meters?.length) {
    await supabase.from('usage_metering').delete().in('id', meters.map(m => m.id));
    console.log(`  usage_metering: ${meters.length} deleted`);
  }

  // Delete tenant
  const { error: tenantDelErr } = await supabase.from('tenants').delete().eq('id', TID);
  if (tenantDelErr) {
    console.error(`  tenants: FAILED to delete (${tenantDelErr.message})`);
  } else {
    console.log(`  tenants: deleted ${ol.name}`);
  }

  // Verify
  console.log('\n=== VERIFICATION ===');
  const { data: check } = await supabase.from('tenants').select('id').eq('id', TID);
  console.log(`Tenant exists: ${(check?.length || 0) > 0 ? 'YES (FAIL)' : 'NO (PASS)'}`);

  for (const table of [...tables, 'profiles']) {
    const { count } = await supabase.from(table).select('*', { count: 'exact', head: true }).eq('tenant_id', TID);
    if (count && count > 0) console.error(`  ${table} still has ${count} rows!`);
  }
  console.log('\nTenant deleted. Ready for re-seed.');
}

deleteTenant().catch(console.error);
