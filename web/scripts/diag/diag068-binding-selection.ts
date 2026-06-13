// DIAG-068 — read-only. Extract the convergence:binding_selection signals for the
// two Utilización variants (the per-variant column choice + self-verification), and
// re-verify committed_data presence. SELECT only.
import { createClient } from '@supabase/supabase-js';
const TENANT = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';

async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

  // committed_data — count + distinct sheets (no row cap on count)
  const { count: cdCount } = await sb.from('committed_data').select('*', { count: 'exact', head: true }).eq('tenant_id', TENANT);
  console.log(`committed_data count for tenant (exact): ${cdCount}`);
  // any committed_data at all (any tenant) for the Meridian file?
  const { data: anyCd } = await sb.from('committed_data').select('tenant_id, sheet_name, import_batch_id').ilike('source_file_name', '%Meridian%').limit(5);
  console.log('committed_data rows w/ source_file_name ~Meridian (any tenant):', JSON.stringify(anyCd));

  // binding_selection signals for the two Utilización components
  const { data: sigs } = await sb.from('classification_signals')
    .select('created_at, signal_value, decision_source')
    .eq('tenant_id', TENANT)
    .eq('signal_type', 'convergence:binding_selection')
    .order('created_at', { ascending: false }).limit(50);
  const util = (sigs ?? []).filter(s => /Utiliz/.test(JSON.stringify(s.signal_value)));
  console.log(`\nconvergence:binding_selection signals (Utilización): ${util.length}`);
  for (const s of util) {
    console.log(`\n──── [${s.created_at}] decision_source=${s.decision_source} ────`);
    console.log(JSON.stringify(s.signal_value, null, 2));
  }
}
main().catch(e => { console.error(e); process.exit(1); });
