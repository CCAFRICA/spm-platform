# HF-089: FIX PLAN-READINESS ENDPOINT (Client Recovery Bridge)

## Autonomy Directive
NEVER ask yes/no. NEVER say "shall I". Just act. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.

## READ FIRST
- `CC_STANDING_ARCHITECTURE_RULES.md` — all rules, anti-patterns, proof gates apply
- CC Failure Pattern 31: Map the complete flow before any code change.
- CC Failure Pattern 29: Proof gates must require browser behavior evidence, not build clean.

## CONTEXT

**The server saves correctly. The client shows failure. The polling recovery fires but doesn't find the plan.**

Production evidence from Vercel logs (March 3, 2026):
```
20:50:39 — POST /api/import/sci/analyze-document → 200
20:51:53 — POST /api/import/sci/execute → 200 — "Plan saved: Optometrist Incentive Plan (05c30b36-09e7-4648-8418-e48c8cc1ff55), 7 components"
20:52:59 — GET /api/plan-readiness → 200 (no recovery triggered)
20:53:09 — GET /api/plan-readiness → 200 (no recovery triggered)
20:53:25 — GET /api/plan-readiness → 200 (no recovery triggered)
... 8 total polls over 90 seconds, all 200, none trigger UI recovery
```

**What we know:**
1. The execute endpoint saves the plan correctly (third time proven)
2. OB-151's pollPlanRecovery() fires correctly — 8 polls with progressive intervals
3. The plan-readiness endpoint returns 200 but apparently doesn't find the plan
4. The plan ID `05c30b36-09e7-4648-8418-e48c8cc1ff55` exists in rule_sets table
5. The plan has 7 components and status (likely 'draft' or 'active')

**Root cause hypothesis:** The plan-readiness endpoint's query doesn't match the plan that was saved. Either:
- Wrong tenant_id filter
- Wrong status filter (looking for 'active' but plan saved as 'draft')
- Wrong contentUnitId lookup
- Different column or response shape than what pollPlanRecovery() expects
- The endpoint returns `{ ready: false }` or similar when it should return the plan

**This is a query mismatch, not an architecture problem.**

---

## PHASE 0: DIAGNOSTIC — MAP THE COMPLETE FLOW

### 0A: Read the plan-readiness endpoint

```bash
cd /Users/AndrewAfrica/spm-platform

echo "=== PLAN-READINESS ENDPOINT ==="
cat web/src/app/api/plan-readiness/route.ts

echo ""
echo "=== DOES IT EXIST? ==="
find web/src -path "*plan-readiness*" -o -path "*plan_readiness*" -o -path "*planReadiness*" | head -10
```

### 0B: Read the client-side polling code (OB-151)

```bash
echo "=== CLIENT POLLING CODE ==="
grep -n -A 40 "pollPlanRecovery\|plan-readiness\|planReadiness" web/src/components/sci/SCIExecution.tsx

echo ""
echo "=== WHAT DOES THE CLIENT EXPECT? ==="
grep -n "ready\|found\|success\|plan\|recover" web/src/components/sci/SCIExecution.tsx | head -30
```

### 0C: Read the execute endpoint — what does it save?

```bash
echo "=== EXECUTE ENDPOINT — PLAN SAVE ==="
grep -n -A 20 "Plan saved\|rule_sets\|insert\|upsert" web/src/app/api/import/sci/execute/route.ts | head -60

echo ""
echo "=== WHAT STATUS DOES IT SET? ==="
grep -n "status\|draft\|active\|published" web/src/app/api/import/sci/execute/route.ts | head -20
```

### 0D: Check the rule_sets table for the saved plan

```bash
cd web
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// Find Óptica tenant
const { data: tenants } = await sb.from('tenants').select('id, slug').ilike('slug', '%optica%');
if (!tenants?.length) { console.log('No Óptica tenant'); process.exit(1); }
const tenantId = tenants[0].id;
console.log('Tenant:', tenantId);

// Check what rule_sets exist now
const { data: rs } = await sb.from('rule_sets').select('id, name, status, tenant_id, created_at, metadata').eq('tenant_id', tenantId);
console.log('Rule sets for Óptica:');
console.table(rs?.map(r => ({
  id: r.id.substring(0, 8),
  name: r.name,
  status: r.status,
  tenant_id_match: r.tenant_id === tenantId,
  has_components: !!(r.metadata as any)?.components || false,
  contentUnitId: (r.metadata as any)?.contentUnitId?.substring(0, 8) || 'none'
})));
"
```

### 0E: Simulate what the readiness endpoint does

```bash
cd web
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const tenantId = (await sb.from('tenants').select('id').ilike('slug', '%optica%').single()).data?.id;
console.log('Simulating plan-readiness for tenant:', tenantId);

// Try exactly what the endpoint queries — paste the actual query from 0A here
// Start with the most likely query:
const { data: byStatus } = await sb.from('rule_sets').select('id, name, status').eq('tenant_id', tenantId).eq('status', 'active');
console.log('With status=active:', byStatus?.length, 'results');

const { data: byDraft } = await sb.from('rule_sets').select('id, name, status').eq('tenant_id', tenantId).eq('status', 'draft');
console.log('With status=draft:', byDraft?.length, 'results');

const { data: anyStatus } = await sb.from('rule_sets').select('id, name, status').eq('tenant_id', tenantId);
console.log('With any status:', anyStatus?.length, 'results');
"
```

