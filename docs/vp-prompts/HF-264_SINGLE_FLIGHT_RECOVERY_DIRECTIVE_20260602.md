# HF-264 — Single-Flight Claim Recovery

## §0 — CC Standing Rules

Read `CC_STANDING_ARCHITECTURE_RULES.md`. Commit + push after every phase. Build gate before completion. Git from repo root.

---

## §1 — Problem Statement

The HF-259 single-flight mechanism in `plan-interpretation.ts` / `plan-idempotency.ts` strands `in_progress` claims when an uncaught exception occurs between `claimRun` and `completeRun`/`failRun`. The stranded claim blocks ALL future imports of the same plan document permanently. No TTL. No user-facing error. No recovery path. Two production occurrences in two days (BCL 2026-06-01, Meridian 2026-06-02).

**HF-260 ADR evidence (B5):** All explicit in-process exits (skeleton failure, supersession-query failure, upsert failure, success) call `failRun` or `completeRun`. Only uncaught throws are unhandled.

**This is a User-Ready blocker.** A customer who encounters a transient network error during plan import is permanently locked out of re-importing that plan with no indication of what went wrong.

---

## §2 — Substrate

**SR-34:** Structural fix, not instance-level. The fix must prevent ANY future stale claim, not just clear the current one.

**T1-E910 (Korean Test):** TTL is a numeric duration, not a domain-specific or language-specific value.

---

## §3 — Phase Prose

### §3.1 — Phase 1: Diagnostic Read

**P1.1 — Read `plan-idempotency.ts`.** Paste the full file. It's small (the ADR referenced it as fully degrade-safe with try/catch on every helper). Identify:
- `claimRun` function: how it inserts/checks the `in_progress` row
- `completeRun` function: how it transitions to `completed`
- `failRun` function: how it transitions to `failed`
- The `plan_interpretation_runs` table shape (columns, constraints)
- Whether the claim check considers row age

```bash
cat web/src/lib/sci/plan-idempotency.ts
```

**P1.2 — Read the claim lifecycle in `plan-interpretation.ts`.** Find the block between `claimRun` and `completeRun`/`failRun`. Paste the try/catch structure (or lack thereof) around the interpretation block. Identify every path from claim to completion/failure.

```bash
grep -n 'claimRun\|completeRun\|failRun\|try\|catch\|finally' web/src/lib/sci/plan-interpretation.ts
```

Then view the full block from `claimRun` to the function's end.

**P1.3 — Check current stale claims.** Query the production state:

```bash
cat > /tmp/hf264_diag.ts << 'SCRIPT'
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
  const { data } = await supabase
    .from('plan_interpretation_runs')
    .select('*')
    .eq('status', 'in_progress')
    .order('created_at', { ascending: false });
  console.log(`Stale in_progress claims: ${data?.length || 0}`);
  for (const r of (data || [])) {
    const age = Date.now() - new Date(r.created_at).getTime();
    console.log(`  id=${r.id} tenant=${r.tenant_id} content_hash=${r.content_hash} age=${Math.round(age/60000)}min created=${r.created_at}`);
  }
}
main().catch(console.error);
SCRIPT
cd ~/spm-platform && npx tsx /tmp/hf264_diag.ts
```

Paste full output.

Commit: `HF-264 Phase 1: diagnostic read of single-flight claim lifecycle`

### §3.2 — Phase 2: TTL Expiry on Stale Claims

**P2.1 — Modify `claimRun` in `plan-idempotency.ts`.** When checking for an existing `in_progress` claim, add an age check. If the existing claim is older than 5 minutes, treat it as abandoned: update its status to `'failed'` with an error note, then proceed with the new claim.

The structural change to `claimRun`:

```typescript
// Before inserting a new claim, check for stale in_progress claims
// and expire any that are older than the TTL threshold.
const CLAIM_TTL_MS = 5 * 60 * 1000; // 5 minutes

// If an existing in_progress claim exists and is older than TTL, expire it
const { data: stale } = await supabase
  .from('plan_interpretation_runs')
  .select('id, created_at')
  .eq('tenant_id', tenantId)
  .eq('content_hash', contentHash)
  .eq('status', 'in_progress')
  .single();

if (stale) {
  const ageMs = Date.now() - new Date(stale.created_at).getTime();
  if (ageMs > CLAIM_TTL_MS) {
    await supabase
      .from('plan_interpretation_runs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error: `TTL expired: claim was in_progress for ${Math.round(ageMs / 60000)} minutes`,
      })
      .eq('id', stale.id);
    console.log(`[plan-idempotency] HF-264: expired stale claim ${stale.id} (age=${Math.round(ageMs / 60000)}min)`);
    // Fall through to insert a fresh claim below
  } else {
    // Claim is recent and likely still executing — respect it
    return { claimed: false, reason: 'in_progress' };
  }
}
```

Adapt this to the actual function structure found in P1.1. The key contract: a claim older than 5 minutes is treated as abandoned. A claim younger than 5 minutes is respected. The TTL value (5 minutes) is based on observed plan interpretation times: the ADR showed Meridian Phase A+B completing in ~35 seconds; the longest observed plan interpretation (CRP 4-component) was ~27 seconds. 5 minutes provides a 10x margin.

**P2.2 — Build.** `npm run build` must succeed.

