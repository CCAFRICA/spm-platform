/**
 * DIAG-063 / E5 — Constructor boundary shape census, pass 2 (READ-ONLY).
 *
 * Pass 1 assumed rule_sets.components is a top-level array; all rows reported 0.
 * This pass prints the STRUCTURAL TYPE and top-level KEYS of the components JSONB
 * (keys only — no values), then classifies component entries found under any
 * array-valued top-level key by the same structural discriminators:
 *   prime_node / legacy_operation / variants / none_or_other.
 * Anonymization: tenant UUIDs only; counts, keys, and discriminators only.
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

type Shape = 'prime_node' | 'legacy_operation' | 'variants' | 'none_or_other';

function classify(comp: Record<string, unknown>): { shape: Shape; method: string } {
  const ci = (comp?.calculationIntent ?? comp?.calculation_intent) as Record<string, unknown> | undefined | null;
  const meta = (comp?.metadata ?? {}) as Record<string, unknown>;
  const method = typeof meta.construction_method === 'string' ? meta.construction_method : '(absent)';
  if (ci && typeof ci === 'object') {
    if (typeof ci.prime === 'string') return { shape: 'prime_node', method };
    const inner = ci.intent as Record<string, unknown> | undefined;
    if (inner && typeof inner === 'object' && typeof inner.prime === 'string') return { shape: 'prime_node', method };
    if (ci.variants) return { shape: 'variants', method };
    if (typeof ci.operation === 'string') return { shape: 'legacy_operation', method };
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
  for (const rs of data ?? []) {
    const c = rs.components as unknown;
    const jsType = Array.isArray(c) ? 'array' : c === null ? 'null' : typeof c;
    const keys = c && typeof c === 'object' && !Array.isArray(c) ? Object.keys(c as object) : [];
    console.log(`rule_set=${rs.id} tenant=${rs.tenant_id} status=${rs.status} components_jsType=${jsType} topLevelKeys=[${keys.join(',')}]`);
    if (c && typeof c === 'object' && !Array.isArray(c)) {
      for (const [k, v] of Object.entries(c as Record<string, unknown>)) {
        if (!Array.isArray(v)) continue;
        const local: Record<Shape, number> = { prime_node: 0, legacy_operation: 0, variants: 0, none_or_other: 0 };
        for (const entry of v as Record<string, unknown>[]) {
          // variant containers: entries may nest their own components array
          const nested = entry && typeof entry === 'object' && Array.isArray((entry as Record<string, unknown>).components)
            ? ((entry as Record<string, unknown>).components as Record<string, unknown>[])
            : [entry];
          for (const comp of nested) {
            const { shape, method } = classify(comp ?? {});
            local[shape] += 1; global[shape] += 1;
            methodCounts[method] = (methodCounts[method] ?? 0) + 1;
          }
        }
        console.log(`  key=${k} arrayLen=${(v as unknown[]).length} prime_node=${local.prime_node} legacy_operation=${local.legacy_operation} variants=${local.variants} none_or_other=${local.none_or_other}`);
      }
    }
  }
  console.log('--- global component shape census ---');
  console.log(JSON.stringify(global));
  console.log('--- construction_method marker census ---');
  console.log(JSON.stringify(methodCounts));
}

main();
