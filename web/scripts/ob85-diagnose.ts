#!/usr/bin/env npx tsx
/**
 * OB-85 Diagnostic: Why 719 entities × MX$0.00?
 *
 * Traces the full pipeline: import_batches → committed_data → calculation_results
 * to find the exact break in the data bridge.
 */

import { createClient } from '@supabase/supabase-js';

const TENANT_ID = 'f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function diagnose() {
  console.log('═══════════════════════════════════════════════');
  console.log('  OB-85 DIAGNOSTIC: Zero-to-Payout Data Bridge');
  console.log('═══════════════════════════════════════════════\n');

  // ── Q1: Import Batches ──
  console.log('── Q1: Import Batches ──');
  const { data: batches, error: batchErr } = await supabase
    .from('import_batches')
    .select('id, status, created_at, metadata, file_name, sheet_count, row_count')
    .eq('tenant_id', TENANT_ID)
    .order('created_at', { ascending: false })
    .limit(5);

  console.log(`  Query error: ${batchErr?.message ?? 'none'}`);
  console.log(`  Batches found: ${batches?.length ?? 0}`);
  for (const b of batches ?? []) {
    const meta = b.metadata as Record<string, unknown> | null;
    const hasAiCtx = !!meta?.ai_context;
    const aiCtx = meta?.ai_context as { sheets?: Array<{ sheetName: string; matchedComponent: string | null }> } | undefined;
    console.log(`  Batch ${b.id} | ${b.status} | ${b.file_name} | rows=${b.row_count} sheets=${b.sheet_count}`);
    console.log(`    AI Context: ${hasAiCtx ? 'YES' : 'NO'}`);
    if (aiCtx?.sheets) {
      for (const s of aiCtx.sheets) {
        console.log(`      Sheet: "${s.sheetName}" → Component: "${s.matchedComponent ?? 'NULL'}"`);
      }
    }
    if (meta) {
      console.log(`    Metadata keys: ${Object.keys(meta).join(', ')}`);
    }
  }

  // ── Q2: Periods ──
  console.log('\n── Q2: Periods ──');
  const { data: periods } = await supabase
    .from('periods')
    .select('id, canonical_key, label, status')
    .eq('tenant_id', TENANT_ID)
    .order('start_date', { ascending: false });

  for (const p of periods ?? []) {
    console.log(`  ${p.canonical_key} (${p.label || 'no label'}) | status=${p.status} | id=${p.id}`);
  }

  const openPeriod = (periods ?? []).find(p => p.status === 'open') ?? (periods ?? [])[0];
  if (!openPeriod) { console.log('  ⚠ NO PERIODS FOUND'); return; }
  console.log(`  → Active period: ${openPeriod.canonical_key} (${openPeriod.id})`);

  // ── Q3: Sheet names — get ALL committed_data distinct data_types ──
  console.log('\n── Q3: ALL Sheet Names in committed_data ──');
  // Use multiple pages to get true distribution
  const allSheetCounts = new Map<string, number>();
  const entityIdCounts = { withEntity: 0, withoutEntity: 0, uniqueEntities: new Set<string>() };
  let page = 0;
  const PAGE = 5000;
  let totalRows = 0;
  while (page < 30) { // up to 150k rows
    const { data: rows } = await supabase
      .from('committed_data')
      .select('data_type, entity_id')
      .eq('tenant_id', TENANT_ID)
      .eq('period_id', openPeriod.id)
      .range(page * PAGE, (page + 1) * PAGE - 1);
    if (!rows || rows.length === 0) break;
    totalRows += rows.length;
    for (const r of rows) {
      allSheetCounts.set(r.data_type || '_null', (allSheetCounts.get(r.data_type || '_null') || 0) + 1);
      if (r.entity_id) {
        entityIdCounts.withEntity++;
        entityIdCounts.uniqueEntities.add(r.entity_id);
      } else {
        entityIdCounts.withoutEntity++;
      }
    }
    if (rows.length < PAGE) break;
    page++;
  }
  console.log(`  Total committed_data rows for period: ${totalRows}`);
  for (const [sheet, count] of Array.from(allSheetCounts.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`  "${sheet}": ${count} rows`);
  }

  // ── Q4: Entity ID Distribution ──
  console.log('\n── Q4: Entity ID Distribution ──');
  console.log(`  With entity_id: ${entityIdCounts.withEntity} rows (${entityIdCounts.uniqueEntities.size} unique)`);
  console.log(`  Without entity_id (NULL): ${entityIdCounts.withoutEntity} rows`);

  // ── Q5: row_data Sample per Sheet ──
  console.log('\n── Q5: row_data Sample Keys per Sheet ──');
  for (const sheetName of Array.from(allSheetCounts.keys())) {
    const { data: sample } = await supabase
      .from('committed_data')
      .select('row_data, entity_id')
      .eq('tenant_id', TENANT_ID)
      .eq('period_id', openPeriod.id)
      .eq('data_type', sheetName)
      .limit(2);

    if (sample && sample.length > 0) {
      const rd = sample[0].row_data as Record<string, unknown>;
      const keys = Object.keys(rd).filter(k => !k.startsWith('_'));
      const numericKeys = keys.filter(k => typeof rd[k] === 'number');
      const stringKeys = keys.filter(k => typeof rd[k] === 'string');
      const semanticKeys = ['attainment', 'goal', 'amount', 'quantity', 'sales', 'payout', 'storeId', 'entityId'];
      const foundSemantic = semanticKeys.filter(sk => keys.some(k => k.toLowerCase() === sk.toLowerCase()));
      console.log(`  Sheet "${sheetName}" (entity_id: ${sample[0].entity_id ? sample[0].entity_id.slice(0, 8) + '...' : 'NULL'}):`);
      console.log(`    Keys (${keys.length}): ${keys.join(', ')}`);
      console.log(`    Numeric: ${numericKeys.join(', ')}`);
      console.log(`    Semantic found: ${foundSemantic.length > 0 ? foundSemantic.join(', ') : 'NONE'}`);
      // Print actual values for first row
      console.log(`    Sample values: ${JSON.stringify(rd).slice(0, 300)}`);
    }
  }

  // ── Q6: Rule Set Components ──
  console.log('\n── Q6: Rule Set Components ──');
  const { data: ruleSet } = await supabase
    .from('rule_sets')
    .select('id, name, components')
    .eq('tenant_id', TENANT_ID)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();

  if (ruleSet) {
    console.log(`  Rule Set: ${ruleSet.name} (${ruleSet.id})`);
    const components = ruleSet.components;
    console.log(`  Components type: ${typeof components}, isArray: ${Array.isArray(components)}`);
    console.log(`  Components raw: ${JSON.stringify(components).slice(0, 500)}`);
    if (Array.isArray(components)) {
      for (const c of components) {
        const metric = c.tierConfig?.metric
          ?? c.matrixConfig?.rowMetric
          ?? c.percentageConfig?.appliedTo
          ?? '(none)';
        console.log(`  Component: "${c.name}" | type=${c.componentType} | enabled=${c.enabled} | metric="${metric}"`);
      }
    }
  } else {
    console.log('  ⚠ NO ACTIVE RULE SET FOUND');
  }

  // ── Q7: Calculation Batches ──
  console.log('\n── Q7: Calculation Batches ──');
  const { data: calcBatches } = await supabase
    .from('calculation_batches')
    .select('id, lifecycle_state, entity_count, summary, created_at, period_id')
    .eq('tenant_id', TENANT_ID)
    .order('created_at', { ascending: false })
    .limit(3);

  for (const cb of calcBatches ?? []) {
    const summary = cb.summary as Record<string, unknown> | null;
    console.log(`  Batch ${cb.id} | ${cb.lifecycle_state} | entities=${cb.entity_count} | total=${summary?.total_payout ?? summary?.totalPayout ?? 'N/A'}`);
    console.log(`    Period: ${cb.period_id} | Created: ${cb.created_at}`);
  }

  // ── Q8: Sample calculation_results ──
  console.log('\n── Q8: Calculation Results Sample ──');
  const latestBatch = (calcBatches ?? [])[0];
  if (latestBatch) {
    const { data: results } = await supabase
      .from('calculation_results')
      .select('entity_id, total_payout, attainment, components')
      .eq('batch_id', latestBatch.id)
      .limit(3);

    for (const r of results ?? []) {
      const comps = r.components as Array<{ componentName?: string; payout?: number; metricValues?: Record<string, number> }> | null;
      console.log(`  Entity ${r.entity_id} | total=${r.total_payout} | attainment=${JSON.stringify(r.attainment)}`);
      if (comps) {
        for (const c of comps) {
          console.log(`    "${c.componentName}": payout=${c.payout} metrics=${JSON.stringify(c.metricValues ?? {})}`);
        }
      }
    }

    const { count: totalResults } = await supabase
      .from('calculation_results')
      .select('id', { count: 'exact', head: true })
      .eq('batch_id', latestBatch.id);

    const { count: nonZeroResults } = await supabase
      .from('calculation_results')
      .select('id', { count: 'exact', head: true })
      .eq('batch_id', latestBatch.id)
      .gt('total_payout', 0);

    console.log(`  Total results: ${totalResults} | Non-zero: ${nonZeroResults}`);
  }

  // ── Q9: Entities table — do they have store relationships? ──
  console.log('\n── Q9: Entity → Store Relationship ──');
  const { data: entities } = await supabase
    .from('entities')
    .select('id, display_name, external_id, attributes')
    .eq('tenant_id', TENANT_ID)
    .limit(5);

  for (const e of entities ?? []) {
    const attrs = e.attributes as Record<string, unknown> | null;
    console.log(`  Entity ${e.id.slice(0, 8)}... | "${e.display_name}" | ext=${e.external_id} | attrs=${JSON.stringify(attrs).slice(0, 200)}`);
  }

  // ── Q10: Rule set assignments ──
  console.log('\n── Q10: Rule Set Assignments ──');
  if (ruleSet) {
    const { count: assignCount } = await supabase
      .from('rule_set_assignments')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', TENANT_ID)
      .eq('rule_set_id', ruleSet.id);

    console.log(`  Assignments to ${ruleSet.name}: ${assignCount}`);

    const { data: assignSample } = await supabase
      .from('rule_set_assignments')
      .select('entity_id')
      .eq('tenant_id', TENANT_ID)
      .eq('rule_set_id', ruleSet.id)
      .limit(3);

    for (const a of assignSample ?? []) {
      console.log(`  Assigned entity: ${a.entity_id}`);
    }
  }

  // ── Q11: committed_data for ALL periods (check if data is in wrong period) ──
  console.log('\n── Q11: committed_data Distribution by Period ──');
  for (const p of periods ?? []) {
    const { count } = await supabase
      .from('committed_data')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', TENANT_ID)
      .eq('period_id', p.id);
    console.log(`  ${p.canonical_key}: ${count} rows`);
  }

  // Also check if there's committed_data with no period
  const { count: noPeriodCount } = await supabase
    .from('committed_data')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', TENANT_ID)
    .is('period_id', null);
  console.log(`  (no period): ${noPeriodCount} rows`);

  console.log('\n═══════════════════════════════════════════════');
  console.log('  DIAGNOSTIC COMPLETE');
  console.log('═══════════════════════════════════════════════');
}

diagnose().catch(console.error);
