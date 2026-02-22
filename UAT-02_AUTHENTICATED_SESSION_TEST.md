# UAT-02: AUTHENTICATED SESSION ACCEPTANCE TEST

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". Execute every phase sequentially. This is a TEST, not a BUILD. Do not modify any code unless explicitly instructed in the HOTFIX EXCEPTIONS section at the end.**

---

## WHAT THIS IS

UAT-01 verified environment, database, API routes, and feature inventory. 16 items could not be verified because they required authenticated browser sessions. HF-056 fixed the blocking auth issue — all 7 users now authenticate.

This UAT logs in as each persona and tests what they actually see.

**RULES:**
- **PASTE real output for every test.** curl responses, HTML snippets, JSON payloads, SQL results.
- **"PASS — component exists" is NOT evidence.** You must show what the endpoint or page RETURNS.
- **If a test FAILS, document it and continue.** Do not stop. Do not fix. Complete all tests first.
- **If something requires visual browser rendering you cannot perform, say "REQUIRES BROWSER" and test everything you CAN verify** (API response, data availability, redirects, HTML content markers).

---

## PHASE 1: ENVIRONMENT VERIFY

Confirm HF-056 is deployed and everything still works.

```bash
cd /Users/AndrewAfrica/spm-platform/web
export $(grep -v '^#' .env.local | xargs)

echo "=== BUILD CHECK ==="
npm run build 2>&1 | tail -3

echo ""
echo "=== DEV SERVER ==="
pkill -f "next dev" 2>/dev/null || true
rm -rf .next
npm run dev &
sleep 15
curl -s -o /dev/null -w "HTTP %{http_code}" http://localhost:3000/
curl -s -o /dev/null -w " | login: HTTP %{http_code}" http://localhost:3000/login
echo ""

echo ""
echo "=== QUICK AUTH CHECK ==="
node -e '
const { createClient } = require("@supabase/supabase-js");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
(async () => {
  for (const email of ["platform@vialuce.com","admin@opticaluminar.mx","vendedor@opticaluminar.mx"]) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password: "demo-password-VL1" });
    console.log(email.padEnd(35), error ? "FAIL" : "OK");
    if (data?.session) await sb.auth.signOut();
  }
})();
'
```

**PASTE the complete output.** All must pass before proceeding.

---

## PHASE 2: AUTHENTICATED API TESTING

UAT-01 tested APIs unauthenticated (got 307/401). Now test with real sessions.

### 2A: Get an authenticated session token

```bash
node -e '
const { createClient } = require("@supabase/supabase-js");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
(async () => {
  const { data, error } = await sb.auth.signInWithPassword({ 
    email: "platform@vialuce.com", password: "demo-password-VL1" 
  });
  if (error) { console.log("AUTH FAILED:", error.message); return; }
  console.log("ACCESS_TOKEN=" + data.session.access_token.substring(0, 50) + "...");
  console.log("Full token length:", data.session.access_token.length);
  
  // Write token to temp file for use in curl commands
  const fs = require("fs");
  fs.writeFileSync("/tmp/vl_token.txt", data.session.access_token);
  console.log("Token written to /tmp/vl_token.txt");
})();
'
```

**PASTE output.** Then set the token for curl:

```bash
export VL_TOKEN=$(cat /tmp/vl_token.txt)
```

### 2B: Authenticated API — Disputes

```bash
echo "=== GET /api/disputes (authenticated) ==="
curl -s -w "\nHTTP %{http_code}" http://localhost:3000/api/disputes \
  -H "Authorization: Bearer $VL_TOKEN" \
  -H "Cookie: sb-bayqxeiltnpjrvflksfa-auth-token=$VL_TOKEN" 2>&1 | tail -10
```

**PASTE output.** Expected: 200 with disputes array (possibly empty).

### 2C: Authenticated API — Signals

