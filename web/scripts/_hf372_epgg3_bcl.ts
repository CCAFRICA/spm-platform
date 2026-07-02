// HF-372 Phase G / EPG-G3 — BCL non-regression + structure restoration, library-driven end-to-end:
// clean-slate VLTEST2 → import plan → roster → six Datos files (the directive's sequence) → verify:
// plan interpretation received its full sheet set (component count + names verbatim), Datos =
// transaction with ALL rows linked, entity count = the real population, one finalize claim per
// import. Then EPG-G4: a repeat Datos import shows the warm path (atom claims, elapsed).
//   from web/:  SCI_HC_BATCH_SIZE=12 npx tsx scripts/_hf372_epgg3_bcl.ts [repeat-only]
import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import { runImport } from './_hf372_epgg_import';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb: any = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const VLTEST2 = '5b078b52-55c9-4612-8f86-96038c198bfe';
const DIR = '/Users/AndrewAfrica/Desktop/ViaLuce AI/VL Demo Environment/VL DEMO/Banco Cumbre/BCL Proof Tenant Files';
const SEQUENCE = [
  'BCL_Plan_Comisiones_2025.xlsx',
  'BCL_Plantilla_Personal.xlsx',
  'BCL_Datos_Oct2025.xlsx',
  'BCL_Datos_Nov2025.xlsx',
  'BCL_Datos_Dic2025.xlsx',
  'BCL_Datos_Ene2026.xlsx',
  'BCL_Datos_Feb2026.xlsx',
  'BCL_Datos_Mar2026.xlsx',
];

async function verify(label: string) {
  console.log(`\n════ VERIFY: ${label} ════`);
  // committed_data by data_type + linkage
  for (const dt of ['transaction', 'entity', 'reference', 'target']) {
    const { count: total } = await sb.from('committed_data').select('id', { count: 'exact', head: true }).eq('tenant_id', VLTEST2).eq('data_type', dt);
    const { count: linked } = await sb.from('committed_data').select('id', { count: 'exact', head: true }).eq('tenant_id', VLTEST2).eq('data_type', dt).not('entity_id', 'is', null);
    if ((total ?? 0) > 0) console.log(`  committed_data[${dt}]: total=${total} linked=${linked}`);
  }
  const { count: entities } = await sb.from('entities').select('id', { count: 'exact', head: true }).eq('tenant_id', VLTEST2);
  console.log(`  entities: ${entities}`);
  const { data: rsets } = await sb.from('rule_sets').select('name, status, components').eq('tenant_id', VLTEST2).eq('status', 'active');
  for (const rs of rsets ?? []) {
    const names: string[] = [];
    for (const v of rs.components?.variants ?? []) for (const c of v.components ?? []) names.push(`[${v.variantName ?? v.variantId}] ${c.name}`);
    console.log(`  rule_set "${rs.name}": ${names.length} components`);
    for (const n of names) console.log(`     - ${n}`);
  }
  const { data: claims } = await sb.from('import_finalize_runs').select('proposal_id, status, claimed_at').eq('tenant_id', VLTEST2).order('claimed_at', { ascending: false }).limit(12);
  console.log(`  finalize claims: ${claims?.length ?? 0} (${(claims ?? []).filter((c: { status: string }) => c.status === 'done').length} done)`);
  const { count: assignments } = await sb.from('rule_set_assignments').select('id', { count: 'exact', head: true }).eq('tenant_id', VLTEST2);
  console.log(`  rule_set_assignments: ${assignments}`);
}

async function main() {
  const repeatOnly = process.argv[2] === 'repeat-only';
  if (!repeatOnly) {
    for (const f of SEQUENCE) {
      console.log(`\n──── IMPORT ${f} ────`);
      const r = await runImport(VLTEST2, `${DIR}/${f}`);
      for (const v of r.verdicts) console.log(`  verdict: [${v.tab}] → ${v.classification}@${v.confidence}${v.split ? ' (::split)' : ''}`);
      for (const c of r.committed) console.log(`  commit:  [${c.tab}] ${c.classification} rows=${c.rows} ok=${c.ok} ${c.error ?? ''}`);
      for (const p of r.planResults) console.log(`  plan:    ${p.unit} success=${p.success} ${String(p.error ?? '').slice(0, 140)}`);
      console.log(`  wall: ${(r.wallMs / 1000).toFixed(1)}s`);
    }
    await verify('after full sequence');
  }

  // EPG-G4: repeat an identical Datos import post-warm — atom claims + elapsed prove acceleration.
  console.log(`\n──── EPG-G4 REPEAT: BCL_Datos_Ene2026.xlsx (warm) ────`);
  const t0 = Date.now();
  const r = await runImport(VLTEST2, `${DIR}/BCL_Datos_Ene2026.xlsx`);
  for (const v of r.verdicts) console.log(`  verdict: [${v.tab}] → ${v.classification}@${v.confidence}`);
  for (const c of r.committed) console.log(`  commit:  [${c.tab}] ${c.classification} rows=${c.rows} ok=${c.ok}`);
  console.log(`  warm wall: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  await verify('after warm repeat');
}
main().catch(e => { console.error(e); process.exit(1); });
