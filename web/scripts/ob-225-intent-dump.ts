import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const MIR = '972c8eb0-e3ae-4e4c-ad30-8b34804c893a';
const BCL = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';

function line(s = '') { console.log(s); }
function hr(label: string) { line(); line('='.repeat(80)); line(label); line('='.repeat(80)); }

// Enumerate every component object across the variants[].components[] shape
function enumComponents(components: any): { variantId: string; comp: any }[] {
  const out: { variantId: string; comp: any }[] = [];
  if (!components) return out;
  if (Array.isArray(components.variants)) {
    for (const v of components.variants) {
      const vid = v.variantId ?? v.id ?? '?';
      for (const c of (v.components ?? [])) out.push({ variantId: vid, comp: c });
    }
  } else if (Array.isArray(components)) {
    for (const c of components) out.push({ variantId: 'all', comp: c });
  } else if (components.components && Array.isArray(components.components)) {
    for (const c of components.components) out.push({ variantId: 'all', comp: c });
  }
  return out;
}

// Summarize §4.1 structural properties a compositional_intent declares
function summarizeIntent(ci: any): string {
  if (!ci || typeof ci !== 'object') return '(none)';
  const props: string[] = [];
  const st = ci.structure ?? {};
  const text = JSON.stringify(ci).toLowerCase();
  // categories
  if (/categor/i.test(JSON.stringify(ci)) || /\b(ali|beb|lim|cpe)\b/i.test(JSON.stringify(ci))) props.push('categories');
  // gate / conditional accelerator
  if (st.shape === 'conditional' || /"shape":"conditional"/.test(JSON.stringify(ci)) || text.includes('accelerator') || text.includes('gate')) props.push('gate/conditional');
  // count
  if (text.includes('count') || text.includes('"op":"count"')) props.push('count');
  // tiers / matrix / bands
  if (text.includes('tier') || text.includes('matrix') || text.includes('band') || st.shape === 'tiered' || st.shape === 'matrix') props.push('tiers/bands');
  // modifier (clawback / reversal / adjustment)
  if (text.includes('clawback') || text.includes('reversal') || text.includes('modifier') || text.includes('devolucion') || text.includes('ajuste') || text.includes('negat')) props.push('modifier/clawback');
  // temporal
  if (text.includes('temporal') || text.includes('month') || text.includes('mensual') || text.includes('period') || text.includes('cuota') || text.includes('effective') || text.includes('range')) props.push('temporal');
  // scale
  if (ci.scale !== undefined && ci.scale !== null) props.push(`scale=${JSON.stringify(ci.scale)}`);
  // output precision
  if (ci.output_precision !== undefined) props.push(`precision=${ci.output_precision}`);
  return props.length ? props.join(', ') : '(no recognized structural flags)';
}

async function dumpTenant(tenantId: string, label: string, full: boolean) {
  hr(`${label} — active rule_sets`);
  const { data: sets, error } = await sb
    .from('rule_sets')
    .select('id, name, status, components, updated_at')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .order('updated_at', { ascending: true });
  if (error) { line('ERROR: ' + error.message); return; }
  line(`Found ${sets?.length ?? 0} active rule_sets`);

  for (const rs of sets ?? []) {
    line();
    line('#'.repeat(80));
    line(`# rule_set id=${rs.id}`);
    line(`# name=${JSON.stringify(rs.name)}`);
    const comps = enumComponents(rs.components);
    line(`# components found: ${comps.length}  (path: components.variants[].components[])`);
    line('#'.repeat(80));

    for (const { variantId, comp } of comps) {
      const ci = comp?.metadata?.compositional_intent ?? null;
      const dag = comp?.calculationIntent ?? comp?.metadata?.intent ?? null;
      line();
      line(`--- component id=${comp?.id ?? '?'}  name=${JSON.stringify(comp?.name ?? '?')}  variant=${variantId}  type=${comp?.componentType ?? '?'}  level=${comp?.measurementLevel ?? '?'}`);
      line(`    §4.1 structural properties: ${summarizeIntent(ci)}`);
      line(`    construction_method=${comp?.metadata?.construction_method ?? '(none)'}`);
      line(`    COMPOSITIONAL_INTENT path=...components[].metadata.compositional_intent:`);
      line('      ' + (ci ? JSON.stringify(ci) : '(NULL)'));
      line(`    PRIME_DAG / calculationIntent path=...components[].calculationIntent:`);
      const ds = dag ? JSON.stringify(dag) : '(NULL)';
      line('      ' + (full ? ds : (ds.length > 6000 ? ds.slice(0, 6000) + '…[truncated]' : ds)));
    }
  }
}

async function main() {
  // STEP 1 + 2: structure discovery on first MIR rule_set
  hr('STEP 1: MIR active rule_sets (id / name / components typeof)');
  const { data: mirSets } = await sb.from('rule_sets').select('id, name, components').eq('tenant_id', MIR).eq('status', 'active');
  for (const rs of mirSets ?? []) {
    const c = rs.components;
    const typ = Array.isArray(c) ? `array[${c.length}]` : (c && c.variants ? `object{variants[${c.variants.length}]}` : typeof c);
    line(`  id=${rs.id}  name=${JSON.stringify(rs.name)}  components=${typ}`);
  }

  hr('STEP 2: REAL nesting (discovered)');
  line('rule_sets.components is an OBJECT: { variants: [ { variantId, components: [ {component} ] } ] }');
  line('Per component:');
  line('  compositional_intent  ->  components.variants[V].components[C].metadata.compositional_intent');
  line('  prime DAG             ->  components.variants[V].components[C].calculationIntent  (also mirrored at .metadata.intent)');
  line('Directive path components->variant_0->components->0->metadata->compositional_intent is WRONG:');
  line('  - key is "variants" (array, not "variant_0")');
  line('  - the runnable prime DAG lives at component-level "calculationIntent", not under metadata');

  // STEP 3: full extraction
  await dumpTenant(MIR, 'MIR (5 plans)', false);
  await dumpTenant(BCL, 'BCL (HALT-REGRESSION anchor)', false);

  hr('DONE');
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
