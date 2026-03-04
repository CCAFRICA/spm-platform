/**
 * HF-088 Phase 2: Nuclear clear Óptica domain data
 * Deletes ALL domain data for Óptica Luminar tenant.
 * Preserves: tenant record, persona profiles (Laura, Roberto, Sofia).
 *
 * Run from: spm-platform/web
 * Command: set -a && source .env.local && set +a && npx tsx scripts/hf088-nuclear-clear.ts
 */
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const OPTICA_TENANT = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

// FK-ordered deletion — bottom-up
const TABLES_IN_ORDER = [
  'calculation_results',
  'calculation_batches',
  'entity_period_outcomes',
  'disputes',
  'approval_requests',
  'rule_set_assignments',
  'committed_data',
  'classification_signals',
  'import_batches',
  'entities',
  'periods',
  'rule_sets',
  'reference_items',
  'reference_data',
  'audit_logs',
];

async function deleteTableRows(table: string): Promise<number> {
  let totalDeleted = 0;

  // For reference_items, we need to scope by reference_data_id (no direct tenant_id)
  if (table === 'reference_items') {
    const { data: refData } = await sb.from('reference_data')
      .select('id')
      .eq('tenant_id', OPTICA_TENANT);
    if (!refData || refData.length === 0) return 0;

    for (const rd of refData) {
      let pass = 0;
      while (true) {
        pass++;
        const { data: rows } = await sb.from('reference_items')
          .select('id')
          .eq('reference_data_id', rd.id)
          .limit(200);
        if (!rows || rows.length === 0) break;

        const ids = rows.map(r => r.id);
        const { error } = await sb.from('reference_items').delete().in('id', ids);
        if (error) {
          console.error(`  Error deleting ${table}: ${error.message}`);
          break;
        }
        totalDeleted += ids.length;
        if (pass > 1000) { console.error(`  Safety break on ${table}`); break; }
      }
    }
    return totalDeleted;
  }

  // All other tables have tenant_id
  let pass = 0;
  while (true) {
    pass++;
    const { data: rows } = await sb.from(table)
      .select('id')
      .eq('tenant_id', OPTICA_TENANT)
      .limit(200);

    if (!rows || rows.length === 0) break;

    const ids = rows.map(r => r.id);
    const { error } = await sb.from(table).delete().in('id', ids);
    if (error) {
      console.error(`  Error deleting from ${table}: ${error.message}`);
      break;
    }
    totalDeleted += ids.length;

    if (pass % 50 === 0) {
      console.log(`    ${table}: deleted ${totalDeleted} so far (pass ${pass})...`);
    }
    if (pass > 5000) { console.error(`  Safety break on ${table}`); break; }
  }
  return totalDeleted;
}

async function run() {
  console.log('========================================');
  console.log('HF-088 PHASE 2: NUCLEAR CLEAR OPTICA');
  console.log('========================================\n');

  // Verify tenant exists
  const { data: tenant } = await sb.from('tenants')
    .select('id, name, slug')
    .eq('id', OPTICA_TENANT)
    .single();

  if (!tenant) {
    console.error('Óptica tenant not found!');
    process.exit(1);
  }
  console.log(`Tenant: ${tenant.name} (${tenant.slug}) — ID: ${tenant.id}`);
  console.log('Tenant record will be PRESERVED.\n');

  // Delete each table in FK order
  const results: Record<string, number> = {};

  for (const table of TABLES_IN_ORDER) {
    // Pre-count
    let preCount: number | null;
    if (table === 'reference_items') {
      const { data: refData } = await sb.from('reference_data')
        .select('id')
        .eq('tenant_id', OPTICA_TENANT);
      if (refData && refData.length > 0) {
        let total = 0;
        for (const rd of refData) {
          const { count } = await sb.from('reference_items')
            .select('id', { count: 'exact', head: true })
            .eq('reference_data_id', rd.id);
          total += count ?? 0;
        }
        preCount = total;
      } else {
        preCount = 0;
      }
    } else {
      const { count } = await sb.from(table)
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', OPTICA_TENANT);
      preCount = count;
    }

    if (preCount === 0) {
      console.log(`  ${table}: 0 rows (skip)`);
      results[table] = 0;
      continue;
    }

    console.log(`  ${table}: ${preCount} rows — deleting...`);
    const deleted = await deleteTableRows(table);
    results[table] = deleted;
    console.log(`  ${table}: deleted ${deleted} rows`);
  }

  // Verification pass
  console.log('\n--- VERIFICATION ---');
  let allZero = true;
  for (const table of TABLES_IN_ORDER) {
    let remaining: number | null;
    if (table === 'reference_items') {
      remaining = 0; // Already scoped above
    } else {
      const { count } = await sb.from(table)
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', OPTICA_TENANT);
      remaining = count;
    }
    const status = remaining === 0 ? 'OK' : 'FAIL';
    if (remaining !== 0) allZero = false;
    console.log(`  ${table}: ${remaining} remaining ${status}`);
  }

  // Verify tenant still exists
  const { data: tenantCheck } = await sb.from('tenants')
    .select('id, name')
    .eq('id', OPTICA_TENANT)
    .single();
  console.log(`\nTenant preserved: ${tenantCheck ? 'YES' : 'NO'}`);

  // Verify persona profiles preserved
  const { data: personas } = await sb.from('profiles')
    .select('id, display_name, email, role')
    .eq('tenant_id', OPTICA_TENANT);
  console.log(`Persona profiles preserved: ${personas?.length ?? 0}`);
  for (const p of personas || []) {
    console.log(`  - ${p.display_name} (${p.email}) role=${p.role}`);
  }

  // Summary
  console.log('\n--- DELETION SUMMARY ---');
  let grandTotal = 0;
  for (const [table, count] of Object.entries(results)) {
    if (count > 0) console.log(`  ${table}: ${count.toLocaleString()} deleted`);
    grandTotal += count;
  }
  console.log(`  TOTAL: ${grandTotal.toLocaleString()} rows deleted`);

  console.log(`\nProof Gate 2: ${allZero && tenantCheck && (personas?.length ?? 0) >= 3 ? 'PASS' : 'FAIL'}`);

  console.log('\n========================================');
  console.log('END PHASE 2');
  console.log('========================================');
}

run().catch(console.error);
