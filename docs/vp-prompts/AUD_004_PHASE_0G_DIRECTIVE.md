# AUD-004 Phase 0G: Evidence Gap Closure — CC Execution Directive

**Type:** AUD (Audit) — Phase 0G evidence gap closure
**Authored:** 2026-04-27
**Status:** READY FOR CC EXECUTION
**Storage:** `docs/vp-prompts/AUD_004_PHASE_0G_DIRECTIVE.md` (per VP repo convention)
**Substrate:** `origin/main` (current HEAD; CC verifies at Step 0G.0)
**Mode:** READ-ONLY. No code changes. No DB modifications. No PR creation.
**Predecessor:** `docs/audits/AUD_004_PHASE_0_INVENTORY.md` (branch `aud-004-phase-0`, merged or unmerged — verify at Step 0G.0)
**Branch:** `aud-004-phase-0g` (feature branch off `origin/main`; if `aud-004-phase-0` was merged, branch off main; if not, branch off `aud-004-phase-0`)

**Purpose:** Phase 0 produced a comprehensive inventory of the structural-primitive vocabulary problem at six switch boundaries. The audit's analysis stage surfaced nine evidence gaps — four hard (block remediation conversation), five soft (would weaken remediation design without closure). This Phase 0G consolidates all nine into a single read-only inspection pass.

**Deliverable:** ONE committed report file at `docs/audits/AUD_004_PHASE_0G_GAP_CLOSURE.md` on branch `aud-004-phase-0g`.

**Architect interpretation deferred.** CC gathers evidence; the architect-and-Claude conversation interprets after the report is delivered. CC does not classify, summarize, or recommend.

---

## READ FIRST (mandatory; paste line 1 of each as proof of read)

These files are checked into the VP repo at the repo root. CC reads from the repo root of the local checkout:

1. `<repo-root>/CC_STANDING_ARCHITECTURE_RULES.md`
2. `<repo-root>/SCHEMA_REFERENCE_LIVE.md`
3. `<repo-root>/docs/audits/AUD_004_PHASE_0_INVENTORY.md` — Phase 0 evidence corpus; this directive's findings reference its content

If any of these files cannot be opened, **HALT** and report the path that failed.

---

## EMBEDDED GOVERNANCE CONSTRAINTS

This directive inherits the governance constraints from the Phase 0 directive (`AUD_004_PHASE_0_DIRECTIVE.md`). The relevant constraints, restated:

### Decision 64 v2 — Dual Intelligence (LOCKED)

Three signal levels: Classification (L1), Comprehension (L2), Convergence (L3). All on shared surface `classification_signals`. Three flywheel scopes: Tenant, Foundational, Domain.

### Decision 95 (informational) — 100% reconciliation gate

Calculation-correctness gate, not audit gate. Phase 0G is read-only.

### Decision 111 — Carry Everything, Express Contextually

Importer carries all columns; AI classifications are hints, not gates.

### Decision 147 — Plan Intelligence Forward (LOCKED, IMPLEMENTED AND PROVEN)

Plan agent comprehension flows to convergence via synaptic forwarding. Per Phase 0 evidence, the seeds path (HF-191 transitional implementation) is structurally absent on `main`.

### Decision 151 — Intent Executor Sole Calculation Authority (LOCKED, OPERATIONALLY CONFIRMED)

Intent executor is sole authority for all component types. No per-componentType allow-list.

### Decision 152 — Import Sequence Independence (LOCKED, OPERATIONALLY CONFIRMED)

Identical results regardless of file import order.

### Decision 153 — Plan Intelligence Forward Signal-Based (LOCKED 2026-04-20)

Plan agent comprehension flows as Level 2 Comprehension signals via `classification_signals`. HF-193 is the execution vehicle. Per Phase 0D.5 evidence, HF-193's expected signal types (`metric_comprehension`, `agent_activity:plan_interpretation`) are absent from production. **Phase 0G Section 0G.3 must determine HF-193's actual landing state.**

### AP-25 — Korean Test (Foundational Principle)

All field identification in foundational code uses STRUCTURAL heuristics, never field-name matching in any language. Domain Agent prompts EXEMPT. Applied as a **gate**, not as a drift mechanism.

### AUD-002 v2 audit pattern + Phase 0 lineage

Phase 0G inherits Phase 0's discipline: pasted evidence, no interpretation, no classification, no remediation. Output is a structured evidence corpus appended to the AUD-004 audit record.

---

## AUTONOMY DIRECTIVE

