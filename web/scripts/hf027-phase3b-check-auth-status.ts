#!/usr/bin/env npx tsx
/**
 * HF-027 Phase 3b: Check auth user status and metadata for demo users
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

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { data: usersData } = await sb.auth.admin.listUsers();
  const users = usersData?.users || [];

  console.log('=== Auth User Status ===\n');
  for (const u of users) {
    console.log(`Email: ${u.email}`);
    console.log(`  ID: ${u.id}`);
    console.log(`  Created: ${u.created_at}`);
    console.log(`  Confirmed: ${u.email_confirmed_at ? 'YES (' + u.email_confirmed_at + ')' : 'NO'}`);
    console.log(`  Last sign in: ${u.last_sign_in_at || 'never'}`);
    console.log(`  App metadata: ${JSON.stringify(u.app_metadata)}`);
    console.log(`  User metadata: ${JSON.stringify(u.user_metadata)}`);
    console.log(`  Identities: ${u.identities?.map(i => i.provider).join(', ') || 'none'}`);
    console.log('');
  }

  // Try to update password for a demo user to test
  console.log('\n=== Testing password reset for admin@opticaluminar.mx ===');
  const demoUser = users.find(u => u.email === 'admin@opticaluminar.mx');
  if (demoUser) {
    const { data, error } = await sb.auth.admin.updateUserById(demoUser.id, {
      password: 'demo-password-VL1',
      email_confirm: true,
    });
    if (error) {
      console.log(`❌ Password reset failed: ${error.message}`);
    } else {
      console.log(`✅ Password reset + email confirmed for ${data.user.email}`);
    }
  }
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
