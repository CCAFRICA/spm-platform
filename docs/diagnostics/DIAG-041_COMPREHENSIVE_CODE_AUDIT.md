# DIAG-041 — HC contextualIdentity, Convergence Binding-Selection, Intent Modifier Execution, Intent-Transformer Normalization, Plan-Interpreter Cap Emission

**Type:** Code-archeology probe (read-only, no modification)
**Scope:** Five code surfaces that compose the HF-218 product-layer fix.
**Output:** Single consolidated file at `docs/diagnostics/DIAG-041_COMPREHENSIVE_CODE_AUDIT_OUTPUT.md`
**Purpose:** Provide the architect with complete evidence (verbatim function bodies, prompt strings, call sites, upstream consumers, downstream consumers) to support or refute the HF-218 scope and shape.

---

## Architect-channel framing (read before CC dispatch)

This DIAG exists because the prior HFs (HF-216, HF-217) drafted scope from inferred code shape. Each inference contradicted the actual code path on execution. The pattern must end.

DIAG-041 reads the actual code at five surfaces and surfaces upstream / downstream factors for each. The output file becomes the substrate for HF-218 drafting. No HF-218 draft proceeds until DIAG-041 evidence is in hand.

**The five surfaces probed:**

1. **HC contextualIdentity emission** — the function or LLM prompt that assigns `'person_identifier'`, `'location_code'`, etc. on a per-column basis. The defect anchor: Meridian's `Hub` column was emitted with `contextualIdentity: "person_identifier"` (per DIAG-039 E2.4) when DS-009 specifies `location_code`.
2. **Convergence binding-selection logic** — the function that picks a column as `entity_identifier.column`. The defect anchor: convergence picked `Hub` despite Hub values ("Mérida Hub") not matching tenant entity external_ids ("70209").
3. **Intent modifier execution** — `applyModifiers` (or wherever `modifier.type === 'cap'` dispatches). The defect anchor: cap fires post-multiply (collapsing $609.60 → $1.50) when plan PPTX semantic is pre-multiply ratio clamp.
4. **Intent-transformer normalization** — the existing list of intent-shape rewrites (e.g., the OB-120 `bounded_lookup_1d{postProcessing} → scalar_multiply` transformation). The architectural question: does this surface admit a cap-slot transformation, or does cap-slot require executor extension?
5. **Plan-interpreter cap modifier emission** — where the AI plan interpreter produces the `modifiers: [{maxValue: 1.5, modifier: 'cap'}]` blob from the source PPTX. The architectural question: is the wrong-slot cap a prompt-level defect or a deterministic emission defect?

**Korean Test:** All findings will be assessed for language-specific literals. Any field-name string matching, any locale-specific value tests, any hardcoded column names are flagged.

**Reconciliation channel:** DIAG-041 produces no calculated values. No GT comparisons. No reconciliation interpretation. Architect dispositions findings in architect channel.

---

## Standing rules (read first)

Read `CC_STANDING_ARCHITECTURE_RULES.md` in full. Specifically applicable here:

- **SR-34:** No bypass; this DIAG surfaces structural surfaces for class-level fixes
- **SR-42:** Locked-rule halt — if any probe encounters a locked rule or governance entry that would dictate halt, surface verbatim and stop
- **SR-44:** Architect-only production verification — N/A here (read-only DIAG)
- Architecture Decision Gate before implementation — N/A here (no implementation)
- Anti-Pattern Registry — N/A here (no code change)
- Commit + push after every change — applies to the DIAG output file only
- Git from repo root (`spm-platform/`), NOT `web/`
- **Output discipline:** single consolidated file at `docs/diagnostics/DIAG-041_COMPREHENSIVE_CODE_AUDIT_OUTPUT.md`. No subdirectories. No separate evidence/description files.
- **Capability routing:** CC reads via grep / cat / wc / sed. No SQL needed for this DIAG. No service-role tsx-script needed.

---

## What DIAG-041 does NOT do

- Does NOT modify any code
- Does NOT run any calculation
- Does NOT modify any database row or schema
- Does NOT propose a fix
- Does NOT compare values against ground truth
- Does NOT state PASS / FAIL
- Does NOT create a PR
- Does NOT interpret findings

CC executes the probe, surfaces evidence verbatim, halts. Architect reads and dispositions.

---

## Phase 0 — Pre-probe orientation

