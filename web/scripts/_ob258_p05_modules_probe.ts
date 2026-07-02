/**
 * OB-258 P0.5 — Module gating live probe (READ-ONLY).
 *
 * Selects id,name,slug,features,settings from tenants and prints every row with the
 * features/settings jsonb verbatim, so the governance report can see every live module flag
 * and which tenants have Intelligence (intelligence_enabled) / PRISM (prism_enabled) /
 * Finance (financial) / Revenue (revenue_enabled) on.
 *
 * Run: cd web && set -a && source .env.local && set +a && npx tsx scripts/_ob258_p05_modules_probe.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  const { data, error } = await supabase
    .from('tenants')
    .select('id, name, slug, features, settings')
    .order('name', { ascending: true });

  if (error) {
    console.error('ERROR reading tenants:', error.message);
    process.exit(1);
  }

  console.log(`tenants rows: ${data?.length ?? 0}`);
  for (const t of data ?? []) {
    console.log('---');
    console.log(`id: ${t.id}`);
    console.log(`name: ${t.name}`);
    console.log(`slug: ${t.slug}`);
    console.log(`features: ${JSON.stringify(t.features)}`);
    console.log(`settings: ${JSON.stringify(t.settings)}`);
  }
}

main();
