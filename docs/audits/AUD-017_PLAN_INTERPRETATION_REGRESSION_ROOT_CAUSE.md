# AUD-017 — Plan-Interpretation Regression: Code-Based Root Cause Analysis

**Class:** AUD (read-only forensic; NO source changes, NO migrations, NO calculation runs)
**Target defect:** Meridian plan import now ABORTS at `intent-constructor` with
`cognition_truncation — output count 19 does not match dimension product 20 (5×4)` on component
`c1-senior` ("Rendimiento de Ingreso — Coordinador Senior"). The identical PPTX
(`Meridian_Plan_Incentivos_2025.pptx`, 3070 chars, Phase-A 10 components) interpreted **successfully**
on 2026-05-31 (HF-262 era) with `rendimiento-ingreso-senior rateTableCellCount=20 → SUCCESS shape=banded_lookup`.
This is a **regression**, not non-determinism — the audit must prove the commit and the mechanism.

---

## §0 — Orientation & Cross-Link

- **GOOD reference (last-known-working plan interpretation):** the 2026-05-31 HF-262-era import where
  Meridian c1-senior (`rateTableCellCount=20`) constructed `shape=banded_lookup` and the plan persisted.
- **CURRENT (failing):** `main` HEAD at session start = `37e33ef2` (carries HF-302 `e8d37b70` + HF-303
  `968759fc`, and everything merged since HF-281). Meridian c1-senior aborts; HF-280 atomicity correctly
  refuses partial persistence (9/10 components succeed, 1 fails). Reproduced on two consecutive import
  attempts this session (23:00 and 23:06), so it is deterministic on `main`.
- **Why this matters now:** BCL reconciles EXACT cold on `main` ($312,033 / 6 periods, 100% via the
  Reconciliation Studio), so import→convergence→calc is sound. Meridian's failure is isolated to the
  **plan-interpretation path** (PPTX → Phase A skeleton → Phase B per-component construction →
  intent-constructor validation). That path is the entire scope of this audit.
- **Working hypothesis to be PROVEN OR REFUTED (do not assume):** at the HF-281 closure, the Meridian
  arc exercised **convergence + calc on an already-persisted `rule_set`** — it may NOT have re-run plan
  interpretation from the PPTX. If so, a regression in the interpretation path could have shipped
  undetected because the persisted rule_set was reused. The audit must establish the last commit at which
  this PPTX actually re-interpreted cleanly, and which commit between that point and HEAD broke it.

**This file is the directive (DD-11). There is no separate "paste this to CC" wrapper. Nothing follows
the final section.**

---

## §1 — Standing Rules (read first, before any command)

Read `CC_STANDING_ARCHITECTURE_RULES.md` at the repo root in full. This is a **read-only audit**:

- **NO** edits to any `.ts`/`.tsx`/`.sql`/prompt/template file.
- **NO** migrations, **NO** `npm run build` requirement, **NO** calculation runs, **NO** re-imports.
- **NO** PR. The deliverable is a committed analysis document only (see §6).
- Git from repo root (`spm-platform`), not `web/`.
- Read sequence numbers from the live repo directory; do not invent any. This audit retains the number
  **AUD-017** (architect-assigned, re-targeted from the prior stale draft). Any NEW diagnostic numbers
  proposed in the report are recommendations only — reference findings by structural pattern, not by a
  fabricated number.

---

## §2 — Scope Boundary (what this audit is and is not)

