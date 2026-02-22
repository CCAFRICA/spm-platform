# HF-056: TENANT USER PASSWORD RESET + UAT RE-VERIFICATION

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". Execute all phases sequentially. This is a 10-minute hotfix.**

---

## THE PROBLEM

UAT-01 found that only `platform@vialuce.com` can authenticate. All 6 tenant persona users fail login with "Invalid login credentials." This blocks all role-specific testing and CLT-67.

```
platform@vialuce.com              OK
admin@opticaluminar.mx            FAIL: Invalid login credentials
gerente@opticaluminar.mx          FAIL: Invalid login credentials
vendedor@opticaluminar.mx         FAIL: Invalid login credentials
admin@velocidaddeportiva.mx       FAIL: Invalid login credentials
gerente@velocidaddeportiva.mx     FAIL: Invalid login credentials
asociado@velocidaddeportiva.mx    FAIL: Invalid login credentials
```

## STANDING RULES

- Run git commands from repo root: `cd /Users/AndrewAfrica/spm-platform && git add ...`
- After every commit: `git push origin dev`
- Final step: PR creation

---

## PHASE 1: RESET ALL TENANT USER PASSWORDS

Reset all 6 tenant persona users to `demo-password-VL1` (same as platform admin). Use the Supabase admin API with the service role key.

```bash
cd /Users/AndrewAfrica/spm-platform/web
export $(grep -v '^#' .env.local | xargs)

node -e '
const { createClient } = require("@supabase/supabase-js");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const emails = [
  "admin@opticaluminar.mx",
  "gerente@opticaluminar.mx",
  "vendedor@opticaluminar.mx",
  "admin@velocidaddeportiva.mx",
  "gerente@velocidaddeportiva.mx",
  "asociado@velocidaddeportiva.mx"
];
(async () => {
  const { data: list } = await sb.auth.admin.listUsers();
  for (const email of emails) {
    const user = list.users.find(u => u.email === email);
    if (!user) { console.log(email.padEnd(40), "NOT FOUND in auth.users"); continue; }
    const { error } = await sb.auth.admin.updateUserById(user.id, { password: "demo-password-VL1" });
    console.log(email.padEnd(40), error ? "FAIL: " + error.message : "RESET OK");
  }
})();
'
```

**PASTE the full output.** All 6 must show "RESET OK".

---

## PHASE 2: VERIFY ALL LOGINS

Immediately verify every user can now authenticate:

```bash
node -e '
const { createClient } = require("@supabase/supabase-js");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const users = [
  "platform@vialuce.com",
  "admin@opticaluminar.mx",
  "gerente@opticaluminar.mx",
  "vendedor@opticaluminar.mx",
  "admin@velocidaddeportiva.mx",
  "gerente@velocidaddeportiva.mx",
  "asociado@velocidaddeportiva.mx"
];
(async () => {
  console.log("=== AUTH VERIFICATION ===");
  let pass = 0, fail = 0;
  for (const email of users) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password: "demo-password-VL1" });
    const ok = !error && data?.session;
    console.log(email.padEnd(40), ok ? "OK" : "FAIL: " + (error?.message || "no session"));
    if (ok) { pass++; await sb.auth.signOut(); } else { fail++; }
  }
  console.log("\nResult:", pass, "PASS,", fail, "FAIL");
  if (fail === 0) console.log("ALL USERS AUTHENTICATED SUCCESSFULLY");
})();
'
```

**PASTE the full output.** Expected: 7 PASS, 0 FAIL.

---

## PHASE 3: VERIFY PROFILE-TO-AUTH MAPPING

Each auth user must map to a profile with the correct tenant and role:

```bash
node -e '
const { createClient } = require("@supabase/supabase-js");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data: profiles } = await sb.from("profiles").select("email, role, display_name, tenant_id");
  const { data: tenants } = await sb.from("tenants").select("id, name");
  const tenantMap = {};
  tenants?.forEach(t => tenantMap[t.id] = t.name);
  
  console.log("=== PROFILE → TENANT → ROLE MAPPING ===");
  console.log("Email".padEnd(40), "Role".padEnd(15), "Tenant");
  console.log("-".repeat(80));
  profiles?.forEach(p => {
    console.log(
      (p.email || "no-email").padEnd(40),
      (p.role || "no-role").padEnd(15),
      tenantMap[p.tenant_id] || p.tenant_id || "no-tenant"
    );
  });
})();
'
```

**PASTE the full output.** Verify each persona maps to the correct tenant.

---

## PHASE 4: VERIFY DEMO PERSONA SWITCHER CREDENTIALS

The DemoPersonaSwitcher component uses tenant settings to store demo user passwords. Verify they match:

```bash
node -e '
const { createClient } = require("@supabase/supabase-js");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data: tenants } = await sb.from("tenants").select("name, settings");
  console.log("=== DEMO PERSONA SWITCHER SETTINGS ===");
  tenants?.forEach(t => {
    const demoUsers = t.settings?.demo_users;
    if (demoUsers) {
      console.log("\n" + t.name + ":");
      demoUsers.forEach(u => console.log("  " + u.email?.padEnd(35), "password:", u.password));
    } else {
      console.log("\n" + t.name + ": NO demo_users in settings");
    }
  });
})();
'
```

**PASTE the output.** If passwords in tenant settings don't match `demo-password-VL1`, update them:

