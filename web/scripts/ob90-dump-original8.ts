/**
 * OB-90: Dump fields for the 8 original optical mismatches to understand their data
 */
import { createClient } from '@supabase/supabase-js';

const TENANT_ID = 'dfc1041e-7c39-4657-81e5-40b1cea5680c';
const PERIOD_ID = '30dbb4e9-d2d0-4f81-9b50-a6b9e44ba20c';
const BATCH_ID = '09f067fe-75a8-4031-9d29-68c15fb06144';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const ORIGINAL_8 = ['90234331', '98487841', '90002548', '90217069', '90119066', '97217484', '90326285', '92466559'];

async function main() {
  // Get entity_ids from results
  const results: Array<{
    entity_id: string;
    metadata: Record<string, unknown>;
    components: unknown[];
  }> = [];
  let page = 0;
  while (true) {
    const { data } = await sb.from('calculation_results')
      .select('entity_id, metadata, components')
      .eq('batch_id', BATCH_ID)
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    results.push(...(data as typeof results));
    if (data.length < 1000) break;
    page++;
  }

  for (const empId of ORIGINAL_8) {
    const match = results.find(r => {
      const meta = r.metadata as Record<string, unknown>;
      return String(meta?.externalId ?? '') === empId;
    });

    if (!match) { console.log(`${empId}: NOT FOUND`); continue; }

    console.log(`\n=== Employee ${empId} (entity=${match.entity_id}) ===`);

    // Show optical component trace
    const meta = match.metadata as Record<string, unknown>;
    const traces = (meta?.intentTraces as unknown[]) || [];
    const trace = traces[0] as Record<string, unknown> | undefined;
    if (trace?.lookupResolution) {
      const lr = trace.lookupResolution as Record<string, unknown>;
      console.log(`  rowBoundary: ${JSON.stringify(lr.rowBoundaryMatched)}`);
      console.log(`  colBoundary: ${JSON.stringify(lr.columnBoundaryMatched)}`);
    }

    // Fetch Base_Venta_Individual rows
    const { data: viRows } = await sb.from('committed_data')
      .select('row_data')
      .eq('tenant_id', TENANT_ID)
      .eq('period_id', PERIOD_ID)
      .eq('entity_id', match.entity_id)
      .eq('data_type', 'Base_Venta_Individual');

    if (viRows) {
      console.log(`  Base_Venta_Individual rows: ${viRows.length}`);
      for (const r of viRows) {
        const rd = r.row_data as Record<string, unknown>;
        console.log(`    Cumplimiento=${rd.Cumplimiento}, attainment=${rd.attainment}, optical_achievement_percentage=${rd.optical_achievement_percentage}, optical_sales_amount=${rd.optical_sales_amount}, Venta=${rd.Venta_Individual}, Meta=${rd.Meta_Individual}, store=${rd.num_tienda}`);
      }
    }
  }
}

main().catch(console.error);
