# HF-193 Gate B Preflight — Decision 30 v1 Violation Investigation (Phase 1 CC Directive)

**Class:** Investigation directive (HF-193 Gate B preflight, Disposition D investigation)
**Repo:** `~/spm-platform` (VP)
**Branch:** `hf-193-signal-surface` (existing; HEAD at Gate A close: `3c07a126`)
**Parent context:** HF-193 Gate B pre-verification Check 4 surfaced Decision 30 v1 LOCKED substrate violation finding
**Authority:** Architect CRF disposition D (2026-04-22); SR-42 halt discipline active on Decision 30 v1 violation
**Governing rules reference:** `CC_STANDING_ARCHITECTURE_RULES.md` (VP repo root)
**Scope:** Phase 1 read-only investigation. No modifications. HALT before any disposition or code change. IRA Phase 2 staged separately per architect post-Phase-1 review.
**Authored:** 2026-04-22

---

## 0. DIRECTIVE PURPOSE

Investigate the VP `classification_signals.signal_type = 'training:*'` usage pattern surfaced during Gate B pre-verification Check 4. Determine through evidence — not interpretation — whether the 126 rows with `training:*` literals represent:

- **(α)** Legitimate training-surface usage fitting Decision 30 v1 `does_not_apply_when` / `false_positive_triggers` carve-outs (actual model training pipelines separate from classification signals surface)
- **(β)** Direct violation of Decision 30 v1 `violation_patterns` (classification signals managed as model training data)
- **(γ)** Ambiguous — interpretation requires IRA Phase 2 invocation against locked substrate

**Phase 1 = evidence gathering only.** No disposition. No code modification. No resolution of SR-42 halt. Evidence feeds architect review, which then dispositions: A/B/C directly (if evidence is clear), or IRA Phase 2 invocation (if ambiguous).

**HF-193 Gate B remains paused at Step 0 halt state throughout.** This investigation runs in parallel to Gate B hold; its output determines when and how Gate B resumes.

---

## 1. OPERATING CONSTRAINTS

1. **Read-only across all steps.** No code modification. No file rename/move. No substrate migration. No data cleanup. No "fix while we're here" actions.
2. **Halt-disciplined.** Step-scoped halts per directive. No progression past a halt without architect disposition.
3. **Evidence-only returns.** Paste raw output. No CC interpretive verdicts on α/β/γ. Architect interprets.
4. **No ambiguity absorption.** If any step output is unclear (code pattern, substrate shape, literal provenance), halt with proposed reading + "needs architect disposition" flag. Do not absorb ambiguity into continuation.
5. **No scope drift into HF-193 Gate B work.** Bridge modification, caller-site changes, convergence read, gate behavior — all remain out of scope for this investigation directive.
6. **Channel separation.**
   - **CC executes:** Steps 1-4 (VP repo grep, code read, git history)
   - **Architect executes in VP dev Supabase SQL Editor:** Step 5 (substrate-data queries)
   - Evidence from both channels routes to architect-channel chat; I analyze and assess α/β/γ verdict eligibility
7. **Git from repo root.** `cd ~/spm-platform` first.
8. **SR-42 compliance.** The Decision 30 v1 violation halt remains in effect throughout. Investigation produces evidence; it does NOT disposition the halt. Disposition is architect's separate decision post-Phase-1.
9. **SR-34 no-bypass.** No "probably fine, just rename the literals" shortcuts. Full investigation before any disposition action.
10. **No memory edits.** Investigation findings do not warrant memory changes. Substrate capture happens via Closing Report ICA ingestion at session close.

---

## 2. PREREQUISITES

**Before CC begins this directive, architect has:**

1. Downloaded `HF_193_GATE_B_PREFLIGHT_DECISION_30_INVESTIGATION.md` from this turn's file output
2. Placed it at `~/spm-platform/docs/prompts/HF_193_GATE_B_PREFLIGHT_DECISION_30_INVESTIGATION.md`
3. Pasted contents to CC terminal

**CC assumes the file is placed as specified. If not present at Step 1 verification, HALT and surface.**

---

## 3. EXECUTION STEPS (CC portion — Steps 1-4)

### STEP 1 — Investigation artifact placement + commit

**Verify file present:**

