# OB-71: AI INTELLIGENCE LAYER + AUTH AUDIT + ACCUMULATED FIXES

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST: CC_STANDING_ARCHITECTURE_RULES.md

Before reading further, open and read the COMPLETE file `CC_STANDING_ARCHITECTURE_RULES.md` at the project root. Every decision in this OB must comply with all sections (A through F).

Also read: `SCHEMA_REFERENCE.md` — the authoritative column reference for every Supabase query.

---

## ⚠️ CC COMPLIANCE ENFORCEMENT

### THE THREE VIOLATIONS THAT KEEP RECURRING

**VIOLATION 1: Inventing schema instead of checking it.**
RULE: Before writing ANY Supabase query, verify every column name against SCHEMA_REFERENCE.md.

**VIOLATION 2: Creating parallel implementations instead of wiring existing code.**
RULE: Before creating ANY new file, `grep -rn` for existing implementations. Extend, don't duplicate.

**VIOLATION 3: Claiming PASS via code review instead of proving with live tests.**
RULE: Every proof gate marked "browser test" or "SQL query" must include PASTED OUTPUT.

### COMPLIANCE CHECKPOINTS (Mandatory at end of each Mission)

```
COMPLIANCE CHECK — Mission N
=============================
□ Every column name verified against SCHEMA_REFERENCE.md? [YES/NO — list tables]
□ Searched for existing implementations before creating new files? [YES/NO — list grep commands]
□ Every state change persists to Supabase? [YES/NO — list write operations]
□ Proof gates proven with pasted output, not described? [YES/NO]
□ Anti-Pattern Registry checked? [YES/NO — list AP#]
□ Scale test: would this work for 150K entities? [YES/NO]
```

**If ANY checkbox is NO without justification, the mission is INCOMPLETE.**

---

## WHY THIS OB EXISTS

**Three categories of work converge in this OB:**

### 1. AUTH IS BROKEN IN PRODUCTION
The login page does not work as expected. We have a history of 8 auth hotfixes (HF-023 through HF-032, HF-041 through HF-043, HF-050) that each addressed symptoms without fully resolving the root cause. The demo persona system bypasses real Supabase auth. A comprehensive audit and definitive fix is required before any customer touches the platform.

### 2. AI INTELLIGENCE LAYER — THE DIFFERENTIATOR
Vialuce claims "Intelligence. Acceleration. Performance." The Assessment Panels, coaching agendas, and anomaly detection are what separate this platform from a spreadsheet. With HF-055 now persisting training signals, the AI infrastructure is ready to power consumer-facing intelligence.

### 3. ACCUMULATED GAPS FROM OB-68 THROUGH HF-055
Five OBs/HFs have shipped without browser-verified CLT. Items flagged but not fixed include: locale inconsistency, status badge rendering, proof gates claimed via code review not browser test, sync getSignals() still returning [], assessment route bypassing AIService. These get cleaned up here.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000 responds
3. Final step: `gh pr create --base main --head dev`
4. **Fix logic, not data.** Do not insert test data.
5. **Commit this prompt to git as first action.**
6. **profiles.id ≠ auth.uid(). Use auth_user_id.**
7. **Check SCHEMA_REFERENCE.md before any Supabase query.**
8. **RequireRole uses useAuth() not usePersona().**

---

## SCHEMA TRUTH — TABLES INVOLVED IN THIS OB

From SCHEMA_REFERENCE.md:

**profiles**: id, tenant_id, **auth_user_id**, display_name, email, role, capabilities, locale, avatar_url, created_at, updated_at

**classification_signals**: id, tenant_id, entity_id, signal_type, **signal_value** (jsonb), confidence, source, context, created_at

**calculation_results**: id, tenant_id, **batch_id**, entity_id, rule_set_id, period_id, **total_payout**, components, metrics, attainment, metadata, created_at

**calculation_batches**: id, tenant_id, period_id, rule_set_id, batch_type, **lifecycle_state**, entity_count, summary, config, started_at, completed_at, created_by, created_at, updated_at

**entity_period_outcomes**: id, tenant_id, entity_id, period_id, total_payout, rule_set_breakdown, component_breakdown, lowest_lifecycle_state, attainment_summary, metadata, materialized_at

