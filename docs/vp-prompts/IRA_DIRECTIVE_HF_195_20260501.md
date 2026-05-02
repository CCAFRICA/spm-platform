# IRA-HF-195: PROMPT-LAYER FIX PATH SUBSTRATE-COHERENCE REVIEW
## CC-Executable IRA Invocation Directive

**Autonomy Directive: NEVER ask yes/no. NEVER pause for confirmation. Read the full directive, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `/mnt/project/IRA_INVOCATION_REFERENCE.md` (vialuce-governance project knowledge) — canonical IRA invocation contract; especially:
   - §2 (T0-E08 Step 2 Recusal Gate — verify this invocation does NOT touch agent-governing substrate)
   - §3 (CLI mechanics — the file-substitution pattern)
   - §4.7 (T0-E09 v7 schema contract — required fields)
   - §4.8 (EECI prompt structure discipline)
   - §6 (CR requirements)
2. `/mnt/project/IRA_CLI_Operating_Instructions.md` — operational tooling contract
3. `IRA_HF_195_Prompt_Layer_Fix_Path_20260501.md` — the IRA prompt content (architect-drafted, this is the question)

**Read all three before executing.**

---

## RECUSAL GATE CHECK (T0-E08 Step 2 — MANDATORY)

This invocation asks IRA about prompt-layer architectural fix path for Plan AI plan_interpretation prompt and document_analysis prompt in the VP platform code. It does NOT amend any of the following Tier 0 agent-governing entries:

  - T0-E09 (IRA prompt template)
  - T0-E10 (IVA prompt template)
  - T0-E11 (IMA prompt template)
  - T0-E12 (ICA prompt template)
  - T0-E08 (Bootstrap modification protocol)

**Verdict: Recusal Gate PASS. IRA invocation authorized.**

If verification at Phase 0 surfaces any of these entries being amended, HALT and surface to architect — invocation is prohibited.

---

## WHAT THIS INVOCATION RETRIEVES

Substrate-grounded architect brief on: what is the substrate-coherent fix path for the Plan AI plan_interpretation prompt outer wrapper + document_analysis prompt calculationType vocabulary, given empirical evidence that registry-derived inner-substitution alone (HF-194 Phase 1 deliverable) does not redirect AI emission away from legacy vocabulary on production runtime?

The brief evaluates three architect-supplied options (b registry-derived enumeration; c structural-pattern classification; b+c hybrid layered fix) against substrate principles G5, G6, G8, DS-021 §11 immune-system pattern recognition, Korean Test, Decision 154/155, Phase 4 audit Cluster B G8-03 finding, and HF-194 shipped state.

Output is options-based per T0-E09 v7 schema contract.

Out of scope for this invocation:
- Fix execution (this is retrieval, not implementation; HF-195 will be drafted post-IRA)
- Tier 0 amendments (Recusal Gate enforced above)
- Code review (IRA evaluates substrate coherence, not code quality)

---

## STANDING RULES

1. After EVERY commit: `git push origin <branch>`
2. **Single work_scope axis** confirmed (per IRA_INVOCATION_REFERENCE §4): prompt-layer fix path for two prompts in same code surface, governed by same substrate principles. NOT multi-axis.
3. **Output_class confirmed**: options-based (3 options enumerated; rank + reasoning per option required).
4. **task_class**: substrate_coherence_audit_disposition.
5. **Estimated cost** (per §7 operating points): options-based 3-option invocation with 7 findings, expected ~$1.50–2.50.
6. **Question is committed artifact** — file path `prompts/IRA_HF_195_Prompt_Layer_Fix_Path_20260501.md` in vialuce-governance repo BEFORE invocation.
7. **Response is committed artifact** — file path `docs/IRA-responses/IRA_HF_195_Prompt_Layer_Fix_Path_20260501.md` AFTER invocation.
8. **Repo**: `~/vialuce-governance` (NOT `~/governance` — common drift; see IRA_INVOCATION_REFERENCE §F2)
9. **CLI pattern**: `QUESTION=$(cat prompts/IRA_HF_195_Prompt_Layer_Fix_Path_20260501.md) && npm run ira -- "$QUESTION"`. NOT `--question-file` flag (does not exist).
10. **Pre-flight verification**: confirm scripts/invoke_ira.ts exists, .env.local present with ANTHROPIC_API_KEY and DATABASE_URL.
11. SR-27 (paste evidence — invocation_id, response payload), SR-34 (no bypass — HALT to architect on Recusal Gate uncertainty).

---

