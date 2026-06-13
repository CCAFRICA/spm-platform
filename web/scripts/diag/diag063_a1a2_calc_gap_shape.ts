/**
 * DIAG-063 A1A2 — part 3 (READ-ONLY).
 * Characterizes the calculation-side gap for the ~162k tenant:
 * entity resolution state of the largest batch, entities / rule_sets / rule_set_assignments
 * row counts for the tenant. Counts and ids only.
 */
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TOP_BATCH = 'e95be66e-6546-4fbe-896f-56f3a725f7d5';
const TOP_TENANT = '3d354bfa-b298-48dd-88a0-9f8c5a00be4e';

async function main() {
  const { count: entNull } = await sb
    .from('committed_data')
    .select('id', { count: 'exact', head: true })
    .eq('import_batch_id', TOP_BATCH)
    .is('entity_id', null);
  const { count: entSet } = await sb
    .from('committed_data')
    .select('id', { count: 'exact', head: true })
    .eq('import_batch_id', TOP_BATCH)
    .not('entity_id', 'is', null);
  console.log(`top batch ${TOP_BATCH}: entity_id NULL=${entNull}, entity_id set=${entSet}`);

  for (const t of ['entities', 'rule_sets', 'rule_set_assignments', 'entity_period_outcomes'] as const) {
    const { count, error } = await sb
      .from(t)
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', TOP_TENANT);
    console.log(`${t} rows for tenant ${TOP_TENANT}: ${error ? 'ERR ' + error.message : count}`);
  }
}

main().catch((e) => {
  console.error('PROBE ERROR:', e.message ?? e);
  process.exit(1);
});
