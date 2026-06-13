// OB-203 Phase 6B — Repair ADDENDUM: inner classification_result.confidence (architect-ruled).
// Ruling: docs/vp-prompts/OB-203_PHASE-6B_REPAIR_ADDENDUM_20260612.md (9341ce73)
//
// The inner `classification_result.confidence` on the 16 repaired rows retains the
// voided run's value — same contamination class. RESTORE it from the same morning-truth
// provenance (session d8085364 durable signals, derived live — §1.1 pattern). Scope
// guard: exactly the 16 voided-window sheet rows, every sheet present in the truth map
// with a finite confidence, or ABORT with zero writes. No other key, row, or surface.
//
// FP-49: current inner values are pasted BEFORE the write; the verification re-read
// pastes all 16 rows after (inner confidence alongside the already-verified state).
//
// Run: cd web && set -a && source .env.local && set +a && npx tsx scripts/diag/diag064-flywheel-repair-addendum.ts

import { createClient } from '@supabase/supabase-js';

const TENANT = '3d354bfa-b298-48dd-88a0-9f8c5a00be4e';
const MORNING_SESSION = 'd8085364-72b1-4c6f-9d9e-20606fb14831';
const VOIDED_WINDOW_START = '2026-06-12T22:00:00Z';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function morningTruth(): Promise<Map<string, { classification: string; confidence: number }>> {
  const { data, error } = await sb.from('classification_signals')
    .select('sheet_name, classification, confidence, signal_value, created_at')
    .eq('tenant_id', TENANT)
    .eq('signal_type', 'comprehension:unit_state')
    .eq('context->>importSessionId', MORNING_SESSION)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`truth read failed: ${error.message}`);
  const latest = new Map<string, { classification: string; confidence: number }>();
  for (const r of (data ?? [])) {
    const sv = (r.signal_value ?? {}) as Record<string, unknown>;
    if ((sv.state === 'classified' || sv.state === 'bound') && r.classification && r.sheet_name
        && typeof r.confidence === 'number' && Number.isFinite(r.confidence)) {
      latest.set(r.sheet_name as string, { classification: r.classification as string, confidence: r.confidence as number });
    }
  }
  return latest;
}

async function fetchTargets() {
  const { data, error } = await sb.from('structural_fingerprints')
    .select('id, fingerprint_hash, match_count, confidence, classification_result, updated_at')
    .eq('tenant_id', TENANT)
    .gte('updated_at', VOIDED_WINDOW_START);
  if (error) throw new Error(`fingerprint read failed: ${error.message}`);
  return (data ?? []).filter(r => typeof ((r.classification_result ?? {}) as Record<string, unknown>).tabName === 'string');
}

async function main() {
  const truth = await morningTruth();
  console.log(`morning truth (session ${MORNING_SESSION.slice(0, 8)}): ${truth.size} sheets with finite confidence`);

  const targets = await fetchTargets();
  if (targets.length !== 16) {
    console.error(`ABORT: expected exactly 16 voided-window sheet rows, found ${targets.length}. Zero writes.`);
    process.exit(1);
  }
  for (const r of targets) {
    const tab = ((r.classification_result ?? {}) as Record<string, unknown>).tabName as string;
    if (!truth.has(tab)) { console.error(`ABORT: sheet '${tab}' missing from truth map. Zero writes.`); process.exit(1); }
  }

  console.log('\n--- FP-49: current INNER confidence values (pre-write, all 16) ---');
  for (const r of targets) {
    const cr = (r.classification_result ?? {}) as Record<string, unknown>;
    console.log(`${String(r.fingerprint_hash).slice(0, 12)} ${String(cr.tabName).padEnd(22)} inner=${String(cr.confidence)} -> morning=${truth.get(cr.tabName as string)!.confidence}`);
  }

  console.log('\n--- addendum write (inner confidence only) ---');
  for (const r of targets) {
    const cr = (r.classification_result ?? {}) as Record<string, unknown>;
    const tab = cr.tabName as string;
    const newCr = { ...cr, confidence: truth.get(tab)!.confidence };
    const { error: upErr } = await sb.from('structural_fingerprints')
      .update({ classification_result: newCr })
      .eq('id', r.id);
    if (upErr) { console.error(`ABORT at ${tab}: ${upErr.message} — HALT, no manual nudging.`); process.exit(1); }
  }
  console.log('16/16 inner confidence restored from morning provenance.');

  console.log('\n--- VERIFICATION RE-READ (all 16 rows: col-stats | inner-conf | classification | bindings) ---');
  const after = await fetchTargets();
  let off = 0;
  for (const r of after) {
    const cr = (r.classification_result ?? {}) as Record<string, unknown>;
    const tab = cr.tabName as string;
    const t = truth.get(tab)!;
    const bindings = Array.isArray(cr.fieldBindings) ? (cr.fieldBindings as unknown[]).length : -1;
    const ok = cr.classification === t.classification && cr.confidence === t.confidence
      && bindings === 0 && r.match_count === 3 && Number(r.confidence) === 0.75;
    if (!ok) off++;
    console.log(`${String(r.fingerprint_hash).slice(0, 12)} | ${String(r.match_count)}/${Number(r.confidence).toFixed(4)} | inner=${String(cr.confidence).padEnd(6)} | ${String(cr.classification).padEnd(11)} | ${bindings} bindings | ${tab.padEnd(22)} ${ok ? 'OK' : '*** OFF ***'}`);
  }
  console.log(off === 0 ? '\nGATE PASS: all 16 rows match the morning truth map on every verified field.' : `\nGATE FAIL: ${off} row(s) off — HALT.`);
  process.exit(off === 0 ? 0 : 1);
}

main();
