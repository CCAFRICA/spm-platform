// HF-372 Phase 0 / EPG-0.9 — live finalize-claim behavior on current main. Reads the recent
// import_finalize_runs ledger (real imports), then demonstrates the atomic double-claim coalescing
// live against the DB under a synthetic proposal key (removed afterwards).
//   from web/:  npx tsx scripts/_hf372_epg09_claim_probe.ts
import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import { claimFinalize, completeFinalize } from '../src/lib/sci/finalize-coalesce';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb: any = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const VLTEST2 = '5b078b52-55c9-4612-8f86-96038c198bfe';

async function main() {
  const { data, error } = await sb.from('import_finalize_runs').select('*').order('claimed_at', { ascending: false }).limit(12);
  if (error) console.log('LEDGER READ:', error.code, error.message, '(table absent = migration 20260702_hf371 NOT applied → claim degrades to idempotency)');
  else {
    console.log(`=== import_finalize_runs (recent ${data?.length ?? 0}) ===`);
    for (const r of data ?? []) console.log(`  tenant=${String(r.tenant_id).slice(0, 8)} proposal=${String(r.proposal_id).slice(0, 24)} status=${r.status} claimed_at=${r.claimed_at}`);
  }
  const key = 'hf372-epg09-probe';
  const [a, b] = await Promise.all([claimFinalize(sb, VLTEST2, key), claimFinalize(sb, VLTEST2, key)]);
  console.log('concurrent claim A:', JSON.stringify(a));
  console.log('concurrent claim B:', JSON.stringify(b));
  await completeFinalize(sb, VLTEST2, key, true);
  const c = await claimFinalize(sb, VLTEST2, key);
  console.log('post-done claim C: ', JSON.stringify(c));
  await sb.from('import_finalize_runs').delete().eq('tenant_id', VLTEST2).eq('proposal_id', key);
  console.log('(probe row removed)');
}
main().catch(e => { console.error(e); process.exit(1); });
