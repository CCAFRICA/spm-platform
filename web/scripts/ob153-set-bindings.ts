import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const RULE_SET_IDS = [
  '05c30b36-09e7-4648-8418-e48c8cc1ff55',
  '7eaa30b0-1f8b-44c7-bf70-c6e80ea35cf8',
];

const inputBindings = {
  metric_mappings: {
    // Component metric name → row_data field name
    optical_attainment: 'Cumplimiento',
    store_optical_sales: 'Real_Venta_Tienda',
    store_sales_attainment: 'Cumplimiento',
    new_customers_attainment: 'Clientes_Actuales',
    collections_attainment: 'No Actual Club Protection',
    warranty_sales: ' Monto Club Protection ',
  },
};

async function run() {
  for (const id of RULE_SET_IDS) {
    const { error } = await sb.from('rule_sets')
      .update({ input_bindings: inputBindings })
      .eq('id', id);

    if (error) {
      console.error(`Failed to update ${id}:`, error.message);
    } else {
      console.log(`Updated input_bindings on rule_set ${id}`);
    }
  }

  // Verify
  const { data } = await sb.from('rule_sets')
    .select('id, input_bindings')
    .in('id', RULE_SET_IDS);

  for (const rs of data || []) {
    console.log(`\n${rs.id}:`, JSON.stringify(rs.input_bindings));
  }
}

run();
