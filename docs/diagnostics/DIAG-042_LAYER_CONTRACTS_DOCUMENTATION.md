# DIAG-042 — Convergence and Comprehension Layer Contracts: Operative-State Documentation

**Type:** Layer-contract documentation diagnostic (read-only, no modification)
**Predecessors:** DIAG-039 (calculation path code), DIAG-040 (post-HF-216 traces), DIAG-041 (HC/convergence/transformer/executor code surfaces)
**Purpose:** Surface and document the **current operative contracts** between HC, convergence, the engine, and the flywheel. Read-only. Documents what IS, not what should be. Forward design proposals (changes, additions, contract strengthening) are explicitly OUT OF SCOPE — those route through IRA invocation per Decision 153 governance.
**Output:** Single consolidated file at `docs/diagnostics/DIAG-042_LAYER_CONTRACTS_DOCUMENTATION_OUTPUT.md`

---

## Architect-channel framing (read before CC dispatch)

DIAG-042 exists because three months of HF cycles across BCL, CRP, and Meridian have surfaced the same defect class repeatedly (convergence binding-selection wrong column → engine silent fallback → wrong payouts). Each HF closed a slice. None closed the class. The substrate-extending question that emerged: **what are the operative contracts between the layers?** What does each layer assume about its inputs? What does each layer guarantee about its outputs? Where are signals emitted vs consumed? Where is the flywheel wired and where is it not?

These questions are documentation gaps, not design gaps. The code exists (DIAG-041 read it verbatim). What's missing is the explicit specification of what the code IS DOING as a system — the contracts, the assumptions, the silent fall-throughs, the unwired signals. DIAG-042 surfaces that.

**DIAG-042 is documentation, not design.** It produces a structured artifact that names operative reality at the contract level. Any subsequent design proposal — changes to contracts, additions of new signals, modifications of flywheel wiring — operates on DIAG-042's evidence via IRA invocation. DIAG-042 itself proposes nothing.

**Substrate citations governing this DIAG:**
- Decision 64 — Three-level signal architecture (Classification, Comprehension, Convergence)
- Decision 108 — HC primacy
- Decision 111 — convergence_bindings as primary storage
- Decision 123 — Compliance emerges from architecture
- Decision 124 — Research-derived design
- Decision 153 — Plan-intelligence-forward (IRA governs design)
- Section A Principle 1 — AI-first, never hardcoded
- Section A Principle 5 — Closed-loop learning (the flywheel principle, named by architect as critical moat)
- Section A Principle 7 — Prove, don't describe

**Reconciliation-channel separation:** DIAG-042 produces no calculated values. No GT comparisons. No PASS/FAIL on layer behavior. CC documents operative reality verbatim; architect reads and dispositions any subsequent design work via IRA.

---

## Standing rules (read first)

Read `CC_STANDING_ARCHITECTURE_RULES.md` in full. Specifically applicable here:

- **Section A Principle 1** — AI-first; no hardcoded patterns. DIAG-042 documents whether each layer respects this.
- **Section A Principle 5** — Closed-Loop Learning. The flywheel principle. DIAG-042 documents where this principle is structurally instantiated vs where it's aspirational.
- **Section A Principle 7** — Prove, don't describe. DIAG-042 pastes operative evidence; does not describe intended behavior.
- **Section A Principle 8** — Domain-agnostic always. DIAG-042 documents contracts in domain-agnostic terms.
- **Section 0 (v3.0) GP-1** — Compliance is architecture. DIAG-042 names where contracts are structurally enforced vs procedurally documented.
- **Section 0 (v3.0) GP-2** — Research-derived design. N/A for documentation diagnostic, but contract documentation must permit future research-derived evaluation.
- **G1-G6 evaluation framework** — DIAG-042's findings will feed forward-design IRA invocations; G1-G6 evaluation applies to those invocations, not to this diagnostic itself.
- **SR-34** — No bypass. Documentation surfaces operative reality; does not propose bypasses.
- **SR-42** — Locked-rule halt. If any probe encounters a locked decision that dictates halt, surface verbatim and stop.
- **SR-44** — Architect verifies production. N/A here (read-only documentation).
- **Rule 29** — CC paste block last; nothing after.
- **Output discipline** — single consolidated file at `docs/diagnostics/DIAG-042_LAYER_CONTRACTS_DOCUMENTATION_OUTPUT.md`. No subdirectories. No separate files.
- **Capability routing** — CC reads code via grep/cat/sed; reads schema via service-role tsx-script SELECT if needed. No DDL, no DML.

---

## What DIAG-042 does NOT do

- Does NOT modify any code
- Does NOT run any calculation
- Does NOT modify any database row or schema
- Does NOT propose contract changes
- Does NOT propose new signals
- Does NOT propose flywheel wiring additions
- Does NOT compare against ground truth
- Does NOT state PASS / FAIL
- Does NOT create a PR
- Does NOT interpret findings beyond what's structurally evident from code

CC executes the probe, surfaces contract documentation verbatim, halts. Architect reads and dispositions any design work via IRA invocation per Decision 153.

---

## Phase 0 — Pre-probe orientation

