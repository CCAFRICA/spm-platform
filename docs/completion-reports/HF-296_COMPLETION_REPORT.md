# HF-296 — Completion Report
## Execute-Phase Settle Replacement + Poller Terminal Stops + Performance Benchmark

**Date:** 2026-06-16 · **Branch:** `hf-296-execute-settle-replacement` · **Mode:** ULTRACODE · effort MAX
**Predecessor:** DIAG-069 (settle-scope, H5) → HF-295 Part 2 (file-scoped settle, shipped). HF-295 fixed *which* units settle; HF-296 fixes *how*.
**Status:** BUILT · build exit-0 · dev confirmed `localhost:3000` · 2-lens adversarial sweep PASS · **awaiting architect §4 browser proof gate + real-number benchmark (SR-44).**

---

## Section 1 — ADR (Orchestration Plan)

Full ADR: `docs/adr/HF-296_ADR_EXECUTE_SETTLE_REPLACEMENT.md` (first commit, `563187d1`).

- **Fan-out (paid once):** 5 disjoint reads → merged STATE MAP (T1 settle, T2 "[import] /" poller + HF-289 status, T3 telemetry poller, T4 HTTP response contract, T5 baseline). Executed in the main context (the build edits these files).
- **Keystone (first):** §2 settle replacement — `executeBulk` trusts a live HTTP 200; `settleFromSurface` becomes recovery-only.
- **Streams (after keystone):** A = `SCIExecution` live-progress poller (single execute-phase lifecycle); B = `ImportTelemetryPanel` telemetry poller (stall-timeout hard stop). File-disjoint.
- **Surfaced collision / terminal-state contract:** unit terminal = spine ∈ `{bound,resolved,failed_interpretation}`; file terminal = `executeBulk` returned (live 200 authoritative); execute phase terminal = `executionDone`. Each poller keys off this one definition.
- **Key correction (T2):** **HF-289 was Peru-locale work (PEN/es-PE), not pollers.** HF-286/HF-290 shipped the poller terminal-stops; HF-290 concluded "all already terminal-aware." **There is no separate import-list route poller** — the "[import] / status=200" noise is the execute-phase `/session-state` polls. The architect's three labels map to: settle → `settleFromSurface`; "[import] /" → `SCIExecution` live-progress; telemetry → `ImportTelemetryPanel`.

---

## Section 2 — Baseline Benchmark

