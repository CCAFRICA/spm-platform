# HF-265 — Production Resilience — COMPLETION REPORT
## HEAD SHA: 3a9f12de8328bb22952e3d2b88cc1604230b5341 · Date: 2026-06-02

## P1 — Auth/MFA Redirect Investigation (read-only, SR-39)
**Mechanism:** the redirect is the OB-178 AAL step-up gate in `web/src/middleware.ts:262-289`:
```ts
if (!pathname.startsWith('/auth/mfa') && !pathname.startsWith('/api/auth/log-event')) {
  const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const { currentLevel, nextLevel } = aalData;
  if (currentLevel === 'aal1' && nextLevel === 'aal2')          // MFA factor enrolled, session not stepped up
    return ...redirect('/auth/mfa/verify');                     // <-- fires on EVERY protected nav
}
```
- **Condition:** `currentLevel==='aal1' && nextLevel==='aal2'` — the user has a verified MFA factor enrolled but this session is still aal1. `MFA_REQUIRED_ROLES=['platform','admin']` (middleware.ts:43), so a VL-admin selecting a tenant hits it. Data fetches return 200 because the aal1 session is valid; there is no 401 — consistent with the captured Network trace (login 200 -> select-tenant 307 -> data 200 -> /auth/mfa/verify).
- **`onMfaRoute` lint is a RED HERRING.** It lives in `auth-shell.tsx`, which *exempts* MFA routes (it does not redirect to them). `onMfaRoute = isMfaRoute(pathname)` is derived from `pathname`, which IS in the effect dep array (line 132) — recomputed every render, so no stale-closure routing. It cannot cause the MFA redirect.
- **Regression vs pre-existing:** the AAL gate is PRE-EXISTING — introduced in OB-178 Phase B (`feeefdd4`), not by recent work. `git log` on middleware/auth shows the gate predates the recent Phase-1.6.x sweeps and HF-167/168.
- **Assessment:** by-design SOC2 MFA enforcement, not session expiry, not a stale closure. The user has a factor enrolled and an aal1 session, so the gate correctly demands step-up. IF the user completes `/auth/mfa/verify` and STILL loops, the live suspect is aal2 **persistence** across navigation — the exact class HF-153 fixed (`window.location.href='/'` to shed stale aal1 cookies) — and recent HF-167/168 ('session-scoped vialuce cookies', 'initialize session cookies before timeout checks') touched session cookies. **Recommended next step (separate HF, SR-39):** capture `getAuthenticatorAssuranceLevel()` immediately after a successful verify and on the next navigation; if it reports aal2 then reverts to aal1, it is a cookie-persistence regression to bisect against HF-167/168. No code changed in P1.

