#!/usr/bin/env npx tsx
/**
 * HF-027 Phase 1: Restore missing platform user profile
 *
 * The platform user (platform@vialuce.com) lost their profile row
 * during the ghost tenant cleanup in HF-026 (CASCADE delete on ghost tenant).
 *
 * Schema constraint: profiles.tenant_id is NOT NULL with FK to tenants.
 * Pragmatic approach: assign platform user to first tenant (Optica Luminar).
 * The app code detects VL admin by role/capabilities, not tenant_id.
 * Migration 005 provides the ideal fix (nullable tenant_id + RLS policies).
 */
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// Load .env.local
const envPath = path.resolve(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^#=]+)=(.+)$/);
  if (match) process.env[match[1].trim()] = match[2].trim();
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Missing env vars'); process.exit(1); }

const sb = createClient(url, key);

// Platform user's auth UUID (from Phase 0 diagnostic)
const PLATFORM_AUTH_USER_ID = '5fb5f934-2fbd-499f-a2b8-7cd15ac5a1c3';
const PLATFORM_EMAIL = 'platform@vialuce.com';
// Optica Luminar — first tenant, used as anchor for NOT NULL constraint
const ANCHOR_TENANT_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

async function main() {
  console.log('=== HF-027 Phase 1: Restore Platform Profile ===\n');

  // Step 1: Verify the auth user still exists
  const { data: usersData } = await sb.auth.admin.listUsers();
  const authUsers = usersData?.users || [];
  const platformAuth = authUsers.find(u => u.email === PLATFORM_EMAIL);

  if (!platformAuth) {
    console.error('FATAL: platform@vialuce.com not found in auth.users!');
    process.exit(1);
  }

  console.log(`✅ Auth user found: ${platformAuth.id} (${platformAuth.email})`);

  if (platformAuth.id !== PLATFORM_AUTH_USER_ID) {
    console.error(`FATAL: Auth user ID mismatch! Expected ${PLATFORM_AUTH_USER_ID}, got ${platformAuth.id}`);
    process.exit(1);
  }

  // Step 1b: Verify anchor tenant exists
  const { data: anchorTenant } = await sb
    .from('tenants')
    .select('id, name')
    .eq('id', ANCHOR_TENANT_ID)
    .single();

  if (!anchorTenant) {
    console.error(`FATAL: Anchor tenant ${ANCHOR_TENANT_ID} not found!`);
    process.exit(1);
  }
  console.log(`✅ Anchor tenant: ${anchorTenant.name} (${anchorTenant.id})`);

  // Step 2: Check if profile already exists
  const { data: existing } = await sb
    .from('profiles')
    .select('*')
    .eq('auth_user_id', PLATFORM_AUTH_USER_ID);

  if (existing && existing.length > 0) {
    console.log('⚠️  Profile already exists for platform user:');
    console.log(JSON.stringify(existing[0], null, 2));
    console.log('\nNo action needed.');
    return;
  }

  console.log('❌ No profile found for platform user — inserting now...\n');

  // Step 3: Generate profile ID
  const profileId = crypto.randomUUID();

  // Step 4: Insert the profile with anchor tenant_id
  // Note: tenant_id is required by schema (NOT NULL).
  // App code detects VL admin by role='vl_admin' + capabilities,
  // NOT by tenant_id. See auth-context.tsx:50-68 mapProfileToUser().
  const profileData = {
    id: profileId,
    auth_user_id: PLATFORM_AUTH_USER_ID,
    email: PLATFORM_EMAIL,
    display_name: 'VL Platform Admin',
    role: 'vl_admin',
    capabilities: [
      'manage_tenants',
      'view_all',
      'manage_users',
      'run_calculations',
      'manage_rule_sets',
      'approve_results',
      'export_data',
    ],
    locale: 'en',
    tenant_id: ANCHOR_TENANT_ID,
  };

  console.log('Inserting profile:');
  console.log(JSON.stringify(profileData, null, 2));

  const { data: inserted, error } = await sb
    .from('profiles')
    .insert(profileData)
    .select()
    .single();

  if (error) {
    console.error('\n❌ INSERT FAILED:', error);
    process.exit(1);
  }

  console.log('\n✅ Profile inserted successfully:');
  console.log(JSON.stringify(inserted, null, 2));

  // Step 5: Verify the profile can be fetched by auth_user_id (same as login flow)
  const { data: verify, error: verifyErr } = await sb
    .from('profiles')
    .select('*')
    .eq('auth_user_id', PLATFORM_AUTH_USER_ID)
    .single();

  if (verifyErr || !verify) {
    console.error('\n❌ VERIFICATION FAILED: Could not fetch profile by auth_user_id');
    console.error(verifyErr);
    process.exit(1);
  }

  console.log('\n✅ Verification: profile fetchable by auth_user_id');
  console.log(`   id: ${verify.id}`);
  console.log(`   auth_user_id: ${verify.auth_user_id}`);
  console.log(`   email: ${verify.email}`);
  console.log(`   role: ${verify.role}`);
  console.log(`   tenant_id: ${verify.tenant_id}`);
  console.log(`   capabilities: ${JSON.stringify(verify.capabilities)}`);

  // Step 6: Verify all 7 active demo users still have profiles
  console.log('\n=== Verifying all demo user profiles ===\n');
  const demoUsers = [
    { email: 'admin@opticaluminar.mx', authId: '28d0f742-7346-4c96-9bfd-e648d9cd3364' },
    { email: 'gerente@opticaluminar.mx', authId: '99d22f6c-074d-4b10-bdca-3575a498e2cc' },
    { email: 'vendedor@opticaluminar.mx', authId: 'ac03e07b-3dbc-4b9e-816f-b293f7945c3b' },
    { email: 'admin@velocidaddeportiva.mx', authId: '1c869082-a765-41d6-b5af-f5bb2ce2ef10' },
    { email: 'gerente@velocidaddeportiva.mx', authId: 'c2f688c6-ddc2-4c21-a0ea-f2e00eb6390b' },
    { email: 'asociado@velocidaddeportiva.mx', authId: '893aae24-7f5f-4c4b-a1e0-936ac0782e7d' },
  ];

  let allOk = true;
  for (const du of demoUsers) {
    const { data: profile } = await sb
      .from('profiles')
      .select('id, auth_user_id, email, role, tenant_id')
      .eq('auth_user_id', du.authId)
      .single();

    if (profile) {
      console.log(`  ✅ ${du.email} → role=${profile.role}, tenant=${profile.tenant_id}`);
    } else {
      console.log(`  ❌ ${du.email} → MISSING PROFILE`);
      allOk = false;
    }
  }

  if (allOk) {
    console.log('\n✅ All 7 users (1 platform + 6 demo) have valid profiles.');
  } else {
    console.log('\n⚠️  Some demo users are missing profiles!');
  }
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
