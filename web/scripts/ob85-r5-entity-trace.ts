/**
 * OB-85 R5: Trace entity 93515855 calculation result details
 * and check per-component metric resolution
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const TENANT = '9b2bb4e3-6828-4451-b3fb-dc384509494f';
const LATEST_BATCH = 'ebb21525-c13c-4990-95b2-24a24e3c3c6b';

async function trace() {
  // Find entity UUID for employee 93515855
  const { data: periods } = await supabase
    .from('periods')
    .select('id')
    .eq('tenant_id', TENANT)
    .gte('start_date', '2024-01-01')
    .lt('start_date', '2024-02-01');
  const periodId = periods?.[0]?.id;

  // Get the entity UUID for employee 93515855
  const PAGE = 1000;
  let entityUuid: string | null = null;
  let page = 0;
  while (!entityUuid) {
    const { data } = await supabase
      .from('committed_data')
      .select('entity_id, data_type, row_data')
      .eq('tenant_id', TENANT)
      .eq('period_id', periodId!)
      .eq('data_type', 'Datos Colaborador')
      .range(page * PAGE, (page + 1) * PAGE - 1);
    if (!data || data.length === 0) break;
    for (const row of data) {
      const rd = row.row_data as Record<string, unknown>;
      if (String(rd?.entityId ?? rd?.num_empleado) === '93515855') {
        entityUuid = row.entity_id;
        break;
      }
    }
    if (data.length < PAGE) break;
    page++;
  }
  console.log(`Entity 93515855 UUID: ${entityUuid}`);

  if (!entityUuid) {
    console.log('Entity not found!');
    return;
  }

  // Get calculation result for this entity from latest batch
  const { data: results } = await supabase
    .from('calculation_results')
    .select('*')
    .eq('batch_id', LATEST_BATCH)
    .eq('entity_id', entityUuid);

  if (!results || results.length === 0) {
    // Try without batch filter
    const { data: anyResults } = await supabase
      .from('calculation_results')
      .select('batch_id, total_payout, components, metadata')
      .eq('entity_id', entityUuid)
      .order('created_at', { ascending: false })
      .limit(3);
    console.log(`\nNo results in latest batch. Found ${anyResults?.length ?? 0} results in other batches:`);
    for (const r of anyResults ?? []) {
      console.log(`  Batch: ${String(r.batch_id).slice(0,8)}, Total: MX$${r.total_payout}`);
    }
  }

  for (const r of results ?? []) {
    console.log(`\n=== CALCULATION RESULT ===`);
    console.log(`Total payout: MX$${r.total_payout}`);
    const comps = Array.isArray(r.components) ? r.components : [];
    console.log(`Components (${comps.length}):`);
    for (const c of comps) {
      const comp = c as Record<string, unknown>;
      console.log(`  ${comp.componentName}: MX$${comp.payout}`);
      console.log(`    evaluator: ${comp.evaluatorType}`);
      console.log(`    metrics: ${JSON.stringify(comp.metrics)}`);
      if (comp.executionTrace) {
        console.log(`    trace: ${JSON.stringify(comp.executionTrace)}`);
      }
    }

    const meta = r.metadata as Record<string, unknown> | null;
    if (meta) {
      console.log(`\nMetadata:`);
      console.log(`  variant: ${meta.variantName}`);
      console.log(`  role: ${meta.entityRole}`);
      console.log(`  sheetsMatched: ${JSON.stringify(meta.sheetsMatched)}`);
    }
  }

  // Get entity_period_outcome for comparison
  const { data: outcome } = await supabase
    .from('entity_period_outcomes')
    .select('*')
    .eq('tenant_id', TENANT)
    .eq('period_id', periodId!)
    .eq('entity_id', entityUuid);

  if (outcome && outcome.length > 0) {
    console.log(`\n=== ENTITY_PERIOD_OUTCOME ===`);
    console.log(`Total payout: MX$${outcome[0].total_payout}`);
    const comps = Array.isArray(outcome[0].component_breakdown) ? outcome[0].component_breakdown : [];
    for (const c of comps) {
      const comp = c as Record<string, unknown>;
      console.log(`  ${comp.componentName}: MX$${comp.payout}`);
    }
  }

  // Check what committed_data this entity has
  const { data: entityData } = await supabase
    .from('committed_data')
    .select('data_type, row_data')
    .eq('tenant_id', TENANT)
    .eq('period_id', periodId!)
    .eq('entity_id', entityUuid);

  console.log(`\n=== COMMITTED DATA ===`);
  const sheetCounts = new Map<string, number>();
  for (const row of entityData ?? []) {
    sheetCounts.set(row.data_type, (sheetCounts.get(row.data_type) ?? 0) + 1);
  }
  for (const [sheet, count] of Array.from(sheetCounts.entries()).sort()) {
    console.log(`  ${sheet}: ${count} rows`);
  }

  // Show sample data from each sheet
  const sheetsSeen = new Set<string>();
  for (const row of entityData ?? []) {
    if (!sheetsSeen.has(row.data_type)) {
      sheetsSeen.add(row.data_type);
      const rd = row.row_data as Record<string, unknown>;
      const keys = Object.keys(rd).filter(k => {
        const v = rd[k];
        return v !== null && v !== undefined && v !== '' && v !== 0;
      });
      console.log(`\n  ${row.data_type} sample (non-empty fields):`);
      for (const k of keys.slice(0, 15)) {
        console.log(`    ${k}: ${rd[k]}`);
      }
    }
  }

  // Also check: how many entities have each evaluator type producing > 0?
  console.log('\n\n=== COMPONENT DISTRIBUTION ACROSS ALL ENTITIES ===');
  const batchResults: Array<{ components: unknown }> = [];
  let bPage = 0;
  while (true) {
    const { data } = await supabase
      .from('calculation_results')
      .select('components')
      .eq('batch_id', LATEST_BATCH)
      .range(bPage * PAGE, (bPage + 1) * PAGE - 1);
    if (!data || data.length === 0) break;
    batchResults.push(...data);
    if (data.length < PAGE) break;
    bPage++;
  }

  // If batch wasn't found, try the other batch
  if (batchResults.length === 0) {
    console.log('Trying alternative batch...');
    const { data: batches } = await supabase
      .from('calculation_batches')
      .select('id')
      .eq('tenant_id', TENANT)
      .order('created_at', { ascending: false })
      .limit(1);
    if (batches && batches.length > 0) {
      const altBatch = batches[0].id;
      console.log(`Using batch: ${altBatch.slice(0,8)}`);
      let aPage = 0;
      while (true) {
        const { data } = await supabase
          .from('calculation_results')
          .select('components')
          .eq('batch_id', altBatch)
          .range(aPage * PAGE, (aPage + 1) * PAGE - 1);
        if (!data || data.length === 0) break;
        batchResults.push(...data);
        if (data.length < PAGE) break;
        aPage++;
      }
    }
  }

  const compStats = new Map<string, { nonZero: number; zero: number; total: number }>();
  for (const r of batchResults) {
    const comps = Array.isArray(r.components) ? r.components : [];
    for (const c of comps) {
      const comp = c as Record<string, unknown>;
      const name = String(comp.componentName ?? 'unknown');
      const payout = Number(comp.payout ?? 0);
      const stats = compStats.get(name) ?? { nonZero: 0, zero: 0, total: 0 };
      if (payout > 0) {
        stats.nonZero++;
        stats.total += payout;
      } else {
        stats.zero++;
      }
      compStats.set(name, stats);
    }
  }
  for (const [name, stats] of Array.from(compStats.entries()).sort((a, b) => b[1].total - a[1].total)) {
    console.log(`  ${name}: ${stats.nonZero} non-zero / ${stats.nonZero + stats.zero} total | MX$${stats.total.toLocaleString()}`);
  }
}

trace().catch(console.error);
