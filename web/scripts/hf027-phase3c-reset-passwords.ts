#!/usr/bin/env npx tsx
/**
 * HF-027 Phase 3c: Reset all demo user passwords
 *
 * Auth users created via admin API may lack email identities.
 * This script resets passwords and confirms emails for all demo users.
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

const DEMO_PASSWORD = 'demo-password-VL1';

const DEMO_USERS = [
  { email: 'admin@opticaluminar.mx', id: '28d0f742-7346-4c96-9bfd-e648d9cd3364' },
  { email: 'gerente@opticaluminar.mx', id: '99d22f6c-074d-4b10-bdca-3575a498e2cc' },
  { email: 'vendedor@opticaluminar.mx', id: 'ac03e07b-3dbc-4b9e-816f-b293f7945c3b' },
  { email: 'admin@velocidaddeportiva.mx', id: '1c869082-a765-41d6-b5af-f5bb2ce2ef10' },
  { email: 'gerente@velocidaddeportiva.mx', id: 'c2f688c6-ddc2-4c21-a0ea-f2e00eb6390b' },
  { email: 'asociado@velocidaddeportiva.mx', id: '893aae24-7f5f-4c4b-a1e0-936ac0782e7d' },
];

async function main() {
  console.log('=== HF-027 Phase 3c: Reset Demo User Passwords ===\n');

  for (const user of DEMO_USERS) {
    const { data, error } = await sb.auth.admin.updateUserById(user.id, {
      password: DEMO_PASSWORD,
      email_confirm: true,
    });

    if (error) {
      console.log(`❌ ${user.email}: ${error.message}`);
    } else {
      console.log(`✅ ${user.email}: password reset + email confirmed`);
    }
  }

  console.log('\n✅ All passwords set to:', DEMO_PASSWORD);
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