```bash
echo "=== GET /api/signals (authenticated) ==="
curl -s -w "\nHTTP %{http_code}" "http://localhost:3000/api/signals?tenant_id=a1b2c3d4-e5f6-7890-abcd-ef1234567890" \
  -H "Authorization: Bearer $VL_TOKEN" \
  -H "Cookie: sb-bayqxeiltnpjrvflksfa-auth-token=$VL_TOKEN" 2>&1 | tail -10
```

**PASTE output.**

### 2D: Authenticated API — Assessment

```bash
echo "=== POST /api/ai/assessment (authenticated) ==="
curl -s -w "\nHTTP %{http_code}" http://localhost:3000/api/ai/assessment \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $VL_TOKEN" \
  -H "Cookie: sb-bayqxeiltnpjrvflksfa-auth-token=$VL_TOKEN" \
  -d '{"persona":"admin","locale":"en","tenantId":"b2c3d4e5-f6a7-8901-bcde-f12345678901"}' 2>&1 | tail -15
```

**PASTE output.** Expected: 200 with AI assessment text (or error if missing ANTHROPIC_API_KEY context).

### 2E: Authenticated API — Calculation Results

```bash
echo "=== Calculation results via Supabase direct ==="
node -e '
const { createClient } = require("@supabase/supabase-js");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
(async () => {
  const { data: auth } = await sb.auth.signInWithPassword({ 
    email: "admin@opticaluminar.mx", password: "demo-password-VL1" 
  });
  if (!auth?.session) { console.log("AUTH FAILED"); return; }
  
  const { data: results, error } = await sb.from("calculation_results")
    .select("id, entity_id, total_payout, batch_id")
    .limit(5);
  
  console.log("=== Optica Luminar admin sees ===");
  console.log("Error:", error?.message || "none");
  console.log("Results:", results?.length || 0, "rows");
  results?.forEach(r => console.log("  entity:", r.entity_id?.substring(0,8), "payout:", r.total_payout));
  
  await sb.auth.signOut();
})();
'
```

**PASTE output.** This tests RLS — admin@opticaluminar.mx should only see Optica Luminar data.

---

## PHASE 3: PERSONA-SPECIFIC PAGE TESTING

For each persona, authenticate and test what they can access. Since CC cannot render a full browser, we test via:
1. Getting an auth cookie/token
2. Curling pages with that auth
3. Checking if the HTML response contains expected content markers

### 3A: Platform Admin (platform@vialuce.com)

```bash
echo "============================================"
echo "PERSONA: Platform Admin (platform@vialuce.com)"
echo "============================================"

node -e '
const { createClient } = require("@supabase/supabase-js");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
(async () => {
  const { data } = await sb.auth.signInWithPassword({ 
    email: "platform@vialuce.com", password: "demo-password-VL1" 
  });
  const token = data?.session?.access_token;
  if (!token) { console.log("AUTH FAILED"); return; }
  
  // Test what this user sees in profiles
  const { data: profile } = await sb.from("profiles")
    .select("role, display_name, tenant_id")
    .eq("email", "platform@vialuce.com")
    .maybeSingle();
  console.log("Profile:", JSON.stringify(profile));
  
  // Test tenant visibility
  const { data: tenants } = await sb.from("tenants").select("id, name");
  console.log("Tenants visible:", tenants?.length);
  tenants?.forEach(t => console.log("  ", t.name));
  
  // Test entity visibility (platform admin should see all or need tenant context)
  const { data: entities, error: entErr } = await sb.from("entities")
    .select("id", { count: "exact", head: true });
  console.log("Entities visible:", entities, "error:", entErr?.message || "none");
  
  await sb.auth.signOut();
})();
'
```

**PASTE output.**

### 3B: Tenant Admin (admin@opticaluminar.mx)

