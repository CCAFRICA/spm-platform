# HF-286 — SCI Session-State Poller Terminal-Stop — COMPLETION REPORT

**Repo:** `CCAFRICA/spm-platform` (VP)
**Authored:** 2026-06-13 (CC, against `docs/vp-prompts/HF-286_SESSION_STATE_POLLER_TERMINAL_STOP_20260613.md`)
**Diagnosed by:** `docs/diagnostics/DIAG-067_SCI_SESSION_STATE_POLLING_RECON_OUTPUT.md`
**Type:** HF — ships code. Two client-component edits + one shared predicate. No server change, no SQL, no schema reference.
**Branch:** `hf/286-session-state-poller-terminal-stop` → PR to `main` (branch-protected; shipped via PR per the `diag/*`→PR convention).

---

## 1 — SHAs

| Phase | SHA | Content |
|---|---|---|
| Base (main) | `7585ba3f` | merge of DIAG-067 PR #488 |
| Phase 1 | `7502655a` | shared `allUnitsSettled()` / `SETTLED_STATES` predicate |
| Phase 2 | `103759e0` | terminal-stop in both session-state pollers |
| Phase 3 | `1f11f0be` | proof artifacts (predicate unit test + real-session eval script) |
| Merge | _(filled on merge of the PR)_ | |

Diff stat (Phases 1+2 — the behavioral change):
```
 web/src/components/sci/ImportTelemetryPanel.tsx | 14 ++++++++++++--
 web/src/components/sci/SCIProposal.tsx          | 14 ++++++++++++--
 web/src/lib/sci/comprehension-state-service.ts  | 20 ++++++++++++++++++++
 3 files changed, 44 insertions(+), 4 deletions(-)
```

---

## 2 — Phase 1: shared settled-set predicate (as committed)

`web/src/lib/sci/comprehension-state-service.ts:61-79`:

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
export const SETTLED_STATES: ReadonlySet<UnitComprehensionState> = new Set<UnitComprehensionState>([
  'bound',
  'resolved',
  'failed_interpretation',
]);

/** True when every unit is settled (nothing in-flight) — the poller-stop predicate. */
export function allUnitsSettled(units: ReadonlyArray<{ state: UnitComprehensionState }>): boolean {
  return units.length > 0 && units.every(u => SETTLED_STATES.has(u.state));
}
```

> **Correction vs the directive sketch:** the directive wrote `new Set([...])`, which TypeScript infers as `Set<string>` — `tsc` rejected the assignment to `ReadonlySet<UnitComprehensionState>` (`error TS2322`). Fixed by annotating the element type: `new Set<UnitComprehensionState>([...])`. This is exactly the build-gate catch the directive's §3C anticipated; the committed code is the corrected form, not the sketch.

---

## 3 — Phase 2: terminal-stop in both pollers (as committed)

### 3.1 `SCIProposal.tsx` (proposal poller, 1500 ms) — `:359-386`

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

Imports added: `useRef` (React) and `import { allUnitsSettled } from '@/lib/sci/comprehension-state-service';`. `setLiveStates` runs every tick as before; cadence `1500` unchanged; unmount cleanup unchanged. New behavior: the interval clears itself the first tick all units are settled.

### 3.2 `ImportTelemetryPanel.tsx` (telemetry poller, 2000 ms) — `:58-80`

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

Imports added: `allUnitsSettled` (value) and `UnitComprehensionState` (type). **HALT-2 cleared:** the route's `?telemetry=1` branch returns `{ ...view, telemetry, audit }` and `view = projectSessionStateView(...)` carries `units` — so `data.units` is present. Verified in the route source and in the real-data projection below (every record yields a populated `units` array). `setT(data.telemetry)` runs every tick as before; cadence `2000` and the `cancelled` race-guard unchanged.

---

## 4 — Proof gate (Rule 7 — real evidence)

### 4.1 The predicate, proven on the unit (six cases, `node --test`)

`web/src/lib/sci/__tests__/hf286-settled-predicate.test.ts`:
```
✔ SETTLED_STATES is exactly {bound, resolved, failed_interpretation}
✔ every in-flight (non-settled) state is NOT settled → keep polling
✔ all-settled set → STOP (true)
✔ failed_interpretation alone is settled → STOP (the !isOpen blind spot)
✔ ANY in-flight unit among settled ones → keep polling (false)
✔ empty / not-yet-populated view is NOT settled → keep polling
ℹ tests 6   ℹ pass 6   ℹ fail 0
```

### 4.2 The predicate, proven on REAL production data via the route's own projection

`web/scripts/diag/hf286-predicate-on-real-sessions.ts` reads the 25 most-recent `import_session_telemetry` rows and runs each through **`projectSessionStateView`** — the exact function the live route calls (`route.ts:51`) — then evaluates `allUnitsSettled(view.units)`. This is the route's response shape minus the HTTP/auth layer, so the predicate result equals what the browser poller computes. Actual output:

```
SETTLED_STATES = {bound, resolved, failed_interpretation}
Inspected 6 most-recent import_session_telemetry rows