**PASTE ALL DIAGNOSTIC OUTPUT. Do not proceed until the mismatch is identified.**

**Commit:** `HF-089 Phase 0: Diagnostic — plan-readiness flow mapping`

---

## PHASE 1: FIX THE MISMATCH

Based on Phase 0 diagnostic, fix the plan-readiness endpoint so it finds the saved plan.

**Most likely fixes (choose based on diagnostic evidence):**

### If status mismatch:
The execute endpoint saves with status='draft' but plan-readiness queries for status='active'.
Fix: Query for any non-deleted status, or specifically include 'draft'.

### If tenant_id mismatch:
The readiness endpoint gets tenant_id from a different source (cookie, header, query param) than where the plan was saved.
Fix: Ensure both endpoints resolve tenant_id the same way.

### If contentUnitId mismatch:
The polling passes a contentUnitId that doesn't match what was saved.
Fix: Align the parameter names and values.

### If response shape mismatch:
The endpoint returns `{ ready: false }` or `{ plans: [] }` and the client treats this as "not ready" instead of "plan exists."
Fix: Return the plan data in the response so the client can trigger recovery.

### If the endpoint doesn't exist:
OB-151 may have referenced a plan-readiness endpoint that was never created.
Fix: Create it. Simple query: "do any rule_sets exist for this tenant created in the last 5 minutes?"

**Whatever the fix, it must satisfy:**
1. When a plan was saved by execute, plan-readiness finds it within one poll cycle
2. The client receives enough information to trigger UI recovery (show success)
3. Works for VL Admin (platform-level profile, entering tenant via context)

**Commit:** `HF-089 Phase 1: Fix plan-readiness to find saved plans`

---

## PHASE 2: VERIFY ON LOCALHOST

```bash
cd /Users/AndrewAfrica/spm-platform/web
pkill -f "next dev" 2>/dev/null || true
rm -rf .next
npm run build
npm run dev &
sleep 10
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
```

Then test the readiness endpoint directly:
```bash
# After importing a plan on localhost, call the readiness endpoint
curl -s "http://localhost:3000/api/plan-readiness?tenantId=OPTICA_TENANT_ID" | jq .
```

**Expected:** Response includes the plan that was just saved.

**Commit:** `HF-089 Phase 2: Localhost verification`

---

## PHASE 3: COMPLETION REPORT

Create `HF-089_COMPLETION_REPORT.md` in project root:

```markdown
# HF-089 COMPLETION REPORT
## Fix Plan-Readiness Endpoint (Client Recovery Bridge)

### Root Cause
[Describe the exact mismatch found in Phase 0]

### Fix Applied
[Describe the change]

### Files Changed
[List exact files]

### Proof Gates

| # | Gate | Status | Evidence |
|---|------|--------|----------|
| PG-01 | Phase 0 diagnostic identifies exact mismatch | | [paste] |
| PG-02 | plan-readiness endpoint finds recently saved plan | | [paste curl output] |
| PG-03 | Client polling code correctly processes readiness response | | [paste code reference] |
| PG-04 | Build clean (npm run build exits 0) | | [paste] |
| PG-05 | localhost:3000 responds | | [paste] |
```

**Commit:** `HF-089 Phase 3: Completion report`
**Push:** `git push origin dev`

Create PR:
```bash
gh pr create --base main --head dev \
  --title "HF-089: Fix plan-readiness endpoint — client recovery bridge" \
  --body "Plan-readiness endpoint was not finding plans saved by execute endpoint. Root cause: [from diagnostic]. Fix: [from Phase 1]. Server saves correctly (proven 3x on production). Polling recovery fires correctly (proven on production). This fix bridges the gap so the client can recover when the fetch connection drops during long-running AI plan interpretation."
```

---

## MAXIMUM SCOPE

3 phases + completion report. 5 proof gates. Diagnostic → Fix → Verify. Nothing else.

**DO NOT:**
- Change the execute endpoint (it saves correctly — proven 3 times)
- Change the polling logic (it fires correctly — proven on production)
- Restructure the import flow
- Add background jobs or streaming
- Touch any other endpoint

This is a query mismatch fix. Find it. Fix it. Verify it.

---

## IMPORTANT CONTEXT

- **Óptica Luminar tenant ID:** `a1b2c3d4-e5f6-7890-abcd-ef1234567890`
- **Plan just saved:** `05c30b36-09e7-4648-8418-e48c8cc1ff55` — "Optometrist Incentive Plan", 7 components
- **VL Admin auth UUID:** `5fb5f934-2fbd-499f-a2b8-7cd15ac5a1c3` (c5 not c6)
- **VL Admin profile:** platform-level only (tenant_id=null, role=vl_admin) — Decision 90
- **Execute endpoint took 74 seconds** — this exceeds browser/proxy timeouts, which is expected. The polling recovery is the designed solution.

---

*HF-089 — March 2026*
*"The server saved the plan three times. The polling fired eight times. The readiness endpoint just couldn't see what was right in front of it."*