CC reads, in order:

1. `CC_STANDING_ARCHITECTURE_RULES.md` — full
2. DIAG-039 (the prior comprehensive code-archeology DIAG) — for shape reference. Located in `docs/diagnostics/DIAG-039_consolidated.md` or equivalent.
3. `web/src/app/api/calculation/run/route.ts` — search for `usedConvergenceBindings`, `resolveMetricsFromConvergenceBindings`, `applyMetricDerivations`. Note the function names that compose the convergence path. This is orientation; do not paste this content in the output yet.

CC creates the output file with header:

```bash
mkdir -p docs/diagnostics
cat > docs/diagnostics/DIAG-041_COMPREHENSIVE_CODE_AUDIT_OUTPUT.md << 'EOF'
# DIAG-041 — Comprehensive Code Audit Output

**Date:** $(date -u +%Y-%m-%dT%H:%M:%SZ)
**Branch:** $(git rev-parse --abbrev-ref HEAD)
**Base commit:** $(git rev-parse HEAD)
**Probe scope:** HC contextualIdentity emission, convergence binding-selection, intent modifier execution, intent-transformer normalization, plan-interpreter cap emission

CC pastes verbatim evidence at every section. No interpretation. No PASS/FAIL. Architect dispositions in architect channel.

EOF
```

Commit (this is the only commit required during the probe; the output file appends as it grows):

```bash
git add docs/diagnostics/DIAG-041_COMPREHENSIVE_CODE_AUDIT_OUTPUT.md
git commit -m "DIAG-041 Phase 0: orientation + output file scaffold"
git push
```

---

## Phase 1 — HC contextualIdentity emission

### 1.1 Locate the emission surface

```bash
# String-literal emission sites for contextualIdentity values
grep -rn "'person_identifier'\|'location_code'\|'currency_amount'\|'percentage'\|'count'\|'date'\|'reference_key'\|'attribute'" \
  web/src/lib/sci/ web/src/lib/intelligence/ \
  --include="*.ts" 2>&1 | head -80
```

Append output verbatim to the DIAG file under header `## Phase 1.1 — contextualIdentity string-literal emission sites`.

```bash
# Function names that mention contextualIdentity
grep -rn "contextualIdentity" web/src/lib/sci/ web/src/lib/intelligence/ \
  --include="*.ts" 2>&1 | head -100
```

Append verbatim under `## Phase 1.2 — contextualIdentity references across SCI and intelligence`.

```bash
# Likely files based on substrate references
ls -la web/src/lib/sci/header-comprehension/ 2>&1
ls -la web/src/lib/sci/agents/ 2>&1
ls -la web/src/lib/sci/field-identity/ 2>&1
ls -la web/src/lib/sci/ 2>&1 | head -40
```

Append verbatim under `## Phase 1.3 — SCI directory inventory`.

### 1.4 Read the emission function(s) end-to-end

For each file surfaced by Phase 1.1-1.3 that appears to contain contextualIdentity assignment logic (heuristic patterns, switch statements, or LLM prompt construction):

```bash
# Identify line ranges. For each candidate file:
grep -n "contextualIdentity\|function\|export" web/src/lib/sci/<candidate-file>.ts | head -40
```

Then read each function body verbatim. For each function identified, paste:

```bash
sed -n '<start-line>,<end-line>p' web/src/lib/sci/<candidate-file>.ts
```

Append verbatim under `## Phase 1.4 — contextualIdentity emission function bodies`, with one subsection per function: `### File: <path> | Function: <name> | Lines: <range>`.

### 1.5 If the emission is LLM-driven, find the prompt

```bash
# Look for prompt construction that asks LLM to classify columns
grep -rn "person_identifier\|location_code" web/src/lib/sci/ web/src/lib/ai/ \
  --include="*.ts" -B2 -A5 2>&1 | head -120
```

```bash
# Look for the schema/format spec sent to the LLM
grep -rn "contextualIdentity\|structuralType" web/src/lib/sci/ \
  --include="*.ts" -B2 -A10 2>&1 | head -150
```

Append verbatim under `## Phase 1.5 — LLM prompt construction for contextualIdentity (if applicable)`.

### 1.6 Upstream — what feeds the emission decision

For the emission function identified in Phase 1.4, identify its CALLER:

