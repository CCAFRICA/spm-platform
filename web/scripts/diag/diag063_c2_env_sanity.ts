/**
 * DIAG-063 / C2 — env sanity (READ-ONLY): confirm the live DB this probe hits
 * is the populated platform DB (head counts only), so the 'disputes' table
 * miss is not an empty-environment artifact.
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  for (const table of ['entities', 'calculation_batches', 'audit_logs', 'periods', 'approval_requests']) {
    const { count, error } = await supabase.from(table).select('id', { count: 'exact', head: true });
    console.log(table + ' head count: ' + (error ? 'ERROR ' + error.message : String(count)));
  }
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
