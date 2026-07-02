// HF-373 EPG-0.1 read-only probe: DAG reference fields + committed_data shape + signals
import { config } from 'dotenv'; config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const VLTEST2 = '5b078b52-55c9-4612-8f86-96038c198bfe';
const RS = '91f822b1-186e-419b-9627-64d801fe323f';

function collectRefs(n: unknown, out: Set<string>) {
  if (!n || typeof n !== 'object') return;
  const node = n as Record<string, unknown>;
  if (node.prime === 'reference' && typeof node.field === 'string') out.add(node.field as string);
  for (const k of Object.keys(node)) collectRefs(node[k], out);
}

async function main() {
  // 1. All DAG reference fields per component
  const { data: rsRows } = await sb.from('rule_sets').select('components').eq('id', RS);
  const variants = (rsRows![0] as any).components.variants as any[];
  for (const v of variants) {
    for (const c of v.components) {
      const refs = new Set<string>();
      collectRefs(c.calculationIntent, refs);
      console.log(`[refs] variant=${v.variantId} comp="${c.name}" -> ${Array.from(refs).join(', ') || '(none)'}`);
      if (c.metadata?.rate_matrix) console.log(`   rate_matrix keys: ${Object.keys(c.metadata.rate_matrix).join(',')}`);
    }
  }

  // 2. classification_signals: comprehension:plan_interpretation for this tenant
  const { data: sig, error: sigErr } = await sb.from('classification_signals')
    .select('id, signal_type, rule_set_id, confidence, created_at, signal_value')
    .eq('tenant_id', VLTEST2)
    .eq('signal_type', 'comprehension:plan_interpretation')
    .order('created_at', { ascending: false })
    .limit(20);
  if (sigErr) console.error('sig ERR', sigErr.message);
  console.log(`\n[signals] comprehension:plan_interpretation count(limit20): ${sig?.length}`);
  for (const s of sig ?? []) {
    console.log(` - id=${s.id} rule_set_id=${s.rule_set_id} conf=${s.confidence} created=${s.created_at}`);
    console.log(`   signal_value: ${JSON.stringify(s.signal_value).slice(0, 900)}`);
  }

  // 3. committed_data: introspect one row + per data_type sample
  const { data: cdOne } = await sb.from('committed_data').select('*').eq('tenant_id', VLTEST2).limit(1);
  if (cdOne?.length) {
    console.log('\n[committed_data] COLUMNS:', Object.keys(cdOne[0]).join(', '));
  } else { console.log('\n[committed_data] NO ROWS'); }

  // distinct data_types via sampling batches
  const { data: batches } = await sb.from('import_batches').select('id, status, source_file, created_at, metadata').eq('tenant_id', VLTEST2).order('created_at', { ascending: false });
  console.log(`\n[import_batches] count: ${batches?.length}`);
  for (const b of (batches ?? []).slice(0, 20)) {
    console.log(` - ${b.id} status=${b.status} file=${(b as any).source_file} created=${b.created_at}`);
  }
}
main();