**IN scope — the plan-interpretation path only:**
- `plan-orchestrator` (Phase A skeleton call; Phase B per-component construction dispatch).
- `intent-constructor` (the `$.structure` validation that emits "output count N does not match dimension
  product M", the HF-266 normalization pass, the raw-intent logging on failure, any retry/repair).
- The CompositionalIntent emission **prompt/template** for `banded_lookup` (Phase A and/or Phase B).
- The DS-024 / Decision-158 constructor library (`bounded_lookup_2d` construction from a banded_lookup
  CompositionalIntent: how `dimensions[].breaks` → band count, how `outputs[]` length is checked against
  the row×col product).
- HF-280 atomicity gate (only to confirm it is behaving correctly — it is; it must not be "fixed").

**OUT of scope (do NOT investigate, do NOT conflate):**
- MIR convergence multi-source routing (Plans 2/4 binding to the Cobranza file). That is a **separate**
  defect class and is **not** a regression from HF-281 (MIR's multi-distinct-file structure was never
  exercised at HF-281). It will be handled under its own work item. Touching it here is an AUD-009-class
  scope violation.
- Convergence column mapping, calc engine, rollup keys, the 8 threshold-debt items.
- Any source change of any kind.

---

## §3 — The Investigation (phased, evidence-gated)

Each phase ends with **pasted evidence** (command + raw output). No phase may be summarized without its
evidence. If a HALT condition fires, stop and record it; do not work around it.

### Phase 0 — Live ledger read (numbers, not memory)

```bash
cd "$(git rev-parse --show-toplevel)"
git log --oneline -1
git branch --show-current
ls -1 docs/diagnostics/ | sort -V | tail -8
ls -1 docs/completion-reports/ | sort -V | tail -8
ls -1 docs/vp-prompts/ 2>/dev/null | sort -V | tail -8
```

Record current HEAD SHA (expected to contain `37e33ef2`/`968759fc`). Confirm you are auditing the same
tree that produced the failing import.

### Phase 1 — Capture the validation site (the exact code that throws)

Locate the constructor validation that emits the failing message. The literal in the log is:
`$.structure: output count 19 does not match dimension product 20 (5×4)`.

```bash
# Find the throw site and the surrounding dimension/outputs check
grep -rn "does not match dimension product" web/src --include=*.ts
grep -rn "dimension product" web/src --include=*.ts
grep -rln "intent-constructor\|intentConstructor\|construct.*CompositionalIntent" web/src --include=*.ts
```

Open the file(s) and **paste**: (a) the function that computes the dimension product from
`dimensions[].breaks` (how a `breaks` array of length k becomes a band count — is it k, k+1, or k−1?),
(b) the check that compares `outputs.length` to the product, (c) whether any branch **pads, repairs, or
tolerates** an off-by-one (e.g. appends a trailing 0, or back-fills a leading 0 for the first band), and
(d) the HF-266 normalization pass and where it runs relative to this check.

**HALT-1:** If the dimension-product computation or the outputs-length check has a comment or commit
reference indicating it was added/changed after HF-262, record that commit reference verbatim and proceed
— it is a prime suspect for the introducing change.

### Phase 2 — Establish the LAST clean interpretation of THIS PPTX (the GOOD boundary)

The goal is the precise GOOD_SHA: the most recent commit at which `Meridian_Plan_Incentivos_2025.pptx`
re-interpreted with all 10 components succeeding (specifically c1-senior `rateTableCellCount=20`
constructing `banded_lookup`). Use the completion-report and prompt ledger as the archaeological record —
do NOT re-run imports.

```bash
# Find every commit that names Meridian plan interpretation / the orchestrator / the constructor / HF-280
git log --oneline --all -- web/src | head -50
git log --oneline --all -S "banded_lookup" -- web/src | head -40
git log --oneline --all -S "dimension product" -- web/src | head -40
git log --oneline --all --grep="plan-orchestrator\|intent-constructor\|cognition_truncation\|HF-266\|HF-280\|banded_lookup\|Phase A skeleton" | head -60
```

Cross-reference against the completion reports for HF-262, HF-266, HF-273, and the HF-263→281 arc. The
specific question to answer with evidence: **at the HF-281 closure, was plan interpretation re-run from
the PPTX, or was a persisted `rule_set` reused?** Quote the relevant completion-report lines. If the
PPTX was not re-interpreted at HF-281, then GOOD_SHA predates HF-281 — likely the HF-262 import — and the
regression has been latent since then.

**HALT-2:** If the ledger cannot establish a specific GOOD_SHA where this PPTX re-interpreted cleanly,
record that the GOOD boundary is "last-observed-working on 2026-05-31 (HF-262 era), commit unconfirmed"
and proceed with that as the lower bound. Do not fabricate a SHA.

### Phase 3 — The commit archaeology (GOOD_SHA → HEAD diff on the interpretation path)

This is the centerpiece. Enumerate every commit between the GOOD boundary and HEAD that touched the
in-scope files, and classify each by whether it could change the outputs-length-vs-dimension-product
outcome.

```bash
# Replace GOOD with the SHA (or tag) established in Phase 2; if unconfirmed, use the HF-262 merge SHA.
GOOD=<sha-from-phase-2>
git log --oneline ${GOOD}..HEAD -- \
  web/src/**/plan-orchestrator* \
  web/src/**/intent-constructor* \
  web/src/**/*compositional* \
  2>/dev/null | tee /tmp/aud017_pathdiff.txt

# Widen if the globs miss files (use the real paths found in Phase 1):
git log --oneline ${GOOD}..HEAD -- <actual-orchestrator-path> <actual-constructor-path> <actual-prompt-path>
```

For each commit in that range, run `git show --stat <sha>` and, for the suspects, `git show <sha>` on the
specific hunk. Produce a table: `commit | date | file | what changed | could it affect outputs/dimension
reconciliation? (Y/N + one line why)`.

Particular suspects to confirm or clear with the actual diff:
1. **The dimension-product / outputs-length check itself** — did its arithmetic or strictness change
   (e.g. a tolerance/pad removed, or band-count formula changed from k+1 to k)?
2. **HF-266 normalization** — did it change what `dimensions`/`outputs` look like before the check (e.g.
   the `'shape' in n` vs `!n.shape` guard fix, or any reshaping of `outputs`)?
3. **The emission prompt/template for banded_lookup** — did the instruction that tells the LLM how many
   cells to emit change (row-major order, leading-zero row for the lowest band, inclusive/exclusive band
   text)? A prompt change is the most likely cause of the LLM now emitting 19 instead of 20.
4. **Phase A skeleton** — did `rateTableCellCount` derivation change (it still reports 20, so likely not,
   but confirm)?
5. **maxTokens / truncation handling** in the construction call — `errClass=cognition_truncation` names
   truncation; confirm whether the construction response is being cut off (output literally truncated)
   vs. the LLM choosing to emit 19 (semantic miscount). These are different root causes with different
   fixes; the audit must distinguish them using the raw CompositionalIntent JSON.

### Phase 4 — Pin the mechanism (which of the two failure modes is it)

Using the raw-intent JSON already in this session's logs (HF-266 logs the pre-normalization
CompositionalIntent on failure — it is present in the captured logs), determine definitively:

