# HF-026: FIX PRODUCTION 400 ERRORS, STALE TENANT BRANDING, PERSONA SWITCHER, AND AUTOMATED CLT

## Autonomy Directive
NEVER ask yes/no. NEVER say "shall I". Just act. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.

## Standing Rules
1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server, `rm -rf .next`, `npm run build`, `npm run dev`, confirm localhost:3000 responds.
3. Completion reports and proof gates at PROJECT ROOT (same level as package.json).
4. Never provide CC with answer values — fix logic not data.
5. Final step: `gh pr create --base main --head dev` with descriptive title and body.
6. Completion report file is created BEFORE final build verification, then appended with build results.

## CC Anti-Patterns (DO NOT DO THESE)
- **Placeholder Syndrome:** Substitutes stubs for real logic
- **Schema Disconnect:** Writes to one field, reads from another
- **Silent Fallbacks:** Returns zero/null instead of throwing errors — if data is missing, show a visible error or empty state, do NOT silently swallow
- **Report Burial:** Saves reports in subdirectories instead of project root
- **Autonomy Leakage:** Stops to ask despite explicit autonomy directive

---

## CONTEXT

### CLT-45 Results (20/20 Infrastructure + Data, 24 Browser Gates Pending)

**Sections 1+2 PASSED (terminal verification):**
- vialuce.ai responds (root 307 → /login 200)
- Auth health: valid JWT, Supabase connected
- Both tenants exist: Optica Luminar (22 entities, 3 demo_users), Velocidad Deportiva (35 entities, 3 demo_users)
- platform@vialuce.com scope = vl_admin
- VD data complete: 2 rule sets, 36 assignments, 8 periods, 156 committed data, 108 calc results, 36 outcomes
- A05 Diego Castillo: 6 results, all zero payouts (attendance gate works)
- All 3 demo users authenticate successfully

**Section 3 KNOWN FAILURES (from CLT-44 screenshot + CLT-45 code inspection):**

### Issue 1: Stale "RetailCo MX" Branding
Header breadcrumb shows "RetailCo MX". Sidebar shows "RetailCo MX 15". The Optica Luminar name fix updated Supabase but the UI reads from hardcoded fallbacks or stale static config.

### Issue 2: 12+ Console 400 Errors on Dashboard
Every Supabase query to `bayqxeiltnqjrvflksfa.supabase.co` returns HTTP 400 on dashboard load. HF-025 added `requireTenantId()` to 14 WRITE operations but left ALL read operations unguarded. Dashboard mount fires reads with null/empty tenant_id → 400.

### Issue 3: DemoPersonaSwitcher Not Visible / Wrong Password
Component exists at `web/src/components/demo/DemoPersonaSwitcher.tsx`. CLT-45 found a **confirmed bug at line 36**:
```
Current:  const PLATFORM_PASSWORD = 'VL-platform-2024!';
Correct:  const PLATFORM_PASSWORD = 'demo-password-VL1';
```
The "Back to Platform Admin" button silently fails because the password is wrong. The switcher may also not be visible at all if `tenant.settings` (including `demo_users`) isn't loaded by the tenant context query.

### Issue 4: Stale Tenant in Picker
CLT-45 found a stale tenant `a0000000...` with 13 entities still in the tenants table — likely the old "RetailCo MX" from pre-HF-025. If the tenant picker shows ALL tenants from Supabase, this ghost tenant will appear alongside Optica Luminar and Velocidad Deportiva.

### Architecture Reference
```
Auth flow (VL Admin):
  login → middleware → /select-tenant → Supabase query → click tenant → setTenant → cookie + sessionStorage → router.push('/')

Three-layer null guard (from HF-025):
  1. auth-shell redirect (missing tenant → /select-tenant)
  2. page useEffect early return
  3. requireTenantId() service assertion (WRITES ONLY — reads unguarded)

DemoPersonaSwitcher visibility:
  authenticated + scope_level === 'vl_admin' + tenant selected + tenant.settings.demo_users exists
```