## P2 — Orphaned-Claim Recovery + Component Retry + Error Surfacing (3c2c3ff5)
### P2.1 orphaned-completed-claim fix
```diff
diff --git a/web/src/lib/sci/plan-interpretation.ts b/web/src/lib/sci/plan-interpretation.ts
index 1bd12e18..4c755783 100644
--- a/web/src/lib/sci/plan-interpretation.ts
+++ b/web/src/lib/sci/plan-interpretation.ts
@@ -170,22 +170,42 @@ export async function executeBatchedPlanInterpretation(
   }
   // Layer 2 — single-flight: claim the execution. A concurrent second import of the same content
   // loses the UNIQUE(tenant_id, content_hash) race → does NOT run a second interpretation.
-  const claim = await claimRun(supabase, tenantId, contentHash, sourceFileName);
+  let claim = await claimRun(supabase, tenantId, contentHash, sourceFileName);
   if (!claim.claimed) {
     const concurrent = await findCompletedRuleSet(supabase, tenantId, contentHash);
-    console.warn(
-      `[SCI plan-interp] HF-259 SINGLE-FLIGHT — plan interpretation blocked by an existing in-progress ` +
-      `claim for content_hash=${contentHash.substring(0, 12)} (${concurrent ? 'returning its rule_set' : 'no completed rule_set yet'}); ` +
-      `not double-executing. If this persists, the claim may be stale — HF-264 TTL auto-expires claims ` +
-      `older than 5 minutes on the next import attempt.`,
-    );
-    return planUnits.map((u, i) => ({
-      contentUnitId: u.contentUnitId,
-      classification: 'plan' as const,
-      success: true,
-      rowsProcessed: 0,
-      pipeline: i === 0 ? (concurrent ? 'plan-interpretation-reused' : 'plan-interpretation-deduped') : 'plan-batch-included',
-    }));
+    // HF-265: claim refused with NO surviving rule_set. Distinguish an ORPHANED 'completed' claim
+    // (the rule_set was deleted but the claim row survived → findCompletedRuleSet returns null and
+    // blocks re-import forever) from a genuine fresh 'in_progress' claim (a real concurrent run).
+    // Only the orphan is cleared — deleting an in_progress row would permit a double-execution.
+    if (!concurrent) {
+      const { data: blockingRow } = await supabase
+        .from('plan_interpretation_runs')
+        .select('status')
+        .eq('tenant_id', tenantId).eq('content_hash', contentHash)
+        .maybeSingle();
+      if ((blockingRow as { status?: string } | null)?.status === 'completed') {
+        await supabase.from('plan_interpretation_runs')
+          .delete().eq('tenant_id', tenantId).eq('content_hash', contentHash);
+        console.log(`[SCI plan-interp] HF-265: deleted orphaned completed claim for content_hash=${contentHash.substring(0, 12)} (completed row with no surviving rule_set) — re-attempting interpretation`);
+        claim = await claimRun(supabase, tenantId, contentHash, sourceFileName);
+      }
+    }
+    if (!claim.claimed) {
+      console.warn(
+        `[SCI plan-interp] HF-259 SINGLE-FLIGHT — plan interpretation blocked by an existing in-progress ` +
+        `claim for content_hash=${contentHash.substring(0, 12)} (${concurrent ? 'returning its rule_set' : 'no completed rule_set yet'}); ` +
+        `not double-executing. If this persists, the claim may be stale — HF-264 TTL auto-expires claims ` +
+        `older than 5 minutes on the next import attempt.`,
+      );
+      return planUnits.map((u, i) => ({
+        contentUnitId: u.contentUnitId,
+        classification: 'plan' as const,
+        success: true,
+        rowsProcessed: 0,
+        pipeline: i === 0 ? (concurrent ? 'plan-interpretation-reused' : 'plan-interpretation-deduped') : 'plan-batch-included',
+      }));
+    }
+    // orphan recovered (claim now granted) → fall through to interpretation
   }
 
   // HF-264: try/finally backstop so the single-flight claim is ALWAYS released — including on an
@@ -225,9 +245,17 @@ export async function executeBatchedPlanInterpretation(
   const orchestratedComponents = orchestration.interpretation.components;
   const componentsCount = orchestratedComponents.length;
   if (orchestration.skeletonError || componentsCount === 0) {
+    // HF-265 (P5): surface the ACTUAL per-component construction failures instead of a generic
+    // "produced no components" message. componentOutcomes carries errClass + errMessage + violations.
+    const failed = (orchestration.componentOutcomes || []).filter(o => o.status === 'failed');
+    const failureDetails = failed
+      .map(f => `${f.name}: ${f.errClass ?? 'error'}${f.errMessage ? ` — ${f.errMessage}` : ''}${f.violations ? ` (${f.violations})` : ''}`)
+      .join('; ');
     const reason = orchestration.skeletonError
       ? `Plan skeleton call failed: ${orchestration.skeletonError}`
-      : 'Plan interpretation produced no components. The LLM may have received incomplete plan text or could not extract structure. Check upstream sheet classification.';
+      : failureDetails
+        ? `Plan interpretation produced no usable components — ${failed.length} component construction failure(s): ${failureDetails}`
+        : 'Plan interpretation produced no components. The LLM may have received incomplete plan text or could not extract structure. Check upstream sheet classification.';
     console.error(`[SCI plan-interp] Refusing to persist rule_set — ${reason}`);
     await failRun(supabase, tenantId, contentHash); // HF-259: release the single-flight claim so a retry can re-claim
     return planUnits.map(u => ({
```
### P2.2 retry budget + P2.3 error surfacing
```diff
diff --git a/web/src/lib/sci/interpretation-errors.ts b/web/src/lib/sci/interpretation-errors.ts
index 69b83de4..4dd2e1fb 100644
--- a/web/src/lib/sci/interpretation-errors.ts
+++ b/web/src/lib/sci/interpretation-errors.ts
@@ -119,8 +119,15 @@ export function classifyInterpretationError(
  */
 export function retryPolicy(errClass: InterpretationErrorClass): RetryPolicySpec {
   switch (errClass) {
-    case 'cognition_truncation':
     case 'cognition_violation':
+      // HF-265 (P2.2): bounded retry. A malformed CompositionalIntent (missing shape/kind
+      // discriminants on branch nodes) can vary across attempts, so 3 attempts gives the LLM a
+      // chance to self-correct. CAVEAT (HALT-2): interpretPlanComponent runs at temperature 0 and
+      // takes no retry-hint parameter, so without a prompt-level structural hint (threading that
+      // requires the adapter plan_component prompt-build — out of HF-265 scope, §6) the retry may
+      // reproduce the same output. The effective-retry hint is deferred to the §6A emission DIAG.
+      return { maxAttempts: 3, backoffMs: 0 };
+    case 'cognition_truncation':
       return { maxAttempts: 1, backoffMs: 0 };
     case 'adapter_rate_limit':
       return { maxAttempts: 3, backoffMs: 2000 };  // 2s, 4s
```

