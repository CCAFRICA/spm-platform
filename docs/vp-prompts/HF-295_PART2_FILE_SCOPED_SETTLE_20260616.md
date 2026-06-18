# HF-295 PART 2 — File-Scoped Settle + Per-File Failure Isolation + User-Understandable Errors
## Continuing directive · authorized after DIAG-069 · 2026-06-16

**Date:** 2026-06-16
**Category:** HF (Hotfix) — Part 2 build, authorized
**Predecessor:** HF-295 Part 1 / DIAG-069 (`3bbce95b`) — root cause CONFIRMED (H5): settle-scope mismatch. `settleFromSurface()` gates on import-wide `confirmedUnits` (SCIExecution.tsx:166) while dispatch is per file group (:525→:537), so after group one commits, the gate can never satisfy and subsequent groups are starved (~3×90s stall + 3 redundant re-POSTs each).
**Drafting reference:** `INF_Structured_Compliant_Drafting_Reference_20260513.md`

---

## §0 — WHAT CHANGED FROM CC'S PROPOSED SCOPE (READ FIRST)

CC's Part 1 proposal: scope the settle to the current **group's** unit ids. The architect has revised and EXTENDED this. Two binding changes:

1. **The isolation unit is the FILE, not the group.** Settle, terminal-state, and failure boundary are all per-file. If one file fails, every other file must still process to completion. A file's failure is structurally prevented from affecting any sibling file. (This is SR-34 adjacent-arm discipline as architecture: isolate the class, not just the instance.)

2. **NET-NEW SCOPE — a failed file must explain itself in user-understandable terms.** This was NOT in CC's proposal. A business user must see, for any failed file: what failed, at what stage, what was expected vs. what was received, what to do about it, and what it blocks. No stack traces, no raw HTTP status codes, no `String(err)` dumps in the UI. This is the Five Elements test applied to an error state (value · context · comparison · action · impact) and the Thermostat Principle (act on the failure by explaining it, not merely flagging red).

Both changes are in scope for this single HF because they are one coherent invariant: **per-file independence with per-file accountability.** They are not separable — file isolation without a comprehensible failure message produces silent per-file failure, which is the same class of defect being fixed.

---

## §1 — DISCIPLINE

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all standing rules apply.
2. **AUD-009 one-invariant-per-layer.** This HF touches two layers: (a) the dispatch/settle scope (client control flow), and (b) the error-surfacing layer (client presentation + the error contract from server). Each gets a discrete, separately-verifiable change. They share one proof run but are distinct edits.
3. **No over-correction.** The single-file import path and the all-files-succeed path must remain unchanged in behavior. The fix changes what happens on (a) multi-file dispatch sequencing and (b) any-file failure — nothing else.
4. **Root cause is CONFIRMED.** Do not re-diagnose. Build against DIAG-069's finding.

---

## §1A — ULTRACODE ORCHESTRATION (form the campaign before building)

Do not execute §2 → §3 → §4 as a linear checklist. This work has genuine campaign structure — form it as one and state the orchestration plan as the first commit of the build, then execute.

