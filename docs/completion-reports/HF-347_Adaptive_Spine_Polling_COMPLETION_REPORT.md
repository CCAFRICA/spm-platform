# HF-347 — Adaptive status polling for the membrane spine — Completion Report

**Branch:** `ob-247-cda-portal` (co-lands in PR #606 — CC's call; the spine poller is the membrane component the portal work already touches).
**Mode:** ULTRACODE. Binds DS-031 (spine) · SR-2 (scale by design) · SR-34 (structural-class fix).
**Date:** 2026-06-27

---

## CRF + PCD
- [x] Seed: HF-347 / Cite CLT247 polling log + the shared spine poller (`useFileObjects`) / Class: HF / Mode: ULTRACODE.
- [x] Architecture Decision Gate cleared.
- [x] Anti-Pattern Registry: **structural-class fix** — the change is in the shared `useFileObjects` hook, so the operator Submit, operator In-Progress, and the CDA portal all benefit; no CDA-only patch. No functional regression (status still advances promptly while scanning).
- [x] CC paste block: none.
- [x] CC made the **shared** poller adaptive; updates PR #606; **architect merges (HALT-B).**

---

## 1. Before (the defect — CLT247)

`useFileObjects` ran an interval **unconditionally**:
```ts
useEffect(() => {
  mounted.current = true;
  refresh();
  const t = setInterval(refresh, intervalMs);   // ← always on
  return () => { mounted.current = false; clearInterval(t); };
}, [refresh, intervalMs]);
```
So the spine polled `/api/prism/files` every ~1.5–2s **regardless of state** — nothing in flight, all files terminal, or the tab hidden. Each poll = an HTTP round-trip + a `file_objects` query; cost grows linearly with open portals (SR-2 violation). The CDA portal additionally ran **two** instances (the page + the dropzone), doubling it.

## 2. The adaptive fix (the diff)

`useFileObjects` now polls **only when it needs to** (`src/components/prism/useFileObjects.ts`):
- **Need-based + terminal-stop:** `const inFlight = enabled && files.some((f) => !isTerminalState(f.state))`. The interval effect early-returns when `!inFlight` — **no interval, zero requests** when every file is terminal (`promoted`/`infected_held`) or there are none.
- **Visibility-pause:** a `visibilitychange` listener `stop()`s the interval on `document.hidden` and `start()`s it (after one catch-up `refresh()`) on resume.
- **Sane cadence:** default `2000ms` (was 1500); not sub-second.
- **Single initial fetch** on mount; callers `refresh()` after a submission to (re)start the poll.

**Consolidation (the double-poll):** the CDA portal previously mounted two pollers. `SubmitDropzone` is now a **controlled** component — it takes optional `files`/`refresh` props and disables its own poll (`enabled: filesProp === undefined`) when the parent provides them. The portal page owns **one** poll and passes it down; the operator `/data/submit` keeps `<SubmitDropzone/>` standalone (it owns the one poll there). One adaptive interval per surface.

## 3. After (behavior)

**Logic proven now** — `node --test src/lib/prism/__tests__/hf347-adaptive-poll.test.ts` (3/3):
```
✔ HF-347 (terminal-stop): promoted + infected_held are terminal; everything else is live
✔ HF-347 (need-based): the interval runs ONLY when ≥1 file is non-terminal
✔ HF-347: every lifecycle state is classified (no silent gap that would keep polling forever)
```
(`inFlight([])` / `inFlight(['promoted'])` / `inFlight(['promoted','infected_held'])` → **false** → no interval; `['scanning']`/`['received']`/`['clean']`/`['promoted','scanning']` → **true** → poll.)

**Network behavior** (the four §3.3 behaviors in the browser network panel) is **architect-verified — HALT-A**: idle portal = no `/files` requests · during scan = ~2s cadence · all-terminal = stops · hidden tab = pauses, resumes with a refetch on focus. (No jsdom/RTL in the repo to unit-test the effect/interval wiring; the predicate above + the diff are the mechanism.)

**tsc 0 · build exit 0 · OB-247 tests 6/6 (no regression).**

## 4. No functional regression
While a file is non-terminal, `inFlight` stays true → the interval keeps polling at ~2s → the spine still advances received → scanning → cleared, and `infected_held` still surfaces. A submission calls `refresh()` → the new (non-terminal) file appears and the interval (re)starts even from idle.

## 5. Structural-class fix (SR-34)
`grep -rln useFileObjects src/` → `app/data/in-progress/page.tsx`, `app/portal/page.tsx`, `components/prism/SubmitDropzone.tsx` (operator `/data/submit` + the CDA portal). One hook change makes **every** membrane surface adaptive.

---

## 5.5 Adversarial review
A focused review of the hook + consolidation found **no critical/high bugs — all confirmed**: idle-stop runs no interval and leaks none (cleanup ordering correct); restart-after-submit works on both the portal (parent's `refresh`) and standalone `/data/submit` (own `refresh`); visibility pause/resume is correct with no double-add/leak; the consolidation has no rules-of-hooks violation and the disabled hook makes **zero** requests (`filesProp === undefined` is false for the portal's array → own poll off); no regression (held/promoted is rendered before the interval stops); and the interval is **recreated only on the `inFlight` boolean flip, not on every poll** (`inFlight` is a primitive dep). INFO-only tradeoffs: an idle tab won't auto-discover a file submitted from another tab/device until interaction — the intended cost of zero idle requests (push-based is the deferred §6 direction).

## 6. HALT status
- **HALT-A (browser verification):** ACTIVE — architect confirms the four network behaviors + prompt status updates during a scan.
- **HALT-B (PR merge):** ACTIVE — co-lands in PR #606; architect merges.

## 7. Out of scope / residuals
- **Push-based live updates (Realtime/SSE):** deliberately not done — a held connection per portal trades poll-requests for connection-count at scale; not warranted for a brief, often-idle upload window. Available as a platform-wide direction later.
- Co-lands in PR #606 (the spine poller is the membrane component the portal already uses).
