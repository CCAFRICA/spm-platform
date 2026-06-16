# DIAG-067 — SCI Session-State Polling Reconnaissance (read-only)

**Repo:** `CCAFRICA/spm-platform` (VP)
**Authored:** 2026-06-13 (architect channel)
**Type:** DIAG — read-only reconnaissance. **Ships no code. Makes no mutation. Asserts no cause.**
**Sequence number:** **DIAG-067**, sequenced by the architect from the session record (DIAG-059 through DIAG-066 consumed — DIAG-065 consumed though withdrawn, DIAG-066 committed `a14265f8`; 067 is next-free). **Collision gate:** before the first commit, CC verifies `ls docs/diagnostics/DIAG-067*` returns empty; if 067 is already claimed, HALT and report — do not renumber unilaterally.
**Location:** this directive and its `_OUTPUT.md` report both reside in `docs/diagnostics/` (DIAG SOP — DIAGs and their outputs colocate there, NOT in `docs/vp-prompts/`).
**Pairs with:** the forthcoming polling-fix HF. The handoff names it "HF-286," but that number is NOT asserted here — Phase 0.2 reads the real next-free HF number from the repo for the fix HF to use.

---

## §0 — CC Standing Rules header

This directive is governed by `CC_STANDING_ARCHITECTURE_RULES.md` (read it top-to-bottom before executing). Binding throughout: Rule 7 (Prove, Don't Describe — every finding is pasted real code/output, never description), Rule 1 (AI-First / no hardcoding — informational here; this DIAG touches no classification logic), and the reconciliation-channel separation discipline (this DIAG contains NO ground-truth values, NO tenant reconciliation targets, and must not introduce any).

Drafting-discipline source: `INF_Structured_Compliant_Drafting_Reference_20260513.md`. This is a read-only DIAG, so the HF phase-prose rules (DD-1 through DD-9) apply only insofar as they bind reporting fidelity; the operative rules here are Rule 7 (prove don't describe) and the standing prohibition on inventing identifiers (DD-10-adjacent: numbers read from the repo, never recalled).

**This DIAG performs no `git` mutation, no file edit, no migration, no schema write, and no forbidden mutation against any API route. It reads and reports. It stops at HALT-1 if any step would require a mutation to proceed.**

---

## §1 — Problem Statement

The platform polls the SCI import session-state endpoint continuously and does not stop at terminal states. Observed this session (2026-06-13): the client issues hundreds of poll requests per import operation, including after the operation has reached a terminal state (completed / failed / cancelled) and while an analyze proposal is displayed awaiting user action. This renders the production server logs unusable for diagnosis and wastes Vercel invocations.

A fix HF is queued to stop polling at terminal state and at analyze-proposal-pending. **That fix cannot be authored responsibly until the actual polling implementation is read.** The prior session drafted the fix from the log/narrative surface alone, without reading the implementation — a Rule 19 / "theorize before exhausting artifacts" defect. This DIAG closes that gap: it returns the real code the fix must operate on, so the fix HF is authored against pasted source, not assumption.

**This DIAG establishes WHAT THE CODE IS. It does not propose the fix.** The fix is a separate HF authored after this DIAG's findings return.

---

## §2 — Reconnaissance scope (what to find and paste)

For every item below, **paste the actual code verbatim** with file path and line range. Where something does not exist, state "NOT FOUND" and paste the grep command that returned empty. Do not summarize, characterize, or infer behavior beyond what the pasted code shows.

### Phase 0 — Collision gate + fix-HF number derivation (do this first)

0.1 **Collision gate for this DIAG.** This DIAG is **DIAG-067** (architect-assigned from the session record). Verify it is unclaimed: run `ls docs/diagnostics/DIAG-067*` and confirm it returns empty. If anything matches, **HALT** and report the conflict — do not renumber unilaterally. Report: "DIAG-067 collision gate: CLEAR" or the conflict.

0.2 **Derive the forthcoming fix HF's number** (this number genuinely is not on record yet). Search `docs/` (completion-reports, vp-prompts, diagnostics) and `git log` for the highest existing `HF-` number. Report: "Highest HF on record is HF-___; next-free is HF-___." (This is the number the polling-fix HF will use — the handoff names it HF-286, but report the real next-free number from the repo, not the recalled one.)

### Phase 1 — The session-state poller (client side)

1.1 Locate every client-side caller that polls `/api/import/sci/session-state` (or whatever the exact route path is — confirm the literal path). Grep the codebase for `session-state`, for the fetch/axios/SWR/react-query call that hits it, and for any polling hook (e.g. `useImportSession`, `usePolling`, `setInterval`, `useSWR` with `refreshInterval`, `useQuery` with `refetchInterval`). Paste:
- the file path(s) and the hook/function name(s)
- the full body of the polling hook/function verbatim
- the poll interval/cadence value and where it is defined

1.2 Show the **terminal-state handling**: within that poller, paste the exact code that decides whether to continue or stop polling. Specifically — is there any condition that stops polling when status is `completed`, `failed`, or `cancelled`? Paste the status-check code verbatim, or state "NO TERMINAL-STATE STOP CONDITION FOUND" and paste the grep that confirms its absence.

1.3 Show the **analyze-proposal-pending handling**: when the analyze proposal is displayed awaiting user action, does the poller continue? Paste the code path that governs polling during the analyze/proposal-display state, or state "NOT FOUND."

1.4 Enumerate the **exact set of terminal/awaiting states** the session-state machine can be in. Paste the status enum / union type / string-literal set from the source (the server route's response shape, the type definition, or wherever the canonical state vocabulary lives). The fix needs the authoritative state list, not a guessed one.

### Phase 2 — The telemetry-variant poller

2.1 The handoff names a "telemetry variant" poller that follows the same polling discipline. Locate it: grep for telemetry polling, any second endpoint polled on the same import lifecycle, or a telemetry/progress hook. Paste its body verbatim, its interval, and its terminal-state handling (or "NO TERMINAL-STATE STOP" + the confirming grep). If no distinct telemetry poller exists, state "NO DISTINCT TELEMETRY POLLER FOUND" and paste the grep.

### Phase 3 — The session-state route (server side) — SQL/DB surface check (FP-49 trigger determination)

3.1 Locate the server route handler for `/api/import/sci/session-state`. Paste the handler's body verbatim (or the relevant portion that shows what it reads).

3.2 **SQL-path determination (FP-49):** does this route execute any SQL or DB query? Paste the query/DB-client call verbatim if present, or state "NO SQL / NO DB QUERY IN THIS ROUTE — reads from [source]." This determines whether the forthcoming fix HF must carry an FP-49 SQL Verification Gate. Report the verdict explicitly: "FP-49 SQL Verification Gate: REQUIRED / NOT REQUIRED for the fix HF, because [evidence]."

### Phase 4 — Active-processing cadence (scope-boundary confirmation, read-only)

4.1 The fix will stop polling at terminal/awaiting states but will **NOT** change the active-processing poll cadence (that is a separate optimization, explicitly out of scope). To let the architect confirm that boundary is clean, paste the code that sets the cadence during active processing, and confirm whether the terminal-state stop and the active cadence are governed by the same code or separable. State: "Terminal-state stop is separable from active cadence: YES / NO, because [evidence]." Do not change anything — this is a read to confirm the fix can be scoped narrowly.

---

## §3 — Reporting discipline

Author the findings as a report at `docs/diagnostics/DIAG-067_SCI_SESSION_STATE_POLLING_RECON_OUTPUT.md`. Structure:

1. **Sequence numbers** (Phase 0 results: DIAG-067 collision-gate verdict; the next-free HF number for the fix).
2. **The session-state poller** (Phase 1: pasted hook body, interval, terminal-state handling verdict, analyze-pending handling verdict, authoritative state list).
3. **The telemetry-variant poller** (Phase 2: pasted body + verdicts, or NOT FOUND).
4. **The server route + SQL determination** (Phase 3: pasted handler, FP-49 REQUIRED/NOT REQUIRED verdict with evidence).
5. **Scope-boundary confirmation** (Phase 4: separable YES/NO with evidence).
6. **Files in scope for the fix** — a plain list of every file path the fix HF will need to touch, derived from what was found. No proposed edits; just the file inventory.

Every section pastes real code or a real grep result. Per Rule 7: no characterization without pasted evidence. If any finding is "NOT FOUND," the confirming grep command and its empty output are pasted.

Commit the output report and push:
```
cd /Users/AndrewAfrica/spm-platform
git add docs/diagnostics/DIAG-067_SCI_SESSION_STATE_POLLING_RECON_OUTPUT.md
git commit -m "DIAG-067: SCI session-state polling reconnaissance (read-only findings)"
git push origin <current-branch>
```
(Substitute the actual current branch — confirm with `git rev-parse --abbrev-ref HEAD` before pushing.)

---

## §4 — HALT Conditions

- **HALT-1 — Mutation required to proceed.** If any reconnaissance step appears to require a mutation (file edit, git mutation beyond committing the findings report, a write to any API route, a schema change) to obtain a finding, STOP and report what was needed and why. This DIAG is read-only; obtaining a finding must never require changing state.
- **HALT-2 — Route path mismatch.** If the literal session-state route path differs from `/api/import/sci/session-state`, do not guess which is correct — paste both what the handoff named and what the code actually uses, and report the discrepancy. The fix HF needs the real path.
- **HALT-3 — Fix-HF number ambiguity.** If the highest existing HF cannot be cleanly determined from `docs/` and `git log` (non-contiguous numbering, ambiguous record), STOP and report the ambiguity with the raw listing pasted, rather than asserting the fix HF's number. Numbers are read from the repo, never invented. (DIAG-067 itself is already architect-assigned; this HALT concerns only the forthcoming fix HF's number from Phase 0.2.)
- **HALT-4 — Forbidden mutation temptation.** If reaching a finding seems to call for auth-hacking past a 401/403 or otherwise bypassing a gate (as occurred this session on `/api/plan-readiness`), DO NOT. Report the gate, replicate the read-only path if one exists, and surface the limit. A forbidden mutation is never the way to a finding.

---

## §5 — Out of Scope

- Proposing or implementing the polling fix. This DIAG returns the code surface; the fix is a separate HF authored against these findings.
- Any change to active-processing poll cadence (separate optimization).
- SSE / push-based replacement of polling (that is DS-028 deliverable 3, an architectural design-spec item, not this tactical surface).
- Any convergence, calculation, plan-interpretation, or SCI-classification code. This DIAG touches none of it.
- Any reconciliation, ground-truth, or tenant-target value. None appears in this DIAG and none is to be introduced.

---

## §5A — Residuals

- The authoritative replacement for blind polling (terminal-state stop is the tactical fix; SSE/push is the architectural fix) lives in DS-028 deliverable 3. This DIAG and its fix HF are the tactical stopgap that makes logs usable now; they do not close the architectural item.
- If Phase 1 reveals multiple independent pollers beyond the session-state and telemetry pair, list them in finding §6 (files in scope) and flag for the architect — the fix HF's scope may need to widen to cover every terminal-non-stopping poller, but that widening is an architect decision made after these findings return, not assumed here.
