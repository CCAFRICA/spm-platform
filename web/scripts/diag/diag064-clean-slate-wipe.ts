// OB-203 Phase 6B — CLEAN-SLATE WIPE (architect-ruled, 2026-06-12).
// Ruling: docs/vp-prompts/OB-203_PHASE-6B_CLEAN_SLATE_RULING_20260612.md (4145fb2c)
//
// Deletion to ZERO within scope, then organic rebuild by correct code. Scope is
// tenant 3d354bfa… (MX Restaurant witness tenant) + the datos-cadena file's
// learning state. SEVEN categories (ruling §1.1-1.7). Other tenants' learning
// state (BCL, Meridian, CRP) is untouchable: every statement carries the tenant
// guard, and the sheet-fingerprint set is asserted against the known hash set
// from DIAG-064 evidence — ANY unknown sheet-level hash aborts with zero writes.
//
// DRY_RUN=1: full census + scope assertions + planned deletions, ZERO writes.
// Real run: deletes in FK-safe order, then pastes the zero-state verification.
//
// Run from the witness worktree:
//   cd web && set -a && source .env.local && set +a && DRY_RUN=1 npx tsx scripts/diag/diag064-clean-slate-wipe.ts
//   cd web && set -a && source .env.local && set +a && npx tsx scripts/diag/diag064-clean-slate-wipe.ts

import { createClient } from '@supabase/supabase-js';

const TENANT = '3d354bfa-b298-48dd-88a0-9f8c5a00be4e';
const DRY = process.env.DRY_RUN === '1';

// The known sheet-fingerprint set for datos-cadena-restaurantes-mx.xlsx:
// the 16 repaired rows + the morning-created second Portada fingerprint
// (9aa35481eb9c), all recorded in DIAG-064_S4 evidence. "No partial memory
// survives" — the full set goes.
const KNOWN_SHEET_HASH_PREFIXES = [
  '9ed65e0e2326', '78966ee2ad81', '7707e8553823', 'b42ee218cb37',
  '4e920093ddd7', '97c615dedbf2', '2ac20a402576', '19e90c26c9d8',
  'd984b141a017', 'ffb69592f7b7', '21743cb83fc7', 'bc3da24d0055',
  'fc69dad00e10', 'afb789d55ae5', 'a989a5e0517c', '690ade75ed05',
  '9aa35481eb9c',
];

const SESSIONS = [
  'd8085364-72b1-4c6f-9d9e-20606fb14831', // morning warm run
  'e0f86141-1729-4d9e-a53d-6ddf3ee46580', // voided wrong-vintage attempt
  'fc2318fe',                              // attempt 5 (prefix; proposal listing matched below)
];

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function count(table: string): Promise<number> {
  const { count: n, error } = await sb.from(table).select('*', { count: 'exact', head: true }).eq('tenant_id', TENANT);
  if (error) throw new Error(`${table} count failed: ${error.message}`);
  return n ?? 0;
}

