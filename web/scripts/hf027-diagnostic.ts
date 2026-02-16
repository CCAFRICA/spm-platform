#!/usr/bin/env npx tsx
/**
 * HF-027 Phase 0: Diagnostic
 */
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

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

async function main() {
  // 1. Find all auth users
  const { data: usersData } = await sb.auth.admin.listUsers();
  console.log('=== AUTH USERS ===');
  for (const u of (usersData?.users || [])) {
    console.log(`  ${u.id}  ${u.email}  created: ${u.created_at}`);
  }

  // 2. Check all profiles
  const { data: profiles, error: profErr } = await sb.from('profiles').select('*');
  console.log('\n=== ALL PROFILES ===');
  if (profErr) {
    console.log('PROFILES ERROR:', profErr);
  } else if (!profiles || profiles.length === 0) {
    console.log('  NO PROFILES FOUND');
  } else {
    for (const p of profiles) {
      console.log(`  ${p.id}  ${p.email}  scope=${p.scope_level}  tenant=${p.tenant_id}  name=${p.display_name}`);
    }
  }

  // 3. Check tenants
  const { data: tenants } = await sb.from('tenants').select('id, name, slug');
  console.log('\n=== TENANTS ===');
  for (const t of (tenants || [])) {
    console.log(`  ${t.id}  ${t.name}  slug=${t.slug}`);
  }

  // 4. Cross-reference: auth users without profiles
  const authUsers = usersData?.users || [];
  const profileIds = new Set((profiles || []).map(p => p.id));
  console.log('\n=== AUTH USERS MISSING PROFILES ===');
  let missingCount = 0;
  for (const u of authUsers) {
    if (!profileIds.has(u.id)) {
      console.log(`  MISSING: ${u.email} (${u.id})`);
      missingCount++;
    }
  }
  if (missingCount === 0) console.log('  None — all auth users have profiles');

  // 5. Profiles with dangling tenant_ids
  const tenantIds = new Set((tenants || []).map(t => t.id));
  console.log('\n=== PROFILES WITH INVALID TENANT_ID ===');
  let danglingCount = 0;
  for (const p of (profiles || [])) {
    if (p.tenant_id && !tenantIds.has(p.tenant_id)) {
      console.log(`  DANGLING: ${p.email} → tenant_id=${p.tenant_id} (not in tenants table)`);
      danglingCount++;
    }
  }
  if (danglingCount === 0) console.log('  None');
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