CC reads, in order:

1. `CC_STANDING_ARCHITECTURE_RULES.md` — full
2. DIAG-041 output file at `docs/diagnostics/DIAG-041_COMPREHENSIVE_CODE_AUDIT_OUTPUT.md` — orientation only; do not re-paste content
3. `INF_GOVERNANCE_INDEX_20260406.md` and `INF_DECISION_REGISTRY_20260406.md` — for Decision 64, 108, 111, 123, 124, 153 verbatim references
4. `Decision_153_LOCKED_20260420.md` — for IRA-governed design boundary

CC creates the output file with header:

```bash
mkdir -p docs/diagnostics
cat > docs/diagnostics/DIAG-042_LAYER_CONTRACTS_DOCUMENTATION_OUTPUT.md << 'EOF'
# DIAG-042 — Convergence and Comprehension Layer Contracts: Operative-State Documentation

**Date:** $(date -u +%Y-%m-%dT%H:%M:%SZ)
**Branch:** $(git rev-parse --abbrev-ref HEAD)
**Base commit:** $(git rev-parse HEAD)
**Predecessors:** DIAG-039, DIAG-040, DIAG-041
**Probe scope:** Layer contracts (HC, convergence, engine), flywheel wiring (signal emission and consumption), cold-start vs steady-state operative behaviors, order-independence operative guarantees, open/closed-set operative reality.

CC pastes verbatim evidence at every section. No interpretation beyond what is structurally evident from code. No PASS/FAIL. No design proposals. Architect routes forward-design work via IRA invocation per Decision 153.

EOF
```

Commit:

```bash
git add docs/diagnostics/DIAG-042_LAYER_CONTRACTS_DOCUMENTATION_OUTPUT.md
git commit -m "DIAG-042 Phase 0: orientation + output file scaffold"
git push
```

---

## Phase 1 — Section 1: HC Layer Contract (operative documentation)

### 1.1 What HC consumes (operative inputs)

CC documents, with verbatim code paste, the actual inputs to HC at runtime.

```bash
# Find the HC entry point function
grep -n "function.*[Hh]eader[Cc]omprehension\|export function comprehend\|export async function comprehend\|function buildComprehension\|function extractHeaderComprehension" \
  web/src/lib/sci/header-comprehension.ts | head -20
```

Identify HC's primary entry function. Read its signature verbatim. Paste the function signature and the first 30 lines of the function body.

```bash
# Find what's passed to HC at the call site
grep -rn "comprehend\|headerComprehension\|extractFieldIdentities" web/src/lib/sci/ web/src/app/api/import/sci/ --include="*.ts" 2>&1 | head -30
```

Read each call site verbatim — what arguments does the caller pass?

Append under `## Section 1.1 — HC operative inputs`.

### 1.2 What HC produces (operative outputs)

CC documents the output structure HC produces.

```bash
# Type definitions for HC output
grep -rn "type HeaderComprehension\|interface HeaderComprehension\|type FieldIdentity\|interface FieldIdentity" \
  web/src/lib/sci/ --include="*.ts" 2>&1 | head -20
```

Read each type definition verbatim. Paste full type body.

Also document the persistence format:

```bash
# Where HC output is written
grep -rn "metadata.field_identities\|metadata\\['field_identities'\\]\|field_identities:" \
  web/src/lib/sci/ web/src/app/api/import/sci/ --include="*.ts" 2>&1 | head -20
```

Paste each write site verbatim.

Append under `## Section 1.2 — HC operative outputs`.

### 1.3 The contextualIdentity value-set (operative reality)

Per DIAG-041 Phase 1.1, contextualIdentity is dual-path:
- **LLM-driven (primary):** `semanticMeaning` is free-form string from LLM
- **Bindings-derived (fallback):** ROLE_MAP at `field-identities.ts:20-37` maps semantic_role → contextualIdentity literal

CC documents both paths verbatim:

```bash
# The ROLE_MAP fallback set (closed)
sed -n '17,46p' web/src/lib/sci/field-identities.ts
```

```bash
# The LLM prompt (free-form)
sed -n '795,832p' web/src/lib/ai/providers/anthropic-adapter.ts
```

