import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

async function run() {
  const tid = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';

  // 2.1 Meridian tenant
  const { data: m, error: mErr } = await s.from('tenants').select('id, name, slug, locale, currency').eq('id', tid).single();
  console.log('2.1 MERIDIAN:', m ? `${m.name} (${m.slug}) - ${m.locale} ${m.currency}` : `NOT FOUND: ${mErr?.message}`);

  // Also list tenants
  const { data: all } = await s.from('tenants').select('id, name, slug');
  if (all) { for (const t of all.slice(0, 5)) console.log('  TENANT:', t.id, t.name); }

  // 2.2 Engine contract
  const [rs, en, cd, pe, as2] = await Promise.all([
    s.from('rule_sets').select('id', { count: 'exact', head: true }).eq('tenant_id', tid),
    s.from('entities').select('id', { count: 'exact', head: true }).eq('tenant_id', tid),
    s.from('committed_data').select('id', { count: 'exact', head: true }).eq('tenant_id', tid),
    s.from('periods').select('id', { count: 'exact', head: true }).eq('tenant_id', tid),
    s.from('rule_set_assignments').select('id', { count: 'exact', head: true }).eq('tenant_id', tid),
  ]);
  console.log('2.2 ENGINE:', JSON.stringify({ rule_sets: rs.count, entities: en.count, committed_data: cd.count, periods: pe.count, assignments: as2.count }));

  // 2.3 Classification signals dedicated columns
  const { error: csErr } = await s.from('classification_signals').select('id, tenant_id, signal_type, source_file_name, sheet_name, structural_fingerprint, classification, confidence, decision_source, classification_trace, vocabulary_bindings, agent_scores, human_correction_from, scope, source, context, created_at').limit(0);
  console.log('2.3 CS_COLUMNS:', csErr ? 'FAIL: ' + csErr.message : 'PASS');

  // 2.5 source_date
  const { error: sdErr } = await s.from('committed_data').select('source_date').limit(0);
  console.log('2.5 SOURCE_DATE:', sdErr ? 'FAIL' : 'PASS');

  // 2.6 Reference tables
  const { error: r1 } = await s.from('reference_data').select('id').limit(0);
  const { error: r2 } = await s.from('reference_items').select('id').limit(0);
  const refPass = r1 === null && r2 === null;
  console.log('2.6 REFERENCE:', refPass ? 'PASS' : 'FAIL (r1=' + r1?.message + ' r2=' + r2?.message + ')');

  // 2.7 Flywheel tables
  const { error: f1 } = await s.from('foundational_patterns').select('id').limit(0);
  const { error: f2 } = await s.from('domain_patterns').select('id').limit(0);
  const fwPass = f1 === null && f2 === null;
  console.log('2.7 FLYWHEEL:', fwPass ? 'PASS' : 'FAIL (f1=' + f1?.message + ' f2=' + f2?.message + ')');

  // 2.8 Synaptic density
  const { error: sdErr2 } = await s.from('synaptic_density').select('id').limit(0);
  console.log('2.8 SYNAPTIC_DENSITY:', sdErr2 ? 'FAIL: ' + sdErr2.message : 'PASS');

  // Extra: industry column on tenants
  const { error: indErr } = await s.from('tenants').select('industry').limit(0);
  console.log('NOTE - INDUSTRY_COL:', indErr ? 'DOES NOT EXIST ON DB (non-blocking)' : 'EXISTS');
}
run();
