/**
 * OB-88 Phase 0B+0C: Create clean tenant + auth user + profile.
 */
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  // 0B: Create tenant
  console.log('=== Creating Clean Tenant ===');
  const { data: tenant, error: tenantErr } = await sb.from('tenants').insert({
    name: 'Pipeline Proof Co',
    slug: 'pipeline-proof',
    currency: 'MXN',
    locale: 'es-MX',
    settings: {
      timezone: 'America/Mexico_City',
      demo_users: [],
    },
    features: {},
  }).select().single();

  if (tenantErr) {
    console.error('Tenant creation error:', tenantErr);
    process.exit(1);
  }
  console.log('Tenant created:', tenant.id, tenant.name);
  const TENANT_ID = tenant.id;

  // 0C: Create auth user
  console.log('\n=== Creating Auth User ===');
  const { data: authUser, error: authError } = await sb.auth.admin.createUser({
    email: 'admin@pipelineproof.mx',
    password: 'demo-password-VL1',
    email_confirm: true,
  });

  if (authError) {
    console.error('Auth error:', authError);
    process.exit(1);
  }
  console.log('Auth user created:', authUser.user.id);

  // 0C: Create profile
  console.log('\n=== Creating Profile ===');
  const { data: profile, error: profileErr } = await sb.from('profiles').insert({
    auth_user_id: authUser.user.id,
    email: 'admin@pipelineproof.mx',
    display_name: 'Pipeline Proof Admin',
    role: 'admin',
    tenant_id: TENANT_ID,
  }).select().single();

  if (profileErr) {
    console.error('Profile error:', profileErr);
    process.exit(1);
  }
  console.log('Profile created:', profile.id, profile.email);

  // 0D: Verify clean state
  console.log('\n=== Verify Clean State ===');
  const checks = ['entities', 'periods', 'rule_sets', 'committed_data', 'calculation_batches', 'calculation_results', 'reconciliation_sessions', 'classification_signals'];
  for (const table of checks) {
    const { count } = await sb.from(table).select('*', { count: 'exact', head: true }).eq('tenant_id', TENANT_ID);
    console.log(table.padEnd(30), count === 0 ? '✅ CLEAN' : '❌ HAS DATA: ' + count);
  }

  console.log('\n=== TENANT ID (save this) ===');
  console.log(TENANT_ID);
}

main().catch(console.error);