**entities**: id, tenant_id, external_id, display_name, entity_type, status, profile_id, created_at, updated_at

**periods**: id, tenant_id, label, period_type, status, start_date, end_date, canonical_key, metadata, created_at, updated_at

---

## ACCUMULATED ITEMS FROM OB-68 THROUGH HF-055

These items were flagged during review but not fixed. They are incorporated into the missions below.

| # | Item | Source | Incorporated In |
|---|------|--------|----------------|
| 1 | Browser proof gates claimed via code review, not browser tested (PG-1C, 4B, 4C, 5D in OB-69; similar in OB-70) | OB-69 + OB-70 review | Mission 6 |
| 2 | Period locale inconsistency — header shows English, bar shows Spanish | OB-70 CLT, flagged but not in completion report | Mission 5 |
| 3 | Status badges — OB-70 diagnostic says "active shows nothing by design" but OB-67 claimed they render | OB-67/70 | Mission 5 |
| 4 | Sync getSignals() still returns [] (callers must use getSignalsAsync) | HF-055 Known Issue #1 | Mission 5 |
| 5 | Assessment route /api/ai/assessment bypasses AIService | HF-055 Known Issue #2, backlog #13 | Mission 3 |
| 6 | HF-055 committed to PR #63 instead of creating PR #64 | HF-055 review | Noted, not actionable |
| 7 | OB-70 Mission 5 replaced Spanish with English, not domain-agnostic | OB-70 review | Mission 5 |
| 8 | Demo persona auth bypass — pre-existing from HF-050/HF-031 | OB-69 CLT | Mission 1 |
| 9 | Calculation not yet triggered — Run Preview wired but unverified in production | OB-70 CLT | Mission 6 |
| 10 | OB-68 disputes: pages may still call old sync functions despite OB-70 rewrite | OB-68/70 | Mission 5 |

---

## PHASE 0: DIAGNOSTIC (MANDATORY — BEFORE ANY CODE)

### 0A: Full auth flow audit

```bash
echo "============================================"
echo "OB-71 PHASE 0A: AUTH FLOW AUDIT"
echo "============================================"

echo ""
echo "=== Login page ==="
find web/src/app -path "*login*" -name "page.tsx" | head -5
LOGIN_PAGE=$(find web/src/app -path "*login*" -name "page.tsx" | head -1)
echo "File: $LOGIN_PAGE"

echo ""
echo "=== What login page does on mount ==="
grep -n "useEffect\|onMount\|getSession\|getUser\|signIn\|redirect\|router\.push\|window\.location" "$LOGIN_PAGE" | head -20

echo ""
echo "=== Login form submit handler ==="
grep -n "handleSubmit\|signIn\|signInWith\|onSubmit\|login" "$LOGIN_PAGE" | head -10

echo ""
echo "=== Middleware auth check ==="
grep -n "getUser\|getSession\|auth\.uid\|user.*null\|redirect.*login\|NextResponse\.redirect" web/src/middleware.ts | head -20

echo ""
echo "=== Middleware cookie handling ==="
grep -n "cookies\|Set-Cookie\|setAll\|getAll\|cookie.*set\|cookie.*get" web/src/middleware.ts | head -15

echo ""
echo "=== Auth provider / context ==="
find web/src -name "*auth*" | grep -E "(context|provider|hook|shell)" | grep -v node_modules | sort
for f in $(find web/src -name "*auth*" | grep -E "(context|provider|shell)" | grep -v node_modules | head -3); do
  echo "--- $f ---"
  grep -n "getSession\|getUser\|signOut\|redirect\|isAuthenticated\|loading\|setUser" "$f" | head -15
done

echo ""
echo "=== Demo persona system ==="
grep -rn "persona\|Persona\|usePersona\|demo.*user\|demo.*auth\|VL Platform Admin" web/src/contexts/ --include="*.tsx" | head -15
grep -rn "persona\|demo.*fallback\|auto.*auth" web/src/middleware.ts | head -10

echo ""
echo "=== AuthShell or auth gate ==="
grep -rn "AuthShell\|AuthGate\|ProtectedRoute\|RequireAuth" web/src/ --include="*.tsx" | grep -v node_modules | head -10

echo ""
echo "=== What happens when user hits / unauthenticated ==="
echo "(Trace: middleware → login redirect → login page mount → auth check)"
grep -n "pathname.*===.*'/'" web/src/middleware.ts | head -5
grep -n "redirect.*login\|login.*redirect" web/src/middleware.ts | head -5

echo ""
echo "=== Supabase client creation for middleware ==="
grep -B2 -A10 "createServerClient\|createMiddlewareClient" web/src/middleware.ts | head -25

echo ""
echo "=== All auth-related HF files ==="
ls -la HF-0*AUTH* HF-0*auth* HF-0*LOGIN* HF-0*login* 2>/dev/null
ls -la HF-02[3-9]* HF-03[0-2]* HF-04[1-3]* HF-050* 2>/dev/null
```

