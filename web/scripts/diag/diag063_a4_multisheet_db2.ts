/**
 * DIAG-063 / A4 — Multi-tab XLSX, part 2 (READ-ONLY)
 *
 * SCI path facts from code: one import_batch PER content unit (sheet/tab);
 * sheet identity lives in committed_data.row_data->>_sheetName; the source file
 * link is import_batches.file_hash_sha256 (column NOT in SCHEMA_REFERENCE_LIVE.md
 * — divergence check included).
 *
 * Q3: group recent import_batches by (tenant_id, file_hash_sha256) — files that
 *     yielded MULTIPLE batches (= multiple content units/sheets). Counts + UUIDs +
 *     truncated hashes only.
 * Q4: recent batches — distinct row_data->>_sheetName values per batch (values
 *     discovered structurally, never printed; labeled tab_1..n).
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  // ── Q3: import_batches grouped by source file hash ──
  const { data: batches, error: e0 } = await supabase
    .from('import_batches')
    .select('id, tenant_id, file_type, status, row_count, created_at, file_hash_sha256')
    .order('created_at', { ascending: false })
    .limit(300);
  if (e0) {
    console.log(`[Q3] file_hash_sha256 select error (schema divergence?): ${e0.message}`);
    return;
  }
  console.log(`[Q3] import_batches fetched: ${batches?.length ?? 0} (file_hash_sha256 column EXISTS — diverges from SCHEMA_REFERENCE_LIVE.md 11-column listing)`);

  const byFile = new Map<string, { tenant: string; hash: string | null; ids: string[]; rows: number; first: string; last: string }>();
  for (const b of batches ?? []) {
    if (!b.file_hash_sha256) continue;
    const key = `${b.tenant_id}::${b.file_hash_sha256}`;
    const g = byFile.get(key) ?? { tenant: b.tenant_id as string, hash: b.file_hash_sha256 as string, ids: [], rows: 0, first: b.created_at as string, last: b.created_at as string };
    g.ids.push(b.id as string);
    g.rows += (b.row_count as number) ?? 0;
    if (b.created_at < g.first) g.first = b.created_at as string;
    if (b.created_at > g.last) g.last = b.created_at as string;
    byFile.set(key, g);
  }
  const multiUnit = Array.from(byFile.values()).filter(g => g.ids.length > 1);
  console.log(`[Q3] distinct (tenant, file_hash) groups with hash present: ${byFile.size}`);
  console.log(`[Q3] groups with >1 batch (multi content-unit source files): ${multiUnit.length}`);
  multiUnit.sort((a, b) => b.ids.length - a.ids.length);
  multiUnit.slice(0, 6).forEach((g, i) => {
    console.log(`[Q3] multi_unit_file_${i + 1}: tenant=${g.tenant} file_hash=${g.hash!.slice(0, 12)}… batches=${g.ids.length} total_rows=${g.rows} window=${g.first} → ${g.last}`);
    g.ids.slice(0, 8).forEach(id => console.log(`[Q3]     batch=${id}`));
  });

  // ── Q4: distinct row_data->>_sheetName per recent batch ──
  const recent = (batches ?? []).slice(0, 8);
  console.log(`\n[Q4] recent batches inspected for row_data->>_sheetName: ${recent.length}`);
  for (const b of recent) {
    const found: string[] = [];
    for (let i = 0; i < 12; i++) {
      let q = supabase
        .from('committed_data')
        .select('row_data')
        .eq('import_batch_id', b.id)
        .not('row_data->>_sheetName', 'is', null)
        .limit(1);
      for (const v of found) q = q.neq('row_data->>_sheetName', v);
      const { data, error } = await q;
      if (error) throw error;
      const v = (data?.[0]?.row_data as Record<string, unknown> | undefined)?._sheetName;
      if (typeof v !== 'string') break;
      found.push(v);
    }
    const perTab: number[] = [];
    for (const v of found) {
      const { count } = await supabase
        .from('committed_data')
        .select('id', { count: 'exact', head: true })
        .eq('import_batch_id', b.id)
        .eq('row_data->>_sheetName', v);
      perTab.push(count ?? 0);
    }
    const tabSummary = perTab.map((c, i) => `tab_${i + 1}=${c}`).join(' ');
    console.log(`[Q4] batch=${b.id} file_type=${b.file_type} status=${b.status} row_count=${b.row_count} distinct_sheetName_values=${found.length} ${tabSummary}`);
  }
}

main().catch((err) => { console.error('FATAL', err); process.exit(1); });
