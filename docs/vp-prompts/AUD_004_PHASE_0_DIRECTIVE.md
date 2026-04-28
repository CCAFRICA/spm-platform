# AUD-004 Phase 0: Vocabulary and Shape Inventory — CC Execution Directive

**Type:** AUD (Audit) — Phase 0 inventory pass
**Authored:** 2026-04-27
**Status:** READY FOR CC EXECUTION
**Storage:** `docs/vp-prompts/AUD_004_PHASE_0_DIRECTIVE.md` (per VP repo convention)
**Substrate:** `origin/main` (post-CLN-001; DIAG-024 anchor SHA `6504b7cfeac23e8410643c5f0b3a844f59597e67` — CC verifies current HEAD at Step 0.0)
**Mode:** READ-ONLY. No code changes. No DB modifications. No PR creation.
**Scope boundary:** `origin/main` only. The `hf-193-signal-surface` branch is out of scope.
**Predecessors:**
- `docs/diagnostics/DIAG-024_FINDINGS.md` (PR #344, merged)
- `docs/audits/AUD-002_SIGNAL_SURFACE_INTEGRITY_v2.md`

**Deliverable:** ONE committed report file at `docs/audits/AUD_004_PHASE_0_INVENTORY.md` on branch `aud-004-phase-0` (feature branch off `origin/main`).

**Architect interpretation deferred.** CC gathers evidence; the architect-and-Claude conversation classifies and analyzes after the report is delivered.

---

## READ FIRST (mandatory; paste line 1 of each as proof of read)

These files are checked into the VP repo at the repo root. CC reads from the repo root of the local checkout (whatever the working directory is when CC is invoked):

1. `<repo-root>/CC_STANDING_ARCHITECTURE_RULES.md`
2. `<repo-root>/SCHEMA_REFERENCE_LIVE.md`

If either file cannot be opened, **HALT** and report the path that failed.

---

## EMBEDDED GOVERNANCE CONSTRAINTS

The Governance Index (`INF_GOVERNANCE_INDEX_20260406.md` v1.1 + `INF_GOVERNANCE_INDEX_PATCH_20260416.md` v1.2) is a **routing document** that names which governing specifications constrain a given domain. Rather than require CC to read it on-disk (it may not be checked into spm-platform), the relevant constraints for AUD-004 Phase 0 are embedded here:

### Decision 64 v2 — Dual Intelligence (LOCKED)

Three signal levels: Classification (Level 1 — "what is this data?"), Comprehension (Level 2 — "how does it behave and why does it matter?"), Convergence (Level 3 — "what matches what?"). All signals on the shared surface (`classification_signals` table). Three flywheel scopes: Tenant, Foundational, Domain.

### Decision 95 (informational for this audit) — 100% reconciliation gate

This is a calculation-correctness gate, not an audit gate. Phase 0 is read-only and does not run calculations.

### Decision 111 — Carry Everything, Express Contextually

Importer carries all columns to `committed_data` (mapped + unmapped). AI classifications are hints, not gates.

### Decision 147 — Plan Intelligence Forward (LOCKED, IMPLEMENTED AND PROVEN per v1.2 patch)

Plan agent comprehension must flow to convergence. Implemented correctly via synaptic forwarding (April 9–10, 2026). The seeds-based implementation (HF-191) remains in the codebase as architectural debt (V-001 + V-007 per AUD-002 v2). HF-193 retires it.

### Decision 151 — Intent Executor Sole Calculation Authority (LOCKED, OPERATIONALLY CONFIRMED)

Intent executor is sole authority for all component types. No per-componentType allow-list. Legacy engine is concordance shadow only. The audit verifies this state at Phase 0F.2.

### Decision 152 — Import Sequence Independence (LOCKED, OPERATIONALLY CONFIRMED)

Identical results regardless of file import order.

### Decision 153 — Plan Intelligence Forward Signal-Based (LOCKED 2026-04-20)

**Note:** the v1.2 patch (April 16) shows "DEFERRED" — that was the state as of April 16. **Decision 153 was LOCKED on April 20.** Plan agent comprehension flows as Level 2 Comprehension signals via `classification_signals`. The `plan_agent_seeds` mechanism (HF-191) is eradicated by HF-193. **HF-193 has not yet shipped to `main`.** The substrate this audit runs against still operates the seeds path.

### AP-25 — Korean Test (Foundational Principle)

All field identification in foundational code uses STRUCTURAL heuristics, never field-name matching in any language. Domain Agent prompts are EXEMPT — they translate domain vocabulary to structural vocabulary. The Korean Test applies as a **gate**, not as a drift mechanism.

### AUD-002 v2 audit pattern

Phase 0 inventory (writers / readers / signal_types) → category classification → finding template (ID, Category, Severity, File, What it does, What it should do, Phase, Why it was done, Flywheel impact, Agent visibility, Remediation, Blocking?) → severity-sorted output → proof gate (paste evidence). AUD-004 inherits this discipline. CC's role is Phase 0 evidence-gathering only.

### AUD-002 v2 known violations relevant to AUD-004 Phase 0D

| ID | Description | Status |
|---|---|---|
| V-001 | `plan_agent_seeds` in `rule_sets.input_bindings` | Open; HF-193 closes |
| V-002 | HF-165 gate checks presence not completeness | Open; HF-192 candidate fix |
| V-003 | Convergence makes independent AI calls without reading plan-agent comprehension signals | Open; HF-193 closes |
| V-006 | `convergence_calculation_validation` written but never read | Open |
| V-007 | Seven seed-preservation code paths | Open; HF-193 closes |

These IDs are the audit's reference points. CC inventories the **current state** of each on `origin/main`.

### Data Structure Governance (per Governance Index v1.1)

| Data Type | Correct Location | Wrong Location |
|---|---|---|
| Agent comprehension (metric semantics, field mappings, confidence) | `classification_signals` (Level 2 signals) | `rule_sets.input_bindings` |
| Confirmed metric derivation rules | `rule_sets.input_bindings.metric_derivations` | `classification_signals` |
| Per-component column bindings | `rule_sets.input_bindings.convergence_bindings` | Anywhere else |
| Calculation-time agent communication | In-memory SynapticSurface | Database tables |
| Cross-run learning | `synaptic_density` | `rule_sets` or `entities` |

**This audit is read-only and does not classify violations.** The table is provided so CC understands the audit's reference frame when inventorying. CC reports what the code and DB do; the architect classifies later.

---

## AUTONOMY DIRECTIVE

NEVER ask yes/no. NEVER say "shall I". Execute all phases sequentially. Commit and push after each phase.

This is a **READ-ONLY** audit:

- NO code modifications
- NO database modifications
- NO tests run, no lint, no build, no type-check
- NO PR creation unless explicitly instructed in a follow-up directive

CC does **NOT** interpret evidence. CC does **NOT** classify findings. CC does **NOT** recommend. CC does **NOT** summarize.

CC **gathers** evidence and **pastes** it verbatim into the report. The architect interprets in a subsequent conversation.

---

## HALT CONTINGENCIES

Only TWO halt conditions exist beyond the READ FIRST gate. Every other ambiguity becomes evidence in the report.

### HALT-A — Plan-Agent Prompt Source Ambiguity

**Trigger:** CC cannot locate the plan-agent system prompt source file, OR cannot confirm that the file CC reads at `origin/main` is the same prompt that produces the `calculationIntent.operation` strings observed in production rule_sets at runtime.

Examples that trigger HALT-A:
- The prompt is database-driven (loaded from a Supabase table at runtime)
- The prompt is env-variable-driven (loaded from process env or remote config)
- The prompt is loaded from an external prompt-management service
- Multiple candidate prompt sources exist with no clear runtime authority

**Action:** CC writes Phase 0G section header `## Phase 0G — HALT-A: Prompt Source Ambiguity`, names the ambiguity verbatim with candidate file paths or evidence of remote sourcing, and **stops Phase 0G inspection only.** Continue all OTHER phases. Request architect provision of authoritative prompt source for Phase 0G completion.

### HALT-B — Rule_Set Shape Gaps

**Trigger:** Any of the three reference tenants has no active rule_set, OR the rule_set shape does not match the proven-baseline shape recorded in conversation history.

Reference tenants:

- **BCL:** `b1c2d3e4-aaaa-bbbb-cccc-111111111111` — proven baseline $312,033, 4 components
- **CRP:** `e44bbcb1-2710-4880-8c7d-a1bd902720b7` — proven baseline $566,728.97 pre-clawback, 10 periods × 4 primitives
- **Meridian:** tenant_id verified at Step 0E.1 — proven baseline MX$185,063

**Action:** CC reports what IS retrievable, names what is NOT retrievable, does **NOT** fabricate absent shapes. Continue all OTHER phases.

### All Other Ambiguities

Record the ambiguity verbatim in the report (with file:line citation or query output) and continue. **Ambiguity is evidence.** The audit interprets at analysis time.

---

## STANDING RULES INVOKED

CC executes this directive in compliance with:

| Rule | Application |
|---|---|
| `CC_STANDING_ARCHITECTURE_RULES.md` | Top-of-directive read; Section A design principles, Section B execution discipline |
| Rule 27 | No self-attestation; pasted evidence required for every claim |
| Rule 36 | Read-only mode; this directive enforces |
| SQL Verification Gate (FP-49) | Phase 0D.1 and Phase 0E.2 — schema confirmed before any data query |
| JSONB SQL Gate | Phase 0E.2 — raw column dump before path extraction |
| EVIDENTIARY GATES | Every section's claim backed by pasted code or query output |
| AP-25 (Korean Test) | Applied as scope vocabulary; this is structural inventory |

CC does NOT need to invoke:
- Rule 41 (revert discipline) — no commits to `main`
- Rule 51v2 (`git stash` + tsc + lint) — no code changes
- Rule 34 (no bypass recommendations) — directive proposes nothing

---

## Phase 0 — Initialization

### Step 0.0 — Substrate Verification

```bash
# Run from repo root (CC's working directory should already be there)
git fetch origin
git rev-parse origin/main
git log -1 origin/main --pretty=format:'%H %s%n%aD'
```

**Expected:** SHA matches DIAG-024 anchor `6504b7cfeac23e8410643c5f0b3a844f59597e67` (post-CLN-001).

**If HEAD differs:** Paste the new SHA and the `git log` entry. Do not halt. Report and continue.

Paste the output verbatim into the report under section `## Phase 0 — Initialization`.

### Step 0.1 — Branch Creation

```bash
git checkout main
git pull origin main
git checkout -b aud-004-phase-0
```

Paste branch confirmation.

### Step 0.2 — Report File Scaffold

Create `docs/audits/AUD_004_PHASE_0_INVENTORY.md` with this exact frontmatter:

```markdown
# AUD-004 Phase 0: Vocabulary and Shape Inventory

**Authored:** [today's date]
**Branch:** aud-004-phase-0 (off origin/main at [SHA from Step 0.0])
**Scope:** READ-ONLY inspection. No code changes, no DB modifications.
**Deliverable:** Pasted evidence corpus. No interpretation. No findings.
**Predecessor:** DIAG-024_FINDINGS.md, AUD-002_SIGNAL_SURFACE_INTEGRITY_v2.md
**Governing:** Decision 64 v2, Decision 151, Decision 153 (LOCKED, not yet on main),
              AP-25 (Korean Test as gate), AUD-002 v2 audit pattern.

---
```

Commit:

```bash
git add docs/audits/AUD_004_PHASE_0_INVENTORY.md
git commit -m "AUD-004 Phase 0: scaffold"
git push -u origin aud-004-phase-0
```

Paste output.

---

## Phase 0A — Vocabulary Inventory at Every Switch Boundary

For each of the SIX boundaries below, produce a sub-section in the report containing:

1. The file path and the function name
2. Every recognized case as a string literal with line number
3. The DEFAULT branch verbatim (view ±5 lines around the default keyword)

### Boundary 1 — Plan-Agent System Prompt

**Discovery:**

```bash
grep -rn "system.*prompt\|systemPrompt\|SYSTEM_PROMPT" web/src/lib/ai/ \
  --include="*.ts" | grep -v "node_modules\|.next" | head -40

grep -rn "calculationIntent\|operation.*bounded_lookup\|operation.*linear_function" \
  web/src/lib/ai/providers/ --include="*.ts" | head -40
```

**HALT-A check:** If the prompt source location is ambiguous after these greps, write Phase 0G section "Halt-A: Prompt Source Ambiguity", paste evidence, and skip to next boundary.

**If the prompt source is locatable:**

- View the prompt source file in full (or the prompt-string region of it)
- Enumerate every operation name mentioned in the prompt as a string
- Enumerate every example block (with line range)
- Enumerate every constraint or "must" statement about operation names
- Paste the full prompt verbatim in a code block (markdown-escaped)

### Boundary 2 — `normalizeComponentType`

**File:** `web/src/lib/compensation/ai-plan-interpreter.ts`

**Discovery:**

```bash
grep -n "function normalizeComponentType\|normalizeComponentType =" \
  web/src/lib/compensation/ai-plan-interpreter.ts
```

Then view the function body in full.

- Enumerate every `case '...'` with line number
- Paste the default branch verbatim with ±5 lines context
- **Note:** if the function uses a `validTypes` array rather than a switch, paste the array verbatim and note the membership-check semantics (lines)

### Boundary 3 — `normalizeCalculationMethod`

**File:** `web/src/lib/compensation/ai-plan-interpreter.ts`

Same procedure as Boundary 2. Paste switch enumeration + default verbatim.

### Boundary 4 — `convertComponent`

**File:** `web/src/lib/compensation/ai-plan-interpreter.ts`

Same procedure. Paste switch enumeration + default verbatim.

**Pay particular attention** to the HF-156 fallback at approximately line 681 (the DEFAULT branch that writes `componentType: 'tier_lookup'` + empty `tierConfig.tiers` + populated `metadata.intent`). Paste that branch verbatim in the report regardless of where it now sits.

### Boundary 5 — Legacy Engine Dispatch

**File:** `web/src/lib/calculation/run-calculation.ts`

**Discovery:**

```bash
grep -n "switch (component.componentType)" \
  web/src/lib/calculation/run-calculation.ts
```

Then view the switch in full (typically ~line 362).

- Enumerate every case with line number
- Paste default branch verbatim

### Boundary 6 — Intent Executor Dispatch

**File:** `web/src/lib/calculation/intent-executor.ts`

**Discovery:**

```bash
grep -n "switch (op.operation)\|function executeOperation" \
  web/src/lib/calculation/intent-executor.ts
```

Then view the switch in full (typically ~line 432-451).

- Enumerate every case with line number
- Paste default branch verbatim

### Phase 0A.7 — Vocabulary Intersection Table

After all six boundaries are inventoried, produce a sub-section "Vocabulary Intersection Table" containing one Markdown table with one row per UNIQUE operation/componentType string surfaced across boundaries 1-6.

**Columns:**

| Operation | B1: Prompt | B2: normalizeComponentType | B3: normalizeCalculationMethod | B4: convertComponent | B5: Legacy switch | B6: Intent executor switch |

**Cell values:**

- `✓ L<line>` if the boundary recognizes the operation at that line
- `—` if absent

This is the ONLY "table" CC produces in Phase 0A. The table is a **structuring tool, not analysis.** CC populates it from the prior enumerations only.

### Phase 0A — Commit

```bash
git add docs/audits/AUD_004_PHASE_0_INVENTORY.md
git commit -m "AUD-004 Phase 0A: vocabulary inventory at six boundaries"
git push origin aud-004-phase-0
```

Paste output.

---

## Phase 0B — Default-Branch Behavior Characterization

For each of the SIX default branches captured in Phase 0A, produce a sub-section. Each sub-section answers these five questions, sourced from the verbatim default-branch code already pasted in 0A (no new grep needed; this is structural reading):

### Q1 — Output shape

What is the output shape this default branch produces? Enumerate every field assigned. Paste the assignment lines verbatim.

### Q2 — Operation/type name handling

Is the operation/type name PRESERVED, OVERWRITTEN, or DROPPED? Cite the exact line that determines this.

### Q3 — Error throwing

Is any error thrown? Cite the line, or write "no error thrown".

### Q4 — Logging

Is any log emitted? Cite the line, or write "no log emitted".

### Q5 — Downstream consumer behavior

What does the DOWNSTREAM consumer of this default-branch output do with it?

| Boundary | Downstream consumer |
|---|---|
| B2 (normalizeComponentType) | Caller of the function (find via grep for the function name) |
| B3 (normalizeCalculationMethod) | Same procedure |
| B4 (convertComponent) | The engine dispatch (legacy + intent executor) |
| B5 (legacy switch) | How `payout: 0` is consumed by the route's component-results aggregation |
| B6 (intent executor switch) | How the unrecognized-operation case is handled by `executeOperation`'s caller |

Paste the downstream code citation verbatim.

### Phase 0B — Constraint

CC does **NOT** classify "silent failure" or "this is a violation". CC reports what the code does. The architect classifies later.

### Phase 0B — Commit

```bash
git add docs/audits/AUD_004_PHASE_0_INVENTORY.md
git commit -m "AUD-004 Phase 0B: default-branch behavior characterization"
git push origin aud-004-phase-0
```

---

## Phase 0C — Per-Primitive Shape Contract Inventory

For EACH operation in the working set, produce a sub-section. The audit treats this as the working set per architect approval 3.

### Working Set

**Intent-executor primitives** (verify against Boundary 6 enumeration from Phase 0A):

1. `bounded_lookup_1d`
2. `bounded_lookup_2d`
3. `scalar_multiply`
4. `conditional_gate`
5. `aggregate`
6. `ratio`
7. `constant`
8. `weighted_blend`
9. `temporal_window`
10. `linear_function`
11. `piecewise_linear`

If Phase 0A surfaces additional cases, add them. If it surfaces fewer, document which named primitives are ABSENT — this is evidence.

**Legacy primitives:**

12. `tier_lookup`
13. `matrix_lookup`
14. `percentage`
15. `flat_percentage`
16. `conditional_percentage`

**Plus:** `scope_aggregate` (named in architect's seven; present at importer Boundary 4 5-tuple per DIAG-024 line 666; verify presence in intent-executor switch).

### Per-Primitive Sub-Section Structure

Each primitive's sub-section has FOUR parts:

#### Part 1 — Importer Write Shape

What does `convertComponent` (Boundary 4) write into `metadata.intent` for this operation? Cite the line(s). Paste the verbatim object construction.

#### Part 2 — Intent-Executor Read Shape

What does the corresponding handler in `intent-executor.ts` read from `op.*`? Cite the function name, line range, and every `op.<field>` access. Paste the line(s) verbatim.

#### Part 3 — Legacy-Engine Read Shape (if applicable)

For **legacy primitives only:** what does the legacy switch case read (`tierConfig.*`, `matrixConfig.*`, `percentageConfig.*`, etc.)? Cite the handler function (`evaluateTierLookup`, `evaluateMatrixLookup`, etc.) and the fields read. Paste verbatim.

For **new primitives:** write "Not applicable — no legacy case".

#### Part 4 — Field-Name Alignment Check

Compare Part 1's written field names to Part 2's read field names. Produce a two-column list:

```
Importer writes (from metadata.intent)  |  Executor reads (from op.*)
──────────────────────────────────────  |  ──────────────────────────
input                                   |  op.input
boundaries                              |  op.boundaries
outputs                                 |  op.outputs
...
```

**Marking conventions:**

- Where they MATCH, mark `✓`
- Where they DIVERGE (e.g., importer writes `inputs.row` but executor reads `op.row` directly), mark `DIVERGE` with both names
- Where the importer DOES NOT WRITE the field at all (because the primitive routes through the `convertComponent` default branch), mark `ABSENT — primitive routes through default branch`

### Phase 0C — Constraint

CC does **NOT** classify divergence as a violation. CC reports the divergence.

### Phase 0C — Commit

```bash
git add docs/audits/AUD_004_PHASE_0_INVENTORY.md
git commit -m "AUD-004 Phase 0C: per-primitive shape contract inventory"
git push origin aud-004-phase-0
```

---

## Phase 0D — Signal Surface Inventory

This phase inventories the `classification_signals` surface state on `origin/main`. The audit must determine whether plan-comprehension signal flow per Decision 153 exists on main today, or whether the seeds path is operative.

### Step 0D.1 — Schema Verification (SQL Verification Gate)

Use the **tsx-script + postgres lib pattern** (NOT `exec_sql` RPC).

Query `information_schema.columns` for these tables:

- `classification_signals`
- `foundational_classification_signals`
- `domain_classification_signals`
- `rule_sets`
- `synaptic_density`

Paste the full column list with data types for each table. **This is the authoritative schema reference for all subsequent SQL in Phase 0D and 0E.**

### Step 0D.2 — Signal_Type Write Inventory (Codebase Grep)

```bash
grep -rn "signal_type" web/src/ --include="*.ts" \
  | grep -v "node_modules\|.next" \
  | grep -v "SELECT\|select\|interface\|type \b" \
  > /tmp/aud004_signal_writes.txt
cat /tmp/aud004_signal_writes.txt
```

Paste the output verbatim. For each distinct `signal_type` string literal found, note the file:line. CC does NOT classify which are correct or incorrect.

### Step 0D.3 — Signal_Type Read Inventory (Codebase Grep)

```bash
grep -rn "classification_signals\|signal_type" web/src/ --include="*.ts" \
  | grep -i "select\|from\|query\|fetch\|read\|get\|.eq(" \
  | grep -v "node_modules\|.next" \
  > /tmp/aud004_signal_reads.txt
cat /tmp/aud004_signal_reads.txt
```

Paste verbatim. For each read site, note the file:line and the `signal_type` filter being applied (if any).

### Step 0D.4 — Production Signal_Type Universe (DB)

After schema verification confirms `classification_signals` exists with a `signal_type` column, query:

```sql
SELECT signal_type, COUNT(*) AS rows, COUNT(DISTINCT tenant_id) AS tenants
FROM classification_signals
GROUP BY signal_type
ORDER BY rows DESC;
```

Paste the result.

### Step 0D.5 — Plan-Comprehension Signal Check

Per Decision 153 LOCKED, plan agent comprehension flows as `signal_type = 'metric_comprehension'` (or the renamed `'agent_activity:plan_interpretation'` per the in-flight prefix rename in HF-193-A).

Query (on `origin/main` schema as confirmed in 0D.1):

```sql
SELECT signal_type, source, level, COUNT(*) AS rows
FROM classification_signals
WHERE signal_type ILIKE '%comprehension%'
   OR signal_type ILIKE '%plan_interpretation%'
   OR signal_type ILIKE '%agent_activity%'
   OR source = 'plan_interpretation'
GROUP BY signal_type, source, level;
```

Paste result.

### Step 0D.6 — Seeds Path Inventory (per AUD-002 V-001)

```bash
grep -rn "plan_agent_seeds" web/src/ --include="*.ts" \
  | grep -v "node_modules\|.next"
```

Paste verbatim. Each match is a known V-001 location.

Then query:

```sql
SELECT id, name, status,
       CASE WHEN input_bindings ? 'plan_agent_seeds' THEN 'PRESENT'
            ELSE 'absent' END AS seeds_state,
       jsonb_typeof(input_bindings -> 'plan_agent_seeds') AS seeds_shape,
       created_at
FROM rule_sets
WHERE status = 'active'
ORDER BY created_at DESC
LIMIT 50;
```

Paste result. This establishes whether seeds are active in production on the current `main` substrate.

### Step 0D.7 — Convergence One-Way-Door State (per AUD-002 V-003)

```bash
grep -n "classification_signals\|signal_type\|lookupPriorSignals\|readSignals" \
  web/src/lib/intelligence/convergence-service.ts
```

Paste verbatim. For every match, note whether the line is:

- A **WRITE** (insert/upsert/`.from('classification_signals').insert`/`.upsert`)
- A **READ** (select/`.from('classification_signals').select`)

CC does NOT classify "one-way door". CC enumerates writes and reads.

### Phase 0D — Commit

```bash
git add docs/audits/AUD_004_PHASE_0_INVENTORY.md
git commit -m "AUD-004 Phase 0D: signal surface inventory"
git push origin aud-004-phase-0
```

---

## Phase 0E — Production Rule_Set Shape Inventory

### Step 0E.1 — Tenant Identification

```sql
SELECT id, name, slug
FROM tenants
WHERE id IN (
  'b1c2d3e4-aaaa-bbbb-cccc-111111111111',
  'e44bbcb1-2710-4880-8c7d-a1bd902720b7'
)
   OR name ILIKE '%meridian%'
   OR name ILIKE '%cumbre%'
   OR name ILIKE '%cascade%'
ORDER BY name;
```

Paste result. Confirm BCL, CRP, and Meridian tenant_ids.

Also list all OTHER tenants currently in the database:

```sql
SELECT id, name, slug, created_at
FROM tenants
WHERE id NOT IN (<above three tenant_ids>)
ORDER BY created_at DESC
LIMIT 20;
```

Paste result. Per architect approval 1, the audit reasons over ALL tenants whose rule_sets contain primitive evidence.

### Step 0E.2 — JSONB SQL Gate (Raw Column Dump)

For ONE active rule_set (any tenant), dump components in raw form:

```sql
SELECT id, tenant_id, name, status,
       jsonb_typeof(components) AS components_type,
       components
FROM rule_sets
WHERE status = 'active'
LIMIT 1;
```

Paste result. **Confirm the JSONB shape (array vs object) before any path extraction.**

### Step 0E.3 — Per-Tenant Rule_Set Shape (BCL)

For tenant `b1c2d3e4-...`:

```sql
SELECT id, name, status, created_at,
       jsonb_array_length(components) AS num_components
FROM rule_sets
WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
  AND status = 'active'
ORDER BY created_at DESC;
```

Paste result.

Then for EACH active rule_set returned, paste the per-component shape using:

```sql
SELECT id, name,
       component->>'name' AS comp_name,
       component->>'componentType' AS component_type,
       component->'calculationIntent'->>'operation' AS calc_intent_op,
       component->'tierConfig' AS tier_config,
       component->'matrixConfig' AS matrix_config,
       jsonb_object_keys(component->'metadata'->'intent') AS metadata_intent_key
FROM rule_sets,
     jsonb_array_elements(components) AS component
WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
  AND status = 'active';
```

Paste result.

**HALT-B check:** If BCL has zero active rule_sets, OR if the shape does NOT correspond to the proven $312,033 baseline (4 components matching memory: tier_lookup/Credit, tier_lookup/Deposit, scalar_multiply/Cross, conditional_gate/Compliance OR the rebuilt-substrate equivalent shape per DIAG-024), name what was found vs what was expected. Continue Phase 0E with other tenants.

### Step 0E.4 — Per-Tenant Rule_Set Shape (CRP)

Same procedure as 0E.3 for tenant `e44bbcb1-...`.

CRP is the central evidence — the four primitives that introduced the new vocabulary (`linear_function`, `piecewise_linear`, `scope_aggregate`, `conditional_gate`) live here.

**HALT-B check:** If CRP's current shape does not correspond to any known proven baseline (pre-clawback $566,728.97 across 10 periods × 4 primitives, or post-revert state), name what was found and request architect provision of the proven baseline shape from conversation history if needed for analysis.

### Step 0E.5 — Per-Tenant Rule_Set Shape (Meridian)

After tenant_id confirmation in 0E.1. Same procedure as 0E.3. HALT-B check applies.

### Step 0E.6 — Cross-Tenant Operation-Vocabulary Aggregation

```sql
SELECT t.name AS tenant,
       component->>'componentType' AS component_type,
       component->'calculationIntent'->>'operation' AS calc_intent_op,
       COUNT(*) AS count
FROM rule_sets r
JOIN tenants t ON t.id = r.tenant_id
JOIN jsonb_array_elements(r.components) AS component ON TRUE
WHERE r.status = 'active'
GROUP BY t.name, component_type, calc_intent_op
ORDER BY t.name, count DESC;
```

Paste result. This is the cross-tenant primitive-frequency table — evidence for which primitives the audit's working set must reckon with based on actual production usage.

### Step 0E.7 — Operation-Name Divergence Flag

From 0E.6, for any row where `componentType != calculationIntent.operation` (e.g., `componentType: tier_lookup` but `calc_intent_op: bounded_lookup_2d` per DIAG-024 BCL evidence), paste these rows separately under a sub-heading:

`### Components with componentType ≠ calculationIntent.operation`

Each such row is evidence that the importer DEFAULT branch is in play (per DIAG-024 finding). CC does NOT classify "violation" — CC reports the divergence.

### Phase 0E — Commit

```bash
git add docs/audits/AUD_004_PHASE_0_INVENTORY.md
git commit -m "AUD-004 Phase 0E: production rule_set shape inventory"
git push origin aud-004-phase-0
```

---

## Phase 0F — Authority Routing Inventory

### Step 0F.1 — HF-188 Authority Routing Locations

```bash
grep -n "HF-188\|sole authority\|concordance shadow\|INTENT_AUTHORITATIVE" \
  web/src/app/api/calculation/run/route.ts
```

Paste verbatim.

Then view ±15 lines around each match to capture the routing logic. Paste the verbatim code blocks with line numbers.

### Step 0F.2 — Per-ComponentType Allow-List Verification

Per Decision 151, NO per-componentType allow-list should exist.

```bash
grep -rn "INTENT_AUTHORITATIVE_TYPES\|isIntentAuthoritative\|authoritativeTypes" \
  web/src/ --include="*.ts" | grep -v "node_modules\|.next"
```

Paste verbatim. Empty result expected per Decision 151. If any matches surface, paste the context around them.

### Step 0F.3 — Authority-Routing Trace Through One Sample Component

In `run/route.ts`, locate the loop that iterates components and writes `total_payout`. Paste the loop body verbatim.

Then trace, in CC's report prose:

- Where the legacy result is computed
- Where the intent-executor result is computed
- Which one is written to `total_payout`
- Which one is written to `component_results[i].payout`
- Where the concordance comparison is made and what is logged

This is the ONLY place in Phase 0 where CC writes prose. Keep it factual:

> "Line 1466: legacy total computed and stored as `legacyTotalDecimal`. Line 1670: intent total computed and stored as `intentTotalDecimal`. Line 1707: `total_payout = intentTotalDecimal`."

Do **NOT** interpret or characterize. Trace only.

### Step 0F.4 — `executeOperation` Invocation Trace

```bash
grep -n "executeOperation" web/src/lib/calculation/ web/src/app/api/calculation/ \
  --include="*.ts" -r | grep -v "node_modules\|.next"
```

Paste verbatim. Each match is a call site for the intent executor's dispatch. The audit reasons about how unrecognized operations propagate from these call sites.

### Phase 0F — Commit

```bash
git add docs/audits/AUD_004_PHASE_0_INVENTORY.md
git commit -m "AUD-004 Phase 0F: authority routing inventory"
git push origin aud-004-phase-0
```

---

## Phase 0 — Closing

### Step 0.CLOSE.1 — Report Completeness Check

Verify the report file has these sections in this order:

- Frontmatter
- Phase 0 — Initialization
- Phase 0A (six boundary sub-sections + intersection table)
- Phase 0B (six default-branch sub-sections)
- Phase 0C (one sub-section per primitive in working set)
- Phase 0D (signal surface inventory, seven steps)
- Phase 0E (production rule_set inventory across tenants, seven steps)
- Phase 0F (authority routing inventory, four steps)
- Phase 0G ONLY IF HALT-A triggered (prompt source ambiguity)

If any section is missing or empty, name what was skipped and why.

### Step 0.CLOSE.2 — Final Commit

```bash
git add docs/audits/AUD_004_PHASE_0_INVENTORY.md
git commit -m "AUD-004 Phase 0: complete inventory pass"
git push origin aud-004-phase-0
```

### Step 0.CLOSE.3 — Completion Report (Terminal Output)

Output to terminal (NOT to a file):

```
AUD-004 Phase 0 — Completion Report

Branch:                aud-004-phase-0
Final commit SHA:      [git rev-parse HEAD]
Report file path:      docs/audits/AUD_004_PHASE_0_INVENTORY.md
Section count:         [count]
Total report lines:    [wc -l output]

HALT contingencies triggered:
  HALT-A (prompt source ambiguity): yes/no
  HALT-B (rule_set shape gaps):     [tenants affected, or "none"]

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
- No skipping ahead to "what should we fix" — that is the architect's next conversation, after this report is reviewed

---

## When CC Finishes

CC's final terminal output is the completion report (Step 0.CLOSE.3).

CC does **NOT** continue to Phase 1, Phase 2, or any analysis.

The audit's analysis stage happens in the architect's Claude conversation after CC's report is reviewed.

---

*AUD-004 Phase 0 · Vocabulary and Shape Inventory · Read-Only Inspection · 2026-04-27 · Branch: aud-004-phase-0 · Substrate: origin/main · Working set: 17 primitives across six switch boundaries · Three reference tenants (BCL, CRP, Meridian) plus full tenant universe · HALT contingencies: prompt source ambiguity, rule_set shape gaps · Deliverable: docs/audits/AUD_004_PHASE_0_INVENTORY.md · Storage: docs/vp-prompts/AUD_004_PHASE_0_DIRECTIVE.md*
