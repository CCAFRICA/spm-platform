# UAT-01: COMPLETE USER ACCEPTANCE TEST

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Execute every section sequentially. This is a TEST, not a BUILD. Do not modify any code unless a test reveals a blocking defect that requires a hotfix.**

---

## READ FIRST: WHAT THIS IS

This is a **User Acceptance Test**. You are testing the platform, not building it. Your job is to:

1. Start the dev server
2. Hit every page and API endpoint
3. Document EXACTLY what you see
4. Report PASS or FAIL with PASTED EVIDENCE

**RULES:**
- **"Lines 282-361" is NOT evidence.** Paste what the page returns.
- **"Code: signInWithEmail → fetchCurrentProfile" is NOT evidence.** Paste what actually happens.
- **"PASS — component exists" is NOT evidence.** Paste whether it RENDERS.
- Every test result must include ONE OF: curl output, HTTP status code, rendered HTML snippet, console output, SQL query result, or error message.
- If you cannot verify something because it requires a real browser, say "CANNOT VERIFY — requires browser" and explain why. Do NOT claim PASS.
- If a test FAILS, document the failure and continue. Do not stop. Do not fix. Document everything, then summarize failures at the end.

---

## PHASE 1: ENVIRONMENT SETUP

### 1A: Start clean

```bash
cd /Users/AndrewAfrica/spm-platform/web
pkill -f "next dev" 2>/dev/null || true
rm -rf .next
npm run build 2>&1 | tail -20
```

**PASTE the build output.** Document: exit code, any errors, any warnings.

### 1B: Start dev server

```bash
npm run dev &
sleep 15
curl -s -o /dev/null -w "HTTP %{http_code}" http://localhost:3000/
```

**PASTE the curl output.** Expected: HTTP 307 (redirect to login).

### 1C: Verify environment variables

```bash
echo "SUPABASE_URL: $(echo $NEXT_PUBLIC_SUPABASE_URL | head -c 30)..."
echo "SUPABASE_ANON_KEY: $(echo $NEXT_PUBLIC_SUPABASE_ANON_KEY | head -c 20)..."
echo "SUPABASE_SERVICE_ROLE_KEY: $([ -n "$SUPABASE_SERVICE_ROLE_KEY" ] && echo 'SET' || echo 'MISSING')"
echo "ANTHROPIC_API_KEY: $([ -n "$ANTHROPIC_API_KEY" ] && echo 'SET' || echo 'MISSING')"
```

**PASTE the output.**

---

## PHASE 2: DATABASE TRUTH

Query the live Supabase database to establish what data actually exists. This is the ground truth that all UI tests compare against.

### 2A: Tenant inventory

```bash
cd /Users/AndrewAfrica/spm-platform/web
npx tsx -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data: tenants } = await sb.from('tenants').select('id, name, slug, settings');
  console.log('=== TENANTS ===');
  tenants?.forEach(t => console.log(t.id, '|', t.name, '|', t.slug));
  console.log('Total:', tenants?.length);
})();
"
```

**PASTE the output.** Record tenant IDs for later queries.

### 2B: Data inventory per tenant

For EACH tenant found in 2A, run:

```bash
npx tsx -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const TENANT_ID = '<PASTE_TENANT_ID_HERE>';
(async () => {
  const counts = {};
  for (const table of ['entities', 'periods', 'rule_sets', 'rule_set_assignments', 
                         'committed_data', 'calculation_batches', 'calculation_results', 
                         'entity_period_outcomes', 'disputes', 'approval_requests',
                         'classification_signals', 'audit_logs']) {
    const { count } = await sb.from(table).select('*', { count: 'exact', head: true }).eq('tenant_id', TENANT_ID);
    counts[table] = count;
  }
  console.log('=== DATA INVENTORY FOR', TENANT_ID, '===');
  Object.entries(counts).forEach(([k,v]) => console.log(k.padEnd(25), v));
})();
"
```

