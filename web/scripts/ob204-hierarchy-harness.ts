// OB-204 F.5 — A7 acceptance proof: manager/employee CONSTRUCTED FROM DATA, end to end.
// Seeds a sandbox roster with a containment field → CPI (deterministic recognizer, Decision-158
// split) → confirm → promote manager via the single door → assert profile_scope == direct reports
// → reject an edge → assert scope regenerates without it. Sandbox; cleans up. Run from web/:
//   set -a && source .env.local && set +a && npx tsx scripts/ob204-hierarchy-harness.ts
import { createClient } from '@supabase/supabase-js';
import { runCpiPass, type Recognizer } from '../src/lib/entities/cpi';
import { confirmRelationship, rejectRelationship } from '../src/lib/entities/relationships';
import { materializeProfileScope } from '../src/lib/entities/profile-scope';
import { createUser, erase } from '../src/lib/auth/provision-user';

const T = 'a0b1c2d3-e4f5-4a6b-8c7d-0000000000f5';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
let pass = 0, fail = 0;
const check = (n: string, ok: boolean, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'PASS' : 'FAIL'} ${n}${d ? ' — ' + d : ''}`); };
const setEq = (a: string[], b: string[]) => a.length === b.length && new Set(a).size === new Set([...a, ...b]).size;

// Decision-158 stub recognizer (production uses the LLM). Reads the structural containment field
// `manager_ref` and emits manages-intents — by STRUCTURE, no domain/header literal in the constructor.
const stubRecognizer: Recognizer = async (input) => {
  const refs = new Set(input.entities.map(e => e.ref));
  const out = [];
  for (const e of input.entities) {
    const mref = e.attributes['manager_ref'];
    if (typeof mref === 'string' && refs.has(mref) && mref !== e.ref) {
      out.push({ sourceEntityRef: mref, targetEntityRef: e.ref, dimension: 'containment' as const, evidenceFields: ['manager_ref'] });
    }
  }
  return out;
};

async function ent(externalId: string, name: string, attrs: Record<string, unknown>) {
  const id = crypto.randomUUID();
  await sb.from('entities').insert({ id, tenant_id: T, entity_type: 'individual', external_id: externalId, display_name: name, status: 'active', metadata: attrs });
  return id;
}
async function scopeOf(profileId: string): Promise<string[]> {
  const { data } = await sb.from('profile_scope').select('visible_entity_ids').eq('profile_id', profileId).maybeSingle();
  return (data?.visible_entity_ids as string[] | null) ?? [];
}

async function main() {
  console.log('================ OB-204 F.5 — A7 HIERARCHY HARNESS ================');
  await sb.from('tenants').upsert({ id: T, name: 'OB-204 F Sandbox', slug: 'ob204-f', currency: 'USD', locale: 'en', features: {}, settings: {} });

  // 1) seed roster with a containment field (MGR-1 manages EMP-1/2/3; EMP-X is unrelated)
  const mgr = await ent('MGR-1', 'Manager One', {});
  const e1 = await ent('EMP-1', 'Report One', { manager_ref: 'MGR-1' });
  const e2 = await ent('EMP-2', 'Report Two', { manager_ref: 'MGR-1' });
  const e3 = await ent('EMP-3', 'Report Three', { manager_ref: 'MGR-1' });
  const ex = await ent('EMP-X', 'Unrelated', { manager_ref: 'SOMEONE-ELSE' });

  // 2) CPI pass → ai_inferred manages edges matching the containment structure
  const cpi = await runCpiPass(T, sb as never, { importId: 'harness-import', recognize: stubRecognizer });
  check('CPI proposed exactly the 3 containment edges', cpi.written === 3, `proposed=${cpi.proposed} written=${cpi.written} dropped=${cpi.dropped}`);
  const { data: inferred } = await sb.from('entity_relationships').select('id, source, relationship_type, evidence, target_entity_id, effective_to').eq('tenant_id', T).eq('relationship_type', 'manages');
  check('edges are source=ai_inferred, type=manages, evidence cites containment field',
    (inferred ?? []).length === 3 && (inferred ?? []).every(r => r.source === 'ai_inferred' && (r.evidence as { dimension?: string; fields?: string[] }).dimension === 'containment' && (r.evidence as { fields?: string[] }).fields?.includes('manager_ref')));

  // 3) confirm the 3 manager edges → source flips to human_confirmed
  for (const r of (inferred ?? [])) await confirmRelationship(r.id as string, sb as never);
  const { data: confirmed } = await sb.from('entity_relationships').select('source').eq('tenant_id', T).eq('relationship_type', 'manages');
  check('confirm → source=human_confirmed on all', (confirmed ?? []).every(r => r.source === 'human_confirmed'));

  // 4) promote the manager entity to a user via the single door (role=manager) → triggers materialize
  const created = await createUser({ email: 'mgr-a7@vialuce.test', displayName: 'Manager One', role: 'manager', tenantId: T, entityId: mgr, mode: 'temp_password' });

  // 5) profile_scope.visible_entity_ids == manager + its 3 direct reports (NOT EMP-X)
  const scope1 = await scopeOf(created.profileId);
  check('profile_scope set-equals {manager + 3 direct reports}', setEq(scope1, [mgr, e1, e2, e3]), `scope=[${scope1.length}] expected 4`);
  check('unrelated entity (EMP-X) is NOT in scope', !scope1.includes(ex));

  // 6) reject one edge (EMP-3) → effective_to set, scope regenerates without it
  const e3edge = (inferred ?? []).find(r => r.target_entity_id === e3);
  await rejectRelationship(e3edge!.id as string, sb as never);
  const { data: rej } = await sb.from('entity_relationships').select('effective_to').eq('id', e3edge!.id as string).single();
  check('reject → effective_to end-dated (temporal, not deleted)', rej?.effective_to != null);
  const scope2 = await scopeOf(created.profileId);
  check('scope regenerated WITHOUT the rejected report', setEq(scope2, [mgr, e1, e2]) && !scope2.includes(e3), `scope=[${scope2.length}] expected 3`);

  // cleanup
  await erase({ targetProfileId: created.profileId });
  await sb.from('profile_scope').delete().eq('profile_id', created.profileId);
  await sb.from('profiles').delete().eq('id', created.profileId);
  await sb.from('entity_relationships').delete().eq('tenant_id', T);
  await sb.from('entities').delete().eq('tenant_id', T);
  await sb.from('tenants').delete().eq('id', T);

  console.log(`\n================ A7 RESULT: ${pass} PASS / ${fail} FAIL ================`);
  if (fail > 0) process.exit(1);
}
main().catch(e => { console.error('HARNESS ERROR:', e); process.exit(1); });
