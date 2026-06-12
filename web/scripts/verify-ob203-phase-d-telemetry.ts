// OB-203 Phase 6B / Phase D -- post-application verification (HALT-4, SR-44).
// Run AFTER the architect applies
// web/supabase/migrations/20260612200000_ob203_phase6b_phase_d_import_session_telemetry.sql:
//   cd web && set -a && source .env.local && set +a && npx tsx scripts/verify-ob203-phase-d-telemetry.ts
//
// Proves against the LIVE database (AP-8/AP-9, Prove-Don't-Describe):
//   (1) additive exactness across sequential increments;
//   (2) atomicity under a concurrent burst (25 parallel +1 increments land as exactly 25);
//   (3) unit_states assignment semantics (latest wins per unit, keys merge);
//   (4) conclusion/audit write-once (first write wins);
//   (5) cleanup. Exits non-zero on any failure.

import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (run from web/ with .env.local sourced)');
  process.exit(1);
}
const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const TENANT = crypto.randomUUID();
const SESSION = crypto.randomUUID();

let failures = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ' :: ' + JSON.stringify(detail)}`);
  if (!ok) failures++;
}

async function inc(args: Record<string, unknown>) {
  const { error } = await sb.rpc('increment_import_session_telemetry', {
    p_tenant_id: TENANT,
    p_import_session_id: SESSION,
    p_signals_delta: 0,
    p_signals_per_type: {},
    p_unit_states: {},
    ...args,
  });
  if (error) throw new Error(`rpc increment failed: ${error.message}`);
}

async function fetchRow() {
  const { data, error } = await sb
    .from('import_session_telemetry')
    .select('*')
    .eq('tenant_id', TENANT)
    .eq('import_session_id', SESSION)
    .maybeSingle();
  if (error) throw new Error(`select failed: ${error.message}`);
  return data;
}

async function main() {
  console.log(`tenant=${TENANT} session=${SESSION}\n`);

  // (1) additive exactness + (3) assignment semantics
  await inc({
    p_signals_delta: 2,
    p_signals_per_type: { 'comprehension:unit_state': 2 },
    p_unit_states: { u1: { state: 'persisted' } },
  });
  await inc({
    p_signals_delta: 3,
    p_signals_per_type: { 'comprehension:unit_state': 1, 'comprehension:tier_resolution': 4 },
    p_unit_states: { u1: { state: 'comprehended', tier: 1, knownCount: 30 }, u2: { state: 'persisted' } },
  });
  let row = await fetchRow();
  check('row exists after upsert', !!row);
  check('total_signals_written additive (2+3=5)', row?.total_signals_written === 5, row?.total_signals_written);
  check(
    'signals_per_type per-key additive (3 / 4)',
    row?.signals_per_type?.['comprehension:unit_state'] === 3 &&
      row?.signals_per_type?.['comprehension:tier_resolution'] === 4,
    row?.signals_per_type,
  );
  check(
    'unit_states latest-wins (u1 -> comprehended, tier 1)',
    row?.unit_states?.u1?.state === 'comprehended' && row?.unit_states?.u1?.tier === 1,
    row?.unit_states?.u1,
  );
  check('unit_states keys merge (u2 present)', row?.unit_states?.u2?.state === 'persisted', row?.unit_states?.u2);

  // (2) atomicity: 25 concurrent +1 increments -- exactly 25, none lost
  await Promise.all(Array.from({ length: 25 }, () => inc({ p_signals_delta: 1 })));
  row = await fetchRow();
  check('concurrent burst exact (5+25=30)', row?.total_signals_written === 30, row?.total_signals_written);

  // (4) write-once: conclusion/audit -- first write wins
  await inc({ p_conclusion: { saved: 1 } });
  await inc({ p_conclusion: { saved: 999 }, p_audit: { divergent: false } });
  await inc({ p_audit: { divergent: true } });
  row = await fetchRow();
  check('conclusion write-once (first wins)', row?.conclusion?.saved === 1, row?.conclusion);
  check('audit write-once (first wins)', row?.audit?.divergent === false, row?.audit);

  // (5) cleanup
  const { error: delErr } = await sb.from('import_session_telemetry').delete().eq('tenant_id', TENANT);
  check('cleanup', !delErr, delErr?.message);

  console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('FATAL:', e instanceof Error ? e.message : e);
  process.exit(1);
});
