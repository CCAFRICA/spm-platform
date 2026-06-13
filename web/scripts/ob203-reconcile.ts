// OB-203 Phase 6 — reconciliation ASSESSMENT (read-only; authors SQL for architect application, SR-44).
// Enumerates the contamination shapes Phase 2 exposed and prints the retire/re-derive SQL — it NEVER
// executes destructive SQL (SR-44: authored, schema-verified, architect-applied).
//   Usage: npx tsx scripts/ob203-reconcile.ts [tenantId]
import { createClient } from '@supabase/supabase-js';

const TENANT = process.argv[2] || '24103940-ab33-4a21-b6fd-bd1042f4762c';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const hasUnknownRole = (roles: Record<string, unknown> | null) =>
  !!roles && Object.values(roles).some(r => r === 'unknown' || r === '' || r == null);

(async () => {
  console.log(`OB-203 RECONCILE — tenant ${TENANT}\n`);

  // ── (A) poisoned SHEET fingerprints: column_roles carrying 'unknown'/''/null, or fieldBindings
  //        stored under a wrong classification (semanticRole='unknown' — the d464 shape). ──
  const { data: sheets } = await sb.from('structural_fingerprints')
    .select('id, fingerprint_hash, classification_result, column_roles, confidence, match_count')
    .eq('tenant_id', TENANT).eq('granularity', 'sheet');
  const poisoned: string[] = [];
  console.log('=== (A) sheet fingerprints ===');
  for (const r of sheets ?? []) {
    const cr = r.classification_result as Record<string, unknown> | null;
    const fbs = Array.isArray(cr?.fieldBindings) ? (cr!.fieldBindings as Array<Record<string, unknown>>) : [];
    const unknownBindings = fbs.filter(fb => fb.semanticRole === 'unknown' || (typeof fb.confidence === 'number' && fb.confidence <= 0.3 && fb.semanticRole === 'unknown'));
    const colRolesUnknown = hasUnknownRole(r.column_roles as Record<string, unknown> | null);
    if (unknownBindings.length > 0 || colRolesUnknown) {
      poisoned.push(r.id as string);
      console.log(`  POISONED ${(r.fingerprint_hash as string).slice(0, 12)} class=${cr?.classification ?? '?'} conf=${r.confidence} unknownBindings=${unknownBindings.length} colRolesUnknown=${colRolesUnknown}`);
    }
  }
  if (poisoned.length === 0) console.log('  (none)');

  // ── (B) accumulated AMBIGUOUS atoms ──
  const { data: atoms } = await sb.from('structural_fingerprints')
    .select('id, fingerprint_hash, column_roles, match_count')
    .eq('tenant_id', TENANT).eq('granularity', 'atom');
  const ambiguous = (atoms ?? []).filter(a => (a.column_roles as Record<string, unknown> | null)?.role === 'ambiguous');
  console.log(`\n=== (B) ambiguous atoms: ${ambiguous.length} of ${atoms?.length ?? 0} ===`);
  for (const a of ambiguous) console.log(`  ${(a.fingerprint_hash as string).slice(0, 12)} match=${a.match_count}`);

  // ── (C) sentinel-mismatch census (Phase 0.4): how 'unknown' is STORED (string vs missing key) ──
  console.log('\n=== (C) sentinel census (string "unknown" vs empty vs null in column_roles) ===');
  const sentinel = { stringUnknown: 0, empty: 0, nullish: 0 };
  for (const r of sheets ?? []) {
    const cr = r.column_roles as Record<string, unknown> | null;
    if (!cr) continue;
    for (const v of Object.values(cr)) { if (v === 'unknown') sentinel.stringUnknown++; else if (v === '') sentinel.empty++; else if (v == null) sentinel.nullish++; }
  }
  console.log(`  string 'unknown': ${sentinel.stringUnknown}  empty '': ${sentinel.empty}  null/undefined: ${sentinel.nullish}`);

  // ── AUTHORED SQL (architect-applied per SR-44; NOT executed here) ──
  console.log('\n=== AUTHORED RETIRE SQL (SR-44: review + architect-apply; NOT executed) ===');
  if (poisoned.length > 0) {
    console.log(`-- retire ${poisoned.length} poisoned sheet fingerprint(s) (re-derive cleanly on next import):`);
    console.log(`DELETE FROM structural_fingerprints WHERE tenant_id = '${TENANT}' AND granularity = 'sheet'`);
    console.log(`  AND id IN (${poisoned.map(id => `'${id}'`).join(', ')});`);
  } else {
    console.log('-- no poisoned sheet fingerprints to retire.');
  }
  if (ambiguous.length > 0) {
    console.log(`\n-- ambiguous atoms (${ambiguous.length}) — DISPOSITION CHOICE (architect):`);
    console.log(`--   (a) KEEP: they correctly route to comprehension (no action), OR`);
    console.log(`--   (b) RETIRE to force fresh re-derivation:`);
    console.log(`-- DELETE FROM structural_fingerprints WHERE tenant_id = '${TENANT}' AND granularity = 'atom'`);
    console.log(`--   AND column_roles->>'role' = 'ambiguous';`);
  }
  console.log('\nDone. Read-only assessment complete; no rows modified.');
})();
