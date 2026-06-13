// DIAG-068 — read-only. Q1 (required-token set across rule_sets) + bindings + Q4 (column comprehension).
// No mutation. SELECT only. Uses the REAL exported requiredTokensForComponent (the gate's own token source).
// Run from web/:  set -a && source .env.local && set +a && npx tsx scripts/diag/diag068-meridian-reads.ts
import { createClient } from '@supabase/supabase-js';
import { requiredTokensForComponent } from '../../src/lib/intelligence/convergence-service';

const PREFIXES = ['8affd52c', 'be74de80', 'cac8c891'];

// Faithful re-statement of extractComponents' variant-flattening (convergence-service.ts:782-814):
// variants flattened in declaration order; flat index = component_<i>; variantId aligned by index.
function flatten(componentsJson: any): Array<{ index: number; variantId?: string; raw: any }> {
  const out: Array<{ index: number; variantId?: string; raw: any }> = [];
  let comps: any[] = [];
  const vids: Array<string | undefined> = [];
  if (Array.isArray(componentsJson)) { comps = componentsJson; comps.forEach(() => vids.push(undefined)); }
  else if (componentsJson && typeof componentsJson === 'object' && Array.isArray(componentsJson.variants)) {
    for (const v of componentsJson.variants) {
      const variantId = typeof v.variantId === 'string' ? v.variantId : undefined;
      for (const c of (v.components ?? [])) { comps.push(c); vids.push(variantId); }
    }
  }
  let idx = 0;
  for (let i = 0; i < comps.length; i++) {
    if (comps[i]?.enabled === false) continue;       // mirror extractComponents skip
    out.push({ index: idx, variantId: vids[i], raw: comps[i] });
    idx++;
  }
  return out;
}

function planComponent(index: number, variantId: string | undefined, raw: any) {
  return {
    index, variantId,
    name: (raw.name || raw.id || `Component ${index}`) as string,
    calculationIntent: raw.calculationIntent,
    expectedMetrics: Array.isArray(raw.expectedMetrics) ? raw.expectedMetrics : [],
    componentType: raw.componentType,
  } as any;
}

async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

  // resolve full rows for the three rule_set generations
  const { data: rsAll, error } = await sb.from('rule_sets').select('id, tenant_id, name, status, version, created_at, components, input_bindings').order('created_at', { ascending: true });
  if (error) { console.error('rule_sets read failed:', error.message); process.exit(1); }
  const rows = (rsAll ?? []).filter(r => PREFIXES.some(p => String(r.id).startsWith(p)));

  console.log('================ DIAG-068 Q1 — required-token set per rule_set × variant ================\n');
  console.log('rule_set rows matched:', rows.map(r => `${String(r.id).slice(0,8)} (${r.status}, v${r.version}, ${r.created_at})`).join('  |  ') || 'NONE');
  let meridianTenant = '';
  for (const p of PREFIXES) {
    const r = rows.find(x => String(x.id).startsWith(p));
    if (!r) { console.log(`\n── rule_set ${p}… : ABSENT FROM DB (HALT-2 note: not inspectable) ──`); continue; }
    meridianTenant = String(r.tenant_id);
    console.log(`\n──────── rule_set ${String(r.id)} (${r.name}; status=${r.status}; created ${r.created_at}) ────────`);
    const comps = flatten(r.components);
    const util = comps.filter(c => /utiliz/i.test(c.raw?.name ?? ''));
    if (util.length === 0) console.log('  (no component name matching /utiliz/i)');
    for (const c of util) {
      const pc = planComponent(c.index, c.variantId, c.raw);
      const reqTokens = requiredTokensForComponent(pc);
      console.log(`\n  component_${c.index}  variant=${c.variantId ?? '(none)'}  name="${pc.name}"  type=${pc.componentType ?? '(none)'}`);
      console.log(`    REQUIRED TOKENS (requiredTokensForComponent): [${reqTokens.join(', ')}]`);
      console.log(`    calculationIntent: ${JSON.stringify(pc.calculationIntent)}`);
      // stored binding for this component key, if any
      const ib = (r.input_bindings ?? {}) as any;
      const cb = ib.convergence_bindings?.[`component_${c.index}`];
      if (cb) {
        const rolesum = Object.entries(cb).map(([role, e]: any) => `${role}→${e?.column ?? '∅'}(mp=${e?.match_pass})`).join('  ');
        console.log(`    STORED BINDING component_${c.index}: ${rolesum}`);
      } else {
        console.log(`    STORED BINDING component_${c.index}: (none in input_bindings.convergence_bindings)`);
      }
    }
  }

  // ================ Q4 — Cargas_Flota_Hub column comprehension ================
  console.log('\n\n================ DIAG-068 Q4 — Cargas_Flota_Hub classification ================\n');
  if (!meridianTenant) { console.log('no Meridian tenant resolved (no inspectable rule_set) — Q4 skipped'); }
  else {
    console.log('Meridian tenant_id =', meridianTenant);
    const { data: sigs } = await sb.from('classification_signals')
      .select('signal_type, classification, decision_source, sheet_name, source_file_name, created_at, signal_value, header_comprehension')
      .eq('tenant_id', meridianTenant)
      .order('created_at', { ascending: false })
      .limit(2000);
    const hits = (sigs ?? []).filter(s => JSON.stringify(s).toLowerCase().includes('cargas_flota_hub'));
    console.log(`classification_signals scanned: ${sigs?.length ?? 0}; rows mentioning 'cargas_flota_hub': ${hits.length}`);
    for (const h of hits.slice(0, 8)) {
      const hc = h.header_comprehension as any;
      console.log(`  [${h.created_at}] type=${h.signal_type} class=${h.classification} src=${h.decision_source} sheet=${h.sheet_name} file=${h.source_file_name}`);
      if (hc) console.log(`     header_comprehension: ${JSON.stringify(hc).slice(0, 400)}`);
    }
    if (hits.length === 0) console.log("  NO classification_signals mention 'cargas_flota_hub' for this tenant (confirming negative).");
  }
}
main().catch(e => { console.error(e); process.exit(1); });
