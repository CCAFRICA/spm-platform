// OB-203 EPG-2.4 — inspect sandbox state before targeted reset (read-only).
// Sandbox tenant 24103940-… . Lists sheet vs atom fingerprints, committed_data by
// data_type, import_batches, recent classification_signals. No writes.
import { createClient } from '@supabase/supabase-js';

const TENANT = '24103940-ab33-4a21-b6fd-bd1042f4762c';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

(async () => {
  // ── structural_fingerprints (sheet/composite vs atom) ──
  const { data: fps, error: fpErr } = await sb
    .from('structural_fingerprints')
    .select('id, fingerprint_hash, granularity, confidence, match_count, classification_result, column_roles')
    .eq('tenant_id', TENANT);
  if (fpErr) { console.error('fp err', fpErr); process.exit(1); }

  const atoms = (fps ?? []).filter(r => r.granularity === 'atom');
  const sheets = (fps ?? []).filter(r => r.granularity !== 'atom');
  console.log(`\n=== structural_fingerprints: ${fps?.length ?? 0} total (atoms=${atoms.length}, sheet/other=${sheets.length}) ===`);
  for (const r of sheets) {
    const cr = r.classification_result as Record<string, unknown> | null;
    const cls = cr?.classification ?? '?';
    const tab = cr?.tabName ?? '?';
    const fb = Array.isArray(cr?.fieldBindings) ? (cr!.fieldBindings as unknown[]).length : 0;
    console.log(`  SHEET ${(r.fingerprint_hash as string).slice(0,12)}  gran=${r.granularity}  class=${cls}  conf=${r.confidence}  match=${r.match_count}  bindings=${fb}  tab=${tab}`);
  }

  // ── committed_data by data_type ──
  const { data: cd } = await sb
    .from('committed_data')
    .select('data_type, import_batch_id')
    .eq('tenant_id', TENANT);
  const byType: Record<string, number> = {};
  const batchByType: Record<string, Set<string>> = {};
  for (const r of cd ?? []) {
    const t = (r.data_type as string) ?? 'null';
    byType[t] = (byType[t] ?? 0) + 1;
    (batchByType[t] ??= new Set()).add(r.import_batch_id as string);
  }
  console.log(`\n=== committed_data by data_type (total ${cd?.length ?? 0}) ===`);
  for (const [t, n] of Object.entries(byType)) {
    console.log(`  ${t}: ${n} rows  across batches [${[...batchByType[t]].map(b => (b ?? 'null').slice(0,8)).join(', ')}]`);
  }

  // ── import_batches ──
  const { data: batches } = await sb
    .from('import_batches')
    .select('id, data_type, status, sheet_name, created_at, row_count')
    .eq('tenant_id', TENANT)
    .order('created_at');
  console.log(`\n=== import_batches: ${batches?.length ?? 0} ===`);
  for (const b of batches ?? []) {
    console.log(`  ${(b.id as string).slice(0,8)}  type=${b.data_type}  status=${b.status}  sheet=${b.sheet_name}  rows=${b.row_count}  ${b.created_at}`);
  }

  // ── recent classification_signals ──
  const { data: sigs } = await sb
    .from('classification_signals')
    .select('sheet_name, classification, decision_source, confidence, created_at')
    .eq('tenant_id', TENANT)
    .order('created_at', { ascending: false })
    .limit(20);
  console.log(`\n=== classification_signals (latest ${sigs?.length ?? 0}) ===`);
  for (const s of sigs ?? []) {
    console.log(`  ${s.created_at}  sheet=${s.sheet_name}  class=${s.classification}  src=${s.decision_source}  conf=${s.confidence}`);
  }
})();
