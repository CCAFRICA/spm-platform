# HF-193 Gate A — Code Site Survey (CC Execution Directive)

**Class:** HF execution directive (Gate A of HF-193 atomic cutover)
**Repo:** `~/spm-platform` (VP)
**Branch:** `hf-193-signal-surface` (existing)
**Parent artifact:** `docs/prompts/HF_193_SEEDS_TO_SIGNALS_ATOMIC_CUTOVER.md`
**Authority:** Decision 153 LOCKED (2026-04-20); HF-193 design §8 Gate A
**Governing rules reference:** `CC_STANDING_ARCHITECTURE_RULES.md` (VP repo root)
**Scope:** Read-only code site survey. No modifications. Halt before any code change.
**Authored:** 2026-04-22

---

## 0. DIRECTIVE PURPOSE

Execute HF-193 Gate A: survey all `plan_agent_seeds` code references across VP codebase, cross-reference against HF-193 design artifact §2.5 named nine code locations, survey completeness gate location per §2.4, and halt for architect CRF-1 disposition before any code modification proceeds.

**No code changes this directive.** Grep, list, commit design artifact, paste evidence, halt.

---

## 1. OPERATING CONSTRAINTS

1. **Read-only.** No file modifications in `web/src/` or any code directory this gate.
2. **Halt-disciplined.** Each step has explicit halt criteria. Do not proceed past a halt without architect disposition.
3. **Evidence-only returns.** No self-attestation of PASS/FAIL. No interpretive scope judgments. Paste raw evidence; architect channel (Claude) interprets.
4. **No ambiguity absorption.** If a step output is ambiguous (file not found at expected path, grep count mismatches expectations, unexpected reference surfaces), halt and surface with proposed interpretation but no action taken.
5. **No scope drift.** Any request, observation, or opportunity that would expand scope beyond §8 Gate A grep survey is out of scope — note for architect disposition, do not act.
6. **Channel separation.** All output pastes to architect channel first. Architect interprets and issues next directive. CC does not decide next steps.
7. **Git from repo root.** `cd ~/spm-platform` first. Never operate from `web/` subdirectory.
8. **SR-42 compliance.** If CC surfaces any locked-rule dictate (Decision, Standing Rule, IGF entry) relevant to the work, HALT and surface for architect verification before proceeding.
9. **SR-41 compliance.** Read-only gate cannot contaminate; not applicable. If any future gate's contamination is caught, `git revert` discipline applies.

---

## 2. PREREQUISITES

**Before CC begins this directive, architect has:**

1. Downloaded `HF_193_SEEDS_TO_SIGNALS_ATOMIC_CUTOVER.md` from prior turn file output
2. Placed it at `~/spm-platform/docs/prompts/HF_193_SEEDS_TO_SIGNALS_ATOMIC_CUTOVER.md`
3. Downloaded this directive file, placed it at `~/spm-platform/docs/prompts/HF_193_GATE_A_CODE_SITE_SURVEY.md`
4. Pasted the full contents of this directive to CC terminal

**CC assumes both files are placed. If not present at Step 2 verification, HALT and surface.**

---

## 3. EXECUTION STEPS

### STEP 1 — Branch state verification

**Execute from `~/spm-platform`:**

```bash
cd ~/spm-platform
git fetch origin
git checkout hf-193-signal-surface
git pull origin hf-193-signal-surface
git log --oneline -5
git status
```

**Evidence to paste:** all command outputs, unabridged.

**Expected state:**
- Working tree clean
- HEAD: `ed7c70d7` (session-close batch commit from 2026-04-22) — unless architect has pushed additional commits since session close

**HALT criteria:**
- Working tree not clean: HALT, paste output, surface any untracked or modified files
- HEAD not at `ed7c70d7` AND architect has not confirmed additional commits: HALT, paste log, request architect confirmation
- `git pull` reports merge conflicts: HALT, paste output, do not auto-resolve

**If all expected: proceed to Step 2.**

---

### STEP 2 — Artifact placement verification

**Confirm HF-193 design artifact and this directive are present:**

```bash
ls -la docs/prompts/HF_193_SEEDS_TO_SIGNALS_ATOMIC_CUTOVER.md
ls -la docs/prompts/HF_193_GATE_A_CODE_SITE_SURVEY.md
```

**Evidence to paste:** both `ls` outputs.

**HALT criteria:**
- Either file missing: HALT, paste output, surface to architect for re-placement

**Content sanity checks:**

```bash
wc -l docs/prompts/HF_193_SEEDS_TO_SIGNALS_ATOMIC_CUTOVER.md
head -5 docs/prompts/HF_193_SEEDS_TO_SIGNALS_ATOMIC_CUTOVER.md
```

