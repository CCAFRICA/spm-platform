/**
 * DIAG-063 / A4 — Multi-tab XLSX (READ-ONLY)
 *
 * Q1: classification_signals — files whose signals span multiple distinct sheet_name values.
 * Q2: committed_data — recent import_batches whose committed rows record >1 distinct
 *     metadata->>source_sheet value (sheet names discovered structurally from the DB itself;
 *     never printed — labeled sheet_1..n; counts + UUIDs only).
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  // ── Q1: classification_signals (sheet_name + source_file_name columns) ──
  const { count: sigTotal, error: e0 } = await supabase
    .from('classification_signals')
    .select('id', { count: 'exact', head: true })
    .not('sheet_name', 'is', null);
  if (e0) throw e0;
  console.log(`[Q1] classification_signals rows with sheet_name NOT NULL: ${sigTotal}`);

  // Paginate (cap 10k) — group by (tenant_id, source_file_name), count distinct sheet_name
  const groups = new Map<string, { tenant: string; sheets: Set<string>; signals: number }>();
  const PAGE = 1000;
  let fetched = 0;
  for (let from = 0; from < Math.min(sigTotal ?? 0, 10000); from += PAGE) {
    const { data, error } = await supabase
      .from('classification_signals')
      .select('tenant_id, source_file_name, sheet_name')
      .not('sheet_name', 'is', null)
      .order('created_at', { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    for (const r of data ?? []) {
      const key = `${r.tenant_id}::${r.source_file_name ?? '(null)'}`;
      const g = groups.get(key) ?? { tenant: r.tenant_id as string, sheets: new Set<string>(), signals: 0 };
      g.sheets.add(r.sheet_name as string);
      g.signals += 1;
      groups.set(key, g);
    }
    fetched += data?.length ?? 0;
    if (!data || data.length < PAGE) break;
  }
  console.log(`[Q1] signals fetched for grouping: ${fetched} (cap 10000)`);
  const multi = Array.from(groups.values()).filter(g => g.sheets.size > 1);
  console.log(`[Q1] distinct (tenant, source_file) groups: ${groups.size}`);
  console.log(`[Q1] groups with >=2 distinct sheet_name values: ${multi.length}`);
  multi.sort((a, b) => b.sheets.size - a.sheets.size);
  multi.slice(0, 10).forEach((g, i) => {
    console.log(`[Q1]   multi_file_${i + 1}: tenant=${g.tenant} distinct_sheets=${g.sheets.size} signals=${g.signals}`);
  });

  // ── Q2: committed_data per-batch distinct metadata->>source_sheet ──
  const { data: batches, error: e1 } = await supabase
    .from('import_batches')
    .select('id, tenant_id, status, row_count, created_at')
    .order('created_at', { ascending: false })
    .limit(12);
  if (e1) throw e1;
  console.log(`\n[Q2] recent import_batches inspected: ${batches?.length ?? 0}`);

  for (const b of batches ?? []) {
    // discover distinct source_sheet values structurally (iterative .neq exclusion, cap 12)
    const found: string[] = [];
    for (let i = 0; i < 12; i++) {
      let q = supabase
        .from('committed_data')
        .select('metadata')
        .eq('import_batch_id', b.id)
        .not('metadata->>source_sheet', 'is', null)
        .limit(1);
      for (const v of found) q = q.neq('metadata->>source_sheet', v);
      const { data, error } = await q;
      if (error) throw error;
      const v = (data?.[0]?.metadata as Record<string, unknown> | undefined)?.source_sheet;
      if (typeof v !== 'string') break;
      found.push(v);
    }
    const perSheet: number[] = [];
    for (const v of found) {
      const { count } = await supabase
        .from('committed_data')
        .select('id', { count: 'exact', head: true })
        .eq('import_batch_id', b.id)
        .eq('metadata->>source_sheet', v);
      perSheet.push(count ?? 0);
    }
    const { count: nullSheet } = await supabase
      .from('committed_data')
      .select('id', { count: 'exact', head: true })
      .eq('import_batch_id', b.id)
      .is('metadata->>source_sheet', null);
    const sheetSummary = perSheet.map((c, i) => `sheet_${i + 1}=${c}`).join(' ');
    console.log(
      `[Q2] batch=${b.id} tenant=${b.tenant_id} status=${b.status} row_count=${b.row_count} created=${b.created_at}` +
      `\n[Q2]   distinct_source_sheets=${found.length} ${sheetSummary} rows_without_source_sheet=${nullSheet}`,
    );
  }
}

main().catch((err) => { console.error('FATAL', err); process.exit(1); });