---

## PHASE 0: DIAGNOSTIC (DO NOT CHANGE CODE)

### 0A: Find "RetailCo" Sources

```bash
cd /Users/AndrewAfrica/spm-platform/web

# Every hardcoded "RetailCo" in source
grep -rn "RetailCo\|Retail Co\|RETAILCO\|retailco" src/ --include="*.ts" --include="*.tsx" --include="*.json"

# Every hardcoded "FRMX" in source
grep -rn "FRMX\|frmx" src/ --include="*.ts" --include="*.tsx" --include="*.json" | grep -v node_modules

# Check tenant context — does it read from Supabase or static config?
cat src/contexts/tenant-context.tsx

# Check sidebar tenant name source
grep -rn "tenant.*name\|tenantName\|organization" src/components/layout/ --include="*.tsx" | head -20

# Static tenant config files?
find src/ -name "*tenant*" -o -name "*organization*" | grep -v node_modules | head -10
```

### 0B: Find Unguarded Read Queries

```bash
# ALL Supabase queries filtering by tenant_id
grep -rn "\.eq.*tenant_id\|\.match.*tenant_id\|filter.*tenant" src/lib/ src/services/ --include="*.ts" | head -40

# Which have requireTenantId guards?
grep -rn "requireTenantId" src/lib/ src/services/ --include="*.ts"

# What does the dashboard call on mount?
grep -rn "useEffect\|fetch\|supabase\|get.*Data" src/app/**/page.tsx src/app/page.tsx --include="*.tsx" 2>/dev/null | head -20
```

### 0C: Inspect DemoPersonaSwitcher

```bash
# Full component source
cat src/components/demo/DemoPersonaSwitcher.tsx

# Where is it mounted?
grep -rn "DemoPersonaSwitcher\|PersonaSwitcher" src/components/layout/ --include="*.tsx"

# Confirm the password bug
grep -n "PLATFORM_PASSWORD\|VL-platform\|demo-password" src/components/demo/DemoPersonaSwitcher.tsx
```

### 0D: Check for Ghost Tenants

```bash
# List ALL tenants — look for stale ones
npx tsx -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data } = await sb.from('tenants').select('id,name,industry,lifecycle_stage');
  data.forEach(t => console.log(t.id, '|', t.name, '|', t.industry, '|', t.lifecycle_stage));
})();
"
```

### 0E: Check Tenant Context Select Query

```bash
# Does the tenant context include 'settings' in its select?
grep -n "\.select\|from.*tenants" src/contexts/tenant-context.tsx
# If settings isn't selected, demo_users will always be undefined
```

### 0F: Document Findings