### 0B: Current AI assessment infrastructure

```bash
echo "============================================"
echo "OB-71 PHASE 0B: AI ASSESSMENT AUDIT"
echo "============================================"

echo ""
echo "=== Assessment API route ==="
find web/src/app/api -path "*assessment*" -name "route.ts" | head -5
ASSESS_ROUTE=$(find web/src/app/api -path "*assessment*" -name "route.ts" | head -1)
echo "File: $ASSESS_ROUTE"
head -50 "$ASSESS_ROUTE" 2>/dev/null

echo ""
echo "=== Does it use AIService or call Anthropic directly? ==="
grep -n "AIService\|getAIService\|anthropic\|Anthropic\|messages\.create" "$ASSESS_ROUTE" 2>/dev/null | head -10

echo ""
echo "=== Assessment panel components ==="
grep -rn "Assessment\|AssessmentPanel\|aiAssessment\|AiAssessment" web/src/components/ web/src/app/ --include="*.tsx" | grep -v node_modules | head -15

echo ""
echo "=== Persona-specific dashboard pages ==="
find web/src/app -path "*perform*" -name "page.tsx" | head -5
find web/src/app -path "*operate*" -name "page.tsx" | head -5
find web/src/app -path "*my-compensation*" -name "page.tsx" | head -5

echo ""
echo "=== What data is available for assessment context? ==="
echo "(calculation_results, entity_period_outcomes, classification_signals)"
grep -rn "calculation_results\|entity_period_outcomes\|classification_signals" web/src/lib/data/persona-queries.ts | head -10
```

### 0C: Accumulated gaps verification

```bash
echo "============================================"
echo "OB-71 PHASE 0C: ACCUMULATED GAPS CHECK"
echo "============================================"

echo ""
echo "=== 1. Locale inconsistency — period header vs bar ==="
grep -rn "period.*label\|formatPeriod\|period.*display\|toLocaleString.*month\|monthNames" web/src/ --include="*.tsx" --include="*.ts" | grep -v node_modules | head -15

echo ""
echo "=== 2. Status badges rendering ==="
grep -rn "StatusBadge\|status.*badge\|badge.*status\|getPageStatus" web/src/components/navigation/ --include="*.tsx" | head -10

echo ""
echo "=== 3. Sync getSignals still returns [] ==="
grep -n "getSignals\b" web/src/lib/ai/training-signal-service.ts | head -5

echo ""
echo "=== 4. Assessment route bypasses AIService ==="
ASSESS_ROUTE=$(find web/src/app/api -path "*assessment*" -name "route.ts" | head -1)
grep -n "AIService\|getAIService\|anthropic\|Anthropic" "$ASSESS_ROUTE" 2>/dev/null

echo ""
echo "=== 5. Any remaining dispute sync calls? ==="
grep -rn "getAllDisputes\b\|getDispute\b" web/src/app/ --include="*.tsx" | grep -v "Async\|async\|api/disputes" | head -10

echo ""
echo "=== 6. Remaining hardcoded English labels from OB-70 that should be domain-agnostic ==="
grep -rn "'Total Revenue'\|'Total Sales'\|'Commission'\|'Avg Ticket'" web/src/app/ --include="*.tsx" | grep -v node_modules | head -15
```

### 0D: Document findings

