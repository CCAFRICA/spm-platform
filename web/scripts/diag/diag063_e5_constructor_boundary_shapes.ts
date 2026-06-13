/**
 * DIAG-063 / E5 — Constructor boundary shape census (READ-ONLY).
 *
 * For every rule_sets row, classify each persisted component's calculationIntent
 * by STRUCTURAL discriminator only:
 *   - prime_node      : intent carries { prime: <string> }  → constructor-built (constructTree)
 *                       or wrapped as { intent: { prime } } (ComponentIntent hydration shape)
 *   - legacy_operation: intent carries { operation: <string> } or { intent: { operation } }
 *                       → execution-time translation via legacyIntentToDAG (constructor BYPASS)
 *   - variants        : intent carries { variants } → componentIntentToDAG variant routing
 *   - none/other      : absent or unrecognized shape
 * Also counts construction_method markers in component metadata when present.
 *
 * Anonymization: tenant UUIDs only; no tenant name/slug selected; no component
 * names, no values printed — counts and structural discriminators only.
 * Korean Test: classification keys on structural field presence only.
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

type Shape = 'prime_node' | 'legacy_operation' | 'variants' | 'none_or_other';

function classify(comp: Record<string, unknown>): { shape: Shape; method: string } {
  const ci = comp.calculationIntent as Record<string, unknown> | undefined | null;
  const meta = (comp.metadata ?? {}) as Record<string, unknown>;
  const method = typeof meta.construction_method === 'string' ? meta.construction_method : '(absent)';
  if (ci && typeof ci === 'object') {
    if (typeof (ci as Record<string, unknown>).prime === 'string') return { shape: 'prime_node', method };
    const inner = (ci as Record<string, unknown>).intent as Record<string, unknown> | undefined;
    if (inner && typeof inner === 'object' && typeof inner.prime === 'string') return { shape: 'prime_node', method };
    if ((ci as Record<string, unknown>).variants) return { shape: 'variants', method };
    if (typeof (ci as Record<string, unknown>).operation === 'string') return { shape: 'legacy_operation', method };
    if (inner && typeof inner === 'object' && typeof inner.operation === 'string') return { shape: 'legacy_operation', method };
  }
  return { shape: 'none_or_other', method };
}

async function main() {
  const { data, error } = await supabase
    .from('rule_sets')
    .select('id, tenant_id, status, components');
  if (error) { console.error('query error:', error.message); process.exit(1); }

  const global: Record<Shape, number> = { prime_node: 0, legacy_operation: 0, variants: 0, none_or_other: 0 };
  const methodCounts: Record<string, number> = {};
  console.log(`rule_sets rows: ${data?.length ?? 0}`);
  for (const rs of data ?? []) {
    const comps = Array.isArray(rs.components) ? (rs.components as Record<string, unknown>[]) : [];
    const local: Record<Shape, number> = { prime_node: 0, legacy_operation: 0, variants: 0, none_or_other: 0 };
    for (const c of comps) {
      const { shape, method } = classify(c ?? {});
      local[shape] += 1;
      global[shape] += 1;
      methodCounts[method] = (methodCounts[method] ?? 0) + 1;
    }
    console.log(
      `rule_set=${rs.id} tenant=${rs.tenant_id} status=${rs.status} components=${comps.length} ` +
      `prime_node=${local.prime_node} legacy_operation=${local.legacy_operation} ` +
      `variants=${local.variants} none_or_other=${local.none_or_other}`,
    );
  }
  console.log('--- global component shape census ---');
  console.log(JSON.stringify(global));
  console.log('--- construction_method marker census ---');
  console.log(JSON.stringify(methodCounts));
}

main();