async function main() {
  console.log(`CLEAN-SLATE WIPE — tenant ${TENANT} ${DRY ? '(DRY RUN, zero writes)' : '(LIVE)'}\n`);

  // ── Census + scope assertions (always) ──
  const { data: fpRows, error: fpErr } = await sb.from('structural_fingerprints')
    .select('id, fingerprint_hash, classification_result, created_at')
    .eq('tenant_id', TENANT);
  if (fpErr) throw new Error(`fingerprint census failed: ${fpErr.message}`);
  const fps = fpRows ?? [];
  const sheetRows = fps.filter(r => typeof ((r.classification_result ?? {}) as Record<string, unknown>).tabName === 'string');
  const atomRows = fps.filter(r => !sheetRows.includes(r));
  console.log(`structural_fingerprints: ${fps.length} total = ${sheetRows.length} sheet-level + ${atomRows.length} atom-level`);
  for (const r of sheetRows) {
    const hash = String(r.fingerprint_hash);
    const known = KNOWN_SHEET_HASH_PREFIXES.some(p => hash.startsWith(p));
    const tab = ((r.classification_result ?? {}) as Record<string, unknown>).tabName;
    console.log(`  sheet ${hash.slice(0, 12)} (${tab}) ${known ? 'in known set' : '*** UNKNOWN ***'}`);
    if (!known) {
      console.error(`ABORT: sheet-level fingerprint ${hash.slice(0, 12)} is outside the known set. Zero writes performed.`);
      process.exit(1);
    }
  }

  const { data: sigTypes } = await sb.from('classification_signals')
    .select('signal_type').eq('tenant_id', TENANT).limit(2000);
  const typeTally = new Map<string, number>();
  for (const r of (sigTypes ?? [])) typeTally.set(r.signal_type, (typeTally.get(r.signal_type) ?? 0) + 1);
  const signalCount = await count('classification_signals');
  console.log(`\nclassification_signals: ${signalCount} rows; types: ${Array.from(typeTally.entries()).map(([t, n]) => `${t}:${n}`).join(', ')}`);
  // Scope check: every type must be import-lineage (comprehension/classification/
  // interaction/observability/learning families). Anything else aborts.
  // 'cost:event' and 'plan_skeleton' verified import-lineage by provenance
  // (both created 2026-06-12T15:21:12Z inside the morning warm run's window:
  // the SCI cost capture and the plan-interpretation LLM record — pasted in
  // DIAG-064_CLEAN_SLATE_OUTPUT.md).
  const IMPORT_FAMILIES = ['comprehension:', 'classification:', 'interaction:', 'observability:', 'learning'];
  const VERIFIED_IMPORT_TYPES = ['cost:event', 'plan_skeleton'];
  for (const t of Array.from(typeTally.keys())) {
    if (VERIFIED_IMPORT_TYPES.includes(t)) continue;
    if (!IMPORT_FAMILIES.some(f => t.startsWith(f))) {
      console.error(`ABORT: signal_type '${t}' is not import-lineage — outside ruled scope. Zero writes performed.`);
      process.exit(1);
    }
  }

  const counts = {
    committed_data: await count('committed_data'),
    import_batches: await count('import_batches'),
    entities: await count('entities'),
    import_session_telemetry: await count('import_session_telemetry'),
    processing_jobs: await count('processing_jobs'),
  };
  console.log(`committed_data: ${counts.committed_data} | import_batches: ${counts.import_batches} | entities: ${counts.entities} | import_session_telemetry: ${counts.import_session_telemetry} | processing_jobs: ${counts.processing_jobs}`);

  const { data: proposalObjs } = await sb.storage.from('ingestion-raw').list(`${TENANT}/proposals`);
  const proposalsToDelete = (proposalObjs ?? [])
    .filter(o => SESSIONS.some(s => o.name.startsWith(s)))
    .map(o => `${TENANT}/proposals/${o.name}`);
  console.log(`storage proposals for named sessions: ${proposalsToDelete.length} of ${(proposalObjs ?? []).length} listed → ${proposalsToDelete.map(p => p.split('/').pop()).join(', ') || '(none)'}`);

  if (DRY) {
    console.log('\nDRY RUN complete — scope verified, zero writes. Re-run without DRY_RUN=1 to execute.');
    return;
  }

  // ── LIVE wipe, FK-safe order, every statement tenant-guarded ──
  console.log('\n--- LIVE WIPE ---');
  const del = async (table: string) => {
    const { error } = await sb.from(table).delete().eq('tenant_id', TENANT);
    if (error) { console.error(`ABORT at ${table}: ${error.message} (categories before this one are already wiped — report to architect)`); process.exit(1); }
    console.log(`wiped ${table}`);
  };
  await del('classification_signals');        // §1.3
  await del('import_session_telemetry');      // §1.6
  // §1.4a committed_data: 325k rows — a single DELETE exceeds the Small tier's
  // statement timeout (first live run aborted there; script is idempotent and
  // re-runnable). Chunked id-batch deletion, tenant-guarded on BOTH the select
  // and the delete, 5,000 per statement.
  // The standing .in() cap is 200 (Section G): a 5,000-UUID IN-list exceeds the
  // PostgREST URL limit (the prior attempt's Bad Request).
  {
    let wiped = 0;
    for (;;) {
      const { data: ids, error: selErr } = await sb.from('committed_data')
        .select('id').eq('tenant_id', TENANT).limit(200);
      if (selErr) { console.error(`ABORT at committed_data select: ${selErr.message}`); process.exit(1); }
      if (!ids || ids.length === 0) break;
      const { error: delErr } = await sb.from('committed_data')
        .delete().eq('tenant_id', TENANT).in('id', ids.map(r => r.id));
      if (delErr) { console.error(`ABORT at committed_data chunk: ${delErr.message}`); process.exit(1); }
      wiped += ids.length;
      if (wiped % 50000 < 200) console.log(`  committed_data: ${wiped} wiped...`);
    }
    console.log(`wiped committed_data (${wiped} rows, chunked at the standing 200)`);
  }
  // §1.1 + §1.2 BEFORE §1.4b: structural_fingerprints.import_batch_id (HF-213
  // lineage back-link) references import_batches — fingerprints must go first
  // (live FK: structural_fingerprints_import_batch_id_fkey).
  await del('structural_fingerprints');       // §1.1 + §1.2 (sheet + atoms, set-asserted above)
  await del('import_batches');                // §1.4b
  await del('entities');                      // §1.5
  await del('processing_jobs');               // §1.7 session records (jobs spine)
  if (proposalsToDelete.length > 0) {
    const { error: stErr } = await sb.storage.from('ingestion-raw').remove(proposalsToDelete);
    if (stErr) { console.error(`ABORT at storage proposals: ${stErr.message}`); process.exit(1); }
  }
  console.log(`wiped ${proposalsToDelete.length} storage proposal object(s)   // §1.7`);

  // ── Zero-state verification (pasted) ──
  console.log('\n--- POST-WIPE VERIFICATION (must all be ZERO/none) ---');
  const after = {
    structural_fingerprints: await count('structural_fingerprints'),
    classification_signals: await count('classification_signals'),
    committed_data: await count('committed_data'),
    import_batches: await count('import_batches'),
    entities: await count('entities'),
    import_session_telemetry: await count('import_session_telemetry'),
    processing_jobs: await count('processing_jobs'),
  };
  const { data: afterProps } = await sb.storage.from('ingestion-raw').list(`${TENANT}/proposals`);
  const remainingNamed = (afterProps ?? []).filter(o => SESSIONS.some(s => o.name.startsWith(s))).length;
  let fail = false;
  for (const [k, v] of Object.entries(after)) {
    console.log(`${k.padEnd(26)} ${v === 0 ? 'ZERO' : `*** ${v} REMAIN ***`}`);
    if (v !== 0) fail = true;
  }
  console.log(`${'storage proposals (named)'.padEnd(26)} ${remainingNamed === 0 ? 'none' : `*** ${remainingNamed} REMAIN ***`}`);
  if (remainingNamed !== 0) fail = true;
  console.log(fail ? '\nVERIFICATION FAIL — HALT.' : '\nVERIFICATION PASS: clean slate within scope; other tenants untouched (every statement tenant-guarded).');
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error('FATAL:', e instanceof Error ? e.message : e); process.exit(1); });
