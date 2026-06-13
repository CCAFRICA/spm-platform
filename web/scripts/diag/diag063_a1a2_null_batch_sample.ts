/**
 * DIAG-063 A1A2 — part 4 (READ-ONLY).
 * Provenance sample of committed_data rows with import_batch_id IS NULL
 * (43,875 observed platform-wide). Tallies tenant_id / data_type / metadata.source
 * over a 1000-row sample. No row_data selected.
 */
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const { data, error } = await sb
    .from('committed_data')
    .select('tenant_id, data_type, created_at, metadata')
    .is('import_batch_id', null)
    .order('created_at', { ascending: false })
    .limit(1000);
  if (error) throw error;
  const tally = (f: (r: any) => string) => {
    const t: Record<string, number> = {};
    for (const r of data!) {
      const k = f(r) ?? '(null)';
      t[k] = (t[k] ?? 0) + 1;
    }
    return t;
  };
  console.log(`sample size: ${data!.length} (most recent NULL-batch rows)`);
  console.log('by tenant_id:', JSON.stringify(tally((r) => r.tenant_id)));
  console.log('by data_type:', JSON.stringify(tally((r) => r.data_type)));
  console.log('by metadata.source:', JSON.stringify(tally((r) => r.metadata?.source)));
  console.log('created_at range in sample:', data![data!.length - 1]?.created_at, '->', data![0]?.created_at);
}

main().catch((e) => {
  console.error('PROBE ERROR:', e.message ?? e);
  process.exit(1);
});