```bash
echo "============================================"
echo "PERSONA: Tenant Admin (admin@opticaluminar.mx)"
echo "============================================"

node -e '
const { createClient } = require("@supabase/supabase-js");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
(async () => {
  const { data } = await sb.auth.signInWithPassword({ 
    email: "admin@opticaluminar.mx", password: "demo-password-VL1" 
  });
  if (!data?.session) { console.log("AUTH FAILED"); return; }
  
  // Profile
  const { data: profile } = await sb.from("profiles")
    .select("role, display_name, tenant_id")
    .eq("email", "admin@opticaluminar.mx")
    .maybeSingle();
  console.log("Profile:", JSON.stringify(profile));
  
  // Should see ONLY Optica Luminar entities
  const { count: entityCount } = await sb.from("entities")
    .select("*", { count: "exact", head: true });
  console.log("Entities visible:", entityCount);
  
  // Should see ONLY Optica Luminar calculation results  
  const { data: results } = await sb.from("calculation_results")
    .select("entity_id, total_payout")
    .limit(5);
  console.log("Calc results:", results?.length, "rows (first 5)");
  results?.forEach(r => console.log("  entity:", r.entity_id?.substring(0,8), "payout:", r.total_payout));
  
  // Should see periods
  const { data: periods } = await sb.from("periods").select("label, status");
  console.log("Periods:", periods?.length);
  periods?.forEach(p => console.log("  ", p.label, p.status));
  
  // Should see rule sets
  const { data: rules } = await sb.from("rule_sets").select("name");
  console.log("Rule sets:", rules?.length);
  rules?.forEach(r => console.log("  ", r.name));
  
  // Should see batches
  const { data: batches } = await sb.from("calculation_batches")
    .select("id, lifecycle_state, entity_count");
  console.log("Batches:", batches?.length);
  batches?.forEach(b => console.log("  ", b.id?.substring(0,8), b.lifecycle_state, b.entity_count, "entities"));
  
  await sb.auth.signOut();
})();
'
```

**PASTE output.** Critical: entity count should be ~22 (Optica Luminar only), NOT 24,833.

### 3C: Manager (gerente@opticaluminar.mx)

```bash
echo "============================================"
echo "PERSONA: Manager (gerente@opticaluminar.mx)"
echo "============================================"

node -e '
const { createClient } = require("@supabase/supabase-js");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
(async () => {
  const { data } = await sb.auth.signInWithPassword({ 
    email: "gerente@opticaluminar.mx", password: "demo-password-VL1" 
  });
  if (!data?.session) { console.log("AUTH FAILED"); return; }
  
  const { data: profile } = await sb.from("profiles")
    .select("role, display_name, tenant_id")
    .eq("email", "gerente@opticaluminar.mx")
    .maybeSingle();
  console.log("Profile:", JSON.stringify(profile));
  
  // Manager should see same tenant data as admin (RLS is tenant-level)
  const { count: entityCount } = await sb.from("entities")
    .select("*", { count: "exact", head: true });
  console.log("Entities visible:", entityCount);
  
  const { data: results } = await sb.from("calculation_results")
    .select("entity_id, total_payout")
    .limit(3);
  console.log("Calc results:", results?.length, "rows");
  
  await sb.auth.signOut();
})();
'
```

**PASTE output.**

### 3D: Rep/Viewer (vendedor@opticaluminar.mx)

```bash
echo "============================================"
echo "PERSONA: Rep/Viewer (vendedor@opticaluminar.mx)"
echo "============================================"

node -e '
const { createClient } = require("@supabase/supabase-js");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
(async () => {
  const { data } = await sb.auth.signInWithPassword({ 
    email: "vendedor@opticaluminar.mx", password: "demo-password-VL1" 
  });
  if (!data?.session) { console.log("AUTH FAILED"); return; }
  
  const { data: profile } = await sb.from("profiles")
    .select("role, display_name, tenant_id")
    .eq("email", "vendedor@opticaluminar.mx")
    .maybeSingle();
  console.log("Profile:", JSON.stringify(profile));
  
  // Viewer should see tenant data (RLS allows tenant reads)
  const { count: entityCount } = await sb.from("entities")
    .select("*", { count: "exact", head: true });
  console.log("Entities visible:", entityCount);
  
  const { data: results } = await sb.from("calculation_results")
    .select("entity_id, total_payout")
    .limit(3);
  console.log("Calc results:", results?.length, "rows");
  
  await sb.auth.signOut();
})();
'
```

