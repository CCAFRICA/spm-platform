#!/usr/bin/env npx tsx
/**
 * HF-027 Phase 3: Verify all 7 users can authenticate
 *
 * Tests the full login path: signIn → profile fetch → role detection
 * for the platform user and all 6 demo users.
 */
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createClient as createAnonClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Load .env.local
const envPath = path.resolve(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^#=]+)=(.+)$/);
  if (match) process.env[match[1].trim()] = match[2].trim();
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Admin client for profile lookups (bypasses RLS)
const adminSb = createAdminClient(url, serviceKey);

// Password from DemoPersonaSwitcher (HF-026 Phase 3)
const DEMO_PASSWORD = 'demo-password-VL1';

interface TestUser {
  email: string;
  expectedRole: string;
  expectedTenantName: string;
  isVLAdmin: boolean;
}

const TEST_USERS: TestUser[] = [
  { email: 'platform@vialuce.com', expectedRole: 'vl_admin', expectedTenantName: 'Optica Luminar (anchor)', isVLAdmin: true },
  { email: 'admin@opticaluminar.mx', expectedRole: 'admin', expectedTenantName: 'Optica Luminar', isVLAdmin: false },
  { email: 'gerente@opticaluminar.mx', expectedRole: 'manager', expectedTenantName: 'Optica Luminar', isVLAdmin: false },
  { email: 'vendedor@opticaluminar.mx', expectedRole: 'viewer', expectedTenantName: 'Optica Luminar', isVLAdmin: false },
  { email: 'admin@velocidaddeportiva.mx', expectedRole: 'admin', expectedTenantName: 'Velocidad Deportiva', isVLAdmin: false },
  { email: 'gerente@velocidaddeportiva.mx', expectedRole: 'manager', expectedTenantName: 'Velocidad Deportiva', isVLAdmin: false },
  { email: 'asociado@velocidaddeportiva.mx', expectedRole: 'viewer', expectedTenantName: 'Velocidad Deportiva', isVLAdmin: false },
];

let passed = 0;
let failed = 0;

function gate(name: string, ok: boolean, detail: string) {
  if (ok) passed++;
  else failed++;
  console.log(`  ${ok ? '✅' : '❌'} ${name}: ${detail}`);
}

async function testUser(user: TestUser) {
  console.log(`\n── Testing: ${user.email} ──`);

  // Step 1: Sign in with anon client (simulates browser)
  const anonSb = createAnonClient(url, anonKey);
  const { data: signInData, error: signInError } = await anonSb.auth.signInWithPassword({
    email: user.email,
    password: DEMO_PASSWORD,
  });

  if (signInError) {
    gate(`Auth sign-in ${user.email}`, false, `Sign-in FAILED: ${signInError.message}`);
    return;
  }

  gate(`Auth sign-in ${user.email}`, true, 'Authenticated');

  // Step 2: Fetch profile via anon client (with RLS)
  const { data: { user: authUser } } = await anonSb.auth.getUser();
  if (!authUser) {
    gate(`Auth user ${user.email}`, false, 'getUser() returned null');
    return;
  }

  gate(`Auth user ${user.email}`, true, `uid=${authUser.id.slice(0, 8)}...`);

  // Step 3: Fetch profile via anon client (RLS-constrained, simulates fetchCurrentProfile)
  const { data: profile, error: profileError } = await anonSb
    .from('profiles')
    .select('*')
    .eq('auth_user_id', authUser.id)
    .single();

  if (profileError || !profile) {
    gate(`Profile fetch ${user.email}`, false,
      `FAILED: ${profileError?.message || 'null data'} (code: ${profileError?.code})`);

    // Try with admin client to see if profile exists but RLS blocks it
    const { data: adminProfile } = await adminSb
      .from('profiles')
      .select('id, auth_user_id, role, tenant_id')
      .eq('auth_user_id', authUser.id)
      .single();

    if (adminProfile) {
      console.log(`    ⚠️  Profile EXISTS (id=${adminProfile.id}) but RLS blocks access!`);
      console.log(`       tenant_id=${adminProfile.tenant_id}, role=${adminProfile.role}`);
    } else {
      console.log(`    ❌ Profile does NOT exist even with service role key`);
    }
    return;
  }

  gate(`Profile fetch ${user.email}`, true,
    `role=${profile.role}, tenant=${profile.tenant_id?.slice(0, 8)}...`);

  // Step 4: Verify role matches
  gate(`Role match ${user.email}`,
    profile.role === user.expectedRole,
    `expected=${user.expectedRole}, actual=${profile.role}`);

  // Step 5: Verify VL admin detection (simulates mapProfileToUser)
  const isPlatformAdmin = profile.role === 'vl_admin' ||
    (Array.isArray(profile.capabilities) && profile.capabilities.includes('manage_tenants'));
  gate(`VL admin detection ${user.email}`,
    isPlatformAdmin === user.isVLAdmin,
    `expected=${user.isVLAdmin}, actual=${isPlatformAdmin}`);

  // Step 6: Sign out
  await anonSb.auth.signOut();
}

async function main() {
  console.log('=== HF-027 Phase 3: Auth Verification ===\n');

  for (const user of TEST_USERS) {
    await testUser(user);
  }

  console.log('\n═══════════════════════════════════════');
  console.log(`  TOTAL: ${passed + failed} gates`);
  console.log(`  PASSED: ${passed}`);
  console.log(`  FAILED: ${failed}`);
  console.log(`  SCORE: ${Math.round((passed / (passed + failed)) * 100)}%`);
  console.log('═══════════════════════════════════════\n');

  if (failed > 0) {
    console.log('FAILED GATES:');
    process.exit(1);
  }
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
