/**
 * DIAG-004B: Quick check on current committed_data state after HF-140 re-import
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const TENANT_ID = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  // Fetch all committed_data
  let allRows: Array<{ source_date: string | null; import_batch_id: string | null; data_type: string | null; row_data: Record<string, unknown> | null }> = [];
  let offset = 0;
  while (true) {
    const { data: page } = await supabase
      .from('committed_data')
      .select('source_date, import_batch_id, data_type, row_data')
      .eq('tenant_id', TENANT_ID)
      .range(offset, offset + 999);
    if (!page || page.length === 0) break;
    allRows = allRows.concat(page);
    if (page.length < 1000) break;
    offset += 1000;
  }
  console.log(`Total committed_data: ${allRows.length}`);

  // Group by source_date
  const dateMap = new Map<string, number>();
  for (const r of allRows) {
    const d = r.source_date ? r.source_date.substring(0, 10) : 'NULL';
    dateMap.set(d, (dateMap.get(d) || 0) + 1);
  }
  console.log('\nSource_date distribution:');
  for (const [d, c] of Array.from(dateMap.entries()).sort()) console.log(`  ${d}: ${c} rows`);

  // Group by import_batch_id
  const { data: batches } = await supabase
    .from('import_batches')
    .select('id, file_name, created_at, row_count')
    .eq('tenant_id', TENANT_ID)
    .order('created_at', { ascending: true });

  const ibMap = new Map<string, string>();
  if (batches) for (const b of batches) ibMap.set(b.id, b.file_name || 'unknown');

  console.log('\nPer-batch breakdown:');
  const batchAgg = new Map<string, { rows: number; dates: Map<string, number>; periodos: Map<string, number> }>();
  for (const r of allRows) {
    const bid = r.import_batch_id || 'NULL';
    if (!batchAgg.has(bid)) batchAgg.set(bid, { rows: 0, dates: new Map(), periodos: new Map() });
    const agg = batchAgg.get(bid)!;
    agg.rows++;
    const d = r.source_date ? r.source_date.substring(0, 10) : 'NULL';
    agg.dates.set(d, (agg.dates.get(d) || 0) + 1);
    // Check Periodo in row_data
    const rd = r.row_data as Record<string, unknown> | null;
    const periodo = rd?.Periodo ? String(rd.Periodo).substring(0, 10) : 'none';
    agg.periodos.set(periodo, (agg.periodos.get(periodo) || 0) + 1);
  }

  for (const [bid, agg] of Array.from(batchAgg.entries())) {
    const fname = ibMap.get(bid) || bid.substring(0, 8);
    const dates = Array.from(agg.dates.entries()).map(([d, c]) => `${d}:${c}`).join(', ');
    const periodos = Array.from(agg.periodos.entries()).map(([p, c]) => `${p}:${c}`).join(', ');
    console.log(`\n  Batch: ${fname}`);
    console.log(`    rows: ${agg.rows}`);
    console.log(`    source_dates: ${dates}`);
    console.log(`    Periodo values: ${periodos}`);
  }

  // Specifically check March rows
  console.log('\n\nMarch analysis:');
  const marRows = allRows.filter(r => {
    const rd = r.row_data as Record<string, unknown> | null;
    const p = rd?.Periodo ? String(rd.Periodo) : '';
    return p.includes('2026-03');
  });
  console.log(`Rows with Periodo containing '2026-03': ${marRows.length}`);
  if (marRows.length > 0) {
    for (const r of marRows.slice(0, 3)) {
      const rd = r.row_data as Record<string, unknown> | null;
      console.log(`  source_date=${r.source_date?.substring(0, 10)} Periodo=${rd?.Periodo} batch=${ibMap.get(r.import_batch_id || '') || r.import_batch_id?.substring(0, 8)}`);
    }
  }

  // Check Feb rows — are there > 85?
  const febRows = allRows.filter(r => r.source_date && r.source_date.startsWith('2026-02'));
  console.log(`\nRows with source_date in 2026-02: ${febRows.length}`);
  if (febRows.length > 85) {
    // Show the Periodo values for these rows
    const periodos = new Map<string, number>();
    for (const r of febRows) {
      const rd = r.row_data as Record<string, unknown> | null;
      const p = rd?.Periodo ? String(rd.Periodo).substring(0, 10) : 'none';
      periodos.set(p, (periodos.get(p) || 0) + 1);
    }
    console.log('  Periodo values in Feb source_date rows:');
    for (const [p, c] of Array.from(periodos.entries())) {
      console.log(`    Periodo=${p}: ${c} rows`);
    }
  }
}

main().catch(console.error);
