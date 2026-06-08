# HF-265 — Production Resilience: Rounding, Interpretation Recovery, Auth Investigation

## §0 — Standing Rules

Read `CC_STANDING_ARCHITECTURE_RULES.md`. Anti-Pattern Registry checked every build. Architecture Decision Gate: this HF modifies existing surfaces only — no new tables, no new agents, no new pipeline stages. Drafting discipline per `INF_Structured_Compliant_Drafting_Reference_20260513.md`.

Commit + push after each phase. Build gate before completion report.

---

## §1 — Problem Statement

Five production-resilience gaps observed in a single session (2026-06-02), all blocking proof-tenant verification or user experience:

**P4 — Component payout rounding.** The calculation engine emits raw floating-point component payouts. Meridian C5 (Utilización de Flota) produces 373.16, 424.92, 582.81 when GT expects 373, 425, 583. C1–C4 produce integers from rate tables (masking the gap). `Math.round()` matches GT 21/21 across all sampled C5 values. Floor matches 8/21. Rounding is absent, not broken.

**P2 — Orphaned-completed-claim blocking.** `plan_interpretation_runs` row with `status='completed'` pointing to a deleted `rule_set` silently blocks re-import. `findCompletedRuleSet` returns null, platform logs "no completed rule_set yet" and skips interpretation. No error surfaced. Hit 3× this session (Meridian, CRP). HF-264 handles stale `in_progress` claims only — orphaned `completed` claims are unhandled.

**P3 — No retry on component construction failure.** Plan orchestrator Phase B runs each component with `attempt=1/1`. When the LLM emits malformed CompositionalIntent (missing `shape`/`kind` discriminants on branch nodes), the component dies permanently as `cognition_violation`. CRP Plan 3 `cross-sell-bonus` fails reproducibly: `$.structure.then: branch is neither a structure (shape field) nor an operand (kind field)`. Same plan succeeded 2026-05-18. The per-component isolation infrastructure exists (Backlog 7.11 design) but retry count is hardcoded to 1.

**P5 — Misleading construction error message.** User sees: "Plan interpretation produced no components. The LLM may have received incomplete plan text or could not extract structure." Actual cause is a specific structural validation failure in the intent constructor. The construction error string exists at throw time but is not surfaced.

**P1 — Auth/MFA redirect on tenant selection.** Browser Network capture proves: login 200 → select-tenant 307 → tenant fetch 200 → ALL tenant data (entities/periods/calc_batches/rule_sets/import_batches/classification_signals) return 200 → routed to `auth/mfa/verify`. No 401. No failed token refresh. Supabase responding normally. The user is redirected to MFA verification on every tenant selection — this is a navigation/routing condition, not session expiry. Build-log lint warnings include `useEffect has a missing dependency: 'onMfaRoute'` and `useEffect has a missing dependency: 'currentTenant'`.

**Combined-treatment rationale:** P2/P3/P5 share `plan-interpretation.ts` and `plan-orchestration.ts`. P4 is `calculation/run/route.ts`. P1 is auth/middleware (read-only investigation). All are production-resilience surfaces observed in one session. Dependency: P2 unblocks CRP import; P3 unblocks CRP Plan 3; P4 closes Meridian penny gap; P1 diagnoses UX instability.

---

## §2 — Substrate-Bound Discipline Applications

**Decision 158 (LLM Recognition + Code Construction):** P3 retry does not alter the LLM→deterministic boundary. The LLM still emits CompositionalIntent JSON; deterministic code still constructs PrimeNode trees. Retry re-invokes the LLM emission with a structural hint — the deterministic constructor's rejection reason — so the LLM can correct its output. The constructor validation is unchanged.

**Progressive Performance (constitutional):** P4 rounding preserves convergence — C1–C4 already produce integers, so `Math.round` is a no-op for them. C5's fractional values round to GT-matching integers. No convergence binding is altered.

**SR-39 (Compliance Verification Gate):** P1 touches auth/session/routing observation only — no code changes to auth surfaces. Read-only investigation. If the investigation reveals a fix, that fix is out of scope for this HF and requires its own SR-39 review.

**Reconciliation-channel separation:** P4 rounding verification uses architect-channel GT comparison only. CC reports calculated values verbatim.

---

## §3 — Phase 1: Auth/MFA Redirect Investigation (read-only)

**Objective:** Determine what condition routes the user to `/auth/mfa/verify` on tenant selection. No code changes.

**P1.1 — Read the auth-state determination.**

```bash
cat web/src/lib/auth/getServerAuthState.ts
```

Paste the full function. Identify: where does it check MFA status? What conditions produce a "redirect to MFA verify" result? What does `onMfaRoute` mean in this context?

