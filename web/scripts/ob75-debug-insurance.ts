import { createClient } from '@supabase/supabase-js';
import {
  buildMetricsForComponent,
  evaluateComponent,
  type AIContextSheet,
} from '../src/lib/calculation/run-calculation';
import type { PlanComponent } from '../src/types/compensation-plan';
import type { Json } from '../src/lib/supabase/database.types';

const TENANT_ID = 'f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd';
const JAN_PERIOD_ID = 'c90ae99f-cfd6-4346-8ae1-8373f9cab116';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
  // Get AI context
  const { data: batch } = await supabase
    .from('import_batches')
    .select('metadata')
    .eq('id', '24dfad4b-fa4e-4e34-b81d-5c05a3aaad9d')
    .single();
  const meta = batch?.metadata as Record<string, unknown> | null;
  const aiCtx = meta?.ai_context as { sheets?: AIContextSheet[] } | undefined;
  const aiSheets = aiCtx?.sheets ?? [];

  // Get insurance component config
  const { data: ruleSet } = await supabase
    .from('rule_sets')
    .select('components')
    .eq('id', 'a7c1ae18-e119-4256-aa64-1227b054b563')
    .single();
  const cJson = ruleSet?.components as Record<string, unknown>;
  const variants = (cJson?.variants as Array<Record<string, unknown>>) ?? [];
  const components = (variants[0]?.components as PlanComponent[]) ?? [];
  const insuranceComp = components.find(c => c.name.toLowerCase().includes('insurance'));

  if (!insuranceComp) { console.log('No insurance component'); return; }
  console.log(`Component: ${insuranceComp.name} (${insuranceComp.componentType})`);
  console.log(`Config:`, JSON.stringify(insuranceComp.percentageConfig || insuranceComp.conditionalConfig || insuranceComp.tierConfig, null, 2));

  // Sample insurance data (Base_Club_Proteccion)
  console.log('\n=== SAMPLE Base_Club_Proteccion ROWS ===');
  const { data: insRows } = await supabase
    .from('committed_data')
    .select('entity_id, row_data')
    .eq('tenant_id', TENANT_ID)
    .eq('period_id', JAN_PERIOD_ID)
    .eq('data_type', 'Base_Club_Proteccion')
    .not('entity_id', 'is', null)
    .limit(5);

  for (const r of (insRows ?? [])) {
    const rd = r.row_data as Record<string, unknown>;
    console.log(`  entity=${r.entity_id}: ${JSON.stringify(rd).slice(0, 200)}`);
  }

  // Find entities where insurance payout > 0
  // Process a few entities to find those with insurance payouts
  const { data: rosterRows } = await supabase
    .from('committed_data')
    .select('entity_id')
    .eq('tenant_id', TENANT_ID)
    .eq('period_id', JAN_PERIOD_ID)
    .eq('data_type', 'Datos Colaborador')
    .not('entity_id', 'is', null)
    .limit(1000);

  const entityIds = (rosterRows ?? []).map(r => r.entity_id).filter(Boolean) as string[];
  let paidCount = 0;
  let totalPayout = 0;

  for (const entityId of entityIds) {
    // Get entity's sheet data
    const { data: rows } = await supabase
      .from('committed_data')
      .select('data_type, row_data')
      .eq('tenant_id', TENANT_ID)
      .eq('period_id', JAN_PERIOD_ID)
      .eq('entity_id', entityId);

    const sheetMap = new Map<string, Array<{ row_data: Json }>>();
    for (const r of (rows ?? [])) {
      const sheet = r.data_type || '_unknown';
      if (!sheetMap.has(sheet)) sheetMap.set(sheet, []);
      sheetMap.get(sheet)!.push({ row_data: r.row_data as Json });
    }

    const metrics = buildMetricsForComponent(insuranceComp, sheetMap, undefined, aiSheets);
    const result = evaluateComponent(insuranceComp, metrics);

    if (result.payout > 0) {
      paidCount++;
      totalPayout += result.payout;
      if (paidCount <= 5) {
        console.log(`\n  PAID entity ${entityId}: payout=${result.payout}`);
        console.log(`    metrics: ${JSON.stringify(metrics)}`);
        console.log(`    details: ${JSON.stringify(result.details)}`);
      }
    }
  }

  console.log(`\n=== INSURANCE SUMMARY ===`);
  console.log(`  Paid: ${paidCount} employees`);
  console.log(`  Total: $${totalPayout}`);
  console.log(`  Ground truth: $10 (2 employees)`);
}

run().catch(console.error);
