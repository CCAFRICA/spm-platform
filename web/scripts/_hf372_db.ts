// HF-372 Phase 0 — ad-hoc READ-ONLY DB inspection runner. Each named probe is a small readonly
// query; run: npx tsx scripts/_hf372_db.ts <probe> [args...]
import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb: any = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const VLTEST2 = '5b078b52-55c9-4612-8f86-96038c198bfe';
const CASA = '2d9979ba-5032-48a7-bccf-1928f3e6dadf';

const probes: Record<string, (args: string[]) => Promise<void>> = {
  async sheetfp() {
    for (const [name, tid] of [['VLTEST2', VLTEST2], ['CasaDiaz', CASA]] as const) {
      const { data } = await sb.from('structural_fingerprints')
        .select('fingerprint_hash, granularity, match_count, confidence, updated_at, classification_result')
        .eq('tenant_id', tid).neq('granularity', 'atom')
        .order('updated_at', { ascending: false }).limit(15);
      console.log(`\n=== ${name}: non-atom fingerprint rows (${data?.length ?? 0}) ===`);
      for (const r of data ?? []) console.log(`  ${String(r.fingerprint_hash).slice(0, 12)} g=${r.granularity} mc=${r.match_count} conf=${r.confidence} cls=${JSON.stringify(r.classification_result)?.slice(0, 100)} upd=${r.updated_at}`);
    }
  },
  async jobs(args) {
    const tid = args[0] === 'casa' ? CASA : VLTEST2;
    const { data } = await sb.from('processing_jobs')
      .select('id, file_name, status, recognition_tier, error_detail, retry_count, created_at, updated_at')
      .eq('tenant_id', tid).order('created_at', { ascending: false }).limit(Number(args[1] ?? 15));
    for (const r of data ?? []) console.log(`${r.created_at} ${String(r.id).slice(0, 8)} ${r.status.padEnd(12)} t${r.recognition_tier ?? '-'} retry=${r.retry_count ?? 0} ${String(r.file_name).slice(0, 50)} err=${String(r.error_detail ?? '').slice(0, 120)}`);
  },
  async job(args) {
    const { data } = await sb.from('processing_jobs').select('*').eq('id', args[0]).single();
    const j = { ...data };
    for (const k of ['proposal', 'classification_result']) if (j[k]) j[k] = JSON.stringify(j[k]).slice(0, 800);
    console.log(JSON.stringify(j, null, 1));
  },
  async bucket() {
    const { data, error } = await sb.storage.listBuckets();
    if (error) { console.log('ERR', error.message); return; }
    for (const b of data ?? []) console.log(`bucket=${b.name} public=${b.public} file_size_limit=${b.file_size_limit ?? 'NULL'} allowed_mime=${b.allowed_mime_types ?? 'NULL'}`);
  },
  async delsheetfp(args) {
    // Phase-0 harness support: remove SPECIFIC sheet-granularity fingerprint rows (by hash prefix)
    // so HC re-runs (atoms left intact = the warm/corrupted memory under test). Proof tenants only.
    const tid = args[0] === 'casa' ? CASA : VLTEST2;
    const prefixes = args.slice(1);
    const { data } = await sb.from('structural_fingerprints')
      .select('id, fingerprint_hash, granularity').eq('tenant_id', tid).neq('granularity', 'atom');
    const victims = (data ?? []).filter((r: { fingerprint_hash: string }) => prefixes.some(p => r.fingerprint_hash.startsWith(p)));
    for (const v of victims) {
      const { error } = await sb.from('structural_fingerprints').delete().eq('id', v.id);
      console.log(`  removed ${String(v.fingerprint_hash).slice(0, 12)} g=${v.granularity} ${error ? 'ERR ' + error.message : ''}`);
    }
    console.log(`deleted ${victims.length} rows for ${tid.slice(0, 8)}…`);
  },
};

const [probe, ...rest] = process.argv.slice(2);
const fn = probes[probe];
if (!fn) { console.log(`probes: ${Object.keys(probes).join(', ')}`); process.exit(1); }
fn(rest).catch(e => { console.error(e); process.exit(1); });
// (appended probes registered below via mutation — keep file simple)
