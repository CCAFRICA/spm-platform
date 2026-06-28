import { config } from 'dotenv'; config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import { detectHierarchyRoles, buildRoleBasedHierarchyEdges, normalizeEntityRef } from '../src/lib/sci/post-commit-construction';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const R = '74d71a1d-7d2f-45ef-93d4-e3e3e80a68d2';
(async () => {
  const { data: ind } = await sb.from('entities').select('id, external_id, display_name').eq('tenant_id', R).eq('entity_type', 'individual');
  const byExt = new Map<string,string>(), byName = new Map<string,string>();
  for (const e of ind ?? []) { if (e.external_id) byExt.set(String(e.external_id).trim(), e.id); if (e.display_name) byName.set(normalizeEntityRef(String(e.display_name)), e.id); }
  const resolveEntity = (v:string) => { const t=v.trim(); if(!t) return null; return byExt.get(t) ?? byName.get(normalizeEntityRef(t)) ?? null; };

  const { data: rows } = await sb.from('committed_data').select('row_data, entity_id, metadata').eq('tenant_id', R).eq('data_type','entity').limit(200);
  const jer = (rows ?? []).filter(r => (r.row_data as any)?._sheetName === 'Jerarquia').map(r => ({ row_data: r.row_data as any, entity_id: r.entity_id as string|null, metadata: r.metadata as any }));
  console.log(`Jerarquia rows: ${jer.length}, entities: ${ind?.length}`);

  const withFi = jer.find(r=>r.metadata?.field_identities && Object.keys(r.metadata.field_identities).length>0) ?? jer[0]; const fi = withFi?.metadata?.field_identities; console.log("fi keys:", fi?Object.keys(fi).join(","):"NONE");
  const eidf = withFi?.metadata?.entity_id_field ?? null; console.log("entity_id_field:", eidf);
  const roles = detectHierarchyRoles(fi, eidf);
  console.log('detected roles:', JSON.stringify(roles));
  if (!roles) { console.log('✗ no reference/relational-pointer role detected'); return; }

  const { edges, unresolvedTargets } = buildRoleBasedHierarchyEdges(jer, roles, resolveEntity, R, new Date().toISOString());
  console.log(`\n✓ ${edges.length} role-based edges built (${unresolvedTargets} unresolved targets)`);
  const nameOf = new Map((ind??[]).map(e=>[e.id, e.display_name]));
  for (const e of edges.slice(0,5)) console.log(`  ${nameOf.get(e.source_entity_id)} → ${nameOf.get(e.target_entity_id)}  [${e.relationship_type}]`);

  // WRITE them (what the reimport post-commit would do) so PG-3/PG-4 have the cascade graph.
  if (process.argv[2] === 'write' && edges.length > 0) {
    for (let i=0;i<edges.length;i+=500){ const { error } = await sb.from('entity_relationships').upsert(edges.slice(i,i+500), { onConflict: 'tenant_id,source_entity_id,target_entity_id,relationship_type' }); if (error) console.log('upsert err:', error.message); }
    const { count } = await sb.from('entity_relationships').select('*',{count:'exact',head:true}).eq('tenant_id', R);
    console.log(`\nWROTE edges → entity_relationships now ${count} for Robles`);
  } else { console.log('\n(dry-run; pass "write" to upsert)'); }
})().catch(e=>console.log('threw:',e instanceof Error?e.message:String(e)));
