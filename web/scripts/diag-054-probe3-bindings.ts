// DIAG-054 Probe 3: BCL stored input_bindings + cross-reference with DAG references.

import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
const BCL = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';

function extractRefs(node: unknown): string[] {
  if (!node || typeof node !== 'object') return [];
  const refs = new Set<string>();
  const walk = (n: unknown): void => {
    if (!n || typeof n !== 'object') return;
    const o = n as Record<string, unknown>;
    if (o.prime === 'reference' && typeof o.field === 'string') { refs.add(o.field); return; }
    if (o.prime === 'aggregate' && typeof o.field === 'string') { refs.add(o.field); return; }
    if (Array.isArray(o.inputs)) for (const c of o.inputs as unknown[]) walk(c);
    if (o.downstream) walk(o.downstream);
    if (o.condition) walk(o.condition);
    if (o.then) walk(o.then);
    if (o.else) walk(o.else);
  };
  walk(node);
  return Array.from(refs);
}

(async () => {
  const { data: allRs } = await sb
    .from('rule_sets')
    .select('id, name, status, components, input_bindings, updated_at')
    .eq('tenant_id', BCL)
    .eq('status', 'active')
    .order('updated_at', { ascending: false });
  if (!allRs || allRs.length === 0) { console.log('NO ACTIVE BCL RULE SET'); return; }
  const rs = allRs[0];

  console.log('=== DIAG-054 Probe 3: stored input_bindings + DAG cross-reference ===');
  console.log(`Rule set: ${rs.id} (most recent)\n`);

  const ib = rs.input_bindings as Record<string, unknown> | null;
  if (!ib) { console.log('input_bindings: NULL'); return; }
  if (typeof ib !== 'object' || Object.keys(ib).length === 0) { console.log('input_bindings: empty'); return; }

  console.log('--- top-level keys ---');
  console.log(Object.keys(ib));
  console.log();

  const convBindings = (ib.convergence_bindings ?? {}) as Record<string, Record<string, unknown>>;
  console.log(`convergence_bindings: ${Object.keys(convBindings).length} component entries`);
  console.log();

  // Flatten plan components
  const flat: Array<{ idx: number; name: string; componentType?: string; intent?: unknown }> = [];
  const comps = rs.components as Record<string, unknown>;
  if (Array.isArray(comps.variants)) {
    let i = 0;
    for (const v of comps.variants as Array<Record<string, unknown>>) {
      if (Array.isArray(v.components)) {
        for (const c of v.components as Array<Record<string, unknown>>) {
          flat.push({
            idx: i,
            name: String(c.name),
            componentType: typeof c.componentType === 'string' ? c.componentType : undefined,
            intent: c.calculationIntent,
          });
          i++;
        }
      }
    }
  }

  for (const c of flat) {
    console.log(`────────────────────────────────────────`);
    console.log(`Component ${c.idx}: "${c.name}" componentType=${c.componentType}`);
    const binding = convBindings[`component_${c.idx}`] as Record<string, unknown> | undefined;
    if (!binding) { console.log(`  no convergence_bindings entry for component_${c.idx}`); continue; }
    console.log(`  binding keys: [${Object.keys(binding).join(', ')}]`);
    const refs = extractRefs(c.intent);
    console.log(`  DAG reference fields: [${refs.join(', ')}]`);

    // Cross-reference: for each DAG ref, find its binding
    console.log(`  ── per-field binding lookup ──`);
    for (const f of refs) {
      const fb = binding[f] as Record<string, unknown> | undefined;
      if (fb) {
        console.log(`    ${f}:`);
        console.log(`      column=${fb.column} confidence=${fb.confidence} match_pass=${fb.match_pass} scale_factor=${fb.scale_factor ?? '(none)'} filters=${Array.isArray(fb.filters) ? fb.filters.length : 'absent'}`);
      } else {
        console.log(`    ${f}: ⚠ NO BINDING — reference will resolve to 0 at evaluation`);
      }
    }

    // Reverse check: any binding key NOT in DAG refs?
    const STRUCTURAL = new Set(['entity_identifier', 'period', 'row', 'column', 'actual', 'target', 'numerator', 'denominator']);
    const orphans = Object.keys(binding).filter(k => !STRUCTURAL.has(k) && !refs.includes(k));
    if (orphans.length > 0) {
      console.log(`  ⚠ orphan bindings (no DAG ref to consume): [${orphans.join(', ')}]`);
    }
    console.log();
  }
})();
