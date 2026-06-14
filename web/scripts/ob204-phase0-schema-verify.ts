// OB-204 Phase 0 — pre-flight evidence (READ-ONLY; service-role row introspection only — FP-49:
// no information_schema/pg_catalog via PostgREST). Covers 0.2 schema verify, 0.3 capability-shape
// probe (Q-F), 0.8 env presence, 0.10 historical PII sample.
// Run from web/: set -a && source .env.local && set +a && npx tsx scripts/ob204-phase0-schema-verify.ts
import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const sb = createClient(URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const keysOf = (row: any) => row ? Object.keys(row).sort() : [];
async function oneRow(table: string) {
  const { data, error } = await sb.from(table).select('*').limit(1);
  if (error) return { table, error: error.message, cols: [] as string[], row: null };
  return { table, error: null, cols: keysOf(data?.[0]), row: data?.[0] ?? null };
}

async function main() {
  console.log('================ OB-204 PHASE 0 PRE-FLIGHT (read-only) ================');

  // ---- 0.8 env presence (NAMES ONLY, never values) ----
  console.log('\n=== 0.8 ENV PRESENCE (names only) ===');
  for (const k of ['RESEND_API_KEY', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
    console.log(`  ${k}: ${process.env[k] ? 'PRESENT' : 'ABSENT'}`);
  }

  // ---- 0.2 schema verify ----
  console.log('\n=== 0.2 SCHEMA VERIFY (column inventory per table) ===');
  const tables = ['profiles', 'entities', 'entity_relationships', 'profile_scope', 'tenants', 'platform_events', 'audit_logs'];
  const schema: Record<string, string[]> = {};
  for (const t of tables) {
    const r = await oneRow(t);
    schema[t] = r.cols;
    console.log(`  ${t} (${r.cols.length} cols)${r.error ? ' ERROR=' + r.error : ''}: [${r.cols.join(', ')}]`);
  }
  // DS-028 §2/§2A/§4A assertions
  console.log('\n  -- assertions --');
  const has = (t: string, c: string) => schema[t]?.includes(c);
  console.log(`  profiles.capabilities present: ${has('profiles','capabilities')}`);
  console.log(`  profiles.status present (expected ABSENT pre-Phase-B): ${has('profiles','status')}`);
  console.log(`  entities.profile_id present: ${has('entities','profile_id')}`);
  console.log(`  entity_relationships col count (expect 13): ${schema['entity_relationships']?.length}`);
  console.log(`  profile_scope.scope_type present: ${has('profile_scope','scope_type')}`);
  console.log(`  tenants.locale present: ${has('tenants','locale')} ; tenants.features present: ${has('tenants','features')}`);

  // ---- platform_events.tenant_id nullability evidence (HALT-3 input) ----
  console.log('\n  -- platform_events.tenant_id nullability evidence (HALT-3) --');
  const { count: peTotal } = await sb.from('platform_events').select('*', { count: 'exact', head: true });
  const { count: peNull } = await sb.from('platform_events').select('*', { count: 'exact', head: true }).is('tenant_id', null);
  console.log(`  platform_events rows total=${peTotal} ; rows with tenant_id IS NULL=${peNull}`);
  console.log(`  → ${peNull && peNull > 0 ? 'NULL tenant_id is ACCEPTED (precedent exists; no HALT-3)' : 'NO existing platform-target (null tenant_id) row — emitter types tenant_id:string; HALT-3 candidate (await disposition)'}`);
  const { count: alNull } = await sb.from('audit_logs').select('*', { count: 'exact', head: true }).is('tenant_id', null);
  const { count: alTotal } = await sb.from('audit_logs').select('*', { count: 'exact', head: true });
  console.log(`  audit_logs rows total=${alTotal} ; tenant_id IS NULL=${alNull}`);

  // ---- 0.3 capability-shape probe (Q-F) ----
  console.log('\n=== 0.3 CAPABILITY-SHAPE PROBE (Sabor FRMX + known-good) ===');
  const probe = async (label: string, q: any) => {
    const { data, error } = await q;
    if (error) { console.log(`  ${label}: ERROR ${error.message}`); return; }
    for (const p of (data ?? [])) {
      const cap = p.capabilities;
      const shape = Array.isArray(cap) ? 'ARRAY' : (cap === null ? 'NULL' : typeof cap);
      console.log(`  [${label}] ${p.email ?? p.id} role=${p.role} tenant=${(p.tenant_id ?? 'NULL')?.toString().slice(0,8)} cap_shape=${shape} cap=${JSON.stringify(cap)}`);
    }
  };
  await probe('SABOR', sb.from('profiles').select('id,email,role,tenant_id,capabilities').ilike('email', '%saborgrupo.mx'));
  await probe('known-good platform@', sb.from('profiles').select('id,email,role,tenant_id,capabilities').eq('auth_user_id', '9c179b53-c5ee-4af7-a36b-09f5db3e35f2'));
  await probe('known-good admins', sb.from('profiles').select('id,email,role,tenant_id,capabilities').or('email.ilike.%tdadmin%,email.ilike.%eoadmin%').limit(4));
  await probe('known-good sample (any 2 array-cap)', sb.from('profiles').select('id,email,role,tenant_id,capabilities').not('capabilities','is',null).limit(2));

  // ---- 0.10 historical PII sample ----
  console.log('\n=== 0.10 HISTORICAL PII SAMPLE (50 platform_events + 50 audit_logs) ===');
  const emailRe = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
  for (const t of ['platform_events', 'audit_logs']) {
    const { data } = await sb.from(t).select('*').order('created_at', { ascending: false }).limit(50);
    let emailHits = 0, example: string | null = null;
    for (const r of (data ?? [])) {
      const blob = JSON.stringify(r.payload ?? r.metadata ?? r.details ?? r ?? {});
      const m = blob.match(emailRe);
      if (m) { emailHits++; if (!example) example = blob.slice(0, 160).replace(emailRe, '<REDACTED_EMAIL>'); }
    }
    console.log(`  ${t}: scanned ${data?.length ?? 0}; rows w/ @email pattern in payload=${emailHits}${example ? ` ; example(redacted)=${example}` : ''}`);
  }
  console.log('\n================ END PHASE 0 PRE-FLIGHT ================');
}
main().catch(e => { console.error('SCRIPT ERROR:', e); process.exit(1); });