**PASTE the output for each tenant.** This tells us what the UI should show.

### 2C: Profile inventory

```bash
npx tsx -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data } = await sb.from('profiles').select('id, email, role, display_name, tenant_id');
  console.log('=== PROFILES ===');
  data?.forEach(p => console.log(p.email?.padEnd(35), p.role?.padEnd(15), p.display_name));
  console.log('Total:', data?.length);
})();
"
```

**PASTE the output.**

### 2D: Authentication test

```bash
npx tsx -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const users = [
  { email: 'platform@vialuce.com', pw: 'demo-password-VL1' },
  { email: 'admin@opticaluminar.com', pw: 'demo-password-VL1' },
  { email: 'gerente@opticaluminar.com', pw: 'demo-password-VL1' },
  { email: 'vendedor@opticaluminar.com', pw: 'demo-password-VL1' },
];
(async () => {
  for (const u of users) {
    const { data, error } = await sb.auth.signInWithPassword({ email: u.email, password: u.pw });
    console.log(u.email.padEnd(35), error ? 'FAIL: ' + error.message : 'OK — session: ' + !!data?.session);
    if (data?.session) await sb.auth.signOut();
  }
})();
"
```

**PASTE the output.** If any login fails, try alternate email formats (.mx, .com).

---

## PHASE 3: API ENDPOINT TESTING

Test every API route that the platform depends on. Use curl with the Supabase anon key for unauthenticated tests and service role key for authenticated tests.

### 3A: Auth endpoints

```bash
# Unauthenticated root → should redirect
curl -s -o /dev/null -w "HTTP %{http_code}, Location: %{redirect_url}\n" http://localhost:3000/

# Login page → should return 200
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3000/login

# Protected page without auth → should redirect to login
curl -s -o /dev/null -w "HTTP %{http_code}, Location: %{redirect_url}\n" http://localhost:3000/operate

# API without auth → should return 401 or redirect
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3000/api/disputes
```

**PASTE all 4 outputs.**

### 3B: Calculation API

```bash
# Test calculation run endpoint (without triggering — just check if route exists)
curl -s -w "\nHTTP %{http_code}" http://localhost:3000/api/calculation/run -X POST \
  -H "Content-Type: application/json" \
  -d '{}' 2>&1 | tail -5
```

**PASTE output.** Expected: 400 or 401 (missing params/auth), NOT 404.

### 3C: Disputes API

```bash
curl -s -w "\nHTTP %{http_code}" http://localhost:3000/api/disputes 2>&1 | tail -5
```

**PASTE output.**

### 3D: Signals API

```bash
curl -s -w "\nHTTP %{http_code}" "http://localhost:3000/api/signals?tenant_id=test" 2>&1 | tail -5
```

**PASTE output.** Expected: 200 with empty signals or 401.

### 3E: Assessment API

```bash
curl -s -w "\nHTTP %{http_code}" http://localhost:3000/api/ai/assessment -X POST \
  -H "Content-Type: application/json" \
  -d '{"persona":"admin","locale":"en"}' 2>&1 | tail -5
```

**PASTE output.**

---

## PHASE 4: PAGE RENDERING TESTS

For each page, curl the URL and check:
1. Does it return 200?
2. Does the HTML contain expected content markers?
3. Or does it redirect / error?

### 4A: Core pages

```bash
echo "=== PAGE RENDERING TEST ==="
for path in \
  "/login" \
  "/operate" \
  "/operate/results" \
  "/perform" \
  "/configure/people" \
  "/configure/users" \
  "/transactions/disputes" \
  "/transactions/approvals" \
  "/my-compensation" \
  "/investigate" \
  "/investigate/trace" \
  "/govern" \
  "/data/import/enhanced"; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000$path")
  echo "$path → HTTP $STATUS"
done
```

**PASTE the full output.** Any 404s or 500s are failures.

### 4B: Content verification on key pages

