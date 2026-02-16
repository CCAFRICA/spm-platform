#!/usr/bin/env npx tsx
/**
 * HF-027: Alter profiles.tenant_id to nullable + add VL admin RLS policies
 * Tries multiple approaches to execute DDL against hosted Supabase.
 */
import * as fs from 'fs';
import * as path from 'path';

const envPath = path.resolve(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^#=]+)=(.+)$/);
  if (match) process.env[match[1].trim()] = match[2].trim();
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const SQL_STATEMENTS = [
  // 1. Make tenant_id nullable
  'ALTER TABLE profiles ALTER COLUMN tenant_id DROP NOT NULL;',
  // 2. Platform admins can read their own profile
  `CREATE POLICY "profiles_select_own" ON profiles FOR SELECT USING (auth_user_id = auth.uid());`,
  // 3. Platform admins (vl_admin role) can see all tenants
  `CREATE POLICY "tenants_select_vl_admin" ON tenants FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'vl_admin'));`,
  // 4. Platform admins can see all profiles across tenants
  `CREATE POLICY "profiles_select_vl_admin" ON profiles FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'vl_admin'));`,
];

async function tryPgMeta(): Promise<boolean> {
  // Supabase pg-meta SQL endpoint
  const pgMetaUrl = `${url}/pg/query`;
  try {
    for (const sql of SQL_STATEMENTS) {
      const resp = await fetch(pgMetaUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ query: sql }),
      });
      if (!resp.ok) {
        console.log(`pg-meta failed for: ${sql.slice(0, 60)}... Status: ${resp.status}`);
        return false;
      }
    }
    return true;
  } catch (e) {
    console.log('pg-meta endpoint not available:', (e as Error).message);
    return false;
  }
}

async function tryRpcExecSql(): Promise<boolean> {
  // Try calling an exec_sql RPC function (might exist on some setups)
  const rpcUrl = `${url}/rest/v1/rpc/exec_sql`;
  try {
    for (const sql of SQL_STATEMENTS) {
      const resp = await fetch(rpcUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({ sql }),
      });
      if (!resp.ok) {
        const text = await resp.text();
        console.log(`rpc/exec_sql failed: ${resp.status} ${text.slice(0, 200)}`);
        return false;
      }
    }
    return true;
  } catch (e) {
    console.log('rpc/exec_sql not available:', (e as Error).message);
    return false;
  }
}

async function trySqlEndpoint(): Promise<boolean> {
  // Try the /sql endpoint (available in some Supabase versions)
  const sqlUrl = `${url}/sql`;
  try {
    for (const sql of SQL_STATEMENTS) {
      const resp = await fetch(sqlUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ query: sql }),
      });
      if (!resp.ok) {
        console.log(`/sql endpoint failed: ${resp.status}`);
        return false;
      }
    }
    return true;
  } catch (e) {
    console.log('/sql endpoint not available:', (e as Error).message);
    return false;
  }
}

async function main() {
  console.log('=== Attempting schema alteration via multiple endpoints ===\n');

  // Try approach 1: pg-meta
  console.log('Trying pg-meta endpoint...');
  if (await tryPgMeta()) {
    console.log('✅ Schema altered via pg-meta!');
    return;
  }

  // Try approach 2: rpc/exec_sql
  console.log('\nTrying rpc/exec_sql endpoint...');
  if (await tryRpcExecSql()) {
    console.log('✅ Schema altered via rpc/exec_sql!');
    return;
  }

  // Try approach 3: /sql
  console.log('\nTrying /sql endpoint...');
  if (await trySqlEndpoint()) {
    console.log('✅ Schema altered via /sql!');
    return;
  }

  console.log('\n❌ All automated approaches failed.');
  console.log('\n📋 Manual SQL to run in Supabase Dashboard SQL Editor:');
  console.log('─'.repeat(60));
  for (const sql of SQL_STATEMENTS) {
    console.log(sql);
  }
  console.log('─'.repeat(60));
  console.log('\nFalling back to pragmatic approach: assign platform user to first tenant.');
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