```bash
cd ~/spm-platform
ls -la docs/prompts/HF_193_GATE_B_PREFLIGHT_DECISION_30_INVESTIGATION.md
wc -l docs/prompts/HF_193_GATE_B_PREFLIGHT_DECISION_30_INVESTIGATION.md
head -5 docs/prompts/HF_193_GATE_B_PREFLIGHT_DECISION_30_INVESTIGATION.md
```

**Evidence to paste:** all three outputs.

**HALT criteria:**
- File not present: HALT, paste, surface.
- Header line 1 does not begin with "# HF-193 Gate B Preflight": HALT, paste, surface.

**Stage + commit + push:**

```bash
git add docs/prompts/HF_193_GATE_B_PREFLIGHT_DECISION_30_INVESTIGATION.md
git status
git commit -m "HF-193 Gate B preflight: Decision 30 v1 violation investigation directive

Phase 1 read-only evidence gathering per architect Disposition D.

Finding: Gate B pre-verification Check 4 surfaced 126 rows in VP classification_signals
table using signal_type literals with 'training:*' prefix pattern (7 distinct literals).
Live VP state appears to conflict with IGF-T2-E29 v1 LOCKED (Decision 30)
violation_patterns on training-vs-classification terminology.

SR-42 halt active on violation disposition until Phase 1 evidence + optional Phase 2
IRA invocation resolve (α: carve-out legitimate / β: violation / γ: ambiguous).

HF-193 Gate B paused at Step 0 until this resolves."

git push origin hf-193-signal-surface
```

**Evidence to paste:** git status output showing staged file, commit SHA, push confirmation.

**HALT criteria:**
- Push rejected: HALT, paste, surface.

**Proceed to Step 2.**

---

### STEP 2 — Code reference survey for `training:*` literals

**Primary grep — find all source code writing or referencing `training:*` signal_type:**

```bash
grep -rn "training:synaptic_density\|training:dual_path_concordance\|training:plan_interpretation\|training:document_analysis\|training:assessment_generated\|training:dashboard_assessment\|training:lifecycle_transition" web/src/ --include="*.ts" --include="*.tsx"
```

**Evidence to paste:** full output, unabridged, with match count.

**Broader pattern grep — catch any `'training:` literal:**

```bash
grep -rn "'training:" web/src/ --include="*.ts" --include="*.tsx"
grep -rn '"training:' web/src/ --include="*.ts" --include="*.tsx"
```

**Evidence to paste:** both outputs, match count each.

**HALT criteria:**
- grep errors out: HALT, paste stderr, surface.

**Proceed to Step 3.**

---

### STEP 3 — Identify write path(s) for `training:*` signals

**Objective:** determine whether the training:* signal writes go through `fn_bridge_persistence` (the Phase 2.2a RPC) or through a different path (a separate function, or direct `.from('classification_signals').insert(...)` calls).

**Search for direct classification_signals inserts:**

```bash
grep -rn "classification_signals" web/src/ --include="*.ts" --include="*.tsx"
```

**Evidence to paste:** full output.

**Search for RPC calls related to classification signals or training:**

```bash
grep -rn "\.rpc(['\"]fn_" web/src/ --include="*.ts" --include="*.tsx"
```

**Evidence to paste:** full output — surfaces all RPC function names the VP code invokes.

**Specifically check for `fn_capture_training_signal` or similar named function:**

```bash
grep -rn "capture_training\|training_signal\|fn_.*training" web/src/ --include="*.ts" --include="*.tsx"
```

**Evidence to paste:** full output.

**Search for any dedicated training-surface module or file:**

```bash
find web/src/ -type f \( -name "*training*" -o -name "*flywheel*" \) 2>/dev/null
```

**Evidence to paste:** find output.

**Report observations (evidence only, no interpretation):**

```
Write-path surface:
  classification_signals direct inserts found: [count, list of files:lines]
  RPC functions invoked by VP code: [distinct function names from grep]
  Training-specific RPC or helper: [capture_training_signal presence: yes/no; other names if any]
  Dedicated training-surface files: [find output]
  training:* literals appear to be written via: [distinct write paths identified, evidence-based only]
```

**HALT criteria:**
- Multiple write paths exist but pattern is unclear: flag in report; do not decide which is primary.

**Proceed to Step 4.**

---

### STEP 4 — Git history for `training:*` literals introduction

