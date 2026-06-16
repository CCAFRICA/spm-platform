/**
 * OB-211 Phase C probe #2 (read-only): across ALL tenants, find the best test target —
 * which tenant has (a) real tenant users incl. a manager, (b) a non-empty profile_scope
 * (a ready scoped manager), (c) pos_cheque data (for the /api/financial/data test).
 * Also re-confirm the committed_data anon RLS probe cleanly (no exact-count timeout).
 *   npx tsx --env-file=.env.local scripts/ob211-phaseC-rls-probe2.ts
 */
import { createClient } from '@supabase/supabase-js';
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const svc = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const anon = createClient(URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
const j = (x: unknown) => JSON.stringify(x);

async function main() {
  const { data: tenants } = await svc.from('tenants').select('id, name');
  console.log('===== PER-TENANT READINESS =====');
  for (const t of tenants || []) {
    const { data: profs } = await svc.from('profiles').select('id, email, role').eq('tenant_id', t.id);
    const roleHist: Record<string, number> = {};
    for (const p of profs || []) roleHist[String(p.role)] = (roleHist[String(p.role)] || 0) + 1;

    const { data: scopes } = await svc.from('profile_scope')
      .select('profile_id, visible_entity_ids').eq('tenant_id', t.id);
    const scopedRows = (scopes || []).filter(s => Array.isArray(s.visible_entity_ids) && (s.visible_entity_ids as string[]).length > 0);

    const { count: chequeCount } = await svc.from('committed_data')
      .select('*', { count: 'exact', head: true }).eq('tenant_id', t.id).eq('data_type', 'pos_cheque');

    const flags: string[] = [];
    if ((profs || []).length > 0) flags.push('HAS_USERS');
    if (roleHist['manager'] || roleHist['mgr']) flags.push('HAS_MANAGER');
    if (scopedRows.length > 0) flags.push(`SCOPED(${scopedRows.length})`);
    if ((chequeCount ?? 0) > 0) flags.push(`POS_CHEQUE(${chequeCount})`);

    console.log(`\n  ${t.name}  [${t.id}]`);
    console.log(`    profiles=${(profs || []).length} roles=${j(roleHist)} scoped_profiles=${scopedRows.length} pos_cheque=${chequeCount ?? 0}  ${flags.join(' ')}`);
    // show the manager/admin emails if any
    for (const p of (profs || []).filter(p => ['manager','mgr','admin','tenant_admin','rep','member'].includes(String(p.role))))
      console.log(`      ${p.role}: ${p.email} (profile_id=${p.id})`);
    // show scoped profile details
    for (const s of scopedRows) {
      const prof = (profs || []).find(p => p.id === s.profile_id);
      console.log(`      SCOPED profile_id=${s.profile_id} email=${prof?.email ?? '?'} role=${prof?.role ?? '?'} visible=${(s.visible_entity_ids as string[]).length}`);
    }
  }

  // Clean anon RLS re-probe (no exact count → no timeout) on the heavy table
  console.log('\n===== ANON RLS RE-PROBE (clean, limit only) =====');
  for (const tbl of ['committed_data', 'entities', 'calculation_results']) {
    const { data, error } = await anon.from(tbl).select('id').limit(3);
    console.log(`  ${tbl} -> ${error ? 'ERROR ' + (error.code ?? '') + ' ' + error.message : 'rows_returned=' + (data || []).length}`);
  }
  // And confirm service-role (RLS bypass) DOES return rows on the same table, proving the 0 above is RLS not emptiness
  const { data: svcRows } = await svc.from('entities').select('id').limit(3);
  console.log(`  [control] service-role entities rows_returned=${(svcRows || []).length} (proves table is non-empty; anon 0 = RLS)`);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