Document:
- Closed-set vocabulary (ROLE_MAP) — what values are mapped, what semantic_role keys produce them
- Open-set vocabulary (LLM prompt) — what examples are given, what enum constraints exist (or don't)
- Reconciliation: at runtime, when does the closed set apply vs the open set?

```bash
# The fallback chain code
sed -n '380,407p' web/src/lib/sci/header-comprehension.ts
grep -n "extractFieldIdentitiesFromTrace || buildFieldIdentitiesFromBindings\|extractFieldIdentitiesFromTrace ||" \
  web/src/app/api/import/sci/execute/route.ts | head -10
sed -n '580,592p' web/src/app/api/import/sci/execute/route.ts
```

Document the `||` short-circuit: when LLM trace yields null, ROLE_MAP fallback fires. Paste the chain.

Append under `## Section 1.3 — contextualIdentity operative value-set (open vs closed)`.

### 1.4 The "unknown" emission (operative cases)

```bash
grep -n "'unknown'\|\"unknown\"" web/src/lib/sci/header-comprehension.ts web/src/lib/sci/field-identities.ts | head -20
```

Document every code path that emits `contextualIdentity: 'unknown'`. Paste the conditions verbatim. For each path, document what downstream consumer (per DIAG-041 Phase 1.7) does when it reads `unknown`.

Append under `## Section 1.4 — HC 'unknown' emission paths and downstream handling`.

### 1.5 HC contract summary (operative documentation)

CC writes a structured summary, prose only, no interpretation:

```markdown
HC operative inputs: <list verbatim from 1.1>
HC operative outputs: <list verbatim from 1.2>
contextualIdentity open-set: <yes/no, with code citation>
contextualIdentity closed-set: <yes/no, with code citation>
'unknown' emission cases: <enumeration from 1.4>
'unknown' downstream handling: <enumeration from 1.4>
```

This summary is descriptive of what the code does, not what it should do.

Append under `## Section 1.5 — HC contract operative summary`.

Commit:

```bash
git add docs/diagnostics/DIAG-042_LAYER_CONTRACTS_DOCUMENTATION_OUTPUT.md
git commit -m "DIAG-042 Phase 1: HC layer contract operative documentation"
git push
```

---

## Phase 2 — Section 2: Convergence Layer Contract (operative documentation)

### 2.1 What convergence consumes (operative inputs)

```bash
# convergeBindings function signature
grep -n "export async function convergeBindings\|export function convergeBindings" \
  web/src/lib/intelligence/convergence-service.ts | head -5
sed -n '<line>,<line+50>p' web/src/lib/intelligence/convergence-service.ts
```

Paste the function signature and the first 50 lines of the body — identify every input parameter and what it represents.

```bash
# All call sites
grep -rn "convergeBindings" web/src/ --include="*.ts" 2>&1 | head -20
```

Document what each caller passes.

Per DIAG-041 Phase 2.4: convergence currently does NOT receive `tenant entities external_id` set as input. Document this operative reality verbatim:

```bash
grep -n "tenant.entities\|tenantEntityExternalIds\|registeredEntities\|external_id" \
  web/src/lib/intelligence/convergence-service.ts | head -20
```

Append under `## Section 2.1 — Convergence operative inputs`.

### 2.2 What convergence produces (operative outputs)

```bash
# ComponentBinding type
grep -n "export interface ComponentBinding\|interface ComponentBinding\|type ComponentBinding" \
  web/src/lib/intelligence/convergence-service.ts | head -5
sed -n '<line>,<line+30>p' web/src/lib/intelligence/convergence-service.ts

# ConvergenceResult type
grep -n "export interface ConvergenceResult\|interface ConvergenceResult" \
  web/src/lib/intelligence/convergence-service.ts | head -5
sed -n '<line>,<line+30>p' web/src/lib/intelligence/convergence-service.ts

# ConvergenceGap type
grep -n "export interface ConvergenceGap\|interface ConvergenceGap" \
  web/src/lib/intelligence/convergence-service.ts | head -5
sed -n '<line>,<line+30>p' web/src/lib/intelligence/convergence-service.ts
```

Paste each type verbatim. Document where each is persisted (per DIAG-041 Phase 6.2).

Append under `## Section 2.2 — Convergence operative outputs`.

### 2.3 Operative invariants — what convergence currently enforces

CC documents, with verbatim code paste, every check convergence performs before writing a binding:

```bash
# Identify all if/throw/reject/return null sites in generateAllComponentBindings
sed -n '1796,1974p' web/src/lib/intelligence/convergence-service.ts | grep -nE "if|return null|throw|reject"
```

For each check found, document:
- The condition tested (verbatim)
- The action on failure (verbatim — return, throw, fallback, log, etc.)
- Whether the failure surfaces to a gap, a signal, or is silent

Specifically document:
- **entity_identifier selection (line 1942)** — what is currently checked vs not checked (per DIAG-041 Phase 2.3)
- **Boundary range validation (line 539)** — `boundaryScore > 0.1` threshold
- **Boundary fallback threshold (line 556)** — `BOUNDARY_FALLBACK_MIN_SCORE = 0.50`
- **Column exclusion (line 549)** — `boundColumns.add(proposedColumnName)` ensures no two requirements bind same column
- **AI validation gate (line 545)** — `match_pass: isValidated ? 1 : 2`

Paste each check verbatim. Document what happens on each failure path.

Append under `## Section 2.3 — Convergence operative invariants`.

### 2.4 Operative behavior when invariants fail

```bash
# The gap creation path
grep -n "ConvergenceGap\|gaps.push\|gaps:" web/src/lib/intelligence/convergence-service.ts | head -20
sed -n '<line-of-gap-creation>,<+15>p' web/src/lib/intelligence/convergence-service.ts
```

Document: when convergence cannot produce a binding for a requirement, does it:
- (a) Throw / abort the whole convergence run
- (b) Skip the requirement and proceed with partial bindings
- (c) Record a gap and proceed
- (d) Silently fall through to default behavior
- (e) Some combination

Cite the code path verbatim. Per DIAG-041 Phase 2: per current code, gaps are recorded via `OB-185 Pass 4 gaps`. Document the gap consumer surface — what (if anything) downstream reads gaps?

```bash
grep -rn "ConvergenceGap\|convergence.*gap\|gaps:" web/src/ --include="*.ts" 2>&1 | head -20
```

Paste verbatim.

Append under `## Section 2.4 — Convergence operative gap-handling`.

### 2.5 Convergence contract summary (operative documentation)

Structured summary, prose only:

```markdown
Convergence operative inputs: <list>
Convergence operative outputs: <list>
Invariants currently enforced: <list>
Invariants NOT currently enforced (gaps surfaced by DIAG-041): <list>
Failure handling when invariants violated: <verbatim behavior>
Gap consumer surfaces (operative): <list>
```

Append under `## Section 2.5 — Convergence contract operative summary`.

Commit:

```bash
git add docs/diagnostics/DIAG-042_LAYER_CONTRACTS_DOCUMENTATION_OUTPUT.md
git commit -m "DIAG-042 Phase 2: Convergence layer contract operative documentation"
git push
```

---

## Phase 3 — Section 3: Engine Consumption Contract (operative documentation)

### 3.1 What the engine consumes (operative inputs)

Per DIAG-039 E1.2 and DIAG-041 Phase 6.2: the engine consumes `convergenceBindings` from `rule_sets.input_bindings`. CC documents the actual consumption surface.

```bash
# Engine entry — POST handler
grep -n "export async function POST\|export const POST" web/src/app/api/calculation/run/route.ts | head -5
# convergenceBindings read site
grep -n "convergenceBindings\|input_bindings" web/src/app/api/calculation/run/route.ts | head -20
sed -n '<convergenceBindings-read-line>,<+30>p' web/src/app/api/calculation/run/route.ts
```

Paste verbatim. Document the engine's input shape and source.

```bash
# What else the engine reads — committed_data, periods, entities, etc.
grep -n "from('committed_data')\|from('periods')\|from('entities')\|from('rule_sets')" \
  web/src/app/api/calculation/run/route.ts | head -20
```

Paste each query verbatim. Document the full set of engine inputs.

Append under `## Section 3.1 — Engine operative inputs`.

### 3.2 Engine operative assumptions

CC documents, with code citations, every implicit assumption the engine currently makes about its inputs.

For each of: `convergenceBindings`, `committed_data` rows, `entities`, `periods`:

- Does the engine check non-null before use?
- Does the engine check completeness (e.g., all expected components present)?
- Does the engine check structural validity (e.g., binding.column exists, batch is reachable)?
- Does the engine handle missing entities (e.g., entity_id_field column value not in any registered entity)?

For each check, paste code verbatim. For each NON-check (silent assumption), name it and paste the surrounding code that would have been the check site.

Specifically document, per DIAG-041 Phase 6.2 and DIAG-039 E1.2.d:

- The `usedConvergenceBindings` boolean and its flip site
- The fallback path when convergence binding resolution returns null (the silent fall-through to `buildMetricsForComponent` + `applyMetricDerivations`)
- The OB-118 merge guard at `(!(key in metrics))` — what assumption does it encode

Paste verbatim.

Append under `## Section 3.2 — Engine operative assumptions (checked vs unchecked)`.

### 3.3 Engine operative signal emission

Per DIAG-039 E1.2.d: the engine already emits `[CalcRecon-T1]`, `[CalcRecon-T2]`, `[CalcRecon-T3]` log lines for various conditions. CC documents the operative signal emission surface:

```bash
grep -n "CalcRecon-T1\|CalcRecon-T2\|CalcRecon-T3\|EXCEPTION\|classification_signal" \
  web/src/app/api/calculation/run/route.ts | head -40
```

For each emit site:
- The trigger condition (verbatim from code)
- The emit format (verbatim)
- Whether the emit writes to `classification_signals` table (structural learning loop) or only to logs (procedural observation)

Cross-reference: does the engine emit a signal when `usedConvergenceBindings` flips false? Per DIAG-041 — no. Document this operative reality.

```bash
# Where classification_signals is written from the engine
grep -n "classification_signals\|insertSignal\|writeSignal" \
  web/src/app/api/calculation/run/route.ts | head -20
```

Paste verbatim or document zero matches.

Append under `## Section 3.3 — Engine operative signal emission`.

### 3.4 Operative bright line — engine refusal vs engine produces result

Per Section 3 of the architect's DIAG-042 specification: "the bright line between 'valid binding but data anomaly' (engine produces result, emits validation finding) vs 'invalid binding' (engine refuses to calculate, emits structural exception)."

CC documents whether this bright line currently exists in the engine:

- Find all paths where the engine returns 0 / null / skips an entity
- Find all paths where the engine returns an error / throws / refuses to proceed
- Document which is which

```bash
grep -n "throw new\|return NextResponse\|return Response\|excluded\|skipped" \
  web/src/app/api/calculation/run/route.ts | head -30
```

For each refusal/skip path, paste the condition and the action verbatim. Document whether each is a "structural exception" (binding invalid) or a "data anomaly" (binding valid, data missing/wrong).

Append under `## Section 3.4 — Engine operative refusal-vs-result paths`.

### 3.5 Engine contract summary (operative documentation)

Structured summary:

```markdown
Engine operative inputs: <list>
Engine operative assumptions (checked): <list>
Engine operative assumptions (unchecked): <list>
Engine signal emission to logs: <list>
Engine signal emission to classification_signals: <list or "none">
Engine refusal paths: <list>
Engine skip-and-return-zero paths: <list>
Bright line "structural exception vs data anomaly": <documented or not documented in code>
```

Append under `## Section 3.5 — Engine contract operative summary`.

Commit:

```bash
git add docs/diagnostics/DIAG-042_LAYER_CONTRACTS_DOCUMENTATION_OUTPUT.md
git commit -m "DIAG-042 Phase 3: Engine consumption contract operative documentation"
git push
```

---

## Phase 4 — Section 4: Flywheel Integration (operative documentation)

### 4.1 The classification_signals table — schema and consumers

```bash
# Schema
grep -A 20 "create table.*classification_signals\|CREATE TABLE.*classification_signals" \
  $(find . -name "*.sql" -type f) 2>&1 | head -40
```

If schema not findable in repo SQL files, CC runs a service-role tsx-script:

```typescript
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
// Read information_schema for classification_signals table
const { data } = await supabase.rpc('exec_sql', { sql: `
  SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'classification_signals'
  ORDER BY ordinal_position;
` });
console.log(JSON.stringify(data, null, 2));
```

If `exec_sql` RPC unavailable, document the absence and surface the table schema from `SCHEMA_REFERENCE_LIVE.md` if present.

Paste schema verbatim.

### 4.2 Operative signal emission sites (every layer)

CC documents every site in the codebase that writes to `classification_signals`:

```bash
grep -rn "classification_signals\|insertSignal\|recordSignal\|writeClassificationSignal" \
  web/src/ --include="*.ts" 2>&1 | head -50
```

For each emit site, paste the function context (10 lines before, 10 lines after). Document:
- The triggering layer (HC, convergence, engine, SCI agent, plan interpreter, fingerprint flywheel)
- The signal_type (verbatim from code)
- The trigger condition (verbatim)
- Whether the emit is structural (always fires on the condition) or special-cased

Append under `## Section 4.2 — Operative signal emission sites`.

### 4.3 Operative signal consumption sites

CC documents every site in the codebase that reads from `classification_signals`:

```bash
grep -rn "from('classification_signals'\|\.from\\('classification_signals'\\)\|SELECT.*classification_signals" \
  web/src/ --include="*.ts" 2>&1 | head -30
```

For each read site:
- The consuming function
- What the consumer does with the signal (re-classify, adjust confidence, etc.)
- Whether the consumption closes a learning loop (signal → adapted behavior on next encounter) or is purely observational

Append under `## Section 4.3 — Operative signal consumption sites`.

### 4.4 The fingerprint flywheel (operative wiring)

Per DIAG-041 Phase 6.4 and DS-017:

```bash
sed -n '1,100p' web/src/lib/sci/fingerprint-flywheel.ts
```

Paste the file's first 100 lines verbatim. Then document:

- What the fingerprint flywheel caches (`structural_fingerprints` table — what columns)
- What triggers a Tier 1 match (cached result reuse — no LLM call)
- What triggers a Tier 2 demotion (per HF-145: confidence < 0.5)
- What feeds the confidence calculation (per OB-177: binding match rate)
- What ACTUALLY DECREMENTS confidence in current code

```bash
grep -rn "OB-177\|decreaseConfidence\|confidence.*-\|confidence -=" \
  web/src/lib/sci/ --include="*.ts" 2>&1 | head -20
```

Paste each verbatim. Document the operative confidence decrement loop — what signal triggers it, where it's wired.

### 4.5 The OB-177 self-correction loop (operative documentation)

Per substrate (March 19): "When field classification is wrong... the flywheel must learn from corrections, not just from first impressions."

CC documents the operative state of OB-177:

```bash
grep -rn "OB-177\|binding match rate\|matchRate" web/src/ --include="*.ts" 2>&1 | head -20
sed -n '<OB-177-site>,<+40>p' web/src/<file>
```

Paste verbatim. Document:
- What metric triggers demotion (entity_id binding rate? other?)
- What threshold (e.g., < 0.5)
- What action on demotion (fingerprint confidence -=, set to specific value, mark as suspect)
- Whether this loop is wired to OTHER signal types (convergence gap? engine fallback? user override?) or only to entity_id binding rate

Append under `## Section 4.5 — OB-177 self-correction loop operative state`.

### 4.6 Closed-Loop Learning evaluation (per Section A Principle 5)

CC writes a structured summary, prose only:

```markdown
**Principle 5 — Closed-Loop Learning** states: "Platform activity generates training signals for continuous improvement. AI mappings that get manually corrected inform future AI interpretation. The platform gets smarter with use."

Operative state per DIAG-042 evidence:

- Layers emitting classification_signals: <list from 4.2>
- Layers consuming classification_signals: <list from 4.3>
- Closed loops (emit → consume → adapt): <list>
- Open loops (emit but no consumer, or consume but no emit): <list>
- Special-cased loops (wired for one signal type only): <list, including OB-177>
- Aspirational vs structural: <where is the principle structurally enforced vs documented but not wired>
```

This summary is descriptive of operative state, not prescriptive.

Append under `## Section 4.6 — Closed-Loop Learning operative state evaluation`.

Commit:

```bash
git add docs/diagnostics/DIAG-042_LAYER_CONTRACTS_DOCUMENTATION_OUTPUT.md
git commit -m "DIAG-042 Phase 4: Flywheel integration operative documentation"
git push
```

---

## Phase 5 — Section 5: Cold-Start vs Steady-State Behaviors (operative documentation)

### 5.1 First-import behavior (operative)

CC documents what happens when a tenant imports its first file:

```bash
# Find first-import-detection paths
grep -rn "first.*import\|isFirstImport\|fingerprint.*null\|matchCount === 0\|matchCount.*=.*0" \
  web/src/lib/sci/ --include="*.ts" 2>&1 | head -20

# Find tier-3 paths (novel structure)
grep -rn "tier.*3\|Tier 3\|novel structure" \
  web/src/lib/sci/ --include="*.ts" 2>&1 | head -20
```

For each first-import code path, paste verbatim. Document:
- What classification paths fire (HC LLM? structural-only? agent classification?)
- What confidence levels are emitted by default
- What gaps are surfaced to the user (if any) vs auto-resolved silently

Append under `## Section 5.1 — Cold-start operative behavior`.

### 5.2 Steady-state behavior (operative)

CC documents what happens on repeat imports of similar structures:

```bash
# Tier 1 match path
grep -rn "tier.*1\|Tier 1\|HF-145\|hasFingerprint.*confidence" \
  web/src/lib/sci/ --include="*.ts" 2>&1 | head -20
```

For each tier-1 match path, paste verbatim. Document:
- What is reused (HC classifications, semantic_roles, column_roles, etc.)
- What re-classification still fires (vs full bypass)
- What confidence threshold gates Tier 1 (operative: 0.5 per HF-145)

Append under `## Section 5.2 — Steady-state operative behavior`.

### 5.3 Progressive automation curve (operative reality)

CC documents whether the curve from "broad gaps surfaced to user" → "narrower thresholds, fewer user-touches" is structurally specified or aspirational:

- Are there tenant-scoped adaptive thresholds in current code? Or are thresholds hardcoded constants?
- Is the canonical contextualIdentity enum learned per-tenant? Or is it static (ROLE_MAP fallback) + free-form (LLM)?
- Does the user's manual correction at the Evaluate surface (DS-009 Phase 5) write back to the flywheel as a learning signal? Where?

```bash
# Tenant-adaptive thresholds
grep -rn "tenant.*threshold\|adaptiveThreshold\|tenant.*confidence\|perTenant" \
  web/src/ --include="*.ts" 2>&1 | head -20

# Learned canonical enums
grep -rn "learned.*enum\|tenantScopedEnum\|extendedEnum" \
  web/src/ --include="*.ts" 2>&1 | head -10

# Evaluate surface → flywheel writeback
grep -rn "evaluate.*surface\|userOverride\|manualCorrection.*signal" \
  web/src/ --include="*.ts" 2>&1 | head -20
```

Paste each grep output. Where matches are zero, document the absence verbatim ("0 matches — feature not present in current code"). Where matches exist, paste the operative surface verbatim.

Append under `## Section 5.3 — Progressive automation operative state`.

Commit:

```bash
git add docs/diagnostics/DIAG-042_LAYER_CONTRACTS_DOCUMENTATION_OUTPUT.md
git commit -m "DIAG-042 Phase 5: Cold-start vs steady-state operative documentation"
git push
```

---

## Phase 6 — Section 6: Order-Independence Guarantees (operative documentation)

### 6.1 What each layer assumes about prior state (operative)

CC documents, per layer, what state each layer currently assumes has been populated by prior operations:

**HC layer:**
```bash
grep -rn "previousImport\|priorClassification\|priorEntities" web/src/lib/sci/header-comprehension.ts | head -10
```

**Convergence layer:**
```bash
grep -rn "entities.*populated\|entities.*exists\|tenant.entities" web/src/lib/intelligence/convergence-service.ts | head -10
```

**Engine layer:**
```bash
grep -rn "entities.*required\|rule_set_assignments\|priorImport" web/src/app/api/calculation/run/route.ts | head -20
```

For each layer, document:
- What state the layer reads as input
- What state the layer assumes already exists (without checking)
- What happens if the assumed state is empty / missing

Append under `## Section 6.1 — Operative prior-state assumptions by layer`.

### 6.2 Operative order-dependencies surfaced

For each layer, name the import orderings that would currently produce different outcomes:

- Transaction file imported BEFORE roster file: what happens?
- Plan file imported AFTER data files: what happens?
- All-at-once combined import: what happens?

Document the operative behavior from code, not from hypothetical reasoning.

```bash
# Entity resolution depends on prior entities table?
grep -rn "tenant.*entities.*empty\|entities.size === 0\|entities.length === 0" \
  web/src/ --include="*.ts" 2>&1 | head -10
```

For each operative order-dependency, paste the code citation that creates the dependency.

Per HF-196 Phase 1G discovery (substrate citation):
> "Import order independence is operative architecturally and serves as substrate invariant during reconciliation phases."

CC verifies this verbatim claim against current code. Does it hold for the convergence and engine layers? Cite evidence.

Append under `## Section 6.2 — Operative order-dependencies`.

Commit:

```bash
git add docs/diagnostics/DIAG-042_LAYER_CONTRACTS_DOCUMENTATION_OUTPUT.md
git commit -m "DIAG-042 Phase 6: Order-independence operative documentation"
git push
```

---

## Phase 7 — Section 7: Open vs Closed Sets (operative documentation)

### 7.1 The contextualIdentity value set (already documented Section 1.3; consolidated here)

Per Phase 1.3: dual-path. CC consolidates the findings into one summary:

- **Closed set (operative):** ROLE_MAP at `field-identities.ts:20-37` — list every key/value pair verbatim
- **Open set (operative):** LLM emits `semanticMeaning` as free-form string; no enum constraint at the prompt level
- **Reconciliation at runtime:** chain via `extractFieldIdentitiesFromTrace || buildFieldIdentitiesFromBindings`

Append under `## Section 7.1 — contextualIdentity open/closed set operative reality`.

### 7.2 IntentOperation primitive set (operative)

```bash
# All operation discriminants in intent-executor switch
grep -n "case '\|case \"" web/src/lib/calculation/intent-executor.ts | head -30
```

Paste verbatim. List every primitive currently supported. Document whether the set is:
- Closed (extending requires code change)
- Open (extensible via configuration or learned at runtime)

```bash
# Find primitive-registry
grep -rn "primitive.*registry\|primitiveRegistry\|primitive registry" \
  web/src/ --include="*.ts" 2>&1 | head -10
sed -n '<line>,<+30>p' web/src/lib/calculation/primitive-registry.ts
```

Paste verbatim.

Append under `## Section 7.2 — IntentOperation primitive set operative reality`.

### 7.3 IntentModifier set (operative)

Per DIAG-041 Phase 5.5: 4 discriminants — `cap`, `floor`, `proration`, `temporal_adjustment`. Closed set.

```bash
grep -n "modifier: '" web/src/lib/calculation/intent-types.ts | head -20
sed -n '<line>,<+15>p' web/src/lib/calculation/intent-types.ts
```

Paste verbatim. Confirm closed set. Document whether modifiers' `scope` enum (`per_period | per_entity | total`) is closed or extensible.

Append under `## Section 7.3 — IntentModifier set operative reality`.

### 7.4 ColumnRole / structuralType set (operative)

Per DIAG-041 Phase 1.1: `'identifier', 'name', 'temporal', 'measure', 'attribute', 'reference_key', 'unknown'` — 7-value enum.

```bash
grep -n "'identifier'\|'name'\|'temporal'\|'measure'\|'attribute'\|'reference_key'" \
  web/src/lib/sci/sci-types.ts | head -10
sed -n '70,90p' web/src/lib/sci/sci-types.ts
```

Paste verbatim. Confirm closed set.

Append under `## Section 7.4 — ColumnRole / structuralType set operative reality`.

### 7.5 Open vs Closed summary (operative documentation)

Structured summary, prose only:

```markdown
| Vocabulary | Open or Closed | Extension Mechanism (operative) |
|---|---|---|
| contextualIdentity (LLM path) | Open | LLM free-form string |
| contextualIdentity (ROLE_MAP fallback) | Closed | Code change required |
| IntentOperation primitives | <documented from 7.2> | <documented from 7.2> |
| IntentModifier discriminants | Closed | Code change required |
| IntentModifier scope enum | Closed | Code change required |
| ColumnRole / structuralType | Closed | Code change required |
```

Append under `## Section 7.5 — Open/closed summary`.

The product claims "any plan, any format, any content." CC documents which vocabularies currently support that claim structurally (open + learnable) vs which require code changes to extend (closed). No interpretation of whether this is right or wrong — just the operative reality.

Commit:

```bash
git add docs/diagnostics/DIAG-042_LAYER_CONTRACTS_DOCUMENTATION_OUTPUT.md
git commit -m "DIAG-042 Phase 7: Open/closed sets operative documentation"
git push
```

---

## Phase 8 — Final state and surface to architect

CC pastes a final consolidated section:

```markdown
## Phase 8 — DIAG-042 Final State

**File path:** docs/diagnostics/DIAG-042_LAYER_CONTRACTS_DOCUMENTATION_OUTPUT.md
**Total lines:** <wc -l output>
**Sections completed:** Phases 0 through 7
**Halts encountered:** <list any HALT points; if none, state "none">

**Operative contract documentation produced:**

1. HC layer contract — inputs, outputs, contextualIdentity open/closed, 'unknown' emission paths
2. Convergence layer contract — inputs, outputs, invariants (enforced and unenforced), gap-handling
3. Engine consumption contract — inputs, assumptions (checked and unchecked), signal emission, refusal-vs-result paths
4. Flywheel integration — signal table schema, emission sites, consumption sites, OB-177 self-correction operative state, Closed-Loop Learning operative state
5. Cold-start vs steady-state — first-import behavior, tier-1 behavior, progressive automation operative reality
6. Order-independence — prior-state assumptions per layer, operative order-dependencies
7. Open vs closed sets — vocabulary inventory with extension mechanisms

**Closed-Loop Learning operative state:** <summary from Section 4.6>

**Awaiting architect disposition.** DIAG-042 produces documentation of operative reality only. Any subsequent design proposal — changes to contracts, additions to flywheel wiring, modifications of vocabulary openness — routes through IRA invocation per Decision 153 governance. No further action by CC.
```

Final commit:

```bash
git add docs/diagnostics/DIAG-042_LAYER_CONTRACTS_DOCUMENTATION_OUTPUT.md
git commit -m "DIAG-042 Phase 8: final state summary"
git push
```

CC reports back with:
1. The output file path
2. Final line count
3. The list of halt points (if any)
4. Confirmation that all 8 phases committed and pushed to dev

CC does NOT create a PR for this DIAG. The DIAG output lives on dev; the architect reads and dispositions any subsequent IRA invocation.

---

## Halt conditions

CC halts and surfaces verbatim if:

- **Phase 1.1:** No HC entry function found (HC may live in a renamed file)
- **Phase 1.2:** No `FieldIdentity` or `HeaderComprehension` type definitions found in expected files
- **Phase 2.1:** No call site found for `convergeBindings` (function may have been renamed post-HF-217)
- **Phase 3.1:** No `convergenceBindings` read site found in `route.ts` (post-HF-217 file may have drifted)
- **Phase 4.1:** `classification_signals` table schema not findable in repo SQL or schema_reference; service-role read returns error
- **Phase 4.2/4.3:** Zero matches for signal emission OR signal consumption — possible if the signal architecture is fully aspirational with no operative wiring (would be a significant finding)
- **Phase 4.5:** OB-177 site not found in current code (may have been deprecated)
- **Phase 5.3:** Service-role SQL execution fails (capability gap to surface)
- **Phase 7.2:** primitive-registry not present (per DIAG-041 it was found; halt if missing)
- **Any phase:** A locked rule (SR-34, SR-42, decision N) dictates a halt — surface verbatim per SR-42
- **Any phase:** `grep`/`sed` returns error other than zero-results

On halt: paste the exact finding, name the trigger condition, halt. Do not retry, do not modify scope, do not invent alternate paths.

---

## What this DIAG enables

Once DIAG-042 is in hand, the architect has:

1. **Explicit contract documentation per layer.** What HC, convergence, the engine, and the flywheel currently DO at the contract level — beyond what DIAG-041 surfaced at the code level.
2. **Closed-Loop Learning operative-state evaluation.** Where Section A Principle 5 is structurally instantiated vs aspirational. This is the load-bearing finding for any subsequent flywheel work.
3. **Open vs closed vocabulary inventory.** Which parts of the platform support "any plan, any format, any content" today vs which require code changes.
4. **Order-independence operative reality.** What guarantees current code makes vs what's implicit.

DIAG-042 produces documentation. **Any design proposal arising from this documentation routes through IRA invocation per Decision 153.** Claude does not propose contract changes, signal additions, or flywheel wiring extensions from this output. IRA processes DIAG-042's evidence into design recommendations; architect dispositions.

---

## File inventory

**Files CC creates this DIAG:**

- `docs/diagnostics/DIAG-042_LAYER_CONTRACTS_DOCUMENTATION_OUTPUT.md` — single consolidated file

**Files CC modifies this DIAG:**

- None

**Files CC reads (verbatim paste required):**

- `CC_STANDING_ARCHITECTURE_RULES.md`
- `docs/diagnostics/DIAG-041_COMPREHENSIVE_CODE_AUDIT_OUTPUT.md` (orientation only)
- `INF_GOVERNANCE_INDEX_20260406.md`, `INF_DECISION_REGISTRY_20260406.md`, `Decision_153_LOCKED_20260420.md` (orientation only)
- `web/src/lib/sci/header-comprehension.ts`, `field-identities.ts`, `sci-types.ts`, `entity-resolution.ts`, `fingerprint-flywheel.ts`
- `web/src/lib/intelligence/convergence-service.ts`
- `web/src/lib/calculation/intent-executor.ts`, `intent-transformer.ts`, `intent-types.ts`, `primitive-registry.ts`
- `web/src/app/api/calculation/run/route.ts`
- `web/src/app/api/import/sci/execute/route.ts`, `execute-bulk/route.ts`
- `web/src/lib/ai/providers/anthropic-adapter.ts` (prompt templates)
- `SCHEMA_REFERENCE_LIVE.md`

CC does not modify any of these. CC pastes verbatim into the DIAG output file.

---

**End of DIAG-042 directive.**
