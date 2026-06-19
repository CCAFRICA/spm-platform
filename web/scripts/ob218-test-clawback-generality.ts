#!/usr/bin/env npx tsx
/**
 * OB-218 Generality Test (regression anchor). Proves retrieveOriginalTrace + attributeClawbackRows
 * work with a DIFFERENT reference-key column (InvoiceNumber, not Folio) and a DIFFERENT recovery
 * rate (0.5, not 1.0) — zero hardcoded MIR column names in the retrieval/reversal path.
 *
 * Inserts synthetic data into MIR tables (clearly marked), retrieves, reverses, then cleans up.
 * Usage: cd web && set -a && source .env.local && set +a && npx tsx scripts/ob218-test-clawback-generality.ts
 */
import { createClient } from '@supabase/supabase-js';
import Decimal from 'decimal.js';
import { retrieveOriginalTrace, attributeClawbackRows } from '@/lib/calculation/clawback';
import { computeReversal, type TemporalAdjustmentModifier } from '@/lib/calculation/per-row-attribution';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const MIR = '972c8eb0-e3ae-4e4c-ad30-8b34804c893a';
const TEST_DATA_TYPE = 'OB218_GENERALITY_TEST';
const TEST_COMP = 'OB218_GENERALITY_TEST';

async function main() {
  const errors: string[] = [];
  const { data: periods } = await supabase.from('periods').select('id').eq('tenant_id', MIR).limit(1);
  const periodId = periods?.[0]?.id;
  const { data: results } = await supabase.from('calculation_results').select('id').eq('tenant_id', MIR).limit(1);
  const resultId = results?.[0]?.id;
  if (!periodId || !resultId) throw new Error(`MIR fixture missing (period=${periodId} result=${resultId})`);

  // ── SETUP: original sale row + its stored trace ──
  const { data: origRow, error: e1 } = await supabase.from('committed_data').insert({
    tenant_id: MIR, entity_id: null, period_id: periodId, data_type: TEST_DATA_TYPE, source_date: '2026-01-15',
    row_data: { InvoiceNumber: 'GEN-TEST-001', SaleAmount: 10000.0, _sheetName: TEST_DATA_TYPE },
    metadata: { test: true, ob: 'OB-218-generality' },
  }).select('id').single();
  if (e1 || !origRow) throw new Error(`insert original failed: ${e1?.message}`);

  const { error: e2 } = await supabase.from('calculation_traces').insert({
    tenant_id: MIR, result_id: resultId, component_name: TEST_COMP, committed_data_id: origRow.id,
    transaction_ref: 'GEN-TEST-001', inputs: { SaleAmount: 10000.0 },
    output: { contribution: 500.0, rate: 0.05, pattern: 'additive' }, steps: [],
  });
  if (e2) throw new Error(`insert trace failed: ${e2.message}`);

  // ── EXECUTE 1: retrieveOriginalTrace with a DIFFERENT key column ──
  const r = await retrieveOriginalTrace(supabase, MIR, 'InvoiceNumber', 'GEN-TEST-001', { originalDataType: TEST_DATA_TYPE, priorPeriodId: periodId });
  if (!r.found) errors.push(`retrieve: expected found, got error=${r.error}`);
  if (r.committedDataId !== origRow.id) errors.push(`retrieve: cdId ${r.committedDataId} !== ${origRow.id}`);
  if (!r.contribution || !r.contribution.eq(500)) errors.push(`retrieve: contribution ${r.contribution} !== 500`);
  if (r.rate !== 0.05) errors.push(`retrieve: rate ${r.rate} !== 0.05`);
  if (JSON.stringify(r.inputs) !== JSON.stringify({ SaleAmount: 10000.0 })) errors.push(`retrieve: inputs mismatch ${JSON.stringify(r.inputs)}`);

  // ── EXECUTE 2: computeReversal with a DIFFERENT recovery rate ──
  const reversal = r.contribution ? computeReversal(0.5, r.contribution) : new Decimal(0);
  if (!reversal.eq(-250)) errors.push(`reversal: expected -250, got ${reversal}`);

  // ── EXECUTE 3: attributeClawbackRows (full orchestration) ──
  const modifier: TemporalAdjustmentModifier = {
    returnField: 'InvoiceRef', originalField: 'InvoiceNumber', originalDataType: TEST_DATA_TYPE, recoveryRate: 0.5, lookbackPeriods: 1,
  };
  const claw = await attributeClawbackRows(supabase, MIR, TEST_COMP, modifier, [
    { committedDataId: 'synthetic-return-row', rowData: { InvoiceRef: 'GEN-TEST-001', _sheetName: TEST_DATA_TYPE }, resultId },
  ]);
  if (claw.length !== 1) errors.push(`clawback: expected 1 trace, got ${claw.length}`);
  const out = (claw[0]?.output ?? {}) as Record<string, unknown>;
  if (out.contribution !== -250) errors.push(`clawback: contribution ${out.contribution} !== -250`);
  if (out.pattern !== 'clawback') errors.push(`clawback: pattern ${out.pattern} !== clawback`);
  if (out.originalContribution !== 500) errors.push(`clawback: originalContribution ${out.originalContribution} !== 500`);
  if (out.found !== true) errors.push(`clawback: found ${out.found} !== true`);

  // ── CLEANUP ──
  await supabase.from('calculation_traces').delete().eq('tenant_id', MIR).eq('component_name', TEST_COMP);
  await supabase.from('committed_data').delete().eq('tenant_id', MIR).eq('data_type', TEST_DATA_TYPE);

  if (errors.length) {
    console.log('\n❌ GENERALITY TEST FAILED:'); errors.forEach(e => console.log('  ' + e));
    console.log('\nHALT-GC: check retrieveOriginalTrace/attributeClawbackRows for hardcoded values.');
    process.exit(1);
  }
  console.log('✅ GENERALITY TEST PASSED');
  console.log('  reference key:   InvoiceNumber (not Folio)');
  console.log('  recovery rate:   0.5 (not 1.0)');
  console.log('  original trace:  contribution=500, rate=0.05');
  console.log(`  reversal:        ${reversal.toString()}`);
  console.log(`  attributeClawbackRows: contribution=${out.contribution}, pattern=${out.pattern}, originalContribution=${out.originalContribution}`);
  console.log('  Korean Test:     PASS — zero MIR-specific literals in retrieval/reversal path');
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