For pages that return 200 (or 307 for auth-gated pages), check if they contain expected markers:

```bash
# Login page should have a login form
curl -s http://localhost:3000/login | grep -oi "sign in\|log in\|email\|password" | head -5

# Operate page (will redirect if not authed, that's OK)
curl -s -L http://localhost:3000/operate 2>/dev/null | grep -oi "lifecycle\|period\|calculation\|operate" | head -5
```

**PASTE outputs.**

---

## PHASE 5: DATA INTEGRITY TESTS

### 5A: Calculation results structure

```bash
npx tsx -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data } = await sb.from('calculation_results')
    .select('id, entity_id, total_payout, components, metrics, attainment')
    .limit(2);
  if (!data?.length) { console.log('NO CALCULATION RESULTS EXIST'); return; }
  console.log('=== SAMPLE CALCULATION RESULT ===');
  console.log('entity_id:', data[0].entity_id);
  console.log('total_payout:', data[0].total_payout);
  console.log('components type:', typeof data[0].components, Array.isArray(data[0].components) ? 'array' : '');
  console.log('components sample:', JSON.stringify(data[0].components)?.substring(0, 300));
  console.log('metrics sample:', JSON.stringify(data[0].metrics)?.substring(0, 300));
  console.log('attainment sample:', JSON.stringify(data[0].attainment)?.substring(0, 300));
})();
"
```

**PASTE output.** This reveals whether Five Layers has data to render.

### 5B: Entity period outcomes

```bash
npx tsx -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data } = await sb.from('entity_period_outcomes')
    .select('entity_id, total_payout, component_breakdown, attainment_summary')
    .limit(2);
  if (!data?.length) { console.log('NO ENTITY PERIOD OUTCOMES EXIST'); return; }
  console.log('=== SAMPLE ENTITY PERIOD OUTCOME ===');
  console.log('entity_id:', data[0].entity_id);
  console.log('total_payout:', data[0].total_payout);
  console.log('component_breakdown:', JSON.stringify(data[0].component_breakdown)?.substring(0, 300));
  console.log('attainment_summary:', JSON.stringify(data[0].attainment_summary)?.substring(0, 300));
})();
"
```

**PASTE output.**

### 5C: Classification signals (HF-055 verification)

```bash
npx tsx -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { count } = await sb.from('classification_signals').select('*', { count: 'exact', head: true });
  console.log('Total classification_signals:', count);
  if (count > 0) {
    const { data } = await sb.from('classification_signals')
      .select('signal_type, source, confidence')
      .limit(5)
      .order('created_at', { ascending: false });
    console.log('Recent signals:');
    data?.forEach(s => console.log(' ', s.signal_type, '|', s.source, '| confidence:', s.confidence));
  }
})();
"
```

**PASTE output.** Expected: signals exist if any AI operations have been performed.

### 5D: Audit logs (OB-72 verification)

```bash
npx tsx -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { count } = await sb.from('audit_logs').select('*', { count: 'exact', head: true });
  console.log('Total audit_logs:', count);
  if (count > 0) {
    const { data } = await sb.from('audit_logs')
      .select('action, resource_type, created_at')
      .limit(5)
      .order('created_at', { ascending: false });
    console.log('Recent audit entries:');
    data?.forEach(a => console.log(' ', a.action, '|', a.resource_type, '|', a.created_at));
  }
})();
"
```

**PASTE output.**

### 5E: Disputes (OB-68 verification)

```bash
npx tsx -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { count } = await sb.from('disputes').select('*', { count: 'exact', head: true });
  console.log('Total disputes:', count);
  if (count > 0) {
    const { data } = await sb.from('disputes')
      .select('id, category, status, created_at')
      .limit(5)
      .order('created_at', { ascending: false });
    console.log('Recent disputes:');
    data?.forEach(d => console.log(' ', d.id?.substring(0,8), d.category, '|', d.status, '|', d.created_at));
  }
})();
"
```