## PHASE 0: PREREQUISITES

### 0A: Branch + place IRA prompt file in repo

```bash
cd ~/vialuce-governance
git checkout main && git pull origin main
git log --oneline -3

git checkout -b ira-hf-195-prompt-layer-fix-path

# Place IRA prompt at canonical path
mkdir -p prompts
cp <path-to-IRA_HF_195_Prompt_Layer_Fix_Path_20260501.md> prompts/

# Verify file
wc -l prompts/IRA_HF_195_Prompt_Layer_Fix_Path_20260501.md
head -5 prompts/IRA_HF_195_Prompt_Layer_Fix_Path_20260501.md

# Place this directive at canonical path
mkdir -p docs/ira-directives
cp <path-to-this-directive>.md docs/ira-directives/IRA_DIRECTIVE_HF_195_20260501.md
```

### 0B: Environment + tooling verification

```bash
# Verify scripts/invoke_ira.ts present
ls -la scripts/invoke_ira.ts

# Verify .env.local has required keys (do not echo values; just verify presence)
test -f .env.local && grep -c "ANTHROPIC_API_KEY\|DATABASE_URL" .env.local
# Expected: 2

# Verify npm scripts include ira target
grep -A1 "\"ira\"" package.json
```

**HALT if:** `scripts/invoke_ira.ts` missing; `.env.local` missing or required keys absent; `npm run ira` script not registered in package.json.

### 0C: Recusal Gate verification (T0-E08 Step 2)

```bash
# Confirm invocation does NOT touch agent-governing entries
# Read T0-E08 Step 2 verbatim from substrate

# Method: query igf.entries directly OR read substrate document
psql "$DATABASE_URL" -c "SELECT entry_id, statement FROM igf.entries WHERE entry_id = 'IGF-T0-E08' LIMIT 1;" 2>&1 | head -30

# Verify the work this invocation evaluates (HF-195 prompt-layer fix path):
# - Modifies web/src/lib/ai/providers/anthropic-adapter.ts in spm-platform repo (VP)
# - Does NOT modify any T0-E08, T0-E09, T0-E10, T0-E11, T0-E12 substrate entry
# - Does NOT modify scripts/invoke_ira.ts or any IRA agent code
# - Therefore: Recusal Gate does not fire; invocation authorized

echo "Recusal Gate verdict: PASS — invocation authorized"
```

**HALT if:** any T0-E08-class agent-governing entry is part of HF-195 scope (invocation prohibited per §2).

### 0D: Commit prompt file + directive

```bash
git add prompts/IRA_HF_195_Prompt_Layer_Fix_Path_20260501.md
git add docs/ira-directives/IRA_DIRECTIVE_HF_195_20260501.md
git commit -m "IRA-HF-195: prompt + directive committed pre-invocation (Recusal Gate PASS)"
git push -u origin ira-hf-195-prompt-layer-fix-path
```

---

## PHASE 1: IRA INVOCATION

### 1A: Execute invocation

```bash
cd ~/vialuce-governance

# Read prompt content into shell variable; pass as positional argument
QUESTION=$(cat prompts/IRA_HF_195_Prompt_Layer_Fix_Path_20260501.md)

# Capture invocation start time + invocation_id from stdout
INVOCATION_START=$(date -Iseconds)
echo "[IRA-HF-195] Invocation start: $INVOCATION_START"

# Execute (capture stdout + stderr to log file)
npm run ira -- "$QUESTION" 2>&1 | tee docs/IRA-responses/IRA_HF_195_invocation_log_20260501.txt

INVOCATION_EXIT=$?
INVOCATION_END=$(date -Iseconds)
echo "[IRA-HF-195] Invocation end: $INVOCATION_END (exit code: $INVOCATION_EXIT)"
```

**HALT if:** exit code non-zero AND error is not a Class A/B/C failure mode (per §5.1) — surface raw error to architect.

### 1B: Capture invocation_id from log

```bash
# Extract correlation_id / invocation_id from log
grep -E "invocation_id|correlation_id" docs/IRA-responses/IRA_HF_195_invocation_log_20260501.txt | head -5
```

Record invocation_id for Phase 2 verification queries.

### 1C: Failure-class differential diagnosis (per §5.1) IF invocation failed

If exit code non-zero, query igf.agent_invocations to classify failure:

```bash
psql "$DATABASE_URL" <<SQL
SELECT invocation_id, status, error_message, output_tokens,
       (output->>'truncated')::text AS wrapper_truncated,
       (output->>'size_bytes')::text AS wrapper_size_bytes
FROM igf.agent_invocations
WHERE invocation_id = '<invocation_id_from_1B>';
SQL
```

