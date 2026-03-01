/**
 * OB-131 Phase 4: Alpha Proof — Direct comparison engine verification
 *
 * Calls Supabase directly + comparison-engine to bypass API auth.
 * Proves: benchmark CSV → entity matching → 100% match rate.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { runEnhancedComparison } from '../src/lib/reconciliation/comparison-engine';
import type { ColumnMapping } from '../src/lib/reconciliation/ai-column-mapper';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string,
);

const LAB = 'a630404c-0777-4f6d-b760-b8a190ecd63c';
const BENCHMARKS_DIR = join(__dirname, '..', 'benchmarks');

function parseCsv(content: string): { headers: string[]; rows: Record<string, unknown>[] } {
  const lines = content.trim().split('\n');
  const headers = lines[0].split(',');
  const rows = lines.slice(1).map(line => {
    const values = line.split(',');
    const row: Record<string, unknown> = {};
    headers.forEach((h, i) => {
      const val = values[i]?.trim() ?? '';
      const num = parseFloat(val);
      row[h] = isNaN(num) ? val : num;
    });
    return row;
  });
  return { headers, rows };
}

interface ProofResult {
  plan: string;
  period: string;
  batchId: string;
  entityCount: number;
  matchRate: number;
  exactMatches: number;
  totalMatched: number;
  vlTotal: number;
  benchmarkTotal: number;
  delta: number;
  pass: boolean;
  error?: string;
}

async function runReconciliation(
  batchId: string,
  planName: string,
  periodLabel: string,
  benchmarkFile: string,
): Promise<ProofResult> {
  const base = {
    plan: planName,
    period: periodLabel,
    batchId: batchId.slice(0, 8),
    entityCount: 0,
    matchRate: 0,
    exactMatches: 0,
    totalMatched: 0,
    vlTotal: 0,
    benchmarkTotal: 0,
    delta: 0,
    pass: false,
  };

  try {
    // 1. Parse benchmark CSV
    const csvContent = readFileSync(benchmarkFile, 'utf-8');
    const { rows } = parseCsv(csvContent);

    // 2. Load VL calculation results for this batch
    const { data: results, error: resErr } = await sb
      .from('calculation_results')
      .select('entity_id, total_payout, components')
      .eq('batch_id', batchId)
      .eq('tenant_id', LAB);

    if (resErr || !results || results.length === 0) {
      return { ...base, error: `No results for batch: ${resErr?.message || 'empty'}` };
    }

    // 3. Load entity external IDs
    const entityIds = results.map(r => r.entity_id);
    const entityMap = new Map<string, { external_id: string; name: string }>();
    for (let i = 0; i < entityIds.length; i += 50) {
      const chunk = entityIds.slice(i, i + 50);
      const { data: entities } = await sb
        .from('entities')
        .select('id, external_id, display_name')
        .in('id', chunk);
      for (const e of (entities || [])) {
        entityMap.set(e.id, { external_id: e.external_id ?? e.id, name: e.display_name ?? '' });
      }
    }

    // 4. Transform to CalculationResult format (same as compare API)
    const vlResults = results.map(r => {
      const entity = entityMap.get(r.entity_id);
      const dbComponents = r.components as Array<{ id?: string; componentId?: string; name?: string; payout?: number; outputValue?: number }> | null;
      return {
        entityId: entity?.external_id ?? r.entity_id,
        entityName: entity?.name ?? '',
        totalIncentive: Number(r.total_payout),
        components: (dbComponents ?? []).map(c => ({
          componentId: c.id ?? c.componentId ?? '',
          componentName: c.name ?? '',
          outputValue: c.outputValue ?? c.payout ?? 0,
        })),
      } as any;
    });

    // 5. Build mappings
    const mappings: ColumnMapping[] = [
      { sourceColumn: 'Entity ID', mappedTo: 'entity_id', mappedToLabel: 'Entity ID', confidence: 1, reasoning: 'exact header match', isUserOverride: false },
      { sourceColumn: 'Expected Payout', mappedTo: 'total_amount', mappedToLabel: 'Total Payout', confidence: 1, reasoning: 'exact header match', isUserOverride: false },
    ];

    // 6. Run comparison engine directly
    const comparisonResult = runEnhancedComparison(
      rows,
      vlResults,
      mappings,
      'Entity ID',
      'Expected Payout',
      [],
      2,
    );

    const s = comparisonResult.summary;
    const matchRate = s.matched > 0 ? s.exactMatches / s.matched : 0;

    return {
      plan: planName,
      period: periodLabel,
      batchId: batchId.slice(0, 8),
      entityCount: results.length,
      matchRate,
      exactMatches: s.exactMatches,
      totalMatched: s.matched,
      vlTotal: s.vlTotalAmount,
      benchmarkTotal: s.fileTotalAmount,
      delta: s.totalDelta,
      pass: matchRate >= 1.0 && Math.abs(s.totalDelta) < 0.01,
    };
  } catch (err: any) {
    return { ...base, error: err.message || 'Unknown error' };
  }
}

async function main() {
  console.log('=== OB-131 Alpha Proof: Reconciliation Verification ===\n');

  // Get all LAB batches
  const { data: batches } = await sb
    .from('calculation_batches')
    .select('id, rule_set_id, period_id, entity_count, summary')
    .eq('tenant_id', LAB)
    .is('superseded_by', null)
    .order('created_at', { ascending: false });

  if (!batches) { console.log('ERROR: No batches'); return; }

  // Build lookups
  const rsIds = Array.from(new Set(batches.map((b: any) => b.rule_set_id).filter(Boolean)));
  const rsMap = new Map<string, string>();
  for (const id of rsIds) {
    const { data } = await sb.from('rule_sets').select('id, name').eq('id', id).single();
    if (data) rsMap.set(data.id, data.name);
  }

  const pIds = Array.from(new Set(batches.map((b: any) => b.period_id).filter(Boolean)));
  const pMap = new Map<string, string>();
  for (const id of pIds) {
    const { data } = await sb.from('periods').select('id, label, canonical_key').eq('id', id).single();
    if (data) pMap.set(data.id, data.label || data.canonical_key || 'unknown');
  }

  const benchmarkFiles = readdirSync(BENCHMARKS_DIR).filter(f => f.endsWith('.csv'));
  const results: ProofResult[] = [];
  let allPass = true;

  // Test all plans with March 2024 period
  const targetPeriod = 'March 2024';
  const targets = [
    { planKey: 'Deposit Growth', label: 'DG' },
    { planKey: 'Consumer Lending', label: 'CL' },
    { planKey: 'Mortgage Origination', label: 'MO' },
    { planKey: 'Insurance Referral', label: 'IR' },
  ];

  for (const target of targets) {
    const batch = batches.find((b: any) => {
      const name = rsMap.get(b.rule_set_id) || '';
      const period = pMap.get(b.period_id) || '';
      return name.includes(target.planKey) && period === targetPeriod;
    });

    if (!batch) {
      console.log(`SKIP ${target.label}: No batch for ${targetPeriod}`);
      continue;
    }

    const fileKey = target.planKey.replace(/ /g, '_');
    const file = benchmarkFiles.find(f => f.includes(fileKey) && f.includes('March'));

    if (!file) {
      console.log(`SKIP ${target.label}: No benchmark file`);
      continue;
    }

    console.log(`--- ${target.label}: ${rsMap.get(batch.rule_set_id)} / ${targetPeriod} ---`);
    const result = await runReconciliation(
      batch.id,
      rsMap.get(batch.rule_set_id) || target.label,
      targetPeriod,
      join(BENCHMARKS_DIR, file),
    );
    results.push(result);

    console.log(`  Match Rate: ${(result.matchRate * 100).toFixed(1)}%`);
    console.log(`  Entities: ${result.exactMatches}/${result.totalMatched} exact (${result.entityCount} total)`);
    console.log(`  VL: $${result.vlTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })} | Benchmark: $${result.benchmarkTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })} | Delta: $${result.delta.toFixed(2)}`);
    console.log(`  ${result.pass ? 'PASS' : 'FAIL'}${result.error ? ` — ${result.error}` : ''}\n`);
    if (!result.pass) allPass = false;
  }

  // Summary
  console.log('=== ALPHA PROOF SUMMARY ===');
  console.log(`Plans tested: ${results.length}`);
  console.log(`All pass: ${allPass ? 'YES' : 'NO'}\n`);
  for (const r of results) {
    console.log(`  ${r.pass ? 'PASS' : 'FAIL'} | ${r.plan} / ${r.period} | ${r.exactMatches}/${r.totalMatched} exact | $${r.vlTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })} | Δ $${r.delta.toFixed(2)}`);
  }

  if (!allPass) {
    console.log('\nFAILED — Not all plans pass reconciliation');
    process.exit(1);
  } else {
    console.log('\nALPHA PROOF: COMPLETE — All plans reconcile at 100%');
  }
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