**Expected:**
- `HF_193_SEEDS_TO_SIGNALS_ATOMIC_CUTOVER.md`: approximately 509 lines
- Header starts: `# HF-193 — Seeds Eradication to Signal-Surface Architecture (Atomic Cutover)`

**Evidence to paste:** `wc` output, `head` output.

**HALT criteria:**
- Line count wildly off expected (e.g., <100 or >1000): HALT, paste output, surface potential file-placement error
- Header does not match expected: HALT, paste output, surface potential content corruption

**If all expected: proceed to Step 3.**

---

### STEP 3 — Commit and push design artifacts

**Stage both files:**

```bash
git add docs/prompts/HF_193_SEEDS_TO_SIGNALS_ATOMIC_CUTOVER.md
git add docs/prompts/HF_193_GATE_A_CODE_SITE_SURVEY.md
git status
```

**Evidence to paste:** `git status` output showing both files staged.

**HALT criteria:**
- Unexpected additional files staged: HALT, paste output, surface for architect review
- Only one file staged when both expected: HALT, paste output, surface

**Commit:**

```bash
git commit -m "HF-193: design artifact + Gate A directive

Decision 153 LOCKED (2026-04-20) execution vehicle.

- HF_193_SEEDS_TO_SIGNALS_ATOMIC_CUTOVER.md: atomic cutover design (§2 MUST, §3 MUST NOT, §4 operational shape, §5 verification, §7 contamination risk, §8 gates A-J)
- HF_193_GATE_A_CODE_SITE_SURVEY.md: Gate A execution directive (code site survey, read-only)

Architect A2 disposition on Decision 30 extension prerequisite:
procedural-not-mechanical per SR-42 step 3 (documented in design §1.3).
Decision 30 extension queued as ICA capture (design §9).

Gate A execution begins immediately post-commit. No code modifications."
```

**Evidence to paste:** commit SHA and first 3 lines of commit summary confirmation.

**Push:**

```bash
git push origin hf-193-signal-surface
```

**Evidence to paste:** push output including remote confirmation.

**HALT criteria:**
- Push rejected (non-fast-forward, auth error, etc.): HALT, paste output, surface for architect disposition

**If commit + push succeed: proceed to Step 4.**

---

### STEP 4 — Grep survey for `plan_agent_seeds` references

**Primary grep — TypeScript source:**

```bash
grep -rn "plan_agent_seeds" web/src/ --include="*.ts" --include="*.tsx"
```

**Evidence to paste:** full output. Do not truncate. If output is very large, paste it all — architect needs full fidelity for scope cross-reference.

**Report metadata:**

```bash
grep -rn "plan_agent_seeds" web/src/ --include="*.ts" --include="*.tsx" | wc -l
```

**Paste: total match count.**

**Secondary grep — all file types (catches non-.ts references):**

```bash
grep -rn "plan_agent_seeds" web/src/
```

**Evidence to paste:** full output. Note any matches that did not appear in the .ts/.tsx grep (e.g., .md comments, .json fixtures, configuration files).

**Tertiary grep — check broader repo for plan_agent_seeds references outside `web/src/`:**

```bash
grep -rln "plan_agent_seeds" . --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git
```

**Evidence to paste:** list of files (not line-level matches for this one — just file-level presence).

**HALT criteria:**
- grep commands error out (binary files, permission errors, encoding issues): HALT, paste errors, surface
- Results surface references in unexpected directories (e.g., `scripts/`, `docs/completion-reports/`): do NOT halt; these are expected as provenance references per HF-193 §9.1 false_positive_triggers; note them in Step 5 report

**Proceed to Step 5 after all grep output pasted.**

---

### STEP 5 — Cross-reference against HF-193 §2.5 nine code locations

**HF-193 §2.5 inventory (verbatim from design artifact):**

1. `web/src/app/api/import/sci/execute/route.ts` (preservation point 1)
2. `web/src/app/api/import/sci/execute-bulk/route.ts` (preservation point 2 — first instance)
3. `web/src/app/api/import/sci/execute-bulk/route.ts` (preservation point 3 — second instance)
4. `web/src/app/api/import/sci/execute-bulk/route.ts` (preservation point 4 — third instance)
5. `web/src/app/api/import/sci/run/route.ts` OR `web/src/app/api/import/run/route.ts` (preservation point 5 — path variant)
6. `web/src/app/api/import/sci/commit/route.ts` OR `web/src/app/api/import/commit/route.ts` (preservation point 6 — path variant)
7. `web/src/lib/convergence/convergence-service.ts` (preservation point 7 — convergence preservation logic)
8. `web/src/lib/compensation/ai-plan-interpreter.ts` (bridgeAIToEngineFormat translation logic)
9. `web/src/lib/ai/anthropic-adapter.ts` (system prompt reference, if present)