**PASTE output.**

### 3E: Velocidad Deportiva Admin

```bash
echo "============================================"
echo "PERSONA: VD Admin (admin@velocidaddeportiva.mx)"
echo "============================================"

node -e '
const { createClient } = require("@supabase/supabase-js");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
(async () => {
  const { data } = await sb.auth.signInWithPassword({ 
    email: "admin@velocidaddeportiva.mx", password: "demo-password-VL1" 
  });
  if (!data?.session) { console.log("AUTH FAILED"); return; }
  
  const { count: entityCount } = await sb.from("entities")
    .select("*", { count: "exact", head: true });
  console.log("VD Entities visible:", entityCount, "(expected ~35)");
  
  const { data: results } = await sb.from("calculation_results")
    .select("entity_id, total_payout")
    .limit(5);
  console.log("VD Calc results:", results?.length, "rows (first 5)");
  results?.forEach(r => console.log("  entity:", r.entity_id?.substring(0,8), "payout:", r.total_payout));
  
  const { data: batches } = await sb.from("calculation_batches")
    .select("id, lifecycle_state, entity_count, period_id");
  console.log("VD Batches:", batches?.length);
  batches?.forEach(b => console.log("  ", b.id?.substring(0,8), b.lifecycle_state, b.entity_count, "entities"));
  
  const { data: outcomes } = await sb.from("entity_period_outcomes")
    .select("entity_id, total_payout")
    .limit(5);
  console.log("VD Outcomes:", outcomes?.length, "rows (first 5)");
  
  await sb.auth.signOut();
})();
'
```

**PASTE output.** VD should have ~35 entities, 108 results, 8 batches, 36 outcomes.

---

## PHASE 4: FIVE LAYERS DATA AVAILABILITY PER PERSONA

Test whether the Five Layers proof view has data to render for each tenant.

### 4A: Optica Luminar — proof data

```bash
node -e '
const { createClient } = require("@supabase/supabase-js");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const OL_TENANT = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
(async () => {
  console.log("=== OPTICA LUMINAR — FIVE LAYERS DATA ===");
  
  // L5: Aggregate
  const { data: results } = await sb.from("calculation_results")
    .select("total_payout, components, metrics, attainment")
    .eq("tenant_id", OL_TENANT);
  console.log("Total results:", results?.length);
  if (results?.length) {
    const total = results.reduce((s, r) => s + (Number(r.total_payout) || 0), 0);
    const avg = total / results.length;
    console.log("L5 — Total payout:", total.toFixed(2));
    console.log("L5 — Average payout:", avg.toFixed(2));
    console.log("L5 — Entity count:", results.length);
  }
  
  // L4: Per-entity
  const { data: withNames } = await sb.from("calculation_results")
    .select("entity_id, total_payout, entities!inner(display_name, external_id)")
    .eq("tenant_id", OL_TENANT)
    .order("total_payout", { ascending: false })
    .limit(5);
  console.log("\nL4 — Top 5 entities:");
  withNames?.forEach(r => console.log("  ", r.entities?.display_name, "(" + r.entities?.external_id + ")", "payout:", r.total_payout));
  
  // L3: Component JSONB
  const sample = results?.[0];
  if (sample?.components) {
    console.log("\nL3 — Components structure:", typeof sample.components, Array.isArray(sample.components) ? "array" : "");
    const comps = Array.isArray(sample.components) ? sample.components : [sample.components];
    comps.forEach((c, i) => {
      console.log("  Component", i + 1, "keys:", Object.keys(c).join(", "));
      console.log("  Values:", JSON.stringify(c).substring(0, 200));
    });
  } else {
    console.log("\nL3 — Components: NULL or empty");
  }
  
  // L2: Metrics JSONB
  if (sample?.metrics) {
    console.log("\nL2 — Metrics structure:", typeof sample.metrics);
    console.log("  Keys:", Object.keys(sample.metrics).join(", "));
    console.log("  Values:", JSON.stringify(sample.metrics).substring(0, 300));
  } else {
    console.log("\nL2 — Metrics: NULL or empty");
  }
  
  // Attainment
  if (sample?.attainment) {
    console.log("\nAttainment structure:", typeof sample.attainment);
    console.log("  Values:", JSON.stringify(sample.attainment).substring(0, 300));
  }
})();
'
```

