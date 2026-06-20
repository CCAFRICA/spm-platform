/**
 * OB-224 — component/trace layer. AP-17: this is a THIN reuse of the OB-219 assembler,
 * not a parallel trace-assembly path. getCommissionStatement already joins
 * calculation_results.components → calculation_traces → committed_data and groups by component;
 * ComponentCards/TransactionRows consume its StatementComponent/StatementTransaction shapes.
 *
 * Graceful fallback (substrate §3.1: traces exist only for BCL/MIR): when a result has no
 * per-row traces, getCommissionStatement still returns the authoritative component breakdown
 * (attributable=false, pattern='entity-level'), so the cards render payouts without forensic rows.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { createClient } from '@/lib/supabase/client';
import { getCommissionStatement } from '@/lib/compensation/commission-statement';
import type { CommissionStatement } from './types';

/**
 * The entity+period path (every drill-through surface has both). Returns the full statement
 * (components with per-transaction traces) or null when the entity has no result for the period.
 */
export async function getEntityStatement(
  tenantId: string,
  entityId: string,
  periodId: string,
  client?: SupabaseClient<Database>,
): Promise<CommissionStatement | null> {
  if (!tenantId || !entityId || !periodId) return null;
  const sb = client ?? createClient();
  return getCommissionStatement(sb, tenantId, entityId, periodId);
}

export interface RawComponentTrace {
  id: string;
  componentName: string;
  formula: string | null;
  inputs: Record<string, unknown>;
  output: Record<string, unknown>;
  steps: unknown[];
  committedDataId: string | null;
  transactionRef: string | null;
}

const asObj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/**
 * The result_id path: raw calculation_traces for a single result, for callers that already hold
 * a result_id (e.g. a reconciliation row). Returns [] when no traces exist (graceful).
 */
export async function getComponentTraces(
  tenantId: string,
  resultId: string,
  client?: SupabaseClient<Database>,
): Promise<RawComponentTrace[]> {
  if (!tenantId || !resultId) return [];
  const sb = client ?? createClient();
  const { data, error } = await sb
    .from('calculation_traces')
    .select('id, component_name, formula, inputs, output, steps, committed_data_id, transaction_ref')
    .eq('tenant_id', tenantId)
    .eq('result_id', resultId);
  if (error || !data) return [];
  return data.map(t => ({
    id: t.id as string,
    componentName: (t.component_name as string) ?? 'Component',
    formula: (t.formula as string | null) ?? null,
    inputs: asObj(t.inputs),
    output: asObj(t.output),
    steps: Array.isArray(t.steps) ? (t.steps as unknown[]) : [],
    committedDataId: (t.committed_data_id as string | null) ?? null,
    transactionRef: (t.transaction_ref as string | null) ?? null,
  }));
}
