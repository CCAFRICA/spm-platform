// OB-203 Phase 4 — the USER LOG TRACE as signal queries (the Brasa y Maíz forensics, queryable).
// THIS IS BL-001's DATA CONTRACT: each function below is a named query shape the Observatory
// atom-flywheel panel consumes. Read-only, service-role.
//   Usage: npx tsx scripts/ob203-trace.ts [tenantId] [importSessionId]
import { createClient } from '@supabase/supabase-js';

const TENANT = process.argv[2] || '24103940-ab33-4a21-b6fd-bd1042f4762c';
const SESSION = process.argv[3]; // optional — scopes session-specific queries
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const sv = (r: { signal_value: unknown }) => (r.signal_value ?? {}) as Record<string, unknown>;

// ── BL-001 query shape #1: per-session unit-state timeline ──────────────────
// source: signal_type='comprehension:unit_state', grouped by context.importSessionId + signal_value.unitId
async function unitStateTimeline() {
  let q = sb.from('classification_signals')
    .select('signal_value, context, sheet_name, classification, created_at')
    .eq('tenant_id', TENANT).eq('signal_type', 'comprehension:unit_state')
    .order('created_at', { ascending: true });
  if (SESSION) q = q.eq('context->>importSessionId', SESSION);
  const { data } = await q;
  console.log('\n=== [#1] unit-state timeline (per session) ===');
  const byUnit = new Map<string, { state: string; at: string; cls: string | null }[]>();
  for (const r of data ?? []) {
    const u = sv(r).unitId as string;
    (byUnit.get(u) ?? byUnit.set(u, []).get(u)!).push({ state: sv(r).state as string, at: r.created_at, cls: r.classification });
  }
  for (const [u, trail] of Array.from(byUnit.entries())) {
    console.log(`  ${u}`);
    for (const t of trail) console.log(`     ${t.at}  ${String(t.state).padEnd(20)} ${t.cls ?? ''}`);
  }
}

// ── BL-001 query shape #1b: session lifecycle (open → settled) ──────────────
// source: signal_type='comprehension:session_lifecycle', signal_value.phase
async function sessionLifecycle() {
  let q = sb.from('classification_signals')
    .select('signal_value, created_at').eq('tenant_id', TENANT)
    .eq('signal_type', 'comprehension:session_lifecycle').order('created_at', { ascending: true });
  if (SESSION) q = q.eq('context->>importSessionId', SESSION);
  const { data } = await q;
  console.log('\n=== [#1b] session lifecycle ===');
  if ((data ?? []).length === 0) console.log('  (none)');
  for (const r of data ?? []) console.log(`  ${r.created_at}  phase=${sv(r).phase}  unitCount=${sv(r).unitCount}`);
}

// ── BL-001 query shape #2: failure classes ──────────────────────────────────
// source: signal_type='comprehension:failed_interpretation', signal_value.failureClass
async function failureClasses() {
  const { data } = await sb.from('classification_signals')
    .select('signal_value, sheet_name, created_at').eq('tenant_id', TENANT)
    .eq('signal_type', 'comprehension:failed_interpretation').order('created_at', { ascending: false }).limit(50);
  console.log('\n=== [#2] failure classes ===');
  const hist: Record<string, number> = {};
  for (const r of data ?? []) { const fc = (sv(r).failureClass as string) ?? 'unknown'; hist[fc] = (hist[fc] ?? 0) + 1; }
  if (Object.keys(hist).length === 0) console.log('  (none)');
  for (const [fc, n] of Object.entries(hist)) console.log(`  ${fc}: ${n}`);
}