**For each of the 9 expected locations:**

1. Confirm file exists:

```bash
ls -la <expected-path>
```

2. Extract `plan_agent_seeds` matches specifically from that file:

```bash
grep -n "plan_agent_seeds" <actual-path>
```

**Report format (paste for each of 9 locations):**

```
Location [N] — [expected path from §2.5]
  File exists: [yes | no]
  Actual path: [same as expected | different path: <actual>]
  plan_agent_seeds matches: [list of line numbers | "0 matches" | "N matches"]
  Match context (first 2 matches, each showing line + surrounding 2 lines):
    [grep -n -B 2 -A 2 output for this file, first 2 match blocks]
  Flag: [none | file not found | path variant | unexpected match count | unexpected match location]
```

**Additional surface — any `plan_agent_seeds` matches NOT in the 9 §2.5 locations:**

```
Additional preservation points found (not in §2.5):
  [file path] — [line numbers] — [2-line context per match]
```

**HALT criteria:**
- More than 9 code files contain `plan_agent_seeds` (additional preservation points beyond §2.5 inventory): HALT, paste full report, flag for architect CRF-1 disposition. Do NOT assume the additional references should be included or excluded from scope.
- Fewer than 9 code files contain `plan_agent_seeds` (some expected preservation points absent): HALT, paste full report, flag for architect CRF-1 disposition. Possible interpretations (architect decides): (a) some points were previously cleaned up and §2.5 is stale; (b) file has moved and grep missed the reference; (c) reference was code-commented-out rather than removed.
- Any §2.5 expected file missing: HALT, paste report, flag.
- Path variants for locations 5 and 6: paste both possibilities; do not pick one silently.

**Proceed to Step 6 only if report is complete, halt or not.**

---

### STEP 6 — Completeness gate location survey

**HF-193 §2.4 references the HF-165/HF-192 completeness gate. Exact location unspecified in §2.5 (flagged in design artifact as "confirm in code survey step").**

**Survey candidates:**

```bash
grep -rln "completeness" web/src/ --include="*.ts"
grep -rln "HF-165\|HF-192" web/src/ --include="*.ts"
grep -rn "gate" web/src/lib/convergence/ --include="*.ts"
```

**Evidence to paste:** all three grep outputs.

**Additional targeted survey — likely gate file names:**

```bash
ls web/src/lib/convergence/ 2>/dev/null
find web/src/ -name "*gate*" -type f 2>/dev/null
find web/src/ -name "*completeness*" -type f 2>/dev/null
```

**Evidence to paste:** all three outputs. Suppress stderr if directory doesn't exist — do not fail on absent directories.

**Report:**

```
Completeness gate survey:
  Files referencing "completeness": [list from first grep]
  Files referencing "HF-165" or "HF-192": [list from second grep]
  "gate" references in convergence module: [output from third grep]
  Gate-related filenames: [find output]
  Most likely gate location (evidence-based): [file path + brief evidence, OR "unclear — requires architect disposition"]
  Flag: [none | no clear gate location | multiple candidates]
```

**HALT criteria:**
- No clear gate location identified: report findings, flag for architect disposition. Do NOT guess.
- Multiple equally-likely candidates: report all, flag for architect disposition.

---

### STEP 7 — Summary compilation

**Compile a final summary report to pipeline into architect channel:**

```
===== HF-193 GATE A — CODE SITE SURVEY SUMMARY =====

Branch state: [from Step 1]
HEAD: [commit SHA from Step 1]

Design artifact placement: [confirmed from Step 2]
Gate A directive placement: [confirmed from Step 2]

Gate A commit SHA: [from Step 3]
Push status: [confirmed from Step 3]

Total plan_agent_seeds matches:
  web/src/ .ts/.tsx: [count from Step 4 primary grep]
  web/src/ all files: [count from Step 4 secondary grep]
  Repo-wide (excl node_modules/.next/.git): [file list from Step 4 tertiary]

§2.5 scope cross-reference:
  Locations confirmed as expected: [count]
  Locations with path variants (5, 6): [per-location resolution]
  Locations not found: [list if any]
  Additional preservation points beyond §2.5: [count + list if any]

Completeness gate (§2.4):
  Most likely location: [path or "unclear"]
  Candidates: [list]

Scope mismatch flags: [list all flags from Steps 5 and 6, or "none"]

Architect CRF-1 disposition needed on:
  [list of items requiring architect decision]
```

**Paste this summary as the final block of Gate A output.**

---

### STEP 8 — HALT