```bash
grep -rn "<emission-function-name>" web/src/ --include="*.ts" 2>&1 | head -40
```

Read the caller verbatim — what inputs does it pass to the emission function? Column name only? Column profile? Sheet context? Value distribution?

Append verbatim under `## Phase 1.6 — Upstream callers of contextualIdentity emission`.

### 1.7 Downstream — what consumes the emission output

```bash
# Where the contextualIdentity value is read downstream
grep -rn "field_identity.contextualIdentity\|fieldIdentity.contextualIdentity\|\.contextualIdentity" \
  web/src/ --include="*.ts" 2>&1 | head -50
```

Append verbatim under `## Phase 1.7 — Downstream consumers of contextualIdentity`.

### 1.8 Halt check

If Phase 1.4 finds zero emission functions (i.e., contextualIdentity is never assigned in the codebase but does appear in stored data), **HALT** and surface verbatim. The emission source may be external (e.g., older SCI agent code path, flywheel cache replay). Architect dispositions.

If Phase 1.5 finds an LLM prompt that asks the LLM for free-form text mapped to contextualIdentity values, paste the schema or normalization function that maps the LLM output to the canonical contextualIdentity literals.

Commit:

```bash
git add docs/diagnostics/DIAG-041_COMPREHENSIVE_CODE_AUDIT_OUTPUT.md
git commit -m "DIAG-041 Phase 1: HC contextualIdentity emission evidence"
git push
```

---

## Phase 2 — Convergence binding-selection logic

### 2.1 Locate the binding-selection function

```bash
# convergence-service.ts surface
wc -l web/src/lib/intelligence/convergence-service.ts 2>&1
grep -n "entity_identifier\|generateAllComponentBindings\|generateBindings\|selectEntityIdentifier\|findIdentifierColumn" \
  web/src/lib/intelligence/convergence-service.ts 2>&1 | head -30
```

Append verbatim under `## Phase 2.1 — Convergence binding-selection function inventory`.

### 2.2 Read the binding-selection function(s) end-to-end

For the function(s) that assign `entity_identifier.column` (per DIAG-039 E2.4, the binding shape is `convergence_bindings.{component_N}.entity_identifier.column = "<column-name>"`):

```bash
# Use the line ranges identified in 2.1 to read each function verbatim
sed -n '<start-line>,<end-line>p' web/src/lib/intelligence/convergence-service.ts
```

Append verbatim under `## Phase 2.2 — Binding-selection function bodies`, one subsection per function.

### 2.3 Verify the selection criteria

In each binding-selection function body, identify what criteria are used to pick the entity_identifier column:

- Column name string matching? (Korean Test violating — flag)
- HC `contextualIdentity === 'person_identifier'`? (the load-bearing path; this is what picks `Hub` for Meridian)
- Structural cardinality (uniqueness ratio)? (per BCL substrate — `ID_Empleado` 100% uniqueness, `Cantidad_Productos_Cruzados` 12%)
- Value-set intersection with tenant entities? (the missing check — the hypothesized HF-218 fix)
- Other?

CC does NOT interpret. CC paraphrases the conditional logic verbatim from code: "Line X checks `<exact code>`. Line Y checks `<exact code>`."

Append verbatim under `## Phase 2.3 — Selection criteria as written in code`.

### 2.4 Upstream — what feeds binding selection

```bash
# Who calls the binding-selection function
grep -rn "generateAllComponentBindings\|<binding-selection-function-name>" web/src/ --include="*.ts" 2>&1 | head -30
```

What inputs does the caller pass — column profiles, HC field identities, plan calculationIntent shape, tenant entities?

```bash
# Specifically — does any caller pass tenant entities table contents or external_id set?
grep -rn "entities.*external_id\|external_id.*entities\|tenant.entities\|registeredEntities" \
  web/src/lib/intelligence/ web/src/app/api/ --include="*.ts" 2>&1 | head -30
```

Append verbatim under `## Phase 2.4 — Upstream inputs to binding selection`.

### 2.5 Downstream — what consumes the binding

```bash
# Where convergence_bindings.entity_identifier.column is read at calculation time
grep -rn "entity_identifier.column\|entityIdentifier.column\|compBindings.entity_identifier" \
  web/src/ --include="*.ts" 2>&1 | head -40
```

Append verbatim under `## Phase 2.5 — Downstream consumers of entity_identifier binding`.

