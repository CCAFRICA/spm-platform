/**
 * OB-211 Phase C — RLS verification runbook DATA PROBE (read-only).
 *
 * Fills the runbook's blanks from the LIVE system:
 *  - service-role client: real BCL tenant, profiles (manager+admin), profile_scope,
 *    entities (in-scope + out-of-scope), periods, data-presence counts.
 *  - anon-key client: live RLS behavior (unauthenticated SELECT row counts per table).
 *
 * NO WRITES. Only .select().
 *   npx tsx --env-file=.env.local scripts/ob211-phaseC-rls-probe.ts
 */
import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const svc = createClient(URL, SERVICE, { auth: { persistSession: false } });
const anon = createClient(URL, ANON, { auth: { persistSession: false } });

const SCOPE_TABLES = [
  'entities', 'committed_data', 'calculation_results', 'periods',
  'profile_scope', 'calculation_batches', 'entity_period_outcomes',
  'approval_requests', 'audit_logs', 'rule_sets',
];

function j(x: unknown) { return JSON.stringify(x); }

async function main() {
  console.log('PROJECT_URL:', URL);

  // ── Find the BCL (or demo) tenant ────────────────────────────────────
  console.log('\n===== TENANTS (service-role) =====');
  const { data: tenants, error: tErr } = await svc
    .from('tenants').select('id, name, currency, locale').order('name');
  if (tErr) { console.log('TENANTS_ERROR:', j(tErr)); }
  for (const t of tenants || []) console.log(`  ${t.id} | ${t.name} | ${t.currency} | ${t.locale}`);

  const bcl = (tenants || []).find(t => /bcl|burger|los chil|chili/i.test(String(t.name)))
    || (tenants || []).find(t => t.id === 'b1c2d3e4-aaaa-bbbb-cccc-111111111111');
  if (!bcl) { console.log('\nNO BCL tenant matched; pick one from the list above and re-run.'); }
  const TENANT = bcl?.id ?? null;
  console.log('\nCHOSEN_TENANT:', TENANT, bcl?.name ?? '(none)');
  if (!TENANT) return;

  // ── Profiles in the tenant ───────────────────────────────────────────
  console.log('\n===== PROFILES (tenant) =====');
  const { data: profiles, error: pErr } = await svc
    .from('profiles')
    .select('id, auth_user_id, email, display_name, role, status, tenant_id')
    .eq('tenant_id', TENANT);
  if (pErr) console.log('PROFILES_ERROR:', j(pErr));
  const roles = new Map<string, number>();
  for (const p of profiles || []) roles.set(String(p.role), (roles.get(String(p.role)) || 0) + 1);
  console.log('  role histogram:', j(Object.fromEntries(roles)));
  for (const p of profiles || []) {
    console.log(`  ${p.role.padEnd(10)} | ${String(p.email).padEnd(34)} | ${p.display_name} | profile_id=${p.id} | auth_user_id=${p.auth_user_id} | status=${p.status}`);
  }
  // Also list vl_admin / platform accounts (tenant_id NULL)
  const { data: platform } = await svc
    .from('profiles').select('id, email, role, tenant_id')
    .or('role.eq.vl_admin,role.eq.platform');
  console.log('\n  PLATFORM/VL_ADMIN accounts (for admin-contrast):');
  for (const p of platform || []) console.log(`    ${p.role} | ${p.email} | profile_id=${p.id} | tenant_id=${p.tenant_id}`);

  // ── profile_scope rows (who is actually scoped?) ─────────────────────
  console.log('\n===== PROFILE_SCOPE (tenant) =====');
  const { data: scopes, error: sErr } = await svc
    .from('profile_scope')
    .select('profile_id, scope_type, visible_entity_ids, visible_period_ids, materialized_at')
    .eq('tenant_id', TENANT);
  if (sErr) console.log('PROFILE_SCOPE_ERROR:', j(sErr));
  const profById = new Map((profiles || []).map(p => [p.id, p]));
  let scopedManager: { profile_id: string; visible: string[] } | null = null;
  for (const s of scopes || []) {
    const vis = Array.isArray(s.visible_entity_ids) ? s.visible_entity_ids as string[] : [];
    const prof = profById.get(s.profile_id);
    console.log(`  profile_id=${s.profile_id} (${prof?.email ?? '?'}, role=${prof?.role ?? '?'}) | scope_type=${s.scope_type} | visible_entity_ids=${vis.length} | materialized=${s.materialized_at}`);
    if (vis.length > 0) console.log(`      sample visible: ${j(vis.slice(0, 5))}`);
    if (!scopedManager && vis.length > 0 && (prof?.role === 'manager' || prof?.role === 'mgr')) {
      scopedManager = { profile_id: s.profile_id, visible: vis };
    }
  }
  if (!scopedManager) {
    const anyScoped = (scopes || []).find(s => Array.isArray(s.visible_entity_ids) && (s.visible_entity_ids as string[]).length > 0);
    if (anyScoped) scopedManager = { profile_id: anyScoped.profile_id, visible: anyScoped.visible_entity_ids as string[] };
  }
  console.log('\nSCOPED_MANAGER:', scopedManager ? `profile_id=${scopedManager.profile_id} (${profById.get(scopedManager.profile_id)?.email}) visible=${scopedManager.visible.length}` : 'NONE FOUND — runbook must flag seeding (HALT-SCOPE-DEMO overlap)');

  // ── Entities: in-scope vs out-of-scope targets ───────────────────────
  console.log('\n===== ENTITIES (tenant) =====');
  const { data: ents, error: eErr } = await svc
    .from('entities')
    .select('id, display_name, external_id, entity_type, profile_id, status')
    .eq('tenant_id', TENANT);
  if (eErr) console.log('ENTITIES_ERROR:', j(eErr));
  const typeHist = new Map<string, number>();
  for (const e of ents || []) typeHist.set(String(e.entity_type), (typeHist.get(String(e.entity_type)) || 0) + 1);
  console.log('  entity_type histogram:', j(Object.fromEntries(typeHist)), '| total:', (ents || []).length);

  if (scopedManager) {
    const visSet = new Set(scopedManager.visible);
    const inScope = (ents || []).filter(e => visSet.has(e.id));
    const outScope = (ents || []).filter(e => !visSet.has(e.id) && (e.entity_type === 'individual' || e.entity_type === 'employee' || e.entity_type === 'rep'));
    const mgrEntity = (ents || []).find(e => e.profile_id === scopedManager!.profile_id);
    console.log('  MANAGER_OWN_ENTITY:', mgrEntity ? `${mgrEntity.id} | ${mgrEntity.display_name} | ${mgrEntity.entity_type}` : '(manager has no linked entity row)');
    console.log('  IN_SCOPE targets (first 3):');
    for (const e of inScope.slice(0, 3)) console.log(`    ${e.id} | ${e.display_name} | ${e.entity_type} | profile_id=${e.profile_id}`);
    console.log('  OUT_OF_SCOPE targets (first 3, another team):');
    for (const e of outScope.slice(0, 3)) console.log(`    ${e.id} | ${e.display_name} | ${e.entity_type} | profile_id=${e.profile_id}`);
  } else {
    console.log('  (no scoped manager → showing 5 individual entities as candidates)');
    for (const e of (ents || []).filter(e => e.entity_type === 'individual' || e.entity_type === 'employee').slice(0, 5))
      console.log(`    ${e.id} | ${e.display_name} | ${e.entity_type} | profile_id=${e.profile_id}`);
  }

  // ── Periods ──────────────────────────────────────────────────────────
  console.log('\n===== PERIODS (tenant) =====');
  const { data: periods } = await svc
    .from('periods').select('id, label, canonical_key, period_type, status, start_date, end_date')
    .eq('tenant_id', TENANT).order('start_date', { ascending: false }).limit(8);
  for (const p of periods || []) console.log(`  ${p.id} | ${p.label} | ${p.period_type} | ${p.status} | ${p.start_date}..${p.end_date}`);

  // ── Data presence (so the tests actually return something) ───────────
  console.log('\n===== DATA PRESENCE (tenant, service-role counts) =====');
  for (const tbl of ['committed_data', 'calculation_results', 'calculation_batches', 'entity_period_outcomes']) {
    const { count, error } = await svc.from(tbl).select('*', { count: 'exact', head: true }).eq('tenant_id', TENANT);
    console.log(`  ${tbl}: ${error ? 'ERR ' + error.message : count}`);
  }
  const { data: dtypes } = await svc.from('committed_data').select('data_type').eq('tenant_id', TENANT).limit(2000);
  const dt = new Map<string, number>();
  for (const r of dtypes || []) dt.set(String(r.data_type), (dt.get(String(r.data_type)) || 0) + 1);
  console.log('  committed_data data_type histogram (sample):', j(Object.fromEntries(dt)));

  // ── LIVE RLS BEHAVIOR: unauthenticated anon SELECT per table ─────────
  console.log('\n===== LIVE RLS PROBE (anon key, NO session) =====');
  console.log('  interpretation: rows>0 = RLS OFF or anon-permissive (LEAK);  rows=0 no-error = RLS ON, denies anon;  error = not exposed / blocked');
  for (const tbl of SCOPE_TABLES) {
    const { data, error, count } = await anon.from(tbl).select('*', { count: 'exact' }).limit(1);
    if (error) console.log(`  ${tbl.padEnd(22)} -> ERROR ${error.code ?? ''} ${error.message}`);
    else console.log(`  ${tbl.padEnd(22)} -> rows_returned=${(data || []).length} exact_count=${count}`);
  }
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
