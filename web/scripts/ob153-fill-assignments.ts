// OB-153: One-time construction to fill rule_set_assignments for existing entities
// This bridges the gap for tenants that imported data before assignment construction existed.

import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const BATCH = 200;

async function run() {
  // Find all tenants with entities but no assignments
  const { data: tenants } = await sb.from('tenants').select('id, slug, name');
  if (!tenants) { console.log('No tenants found'); return; }

  for (const tenant of tenants) {
    const { count: entityCount } = await sb.from('entities').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id);
    const { count: assignCount } = await sb.from('rule_set_assignments').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id);

    if (!entityCount || entityCount === 0) continue;
    if (assignCount && assignCount > 0) {
      console.log(`${tenant.slug}: ${entityCount} entities, ${assignCount} assignments — SKIP (already has assignments)`);
      continue;
    }

    // Get active/draft rule sets
    const { data: ruleSets } = await sb.from('rule_sets').select('id, name').eq('tenant_id', tenant.id).in('status', ['active', 'draft']);
    if (!ruleSets || ruleSets.length === 0) {
      console.log(`${tenant.slug}: ${entityCount} entities, 0 rule sets — SKIP`);
      continue;
    }

    console.log(`${tenant.slug}: ${entityCount} entities, ${ruleSets.length} rule sets — CREATING ASSIGNMENTS`);

    // Fetch all entity IDs in batches
    const allEntityIds: string[] = [];
    let offset = 0;
    while (true) {
      const { data } = await sb.from('entities').select('id').eq('tenant_id', tenant.id).range(offset, offset + 999);
      if (!data || data.length === 0) break;
      allEntityIds.push(...data.map(e => e.id));
      offset += data.length;
      if (data.length < 1000) break;
    }

    // Create assignments for each rule set
    let created = 0;
    for (const rs of ruleSets) {
      for (let i = 0; i < allEntityIds.length; i += BATCH) {
        const slice = allEntityIds.slice(i, i + BATCH);
        const assignments = slice.map(entityId => ({
          tenant_id: tenant.id,
          rule_set_id: rs.id,
          entity_id: entityId,
        }));
        const { error } = await sb.from('rule_set_assignments').insert(assignments);
        if (error) {
          console.error(`  Error inserting batch ${i}:`, error.message);
        } else {
          created += slice.length;
        }
      }
    }

    console.log(`  Created ${created} assignments (${allEntityIds.length} entities × ${ruleSets.length} rule sets)`);
  }

  console.log('\nDone.');
}

run();