**PASTE output.** This is the truth about whether Five Layers can render for Optica Luminar.

### 4B: Velocidad Deportiva — proof data

```bash
node -e '
const { createClient } = require("@supabase/supabase-js");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const VD_TENANT = "b2c3d4e5-f6a7-8901-bcde-f12345678901";
(async () => {
  console.log("=== VELOCIDAD DEPORTIVA — FIVE LAYERS DATA ===");
  
  const { data: results } = await sb.from("calculation_results")
    .select("total_payout, components, metrics, attainment")
    .eq("tenant_id", VD_TENANT)
    .limit(5);
  console.log("Total results (first 5 of 108):", results?.length);
  
  if (results?.length) {
    const sample = results[0];
    console.log("\nSample total_payout:", sample.total_payout);
    console.log("Components:", JSON.stringify(sample.components)?.substring(0, 300));
    console.log("Metrics:", JSON.stringify(sample.metrics)?.substring(0, 300));
    console.log("Attainment:", JSON.stringify(sample.attainment)?.substring(0, 300));
  }
  
  // Check entity names
  const { data: withNames } = await sb.from("calculation_results")
    .select("entity_id, total_payout, entities!inner(display_name, external_id)")
    .eq("tenant_id", VD_TENANT)
    .order("total_payout", { ascending: false })
    .limit(5);
  console.log("\nTop 5 VD entities:");
  withNames?.forEach(r => console.log("  ", r.entities?.display_name, "(" + r.entities?.external_id + ")", "payout:", r.total_payout));
})();
'
```

**PASTE output.**

---

## PHASE 5: DISPUTE AND AUDIT FLOW TEST

Create a real dispute and verify it persists + generates audit log.

### 5A: Create a dispute via API

```bash
node -e '
const { createClient } = require("@supabase/supabase-js");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
(async () => {
  // Login as OL admin
  const { data: auth } = await sb.auth.signInWithPassword({ 
    email: "admin@opticaluminar.mx", password: "demo-password-VL1" 
  });
  if (!auth?.session) { console.log("AUTH FAILED"); return; }
  
  // Create dispute via API
  const resp = await fetch("http://localhost:3000/api/disputes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + auth.session.access_token,
      "Cookie": "sb-bayqxeiltnpjrvflksfa-auth-token=" + auth.session.access_token
    },
    body: JSON.stringify({
      tenant_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      entity_id: "a1000000-0000-0000-0000-000000000001",
      period_id: "a1p00000-0000-0000-0000-000000000001",
      category: "data_error",
      description: "UAT-02 test dispute — payout appears incorrect for February period"
    })
  });
  
  console.log("POST /api/disputes → HTTP", resp.status);
  const body = await resp.json().catch(() => resp.text());
  console.log("Response:", JSON.stringify(body)?.substring(0, 500));
  
  await sb.auth.signOut();
})();
'
```

**PASTE output.** Expected: 200/201 with dispute ID.

### 5B: Verify dispute persisted

```bash
node -e '
const { createClient } = require("@supabase/supabase-js");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data, count } = await sb.from("disputes")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .limit(3);
  console.log("=== DISPUTES TABLE ===");
  console.log("Total:", count);
  data?.forEach(d => console.log(
    d.id?.substring(0,8), "|",
    d.category, "|",
    d.status, "|",
    d.description?.substring(0, 50)
  ));
})();
'
```

