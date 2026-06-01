import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const tenantId = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';

  const { data: sample, error } = await supabase
    .from('committed_data')
    .select('*')
    .eq('tenant_id', tenantId)
    .limit(5);

  if (error) { console.error('Error:', error); return; }

  console.log('=== committed_data sample row count:', sample?.length);
  if (sample && sample.length > 0) {
    const row = sample[0];
    console.log('=== Top-level keys:', Object.keys(row));

    for (const [key, value] of Object.entries(row)) {
      const t = typeof value;
      if (t === 'object' && value !== null) {
        const subKeys = Object.keys(value as object);
        console.log(`  ${key}: object with ${subKeys.length} keys: [${subKeys.join(', ')}]`);
      } else {
        console.log(`  ${key}: ${t} = ${JSON.stringify(value)?.substring(0, 100)}`);
      }
    }

    const dataField = Object.entries(row).find(([k, v]) => typeof v === 'object' && v !== null && !Array.isArray(v) && k !== 'id');
    if (dataField) {
      console.log(`\n=== Inspecting JSONB field "${dataField[0]}" across all sample rows:`);
      const allKeys = new Set<string>();
      for (const r of sample) {
        const obj = (r as any)[dataField[0]];
        if (obj && typeof obj === 'object') {
          Object.keys(obj).forEach(k => allKeys.add(k));
        }
      }
      console.log('Union of all keys:', [...allKeys].sort());
    }
  }

  const { data: batches } = await supabase
    .from('committed_data')
    .select('data_type, import_batch_id')
    .eq('tenant_id', tenantId);

  if (batches) {
    const byType = new Map<string, number>();
    const byBatch = new Map<string, number>();
    for (const b of batches) {
      byType.set(b.data_type, (byType.get(b.data_type) || 0) + 1);
      byBatch.set(b.import_batch_id, (byBatch.get(b.import_batch_id) || 0) + 1);
    }
    console.log('\n=== Rows by data_type:', Object.fromEntries(byType));
    console.log('=== Rows by import_batch_id:', Object.fromEntries(byBatch));
  }
}

main();
