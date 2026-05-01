// OB-197 Phase 0 diagnostic — live state of classification_signals via Supabase service role.
// Provides 0A and 0B evidence equivalent to psql commands when psql is unavailable.

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function section(title) {
  console.log(`\n${'='.repeat(72)}\n${title}\n${'='.repeat(72)}`);
}

async function main() {
  // 0A.1 — Schema columns (sample-row key inspection; psql \d equivalent for column names)
  section('0A.1 — classification_signals columns (key inspection)');
  const { data: rows, error } = await supabase
    .from('classification_signals')
    .select('*')
    .limit(1);
  if (error) {
    console.log(`ERROR sampling classification_signals: ${error.message}`);
    process.exit(1);
  }
  const cols = rows && rows.length ? Object.keys(rows[0]).sort() : [];
  console.log(`Total columns: ${cols.length}`);
  for (const c of cols) console.log(`  - ${c}`);

  // 0A.1b — calculation_run_id presence (HALT trigger)
  const hasRunId = cols.includes('calculation_run_id');
  console.log(`\ncalculation_run_id present? ${hasRunId} (HALT if true)`);

  // 0A.2 — signal_type GROUP BY COUNT
  section('0A.2 — signal_type distribution');
  const { data: allRows, error: e2 } = await supabase
    .from('classification_signals')
    .select('signal_type');
  if (e2) {
    console.log(`ERROR: ${e2.message}`);
    process.exit(1);
  }
  const dist = {};
  for (const r of allRows) {
    dist[r.signal_type] = (dist[r.signal_type] || 0) + 1;
  }
  for (const [t, c] of Object.entries(dist).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${t}: ${c}`);
  }

  const expected = new Set([
    'sci:classification_outcome_v2',
    'training:plan_interpretation',
    'sci:cost_event',
  ]);
  const unexpected = Object.keys(dist).filter((t) => !expected.has(t));
  console.log(
    `\nUnexpected signal_types (HALT if non-empty): ${
      unexpected.length === 0 ? 'none' : JSON.stringify(unexpected)
    }`
  );

  // 0A.3 — total row count
  section('0A.3 — total row count');
  const { count, error: e3 } = await supabase
    .from('classification_signals')
    .select('*', { count: 'exact', head: true });
  if (e3) {
    console.log(`ERROR: ${e3.message}`);
    process.exit(1);
  }
  console.log(`rows: ${count}`);

  // 0A.4 — existing CHECK constraints (best-effort via pg_constraint via REST, won't work
  // without exec_sql; report as deferred and let Phase 1C verification handle post-migration).
  section('0A.4 — existing CHECK constraints (NOTE)');
  console.log(
    'Cannot enumerate pg_constraint via Supabase JS client without exec_sql RPC.'
  );
  console.log('Phase 1C verification will check for new constraint name post-migration.');
}

main().catch((e) => {
  console.error('Unhandled:', e.message);
  process.exit(1);
});
