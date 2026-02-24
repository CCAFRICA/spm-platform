import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const BATCH_ID = 'a1b49896-a759-4d1c-a5f4-65e634409eff';
const TENANT_ID = 'dfc1041e-7c39-4657-81e5-40b1cea5680c';
const PERIOD_ID = '30dbb4e9-d2d0-4f81-9b50-a6b9e44ba20c';

async function main() {
  // Check a sample result
  const { data: sample } = await sb.from('calculation_results')
    .select('entity_id, total_payout, components, metrics, metadata')
    .eq('batch_id', BATCH_ID)
    .limit(3);

  if (sample) {
    for (const s of sample) {
      console.log('entity_id:', s.entity_id);
      console.log('total_payout:', s.total_payout);
      console.log('metadata:', JSON.stringify(s.metadata));
      const comps = s.components as Array<Record<string, unknown>>;
      for (const c of comps) {
        console.log(`  ${c.name}: payout=${c.payout}`);
      }
      console.log('---');
    }
  }

  // Find the entity → employee mapping from committed_data
  const { data: viSample } = await sb.from('committed_data')
    .select('entity_id, row_data')
    .eq('tenant_id', TENANT_ID)
    .eq('period_id', PERIOD_ID)
    .eq('data_type', 'Base_Venta_Individual')
    .not('entity_id', 'is', null)
    .limit(3);

  if (viSample) {
    for (const s of viSample) {
      const rd = s.row_data as Record<string, unknown>;
      console.log(`entity_id=${s.entity_id}, num_empleado=${rd.num_empleado}, entityId=${rd.entityId}`);
    }
  }

  // Check entities table
  const { data: entities } = await sb.from('entities')
    .select('id, external_id, entity_data')
    .eq('tenant_id', TENANT_ID)
    .limit(3);

  if (entities) {
    for (const e of entities) {
      console.log(`entity: id=${e.id}, external_id=${e.external_id}`);
      const ed = e.entity_data as Record<string, unknown>;
      if (ed) console.log(`  num_empleado=${ed.num_empleado}, entityId=${ed.entityId}`);
    }
  }
}

main().catch(console.error);