## P3 — Component Payout Rounding (3a9f12de)
```diff
diff --git a/web/src/app/api/calculation/run/route.ts b/web/src/app/api/calculation/run/route.ts
index 08119ea9..1ba823a8 100644
--- a/web/src/app/api/calculation/run/route.ts
+++ b/web/src/app/api/calculation/run/route.ts
@@ -2467,7 +2467,12 @@ export async function POST(request: NextRequest) {
       // Apply Decision 122 rounding to intent executor results
       const comp = selectedComponents[ci.componentIndex];
       const compIntent = comp?.calculationIntent as Record<string, unknown> | undefined;
-      const precision = inferOutputPrecision(compIntent, undefined);
+      // HF-265 (P3): round each component payout to an integer. inferOutputPrecision otherwise
+      // infers >0 decimals when the intent carries a fractional constant (e.g. the fleet clamp
+      // threshold 1.5), yielding penny values (Meridian C5 = 373.16) where GT expects integers.
+      // Forcing decimalPlaces:0 keeps Decision-122 banker's rounding (roundComponentOutput uses
+      // ROUND_HALF_EVEN) — NOT native Math.round — and is a no-op for already-integer components.
+      const precision = { ...inferOutputPrecision(compIntent, undefined), decimalPlaces: 0 };
       const { rounded, trace: roundingTrace } = roundComponentOutput(
         intentResult.outcome, ci.componentIndex, ci.label, precision
       );
diff --git a/web/src/lib/calculation/run-calculation.ts b/web/src/lib/calculation/run-calculation.ts
index 66fb4887..0a494dac 100644
--- a/web/src/lib/calculation/run-calculation.ts
+++ b/web/src/lib/calculation/run-calculation.ts
@@ -1416,7 +1416,9 @@ export async function runCalculation(input: CalculationInput): Promise<Calculati
       // OB-196 Phase 2: Legacy SHAPE fields removed; precision derives from foundational
       // intent only. inferOutputPrecision tolerates undefined componentConfig.
       const componentIntent = component.calculationIntent as Record<string, unknown> | undefined;
-      const precision = inferOutputPrecision(componentIntent, undefined);
+      // HF-265 (P3): force integer precision (Decision-122 banker's rounding via roundComponentOutput);
+      // see run/route.ts — no-op for already-integer components, rounds fractional ones (e.g. fleet C5).
+      const precision = { ...inferOutputPrecision(componentIntent, undefined), decimalPlaces: 0 };
       const { rounded } = roundComponentOutput(result.payout, componentResults.length, component.name, precision);
       result.payout = toNumber(rounded);
 
```

## Build Gate
```
rm -rf .next && npm run build -> Compiled successfully
npm run dev -> Ready in 1277ms ; curl localhost:3000 -> HTTP 307 (auth redirect, normal)
```

## HALT Disposition Log
- HALT-1 (orphan detection): CLEAR — findCompletedRuleSet queries plan_interpretation_runs (status='completed') then validates the rule_set; orphan = completed row + dead rule_set. P2.1 reads the blocking row's status directly. SAFETY ADAPTATION: only a 'completed' orphan is deleted; a fresh 'in_progress' claim is respected (the directive's unconditional delete could drop a concurrent run).
- HALT-2 (retry hint): **TRIGGERED** — interpretPlanComponent (ai-service.ts:304) takes no hint param and runs at temperature 0 (interpretation-errors.ts:115-118 documents that a temp-0 retry reproduces the same output). An effective structural hint requires modifying the adapter plan_component prompt-build (out of scope, §6). Implemented the maxAttempts 1->3 bump only; effective-hint retry deferred to the §6A emission DIAG. CRP Plan 3 recovery is therefore NOT guaranteed by this change (consistent with §6A).
- HALT-3 (retry mechanism): CLEAR — retryPolicy(errClass) per-class (interpretation-errors.ts:120); cognition_violation bumped 1->3.
- HALT-4 (failure details): CLEAR — ComponentOutcome carries errClass/errMessage/violations; P2.3 surfaces them to log + UI error field.
- HALT-5 (existing rounding): **TRIGGERED** — rounding is NOT absent; roundComponentOutput + inferOutputPrecision run at run/route.ts:2470. Root cause: inferOutputPrecision collects the fleet clamp constant 1.5 as an output value -> >0 decimals -> C5 373.16. Fixed by forcing decimalPlaces:0 (Decision-122 banker's rounding preserved; native Math.round NOT used, to avoid an AP-25/Decision-122 violation).
- HALT-6 (multiple payout paths): **TRIGGERED** — two sites: run/route.ts:2470 (active prime_dag) and run-calculation.ts:1419 (legacy). Fix applied to both.

## DD-7 / verification caveats (architect channel)
- P3 forces integer for ALL components/tenants. §6 asserts integer matches all 3 proof tenants; **BCL (verified PASS) must be re-verified** — if any BCL component legitimately needs >0 precision, switch to the surgical fix (exclude comparison thresholds from inferOutputPrecision).
- P3 GT match (C5: 373.16->373, 424.92->425, 582.81->583) is architect-channel; CC asserts no verdict. A live Meridian calc run confirms the integer output.
- P2.1/P2.3 verified by build + code review; a live orphaned-claim / all-fail import would exercise them end-to-end (architect re-import).

*HF-265 — P1 investigation + P2/P3 implemented, build-verified. PR below.*