**Do NOT:**
- Modify any code
- Stage any changes
- Proceed to Gate B
- Self-assess whether scope matches or mismatches (beyond flagging)
- Make scope-expansion suggestions
- Begin any bridge, caller-site, convergence, or gate modification work

**Do:**
- Wait for architect CRF-1 disposition
- Respond to architect questions about the evidence
- Re-run specific survey steps if architect requests

**Exit state:** awaiting architect CRF-1 on Gate A evidence.

---

## 4. EVIDENCE GATE ON RETURN

All of the following must be pasted to architect channel. Omission is incomplete Gate A.

- [ ] Step 1: branch state verification (fetch/checkout/pull/log/status output, unabridged)
- [ ] Step 2: artifact placement confirmation (both `ls -la` outputs, `wc -l`, `head -5`)
- [ ] Step 3: Gate A commit SHA + commit message confirmation + push output
- [ ] Step 4: full grep output for `plan_agent_seeds` — primary (.ts/.tsx), secondary (all), tertiary (repo-wide)
- [ ] Step 4: match counts for each grep
- [ ] Step 5: per-location confirmation report for all 9 §2.5 locations, with context snippets and flags
- [ ] Step 5: any additional preservation points surfaced beyond §2.5
- [ ] Step 6: completeness gate survey outputs + most-likely-location assessment or flag
- [ ] Step 7: summary report
- [ ] HALT confirmation — no modifications, no Gate B, awaiting CRF-1

---

## 5. FAILURE MODE PROTOCOL

If any step errors unexpectedly (not a HALT-by-design condition, but a runtime error):

1. **Do not retry silently.** Paste the error output.
2. **Do not diagnose autonomously beyond surface description.** E.g., "grep returned exit code 2, stderr: [paste]" is acceptable; "this is probably a permissions issue and I'll fix it" is not.
3. **Do not skip the step.** If Step 4 grep fails, subsequent steps depending on grep output cannot proceed — HALT at Step 4.
4. **Do not proceed to later steps on the hope that upstream issues resolve.** Halt at the failure point.
5. **Surface to architect with:** the error, what was being attempted, what the expected output would have been, and proposed next action (e.g., "re-run with `2>&1` to capture stderr" or "check file permissions").

---

## 6. OUT-OF-SCOPE BEHAVIORS (explicit forbidden list)

CC must not, during this directive:

1. Modify any file in `web/src/`
2. Modify any file in `supabase/`
3. Run any migration
4. Create new files outside of those already placed (design artifact, this directive) — if architect placed them, fine; CC does not create them
5. Run `npm run build` or similar build commands (not required for read-only survey)
6. Make interpretive scope decisions on what "should" be included in HF-193 MUST-address based on survey findings — that is architect CRF-1's job
7. Proactively fix anything observed (e.g., a typo in a comment, a stale TODO) — out of scope
8. Rename, move, or refactor anything
9. Stash or reset uncommitted work the architect may have in-progress elsewhere
10. Push to any branch other than `hf-193-signal-surface`
11. Open a PR
12. Invoke any governance substrate tooling (IRA, ICA, etc.) — VG repo out of scope for this VP gate
13. Add or remove memory edits — architect's job

---

## 7. ON ARCHITECT CRF-1 DISPOSITION

Architect CRF-1 reviews Gate A evidence and dispositions one of:

- **PROCEED to Gate B (bridge modification).** Claude drafts Gate B directive next turn.
- **REDRAFT §2.5 scope.** Evidence surfaced additional preservation points or missing expected ones; HF-193 design artifact needs update via supersession or extension before Gate B.
- **INVESTIGATE.** Specific finding warrants deeper investigation before Gate B — architect issues narrow read-only directive.
- **HALT HF-193.** Unusual — would require architect decision that Gate A evidence reveals scope not matching Decision 153 intent; would trigger governance consultation.

Default expected disposition: PROCEED to Gate B after evidence review.

---

## 8. ARTIFACTS REFERENCED

- `docs/prompts/HF_193_SEEDS_TO_SIGNALS_ATOMIC_CUTOVER.md` (this directive's parent; §2.5 scope source)
- `CC_STANDING_ARCHITECTURE_RULES.md` (governing CC rules at VP repo root)
- `Decision_153_LOCKED_20260420.md` (authority; via HF-193 design §1)
- HF-193 design artifact §7 contamination risk assessment (context for CRF-1 review)
- HF-193 design artifact §8 gates A-J sequence (Gate A's position in flow)

---

*HF-193 Gate A — Code Site Survey · Read-only · Halt-disciplined · Evidence-gated · 2026-04-22 · Executes §8 Gate A of HF-193 atomic cutover design · Architect CRF-1 disposition required before Gate B proceeds*
