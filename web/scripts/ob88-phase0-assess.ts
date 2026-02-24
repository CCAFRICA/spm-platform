/**
 * OB-88 Phase 0A: Assess current database state before creating clean tenant.
 */
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  console.log('=== EXISTING TENANTS ===');
  const { data: tenants } = await sb.from('tenants').select('id, name, slug, currency, locale');
  console.table(tenants);

  console.log('\n=== EXISTING PROFILES ===');
  const { data: profiles } = await sb.from('profiles').select('email, role, tenant_id');
  console.table(profiles);

  console.log('\n=== DATA VOLUME PER TENANT ===');
  const tables = ['entities', 'periods', 'rule_sets', 'committed_data', 'calculation_batches', 'calculation_results'];
  for (const table of tables) {
    const { count } = await sb.from(table).select('*', { count: 'exact', head: true });
    console.log(table.padEnd(25), count);
  }
}

main().catch(console.error);
