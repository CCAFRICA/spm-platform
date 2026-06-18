/**
 * OB-211 Phase C probe #3 (read-only): Sabor Grupo Gastronomico detail — the executable
 * test target. Entities, the manager's linkage + 'manages' edges, concrete in-scope vs
 * out-of-scope targets, periods, latest calc batch.
 *   npx tsx --env-file=.env.local scripts/ob211-phaseC-probe3-sabor.ts
 */
import { createClient } from '@supabase/supabase-js';
const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const j = (x: unknown) => JSON.stringify(x);
const SABOR = 'f7093bcc-e90b-4918-9680-69da7952dd65';
const MGR_PROFILE = '07fa3350-a7fb-4404-b983-86ab1b726174'; // gerente@saborgrupo.mx

async function main() {
  console.log('===== SABOR ENTITIES =====');
  const { data: ents } = await svc.from('entities')
    .select('id, display_name, external_id, entity_type, profile_id, status, metadata')
    .eq('tenant_id', SABOR);
  const hist: Record<string, number> = {};
  for (const e of ents || []) hist[String(e.entity_type)] = (hist[String(e.entity_type)] || 0) + 1;
  console.log('  type histogram:', j(hist), 'total:', (ents || []).length);
  console.log('  by type (first 6 each):');
  for (const type of Object.keys(hist)) {
    console.log(`   -- ${type} --`);
    for (const e of (ents || []).filter(e => e.entity_type === type).slice(0, 6))
      console.log(`     ${e.id} | ${e.display_name} | ext=${e.external_id} | profile_id=${e.profile_id}`);
  }

  console.log('\n===== MANAGER LINKAGE (gerente@saborgrupo.mx) =====');
  const mgrEntities = (ents || []).filter(e => e.profile_id === MGR_PROFILE);
  console.log('  entities linked to manager profile:', mgrEntities.length);
  for (const e of mgrEntities) console.log(`    ${e.id} | ${e.display_name} | ${e.entity_type}`);

  console.log('\n===== entity_relationships (Sabor) =====');
  const { data: rels } = await svc.from('entity_relationships')
    .select('source_entity_id, target_entity_id, relationship_type, source, effective_to')
    .eq('tenant_id', SABOR);
  const relHist: Record<string, number> = {};
  for (const r of rels || []) relHist[String(r.relationship_type)] = (relHist[String(r.relationship_type)] || 0) + 1;
  console.log('  relationship_type histogram:', j(relHist), 'total:', (rels || []).length);
  const manages = (rels || []).filter(r => r.relationship_type === 'manages');
  console.log('  manages edges:', manages.length, '(first 8):');
  for (const r of manages.slice(0, 8)) console.log(`    ${r.source_entity_id} -> ${r.target_entity_id} | source=${r.source} | effective_to=${r.effective_to}`);

  // If the manager has a linked entity, compute the would-be in-scope set
  if (mgrEntities.length > 0) {
    const mgrEntId = mgrEntities[0].id;
    const managed = manages.filter(r => r.source_entity_id === mgrEntId && r.effective_to == null).map(r => r.target_entity_id);
    console.log(`\n  WOULD-BE SCOPE for manager entity ${mgrEntId}: own + ${managed.length} managed reports`);
    console.log('    in-scope sample:', j([mgrEntId, ...managed.slice(0, 4)]));
    const visSet = new Set([mgrEntId, ...managed]);
    const out = (ents || []).filter(e => !visSet.has(e.id) && e.entity_type === 'individual').slice(0, 4);
    console.log('    out-of-scope sample (another team):', j(out.map(e => ({ id: e.id, name: e.display_name }))));
  } else {
    console.log('\n  MANAGER HAS NO LINKED ENTITY → no graph-derived scope can be computed; scope must be seeded.');
  }

  console.log('\n===== SABOR PERIODS =====');
  const { data: periods } = await svc.from('periods').select('id, label, status').eq('tenant_id', SABOR).order('start_date', { ascending: false }).limit(6);
  for (const p of periods || []) console.log(`  ${p.id} | ${p.label} | ${p.status}`);

  console.log('\n===== SABOR latest calc batches =====');
  const { data: batches } = await svc.from('calculation_batches').select('id, period_id, status, entity_count, created_at').eq('tenant_id', SABOR).order('created_at', { ascending: false }).limit(3);
  for (const b of batches || []) console.log(`  ${b.id} | period=${b.period_id} | ${b.status} | entities=${b.entity_count} | ${b.created_at}`);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