**The fan-out (opening, paid once).** The pre-build verification targets are disjoint reads — one worker each, producing a single merged STATE MAP before any code changes:
- T1: `SCIExecution.tsx` settle definition + tracked-set binding (:166, :191) and the dispatch loop (:514–520, :525, :537)
- T2: the per-file result/terminal-state shape the dispatch loop consumes (where success/error is set on a unit)
- T3: the server's per-unit terminal emission in `execute-bulk/route.ts` (:460, :515–554, :555) — confirm it is already correct (DIAG-069 says it is) so the build does NOT touch it
- T4: the existing i18n mechanism + key structure for demo-path Spanish (where keys live, how the component reads them)
- T5: the current error-rendering path in the execution UI (how a unit's error currently displays — the surface that produces the indefinite spinner)

Five disjoint reads, one merged STATE MAP. No build begins until the map is produced.

**Keystone-then-parallel.** The keystone is **Layer A's settle-scope change (§2)** — sequential and first because it defines the control flow that everything else renders into. Per-file terminal states must actually *happen* before Layer B's per-file failure messages have anything to attach to. Build and confirm the keystone, THEN parallelize.

After the keystone, two file-disjoint streams run in parallel:
- **Stream B1 — the error-translation function** (internal error class → user payload, §3.1/§3.2). New logic, its own module.
- **Stream B2 — the presentation + i18n** (failed-file rendering, Spanish keys, §3.3). The component + locale files.

**The collision, surfaced now (not at merge).** Both Layer A and Stream B1 touch the **per-file result shape** — Layer A writes the terminal state and attaches the failure payload; Stream B1 defines that payload's structure; Stream B2 reads it. Therefore the **result-shape extension is a shared keystone dependency**: it lands as part of the keystone (Layer A) before either B-stream consumes it. State this in the ADR. CC does not discover it at merge.

**One batched sweep.** The §4 proof gate — including the deliberate GT-file failure test — runs once across the whole build, not per-layer. Two lenses paid once: (a) no-silent-failure (every file reaches a visible terminal state) read across the full dispatch path, and (b) Korean-Test compliance (scope-by-unit-id-parameter; error-class-not-filename) read across both layers.

**CC's formation deliverable:** as the first commit, CC states the orchestration plan — the five fan-out targets and merged STATE MAP, the keystone (settle-scope + result-shape extension), the two parallel disjoint B-streams, the surfaced collision, and the one-sweep lens set — in the build's ADR, then executes it. The plan is CC's orchestration call; it is not a re-statement of this section.

---

## §2 — LAYER A: FILE-SCOPED SETTLE (the dispatch fix) — THE KEYSTONE

The defect: `settleFromSurface()` terminal condition is import-wide. The fix: make it per-file.

### A.1 — Trace the current scope binding

`view` `SCIExecution.tsx` around the settle definition (:166) and the executeBulk call site (:308, :537). Confirm:
- `trackedIds` is currently `confirmedUnits.map(...)` (import-wide).
- `settleFromSurface` returns true only when `settledCount >= trackedIds.length`.
- `executeBulk(group)` is awaited per file group at the dispatch loop (:525–:537).

Paste the current code for all three.

### A.2 — Scope the settle to the file

Change the settle's tracked set from the import-wide `confirmedUnits` to **the unit ids belonging to the file currently being dispatched.** The dispatch loop already iterates file groups keyed by `sourceFile` (:514–520); pass that group's unit ids into `executeBulk` → `settleFromSurface` so the terminal condition is "this file's units are settled," not "all files' units are settled."

Requirements:
- The settle terminal condition becomes per-file: a file settles when its own units reach terminal state.
- The dispatch loop advances to the next file as soon as the current file settles — no cross-file waiting.
- `MAX_EXECUTE_ATTEMPTS` / `STALL_MS` semantics now apply per-file (a stalled file exhausts its own attempts without burning sibling files' time).

**Korean Test / structural discipline:** the scoping is by unit-id set passed as a parameter — not by any filename string-matching or content-type branching. The function becomes scope-parametric; it does not learn what a "file" is.

### A.3 — Sequential vs. continue-on-failure

The dispatch loop processes files sequentially (one file's bulk call at a time — preserves the server's per-file storage download model). **On a file failure, the loop CONTINUES to the next file.** It does not abort the batch. Each file's success or failure is independent and recorded independently.

Confirm in code that the `for (const [sourceFile, groupUnits] of fileGroups)` loop body wraps each file's dispatch such that a thrown error or a failed settle for one file does not `break` or `return` out of the loop — it records the failure for that file and `continue`s.

---

## §3 — LAYER B: USER-UNDERSTANDABLE FAILURE SURFACING (net-new)

When a file fails, the UI must render a failure the user can act on. This has two parts: the **error contract** (what data the failure carries) and the **presentation** (how it renders).

### B.1 — Define the failure contract

Every per-file failure must carry a structured, user-oriented payload — not a raw error string. Define (or extend) the result shape so a failed file produces:

| Field | Meaning | Example |
|---|---|---|
| `fileName` | The file, by its original name | `MIR_Resultados_Esperados.xlsx` |
| `stage` | Where it failed, in plain words | "Reading the file" / "Understanding the columns" / "Saving the data" |
| `reason` | What went wrong, in business terms | "This file looks like a results report, not source data" |
| `expectedVsReceived` | The comparison | "Expected sales or collection records; found pre-calculated totals" |
| `recommendation` | What the user should do | "Remove this file from the import — it appears to be a reconciliation reference, not data to load" |
| `blocks` | What this failure prevents | "Nothing else — the other 15 files imported successfully" |

The mapping from internal error → user-oriented payload lives in ONE place (a translation function), not scattered across catch blocks. Internal technical detail may be retained in a collapsible/secondary field for the architect, but the PRIMARY display is the user-oriented payload.

**Structural discipline:** the translation maps internal error *classes* (parse failure, classification mismatch, insert failure, timeout) to user messages. It is not a per-file or per-tenant lookup. New error classes get a default user message ("This file could not be processed at the [stage] stage") — never a raw dump, never a silent pass.

### B.2 — Stage vocabulary

The `stage` field uses a fixed, small, user-facing vocabulary mapped from the internal pipeline stages:

| Internal stage | User-facing words |
|---|---|
| Storage download / parse | "Reading the file" |
| Header comprehension / classification | "Understanding the columns" |
| Entity resolution | "Matching records to people" |
| committed_data insert | "Saving the data" |
| Settle / terminal | "Finalizing" |

### B.3 — Presentation

In the execution UI (the import progress surface — the screen showing the 17 content units):
- A failed file renders with a clear failed state (distinct from pending and from success) and shows the `reason` + `recommendation` inline, in the user's language (Spanish for MIR — `es-PE`).
- The user can see at a glance: N succeeded, M failed, and for each failure, why and what to do.
- A failed file must NEVER appear as an indefinite spinner (the original symptom). Failed is a terminal, visible, explained state.
- Successful files show their committed row counts.

**Localization:** the user-facing strings route through the existing i18n mechanism (the failure messages are demo-path content; they must render in Spanish for the MIR persona). If the i18n keys don't exist, add them; do not hardcode Spanish or English literals in the component.

---

## §4 — PROOF GATE

Architect runs the MIR import in the browser and verifies:

**Layer A (dispatch):**
- [ ] All files dispatch. Server logs show a `Downloading from Storage` + `Complete` for EACH file, not just the first.
- [ ] No 90s stalls between files; no triple re-POST of the same file. (Grep server log: each file's storage download appears once.)
- [ ] Total wall-clock is roughly the sum of per-file processing, not 80 minutes.
- [ ] `committed_data` row count (architect tsx-script) matches the sum of successful files.

**Layer B (failure surfacing) — tested deliberately:**
- [ ] Include the GT file (`MIR_Resultados_Esperados.xlsx`) in the import ON PURPOSE for this test. It SHOULD fail or be flagged (it is results data, not source data).
- [ ] The GT file's failure renders with: which file, what stage, why (business terms), what to do, what it blocks. In Spanish.
- [ ] The other 16 files import successfully DESPITE the GT file failing — proving per-file isolation.
- [ ] No file shows an indefinite spinner. Every file reaches success or explained-failure.
- [ ] Session-state polling stops after all files terminal (zero polls 30s post-completion).

**Regression:**
- [ ] A single-file import still works unchanged.
- [ ] An all-files-succeed import (GT file excluded) shows all green, correct counts, no failures.

---

## §4A — RESIDUALS / OUT OF SCOPE

- **GT-file auto-exclusion by naming convention.** This HF makes the GT file fail *gracefully and understandably* — it does NOT build a heuristic to auto-detect-and-exclude reconciliation files by name. If that's wanted, it's a separate item. For the demo, the user simply doesn't select the GT file; this HF ensures that IF selected, it fails cleanly rather than hanging the batch.
- **The async `processing_jobs` path.** Exists as a separate route; not touched. The synchronous per-file path is what this fixes.
- **Log-level suppression of 200-status `session-state` noise.** Once polling stops correctly (Layer A unblocks dispatch, H4 resolves), the volume drops. If residual noise remains, log-hygiene is a separate one-line item — not folded here.
- **PDR-01, currency convergence, DS-028, disputes, engine invariants** — all untouched.

---

## §5 — CC PASTE BLOCK

```
HF-295 PART 2 — AUTHORIZED. ULTRACODE. Build the file-scoped settle + per-file failure isolation + user-understandable error surfacing.

Root cause is CONFIRMED in DIAG-069 (settle-scope mismatch, H5). Do NOT re-diagnose. Build against the finding.

THIS RUNS AS AN ULTRACODE CAMPAIGN, NOT A LINEAR CHECKLIST. Form the plan first, state it as the ADR's first commit, then execute:
- FAN-OUT (paid once, disjoint reads, one merged STATE MAP before any build): T1 SCIExecution.tsx settle+dispatch (:166,:191,:514-520,:525,:537); T2 the per-file result/terminal-state shape; T3 server per-unit terminal emission in execute-bulk/route.ts (:460,:515-554,:555) — confirm correct, do NOT touch; T4 i18n mechanism + key structure for es-PE; T5 current error-rendering path (the indefinite-spinner surface).
- KEYSTONE (sequential, first): Layer A settle-scope change + the per-file result-shape extension. This defines the control flow everything else renders into.
- THEN PARALLEL (file-disjoint): Stream B1 = error-translation function (error class → user payload); Stream B2 = presentation + i18n Spanish keys.
- SURFACED COLLISION (honor, don't discover at merge): Layer A, B1, B2 all touch the per-file result shape — the shape extension lands in the keystone before either B-stream consumes it.
- ONE BATCHED SWEEP: §4 proof gate once across the whole build; two lenses paid once (no-silent-failure across dispatch; Korean-Test across both layers).

TWO BINDING CHANGES from your Part 1 proposal:
1. Isolation unit is the FILE, not the group. Settle, terminal-state, failure boundary per-file. One file failing must NOT affect any other. Dispatch loop CONTINUES on a file failure (record + advance) — never break the batch.
2. NET-NEW: a failed file explains itself in user terms — what failed, what stage, expected vs received, what to do, what it blocks. No stack traces, no raw HTTP codes, no String(err) in the UI. ONE translation function: error class → user payload; unknown class → default message naming the stage; NEVER a raw dump, NEVER a silent pass. Stage vocabulary + messages via i18n (Spanish for MIR).

LAYER A (keystone): change settleFromSurface's tracked set from import-wide confirmedUnits (SCIExecution.tsx:166) to the current file's unit ids, passed as a parameter. File settles when ITS units are terminal; loop advances immediately; MAX_EXECUTE_ATTEMPTS/STALL_MS apply per-file. Scope by unit-id-set parameter — NO filename string-matching, NO content-type branching (Korean Test). On file failure: record + continue, never break/return.

LAYER B (parallel after keystone): per §3.1 failure contract (fileName, stage, reason, expectedVsReceived, recommendation, blocks); stage vocabulary per §3.2; presentation per §3.3 — distinct terminal failed state + reason + recommendation inline, Spanish via i18n, never an indefinite spinner, successful files show row counts.

Single-file and all-success paths unchanged (no over-correction).

After build: commit, push, kill dev server → rm -rf .next → npm run build → npm run dev → confirm localhost:3000. Completion report at docs/completion-reports/ with: the ADR orchestration plan, pasted diff of the settle-scope change, pasted diff of the result-shape extension, pasted diff of the translation function, pasted i18n keys, build exit-0 evidence. Then PR: gh pr create --base main --head [branch].

Architect runs the §4 proof gate in the browser (including the deliberate GT-file failure test — architect-only, SR-44).
```

---

*HF-295 Part 2 · File-Scoped Settle + Per-File Failure Isolation + User-Understandable Errors · 2026-06-16*
*vialuce.ai · Intelligence. Acceleration. Performance.*
*Drafted to INF_Structured_Compliant_Drafting_Reference_20260513.md*