```bash
node -e '
const { createClient } = require("@supabase/supabase-js");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data: tenants } = await sb.from("tenants").select("id, name, settings");
  for (const t of tenants || []) {
    const demoUsers = t.settings?.demo_users;
    if (!demoUsers) continue;
    let changed = false;
    const updated = demoUsers.map(u => {
      if (u.password !== "demo-password-VL1") {
        changed = true;
        return { ...u, password: "demo-password-VL1" };
      }
      return u;
    });
    if (changed) {
      const newSettings = { ...t.settings, demo_users: updated };
      const { error } = await sb.from("tenants").update({ settings: newSettings }).eq("id", t.id);
      console.log(t.name.padEnd(25), error ? "FAIL: " + error.message : "UPDATED");
    } else {
      console.log(t.name.padEnd(25), "OK (passwords match)");
    }
  }
})();
'
```

**PASTE the output.**

---

## PHASE 5: FIX API 401 RESPONSES (UAT Finding F-08)

The middleware returns 307 redirect for unauthenticated API requests. API clients expect JSON 401. Fix the middleware to return proper JSON errors for `/api/*` paths.

Find the middleware redirect logic and add an API exception:

```bash
grep -n "redirect.*login\|NextResponse.redirect" web/src/middleware.ts | head -10
```

Add this BEFORE the redirect:

```typescript
// API routes should return 401 JSON, not redirect
if (pathname.startsWith('/api/')) {
  return NextResponse.json(
    { error: 'Unauthorized', message: 'Authentication required' },
    { status: 401 }
  );
}
```

**IMPORTANT:** Do NOT apply this to API routes in PUBLIC_PATHS (like `/api/calculation/run`). Only apply to routes that fail the auth check.

After fix, verify:

```bash
curl -s -w "\nHTTP %{http_code}" http://localhost:3000/api/disputes 2>&1 | tail -3
# Expected: {"error":"Unauthorized"...} HTTP 401 (not 307)

curl -s -w "\nHTTP %{http_code}" http://localhost:3000/api/calculation/run -X POST \
  -H "Content-Type: application/json" -d '{}' 2>&1 | tail -3
# Expected: {"error":"Missing required fields..."} HTTP 400 (still works, public path)
```

**PASTE both outputs.**

---

## PHASE 6: RE-RUN UAT AUTH TESTS

Now that passwords are reset and API auth is fixed, re-run the critical UAT tests:

```bash
echo "=== UAT RE-VERIFICATION ==="

echo ""
echo "--- Test 1: All users authenticate ---"
node -e '
const { createClient } = require("@supabase/supabase-js");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const users = [
  "platform@vialuce.com",
  "admin@opticaluminar.mx",
  "gerente@opticaluminar.mx",
  "vendedor@opticaluminar.mx",
  "admin@velocidaddeportiva.mx",
  "gerente@velocidaddeportiva.mx",
  "asociado@velocidaddeportiva.mx"
];
(async () => {
  let pass = 0;
  for (const email of users) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password: "demo-password-VL1" });
    const ok = !error && data?.session;
    console.log(email.padEnd(40), ok ? "PASS" : "FAIL: " + (error?.message || "no session"));
    if (ok) { pass++; await sb.auth.signOut(); }
  }
  console.log("\n" + pass + "/7 authenticated");
})();
'

echo ""
echo "--- Test 2: API returns 401 not 307 ---"
curl -s -w "\nHTTP %{http_code}" http://localhost:3000/api/disputes 2>&1 | tail -3
curl -s -w "\nHTTP %{http_code}" http://localhost:3000/api/signals?tenant_id=test 2>&1 | tail -3

echo ""
echo "--- Test 3: Public API still works ---"
curl -s -w "\nHTTP %{http_code}" http://localhost:3000/api/calculation/run -X POST \
  -H "Content-Type: application/json" -d '{}' 2>&1 | tail -3

echo ""
echo "--- Test 4: Login page renders ---"
curl -s -o /dev/null -w "HTTP %{http_code}" http://localhost:3000/login

echo ""
echo "--- Test 5: Build clean ---"
cd /Users/AndrewAfrica/spm-platform/web
npm run build 2>&1 | tail -5
```

**PASTE the complete output.**

---

## PHASE 7: COMPLETION

Create `HF-056_COMPLETION_REPORT.md` at project root:

```markdown
# HF-056: Tenant User Password Reset + API Auth Fix

## What Was Fixed
1. Reset passwords for 6 tenant persona users to demo-password-VL1
2. Updated DemoPersonaSwitcher tenant settings to match
3. Middleware returns 401 JSON for unauthenticated API requests (not 307 redirect)

## UAT Re-Verification
[PASTE Phase 6 results here]

## Findings Resolved
- F-06 (BLOCKING): All 7 users now authenticate ✅
- F-08 (MEDIUM): API routes return 401 JSON ✅

## Files Modified
[list files]
```

### Commit and PR

```bash
cd /Users/AndrewAfrica/spm-platform
git add -A
git commit -m "HF-056: Tenant user password reset + API 401 fix — UAT F-06 and F-08 resolved"
git push origin dev
gh pr create --base main --head dev \
  --title "HF-056: Tenant User Auth Fix + API 401 Responses" \
  --body "Resolves UAT-01 blocking finding F-06 (tenant users cannot authenticate) and F-08 (API returns 307 instead of 401). All 7 demo users now authenticate. API routes return proper JSON 401 for unauthenticated requests."
```

---

*HF-056 — February 21, 2026*
*"If users can't log in, nothing else matters."*
