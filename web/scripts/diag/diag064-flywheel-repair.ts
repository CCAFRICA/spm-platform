// OB-203 Phase 6B — Flywheel contamination REPAIR (architect-ruled, 2026-06-12).
// Ruling: docs/vp-prompts/OB-203_PHASE-6B_CONTAMINATION_REPAIR_RULING_20260612.md
//
//   §1.1 RESTORE classifications on contaminated rows to the morning truth map —
//        derived HERE from session d8085364's durable signals (the cited
//        provenance), never hardcoded.
//   §1.2 RESET fieldBindings on ALL 16 rows ([]) — re-learned via the normal
//        flywheel write on the next clean run (no fabricated provenance).
//   §1.3 DEMOTE statistics on ALL 16 rows: match_count 4->3, confidence
//        0.8000->0.75 (the voided run was not a match).
//   §1.4 Atom store untouched (rows lacking classification_result.tabName are
//        never selected; scope is the voided-window sheet rows only).
//
// Scope guard: exactly the 16 sheet-level rows updated inside the voided witness
// window (updated_at >= 2026-06-12T22:00:00Z). Any count other than 16, or any
// sheet missing from the truth map -> ABORT with zero writes.
//
// Run: cd web && set -a && source .env.local && set +a && npx tsx scripts/diag/diag064-flywheel-repair.ts

import { createClient } from '@supabase/supabase-js';

const TENANT = '3d354bfa-b298-48dd-88a0-9f8c5a00be4e';
const MORNING_SESSION = 'd8085364-72b1-4c6f-9d9e-20606fb14831';
const VOIDED_WINDOW_START = '2026-06-12T22:00:00Z';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function morningTruthMap(): Promise<Map<string, string>> {
  const { data, error } = await sb.from('classification_signals')
    .select('sheet_name, classification, signal_value, created_at')
    .eq('tenant_id', TENANT)
    .eq('signal_type', 'comprehension:unit_state')
    .eq('context->>importSessionId', MORNING_SESSION)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`truth-map read failed: ${error.message}`);
  const latest = new Map<string, string>();
  for (const r of (data ?? [])) {
    const sv = (r.signal_value ?? {}) as Record<string, unknown>;
    if ((sv.state === 'classified' || sv.state === 'bound') && r.classification && r.sheet_name) {
      latest.set(r.sheet_name as string, r.classification as string);
    }
  }
  return latest;
}

async function main() {
  const truth = await morningTruthMap();
  console.log(`morning truth map (session ${MORNING_SESSION.slice(0, 8)}): ${truth.size} sheets`);

  const { data: rows, error } = await sb.from('structural_fingerprints')
    .select('id, fingerprint_hash, match_count, confidence, classification_result, updated_at')
    .eq('tenant_id', TENANT)
    .gte('updated_at', VOIDED_WINDOW_START);
  if (error) throw new Error(`fingerprint read failed: ${error.message}`);
  const targets = (rows ?? []).filter(r => {
    const cr = (r.classification_result ?? {}) as Record<string, unknown>;
    return typeof cr.tabName === 'string';
  });

  if (targets.length !== 16) {
    console.error(`ABORT: expected exactly 16 voided-window sheet rows, found ${targets.length}. Zero writes performed.`);
    process.exit(1);
  }
  for (const r of targets) {
    const cr = (r.classification_result ?? {}) as Record<string, unknown>;
    if (!truth.has(cr.tabName as string)) {
      console.error(`ABORT: sheet '${cr.tabName}' not in the morning truth map. Zero writes performed.`);
      process.exit(1);
    }
  }

  console.log('\n--- repair (per row: before -> after) ---');
  let restored = 0, kept = 0;
  for (const r of targets) {
    const cr = (r.classification_result ?? {}) as Record<string, unknown>;
    const tab = cr.tabName as string;
    const target = truth.get(tab)!;
    const before = String(cr.classification ?? '?');
    const action = before === target ? 'kept   ' : 'RESTORE';
    if (before === target) kept++; else restored++;
    const newCr = { ...cr, classification: target, fieldBindings: [] };
    const { error: upErr } = await sb.from('structural_fingerprints')
      .update({ classification_result: newCr, match_count: 3, confidence: 0.75 })
      .eq('id', r.id);
    if (upErr) {
      console.error(`ABORT at ${tab}: update failed: ${upErr.message} — HALT, no manual nudging.`);
      process.exit(1);
    }
    console.log(`${String(r.fingerprint_hash).slice(0, 12)} ${tab.padEnd(22)} cls ${before.padEnd(11)} -> ${target.padEnd(11)} [${action}] bindings -> [] stats 4/0.8000 -> 3/0.75`);
  }
  console.log(`\nrepair complete: ${restored} restored, ${kept} kept (classification already true), 16/16 bindings reset, 16/16 stats demoted.`);
  console.log('NOTE (residue, named): classification_result.confidence (inner key) retains the voided run value — not named by the ruling, not touched. Flagged in the output doc.');
}

main();
