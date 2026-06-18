# HF-304 — Plan-Interpretation Model Upgrade to Opus

**Date:** 2026-06-17
**Type:** Hot Fix — correctness restoration (plan-interpretation regression, AUD-017)
**Sequence:** HF-304 (architect-assigned from the live ledger; HF-303 is the prior). Collision gate
before use: `ls docs/vp-prompts/ docs/diagnostics/ docs/completion-reports/ | grep -iE "HF-304"` must be
empty; if not, halt and surface — do not derive a replacement.

---

## §0 — CC Standing Rules

Read `CC_STANDING_ARCHITECTURE_RULES.md` in full before any command. Drafted against
`INF_Structured_Compliant_Drafting_Reference_20260513.md` (DD-1 through DD-12). Binding throughout:
Rules 25-28 (completion report before final build), SR-34 (no bypass — fix at the structural layer),
SR-44 (browser/production verification is the only valid pass; PASS/FAIL self-attestation is rejected —
pasted evidence required at every gate), AP-25 and the Korean Test (Decision 154 — structural
identifiers only, zero language-specific string literals in any change).

Governing scope rule for this HF: **DD-7 — preserve pre-HF behavior exactly except the single named
change.** The named change is the model used for the `plan_interpretation` task. No other AI task's model
changes. No refactor of the AI service, the adapter, or the orchestrator. No Observatory UI. No per-task
model map. Those are out of scope (§10) and parked as a CLT (§11).

Git from the repo root (`spm-platform`), NOT `web/`. Commit + push after each change.

---

## §1 — Problem Statement

AUD-017 (read-only forensic, committed at `docs/audits/AUD-017_PLAN_INTERPRETATION_REGRESSION_ROOT_CAUSE.md`)
established that Meridian plan import aborts at the intent-constructor with
`output count 19 does not match dimension product 20 (5×4)` on component `c1-senior`, where the identical
PPTX interpreted cleanly on 2026-05-31. The audit isolated the cause to a change in the Anthropic model
used for plan interpretation: the model now emits a 19-cell rate table for a 5×4 grid (dropping one
lowest-tier cell) where the prior model emitted 20, and the constructor's tolerance-free exact-match
check correctly rejects the short emission.

**The fix is to use a higher-reasoning model for plan interpretation — Opus.** Plan interpretation
(reading a plan document and emitting a complete, structurally-exact rate table) is the highest-reasoning
step in the pipeline; cell-completeness on a structured matrix is precisely the failure mode a stronger
model resolves. This HF routes the `plan_interpretation` task to Opus and leaves every other AI task on
its current model.

**Critical authoring note — no assumption about the current selection mechanism.** A prior
characterization of the model-selection code (an `process.env.NEXT_PUBLIC_AI_MODEL` fallback) is
**unverified and believed incorrect**. This directive makes NO claim about how the model is currently
chosen, where it is set, or what string is in force. §4 establishes the real mechanism from the live
code before anything is changed. Report what is actually on screen; if prior characterizations were
wrong, say so.

---

## §2 — Substrate-Bound Discipline Applications

- **Korean Test (IGF-T1-E910 / Decision 154):** the change keys on the typed task identifier
  (`plan_interpretation`) — a structural dispatch key already present in the AI request contract — never
  on any tenant data, column name, or language-specific literal. The model identifier is a single named
  constant at the selection point.
- **Prove Don't Describe (IGF-T1-E905) / SR-44:** every phase gate is a pasted artifact (raw grep
  output, the model identifier confirmed against the API, the orchestrator log showing 10/10). No gate
  passes on assertion.
- **Decision-Implementation Gap (IGF-T1-E953):** §4 forces the directive's premise (a single
  model-selection point reachable by `plan_interpretation`) to be confirmed against operative code before
  §6 edits; if the premise is false (multiple selection points, or the task does not reach a single
  point), HALT-1 fires and the architect re-scopes.
- **Reconciliation-channel separation:** this HF involves no ground-truth values. Plan interpretation is
  structural (rate-table cell count), not a payout reconciliation. No verification anchors appear in this
  directive; the c1-senior success criterion is structural (`rateTableCellCount=20`, `shape=banded_lookup`,
  Phase B 10/10), not a dollar figure.

---

