// HF-283 Phase 5 — RLS verification harness. Read-only (sign-in updates last_sign_in_at
// only). Credentials from env (NEVER committed): HF283_TDADMIN_PW, HF283_EOADMIN_PW
// (platform identities, required); HF283_PLATFORM_PW (optional); HF283_SABOR_EMAIL +
// HF283_SABOR_PW (optional tenant-scoped control). Run:
//   cd web && set -a && source .env.local && set +a && npx tsx scripts/verify-hf283-rls.ts
import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY!;

interface Acct { label: string; email: string; pw: string | undefined; kind: 'platform' | 'control'; }
const ACCTS: Acct[] = [
  { label: 'tdadmin (platform)', email: 'tdadmin@vialuce.com', pw: process.env.HF283_TDADMIN_PW, kind: 'platform' },
  { label: 'eoadmin (platform)', email: 'eoadmin@vialuce.com', pw: process.env.HF283_EOADMIN_PW, kind: 'platform' },
  { label: 'platform@ (platform)', email: 'platform@vialuce.com', pw: process.env.HF283_PLATFORM_PW, kind: 'platform' },
  { label: 'control (tenant-scoped)', email: process.env.HF283_SABOR_EMAIL ?? '', pw: process.env.HF283_SABOR_PW, kind: 'control' },
];

function eqSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const s = new Set(a); return b.every(x => s.has(x));
}

async function main() {
  // HALT-6 gate: required platform creds must be present.
  const missing = ACCTS.filter(a => a.kind === 'platform' && a.email && a.email.includes('@'))
    .filter(a => a.label.startsWith('tdadmin') || a.label.startsWith('eoadmin'))
    .filter(a => !a.pw)
    .map(a => a.label.startsWith('tdadmin') ? 'HF283_TDADMIN_PW' : 'HF283_EOADMIN_PW');
  if (missing.length > 0) {
    console.log(`HALT-6: missing required env credential key(s): ${missing.join(', ')}`);
    console.log('Supply values in web/.env.local (uncommitted) and re-run.');
    return;
  }

  const svc = createClient(URL, SVC, { auth: { persistSession: false } });
  const { data: allTenants } = await svc.from('tenants').select('id');
  const fullSet = (allTenants ?? []).map(t => t.id).sort();
  console.log(`service-role tenants set: ${fullSet.length} ids`);

  for (const a of ACCTS) {
    if (!a.pw || !a.email) { console.log(`${a.label}: SKIP (no creds)`); continue; }
    const c = createClient(URL, ANON, { auth: { persistSession: false } });
    const { data: si, error: se } = await c.auth.signInWithPassword({ email: a.email, password: a.pw });
    if (se || !si?.session) { console.log(`${a.label}: SIGN-IN FAILED (${se?.message})`); continue; }
    const { data: rows, error: qe } = await c.from('tenants').select('id, slug').order('slug');
    const ids = (rows ?? []).map(r => r.id).sort();
    if (a.kind === 'platform') {
      const pass = eqSet(ids, fullSet);
      console.log(`${a.label}: ${ids.length} tenants -> G-A ${pass ? 'PASS' : 'FAIL'}${qe ? ' err='+qe.message : ''}`);
    } else {
      // G-B: control sees exactly its own tenant_id
      const { data: prof } = await svc.from('profiles').select('tenant_id').eq('email', a.email).limit(1).maybeSingle();
      const own = prof?.tenant_id ? [prof.tenant_id] : [];
      console.log(`${a.label}: ${ids.length} tenants -> G-B ${eqSet(ids, own) ? 'PASS' : 'FAIL'} (own=${own[0] ?? 'none'})`);
    }
    await c.auth.signOut();
  }
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