**PASTE output.**

---

## PHASE 6: FIVE LAYERS OF PROOF VERIFICATION

This is the OB-72 centerpiece. Verify the proof view actually works.

### 6A: Does the proof view page exist and return 200?

```bash
curl -s -o /dev/null -w "HTTP %{http_code}" http://localhost:3000/operate/results
```

**PASTE output.**

### 6B: Does the proof view have data access?

```bash
# Check if there are any calculation_results to display
npx tsx -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data, count } = await sb.from('calculation_results')
    .select('*', { count: 'exact', head: true });
  console.log('Total calculation_results across all tenants:', count);
  
  const { data: batches } = await sb.from('calculation_batches')
    .select('id, tenant_id, lifecycle_state, entity_count, period_id')
    .limit(5);
  console.log('Calculation batches:');
  batches?.forEach(b => console.log(' ', b.id?.substring(0,8), '|', b.lifecycle_state, '|', b.entity_count, 'entities'));
})();
"
```

**PASTE output.** If zero results, Five Layers has nothing to show — this is a critical finding.

### 6C: Verify the JSONB structure matches what the proof view expects

```bash
npx tsx -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data } = await sb.from('calculation_results')
    .select('components')
    .not('components', 'is', null)
    .limit(1);
  if (!data?.length) { console.log('NO results with non-null components'); return; }
  const c = data[0].components;
  console.log('Components is:', Array.isArray(c) ? 'array of ' + c.length : typeof c);
  if (Array.isArray(c) && c.length > 0) {
    console.log('First component keys:', Object.keys(c[0]).join(', '));
    console.log('First component:', JSON.stringify(c[0], null, 2).substring(0, 500));
  } else {
    console.log('Components value:', JSON.stringify(c).substring(0, 500));
  }
})();
"
```

**PASTE output.** The proof view code must parse whatever structure this returns.

---

## PHASE 7: KOREAN TEST VERIFICATION

### 7A: Verify FIELD_ID_MAPPINGS is gone

```bash
cd /Users/AndrewAfrica/spm-platform
grep -rn "FIELD_ID_MAPPINGS" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v "// " | grep -v "REMOVED\|removed\|deleted"
```

**PASTE output.** Expected: ZERO matches (or only comments).

### 7B: Verify COMPOUND_PATTERNS is gone

```bash
grep -rn "COMPOUND_PATTERNS" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v "// "
```

**PASTE output.** Expected: ZERO matches.

### 7C: Check for remaining hardcoded Spanish field names in lib/

```bash
grep -rn "'año'\|'ano'\|'anio'\|'mes'\|'fecha'\|'periodo'\|'num_empleado'\|'Vendedor'\|'No_Tienda'" \
  web/src/lib/ --include="*.ts" | grep -v node_modules | grep -v "// \|/\*"
```

**PASTE output.** Document what remains and whether it's in logic paths or data-service parsing.

---

## PHASE 8: FEATURE INVENTORY

For each feature built in OB-67 through OB-72, verify existence and basic function:

### 8A: OB-67 — Role Guards

```bash
# Check middleware has role-based checks
grep -c "role\|workspace\|RequireRole\|checkAccess" web/src/middleware.ts
```

### 8B: OB-68 — Dispute Persistence

```bash
# API routes exist
ls -la web/src/app/api/disputes/route.ts web/src/app/api/disputes/\[id\]/route.ts 2>&1
# Approval routes exist
ls -la web/src/app/api/approvals/route.ts web/src/app/api/approvals/\[id\]/route.ts 2>&1
```

### 8C: OB-69 — Pipeline E2E

```bash
# Calculation run API exists
ls -la web/src/app/api/calculation/run/route.ts 2>&1
# Period detection
grep -c "detectPeriod\|period.*detect" web/src/lib/ -r --include="*.ts"
```

