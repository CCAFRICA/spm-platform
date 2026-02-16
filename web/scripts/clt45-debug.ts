#!/usr/bin/env npx tsx
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  // What tenants actually exist?
  console.log('=== All Tenants ===');
  const { data: tenants, error: tErr } = await sb.from('tenants').select('id,name,slug,settings');
  if (tErr) console.error('Tenant query error:', tErr.message);
  tenants?.forEach(t => {
    const demoUsers = (t.settings as any)?.demo_users?.length || 0;
    console.log(`  ${t.id} | ${t.name} | slug: ${t.slug} | demo_users: ${demoUsers}`);
  });

  // What profiles exist?
  console.log('\n=== All Profiles ===');
  const { data: profiles, error: pErr } = await sb.from('profiles').select('id,email,role,tenant_id,display_name');
  if (pErr) console.error('Profile query error:', pErr.message);
  profiles?.forEach(p => {
    console.log(`  ${p.email} | role: ${p.role} | tenant: ${p.tenant_id} | ${p.display_name}`);
  });

  // Check entity counts per tenant
  console.log('\n=== Entity Counts Per Tenant ===');
  for (const t of tenants || []) {
    const { count } = await sb.from('entities').select('*', { count: 'exact', head: true }).eq('tenant_id', t.id);
    console.log(`  ${t.name}: ${count} entities`);
  }

  // Try platform auth with different passwords
  console.log('\n=== Platform Auth Test ===');
  const sbAnon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const passwords = ['VL-platform-2024!', 'demo-password-VL1', 'platform-2024'];
  for (const pw of passwords) {
    const { error } = await sbAnon.auth.signInWithPassword({ email: 'platform@vialuce.com', password: pw });
    console.log(`  platform@vialuce.com / ${pw}: ${error ? 'FAIL: ' + error.message : 'OK'}`);
    if (!error) { await sbAnon.auth.signOut(); break; }
  }
}

main().catch(console.error);