- **Mode A — LLM semantic miscount:** the `outputs` array genuinely contains 19 values because the
  emission prompt now under-specifies the cell count (e.g. omits the leading-zero row, or the band text
  changed so the model produces 19). Evidence: `outputs.length === 19` in a well-formed JSON object that
  is otherwise complete (closing braces present, `metadata` present). The session log shows exactly this —
  the JSON is complete and ends with a full `metadata` block, and `outputs` has 19 entries
  (`0,200,400,150,300,500,800,300,600,900,1400,600,1000,1600,2200,900,1400,2100,3000`). That points to
  **Mode A (prompt under-specification), not literal token truncation.**
- **Mode B — literal response truncation:** the JSON is cut off mid-structure (unterminated array/object).
  Evidence: malformed/incomplete JSON, missing closing braces.

Confirm Mode A vs Mode B by quoting the raw JSON from the log and stating which closing tokens are present.
State which commit (from Phase 3) is responsible for the responsible surface:
- If Mode A → the **emission prompt/template** change (or the band-count↔cell-count contract) is the root
  cause. Identify the commit that altered the banded_lookup emission instruction or the breaks→cells
  expectation.
- If Mode B → the **maxTokens / streaming** change in the construction call is the root cause. Identify
  the commit that lowered the budget or changed the call.

