/**
 * OB-154 Phase 3A: Create periods for January, February, March 2024
 */
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const T = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

const PERIODS = [
  { label: 'January 2024', start: '2024-01-01', end: '2024-01-31', key: '2024-01' },
  { label: 'February 2024', start: '2024-02-01', end: '2024-02-29', key: '2024-02' },
  { label: 'March 2024', start: '2024-03-01', end: '2024-03-31', key: '2024-03' },
];

async function run() {
  console.log('=== Create Periods ===\n');

  for (const p of PERIODS) {
    const { error } = await sb.from('periods').insert({
      tenant_id: T,
      label: p.label,
      period_type: 'monthly',
      status: 'open',
      start_date: p.start,
      end_date: p.end,
      canonical_key: p.key,
      metadata: {},
    });
    if (error) {
      console.error(`Failed to create ${p.label}: ${error.message}`);
    } else {
      console.log(`Created: ${p.label} (${p.start} to ${p.end})`);
    }
  }

  const { data } = await sb.from('periods')
    .select('id, label, start_date, end_date')
    .eq('tenant_id', T)
    .order('start_date');
  console.log('\nPeriods:');
  for (const p of data || []) {
    console.log(`  ${p.label}: ${p.start_date} to ${p.end_date} (${p.id.substring(0, 8)}...)`);
  }
  console.log(`\nPG-8: Periods created: ${(data?.length ?? 0) >= 1 ? 'PASS' : 'FAIL'}`);
}

run().catch(console.error);
