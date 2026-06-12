// OB-203 Phase 6 — exit-witness verification (read-only). Run AFTER an architect-executed import.
// Reports: workbook-graph roles per sheet, classification per sheet, and the D3 entity census
// (spurious location entities from non-FK reference_keys should be ZERO).
//   Usage: npx tsx scripts/ob203-phase6-verify.ts <tenantId> [importSessionId]
import { createClient } from '@supabase/supabase-js';

const TENANT = process.argv[2] || '24103940-ab33-4a21-b6fd-bd1042f4762c';
const SESSION = process.argv[3];
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const sv = (r: { signal_value: unknown }) => (r.signal_value ?? {}) as Record<string, unknown>;

(async () => {
  console.log(`OB-203 PHASE 6 VERIFY — tenant ${TENANT}${SESSION ? `  session ${SESSION}` : ''}\n`);

  // (1) workbook-graph roles (the relational map)
  let q = sb.from('classification_signals')
    .select('signal_value, context, created_at').eq('tenant_id', TENANT)
    .eq('signal_type', 'comprehension:workbook_graph').order('created_at', { ascending: false }).limit(5);
  if (SESSION) q = q.eq('context->>importSessionId', SESSION);
  const { data: graphs } = await q;
  console.log('=== (1) workbook-graph roles ===');
  if ((graphs ?? []).length === 0) console.log('  (no workbook_graph signal yet)');
  for (const g of graphs ?? []) {
    console.log(`  ${g.created_at}  edges=${sv(g).edgeCount}  suppressedRefKeys=${sv(g).suppressedReferenceKeys}`);
    console.log(`     roles=${JSON.stringify(sv(g).roles)}`);
  }

  // (2) classification per sheet (latest)
  const { data: sigs } = await sb.from('classification_signals')
    .select('sheet_name, classification, decision_source, created_at').eq('tenant_id', TENANT)
    .eq('signal_type', 'classification:outcome').order('created_at', { ascending: false }).limit(30);
  console.log('\n=== (2) classifications (latest per sheet) ===');
  const seen = new Set<string>();
  for (const s of sigs ?? []) { if (s.sheet_name && !seen.has(s.sheet_name)) { seen.add(s.sheet_name); console.log(`  ${s.sheet_name}: ${s.classification} (${s.decision_source})`); } }

  // (3) D3 entity census — spurious 'location' entities should be ZERO after the fix
  const { count: total } = await sb.from('entities').select('*', { count: 'exact', head: true }).eq('tenant_id', TENANT);
  const { count: loc } = await sb.from('entities').select('*', { count: 'exact', head: true }).eq('tenant_id', TENANT).eq('entity_type', 'location');
  const { data: locSample } = await sb.from('entities').select('external_id, display_name').eq('tenant_id', TENANT).eq('entity_type', 'location').limit(12);
  console.log('\n=== (3) entity census (D3) ===');
  console.log(`  total: ${total ?? 0}   entity_type=location: ${loc ?? 0}`);
  if ((locSample ?? []).length > 0) console.log(`  location external_ids: ${(locSample ?? []).map(e => e.external_id).join(', ')}`);
  console.log(`  → D3 PASS when no shift-code / non-roster reference_key produced 'location' entities.`);
})();
