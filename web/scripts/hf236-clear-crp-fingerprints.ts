// HF-236 Phase 3: clear CRP flywheel cache (structural_fingerprints rows).
// The pre-HF-236 fingerprint cache for CRP transaction files carries 5-binding
// PARTIAL-filtered fieldBindings that pre-dates the HF-236 fix. Clearing forces
// the next CRP import to run fresh-LLM HC and cache native columnRoles.
import { createClient } from '@supabase/supabase-js';

const TENANT = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

(async () => {
  // First inspect current rows
  const { data: pre, error: preErr } = await sb
    .from('structural_fingerprints')
    .select('id, fingerprint_hash, classification_result, confidence, match_count')
    .eq('tenant_id', TENANT);

  if (preErr) {
    console.error('Pre-delete query error:', preErr);
    process.exit(1);
  }

  console.log('Pre-delete: ' + (pre?.length ?? 0) + ' structural_fingerprints rows for CRP tenant');
  for (const r of pre ?? []) {
    const cr = r.classification_result as Record<string, unknown> | null;
    const classification = cr?.classification ?? 'unknown';
    const fbCount = Array.isArray(cr?.fieldBindings) ? (cr.fieldBindings as unknown[]).length : 0;
    const tabName = cr?.tabName ?? '?';
    console.log(`  ${(r.fingerprint_hash as string).slice(0, 12)}  ${classification}  conf=${r.confidence}  match=${r.match_count}  bindings=${fbCount}  tab=${tabName}`);
  }

  if ((pre?.length ?? 0) === 0) {
    console.log('Nothing to clear.');
    return;
  }

  const { data: deleted, error: delErr } = await sb
    .from('structural_fingerprints')
    .delete()
    .eq('tenant_id', TENANT)
    .select('id');

  if (delErr) {
    console.error('Delete error:', delErr);
    process.exit(1);
  }

  console.log('\nDeleted ' + (deleted?.length ?? 0) + ' rows.');
})();
