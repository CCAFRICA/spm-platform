// OB-203 EPG-2.4 — TARGETED reset (architect-approved 2026-06-11). Deletes ONLY the polluted
// artifacts: sheet fingerprints d464fd4d4413 (contaminated target) + 6cc99dae5b60, and the
// data_type='target' committed batch. Atoms (granularity='atom') and all other fingerprints/
// committed_data STAND. Re-reads verified state after.
import { createClient } from '@supabase/supabase-js';

const TENANT = '24103940-ab33-4a21-b6fd-bd1042f4762c';
const KILL_HASH_PREFIXES = ['d464fd4d4413', '6cc99dae5b60'];
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

(async () => {
  // ── 1. delete the two named sheet fingerprints (by full hash, matched via prefix) ──
  const { data: fps } = await sb
    .from('structural_fingerprints')
    .select('id, fingerprint_hash, granularity, classification_result')
    .eq('tenant_id', TENANT).eq('granularity', 'sheet');
  const kill = (fps ?? []).filter(r => KILL_HASH_PREFIXES.some(p => (r.fingerprint_hash as string).startsWith(p)));
  console.log(`Matched ${kill.length} sheet fingerprints to delete:`);
  for (const r of kill) {
    const cls = (r.classification_result as Record<string, unknown> | null)?.classification ?? '?';
    console.log(`  DEL ${(r.fingerprint_hash as string).slice(0,12)} class=${cls}`);
  }
  if (kill.length !== KILL_HASH_PREFIXES.length) { console.error('ABORT: expected exactly 2 matches'); process.exit(1); }
  const { error: fpDelErr, count: fpDel } = await sb
    .from('structural_fingerprints').delete({ count: 'exact' })
    .in('id', kill.map(r => r.id));
  if (fpDelErr) { console.error('fp delete err', fpDelErr); process.exit(1); }
  console.log(`Deleted ${fpDel} sheet fingerprints.\n`);

  // ── 2. delete the data_type='target' committed batch ──
  const { error: cdDelErr, count: cdDel } = await sb
    .from('committed_data').delete({ count: 'exact' })
    .eq('tenant_id', TENANT).eq('data_type', 'target');
  if (cdDelErr) { console.error('committed_data delete err', cdDelErr); process.exit(1); }
  console.log(`Deleted ${cdDel} committed_data rows (data_type='target').\n`);

  // ── 3. VERIFIED STATE (post-reset) ──
  const { data: fps2 } = await sb
    .from('structural_fingerprints')
    .select('fingerprint_hash, granularity, confidence, match_count, classification_result')
    .eq('tenant_id', TENANT);
  const atoms = (fps2 ?? []).filter(r => r.granularity === 'atom');
  const sheets = (fps2 ?? []).filter(r => r.granularity !== 'atom');
  console.log('=== VERIFIED STATE — structural_fingerprints ===');
  console.log(`atoms (granularity='atom'): ${atoms.length}  [PRESERVED]`);
  for (const r of sheets) {
    const cls = (r.classification_result as Record<string, unknown> | null)?.classification ?? '?';
    const tab = (r.classification_result as Record<string, unknown> | null)?.tabName ?? '?';
    console.log(`  SHEET ${(r.fingerprint_hash as string).slice(0,12)} class=${cls} conf=${r.confidence} match=${r.match_count} tab=${tab}`);
  }

  const { data: cd } = await sb.from('committed_data').select('data_type').eq('tenant_id', TENANT);
  const byType: Record<string, number> = {};
  for (const r of cd ?? []) byType[(r.data_type as string) ?? 'null'] = (byType[(r.data_type as string) ?? 'null'] ?? 0) + 1;
  console.log(`\n=== VERIFIED STATE — committed_data by data_type (total ${cd?.length ?? 0}) ===`);
  for (const [t, n] of Object.entries(byType)) console.log(`  ${t}: ${n}`);
  if (byType['target']) { console.error("ABORT-CHECK: target rows still present!"); process.exit(1); }
  console.log("\n  target: 0  [contaminated batch cleared]");
  console.log('\nTargeted reset complete. d464 + 6cc99dae gone; target batch gone; atoms + clean sheets stand.');
})();
