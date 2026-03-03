/**
 * OB-148 Phase 2D: Trace exact metrics for zero-Óptica entities
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);
const tenantId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

async function main() {
  const { data: enero } = await supabase
    .from('periods')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('canonical_key', '2024-01')
    .single();
  if (!enero) return;

  // Check one zero-Óptica entity: 90341550
  const { data: ent } = await supabase
    .from('entities')
    .select('id, external_id, metadata')
    .eq('tenant_id', tenantId)
    .eq('external_id', '90341550')
    .single();
  if (!ent) { console.log('Entity not found'); return; }

  console.log('Entity:', ent.external_id, 'id:', ent.id);

  // Get ALL committed_data for this entity
  const { data: cd } = await supabase
    .from('committed_data')
    .select('data_type, row_data')
    .eq('tenant_id', tenantId)
    .eq('period_id', enero.id)
    .eq('entity_id', ent.id);

  console.log('\n--- Committed Data ---');
  for (const row of cd ?? []) {
    console.log(`Sheet: ${row.data_type}`);
    const rd = row.row_data as Record<string, unknown>;
    for (const [k, v] of Object.entries(rd)) {
      console.log(`  ${k}: ${JSON.stringify(v)} (type: ${typeof v})`);
    }
  }

  // Also check: what does the calculation result show?
  const { data: cr } = await supabase
    .from('calculation_results')
    .select('total_payout, components, metrics')
    .eq('tenant_id', tenantId)
    .eq('entity_id', ent.id)
    .single();

  if (cr) {
    console.log('\n--- Calculation Result ---');
    console.log(`Total payout: MX$${cr.total_payout}`);
    console.log(`Metrics:`, JSON.stringify(cr.metrics, null, 2));
    const comps = (cr.components ?? []) as Array<Record<string, any>>;
    for (const c of comps) {
      console.log(`  ${c.componentName}: MX$${c.payout}, details:`, JSON.stringify(c.details));
    }
  }

  // Compare with a WORKING entity: 93515855
  console.log('\n\n--- Working Entity 93515855 ---');
  const { data: ent2 } = await supabase
    .from('entities')
    .select('id, external_id')
    .eq('tenant_id', tenantId)
    .eq('external_id', '93515855')
    .single();
  if (!ent2) return;

  const { data: cd2 } = await supabase
    .from('committed_data')
    .select('data_type, row_data')
    .eq('tenant_id', tenantId)
    .eq('period_id', enero.id)
    .eq('entity_id', ent2.id);

  console.log('Sheets:', [...new Set((cd2 ?? []).map(r => r.data_type))].join(', '));
  for (const row of cd2 ?? []) {
    if (row.data_type.includes('venta_individual')) {
      const rd = row.row_data as Record<string, unknown>;
      console.log(`venta_individual Cumplimiento: ${JSON.stringify(rd.Cumplimiento)} (type: ${typeof rd.Cumplimiento})`);
    }
  }

  const { data: cr2 } = await supabase
    .from('calculation_results')
    .select('metrics, components')
    .eq('tenant_id', tenantId)
    .eq('entity_id', ent2.id)
    .single();

  if (cr2) {
    console.log('Metrics:', JSON.stringify(cr2.metrics, null, 2));
    const comps = (cr2.components ?? []) as Array<Record<string, any>>;
    const op = comps.find(c => String(c.componentName).includes('ptica'));
    if (op) console.log('Óptica:', JSON.stringify(op.details));
  }
}

main().catch(console.error);
