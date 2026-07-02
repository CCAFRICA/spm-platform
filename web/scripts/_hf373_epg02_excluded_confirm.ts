/** HF-373 EPG-0.2 probe 3 (READ-ONLY): confirm included/excluded sets + period dates + raw excluded-entity row. */
import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);
const VLTEST2 = '5b078b52-55c9-4612-8f86-96038c198bfe';
const BATCH = 'c5f04eac-003c-4ae7-a85a-4da7fe7b1b7c'; // latest, 2026-07-02T01:05

async function main() {
  const { data: ents } = await sb.from('entities')
    .select('id, external_id, display_name, metadata')
    .eq('tenant_id', VLTEST2);
  const byId = new Map((ents ?? []).map(e => [e.id, e]));

  const { data: res, error } = await sb.from('calculation_results')
    .select('entity_id, total_payout')
    .eq('tenant_id', VLTEST2).eq('batch_id', BATCH);
  if (error) console.log('ERR', error.message);
  const included = new Set((res ?? []).map(r => r.entity_id));
  console.log(`INCLUDED (${included.size}):`);
  for (const r of res ?? []) {
    const e = byId.get(r.entity_id);
    console.log(`  ${e?.external_id} role=${JSON.stringify((e?.metadata as any)?.role)} payout=${r.total_payout}`);
  }
  const excluded = (ents ?? []).filter(e => !included.has(e.id));
  const exRoles = new Map<string, number>();
  for (const e of excluded) { const rl = String((e.metadata as any)?.role); exRoles.set(rl, (exRoles.get(rl) ?? 0) + 1); }
  console.log(`EXCLUDED (${excluded.length}) role distribution: ${JSON.stringify(Object.fromEntries(exRoles))}`);
  console.log(`  first 10 excluded: ${excluded.slice(0, 10).map(e => e.external_id).join(', ')}`);

  // period end_date for the batch's period + the PES period
  const { data: batchRow } = await sb.from('calculation_batches').select('period_id, created_at').eq('id', BATCH).single();
  const { data: periods } = await sb.from('periods')
    .select('id, canonical_key, start_date, end_date')
    .eq('tenant_id', VLTEST2);
  for (const p of periods ?? []) {
    const mark = p.id === batchRow?.period_id ? '  <-- batch period' : '';
    console.log(`period ${p.id} key=${p.canonical_key} start=${p.start_date} end=${p.end_date}${mark}`);
  }

  // one raw transaction row for an excluded Ejecutivo entity (token provenance for the live log tokens)
  const exSample = excluded.find(e => (e.metadata as any)?.role === 'Ejecutivo');
  if (exSample) {
    console.log(`\nsample excluded entity: ${exSample.external_id} "${exSample.display_name}" id=${exSample.id}`);
    // rows resolving to it via FK
    const { data: fkRows } = await sb.from('committed_data')
      .select('data_type, row_data, metadata, entity_id')
      .eq('tenant_id', VLTEST2).eq('entity_id', exSample.id).limit(2);
    for (const r of fkRows ?? []) console.log(`  FK row dt=${r.data_type} row_data=${JSON.stringify(r.row_data)} meta.entity_id_field=${JSON.stringify((r.metadata as any)?.entity_id_field)}`);
    // rows resolving via value match on any column = external_id (transaction rows)
    const { data: txnRows } = await sb.from('committed_data')
      .select('data_type, row_data, metadata')
      .eq('tenant_id', VLTEST2).eq('data_type', 'transaction').limit(2000);
    const mine = (txnRows ?? []).filter(r => Object.values(r.row_data as any).some(v => String(v).trim() === exSample.external_id));
    console.log(`  transaction rows value-matching ${exSample.external_id}: ${mine.length}`);
    for (const r of mine.slice(0, 2)) console.log(`  TXN row_data=${JSON.stringify(r.row_data)} meta.entity_id_field=${JSON.stringify((r.metadata as any)?.entity_id_field)}`);
  }
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
