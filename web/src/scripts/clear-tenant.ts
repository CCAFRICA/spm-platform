import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function clearTenant(tenantIdentifier: string) {
  console.log(`\n=== CLEAR TENANT: ${tenantIdentifier} ===\n`);

  // 1. Find tenant
  const { data: tenants } = await supabase
    .from('tenants')
    .select('id, name, slug')
    .or(`slug.ilike.%${tenantIdentifier}%,name.ilike.%${tenantIdentifier}%`);

  if (!tenants?.length) {
    console.error(`No tenant found matching "${tenantIdentifier}"`);
    process.exit(1);
  }

  if (tenants.length > 1) {
    console.error('Multiple tenants match. Be more specific:');
    tenants.forEach(t => console.log(`  ${t.name} (${t.slug}) — ${t.id}`));
    process.exit(1);
  }

  const tenant = tenants[0];
  const tenantId = tenant.id;
  console.log(`Tenant: ${tenant.name} (${tenant.slug})`);
  console.log(`ID: ${tenantId}`);
  console.log('');

  // 2. Delete in dependency order (children before parents)
  const tables = [
    // Calculation layer
    'calculation_results',
    'calculation_batches',

    // Data layer
    'committed_data',
    'import_batches',
    'ingestion_events',

    // Classification / AI
    'classification_signals',

    // Entity layer
    'rule_set_assignments',
    'entity_period_outcomes',
    'entity_relationships',
    'entities',

    // Plan layer
    'rule_sets',
    'rule_set_versions',

    // Period layer
    'periods',

    // Disputes / lifecycle
    'disputes',
    'approval_queue',
  ];

  for (const table of tables) {
    try {
      const { count, error } = await supabase
        .from(table)
        .delete({ count: 'exact' })
        .eq('tenant_id', tenantId);

      if (error) {
        if (error.code === '42P01' || error.message.includes('does not exist')) {
          console.log(`  ~ ${table} — table does not exist (skip)`);
        } else if (error.message.includes('tenant_id')) {
          console.log(`  ~ ${table} — no tenant_id column (skip)`);
        } else {
          console.warn(`  ! ${table} — ${error.message}`);
        }
      } else {
        console.log(`  OK ${table} — ${count ?? 0} rows deleted`);
      }
    } catch (e) {
      console.warn(`  ! ${table} — unexpected error: ${e}`);
    }
  }

  // 3. Verify tenant is clean
  console.log('\n=== VERIFICATION ===\n');

  const checks = [
    'rule_sets', 'entities', 'periods', 'committed_data',
    'calculation_batches', 'calculation_results'
  ];

  let allClean = true;
  for (const table of checks) {
    try {
      const { count } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId);
      const status = (count ?? 0) === 0 ? 'OK CLEAN' : `FAIL ${count} rows remain`;
      console.log(`  ${status} — ${table}`);
      if ((count ?? 0) > 0) allClean = false;
    } catch {
      console.log(`  ~ ${table} — cannot verify`);
    }
  }

  // 4. Confirm what's PRESERVED
  console.log('\n=== PRESERVED (not deleted) ===\n');

  const { count: profileCount } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);
  console.log(`  Profiles: ${profileCount ?? 0} (preserved)`);

  const { data: tenantData } = await supabase
    .from('tenants')
    .select('name, slug, settings')
    .eq('id', tenantId)
    .single();
  console.log(`  Tenant record: ${tenantData?.name} (preserved)`);
  console.log(`  Settings/demo_users: ${tenantData?.settings ? 'preserved' : 'none'}`);

  console.log(`\n=== ${allClean ? 'TENANT IS CLEAN' : 'SOME DATA REMAINS'} ===`);
  console.log(`\n${tenant.name} is ready for a fresh walkthrough.`);
  console.log('Auth users and profiles are intact — login will work immediately.');
}

// Parse CLI argument
const identifier = process.argv[2];
if (!identifier) {
  console.log('Usage: npx tsx src/scripts/clear-tenant.ts <tenant-name-or-slug>');
  console.log('Examples:');
  console.log('  npx tsx src/scripts/clear-tenant.ts "mexican bank"');
  console.log('  npx tsx src/scripts/clear-tenant.ts caribe');
  console.log('  npx tsx src/scripts/clear-tenant.ts sabor');
  console.log('  npx tsx src/scripts/clear-tenant.ts "optica luminar"');
  process.exit(0);
}

clearTenant(identifier).catch(console.error);
