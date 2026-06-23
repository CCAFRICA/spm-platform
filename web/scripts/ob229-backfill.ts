// OB-229 — bootstrap backfill (one-time data population; off the render path).
// Populates summary_artifacts via JS aggregation until the SQL RPC migration is applied (then the
// import-trigger / admin API use the RPC). Idempotent per tenant.
// Run: cd web && set -a && source .env.local && set +a && npx tsx scripts/ob229-backfill.ts <tenantId>
import { createClient } from '@supabase/supabase-js';
import { backfillSummariesJs } from '../src/lib/summary/summary-engine';

const SABOR = 'f7093bcc-e90b-4918-9680-69da7952dd65';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const tenantId = process.argv[2] || SABOR;
  const t0 = Date.now();
  console.log(`[OB-229] backfilling summary_artifacts for ${tenantId} …`);
  const res = await backfillSummariesJs(sb, tenantId, (m) => process.stdout.write(`\r  ${m}        `));
  console.log(`\n[OB-229] DONE in ${((Date.now() - t0) / 1000).toFixed(1)}s — written=${res.written}, skipped=${res.skipped}, scanned=${res.scanned}`);
}
main().then(() => process.exit(0)).catch((e) => { console.error('\n[OB-229] FAILED:', e); process.exit(1); });
