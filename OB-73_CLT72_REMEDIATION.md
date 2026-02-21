# OB-73: CLT-72 REMEDIATION — BROWSER TRUTH FIXES

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST: CC_STANDING_ARCHITECTURE_RULES.md

Before reading further, open and read the COMPLETE file `CC_STANDING_ARCHITECTURE_RULES.md` at the project root. Every decision in this OB must comply with:
- Section A: Design Principles (9 principles — especially #1 AI-First, #7 Prove Don't Describe, #8 Domain-Agnostic, #9 IAP Gate)
- Section B: Architecture Decision Gate (mandatory BEFORE any implementation code)
- Section C: Anti-Pattern Registry (22 anti-patterns — DO NOT REPEAT ANY)
- Section D: Operational Rules (23 rules)
- Section E: Scale Reference
- Section F: Quick Checklist (run before completion report)

**If you have not read that file, STOP and read it now.**

---

## WHY THIS OB EXISTS

CLT-72 was a comprehensive browser walkthrough that produced **58 findings** (F-14 through F-71). These are real bugs found by a human testing real browser behavior — not code-review guesses. This OB addresses the highest-priority findings that block demo readiness and platform trust.

**Source findings addressed in this OB:**

| Finding | Severity | Description | Mission |
|---------|----------|-------------|---------|
| F-38 | CRITICAL | AI Assessment fabricates $58K analysis on tenant with 0 calculation_results | 1 |
| F-71 | HIGH | Persona Switcher doesn't persist on navigation — reverts to Admin | 2 |
| F-14 | HIGH | Admin landing page is "Govern" instead of Operate/Dashboard | 3 |
| F-22 | HIGH | Manager landing page is "Acelerar" instead of Perform/Insights | 3 |
| F-18 | HIGH | "Upgrade Required" trial modal for demo users | 3 |
| F-63 | CRITICAL | $0 batch advanced to Official without validation gate | 4 |
| F-56 | CRITICAL | Summary shows MX$157,139 but every entity row shows MX$0.00 | 4 |
| F-67 | HIGH | No user-friendly batch identifier anywhere in UI | 4 |
| F-16 | MEDIUM | Markdown not rendered in AI assessment — asterisks visible | 5 |
| F-32 | HIGH | Approve AND Reject buttons don't fire on adjustments | 5 |
| F-31 | MEDIUM | New Adjustment button doesn't fire | 5 |
| F-33 | HIGH | Console: `.trim()` TypeError in assessment and reconciliation | 5 |
| F-39 | HIGH | Operate stuck on "Loading periods..." never resolves (empty tenants) | 6 |
| F-17 | MEDIUM | "Governance Assessment" title not contextual to persona | 6 |

**Locked Decisions enforced in this OB:**
- **#17:** RetailCDMX, RetailPLGMX, Retail Conglomerate HIDDEN from tenant selector for demos
- **#18:** Persona Switcher must call `signInWithPassword()` for real re-auth
- **#19:** Empty state over phantom data — tenant with 0 results shows "No data available"
- **#20:** User-friendly batch IDs: `{TENANT_SHORT}-{PERIOD}-{SEQ}` format

---

## ⚠️ CC COMPLIANCE ENFORCEMENT

### ANTI-PATTERNS FROM CLT-72 — DO NOT REPEAT

| AP# | Pattern | What Goes Wrong |
|-----|---------|-----------------|
| AP-18 | AI hallucination on empty data | AI generates confident analysis with fabricated numbers when calculation_results = 0 |
| AP-19 | Import without validation gate | Records committed despite unresolved field mappings |
| AP-20 | Lifecycle without payout validation | Batch advances through all states with $0 payouts, no warning |
| AP-21 | Summary vs detail mismatch | Summary card aggregates differ from individual entity rows |
| AP-22 | Period detector year misinterpretation | Month values (1,2,3) interpreted as years (2001,2002,2003) |

### STANDING RULES
1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000 responds
3. Final step: `gh pr create --base main --head dev`
4. Architecture Decision Gate before implementation
5. Anti-Pattern Registry check (AP-1 through AP-22)
6. **Supabase migrations MUST be executed live AND verified with DB query**
7. **Build EXACTLY what the prompt specifies (Standing Rule 15)**
8. **Git commands from repo root** (spm-platform), NOT from web/
9. **Every AI assessment must validate data exists** before generating. If calculation_results count = 0, return "No calculation data available" — never fabricate.
10. OB prompt committed to git as first action.

---

## PHASE 0: DIAGNOSTIC

Run this COMPLETE diagnostic. PASTE all output.

```bash
cd /Users/AndrewAfrica/spm-platform/web

echo "============================================"
echo "PHASE 0: OB-73 DIAGNOSTIC"
echo "============================================"

echo ""
echo "=== 1. AI ASSESSMENT API ROUTE ==="
echo "--- Does it check for empty data before generating? ---"
cat src/app/api/assessment/route.ts 2>/dev/null || echo "NOT FOUND at expected path"
echo ""
grep -rn "assessment" src/app/api/ --include="*.ts" -l 2>/dev/null

echo ""
echo "=== 2. PERSONA SWITCHER COMPONENT ==="
grep -rn "persona\|PersonaSwitcher\|switchPersona\|signInWithPassword" \
  src/components/ src/hooks/ src/lib/ --include="*.ts" --include="*.tsx" -l 2>/dev/null

echo ""
echo "=== 3. DEFAULT WORKSPACE ROUTING ==="
echo "--- Where does middleware/layout route each role? ---"
grep -rn "vl_admin\|admin\|manager\|viewer\|gerente\|vendedor" \
  src/middleware.ts src/app/layout.tsx src/lib/navigation/ src/hooks/useAuth* \
  --include="*.ts" --include="*.tsx" 2>/dev/null | head -30

echo ""
echo "=== 4. TRIAL/UPGRADE MODAL ==="
grep -rn "Upgrade\|trial\|TrialModal\|upgrade.required\|subscription" \
  src/components/ src/app/ --include="*.tsx" --include="*.ts" -l 2>/dev/null

echo ""
echo "=== 5. LIFECYCLE STATE TRANSITIONS ==="
echo "--- Where does lifecycle advance? Is there payout validation? ---"
grep -rn "lifecycle_state\|advanceLifecycle\|updateLifecycle\|transition" \
  src/ --include="*.ts" --include="*.tsx" -l 2>/dev/null | grep -v node_modules | grep -v .next

echo ""
echo "=== 6. BATCH ID GENERATION ==="
grep -rn "batch_id\|batchId\|batch_label\|batch_name\|batch_reference" \
  src/ --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v node_modules | grep -v .next | head -20

echo ""
echo "=== 7. MARKDOWN RENDERING IN AI PANELS ==="
grep -rn "dangerouslySetInnerHTML\|react-markdown\|ReactMarkdown\|marked\|remark" \
  src/ --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v node_modules | grep -v .next | head -15

echo ""
echo "=== 8. ADJUSTMENT/APPROVAL BUTTONS ==="
grep -rn "handleApprove\|handleReject\|onApprove\|onReject\|handleNewAdjustment\|handleCreate" \
  src/app/investigate/ --include="*.tsx" 2>/dev/null | head -20

echo ""
echo "=== 9. TENANT SELECTOR ==="
grep -rn "select-tenant\|TenantSelector\|tenantList\|tenant_id" \
  src/app/select-tenant/ src/components/ --include="*.tsx" --include="*.ts" -l 2>/dev/null

echo ""
echo "=== 10. EMPTY STATE HANDLING ON OPERATE ==="
grep -rn "Loading periods\|no.*period\|empty.*state" \
  src/app/operate/ --include="*.tsx" 2>/dev/null | head -10

echo ""
echo "=== 11. .trim() CRASH SOURCES ==="
grep -rn "\.trim()" \
  src/app/investigate/ src/app/operate/ src/components/ \
  --include="*.tsx" --include="*.ts" 2>/dev/null | grep -v node_modules | grep -v .next | head -20

echo ""
echo "=== 12. SCHEMA CHECK — calculation_batches ==="
echo "Verify lifecycle_state column and batch naming columns:"
grep -rn "calculation_batches" src/ --include="*.ts" --include="*.tsx" 2>/dev/null | \
  grep -v node_modules | grep -v .next | grep "select\|insert\|update" | head -15
```

**PASTE the complete output. Commit:** `OB-73 Phase 0: CLT-72 remediation diagnostic`

---

## PHASE 1: ARCHITECTURE DECISION

```
ARCHITECTURE DECISION RECORD
============================
Problem: 14 CLT-72 findings across 6 categories need resolution.
         Must fix: AI safety, persona auth, routing, lifecycle gates,
         dead buttons, tenant visibility.

Option A: Fix each finding individually in isolation
  - Scale test: Works at 10x? YES
  - AI-first: Any hardcoding? RISK — ad hoc fixes may introduce hardcoding
  - Transport: N/A
  - Atomicity: NO — partial fixes leave inconsistent state

Option B: Fix by system layer (data → auth → routing → UI → safety)
  - Scale test: Works at 10x? YES
  - AI-first: Any hardcoding? NO — layer approach enforces patterns
  - Transport: N/A
  - Atomicity: YES — each layer is internally consistent

CHOSEN: Option B — layer approach. Mission 1 (AI safety) → Mission 2 (auth) →
Mission 3 (routing) → Mission 4 (data lifecycle) → Mission 5 (UI actions) →
Mission 6 (tenant visibility). Each mission is independently testable.

REJECTED: Option A — ad hoc finding-by-finding risks inconsistency and
           makes testing order-dependent.
```

**Commit:** `OB-73 Phase 1: Architecture decision — layer-based remediation`

---

## MISSION 1: AI ASSESSMENT SAFETY (F-38, AP-18)

### The Problem
The AI Assessment API generates confident, specific analysis (naming individuals, citing dollar amounts like $58K) for tenants that have **ZERO** calculation_results. This is trust-destroying — a customer seeing fabricated payout data would lose all confidence in the platform.

### The Fix
Before ANY AI generation, the assessment API MUST:
1. Query `calculation_results` count for the current tenant + period
2. If count = 0: return a structured "no data" response — NEVER call the AI
3. If count > 0: proceed with real data passed to AI prompt
4. The AI prompt MUST include actual data values — never let the AI "imagine" numbers

### Implementation

**Find the assessment API route.** It will be one of:
- `src/app/api/assessment/route.ts`
- `src/app/api/platform/assessment/route.ts`
- `src/app/api/ai/assessment/route.ts`

**At the TOP of the POST handler, BEFORE any AI call:**

```typescript
// SAFETY GATE: Never generate assessment on empty data (AP-18 / F-38)
const { count } = await supabase
  .from('calculation_results')
  .select('*', { count: 'exact', head: true })
  .eq('tenant_id', tenantId);

if (!count || count === 0) {
  return NextResponse.json({
    assessment: {
      summary: 'No calculation data available for this period.',
      details: 'Import data and run calculations before requesting an assessment.',
      confidence: 0,
      dataPoints: 0,
      generated: false
    }
  });
}
```

**Also fix the consumer component** — wherever the AI assessment panel renders, it must check the `generated` flag and show a clean empty state (not the fabricated analysis).

**Additionally:** Search for ALL places where AI text is generated from DB data. Every single one must have a data-existence check. Common locations:
- Dashboard assessment panel
- Coaching intelligence panel (manager view)
- Governance assessment panel (admin view)
- Anomaly detection

### Proof Gates (4)
```
PG-1: Login as admin@retailcdmx.mx. Navigate to dashboard.
      EXPECTED: "No calculation data available" message — NOT fabricated $58K analysis.
      EVIDENCE: [paste browser content]

PG-2: Login as admin@opticaluminar.mx. Navigate to dashboard.
      EXPECTED: Real AI assessment with actual data points from 12 entities.
      EVIDENCE: [paste browser content showing real data references]

PG-3: Check API response for tenant with 0 results.
      curl localhost:3000/api/assessment?tenant_id={retailcdmx_id}
      EXPECTED: JSON with generated:false, dataPoints:0
      EVIDENCE: [paste API response]

PG-4: Browser console clean on both tenant dashboards.
      EVIDENCE: [paste console output]
```

### Compliance Check
```
□ AP-18 (AI hallucination) explicitly prevented? [YES/NO]
□ Every AI generation path has data-existence gate? [YES/NO]
□ Empty state is informative, not blank? [YES/NO]
□ Real tenant (OL) still gets real assessment? [YES/NO]
```

**Commit:** `OB-73 Mission 1: AI assessment safety gate — never fabricate on empty data`

---

## MISSION 2: PERSONA SWITCHER RE-AUTH (F-71, Locked Decision #18)

### The Problem
The Persona Switcher sets client-side state (role, display name) but does NOT actually re-authenticate. On any navigation, the original admin session reasserts. This means:
- Persona-specific views cannot be tested via the switcher
- RLS policies see the original user's tenant/role, not the switched persona
- Switched state is cosmetic only — data displayed is still admin data

### The Fix
The Persona Switcher must call `signInWithPassword()` with the selected persona's credentials. This creates a real Supabase session as that user, with proper RLS enforcement.

### Implementation

**Find the Persona Switcher component.** Likely in:
- `src/components/navigation/PersonaSwitcher.tsx`
- `src/components/layout/PersonaSwitcher.tsx`
- `src/hooks/usePersonaSwitcher.ts`

**The switch function must:**

```typescript
async function switchPersona(persona: { email: string; password: string }) {
  // 1. Sign out current session
  await supabase.auth.signOut();
  
  // 2. Sign in as the new persona (REAL auth, not state manipulation)
  const { data, error } = await supabase.auth.signInWithPassword({
    email: persona.email,
    password: persona.password,
  });
  
  if (error) {
    console.error('Persona switch failed:', error.message);
    // Re-authenticate as original user or show error
    return;
  }
  
  // 3. Hard reload to pick up new session in all server components
  window.location.href = '/';  // Full page reload, not client-side navigation
}
```

**Critical requirements:**
- Persona credentials must be available to the switcher. These are the demo users from `Vialuce_Demo_Credentials.xlsx` — all use password `demo-password-VL1`.
- The persona list should come from the `profiles` table for the current tenant, filtered by role.
- After switch, the page MUST fully reload — client-side router navigation will not update server components or session cookies.
- The switcher should show the CURRENT authenticated user's name/role, not a cached value.

**Persona list for Optica Luminar:**
| Email | Role | Display |
|-------|------|---------|
| admin@opticaluminar.mx | admin | Administrador |
| gerente@opticaluminar.mx | manager | Gerente Regional |
| vendedor@opticaluminar.mx | viewer | Vendedor Senior |

**Persona list for Velocidad Deportiva:**
| Email | Role | Display |
|-------|------|---------|
| admin@velocidaddeportiva.mx | admin | Administrador |

### Proof Gates (4)
```
PG-5: Login as admin@opticaluminar.mx. Use Persona Switcher to switch to Gerente.
      EXPECTED: Page reloads. New session is gerente@opticaluminar.mx.
      EVIDENCE: [paste Supabase auth.getUser() response showing gerente email]

PG-6: After switching to Gerente, click 3+ sidebar links.
      EXPECTED: Session persists as Gerente on every navigation. Does NOT revert to Admin.
      EVIDENCE: [paste user identity shown in UI after each navigation]

PG-7: Switch to Vendedor. Navigate to /operate.
      EXPECTED: Access denied or restricted view — Vendedor should not see Operate workspace.
      EVIDENCE: [paste what renders]

PG-8: After Vendedor switch, check /my-compensation.
      EXPECTED: Personal view showing only vendedor's own data.
      EVIDENCE: [paste what renders]
```

### Compliance Check
```
□ signInWithPassword() called on every persona switch? [YES/NO]
□ Full page reload after switch (not client-side nav)? [YES/NO]
□ No cached/stale user identity after switch? [YES/NO]
□ RLS enforced on new session (Gerente sees manager data only)? [YES/NO]
□ Locked Decision #18 satisfied? [YES/NO]
```

**Commit:** `OB-73 Mission 2: Persona switcher real re-auth with signInWithPassword`

---

## MISSION 3: LANDING PAGE ROUTING + TRIAL GATE (F-14, F-22, F-18)

### The Problem
- **F-14:** Admin users land on "Govern" workspace instead of Operate/Dashboard
- **F-22:** Manager users land on "Acelerar" instead of Perform/Insights
- **F-18:** Demo users see "Upgrade Required" trial modal — there is no trial in demo mode

### The Fix
Role-based default landing pages, and trial gate bypass for demo accounts.

### Implementation

**Default landing pages by role:**
| Role | Default Landing | Current (WRONG) |
|------|----------------|-----------------|
| vl_admin | `/select-tenant` | `/select-tenant` ✅ |
| admin | `/operate` | `/govern` ❌ |
| manager | `/insights` | `/acelerar` ❌ |
| viewer | `/my-compensation` | Unknown |

**Find the routing logic.** Likely in:
- `src/middleware.ts` (server-side redirects)
- `src/app/layout.tsx` or a root layout
- `src/lib/navigation/defaults.ts` or similar config
- `src/hooks/useWorkspace.ts`

**The routing must:**
1. After authentication, read the user's `role` from `profiles`
2. Redirect to the role-appropriate default workspace
3. This MUST be server-side (middleware) to avoid flash of wrong content

**Role → workspace mapping:**
```typescript
const DEFAULT_WORKSPACE: Record<string, string> = {
  'vl_admin': '/select-tenant',
  'admin': '/operate',
  'manager': '/insights',
  'viewer': '/my-compensation',
  'support': '/investigate',
};
```

**Trial gate bypass:**
Find the trial/upgrade modal component. It likely checks a subscription status or plan tier. For demo users (any user in the demo tenants Optica Luminar or Velocidad Deportiva), the trial gate must NOT appear.

Options (in preference order):
1. **Best:** Check `platform_settings` or `tenants` table for a `demo` or `trial_bypass` flag
2. **Acceptable:** Check if user email domain is `opticaluminar.mx` or `velocidaddeportiva.mx`
3. **Last resort:** Feature flag in `platform_settings` table to disable trial gate globally

The modal must be suppressed entirely — not shown and auto-dismissed. Demo users should never see subscription language.

### Proof Gates (4)
```
PG-9: Login as admin@opticaluminar.mx. After auth, observe landing page.
      EXPECTED: Lands on /operate (not /govern)
      EVIDENCE: [paste URL bar + page title]

PG-10: Login as gerente@opticaluminar.mx. After auth, observe landing page.
       EXPECTED: Lands on /insights (not /acelerar)
       EVIDENCE: [paste URL bar + page title]

PG-11: Login as admin@opticaluminar.mx. Navigate all workspaces.
       EXPECTED: No "Upgrade Required" modal appears anywhere.
       EVIDENCE: [paste confirmation — list pages visited with no modal]

PG-12: Login as vendedor@opticaluminar.mx. After auth, observe landing page.
       EXPECTED: Lands on /my-compensation
       EVIDENCE: [paste URL bar + page title]
```

### Compliance Check
```
□ Role-based routing in middleware (server-side, not client)? [YES/NO]
□ All 4 roles mapped to correct default workspace? [YES/NO]
□ Trial modal suppressed for demo tenants? [YES/NO]
□ No hardcoded email checks (use tenant/profile flags)? [YES/NO]
```

**Commit:** `OB-73 Mission 3: Role-based landing pages + trial gate bypass for demo`

---

## MISSION 4: LIFECYCLE VALIDATION GATES + BATCH IDS (F-63, F-56, F-67)

### The Problem
- **F-63:** A batch with ALL entities at MX$0.00 payout advanced through Draft→Preview→Official→Reconcile with no validation or warning. This means a customer could accidentally publish $0 payouts.
- **F-56:** The summary card shows MX$157,139 total but every entity detail row shows MX$0.00. The summary is either aggregating wrong data or fabricating a total.
- **F-67:** Batch references throughout the UI show raw UUIDs. No human-readable batch identifier exists.

### The Fix

**Lifecycle gates:**
Before any lifecycle transition from Draft to a more advanced state, validate:
1. **Has results:** `calculation_results` count > 0 for this batch
2. **Has non-zero payouts:** At least 1 entity has total_payout > 0
3. **Summary matches detail:** Aggregate of entity payouts = summary total (within rounding tolerance of $0.01)

If any validation fails, the transition MUST be blocked with a clear message explaining why. The user can override with explicit confirmation ("I understand all payouts are $0 — advance anyway") but NEVER silently.

**Summary/detail reconciliation (F-56):**
Trace WHERE the summary total (MX$157,139) comes from. It is likely:
- Aggregating from a different batch/period than the detail rows
- Reading from a cached/stale aggregate
- Computing from `committed_data` instead of `calculation_results`

Find the summary component and the detail table. Ensure both read from the SAME data source with the SAME filters (tenant_id, period_id, batch_id).

**Batch IDs (Locked Decision #20):**
Generate a human-readable batch identifier on batch creation:
- Format: `{TENANT_SHORT}-{YYYY}-{MM}-{SEQ}`
- Example: `OL-2026-02-001`, `VD-2026-02-001`
- Stored in `calculation_batches.batch_label` (add column if needed via migration)
- Displayed EVERYWHERE a batch is referenced in the UI (replace UUID displays)

`TENANT_SHORT` derivation: First 2-4 characters of tenant name, uppercased. Store in `tenants.short_code` or derive from `tenants.name`.

### Proof Gates (5)
```
PG-13: Create a new calculation batch with $0 results. Attempt to advance to Preview.
       EXPECTED: Blocked with message "Cannot advance: all entity payouts are $0"
       EVIDENCE: [paste the blocking message]

PG-14: Override the $0 gate with explicit confirmation.
       EXPECTED: Batch advances after user confirms. No silent advancement.
       EVIDENCE: [paste the confirmation dialog + resulting state]

PG-15: On Optica Luminar (real data), verify summary total matches sum of entity detail rows.
       EXPECTED: Summary and detail agree within $0.01.
       EVIDENCE: [paste summary total, then sum of detail rows]

PG-16: Check batch display anywhere in UI.
       EXPECTED: Shows human-readable ID (e.g., OL-2026-02-001), NOT a UUID.
       EVIDENCE: [paste batch reference from UI]

PG-17: Query calculation_batches in Supabase for new column.
       EXPECTED: batch_label column exists with formatted values.
       EVIDENCE: [paste SQL query + result]
```

### Compliance Check
```
□ Lifecycle transition blocked when results are all $0? [YES/NO]
□ User can override with explicit confirmation? [YES/NO]
□ Summary and detail read from same data source? [YES/NO]
□ batch_label column added via executed migration? [YES/NO]
□ UUID never shown to user in batch context? [YES/NO]
□ Locked Decision #20 satisfied? [YES/NO]
□ AP-20 (lifecycle without validation) prevented? [YES/NO]
□ AP-21 (summary vs detail mismatch) fixed? [YES/NO]
```

**Commit:** `OB-73 Mission 4: Lifecycle validation gates + human-readable batch IDs`

---

## MISSION 5: MARKDOWN RENDERING + DEAD BUTTONS (F-16, F-31, F-32, F-33)

### The Problem
- **F-16:** AI assessment panels display raw markdown — `**bold**` shows literal asterisks instead of bold text
- **F-32:** Approve AND Reject buttons on the Adjustments page don't fire (no onClick handler or handler is empty)
- **F-31:** New Adjustment button doesn't fire
- **F-33:** Console `.trim()` TypeError in assessment and reconciliation pages — likely calling `.trim()` on undefined/null value

### The Fix

**Markdown rendering:**
Install and use `react-markdown` (or `marked` + `dangerouslySetInnerHTML` as fallback) for ALL AI-generated text panels.

```bash
cd /Users/AndrewAfrica/spm-platform/web && npm install react-markdown
```

Create a reusable component:
```typescript
// src/components/ui/MarkdownContent.tsx
'use client';
import ReactMarkdown from 'react-markdown';

export function MarkdownContent({ content }: { content: string }) {
  if (!content) return null;
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none">
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  );
}
```

Replace every `{assessment.text}` or `{assessment.summary}` or similar raw text render with `<MarkdownContent content={assessment.text} />`.

**Search for ALL AI text renders:**
```bash
grep -rn "assessment\.\|coaching\.\|analysis\.\|intelligence\." \
  src/app/ src/components/ --include="*.tsx" 2>/dev/null | \
  grep -v node_modules | grep -v .next | grep ">{.*}" | head -30
```

**Dead buttons (F-31, F-32):**
Find the Adjustments page: `src/app/investigate/adjustments/page.tsx`

Wire the buttons:
- **Approve:** `handleApprove(adjustmentId)` → call `supabase.from('adjustments').update({ status: 'approved' }).eq('id', adjustmentId)` + write audit_log
- **Reject:** `handleReject(adjustmentId)` → call `supabase.from('adjustments').update({ status: 'rejected' }).eq('id', adjustmentId)` + write audit_log
- **New Adjustment:** `handleNewAdjustment()` → open a form/modal to create a new adjustment record in the `adjustments` table (or `disputes` if adjustments are disputes)

**Before wiring buttons:** Check SCHEMA_REFERENCE.md for the actual table name and columns. It might be `disputes` not `adjustments`. The table might not have `status` — check the real column names.

**`.trim()` TypeError (F-33):**
Find every `.trim()` call in investigate/ and operate/ paths. Add null guards:
```typescript
// BEFORE (crashes on undefined):
const value = someField.trim();

// AFTER (safe):
const value = (someField ?? '').trim();
```

### Proof Gates (4)
```
PG-18: Login as admin@opticaluminar.mx. Navigate to dashboard.
       EXPECTED: AI assessment renders with proper bold, headers, lists — NO visible asterisks.
       EVIDENCE: [paste screenshot description or DOM content showing rendered markdown]

PG-19: Navigate to /investigate/adjustments. Click Approve on any adjustment.
       EXPECTED: Status changes to "Approved". Audit log written.
       EVIDENCE: [paste before/after status + audit_log query]

PG-20: Click "New Adjustment" button.
       EXPECTED: Form/modal opens. Can enter adjustment details.
       EVIDENCE: [paste what renders after clicking]

PG-21: Navigate to assessment and reconciliation pages.
       EXPECTED: Zero .trim() TypeErrors in browser console.
       EVIDENCE: [paste clean console output]
```

### Compliance Check
```
□ All AI text panels use MarkdownContent component? [YES/NO]
□ Approve/Reject write to Supabase (not in-memory)? [YES/NO]
□ Audit log written on approve/reject? [YES/NO]
□ All .trim() calls have null guards? [YES/NO]
□ Browser console clean after visiting affected pages? [YES/NO]
```

**Commit:** `OB-73 Mission 5: Markdown rendering + adjustment buttons + trim safety`

---

## MISSION 6: TENANT VISIBILITY GATES + CONTEXTUAL TITLES (F-38/F-39, F-17, Locked Decisions #17/#19)

### The Problem
- **F-38/F-39:** Tenants with no data (RetailCDMX, RetailPLGMX, Retail Conglomerate) show fabricated dashboards or stuck loading states. Demo viewers should never see these.
- **F-17:** Assessment panel title says "Governance Assessment" regardless of persona. Should be contextual.

### The Fix

**Tenant visibility (Locked Decision #17):**
On the `/select-tenant` page, filter or hide tenants that are not demo-ready.

Options (in preference order):
1. **Best:** Add `demo_ready` boolean column to `tenants` table. Set `true` for Optica Luminar and Velocidad Deportiva. Filter tenant list by `demo_ready = true` for non-VL-Admin users.
2. **Acceptable:** Add `status` enum to `tenants` (`active`, `demo`, `setup`, `hidden`). Filter by `status IN ('active', 'demo')`.

VL Admin should still see ALL tenants (they need to manage/configure hidden ones), but with a clear visual indicator showing which are demo-ready vs incomplete.

**Empty tenant handling (Locked Decision #19):**
When ANY user navigates to a tenant dashboard and `calculation_results` count = 0:
- Show a clean empty state: "No calculation data yet. Import data and run calculations to see results here."
- Do NOT show loading spinners that never resolve (F-39)
- Do NOT show AI-fabricated analysis (F-38 — covered by Mission 1)
- Do NOT show summary cards with $0 or phantom numbers

**Contextual assessment titles (F-17):**
The AI assessment panel title should reflect the user's role:
| Role | Title |
|------|-------|
| admin | Performance Governance |
| manager | Coaching Intelligence |
| viewer | My Performance Summary |
| vl_admin | Platform Assessment |

Read the user's role from the session/profile and display the appropriate title.

### Implementation

**Tenant selector gate:**
Find `src/app/select-tenant/page.tsx`. Add filtering:

```typescript
// For non-VL-Admin users, only show demo-ready tenants
const query = supabase.from('tenants').select('*');
if (userRole !== 'vl_admin') {
  query.eq('demo_ready', true);  // or .in('status', ['active', 'demo'])
}
const { data: tenants } = await query;
```

**Empty state on dashboard/operate:**
Find the dashboard and operate pages. Before rendering data views, check:
```typescript
const { count } = await supabase
  .from('calculation_results')
  .select('*', { count: 'exact', head: true })
  .eq('tenant_id', currentTenantId);

if (!count || count === 0) {
  return <EmptyState 
    title="No calculation data yet"
    description="Import data and run calculations to see results here."
    action={{ label: "Go to Import", href: "/operate/import" }}
  />;
}
```

### Proof Gates (4)
```
PG-22: Login as admin@opticaluminar.mx. Go to /select-tenant (if accessible).
       EXPECTED: Only Optica Luminar and Velocidad Deportiva visible.
       EVIDENCE: [paste tenant list]

PG-23: Login as vl_admin. Go to /select-tenant.
       EXPECTED: ALL tenants visible, but non-ready tenants marked with indicator.
       EVIDENCE: [paste tenant list with indicators]

PG-24: Select RetailCDMX as VL Admin. Navigate to dashboard.
       EXPECTED: Clean empty state — "No calculation data yet" — NOT fabricated AI data, NOT infinite loading.
       EVIDENCE: [paste what renders]

PG-25: Login as admin@opticaluminar.mx. Check assessment panel title.
       EXPECTED: "Performance Governance" (not "Governance Assessment")
       Login as gerente@opticaluminar.mx. Check assessment panel title.
       EXPECTED: "Coaching Intelligence"
       EVIDENCE: [paste both titles]
```

### Compliance Check
```
□ Non-VL-Admin users cannot see incomplete tenants? [YES/NO]
□ VL Admin sees all tenants with status indicators? [YES/NO]
□ Tenants with 0 calculation_results show empty state? [YES/NO]
□ No loading spinners that never resolve? [YES/NO]
□ Assessment title changes per role? [YES/NO]
□ Locked Decision #17 satisfied? [YES/NO]
□ Locked Decision #19 satisfied? [YES/NO]
```

**Commit:** `OB-73 Mission 6: Tenant visibility gates + contextual assessment titles`

---

## PHASE FINAL: COMPLETION REPORT + PR

### Completion Report

Create `OB-73_COMPLETION_REPORT.md` at PROJECT ROOT **BEFORE final build** with:

1. **Diagnostic Summary** — Assessment API state, persona switcher state, routing config, trial modal location, lifecycle logic, batch ID presence
2. **Architecture Decision** — Layer-based remediation with evidence
3. **Mission 1: AI Assessment Safety** — Data-existence gate, empty state response, real tenant still generates
4. **Mission 2: Persona Switcher** — signInWithPassword wired, full reload, session persists across navigation
5. **Mission 3: Landing Pages + Trial** — Role→workspace mapping, middleware routing, trial gate bypass mechanism
6. **Mission 4: Lifecycle Gates + Batch IDs** — $0 validation, override confirmation, summary/detail reconciliation, batch_label column + display
7. **Mission 5: Markdown + Buttons** — react-markdown installed, MarkdownContent component, 3 buttons wired, .trim() guards
8. **Mission 6: Tenant Visibility** — demo_ready filter, empty state component, contextual titles per role
9. **CLT-72 Findings Addressed:**

| Finding | Status | Mission | Evidence |
|---------|--------|---------|----------|
| F-38 | FIXED | 1+6 | AI safety gate + empty state |
| F-71 | FIXED | 2 | signInWithPassword re-auth |
| F-14 | FIXED | 3 | Admin → /operate |
| F-22 | FIXED | 3 | Manager → /insights |
| F-18 | FIXED | 3 | Trial modal suppressed |
| F-63 | FIXED | 4 | $0 validation gate |
| F-56 | FIXED | 4 | Summary/detail reconciled |
| F-67 | FIXED | 4 | Batch labels displayed |
| F-16 | FIXED | 5 | Markdown rendering |
| F-32 | FIXED | 5 | Approve/Reject wired |
| F-31 | FIXED | 5 | New Adjustment wired |
| F-33 | FIXED | 5 | .trim() null guards |
| F-39 | FIXED | 6 | Empty state replaces infinite loading |
| F-17 | FIXED | 6 | Role-contextual titles |

10. **Anti-Patterns Addressed:**

| AP# | Pattern | Status |
|-----|---------|--------|
| AP-18 | AI hallucination on empty data | PREVENTED — safety gate |
| AP-20 | Lifecycle without payout validation | PREVENTED — $0 gate |
| AP-21 | Summary vs detail mismatch | FIXED — single data source |

11. **Locked Decisions Enforced:**

| # | Decision | Status |
|---|----------|--------|
| 17 | Hide broken tenants | ✅ demo_ready filter |
| 18 | Persona re-auth | ✅ signInWithPassword |
| 19 | Empty state over phantom | ✅ data-existence checks |
| 20 | Batch IDs | ✅ batch_label column + display |

12. **COMPLIANCE CHECKS** — All 6 mission compliance blocks (pasted, not summarized)
13. **ALL PROOF GATES** — 25 total, evidence for every gate
14. **STANDING RULE COMPLIANCE**
15. **KNOWN ISSUES**

### Section F Quick Checklist

```
Before submitting completion report, verify:
□ Architecture Decision committed before implementation?
□ Anti-Pattern Registry checked — zero violations?
□ Scale test: works for 10x current volume?
□ AI-first: zero hardcoded field names/patterns added?
□ All Supabase migrations executed AND verified with DB query?
□ Proof gates verify LIVE/RENDERED state, not file existence?
□ Browser console clean on localhost?
□ Real data displayed, no placeholders?
□ Single code path (no duplicate pipelines)?
□ Atomic operations (clean state on failure)?
```

### Create PR

```bash
cd /Users/AndrewAfrica/spm-platform && \
gh pr create --base main --head dev \
  --title "OB-73: CLT-72 Remediation — AI Safety, Persona Auth, Lifecycle Gates, UX Fixes" \
  --body "## What This OB Delivers — CLT-72 Browser Truth Fixes

### Mission 1: AI Assessment Safety (F-38)
- Data-existence gate on ALL AI generation paths
- Tenants with 0 calculation_results get 'No data' — NEVER fabricated analysis
- AP-18 permanently prevented

### Mission 2: Persona Switcher Re-Auth (F-71)
- signInWithPassword() on every persona switch
- Full page reload — session persists across navigation
- RLS enforcement on switched persona

### Mission 3: Landing Page Routing (F-14, F-22, F-18)
- Admin → /operate, Manager → /insights, Viewer → /my-compensation
- Trial/upgrade modal suppressed for demo tenants

### Mission 4: Lifecycle Validation Gates (F-63, F-56, F-67)
- Block advancement when all payouts = \$0 (with override confirmation)
- Summary/detail reconciliation — single data source
- Human-readable batch IDs (OL-2026-02-001 format)

### Mission 5: Markdown + Dead Buttons (F-16, F-31, F-32, F-33)
- react-markdown for all AI text panels
- Approve/Reject/New Adjustment buttons wired to Supabase
- .trim() null guards throughout

### Mission 6: Tenant Visibility (F-38, F-39, F-17)
- demo_ready filter hides incomplete tenants from non-VL-Admin
- Empty state replaces infinite loading and phantom data
- Role-contextual assessment titles

## 14 CLT-72 findings addressed | 3 anti-patterns prevented | 4 locked decisions enforced
## Proof Gates: 25 — see OB-73_COMPLETION_REPORT.md"
```

**Commit:** `OB-73 Final: Completion report + PR`

---

## MAXIMUM SCOPE

6 missions, 25 proof gates, 14 CLT-72 findings addressed. After this OB:

1. AI never fabricates analysis on empty data ✓
2. Persona switcher creates real auth sessions ✓
3. Each role lands on the correct workspace ✓
4. Lifecycle requires non-zero payouts to advance ✓
5. All AI text renders as proper markdown ✓
6. Broken tenants hidden, empty states clean ✓

**DO NOT** fix RetailCDMX data pipeline issues (F-48, F-49, F-52, F-53). Those are data quality problems requiring separate investigation.
**DO NOT** consolidate import UX (F-27, F-29). That's architectural — future OB.
**DO NOT** consolidate duplicate namespaces or remove stubs. That's cleanup — future OB.
**DO NOT** fix period detection (F-48, AP-22). That requires import pipeline rework.

**REMAINING CLT-72 findings for future batches:** F-15, F-20, F-21, F-23, F-24, F-25, F-26, F-27, F-28, F-29, F-30, F-34, F-35, F-36, F-37, F-40, F-41, F-42, F-43, F-44, F-46, F-47, F-48, F-49, F-50, F-51, F-52, F-53, F-54, F-55, F-57, F-58, F-59, F-60, F-61, F-62, F-64, F-65, F-66, F-68, F-69, F-70.

---

## ANTI-PATTERNS TO WATCH

- **AP-7**: No placeholder confidence scores in AI safety gate
- **AP-11**: Empty states must be real components, not blank pages
- **AP-13**: Check SCHEMA_REFERENCE.md before any new queries
- **AP-17**: Single persona auth path (not a parallel switcher + direct login)
- **AP-18**: The entire reason Mission 1 exists
- **AP-20**: The entire reason Mission 4 exists
- **AP-21**: Summary/detail mismatch must be traced to root cause

---

*OB-73 — February 21, 2026*
*"CLT-72 found the truth. OB-73 fixes it."*
*"58 findings. 14 fixed this batch. The browser is the judge."*