Per DIAG-039 E1.2.c, `dataByBatch` is built using this column as the indexing key. Locate that line:

```bash
grep -n "dataByBatch\|entity_identifier" web/src/app/api/calculation/run/route.ts 2>&1 | head -30
```

Read the relevant range:

```bash
sed -n '<start-line>,<end-line>p' web/src/app/api/calculation/run/route.ts
```

Append verbatim under `## Phase 2.6 — dataByBatch indexing using entity_identifier.column`.

### 2.7 Self-verification check

Search for ANY existing code path that validates the candidate entity_identifier column against tenant entities:

```bash
grep -rn "external_id.*intersect\|values.*match.*entity\|verifyBinding\|validateBinding\|outcome.*validation" \
  web/src/ --include="*.ts" 2>&1 | head -30
```

If this returns zero results, the self-verification gap is structurally confirmed. If it returns hits, paste each verbatim and the surrounding function context.

Append verbatim under `## Phase 2.7 — Existing self-verification logic (if any)`.

Commit:

```bash
git add docs/diagnostics/DIAG-041_COMPREHENSIVE_CODE_AUDIT_OUTPUT.md
git commit -m "DIAG-041 Phase 2: convergence binding-selection evidence"
git push
```

---

## Phase 3 — Intent modifier execution (cap-slot mechanics)

### 3.1 Locate intent-executor and modifier application

```bash
# Find the intent-executor file (referenced by route.ts as 'executeIntent')
find web/src/lib/ -name "intent-executor*.ts" -o -name "intent-execution*.ts" 2>&1
grep -rn "applyModifiers\|executeIntent\|modifier.type" web/src/lib/ --include="*.ts" 2>&1 | head -40
```

Append verbatim under `## Phase 3.1 — Intent-executor file inventory`.

### 3.2 Read executeIntent end-to-end

```bash
# Identify the executeIntent function
grep -n "function executeIntent\|export function executeIntent\|const executeIntent" \
  web/src/lib/<intent-executor-path>.ts | head -10
```

Read the full function body verbatim:

```bash
sed -n '<start-line>,<end-line>p' web/src/lib/<intent-executor-path>.ts
```

Append verbatim under `## Phase 3.2 — executeIntent function body`.

### 3.3 Read applyModifiers (or equivalent) end-to-end

```bash
grep -n "applyModifiers\|function.*[Mm]odifier" web/src/lib/<intent-executor-path>.ts | head -10
```

```bash
sed -n '<start-line>,<end-line>p' web/src/lib/<intent-executor-path>.ts
```

Append verbatim under `## Phase 3.3 — applyModifiers function body`.

### 3.4 Cap modifier dispatch

Within applyModifiers, locate the branch that handles `modifier.type === 'cap'` (or `modifier.modifier === 'cap'` — DIAG-040 evidence showed `{"after":1.5,"before":304.82,"modifier":"cap"}` so the field is `modifier`):

Read the cap-dispatch branch verbatim. Append under `## Phase 3.4 — Cap modifier dispatch logic`.

### 3.5 Upstream — what passes modifiers to applyModifiers

```bash
# Where executeOperation completes and modifiers are applied
grep -n "applyModifiers\|executeOperation" web/src/lib/<intent-executor-path>.ts | head -20
```

Read the call site that sequences `executeOperation` → `applyModifiers`. Pay attention: is `applyModifiers` called against the executeOperation OUTPUT only, or are there code paths that apply modifiers to operation INPUTS?

Append verbatim under `## Phase 3.5 — Modifier application sequence (input vs outcome)`.

### 3.6 Search for any input-scoped modifier path

```bash
grep -rn "applyTo.*input\|applyTo.*outcome\|input.*modifier\|modifier.*input" \
  web/src/lib/ --include="*.ts" 2>&1 | head -30
```

If this returns zero results, modifier-scope is structurally fixed at outcome-only. The cap-slot fix at executor layer would be substrate-extending (adding new modifier-scope semantics).

Append verbatim under `## Phase 3.6 — Existing input-scoped modifier logic (if any)`.

### 3.7 Conditional gate / conditional operations primitives

```bash
grep -n "conditional_gate\|conditional.*operation\|min(\|Math.min" web/src/lib/<intent-executor-path>.ts 2>&1 | head -30
```