// ── BL-001 query shape #3: comprehension cost (tier-of-resolution + composition) ──
// source: signal_type IN ('comprehension:tier_resolution','comprehension:composition')
async function comprehensionCost() {
  const { data: tiers } = await sb.from('classification_signals')
    .select('signal_value, sheet_name, created_at').eq('tenant_id', TENANT)
    .eq('signal_type', 'comprehension:tier_resolution').order('created_at', { ascending: false }).limit(50);
  console.log('\n=== [#3] comprehension cost (resolver mix = LLM vs flywheel) ===');
  const resolver: Record<string, number> = {};
  for (const r of tiers ?? []) { const x = (sv(r).resolver as string) ?? '?'; resolver[x] = (resolver[x] ?? 0) + 1; }
  for (const [x, n] of Object.entries(resolver)) console.log(`  resolver=${x}: ${n}`);
  const { data: comps } = await sb.from('classification_signals')
    .select('signal_value').eq('tenant_id', TENANT).eq('signal_type', 'comprehension:composition').limit(100);
  const novel = (comps ?? []).reduce((s, r) => s + (Number(sv(r).novelCount) || 0), 0);
  const known = (comps ?? []).reduce((s, r) => s + (Number(sv(r).knownCount) || 0), 0);
  console.log(`  atoms claimed (known, no LLM): ${known}   novel (comprehended): ${novel}   → recognized-fraction ${known + novel > 0 ? (known / (known + novel)).toFixed(2) : 'n/a'}`);
}

// ── BL-001 query shape #4: tier distribution ────────────────────────────────
// source: signal_type='comprehension:tier_resolution', signal_value.tier
async function tierDistribution() {
  const { data } = await sb.from('classification_signals')
    .select('signal_value').eq('tenant_id', TENANT).eq('signal_type', 'comprehension:tier_resolution').limit(200);
  console.log('\n=== [#4] tier distribution ===');
  const hist: Record<string, number> = {};
  for (const r of data ?? []) { const t = `tier_${sv(r).tier ?? '?'}`; hist[t] = (hist[t] ?? 0) + 1; }
  if (Object.keys(hist).length === 0) console.log('  (none)');
  for (const [t, n] of Object.entries(hist)) console.log(`  ${t}: ${n}`);
}

// ── BL-001 query shape #5: REMEDIATION FAMILY (the DI-7 rollup — architect condition) ──
// ONE query answering "every blocked write" — unifies reinforcement_blocked + learning_write_blocked
// at the CONSUMPTION layer (not a per-type checklist). source: signal_type IN (...).
async function remediationFamily() {
  const { data } = await sb.from('classification_signals')
    .select('signal_type, signal_value, sheet_name, created_at').eq('tenant_id', TENANT)
    .in('signal_type', ['comprehension:reinforcement_blocked', 'comprehension:learning_write_blocked', 'comprehension:atom_write_failed'])
    .order('created_at', { ascending: false }).limit(100);
  console.log('\n=== [#5] DI-7 remediation family (one rollup — every blocked write) ===');
  const byType: Record<string, number> = {};
  const bySurface: Record<string, number> = {};
  for (const r of data ?? []) {
    byType[r.signal_type as string] = (byType[r.signal_type as string] ?? 0) + 1;
    const surface = (sv(r).surface as string) ?? (sv(r).blocked_surface as string) ?? 'unknown';
    bySurface[surface] = (bySurface[surface] ?? 0) + 1;
  }
  console.log('  by type:', JSON.stringify(byType));
  console.log('  by blocked-surface:', JSON.stringify(bySurface));
  console.log(`  TOTAL blocked-write remediations: ${(data ?? []).length}`);
}

// ── BL-001 query shape #6: interaction signals (behavioral) ─────────────────
async function interactions() {
  const { data } = await sb.from('classification_signals')
    .select('signal_value, created_at').eq('tenant_id', TENANT).eq('signal_type', 'interaction:import').limit(100);
  console.log('\n=== [#6] interaction:import (behavioral) ===');
  const hist: Record<string, number> = {};
  for (const r of data ?? []) { const a = (sv(r).action as string) ?? '?'; hist[a] = (hist[a] ?? 0) + 1; }
  if (Object.keys(hist).length === 0) console.log('  (none)');
  for (const [a, n] of Object.entries(hist)) console.log(`  action=${a}: ${n}`);
}

(async () => {
  console.log(`OB-203 TRACE — tenant ${TENANT}${SESSION ? `  session ${SESSION}` : ' (all sessions)'}`);
  await unitStateTimeline();
  await sessionLifecycle();
  await failureClasses();
  await comprehensionCost();
  await tierDistribution();
  await remediationFamily();
  await interactions();
})();
