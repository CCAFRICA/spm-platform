/**
 * HF-281 Phase 0.5 — evidence: which tokens each component binding carries for
 * Meridian rule_set be74de80, and what tokens each component's intent REQUIRES.
 * Settles cause (a) requirements-omitted / (b) validated-partial / (c) stale.
 * Read-only.
 */
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const RS = 'be74de80-6885-4b89-a949-3cce2361a786';

// Walk a PrimeNode DAG collecting every `reference` field (the intent's required tokens).
function refsOf(node: any, out: Set<string>): void {
  if (!node || typeof node !== 'object') return;
  if (node.prime === 'reference' && typeof node.field === 'string') out.add(node.field);
  for (const v of Object.values(node)) {
    if (Array.isArray(v)) v.forEach(x => refsOf(x, out));
    else if (v && typeof v === 'object') refsOf(v, out);
  }
}

async function main() {
  const { data: rs } = await supabase.from('rule_sets').select('id, name, input_bindings, components, convergence_version:input_bindings').eq('id', RS).single();
  if (!rs) { console.log('rule_set not found'); return; }
  const ib: any = rs.input_bindings ?? {};
  console.log(`rule_set ${rs.id} "${rs.name}"`);
  console.log(`input_bindings top-level keys: ${JSON.stringify(Object.keys(ib))}`);
  console.log(`convergence_version=${ib.convergence_version ?? '(none)'}`);

  // Build index->(variantId, name, requiredTokens) from components.variants[].components[]
  const variants: any[] = Array.isArray((rs.components as any)?.variants) ? (rs.components as any).variants : [];
  const compByIndex = new Map<number, { variantId: string; name: string; required: string[] }>();
  for (const v of variants) {
    for (const c of (v.components ?? [])) {
      const intent = c.calculationIntent ?? c.metadata?.intent ?? c.intent;
      const s = new Set<string>(); refsOf(intent, s);
      // index: components carry `index` or order; try several
      const idx = typeof c.index === 'number' ? c.index : (typeof c.order === 'number' ? c.order : undefined);
      console.log(`\n  [${v.variantId}] "${c.name}" index=${idx} requiredTokens(intent refs)=[${Array.from(s).join(', ')}]`);
      if (idx !== undefined) compByIndex.set(idx, { variantId: v.variantId, name: c.name, required: Array.from(s) });
    }
  }

  // convergence_bindings keyed component_<index>
  const cb: any = ib.convergence_bindings ?? {};
  console.log(`\n=== convergence_bindings (${Object.keys(cb).length} component keys) ===`);
  for (const key of Object.keys(cb).sort()) {
    const entry = cb[key];
    const roles = entry && typeof entry === 'object' ? Object.keys(entry) : [];
    const detail = roles.map(r => {
      const e = entry[r];
      const col = e?.column ?? '';
      const mp = e?.match_pass;
      const rf = e?.resolutionFailure ? `FAILED(${e.resolutionFailure.token}:${e.resolutionFailure.reason})` : '';
      return `${r}->${col || '(empty)'}[mp=${mp}]${rf}`;
    });
    console.log(`  ${key}: roles=[${roles.join(', ')}]`);
    for (const d of detail) console.log(`      ${d}`);
  }
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
