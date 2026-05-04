import { createClient } from '@supabase/supabase-js';

const TENANT = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // import_batches
  const { data: batches } = await sb
    .from('import_batches')
    .select('id, row_count, file_hash_sha256, superseded_by, supersedes, created_at')
    .eq('tenant_id', TENANT)
    .order('created_at', { ascending: true });
  if (batches) {
    console.log(`[1] import_batches count=${batches.length}`);
    for (const b of batches) {
      const sha = (b.file_hash_sha256 as string).slice(0,12);
      const sup = b.superseded_by ? `superseded_by=${(b.superseded_by as string).slice(0,8)}` : 'operative';
      console.log(`    ${(b.id as string).slice(0,8)}  sha=${sha}  rows=${b.row_count}  ${sup}`);
    }
  }

  // committed_data data_type counts
  for (const dt of ['entity', 'transaction', 'reference', 'target', 'plan']) {
    const { count } = await sb
      .from('committed_data')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', TENANT)
      .eq('data_type', dt);
    if ((count ?? 0) > 0) console.log(`[2] data_type='${dt}': ${count}`);
  }

  // transaction source_date histogram + entity_id link rate
  const { data: txnRows } = await sb
    .from('committed_data')
    .select('source_date, entity_id, import_batch_id')
    .eq('tenant_id', TENANT)
    .eq('data_type', 'transaction');
  if (txnRows) {
    const dateHist = new Map<string, number>();
    let nullEntity = 0, linkedEntity = 0;
    const batchIds = new Set<string>();
    for (const r of txnRows) {
      const d = (r.source_date as string | null) ?? 'NULL';
      dateHist.set(d, (dateHist.get(d) ?? 0) + 1);
      if (r.entity_id) linkedEntity++; else nullEntity++;
      if (r.import_batch_id) batchIds.add(r.import_batch_id as string);
    }
    const sortedHist = Array.from(dateHist.entries()).sort((a,b) => a[0].localeCompare(b[0]));
    console.log('[3] txn source_date histogram:', sortedHist);
    console.log(`[4] txn entity_id: linked=${linkedEntity} null=${nullEntity}`);
    console.log(`[5] txn distinct batch ids: ${batchIds.size}`);
  }

  // structural_fingerprints
  const { data: fps } = await sb
    .from('structural_fingerprints')
    .select('fingerprint_hash, match_count, import_batch_id, source_file_sample, classification_result, created_at')
    .eq('tenant_id', TENANT)
    .order('created_at', { ascending: true });
  if (fps) {
    for (const f of fps) {
      const cls = (f.classification_result as { classification?: string } | null)?.classification ?? '?';
      const fk = f.import_batch_id ? (f.import_batch_id as string).slice(0,8) : 'null';
      console.log(`[6] FP ${(f.fingerprint_hash as string).slice(0,12)} cls=${cls} match_count=${f.match_count} fk=${fk} src=${f.source_file_sample}`);
    }
  }
}

main().catch(err => { console.error(err); process.exit(1); });