If a `conditional_gate` or `min` primitive exists, the cap-slot fix via intent-transformer normalization (rewriting `scalar_multiply{input: ratio, modifiers: [cap]}` to `scalar_multiply{input: cap_conditional(ratio)}`) becomes viable using existing primitives.

Read each verbatim. Append under `## Phase 3.7 — Existing conditional/min primitives`.

Commit:

```bash
git add docs/diagnostics/DIAG-041_COMPREHENSIVE_CODE_AUDIT_OUTPUT.md
git commit -m "DIAG-041 Phase 3: intent modifier execution evidence"
git push
```

---

## Phase 4 — Intent-transformer normalization surface

### 4.1 Locate the intent-transformer

```bash
find web/src/lib/ -name "intent-transformer*.ts" -o -name "intent-transformation*.ts" 2>&1
grep -rn "transformIntent\|normalizeIntent\|rewriteIntent" web/src/lib/ --include="*.ts" 2>&1 | head -30
```

Append verbatim under `## Phase 4.1 — Intent-transformer file inventory`.

### 4.2 Read the full transformer file

```bash
wc -l web/src/lib/<intent-transformer-path>.ts
cat web/src/lib/<intent-transformer-path>.ts
```

Append the ENTIRE file content verbatim under `## Phase 4.2 — Intent-transformer full file content`.

This is intentional — the transformer file is the substrate for HF-218 cap-slot normalization. Reading it whole prevents missing a relevant transformation.

### 4.3 Enumerate existing transformations

From the transformer file content, identify each transformation function or rule. For each:

- Name and line range
- Input intent shape (the pattern matched)
- Output intent shape (the rewritten shape)
- What triggers the rewrite (the condition)

Append verbatim under `## Phase 4.3 — Existing transformations enumerated`.

CC does not interpret. CC pastes the conditional logic and the rewrite logic verbatim. The architect reads and disposes whether cap-slot fits the existing pattern.

### 4.4 Upstream — what calls the transformer

```bash
grep -rn "transformIntent\|normalizeIntent\|<transformer-function-name>" web/src/ --include="*.ts" 2>&1 | head -30
```

Read the call site verbatim. Is the transformer called at calculation time (per calc) or at binding-write time (once per rule_set update)?

Append verbatim under `## Phase 4.4 — Transformer call site`.

### 4.5 Downstream — what consumes transformed intent

The intent-executor (Phase 3) consumes the transformed intent. Confirm:

```bash
grep -n "intent\|calculationIntent" web/src/lib/<intent-executor-path>.ts 2>&1 | head -20
```

Append verbatim under `## Phase 4.5 — Transformer output consumption`.

Commit:

```bash
git add docs/diagnostics/DIAG-041_COMPREHENSIVE_CODE_AUDIT_OUTPUT.md
git commit -m "DIAG-041 Phase 4: intent-transformer normalization surface evidence"
git push
```

---

## Phase 5 — Plan-interpreter cap modifier emission

### 5.1 Locate the AI plan interpreter

```bash
find web/src/lib/ -name "ai-plan-interpreter*" -o -name "plan-interpretation*" -o -name "interpretPlan*" 2>&1
ls -la web/src/lib/compensation/ 2>&1 | head -20
ls -la web/src/lib/sci/plan-interpretation/ 2>&1 | head -20
```

Append verbatim under `## Phase 5.1 — Plan-interpreter file inventory`.

### 5.2 Locate cap modifier emission

```bash
# Where the modifiers array is constructed for a component intent
grep -rn "modifier.*cap\|'cap'\|\"cap\"\|maxValue" \
  web/src/lib/compensation/ web/src/lib/sci/plan-interpretation/ \
  --include="*.ts" 2>&1 | head -50
```

Append verbatim under `## Phase 5.2 — Cap modifier emission sites`.

### 5.3 Read the emission function and the LLM prompt (if applicable)

For each emission site identified in 5.2:

```bash
# Identify function containing the emission
grep -n "function\|export\|=>.*{$" web/src/lib/<plan-interpreter-path>.ts | head -40
sed -n '<start-line>,<end-line>p' web/src/lib/<plan-interpreter-path>.ts
```

Append verbatim under `## Phase 5.3 — Cap emission function bodies`.

If the cap value comes from an LLM call, locate the prompt:

```bash
grep -rn "calculationIntent\|modifiers\|cap" \
  web/src/lib/ai/ web/src/lib/sci/plan-interpretation/ \
  --include="*.ts" -B2 -A10 2>&1 | head -150
```

Append verbatim under `## Phase 5.4 — LLM prompt construction for cap emission (if applicable)`.

### 5.5 Schema for emitted intent shape

Find the type definition that specifies what shape `calculationIntent.modifiers` must conform to:

```bash
grep -rn "interface.*Modifier\|type.*Modifier\|IntentModifier" \
  web/src/lib/ --include="*.ts" 2>&1 | head -30
```

Read the type definition verbatim. Append under `## Phase 5.5 — IntentModifier type definition`.

This decides: can a modifier currently have an `applyTo` field (input vs outcome), or is the type structurally outcome-only?

Commit:

```bash
git add docs/diagnostics/DIAG-041_COMPREHENSIVE_CODE_AUDIT_OUTPUT.md
git commit -m "DIAG-041 Phase 5: plan-interpreter cap emission evidence"
git push
```

---

## Phase 6 — Cross-surface integration questions

These five surfaces interact. The DIAG-041 output file appends a final section that surfaces the integration points — verbatim, no interpretation.

### 6.1 The HC → Convergence pipeline

```bash
# Where HC output becomes input to convergence
grep -rn "field_identities\|field_identity" web/src/lib/intelligence/convergence-service.ts 2>&1 | head -30
```

Read the relevant range. Does convergence consume `contextualIdentity` as authoritative, or does it have parallel structural heuristics?

Append under `## Phase 6.1 — HC-to-convergence pipeline`.

### 6.2 The Convergence → Engine pipeline

Per DIAG-039 E1.2.c, the engine reads `convergence_bindings` from `rule_sets.input_bindings`. Confirm:

```bash
grep -n "input_bindings\|convergence_bindings" web/src/app/api/calculation/run/route.ts 2>&1 | head -20
```

Append under `## Phase 6.2 — Convergence-to-engine pipeline`.

### 6.3 The Plan-Interpreter → Intent-Transformer → Executor pipeline

```bash
# Where rule_sets.components is written (plan interpreter output)
grep -rn "rule_sets.*components\|components.*rule_sets\|update.*rule_sets" \
  web/src/lib/ --include="*.ts" 2>&1 | head -20
```

```bash
# Where rule_sets.components is read at calc time
grep -rn "components.*calculationIntent\|component.calculationIntent" \
  web/src/app/api/calculation/ --include="*.ts" 2>&1 | head -20
```

Append under `## Phase 6.3 — Plan-interpreter to executor pipeline`.

### 6.4 The fingerprint flywheel — caching of HC and convergence decisions

```bash
# Find where HC results or convergence bindings are cached by fingerprint
grep -rn "fingerprint\|Tier 1\|cached.*binding\|flywheel" \
  web/src/lib/ --include="*.ts" 2>&1 | head -50
```

Read the relevant cache write and read sites verbatim. The architectural question: when a binding is cached by fingerprint, does a re-classification (HF-218 self-verification rejecting the cached value) propagate back to the fingerprint cache, or does the cache replay the wrong binding on every Tier 1 match?

Append under `## Phase 6.4 — Fingerprint flywheel cache interaction`.

### 6.5 Korean Test scan

Across all five surfaces, search for field-name string literals or language-specific patterns:

```bash
grep -rn "['\"]No_Empleado['\"]\|['\"]Hub['\"]\|['\"]Cumplimiento['\"]\|['\"]ID_Empleado['\"]" \
  web/src/lib/sci/ web/src/lib/intelligence/ web/src/lib/compensation/ \
  --include="*.ts" 2>&1 | head -30
```

```bash
grep -rn "/employee/i\|/empleado/i\|/hub/i" web/src/lib/ --include="*.ts" 2>&1 | head -20
```

Any hit is a Korean Test violation candidate. Append under `## Phase 6.5 — Korean Test scan`.

Commit:

```bash
git add docs/diagnostics/DIAG-041_COMPREHENSIVE_CODE_AUDIT_OUTPUT.md
git commit -m "DIAG-041 Phase 6: cross-surface integration evidence"
git push
```

---

## Phase 7 — Final state and surface to architect

CC pastes a final section summarizing structural facts (not interpretations):

