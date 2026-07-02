// HF-373 EPG-0.1 read-only probe: VLTEST2 rule_sets shape + components verbatim
import { config } from 'dotenv'; config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const VLTEST2 = '5b078b52-55c9-4612-8f86-96038c198bfe';

async function main() {
  const { data: rows, error } = await sb.from('rule_sets').select('*').eq('tenant_id', VLTEST2);
  if (error) { console.error('ERR', error.message); return; }
  console.log('rule_sets count:', rows?.length);
  if (!rows?.length) return;
  console.log('COLUMNS:', Object.keys(rows[0]).join(', '));
  for (const r of rows) {
    console.log('\n=== RULE_SET', r.id, '| name:', r.name, '| status:', (r as any).status, '| created_at:', (r as any).created_at, '| updated_at:', (r as any).updated_at);
    const comps = (r as any).components;
    const compsStr = JSON.stringify(comps);
    console.log('components typeof:', Array.isArray(comps) ? 'array' : typeof comps, '| top-level keys:', comps && !Array.isArray(comps) ? Object.keys(comps).join(',') : '(array len ' + (comps?.length ?? 0) + ')');
    console.log('components JSON length:', compsStr?.length);
    console.log('input_bindings:', JSON.stringify((r as any).input_bindings)?.slice(0, 2000));
  }
}
main();
