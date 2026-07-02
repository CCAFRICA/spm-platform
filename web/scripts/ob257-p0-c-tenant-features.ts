// OB-257 P0 Discovery Item 3 — READ-ONLY live read of tenants.features for ALL tenants.
// Run: cd web && npx tsx scripts/ob257-p0-c-tenant-features.ts
import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb: any = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

async function main() {
  const { data, error } = await sb
    .from('tenants')
    .select('id, name, slug, features')
    .order('name');
  if (error) { console.error('ERROR:', error.message); process.exit(1); }
  console.log(`=== tenants (${data?.length ?? 0}) — id | name | slug | features (raw jsonb) ===`);
  for (const t of data ?? []) {
    console.log(`${t.id} | ${t.name} | ${t.slug ?? ''}`);
    console.log(`  features: ${JSON.stringify(t.features)}`);
    console.log(`  typeof: ${Array.isArray(t.features) ? 'array' : typeof t.features}`);
  }
  // Distinct key inventory across all tenants
  const keys = new Set<string>();
  for (const t of data ?? []) {
    if (t.features && typeof t.features === 'object' && !Array.isArray(t.features)) {
      Object.keys(t.features).forEach((k) => keys.add(k));
    }
  }
  console.log(`\n=== distinct feature keys present in live jsonb across all tenants ===`);
  console.log([...keys].sort().join(', ') || '(none)');
}

main();
