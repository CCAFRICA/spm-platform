#!/usr/bin/env npx tsx
/**
 * OB-74 Mission 4: Diagnose metric name mismatch
 * Shows what the plan expects vs what the data contains
 */
import { createClient } from '@supabase/supabase-js';

const s = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TENANT_ID = 'f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd';
const RULE_SET_ID = '352f7e6c-413e-4f3b-b70f-678e208e618a';

async function diagnose() {
  console.log('=== OB-74: Metric Mismatch Diagnostic ===\n');

  // ── 1. Get rule set components ──
  const { data: ruleSet } = await s
    .from('rule_sets')
    .select('name, components')
    .eq('id', RULE_SET_ID)
    .single();

  if (!ruleSet) { console.log('NO RULE SET FOUND'); return; }

  const componentsJson = ruleSet.components as Record<string, unknown>;
  const variants = (componentsJson?.variants as Array<Record<string, unknown>>) ?? [];
  const components = (variants[0]?.components as Array<Record<string, unknown>>) ?? [];

  console.log(`Plan: ${ruleSet.name}`);
  console.log(`Components: ${components.length}\n`);

  for (const comp of components) {
    console.log(`--- ${comp.name} (${comp.componentType}) ---`);
    if (comp.tierConfig) {
      const tc = comp.tierConfig as Record<string, unknown>;
      console.log(`  metric: "${tc.metric}"`);
      const tiers = tc.tiers as Array<Record<string, unknown>>;
      tiers?.forEach(t => console.log(`    ${t.label}: [${t.min}, ${t.max}] → $${t.value}`));
    }
    if (comp.matrixConfig) {
      const mc = comp.matrixConfig as Record<string, unknown>;
      console.log(`  rowMetric: "${mc.rowMetric}"`);
      console.log(`  columnMetric: "${mc.columnMetric}"`);
      const rowBands = mc.rowBands as Array<Record<string, unknown>>;
      rowBands?.forEach(b => console.log(`    row: ${b.label}: [${b.min}, ${b.max}]`));
      const colBands = mc.columnBands as Array<Record<string, unknown>>;
      colBands?.forEach(b => console.log(`    col: ${b.label}: [${b.min}, ${b.max}]`));
    }
    if (comp.percentageConfig) {
      const pc = comp.percentageConfig as Record<string, unknown>;
      console.log(`  appliedTo: "${pc.appliedTo}", rate: ${pc.rate}`);
    }
    if (comp.conditionalConfig) {
      const cc = comp.conditionalConfig as Record<string, unknown>;
      console.log(`  appliedTo: "${cc.appliedTo}"`);
      const conditions = cc.conditions as Array<Record<string, unknown>>;
      conditions?.forEach(c => console.log(`    condition: "${c.metric}" [${c.min}, ${c.max}] → rate=${c.rate}`));
    }
    console.log('');
  }

  // ── 2. Get first period ──
  const { data: periods } = await s
    .from('periods')
    .select('id, canonical_key')
    .eq('tenant_id', TENANT_ID)
    .order('canonical_key')
    .limit(1);

  const periodId = periods?.[0]?.id;
  console.log(`\nPeriod: ${periods?.[0]?.canonical_key} (${periodId})\n`);

  // ── 3. Sample entity with data ──
  const { data: sampleRows } = await s
    .from('committed_data')
    .select('entity_id, data_type, row_data')
    .eq('tenant_id', TENANT_ID)
    .eq('period_id', periodId!)
    .not('entity_id', 'is', null)
    .limit(100);

  // Group by entity to find one with multiple rows
  const byEntity = new Map<string, Array<{ data_type: string; row_data: Record<string, unknown> }>>();
  for (const row of (sampleRows ?? [])) {
    const existing = byEntity.get(row.entity_id!) || [];
    existing.push({ data_type: row.data_type, row_data: row.row_data as Record<string, unknown> });
    byEntity.set(row.entity_id!, existing);
  }

  // Pick entity with most rows
  let bestEntity = '';
  let bestCount = 0;
  for (const [eid, rows] of byEntity) {
    if (rows.length > bestCount) {
      bestEntity = eid;
      bestCount = rows.length;
    }
  }

  console.log(`Sample entity: ${bestEntity} (${bestCount} rows in this period)`);

  const entityRows = byEntity.get(bestEntity) ?? [];
  for (const row of entityRows) {
    const rd = row.row_data;
    const numericKeys = Object.keys(rd).filter(k => typeof rd[k] === 'number' && !k.startsWith('_'));
    console.log(`\n  Sheet: ${row.data_type}`);
    console.log(`  Numeric keys: ${numericKeys.join(', ')}`);
    numericKeys.slice(0, 10).forEach(k => console.log(`    ${k} = ${rd[k]}`));
  }

  // ── 4. Simulate aggregateMetrics ──
  console.log('\n--- Aggregated metrics (simulating engine) ---');
  const metrics: Record<string, number> = {};
  for (const row of entityRows) {
    for (const [key, val] of Object.entries(row.row_data)) {
      if (typeof val === 'number') {
        metrics[key] = (metrics[key] || 0) + val;
      }
    }
  }

  const sortedMetrics = Object.entries(metrics).sort((a, b) => a[0].localeCompare(b[0]));
  for (const [key, val] of sortedMetrics) {
    if (!key.startsWith('_')) {
      console.log(`  ${key} = ${val}`);
    }
  }

  // ── 5. Show what each component would see ──
  console.log('\n--- Component metric resolution ---');
  for (const comp of components) {
    const name = comp.name as string;
    const type = comp.componentType as string;

    if (type === 'tier_lookup' && comp.tierConfig) {
      const tc = comp.tierConfig as Record<string, unknown>;
      const metric = tc.metric as string;
      const value = metrics[metric] ?? metrics['attainment'] ?? 0;
      const source = metrics[metric] !== undefined ? metric : (metrics['attainment'] !== undefined ? 'attainment (fallback)' : 'NONE → 0');
      console.log(`  ${name}: metric="${metric}" → resolved to ${value} via ${source}`);
    }
    if (type === 'matrix_lookup' && comp.matrixConfig) {
      const mc = comp.matrixConfig as Record<string, unknown>;
      const rm = mc.rowMetric as string;
      const cm = mc.columnMetric as string;
      const rv = metrics[rm] ?? 0;
      const cv = metrics[cm] ?? 0;
      console.log(`  ${name}: rowMetric="${rm}" → ${rv} (${metrics[rm] !== undefined ? 'FOUND' : 'NOT FOUND → 0'})`);
      console.log(`  ${name}: colMetric="${cm}" → ${cv} (${metrics[cm] !== undefined ? 'FOUND' : 'NOT FOUND → 0'})`);
    }
    if (type === 'percentage' && comp.percentageConfig) {
      const pc = comp.percentageConfig as Record<string, unknown>;
      const appliedTo = pc.appliedTo as string;
      const value = metrics[appliedTo] ?? metrics['amount'] ?? 0;
      const source = metrics[appliedTo] !== undefined ? appliedTo : (metrics['amount'] !== undefined ? 'amount (fallback)' : 'NONE → 0');
      console.log(`  ${name}: appliedTo="${appliedTo}" → ${value} via ${source}`);
    }
    if (type === 'conditional_percentage' && comp.conditionalConfig) {
      const cc = comp.conditionalConfig as Record<string, unknown>;
      const appliedTo = cc.appliedTo as string;
      const base = metrics[appliedTo] ?? metrics['amount'] ?? 0;
      const baseSource = metrics[appliedTo] !== undefined ? appliedTo : (metrics['amount'] !== undefined ? 'amount (fallback)' : 'NONE → 0');
      console.log(`  ${name}: base="${appliedTo}" → ${base} via ${baseSource}`);
      const conditions = cc.conditions as Array<Record<string, unknown>>;
      conditions?.forEach(c => {
        const cm = c.metric as string;
        const cv = metrics[cm] ?? 0;
        console.log(`    condition="${cm}" → ${cv} (${metrics[cm] !== undefined ? 'FOUND' : 'NOT FOUND → 0'})`);
      });
    }
  }

  // ── 6. Get distinct keys across ALL committed_data for this period ──
  console.log('\n--- All distinct numeric keys in committed_data (period-wide) ---');
  const allKeys = new Set<string>();
  let offset = 0;
  const PAGE = 1000;
  while (offset < 5000) { // Check first 5000 rows
    const { data: batch } = await s
      .from('committed_data')
      .select('row_data')
      .eq('tenant_id', TENANT_ID)
      .eq('period_id', periodId!)
      .range(offset, offset + PAGE - 1);
    if (!batch || batch.length === 0) break;
    for (const row of batch) {
      const rd = row.row_data as Record<string, unknown>;
      for (const [k, v] of Object.entries(rd)) {
        if (typeof v === 'number' && !k.startsWith('_')) allKeys.add(k);
      }
    }
    if (batch.length < PAGE) break;
    offset += PAGE;
  }
  const sortedKeys = Array.from(allKeys).sort();
  console.log(`  Total distinct numeric keys: ${sortedKeys.length}`);
  sortedKeys.forEach(k => console.log(`    ${k}`));
}

diagnose().catch(console.error);