Create `HF-026_DIAGNOSTIC_FINDINGS.md` in PROJECT ROOT:
- Files containing "RetailCo" or "FRMX" (static vs dynamic)
- Count: read queries with tenant_id filter vs. those with requireTenantId guard
- DemoPersonaSwitcher: password value, visibility logic, tenant settings query
- Ghost tenant list (IDs + names for any that aren't Optica Luminar or Velocidad Deportiva)
- Tenant context select fields (does it include `settings`?)

**Commit:** `HF-026 Phase 0: Diagnostic findings`

---

## PHASE 1: FIX STALE TENANT BRANDING

### 1A: Eliminate All Hardcoded Tenant Names

Every UI element that displays a tenant name must read from the tenant context, which loads from Supabase. Find and replace every hardcoded "RetailCo MX", "RetailCo", "FRMX Demo", "FRMX", or any other static tenant name in `src/` (excluding seed scripts and test files).

Patterns to fix:
- Sidebar organization name
- Header breadcrumb
- Header tenant dropdown
- Page titles
- Any fallback like `tenant?.name || "RetailCo MX"` → change to `tenant?.name || "Select Organization"`

### 1B: Remove Static Tenant Config

If a static tenant config file exists (e.g., `src/config/tenants.ts`, `src/lib/tenants.ts`, or a JSON file with tenant data), either delete it or ensure nothing imports it. After HF-025, the tenant context should load exclusively from Supabase.

### 1C: Clean Up Ghost Tenants

If the diagnostic found tenants in Supabase that are NOT Optica Luminar or Velocidad Deportiva, they are ghosts from pre-HF-025. Remove them:

```typescript
// Only delete tenants that are clearly stale test data
// DO NOT delete Optica Luminar (a1b2c3d4...) or Velocidad Deportiva (b2c3d4e5...)
```

If you're unsure whether a tenant is stale, leave it and document it. Andrew will decide.

**Commit:** `HF-026 Phase 1: Remove hardcoded tenant branding, dynamic names only`

---

## PHASE 2: FIX READ-SIDE 400 ERRORS

### 2A: Guard ALL Read Operations

Find every Supabase query function in `src/lib/` and `src/services/` that filters by `tenant_id`. Add `requireTenantId(tenantId)` at the top of EVERY function — reads AND writes.

```typescript
export async function getSomeData(tenantId: string | null) {
  const id = requireTenantId(tenantId);
  const { data, error } = await supabase
    .from('some_table')
    .select('*')
    .eq('tenant_id', id);
  // ...
}
```

### 2B: Prevent Queries Before Tenant Is Ready

Dashboard components must NOT fire Supabase queries until tenant context has resolved. Check every `useEffect` in dashboard and workspace pages:

```typescript
// BAD — fires immediately, tenantId might be null
useEffect(() => {
  fetchData(tenantId);
}, []);

// GOOD — waits for tenant
useEffect(() => {
  if (!tenantId) return;
  fetchData(tenantId);
}, [tenantId]);
```

### 2C: Graceful Error Handling

Components that call guarded functions must catch `TENANT_REQUIRED` errors gracefully — show empty state or "Select a tenant" message, NOT console errors.

```typescript
try {
  const data = await getDashboardData(tenantId);
} catch (e) {
  if (e.message === 'TENANT_REQUIRED') {
    // Show empty state — this is expected when no tenant selected
    return;
  }
  throw e;
}
```

**Commit:** `HF-026 Phase 2: Read-side tenant guards, zero 400 errors`

---

## PHASE 3: FIX DEMO PERSONA SWITCHER

### 3A: Fix Platform Password

In `web/src/components/demo/DemoPersonaSwitcher.tsx`, line 36 (or wherever `PLATFORM_PASSWORD` is defined):

```typescript
// WRONG:
const PLATFORM_PASSWORD = 'VL-platform-2024!';

// CORRECT:
const PLATFORM_PASSWORD = 'demo-password-VL1';
```

### 3B: Ensure tenant.settings Is Loaded

Check `src/contexts/tenant-context.tsx` — the Supabase select query must include `settings`:

```typescript
// BAD: .select('id, name, industry')
// GOOD: .select('id, name, industry, settings')
// or: .select('*')
```

Without `settings` in the select, `tenant.settings.demo_users` will always be undefined and the switcher will never render.

### 3C: Verify Visibility Logic

The component should check:
1. `session` exists (authenticated)
2. `profile.scope_level === 'vl_admin'` (NOT `=== 'platform'`)
3. `tenantId` is not null (tenant selected)
4. `tenant.settings?.demo_users?.length > 0` (demo users configured)

If any condition uses wrong field names or values, fix them.

### 3D: Add Debug Logging

Add a single console.log that traces the visibility decision:

```typescript
console.log('[DemoPersonaSwitcher]', {
  auth: !!session,
  scope: profile?.scope_level,
  tenant: tenant?.id?.substring(0, 8),
  demoUsers: tenant?.settings?.demo_users?.length ?? 0,
});
```

This lets Andrew verify in browser console on production after deploy.

**Commit:** `HF-026 Phase 3: Fix DemoPersonaSwitcher password and visibility`

---

## PHASE 4: AUTOMATED CLT

**NEW PATTERN: Every OB/HF/SD includes an automated CLT phase BEFORE the completion report.** This phase runs programmatic verification of everything that can be tested without a browser. Manual browser testing covers only what automation cannot reach.

### 4A: Create Automated Verification Script

Create `web/scripts/clt-hf026-verify.ts`:

```typescript
// Automated CLT for HF-026
// Tests everything that doesn't require a browser

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const sb = createClient(supabaseUrl, serviceKey);
const anonSb = createClient(supabaseUrl, anonKey);

let pass = 0;
let fail = 0;

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  PASS: ${name}${detail ? ' — ' + detail : ''}`);
    pass++;
  } else {
    console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`);
    fail++;
  }
}

async function run() {
  console.log('\n=== HF-026 AUTOMATED CLT ===\n');

  // --- TENANT DATA ---
  console.log('--- Tenant Data ---');
  const { data: tenants } = await sb.from('tenants').select('id,name,settings');
  const ol = tenants?.find(t => t.name === 'Optica Luminar');
  const vd = tenants?.find(t => t.name?.includes('Velocidad'));
  
  check('Optica Luminar tenant exists', !!ol);
  check('Velocidad Deportiva tenant exists', !!vd);
  check('OL has demo_users', (ol?.settings?.demo_users?.length ?? 0) >= 3, `${ol?.settings?.demo_users?.length ?? 0} users`);
  check('VD has demo_users', (vd?.settings?.demo_users?.length ?? 0) >= 3, `${vd?.settings?.demo_users?.length ?? 0} users`);

  // Check for ghost tenants
  const ghosts = tenants?.filter(t => t.name !== 'Optica Luminar' && !t.name?.includes('Velocidad')) ?? [];
  check('No ghost tenants', ghosts.length === 0, ghosts.length > 0 ? `Found: ${ghosts.map(g => g.name).join(', ')}` : 'Clean');

  // --- ENTITY COUNTS ---
  console.log('\n--- Entity Counts ---');
  if (ol) {
    const { count: olCount } = await sb.from('entities').select('*', { count: 'exact', head: true }).eq('tenant_id', ol.id);
    check('OL entities = 22', olCount === 22, `${olCount}`);
  }
  if (vd) {
    const { count: vdCount } = await sb.from('entities').select('*', { count: 'exact', head: true }).eq('tenant_id', vd.id);
    check('VD entities = 35', vdCount === 35, `${vdCount}`);
  }

  // --- VD DATA INTEGRITY ---
  if (vd) {
    console.log('\n--- VD Data Integrity ---');
    const tables = {
      rule_sets: 2, rule_set_assignments: 36, periods: 8,
      committed_data: 156, calculation_results: 108, entity_period_outcomes: 36
    };
    for (const [table, expected] of Object.entries(tables)) {
      const { count } = await sb.from(table).select('*', { count: 'exact', head: true }).eq('tenant_id', vd.id);
      check(`VD ${table} = ${expected}`, count === expected, `${count}`);
    }

    // Attendance gate
    const { data: a05 } = await sb.from('entities').select('id').eq('tenant_id', vd.id).like('external_id', '%A05%');
    if (a05?.length) {
      const { data: results } = await sb.from('calculation_results').select('total_payout').eq('entity_id', a05[0].id);
      const allZero = results?.every(r => r.total_payout === 0);
      check('A05 attendance gate (all zero)', allZero === true, `${results?.length} results`);
    }
  }

  // --- AUTH ---
  console.log('\n--- Auth ---');
  const users = [
    { email: 'platform@vialuce.com', pw: 'demo-password-VL1', label: 'Platform admin' },
    { email: 'admin@opticaluminar.mx', pw: 'demo-password-OL1', label: 'OL admin' },
    { email: 'admin@velocidaddeportiva.mx', pw: 'demo-password-VD1', label: 'VD admin' },
  ];
  for (const u of users) {
    const { data, error } = await anonSb.auth.signInWithPassword({ email: u.email, password: u.pw });
    check(`${u.label} auth`, !error, error ? error.message : 'OK');
    if (data?.session) await anonSb.auth.signOut();
  }

  // --- PLATFORM ADMIN SCOPE ---
  console.log('\n--- Platform Admin ---');
  const { data: platformProfile } = await sb.from('profiles').select('scope_level').eq('email', 'platform@vialuce.com');
  check('Platform scope = vl_admin', platformProfile?.[0]?.scope_level === 'vl_admin', platformProfile?.[0]?.scope_level);

  // --- CODE CHECKS ---
  console.log('\n--- Code Checks ---');
  const fs = require('fs');
  const path = require('path');

  // Check DemoPersonaSwitcher password
  const switcherPath = path.join(process.cwd(), 'src/components/demo/DemoPersonaSwitcher.tsx');
  if (fs.existsSync(switcherPath)) {
    const switcherCode = fs.readFileSync(switcherPath, 'utf-8');
    check('Persona switcher: correct platform password', switcherCode.includes('demo-password-VL1'), 
      switcherCode.includes('VL-platform-2024') ? 'STILL HAS OLD PASSWORD' : 'OK');
    check('Persona switcher: no hardcoded RetailCo', !switcherCode.includes('RetailCo'));
  } else {
    check('DemoPersonaSwitcher exists', false, 'File not found');
  }

  // Check for RetailCo in src/ (excluding scripts, tests, node_modules)
  const { execSync } = require('child_process');
  try {
    const retailcoHits = execSync(
      "grep -rn 'RetailCo' src/ --include='*.ts' --include='*.tsx' | grep -v '// ' | grep -v 'test' | wc -l",
      { encoding: 'utf-8' }
    ).trim();
    check('Zero RetailCo references in UI code', parseInt(retailcoHits) === 0, `${retailcoHits} occurrences`);
  } catch { check('RetailCo grep', true, 'No matches'); }

  // Check tenant context includes settings
  const ctxPath = path.join(process.cwd(), 'src/contexts/tenant-context.tsx');
  if (fs.existsSync(ctxPath)) {
    const ctxCode = fs.readFileSync(ctxPath, 'utf-8');
    check('Tenant context loads settings', ctxCode.includes('settings') || ctxCode.includes('select(\'*\''),
      'Checked for settings in select');
  }

  // Count requireTenantId guards
  try {
    const guardCount = execSync(
      "grep -rn 'requireTenantId' src/lib/ src/services/ --include='*.ts' | wc -l",
      { encoding: 'utf-8' }
    ).trim();
    check('requireTenantId guard count > 14', parseInt(guardCount) > 14, `${guardCount} guards (was 14 writes-only)`);
  } catch { check('requireTenantId count', false, 'grep failed'); }

  // --- SUMMARY ---
  console.log(`\n=== AUTOMATED CLT RESULT: ${pass}/${pass + fail} PASS ===`);
  if (fail > 0) console.log(`⚠️  ${fail} FAILURES — these need manual investigation or are HF-026 scope`);
  console.log('\n--- MANUAL BROWSER GATES (cannot automate) ---');
  console.log('  [ ] Sidebar shows dynamic tenant name (not RetailCo MX)');
  console.log('  [ ] Header breadcrumb shows dynamic tenant name');
  console.log('  [ ] Console: ZERO 400 errors on dashboard load');
  console.log('  [ ] DemoPersonaSwitcher visible at bottom for vl_admin');
  console.log('  [ ] Persona switch works (click chip → re-auth → correct role)');
  console.log('  [ ] "Back to Platform Admin" works');
  console.log('  [ ] Tenant admin login skips picker → straight to dashboard');
  console.log('  [ ] DemoPersonaSwitcher NOT visible for tenant admin');
}

run().catch(console.error);
```

### 4B: Run the Automated CLT

```bash
npx tsx scripts/clt-hf026-verify.ts 2>&1 | tee /tmp/hf026-clt-results.txt
```

**ALL automated checks must PASS before proceeding to completion report.** If any fail, go back and fix them.

### 4C: Save Results

Copy the output into the completion report (Phase 5).

**Commit:** `HF-026 Phase 4: Automated CLT verification script and results`

---

## PHASE 5: COMPLETION REPORT

Create `HF-026_COMPLETION_REPORT.md` in PROJECT ROOT **BEFORE** final build.

```markdown
# HF-026 Completion Report

## Issues Fixed
1. **Stale tenant branding:** [describe what was hardcoded and what it now reads from]
2. **Read-side 400 errors:** [N] read functions now guarded (was 14 writes-only)
3. **DemoPersonaSwitcher password:** Changed from VL-platform-2024! to demo-password-VL1
4. **DemoPersonaSwitcher visibility:** [describe fix — settings in select, scope check, etc.]
5. **Ghost tenants:** [removed/kept — list]

## Proof Gates

| # | Gate | Status | Evidence |
|---|------|--------|----------|
| 1 | Root cause(s) identified and documented | | |
| 2 | Zero "RetailCo" references in UI components | | |
| 3 | Sidebar reads tenant name from Supabase context | | |
| 4 | Header reads tenant name from Supabase context | | |
| 5 | All read-side queries have requireTenantId guard | | Count: ___ |
| 6 | Dashboard useEffects check tenantId before firing | | |
| 7 | DemoPersonaSwitcher password = demo-password-VL1 | | |
| 8 | tenant.settings loaded in tenant context select | | |
| 9 | DemoPersonaSwitcher renders for vl_admin + tenant | | |
| 10 | Ghost tenants removed or documented | | |
| 11 | npm run build: zero errors | | |
| 12 | localhost:3000 responds | | |
| 13 | Automated CLT: all checks PASS | | Score: ___/___ |

## Automated CLT Output
[paste full output from Phase 4B]

## Manual Browser Gates (for Andrew)
- [ ] Sidebar shows "Optica Luminar" (not "RetailCo MX")
- [ ] Header shows "Optica Luminar" (not "RetailCo MX")
- [ ] Console: ZERO 400 errors on dashboard
- [ ] DemoPersonaSwitcher visible (floating bar with chips)
- [ ] Persona switch: click chip → correct role
- [ ] "Back to Platform Admin" → platform@vialuce.com restored
- [ ] Tenant admin: skips picker, correct tenant name, no persona switcher
```

**Commit:** `HF-026 Phase 5: Completion report`

Then final build:

```bash
pkill -f "next dev" 2>/dev/null || true
rm -rf .next
npm run build
npm run dev &
sleep 10
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
```

Append build result to completion report.

**Push:** `git push origin dev`

```bash
gh pr create --base main --head dev \
  --title "HF-026: Fix production 400 errors, stale tenant branding, and demo persona switcher" \
  --body "Four issues from CLT-44/CLT-45 production testing:
1. Stale RetailCo MX branding → dynamic tenant names from Supabase
2. 12+ console 400 errors → read-side requireTenantId guards added
3. DemoPersonaSwitcher wrong password → corrected to demo-password-VL1
4. DemoPersonaSwitcher visibility → tenant.settings loaded in context
Includes automated CLT verification script. All automated gates pass."
```

---

## CRITICAL NOTES

- Phase 0 is DIAGNOSTIC ONLY. Do not change code until root cause is identified.
- The CLT-44 screenshot proves login works. Problems are post-login: branding, 400 errors, persona switcher.
- The password bug is CONFIRMED: line 36 of DemoPersonaSwitcher.tsx has `VL-platform-2024!` instead of `demo-password-VL1`.
- Do NOT touch seed scripts or Supabase data (except ghost tenant cleanup). This HF is about the frontend.
- The automated CLT script (`clt-hf026-verify.ts`) becomes a reusable pattern. Future OB/HF/SD prompts will include a similar automated verification phase.
- After Andrew merges the PR, he runs the manual browser gates listed in the completion report. Those are the 20% that require human eyes.
