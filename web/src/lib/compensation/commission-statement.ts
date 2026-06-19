/**
 * OB-219 — Commission Statement data layer.
 *
 * Assembles an entity's per-period commission statement from the OB-217/218 substrate:
 * the authoritative component breakdown (calculation_results.components) augmented with
 * per-transaction traces (calculation_traces) joined to their source rows (committed_data).
 *
 * Pure + testable: takes a SupabaseClient, so the API route (service-role) and tests
 * (service-role) and a browser page (RLS) all call the same code. No LLM (Decision 158).
 * Korean Test: component names + input labels come from the DATA (component_name, inputs keys),
 * never hardcoded — works for BCL, MIR, any tenant.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';

export interface StatementTransaction {
  committedDataId: string;
  transactionRef: string | null;
  sourceDate: string | null;
  formula: string | null;
  inputs: Record<string, unknown>;
  rate: number | null;
  contribution: number;
  pattern: string;
  /** Full trace output (carries clawback fields: originalContribution, originalRate, etc.). */
  output: Record<string, unknown>;
  steps: unknown[];
  /** The raw committed_data.row_data that drove this calculation (bottom drill-down layer). */
  sourceRow: Record<string, unknown> | null;
}

export interface StatementComponent {
  name: string;
  planName: string | null;
  /** Entity-level subtotal from calculation_results.components[].payout (authoritative). */
  payout: number;
  /** True when per-transaction traces exist (Pattern A/B/clawback); false for Pattern C. */
  attributable: boolean;
  /** 'additive' | 'qualified' | 'clawback' | 'entity-level'. */
  pattern: string;
  transactions: StatementTransaction[];
  /** Sum of per-transaction contributions (≈ payout for attributable components). */
  tracedSubtotal: number;
}

export interface CommissionStatement {
  entity: { id: string; externalId: string; displayName: string };
  period: { id: string; label: string };
  totalPayout: number;
  components: StatementComponent[];
  hasTraces: boolean;
  traceCount: number;
}

type Json = Record<string, unknown>;
const asObj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const asNum = (v: unknown): number | null =>
  typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v)) ? Number(v) : null;

/** A trace is a clawback when its output declares pattern 'clawback' (OB-218). */
export function isClawbackTrace(output: Record<string, unknown>): boolean {
  return output?.pattern === 'clawback';
}

interface RawTrace {
  component_name: string;
  committed_data_id: string | null;
  transaction_ref: string | null;
  formula: string | null;
  inputs: unknown;
  output: unknown;
  steps: unknown;
}

/** Group per-row traces by component_name, joining each to its committed_data source row. */
export function groupTracesByComponent(
  traces: RawTrace[],
  sourceById: Map<string, { row_data: unknown; source_date: string | null }>,
): Map<string, StatementTransaction[]> {
  const byComponent = new Map<string, StatementTransaction[]>();
  for (const t of traces) {
    if (!t.committed_data_id) continue; // per-row traces only
    const output = asObj(t.output);
    const src = sourceById.get(t.committed_data_id);
    const tx: StatementTransaction = {
      committedDataId: t.committed_data_id,
      transactionRef: t.transaction_ref,
      sourceDate: src?.source_date ?? null,
      formula: t.formula,
      inputs: asObj(t.inputs),
      rate: asNum(output.rate),
      contribution: asNum(output.contribution) ?? 0,
      pattern: typeof output.pattern === 'string' ? output.pattern : 'additive',
      output,
      steps: Array.isArray(t.steps) ? (t.steps as unknown[]) : [],
      sourceRow: src ? asObj(src.row_data) : null,
    };
    const list = byComponent.get(t.component_name) ?? [];
    list.push(tx);
    byComponent.set(t.component_name, list);
  }
  // Stable ordering: by source date, then transaction ref.
  for (const list of Array.from(byComponent.values())) {
    list.sort((a, b) => (a.sourceDate ?? '').localeCompare(b.sourceDate ?? '') || (a.transactionRef ?? '').localeCompare(b.transactionRef ?? ''));
  }
  return byComponent;
}

/** Merge the authoritative component list (from results) with grouped traces. */
export function buildStatementComponents(
  resultComponents: Array<{ name: string; payout: number; planName: string | null }>,
  tracesByComponent: Map<string, StatementTransaction[]>,
): StatementComponent[] {
  return resultComponents.map(rc => {
    const transactions = tracesByComponent.get(rc.name) ?? [];
    const attributable = transactions.length > 0;
    const tracedSubtotal = transactions.reduce((s, t) => s + t.contribution, 0);
    let pattern = 'entity-level';
    if (attributable) {
      pattern = transactions.some(t => t.pattern === 'clawback') ? 'clawback' : (transactions[0]?.pattern ?? 'additive');
    }
    return { name: rc.name, planName: rc.planName, payout: rc.payout, attributable, pattern, transactions, tracedSubtotal };
  });
}

