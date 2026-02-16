# CLT-45: POST-BUILD PRODUCTION VERIFICATION

## Purpose
Verify everything delivered in PRs #1-5 is working correctly in production (vialuce.ai).
Run this BEFORE sending HF-026 to CC. Document what passes and what fails —
failures become HF-026 scope items.

---

## SECTION 1: INFRASTRUCTURE HEALTH (Terminal)

Run these from your local terminal. No login required.

```bash
# 1. Does vialuce.ai respond at all?
curl -s -o /dev/null -w "Root: %{http_code}\n" https://vialuce.ai/

# 2. Does the login page render?
curl -s -o /dev/null -w "Login: %{http_code}\n" https://vialuce.ai/login

# 3. Auth health endpoint (HF-024 deliverable)
curl -s https://vialuce.ai/api/health/auth | python3 -m json.tool

# Expected: supabase_url_set: true, anon_key_set: true, 
#           anon_key starts with "eyJ" (valid JWT)
#           If anon_key_valid_jwt: false → env var regression (HF-024 issue)

# 4. Check for redirect loops
curl -s -D - https://vialuce.ai/ -o /dev/null 2>&1 | grep -E "HTTP/|Location:" | head -10
# Expected: 307 redirect to /login (one hop, not a loop)
```

| # | Check | Expected | Actual | Pass? |
|---|-------|----------|--------|-------|
| 1 | Root HTTP status | 200 or 307 | | |
| 2 | Login HTTP status | 200 | | |
| 3 | Auth health: supabase_url_set | true | | |
| 4 | Auth health: anon_key starts with eyJ | true | | |
| 5 | No redirect loop (single hop to /login) | Yes | | |

---

## SECTION 2: SUPABASE DATA VERIFICATION (Terminal)

Run from your project directory (`cd /Users/AndrewAfrica/spm-platform/web`).
These use the service role key from your local `.env.local`.

```bash
# 6. Verify tenants exist with correct names
npx tsx -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data } = await sb.from('tenants').select('id,name,industry,settings');
  data.forEach(t => console.log(
    t.name, '|', t.industry, '| demo_users:', 
    t.settings?.demo_users?.length || 0
  ));
})();
"
# Expected:
#   Optica Luminar | ... | demo_users: 3
#   Velocidad Deportiva | ... | demo_users: 3

# 7. Verify platform admin scope
npx tsx -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data } = await sb.from('profiles').select('email,scope_level').in('email', [
    'platform@vialuce.com',
    'admin@opticaluminar.mx', 'gerente@opticaluminar.mx', 'vendedor@opticaluminar.mx',
    'admin@velocidaddeportiva.mx', 'gerente@velocidaddeportiva.mx', 'asociado@velocidaddeportiva.mx'
  ]);
  data.forEach(p => console.log(p.email, '|', p.scope_level));
})();
"
# Expected: platform@vialuce.com | vl_admin
#           OL users: admin/gerente/vendedor scopes
#           VD users: admin/gerente/viewer scopes

# 8. Verify Optica Luminar entity count
npx tsx -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data } = await sb.from('tenants').select('id,name');
  for (const t of data) {
    const { count } = await sb.from('entities').select('*', { count: 'exact', head: true }).eq('tenant_id', t.id);
    console.log(t.name, '| entities:', count);
  }
})();
"
# Expected: Optica Luminar | entities: 22
#           Velocidad Deportiva | entities: 35

# 9. Verify VD key data counts
npx tsx -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  // Find VD tenant
  const { data: tenants } = await sb.from('tenants').select('id,name');
  const vd = tenants.find(t => t.name.includes('Velocidad'));
  if (!vd) { console.log('ERROR: Velocidad Deportiva tenant not found'); return; }
  const tid = vd.id;
  
  const counts = {};
  for (const table of ['rule_sets','rule_set_assignments','periods','committed_data','calculation_results','entity_period_outcomes']) {
    const { count } = await sb.from(table).select('*', { count: 'exact', head: true }).eq('tenant_id', tid);
    counts[table] = count;
  }
  console.log('Velocidad Deportiva data:');
  console.log(JSON.stringify(counts, null, 2));
})();
"
# Expected:
#   rule_sets: 2
#   rule_set_assignments: 36
#   periods: 8
#   committed_data: 156
#   calculation_results: 108
#   entity_period_outcomes: 36

# 10. Verify VD attendance gates (A05 should have zero payouts)
npx tsx -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data: tenants } = await sb.from('tenants').select('id,name');
  const vd = tenants.find(t => t.name.includes('Velocidad'));
  const { data: a05 } = await sb.from('entities').select('id,name,external_id').eq('tenant_id', vd.id).like('external_id', '%A05%');
  if (!a05?.length) { console.log('A05 not found'); return; }
  const { data: results } = await sb.from('calculation_results').select('period_label,total_payout,components').eq('entity_id', a05[0].id);
  console.log(a05[0].name, '(', a05[0].external_id, ')');
  results?.forEach(r => console.log(' ', r.period_label, '| payout:', r.total_payout));
})();
"
# Expected: Diego Castillo — all months show payout: 0 (attendance gate)

# 11. Verify demo user auth works
npx tsx -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
(async () => {
  const users = [
    { email: 'platform@vialuce.com', pw: 'demo-password-VL1' },
    { email: 'admin@opticaluminar.mx', pw: 'demo-password-OL1' },
    { email: 'admin@velocidaddeportiva.mx', pw: 'demo-password-VD1' },
  ];
  for (const u of users) {
    const { data, error } = await sb.auth.signInWithPassword({ email: u.email, password: u.pw });
    console.log(u.email, error ? 'FAIL: ' + error.message : 'OK');
    if (data?.session) await sb.auth.signOut();
  }
})();
"
# Expected: All three show OK
```

