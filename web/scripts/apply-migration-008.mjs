import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SQL = `
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS tier TEXT DEFAULT 'inicio';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS experience_tier TEXT DEFAULT 'self_service';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS billing JSONB DEFAULT '{}';
`;

// Try the Supabase SQL endpoint
const url = process.env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/rpc/';

// Use the pg_net extension or direct SQL exec
// Since exec_sql may not exist, try a workaround with a dummy function
// The safest approach: use the Supabase Management API

// Actually, the simplest approach is to use the supabase-js built-in SQL execution
// via the postgres connection string. But we don't have that.

// Let's try adding the columns one at a time by just inserting a row with the new values
// and catching the error to confirm they're missing, then use the Dashboard

console.log('=== Migration 008: Add billing columns ===');
console.log('SQL to execute in Supabase SQL Editor:');
console.log(SQL);

// Try to read current schema
const { data, error } = await sb.from('tenants').select('*').limit(1);
if (data && data[0]) {
  const cols = Object.keys(data[0]);
  const hasTier = cols.includes('tier');
  const hasBilling = cols.includes('billing');
  const hasExpTier = cols.includes('experience_tier');

  console.log('\nCurrent columns:', cols.join(', '));
  console.log('tier:', hasTier ? 'EXISTS' : 'MISSING');
  console.log('experience_tier:', hasExpTier ? 'EXISTS' : 'MISSING');
  console.log('billing:', hasBilling ? 'EXISTS' : 'MISSING');

  if (hasTier && hasBilling && hasExpTier) {
    console.log('\n✓ All columns already exist!');

    // Seed existing tenants with billing data
    const { data: tenants } = await sb.from('tenants').select('id, slug, tier');
    for (const t of tenants) {
      const billingData = {
        modules: { icm: { enabled: true, license: 199 } },
        platform_fee: 299,
        mcp_included: 2500,
        mcp_overage_rate: 0.05
      };

      const { error: updateErr } = await sb.from('tenants')
        .update({
          tier: 'inicio',
          experience_tier: 'self_service',
          billing: billingData
        })
        .eq('id', t.id);

      if (updateErr) {
        console.log(`  Error updating ${t.slug}:`, updateErr.message);
      } else {
        console.log(`  ✓ Updated ${t.slug} with billing data`);
      }
    }
  } else {
    console.log('\n⚠ Columns missing. Please run the SQL above in Supabase SQL Editor.');
    console.log('Then re-run this script to seed tenant billing data.');
  }
}
