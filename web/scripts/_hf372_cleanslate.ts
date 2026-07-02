// HF-372 Phase G — Clean Slate via the REAL platform lib (runCleanSlate — the same function the
// platform route runs), all five categories. Proof tenants only.
//   from web/:  npx tsx scripts/_hf372_cleanslate.ts <vltest2|casa>
import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import { runCleanSlate, CLEAN_SLATE_CATEGORIES } from '../src/lib/platform/tenant-deletion';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb: any = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const TENANTS: Record<string, string> = {
  vltest2: '5b078b52-55c9-4612-8f86-96038c198bfe',
  casa: '2d9979ba-5032-48a7-bccf-1928f3e6dadf',
};

async function main() {
  const tenantId = TENANTS[process.argv[2] ?? ''];
  if (!tenantId) { console.log('usage: <vltest2|casa>'); process.exit(1); }
  const keys = CLEAN_SLATE_CATEGORIES.map(c => c.key);
  const result = await runCleanSlate(sb, tenantId, keys);
  for (const r of result.results) {
    if (r.status !== 'deleted' || (r.deletedCount ?? 0) > 0) console.log(`  ${r.table}: ${r.status} deleted=${r.deletedCount ?? 0} ${r.error ?? ''}`);
  }
  const r = result as unknown as { verified?: boolean; residual?: string[]; totalDeleted?: number; hadError?: boolean };
  console.log(`clean slate ${tenantId.slice(0, 8)}… verified=${r.verified} totalDeleted=${r.totalDeleted} hadError=${r.hadError} residual=${JSON.stringify(r.residual ?? [])}`);
}
main().catch(e => { console.error(e); process.exit(1); });
