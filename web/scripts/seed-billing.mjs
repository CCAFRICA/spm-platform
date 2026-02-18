import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { data: tenants } = await sb.from('tenants').select('id, slug, settings');
if (!tenants || tenants.length === 0) {
  console.log('No tenants found');
  process.exit(1);
}

for (const t of tenants) {
  const settings = { ...(t.settings || {}) };
  settings.tier = 'inicio';
  settings.experience_tier = 'self_service';
  settings.billing = {
    modules: { icm: { enabled: true, license: 199 } },
    platform_fee: 299,
    mcp_included: 2500,
    mcp_overage_rate: 0.05,
  };

  const { error } = await sb.from('tenants').update({ settings }).eq('id', t.id);
  if (error) {
    console.log(`Error updating ${t.slug}:`, error.message);
  } else {
    console.log(`Updated ${t.slug} with billing data`);
  }
}

// Verify
const { data: verify } = await sb.from('tenants').select('slug, settings').limit(5);
for (const v of verify) {
  const s = v.settings || {};
  console.log(`PG-1: ${v.slug} tier=${s.tier}`);
  console.log(`PG-2: ${v.slug} billing=${JSON.stringify(s.billing)}`);
}
