/**
 * OB-90: Dump ALL row_data fields for the 4 problem employees
 */
import { createClient } from '@supabase/supabase-js';

const TENANT_ID = 'dfc1041e-7c39-4657-81e5-40b1cea5680c';
const PERIOD_ID = '30dbb4e9-d2d0-4f81-9b50-a6b9e44ba20c';
const BATCH_ID = 'ca74e12f-c259-4691-a8e3-c7750d7cde1c';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Map externalId → entity_id from results
async function main() {
  // First get entity_ids from results
  const PROBLEM_EMPS = ['90309983', '90137090', '90339803', '90236492'];

  const results: Array<{
    entity_id: string;
    metadata: Record<string, unknown>;
  }> = [];
  let page = 0;
  while (true) {
    const { data } = await sb.from('calculation_results')
      .select('entity_id, metadata')
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
      return String(meta?.externalId ?? '') === empId;
    });

    if (!match) { console.log(`${empId}: NOT FOUND`); continue; }

    console.log(`\n=== Employee ${empId} (entity=${match.entity_id}) ===`);

    // Fetch ALL committed_data rows for this entity
    const { data: rows } = await sb.from('committed_data')
      .select('data_type, row_data')
      .eq('tenant_id', TENANT_ID)
      .eq('period_id', PERIOD_ID)
      .eq('entity_id', match.entity_id);

    if (rows) {
      for (const row of rows) {
        console.log(`\n  data_type: ${row.data_type}`);
        const rd = row.row_data as Record<string, unknown>;
        const keys = Object.keys(rd).sort();
        for (const k of keys) {
          console.log(`    ${k}: ${rd[k]}`);
        }
      }
    }
  }
}

main().catch(console.error);
