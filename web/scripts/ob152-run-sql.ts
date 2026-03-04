import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function executeSql(sql: string, label: string) {
  // Use fetch to call the PostgREST /rpc endpoint directly doesn't work for DDL
  // Instead, use Supabase's management API or direct SQL
  // For DDL, we need to use the pg_query approach or the management API

  // Try the approach of using the Supabase REST API with the service role
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY!,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({})
  });

  return { error: 'DDL requires SQL Editor or pg connection' };
}

async function run() {
  // Split migration into individual SQL statements and execute each
  const sqlPath = path.join(__dirname, '../supabase/migrations/018_decision92_temporal_binding.sql');
  const fullSql = fs.readFileSync(sqlPath, 'utf8');

  // Execute statements one at a time via fetch to the pg endpoint
  const projectRef = 'bayqxeiltnpjrvflksfa';
  const pgUrl = `https://${projectRef}.supabase.co/pg/query`;

  // Individual DDL statements
  const stmts = [
    "ALTER TABLE committed_data ADD COLUMN IF NOT EXISTS source_date DATE",
    "CREATE INDEX IF NOT EXISTS idx_committed_data_tenant_source_date ON committed_data (tenant_id, source_date) WHERE source_date IS NOT NULL",
    "CREATE INDEX IF NOT EXISTS idx_committed_data_tenant_entity_source_date ON committed_data (tenant_id, entity_id, source_date) WHERE entity_id IS NOT NULL AND source_date IS NOT NULL",
    `CREATE TABLE IF NOT EXISTS reference_data (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id),
      reference_type TEXT NOT NULL,
      name TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'active',
      key_field TEXT,
      schema_definition JSONB DEFAULT '{}',
      import_batch_id UUID REFERENCES import_batches(id),
      metadata JSONB DEFAULT '{}',
      created_by UUID REFERENCES profiles(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (tenant_id, name, version)
    )`,
    `CREATE TABLE IF NOT EXISTS reference_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id),
      reference_data_id UUID NOT NULL REFERENCES reference_data(id) ON DELETE CASCADE,
      external_key TEXT NOT NULL,
      display_name TEXT,
      category TEXT,
      attributes JSONB DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (reference_data_id, external_key)
    )`,
    `CREATE TABLE IF NOT EXISTS alias_registry (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id),
      reference_item_id UUID NOT NULL REFERENCES reference_items(id) ON DELETE CASCADE,
      alias_text TEXT NOT NULL,
      alias_normalized TEXT NOT NULL,
      confidence NUMERIC(5,4) NOT NULL DEFAULT 1.0,
      confirmation_count INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'import',
      scope TEXT DEFAULT 'global',
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (tenant_id, reference_item_id, alias_normalized)
    )`,
  ];

  // Try executing via Management API
  const mgmtUrl = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;

  for (let i = 0; i < stmts.length; i++) {
    const preview = stmts[i].substring(0, 60).replace(/\n/g, ' ');
    try {
      const resp = await fetch(mgmtUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.SUPABASE_ACCESS_TOKEN || ''}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: stmts[i] }),
      });

      if (resp.ok) {
        console.log(`${i + 1}/${stmts.length}: OK — ${preview}...`);
      } else {
        const text = await resp.text();
        console.log(`${i + 1}/${stmts.length}: HTTP ${resp.status} — ${preview}...`);
        if (text) console.log(`   ${text.substring(0, 200)}`);
      }
    } catch (e) {
      console.log(`${i + 1}/${stmts.length}: ERROR — ${preview}...`);
      console.log(`   ${String(e).substring(0, 200)}`);
    }
  }

  // Verify
  console.log('\n=== VERIFICATION ===');
  const { data: cd, error: cdErr } = await sb.from('committed_data').select('source_date').limit(1);
  console.log('source_date column:', cdErr ? `FAIL: ${cdErr.message}` : 'EXISTS');

  for (const table of ['reference_data', 'reference_items', 'alias_registry']) {
    const { error: e } = await sb.from(table).select('id').limit(1);
    console.log(`${table}:`, e ? `FAIL: ${e.message}` : 'EXISTS');
  }
}

run();