## §3 — Phase 0: Live ledger and tree confirmation (no edits)

```bash
cd "$(git rev-parse --show-toplevel)"
git log --oneline -1
git branch --show-current
ls -1 docs/vp-prompts/ | sort -V | tail -6
ls -1 docs/diagnostics/ | sort -V | tail -4
ls -1 docs/completion-reports/ | sort -V | tail -4
```

Record HEAD SHA, current branch, and the assigned `HF-304`. Run the collision gate from the header.
Create a working branch for this HF if not already on one.

---

## §4 — Phase 1: Establish the real model-selection mechanism (no edits; paste raw output)

Make NO assumption about the form of the code. Locate, from first principles, wherever the Anthropic
model identifier for an API call is determined.

```bash
cd "$(git rev-parse --show-toplevel)"
grep -rn "claude" web/src --include=*.ts | grep -v node_modules
grep -rn "model" web/src/lib/ai --include=*.ts | grep -v node_modules
```

If the AI service/adapter layer is not under `web/src/lib/ai`, widen:

```bash
grep -rln "anthropic\|messages.create\|x-api-key\|api.anthropic.com" web/src --include=*.ts | grep -v node_modules
```

Open whatever file actually issues the plan-interpretation API request. Paste the real code block that
sets the model on that request. Then trace the call path from the plan orchestrator to that request:

```bash
grep -rn "plan_interpretation\|interpretPlan\|task:" web/src/lib/plan-intelligence web/src/lib/ai --include=*.ts | grep -v node_modules
```

**Report plainly, from what is on screen (not from any pattern previously described):**
1. The model identifier currently used for `plan_interpretation`, and the exact `file:line` that sets it.
2. How it is set — hardcoded literal, passed argument, selected by task, resolved by some other mechanism.
3. The call path: how a `plan_interpretation` request reaches that selection point.

If any prior characterization of this code (including an env-var fallback) does not match what is on
screen, state the discrepancy explicitly.

**HALT-1:** if there is not a single, clear selection point reachable by the `plan_interpretation` task —
e.g. the model is set in multiple places, or plan interpretation bypasses the shared selection point —
do NOT edit. Paste what you found and surface for architect re-scoping. The premise of §6 (one
selection point) must hold before editing.

---

## §5 — Phase 2: Confirm the target Opus model identifier (no edits; paste evidence)

Do NOT use an Opus model string from memory. Confirm the current Opus model identifier:

```bash
# Query the Anthropic models endpoint with the service credential already in the environment.
curl -s https://api.anthropic.com/v1/models \
  -H "x-api-key: ${ANTHROPIC_API_KEY}" \
  -H "anthropic-version: 2023-06-01" | head -60
```

If the environment variable name for the key differs, use the name discovered in §4's adapter code.
Paste the relevant portion of the response. Record the **exact** current Opus model identifier string to
be used in §6. If the endpoint is unreachable from the build environment, paste the failure and consult
the in-repo product/model reference if one exists; do not fabricate a string.

**HALT-2:** if the Opus identifier cannot be confirmed from the API or an authoritative in-repo source,
paste the obstacle and surface; do NOT proceed to §6 with an unconfirmed string.

---

## §6 — Phase 3: Route plan_interpretation to Opus (the single named change)

Only after §4 and §5 are pasted and confirmed. At the real selection point identified in §4, make
the `plan_interpretation` task resolve to the confirmed Opus identifier from §5. Constraints:

- The Opus identifier is a **single named constant** at the selection point (e.g.
  `const PLAN_INTERPRETATION_MODEL = '<confirmed-opus-id>'`), so the future Observatory CLT can lift it
  into a persisted setting without hunting scattered literals.
- Selection is keyed on the existing typed task discriminant (`task === 'plan_interpretation'` or the
  equivalent structural key §4 found) — NEVER on tenant data or a language-specific literal.
- **Every other AI task is untouched.** Do not change a global default that other tasks share. If the
  current mechanism is a single shared global with no per-task branch, introduce the minimal per-task
  branch for `plan_interpretation` only and leave the shared default exactly as found (DD-7).
- No other edit. No adapter refactor, no retry-logic change, no constructor change.

Paste the resulting diff (`git diff`) for architect inspection per DD-6 (diff evidence, not described).

---

