/** HF-373 EPG-D1 — replay the REAL decision functions against the LIVE 2026-07-02
 * claim rows + batch timestamps (the exact defect shape). */
import { config } from 'dotenv'; config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import { decideFinalizeClaim } from '../src/lib/sci/finalize-coalesce';
import { claimCommit, commitScopeHash } from '../src/lib/sci/commit-coalesce';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
(async () => {
  for (const [label, tenant, proposal] of [
    ['VLTEST2 plan import 94b838b8', '5b078b52-55c9-4612-8f86-96038c198bfe', '94b838b8-080a-4bee-8fb2-77527f94ae47'],
    ['Casa Diaz workbook 5851bd78', '2d9979ba-5032-48a7-bccf-1928f3e6dadf', '5851bd78-2382-4db9-afdb-fded902a08b0'],
  ] as const) {
    const { data: claim } = await sb.from('import_finalize_runs').select('status, claimed_at').eq('tenant_id', tenant).eq('proposal_id', proposal).maybeSingle();
    const { data: batches } = await sb.from('import_batches').select('created_at').eq('tenant_id', tenant).eq('metadata->>proposalId', proposal).order('created_at', { ascending: false }).limit(1);
    const latestBatchMs = batches?.[0]?.created_at ? new Date(batches[0].created_at).getTime() : null;
    if (!claim) { console.log(`${label}: no claim row`); continue; }
    const preFix = decideFinalizeClaim('23505', claim, Date.now());
    const postFix = decideFinalizeClaim('23505', claim, Date.now(), latestBatchMs);
    console.log(`${label}:`);
    console.log(`  claim: status=${claim.status} claimed_at=${claim.claimed_at} | newest batch=${batches?.[0]?.created_at ?? 'none'}`);
    console.log(`  PRE-FIX  (HF-371): granted=${preFix.granted} (${preFix.reason})`);
    console.log(`  POST-FIX (HF-373): granted=${postFix.granted} (${postFix.reason})`);
  }
  // Live 42P01 degradation proof: import_commit_runs migration is architect-pending → claim proceeds.
  const d = await claimCommit(sb as never, '5b078b52-55c9-4612-8f86-96038c198bfe', '_hf373_probe_', commitScopeHash(['probe::unit::0']));
  console.log(`commit claim with migration pending: granted=${d.granted} (${d.reason})`);
})().catch(e => { console.log('threw:', e instanceof Error ? e.stack : String(e)); process.exit(1); });