**Objective:** determine when and via what commit/HF the `training:*` literals were introduced to the codebase.

**For each literal, find earliest commit touching it:**

```bash
git log --all --oneline --follow -S "training:synaptic_density" -- web/src/ | tail -5
git log --all --oneline --follow -S "training:dual_path_concordance" -- web/src/ | tail -5
git log --all --oneline --follow -S "training:plan_interpretation" -- web/src/ | tail -5
git log --all --oneline --follow -S "training:document_analysis" -- web/src/ | tail -5
git log --all --oneline --follow -S "training:assessment_generated" -- web/src/ | tail -5
git log --all --oneline --follow -S "training:dashboard_assessment" -- web/src/ | tail -5
git log --all --oneline --follow -S "training:lifecycle_transition" -- web/src/ | tail -5
```

**Evidence to paste:** output for each literal — typically just the earliest 1-2 commits per literal.

**Get commit messages for the earliest commits (one per literal):**

```bash
# For each earliest commit SHA identified above:
# git show --stat --no-patch <SHA>
# Surface commit message + which HF/OB introduced the literal
```

**CC synthesis:** compile a compact table:

```
training:synaptic_density          introduced by <SHA> <HF/OB reference> <date>
training:dual_path_concordance     introduced by <SHA> <HF/OB reference> <date>
training:plan_interpretation       introduced by <SHA> <HF/OB reference> <date>
training:document_analysis         introduced by <SHA> <HF/OB reference> <date>
training:assessment_generated      introduced by <SHA> <HF/OB reference> <date>
training:dashboard_assessment      introduced by <SHA> <HF/OB reference> <date>
training:lifecycle_transition      introduced by <SHA> <HF/OB reference> <date>
```

**Evidence to paste:** table + raw git log outputs that informed it.

**HALT criteria:**
- Any literal's origin not discoverable via git log -S: flag in table, do not fabricate origin.

**Proceed to Step 5.**

---

### STEP 5 — Architect-executed Supabase queries (parallel to CC Steps 2-4)

**Architect runs the following in VP dev Supabase SQL Editor.** CC does NOT run these (channel separation: VP substrate access is architect-operated this session).

**Evidence from architect routes to chat alongside CC Steps 1-4 output.**

```sql
-- CHECK 5a: source field values for training:* signals (tells us which code path writes them)
SELECT 
  signal_type, 
  source, 
  COUNT(*) AS row_count,
  MIN(created_at) AS earliest_write,
  MAX(created_at) AS latest_write
FROM classification_signals
WHERE signal_type LIKE 'training:%'
GROUP BY signal_type, source
ORDER BY signal_type, row_count DESC;

-- CHECK 5b: context field patterns (tells us what context training:* signals carry)
SELECT 
  signal_type,
  jsonb_pretty(context) AS context_sample,
  COUNT(*) OVER (PARTITION BY signal_type) AS total_for_this_type
FROM classification_signals
WHERE signal_type LIKE 'training:%'
ORDER BY signal_type, created_at DESC
LIMIT 20;

-- CHECK 5c: signal_value shape for training:* signals (tells us what's stored)
SELECT 
  signal_type,
  jsonb_object_keys(signal_value) AS top_level_keys,
  COUNT(*) AS rows_with_this_key
FROM classification_signals
WHERE signal_type LIKE 'training:%'
GROUP BY signal_type, jsonb_object_keys(signal_value)
ORDER BY signal_type, rows_with_this_key DESC;

-- CHECK 5d: tenant_id distribution (dev seeded vs production tenant distribution)
SELECT 
  CASE WHEN signal_type LIKE 'training:%' THEN 'training:*' ELSE signal_type END AS signal_type_bucket,
  tenant_id,
  COUNT(*) AS row_count
FROM classification_signals
GROUP BY signal_type_bucket, tenant_id
ORDER BY signal_type_bucket, row_count DESC;

-- CHECK 5e: Are there OTHER functions (besides fn_bridge_persistence) that insert into classification_signals?
-- List any function that references classification_signals in its body
SELECT 
  n.nspname AS schema,
  p.proname AS function_name,
  pg_get_function_arguments(p.oid) AS arguments
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname IN ('public', 'app')
  AND pg_get_functiondef(p.oid) ILIKE '%classification_signals%'
ORDER BY p.proname;
```

