/**
 * Trace: Where does store_optical_sales=99,915,603 come from?
 * Check entity_id NULL distribution and store data grouping for store 388.
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const TENANT = '9b2bb4e3-6828-4451-b3fb-dc384509494f';

async function check() {
  const { data: periods } = await supabase
    .from('periods')
    .select('id')
    .eq('tenant_id', TENANT)
    .gte('start_date', '2024-01-01')
    .lt('start_date', '2024-02-01');
  const periodId = periods?.[0]?.id;

  // Check entity_id NULL distribution per data_type
  console.log('=== entity_id NULL distribution ===\n');

  const PAGE_SIZE = 1000;
  const allData: Array<{ entity_id: string | null; data_type: string; row_data: unknown }> = [];
  let page = 0;
  while (true) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data } = await supabase
      .from('committed_data')
      .select('entity_id, data_type, row_data')
      .eq('tenant_id', TENANT)
      .eq('period_id', periodId!)
      .range(from, to);
    if (!data || data.length === 0) break;
    allData.push(...data);
    if (data.length < PAGE_SIZE) break;
    page++;
  }
  console.log(`Total committed_data rows: ${allData.length}`);

  // Count by data_type and entity_id presence
  const stats = new Map<string, { total: number; withEntity: number; withoutEntity: number }>();
  for (const row of allData) {
    const type = row.data_type;
    if (!stats.has(type)) stats.set(type, { total: 0, withEntity: 0, withoutEntity: 0 });
    const s = stats.get(type)!;
    s.total++;
    if (row.entity_id) s.withEntity++;
    else s.withoutEntity++;
  }
  for (const [type, s] of Array.from(stats.entries())) {
    console.log(`  ${type}: total=${s.total}, withEntity=${s.withEntity}, withoutEntity=${s.withoutEntity}`);
  }

  // Simulate the store data grouping from run-calculation.ts
  console.log('\n=== Store data grouping simulation (entity_id falsy) ===\n');

  const storeData = new Map<string | number, Array<{ data_type: string; row_data: unknown }>>();
  for (const row of allData) {
    if (!row.entity_id) {
      const rd = row.row_data as Record<string, unknown> | null;
      const storeKey = (rd?.['storeId'] ?? rd?.['num_tienda'] ?? rd?.['No_Tienda'] ?? rd?.['Tienda']) as string | number | undefined;
      if (storeKey !== undefined && storeKey !== null) {
        if (!storeData.has(storeKey)) storeData.set(storeKey, []);
        storeData.get(storeKey)!.push({ data_type: row.data_type, row_data: row.row_data });
      }
    }
  }

  console.log(`Stores with data: ${storeData.size}`);
  const store388 = storeData.get(388) ?? storeData.get('388') ?? [];
  console.log(`Store 388 rows (numeric key): ${(storeData.get(388) ?? []).length}`);
  console.log(`Store 388 rows (string key): ${(storeData.get('388') ?? []).length}`);

  // Show what sheets store 388 has
  const store388Types = new Map<string, number>();
  for (const row of store388) {
    store388Types.set(row.data_type, (store388Types.get(row.data_type) ?? 0) + 1);
  }
  for (const [type, count] of Array.from(store388Types.entries())) {
    console.log(`  Store 388 - ${type}: ${count} rows`);
  }

  // Aggregate store 388 amount fields
  let totalAmount = 0;
  for (const row of store388) {
    const rd = row.row_data as Record<string, unknown>;
    const amt = Number(rd?.['amount'] ?? 0);
    totalAmount += amt;
  }
  console.log(`\nStore 388 aggregated "amount": ${totalAmount}`);

  // Check: how does aggregateMetrics work across all store 388 rows?
  const aggregated: Record<string, number> = {};
  for (const row of store388) {
    const rd = row.row_data as Record<string, unknown>;
    for (const [key, value] of Object.entries(rd)) {
      if (typeof value === 'number') {
        aggregated[key] = (aggregated[key] || 0) + value;
      }
    }
  }
  console.log(`\nFull aggregated metrics for store 388:`);
  for (const [key, value] of Object.entries(aggregated).sort((a, b) => b[1] - a[1])) {
    if (Math.abs(value) > 100) {
      console.log(`  ${key}: ${value}`);
    }
  }
}

check().catch(console.error);