NEVER ask yes/no. NEVER say "shall I". Execute all sections sequentially. Commit and push after each section.

This is a **READ-ONLY** audit:

- NO code modifications
- NO database modifications
- NO tests run, no lint, no build, no type-check
- NO PR creation unless explicitly instructed in a follow-up directive

CC does **NOT** interpret evidence. CC does **NOT** classify findings. CC does **NOT** recommend. CC does **NOT** summarize.

---

## HALT CONTINGENCIES

### HALT-C — Proven CRP $566,728.97 Substrate Shape Not Retrievable

**Trigger:** Section 0G.1's investigation of branches, tags, archived files, git history, migration files, and seed scripts produces no record of the rule_set shape that calculated $566,728.97 pre-clawback for tenant `e44bbcb1-2710-4880-8c7d-a1bd902720b7` across 10 periods × 4 OB-180/181 primitives (`linear_function`, `piecewise_linear`, `scope_aggregate`, `conditional_gate`).

**Action:** CC writes Section 0G.1's "HALT-C: Proven CRP Substrate Not Retrievable" sub-heading, names what was searched (every branch, every tag, every relevant migration), names what was found (or "no candidate evidence located"), and **stops Section 0G.1 only.** Continue all OTHER sections. The architect's verbatim provision of the proven baseline shape is required for AUD-004's remediation conversation; this gap remains open after Phase 0G.

### HALT-D — Branch State Ambiguity

