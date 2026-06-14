// OB-204 Phase B.4 — POST-APPLICATION verification (run AFTER the architect applies migration 017).
// (A) row-level audit: zero rows violate any §2 contract. (B) failing-write probes: each constraint
// REJECTS a violating insert (FP-49-compliant constraint evidence — proves the constraint is live, not
// just that data happens to conform). Probe rows are immediately cleaned up.
// Run from web/: set -a && source .env.local && set +a && npx tsx scripts/ob204-phaseb-verify.ts
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); };

async function main() {
  console.log('================ OB-204 Phase B.4 VERIFICATION ================');

  // ── (A) row-level audit (read-only) ──
  console.log('\n=== (A) row-level audit — zero §2 violations ===');
  const { data: profs } = await sb.from('profiles').select('id, auth_user_id, role, tenant_id, capabilities, status');
  const rows = profs ?? [];
  const CANON = new Set(['platform', 'admin', 'manager', 'member', 'viewer']);
  check('every capabilities is a JSON array', rows.every(p => Array.isArray(p.capabilities)), `${rows.filter(p => !Array.isArray(p.capabilities)).length} non-array`);
  check('every role is canonical', rows.every(p => CANON.has(p.role)), rows.filter(p => !CANON.has(p.role)).map(p => p.role).join(',') || 'all canonical');
  check('(role=platform) ⇔ (tenant_id IS NULL)', rows.every(p => (p.role === 'platform') === (p.tenant_id === null)));
  const authIds = rows.map(p => p.auth_user_id).filter(Boolean);
  check('auth_user_id unique (no dup groups)', new Set(authIds).size === authIds.length);
  check('status column present + in {active,disabled}', rows.every(p => p.status === 'active' || p.status === 'disabled'), `statuses: ${Array.from(new Set(rows.map(p => p.status))).join(',')}`);

  // ── (B) failing-write probes — each constraint must REJECT a violating insert ──
  console.log('\n=== (B) failing-write probes — each constraint rejects (FP-49 evidence) ===');
  const { data: anyTenant } = await sb.from('tenants').select('id').limit(1).maybeSingle();
  const tenantId = anyTenant?.id ?? null;
  const realAuthId = authIds[0];
  const MARK = 'phaseb-probe-';

  async function probe(name: string, row: Record<string, unknown>) {
    const { data, error } = await sb.from('profiles').insert(row).select('id');
    if (error) { check(name, true, `rejected: ${error.message.slice(0, 60)}`); return; }
    // unexpectedly accepted → constraint NOT live; clean up + FAIL
    check(name, false, 'ACCEPTED — constraint not enforced (apply migration 017 first?)');
    for (const r of (data ?? [])) await sb.from('profiles').delete().eq('id', r.id);
  }
  await probe('array CHECK rejects object capabilities', { auth_user_id: null, email: `${MARK}1@x.invalid`, role: 'member', tenant_id: tenantId, capabilities: { x: true } });
  await probe('role canon CHECK rejects bogus role', { auth_user_id: null, email: `${MARK}2@x.invalid`, role: 'bogus', tenant_id: tenantId, capabilities: [] });
  await probe('platform-tenant CHECK rejects platform+tenant', { auth_user_id: null, email: `${MARK}3@x.invalid`, role: 'platform', tenant_id: tenantId, capabilities: [] });
  await probe('status CHECK rejects bogus status', { auth_user_id: null, email: `${MARK}4@x.invalid`, role: 'member', tenant_id: tenantId, capabilities: [], status: 'bogus' });
  if (realAuthId) await probe('UNIQUE(auth_user_id) rejects duplicate', { auth_user_id: realAuthId, email: `${MARK}5@x.invalid`, role: 'member', tenant_id: tenantId, capabilities: [] });

  // safety net: remove any probe rows that slipped through
  await sb.from('profiles').delete().like('email', `${MARK}%`);

  console.log(`\n================ RESULT: ${pass} PASS / ${fail} FAIL ================`);
  if (fail > 0) process.exit(1);
}
main().catch(e => { console.error('VERIFY ERROR:', e); process.exit(1); });