```markdown
## Phase 7 — DIAG-041 Final State

**File path:** docs/diagnostics/DIAG-041_COMPREHENSIVE_CODE_AUDIT_OUTPUT.md
**Total lines:** <wc -l output>
**Sections completed:** Phases 0 through 6
**Halts encountered:** <list any HALT points; if none, state "none">

**Surfaces probed:**
1. HC contextualIdentity emission — <number of functions surfaced>
2. Convergence binding-selection — <number of functions surfaced>
3. Intent modifier execution — <number of functions surfaced>
4. Intent-transformer normalization — <number of transformations enumerated>
5. Plan-interpreter cap emission — <number of emission sites surfaced>

**Korean Test scan result:** <number of hits>

**Awaiting architect disposition.** No further action by CC.
```

Final commit:

```bash
git add docs/diagnostics/DIAG-041_COMPREHENSIVE_CODE_AUDIT_OUTPUT.md
git commit -m "DIAG-041 Phase 7: final state summary"
git push
```

CC reports back with:
1. The output file path
2. Final line count
3. The list of halt points (if any)
4. Confirmation that all 7 phases committed and pushed

CC does NOT create a PR for this DIAG. The DIAG output lives on dev; the architect reads and dispositions before drafting HF-218.

---

## Halt conditions

CC halts and surfaces verbatim if:

- Phase 1.4: Zero contextualIdentity emission functions found in the codebase. (Possible: emission is external — flywheel cache replay only.)
- Phase 2.7: An existing self-verification function is found that should reject `Hub` but isn't firing. (Indicates a different defect class — wiring, not absence.)
- Phase 3.6: An existing input-scoped modifier path is found. (Cap-slot fix may be simpler than expected — surface and disposition.)
- Phase 4.2: The intent-transformer file does not exist or is empty. (Substrate gap — HF-218 cap-slot fix requires creating the surface, not just using it.)
- Phase 5.5: The IntentModifier type already has an `applyTo` field. (Cap-slot fix is config-only, not code.)
- Any phase: A locked rule (SR, decision, governance entry) is encountered that dictates a halt. Surface verbatim per SR-42.
- Any phase: `grep` or `sed` returns an error other than zero-results. (Filesystem state issue — surface.)

On halt: paste the exact finding, name the trigger, halt. Do not retry, do not modify scope, do not invent alternate paths.

---

## What this DIAG enables

Once DIAG-041 output is in hand, the architect can disposition HF-218 scope with code-grounded evidence on:

1. **Whether HC contextualIdentity fix is a heuristic edit, prompt edit, or substrate-extending.** Decides if it absorbs into HF-218 or ships as HF-219.
2. **Whether convergence self-verification is an additive 30-50 line check or requires re-architecting binding selection.** Decides HF-218 scope size.
3. **Whether modifier execution is fixable at intent-transformer (cleaner) or requires executor extension (broader).** Decides HF-218 cap-slot architectural shape.
4. **Whether the intent-transformer surface admits a cap-slot transformation in the existing pattern.** Decides if cap-slot is a small addition or a new surface.
5. **Whether plan-interpreter cap emission is a prompt fix, a rule fix, or a Decision-153 deferral.** Decides whether HF-218 amends the plan interpreter or relies on transformer normalization.

Each of these is a scope-bounded architectural decision. None can be made from inference. All are made from code.

---

## File inventory

**Files CC creates this DIAG:**

- `docs/diagnostics/DIAG-041_COMPREHENSIVE_CODE_AUDIT_OUTPUT.md` — single consolidated file

**Files CC modifies this DIAG:**

- None

**Files CC reads (verbatim paste required):**

- `CC_STANDING_ARCHITECTURE_RULES.md`
- `docs/diagnostics/DIAG-039_consolidated.md` (orientation only, no paste)
- `web/src/lib/sci/**/*.ts` (HC, agents, field-identity surfaces)
- `web/src/lib/intelligence/convergence-service.ts`
- `web/src/lib/<intent-executor-path>.ts`
- `web/src/lib/<intent-transformer-path>.ts`
- `web/src/lib/<plan-interpreter-path>.ts` (e.g., `web/src/lib/compensation/ai-plan-interpreter.ts`)
- `web/src/app/api/calculation/run/route.ts` (relevant ranges only)

CC does not modify any of these. CC pastes verbatim into the DIAG output file.

---

**End of DIAG-041 directive.**
