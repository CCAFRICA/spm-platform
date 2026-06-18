# AUD-018 — Pipeline Forensic (ULTRACODE-NATIVE): Model Inventory · Request-Param Inventory · Plan-Import Trace · HF-281→Current Diff

**Date:** 2026-06-17
**Type:** AUD — read-only forensic. NO source changes, NO migrations, NO fixes, NO fix-branch.
**Sequence:** AUD-018 (architect-assigned). Phase 0 confirms the number is free before any output is written.
**Execution mode:** ULTRACODE / effort-mode native. This directive is written as an orchestration plan:
four work products, three of them parallelizable agents, one sequential. Effort level is authorized to
maximize **coverage and parallelism** — it does NOT relax the read-only fence or any HALT (see §0).

This directive is the prompt (DD-11). Phase prose is the executable. Nothing follows §11. Read
`CC_STANDING_ARCHITECTURE_RULES.md` first.

---

## §0 — CC Standing Rules + Ultracode Fence

`CC_STANDING_ARCHITECTURE_RULES.md` applies in full. Drafted against
`INF_Structured_Compliant_Drafting_Reference_20260513.md`. Binding: SR-44 (evidence over assertion — every
finding is pasted raw command output, never a claim), DD-6 (diff = `git diff` evidence, not described),
DD-10 (this directive lives at `docs/vp-prompts/`; outputs at `docs/audits/`), Rule 19 (do not re-derive
what an inventory already proves), Korean Test for any classification.

**Read-only — and this binds at every effort level.** Ultracode may parallelize and deepen the *gathering*
of evidence. It may NOT implement a fix, change a model string, remove a parameter, create a fix-branch,
run a calculation, or perform a browser import. The deliverable is four evidence files. **HALT-0:** if any
sub-agent finds a fix "obvious," it records a one-line advisory in its output file and continues — no
implementation, regardless of effort budget. Higher effort buys breadth and cross-checking, not license.