**Trigger:** CC cannot determine whether `aud-004-phase-0` was merged to `main` (the predecessor branch's state). Determining this is necessary because Phase 0G's branch should be cut from whichever ref carries the Phase 0 inventory file.

**Action:** Branch `aud-004-phase-0g` from whichever of `origin/main` or `origin/aud-004-phase-0` carries `docs/audits/AUD_004_PHASE_0_INVENTORY.md`. Paste the decision and the source SHA. No halt; this is a bookkeeping branch — not a substantive one.

### All Other Ambiguities

Record verbatim in the report (with file:line citation or query output) and continue. Ambiguity is evidence.

---

## STANDING RULES INVOKED

| Rule | Application |
|---|---|
| `CC_STANDING_ARCHITECTURE_RULES.md` | Top-of-directive read |
| Rule 27 | No self-attestation; pasted evidence required |
| Rule 36 | Read-only mode |
| SQL Verification Gate (FP-49) | Section 0G.4 — schema confirmed before any DB query |
| JSONB SQL Gate | Section 0G.4 — raw column dump before path extraction |
| EVIDENTIARY GATES | Every section's claim backed by pasted code or query output |

---

## Phase 0G — Initialization

### Step 0G.0 — Substrate and Branch Verification

```bash
git fetch origin
git rev-parse origin/main
git log -1 origin/main --pretty=format:'%H %s%n%aD'
```

Paste output.

```bash
# Determine the predecessor branch state
git ls-remote origin aud-004-phase-0
git ls-remote origin aud-004-phase-0 | wc -l
git log origin/main --oneline | grep -i "aud-004\|aud_004" | head -5
```

Paste output. Determine whether `aud-004-phase-0` was merged into `origin/main`.

```bash
# Verify the Phase 0 inventory file exists somewhere accessible
git show origin/main:docs/audits/AUD_004_PHASE_0_INVENTORY.md | head -3 2>&1 || \
  git show origin/aud-004-phase-0:docs/audits/AUD_004_PHASE_0_INVENTORY.md | head -3 2>&1 || \
  echo "Phase 0 inventory file not found on either ref"
```

Paste output. **HALT-D check:** if neither ref carries the file, name the gap and use `origin/main` as the branch base.

### Step 0G.1 — Branch Creation

```bash
git checkout main
git pull origin main
# Branch from whichever ref carries the Phase 0 inventory
# (default: origin/main; alternative: origin/aud-004-phase-0)
git checkout -b aud-004-phase-0g
```

Paste branch confirmation.

### Step 0G.2 — Report File Scaffold

Create `docs/audits/AUD_004_PHASE_0G_GAP_CLOSURE.md` with this exact frontmatter:

```markdown
# AUD-004 Phase 0G: Evidence Gap Closure

**Authored:** [today's date]
**Branch:** aud-004-phase-0g (off [SHA from Step 0G.0])
**Scope:** READ-ONLY inspection. Closure of 9 evidence gaps surfaced in
          AUD-004 Phase 0 analysis stage.
**Deliverable:** Pasted evidence corpus. No interpretation. No findings.
**Predecessor:** AUD_004_PHASE_0_INVENTORY.md
**Governing:** Decision 64 v2, Decision 151, Decision 153 (LOCKED 2026-04-20),
              AP-25 (Korean Test as gate), AUD-002 v2 + AUD-004 Phase 0 audit pattern.

---
```

Commit:

```bash
git add docs/audits/AUD_004_PHASE_0G_GAP_CLOSURE.md
git commit -m "AUD-004 Phase 0G: scaffold"
git push -u origin aud-004-phase-0g
```

Paste output.

---

## Section 0G.1 — Proven CRP $566,728.97 Substrate Recovery (Gap 1, hard)

**Background:** Phase 0E.4 established that the CRP tenant (`e44bbcb1-2710-4880-8c7d-a1bd902720b7`) has 2 active rule_sets, both carrying BCL plan name and shape — NOT the proven April 9-10 substrate that calculated $566,728.97 pre-clawback across 10 periods × 4 OB-180/181 primitives (`linear_function`, `piecewise_linear`, `scope_aggregate`, `conditional_gate`).

**Goal:** Locate any record of the proven CRP rule_set shape — branch, tag, migration file, seed script, archived test fixture, or any other artifact preserving the historical calculation substrate.

### Step 0G.1.1 — Branch and tag inventory

```bash
# Every branch and tag — local and remote
git branch -a 2>&1 | head -50
git tag -l 2>&1 | head -50

# Branches mentioning CRP, cascade, or April 9-10 work
git branch -a | grep -iE "crp|cascade|april|0409|0410" | head -20
git tag -l | grep -iE "crp|cascade|april|0409|0410" | head -20

# Recent merges to main containing CRP work
git log origin/main --merges --oneline --since="2026-04-05" --until="2026-04-15" | head -20
```

Paste output. CC does NOT interpret. Each branch/tag is a candidate; CC enumerates them.

### Step 0G.1.2 — Migration file inventory

```bash
# Migration files referencing CRP, cascade, or the proven substrate
ls -la web/supabase/migrations/ 2>&1 | head -30
ls -la supabase/migrations/ 2>&1 | head -30

# Migration files containing CRP-related content
grep -rln "cascade\|CRP\|e44bbcb1" web/supabase/migrations/ supabase/migrations/ 2>&1 | head -20

# For each migration found, capture the migration name
grep -rln "linear_function\|piecewise_linear\|scope_aggregate" web/supabase/migrations/ supabase/migrations/ 2>&1 | head -20
```

Paste output.

### Step 0G.1.3 — Seed script and test fixture inventory

```bash
# Seed scripts (CRP_Resultados_Esperados, BCL_Resultados_Esperados, or any CRP fixture)
find . -type f \( -name "*.json" -o -name "*.ts" -o -name "*.sql" -o -name "*.xlsx" \) \
  -path "*seed*" -o -path "*fixture*" -o -path "*test-data*" 2>&1 | grep -v "node_modules\|.next" | head -30

# Files mentioning the proven CRP value 566728 or 566,728
grep -rln "566728\|566,728\|566728.97" web/ docs/ 2>&1 | grep -v "node_modules\|.next" | head -20

# CRP-related script files
find web/scripts -type f -name "*crp*" -o -name "*cascade*" 2>&1 | head -20
```

Paste output.

### Step 0G.1.4 — Git history shape archaeology

```bash
# Git log referencing CRP rule_set work in early-to-mid April
git log --all --oneline --since="2026-04-08" --until="2026-04-12" | head -30

# Commits mentioning the four CRP primitives in proximity
git log --all --grep="linear_function\|piecewise_linear\|scope_aggregate" --oneline | head -20

# Decision 147 era commits
git log --all --grep="Decision 147\|HF-191\|synaptic forwarding" --oneline | head -20
```

Paste output. For any commit that looks like a candidate for carrying the proven substrate, capture the commit SHA, message, and file paths affected:

```bash
# For up to 3 candidate SHAs, paste the commit detail
git show <SHA> --stat | head -30
```

### Step 0G.1.5 — Database backup / archive trace

```bash
# Look for any DB-snapshot files, backup directories, or restore scripts
find . -type d -name "*backup*" -o -name "*archive*" -o -name "*snapshot*" 2>&1 | grep -v "node_modules\|.next" | head -20
find . -type f -name "*.sql.gz" -o -name "*.dump" 2>&1 | grep -v "node_modules\|.next" | head -20
```

Paste output.

### Step 0G.1.6 — Inspect candidate rule_set shape (if found)

If Steps 0G.1.1-0G.1.5 surface a candidate file or commit carrying the proven CRP substrate shape:
- Open the candidate file/commit
- Paste the components JSONB structure verbatim
- Identify the four primitives and their `componentType` + `calculationIntent.operation` strings
- Compare against the production CRP active rule_sets (per Phase 0E.4)

If NO candidate is found, write the **HALT-C: Proven CRP Substrate Not Retrievable** sub-heading. Name what was searched, name what was not found, and state: "Architect verbatim provision of proven baseline shape is required for AUD-004 remediation conversation."

### Section 0G.1 — Commit

```bash
git add docs/audits/AUD_004_PHASE_0G_GAP_CLOSURE.md
git commit -m "AUD-004 Phase 0G.1: proven CRP substrate recovery investigation"
git push origin aud-004-phase-0g
```

---

## Section 0G.2 — `executeIntent` Outer-Scope Error Containment (Gap 2, hard)

**Background:** Phase 0F.4 traced 8 `executeOperation` call sites; one (run-calculation.ts:456) is wrapped in try/catch, the others are not. The primary external entry — `run/route.ts:1683` calling `executeIntent` — was not traced for outer-scope error containment. Phase 0 analysis F-002 (HIGH) hinges on whether F-002's silent-undefined return causes a TypeError that propagates as HTTP 500, is logged, or is caught silently. The severity classification depends on this answer.

**Goal:** Establish exactly how `run/route.ts` handles errors thrown from inside the entity loop.

### Step 0G.2.1 — Outer-scope error trace

View the full entity loop in `run/route.ts`. The loop start was identified at Phase 0F.3 (around line 1471 for the legacy loop, 1672 for the intent loop). Capture:

```bash
grep -n "for (\|try {\|} catch\|throw\|console.error\|addLog" web/src/app/api/calculation/run/route.ts | head -80
```

Paste output. Identify:
- Where the entity loop begins (the outer `for` containing both legacy and intent loops)
- Every `try { ... } catch (...)` block within or around the entity loop
- Every `throw` statement
- Every `console.error` and `addLog` call related to error paths
- Where `executeIntent` is called and what its return is assigned to (Phase 0F.4 noted line 1683)

### Step 0G.2.2 — `executeIntent` call site context

View `web/src/app/api/calculation/run/route.ts` lines 1640-1740 (the intent loop and its outer scope) verbatim. Paste the full code block in the report. Annotate (factual prose only — no interpretation):

- Which lines start a try/catch
- Which lines are inside that try/catch
- What the catch block does (paste verbatim)
- Whether `executeIntent`'s return is assigned to a variable that is then operated on (e.g., `.toNumber()`, `.plus()`)
- Whether any code path between `executeIntent` and the persisted `entityTotal` could throw

### Step 0G.2.3 — Top-level route error handler

```bash
# Find the route's top-level error handling
grep -n "export async function POST\|export async function GET\|catch (error\|catch (err" web/src/app/api/calculation/run/route.ts | head -20

# View the route function's signature and outermost try/catch
```

If the route function has a top-level try/catch wrapping the entity loop, paste it verbatim. Determine:
- What HTTP status the catch block returns
- Whether the error is logged before responding
- Whether the error message includes the operation name or any structural detail

### Step 0G.2.4 — Intent executor's `executeIntent` orchestrator inventory (folds in Gap 6)

```bash
grep -n "function executeIntent\|export.*executeIntent" web/src/lib/calculation/intent-executor.ts
```

Paste output. View `executeIntent` (Phase 0F.4 noted line 554) in full — at minimum lines 554-620, more if the function extends further. Enumerate:

- Every branch (variant routing, single operation, no-match)
- Every `executeOperation` call site within `executeIntent` (Phase 0F.4 already enumerated these at lines 589, 594, 607)
- Every default behavior when no variant route matches
- The shape of `intentResult` returned to `run/route.ts:1683`

Paste the function body verbatim.

### Section 0G.2 — Commit

```bash
git add docs/audits/AUD_004_PHASE_0G_GAP_CLOSURE.md
git commit -m "AUD-004 Phase 0G.2: executeIntent outer-scope error containment + executeIntent inventory"
git push origin aud-004-phase-0g
```

---

## Section 0G.3 — HF-193 Landing State on `main` (Gap 3, hard)

**Background:** Phase 0D evidence shows two seemingly contradictory facts: the `plan_agent_seeds` violation V-001 is structurally absent (zero grep, zero DB rows), but the expected Decision 153 signal types (`metric_comprehension`, `agent_activity:plan_interpretation`) are also absent. Either HF-193 partially landed (seeds removal yes, signal flow no), or CLN-001 cleaned seeds independently of HF-193. The remediation conversation cannot decide its substrate baseline without knowing.

**Goal:** Establish HF-193's actual landing state by examining branch refs, recent commit history, and any HF-193-related artifacts.

### Step 0G.3.1 — HF-193 branch state

```bash
# Look for HF-193 work branches
git branch -a | grep -iE "hf-193|hf_193|signal-surface" | head -20

# Look for HF-193-related commits on main
git log origin/main --oneline --grep="HF-193\|hf_193" | head -20

# Recent commits on main since Decision 153 LOCK (2026-04-20)
git log origin/main --oneline --since="2026-04-20" | head -30
```

Paste output.

### Step 0G.3.2 — CLN-001 commit trace

```bash
# CLN-001 commits
git log origin/main --oneline --grep="CLN-001\|cln_001\|plan_agent_seeds" | head -20

# What did CLN-001 change? View the diff if found
# (paste the result of `git show <CLN-001-SHA> --stat` for any matching commits)
```

Paste output.

### Step 0G.3.3 — Recent file change archaeology — convergence service

The signal-surface-to-convergence flow per Decision 153 must touch `convergence-service.ts`. Phase 0D.7 showed it has 1 write, 0 reads. Trace its recent change history:

```bash
git log origin/main --oneline -- web/src/lib/intelligence/convergence-service.ts | head -20
```

Paste output. For up to 3 most recent commits affecting this file:

```bash
git show <SHA> -- web/src/lib/intelligence/convergence-service.ts | head -60
```

Paste output.

### Step 0G.3.4 — Migration file scan for signal-flow infrastructure

```bash
# Migrations referencing classification_signals comprehension or signal-flow
grep -rln "metric_comprehension\|agent_activity\|comprehension" web/supabase/migrations/ supabase/migrations/ 2>&1 | head -20

# Recent migrations (since 2026-04-15)
ls -la web/supabase/migrations/ supabase/migrations/ 2>&1 | grep "2026.*04" | head -20
```

Paste output. For any migration containing comprehension or agent_activity references, paste the file contents verbatim.

### Step 0G.3.5 — HF-193-A and HF-193-B status

The architect noted HF-193 is split: HF-193-A (Phases 0-5, signal-surface infrastructure) and HF-193-B (Phases 6-10, atomic cutover).

```bash
# HF-193-A specifically
git log --all --oneline --grep="HF-193-A\|hf_193_a\|HF-193 Phase" | head -20

# Files added/modified for signal-surface infrastructure
grep -rln "signal_type.*metric_comprehension\|signal_type.*agent_activity" web/src/ 2>&1 | grep -v "node_modules\|.next" | head -20
```

Paste output.

### Step 0G.3.6 — Determine landing state

After Steps 0G.3.1-0G.3.5, write a factual summary (no interpretation):

- HF-193-A status on `origin/main`: [merged on SHA / not merged / unknown]
- HF-193-B status on `origin/main`: [merged on SHA / not merged / unknown]
- CLN-001 status on `origin/main`: [merged on SHA / not merged / unknown]
- The branch `hf-193-signal-surface` (referenced in Decision 153 doc) exists at: [origin/branch ref / local only / does not exist]
- Plan-comprehension signal types present in `classification_signals`: [from Phase 0D.5 — confirmed absent]
- `plan_agent_seeds` codebase references: [from Phase 0D.6 — confirmed zero]

CC does NOT interpret which combination is correct or expected. CC reports the facts.

### Section 0G.3 — Commit

```bash
git add docs/audits/AUD_004_PHASE_0G_GAP_CLOSURE.md
git commit -m "AUD-004 Phase 0G.3: HF-193 landing state archaeology"
git push origin aud-004-phase-0g
```

---

## Section 0G.4 — Rule_Set Selection Logic + Active-Duplicate Behavior (Gap 4, hard) + Concordance Counter Consumers (Gap 7, soft)

**Background:** Phase 0E.3/0E.4 surfaced 2 active rule_sets per tenant for both BCL and CRP, all dated 2026-04-26 / 2026-04-27 with identical structure. The remediation conversation must know which one calculations actually use. Additionally, Phase 0F.3 surfaced a concordance comparison loop that increments `intentMatchCount` / `intentMismatchCount` counters; Phase 0 did not trace what these counters do.

**Goal:** Establish the rule_set selection logic and trace concordance counter consumers.

### Step 0G.4.1 — Rule_set selection logic in run/route.ts

```bash
# Find where rule_sets are selected for calculation
grep -n "rule_sets\|ruleSet\|rule_set_id" web/src/app/api/calculation/run/route.ts | head -30
grep -n "from('rule_sets')\|from(\"rule_sets\")" web/src/app/api/calculation/run/route.ts | head -10
```

Paste output. View the rule_set selection query verbatim (±10 lines context).

### Step 0G.4.2 — Rule_set selection in upstream services

```bash
# Other code paths that select rule_sets
grep -rn "from('rule_sets')\|from(\"rule_sets\")" web/src/ --include="*.ts" | grep -v "node_modules\|.next" | head -20
```

Paste output. For each rule_set selection site outside `run/route.ts`, paste the query (±5 lines context).

### Step 0G.4.3 — DB query: which rule_set "wins" for each tenant

```sql
-- For each tenant with multiple active rule_sets, which would the application pick?
-- (Assumes selection logic is "most recent active" per Phase 0E.3 evidence;
--  CC verifies actual logic in Step 0G.4.1)
SELECT tenant_id,
       id,
       name,
       status,
       version,
       created_at,
       updated_at
FROM rule_sets
WHERE status = 'active'
  AND tenant_id IN (
    'b1c2d3e4-aaaa-bbbb-cccc-111111111111',
    'e44bbcb1-2710-4880-8c7d-a1bd902720b7'
  )
ORDER BY tenant_id, created_at DESC;
```

Execute via tsx-script + supabase-js (the project's standard pattern, per Phase 0D.1). Paste result.

### Step 0G.4.4 — Concordance counter consumers

```bash
# intentMatchCount / intentMismatchCount usage
grep -rn "intentMatchCount\|intentMismatchCount" web/src/ --include="*.ts" | grep -v "node_modules\|.next" | head -20

# dual_path_concordance signal (Phase 0D.4 showed 2 rows in production)
grep -rn "dual_path_concordance\|training:dual_path" web/src/ --include="*.ts" | grep -v "node_modules\|.next" | head -20
```

Paste output. For each consumer, view the usage site (±10 lines context). Determine, factually:

- Where the counters are written (per Phase 0F.3 evidence)
- Where the counters are read (the consumer of the counters' values)
- Whether the counters drive any architectural decision (alert, gating, signal-surface write, UI surface) or are pure write-only telemetry

### Section 0G.4 — Commit

```bash
git add docs/audits/AUD_004_PHASE_0G_GAP_CLOSURE.md
git commit -m "AUD-004 Phase 0G.4: rule_set selection logic + concordance counter consumers"
git push origin aud-004-phase-0g
```

---

## Section 0G.5 — Helper Function Shape Inventory (Gap 5, soft)

**Background:** Phase 0C inventoried per-primitive shape contracts at the `executeOperation` handler level. Each handler then calls helper functions: `resolveValue`, `resolveSource`, `findBoundaryIndex`, `applyModifiers`, `toNumber`, `toDecimal`. The shape contract's full surface includes these helpers — what they expect from `op.*` and from `data.*` (the `EntityData` shape). A "universal identification" remediation must reckon with helper-function vocabulary as well as dispatch-level vocabulary.

**Goal:** Inventory the helper functions and the `EntityData` / `IntentSource` discriminated unions.

### Step 0G.5.1 — `resolveValue` and `resolveSource`

```bash
grep -n "function resolveValue\|function resolveSource\|export.*resolveValue\|export.*resolveSource" \
  web/src/lib/calculation/intent-executor.ts
```

Paste output. View each function in full. Enumerate:

- Every `case '...'` (recognized source type)
- Every `op.<field>` or `src.<field>` access
- The default branch behavior (or absence)
- Recursive calls to `executeOperation` (Phase 0F.4 noted line 154 in `resolveValue`)

Paste the function bodies verbatim.

### Step 0G.5.2 — `findBoundaryIndex`

```bash
grep -n "function findBoundaryIndex" web/src/lib/calculation/intent-executor.ts
```

Paste output. View the function body. Enumerate the inputs it expects (boundary array shape, value type) and its return shape.

### Step 0G.5.3 — `applyModifiers`

```bash
grep -n "function applyModifiers" web/src/lib/calculation/intent-executor.ts
```

Paste output. View the function body. Enumerate every `modifier.modifier` case (cap, floor, etc.), the default branch, and the shape of the modifier object expected.

### Step 0G.5.4 — `IntentOperation` and `IntentSource` discriminated unions

```bash
grep -rn "type IntentOperation\|interface IntentOperation\|type IntentSource\|interface IntentSource" \
  web/src/ --include="*.ts" | grep -v "node_modules\|.next" | head -20
```

Paste output. View the type definitions in full. Enumerate:

- Every variant of `IntentOperation` (the discriminated union members)
- Every variant of `IntentSource`
- Whether the type definitions match the executor's switch cases (Phase 0A Boundary 6) — name divergences

### Step 0G.5.5 — `EntityData` shape

```bash
grep -rn "type EntityData\|interface EntityData" web/src/ --include="*.ts" | grep -v "node_modules\|.next" | head -10
```

Paste output. View the type definition. Enumerate every field the entity-data carries (`metrics`, `attributes`, `priorResults`, `periodHistory`, `crossDataCounts`, `scopeAggregates` per run/route.ts:1675 evidence).

### Section 0G.5 — Commit

```bash
git add docs/audits/AUD_004_PHASE_0G_GAP_CLOSURE.md
git commit -m "AUD-004 Phase 0G.5: helper function + discriminated union inventory"
git push origin aud-004-phase-0g
```

---

## Section 0G.6 — Variant-Routing Intent Path (Gap 8, soft)

**Background:** Phase 0E established that BCL/CRP rule_sets carry 2 variants per rule_set (`ejecutivo_senior`, `ejecutivo`). Variant selection drives which intent component is calculated for an entity. Phase 0 did not inspect variant selection logic.

**Goal:** Inventory the variant-routing intent path.

### Step 0G.6.1 — Variant selection in run/route.ts

```bash
grep -n "selectedVariantIndex\|variant.*index\|variants\[" web/src/app/api/calculation/run/route.ts | head -20
```

Paste output. View the variant-selection logic in `run/route.ts` (±15 lines context per match) verbatim.

### Step 0G.6.2 — Variant matching against entity attributes

```bash
grep -n "variantMatcher\|matchVariant\|variant.*condition\|variant.*criteria" \
  web/src/ --include="*.ts" -r | grep -v "node_modules\|.next" | head -20
```

Paste output. View any variant-matching function found.

### Step 0G.6.3 — Variant-routing in `executeIntent`

Cross-reference Section 0G.2.4's `executeIntent` body. The Phase 0F.4 evidence at intent-executor.ts:589/594 referenced `variant-routing branch`. Paste those lines (±15 context) verbatim and enumerate the variant-routing logic:

- The `routes` array shape
- The match condition each route uses
- The `noMatchBehavior` settings (`first`, `zero`, etc.)

### Section 0G.6 — Commit

```bash
git add docs/audits/AUD_004_PHASE_0G_GAP_CLOSURE.md
git commit -m "AUD-004 Phase 0G.6: variant-routing intent path inventory"
git push origin aud-004-phase-0g
```

---

## Section 0G.7 — Plan-Agent Prompt Construction Path (Gap 9, soft)

**Background:** Phase 0A Boundary 1 inventoried `SYSTEM_PROMPTS['plan_interpretation']` template literal at lines 134-541. Phase 0 did not inspect whether the prompt is interpolated, augmented, or modified before the API call. F-005 (prompt internal inconsistency) is authoritative only if the runtime prompt matches the static one.

**Goal:** Inventory the prompt construction path.

### Step 0G.7.1 — Prompt construction trace

```bash
# Trace from SYSTEM_PROMPTS lookup to API call
grep -n "SYSTEM_PROMPTS\[\|systemPrompt =\|system: systemPrompt\|\.messages.*system" \
  web/src/lib/ai/providers/anthropic-adapter.ts
```

Paste output.

View `anthropic-adapter.ts` around lines 800-845 (the prompt-fetch and API-call region) verbatim. Enumerate:

- Where the static prompt is fetched (line 805 evidence)
- Whether any code between the fetch and the API call modifies the prompt
- Whether any string concatenation, template substitution, or content injection occurs
- The exact shape passed to the Anthropic API (line 841 evidence)

### Step 0G.7.2 — Prompt-related signal types and tracing

```bash
# Code that logs or persists the actual prompt sent at runtime
grep -n "prompt.*log\|log.*prompt\|persistPrompt\|trace.*prompt" web/src/lib/ai/ --include="*.ts" -r | \
  grep -v "node_modules\|.next" | head -10
```

Paste output. If any persistence path exists, name what is persisted.

### Section 0G.7 — Commit

```bash
git add docs/audits/AUD_004_PHASE_0G_GAP_CLOSURE.md
git commit -m "AUD-004 Phase 0G.7: prompt construction path inventory"
git push origin aud-004-phase-0g
```

---

## Section 0G.8 — `executeIntent` Orchestrator (Gap 6, soft)

**Note:** Folded into Section 0G.2.4 above. Phase 0G.8 is a placeholder section; CC writes it as:

```markdown
### Section 0G.8 — `executeIntent` Orchestrator

This section is folded into Section 0G.2.4. See Section 0G.2.4 for `executeIntent`
body inventory.
```

No additional work; commit not separately required.

---

## Phase 0G — Closing

### Step 0G.CLOSE.1 — Section completeness check

Verify the report file has these sections in this order:

- [ ] Frontmatter
- [ ] Phase 0G — Initialization (Step 0G.0, 0G.1, 0G.2)
- [ ] Section 0G.1 — Proven CRP $566,728.97 Substrate Recovery (with HALT-C if triggered)
- [ ] Section 0G.2 — `executeIntent` Outer-Scope Error Containment (includes `executeIntent` orchestrator inventory)
- [ ] Section 0G.3 — HF-193 Landing State
- [ ] Section 0G.4 — Rule_Set Selection Logic + Concordance Counter Consumers
- [ ] Section 0G.5 — Helper Function Shape Inventory
- [ ] Section 0G.6 — Variant-Routing Intent Path
- [ ] Section 0G.7 — Plan-Agent Prompt Construction Path
- [ ] Section 0G.8 — Folded reference to 0G.2.4

If any section is missing or empty, name what was skipped and why.

### Step 0G.CLOSE.2 — Final commit

```bash
git add docs/audits/AUD_004_PHASE_0G_GAP_CLOSURE.md
git commit -m "AUD-004 Phase 0G: complete gap closure pass"
git push origin aud-004-phase-0g
```

### Step 0G.CLOSE.3 — Completion Report (Terminal Output)

Output to terminal (NOT to a file):

```
AUD-004 Phase 0G — Completion Report

Branch:                aud-004-phase-0g
Final commit SHA:      [git rev-parse HEAD]
Report file path:      docs/audits/AUD_004_PHASE_0G_GAP_CLOSURE.md
Section count:         [count]
Total report lines:    [wc -l output]

HALT contingencies triggered:
  HALT-C (proven CRP substrate not retrievable): yes/no
  HALT-D (branch state ambiguity):                yes/no

Gaps closed:
  Gap 1 (proven CRP shape):                      [retrieved / not retrieved]
  Gap 2 (executeIntent error containment):       [closed]
  Gap 3 (HF-193 landing state):                  [closed]
  Gap 4 (rule_set selection):                    [closed]
  Gap 5 (helper functions):                      [closed]
  Gap 6 (executeIntent orchestrator):            [closed via 0G.2.4]
  Gap 7 (concordance counter consumers):         [closed via 0G.4]
  Gap 8 (variant-routing intent path):           [closed]
  Gap 9 (prompt construction path):              [closed]

Anomalies recorded as evidence: [count]

NEXT STEP: Architect reviews on branch. DO NOT open a PR.
```

---

## What CC Does NOT Do in This Directive

- No code changes
- No DB modifications
- No tests run, no lint, no build, no type-check
- No PR creation
- No findings classification
- No interpretation of evidence
- No remediation proposals
- No HF, OB, or SD drafting
- No summary or "high-level" characterization
- No advancing to AUD-004 Phase 1, Phase 2, or remediation conversation work

---

## When CC Finishes

CC's final terminal output is the completion report (Step 0G.CLOSE.3).

CC does **NOT** continue to Phase 1, Phase 2, or any analysis. The audit's analysis stage (interpretation of Phase 0 + Phase 0G evidence) happens in the architect's Claude conversation after CC's report is reviewed. The remediation conversation opens only after the architect signals that the evidence corpus is complete.

---

*AUD-004 Phase 0G · Evidence Gap Closure · Read-Only Inspection · 2026-04-27 · Branch: aud-004-phase-0g · Substrate: origin/main · Gaps closed: 9 (4 hard + 5 soft) · HALT contingencies: proven CRP substrate retrievability, branch state · Deliverable: docs/audits/AUD_004_PHASE_0G_GAP_CLOSURE.md · Storage: docs/vp-prompts/AUD_004_PHASE_0G_DIRECTIVE.md*
