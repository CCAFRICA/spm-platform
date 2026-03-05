import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const T = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

async function run() {
  const missing = ['2024-03', '2024-05', '2024-06', '2024-07'];

  const periods = missing.map(key => {
    const [y, m] = key.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    return {
      id: crypto.randomUUID(),
      tenant_id: T,
      label: `${MONTH_NAMES[m - 1]} ${y}`,
      period_type: 'monthly',
      status: 'open',
      start_date: `${y}-${String(m).padStart(2, '0')}-01`,
      end_date: `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
      canonical_key: key,
      metadata: { source: 'ob153_calculate' },
    };
  });

  const { error } = await sb.from('periods').insert(periods);
  if (error) {
    console.error('Insert error:', error.message);
    return;
  }

  console.log('Created:', periods.map(p => p.label).join(', '));
}

run();
