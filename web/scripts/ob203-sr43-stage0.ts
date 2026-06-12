import { createClient } from '@supabase/supabase-js';
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const TENANT = '24103940-ab33-4a21-b6fd-bd1042f4762c';
const sb = createClient(SUPA_URL, process.env.SUPABASE_SERVICE_ROLE_KEY!);
(async () => {
  console.log('=== Supabase project (assert PROD) ===');
  console.log('  URL host:', new URL(SUPA_URL).host); // <project-ref>.supabase.co

  // ── migration applied? select the new columns explicitly (errors if absent) ──
  console.log('\n=== migration 20260611120000 (atom-fingerprint extension) ===');
  const { data: probe, error: probeErr } = await sb
    .from('structural_fingerprints')
    .select('id, granularity, algorithm_version, scope, atom_features')
    .limit(1);
  if (probeErr) { console.log('  NOT APPLIED / error:', probeErr.message); process.exit(1); }
  console.log('  columns granularity/algorithm_version/scope/atom_features: PRESENT (migration applied)');
  console.log('  sample row keys:', probe?.[0] ? Object.keys(probe[0]).join(', ') : '(table empty)');

  // ── tenant exists in prod ──
  console.log('\n=== prod sandbox tenant ===');
  const { data: t, error: tErr } = await sb.from('tenants').select('id, name, slug, currency, locale').eq('id', TENANT).maybeSingle();
  if (tErr) { console.log('  tenant query error:', tErr.message); }
  console.log('  ', t ? `${t.id}  name="${t.name}"  slug=${t.slug}  ${t.currency}/${t.locale}` : 'NOT FOUND');

  // ── known-atom state for mod3 (the atoms mod3 will claim) ──
  const { count: atomCount } = await sb.from('structural_fingerprints').select('*', { count:'exact', head:true }).eq('tenant_id', TENANT).eq('granularity','atom');
  const { count: sheetCount } = await sb.from('structural_fingerprints').select('*', { count:'exact', head:true }).eq('tenant_id', TENANT).eq('granularity','sheet');
  console.log(`\n=== current fingerprint state (mod3 known-atom baseline) ===`);
  console.log(`  atom rows: ${atomCount ?? 0}   sheet rows: ${sheetCount ?? 0}`);
  const { data: sheets } = await sb.from('structural_fingerprints').select('fingerprint_hash, classification_result').eq('tenant_id', TENANT).eq('granularity','sheet');
  for (const s of sheets ?? []) {
    const cls = (s.classification_result as Record<string,unknown>|null)?.classification ?? '?';
    const tab = (s.classification_result as Record<string,unknown>|null)?.tabName ?? '?';
    console.log(`    SHEET ${(s.fingerprint_hash as string).slice(0,12)} class=${cls} tab=${tab}`);
  }
})();
