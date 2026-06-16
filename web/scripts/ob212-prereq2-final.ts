// OB-212 §B Prereq-2 — FINAL decisive probe. READ-ONLY.
// (1) Find CLT14B's source tenant (its 8-digit optometrist IDs) — is it live? If so, CLT14B is
//     directly usable (its _Expected cols already differ from _Calc → real component deltas).
// (2) Quantify CLT14B's internal REAL deltas (Total_Match=false, per-component _Match=false rows).
// (3) Meridian: enumerate batches/periods; does meridian-detail.csv (entity 70001…) match a live batch?
// Run from web/: set -a && source .env.local && set +a && npx tsx scripts/ob212-prereq2-final.ts
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const j = (v: unknown, n = 280) => { const s = JSON.stringify(v); return s.length > n ? s.slice(0, n) + '…' : s; };
const short = (id: unknown) => (typeof id === 'string' ? id.slice(0, 8) : String(id));

async function main() {
  console.log('================ OB-212 PREREQ-2 FINAL PROBE (read-only) ================');

  // ---- (1) Where do CLT14B employee IDs live? search entities across ALL tenants ----
  console.log('\n=== (1) CLT14B source tenant — search entities for its Employee IDs across ALL tenants ===');
  const cltIds = ['97678074', '90224972', '90167980', '90224066', '90230872', '90296039'];
  const { data: hits, error: hErr } = await sb.from('entities').select('id, tenant_id, external_id, display_name').in('external_id', cltIds);
  if (hErr) console.log(`  entities search error: ${hErr.message}`);
  console.log(`  matches: ${hits?.length ?? 0}`);
  const tenantsHit = new Set<string>();
  (hits ?? []).forEach((e: any) => { tenantsHit.add(e.tenant_id); console.log(`    ext=${e.external_id} tenant=${short(e.tenant_id)} name=${e.display_name}`); });
  // also try numeric form (external_id might be stored as number/text)
  if ((hits?.length ?? 0) === 0) {
    const { data: like } = await sb.from('entities').select('id, tenant_id, external_id').ilike('external_id', '976780%').limit(5);
    console.log(`  ilike '976780%' matches: ${like?.length ?? 0} ${j((like ?? []).map((e: any) => `${e.external_id}@${short(e.tenant_id)}`))}`);
  }
  // resolve tenant names for any hit
  for (const t of tenantsHit) {
    const { data: tn } = await sb.from('tenants').select('name').eq('id', t).maybeSingle();
    const { data: cr } = await sb.from('calculation_results').select('entity_id, total_payout, components').eq('tenant_id', t).limit(5);
    const withComps = (cr ?? []).filter((r: any) => Array.isArray(r.components) && r.components.length > 0).length;
    console.log(`  → tenant ${short(t)} "${(tn as any)?.name}" calc_results sample=${cr?.length} withComponents=${withComps} sampleComps=${j((cr ?? [])[0] ? ((cr as any)[0].components || []).map((c: any) => `${c.name ?? c.componentName}=${c.outputValue ?? c.payout ?? c.value}`) : [])}`);
  }

  // ---- (2) CLT14B internal real-delta census (no DB; the file already encodes Calc vs Expected) ----
  console.log('\n=== (2) CLT14B internal REAL-delta census (Calc vs Expected already in the file) ===');
  try {
    const mod: any = await import('xlsx');
    const XLSX = mod.default ?? mod;
    const wb = XLSX.readFile('scripts/CLT14B_Reconciliation_Detail.xlsx');
    const rows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null });
    console.log(`  rows: ${rows.length}`);
    const compMatchCols = ['C1_Match', 'C2_Match', 'C3_Match', 'C4_Match', 'C5_Match', 'C6_Match'];
    let totalMismatch = 0; const compMismatch: Record<string, number> = {};
    let anyCompMismatch = 0;
    for (const r of rows) {
      if (r.Total_Match === false || r.Total_Match === 'FALSE' || r.Total_Match === 0) totalMismatch++;
      let anyc = false;
      for (const c of compMatchCols) { if (r[c] === false || r[c] === 'FALSE' || r[c] === 0) { compMismatch[c] = (compMismatch[c] ?? 0) + 1; anyc = true; } }
      if (anyc) anyCompMismatch++;
    }
    console.log(`  rows with Total_Match=false (real TOTAL delta): ${totalMismatch}/${rows.length}`);
    console.log(`  rows with ≥1 component _Match=false (real COMPONENT delta): ${anyCompMismatch}/${rows.length}`);
    console.log(`  per-component mismatch counts: ${j(compMismatch)}`);
    // show 3 example rows that have a component mismatch
    const examples = rows.filter((r) => compMatchCols.some((c) => r[c] === false)).slice(0, 3);
    examples.forEach((r) => console.log(`    e.g. Employee=${r.Employee}: C1 ${r.C1_Calc}/${r.C1_Expected}(${r.C1_Match}) C2 ${r.C2_Calc}/${r.C2_Expected}(${r.C2_Match}) C3 ${r.C3_Calc}/${r.C3_Expected}(${r.C3_Match}) C4 ${r.C4_Calc}/${r.C4_Expected}(${r.C4_Match}) C5 ${r.C5_Calc}/${r.C5_Expected}(${r.C5_Match}) C6 ${r.C6_Calc}/${r.C6_Expected}(${r.C6_Match}) | Total ${r.Total_Calc}/${r.Total_Expected}=${r.Difference}`));
  } catch (e) { console.log(`  ERROR: ${e}`); }

  // ---- (3) Meridian batches/periods + meridian-detail.csv match ----
  console.log('\n=== (3) Meridian batches/periods + meridian-detail.csv match ===');
  const { data: mer } = await sb.from('tenants').select('id').ilike('name', '%Meridian%').maybeSingle();
  const merId = (mer as any)?.id;
  console.log(`  Meridian tenant: ${short(merId)}`);
  if (merId) {
    const { data: batches } = await sb.from('calculation_batches').select('id, period_id, rule_set_id, entity_count, lifecycle_state, created_at').eq('tenant_id', merId).order('created_at', { ascending: false }).limit(20);
    console.log(`  batches: ${batches?.length}`);
    (batches ?? []).forEach((b: any) => console.log(`    ${short(b.id)} period=${short(b.period_id)} rs=${short(b.rule_set_id)} entities=${b.entity_count} state=${b.lifecycle_state} ${String(b.created_at).slice(0,10)}`));
    // periods table
    const periodIds = Array.from(new Set((batches ?? []).map((b: any) => b.period_id).filter(Boolean)));
    if (periodIds.length) {
      const { data: periods } = await sb.from('periods').select('id, name, start_date, end_date').in('id', periodIds as string[]);
      (periods ?? []).forEach((p: any) => console.log(`    period ${short(p.id)} "${p.name}" ${p.start_date}..${p.end_date}`));
    }
    // does meridian-detail.csv entity 70001 exist as a Meridian entity?
    const { data: e70001 } = await sb.from('entities').select('id, external_id').eq('tenant_id', merId).eq('external_id', '70001').maybeSingle();
    console.log(`  entity external_id '70001' present in Meridian: ${e70001 ? 'YES (' + short((e70001 as any).id) + ')' : 'NO'}`);
    // csv header/period reminder
    const csvHdr = fs.readFileSync('scripts/output/hf222-phase64-meridian-detail.csv', 'utf8').split('\n')[0];
    console.log(`  meridian-detail.csv header: ${csvHdr}`);
    console.log(`  meridian-detail.csv period label: "January 2025" (row sample) — compare to live batch periods above for self-vs-cross-period.`);
  }

  console.log('\n================ END FINAL PROBE ================');
}
main().catch((e) => { console.error('SCRIPT ERROR:', e); process.exit(1); });
