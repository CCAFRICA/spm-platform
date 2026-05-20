// DIAG-054 Probe 1: stored DAG intents for BCL, with tree visualization.

import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
const BCL = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';

function visualize(node: unknown, depth = 0): string {
  if (!node || typeof node !== 'object') return `${'  '.repeat(depth)}${JSON.stringify(node)}`;
  const n = node as Record<string, unknown>;
  const pad = '  '.repeat(depth);
  if (typeof n.prime === 'string') {
    const head =
      n.prime === 'arithmetic' ? `arithmetic(${n.op})` :
      n.prime === 'compare'    ? `compare(${n.op})` :
      n.prime === 'logical'    ? `logical(${n.op})` :
      n.prime === 'aggregate'  ? `aggregate(${n.op}, ${n.field})` :
      n.prime === 'reference'  ? `reference(${n.field})` :
      n.prime === 'constant'   ? `constant(${n.value})` :
      n.prime === 'filter'     ? `filter(${JSON.stringify(n.predicate)})` :
      n.prime === 'scope'      ? `scope(${n.boundary})` :
      n.prime === 'conditional'? 'conditional' :
      n.prime === 'prior_period' ? 'prior_period' :
      String(n.prime);
    let out = `${pad}${head}`;
    if (Array.isArray(n.inputs)) {
      for (const c of n.inputs as unknown[]) out += '\n' + visualize(c, depth + 1);
    }
    if (n.downstream) out += '\n' + visualize(n.downstream, depth + 1);
    if (n.condition) out += `\n${pad}  if:\n` + visualize(n.condition, depth + 2);
    if (n.then) out += `\n${pad}  then:\n` + visualize(n.then, depth + 2);
    if (n.else) out += `\n${pad}  else:\n` + visualize(n.else, depth + 2);
    return out;
  }
  if (typeof n.operation === 'string') {
    return `${pad}<LEGACY operation=${n.operation}>`;
  }
  return `${pad}<unknown shape: keys=[${Object.keys(n).join(',')}]>`;
}

function flattenComponents(components: unknown): Array<{ idx: number; variantIdx?: number; name: string; componentType?: string; calculationIntent?: unknown }> {
  const out: Array<{ idx: number; variantIdx?: number; name: string; componentType?: string; calculationIntent?: unknown }> = [];
  if (!components || typeof components !== 'object') return out;
  const c = components as Record<string, unknown>;
  if (Array.isArray(c.variants)) {
    let i = 0;
    for (let v = 0; v < (c.variants as unknown[]).length; v++) {
      const variant = (c.variants as Array<Record<string, unknown>>)[v];
      if (Array.isArray(variant.components)) {
        for (let k = 0; k < (variant.components as unknown[]).length; k++) {
          const comp = (variant.components as Array<Record<string, unknown>>)[k];
          out.push({
            idx: i,
            variantIdx: v,
            name: String(comp.name ?? `c${i}`),
            componentType: typeof comp.componentType === 'string' ? comp.componentType : undefined,
            calculationIntent: comp.calculationIntent,
          });
          i++;
        }
      }
    }
  } else if (Array.isArray(c.components)) {
    for (let i = 0; i < (c.components as unknown[]).length; i++) {
      const comp = (c.components as Array<Record<string, unknown>>)[i];
      out.push({
        idx: i,
        name: String(comp.name ?? `c${i}`),
        componentType: typeof comp.componentType === 'string' ? comp.componentType : undefined,
        calculationIntent: comp.calculationIntent,
      });
    }
  }
  return out;
}

(async () => {
  const { data: allRs } = await sb
    .from('rule_sets')
    .select('id, name, status, components, created_at, updated_at')
    .eq('tenant_id', BCL)
    .eq('status', 'active')
    .order('updated_at', { ascending: false });
  if (!allRs || allRs.length === 0) { console.log('NO ACTIVE BCL RULE SET'); return; }

  console.log('=== DIAG-054 Probe 1: stored DAG intents ===');
  console.log(`BCL active rule_sets: ${allRs.length}`);
  for (const r of allRs) {
    console.log(`  id=${r.id} updated=${r.updated_at} name="${r.name}"`);
  }
  const rs = allRs[0];
  console.log(`\nUsing most-recently-updated: id=${rs.id}\n`);
  const comps = flattenComponents(rs.components);
  console.log(`Flattened component count: ${comps.length}\n`);

  for (const c of comps) {
    console.log(`────────────────────────────────────────`);
    console.log(`Component ${c.idx} (variant ${c.variantIdx ?? '-'}) "${c.name}"`);
    console.log(`componentType: ${c.componentType ?? '<absent>'}`);
    const ci = c.calculationIntent as Record<string, unknown> | undefined;
    if (!ci) { console.log('  calculationIntent: <absent>'); continue; }
    const isPrime = typeof ci.prime === 'string';
    const isLegacy = typeof ci.operation === 'string';
    console.log(`  format: ${isPrime ? 'PRIME-DAG' : isLegacy ? 'LEGACY' : 'UNKNOWN'}`);
    console.log(`  full intent JSON:`);
    console.log(JSON.stringify(ci, null, 2));
    console.log(`  tree visualization:`);
    console.log(visualize(ci));
    console.log();
  }
})();
