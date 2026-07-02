import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

const JOB = '66551591-9376-4b77-8850-db1be4af85f5';

function findKeys(obj: unknown, keyName: string, path = '', hits: string[] = [], depth = 0): string[] {
  if (depth > 8 || obj == null || typeof obj !== 'object') return hits;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const p = path ? `${path}.${k}` : k;
    if (k === keyName) hits.push(p);
    findKeys(v, keyName, p, hits, depth + 1);
  }
  return hits;
}

async function main() {
  const { data, error } = await sb.from('processing_jobs')
    .select('id, file_name, proposal, classification_result, metadata')
    .eq('id', JOB).single();
  if (error) { console.log('err', error.message); return; }
  console.log('file:', data.file_name);
  // Where does headerComprehension / interpretations live?
  for (const col of ['proposal', 'classification_result', 'metadata'] as const) {
    const v = (data as Record<string, unknown>)[col];
    console.log(`\n=== ${col}: type=${typeof v}, topKeys=${v && typeof v === 'object' ? JSON.stringify(Object.keys(v as object)).slice(0, 500) : String(v).slice(0, 200)}`);
    const hits = findKeys(v, 'headerComprehension');
    console.log(`  headerComprehension paths:`, hits);
    const hits2 = findKeys(v, 'interpretations');
    console.log(`  interpretations paths:`, hits2.slice(0, 10));
  }
}
main().catch(e => { console.error(e); process.exit(1); });
