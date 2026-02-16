#!/usr/bin/env npx tsx
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
  // Get one profile row to see actual columns
  const { data, error } = await sb.from('profiles').select('*').limit(1);
  if (error) {
    console.log('ERROR:', error);
    return;
  }
  if (data && data.length > 0) {
    console.log('=== ACTUAL COLUMNS IN PROFILES ===');
    console.log(Object.keys(data[0]).join(', '));
    console.log('\n=== SAMPLE ROW ===');
    console.log(JSON.stringify(data[0], null, 2));
  } else {
    console.log('NO PROFILES AT ALL');
  }

  // Also get all profiles with just * to see what IDs exist
  const { data: allProfiles } = await sb.from('profiles').select('*');
  console.log('\n=== ALL PROFILES (' + (allProfiles?.length || 0) + ') ===');
  for (const p of (allProfiles || [])) {
    console.log(`  id=${p.id}  email=${p.email}  tenant_id=${p.tenant_id}  role=${p.role}  scope_level=${p.scope_level}`);
  }
}

main();