**Evidence from architect:** paste all 5 query outputs (5a, 5b, 5c, 5d, 5e) to chat.

**HALT criteria for architect:**
- Any query errors out: surface error, do not auto-retry.
- Query 5d reveals production tenant_ids vs dev-only: flag in output for interpretation.

---

### STEP 6 — HALT and compile

**CC consolidates Steps 1-4 evidence into a summary report:**

```
===== HF-193 GATE B PREFLIGHT — DECISION 30 V1 INVESTIGATION PHASE 1 SUMMARY =====

Branch state: HEAD <SHA after Step 1 commit>

Directive commit SHA: <from Step 1>

Step 2 literal references in VP code:
  Total files writing 'training:' literals: <count>
  Total line matches: <count>
  Files per literal: <count each>

Step 3 write-path surface:
  classification_signals direct insert sites: <count; file:line list>
  RPC functions invoked by VP code: <list>
  Training-specific function name found: <name or none>
  Dedicated training-surface files: <list or none>

Step 4 git history of literal introduction:
  <7-row table from Step 4>

Expected architect-provided evidence from Step 5:
  - 5a: source field per literal
  - 5b: context sample per literal
  - 5c: signal_value shape per literal
  - 5d: tenant distribution (dev seeded vs production)
  - 5e: other functions inserting into classification_signals
```

**CC pastes this summary + awaits architect Step 5 evidence.**

**After architect Step 5 evidence arrives:** CC adds architect evidence to the summary for complete Phase 1 compilation. Routes full compiled evidence to architect channel.

---

### STEP 7 — HALT for architect review

**Do NOT:**
- Proceed to Gate B
- Disposition the Decision 30 v1 violation (A/B/C)
- Draft Phase 2 IRA invocation
- Modify any code
- Migrate or update any substrate data
- Propose interpretive verdicts on α/β/γ

**Do:**
- Hold complete Phase 1 evidence in architect channel
- Respond to architect follow-up queries about specific evidence items
- Re-run specific Steps if architect requests deeper evidence

**Exit state:** Phase 1 evidence complete; awaiting architect review.

---

## 4. AFTER PHASE 1: ARCHITECT DISPOSITION PATHS

Architect reviews Phase 1 evidence and dispositions one of:

**(A) DIRECTLY to A/B/C disposition on Decision 30 v1 violation — Phase 1 evidence sufficient.**
Evidence is unambiguous: training:* literals are clearly either carve-out-compliant (path α) or clearly violation (path β). Architect issues A/B/C disposition; I draft corresponding follow-on directive.

**(B) INVOKE Phase 2 IRA — ambiguity requires locked-substrate interpretation.**
Evidence is ambiguous (path γ). I read `IRA_INVOCATION_REFERENCE.md` from VG repo (`~/vialuce-governance/docs/`), then draft IRA prompt with the single work_scope specified in this session's prior turn:

> *"Interpretation of VP classification_signals.signal_type = 'training:*' usage pattern (126 rows across 7 literals) against Decision 30 v1 LOCKED terminology constraint: does the pattern fit Decision 30 v1's does_not_apply_when carve-out for 'actual model training pipelines separate from classification signals surface' and false_positive_triggers for 'References to training in the context of actual model training pipelines,' OR does it fit the high-severity violation_patterns 'classification signals stored or managed as if they were model training data' / 'downstream systems designed to consume classification signals as model training inputs'? Also assess whether Decision 30 v2 extension scope (queued per HF-193 §9.1) should expand to explicitly define training-surface signal_type naming conventions that distinguish legitimate training-surface signals from terminology-violation signals."*

Architect runs IRA via VG repo channel; response returns; I analyze against primary substrate; disposition A/B/C follows.

**(C) DEFER — larger architectural question warrants governance-level discussion before disposition.**
If Phase 1 evidence surfaces structural concerns beyond Decision 30 scope (e.g., the Training Surface is a full architectural layer that merits a distinct Tier 2 decision artifact), architect may pause HF-193 arc for that discussion. Gate B halt remains.

---

## 5. EVIDENCE GATE ON RETURN

All of the following must be pasted to architect channel. Omission is incomplete Phase 1.

