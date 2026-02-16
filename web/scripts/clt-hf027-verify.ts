#!/usr/bin/env npx tsx
/**
 * CLT-HF027 Verification Script
 *
 * Automated verification of HF-027 fixes:
 * - Phase 1: Platform profile restored
 * - Phase 2: Login code path verified
 * - Phase 3: All 7 users can authenticate
 *
 * Run: npx tsx web/scripts/clt-hf027-verify.ts
 */

import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createClient as createAnonClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const WEB_SRC = path.resolve(__dirname, '../src');
let passed = 0;
let failed = 0;
const results: Array<{ gate: string; status: 'PASS' | 'FAIL'; detail: string }> = [];

function gate(name: string, ok: boolean, detail: string) {
  const status = ok ? 'PASS' : 'FAIL';
  if (ok) passed++;
  else failed++;
  results.push({ gate: name, status, detail });
  console.log(`  ${ok ? '✅' : '❌'} ${name}: ${detail}`);
}

function readFile(relPath: string): string {
  const full = path.resolve(WEB_SRC, relPath);
  if (!fs.existsSync(full)) return '';
  return fs.readFileSync(full, 'utf-8');
}

// Load env
const envPath = path.resolve(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^#=]+)=(.+)$/);
  if (match) process.env[match[1].trim()] = match[2].trim();
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const adminSb = createAdminClient(url, serviceKey);
const DEMO_PASSWORD = 'demo-password-VL1';

// ══════════════════════════════════════════════════
// SECTION 1: Code path verification (static analysis)
// ══════════════════════════════════════════════════

function verifyCodePath() {
  console.log('\n═══ SECTION 1: Login Code Path ═══\n');

  const authService = readFile('lib/supabase/auth-service.ts');
  const authContext = readFile('contexts/auth-context.tsx');

  // fetchCurrentProfile uses auth_user_id
  gate('Profile query uses auth_user_id',
    authService.includes('.eq(\'auth_user_id\''),
    authService.includes('.eq(\'auth_user_id\'') ? 'Correct query' : 'WRONG query field');

  // fetchCurrentProfile uses .single()
  gate('Profile query uses .single()',
    authService.includes('.single()'),
    authService.includes('.single()') ? 'Returns single profile' : 'Missing .single()');

  // mapProfileToUser checks for vl_admin role
  gate('VL admin role detection',
    authContext.includes("profile.role === 'vl_admin'"),
    authContext.includes("profile.role === 'vl_admin'") ? 'Checks role' : 'Missing role check');

  // mapProfileToUser checks manage_tenants capability
  gate('manage_tenants capability check',
    authContext.includes("capabilities.includes('manage_tenants')"),
    authContext.includes("capabilities.includes('manage_tenants')") ? 'Checks capability' : 'Missing capability check');

  // VL admin gets tenantId: null
  gate('VL admin gets null tenantId',
    authContext.includes('tenantId: null'),
    authContext.includes('tenantId: null') ? 'Correct mapping' : 'Missing null tenantId');

  // VL admin routes to /select-tenant
  gate('VL admin routes to select-tenant',
    authContext.includes("router.push('/select-tenant')"),
    authContext.includes("router.push('/select-tenant')") ? 'Correct routing' : 'Missing routing');

  // AuthProfile interface exists
  gate('AuthProfile interface defined',
    authService.includes('export interface AuthProfile'),
    authService.includes('export interface AuthProfile') ? 'Present' : 'Missing');

  // Profile missing error message exists
  gate('Profile missing error message',
    authContext.includes('Account found but profile is missing'),
    authContext.includes('Account found but profile is missing') ? 'Present' : 'Missing');
}

// ══════════════════════════════════════════════════
// SECTION 2: Database state verification
// ══════════════════════════════════════════════════

async function verifyDatabaseState() {
  console.log('\n═══ SECTION 2: Database State ═══\n');

  // Platform profile exists
  const { data: platformProfile } = await adminSb
    .from('profiles')
    .select('*')
    .eq('email', 'platform@vialuce.com')
    .single();

  gate('Platform profile exists',
    !!platformProfile,
    platformProfile ? `id=${platformProfile.id.slice(0, 8)}...` : 'MISSING');

  if (platformProfile) {
    // Role is vl_admin
    gate('Platform role is vl_admin',
      platformProfile.role === 'vl_admin',
      `role=${platformProfile.role}`);

    // Has manage_tenants capability
    const caps = platformProfile.capabilities as string[] || [];
    gate('Platform has manage_tenants',
      caps.includes('manage_tenants'),
      `capabilities: ${caps.join(', ')}`);

    // auth_user_id matches expected
    gate('Platform auth_user_id correct',
      platformProfile.auth_user_id === '5fb5f934-2fbd-499f-a2b8-7cd15ac5a1c3',
      `auth_user_id=${platformProfile.auth_user_id.slice(0, 8)}...`);

    // tenant_id points to a valid tenant
    const { data: tenant } = await adminSb
      .from('tenants')
      .select('name')
      .eq('id', platformProfile.tenant_id)
      .single();

    gate('Platform tenant_id valid',
      !!tenant,
      tenant ? `Anchored to ${tenant.name}` : 'Invalid tenant_id');
  }

  // All 6 demo profiles exist
  const demoEmails = [
    'admin@opticaluminar.mx', 'gerente@opticaluminar.mx', 'vendedor@opticaluminar.mx',
    'admin@velocidaddeportiva.mx', 'gerente@velocidaddeportiva.mx', 'asociado@velocidaddeportiva.mx',
  ];

  for (const email of demoEmails) {
    const { data: profile } = await adminSb
      .from('profiles')
      .select('id, role, tenant_id')
      .eq('email', email)
      .single();

    gate(`Demo profile: ${email}`,
      !!profile,
      profile ? `role=${profile.role}` : 'MISSING');
  }

  // Total profile count is 7 (platform + 6 demo)
  const { count } = await adminSb
    .from('profiles')
    .select('*', { count: 'exact', head: true });

  gate('Total profile count',
    count === 7,
    `${count} profiles (expected 7)`);
}

// ══════════════════════════════════════════════════
// SECTION 3: Live authentication tests
// ══════════════════════════════════════════════════

async function verifyAuthentication() {
  console.log('\n═══ SECTION 3: Live Authentication ═══\n');

  const testUsers = [
    { email: 'platform@vialuce.com', expectedRole: 'vl_admin' },
    { email: 'admin@opticaluminar.mx', expectedRole: 'admin' },
    { email: 'gerente@opticaluminar.mx', expectedRole: 'manager' },
    { email: 'vendedor@opticaluminar.mx', expectedRole: 'viewer' },
    { email: 'admin@velocidaddeportiva.mx', expectedRole: 'admin' },
    { email: 'gerente@velocidaddeportiva.mx', expectedRole: 'manager' },
    { email: 'asociado@velocidaddeportiva.mx', expectedRole: 'viewer' },
  ];

  for (const user of testUsers) {
    const anonSb = createAnonClient(url, anonKey);

    // Sign in
    const { error: signInError } = await anonSb.auth.signInWithPassword({
      email: user.email,
      password: DEMO_PASSWORD,
    });

    if (signInError) {
      gate(`Auth: ${user.email}`, false, `Sign-in failed: ${signInError.message}`);
      continue;
    }

    // Fetch profile with RLS
    const { data: { user: authUser } } = await anonSb.auth.getUser();
    const { data: profile, error: profileError } = await anonSb
      .from('profiles')
      .select('*')
      .eq('auth_user_id', authUser!.id)
      .single();

    if (profileError || !profile) {
      gate(`Auth: ${user.email}`, false, `Profile fetch failed: ${profileError?.message}`);
      await anonSb.auth.signOut();
      continue;
    }

    gate(`Auth: ${user.email}`,
      profile.role === user.expectedRole,
      `role=${profile.role}, expected=${user.expectedRole}`);

    await anonSb.auth.signOut();
  }
}

// ══════════════════════════════════════════════════
// SECTION 4: Migration file exists
// ══════════════════════════════════════════════════

function verifyMigration() {
  console.log('\n═══ SECTION 4: Migration & Build ═══\n');

  const migrationPath = path.resolve(__dirname, '../supabase/migrations/005_platform_user_nullable_tenant.sql');
  const migrationExists = fs.existsSync(migrationPath);
  gate('Migration 005 exists', migrationExists,
    migrationExists ? 'Ready for Dashboard application' : 'MISSING');

  if (migrationExists) {
    const content = fs.readFileSync(migrationPath, 'utf-8');
    gate('Migration drops NOT NULL', content.includes('DROP NOT NULL'),
      content.includes('DROP NOT NULL') ? 'ALTER TABLE present' : 'Missing ALTER');
    gate('Migration adds VL admin policies',
      content.includes('vl_admin') && content.includes('CREATE POLICY'),
      'RLS policies for platform admin');
  }

  // Build artifact
  const nextDir = path.resolve(__dirname, '../.next');
  const buildExists = fs.existsSync(nextDir);
  gate('Build artifact exists', buildExists,
    buildExists ? '.next directory present' : 'No .next directory');
}

// ══════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════

async function main() {
  console.log('════════════════════════════════════════════');
  console.log('  CLT-HF027: Platform Profile Restoration  ');
  console.log('════════════════════════════════════════════');

  verifyCodePath();
  await verifyDatabaseState();
  await verifyAuthentication();
  verifyMigration();

  console.log('\n═══════════════════════════════════════');
  console.log(`  TOTAL: ${passed + failed} gates`);
  console.log(`  PASSED: ${passed}`);
  console.log(`  FAILED: ${failed}`);
  console.log(`  SCORE: ${Math.round((passed / (passed + failed)) * 100)}%`);
  console.log('═══════════════════════════════════════\n');

  if (failed > 0) {
    console.log('FAILED GATES:');
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`  ❌ ${r.gate}: ${r.detail}`);
    });
    console.log('');
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
