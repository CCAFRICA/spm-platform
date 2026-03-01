/**
 * OB-131: Generate benchmark CSV files from known LAB calculation results
 *
 * These files serve as "expected values" for the Alpha reconciliation proof.
 * The customer would normally bring their own benchmark file (from their
 * legacy system or manual calculations). Here we generate them from VL's
 * own results to prove the end-to-end reconciliation flow works.
 */

import { createClient } from '@supabase/supabase-js';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string,
);

const LAB = 'a630404c-0777-4f6d-b760-b8a190ecd63c';
const OUT_DIR = join(__dirname, '..', 'benchmarks');

async function generateBenchmark(
  ruleSetName: string,
  batchId: string,
  periodLabel: string,
) {
  // Get calculation results for this batch
  const { data: results, error } = await sb
    .from('calculation_results')
    .select('entity_id, total_payout, components')
    .eq('batch_id', batchId)
    .eq('tenant_id', LAB);

  if (error || !results || results.length === 0) {
    console.log(`  SKIP ${ruleSetName} / ${periodLabel}: ${error?.message || 'no results'}`);
    return null;
  }

  // Get entity external IDs and names
  const entityIds = results.map(r => r.entity_id);
  const entityMap = new Map<string, { external_id: string; name: string }>();

  for (let i = 0; i < entityIds.length; i += 50) {
    const chunk = entityIds.slice(i, i + 50);
    const { data: entities } = await sb
      .from('entities')
      .select('id, external_id, display_name')
      .in('id', chunk);

    for (const e of (entities || [])) {
      entityMap.set(e.id, {
        external_id: e.external_id ?? e.id,
        name: e.display_name ?? '',
      });
    }
  }

  // Build CSV rows
  const rows: string[] = [];
  const headers = ['Entity ID', 'Name', 'Expected Payout'];
  rows.push(headers.join(','));

  let grandTotal = 0;
  for (const r of results) {
    const entity = entityMap.get(r.entity_id);
    const extId = entity?.external_id ?? r.entity_id;
    const name = (entity?.name ?? '').replace(/,/g, ' ');
    const payout = Number(r.total_payout) || 0;
    grandTotal += payout;
    rows.push(`${extId},${name},${payout.toFixed(2)}`);
  }

  // Write file
  const safeName = ruleSetName.replace(/[^a-zA-Z0-9]/g, '_');
  const safePeriod = periodLabel.replace(/[^a-zA-Z0-9]/g, '_');
  const fileName = `benchmark_${safeName}_${safePeriod}.csv`;
  const filePath = join(OUT_DIR, fileName);
  writeFileSync(filePath, rows.join('\n'), 'utf-8');

  console.log(`  OK ${ruleSetName} / ${periodLabel}: ${results.length} entities, $${grandTotal.toFixed(2)} → ${fileName}`);
  return { fileName, entityCount: results.length, total: grandTotal };
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  // Get all LAB batches
  const { data: batches } = await sb
    .from('calculation_batches')
    .select('id, rule_set_id, period_id, entity_count, summary, created_at')
    .eq('tenant_id', LAB)
    .is('superseded_by', null)
    .order('created_at', { ascending: false });

  if (!batches || batches.length === 0) {
    console.log('No batches found for LAB');
    return;
  }

  // Get rule set names
  const rsIds = Array.from(new Set(batches.map((b: any) => b.rule_set_id).filter(Boolean)));
  const rsMap = new Map<string, string>();
  for (const rsId of rsIds) {
    const { data: rs } = await sb.from('rule_sets').select('id, name').eq('id', rsId).single();
    if (rs) rsMap.set(rs.id, rs.name);
  }

  // Get period labels
  const pIds = Array.from(new Set(batches.map((b: any) => b.period_id).filter(Boolean)));
  const pMap = new Map<string, string>();
  for (const pId of pIds) {
    const { data: p } = await sb.from('periods').select('id, label, canonical_key').eq('id', pId).single();
    if (p) pMap.set(p.id, p.label || p.canonical_key || 'unknown');
  }

  console.log('=== Generating Alpha Benchmarks ===\n');

  const generated: Array<{ plan: string; period: string; file: string; count: number; total: number }> = [];

  for (const b of batches) {
    const planName = rsMap.get(b.rule_set_id) || 'unknown';
    const periodLabel = pMap.get(b.period_id) || 'unknown';
    const batchTotal = (b.summary as any)?.total_payout || 0;

    // Skip $0 batches
    if (batchTotal === 0) continue;

    const result = await generateBenchmark(planName, b.id, periodLabel);
    if (result) {
      generated.push({
        plan: planName,
        period: periodLabel,
        file: result.fileName,
        count: result.entityCount,
        total: result.total,
      });
    }
  }

  console.log(`\n=== Generated ${generated.length} benchmark files ===`);
  console.log('\nSummary:');
  for (const g of generated) {
    console.log(`  ${g.plan} / ${g.period}: ${g.count} entities, $${g.total.toFixed(2)}`);
  }
}

main().catch(console.error);
