#!/usr/bin/env npx tsx
/**
 * OB-85 R3: Surgical trace — entity 96568046 through entire pipeline
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function trace() {
  console.log('══════════════════════════════════════════════════════');
  console.log('  OB-85 R3 SURGICAL TRACE: Entity 96568046');
  console.log('══════════════════════════════════════════════════════\n');

  // 0B: Find the entity record
  console.log('── 0B: Entity Record ──');
  const { data: entityRows } = await supabase
    .from('entities')
    .select('id, tenant_id, external_id, display_name, entity_type, metadata')
    .eq('external_id', '96568046');

  if (!entityRows || entityRows.length === 0) {
    // Try searching in committed_data
    console.log('  Entity not found by external_id. Searching committed_data...');
    const { data: cdSearch } = await supabase
      .from('committed_data')
      .select('entity_id, tenant_id, row_data')
      .ilike('row_data', '%96568046%')
      .limit(3);
    for (const r of cdSearch ?? []) {
      console.log(`  Found in committed_data: entity_id=${r.entity_id} tenant=${r.tenant_id}`);
    }
  }

  for (const e of entityRows ?? []) {
    console.log(`  ID: ${e.id}`);
    console.log(`  Tenant: ${e.tenant_id}`);
    console.log(`  External ID: ${e.external_id}`);
    console.log(`  Display Name: ${e.display_name}`);
    console.log(`  Type: ${e.entity_type}`);
    console.log(`  Metadata: ${JSON.stringify(e.metadata)}`);
  }

  const entity = entityRows?.[0];
  if (!entity) { console.log('  FATAL: Entity 96568046 not found'); return; }
  const TENANT_ID = entity.tenant_id;
  const ENTITY_ID = entity.id;

  // 0A: committed_data for this entity
  console.log('\n── 0A: Committed Data for Entity 96568046 ──');
  // First find January 2024 period
  const { data: periods } = await supabase
    .from('periods')
    .select('id, canonical_key, label')
    .eq('tenant_id', TENANT_ID)
    .order('start_date', { ascending: false });

  console.log('  Periods:');
  for (const p of periods ?? []) {
    console.log(`    ${p.canonical_key} (${p.label}) → ${p.id}`);
  }

  const jan2024 = (periods ?? []).find(p => p.canonical_key === '2024-01');
  if (!jan2024) { console.log('  FATAL: Jan 2024 period not found'); return; }
  console.log(`  → Jan 2024 period: ${jan2024.id}`);

  // Get all committed_data for this entity in Jan 2024
  const { data: entityCD } = await supabase
    .from('committed_data')
    .select('data_type, row_data, period_id, import_batch_id, created_at')
    .eq('tenant_id', TENANT_ID)
    .eq('entity_id', ENTITY_ID)
    .eq('period_id', jan2024.id);

  console.log(`\n  Committed data rows for entity ${ENTITY_ID} in Jan 2024: ${entityCD?.length ?? 0}`);
  for (const r of entityCD ?? []) {
    console.log(`    Sheet: "${r.data_type}"`);
    console.log(`    row_data: ${JSON.stringify(r.row_data)}`);
    console.log(`    import_batch_id: ${r.import_batch_id}`);
    console.log('');
  }

  // Also check ALL committed_data for this entity across all periods
  const { data: entityAllCD } = await supabase
    .from('committed_data')
    .select('data_type, row_data, period_id')
    .eq('tenant_id', TENANT_ID)
    .eq('entity_id', ENTITY_ID)
    .limit(20);

  console.log(`  ALL committed data rows for entity (any period): ${entityAllCD?.length ?? 0}`);
  const sheetsByPeriod = new Map<string, string[]>();
  for (const r of entityAllCD ?? []) {
    const key = r.period_id ?? 'null';
    if (!sheetsByPeriod.has(key)) sheetsByPeriod.set(key, []);
    sheetsByPeriod.get(key)!.push(r.data_type);
  }
  for (const [periodId, sheets] of Array.from(sheetsByPeriod.entries())) {
    const period = (periods ?? []).find(p => p.id === periodId);
    console.log(`    Period ${period?.canonical_key ?? periodId}: ${sheets.join(', ')}`);
  }

  // 0C: Calculation results for this entity
  console.log('\n── 0C: Calculation Results for Entity 96568046 ──');
  const { data: calcResults } = await supabase
    .from('calculation_results')
    .select('batch_id, entity_id, total_payout, components, metrics, attainment, metadata, created_at')
    .eq('tenant_id', TENANT_ID)
    .eq('entity_id', ENTITY_ID)
    .order('created_at', { ascending: false })
    .limit(3);

  for (const r of calcResults ?? []) {
    console.log(`  Batch: ${r.batch_id}`);
    console.log(`  Total Payout: ${r.total_payout}`);
    console.log(`  Attainment: ${JSON.stringify(r.attainment)}`);
    console.log(`  Metrics: ${JSON.stringify(r.metrics)}`);
    console.log(`  Components (full):`);
    const comps = r.components as unknown[];
    if (Array.isArray(comps)) {
      for (const c of comps) {
        console.log(`    ${JSON.stringify(c)}`);
      }
    } else {
      console.log(`    ${JSON.stringify(r.components)}`);
    }
    console.log(`  Metadata: ${JSON.stringify(r.metadata)}`);
    console.log('');
  }

  // 0D: Rule set components
  console.log('\n── 0D: Rule Set Components ──');
  const { data: ruleSet } = await supabase
    .from('rule_sets')
    .select('id, name, status, components')
    .eq('tenant_id', TENANT_ID)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();

  if (ruleSet) {
    console.log(`  Name: ${ruleSet.name}`);
    console.log(`  ID: ${ruleSet.id}`);
    console.log(`  Status: ${ruleSet.status}`);
    const compsRaw = ruleSet.components as Record<string, unknown>;
    console.log(`  Components type: ${compsRaw?.type}`);
    const variants = compsRaw?.variants as Array<Record<string, unknown>> ?? [];
    for (const v of variants) {
      console.log(`\n  Variant: ${v.variantId}`);
      const vComps = v.components as Array<Record<string, unknown>> ?? [];
      for (const c of vComps) {
        console.log(`    Component: "${c.name}" | type=${c.componentType} | enabled=${c.enabled}`);
        if (c.tierConfig) {
          const tc = c.tierConfig as Record<string, unknown>;
          console.log(`      tierConfig.metric: "${tc.metric}"`);
          const tiers = tc.tiers as Array<Record<string, unknown>> ?? [];
          console.log(`      tiers: ${JSON.stringify(tiers.map(t => ({ min: t.min, max: t.max, value: t.value })))}`);
        }
        if (c.matrixConfig) {
          const mc = c.matrixConfig as Record<string, unknown>;
          console.log(`      matrixConfig.rowMetric: "${mc.rowMetric}"`);
          console.log(`      matrixConfig.columnMetric: "${mc.columnMetric}"`);
          const rowBands = mc.rowBands as Array<Record<string, unknown>> ?? [];
          const colBands = mc.columnBands as Array<Record<string, unknown>> ?? [];
          console.log(`      rowBands: ${JSON.stringify(rowBands.map(b => ({ min: b.min, max: b.max })))}`);
          console.log(`      colBands: ${JSON.stringify(colBands.map(b => ({ min: b.min, max: b.max })))}`);
          console.log(`      values: ${JSON.stringify(mc.values)}`);
        }
        if (c.percentageConfig) {
          const pc = c.percentageConfig as Record<string, unknown>;
          console.log(`      percentageConfig: ${JSON.stringify(pc)}`);
        }
        if (c.conditionalConfig) {
          const cc = c.conditionalConfig as Record<string, unknown>;
          console.log(`      conditionalConfig: ${JSON.stringify(cc)}`);
        }
      }
    }
  }

  // 0E: Import batch field mappings
  console.log('\n── 0E: Import Batch Metadata ──');
  const { data: importBatches } = await supabase
    .from('import_batches')
    .select('id, status, metadata, created_at, file_name, row_count')
    .eq('tenant_id', TENANT_ID)
    .order('created_at', { ascending: false })
    .limit(3);

  for (const ib of importBatches ?? []) {
    console.log(`  Batch: ${ib.id} | ${ib.status} | ${ib.file_name} | rows=${ib.row_count}`);
    const meta = ib.metadata as Record<string, unknown> | null;
    if (meta) {
      console.log(`    Metadata keys: ${Object.keys(meta).join(', ')}`);
      const aiCtx = meta.ai_context as { sheets?: Array<Record<string, unknown>> } | undefined;
      if (aiCtx?.sheets) {
        console.log(`    AI Context sheets (${aiCtx.sheets.length}):`);
        for (const s of aiCtx.sheets) {
          console.log(`      "${s.sheetName}" → component: "${s.matchedComponent}" | classification: "${s.classification}"`);
          if (s.fieldMappings) {
            console.log(`        Field mappings: ${JSON.stringify(s.fieldMappings)}`);
          }
          if (s.semanticFields) {
            console.log(`        Semantic fields: ${JSON.stringify(s.semanticFields)}`);
          }
        }
      }
    }
    console.log('');
  }

  // 0G: Find WORKING calculation (seed data — the 12-entity batch)
  console.log('\n── 0G: Working Calculation (Seed Data) ──');
  // Look for ANY batch with non-zero payouts across ALL tenants
  const { data: workingBatches } = await supabase
    .from('calculation_batches')
    .select('id, tenant_id, entity_count, summary, period_id, created_at')
    .order('created_at', { ascending: false })
    .limit(20);

  let workingBatchId: string | null = null;
  let workingTenantId: string | null = null;
  for (const wb of workingBatches ?? []) {
    const sum = wb.summary as Record<string, unknown> | null;
    const totalPayout = (sum?.total_payout ?? sum?.totalPayout ?? 0) as number;
    console.log(`  Batch ${wb.id.slice(0, 8)}... | tenant=${wb.tenant_id.slice(0, 8)}... | entities=${wb.entity_count} | total_payout=${totalPayout}`);
    if (totalPayout > 0 && wb.entity_count <= 50 && !workingBatchId) {
      workingBatchId = wb.id;
      workingTenantId = wb.tenant_id;
    }
  }

  if (workingBatchId) {
    console.log(`\n  → Working batch: ${workingBatchId} (tenant: ${workingTenantId})`);
    const { data: workingResults } = await supabase
      .from('calculation_results')
      .select('entity_id, total_payout, components, metrics, attainment, metadata')
      .eq('batch_id', workingBatchId)
      .gt('total_payout', 0)
      .limit(2);

    for (const wr of workingResults ?? []) {
      console.log(`\n  Working entity: ${wr.entity_id}`);
      console.log(`    Total: ${wr.total_payout}`);
      console.log(`    Metrics: ${JSON.stringify(wr.metrics)}`);
      console.log(`    Attainment: ${JSON.stringify(wr.attainment)}`);
      console.log(`    Components:`);
      const wComps = wr.components as unknown[];
      if (Array.isArray(wComps)) {
        for (const c of wComps) {
          console.log(`      ${JSON.stringify(c)}`);
        }
      }
      console.log(`    Metadata: ${JSON.stringify(wr.metadata)}`);
    }
  }

  // 0F: Check what the engine ACTUALLY receives per-entity
  // Look at all committed_data sheets for Jan 2024
  console.log('\n── 0F: All Sheets in Jan 2024 ──');
  const sheetCounts = new Map<string, { total: number; withEntity: number; withoutEntity: number }>();
  let page = 0;
  while (page < 20) {
    const { data: rows } = await supabase
      .from('committed_data')
      .select('data_type, entity_id')
      .eq('tenant_id', TENANT_ID)
      .eq('period_id', jan2024.id)
      .range(page * 5000, (page + 1) * 5000 - 1);
    if (!rows || rows.length === 0) break;
    for (const r of rows) {
      const dt = r.data_type || '_null';
      if (!sheetCounts.has(dt)) sheetCounts.set(dt, { total: 0, withEntity: 0, withoutEntity: 0 });
      const sc = sheetCounts.get(dt)!;
      sc.total++;
      if (r.entity_id) sc.withEntity++; else sc.withoutEntity++;
    }
    if (rows.length < 5000) break;
    page++;
  }

  for (const [sheet, counts] of Array.from(sheetCounts.entries())) {
    console.log(`  "${sheet}": ${counts.total} rows (entity: ${counts.withEntity}, store: ${counts.withoutEntity})`);
  }

  // Get a sample from each sheet type for Jan 2024 with entity_id
  console.log('\n── 0F-2: Sample row_data per sheet (entity-level) ──');
  for (const sheetName of Array.from(sheetCounts.keys())) {
    const { data: sample } = await supabase
      .from('committed_data')
      .select('row_data, entity_id')
      .eq('tenant_id', TENANT_ID)
      .eq('period_id', jan2024.id)
      .eq('data_type', sheetName)
      .not('entity_id', 'is', null)
      .limit(1);

    if (sample && sample.length > 0) {
      const rd = sample[0].row_data as Record<string, unknown>;
      console.log(`\n  Sheet "${sheetName}" (entity: ${sample[0].entity_id?.toString().slice(0, 8)}...):`);
      console.log(`    row_data: ${JSON.stringify(rd)}`);
    } else {
      // Try store-level
      const { data: storeSample } = await supabase
        .from('committed_data')
        .select('row_data')
        .eq('tenant_id', TENANT_ID)
        .eq('period_id', jan2024.id)
        .eq('data_type', sheetName)
        .limit(1);

      if (storeSample && storeSample.length > 0) {
        console.log(`\n  Sheet "${sheetName}" (store-level only):`);
        console.log(`    row_data: ${JSON.stringify(storeSample[0].row_data)}`);
      }
    }
  }

  // CRITICAL: Check the rule_set's expected metric names vs what's in committed_data
  console.log('\n── 0F-3: Expected Metrics vs Available Data ──');
  if (ruleSet) {
    const compsRaw = ruleSet.components as Record<string, unknown>;
    const variants = compsRaw?.variants as Array<Record<string, unknown>> ?? [];
    const defaultVariant = variants[0];
    const vComps = defaultVariant?.components as Array<Record<string, unknown>> ?? [];

    for (const c of vComps) {
      const expectedMetrics: string[] = [];
      if (c.tierConfig) {
        const tc = c.tierConfig as Record<string, unknown>;
        if (tc.metric) expectedMetrics.push(tc.metric as string);
      }
      if (c.matrixConfig) {
        const mc = c.matrixConfig as Record<string, unknown>;
        if (mc.rowMetric) expectedMetrics.push(mc.rowMetric as string);
        if (mc.columnMetric) expectedMetrics.push(mc.columnMetric as string);
      }
      if (c.percentageConfig) {
        const pc = c.percentageConfig as Record<string, unknown>;
        if (pc.appliedTo) expectedMetrics.push(pc.appliedTo as string);
      }
      if (c.conditionalConfig) {
        const cc = c.conditionalConfig as Record<string, unknown>;
        if (cc.appliedTo) expectedMetrics.push(cc.appliedTo as string);
        const conds = cc.conditions as Array<Record<string, unknown>> ?? [];
        for (const cond of conds) {
          if (cond.metric) expectedMetrics.push(cond.metric as string);
        }
      }
      console.log(`  Component "${c.name}": expects metrics [${expectedMetrics.join(', ')}]`);
    }
  }

  console.log('\n══════════════════════════════════════════════════════');
  console.log('  TRACE COMPLETE');
  console.log('══════════════════════════════════════════════════════');
}

trace().catch(console.error);