Create `OB-71_DIAGNOSTIC.md` at project root with:
1. **Auth flow:** Complete trace from unauthenticated browser → what happens. Login form → submit → what API. Cookie behavior. Demo persona bypass mechanism.
2. **AI Assessment:** Current route, does it use AIService, what components exist, what data is available.
3. **Accumulated gaps:** Status of each of the 10 items listed above.

### Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-0A | Diagnostic file exists | File check | All 3 sections with evidence |
| PG-0B | Auth flow fully traced | Diagnostic section 1 | Login → middleware → session → persona chain documented |
| PG-0C | Assessment infrastructure mapped | Diagnostic section 2 | Route, components, data sources identified |

**Commit:** `OB-71 Phase 0: Diagnostic — auth flow, AI assessment, accumulated gaps`

---

## MISSION 1: AUTH AUDIT AND FIX

### WHY THIS IS MISSION 1

No customer can use the platform if login doesn't work. The demo persona system has been masking auth issues for months. This mission produces a definitive, working auth flow.

### 1A: Document the current auth chain

From Phase 0 findings, write a complete auth flow document:

```
UNAUTHENTICATED USER → vialuce.ai/
1. Middleware intercepts: [what happens exactly]
2. Redirect to /login: [is it clean? does it carry cookies?]
3. Login page renders: [does it show the form?]
4. User enters credentials + submits: [what API is called?]
5. Supabase returns session: [how is it stored?]
6. Redirect to dashboard: [what mechanism?]
7. Dashboard renders: [does it verify auth?]

AUTHENTICATED USER → vialuce.ai/
1. Middleware intercepts: [what happens?]
2. Session found: [how?]
3. Pass through to page: [clean?]

DEMO PERSONA → what bypasses auth?
1. Where is the persona context set without login?
2. What fallback data does it provide?
3. How does this interact with real Supabase auth?
```

### 1B: Fix the auth flow

Based on the diagnostic, fix whatever is broken. Common patterns from our history:

**Pattern A: Middleware cookie leak** (HF-032 root cause)
- Supabase middleware client sets cookies on the redirect response
- Fix: Use fresh `NextResponse.redirect()` for unauthenticated redirects, NOT the response object with cookie handlers

**Pattern B: Login page redirects authenticated users on mount** (HF-029, HF-030)
- Login page checks auth state on mount and immediately redirects if session found
- Fix: Login page should ONLY redirect after explicit user login action, not on mount

**Pattern C: Demo persona auto-authenticates** (HF-050)
- PersonaContext or similar provides a fallback user without Supabase session
- Fix: Ensure persona context REQUIRES a valid Supabase session. No fallback user without auth.

**Pattern D: AuthShell renders content during loading** (HF-031)
- React tree renders protected content while auth state is "loading"
- Fix: AuthShell shows loading/redirect until auth state is definitively determined

**CRITICAL RULE:** Do NOT add a 9th layer of auth defense. Fix the actual root cause. If middleware correctly rejects unauthenticated requests and login page correctly shows a form, that's sufficient.

### 1C: Verify on localhost

```
AUTH CLT — OB-71
=================
1. Kill dev server, clear all cookies, open incognito
2. Navigate to localhost:3000/ → MUST show login page (not dashboard, not spinner loop)
3. Check Network tab: single 307 → /login, then 200 on /login. No redirect loops.
4. Check console: zero auth errors
5. Enter credentials → submit → MUST redirect to dashboard
6. Refresh dashboard page → MUST stay on dashboard (session persists)
7. Click logout → MUST return to login page
8. Navigate to localhost:3000/ after logout → MUST show login page again
9. Check cookies after logout: zero sb-* auth cookies remaining
```

### Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-1A | Auth flow documented | OB-71_DIAGNOSTIC.md section 1 | Complete chain with file:line references |
| PG-1B | Unauthenticated → login page (not dashboard) | Browser test — PASTE | Incognito, no cookies, shows login form |
| PG-1C | Login form submits and authenticates | Browser test | Credentials → dashboard |
| PG-1D | Session persists across page refresh | Browser test | Refresh → stays on dashboard |
| PG-1E | Logout returns to login | Browser test | Logout → login page, no auto-redirect back |
| PG-1F | Zero redirect loops | Network tab — PASTE | Clean 307 → 200, no loops |

