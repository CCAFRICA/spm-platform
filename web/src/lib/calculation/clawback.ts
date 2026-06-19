/**
 * OB-218 — Cross-Period Retrieval + Clawback (Pattern D)
 *
 * Consumes the OB-217 per-transaction substrate: a clawback (return/devolución) reverses the
 * commission earned on an ORIGINAL transaction by looking up that transaction's stored trace
 * (cross-period) and negating its contribution. Pure reversal math lives in per-row-attribution.ts
 * (computeReversal); this module owns the async DB retrieval + orchestration.
 *
 * Korean Test: the reference-key column, original-key column, and scope (data_type / _sheetName)
 * are ALL parameters read from the plan's temporal_adjustment modifier — zero column-name literals.
 * Decision 158: the reversal is pure decimal.js, no LLM. SR-34: a not-found original yields a
 * structured error trace (contribution 0 + full diagnostic in steps), never a silent skip.
 */
import Decimal from 'decimal.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/supabase/database.types';
import { toDecimal } from '@/lib/calculation/decimal-precision';
import { computeReversal, type TemporalAdjustmentModifier } from '@/lib/calculation/per-row-attribution';

export interface OriginalTraceResult {
  found: boolean;
  committedDataId: string | null;
  /** decimal.js (not number) — the original transaction's stored per-row contribution. */
  contribution: Decimal | null;
  rate: number | null;
  inputs: Record<string, unknown> | null;
  componentName: string | null;
  error: string | null;
}

function notFound(committedDataId: string | null, error: string): OriginalTraceResult {
  return { found: false, committedDataId, contribution: null, rate: null, inputs: null, componentName: null, error };
}

/**
 * Two-step cross-period retrieval:
 *   1. find the ORIGINAL committed_data row by `originalKeyColumn = referenceValue`
 *      (optionally scoped by data_type / _sheetName / prior period);
 *   2. read that row's stored calculation_trace and return its contribution / rate / inputs.
 * All identifiers are parameters — the function is data-vocabulary agnostic.
 */
export async function retrieveOriginalTrace(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  originalKeyColumn: string,
  referenceValue: string,
  opts?: {
    originalDataType?: string;
    originalSheet?: string;
    priorPeriodId?: string;
    /** Additional row_data column=value filters — for composite keys (e.g. {Periodo: '2025-10-01'})
     *  when no single column is globally unique. Structural: columns are caller-supplied. */
    extraFilters?: Record<string, string>;
  },
): Promise<OriginalTraceResult> {
  // Step 1 — original committed_data row by the (structural) key column.
  let q = supabase
    .from('committed_data')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq(`row_data->>${originalKeyColumn}`, referenceValue);
  if (opts?.originalDataType) q = q.eq('data_type', opts.originalDataType);
  if (opts?.originalSheet) q = q.eq('row_data->>_sheetName', opts.originalSheet);
  if (opts?.priorPeriodId) q = q.eq('period_id', opts.priorPeriodId);
  if (opts?.extraFilters) {
    for (const [col, val] of Object.entries(opts.extraFilters)) q = q.eq(`row_data->>${col}`, val);
  }
  const { data: cdRows, error: e1 } = await q.limit(1);
  if (e1) return notFound(null, `committed_data_query_error: ${e1.message}`);
  if (!cdRows || cdRows.length === 0) {
    return notFound(null, `original_not_found: ${originalKeyColumn}=${referenceValue}`);
  }
  const originalCdId = cdRows[0].id as string;

  // Step 2 — the stored trace for that row (OB-217 committed_data_id linkage).
  const { data: traces, error: e2 } = await supabase
    .from('calculation_traces')
    .select('component_name, output, inputs')
    .eq('tenant_id', tenantId)
    .eq('committed_data_id', originalCdId)
    .limit(1);
  if (e2) return notFound(originalCdId, `trace_query_error: ${e2.message}`);
  if (!traces || traces.length === 0) {
    return notFound(originalCdId, `trace_not_found: committed_data_id=${originalCdId} has no calculation_trace`);
  }

  const t = traces[0] as { component_name: string; output: unknown; inputs: unknown };
  const output = (t.output && typeof t.output === 'object') ? t.output as Record<string, unknown> : {};
  const contribution = output.contribution !== null && output.contribution !== undefined
    ? toDecimal(String(output.contribution)) : null;
  return {
    found: true,
    committedDataId: originalCdId,
    contribution,
    rate: typeof output.rate === 'number' ? output.rate : null,
    inputs: (t.inputs && typeof t.inputs === 'object') ? t.inputs as Record<string, unknown> : null,
    componentName: t.component_name,
    error: null,
  };
}

export interface ClawbackTraceRow {
  resultId: string;
  componentName: string;
  committedDataId: string;
  transactionRef: string | null;
  formula: string;
  inputs: Json;
  output: Json;
  steps: Json;
}

export interface ClawbackReturnRow {
  committedDataId: string;
  rowData: Record<string, unknown>;
  resultId: string;
}

/**
 * For each return-event row: resolve its reference → retrieve the original trace → reverse its
 * contribution → emit a negative-contribution trace. A not-found original produces a contribution-0
 * trace carrying the full diagnostic (SR-34, no silent skip).
 */
export async function attributeClawbackRows(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  componentName: string,
  modifier: TemporalAdjustmentModifier,
  returnRows: ClawbackReturnRow[],
): Promise<ClawbackTraceRow[]> {
  const out: ClawbackTraceRow[] = [];
  for (const row of returnRows) {
    const referenceValue = String(row.rowData[modifier.returnField] ?? '');
    if (!referenceValue) continue; // no reference key on this row → not a clawback row

    const orig = await retrieveOriginalTrace(supabase, tenantId, modifier.originalField, referenceValue, {
      originalDataType: modifier.originalDataType,
      originalSheet: modifier.originalSheet,
    });

    const reversal: Decimal = orig.found && orig.contribution
      ? computeReversal(modifier.recoveryRate, orig.contribution)
      : new Decimal(0); // SR-34: structured error trace, not a silent skip

    out.push({
      resultId: row.resultId,
      componentName,
      committedDataId: row.committedDataId,
      transactionRef: referenceValue,
      formula: `-${modifier.recoveryRate} × ${orig.contribution?.toString() ?? 'NOT_FOUND'}`,
      inputs: row.rowData as Json,
      output: {
        contribution: reversal.toNumber(),
        rate: modifier.recoveryRate,
        pattern: 'clawback',
        originalContribution: orig.contribution?.toNumber() ?? null,
        originalRate: orig.rate,
        originalCommittedDataId: orig.committedDataId,
        found: orig.found,
      } as Json,
      steps: [
        { action: 'resolve_reference', returnField: modifier.returnField, referenceValue, originalField: modifier.originalField },
        { action: 'retrieve_original', found: orig.found, committedDataId: orig.committedDataId, error: orig.error },
        { action: 'compute_reversal', recoveryRate: modifier.recoveryRate, originalContribution: orig.contribution?.toNumber() ?? null, result: reversal.toNumber() },
      ] as Json,
    });
  }
  return out;
}