/**
 * Assemble the full commission statement for an entity + period. Returns null when the entity
 * has no calculation_results for that period.
 */
export async function getCommissionStatement(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  entityId: string,
  periodId: string,
): Promise<CommissionStatement | null> {
  // 1. All results for entity+period (one per plan/rule_set). Dedup to latest per rule_set.
  const { data: resultsRaw, error: rErr } = await supabase
    .from('calculation_results')
    .select('id, rule_set_id, total_payout, components, created_at')
    .eq('tenant_id', tenantId)
    .eq('entity_id', entityId)
    .eq('period_id', periodId)
    .order('created_at', { ascending: false });
  if (rErr) throw rErr;
  if (!resultsRaw || resultsRaw.length === 0) return null;

  const latestByRuleSet = new Map<string, typeof resultsRaw[number]>();
  for (const r of resultsRaw) {
    const key = (r.rule_set_id as string) ?? r.id;
    if (!latestByRuleSet.has(key)) latestByRuleSet.set(key, r); // first = latest (ordered desc)
  }
  const results = Array.from(latestByRuleSet.values());
  const resultIds = results.map(r => r.id as string);

  // 2. Plan names for the result rule_sets.
  const ruleSetIds = Array.from(new Set(results.map(r => r.rule_set_id).filter(Boolean))) as string[];
  const planNameById = new Map<string, string>();
  if (ruleSetIds.length > 0) {
    const { data: rs } = await supabase.from('rule_sets').select('id, name').in('id', ruleSetIds);
    for (const r of rs ?? []) planNameById.set(r.id as string, (r.name as string) ?? '');
  }

  // 3. Traces for those results.
  const { data: tracesRaw, error: tErr } = await supabase
    .from('calculation_traces')
    .select('component_name, committed_data_id, transaction_ref, formula, inputs, output, steps')
    .eq('tenant_id', tenantId)
    .in('result_id', resultIds);
  if (tErr) throw tErr;
  const traces = (tracesRaw ?? []) as RawTrace[];

  // 4. Source rows for the per-row traces.
  const committedIds = Array.from(new Set(traces.map(t => t.committed_data_id).filter(Boolean))) as string[];
  const sourceById = new Map<string, { row_data: unknown; source_date: string | null }>();
  for (let i = 0; i < committedIds.length; i += 200) {
    const chunk = committedIds.slice(i, i + 200);
    const { data: cd } = await supabase.from('committed_data').select('id, row_data, source_date').in('id', chunk);
    for (const r of cd ?? []) sourceById.set(r.id as string, { row_data: r.row_data, source_date: (r.source_date as string) ?? null });
  }

  // 5. Entity + period labels.
  const { data: ent } = await supabase.from('entities').select('external_id, display_name').eq('id', entityId).maybeSingle();
  const { data: per } = await supabase.from('periods').select('label').eq('id', periodId).maybeSingle();

  // 6. Assemble.
  const tracesByComponent = groupTracesByComponent(traces, sourceById);
  const resultComponents: Array<{ name: string; payout: number; planName: string | null }> = [];
  let totalPayout = 0;
  for (const r of results) {
    totalPayout += asNum(r.total_payout) ?? 0;
    const planName = r.rule_set_id ? (planNameById.get(r.rule_set_id as string) ?? null) : null;
    const comps = Array.isArray(r.components) ? (r.components as Json[]) : [];
    for (const c of comps) {
      resultComponents.push({
        name: String(c.componentName ?? c.name ?? 'Component'),
        payout: asNum(c.payout) ?? 0,
        planName,
      });
    }
  }
  const components = buildStatementComponents(resultComponents, tracesByComponent);

  return {
    entity: {
      id: entityId,
      externalId: (ent?.external_id as string) ?? entityId.slice(0, 8),
      displayName: (ent?.display_name as string) ?? (ent?.external_id as string) ?? entityId.slice(0, 8),
    },
    period: { id: periodId, label: (per?.label as string) ?? periodId },
    totalPayout,
    components,
    hasTraces: traces.some(t => t.committed_data_id),
    traceCount: traces.filter(t => t.committed_data_id).length,
  };
}