### 8D: OB-70 — Calculation Trigger + Entity Visibility

```bash
# Entity roster page
ls -la web/src/app/configure/people/page.tsx 2>&1
# Run Preview wiring
grep -c "Run Preview\|handleAdvance\|calculation/run" web/src/app/operate/page.tsx
```

### 8E: HF-055 — Signal Persistence

```bash
# Signal persistence service
ls -la web/src/lib/ai/signal-persistence.ts 2>&1
# Signals API
ls -la web/src/app/api/signals/route.ts 2>&1
```

### 8F: OB-71 — AI Assessment

```bash
# Assessment through AIService
grep -c "getAIService\|AIService\|generateAssessment" web/src/app/api/ai/assessment/route.ts
# Anomaly detection utility
ls -la web/src/lib/intelligence/anomaly-detection.ts 2>&1
# AssessmentPanel usage
grep -c "AssessmentPanel" web/src/app/operate/page.tsx
```

### 8G: OB-72 — Five Layers + Korean Test + Audit

```bash
# Proof view
ls -la web/src/app/operate/results/page.tsx 2>&1
wc -l web/src/app/operate/results/page.tsx
# Audit logger
ls -la web/src/lib/audit/audit-logger.ts 2>&1
# FIELD_ID_MAPPINGS count (should be 0)
grep -c "FIELD_ID_MAPPINGS" web/src/app/data/import/enhanced/page.tsx
```

**PASTE ALL outputs from 8A through 8G.**

---

## PHASE 9: SUMMARY REPORT

After completing all phases, create `UAT-01_RESULTS.md` at the project root with:

### Section 1: Environment
- Build status (PASS/FAIL)
- Dev server status (PASS/FAIL)
- Environment variables (SET/MISSING)

### Section 2: Database Truth
Table with every tenant × every table count.

### Section 3: Authentication
Table with every user email → PASS/FAIL login.

### Section 4: API Endpoints
Table with every endpoint → HTTP status → PASS/FAIL.

### Section 5: Page Rendering
Table with every page path → HTTP status → PASS/FAIL.

### Section 6: Data Integrity
- calculation_results: exist? JSONB structure documented?
- classification_signals: count
- audit_logs: count
- disputes: count

### Section 7: Five Layers of Proof
- Page exists: YES/NO
- Data available: YES/NO
- JSONB structure matches code: YES/NO
- If NO data: "Five Layers page exists but has no data to render — calculation_results table is empty"

### Section 8: Korean Test
- FIELD_ID_MAPPINGS: REMOVED/REMAINING
- COMPOUND_PATTERNS: REMOVED/REMAINING
- Hardcoded Spanish in lib/: count and file locations

### Section 9: Feature Inventory (OB-67 through OB-72)
Table with each OB → key deliverable → EXISTS/MISSING.

### Section 10: CRITICAL FINDINGS
List every FAIL result grouped by severity:
- **BLOCKING**: Prevents platform from functioning (auth broken, build fails, DB empty)
- **DEGRADED**: Feature exists but doesn't work as expected
- **COSMETIC**: Works but with minor issues

### Section 11: RECOMMENDATION
Based on findings, state whether the platform is ready for CLT-67 or what must be fixed first.

---

**Commit:** `UAT-01: Complete User Acceptance Test results`
**Push:** `git push origin dev`

---

## CRITICAL REMINDERS

1. **DO NOT FIX BUGS DURING THIS TEST.** Document them. Fixing mid-test invalidates results.
2. **PASTE REAL OUTPUT for every test.** If a test cannot be run, say WHY.
3. **If the database has no calculation_results, that is a finding, not a failure of this test.** Document it.
4. **If authentication fails for demo users, try both .com and .mx email suffixes.**
5. **Run git commands from repo root:** `cd /Users/AndrewAfrica/spm-platform && git add ...`

*UAT-01 — February 21, 2026*
*"Trust, but verify. Then paste the verification."*
