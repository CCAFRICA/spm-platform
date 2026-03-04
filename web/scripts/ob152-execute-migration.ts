import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
  // Read the migration SQL
  const sqlPath = path.join(__dirname, '../supabase/migrations/018_decision92_temporal_binding.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  // Split into individual statements (skip empty and comments-only)
  const statements = sql
    .split(/;\s*$/m)
    .map(s => s.trim())
    .filter(s => s && !s.startsWith('--'));

  console.log(`Executing ${statements.length} statements...`);

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    const preview = stmt.substring(0, 80).replace(/\n/g, ' ');
    try {
      const { error } = await sb.rpc('exec_sql', { sql_text: stmt });
      if (error) {
        // Try via direct query if RPC not available
        console.log(`Statement ${i + 1}: RPC unavailable, will need SQL Editor execution`);
        console.log(`  ${preview}...`);
      } else {
        console.log(`Statement ${i + 1}: OK — ${preview}...`);
      }
    } catch (e) {
      console.log(`Statement ${i + 1}: Need SQL Editor — ${preview}...`);
    }
  }

  // Verify results
  console.log('\n=== VERIFICATION ===');

  // Check source_date column
  const { data: cd, error: cdErr } = await sb.from('committed_data').select('source_date').limit(1);
  console.log('source_date column:', cdErr ? `FAIL: ${cdErr.message}` : 'EXISTS');

  // Check new tables
  for (const table of ['reference_data', 'reference_items', 'alias_registry']) {
    const { error: e } = await sb.from(table).select('id').limit(1);
    console.log(`${table}:`, e ? `FAIL: ${e.message}` : 'EXISTS');
  }

  // LAB regression
  const tid = 'a630404c-0777-4f6d-b760-b8a190ecd63c';
  const { data: r } = await sb.from('calculation_results').select('total_payout').eq('tenant_id', tid);
  const total = (r || []).reduce((s, x) => s + Number(x.total_payout), 0);
  console.log(`\nLAB regression: ${(r || []).length} results, $${total.toFixed(2)}`);
  console.log((r || []).length === 268 && Math.abs(total - 8498311.77) < 0.10 ? 'LAB: PASS' : '*** LAB: FAIL ***');
}

run();
