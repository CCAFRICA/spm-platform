// OB-213 Phase 0C — schema pre-read: which backing tables exist, their columns, and row counts.
// Read-only (FP-49: service-role row-introspection, no psql/exec_sql). Run from web/:
//   set -a && source .env.local && set +a && npx tsx scripts/ob213-schema-check.ts
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

// directive 0C set + the two HALT-relevant tables (approval_requests, calculation_batches)
const tables = [
  'disputes', 'audit_logs', 'approval_requests',
  'calculation_results', 'entity_period_outcomes', 'calculation_traces',
  'reconciliation_sessions', 'classification_signals', 'calculation_batches',
];

async function main() {
  console.log('================ OB-213 Phase 0C — SCHEMA CHECK ================');
  for (const t of tables) {
    const probe = await sb.from(t).select('*').limit(1);
    if (probe.error) {
      console.log(`  ${t.padEnd(24)} MISSING/ERROR — ${probe.error.code ?? ''} ${probe.error.message}`);
      continue;
    }
    const { count } = await sb.from(t).select('*', { count: 'exact', head: true });
    const cols = probe.data?.[0] ? Object.keys(probe.data[0]).sort() : null;
    console.log(`  ${t.padEnd(24)} EXISTS rows=${count ?? '?'}${cols ? ` cols(${cols.length})=[${cols.join(', ')}]` : ' (0 rows — columns not introspectable via row sample)'}`);
  }
  console.log('================ END ================');
}
main().catch((e) => { console.error('SCRIPT ERROR:', e); process.exit(1); });
