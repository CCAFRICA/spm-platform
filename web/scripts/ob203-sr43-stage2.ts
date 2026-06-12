import { createClient } from '@supabase/supabase-js';
const TENANT = '24103940-ab33-4a21-b6fd-bd1042f4762c';
const RUN_START = '2026-06-11T22:05:00Z';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const j = (o:any)=>JSON.stringify(o);
(async () => {
  // ── (1) Transaction commit — the gate ──
  console.log('=== (1) committed_data EXACT by data_type ===');
  for (const t of ['entity','transaction','reference','target']) {
    const { count } = await sb.from('committed_data').select('*',{count:'exact',head:true}).eq('tenant_id',TENANT).eq('data_type',t);
    console.log(`  ${t}: ${count ?? 0}`);
  }

  // ── (2) Class fix live — classification_signals for the run ──
  console.log('\n=== (2) classification_signals (run window) ===');
  const { data: sigs } = await sb.from('classification_signals')
    .select('sheet_name, classification, decision_source, confidence, created_at')
    .eq('tenant_id',TENANT).gte('created_at',RUN_START).order('created_at',{ascending:false});
  for (const s of sigs ?? []) console.log(`  ${s.created_at} sheet=${s.sheet_name} class=${s.classification} src=${s.decision_source} conf=${s.confidence}`);
  const dr = (sigs ?? []).find(s => s.sheet_name === 'Datos_Rendimiento');
  console.log(`  -> Datos_Rendimiento: ${dr ? `${dr.classification} via ${dr.decision_source}` : 'MISSING'} ${dr?.classification==='transaction'&&dr?.decision_source==='hc_pattern'?'[PASS]':'[CHECK]'}`);

  // ── (3) Atom claims: Codigo_Turno new atom + roleConfidence + ambiguous preserved ──
  console.log('\n=== (3) structural_fingerprints granularity=atom ===');
  const { data: atoms } = await sb.from('structural_fingerprints')
    .select('fingerprint_hash, column_roles, match_count, confidence, algorithm_version').eq('tenant_id',TENANT).eq('granularity','atom');
  console.log(`  atom rows: ${atoms?.length ?? 0}`);
  const codigo = (atoms ?? []).find(a => (a.fingerprint_hash as string).startsWith('96c54b34b2ae'));
  console.log(`  Codigo_Turno atom 96c54b34b2ae: ${codigo ? `role_obj=${j(codigo.column_roles)} match=${codigo.match_count} algoV=${codigo.algorithm_version}` : 'NOT WRITTEN'}`);
  const ambig = (atoms ?? []).find(a => (a.fingerprint_hash as string).startsWith('0441c426eab1'));
  console.log(`  ambiguous atom 0441c426eab1: ${ambig ? j(ambig.column_roles) : 'absent'}`);
  const withRoleConf = (atoms ?? []).filter(a => (a.column_roles as any)?.roleConfidence != null).length;
  console.log(`  atoms with roleConfidence populated: ${withRoleConf}/${atoms?.length ?? 0}`);

  // ── (4) Spurious entities from Codigo_Turno ──
  console.log('\n=== (4) entities created in run window ===');
  const { data: ents } = await sb.from('entities').select('*').eq('tenant_id',TENANT).gte('created_at',RUN_START).limit(50);
  console.log(`  entities created >=${RUN_START}: ${ents?.length ?? 0}`);
  if (ents?.[0]) console.log('  columns:', Object.keys(ents[0]).join(', '));
  for (const e of (ents ?? []).slice(0,12)) {
    const id = (e as any).external_id ?? (e as any).entity_external_id ?? (e as any).name ?? '?';
    console.log(`    ${id}  type=${(e as any).entity_type ?? (e as any).type ?? '?'}`);
  }

  // ── (5) Observability: failure signals ──
  console.log('\n=== (5) failure signals in run window ===');
  for (const sig of ['comprehension:atom_write_failed','failed_interpretation']) {
    const { count } = await sb.from('classification_signals').select('*',{count:'exact',head:true})
      .eq('tenant_id',TENANT).gte('created_at',RUN_START).eq('signal_type',sig);
    console.log(`  ${sig}: ${count ?? 0}`);
  }
})();