predicate(stop?) | #units | states (count) | importSessionId
-----------------+--------+----------------+----------------
true             |      3 | bound:3        | ae44f46a-5e55-4d10-8d89-bbf546b37598
true             |      1 | bound:1        | e30467f6-2539-47c7-9423-f4932d42622d
false            |     16 | bound:15 classified:1 | 998772d8-5554-4682-b8e2-1b1e155d3660
true             |     16 | bound:16       | ef6915ea-19ae-4ba6-a014-cc055158f797
true             |     16 | bound:11 failed_interpretation:5 | 505a6d2c-7b11-42a2-a11e-100c8a42afbd
true             |     16 | bound:15 failed_interpretation:1 | 4ae71225-3a90-4462-8780-d83f176a7bbd

SUMMARY: 5 settled→STOP  |  1 in-flight→KEEP POLLING  |  0 empty→KEEP POLLING
INVARIANT (predicate ⇔ all-units-in-settled-set): HOLDS
```

This maps directly to the three required scenarios:

| Scenario | Real session | Predicate | Poller behavior |
|---|---|---|---|
| **1 — proposal settled → STOP** | `505a6d2c` (`bound:11 failed_interpretation:5`) | `true` | `SCIProposal` clears its 1500 ms interval. **This is the §1 symptom** — a proposal holding failed units for review. `!isOpen` would be **false** here (5 failed units keep `isOpen` true), so a naive `!isOpen` stop would poll forever; the settled-set predicate stops correctly. |
| **2 — telemetry settled → STOP** | `505a6d2c` (same; telemetry view spreads identical `units`) | `true` | `ImportTelemetryPanel` clears its 2000 ms interval. |
| **3 — in-flight → KEEP POLLING** | `998772d8` (`bound:15 classified:1`) | `false` | Both pollers continue at unchanged cadence — **live updates preserved** (one unit still `classified`/in-flight). |

The `INVARIANT … HOLDS` line is a self-check that `allUnitsSettled(units) ⇔ every unit ∈ SETTLED_STATES` on all six real records.

### 4.3 Static trace of the stop (the `clearInterval` site)

- `SCIProposal.tsx:370-373`: `if (allUnitsSettled(view.units) && pollIdRef.current !== null) { clearInterval(pollIdRef.current); pollIdRef.current = null; }` — fires inside `poll`, first tick the predicate is true.
- `ImportTelemetryPanel.tsx:71-74`: `if (allUnitsSettled(units) && id !== null) { clearInterval(id); id = null; }` — same.
- Cadence literals `1500`/`2000` are untouched (DD-7 behavior-preservation; HALT-4 not tripped).

### 4.4 Honest boundary on the literal proof method

The directive's §3C asks for **browser-level server-log poll counts in a 30 s window**. I did **not** produce those, for two environment reasons, and did not fabricate them:
1. **No browser automation** is available in this environment (no Playwright/Puppeteer/Cypress — confirmed `node_modules/.bin` has none), so the real React pollers cannot be driven headlessly.
2. **The API route is auth-gated.** `src/middleware.ts:161-163` returns `{ "error": "Unauthorized" }` for any unauthenticated `/api/*` request; only `/api/auth`, `/api/health`, `/api/platform/flags` are exempt. A live poll loop requires an authenticated UI session. Per the DIAG-067 HALT-4 / forbidden-mutation discipline, I did **not** bypass the gate. (Note: DIAG-067 OUTPUT §7's "unauthenticated GET" characterization was imprecise — the route is middleware-gated; corrected here.)

The §4.2 evidence is the faithful substitute: it exercises the route's **exact `projectSessionStateView` projection** and the **exact `allUnitsSettled` predicate** the browser uses, on **real production records**, including the load-bearing `failed_interpretation` symptom case and an in-flight keep-polling case. The remaining gap is purely the HTTP transport + React `setInterval` wiring, which §4.1 (predicate) and §4.3 (static `clearInterval` trace) cover. The literal browser 30 s poll-count remains as an operator UAT step (instructions in §6).

---

## 5 — Build

```
$ cd web && npm run build
✓ Compiled successfully   (exit 0; full route table emitted)
$ npx tsc --noEmit -p tsconfig.json   →   0 errors
```

The build log's `Dynamic server usage` lines are pre-existing static-prerender notices on unrelated routes (`/api/ai/calibration`, `/api/canvas`, `/api/import/sci/trace`, `/api/platform/tenant-config`, `/api/platform/observatory`) — none reference the three changed files. (`npm run dev` booted on `:3000`; the import route responded — auth-gated as noted in §4.4.)

---

## 6 — Residuals

- **Browser 30 s poll-count UAT (operator step).** Not produced here (§4.4). To run: log into the app, `/operate/import`, complete an import to the proposal screen (or a session with `failed_interpretation` units holding), open DevTools Network filtered to `session-state`, confirm **zero** new requests once units are settled; during active processing confirm requests continue at 1500 ms (proposal) / 2000 ms (telemetry). The §4.2 real-data predicate already proves the decision these counts would confirm.
- **Retry/assign re-trigger after self-stop (pre-existing, NOT fixed here — per directive §3B.1).** Once the proposal poller self-stops on an all-settled view, a subsequent `retry`/`assign` on a `failed_interpretation` unit calls `await poll()` directly (`SCIProposal.tsx:432,440`) — that single manual poll runs, but it does **not** restart the cleared `setInterval`. If the retried unit re-enters an in-flight state and the user expects live streaming without a remount, updates would not auto-resume until the `useEffect` re-runs. DIAG-067 did not establish whether this matters in practice; HF-286 preserves the existing dep-driven behavior and adds no re-trigger (out of scope §6). Flagged as a candidate follow-on HF, not an HF-286 expansion.
- **DS-028 deliverable 3 (SSE/push) unaffected.** HF-286 is the tactical terminal-stop that makes logs usable now; the architectural replacement for polling remains open.
- **The four already-terminal-aware pollers** (DIAG-067 OUTPUT §6 items 3–5: `SCIExecution.tsx` ×2, `page.tsx` analyze loop, `ImportReadyState.tsx` one-shot) and the different-surface `ImportProgress.tsx` were confirmed unchanged.

---

## 7 — ARTIFACT SYNC

```
ARTIFACT SYNC
MC: HF-286 → CODE-COMPLETE, PR-open. Two pollers (SCIProposal 1500ms, ImportTelemetryPanel 2000ms)
    now terminal-stop on allUnitsSettled. Closes the OB-203/HF-285-arc resource-waste defect
    diagnosed in DIAG-067. Open item: browser 30s poll-count UAT (operator); retry/assign re-trigger
    follow-on candidate.
REGISTRY: + poller-stop capability — "client session-state pollers stop at settled-set (bound/
    resolved/failed_interpretation), not !isOpen". Evidence: hf286-settled-predicate.test.ts (6/6),
    hf286-predicate-on-real-sessions.ts (5 settled→STOP incl. failed_interpretation, 1 in-flight→KEEP).
R1: D-tier operational quality — production session-state logs become usable for diagnosis;
    hundreds of post-settle Vercel invocations per import eliminated. No Intelligence/Acceleration
    regression (live updates preserved while in-flight — scenario 3).
BOARD: CAPS — Performance +(eliminates wasted poll invocations); Intelligence/Acceleration unchanged.
SUBSTRATE: exercised — projectSessionStateView (read path), allUnitsSettled (new predicate),
    SessionStateView.isOpen vs settled-set distinction. ICA capture candidate: "isOpen ≠ settled —
    failed_interpretation is terminal-but-awaiting, keeps isOpen true; poller-stop must use settled-set."
```

*End HF-286 completion report. Code-complete; PR open against `main`.*