**Class A** (`schema_invalid`, `output_tokens < MAX_TOKENS_UNIFIED`): prompt ambiguity. HALT — architect refines prompt.
**Class B** (Pass 2 unit failure rate > 25%): unit count exceeds reliability envelope. HALT — architect decomposes.
**Class C** (`schema_invalid`, `output_tokens == MAX_TOKENS_UNIFIED`, missing field rotates across retries): MAX_TOKENS ceiling hit. Runtime auto-decomposed strategy fires on retry (per §5.1 mitigation step 1). Re-run once; if still fails, HALT.

**Do not silently retry without classifying.** Read full signal set before mitigation choice.

---

## PHASE 2: RESPONSE PERSISTENCE + VERIFICATION

### 2A: Commit raw response

```bash
# Response written to canonical path with _RESPONSE suffix per memory + IRA_INVOCATION_REFERENCE §3
cp docs/IRA-responses/IRA_HF_195_invocation_log_20260501.txt docs/IRA-responses/IRA_HF_195_Prompt_Layer_Fix_Path_20260501_RESPONSE.md

# Validate JSON portion of response if applicable
# (npm run ira typically emits prose+json; the JSON block is the structured T0-E09 output)
grep -A1000 "evaluation_status" docs/IRA-responses/IRA_HF_195_Prompt_Layer_Fix_Path_20260501_RESPONSE.md | head -200
```

### 2B: Validate response structure (T0-E09 v7 contract)

Verify the response includes every required array field (per §4.7):

```bash
# Required fields presence check
for field in applicable_entries excluded_candidates option_recommendations supersession_candidates possible_gaps; do
  if grep -q "\"$field\"" docs/IRA-responses/IRA_HF_195_Prompt_Layer_Fix_Path_20260501_RESPONSE.md; then
    echo "✓ $field present"
  else
    echo "✗ $field MISSING — schema-contract violation"
  fi
done
```

**HALT if:** any required field missing (Class A failure surfaced post-invocation; refine prompt and re-invoke).

### 2C: Validate option count

```bash
# 3 options enumerated (b, c, b+c hybrid); expect 3 entries in option_recommendations
# Manual visual verification of response file
grep -c "\"option_id\"" docs/IRA-responses/IRA_HF_195_Prompt_Layer_Fix_Path_20260501_RESPONSE.md
# Expected: 3
```

### 2D: Validate Pass 3 invariants not raised (per §5)

Check the 12 `ira_response_*` invariants from `src/lib/agents/ira/passes/assemble.ts` — confirm none fired:

```bash
psql "$DATABASE_URL" <<SQL
SELECT invocation_id, status, error_message, pass_2_units_total, pass_2_failures,
       (pass_2_failures::float / NULLIF(pass_2_units_total, 0)::float) AS unit_failure_rate
FROM igf.agent_invocations
WHERE invocation_id = '<invocation_id>';
SQL
```

**HALT if:** unit_failure_rate > 0.25 (Class B); status not in {fired_with_results}; retrieved_prior_art non-null (fabrication signal — pre-OB-IGF-17 should always be null).

### 2E: Commit response

```bash
git add docs/IRA-responses/IRA_HF_195_Prompt_Layer_Fix_Path_20260501_RESPONSE.md
git add docs/IRA-responses/IRA_HF_195_invocation_log_20260501.txt
git commit -m "IRA-HF-195: response committed; T0-E09 v7 schema validation PASS"
git push
```

---

## PHASE 3: COMPLETION REPORT + PR

### 3A: Completion report

Create `docs/completion-reports/IRA_HF_195_COMPLETION_REPORT.md` with the four mandatory tables (per IRA_INVOCATION_REFERENCE §6):

