/**
 * HF-373 EPG-0.2 read-only probe: variant matcher evidence (VLTEST2).
 * READ-ONLY: selects only.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const VLTEST2 = '5b078b52-55c9-4612-8f86-96038c198bfe';

async function main() {
  // ── 1. rule_sets for VLTEST2 ──
  const { data: ruleSets, error: rsErr } = await sb
    .from('rule_sets')
    .select('id, name, components, population_config, metadata, status, created_at, updated_at')
    .eq('tenant_id', VLTEST2);
  if (rsErr) console.log('rule_sets ERR', rsErr.message);
  console.log(`=== rule_sets count=${ruleSets?.length} ===`);
  for (const rs of ruleSets ?? []) {
    console.log(`--- rule_set id=${rs.id} name="${rs.name}" status=${rs.status} updated=${rs.updated_at}`);
    const comps = rs.components as any;
    if (Array.isArray(comps)) {
      console.log(`  components = FLAT ARRAY len=${comps.length} names=[${comps.map((c: any) => c?.name).join(' | ')}]`);
    } else if (comps && typeof comps === 'object') {
      console.log(`  components keys = ${JSON.stringify(Object.keys(comps))}`);
      if (Array.isArray(comps.variants)) {
        console.log(`  VARIANTS count=${comps.variants.length}`);
        comps.variants.forEach((v: any, i: number) => {
          const { components: vc, ...rest } = v ?? {};
          console.log(`  V${i} meta = ${JSON.stringify(rest)}`);
          console.log(`  V${i} components (${Array.isArray(vc) ? vc.length : 0}) = [${(vc ?? []).map((c: any) => c?.name).join(' | ')}]`);
        });
      }
      if (Array.isArray(comps.components)) {
        console.log(`  wrapped components len=${comps.components.length} names=[${comps.components.map((c: any) => c?.name).join(' | ')}]`);
      }
    }
    console.log(`  population_config = ${JSON.stringify(rs.population_config)}`);
  }

  // ── 2. entities: introspect one row's keys, then sample entities with role attr ──
  const { data: oneEnt } = await sb.from('entities').select('*').eq('tenant_id', VLTEST2).limit(1);
  if (oneEnt?.[0]) console.log(`\n=== entities keys = ${JSON.stringify(Object.keys(oneEnt[0]))}`);

  const { data: ents, error: eErr } = await sb
    .from('entities')
    .select('id, external_id, display_name, entity_type, metadata, temporal_attributes')
    .eq('tenant_id', VLTEST2)
    .order('external_id')
    .limit(200);
  if (eErr) console.log('entities ERR', eErr.message);
  console.log(`=== entities total fetched=${ents?.length}`);
  // print 3 samples verbatim
  for (const e of (ents ?? []).slice(0, 3)) {
    console.log(`--- entity ${e.external_id} "${e.display_name}"`);
    console.log(`    metadata = ${JSON.stringify(e.metadata)}`);
    console.log(`    temporal_attributes = ${JSON.stringify(e.temporal_attributes)}`);
  }
  // role distribution across all entities (metadata.role and temporal role attr)
  const roleDist = new Map<string, number>();
  for (const e of ents ?? []) {
    const metaRole = (e.metadata as any)?.role;
    const tAttrs = (e.temporal_attributes ?? []) as any[];
    const tRole = Array.isArray(tAttrs) ? tAttrs.find((a) => a?.key === 'role')?.value : undefined;
    const key = `metaRole=${JSON.stringify(metaRole)} tempRole=${JSON.stringify(tRole)}`;
    roleDist.set(key, (roleDist.get(key) ?? 0) + 1);
  }
  console.log(`=== role distribution across ${ents?.length} entities:`);
  for (const [k, v] of roleDist) console.log(`    ${v}x  ${k}`);

  // ── 3. period_entity_state (the materialized store) ──
  const { data: pes, error: pesErr } = await sb
    .from('period_entity_state')
    .select('*')
    .eq('tenant_id', VLTEST2)
    .limit(3);
  if (pesErr) console.log('period_entity_state ERR', pesErr.message);
  if (pes?.[0]) {
    console.log(`\n=== period_entity_state keys = ${JSON.stringify(Object.keys(pes[0]))}`);
    for (const p of pes) console.log(`    resolved_attributes=${JSON.stringify(p.resolved_attributes)} entity_id=${p.entity_id} period_id=${p.period_id}`);
    const { count } = await sb.from('period_entity_state').select('*', { count: 'exact', head: true }).eq('tenant_id', VLTEST2);
    console.log(`    total rows=${count}`);
  } else {
    console.log('\n=== period_entity_state: NO ROWS for VLTEST2');
  }

  // ── 4. calculation_batches: latest runs (48h window ~ just take latest 5) ──
  const { data: batches, error: bErr } = await sb
    .from('calculation_batches')
    .select('*')
    .eq('tenant_id', VLTEST2)
    .order('created_at', { ascending: false })
    .limit(5);
  if (bErr) console.log('calculation_batches ERR', bErr.message);
  if (batches?.[0]) console.log(`\n=== calculation_batches keys = ${JSON.stringify(Object.keys(batches[0]))}`);
  for (const b of batches ?? []) {
    console.log(`--- batch ${b.id} state=${b.lifecycle_state} created=${b.created_at} entity_count=${b.entity_count} rule_set_id=${b.rule_set_id} period_id=${b.period_id}`);
    console.log(`    summary=${JSON.stringify(b.summary)}`);
  }

  // ── 5. calculation_results for latest batch → included entities; diff vs assignments ──
  const latest = batches?.[0];
  if (latest) {
    const { data: results, error: rErr } = await sb
      .from('calculation_results')
      .select('entity_id, total_payout, metadata')
      .eq('tenant_id', VLTEST2)
      .eq('batch_id', latest.id);
    if (rErr) console.log('calculation_results ERR (batch_id key?):', rErr.message);
    let resRows = results;
    if (rErr) {
      // introspect
      const { data: r1, error: r1e } = await sb.from('calculation_results').select('*').eq('tenant_id', VLTEST2).limit(1);
      if (r1?.[0]) console.log(`calculation_results keys = ${JSON.stringify(Object.keys(r1[0]))}`);
      if (r1e) console.log('calculation_results ERR2', r1e.message);
      resRows = null;
    }
    console.log(`\n=== calculation_results for latest batch ${latest.id}: count=${resRows?.length}`);
    const includedIds = new Set((resRows ?? []).map((r) => r.entity_id));

    // assignments: which entities were assigned to this rule set
    const { data: assigns, error: aErr } = await sb
      .from('entity_rule_assignments')
      .select('entity_id, rule_set_id')
      .eq('tenant_id', VLTEST2)
      .eq('rule_set_id', latest.rule_set_id);
    if (aErr) console.log('entity_rule_assignments ERR', aErr.message);
    console.log(`assignments for rule_set ${latest.rule_set_id}: ${assigns?.length}`);
    const assignedIds = (assigns ?? []).map((a) => a.entity_id);
    const excluded = assignedIds.filter((id) => !includedIds.has(id));
    console.log(`EXCLUDED (assigned but no result) count=${excluded.length}`);
    const nameById = new Map((ents ?? []).map((e) => [e.id, `${e.external_id} "${e.display_name}" metaRole=${JSON.stringify((e.metadata as any)?.role)}`]));
    for (const id of excluded.slice(0, 20)) console.log(`    EXCLUDED: ${nameById.get(id) ?? id}`);
    // also print 5 included with payouts + metadata
    for (const r of (resRows ?? []).slice(0, 5)) {
      console.log(`    INCLUDED: ${nameById.get(r.entity_id) ?? r.entity_id} payout=${r.total_payout} resultMeta=${JSON.stringify(r.metadata).slice(0, 300)}`);
    }
  }
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