**Ultracode orchestration plan (the native shape of this audit):**
- **Agent A (Phase A)** — exhaustive hardcoded-model + model-resolution inventory → OUTPUT FILE A.
- **Agent B (Phase B)** — exhaustive request-parameter + deprecated-param inventory → OUTPUT FILE B.
- **Agent D (Phase D)** — HF-281→current per-stage diff → OUTPUT FILE D.
- Agents A, B, D are **mutually independent** (no agent consumes another's output) → run them in parallel
  under effort-mode. Each owns one output file; no shared-file write contention.
- **Agent C (Phase C)** — live Plan-Import end-to-end trace → OUTPUT FILE C — is **sequential by nature**
  (each node's output is the next node's input; a call-chain cannot be parallelized). Run C as a single
  focused walk; effort-mode is applied here to *exhaustively flag divergent paths at each node*, not to
  parallelize the walk.
- **Dependency:** all four agents depend only on Phase 0 (the two resolved SHAs). Phase 0 runs first,
  single-threaded; then A/B/D fan out in parallel and C runs as its own track.

Git from repo root (`spm-platform`), NOT `web/`.

---

## §1 — Problem Statement

Model selection and request construction have been diagnosed piecemeal this session and the diagnoses kept
dissolving against the live code. Established facts (architect read live code + Vercel config):
- The AI service constructor on main resolves the model as
  `process.env.NEXT_PUBLIC_AI_MODEL || 'claude-sonnet-4-6'`, and **`NEXT_PUBLIC_AI_MODEL` is NOT set on
  Vercel** — so every AI task runs on the hardcoded `'claude-sonnet-4-6'` fallback. There is no in-force
  per-task model selection.
- HF-304 claimed a per-task Opus branch in `anthropic-adapter.ts`, but tonight's Meridian import ran
  `plan_skeleton` on `claude-sonnet-4-6` and failed with `400: temperature is deprecated for this model` —
  i.e. HF-304 did not take effect on the deployed path AND a deprecated `temperature` param aborts the
  call before interpretation.

These are symptoms of two **uninventoried classes** — hardcoded model strings / resolution points, and
request-body parameters (incl. deprecated `temperature`) at every construction site. Prior directives
inspected single sites; the original AUD-017 was clipped to one path and missed the class. AUD-018
inventories both classes **exhaustively**, and additionally delivers the two things AUD-017 was meant to
and didn't: a **live end-to-end Plan-Import trace** and a **per-stage HF-281→current diff**.

---

## §2 — Substrate-Bound Discipline Applications

- **Prove Don't Describe (IGF-T1-E905) / SR-44:** every output file is raw pasted evidence — grep output,
  `git diff` output, traced call sequences with file:line — not prose summary. A finding without pasted
  evidence is not a finding.
- **Adjacent-Arm Drift (IGF-T1-E952):** inventories are exhaustive (whole `web/src`), not scoped to the
  adapter — because the governing model line was found in the *service* constructor, not the adapter. The
  class lives at multiple sites; instance-scoped looks have already failed this session. Ultracode breadth
  is the structural countermeasure to this exact drift class.
- **Korean Test:** any classification (which task a model line governs, which stage a file belongs to)
  keys on structural code evidence, not assumption.
- **Reconciliation-channel separation:** no ground-truth payout values appear here. This audit is
  structural (model strings, request params, call sequence, diffs).

---

## §3 — Phase 0: Confirm number + resolve both SHAs (single-threaded; runs before fan-out)

The architect does not speak in SHAs. Resolve them here; confirm AUD-018 is free; record both SHAs in
every output header.

```bash
cd "$(git rev-parse --show-toplevel)"
# Number collision check — AUD-018 and its A/B/C/D outputs must not already exist:
ls docs/audits/ | grep -iE "AUD-018" || echo "AUD-018 free."

git fetch --all --tags --prune
git checkout main && git pull --ff-only
CURRENT_SHA="$(git rev-parse HEAD)"
echo "CURRENT_SHA=${CURRENT_SHA}"

# GOOD baseline = HF-281 merge (2026-06-10, last proven-exact: BCL + Meridian reconciled).
git log --oneline --all --grep="HF-281" | head -20
git log --oneline --all --since="2026-06-09" --until="2026-06-11" | grep -i "281" | head
```

Identify the HF-281 merge/closure commit, set `GOOD_SHA`, verify it is an ancestor of HEAD:

```bash
GOOD_SHA="<the HF-281 merge sha>"
git merge-base --is-ancestor "${GOOD_SHA}" HEAD && echo "GOOD_SHA on main history: ${GOOD_SHA}" || echo "WARN: not ancestor — re-identify"
git show -s --format='%H %ci %s' "${GOOD_SHA}"
```

**HALT-1:** if the HF-281 commit cannot be uniquely identified, paste candidates around 2026-06-10 and
surface — do not guess a SHA.
**HALT-4:** if `AUD-018` (or any A/B/C/D output) already exists, surface and stop — do not overwrite, do
not derive a replacement number.

Record `GOOD_SHA` and `CURRENT_SHA` verbatim in the header of all four output files. **Then fan out:**
launch Agents A, B, D in parallel; run Agent C as its own sequential track.

---

## §4 — Phase A (Agent A, parallel): Exhaustive hardcoded-model + model-resolution inventory → **OUTPUT FILE A**

Find EVERY model literal and EVERY model-resolution point across the whole source tree — not just the
adapter, not just plan interpretation. Effort-mode: run these as parallel sweeps and cross-check coverage.

```bash
cd "$(git rev-parse --show-toplevel)"
grep -rnE "claude-[a-z0-9.\-]+" web/src --include=*.ts --include=*.tsx | grep -v node_modules
grep -rnE "model\s*[:=]" web/src --include=*.ts --include=*.tsx | grep -v node_modules | grep -iE "claude|process\.env|config\.model|MODEL|opus|sonnet|haiku"
grep -rnE "process\.env\.[A-Z_]*MODEL[A-Z_]*" web/src --include=*.ts --include=*.tsx | grep -v node_modules
grep -rnE "PLAN_INTERPRETATION_MODEL|PLAN_INTERPRETATION_TASKS|request\.task|task ===|TASKS\.has" web/src --include=*.ts | grep -v node_modules
```

For **each** hit, record in FILE A: `file:line | literal/expression | which task path(s) it governs (how
determined from code) | default/fallback vs in-force selection`. Then resolve the live question:
- Paste the `web/src/lib/ai/ai-service.ts` constructor model-resolution lines verbatim.
- Paste the `web/src/lib/ai/providers/anthropic-adapter.ts` `requestBody` `model:` line(s) verbatim;
  confirm whether HF-304's `PLAN_INTERPRETATION_TASKS` branch is PRESENT on `CURRENT_SHA`, and if present,
  whether `request.task` equals `plan_skeleton`/`plan_component` at that point (trace the task value to the
  call).
- State in one sentence, backed by the pasted lines: **what model string is actually sent for a
  `plan_skeleton` request on `CURRENT_SHA`, and from which file:line that string originates.**

FILE A closes with the complete model-site table + a one-paragraph advisory (read-only) on where a single
authoritative model-selection point should live. If HF-304's branch is present-but-bypassed, name the
bypass path — it is the precise reason HF-304 did not take effect.

**Write to:** `docs/audits/AUD-018_A_HARDCODED_MODEL_INVENTORY.md`

---

## §5 — Phase B (Agent B, parallel): Exhaustive request-parameter + deprecated-param inventory → **OUTPUT FILE B**

Inventory every request-body construction and every API parameter, focus on the deprecated `temperature`
that aborted tonight's import.

```bash
cd "$(git rev-parse --show-toplevel)"
grep -rnE "temperature" web/src --include=*.ts --include=*.tsx | grep -v node_modules
grep -rnE "messages\.create|requestBody|api\.anthropic\.com|/v1/messages|max_tokens|top_p|top_k|stop_sequences" web/src --include=*.ts | grep -v node_modules
grep -rn "requestBody" web/src/lib/ai/providers/anthropic-adapter.ts
```

For **each** request-construction site, paste the full request-body object verbatim (`model`, `max_tokens`,
`temperature`, any other params) and record in FILE B: `file:line | every param sent | any param deprecated
for the in-force model (temperature is — note it) | does this site abort on a 400 / is it on the plan
path`. Identify definitively **which construction site produced tonight's `temperature` 400 on
`plan_skeleton`**, with pasted code.

FILE B closes with the complete param table + a one-paragraph advisory on removing/centralizing the
deprecated param at the class level (not one instance).

**Write to:** `docs/audits/AUD-018_B_REQUEST_PARAM_INVENTORY.md`

---

## §6 — Phase C (Agent C, sequential track): Live Plan-Import end-to-end trace → **OUTPUT FILE C**

Trace the **actual** Plan-Import call sequence on `CURRENT_SHA`, from upload route to API request, by
reading live code (not memory, not any prior audit). This track is sequential — follow the real calls in
order. Effort-mode here is spent flagging divergent paths at each node, not parallelizing the walk.

```bash
cd "$(git rev-parse --show-toplevel)"
grep -rnE "import/sci|execute-bulk|execute/route|finalize-import|SCI Bulk|plan-interp" web/src/app/api --include=*.ts | grep -v node_modules
grep -rnE "plan-orchestrator|Phase A skeleton|plan_skeleton|plan_component|interpretPlanSkeleton|interpretPlanComponent|interpretPlan" web/src --include=*.ts | grep -v node_modules
grep -rnE "getAIService|adapter\.execute|ai-service|header-comprehension" web/src --include=*.ts | grep -v node_modules
```

Produce in FILE C the ordered call sequence as numbered nodes. Per **node**: `step # | file:line | function
| input | output/produces | for AI nodes: task name + the model-resolution this node uses`. Explicitly mark:
- the entry route actually used (confirm `execute` vs `execute-bulk` — one is retired),
- the Phase A skeleton node and the Phase B component node (where c1-senior is constructed),
- the exact node where the model string is bound and the exact node where `temperature` is set,
- **any DIVERGENT or ABANDONED path** for any stage (a second function doing the same job, a dead route, an
  orchestrator path that bypasses the adapter seam HF-304 edited). Flag each in a "DIVERGENCE" callout with
  both paths' file:line.

FILE C closes with a "Unified vs Divergent" verdict for the Plan-Import path: one spine, or parallel/
abandoned paths — named with evidence.

**Write to:** `docs/audits/AUD-018_C_PLAN_IMPORT_TRACE.md`

---

## §7 — Phase D (Agent D, parallel): HF-281 → current per-stage diff → **OUTPUT FILE D**

Diff `GOOD_SHA..CURRENT_SHA` per pipeline stage, classified by behavior impact. Build the stage→file map
from the real files (cross-reference Agent C's trace where overlapping; do not block on it — use the grep
inventory below).

```bash
cd "$(git rev-parse --show-toplevel)"
git diff --stat ${GOOD_SHA}..${CURRENT_SHA} -- web/src/app/api/import web/src/lib/sci web/src/lib/ai web/src/lib/plan-intelligence web/src/lib/intelligence web/src/app/api/calculation
git log --oneline ${GOOD_SHA}..${CURRENT_SHA} -- <stage-file>
git diff ${GOOD_SHA}..${CURRENT_SHA} -- <stage-file>
```

Cover at minimum: **Import-Plan (PPTX→rule_set), Import-Transaction/SCI, Import-finalize/assignments,
Plan-interpretation (skeleton/component + intent-constructor), Convergence, Calculation** — mapping each to
its real files. Per stage, a row in FILE D: `stage | files changed GOOD→CURRENT | commits | what changed
(by function, not whitespace) | could it affect behavior? Y/N + one line why | regression / fix / neutral`.

**HALT-2:** stage file absent at `GOOD_SHA` (created after HF-281) → mark NET-NEW, trace current content.
**HALT-3:** single file's diff > ~1000 lines → summarize by function (signatures + changed logic), not
full paste.

FILE D closes with the per-stage regression/fix/neutral table — the by-function diff AUD-017 was meant to
deliver.

**Write to:** `docs/audits/AUD-018_D_HF281_TO_CURRENT_DIFF.md`

---

## §8 — HALT Conditions (consolidated)

- **HALT-0 (all agents, all effort levels):** a fix looks obvious → one-line advisory in the output file,
  do NOT implement. Read-only is absolute.
- **HALT-1 (§3):** HF-281 commit not uniquely identifiable → paste candidates, surface, do not guess.
- **HALT-2 (§7):** stage file absent at GOOD_SHA → mark NET-NEW, trace current content.
- **HALT-3 (§7):** single-file diff > ~1000 lines → summarize by function.
- **HALT-4 (§3):** AUD-018 / any A-D output already exists → surface, stop, do not overwrite or renumber.

---

## §9 — Reporting Discipline

No separate completion report — **the four output files ARE the deliverable.** Each carries, in its header,
`GOOD_SHA`, `CURRENT_SHA`, audit date. After all four exist (A/B/D agents joined + C track complete):

```bash
cd "$(git rev-parse --show-toplevel)"
git add docs/audits/AUD-018_A_HARDCODED_MODEL_INVENTORY.md \
        docs/audits/AUD-018_B_REQUEST_PARAM_INVENTORY.md \
        docs/audits/AUD-018_C_PLAN_IMPORT_TRACE.md \
        docs/audits/AUD-018_D_HF281_TO_CURRENT_DIFF.md
git commit -m "AUD-018 (ultracode): model inventory + request-param inventory + plan-import trace + HF-281→current diff (read-only forensic, 4 output files)"
git push
```

Do NOT open a PR (read-only; nothing to merge). In your reply, surface all four file paths, the resolved
`GOOD_SHA` and `CURRENT_SHA`, and — from FILE A — the single sentence stating what model string is actually
sent for `plan_skeleton` on current main and from which file:line.

---

## §10 — Out of Scope

- No fixes, no model change, no `temperature` removal, no fix-branch. Those follow from these four files in
  a separate work item.
- No calculation runs, no reconciliation, no browser import.
- MIR convergence remediation, the 8 threshold-debt items, and the Meridian cell-count fix are downstream
  of this evidence, not part of it.

## §11 — Residuals

- The four output files are designed to feed an HTML trace viewer the architect channel will build; keep
  each file tabular/sectioned (headers, file:line, per-node rows) so it parses cleanly. Optionally, Agent C
  and Agent D may additionally emit a machine-readable `docs/audits/AUD-018_trace.json` (nodes + edges +
  per-stage diff classification) — additive, do not block the four .md files on it.
- Ultracode note: A/B/D are embarrassingly parallel; C is the critical-path track. Total wall-time is
  bounded by the longer of {C} and {slowest of A/B/D}. Effort budget is best spent deepening A's and B's
  coverage (the class-completeness that AUD-017 lacked) and C's divergence-flagging.
