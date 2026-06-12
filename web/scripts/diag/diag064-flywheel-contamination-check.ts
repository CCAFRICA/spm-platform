// OB-203 Phase 6B / DIAG-064 disposition §4 — flywheel contamination check (READ-ONLY).
//
// The voided witness attempt (main-vintage analyze, session e0f86141) updated all 16
// fingerprints (matchCount 3->4, confidence 0.75->0.8000) while CLASSIFYING five units
// wrongly (Empleados=transaction, four rosters=target). This script reads and pastes,
// for every structural fingerprint of tenant 3d354bfa, the stored hash / matchCount /
// confidence / classification / binding claimedBy summary — to adjudicate whether the
// voided run touched only match statistics (proceed to §5) or contaminated stored
// classifications/bindings (HALT; repair under fresh architect go, 1a precedent).
//
// FP-49: jsonb shapes are pasted from live rows (first three rows' actual keys) before
// any extraction is trusted.
//
// Run: cd web && set -a && source .env.local && set +a && npx tsx scripts/diag/diag064-flywheel-contamination-check.ts

import { createClient } from '@supabase/supabase-js';

const TENANT = '3d354bfa-b298-48dd-88a0-9f8c5a00be4e';
const EMPLEADOS_HASH = '7707e8553823'; // corrected under the 1a disposition — MUST be entity

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function summarizeClaimedBy(cr: Record<string, unknown>): string {
  const bindings = (cr.fieldBindings ?? cr.field_bindings ?? cr.bindings) as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(bindings)) return 'no-bindings-array';
  const tally = new Map<string, number>();
  for (const b of bindings) {
    const k = String(b.claimedBy ?? 'unset');
    tally.set(k, (tally.get(k) ?? 0) + 1);
  }
  return `${bindings.length} bindings [${Array.from(tally.entries()).map(([k, n]) => `${k}:${n}`).join(', ')}]`;
}

async function main() {
  const { data, error } = await sb
    .from('structural_fingerprints')
    .select('id, fingerprint_hash, match_count, confidence, classification_result, column_roles, updated_at, created_at')
    .eq('tenant_id', TENANT)
    .order('updated_at', { ascending: false });
  if (error) { console.error('read failed:', error.message); process.exit(1); }
  const rows = data ?? [];
  console.log(`tenant ${TENANT}: ${rows.length} structural_fingerprints rows\n`);

  // FP-49: paste actual jsonb keys for the first three rows before extracting on them.
  console.log('--- FP-49: live jsonb key shapes (first 3 rows) ---');
  for (const r of rows.slice(0, 3)) {
    const cr = (r.classification_result ?? {}) as Record<string, unknown>;
    console.log(`${String(r.fingerprint_hash).slice(0, 12)}  classification_result keys: [${Object.keys(cr).join(', ')}]`);
  }

  console.log('\n--- full census (newest update first) ---');
  console.log('hash         | match | conf   | classification | sheet                  | claimedBy summary                      | updated_at');
  let empleadosRow: Record<string, unknown> | null = null;
  for (const r of rows) {
    const cr = (r.classification_result ?? {}) as Record<string, unknown>;
    const classification = String(cr.classification ?? cr.winner ?? cr.agent ?? '?');
    const sheet = String(cr.sheetName ?? cr.tabName ?? cr.sheet ?? '?');
    const hash = String(r.fingerprint_hash);
    if (hash.startsWith(EMPLEADOS_HASH)) empleadosRow = { ...r, _classification: classification };
    console.log(
      `${hash.slice(0, 12)} | ${String(r.match_count).padStart(5)} | ${Number(r.confidence).toFixed(4)} | ${classification.padEnd(14)} | ${sheet.slice(0, 22).padEnd(22)} | ${summarizeClaimedBy(cr).slice(0, 38).padEnd(38)} | ${r.updated_at}`,
    );
  }

  console.log('\n--- §4 decisive checks ---');
  if (!empleadosRow) {
    console.log(`FAIL  Empleados fingerprint ${EMPLEADOS_HASH} NOT FOUND`);
    process.exit(1);
  }
  const empCls = String(empleadosRow._classification);
  console.log(`Empleados ${EMPLEADOS_HASH}: classification=${empCls} match_count=${empleadosRow.match_count} confidence=${empleadosRow.confidence}`);
  console.log(empCls === 'entity'
    ? 'PASS  Empleados stored classification remains entity (1a correction intact)'
    : `FAIL  Empleados stored classification is '${empCls}' — CONTAMINATED (must be entity)`);
}

main();
