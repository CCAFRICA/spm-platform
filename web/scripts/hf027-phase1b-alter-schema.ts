#!/usr/bin/env npx tsx
/**
 * HF-027 Phase 1b: Alter profiles.tenant_id to allow NULL
 *
 * Platform users are cross-tenant — they should have tenant_id = NULL.
 * The current schema has a NOT NULL constraint that must be relaxed.
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
  console.log('=== HF-027 Phase 1b: Alter profiles.tenant_id to NULLABLE ===\n');

  // Use rpc to execute raw SQL via the service role
  const { error } = await sb.rpc('exec_sql', {
    sql: 'ALTER TABLE profiles ALTER COLUMN tenant_id DROP NOT NULL;'
  });

  if (error) {
    console.log('rpc exec_sql failed (expected if function does not exist):', error.message);
    console.log('\nTrying direct SQL via REST...');

    // Alternative: use the Supabase management API or run SQL directly
    // Since we have the service role key, we can use the PostgREST endpoint
    // But PostgREST doesn't support DDL. Need to use the SQL endpoint.

    // Try the Supabase SQL API (available on hosted Supabase)
    const sqlUrl = `${url}/rest/v1/rpc/exec_sql`;
    const resp = await fetch(sqlUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': key,
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify({ sql: 'ALTER TABLE profiles ALTER COLUMN tenant_id DROP NOT NULL;' }),
    });

    if (!resp.ok) {
      console.log('Direct SQL also failed. Status:', resp.status);
      console.log('Response:', await resp.text());
      console.log('\n⚠️  Cannot alter schema via API. Will need to use Supabase Dashboard SQL editor or migration.');
      console.log('SQL to run: ALTER TABLE profiles ALTER COLUMN tenant_id DROP NOT NULL;');
      process.exit(1);
    }

    console.log('✅ Schema altered via direct SQL');
    return;
  }

  console.log('✅ profiles.tenant_id is now NULLABLE');
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
