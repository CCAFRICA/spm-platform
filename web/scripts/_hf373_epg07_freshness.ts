// HF-373 EPG-0.7 read-only probe #3: summary_artifacts freshness vs last import per tenant.
import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const TENANTS: Array<[string, string]> = [
  ['VLTEST2', '5b078b52-55c9-4612-8f86-96038c198bfe'],
  ['Casa Diaz', '2d9979ba-5032-48a7-bccf-1928f3e6dadf'],
  ['Sabor', 'f7093bcc-e90b-4918-9680-69da7952dd65'],
  ['Test #A1', 'abb9da8d-d6d5-4ebc-af42-ebb9c972bd8b'],
  ['Mirasol', '972c8eb0-e3ae-4e4c-ad30-8b34804c893a'],
  ['BCL', 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'],
];

async function main() {
  for (const [name, tid] of TENANTS) {
    const { count: saCount } = await sb.from('summary_artifacts').select('*', { count: 'exact', head: true }).eq('tenant_id', tid);
    const { data: newest } = await sb.from('summary_artifacts').select('computed_at').eq('tenant_id', tid).order('computed_at', { ascending: false }).limit(1);
    const { data: newestCd } = await sb.from('committed_data').select('created_at').eq('tenant_id', tid).order('created_at', { ascending: false }).limit(1);
    console.log(`${name}: summary_artifacts=${saCount} newest_computed_at=${(newest?.[0] as any)?.computed_at ?? 'NONE'} newest_committed_data=${(newestCd?.[0] as any)?.created_at ?? 'NONE'}`);
  }
}

main().catch((e) => { console.error('PROBE FAILED:', e); process.exit(1); });
