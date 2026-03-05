#!/usr/bin/env npx tsx
import { createClient } from '@supabase/supabase-js';

const s = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TENANT_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

async function countTable(table: string): Promise<number | null> {
  const { count, error } = await s.from(table)
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', TENANT_ID);
  if (error) {
    console.error(`  Error querying ${table}:`, error.message);
    return null;
  }
  return count;
}

async function main() {
  console.log(`\n=== Óptica Tenant State Check ===`);
  console.log(`Tenant ID: ${TENANT_ID}\n`);

  const tables = [
    'rule_sets',
    'entities',
    'periods',
    'committed_data',
    'rule_set_assignments',
    'calculation_results',
    'calculation_batches',
    'import_batches',
  ];

  for (const table of tables) {
    const count = await countTable(table);
    console.log(`${table}: ${count ?? 'ERROR'}`);
  }

  console.log('\nDone.');
}

main().catch(console.error);
