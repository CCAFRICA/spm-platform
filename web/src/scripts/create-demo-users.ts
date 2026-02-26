import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing env vars. Set SUPABASE_SERVICE_ROLE_KEY from Supabase Dashboard > Settings > API');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const DEMO_USERS = [
  // Sabor Grupo Gastronomico
  { email: 'admin@saborgrupo.mx', password: 'demo-password-VL1', displayName: 'Carlos Mendoza', role: 'admin', scopeLevel: 'tenant', tenantMatch: 'sabor', label: 'Admin', icon: 'shield' },
  { email: 'gerente@saborgrupo.mx', password: 'demo-password-VL1', displayName: 'Ana Martinez', role: 'manager', scopeLevel: 'division', tenantMatch: 'sabor', label: 'Gerente', icon: 'users' },
  { email: 'mesero@saborgrupo.mx', password: 'demo-password-VL1', displayName: 'Diego Ramirez', role: 'sales_rep', scopeLevel: 'individual', tenantMatch: 'sabor', label: 'Mesero', icon: 'user' },
  // Caribe Financial Group
  { email: 'admin@caribefinancial.mx', password: 'demo-password-VL1', displayName: 'Roberto Vega', role: 'admin', scopeLevel: 'tenant', tenantMatch: 'caribe', label: 'Admin', icon: 'shield' },
  { email: 'director@caribefinancial.mx', password: 'demo-password-VL1', displayName: 'Patricia Navarro', role: 'manager', scopeLevel: 'division', tenantMatch: 'caribe', label: 'Director', icon: 'users' },
  { email: 'oficial@caribefinancial.mx', password: 'demo-password-VL1', displayName: 'Miguel Torres', role: 'sales_rep', scopeLevel: 'individual', tenantMatch: 'caribe', label: 'Oficial', icon: 'user' },
];

async function main() {
  console.log('=== HF-063D: Create Demo Users ===\n');

  const { data: tenants } = await supabase.from('tenants').select('id, slug, name, settings');
  if (!tenants?.length) { console.error('No tenants found'); process.exit(1); }

  const findTenant = (match: string) => tenants.find(t =>
    t.slug?.toLowerCase().includes(match) || t.name?.toLowerCase().includes(match)
  );

  const saborTenant = findTenant('sabor');
  const caribeTenant = findTenant('caribe') || findTenant('mexican bank');
  console.log('Sabor:', saborTenant ? `${saborTenant.name} (${saborTenant.id})` : 'NOT FOUND');
  console.log('Caribe:', caribeTenant ? `${caribeTenant.name} (${caribeTenant.id})` : 'NOT FOUND');

  if (!saborTenant && !caribeTenant) { console.error('Neither tenant found'); process.exit(1); }

  const { data: listData } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const existingUsers = listData?.users || [];

  for (const user of DEMO_USERS) {
    const tenant = user.tenantMatch === 'sabor' ? saborTenant : caribeTenant;
    if (!tenant) { console.warn(`Skip ${user.email} -- no ${user.tenantMatch} tenant`); continue; }

    // Auth user
    const existing = existingUsers.find(u => u.email === user.email);
    let authUserId: string;

    if (existing) {
      authUserId = existing.id;
      await supabase.auth.admin.updateUserById(authUserId, { password: user.password, email_confirm: true });
      console.log(`OK ${user.email} exists (${authUserId}), password updated`);
    } else {
      const { data, error } = await supabase.auth.admin.createUser({
        email: user.email, password: user.password, email_confirm: true
      });
      if (error) { console.error(`FAIL ${user.email}: ${error.message}`); continue; }
      authUserId = data.user.id;
      console.log(`OK Created ${user.email} (${authUserId})`);
    }

    // Profile
    const { data: existingProfile } = await supabase
      .from('profiles').select('id')
      .eq('auth_user_id', authUserId).eq('tenant_id', tenant.id).maybeSingle();

    if (!existingProfile) {
      const { error } = await supabase.from('profiles').insert({
        auth_user_id: authUserId, tenant_id: tenant.id, email: user.email,
        display_name: user.displayName, role: user.role, scope_level: user.scopeLevel,
      });
      if (error) {
        // Retry without scope_level (column may not exist)
        const { error: retry } = await supabase.from('profiles').insert({
          auth_user_id: authUserId, tenant_id: tenant.id, email: user.email,
          display_name: user.displayName, role: user.role,
        });
        if (retry) console.error(`  FAIL Profile: ${retry.message}`);
        else console.log(`  OK Profile created (no scope_level)`);
      } else {
        console.log(`  OK Profile -> ${tenant.name} (${user.role})`);
      }
    } else {
      console.log(`  Profile exists`);
    }
  }

  // Update tenant demo_users settings
  for (const tenant of [saborTenant, caribeTenant].filter(Boolean)) {
    if (!tenant) continue;
    const match = tenant.name?.toLowerCase().includes('sabor') ? 'sabor' : 'caribe';
    const users = DEMO_USERS.filter(u => u.tenantMatch === match);
    const config = users.map(u => ({ email: u.email, password: u.password, label: u.label, icon: u.icon }));
    const settings = { ...((tenant.settings as Record<string, unknown>) || {}), demo_users: config };
    const { error } = await supabase.from('tenants').update({ settings }).eq('id', tenant.id);
    console.log(error ? `FAIL demo_users for ${tenant.name}: ${error.message}` : `OK demo_users for ${tenant.name}`);
  }

  console.log('\n=== Test Logins ===');
  DEMO_USERS.forEach(u => console.log(`  ${u.email} / ${u.password}`));
}

main().catch(console.error);
