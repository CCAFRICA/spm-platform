/**
 * DIAG-063 / B4 — Rule-set structural shape for rep-level trajectory (READ-ONLY)
 *
 * computeRepTrajectory (trajectory-engine.ts:229-236) emits cards only for
 * additive_lookup configs and returns empty for weighted_kpi. This probe reads
 * the structural type/operation identifiers from rule_sets.components for the
 * two tenants that passed the >=2-calculated-periods gate.
 *
 * Anonymization: tenant/rule-set UUIDs only; no rule set names selected.
 * Korean Test: registry-derived structural identifiers only; no data literals.
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const GATE_PASS_TENANTS = [
  'b1c2d3e4-aaaa-bbbb-cccc-111111111111',
  '5035b1e8-0754-4527-b7ec-9f93f85e4c79',
];

async function main() {
  const { data, error } = await supabase
    .from('rule_sets')
    .select('id, tenant_id, status, components')
    .in('tenant_id', GATE_PASS_TENANTS);
  if (error) throw error;

  for (const rs of data || []) {
    const comps = rs.components as Record<string, unknown> | unknown[] | null;
    let topType = 'unknown';
    let componentCount = 0;
    const operations = new Set<string>();

    const collectOps = (list: unknown[]) => {
      for (const c of list) {
        componentCount++;
        const comp = c as Record<string, unknown>;
        const meta = (comp.metadata || {}) as Record<string, unknown>;
        const intent = (meta.intent || comp.calculationIntent) as Record<string, unknown> | undefined;
        operations.add(intent?.operation ? String(intent.operation) : 'no_intent');
      }
    };

    if (Array.isArray(comps)) {
      topType = 'array';
      collectOps(comps);
    } else if (comps && typeof comps === 'object') {
      const obj = comps as Record<string, unknown>;
      topType = String(obj.type ?? 'object_no_type');
      if (Array.isArray(obj.variants)) {
        for (const v of obj.variants as Array<Record<string, unknown>>) {
          if (Array.isArray(v.components)) collectOps(v.components);
        }
      } else if (Array.isArray(obj.components)) {
        collectOps(obj.components);
      }
    }

    console.log(
      `rule_set=${rs.id} tenant=${rs.tenant_id} status=${rs.status} config_type=${topType} components=${componentCount} operations=[${Array.from(operations).join(', ')}]`
    );
  }
  console.log(`total rule_sets across gate-pass tenants: ${(data || []).length}`);
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
