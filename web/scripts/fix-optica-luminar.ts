/**
 * Fix Optica Luminar tenant settings and platform admin profile.
 *
 * 1. Add demo_users to OL tenant settings JSONB
 * 2. Update platform admin profile role to 'vl_admin'
 */

import { createClient } from '@supabase/supabase-js';

const TENANT_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const PLATFORM_PROFILE_ID = 'c0000000-0000-0000-0000-000000000001';

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  console.log('=== Fix Optica Luminar + Platform Admin ===\n');

  // 1. Update OL tenant settings with demo_users
  console.log('1. Updating Optica Luminar tenant settings...');
  const { data: tenant } = await supabase
    .from('tenants')
    .select('settings')
    .eq('id', TENANT_ID)
    .single();

  const currentSettings = (tenant?.settings || {}) as Record<string, unknown>;
  const updatedSettings = {
    ...currentSettings,
    country_code: 'MX',
    industry: 'Optical',
    demo_users: [
      { email: 'admin@opticaluminar.mx', password: 'demo-password-OL1', label: 'Admin', icon: 'shield' },
      { email: 'gerente@opticaluminar.mx', password: 'demo-password-OL2', label: 'Gerente', icon: 'users' },
      { email: 'vendedor@opticaluminar.mx', password: 'demo-password-OL3', label: 'Vendedor', icon: 'user' },
    ],
  };

  const { error: tenantErr } = await supabase
    .from('tenants')
    .update({ settings: updatedSettings })
    .eq('id', TENANT_ID);

  if (tenantErr) console.error('  Error:', tenantErr.message);
  else console.log('  Updated settings with demo_users');

  // 2. Update platform admin profile to role='vl_admin'
  console.log('\n2. Updating platform admin profile...');
  const { error: profileErr } = await supabase
    .from('profiles')
    .update({ role: 'vl_admin' })
    .eq('id', PLATFORM_PROFILE_ID);

  if (profileErr) console.error('  Error:', profileErr.message);
  else console.log('  Platform admin role set to vl_admin');

  // 3. Sync OL user passwords to the known demo passwords
  console.log('\n3. Syncing OL demo user passwords...');
  const demoUsers = [
    { email: 'admin@opticaluminar.mx', password: 'demo-password-OL1' },
    { email: 'gerente@opticaluminar.mx', password: 'demo-password-OL2' },
    { email: 'vendedor@opticaluminar.mx', password: 'demo-password-OL3' },
  ];

  const { data: { users: allUsers } } = await supabase.auth.admin.listUsers();
  for (const du of demoUsers) {
    const existing = allUsers?.find(u => u.email === du.email);
    if (existing) {
      await supabase.auth.admin.updateUserById(existing.id, { password: du.password });
      console.log(`  ${du.email} — password synced`);
    } else {
      console.log(`  ${du.email} — NOT FOUND`);
    }
  }

  // 4. Verify
  console.log('\n4. Verification...');
  const { data: verifyTenant } = await supabase
    .from('tenants')
    .select('name, settings')
    .eq('id', TENANT_ID)
    .single();
  const settings = (verifyTenant?.settings || {}) as Record<string, unknown>;
  console.log(`  Tenant name: ${verifyTenant?.name}`);
  console.log(`  demo_users count: ${(settings.demo_users as unknown[])?.length || 0}`);

  const { data: verifyProfile } = await supabase
    .from('profiles')
    .select('display_name, role')
    .eq('id', PLATFORM_PROFILE_ID)
    .single();
  console.log(`  Platform admin role: ${verifyProfile?.role}`);

  console.log('\n=== Done ===');
}

main().catch(console.error);