## §7 — Phase 4: Prove it (SR-44 — pasted evidence, no self-attestation)

```bash
cd "$(git rev-parse --show-toplevel)"
# from repo root
kill "$(lsof -t -i:3000)" 2>/dev/null || true
rm -rf web/.next
npm run build
npm run dev &
sleep 6
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000
```

Build must exit 0 and localhost must return 200. Then re-import `Meridian_Plan_Incentivos_2025.pptx`
for the Meridian tenant through the normal import path and capture the plan-orchestrator log.

**Pass criteria (paste the actual log lines):**
- `c1-senior` (Rendimiento de Ingreso — Coordinador Senior) constructs with `rateTableCellCount=20` and
  `shape=banded_lookup`.
- Phase B reports `10/10 components succeeded, 0 failed`.
- No `cognition_truncation` / `output count 19 does not match dimension product 20` for any component.

**HALT-3:** if `c1-senior` (or any component) still fails the dimension-product check under Opus, paste
the raw pre-normalization CompositionalIntent JSON from the failure log and HALT. Do NOT patch the
intent-constructor, do NOT add a tolerance/pad, do NOT alter the emission grammar. A continued failure
means the model was not the sole cause and the architect re-opens the emission-contract question
(AUD-017 §7 carry-forward).

---

## §8 — HALT Conditions (consolidated)

- **HALT-1 (§4):** no single model-selection point reachable by `plan_interpretation` → paste findings,
  surface, do not edit.
- **HALT-2 (§5):** Opus identifier unconfirmed from API or authoritative in-repo source → surface, do
  not edit with a guessed string.
- **HALT-3 (§7):** Meridian still fails the cell-count check under Opus → paste raw CompositionalIntent,
  halt, do not patch the constructor or grammar.

In all HALT cases: surface the evidence verbatim and stop. Do not work around.

---

## §9 — Reporting Discipline (Rules 25-28)

Create the completion report at
`docs/completion-reports/HF-304_PLAN_INTERPRETATION_MODEL_UPGRADE_COMPLETION.md` BEFORE the final
build, containing in order:
1. Assigned HF number and HEAD SHA (§3).
2. **The real before-state** (§4): the model identifier in force for `plan_interpretation`, the exact
   `file:line`, the mechanism, and an explicit note correcting any prior mischaracterization.
3. The confirmed Opus identifier and the API/source evidence (§5).
4. The diff (§6).
5. The Meridian re-import log showing `c1-senior rateTableCellCount=20 / shape=banded_lookup` and Phase B
   `10/10` (§7), plus the build exit code and the localhost HTTP status.
6. HALT disposition log (which, if any, fired).

Then commit, push, and `gh pr create --base main --head <branch>` with a descriptive title and body.
**Do NOT merge** — the architect performs SR-44 production verification before merge.

---

## §10 — Out of Scope

- The Observatory operator-selectable per-task model control (parked — §11).
- Any per-task model map beyond the single `plan_interpretation` → Opus routing.
- Any refactor of the AI service, the Anthropic adapter, retry logic, or the plan orchestrator.
- Any change to the intent-constructor, the emission grammar, or the dimension-product check.
- The MIR convergence misbinding (separate subsystem, separate work item — DIAG-072 / its remediation HF).
- The 8 developer-set threshold triage (separate work item).

## §11 — Residuals

- **CLT (hold, do not build):** Observatory operator-selectable, persisted, per-task model control —
  plan interpretation / field mapping / classification / anomaly detection / recommendation each
  independently model-selectable, replacing hardcoded model constants the way HF-303 is replacing
  hardcoded thresholds. Logged for a future build; the single named constant introduced in §6 is the
  seam it will lift from.
- **AUD-017 §7 carry-forward:** if Opus resolves c1-senior, the model swap (the regression) governs every
  interpretation emission — a future validation should confirm the Opus routing across the proof tenants
  (BCL/Meridian/CRP/MIR), not c1-senior alone. Not a gate on this HF.
- If §4 reveals the model mechanism is materially different from "a selection point keyed by task"
  (e.g. the orchestrator constructs the request without a task discriminant), the §6 approach adapts to
  the real seam discovered; the principle is unchanged (plan_interpretation → Opus, single named constant,
  nothing else touched).
