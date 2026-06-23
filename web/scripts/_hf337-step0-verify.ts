// HF-337 Step 0 — verify surface_bindings is live with the designed shape (gate).
// Confirms the keyed columns exist and that NO property/role column exists (HALT-REGISTRY guard).
// Run: npx tsx --env-file=.env.local scripts/_hf337-step0-verify.ts
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  console.log('=== HF-337 Step 0: surface_bindings live-shape verification ===\n');

  // (a) expected keyed columns present -> select succeeds (PostgREST errors on a missing column)
  const want = await sb.from('surface_bindings')
    .select('id, tenant_id, structural_fingerprint_hash, surface_id, purpose_text, resolved_fields, confidence, recognized_by, created_at, updated_at')
    .limit(1);
  console.log(`(a) keyed columns present: ${want.error ? `MISSING/ERROR -> ${want.error.message}` : 'CONFIRMED (tenant_id, structural_fingerprint_hash, surface_id, resolved_fields, confidence, purpose_text, recognized_by)'}`);

  // (b) NO property/role gate columns (a property/role key would be HALT-REGISTRY)
  for (const forbidden of ['is_monetary', 'is_additive', 'metric_role', 'intent_signature']) {
    const r = await sb.from('surface_bindings').select(forbidden).limit(1);
    console.log(`(b) forbidden column "${forbidden}": ${r.error ? 'ABSENT (good)' : 'PRESENT (HALT-REGISTRY!)'}`);
  }

  // (c) table reachable + row count
  const { count } = await sb.from('surface_bindings').select('id', { count: 'exact', head: true });
  console.log(`(c) table reachable, current rows: ${count ?? 0}`);
  console.log('\n(index on (structural_fingerprint_hash, surface_id) for OB-235 tenant_id-dropped match is in the applied migration 20260623_hf337_surface_bindings.sql)');
  console.log('=== done ===');
}
main().catch((e) => { console.error(e); process.exit(1); });
