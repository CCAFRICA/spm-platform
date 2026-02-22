#!/usr/bin/env npx tsx
/**
 * OB-74: Pipeline Test Tenant Seed Script
 *
 * Creates a CLEAN tenant with ZERO pipeline data.
 * Only provisions: tenant + auth user + profile.
 * All pipeline tables (entities, rule_sets, committed_data, etc.) must show 0 rows.
 *
 * Usage: npx tsx scripts/seed-test-pipeline.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const TENANT_ID = 'f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd';
const TENANT_NAME = 'Pipeline Test Co';
const TENANT_SLUG = 'pipeline-test';
const ADMIN_EMAIL = 'admin@pipelinetest.mx';
const ADMIN_PASSWORD = 'demo-password-VL1';

async function seed() {
  console.log('=== OB-74: Pipeline Test Tenant ===\n');

  // 1. Create tenant (or verify exists)
  const { data: existing } = await supabase
    .from('tenants')
    .select('id')
    .eq('id', TENANT_ID)
    .maybeSingle();

  if (!existing) {
    const { error } = await supabase.from('tenants').insert({
      id: TENANT_ID,
      name: TENANT_NAME,
      slug: TENANT_SLUG,
      currency: 'MXN',
      locale: 'es-MX',
      settings: {},
      features: {},
    });
    if (error) throw new Error(`Tenant create failed: ${error.message}`);
    console.log('Tenant created:', TENANT_NAME);
  } else {
    console.log('Tenant exists:', TENANT_NAME);
  }

  // 2. Create admin auth user
  const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: 'Pipeline Admin' },
  });

  let userId: string | undefined;

  if (authErr) {
    if (authErr.message.includes('already been registered')) {
      // Find existing user
      const { data: listData } = await supabase.auth.admin.listUsers();
      userId = listData?.users?.find(u => u.email === ADMIN_EMAIL)?.id;
      console.log('Auth user exists:', ADMIN_EMAIL);
    } else {
      throw new Error(`Auth user create failed: ${authErr.message}`);
    }
  } else {
    userId = authUser?.user?.id;
    console.log('Auth user created:', ADMIN_EMAIL);
  }

  if (!userId) throw new Error('Could not find auth user ID');

  // 3. Create profile (check if exists first)
  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('auth_user_id', userId)
    .maybeSingle();

  if (!existingProfile) {
    const { error: profErr } = await supabase.from('profiles').insert({
      auth_user_id: userId,
      tenant_id: TENANT_ID,
      display_name: 'Pipeline Admin',
      email: ADMIN_EMAIL,
      role: 'vl_admin',
      locale: 'es-MX',
    });

    if (profErr) {
      console.warn('Profile insert warning:', profErr.message);
    } else {
      console.log('Profile created for', ADMIN_EMAIL);
    }
  } else {
    console.log('Profile exists for', ADMIN_EMAIL);
  }

  // 4. Verify ZERO data in pipeline tables
  console.log('\n--- Pipeline Table Verification ---');
  const tables = [
    'entities', 'rule_sets', 'rule_set_assignments', 'periods',
    'committed_data', 'calculation_batches', 'calculation_results',
    'entity_period_outcomes', 'import_batches',
  ];

  let allClean = true;
  for (const table of tables) {
    const { count } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', TENANT_ID);
    const status = (count ?? 0) === 0 ? 'CLEAN' : 'NOT CLEAN';
    if (status !== 'CLEAN') allClean = false;
    console.log(`  ${table}: ${count ?? 0} rows [${status}]`);
  }

  console.log('\n=== Pipeline Test Tenant ready ===');
  console.log(`Login: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  console.log(`Tenant ID: ${TENANT_ID}`);
  console.log(`All tables clean: ${allClean ? 'YES' : 'NO — clean manually before testing'}`);
}

seed().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
