// HF-337 P0 DB probes (read-only). Binding-store substrate (P0.3), fingerprint emission (P0.4),
// MIR precondition (P0.5), resolver-input comprehension fields (P0.6).
// Run: npx tsx --env-file=.env.local scripts/_hf337-p0-probe.ts
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
/* eslint-disable @typescript-eslint/no-explicit-any */
const MIR = '972c8eb0-e3ae-4e4c-ad30-8b34804c893a';
const SABOR = 'f7093bcc-e90b-4918-9680-69da7952dd65';

async function cols(table: string) {
  const { data, error } = await sb.from(table).select('*').limit(1);
  if (error) return `MISSING/ERROR -> ${error.message}`;
  return data && data.length ? `EXISTS cols: ${Object.keys(data[0]).join(', ')}` : 'EXISTS (empty)';
}

async function main() {
  console.log('=== HF-337 P0 probes ===\n');

  console.log('P0.3 binding-store substrate candidates:');
  for (const t of ['structural_fingerprints', 'foundational_patterns', 'domain_patterns', 'synaptic_density']) {
    console.log(`  ${t}: ${await cols(t)}`);
  }

  console.log('\nP0.4 structural_fingerprint_hash emission:');
  const { data: ia } = await sb.from('intelligence_artifacts').select('structural_fingerprint_hash, shape_description').not('structural_fingerprint_hash', 'is', null).limit(2);
  console.log(`  intelligence_artifacts.structural_fingerprint_hash sample: ${JSON.stringify(ia?.[0] ?? null)}`);
  const { data: ca0 } = await sb.from('comprehension_artifacts').select('*').limit(1);
  console.log(`  comprehension_artifacts columns: ${ca0 && ca0.length ? Object.keys(ca0[0]).join(', ') : '(empty)'}`);
  // structural_fingerprints rows for Sabor?
  const sf = await sb.from('structural_fingerprints').select('*').eq('tenant_id', SABOR).limit(2);
  console.log(`  structural_fingerprints for Sabor: ${sf.error ? sf.error.message : `${sf.data?.length ?? 0} rows${sf.data?.[0] ? ' | cols: ' + Object.keys(sf.data[0]).join(', ') : ''}`}`);

  console.log('\nP0.5 MIR precondition:');
  const { count: mirCd } = await sb.from('committed_data').select('id', { count: 'exact', head: true }).eq('tenant_id', MIR);
  const { count: mirRs } = await sb.from('rule_sets').select('id', { count: 'exact', head: true }).eq('tenant_id', MIR);
  const { data: mirSample } = await sb.from('committed_data').select('data_type, row_data').eq('tenant_id', MIR).limit(1);
  const mirFields = mirSample?.[0]?.row_data ? Object.keys(mirSample[0].row_data as any) : [];
  console.log(`  MIR committed_data=${mirCd} rule_sets=${mirRs} | sample data_type=${mirSample?.[0]?.data_type} fields(${mirFields.length})=[${mirFields.slice(0, 12).join(', ')}]`);

  console.log('\nP0.6 resolver-input (comprehension_artifacts free-form fields) — Sabor sample:');
  const { data: caS } = await sb.from('comprehension_artifacts').select('field_name, characterization, data_nature, relationships, aggregation_behavior, identifies, display_label, aggregation_method').eq('tenant_id', SABOR).limit(3);
  for (const r of (caS ?? []) as any[]) console.log(`  - ${r.field_name}: char="${String(r.characterization).slice(0, 60)}" nature=${r.data_nature ? 'y' : 'n'} rel=${r.relationships ? 'y' : 'n'} agg_beh=${r.aggregation_behavior ? 'y' : 'n'} identifies=${r.identifies ?? 'null'} label=${r.display_label} method=${r.aggregation_method}`);
  const { count: caSCount } = await sb.from('comprehension_artifacts').select('id', { count: 'exact', head: true }).eq('tenant_id', SABOR);
  console.log(`  Sabor comprehension_artifacts count=${caSCount}`);
  console.log('\n=== done ===');
}
main().catch((e) => { console.error(e); process.exit(1); });
