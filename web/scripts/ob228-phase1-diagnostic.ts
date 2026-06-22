/**
 * OB-228 Phase 1 — Living Plan Surface diagnostic (READ-ONLY; service-role row introspection).
 * FP-49 compliant: no information_schema/pg_catalog via PostgREST; columns inferred from live rows.
 * Run from web/:  set -a && source .env.local && set +a && npx tsx scripts/ob228-phase1-diagnostic.ts
 *
 * Produces the evidence for docs/diagnostics/OB-228_PHASE1_DIAGNOSTIC.md:
 *   1. MIR tenant resolution
 *   2. FP-49 schema verify (8 tables, row-introspection)
 *   3. rule_sets.components dialect for MIR's plans (verbatim shape)
 *   4. binding resolution (input_bindings -> column present in committed_data.row_data?)
 *   5. recompute-baseline availability (entity_period_outcomes / calculation_results / traces for MIR)
 *   6. periods for MIR
 */
import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const sb = createClient(URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const keysOf = (row: any) => (row ? Object.keys(row).sort() : []);
const short = (id: string | null | undefined) => (id ? String(id).slice(0, 8) : 'NULL');
const trunc = (s: string, n = 1400) => (s.length > n ? s.slice(0, n) + ` …(+${s.length - n} chars)` : s);

async function oneRow(table: string, filter?: (q: any) => any) {
  let q = sb.from(table).select('*').limit(1);
  if (filter) q = filter(q);
  const { data, error } = await q;
  if (error) return { table, error: error.message, cols: [] as string[], row: null as any };
  return { table, error: null as string | null, cols: keysOf(data?.[0]), row: data?.[0] ?? null };
}

async function main() {
  console.log('================ OB-228 PHASE 1 DIAGNOSTIC (read-only) ================\n');

  // ---------- 0. env presence ----------
  console.log('=== 0. ENV PRESENCE (names only) ===');
  for (const k of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
    console.log(`  ${k}: ${process.env[k] ? 'PRESENT' : 'ABSENT'}`);
  }

  // ---------- 1. MIR tenant resolution ----------
  console.log('\n=== 1. MIR TENANT RESOLUTION ===');
  const { data: mirCands, error: tErr } = await sb
    .from('tenants')
    .select('id,name,slug,locale,currency,features,settings')
    .or('name.ilike.%MIR%,slug.ilike.%MIR%');
  if (tErr) console.log(`  tenants query ERROR: ${tErr.message}`);
  for (const t of mirCands ?? []) {
    console.log(`  CANDIDATE id=${t.id} name="${t.name}" slug="${t.slug ?? ''}" locale=${t.locale ?? 'NULL'} currency=${t.currency ?? 'NULL'}`);
    console.log(`    features=${trunc(JSON.stringify(t.features ?? {}), 300)}`);
  }
  const mir = (mirCands ?? [])[0];
  if (!mir) { console.log('  !! NO MIR tenant found — HALT (cannot proceed on a guessed id)'); return; }
  const TID: string = mir.id;
  console.log(`  RESOLVED MIR tenant_id = ${TID}`);

  // ---------- 2. FP-49 SCHEMA VERIFY (row introspection) ----------
  console.log('\n=== 2. FP-49 SCHEMA VERIFY (column inventory per table, row-introspection) ===');
  const tables = ['profiles', 'profile_scope', 'rule_sets', 'committed_data', 'entity_period_outcomes', 'calculation_results', 'calculation_traces', 'periods'];
  const schema: Record<string, string[]> = {};
  for (const t of tables) {
    // prefer a MIR-scoped row where the table carries tenant_id
    let r = await oneRow(t, (q) => q.eq('tenant_id', TID));
    if (!r.row) r = await oneRow(t); // fallback any row (table may be empty for MIR)
    schema[t] = r.cols;
    console.log(`  ${t} (${r.cols.length} cols)${r.error ? ' ERROR=' + r.error : ''}: [${r.cols.join(', ')}]`);
  }
  // persona-column determination (HALT-3 input)
  console.log('\n  -- persona/role column determination (HALT-3 input) --');
  const profileCols = schema['profiles'] ?? [];
  const personaCandidates = profileCols.filter((c) => /persona|role|capab/i.test(c));
  console.log(`  profiles persona/role/capability candidate columns: [${personaCandidates.join(', ')}]`);
  console.log(`  literal 'persona' column present: ${profileCols.includes('persona')}`);
  console.log(`  'role' column present: ${profileCols.includes('role')} ; 'capabilities' present: ${profileCols.includes('capabilities')}`);
  console.log(`  HALT-3 verdict: ${personaCandidates.length === 0 ? 'FIRE (no persona/role column)' : 'CLEAR (seam resolves from ' + personaCandidates.join('/') + ')'}`);
  // profile_scope columns
  console.log(`  profile_scope cols: [${(schema['profile_scope'] ?? []).join(', ')}]`);

  // sample MIR profiles (role distribution)
  const { data: mirProfiles } = await sb.from('profiles').select('id,email,role,capabilities,locale').eq('tenant_id', TID);
  console.log(`\n  -- MIR profiles (${mirProfiles?.length ?? 0}) --`);
  for (const p of mirProfiles ?? []) {
    const cap = p.capabilities;
    const capShape = Array.isArray(cap) ? `ARRAY[${cap.length}]` : cap === null ? 'NULL' : typeof cap;
    console.log(`    ${p.email} role=${p.role} locale=${p.locale ?? 'NULL'} cap=${capShape} ${trunc(JSON.stringify(cap ?? null), 200)}`);
  }
  // sample MIR profile_scope
  const { data: mirScopes } = await sb.from('profile_scope').select('*').eq('tenant_id', TID);
  console.log(`\n  -- MIR profile_scope rows (${mirScopes?.length ?? 0}) --`);
  for (const s of mirScopes ?? []) {
    console.log(`    profile=${short(s.profile_id)} scope_type=${s.scope_type} rs=${(s.visible_rule_set_ids ?? []).length} ent=${(s.visible_entity_ids ?? []).length} per=${(s.visible_period_ids ?? []).length}`);
  }

  // ---------- 3. rule_sets.components DIALECT for MIR ----------
  console.log('\n=== 3. rule_sets.components DIALECT (MIR plans, verbatim shape) ===');
  const { data: ruleSets, error: rsErr } = await sb
    .from('rule_sets')
    .select('id,name,status,version,effective_from,effective_to,components,input_bindings,population_config,metadata')
    .eq('tenant_id', TID)
    .order('created_at', { ascending: true });
  if (rsErr) console.log(`  rule_sets query ERROR: ${rsErr.message}`);
  console.log(`  MIR rule_sets count = ${ruleSets?.length ?? 0}`);

  const describeShape = (v: any, depth = 0): string => {
    if (v === null) return 'null';
    if (Array.isArray(v)) return `Array[${v.length}]${v.length ? ' of ' + describeShape(v[0], depth + 1) : ''}`;
    if (typeof v === 'object') return `{${Object.keys(v).slice(0, 18).join(', ')}}`;
    return typeof v;
  };

  const dialectFindings: any[] = [];
  for (const rs of ruleSets ?? []) {
    console.log(`\n  ───── PLAN "${rs.name}" id=${rs.id} status=${rs.status} v${rs.version} eff=${rs.effective_from ?? '∅'}..${rs.effective_to ?? '∅'} ─────`);
    const comp = rs.components;
    console.log(`    components TOP-LEVEL shape: ${describeShape(comp)}`);
    // canonical = configuration.variants[].components[]  vs  array dialect
    let variants: any[] = [];
    let dialect = 'UNKNOWN';
    if (comp && typeof comp === 'object' && !Array.isArray(comp)) {
      if (comp.configuration?.variants) { variants = comp.configuration.variants; dialect = 'configuration.variants[]'; }
      else if (comp.variants) { variants = comp.variants; dialect = 'variants[] (no configuration wrapper)'; }
      else { dialect = 'OBJECT (keys: ' + Object.keys(comp).join(',') + ')'; }
    } else if (Array.isArray(comp)) {
      // OB-227 array dialect: components is itself the array
      variants = [{ components: comp }];
      dialect = 'Array dialect (components[] at top level)';
    }
    console.log(`    DIALECT: ${dialect}; variant count = ${variants.length}`);
    let totalComps = 0;
    const typeTally: Record<string, number> = {};
    for (let vi = 0; vi < variants.length; vi++) {
      const v = variants[vi];
      const vcomps = v?.components ?? v?.componentList ?? [];
      console.log(`      variant[${vi}] keys={${Object.keys(v ?? {}).join(',')}} name="${v?.variantName ?? v?.name ?? '∅'}" components=${Array.isArray(vcomps) ? vcomps.length : 'NON-ARRAY:' + describeShape(vcomps)}`);
      for (const c of Array.isArray(vcomps) ? vcomps : []) {
        totalComps++;
        const ct = c.componentType ?? c.type ?? c.component_type ?? '∅';
        typeTally[ct] = (typeTally[ct] ?? 0) + 1;
        if (totalComps <= 3) {
          console.log(`        comp keys={${Object.keys(c).join(',')}}`);
          console.log(`          componentType=${ct} name="${c.name ?? c.componentName ?? c.label ?? '∅'}"`);
          const cfgKeys = Object.keys(c).filter((k) => /config|tier|matrix|percentage|conditional|rate|band/i.test(k));
          for (const ck of cfgKeys) console.log(`          ${ck}: ${trunc(JSON.stringify(c[ck]), 600)}`);
          if (c.calculationIntent) console.log(`          calculationIntent: ${trunc(JSON.stringify(c.calculationIntent), 500)}`);
          if (c.confidence !== undefined) console.log(`          confidence=${c.confidence}`);
        }
      }
    }
    console.log(`    TOTAL components = ${totalComps}; type tally = ${JSON.stringify(typeTally)}`);
    // input_bindings + convergence_bindings shape
    const ib = rs.input_bindings;
    console.log(`    input_bindings shape: ${describeShape(ib)}`);
    if (ib && typeof ib === 'object') {
      console.log(`      input_bindings keys: [${Object.keys(ib).join(', ')}]`);
      if (ib.convergence_bindings) console.log(`      convergence_bindings: ${trunc(JSON.stringify(ib.convergence_bindings), 1200)}`);
    }
    console.log(`    population_config: ${trunc(JSON.stringify(rs.population_config ?? {}), 400)}`);
    console.log(`    metadata keys: [${Object.keys(rs.metadata ?? {}).join(', ')}]`);
    dialectFindings.push({ id: rs.id, name: rs.name, dialect, variants: variants.length, totalComps, typeTally });
  }

  // ---------- 4. BINDING RESOLUTION ----------
  console.log('\n=== 4. BINDING RESOLUTION (input_bindings column -> present in committed_data.row_data?) ===');
  // Sample committed_data row_data keys for MIR (union over a sample)
  const { data: cdSample } = await sb.from('committed_data').select('data_type,row_data,metadata,source_date,period_id').eq('tenant_id', TID).limit(300);
  const rowDataKeys = new Set<string>();
  const dataTypes = new Set<string>();
  const sheetNames = new Set<string>();
  for (const r of cdSample ?? []) {
    dataTypes.add(r.data_type);
    if (r.metadata?._sheetName) sheetNames.add(r.metadata._sheetName);
    for (const k of Object.keys(r.row_data ?? {})) rowDataKeys.add(k);
  }
  console.log(`  committed_data sample=${cdSample?.length ?? 0}; data_types=${JSON.stringify([...dataTypes])}`);
  console.log(`  sheets (_sheetName)=${JSON.stringify([...sheetNames])}`);
  console.log(`  row_data UNION keys (${rowDataKeys.size}): [${[...rowDataKeys].sort().join(', ')}]`);
  const { count: cdCount } = await sb.from('committed_data').select('*', { count: 'exact', head: true }).eq('tenant_id', TID);
  console.log(`  committed_data TOTAL rows for MIR = ${cdCount}`);

  // For each plan's convergence bindings, check if bound columns appear in row_data keys
  for (const rs of ruleSets ?? []) {
    const cb = rs.input_bindings?.convergence_bindings;
    if (!cb) { console.log(`\n  plan "${rs.name}": NO convergence_bindings -> binding-source check skipped`); continue; }
    console.log(`\n  plan "${rs.name}" convergence_bindings resolution:`);
    const flat = Array.isArray(cb) ? cb : Object.entries(cb).map(([k, v]) => ({ key: k, ...(typeof v === 'object' ? v : { value: v }) }));
    for (const b of flat.slice(0, 30)) {
      const col = (b as any).column ?? (b as any).boundColumn ?? (b as any).source_column ?? (b as any).value ?? null;
      const present = col ? rowDataKeys.has(col) : null;
      console.log(`    ${trunc(JSON.stringify(b), 220)} -> column=${col ?? '∅'} presentInRowData=${present === null ? 'N/A' : present} ${present === false ? '<<< HALT-2 CANDIDATE' : ''}`);
    }
  }

  // ---------- 5. RECOMPUTE-BASELINE AVAILABILITY ----------
  console.log('\n=== 5. RECOMPUTE-BASELINE AVAILABILITY (entity_period_outcomes / calculation_results / traces for MIR) ===');
  const { count: epoCount } = await sb.from('entity_period_outcomes').select('*', { count: 'exact', head: true }).eq('tenant_id', TID);
  const { count: crCount } = await sb.from('calculation_results').select('*', { count: 'exact', head: true }).eq('tenant_id', TID);
  const { count: ctCount } = await sb.from('calculation_traces').select('*', { count: 'exact', head: true }).eq('tenant_id', TID);
  const { count: cbCount } = await sb.from('calculation_batches').select('*', { count: 'exact', head: true }).eq('tenant_id', TID);
  console.log(`  entity_period_outcomes (MIR) = ${epoCount}`);
  console.log(`  calculation_results (MIR) = ${crCount}`);
  console.log(`  calculation_traces (MIR) = ${ctCount}`);
  console.log(`  calculation_batches (MIR) = ${cbCount}`);
  const { data: epoSample } = await sb.from('entity_period_outcomes').select('entity_id,period_id,total_payout,component_breakdown,lowest_lifecycle_state').eq('tenant_id', TID).limit(2);
  for (const e of epoSample ?? []) {
    console.log(`  EPO sample: entity=${short(e.entity_id)} period=${short(e.period_id)} payout=${e.total_payout} state=${e.lowest_lifecycle_state}`);
    console.log(`    component_breakdown shape: ${describeShape(e.component_breakdown)} = ${trunc(JSON.stringify(e.component_breakdown), 400)}`);
  }
  const { data: crSample } = await sb.from('calculation_results').select('entity_id,period_id,total_payout,components,metrics').eq('tenant_id', TID).limit(1);
  for (const c of crSample ?? []) {
    console.log(`  CR sample: entity=${short(c.entity_id)} payout=${c.total_payout}`);
    console.log(`    components shape: ${describeShape(c.components)}`);
    console.log(`    metrics shape: ${describeShape(c.metrics)} = ${trunc(JSON.stringify(c.metrics), 300)}`);
  }

  // ---------- 6. PERIODS for MIR ----------
  console.log('\n=== 6. PERIODS for MIR ===');
  const { data: periods } = await sb.from('periods').select('id,label,start_date,end_date,status,canonical_key').eq('tenant_id', TID).order('start_date', { ascending: true });
  console.log(`  MIR periods count = ${periods?.length ?? 0}`);
  for (const p of periods ?? []) {
    const { count } = await sb.from('committed_data').select('*', { count: 'exact', head: true }).eq('tenant_id', TID).eq('period_id', p.id);
    console.log(`    ${p.label} (${short(p.id)}) ${p.start_date}..${p.end_date} status=${p.status} committed_rows=${count}`);
  }

  // ---------- SUMMARY ----------
  console.log('\n================ SUMMARY ================');
  console.log(`  MIR tenant_id: ${TID}`);
  console.log(`  rule_sets: ${ruleSets?.length ?? 0}; dialect findings: ${JSON.stringify(dialectFindings.map((d) => ({ name: d.name, dialect: d.dialect, comps: d.totalComps, types: d.typeTally })))}`);
  console.log(`  persona column verdict: ${personaCandidates.length === 0 ? 'HALT-3' : 'role/capabilities present (no HALT-3)'}`);
  console.log(`  baseline availability: EPO=${epoCount} CR=${crCount} traces=${ctCount} -> ${(epoCount ?? 0) > 0 || (crCount ?? 0) > 0 ? 'baseline EXISTS' : 'baseline ABSENT (consequence diff has no baseline)'}`);
  console.log('========================================');
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
