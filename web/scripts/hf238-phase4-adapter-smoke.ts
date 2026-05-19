// HF-238 Phase 4: Adapter smoke test. Loads every stored calculationIntent
// across the 3 active tenants, translates each through legacyIntentToDAG +
// componentIntentToDAG, and walks the resulting tree through evaluate()
// with a synthetic EvalContext. Reports successes / failures per plan.
//
// Purpose: prove the legacy adapter covers the Phase 0 inventory before
// the architect re-triggers fresh calculations.

import { createClient } from '@supabase/supabase-js';
import { componentIntentToDAG, UntranslatableLegacyIntentError } from '../src/lib/calculation/legacy-intent-to-dag';
import { evaluate, IntentExecutorUnknownOperationError } from '../src/lib/calculation/intent-executor';
import { toNumber } from '../src/lib/calculation/decimal-precision';
import type { EvalContext } from '../src/lib/calculation/intent-types';
import type { ComponentIntent } from '../src/lib/calculation/intent-types';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const TENANT_IDS = [
  'e44bbcb1-2710-4880-8c7d-a1bd902720b7',
  '5035b1e8-0754-4527-b7ec-9f93f85e4c79',
  'b1c2d3e4-aaaa-bbbb-cccc-111111111111',
];

interface SmokeOutcome {
  tenantName: string;
  planName: string;
  componentLabel: string;
  componentIndex: number;
  status: 'ok' | 'untranslatable' | 'unknown_prime' | 'eval_error';
  reason?: string;
  outcome?: number;
  primeRoot?: string;
}

// The stored shape persists the IntentOperation/PrimeNode under
// component.calculationIntent. ComponentIntent (the in-memory shape passed
// to executeIntent) wraps it under .intent. Build that wrapper here.
function buildComponentIntent(comp: Record<string, unknown>, idx: number): ComponentIntent | null {
  const raw = comp.calculationIntent as Record<string, unknown> | undefined;
  if (!raw) return null;

  const modifiers = (raw.modifiers as ComponentIntent['modifiers']) ?? [];

  // Variant-routed: raw might carry variants directly
  if (Array.isArray((raw as { variants?: unknown[] }).variants)) {
    return {
      componentIndex: idx,
      label: (comp.name as string) || `c${idx}`,
      confidence: 1,
      dataSource: { sheetClassification: '', entityScope: 'entity', requiredMetrics: [] },
      variants: raw as unknown as ComponentIntent['variants'],
      modifiers,
      metadata: {},
    };
  }

  // Prime-DAG or legacy operation: pass through as .intent
  return {
    componentIndex: idx,
    label: (comp.name as string) || `c${idx}`,
    confidence: 1,
    dataSource: { sheetClassification: '', entityScope: 'entity', requiredMetrics: [] },
    intent: raw as unknown as ComponentIntent['intent'],
    modifiers,
    metadata: {},
  };
}

function flattenComponents(components: unknown): ComponentIntent[] {
  const out: ComponentIntent[] = [];
  if (!components || typeof components !== 'object') return out;
  const c = components as Record<string, unknown>;
  if (Array.isArray(c.variants)) {
    for (const v of c.variants as Array<Record<string, unknown>>) {
      if (Array.isArray(v.components)) {
        for (const comp of v.components as Array<Record<string, unknown>>) {
          const ci = buildComponentIntent(comp, out.length);
          if (ci) out.push(ci);
        }
      }
    }
  } else if (Array.isArray(c.components)) {
    for (const comp of c.components as Array<Record<string, unknown>>) {
      const ci = buildComponentIntent(comp, out.length);
      if (ci) out.push(ci);
    }
  }
  return out;
}

