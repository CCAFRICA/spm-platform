// DIAG-080 (§3.3, read-only) — differential: why is datos data_type='entity' on VLTEST2 but 'transaction'
// on BCL? Probe processing_jobs classification output, structural_fingerprints (cached classification),
// committed_data data_type distribution + sample row_data, and entities.metadata. All read-only. SR-44.
//   from web/:  npx tsx scripts/_diag080_probe.ts
import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb: any = createClient(URL, KEY, { auth: { persistSession: false } });

const TENANTS = [
  { name: 'BCL (proven)', id: 'b1c2d3e4-aaaa-bbbb-cccc-111111111111' },
  { name: 'VLTEST2 (broken)', id: '5b078b52-55c9-4612-8f86-96038c198bfe' },
];

async function main() {
  console.log('=== DIAG-080 DIFFERENTIAL PROBE (read-only) ===');

  for (const t of TENANTS) {
    console.log(`\n############### ${t.name} ###############`);

    // 1. committed_data data_type distribution + entity_id presence (confirm §1).
    const { data: cd } = await sb.from('committed_data')
      .select('data_type, entity_id, period_id, import_batch_id')
      .eq('tenant_id', t.id).limit(5000);
    const dist: Record<string, { rows: number; withEntity: number; withPeriod: number; batches: Set<string> }> = {};
    for (const r of cd ?? []) {
      const k = r.data_type ?? 'null';
      dist[k] ??= { rows: 0, withEntity: 0, withPeriod: 0, batches: new Set() };
      dist[k].rows++; if (r.entity_id) dist[k].withEntity++; if (r.period_id) dist[k].withPeriod++;
      if (r.import_batch_id) dist[k].batches.add(r.import_batch_id);
    }
    console.log('committed_data by data_type:');
    for (const [k, v] of Object.entries(dist)) console.log(`  ${k.padEnd(12)} rows=${v.rows} withEntity=${v.withEntity} withPeriod=${v.withPeriod} batches=${v.batches.size}`);

    // 2. A sample row_data per data_type (column identity).
    for (const dt of Object.keys(dist)) {
      const { data: one } = await sb.from('committed_data').select('row_data, data_type, metadata').eq('tenant_id', t.id).eq('data_type', dt).limit(1);
      if (one?.[0]) {
        const cols = Object.keys(one[0].row_data ?? {});
        console.log(`  [${dt}] sample columns (${cols.length}): ${cols.join(', ')}`);
        // metadata.data_type / classification if present on the committed row
        const md = one[0].metadata ?? {};
        console.log(`  [${dt}] committed_data.metadata keys: ${Object.keys(md).join(', ')} | metadata.data_type=${md.data_type ?? md.classification ?? 'n/a'}`);
      }
    }

    // 3. entities.metadata sample (what got written as entity attributes).
    const { data: ents } = await sb.from('entities').select('external_id, entity_type, metadata').eq('tenant_id', t.id).limit(3);
    console.log(`entities (sample of ${ents?.length ?? 0}):`);
    for (const e of ents ?? []) console.log(`  ${e.external_id} type=${e.entity_type} metadata=${JSON.stringify(e.metadata)}`);

    // 4. import_batches: status + metadata.classification per batch (where the data_type decision is recorded).
    const { data: batches } = await sb.from('import_batches').select('id, file_name, status, metadata, content_unit_hash_sha256').eq('tenant_id', t.id).order('created_at', { ascending: false }).limit(8);
    console.log(`import_batches (recent ${batches?.length ?? 0}):`);
    for (const b of batches ?? []) {
      const m = b.metadata ?? {};
      console.log(`  ${(b.file_name ?? '').slice(0, 28).padEnd(28)} status=${b.status} classification=${m.classification ?? 'n/a'} source=${m.source ?? 'n/a'} hash=${(b.content_unit_hash_sha256 ?? '').slice(0, 10)}`);
    }
  }

  // 5. processing_jobs schema + classification output (adapt to real columns).
  console.log('\n############### processing_jobs ###############');
  const { data: pjOne } = await sb.from('processing_jobs').select('*').limit(1);
  if (pjOne?.[0]) console.log('processing_jobs columns:', Object.keys(pjOne[0]).join(', '));
  for (const t of TENANTS) {
    const { data: pj } = await sb.from('processing_jobs').select('*').eq('tenant_id', t.id).order('created_at', { ascending: false }).limit(4);
    console.log(`\n--- ${t.name} processing_jobs (${pj?.length ?? 0}) ---`);
    for (const j of pj ?? []) {
      // print the classification-relevant fields if present
      const rec: Record<string, unknown> = {};
      for (const k of ['file_name', 'status', 'recognition_tier', 'classification_result', 'created_at']) if (k in j) rec[k] = j[k];
      console.log(JSON.stringify(rec));
      // proposal / result blobs — show keys + any data_type/classification
      for (const blobKey of ['proposal', 'result', 'classification_result', 'metadata']) {
        if (j[blobKey] && typeof j[blobKey] === 'object') {
          const s = JSON.stringify(j[blobKey]);
          const dtMatch = s.match(/"(data_type|classification|confirmedClassification|data_nature)":\s*"[^"]*"/g);
          if (dtMatch) console.log(`    ${blobKey} data_type/classification mentions: ${[...new Set(dtMatch)].slice(0, 12).join(' ')}`);
        }
      }
    }
  }

  // 6. structural_fingerprints: does a cached fingerprint carry data_type for these tenants?
  console.log('\n############### structural_fingerprints (cached classification) ###############');
  const { data: fpOne, error: fpErr } = await sb.from('structural_fingerprints').select('*').limit(1);
  if (fpErr) console.log('structural_fingerprints:', fpErr.message);
  else if (fpOne?.[0]) {
    console.log('columns:', Object.keys(fpOne[0]).join(', '));
    for (const t of TENANTS) {
      const { data: fp } = await sb.from('structural_fingerprints').select('*').eq('tenant_id', t.id).limit(6);
      console.log(`\n--- ${t.name} fingerprints (${fp?.length ?? 0}) ---`);
      for (const f of fp ?? []) {
        const s = JSON.stringify(f);
        const dt = s.match(/"(data_type|classification|confirmedClassification|data_nature)":\s*"[^"]*"/g);
        console.log(`  hash=${(f.fingerprint_hash ?? f.content_hash ?? '').slice(0, 12)} cols=${f.column_count ?? f.columns?.length ?? '?'} ${dt ? '→ ' + [...new Set(dt)].slice(0, 8).join(' ') : '(no data_type field)'}`);
      }
    }
  }
  console.log('\n=== PROBE COMPLETE ===');
}
main().catch((e) => { console.error('[FATAL]', e instanceof Error ? e.message : e); process.exit(1); });