```
COMPLIANCE CHECK — Mission 1
=============================
□ Every column name verified against SCHEMA_REFERENCE.md? [YES/NO — profiles]
□ Searched for existing implementations before creating new files? [YES/NO]
□ Every state change persists to Supabase? [YES/NO — session via Supabase auth]
□ Proof gates proven with pasted output, not described? [YES/NO]
□ Anti-Pattern Registry checked? [YES/NO]
□ Scale test: would this work for 150K entities? [YES/NO]
```

**Commit:** `OB-71 Mission 1: Auth audit and fix — login flow verified end-to-end`

---

## MISSION 2: AI ASSESSMENT PANELS — ADMIN PERSONA

### 2A: Route assessment through AIService

The `/api/ai/assessment` route currently bypasses AIService and calls Anthropic directly (HF-055 Known Issue #2). Fix this:

1. Find the assessment route
2. Replace the direct Anthropic call with `getAIService().execute()` or the appropriate AIService method
3. This ensures: provider abstraction, signal capture (via AIService's automatic `captureAIResponse()`), and consistent error handling

### 2B: Build the Admin Assessment Panel component

Create a reusable `AssessmentPanel` component that:
1. Calls GET `/api/ai/assessment` with context parameters (tenantId, periodId, persona)
2. Displays a loading skeleton while AI processes
3. Renders the AI response as structured sections (not raw text)
4. Caches the result per period + data hash (no repeated calls for same data)

**Admin persona context for assessment prompt:**
- Total entities in period: COUNT from calculation_results
- Total payout: SUM from calculation_results
- Average payout: AVG
- Payout distribution: top 10%, bottom 10%, median
- Anomalies: entities with payouts > 2 standard deviations from mean
- Lifecycle state: current calculation_batches.lifecycle_state
- Period: current period label

**Admin assessment output structure:**
```
GOVERNANCE SUMMARY
- [1-2 sentences: overall health of the calculation batch]

ANOMALY ALERTS
- [List of statistical anomalies with entity count and description]
- Example: "14 entities have identical $0 payouts — verify data completeness"

RECOMMENDED ACTIONS
- [2-3 specific next steps based on data state]
```

### 2C: Wire into Operate dashboard

Add the AssessmentPanel to the Operate page (`/operate`), visible when a calculation batch exists for the selected period. When no calculation exists, show the existing "No calculation results" empty state.

### Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-2A | Assessment route uses AIService | grep output | `getAIService()` or `AIService` in route |
| PG-2B | AssessmentPanel component exists | File check | Renders loading → content → error states |
| PG-2C | Admin dashboard shows assessment | Browser or code review | Panel visible on /operate when results exist |
| PG-2D | Assessment cached per period | Code review | No repeated API calls for same period+data |

```
COMPLIANCE CHECK — Mission 2
=============================
□ Every column name verified against SCHEMA_REFERENCE.md? [YES/NO]
□ Searched for existing implementations before creating new files? [YES/NO]
□ Every state change persists to Supabase? [YES/NO — assessment cached]
□ Proof gates proven with pasted output, not described? [YES/NO]
□ Anti-Pattern Registry checked? [YES/NO — AP-17 (single AIService path)]
□ Scale test: would this work for 150K entities? [YES/NO — aggregated stats, not per-entity calls]
```

**Commit:** `OB-71 Mission 2: AI Assessment Panel — admin persona on Operate dashboard`

---

## MISSION 3: COACHING AGENDAS — MANAGER PERSONA

### 3A: Manager assessment context

The manager persona needs different AI context than admin:
- Their team's entities (filtered by manager scope or all if unscoped)
- Per-entity payout breakdown from calculation_results
- Entities close to tier thresholds (within 5% of next tier)
- Entities with declining attainment trends (if multi-period data exists)
- Entities with zero or anomalous payouts

### 3B: Coaching agenda output

The AI generates a coaching agenda — not a dashboard, but actionable text:

```
TEAM SUMMARY
- [1-2 sentences: team performance overview]

COACHING PRIORITIES
1. Meet with [Entity Name] — 3% from next tier threshold. 
   Current attainment: 97%. Next tier at 100% unlocks +$X bonus.
   
2. Review [Entity Name] — zero payout this period.
   Last period: $X. Investigate data gap or performance issue.
   
3. Recognize [Entity Name] — top performer, 142% attainment.
   Consider for team lead or mentor assignment.

TEAM TRENDS
- [1-2 observations about team-level patterns]
```

### 3C: Wire into Perform dashboard (manager view)

The Perform workspace shows different content per persona. For Manager, add the coaching agenda panel.

### Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-3A | Manager assessment has team-scoped context | Code review | Queries filtered by manager's entities |
| PG-3B | Coaching agenda generates actionable items | Code review or browser | Entity names + specific thresholds |
| PG-3C | Panel renders on manager Perform dashboard | Browser or code review | Visible when persona = manager |

```
COMPLIANCE CHECK — Mission 3
=============================
□ Every column name verified against SCHEMA_REFERENCE.md? [YES/NO]
□ Searched for existing implementations before creating new files? [YES/NO]
□ Every state change persists to Supabase? [YES/NO]
□ Proof gates proven with pasted output, not described? [YES/NO]
□ Anti-Pattern Registry checked? [YES/NO]
□ Scale test: would this work for 150K entities? [YES/NO — aggregated, limited to manager's team]
```

**Commit:** `OB-71 Mission 3: AI Coaching Agenda — manager persona on Perform dashboard`

---

## MISSION 4: ANOMALY DETECTION + REP ASSESSMENT

### 4A: Statistical anomaly detection

Build a utility that analyzes calculation_results for a period and identifies:
1. **Identical values**: N entities with the exact same payout (suggests systematic issue)
2. **Outliers**: Entities with payouts > 2 standard deviations from mean
3. **Zero payouts**: Entities with $0 when they have committed_data (suggests calculation gap)
4. **Missing entities**: Entities with rule_set_assignments but no calculation_results

This is statistical detection — NO AI call needed. Pure math on the result set.

```typescript
interface Anomaly {
  type: 'identical_values' | 'outlier_high' | 'outlier_low' | 'zero_payout' | 'missing_entity';
  entityCount: number;
  description: string;      // Human-readable
  entities: string[];        // entity_ids (first 10)
  value?: number;           // The anomalous value
  threshold?: number;       // What was expected
}
```

### 4B: AI interpretation of anomalies

Pass the statistical anomalies to the AI for natural language interpretation:

```
ANOMALY ANALYSIS
- 14 entities have identical $0 payouts. This typically indicates missing transaction data 
  for these entities in the current period. Verify import completeness.
- 3 entities have payouts > $8,000 (2.3x the average). Review for data entry errors 
  or verify they are high-performing entities in the source data.
```

### 4C: Rep personal assessment

For the rep/viewer persona, a simpler assessment:
- Their own payout for the period
- Comparison to previous period (if available)
- Which components contributed most
- Distance from next tier threshold

### 4D: Wire anomalies into admin assessment + rep into Perform

Add anomaly section to the admin AssessmentPanel (Mission 2).
Add rep personal assessment to My Compensation or Perform (rep view).

### Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-4A | Anomaly detection utility exists | File check | Identifies 4+ anomaly types |
| PG-4B | AI interprets anomalies | Code review | Anomalies passed to assessment prompt |
| PG-4C | Rep assessment renders | Browser or code review | Personal payout + trends visible |

```
COMPLIANCE CHECK — Mission 4
=============================
□ Every column name verified against SCHEMA_REFERENCE.md? [YES/NO]
□ Searched for existing implementations before creating new files? [YES/NO]
□ Every state change persists to Supabase? [YES/NO]
□ Proof gates proven with pasted output, not described? [YES/NO]
□ Anti-Pattern Registry checked? [YES/NO]
□ Scale test: would this work for 150K entities? [YES/NO — aggregated stats]
```

**Commit:** `OB-71 Mission 4: Anomaly detection + rep assessment`

---

## MISSION 5: ACCUMULATED FIXES

This mission addresses the 10 items accumulated from OB-68 through HF-055.

### 5A: Locale consistency

Fix the period display so header badge and period selector bar use the same locale. Both should read from the tenant's locale setting (or the user's profile locale).

### 5B: Status badge verification

From Phase 0, determine whether badges render as designed. If "active" pages intentionally show nothing, document that. If badges should show and don't, fix the rendering.

### 5C: Sync getSignals deprecation

The sync `getSignals()` in training-signal-service.ts still returns `[]`. Either:
- Add a deprecation warning that logs when called: `console.warn('[Deprecated] Use getSignalsAsync() instead')`
- Or redirect sync callers to async version

Find all callers of the sync version and migrate them:
```bash
grep -rn "getSignals()" web/src/ --include="*.ts" --include="*.tsx" | grep -v "Async\|async" | grep -v node_modules
```

### 5D: Remaining English-hardcoded labels

OB-70 replaced Spanish with English, not domain-agnostic. Audit the 3 files that were changed (insights/performance, insights/compensation, insights/my-team) and determine if labels like "Total Revenue", "Total Sales", "Commission" should be domain-agnostic (they should if they're platform-defined, not if they come from tenant data).

### 5E: Remaining dispute sync calls

Verify OB-70's dispute rewrite is complete — no remaining sync `getAllDisputes()` or `getDispute()` calls in any page.

### Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-5A | Locale consistent | Code review | Period displays use single locale source |
| PG-5B | Badge behavior documented | Diagnostic or code review | Clear explanation of what renders when |
| PG-5C | Zero sync getSignals callers | grep output | All callers use async version |
| PG-5D | Hardcoded labels audited | grep output | Count of remaining hardcoded labels documented |
| PG-5E | Zero sync dispute calls | grep output | No getAllDisputes() without Async |

```
COMPLIANCE CHECK — Mission 5
=============================
□ Every column name verified against SCHEMA_REFERENCE.md? [YES/NO]
□ Searched for existing implementations before creating new files? [YES/NO]
□ Every state change persists to Supabase? [YES/NO]
□ Proof gates proven with pasted output, not described? [YES/NO]
□ Anti-Pattern Registry checked? [YES/NO — AP-5, AP-6]
□ Scale test: would this work for 150K entities? [YES/NO]
```

**Commit:** `OB-71 Mission 5: Accumulated fixes — locale, badges, signal deprecation, labels, disputes`

---

## MISSION 6: INTEGRATION CLT + BUILD

### 6A: Browser CLT on localhost

Walk through these scenarios and verify. For EACH scenario, document PASS/FAIL with evidence.

```
INTEGRATION CLT — OB-71
=========================

AUTH FLOW (from Mission 1):
1. Incognito → localhost:3000/ → shows login page (not dashboard)
2. Login with credentials → redirects to dashboard
3. Dashboard shows real data (or clean empty state)
4. Refresh → stays authenticated
5. Logout → returns to login
6. Post-logout → / redirects to login

OPERATE DASHBOARD (from OB-70 + Mission 2):
7. /operate → lifecycle stepper renders
8. Run Preview button fires (Network tab shows POST)
9. Assessment panel renders (if calculation results exist)
10. Period selector changes period context

PERFORM DASHBOARD (from Mission 3):
11. Manager persona → coaching agenda visible
12. Rep persona → personal assessment visible

ENTITY VISIBILITY (from OB-70):
13. /configure/people → entity roster with external_id
14. /configure/users → user table (accessible from sidebar)

CONSOLE CLEAN:
15. Zero 406 errors on any page
16. Zero unhandled errors on any page
17. Only acceptable warnings (font preload)
```

### 6B: Build clean

```bash
cd web && rm -rf .next && npx tsc --noEmit && npm run build && npm run dev
```

### Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-6A | 17-point CLT all documented | Completion report | PASS/FAIL with evidence for each |
| PG-6B | Auth flow passes all 6 checks | Browser tests — PASTE | Incognito verified |
| PG-6C | Build clean | npm run build | Exit 0 |
| PG-6D | Dev server responds | curl localhost:3000 | 200 or 307 |

```
COMPLIANCE CHECK — Mission 6
=============================
□ Every column name verified against SCHEMA_REFERENCE.md? [YES/NO]
□ Searched for existing implementations before creating new files? [YES/NO]
□ Every state change persists to Supabase? [YES/NO]
□ Proof gates proven with pasted output, not described? [YES/NO]
□ Anti-Pattern Registry checked? [YES/NO — AP-9, AP-10]
□ Scale test: would this work for 150K entities? [YES/NO]
```

**Commit:** `OB-71 Mission 6: Integration CLT + build clean`

---

## PHASE FINAL: COMPLETION REPORT + PR

Create `OB-71_COMPLETION_REPORT.md` at PROJECT ROOT with:

1. **Diagnostic Summary** — Auth chain, AI infrastructure, accumulated gaps
2. **Mission 1: Auth** — What was broken, what was fixed, browser verification evidence
3. **Mission 2: Admin Assessment** — Route through AIService, panel component, caching
4. **Mission 3: Manager Coaching** — Team-scoped context, coaching agenda output
5. **Mission 4: Anomaly + Rep** — Statistical detection, AI interpretation, rep assessment
6. **Mission 5: Accumulated Fixes** — Each of the 10 items: fixed or documented with justification
7. **Mission 6: CLT** — All 17 items with PASS/FAIL and evidence
8. **AI Signal Inventory Update:**

| Persona | Assessment Panel | Data Sources | Cached? |
|---------|-----------------|--------------|---------|
| Admin | Governance + Anomalies | calc_results, entity_period_outcomes | Per period |
| Manager | Coaching Agenda | calc_results filtered by team | Per period |
| Rep | Personal Assessment | calc_results for entity | Per period |

9. **COMPLIANCE CHECKS** — All 6 mission blocks
10. **ALL PROOF GATES** — 28 total
11. **STANDING RULE COMPLIANCE**
12. **KNOWN ISSUES**

### PR

```bash
gh pr create --base main --head dev \
  --title "OB-71: AI Intelligence Layer + Auth Fix + Accumulated Polish" \
  --body "## What This OB Delivers

### Mission 1: Auth Audit & Fix
- Complete auth flow audit and fix
- Login page works in incognito (no bypass)
- Session persistence verified
- Logout clears all auth state

### Mission 2: Admin Assessment Panel
- Assessment route through AIService (not direct Anthropic)
- Governance summary + anomaly alerts + recommended actions
- Cached per period + data hash

### Mission 3: Manager Coaching Agenda
- Team-scoped entity analysis
- Actionable coaching items with entity names and thresholds
- Wired to Perform dashboard (manager view)

### Mission 4: Anomaly Detection + Rep Assessment
- Statistical anomaly detection (identical values, outliers, zeros, missing)
- AI interpretation of anomalies
- Rep personal assessment on Perform

### Mission 5: Accumulated Fixes
- Locale consistency
- Badge verification
- Sync getSignals deprecation
- Label audit
- Dispute sync cleanup

### Mission 6: Integration CLT
- 17-point browser verification
- Auth flow: 6 checks
- All pages: zero 406, zero errors

## Proof Gates: 28 — see OB-71_COMPLETION_REPORT.md"
```

**Commit:** `OB-71 Final: Completion report + PR`

---

## MAXIMUM SCOPE

6 missions, 28 proof gates. This OB delivers:

1. Auth works definitively ✓
2. Admin sees AI governance assessment ✓
3. Manager sees AI coaching agenda ✓
4. Anomaly detection identifies data issues ✓
5. Rep sees personal assessment ✓
6. Accumulated gaps from 5 prior OBs cleaned up ✓
7. 17-point browser CLT ✓

**DO NOT** build Five Layers of Proof (OB-72). **DO NOT** build the full reconciliation experience. **DO NOT** refactor the calculation engine. **DO NOT** build billing or Stripe integration.

---

## ANTI-PATTERNS TO WATCH

- **AP-5/AP-6**: No hardcoded field names or language-specific strings in AI prompts
- **AP-11**: Assessment panels show REAL data, not mock
- **AP-13**: All queries use SCHEMA_REFERENCE.md columns
- **AP-17**: Single AIService path (no bypassing for assessment)

---

*OB-71 — February 21, 2026*
*"Intelligence is the product. If the AI doesn't speak, the platform is just another spreadsheet."*