(async () => {
  const outcomes: SmokeOutcome[] = [];

  const { data: tenants } = await sb.from('tenants').select('id, name').in('id', TENANT_IDS);

  for (const tid of TENANT_IDS) {
    const tenant = tenants?.find(t => t.id === tid);
    const tenantName = tenant?.name ?? tid;

    const { data: ruleSets } = await sb
      .from('rule_sets')
      .select('id, name, components')
      .eq('tenant_id', tid);

    for (const rs of (ruleSets ?? [])) {
      const components = flattenComponents(rs.components);
      for (const ci of components) {
        // Synthetic context — populated with deterministic numerics so the
        // walker exercises every prime case without requiring real data.
        const syntheticMetrics: Record<string, number> = {};
        const synthRows: Record<string, unknown>[] = [
          { amount: 100, category: 'A', district: 'D1' },
          { amount: 50,  category: 'B', district: 'D1' },
          { amount: 200, category: 'A', district: 'D2' },
        ];
        // Seed common reference targets used by Phase 0 inventory
        syntheticMetrics['revenue']               = 1000;
        syntheticMetrics['period_equipment_revenue'] = 1000;
        syntheticMetrics['consumable_revenue']    = 1200;
        syntheticMetrics['monthly_quota']         = 1000;
        syntheticMetrics['warranty_sales']        = 800;
        syntheticMetrics['insurance_sales']       = 500;
        syntheticMetrics['store_goal_attainment'] = 110;
        syntheticMetrics['cross_sell_count']      = 3;
        syntheticMetrics['equipment_deal_count']  = 2;
        syntheticMetrics['equipment_revenue']     = 5000;
        syntheticMetrics['actual_units']          = 12;
        syntheticMetrics['target_units']          = 10;
        syntheticMetrics['cross_sell_executed']   = 1;

        const context: EvalContext = {
          entity: { metadata: { entityId: 'synth-e1', district: 'D1', region: 'R1' } },
          activeRows: synthRows,
          allEntityRows: [
            { entityMetadata: { entityId: 'synth-e1', district: 'D1' }, row: synthRows[0] },
            { entityMetadata: { entityId: 'synth-e2', district: 'D1' }, row: synthRows[1] },
            { entityMetadata: { entityId: 'synth-e3', district: 'D2' }, row: synthRows[2] },
          ],
          metrics: syntheticMetrics,
        };

        try {
          const { dag } = componentIntentToDAG(ci);
          const result = evaluate(dag, context);
          outcomes.push({
            tenantName,
            planName: rs.name,
            componentLabel: ci.label,
            componentIndex: ci.componentIndex,
            status: 'ok',
            outcome: toNumber(result),
            primeRoot: dag.prime,
          });
        } catch (err) {
          if (err instanceof UntranslatableLegacyIntentError) {
            outcomes.push({
              tenantName, planName: rs.name, componentLabel: ci.label,
              componentIndex: ci.componentIndex,
              status: 'untranslatable',
              reason: err.message.slice(0, 200),
            });
          } else if (err instanceof IntentExecutorUnknownOperationError) {
            outcomes.push({
              tenantName, planName: rs.name, componentLabel: ci.label,
              componentIndex: ci.componentIndex,
              status: 'unknown_prime',
              reason: err.message.slice(0, 200),
            });
          } else {
            outcomes.push({
              tenantName, planName: rs.name, componentLabel: ci.label,
              componentIndex: ci.componentIndex,
              status: 'eval_error',
              reason: (err as Error).message.slice(0, 200),
            });
          }
        }
      }
    }
  }

  // Report
  console.log('=== HF-238 Phase 4 Adapter Smoke Test ===\n');
  console.log(`Total components exercised: ${outcomes.length}\n`);

  const byStatus = outcomes.reduce((acc, o) => {
    acc[o.status] = (acc[o.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  console.log('Status summary:', JSON.stringify(byStatus, null, 2));

  const byTenant: Record<string, SmokeOutcome[]> = {};
  for (const o of outcomes) {
    (byTenant[o.tenantName] ??= []).push(o);
  }
  for (const [tenant, list] of Object.entries(byTenant)) {
    console.log(`\n── ${tenant} ──`);
    for (const o of list) {
      const tag = o.status === 'ok' ? `[OK ${o.primeRoot}]` : `[${o.status.toUpperCase()}]`;
      const detail = o.status === 'ok'
        ? `outcome=${o.outcome?.toFixed(2)}`
        : o.reason;
      console.log(`  ${tag} ${o.planName} | comp ${o.componentIndex} "${o.componentLabel}" | ${detail}`);
    }
  }
})();
