# HF-286 — SCI Session-State Poller Terminal-Stop

**Repo:** `CCAFRICA/spm-platform` (VP)
**Authored:** 2026-06-13 (architect channel)
**Type:** HF — ships code. Two client component edits. No server change, no SQL, no schema reference.
**Number:** HF-286 (next-free, read from repo in DIAG-067 OUTPUT §1.2: highest on record HF-285; 286 free in filenames + full git history).
**Origin:** the two pollers were introduced/left unbounded in the OB-203/HF-285 arc. This HF closes the resource-waste defect that arc created. Diagnosed in `docs/diagnostics/DIAG-067_SCI_SESSION_STATE_POLLING_RECON_OUTPUT.md` — read it; this HF authors against its verbatim findings.
**Branch + PR:** author on a working branch `hf/286-session-state-poller-terminal-stop`, PR to `main` (main is branch-protected — never push to it directly; the `diag/*`→PR convention that carried DIAG-067 PR #488 applies identically here). The final step is `gh pr create --base main --head hf/286-session-state-poller-terminal-stop`.

---

## §0 — CC Standing Rules header

`CC_STANDING_ARCHITECTURE_RULES.md` governs — read it top-to-bottom before executing. Binding throughout:
- **Rule 7 (Prove, Don't Describe)** — the proof gate is LIVE server-log evidence (poll counts before/after), not "I added a condition."
- **Rule 9 (IAP Gate)** — this touches UI behavior; it scores on Performance (eliminates hundreds of wasted invocations per operation) and does not regress Intelligence/Acceleration (live update behavior preserved).
- **SR-41 (Revert Discipline)** — never force-push; main is protected; ship via PR.
- **DD-7 (behavior-preservation)** — this HF preserves the pollers' live-update function exactly and adds *only* a terminal-stop guard. No cadence change, no behavioral expansion. The stop condition is the entire change.
- **DD-8 (fully qualified paths, no placeholders)** — every shell command below uses a literal path; the branch name is literal; no `<current-branch>`.

Drafting-discipline source: `INF_Structured_Compliant_Drafting_Reference_20260513.md`. This file IS the prompt; the phase prose (§3 / §3B / §3C) is the executable; there is no §7 / no "CC Execution Block" / no tail summary; the file ends at §6A.

**Reconciliation-channel separation:** this HF contains no ground-truth values, no tenant reconciliation targets, no calculation surface. It must not introduce any.

**FP-49 SQL Verification Gate: NOT REQUIRED** (DIAG-067 OUTPUT §4.2). The fix authors no SQL, references no columns/tables, and does not modify the session-state route or its single `import_session_telemetry` read. FP-49 guards the *authoring* of schema-coupled SQL (AP-18/AP-19); there is none here. CC writes no SQL in this HF; if any step appears to require SQL, that is a scope breach — HALT-3.

---

## §1 — Problem Statement

Two client-side pollers hit `/api/import/sci/session-state` on a fixed `setInterval` and **never stop at terminal state** — `clearInterval` runs only on component unmount. They keep polling after all work has settled, including the entire time a proposal sits on screen awaiting a user click. This wastes Vercel invocations continuously and renders production server logs unusable for diagnosis. This is the binding symptom: hundreds of polls per operation with nothing left to fetch.

Both pollers have a **legitimate live-update function that must be preserved**:
- `SCIProposal.tsx` polls so failed-interpretation units update live on their cards while the user reviews (a retry/assign clears the failed marker through the durable `SessionStateView` read — see `SCIProposal.tsx:402`). **Preserve:** live per-unit state during review.
- `ImportTelemetryPanel.tsx` polls to show live progress during analyzing/executing. **Preserve:** live progress during active work.

The defect is the **absence of a stop condition**, not the polling itself. The fix is purely additive: a terminal/settled guard that stops the interval once there is nothing left to update. No live-update behavior changes.

**The state-semantics subtlety this fix must get right** (DIAG-067 OUTPUT §2.4, §4, line 231): the session-level signal `view.isOpen` is computed server-side as `units.some(u => u.state !== 'bound' && u.state !== 'resolved')` (`session-telemetry-accumulator.ts:311`). So `isOpen === false` ⇔ every unit is `bound`/`resolved`. **But `failed_interpretation` (rank −1, retryable, terminal-but-awaiting-human) keeps `isOpen === true`.** A proposal awaiting user action on a failed unit is therefore NOT covered by `!isOpen` alone — stopping on `!isOpen` would leave the exact §1 symptom (failed units holding on cards while the user decides) polling forever. The correct stop predicate is **"every unit is settled"** — i.e. every unit is in `{bound, resolved, failed_interpretation}` (nothing in-flight) — which strictly subsumes `!isOpen`. Both the per-unit `state` union and `isOpen` are already on the wire in the response both pollers already fetch.

**Authoritative state contract** (DIAG-067 OUTPUT §2.4, verbatim from `web/src/lib/sci/comprehension-state-service.ts`):
```ts
export type UnitComprehensionState =
  | 'persisted' | 'profiled' | 'recognized' | 'comprehended'
  | 'classified' | 'bound' | 'failed_interpretation' | 'resolved';
```
Terminal/settled per-unit states for this fix: `bound` (terminal success), `resolved` (terminal, supersedes), `failed_interpretation` (terminal-but-awaiting-human, retryable). Settled-set = `{ 'bound', 'resolved', 'failed_interpretation' }`. A unit in any other state is in-flight → keep polling.

---

## §2 — Architecture Decision (before any code)

**Decision: add a shared settled-set predicate, consume it as a terminal-stop guard in both pollers, change nothing else.**

- The stop predicate is **per-unit settled-set membership across all units**, not `!isOpen`. This is the load-bearing decision — it is what makes the awaiting-proposal case (the actual symptom) stop while `!isOpen` would not. Rationale is in §1.
- The predicate reads the response **both pollers already fetch** — no new endpoint, no new server field, no change to the route. The proposal poller already deserializes `view.units`; the telemetry poller's `?telemetry=1` response is a superset that spreads `...view` (route `:295-301`) and therefore already carries `units` and `isOpen` alongside `telemetry`. The telemetry poller will read `units` from that same response to evaluate the predicate. **No second fetch, no new server data.**
- **Cadence is untouched.** The `1500` and `2000` literals in the `setInterval(...)` calls do not change. Active-processing cadence is explicitly out of scope (separate optimization). The guard is a separate concern from the interval value (DIAG-067 OUTPUT §5: separability proven by `SCIExecution`'s existing pattern).
- **No SSE / push replacement.** That is DS-028 deliverable 3, an architectural design-spec item. This HF is the tactical terminal-stop that makes logs usable now.
- **Scope is closed at two files** (DIAG-067 OUTPUT §6: caller set is 7 fetch sites / 5 files, proven closed; `SCIExecution.tsx` and `page.tsx`'s analyze loop are already terminal-aware; `ImportProgress.tsx` polls a different surface and already stops; `ImportReadyState.tsx` is a one-shot, not an interval).

Anti-Pattern Registry check: this is not an enumerated-shape patch (it adds one general settled-predicate, not a per-state special-case); it does not hardcode field names (it reads the typed `state` union and `isOpen` already on the contract); it preserves pre-HF behavior exactly except for the added stop (DD-7). PASS.

---

## §3 — Phase 1: the shared settled-set predicate

Add one small exported predicate to the canonical state-service module, so both pollers consume a single definition (no duplicated literal set, no drift).

**File:** `web/src/lib/sci/comprehension-state-service.ts`

After the `STATE_RANK` / `isSpineState` block (around `:42-59`), add:

```ts
/**
 * Terminal/settled states for poller-stop purposes (HF-286).
 * A unit is settled when it will not change without a NEW user action or a NEW import:
 *   - bound / resolved  → terminal success (isOpen === false implies all units here)
 *   - failed_interpretation → terminal-but-awaiting-human (retryable); note this keeps
 *     session isOpen === true, so an all-failed/awaiting proposal is settled-for-polling
 *     even though the session is not "closed". This is why the poller stop predicate is
 *     settled-set membership, NOT !isOpen alone.
 */
export const SETTLED_STATES: ReadonlySet<UnitComprehensionState> = new Set([
  'bound',
  'resolved',
  'failed_interpretation',
]);

/** True when every unit is settled (nothing in-flight) — the poller-stop predicate. */
export function allUnitsSettled(units: ReadonlyArray<{ state: UnitComprehensionState }>): boolean {
  return units.length > 0 && units.every(u => SETTLED_STATES.has(u.state));
}
```

Note `units.length > 0` — an empty/not-yet-populated view is NOT settled (keep polling until the first real state arrives). This prevents a stop on the initial empty read before any unit has been profiled.

**Commit:**
```
cd /Users/AndrewAfrica/spm-platform
git add web/src/lib/sci/comprehension-state-service.ts
git commit -m "HF-286 Phase 1: shared allUnitsSettled() poller-stop predicate (settled-set, not !isOpen)"
```

---

## §3B — Phase 2: consume the predicate as a terminal-stop in both pollers

### §3B.1 — `SCIProposal.tsx` (proposal poller, 1500 ms)

**Current** (DIAG-067 OUTPUT §2.2, verbatim — `:118-136`):
```tsx
  const poll = useCallback(async () => {
    if (!tenantId || !importSessionId) return;
    try {
      const res = await fetch(`/api/import/sci/session-state?tenantId=${encodeURIComponent(tenantId)}&importSessionId=${encodeURIComponent(importSessionId)}`);
      if (res.ok) {
        const view = await res.json() as SessionStateView;
        setLiveStates(new Map(view.units.map(u => [u.unitId, u])));
      }
    } catch { /* transient */ }
  }, [tenantId, importSessionId]);

  useEffect(() => {
    if (!importSessionId) return;
    setImportInteractionContext(tenantId, importSessionId);
    captureImportInteraction({ surface: 'sci_proposal', action: 'view', dedupKey: `view:${importSessionId}` });
    void poll();
    const id = setInterval(() => void poll(), 1500);
    return () => { clearInterval(id); flushPendingImportInteractions(); };
  }, [poll, tenantId, importSessionId]);
```

**Change:** keep the live-state update exactly as-is; stop the interval once `allUnitsSettled(view.units)` holds. Use a ref to the interval id so `poll` can clear it from inside the callback when the settled condition is first observed.

Add the import (with the existing `comprehension-state-service` / `SessionStateView` imports at the top of the file):
```tsx
import { allUnitsSettled } from '@/lib/sci/comprehension-state-service';
```

Replace the `poll`/`useEffect` block above with:
```tsx
  const pollIdRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    if (!tenantId || !importSessionId) return;
    try {
      const res = await fetch(`/api/import/sci/session-state?tenantId=${encodeURIComponent(tenantId)}&importSessionId=${encodeURIComponent(importSessionId)}`);
      if (res.ok) {
        const view = await res.json() as SessionStateView;
        setLiveStates(new Map(view.units.map(u => [u.unitId, u])));
        // HF-286: stop polling once every unit is settled (bound/resolved/failed_interpretation).
        // Settled-set, NOT !isOpen — failed_interpretation keeps isOpen===true (awaiting human).
        if (allUnitsSettled(view.units) && pollIdRef.current !== null) {
          clearInterval(pollIdRef.current);
          pollIdRef.current = null;
        }
      }
    } catch { /* transient */ }
  }, [tenantId, importSessionId]);

  useEffect(() => {
    if (!importSessionId) return;
    setImportInteractionContext(tenantId, importSessionId);
    captureImportInteraction({ surface: 'sci_proposal', action: 'view', dedupKey: `view:${importSessionId}` });
    void poll();
    const id = setInterval(() => void poll(), 1500);
    pollIdRef.current = id;
    return () => { clearInterval(id); pollIdRef.current = null; flushPendingImportInteractions(); };
  }, [poll, tenantId, importSessionId]);
```

Ensure `useRef` is in the React import at the top of the file (it uses `useState`/`useCallback`/`useEffect` already; add `useRef` if absent).

**Behavior preserved:** `setLiveStates` runs every tick exactly as before until settled; the 1500 ms cadence is unchanged; unmount cleanup is unchanged. The ONLY new behavior: once all units are settled, the interval clears itself and stops. If a later user action (retry/assign) re-opens work, the unit leaves the settled set on the next mount/poll cycle — the existing `useEffect` re-runs on the dep change that drives those actions. (If retry/assign does not already retrigger a poll, that is a pre-existing gap, not introduced here — flag in the completion report under residuals; do NOT expand scope to fix it in this HF.)

### §3B.2 — `ImportTelemetryPanel.tsx` (telemetry poller, 2000 ms)

**Current** (DIAG-067 OUTPUT §3, verbatim — `:240-254`):
```tsx
  useEffect(() => {
    if (!tenantId || !sessionId) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const r = await fetch(`/api/import/sci/session-state?tenantId=${encodeURIComponent(tenantId)}&importSessionId=${encodeURIComponent(sessionId)}&telemetry=1`);
        if (!r.ok || cancelled) return;
        const data = await r.json();
        if (data?.telemetry) setT(data.telemetry as ImportTelemetry);
      } catch { /* best-effort — durable record is the source; a missed poll self-corrects next tick */ }
    };
    const id = setInterval(poll, 2000);
    void poll();
    return () => { cancelled = true; clearInterval(id); };
  }, [tenantId, sessionId]);
```

**Change:** the `?telemetry=1` response is a superset that spreads `...view` (route `:295-301`), so `data.units` is already present alongside `data.telemetry`. Read it and stop on the same settled predicate. Keep the telemetry update and the `cancelled` race-guard exactly as-is.

Add the import:
```tsx
import { allUnitsSettled } from '@/lib/sci/comprehension-state-service';
import type { UnitComprehensionState } from '@/lib/sci/comprehension-state-service';
```

Replace the `useEffect` above with:
```tsx
  useEffect(() => {
    if (!tenantId || !sessionId) return;
    let cancelled = false;
    let id: ReturnType<typeof setInterval> | null = null;
    const poll = async () => {
      try {
        const r = await fetch(`/api/import/sci/session-state?tenantId=${encodeURIComponent(tenantId)}&importSessionId=${encodeURIComponent(sessionId)}&telemetry=1`);
        if (!r.ok || cancelled) return;
        const data = await r.json();
        if (data?.telemetry) setT(data.telemetry as ImportTelemetry);
        // HF-286: the telemetry=1 response spreads ...view, so data.units is present.
        // Stop once every unit is settled (same settled-set predicate as the proposal poller).
        const units = (data?.units ?? []) as Array<{ state: UnitComprehensionState }>;
        if (allUnitsSettled(units) && id !== null) {
          clearInterval(id);
          id = null;
        }
      } catch { /* best-effort — durable record is the source; a missed poll self-corrects next tick */ }
    };
    id = setInterval(poll, 2000);
    void poll();
    return () => { cancelled = true; if (id !== null) clearInterval(id); };
  }, [tenantId, sessionId]);
```

**Behavior preserved:** `setT(data.telemetry)` runs every tick exactly as before until settled; the 2000 ms cadence is unchanged; the `cancelled` unmount guard is unchanged. The ONLY new behavior: once all units are settled, the interval clears itself.

**Commit:**
```
cd /Users/AndrewAfrica/spm-platform
git add web/src/components/sci/SCIProposal.tsx web/src/components/sci/ImportTelemetryPanel.tsx
git commit -m "HF-286 Phase 2: terminal-stop both session-state pollers on allUnitsSettled (cadence untouched, live updates preserved)"
```

---

## §3C — Proof gate (Rule 7 — LIVE evidence, not attestation)

Build and run before any proof claim:
```
cd /Users/AndrewAfrica/spm-platform
# kill any running dev server first
rm -rf web/.next
cd web && npm run build && npm run dev
# confirm localhost:3000 responds 200 before proceeding
```

The proof gate is **server-log poll counts**, captured live. Two scenarios, both required:

| # | Scenario | Pass criterion |
|---|---|---|
| 1 | After an import completes and the **proposal is displayed** (units settled, including any `failed_interpretation` holding for review) | **Zero** `GET /api/import/sci/session-state` (non-telemetry) hits in a 30 s server-log window once the proposal has rendered and units are settled |
| 2 | After active work **settles** with the telemetry panel still mounted | **Zero** `GET /api/import/sci/session-state?telemetry=1` hits in a 30 s server-log window after all units reach a settled state |
| 3 | **During active processing** (units still in-flight, proposal not yet shown) | Polling **continues** at the unchanged cadence (1500 ms proposal / 2000 ms telemetry) — live updates preserved; the fix must NOT stop polling while work is in-flight |

Capture method: tail the dev-server log (or production log if verifying post-merge), filter for `session-state`, count requests in the 30 s window after the settled state is reached. Paste the actual log lines (or the filtered count with surrounding context) into the completion report — Rule 7: pasted evidence, not "verified."

Scenario 3 is the behavior-preservation proof — it confirms the fix stopped *only* the wasted polling, not the live-update function. All three must pass.

---

## §4 — Reporting discipline

Completion report at `docs/completion-reports/HF-286_COMPLETION_REPORT.md`. Mandatory structure (Rules 25-28):
1. **SHAs** — the two phase commits + the merge SHA once PR merges.
2. **Phase 1** — the pasted `allUnitsSettled`/`SETTLED_STATES` addition as committed.
3. **Phase 2** — the pasted final state of both poller `useEffect` blocks as committed (the real post-edit code, not this directive's sketch).
4. **Proof gate** — the three scenarios with **pasted live server-log evidence** (poll counts in the 30 s windows; the in-flight continuation for scenario 3). Self-attestation is not accepted.
5. **Build** — `npm run build` success output; `localhost:3000` 200 confirmation.
6. **Residuals** — any pre-existing gap observed but deliberately NOT fixed here (e.g. whether retry/assign retriggers a stopped poller — see §3B.1 note).
7. **ARTIFACT SYNC block** (per `CC_STANDING_ARCHITECTURE_RULES.md` completion-report contract):
```
ARTIFACT SYNC
MC: [HF-286 → status; any new items discovered]
REGISTRY: [poller-stop capability row → evidence to add]
R1: [User-Ready criteria touched — D-tier operational quality / log usability]
BOARD: [CAPS field deltas if any]
SUBSTRATE: [entries exercised; candidate captures for ICA]
```

Final step — open the PR (main is protected; never push to main):
```
cd /Users/AndrewAfrica/spm-platform
git push origin hf/286-session-state-poller-terminal-stop
gh pr create --base main --head hf/286-session-state-poller-terminal-stop \
  --title "HF-286: SCI session-state poller terminal-stop (resource-waste fix from OB-203/HF-285 arc)" \
  --body "Stops both /api/import/sci/session-state pollers (SCIProposal 1500ms, ImportTelemetryPanel 2000ms) once all units are settled. Adds shared allUnitsSettled() predicate (settled-set incl. failed_interpretation, NOT !isOpen). Cadence untouched, route untouched, no SQL. Live updates preserved (proof scenario 3). Diagnosed in DIAG-067. Proof: zero session-state polls in 30s after settle (scenarios 1+2); polling continues in-flight (scenario 3)."
```

---

## §5 — HALT Conditions

- **HALT-1 — settled predicate would stop in-flight work.** If during proof scenario 3 polling stops while any unit is still in a non-settled state, the predicate is wrong — STOP, do not merge, report the unit states observed at stop. Live updates must continue while work is in-flight.
- **HALT-2 — `data.units` absent on the telemetry response.** §3B.2 assumes the `?telemetry=1` response carries `units` (it spreads `...view`). If the live response does NOT include `units`, STOP and report the actual response shape — do not invent a fallback or add a second fetch; the architect re-scopes.
- **HALT-3 — SQL/schema appears required.** This HF authors no SQL and touches no schema. If any step seems to require a query, column reference, or migration, STOP — that is a scope breach, report it.
- **HALT-4 — cadence-change temptation.** If a fix seems to need changing the `1500`/`2000` literals, STOP. Active cadence is out of scope; the stop guard is separate from the interval value. Report rather than change cadence.

---

## §6 — Out of Scope

- Active-processing poll cadence (the `1500`/`2000` literals). Separate optimization.
- SSE / push-based replacement of polling — DS-028 deliverable 3 (architectural design spec).
- The session-state route and its `import_session_telemetry` read — untouched.
- `SCIExecution.tsx`, `page.tsx` analyze loop, `ImportReadyState.tsx`, `ImportProgress.tsx` — already terminal-aware or different-surface (DIAG-067 OUTPUT §6); confirm-only, no edit.
- Any convergence / calculation / plan-interpretation / SCI-classification code.
- Whether retry/assign retriggers a stopped poller — if observed as a gap, report as residual; do not fix here.

---

## §6A — Residuals

- The architectural replacement for polling (SSE/push) is DS-028 deliverable 3. HF-286 is the tactical terminal-stop that makes logs usable now; it does not close the architectural item.
- If `SCIProposal`'s retry/assign path does not already retrigger a poll after the interval has self-stopped (a user retries a `failed_interpretation` unit, but the poller already cleared), live updates would not resume until remount. DIAG-067 did not establish whether the action path retriggers; §3B.1 preserves the existing dep-driven re-run behavior and does not add a retrigger. If the completion-report proof surfaces this, it is a follow-on HF, not an expansion of HF-286.
- The four already-terminal-aware pollers (DIAG-067 OUTPUT §6 items 3-5) were confirmed, not changed. If any is later found to over-poll, that is separate scope.