Commit: `HF-264 Phase 2: TTL expiry on stale single-flight claims (5-minute threshold)`

### §3.3 — Phase 3: try/finally Guard in plan-interpretation.ts

**P3.1 — Wrap the interpretation block.** In `plan-interpretation.ts`, wrap the block between `claimRun` and `completeRun`/`failRun` in a try/finally. The finally block calls `failRun` if `completeRun` was not already called.

The structural pattern:

```typescript
const claim = await claimRun(supabase, tenantId, contentHash);
if (!claim.claimed) {
  // existing behavior: log and return
  return;
}

let completed = false;
try {
  // ... existing interpretation block (orchestration, component construction, upsert) ...

  await completeRun(supabase, claim.runId);
  completed = true;
} catch (err) {
  // Log the error for observability
  console.error(`[SCI plan-interp] Uncaught error during interpretation:`, err instanceof Error ? err.message : String(err));
  throw err; // Re-throw so the caller sees the error
} finally {
  if (!completed) {
    try {
      await failRun(supabase, claim.runId, `Uncaught exception — claim released by finally guard`);
      console.log(`[SCI plan-interp] HF-264: finally guard released claim ${claim.runId}`);
    } catch (failErr) {
      console.warn(`[SCI plan-interp] HF-264: finally guard failRun error:`, failErr instanceof Error ? failErr.message : String(failErr));
    }
  }
}
```

Adapt to the actual structure found in P1.2. The key contract: the claim is ALWAYS released — either via `completeRun` on success or `failRun` in the finally guard. No stranded claims.

**HALT-1:** If `claimRun` returns a shape different from `{ claimed: boolean, runId: string }`, the finally guard needs the correct property name for the run identifier. Check P1.1 output.

**P3.2 — Build.** `npm run build` must succeed.

Commit: `HF-264 Phase 3: try/finally guard — claims always released on uncaught throws`

### §3.4 — Phase 4: User-Facing Log on Block

**P4.1 — Improve the single-flight log message.** The current message is:

```
HF-259 SINGLE-FLIGHT — another execution holds the claim for this content_hash (in-progress); not double-executing
```

This is an internal log. The user sees nothing — the import just silently does nothing. While a full UI notification is out of scope for this HF, make the log message actionable for anyone reading logs:

```typescript
console.warn(
  `[SCI plan-interp] HF-259 SINGLE-FLIGHT — plan interpretation blocked by an existing in-progress claim ` +
  `for content_hash=${contentHash}. If this persists, the claim may be stale ` +
  `(HF-264 TTL will auto-expire claims older than 5 minutes on next import attempt).`
);
```

**P4.2 — Build.** `npm run build` must succeed.

Commit: `HF-264 Phase 4: improved single-flight block logging`

### §3.5 — Phase 5: Verification + PR

**P5.1 — Clear the current stale claims** via the fix itself: run a fresh plan import for Meridian. The TTL expiry (Phase 2) should detect the stale claim, expire it, and proceed with interpretation. Check the logs for:
- `HF-264: expired stale claim` (TTL fired)
- Phase A skeleton + Phase B component construction output (interpretation proceeding)
- Plan saved with components

If the plan interpretation succeeds, report the log output. If it fails, report the error.

**P5.2 — PR creation.**

```bash
gh pr create --base main --head dev \
  --title "HF-264: Single-flight claim recovery — TTL + try/finally guard" \
  --body "Fixes plan import blocking when a prior interpretation stranded an in_progress claim. TTL expires claims older than 5 minutes. try/finally ensures claims are always released on uncaught throws. Two production incidents (BCL 2026-06-01, Meridian 2026-06-02). User-Ready blocker."
```

Report: log output from the Meridian plan re-import (showing TTL expiry + successful interpretation), PR URL.

---

## §4 — HALT Conditions

**HALT-1:** `claimRun` return shape differs from expected. Check P1.1 and adapt the finally guard to use the correct run identifier property.

**HALT-2:** `plan_interpretation_runs` table does not have a `created_at` column (needed for TTL age calculation). If absent, use another timestamp column or add one. Report the table schema.

**HALT-3:** The Meridian plan re-import after the fix does NOT trigger TTL expiry (no `expired stale claim` log line). This means either the stale claim was already cleared, or the TTL check isn't reaching the right row. Report the diagnostic query output from P1.3 alongside the import log.

---

## §5 — Reporting

Completion report at `docs/completion-reports/HF-264_SINGLE_FLIGHT_RECOVERY_COMPLETION.md`. Include: P1.1 code read, P1.3 stale claim query output, Phase 2-4 diffs, Meridian plan re-import log showing TTL expiry + successful interpretation.

---

## §6 — Out of Scope

- Full UI notification for single-flight blocks (requires frontend work)
- Retry logic for transient network errors during plan interpretation (R2 from HF-260 ADR — separate surface)
- Data import hang mechanism (R3 from HF-260 ADR — separate surface)
- HF-263 verification (blocked on this fix; resumes after plan imports successfully)

## §6A — Residuals

- **UI notification:** Users still see no indication when a plan import is blocked. The TTL auto-recovery means the block is temporary (max 5 minutes), but the user experience is still "nothing happened." A future HF should surface import status in the UI.
- **CanonicalWriter retry/backoff (HF-260 ADR R2):** Transient `fetch failed` errors on signal writes need retry logic. Independent of this HF.