```markdown
# IRA-HF-195 COMPLETION REPORT
## Date: 2026-05-01
## Invocation ID: <id>

## PER-PASS COST TRANSPARENCY
| Pass | Input tokens | Output tokens | Cost (USD) |
|---|---|---|---|

## RESPONSE STRUCTURE VALIDATION
| Field | Present? | Count |
|---|---|---|
| applicable_entries | | |
| excluded_candidates | | |
| option_recommendations | | (expected 3) |
| supersession_candidates | | |
| possible_gaps | | |

## PASS 3 INVARIANT FIRES
| Invariant | Fired? |
|---|---|

## OPTION RECOMMENDATIONS SUMMARY
| Option | Rank | Recommended Action |
|---|---|---|
| (b) Registry-derived enumeration | | |
| (c) Structural-pattern classification | | |
| (b+c) Hybrid layered fix | | |

## SUPERSESSION CANDIDATES
| Entry ID | Coherence Finding | Recommended Action |
|---|---|---|

## POSSIBLE GAPS
| Gap Description | Reasoning |
|---|---|

## ARCHITECT DISPOSITION REQUIRED
- Disposition between options (b), (c), (b+c) per IRA recommendation
- Disposition on every supersession_candidate (ACT/DEFER/REJECT/WATCH)
- Disposition on every possible_gap (ACT/DEFER/REJECT/WATCH)
- Decision: proceed to HF-195 draft against IRA recommendation, or refine question and re-invoke

## CC STOPS HERE — ARCHITECT ACTIONS NEXT
```

### 3B: Commit completion report

```bash
git add docs/completion-reports/IRA_HF_195_COMPLETION_REPORT.md
git commit -m "IRA-HF-195: completion report"
git push
```

### 3C: Open PR

```bash
gh pr create --base main --head ira-hf-195-prompt-layer-fix-path \
  --title "IRA-HF-195: Prompt-Layer Fix Path Substrate-Coherence Review" \
  --body "## IRA Invocation: HF-195 Prompt-Layer Fix Path

### What this PR contains
- prompts/IRA_HF_195_Prompt_Layer_Fix_Path_20260501.md — IRA prompt (architect-drafted)
- docs/ira-directives/IRA_DIRECTIVE_HF_195_20260501.md — CC execution directive
- docs/IRA-responses/IRA_HF_195_Prompt_Layer_Fix_Path_20260501_RESPONSE.md — IRA response
- docs/IRA-responses/IRA_HF_195_invocation_log_20260501.txt — raw invocation log
- docs/completion-reports/IRA_HF_195_COMPLETION_REPORT.md — CR with four mandatory tables

### Recusal Gate (T0-E08 Step 2)
PASS — invocation evaluates VP prompt-layer fix path; does NOT amend T0-E08 / T0-E09 / T0-E10 / T0-E11 / T0-E12.

### Empirical evidence basis
Post-HF-194 production runtime: AI emits matrix_lookup despite registry-derived inner substitution. Outer-wrapper drift is load-bearing. Substrate-grounded fix path required for HF-195 draft.

### Architect actions
1. Review IRA response
2. Disposition options (b) / (c) / (b+c)
3. Disposition supersession_candidates + possible_gaps
4. Direction: proceed to HF-195 draft against IRA recommendation, or refine prompt and re-invoke

### CR includes
- Per-pass cost transparency
- Response structure validation
- Pass 3 invariant fires
- Option recommendations summary"
```

---

## ARCHITECT ACTION REQUIRED (Post-PR Open)

Same SR-44 / capability-routing pattern as VP HFs:

1. **Review IRA response** — read full payload at `docs/IRA-responses/IRA_HF_195_Prompt_Layer_Fix_Path_20260501_RESPONSE.md`. Validate substrate-grounding, option ranking rationale, supersession_candidates / possible_gaps.
2. **Disposition each supersession_candidate** (ACT / DEFER / REJECT / WATCH).
3. **Disposition each possible_gap** (ACT / DEFER / REJECT / WATCH).
4. **Disposition between options** (b) / (c) / (b+c) per IRA recommendation OR architect override (engineering judgment).
5. **`gh pr merge <PR#> --merge --delete-branch`** — architect executes.
6. **Direction**: proceed to HF-195 draft against IRA recommendation, OR refine IRA prompt and re-invoke if response insufficient.

CC does not interpret IRA recommendation. CC does not draft HF-195. CC does not merge PRs.

---

## MAXIMUM SCOPE

3 phases. 1 invocation. 5 artifacts (prompt, directive, response, log, CR). After this directive, architect has substrate-grounded brief on (b) vs (c) vs (b+c) for HF-195 prompt-layer fix path.

If invocation fails Class A/B/C, do NOT silently retry beyond runtime auto-decomposed retry. HALT to architect for prompt refinement.

---

*IRA-HF-195 — 2026-05-01*
*Per IRA_INVOCATION_REFERENCE.md v1.1 §3 (CLI mechanics), §4.7 (T0-E09 v7 schema contract), §4.8 (EECI prompt discipline), §5.1 (failure-mode differential diagnosis), §6 (CR requirements).*
*Recusal Gate: PASS. Single work_scope axis: confirmed. Output class: options-based.*
