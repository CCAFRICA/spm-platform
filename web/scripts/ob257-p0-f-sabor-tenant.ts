/** OB-257 P0 discovery item 6 — resolve the Sabor tenant id + confirm financial feature flag. Read-only. */
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
const get = (k: string) => env.split('\n').find(l => l.startsWith(k + '='))?.slice(k.length + 1).trim() ?? '';
const sb = createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'));

async function main() {
  const { data, error } = await sb.from('tenants').select('id, name, features').ilike('name', '%sabor%');
  if (error) throw error;
  console.log(JSON.stringify(data, null, 2));
  // Which tenants have the financial feature on?
  const { data: all } = await sb.from('tenants').select('id, name, features');
  for (const t of all ?? []) {
    const f = (t.features ?? {}) as Record<string, unknown>;
    if (f.financial) console.log('financial-enabled:', t.id, t.name);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