Two halves, because I cannot access Vercel production logs or drive the browser import (those are the architect's, §4.2). The poll-count derivation **is computed from code constants** and is the measurable before/after I can produce.

### 2a — Architect-observed (cited from the directive — the June 16 16:44–16:56 attempt)
| Metric | Baseline |
|---|---|
| Per-file actual work | ~2 s |
| Per-file stall (commit→next download) | ~298 s |
| Files committed before failure | 3 of 17 |
| Wall-clock | > 300 s (function timeout) |
| `getUser() timed out` (auth starvation) | Present |

### 2b — Poll-count derivation (from code constants: 2 s cadence, settle `STALL_MS=90s`, `MAX_EXECUTE_ATTEMPTS=3`)
| Poller (route) | Baseline per file (execute phase) |
|---|---|
| `settleFromSurface` (`/session-state?telemetry=1`) | ~135–149 polls/file (3 attempts × 45 polls/90s-stall, ≈ 298 s ÷ 2 s) |
| `ImportTelemetryPanel` (`telemetry=1`) | **unbounded** — every 2 s until `allUnitsSettled` (all 17) or never; no stall cap |
| `SCIExecution` live-progress (`/session-state`) | every 2 s **plus** an extra immediate poll on each per-file `hasActiveUnits` toggle (HF-290 "double/triple hits") |
| **Combined sustained load** | ~2–2.5 `/session-state` req/s against an auth-checked route for the whole attempt → consistent with the observed `getUser()` starvation |

---

## Section 3 — Code Changes

`git diff --stat 563187d1..HEAD` → `SCIExecution.tsx (+99/−71 region)`, `ImportTelemetryPanel.tsx (+20/−)`.

### 3.1 — Settle replacement (keystone) — `SCIExecution.tsx` `executeBulk`
Addresses **poller #1 (the settle)**. Terminal condition changed from "poll until spine shows all this-file's units terminal" to "the live HTTP 200 is authoritative — return immediately."

```ts
if (res.ok) {
  // LIVE 200 — authoritative. Trust it, advance immediately. ZERO POLLING.
  let bulkResult = null; try { bulkResult = await res.json(); } catch { bulkResult = null; }
  if (bulkResult && Array.isArray(bulkResult.results)) {
    seedFromResults(bulkResult.results);                 // per-unit complete/error (HF-295 payload on fail)
    const present = new Set(bulkResult.results.map(r => r.contentUnitId));
    if (groupUnitIds.every(id => present.has(id)))
      return finalize({ settled: true, unitIds: groupUnitIds });   // ← no poll
    const settled = await settleFromSurface(groupUnitIds);          // rare: units missing from body
    return finalize(settled ? {settled:true,…} : {settled:false, errorClass:'not_finalized',…});
  }
  // 200 unparseable → treat as lost response → recovery settle
}
// 4xx/5xx → mark failed, return immediately, ZERO POLLING
// catch (timeout/abort/network) → settleFromSurface RECOVERY + idempotent re-POST (D18 preserved)
```
**Settle call sites are now all recovery branches** (lines 357 units-missing, 364 unparseable-200, 383 lost-response). Happy path = **0 settle polls**.

### 3.2 — Live-progress terminal stop (Stream A) — `SCIExecution.tsx`
Addresses **poller #2 ("[import] /")**. Gate changed from per-file `hasActiveUnits` (re-subscribe storm) to a single `executionDone` gate.
```diff
-  const hasActiveUnits = units.some(u => u.status === 'processing');
-  useEffect(() => { if (executionDone || !hasActiveUnits) return; … },
-    [executionDone, hasActiveUnits, tenantId, proposal.proposalId]);
+  useEffect(() => { if (executionDone) return; … },     // one start (mount) → one stop (executionDone)
+    [executionDone, tenantId, proposal.proposalId]);
```

### 3.3 — Telemetry stall-timeout (Stream B) — `ImportTelemetryPanel.tsx`
Addresses **poller #3 (telemetry)**. Adds a 30 s no-forward-progress backstop so an orphaned unit can't cause infinite polling; keeps the HF-286 `allUnitsSettled` stop + unmount.
```ts
const STALL_MS = 30_000; let lastSignals = -1; let lastProgressAt = Date.now();
…
const signals = Number(data?.telemetry?.totalSignalsWritten ?? 0);
if (signals > lastSignals) { lastSignals = signals; lastProgressAt = Date.now(); }
if (units.length > 0 && allUnitsSettled(units)) { stop(); return; }   // normal completion
if (Date.now() - lastProgressAt > STALL_MS) stop();                    // orphaned-unit backstop
```

---

## Section 4 — Post-Fix Benchmark (side-by-side)

| Metric | Baseline | After fix | Source |
|---|---|---|---|
| Per-file settle polls (happy path) | ~135–149 | **0** | code (recovery-only; settle not called on a live 200) |
| Per-file stall | ~298 s | **~0 s** (return on 200) | code |
| `ImportTelemetryPanel` post-terminal polls | unbounded | **0** (stops ≤30 s of last progress; immediate on normal completion via `allUnitsSettled`/unmount) | code |
| live-progress lifecycle | per-file re-subscribe + extra polls | **single** 2 s cadence, one stop at `executionDone` | code |
| Combined execute-phase `/session-state` load | ~2–2.5 req/s sustained | brief, self-terminating | code |
| Wall-clock, 15 files | > 300 s (cap) | ≈ Σ per-file work (~2 s) + overhead → well under cap | **architect §4.2** |
| Files committed | 3 / 17 | all 15 data files | **architect §4.2** |
| `getUser()` timeout | present | expected absent (load removed) | **architect §4.2** |

**The measurable code-derived headline: redundant confirmation polls per file ~135–149 → 0.** Real wall-clock / row-count / auth-timeout-absence are the architect's browser proof-gate captures (I cannot run the production import).

---

## Section 5 — Proof Gate Evidence

- **Build:** `pkill next dev; rm -rf .next; npm run build` → `✓ Compiled successfully`, types validated, **`BUILD_EXIT=0`**. (Dynamic-server prerender notices are pre-existing auth-route behavior, not failures.)
- **Dev:** `npm run dev` → `✓ Ready in 1018ms`; `curl /login` → **200**.
- **2-lens adversarial sweep (independent reviewers) — both PASS:**
  - *No-silent-failure + D18:* all 7 `executeBulk` return paths terminate every unit (complete/error); lost-response path calls recovery settle before failing; legitimate per-unit failures return `settled:true` (not retried) and carry the HF-295 payload; 4xx/5xx fast-fail is recoverable via "Retry failed".
  - *Poller termination + Korean Test:* all three pollers provably stop (settle recovery-only → 0 happy-path; live-progress single `executionDone` gate, `hasActiveUnits` fully removed; telemetry triple-stop = settled / 30 s stall / unmount); no new language literals, filename matching, or per-tenant branches.
- **Architect (SR-44, browser):** run the 15-file MIR import (GT excluded) and capture the Section-4 architect rows; verify zero `/session-state` log lines 30 s after completion; verify `committed_data` count via tsx; verify no Vercel `Runtime Timeout`.

---

## Section 6 — Scope Fence (what was NOT changed)

- Settle **scope** (HF-295) — unchanged; this fixes the **mechanism**.
- Single-file path & all-files-succeed path — behavior preserved (single-file = one group, trusts its 200).
- Analyze-phase pollers (HF-286: `SCIProposal`, the analyze poll, telemetry panel in `phase="analyzing"`), the processing-phase job poller (`ImportProgress`, already terminal) — untouched.
- Server routes (`execute-bulk`, `session-state`), engine, schema, disputes, BCL anchor, other tenants — untouched.
- D18 lost-response resilience — **preserved** (a lost response still polls for recovery).

---

*HF-296 · Completion Report · 2026-06-16 · vialuce.ai · Intelligence. Acceleration. Performance.*