- [ ] Step 1: directive placement, commit SHA, push confirmation
- [ ] Step 2: full grep outputs for 7 literals (specific) + broader pattern ('training:' both quote variants)
- [ ] Step 3: classification_signals grep, RPC grep, training-function grep, find output; write-path surface summary
- [ ] Step 4: 7-row table of literal introduction history + supporting git log outputs
- [ ] Step 5: architect-provided outputs for 5a, 5b, 5c, 5d, 5e
- [ ] Step 6: compiled Phase 1 summary
- [ ] Step 7: HALT confirmation — no Phase 2 invoked, no Gate B progression, no disposition

---

## 6. FAILURE MODE PROTOCOL

If any step errors unexpectedly:

1. Paste error output verbatim.
2. Do not diagnose autonomously beyond surface description.
3. Do not skip the step.
4. Halt at failure point.
5. Surface to architect with: error, attempted action, expected output, proposed next action.

**Common expected issues:**
- `git log -S` on certain literals returning no results: flag the literal as "not discoverable via content search" (may indicate file-move history, or literal introduced via merge not originating commit); do not fabricate origin.
- Architect Step 5 query erroring due to permissions: architect surfaces; I do not attempt to route through CC.

---

## 7. OUT-OF-SCOPE BEHAVIORS (explicit forbidden list)

CC must not, during this directive:

1. Modify any source file to "rename training:* literals to compliant forms"
2. Modify any Supabase table or function
3. Run migration scripts
4. Delete rows from classification_signals
5. Propose or implement Decision 30 v1 remediation
6. Propose or implement Decision 30 v2 extension scope changes
7. Proceed to HF-193 Gate B
8. Initiate Phase 2 IRA invocation without architect explicit disposition
9. Open a PR
10. Force-push or rewrite history
11. Modify any file in web/src/, supabase/, or .github/
12. Invoke any governance substrate tooling (IRA, ICA, etc.)
13. Add or remove memory edits
14. Change VP Supabase stored procedures

---

## 8. ARTIFACTS REFERENCED

- `docs/prompts/HF_193_SEEDS_TO_SIGNALS_ATOMIC_CUTOVER.md` (v2, §9.4 context for CWA-Schema patterns)
- `docs/prompts/HF_193_GATE_B_BRIDGE_MODIFICATION.md` (Step 0 halt state preserved)
- `CC_STANDING_ARCHITECTURE_RULES.md` (governing CC rules at VP repo root)
- IGF-T2-E29 v1 LOCKED (Decision 30; retrieved from VG substrate via Step 2b earlier this session):
  - `does_not_apply_when`: "Contexts where the platform is explicitly discussing model training pipelines, which are a separate concern"
  - `false_positive_triggers`: "References to 'training' in the context of actual model training pipelines that are separate from the classification signals surface"
  - High-severity `violation_patterns` on classification-signals-as-training-data
- Decision 64 v2 (Dual Intelligence Architecture) — cross-reference; may govern Training Surface architecture
- Decision 153 LOCKED (HF-193 scope authority; unchanged by this investigation)
- For Phase 2 (if invoked): `~/vialuce-governance/docs/IRA_INVOCATION_REFERENCE.md` — mandatory pre-read before any IRA prompt drafting (Correction 8)

---

## 9. SR-42 HALT STATE

**Decision 30 v1 LOCKED violation suspected.** SR-42 halt discipline applies: locked-rule dictate surfaced mid-execution → architect-verification halt on applicability/freshness/correctness.

This investigation **produces evidence for architect disposition.** It does NOT disposition the SR-42 halt itself. SR-42 halt only lifts when architect dispositions A/B/C post-Phase-1 (or post-Phase-2 if IRA invoked).

**Default per SR-42 step 3:** "proceed as dictated" = Decision 30 v1 is authoritative; 126 rows in apparent violation require remediation. Other dispositions require formal supersession, exception, or scope-refinement trail.

**Architect retains full authority to disposition applicability based on Phase 1 + Phase 2 evidence.** No bypass; formal disposition with substrate trail.

---

*HF-193 Gate B Preflight — Decision 30 v1 Investigation Phase 1 · Read-only · Halt-disciplined · Evidence-gated · 2026-04-22 · SR-42 halt active · Executes architect Disposition D · IRA Phase 2 staged pending architect post-Phase-1 review*