**PASTE output.** Should show the dispute we just created.

### 5C: Verify audit log entry

```bash
node -e '
const { createClient } = require("@supabase/supabase-js");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data, count } = await sb.from("audit_logs")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .limit(5);
  console.log("=== AUDIT LOGS ===");
  console.log("Total:", count);
  data?.forEach(a => console.log(
    a.action, "|",
    a.resource_type, "|",
    a.created_at
  ));
})();
'
```

**PASTE output.** Should show `dispute.created` entry from the POST above.

---

## PHASE 6: ANOMALY DETECTION VERIFICATION

### 6A: Run anomaly detection on real data

```bash
node -e '
const { createClient } = require("@supabase/supabase-js");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const VD_TENANT = "b2c3d4e5-f6a7-8901-bcde-f12345678901";
(async () => {
  const { data: results } = await sb.from("calculation_results")
    .select("entity_id, total_payout")
    .eq("tenant_id", VD_TENANT);
  
  if (!results?.length) { console.log("No results to analyze"); return; }
  
  // Manual anomaly check (same logic as detectAnomalies)
  const payouts = results.map(r => Number(r.total_payout) || 0);
  const mean = payouts.reduce((a,b) => a+b, 0) / payouts.length;
  const stdDev = Math.sqrt(payouts.reduce((s,v) => s + Math.pow(v - mean, 2), 0) / payouts.length);
  const zeros = payouts.filter(p => p === 0).length;
  const sorted = [...payouts].sort((a,b) => a-b);
  const median = sorted[Math.floor(sorted.length/2)];
  
  console.log("=== ANOMALY ANALYSIS — Velocidad Deportiva ===");
  console.log("Total entities:", payouts.length);
  console.log("Mean payout:", mean.toFixed(2));
  console.log("Median payout:", median.toFixed(2));
  console.log("Std deviation:", stdDev.toFixed(2));
  console.log("Min:", sorted[0], "Max:", sorted[sorted.length-1]);
  console.log("Zero payouts:", zeros, "(" + (zeros/payouts.length*100).toFixed(1) + "%)");
  
  // Outliers (>2 stddev)
  const highOutliers = results.filter(r => Number(r.total_payout) > mean + 2*stdDev);
  const lowOutliers = results.filter(r => Number(r.total_payout) < mean - 2*stdDev && Number(r.total_payout) > 0);
  console.log("High outliers (>2σ):", highOutliers.length);
  console.log("Low outliers (<2σ, non-zero):", lowOutliers.length);
  
  // Identical values
  const valueCounts = {};
  payouts.forEach(p => { valueCounts[p] = (valueCounts[p] || 0) + 1; });
  const duplicates = Object.entries(valueCounts).filter(([_,c]) => c >= 3);
  console.log("Identical value clusters (3+):", duplicates.length);
  duplicates.forEach(([v,c]) => console.log("  Value:", v, "Count:", c));
})();
'
```

**PASTE output.** This shows what the assessment API's anomaly detection should find.

---

## PHASE 7: CLASSIFICATION SIGNALS VERIFICATION

### 7A: Signal persistence check

```bash
node -e '
const { createClient } = require("@supabase/supabase-js");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data, count } = await sb.from("classification_signals")
    .select("signal_type, source, confidence, context, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .limit(10);
  console.log("=== CLASSIFICATION SIGNALS ===");
  console.log("Total:", count);
  data?.forEach(s => console.log(
    s.signal_type?.padEnd(30), "|",
    s.source?.padEnd(15), "|",
    "confidence:", s.confidence, "|",
    s.created_at
  ));
})();
'
```

**PASTE output.**

---

## PHASE 8: RLS ISOLATION VERIFICATION

Critical security test — ensure tenants cannot see each other's data.