### Phase 5 — Regression-vs-tolerance determination

Answer, with code evidence, the decisive question:
- Did GOOD_SHA **tolerate/repair** a 19-cell emission (e.g. an older code path padded the missing cell or
  an older prompt reliably produced 20), and did a later commit **remove that tolerance** or **change the
  prompt** such that the same PPTX now fails? OR
- Did GOOD_SHA reliably get 20 cells from the LLM, and a later **prompt/template** change cause 19?

The output of this phase is a single sentence of the form: *"The regression was introduced by `<sha>`
(`<date>`, `<file>`), which `<changed X>`, causing the constructor's hard dimension-product check
(`<file:line>`) to reject the now-19-cell emission that GOOD_SHA `<accepted/avoided> because <reason>`."*

---

## §4 — Out of Scope (restate, to prevent drift)

- No fix is authored in this audit. The remediation HF is a **separate** work item the architect will
  sequence after reading this analysis.
- MIR convergence routing, threshold debt, calc engine, and the import-UI/CLT-214 findings are not part
  of this audit.

## §4A — Residuals / Carry-forward

- If Phase 3 surfaces additional in-scope commits that changed plan-interpretation behavior but are not
  the c1-senior root cause, list them as carry-forward suspects (e.g. other components that could fail on
  a different plan) — do not chase them here.
- The raw-intent failure logging (HF-266 P2) is confirmed valuable; note if any commit weakened it.

---

## §5 — HALT Conditions (consolidated)

- **HALT-1:** dimension-product/outputs check shows a post-HF-262 change → record the commit, continue.
- **HALT-2:** GOOD_SHA cannot be confirmed from the ledger → record HF-262-era lower bound, continue.
- **HALT-3 (hard):** if at any point a fix appears "obvious," do NOT implement it. This is read-only.
  Record the proposed fix as a recommendation in §6 and stop.
- **HALT-4:** if the in-scope file paths differ materially from the §2 names (refactor since HF-262),
  record the actual paths and proceed against them; do not abandon the audit.

---

## §6 — Deliverable (the only artifact this audit produces)

Create `docs/diagnostics/AUD-017_PLAN_INTERPRETATION_REGRESSION_ROOT_CAUSE.md` containing, in order:

1. **HEAD SHA audited** + branch (Phase 0 evidence).
2. **The validation site** — pasted code for the dimension-product computation and the outputs-length
   check, with file:line (Phase 1).
3. **GOOD boundary** — the established GOOD_SHA (or HF-262-era lower bound) with the completion-report
   quotes proving whether HF-281 re-interpreted the PPTX or reused a persisted rule_set (Phase 2).
4. **Commit archaeology table** — every in-scope commit GOOD→HEAD, classified (Phase 3).
5. **Mechanism** — Mode A vs Mode B, proven by the raw CompositionalIntent JSON quoted from the log
   (Phase 4).
6. **Root-cause sentence** — the single decisive sentence from Phase 5, naming the introducing commit,
   file, and the exact line of the check that now rejects the emission.
7. **Recommended remediation (advisory only, not implemented)** — the minimal general fix at the correct
   layer (prompt/contract if Mode A; token budget if Mode B), plus an explicit note on whether the fix
   should also restore a tolerance/repair so a future N−1 emission self-heals rather than aborting. Flag
   whether this is a Design-Gate-worthy change (emission contract) or a contained HF.

Commit the report to the current branch:

```bash
cd "$(git rev-parse --show-toplevel)"
git add docs/diagnostics/AUD-017_PLAN_INTERPRETATION_REGRESSION_ROOT_CAUSE.md
git commit -m "AUD-017: plan-interpretation regression root cause — Meridian c1-senior cognition_truncation (read-only forensic, no source changes)"
git push
```

Do not open a PR. Surface the committed report path and the §6 root-cause sentence in your reply so the
architect can sequence the remediation HF.
