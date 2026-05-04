import { createClient } from '@supabase/supabase-js';

const TENANT = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // import_batches state
  const { data: batches } = await sb
    .from('import_batches')
    .select('id, file_name, file_type, status, row_count, file_hash_sha256, superseded_by, supersedes, metadata, created_at')
    .eq('tenant_id', TENANT)
    .order('created_at', { ascending: true });
  if (batches) {
    console.log(`[1] import_batches count=${batches.length}`);
    for (const b of batches) {
      const sha = (b.file_hash_sha256 as string).slice(0, 12);
      const sup = b.superseded_by ? `superseded_by=${(b.superseded_by as string).slice(0,8)}` : 'operative';
      const cls = ((b.metadata as Record<string, unknown> | null)?.classification as string | undefined) ?? '?';
      console.log(`    ${(b.id as string).slice(0,8)}  sha=${sha}  rows=${b.row_count}  status=${b.status}  cls=${cls}  ${sup}`);
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

  // rule_sets state
  const { data: ruleSets } = await sb
    .from('rule_sets')
    .select('id, name, status, version, components, created_at, superseded_by, supersedes')
    .eq('tenant_id', TENANT)
    .order('created_at', { ascending: true });
  if (ruleSets) {
    console.log(`[3] rule_sets count=${ruleSets.length}`);
    for (const rs of ruleSets) {
      const compCount = Array.isArray(rs.components) ? (rs.components as unknown[]).length : 'n/a';
      const sup = rs.superseded_by ? `superseded_by=${(rs.superseded_by as string).slice(0,8)}` : 'operative';
      console.log(`    ${(rs.id as string).slice(0,8)}  name="${rs.name}"  status=${rs.status}  v=${rs.version}  components=${compCount}  ${sup}`);
    }
    if (ruleSets.length === 1) {
      console.log(`[3a] rule_set components sample:`,
        JSON.stringify(((ruleSets[0].components as unknown) as unknown[])?.slice(0,3) ?? null, null, 2));
    }
  }

  // structural_fingerprints
  const { data: fps } = await sb
    .from('structural_fingerprints')
    .select('fingerprint_hash, match_count, import_batch_id, source_file_sample, classification_result, created_at')
    .eq('tenant_id', TENANT)
    .order('created_at', { ascending: true });
  if (fps) {
    console.log(`[4] structural_fingerprints count=${fps.length}`);
    for (const f of fps) {
      const cls = (f.classification_result as { classification?: string } | null)?.classification ?? '?';
      const fk = f.import_batch_id ? (f.import_batch_id as string).slice(0,8) : 'null';
      console.log(`    FP ${(f.fingerprint_hash as string).slice(0,12)} cls=${cls} match_count=${f.match_count} fk=${fk} src=${f.source_file_sample}`);
    }
  }
}

main().catch(err => { console.error(err); process.exit(1); });