| # | Check | Expected | Actual | Pass? |
|---|-------|----------|--------|-------|
| 6 | Optica Luminar tenant exists, demo_users: 3 | Yes | | |
| 7 | Velocidad Deportiva tenant exists, demo_users: 3 | Yes | | |
| 8 | platform@vialuce.com scope = vl_admin | Yes | | |
| 9 | OL entity count = 22 | 22 | | |
| 10 | VD entity count = 35 | 35 | | |
| 11 | VD rule_sets = 2 | 2 | | |
| 12 | VD assignments = 36 | 36 | | |
| 13 | VD periods = 8 | 8 | | |
| 14 | VD committed_data = 156 | 156 | | |
| 15 | VD calculation_results = 108 | 108 | | |
| 16 | VD outcomes = 36 | 36 | | |
| 17 | A05 Diego Castillo: all payouts = 0 | Yes | | |
| 18 | Auth: platform@vialuce.com | OK | | |
| 19 | Auth: admin@opticaluminar.mx | OK | | |
| 20 | Auth: admin@velocidaddeportiva.mx | OK | | |

---

## SECTION 3: BROWSER VERIFICATION (vialuce.ai)

Open Chrome incognito. DevTools console open (F12 → Console tab).

### 3A: Platform Admin Flow

1. Navigate to `https://vialuce.ai/` → Should redirect to `/login`
2. Log in as `platform@vialuce.com` / `demo-password-VL1`
3. Should redirect to `/select-tenant`

| # | Check | Expected | Actual | Pass? |
|---|-------|----------|--------|-------|
| 21 | Root redirects to /login | Yes | | |
| 22 | Login succeeds (no 401) | Yes | | |
| 23 | Redirects to /select-tenant | Yes | | |
| 24 | Console: ZERO 401 errors on login | 0 | | |

4. On tenant picker page:

| # | Check | Expected | Actual | Pass? |
|---|-------|----------|--------|-------|
| 25 | "Optica Luminar" visible as tenant card | Yes | | |
| 26 | "Velocidad Deportiva" visible as tenant card | Yes | | |
| 27 | NO "RetailCo MX" or "FRMX" cards | None | | |
| 28 | Console: ZERO errors on picker page | 0 | | |

5. Click Optica Luminar → Dashboard loads

| # | Check | Expected | Actual | Pass? |
|---|-------|----------|--------|-------|
| 29 | Sidebar shows "Optica Luminar" | Yes (not "RetailCo MX") | | |
| 30 | Header/breadcrumb shows "Optica Luminar" | Yes (not "RetailCo MX") | | |
| 31 | Console: ZERO 400 errors | 0 | | |
| 32 | DemoPersonaSwitcher visible at bottom | Floating bar with persona chips | | |

### 3B: Demo Persona Switcher

If gate #32 passed:

| # | Check | Expected | Actual | Pass? |
|---|-------|----------|--------|-------|
| 33 | OL persona chips visible (admin/gerente/vendedor) | 3 chips | | |
| 34 | Click admin chip → re-authenticates as admin@opticaluminar.mx | New role shown | | |
| 35 | "Back to Platform Admin" chip present | Yes | | |
| 36 | Click back → returns to platform@vialuce.com | Platform admin restored | | |

### 3C: Switch to Velocidad Deportiva

Navigate back to tenant picker (via sidebar "Switch Organization" or direct URL).

| # | Check | Expected | Actual | Pass? |
|---|-------|----------|--------|-------|
| 37 | Click Velocidad Deportiva → Dashboard loads | Yes | | |
| 38 | Sidebar shows "Velocidad Deportiva" | Yes | | |
| 39 | Console: ZERO 400 errors | 0 | | |
| 40 | VD persona chips visible (admin/gerente/asociado) | 3 chips | | |

### 3D: Tenant Admin Direct Flow

Log out completely. New incognito window.

1. Log in as `admin@opticaluminar.mx` / `demo-password-OL1`

| # | Check | Expected | Actual | Pass? |
|---|-------|----------|--------|-------|
| 41 | Skips tenant picker → straight to dashboard | Yes | | |
| 42 | Sidebar shows "Optica Luminar" | Yes | | |
| 43 | Console: ZERO 400 errors | 0 | | |
| 44 | DemoPersonaSwitcher NOT visible | Correct (not vl_admin) | | |

---

## SECTION 4: SCORING

**Total Gates: 44**

Count your passes:
- 40-44: Production is solid. HF-026 scope is minimal cleanup.
- 30-39: Core is working but significant UI/guard issues. HF-026 addresses the gaps.
- 20-29: Major issues remain. Categorize failures and prioritize.
- <20: Something fundamental broke. Start with Section 1 failures.

**Failures become HF-026 scope.** Record exactly which gates failed and paste the
completed scorecard into the next conversation so HF-026 targets precisely what's broken.

---

## KNOWN LIKELY FAILURES (from CLT-44 screenshot)

Based on what we already saw:
- **Gates 27, 29, 30** will likely FAIL (RetailCo MX still showing)
- **Gates 31, 39, 43** will likely FAIL (400 errors from unguarded reads)
- **Gates 32-36, 40** may FAIL (DemoPersonaSwitcher not appearing)

These are exactly what HF-026 is designed to fix. But run the full CLT-45 anyway —
there may be additional failures we haven't seen yet, or some of these may actually
pass in a clean incognito session.
