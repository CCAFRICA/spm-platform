// OB-233 Phase B pipeline proof. Runs the EXACT finalize-import spine (generateComprehension ->
// runSummaryEngine -> generateInsights) against a tenant's existing committed_data, then queries the
// three artifact tables. Exercises the real wired functions (no reimplementation).
// Usage: npx tsx --env-file=.env.local scripts/_ob233-pipeline-proof.ts "<tenant name substring>" [--clean] [--list]
import { createClient } from '@supabase/supabase-js';
import { generateComprehension } from '../src/lib/summary/comprehension-generator';
import { runSummaryEngine } from '../src/lib/summary/summary-engine';
import { generateInsights } from '../src/lib/insight/insight-engine';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
/* eslint-disable @typescript-eslint/no-explicit-any */

async function listTenants() {
  const { data } = await sb.from('tenants').select('id, name, slug').order('name');
  for (const t of (data ?? []) as any[]) {
    const { count: cd } = await sb.from('committed_data').select('id', { count: 'exact', head: true }).eq('tenant_id', t.id);
    const { count: rs } = await sb.from('rule_sets').select('id', { count: 'exact', head: true }).eq('tenant_id', t.id);
    console.log(`${t.name} | ${t.slug} | ${t.id} | committed_data=${cd} rule_sets=${rs}`);
  }
}

async function main() {
  const arg = process.argv[2];
  if (process.argv.includes('--list') || !arg) { await listTenants(); return; }

  const { data: tens } = await sb.from('tenants').select('id, name').ilike('name', `%${arg}%`);
  if (!tens || tens.length === 0) { console.log(`no tenant matching "${arg}"`); return; }
  const t = tens[0] as any;
  const tenantId = t.id as string;
  console.log(`=== OB-233 pipeline proof: ${t.name} (${tenantId}) ===\n`);

  if (process.argv.includes('--clean')) {
    await sb.from('comprehension_artifacts').delete().eq('tenant_id', tenantId);
    await sb.from('summary_artifacts').delete().eq('tenant_id', tenantId);
    await sb.from('intelligence_artifacts').delete().eq('tenant_id', tenantId);
    console.log('clean-slate: cleared comprehension/summary/intelligence artifacts\n');
  }

  const insightsOnly = process.argv.includes('--insights-only');
  const t0 = Date.now();
  let tS = t0;
  if (!insightsOnly) {
    const c = await generateComprehension(sb, tenantId);
    const tC = Date.now();
    console.log(`[1] comprehension: fields=${c.fieldsComprehended} dataTypes=${c.dataTypes}  (+${tC - t0}ms)`);
    const s = await runSummaryEngine(sb, tenantId, () => {});
    tS = Date.now();
    console.log(`[2] summary: via=${s.via} written=${s.written} skipped=${s.skipped}  (+${tS - tC}ms)`);
  }

  const ins = await generateInsights(sb, tenantId);
  const tI = Date.now();
  console.log(`[3] insights: generated=${ins.generated} stored=${ins.stored} failed=${ins.failed} validated=${ins.validated}  (+${tI - tS}ms)`);
  if (!insightsOnly) console.log(`TOTAL pipeline: ${tI - t0}ms\n`);

  // ---- PG queries ----
  const { data: ca } = await sb.from('comprehension_artifacts')
    .select('field_name, characterization, aggregation_behavior, display_label, aggregation_method, identifies')
    .eq('tenant_id', tenantId).limit(8);
  const { count: caCount } = await sb.from('comprehension_artifacts').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId);
  console.log(`comprehension_artifacts: count=${caCount}`);
  console.log('  has structuralType/contextualIdentity? ', JSON.stringify(ca?.[0] ?? {}).match(/structuralType|contextualIdentity/) ? 'YES (BAD)' : 'no (free-form, good)');
  for (const r of (ca ?? []) as any[]) console.log(`  - ${r.field_name} | label=${JSON.stringify(r.display_label)} method=${JSON.stringify(r.aggregation_method)} | "${String(r.characterization).slice(0, 70)}"`);

  const { data: sa } = await sb.from('summary_artifacts').select('entity_id, summary_date, data_type, metrics, row_count').eq('tenant_id', tenantId).limit(3);
  const { count: saCount } = await sb.from('summary_artifacts').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId);
  console.log(`\nsummary_artifacts: count=${saCount}`);
  for (const r of (sa ?? []) as any[]) console.log(`  - ${r.summary_date} dt=${r.data_type} rows=${r.row_count} metricsKeys=[${Object.keys(r.metrics || {}).join(', ')}]`);
  // sum a metric across all rows (semantic key, if present) for a conservation check
  if (sa && sa.length) {
    const keys = Object.keys((sa[0] as any).metrics || {});
    const { data: allSa } = await sb.from('summary_artifacts').select('metrics').eq('tenant_id', tenantId);
    for (const k of keys.slice(0, 6)) {
      let tot = 0; for (const r of (allSa ?? []) as any[]) tot += Number(r.metrics?.[k] ?? 0);
      console.log(`    sum(${k}) across all summary rows = ${tot.toLocaleString()}`);
    }
  }

  const { data: ia } = await sb.from('intelligence_artifacts').select('artifact_type, severity, entity_type, title, narrative, shape_description, source').eq('tenant_id', tenantId).limit(4);
  const { count: iaCount } = await sb.from('intelligence_artifacts').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId);
  console.log(`\nintelligence_artifacts: count=${iaCount}`);
  for (const r of (ia ?? []) as any[]) {
    console.log(`  - [${String(r.artifact_type).slice(0, 50)}] sev="${String(r.severity).slice(0, 40)}" type=${r.entity_type}`);
    console.log(`      title: ${r.title}`);
    console.log(`      shape: ${String(r.shape_description ?? '').slice(0, 80)}`);
  }
  console.log('\n=== done ===');
}
main().catch((e) => { console.error(e); process.exit(1); });
