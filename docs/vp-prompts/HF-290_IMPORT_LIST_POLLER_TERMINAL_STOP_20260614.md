# HF-290 — Import List Poller Terminal-Stop

**Repo:** `CCAFRICA/spm-platform` (VP)
**Authored:** 2026-06-14 (architect channel)
**Type:** HF — ships code. Same defect class as HF-286 (poller without terminal stop), different endpoint.
**Number:** HF-290 (286/287 consumed this session, 288–289 consumed in parallel sessions — architect-confirmed from repo). **Collision gate:** before first commit, CC runs `ls docs/completion-reports/HF-290* docs/vp-prompts/HF-290*` and `git log --all --oneline | grep -i HF-290`; if any match, HALT and report — do not renumber.
**Branch + PR:** `hf/290-import-list-poller-terminal-stop`, PR to `main`. Never push to main directly.

---

## §0 — CC Standing Rules

`CC_STANDING_ARCHITECTURE_RULES.md` governs. Binding: Rule 7 (Prove, Don't Describe — pasted evidence only), DD-7 (behavior preservation — existing pollers that already stop are unchanged), SR-41 (never force-push). File IS the prompt; ends at §5A; no §7.

**Reconciliation-channel separation:** no ground-truth values in this HF.

---

## §1 — Problem Statement

Production logs show continuous polling on the import list/status route at ~2s cadence with no terminal stop:
```
2026-06-14 04:54:31.289 [info] [import] / status=200
2026-06-14 04:54:33.276 [info] [import] / status=200
2026-06-14 04:54:33.287 [info] [import] / status=200
```

This is the same defect class HF-286 fixed on `/api/import/sci/session-state` — a `setInterval`/polling hook that clears only on unmount, never on terminal state. HF-286's `allUnitsSettled` predicate may NOT apply here — this endpoint is likely the import list or import-status route, not the SCI unit-comprehension surface. **Phase 0 reads the actual poller before any fix is written.**

---

## §2 — Phases

### §2A — Phase 0: read the poller (before any edit)

0.1 Grep the codebase for every client-side caller that polls the import list/status route. Search for: `[import]`, `/api/import` fetch calls with `setInterval`/`refreshInterval`/`refetchInterval`, any polling hook on the import page or import status surface. Paste the file path(s), the hook/function body verbatim, and the poll interval.

0.2 Paste the terminal-state handling (or "NO TERMINAL-STATE STOP FOUND" + confirming grep).

0.3 Paste the route's response shape — what status/state field indicates terminal (completed/failed/etc.). This determines the stop predicate (it may be different from `allUnitsSettled`).

0.4 Confirm whether the `allUnitsSettled` predicate from HF-286 (`comprehension-state-service.ts`) applies, or whether this poller uses a different state model requiring its own stop condition.

0.5 The double-hit at `:33.276`/`:33.287` (same second, two requests) suggests either two independent pollers or a component remounting. Report whether there are one or two distinct callers.

### §2B — Phase 1: apply the terminal-stop

Using the Phase 0 findings:

- If `allUnitsSettled` applies: import it and add the same `clearInterval`-on-settled guard as HF-286.
- If a different state model: define the stop predicate from the response shape (Phase 0.3), implement it as a clean guard on the interval. Same pattern: polling continues during active work, stops at terminal.
- **Do NOT change the poll cadence** (the ~2s literal). Only add the stop guard.
- **Do NOT modify any poller HF-286 already fixed** (SCIProposal.tsx, ImportTelemetryPanel.tsx). Only touch the poller(s) Phase 0 identified.

Commit:
```
cd /Users/AndrewAfrica/spm-platform
git add <files from Phase 0>
git commit -m "HF-290: import list poller terminal-stop (same defect class as HF-286, different endpoint)"
```

### §2C — Phase 2: proof gate

| # | Proof | Pass |
|---|---|---|
| 1 | After import completes, **zero** `[import] /` polls in a 30s log window | Paste the log or the absence |
| 2 | During active import, polling **continues** at unchanged cadence | Behavior preserved |
| 3 | Build: `rm -rf web/.next && cd web && npm run build` exit 0, `tsc` 0 errors, `localhost:3000` 200 | Paste |

If browser-level proof is auth-gated (same limitation as HF-286/287), state honestly and provide the closest faithful substitute (static trace of the `clearInterval` site + the stop predicate logic). Do not fabricate log lines.

---

## §3 — Reporting

Completion report at `docs/completion-reports/HF-290_COMPLETION_REPORT.md`:
1. **SHAs**
2. **Phase 0 findings** — pasted poller body, state model, stop predicate chosen, one-or-two callers verdict
3. **Phase 1** — pasted final code
4. **Phase 2 proofs** — all three with pasted evidence
5. **Residuals** — any additional import-surface pollers discovered but not fixed (flag for DS-029)
6. **ARTIFACT SYNC:**
```
ARTIFACT SYNC
MC: [HF-290 → status]
REGISTRY: [import-list poller-stop → evidence]
R1: [D-tier operational quality — import-list log noise eliminated]
BOARD: [Performance +]
SUBSTRATE: [ICA candidate: "all interval-based pollers must carry terminal-stop guards — the defect class, not just individual instances"]
```

**The completion report must be committed to the branch BEFORE the PR is opened** (Rule 42 — the report exists in the PR's file list at creation time, not added after).

Final step:
```
cd /Users/AndrewAfrica/spm-platform
git push origin hf/290-import-list-poller-terminal-stop
gh pr create --base main --head hf/290-import-list-poller-terminal-stop \
  --title "HF-290: import list poller terminal-stop (defect class sibling of HF-286)" \
  --body "Stops the import-list/status poller at terminal state. Same defect class as HF-286 on a different endpoint. Cadence untouched, behavior preserved during active work. Completion report committed."
```

---

## §4 — HALT Conditions

- **HALT-1 — mutation required to read.** Phase 0 is read-only; if a finding needs an edit to obtain, stop.
- **HALT-2 — more than 2 distinct pollers found on this surface.** Report the full set and stop for architect scope decision rather than silently expanding.
- **HALT-3 — the poller is already terminal-aware and the log noise has a different cause.** Report the actual stop condition and what's keeping it polling; the fix may be different from "add a stop guard."

---

## §5 — Out of Scope

- SCIProposal.tsx and ImportTelemetryPanel.tsx (HF-286, already shipped).
- SSE/push replacement for polling (DS-029).
- Poll cadence changes (separate optimization).
- Any convergence, calculation, or plan-interpretation code.

---

## §5A — Residuals

- The ICA capture candidate is the defect CLASS: "all interval-based pollers must carry terminal-stop guards." HF-286 fixed two; this fixes the next; DS-029 replaces the pattern architecturally. The class-level audit (are there more?) is DS-029 scope.
