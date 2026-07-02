import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

const VLTEST2 = '5b078b52-55c9-4612-8f86-96038c198bfe';

async function main() {
  const { data: ents } = await sb.from('entities').select('created_at').eq('tenant_id', VLTEST2).order('created_at', { ascending: true }).limit(3);
  const { data: entsLast } = await sb.from('entities').select('created_at').eq('tenant_id', VLTEST2).order('created_at', { ascending: false }).limit(1);
  console.log('entities first created_at:', ents?.map(e => e.created_at));
  console.log('entities last created_at:', entsLast?.map(e => e.created_at));
  const { data: cd } = await sb.from('committed_data').select('created_at').eq('tenant_id', VLTEST2).eq('data_type', 'entity').order('created_at', { ascending: true }).limit(1);
  const { data: cdLast } = await sb.from('committed_data').select('created_at').eq('tenant_id', VLTEST2).eq('data_type', 'entity').order('created_at', { ascending: false }).limit(1);
  console.log('roster committed_data first created_at:', cd?.map(r => r.created_at));
  console.log('roster committed_data last created_at:', cdLast?.map(r => r.created_at));
}
main().catch(e => { console.error(e); process.exit(1); });