```bash
node -e '
const { createClient } = require("@supabase/supabase-js");
(async () => {
  console.log("=== RLS ISOLATION TEST ===");
  
  // Login as OL admin
  const sb1 = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  await sb1.auth.signInWithPassword({ email: "admin@opticaluminar.mx", password: "demo-password-VL1" });
  
  const { count: olEntities } = await sb1.from("entities").select("*", { count: "exact", head: true });
  const { count: olResults } = await sb1.from("calculation_results").select("*", { count: "exact", head: true });
  console.log("OL admin sees:", olEntities, "entities,", olResults, "results");
  
  // Try to see VD data explicitly
  const { data: crossTenant } = await sb1.from("entities")
    .select("id")
    .eq("tenant_id", "b2c3d4e5-f6a7-8901-bcde-f12345678901")
    .limit(1);
  console.log("OL admin sees VD entities:", crossTenant?.length || 0, "(should be 0)");
  
  await sb1.auth.signOut();
  
  // Login as VD admin
  const sb2 = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  await sb2.auth.signInWithPassword({ email: "admin@velocidaddeportiva.mx", password: "demo-password-VL1" });
  
  const { count: vdEntities } = await sb2.from("entities").select("*", { count: "exact", head: true });
  const { count: vdResults } = await sb2.from("calculation_results").select("*", { count: "exact", head: true });
  console.log("VD admin sees:", vdEntities, "entities,", vdResults, "results");
  
  // Try to see OL data explicitly
  const { data: crossTenant2 } = await sb2.from("entities")
    .select("id")
    .eq("tenant_id", "a1b2c3d4-e5f6-7890-abcd-ef1234567890")
    .limit(1);
  console.log("VD admin sees OL entities:", crossTenant2?.length || 0, "(should be 0)");
  
  await sb2.auth.signOut();
  
  console.log("\nRLS ISOLATION:", 
    (crossTenant?.length === 0 && crossTenant2?.length === 0) ? "PASS" : "FAIL — CROSS-TENANT DATA LEAK");
})();
'
```

**PASTE output.** Both cross-tenant queries must return 0.

---

## PHASE 9: SUMMARY REPORT

Create `UAT-02_RESULTS.md` at project root with:

### Section 1: Environment
- Build, dev server, auth — all PASS/FAIL

### Section 2: Authenticated API Tests
| Endpoint | Auth User | HTTP Status | Response | PASS/FAIL |

### Section 3: Persona Data Visibility
| Persona | Entities | Results | Periods | Rules | Batches | Correct? |

### Section 4: Five Layers Data
| Tenant | Results | Components JSONB | Metrics JSONB | Attainment JSONB | Ready for L5-L2? |

### Section 5: Dispute + Audit Flow
| Step | Result | Evidence |
- Dispute created?
- Dispute persisted?
- Audit log entry?

### Section 6: Anomaly Detection
- Stats summary for VD tenant
- Anomalies found?

### Section 7: RLS Isolation
| Test | Result |
- OL admin sees VD data? (must be NO)
- VD admin sees OL data? (must be NO)

### Section 8: Classification Signals
- Count, types, sources

### Section 9: CRITICAL FINDINGS
- BLOCKING / DEGRADED / COSMETIC

### Section 10: CLT-67 READINESS
Based on all findings, recommend:
- READY for CLT-67
- READY WITH CAVEATS (list them)
- NOT READY (list blockers)

---

**Commit:** `UAT-02: Authenticated session acceptance test results`
**Push:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "UAT-02: Authenticated acceptance test" && git push origin dev`

---

## HOTFIX EXCEPTIONS

If a test reveals a **trivially fixable blocking issue** (wrong column name, missing import, etc.) AND the fix is under 5 lines, you may fix it INLINE and document:
```
INLINE FIX: [description]
File: [path]
Change: [old] → [new]
Reason: [why this blocks testing]
```

All other issues: DOCUMENT ONLY. Do not fix.

---

*UAT-02 — February 21, 2026*
*"Now that everyone can log in, let's see what they actually see."*
