// OB-258 P0.2 — Organizational graph live probe (READ-ONLY, service-role).
// 1. Lists all tenants (id, name, slug).
// 2. Live-verifies the entity_relationships column set (sample row keys).
// 3. Per-tenant edge counts + distinct relationship_type values.
// 4. For VLTEST2 (or any tenant with edges) extracts a multi-level directed chain
//    A -> B -> C (edge1.target == edge2.source), joining entities for names/types.
// No writes. Run: cd web && set -a && source .env.local && set +a && npx tsx scripts/_ob258_p02_graph_probe.ts
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

interface Edge {
  id: string; tenant_id: string; source_entity_id: string; target_entity_id: string;
  relationship_type: string; source: string; confidence: number;
  effective_from: string | null; effective_to: string | null;
}

async function main() {
  console.log('=== OB-258 P0.2 organizational-graph probe ===\n');

  // ── 1. all tenants ──
  const { data: tenants, error: tErr } = await supabase.from('tenants').select('id, name, slug').order('name');
  if (tErr) { console.log(`tenants ERROR: ${tErr.message}`); return; }
  console.log(`TENANTS (${tenants!.length}):`);
  for (const t of tenants!) console.log(`  ${t.id}  ${t.name}  slug=${t.slug}`);

  // ── 2. live column set ──
  const { data: sample, error: sErr } = await supabase.from('entity_relationships').select('*').limit(1);
  if (sErr) { console.log(`\nentity_relationships ERROR: ${sErr.message}`); return; }
  console.log(`\nentity_relationships LIVE COLUMNS: ${sample && sample.length ? Object.keys(sample[0]).join(', ') : '(table empty — no sample row)'}`);

  // ── 3. per-tenant edge counts + distinct relationship_type ──
  console.log('\nPER-TENANT EDGE COUNTS:');
  const tenantsWithEdges: string[] = [];
  for (const t of tenants!) {
    const { count } = await supabase.from('entity_relationships')
      .select('id', { count: 'exact', head: true }).eq('tenant_id', t.id);
    const n = count ?? 0;
    if (n > 0) {
      tenantsWithEdges.push(t.id);
      const { data: typRows } = await supabase.from('entity_relationships')
        .select('relationship_type, source, effective_to').eq('tenant_id', t.id).limit(5000);
      const byType = new Map<string, number>();
      const bySource = new Map<string, number>();
      let active = 0;
      for (const r of typRows ?? []) {
        byType.set(r.relationship_type, (byType.get(r.relationship_type) ?? 0) + 1);
        bySource.set(r.source, (bySource.get(r.source) ?? 0) + 1);
        if (r.effective_to == null) active++;
      }
      console.log(`  ${t.name} (${t.slug}): ${n} edges (${active} active/effective_to IS NULL)`);
      console.log(`    types: ${Array.from(byType.entries()).map(([k, v]) => `${k}=${v}`).join(', ')}`);
      console.log(`    sources: ${Array.from(bySource.entries()).map(([k, v]) => `${k}=${v}`).join(', ')}`);
    } else {
      console.log(`  ${t.name} (${t.slug}): 0 edges`);
    }
  }

  // ── 4. multi-level chain hunt: VLTEST2 first, then every tenant with edges ──
  const vltest2 = tenants!.find(t => /vltest2/i.test(String(t.slug)) || /vltest2/i.test(String(t.name)));
  const huntOrder = [
    ...(vltest2 ? [vltest2.id] : []),
    ...tenantsWithEdges.filter(id => id !== vltest2?.id),
  ];

  let chainFound = false;
  for (const tid of huntOrder) {
    const tname = tenants!.find(t => t.id === tid)?.name ?? tid;
    const { data: edges } = await supabase.from('entity_relationships')
      .select('id, tenant_id, source_entity_id, target_entity_id, relationship_type, source, confidence, effective_from, effective_to')
      .eq('tenant_id', tid).is('effective_to', null).limit(10000);
    const es = (edges ?? []) as Edge[];
    if (es.length === 0) { console.log(`\nCHAIN HUNT ${tname}: 0 active edges — skip`); continue; }

    // directed chain: e1.target == e2.source (A -> B -> C)
    const bySourceId = new Map<string, Edge[]>();
    for (const e of es) {
      if (!bySourceId.has(e.source_entity_id)) bySourceId.set(e.source_entity_id, []);
      bySourceId.get(e.source_entity_id)!.push(e);
    }
    let e1: Edge | null = null, e2: Edge | null = null;
    outer: for (const a of es) {
      const nexts = bySourceId.get(a.target_entity_id) ?? [];
      for (const b of nexts) {
        if (b.target_entity_id !== a.source_entity_id) { e1 = a; e2 = b; break outer; } // no 2-cycles
      }
    }

    if (!e1 || !e2) {
      console.log(`\nCHAIN HUNT ${tname}: ${es.length} active edges but NO directed 2-edge chain (no edge's target is another edge's source).`);
      // diagnostic: distinct sources vs targets overlap
      const srcs = new Set(es.map(e => e.source_entity_id));
      const tgts = new Set(es.map(e => e.target_entity_id));
      const overlap = Array.from(tgts).filter(t => srcs.has(t));
      console.log(`  distinct sources=${srcs.size}, distinct targets=${tgts.size}, targets-that-are-also-sources=${overlap.length}`);
      continue;
    }

    const ids = Array.from(new Set([e1.source_entity_id, e1.target_entity_id, e2.source_entity_id, e2.target_entity_id]));
    const { data: ents } = await supabase.from('entities')
      .select('id, display_name, external_id, entity_type').in('id', ids);
    const em = new Map((ents ?? []).map(e => [e.id, e]));
    const nm = (id: string) => {
      const e = em.get(id);
      return e ? `"${e.display_name}" [${e.entity_type}] ext=${e.external_id}` : id;
    };
    console.log(`\nMULTI-LEVEL CHAIN in ${tname} (tenant ${tid}):`);
    console.log(`  A: ${e1.source_entity_id} ${nm(e1.source_entity_id)}`);
    console.log(`    --${e1.relationship_type} (source=${e1.source}, conf=${e1.confidence}, edge ${e1.id})-->`);
    console.log(`  B: ${e1.target_entity_id} ${nm(e1.target_entity_id)}`);
    console.log(`    --${e2.relationship_type} (source=${e2.source}, conf=${e2.confidence}, edge ${e2.id})-->`);
    console.log(`  C: ${e2.target_entity_id} ${nm(e2.target_entity_id)}`);
    chainFound = true;
    break;
  }

  if (!chainFound) {
    console.log('\nRESULT: NO tenant has a multi-level (2+ edge) directed chain. See per-tenant counts + chain-hunt diagnostics above.');
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
