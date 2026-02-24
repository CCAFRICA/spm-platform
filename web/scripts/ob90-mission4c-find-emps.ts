/**
 * OB-90 Mission 4C: Find the 4 problem employees in engine results
 */
import { createClient } from '@supabase/supabase-js';

const TENANT_ID = 'dfc1041e-7c39-4657-81e5-40b1cea5680c';
const BATCH_ID = 'ca74e12f-c259-4691-a8e3-c7750d7cde1c';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const PROBLEM_EMPS = ['90309983', '90137090', '90339803', '90236492'];

async function main() {
  console.log('=== Finding 4 problem employees ===\n');

  // Search all results for these employee numbers in metadata
  const results: Array<{
    entity_id: string;
    total_payout: number;
    components: unknown[];
    metadata: Record<string, unknown>;
  }> = [];
  let page = 0;
  while (true) {
    const { data } = await sb.from('calculation_results')
      .select('entity_id, total_payout, components, metadata')
      .eq('batch_id', BATCH_ID)
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    results.push(...(data as typeof results));
    if (data.length < 1000) break;
    page++;
  }

  for (const empId of PROBLEM_EMPS) {
    const match = results.find(r => {
      const meta = r.metadata as Record<string, unknown>;
      return String(meta?.externalId ?? '') === empId || String(meta?.entityName ?? '') === empId;
    });

    if (!match) {
      console.log(`${empId}: NOT FOUND in results`);
      continue;
    }

    const meta = match.metadata as Record<string, unknown>;
    console.log(`\n--- ${empId} ---`);
    console.log(`  entity_id: ${match.entity_id}`);
    console.log(`  externalId: ${meta.externalId}`);
    console.log(`  storeId: ${meta.storeId}`);
    console.log(`  role: ${meta.role}`);
    console.log(`  certified: ${meta.certified}`);

    const comps = match.components as Array<Record<string, unknown>>;
    const optical = comps[0];
    console.log(`  Optical payout: ${optical?.payout}`);

    const traces = (meta?.intentTraces as unknown[]) || [];
    const trace = traces[0] as Record<string, unknown> | undefined;
    if (trace) {
      console.log(`  resolvedMetrics: ${JSON.stringify(trace.resolvedMetrics)}`);
      const lr = trace.lookupResolution as Record<string, unknown> | undefined;
      if (lr) {
        console.log(`  rowBoundary: ${JSON.stringify(lr.rowBoundaryMatched)}`);
        console.log(`  colBoundary: ${JSON.stringify(lr.columnBoundaryMatched)}`);
        console.log(`  rawValue: ${lr.rawValue}`);
      }
    }

    // Now look at committed_data for this entity_id
    const { data: viRows } = await sb.from('committed_data')
      .select('row_data')
      .eq('tenant_id', TENANT_ID)
      .eq('entity_id', match.entity_id)
      .eq('data_type', 'Base_Venta_Individual');

    if (viRows?.length) {
      for (const r of viRows) {
        const rd = r.row_data as Record<string, unknown>;
        console.log(`  committed_data:`);
        console.log(`    Cumplimiento: ${rd.Cumplimiento}`);
        console.log(`    Meta_Individual: ${rd.Meta_Individual}`);
        console.log(`    Venta_Individual: ${rd.Venta_Individual}`);
        console.log(`    optical_sales_amount: ${rd.optical_sales_amount}`);
      }
    } else {
      console.log('  No Base_Venta_Individual rows');

      // Check if there are any committed_data rows at all
      const { data: anyData } = await sb.from('committed_data')
        .select('data_type, row_data')
        .eq('tenant_id', TENANT_ID)
        .eq('entity_id', match.entity_id)
        .limit(5);

      if (anyData?.length) {
        console.log(`  Has ${anyData.length} rows of types: ${anyData.map(d => d.data_type).join(', ')}`);
        for (const d of anyData) {
          const rd = d.row_data as Record<string, unknown>;
          console.log(`    ${d.data_type}: Cumplimiento=${rd.Cumplimiento}, num_empleado=${rd.num_empleado}`);
        }
      } else {
        console.log('  NO committed_data rows at all for this entity_id');
      }
    }
  }
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
