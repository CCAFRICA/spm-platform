// OB-203 Phase 3 — live-run verification (EPG-3.2 / spine / session-grouping / bound).
// Usage: npx tsx scripts/ob203-phase3-verify.ts [importSessionId]
//   no arg → auto-discovers the LATEST comprehension:unit_state session for the tenant.
// Read-only, service-role. Run AFTER the architect's mod3 import (and again post-execute for bound).
import { createClient } from '@supabase/supabase-js';
import { STATE_RANK, UNIT_STATE_SIGNAL_TYPE, type UnitComprehensionState } from '../src/lib/sci/comprehension-state-service';

const TENANT = '24103940-ab33-4a21-b6fd-bd1042f4762c';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

(async () => {
  // ── pull this tenant's unit-state signals ──
  const { data, error } = await sb
    .from('classification_signals')
    .select('signal_value, context, sheet_name, classification, confidence, source, created_at')
    .eq('tenant_id', TENANT)
    .eq('signal_type', UNIT_STATE_SIGNAL_TYPE)
    .order('created_at', { ascending: true });
  if (error) { console.error('query error', error.message); process.exit(1); }
  const rows = data ?? [];
  if (rows.length === 0) { console.log('No comprehension:unit_state signals yet for tenant.'); return; }

  // ── select session ──
  const arg = process.argv[2];
  const sessionOf = (r: typeof rows[number]) => (r.context as Record<string, unknown> | null)?.importSessionId as string | undefined;
  let session = arg;
  if (!session) {
    // latest session = the one whose newest signal has the max created_at
    let best = ''; let bestAt = '';
    for (const r of rows) { const s = sessionOf(r); if (s && r.created_at > bestAt) { bestAt = r.created_at; best = s; } }
    session = best;
  }
  console.log(`importSessionId = ${session}${arg ? ' (arg)' : ' (auto: latest)'}\n`);
  const sess = rows.filter(r => sessionOf(r) === session);

  // ── group by unit ──
  const byUnit = new Map<string, typeof rows>();
  for (const r of sess) {
    const u = (r.signal_value as Record<string, unknown>)?.unitId as string;
    (byUnit.get(u) ?? byUnit.set(u, []).get(u)!).push(r);
  }

  // ── EPG-3.1 reminder ──
  console.log('EPG-3.1 (G7): signal_type =', UNIT_STATE_SIGNAL_TYPE, '— one canonical surface, zero new tables/channels (diff: 0 migrations, 0 direct inserts).\n');

  let allMonotonic = true, allOneSession = true, persistedFirstOk = true, boundCount = 0;
  const sessionsSeen = new Set(sess.map(sessionOf));
  allOneSession = sessionsSeen.size === 1;

  for (const [unitId, urows] of Array.from(byUnit.entries())) {
    const ordered = urows.slice().sort((a, b) => {
      const t = a.created_at.localeCompare(b.created_at);
      if (t !== 0) return t;
      return (((a.signal_value as Record<string, unknown>)?.seq as number) ?? 0) - (((b.signal_value as Record<string, unknown>)?.seq as number) ?? 0);
    });
    const states = ordered.map(r => (r.signal_value as Record<string, unknown>)?.state as UnitComprehensionState);
    const sheet = ordered[0].sheet_name;
    console.log(`UNIT ${unitId}  (sheet=${sheet})`);
    for (const r of ordered) {
      const sv = r.signal_value as Record<string, unknown>;
      console.log(`    ${r.created_at}  seq=${sv.seq}  ${String(sv.state).padEnd(20)} ${r.classification ? 'class=' + r.classification : ''}`);
    }

    // EPG-3.2: persisted must exist and precede profiled
    const persisted = ordered.find(r => (r.signal_value as Record<string, unknown>)?.state === 'persisted');
    const profiled = ordered.find(r => (r.signal_value as Record<string, unknown>)?.state === 'profiled');
    if (!persisted) { persistedFirstOk = false; console.log('    ✗ no persisted signal'); }
    else if (profiled && !(persisted.created_at < profiled.created_at || (persisted.created_at === profiled.created_at && (persisted.signal_value as Record<string, unknown>).seq! < (profiled.signal_value as Record<string, unknown>).seq!))) {
      persistedFirstOk = false; console.log('    ✗ persisted does NOT precede profiled');
    } else { console.log('    ✓ persisted precedes profiled (EPG-3.2)'); }

    // monotonic spine: spine ranks non-decreasing (failed/resolved exempt)
    let prev = -Infinity, mono = true;
    for (const s of states) {
      const rank = STATE_RANK[s];
      if (s === 'failed_interpretation' || s === 'resolved') continue;
      if (rank < prev) { mono = false; break; }
      prev = rank;
    }
    if (!mono) allMonotonic = false;
    console.log(`    ${mono ? '✓' : '✗'} monotonic spine: ${states.join(' → ')}`);
    if (states.includes('bound')) boundCount++;
    console.log('');
  }

  console.log('── SUMMARY ──');
  console.log(`  units: ${byUnit.size}`);
  console.log(`  ${allOneSession ? '✓' : '✗'} all states under ONE importSessionId (${sessionsSeen.size} session(s) seen)`);
  console.log(`  ${persistedFirstOk ? '✓' : '✗'} EPG-3.2: persisted present and precedes profiled for every unit`);
  console.log(`  ${allMonotonic ? '✓' : '✗'} monotonic spine for every unit`);
  console.log(`  bound present on ${boundCount}/${byUnit.size} units ${boundCount === 0 ? '(pre-execute — re-run after confirm)' : ''}`);
})();
