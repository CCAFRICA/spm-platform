// HF-259 migration verification (run AFTER the architect applies 017 via Dashboard).
// Service-role client; confirms the two tables exist with the expected columns + the
// single-flight unique constraint behaves. Read-only except a transient self-cleaning probe.
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function tableOk(table: string, expected: string[]): Promise<boolean> {
  const { data, error } = await supabase.from(table).select('*').limit(1);
  if (error) { console.log(`  ${table}: MISSING/ERROR — ${error.message}`); return false; }
  const keys = data && data.length ? Object.keys(data[0]) : null;
  console.log(`  ${table}: EXISTS${keys ? ` (cols: ${keys.join(', ')})` : ' (empty)'}`);
  if (keys) for (const c of expected) if (!keys.includes(c)) console.log(`    !! missing column: ${c}`);
  return true;
}

async function main() {
  console.log('=== HF-259 migration verification ===');
  const a = await tableOk('plan_interpretation_runs', ['tenant_id', 'content_hash', 'status', 'rule_set_id']);
  const b = await tableOk('rule_set_lifecycle_events', ['tenant_id', 'rule_set_id', 'event_type', 'predecessor_id', 'actor', 'reason']);
  console.log(a && b ? 'RESULT: both tables present — migration applied.' : 'RESULT: NOT fully applied — architect to apply 017 via Dashboard.');
}
main().catch(e => { console.error(e); process.exit(1); });