**P1.2 — Read the middleware.**

```bash
cat web/src/middleware.ts
```

Paste the full file. Identify: routing logic that redirects to `/auth/mfa/verify`. What request path triggers it? Is there a condition that fires on tenant-selection navigation?

**P1.3 — Read the select-tenant page's auth effect.**

```bash
grep -n 'onMfaRoute\|mfa\|verify\|redirect\|router.push\|router.replace' web/src/app/select-tenant/page.tsx | head -20
grep -n 'onMfaRoute\|mfa\|verify\|redirect\|router.push\|router.replace' web/src/app/auth/mfa/verify/page.tsx | head -20
```

**P1.4 — Check for recent changes to auth routing.**

```bash
git log --oneline -20 -- web/src/lib/auth/ web/src/middleware.ts web/src/app/select-tenant/ web/src/app/auth/
```

**P1.5 — Report.** Paste:
- The condition(s) that trigger MFA redirect
- Whether any recent commit (last 10) modified this path
- Whether the `useEffect missing dependency: 'onMfaRoute'` lint warning could cause stale-closure routing (a stale `onMfaRoute` value could incorrectly evaluate to true when it shouldn't)
- Your assessment: is this a regression from recent work, a pre-existing condition, or an MFA enrollment state issue?

No code changes in this phase. Report only.

---

## §4 — Phase 2: Orphaned-Completed-Claim Fix + Component Retry + Error Surfacing

These three modifications are in the same two files and are interdependent (retry produces more opportunities for orphaned claims; error surfacing reports what retry couldn't fix). They ship as one commit.

**P2.1 — Orphaned-completed-claim fix.**

Read `web/src/lib/sci/plan-interpretation.ts`. Locate the block where `claimRun` returns `{ claimed: false }` and `findCompletedRuleSet` is called (currently near line 173-180 per HF-264 completion report).

Current logic:
```
const claim = await claimRun(...);
if (!claim.claimed) {
  const concurrent = await findCompletedRuleSet(...);
  // if concurrent exists, return its rule_set
  // if concurrent is null, log and return empty (BLOCKED HERE)
}
```

Add: when `findCompletedRuleSet` returns null on a `{ claimed: false }` result, delete the orphaned claim row and re-attempt `claimRun`:

```typescript
if (!concurrent) {
  // HF-265: orphaned completed claim — rule_set was deleted but claim row survived.
  // Delete the orphaned row and re-claim.
  await supabase.from('plan_interpretation_runs')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('content_hash', contentHash);
  console.log(`[SCI plan-interp] HF-265: deleted orphaned claim for content_hash=${contentHash.substring(0, 12)} (completed row with no surviving rule_set) — re-attempting interpretation`);
  const reClaim = await claimRun(supabase, tenantId, contentHash, sourceFileName);
  if (!reClaim.claimed) {
    // Another process claimed between delete and re-claim — respect it
    console.warn(`[SCI plan-interp] HF-265: re-claim after orphan cleanup failed — another process holds the claim`);
    return planUnits.map((u, i) => ({ /* existing empty return shape */ }));
  }
  // Fall through to interpretation below
}
```

**HALT-1:** The `findCompletedRuleSet` function does not query `plan_interpretation_runs` — it queries `rule_sets` directly. If so, the orphan detection logic must check `plan_interpretation_runs` status directly. Read `findCompletedRuleSet` in `plan-idempotency.ts` and paste its query before implementing.

**P2.2 — Component construction retry.**

Read `web/src/lib/sci/plan-orchestration.ts`. Locate the per-component construction loop in Phase B. Find where `attempt=1/1` is set and where `cognition_violation` is classified as non-retryable.

Change the maximum attempts for `cognition_violation` from 1 to 3. On retry, pass the prior attempt's error message as a structural hint to the LLM:

```typescript
// On cognition_violation retry, append to the component construction prompt:
// "Prior attempt failed validation: <error_message>. Ensure every branch node
// has either a 'shape' field (making it a structure) or a 'kind' field (making it an operand)."
```

The retry hint is structural (references `shape`/`kind` discriminants), not domain-specific. Korean Test compliant.

**HALT-2:** The orchestrator's per-component call goes through a function that doesn't accept retry hints (the prompt is constructed elsewhere and the orchestrator only passes the component spec). If threading the error message requires modifying the prompt-construction path, report the actual function signature and call site. Do not modify the prompt template — only thread the hint parameter.

**HALT-3:** `cognition_violation` is already classified as retryable but with max_attempts=1. If there's a separate `retryable` flag per error class, report the classification mechanism.

**P2.3 — Error message surfacing.**

In `plan-interpretation.ts`, locate the log line:
```
Refusing to persist rule_set — Plan interpretation produced no components. The LLM may have received incomplete plan text or could not extract structure.
```

Modify to include the actual component construction errors:

```typescript
const failureDetails = failedComponents
  .map(f => `${f.name}: ${f.error}`)
  .join('; ');
console.error(`[SCI plan-interp] Refusing to persist rule_set — ${succeeded}/${total} components succeeded. Failures: ${failureDetails}`);
```

Ensure the same detail reaches the UI response (the `error` field in the planUnit return object). The user should see which component failed and why, not a generic extraction message.

**HALT-4:** The failed-component details are not available at the point where the "refusing to persist" message is logged. If the orchestrator returns only a count (not per-component errors), report what it returns.

Commit: `HF-265 P2: orphaned-claim recovery, component retry (3 attempts), construction error surfacing`

---

## §5 — Phase 3: Component Payout Rounding

**P3.1 — Locate the component payout assembly.**

```bash
grep -n 'payout\|component.*result\|total_payout\|componentPayout\|Math.round' web/src/app/api/calculation/run/route.ts | head -30
```

Also check the intent executor output:

```bash
grep -n 'payout\|result\|return.*value\|evaluate' web/src/lib/calculation/intent-executor.ts 2>/dev/null | head -20
```

Paste the block where the per-component numeric result is captured from DAG/intent evaluation and stored.

**P3.2 — Verify no existing rounding.**

```bash
grep -n 'Math.round\|toFixed\|ROUND\|decimal\|precision' web/src/app/api/calculation/run/route.ts | head -20
```

**HALT-5:** Existing rounding logic is present but not firing. Report what it does and why it's bypassed.

**P3.3 — Apply `Math.round` at component output.** At the point where each component's payout value is captured from evaluation, apply `Math.round()`:

```typescript
const componentPayout = Math.round(rawEvaluationResult);
```

This is applied ONCE, at the per-component output level. NOT inside the DAG evaluator (preserve intermediate precision). NOT at the grand-total level (per-component rounding is the correct granularity).

**HALT-6:** Multiple code paths for different component types produce the payout value at different sites. Report all paths with pasted code.

Commit: `HF-265 P3: component payout rounding (Math.round at engine output)`

---

## §5A — Build Gate

```bash
rm -rf .next && npm run build
npm run dev
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
```

Build must succeed. Dev server must respond.

---

## §5B — Reporting Discipline

Completion report file: `HF-265_PRODUCTION_RESILIENCE_COMPLETION.md` at project root.

Structure:
- P1 findings (auth/MFA investigation — pasted evidence, assessment, recommended next step)
- P2.1 orphaned-claim fix diff
- P2.2 retry mechanism diff + retry-hint threading (or HALT-2 report)
- P2.3 error surfacing diff
- P3 rounding diff
- Build gate output
- HALT disposition log (each HALT: CLEAR / TRIGGERED + evidence)

Push. `gh pr create --base main --head dev --title "HF-265: Production resilience — rounding, interpretation recovery, auth investigation" --body "Closes Meridian penny gap (Math.round at component output). Adds component construction retry (3 attempts for cognition_violation). Fixes orphaned-completed-claim blocking. Surfaces actual construction errors to UI. Includes read-only auth/MFA redirect investigation."`

---

## §6 — Out of Scope

- Per-tenant currency precision configuration (MXN integer vs USD cents). Current fix rounds to nearest integer matching all three proof tenants.
- Rounding inside the DAG evaluator. Intermediate precision preserved.
- Progressive Performance durable cache for plan interpretation (content-hash → surviving rule_set across clean-slate). Architecture item, not a one-phase fix.
- Auth/MFA code changes. P1 is investigation only. Any fix ships as a separate HF after SR-39 review.
- CanonicalWriter retry/backoff (HF-260 ADR R2). Separate surface — signal writes, not plan interpretation.
- Component retry prompt template modification. Retry hint is threaded as a parameter, not a prompt rewrite.

## §6A — Residuals

- If P1 investigation confirms the MFA redirect is a stale-closure regression from a recent merge, the fix HF should target the specific `useEffect` dependency array. SR-39 applies.
- If P2.2 retry does not recover CRP Plan 3 after 3 attempts, the `cross-sell-bonus` conditional shape needs a prompt-coverage investigation (the emission template may not constrain `then`-branch structure sufficiently). Separate DIAG scoped to the CompositionalIntent emission prompt.
- `0 retryable on reimport` log field: after this HF, `cognition_violation` components that exhaust 3 attempts should be classified as `retryable on reimport` so the user knows a re-import may succeed. If the retryable classification mechanism doesn't support this, note in completion report.
