#!/usr/bin/env npx tsx
/**
 * HF-027 Phase 0b: Check auth_user_id in profiles
 */
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

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
  // Get full profile data including auth_user_id
  const { data: profiles } = await sb.from('profiles').select('id, auth_user_id, email, tenant_id, scope_level, display_name, role, capabilities, status');
  console.log('=== FULL PROFILES ===');
  for (const p of (profiles || [])) {
    console.log(JSON.stringify(p));
  }

  // Get auth users for cross-reference
  const { data: usersData } = await sb.auth.admin.listUsers();
  const authMap = new Map((usersData?.users || []).map(u => [u.email, u.id]));

  console.log('\n=== PROFILE AUTH_USER_ID MATCH ===');
  for (const p of (profiles || [])) {
    const authId = authMap.get(p.email);
    const idMatch = p.id === authId;
    const authUserIdMatch = p.auth_user_id === authId;
    console.log(`  ${p.email}: id=${idMatch ? 'MATCH' : 'MISMATCH'} auth_user_id=${authUserIdMatch ? 'MATCH' : 'MISMATCH'}`);
    if (!idMatch) console.log(`    profile.id=${p.id} vs auth.id=${authId}`);
    if (!authUserIdMatch) console.log(`    profile.auth_user_id=${p.auth_user_id} vs auth.id=${authId}`);
  }
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
