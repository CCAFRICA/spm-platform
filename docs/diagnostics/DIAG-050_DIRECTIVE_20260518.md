# DIAG-050 — Binding Lifecycle Attrition Trace

**Date:** 2026-05-18
**Type:** DIAG (read-only diagnostic, no code changes)
**Surface:** SCI classification → flywheel replay → confirmedBindings materialization → commitContentUnit persistence
**Tenant under inspection:** CRP — `e44bbcb1-2710-4880-8c7d-a1bd902720b7`
**Estimated execution:** 30–45 minutes (code reads + database queries only; no builds, no migrations, no clean-slate)

---

## §0 — CC Standing Rules and Drafting Reference

Standing rules: `CC_STANDING_ARCHITECTURE_RULES.md` binds throughout. AP-25 (Korean Test), SR-34 (No Bypass), SR-41 (Revert Discipline), Rules 25–28 (Completion Report structure), Rule 41 (Read actual code before diagnosing). This DIAG is read-only; SR-35/SR-38 (engine math gates) do not apply.

Drafting discipline reference: `INF_Structured_Compliant_Drafting_Reference_20260513.md`. This DIAG conforms to DD-1 through DD-12; specifically DD-8 (fully qualified paths), DD-9 (description-implementation parity), DD-10 (path at `docs/vp-prompts/`), DD-11 (file IS the prompt; no §7).

Reconciliation-channel separation: this DIAG produces no calculated values. All evidence is structural (file content, database state). No reference values appear in this directive. Architect interpretation of evidence occurs in architect channel after CC returns the output artifact.

---

## §1 — Problem Statement

### 1.1 Empirical evidence from architect-channel inspection

The session closed under the hypothesis that JSONB column stripping in `commitContentUnit` → Supabase insert was the binding constraint. Architect-channel SQL inspection (post-session) of `committed_data` across all three proof tenants disproved this hypothesis:

```
Meridian (pre-session, May 13):
  transaction:  row_data 19 cols, semantic_roles 19  →  invariant holds (19=19)
  entity:       row_data  6 cols, semantic_roles  6  →  invariant holds (6=6)
  reference:    row_data  7 cols, semantic_roles  7  →  invariant holds (7=7)

BCL (pre-session, May 15):
  transaction:  row_data 13 cols, semantic_roles 13  →  invariant holds (13=13)
  entity:       row_data  8 cols, semantic_roles  8  →  invariant holds (8=8)

CRP (post-session, May 18, post-clean-slate, flywheel-replayed):
  transaction:  row_data  5 cols, semantic_roles  5  →  invariant holds (5=5)
  entity:       row_data  9 cols, semantic_roles  9  →  invariant holds (9=9)
  target:       row_data  6 cols, semantic_roles  6  →  invariant holds (6=6)
```

**Invariant: `row_data_col_count == semantic_roles_count` across all tenants, all data types, all timestamps.** Storage faithfully persists whatever `unit.confirmedBindings` carries at the moment `commitContentUnit` runs. The persistence layer is not at issue.

### 1.2 The actual defect class

CRP transaction `row_data` contains 5 columns: `date, quantity, sales_rep_id, total_amount, unit_price`. The source CSV files contain 11 columns. The flywheel injection log from the post-clean-slate import shows `Tier 1: injected 11 fieldBindings from flywheel`. Six bindings vanish between flywheel injection and `confirmedBindings` materialization.

The five survivors carry strong semantic roles: one temporal (`date`), one identifier (`sales_rep_id`), three measures (`quantity, total_amount, unit_price`). The six lost carry weaker semantic roles: attributes, names, reference_key. The attrition is asymmetric and structurally legible.

### 1.3 Defect-class lineage

This is not a regression introduced by this session's HFs in the sense the closing report framed. The first CRP import this session (Tier 3 fresh-LLM, post-HF-228 code) reconciled at $360,007.84 — meaning the post-HF-228 fresh-LLM path preserves bindings adequately. The second CRP import (Tier 1 flywheel-replayed, same post-HF-228 code) shows the attrition. The defect lives in the flywheel-replay path's interaction with one of HF-228 through HF-233's binding-evaluation surfaces.

Adjacent-Arm Drift class (IGF-T1-E952): the fresh-LLM and flywheel-replay paths share a downstream binding materialization step. The fresh-LLM path produces bindings that satisfy whatever filter the materialization applies. The flywheel-replay path produces bindings that don't fully satisfy it.

### 1.4 What this DIAG produces

A binding lifecycle map. For one CRP transaction file, trace from SheetJS parse → SCI proposal → HC pattern matching → CRR posterior → confirmedBindings → commitContentUnit consumption. At each step, identify the field name where bindings live and the count of bindings present. The step where count drops from 11 to 5 is the attrition point. The DIAG does not propose fixes.

---

## §2 — Substrate-Bound Discipline Applications

- **Carry Everything, Express Contextually (locked principle):** evidence here will determine whether the principle is violated by code or only by interpretation. The DIAG does not pre-judge.
- **Decision 108 LOCKED (HC Override Authority):** HC observations carry classification authority. The DIAG inspects whether HC observations also carry binding-retention authority, or whether retention is governed by a separate downstream rule.
- **IGF-T1-E952 (Adjacent-Arm Drift):** fresh-LLM path vs flywheel-replay path are the two arms. Defect closure at instance level (one path) without class level (both paths sharing materialization) is provisional. The DIAG identifies which materialization step is shared and which is divergent.
- **AP-25 / Korean Test:** all greps in this DIAG target code symbols (`fieldBindings`, `confirmedBindings`, `proposedBindings`, `semantic_roles`, `flywheel`, `Tier 1`), not natural-language field names from any tenant's data.
- **Rule 41 (Read actual code before diagnosing):** every phase ends with pasted file content, not CC description.

---

## §3 — Phase 0: Repository State Confirmation

### 3.1 Sub-step 0.1 — Confirm branch and head SHA

```bash
cd /Users/AndrewAfrica/spm-platform
git fetch origin main
git checkout main
git pull origin main
git log origin/main --oneline -3
```

Paste the output verbatim. The last merged commit should be PR #414 (HF-235). If it is not, halt at HALT-1.

### 3.2 Sub-step 0.2 — Create diagnostic working branch

```bash
git checkout -b diag-050-binding-lifecycle-trace
```

Paste the branch creation confirmation.

### 3.3 Sub-step 0.3 — Create output directory and DIAG output stub

```bash
mkdir -p /Users/AndrewAfrica/spm-platform/docs/diagnostics
cat > /Users/AndrewAfrica/spm-platform/docs/diagnostics/DIAG-050_BINDING_LIFECYCLE_TRACE_OUTPUT.md <<'EOF'
# DIAG-050 — Binding Lifecycle Trace Output

**Date:** 2026-05-18
**Tenant:** CRP — e44bbcb1-2710-4880-8c7d-a1bd902720b7
**Head SHA:** [filled by Phase 0]
**Branch:** diag-050-binding-lifecycle-trace

---

## Phase 1: Flywheel Injection Site

[populated by Phase 1]

## Phase 2: SCI Classification Path

[populated by Phase 2]

## Phase 3: confirmedBindings Materialization

[populated by Phase 3]

## Phase 4: commitContentUnit Consumption

[populated by Phase 4]

## Phase 5: Database State Evidence

[populated by Phase 5]

## Phase 6: Binding Lifecycle Map and Attrition Point

[populated by Phase 6]
EOF

git add docs/diagnostics/DIAG-050_BINDING_LIFECYCLE_TRACE_OUTPUT.md
git commit -m "DIAG-050 Phase 0: branch created, output stub committed"
git push -u origin diag-050-binding-lifecycle-trace
```

**Proof gate 0 (IMMUTABLE):**
```
□ git log shows HF-235 as latest origin/main merge (paste hash + message)
□ branch diag-050-binding-lifecycle-trace exists and is checked out (paste git branch output)
□ docs/diagnostics/DIAG-050_BINDING_LIFECYCLE_TRACE_OUTPUT.md exists (paste ls -l)
□ Phase 0 commit pushed (paste commit hash + push confirmation)
```

If any gate fails, halt at HALT-2.

---

## §4 — Phase 1: Flywheel Injection Site Code Read

Objective: identify exactly where flywheel-cached bindings are injected into the SCI proposal data structure, which field on the content unit they populate, and at what confidence value.

### 4.1 Sub-step 1.1 — Locate flywheel injection symbol

```bash
cd /Users/AndrewAfrica/spm-platform/web
grep -rn "Tier 1" --include="*.ts" src/lib/sci/ src/app/api/import/
grep -rn "injected.*fieldBindings\|injectFieldBindings\|fromFlywheel" --include="*.ts" src/lib/sci/ src/app/api/import/
grep -rn "flywheel.*confidence\|confidence.*0\.50\|confidence:.*0\.5" --include="*.ts" src/lib/sci/
```

Paste all three grep outputs verbatim into the DIAG output file under Phase 1 § "Symbol search."

### 4.2 Sub-step 1.2 — Read the injection function in full

From the grep output, identify the file and function where flywheel bindings are written into the unit/proposal structure. Read that function end-to-end with line numbers:

```bash
# Example template; substitute the file:line range identified in 1.1
grep -n "function.*[Ff]lywheel\|export.*[Ff]lywheel" /Users/AndrewAfrica/spm-platform/web/src/lib/sci/<file-identified-in-1.1>
# Then read the function body, e.g.
sed -n '<start>,<end>p' /Users/AndrewAfrica/spm-platform/web/src/lib/sci/<file-identified-in-1.1>
```

Paste the function body verbatim with line numbers into the DIAG output file under Phase 1 § "Injection function body."

### 4.3 Sub-step 1.3 — Identify the target field

From the function body, identify the precise field name on the content unit (or proposal) where injected bindings land. Common candidates: `unit.fieldBindings`, `unit.proposedBindings`, `proposal.fieldBindings`, `interpretations.<X>`. State the target field and its TypeScript type.

Paste into the DIAG output file under Phase 1 § "Target field identification":
```
TARGET FIELD: <field path, e.g. unit.fieldBindings>
TYPE: <e.g. FieldBinding[] | Map<string, FieldBinding>>
CONFIDENCE_VALUE: <literal value used by flywheel; e.g. 0.50>
SOURCE_OF_CONFIDENCE_VALUE: <hardcoded | parameter | cached>
```

**Proof gate 1 (IMMUTABLE):**
```
□ grep outputs for "Tier 1", flywheel injection symbol, and confidence pasted (3 grep blocks)
□ Injection function body pasted in full with line numbers
□ TARGET FIELD identified with TypeScript type
□ CONFIDENCE_VALUE captured as literal
□ DIAG output file updated; commit + push:
    git add docs/diagnostics/DIAG-050_BINDING_LIFECYCLE_TRACE_OUTPUT.md
    git commit -m "DIAG-050 Phase 1: flywheel injection site captured"
    git push origin diag-050-binding-lifecycle-trace
```

---

## §5 — Phase 2: SCI Classification Path Effect on Bindings

Objective: determine whether SCI classification (HC pattern matching, CRR Bayesian posterior, decision tree branching) transforms, filters, or preserves the binding set produced by Phase 1's target field.

### 5.1 Sub-step 2.1 — Locate classification entry point

```bash
cd /Users/AndrewAfrica/spm-platform/web
grep -rn "classifyContentUnits\|applyHeaderComprehensionSignals\|classifyByHCPattern" --include="*.ts" src/lib/sci/
grep -rn "fieldBindings.*=" --include="*.ts" src/lib/sci/ | grep -v "test\|\.spec\."
grep -rn "confirmedBindings.*=\|proposedBindings.*=" --include="*.ts" src/lib/sci/ src/app/api/
```

Paste all three grep outputs into the DIAG output file under Phase 2 § "Classification entry symbols."

### 5.2 Sub-step 2.2 — Read the classification dispatcher

From 2.1, identify the top-level classification function (likely in `synaptic-ingestion-state.ts` or `agents.ts`). Read it end-to-end with line numbers:

```bash
grep -n "function classifyContentUnits\|export.*classifyContentUnits" /Users/AndrewAfrica/spm-platform/web/src/lib/sci/synaptic-ingestion-state.ts
sed -n '<start>,<end>p' /Users/AndrewAfrica/spm-platform/web/src/lib/sci/synaptic-ingestion-state.ts
```

Paste the function body verbatim with line numbers into the DIAG output file under Phase 2 § "Classification dispatcher body."

### 5.3 Sub-step 2.3 — Trace binding transformations through the dispatcher

In the dispatcher body, identify every line that reads from or writes to the Phase 1 target field. For each:

```
LINE <N>: <verbatim line content>
OPERATION: <read | write | transform | filter>
EFFECT ON BINDING SET: <preserves count | adds | removes | replaces>
```

Paste this enumeration into the DIAG output file under Phase 2 § "Binding transformation trace."

### 5.4 Sub-step 2.4 — Inspect HC pattern matching exit behavior on NO_MATCH

The session log indicates the flywheel-replayed CRP transaction file produced HC pattern `NO_MATCH` and fell to Level 2 CRR retention. Identify the code path that handles `NO_MATCH`:

```bash
grep -rn "NO_MATCH\|noMatch\|pattern.*not.*match" --include="*.ts" /Users/AndrewAfrica/spm-platform/web/src/lib/sci/
```

Read the NO_MATCH handler end-to-end. State explicitly: does the NO_MATCH path preserve `fieldBindings` / `proposedBindings`, or does it transform/filter them?

Paste into the DIAG output file under Phase 2 § "NO_MATCH handler":
```
NO_MATCH HANDLER LOCATION: <file:line>
HANDLER BODY: <verbatim>
BINDING PRESERVATION: <PRESERVED | TRANSFORMED | FILTERED>
EVIDENCE: <line citation from handler body>
```

**Proof gate 2 (IMMUTABLE):**
```
□ Classification entry grep outputs pasted (3 grep blocks)
□ Classification dispatcher body pasted in full with line numbers
□ Every line reading/writing the target field enumerated with operation classification
□ NO_MATCH handler body pasted with binding-preservation verdict
□ DIAG output file updated; commit + push:
    git add docs/diagnostics/DIAG-050_BINDING_LIFECYCLE_TRACE_OUTPUT.md
    git commit -m "DIAG-050 Phase 2: classification path binding transformations traced"
    git push origin diag-050-binding-lifecycle-trace
```

---

## §6 — Phase 3: confirmedBindings Materialization

Objective: identify exactly where `unit.confirmedBindings` is populated, what source data feeds it, and whether the population logic applies a filter (by confidence, by semantic role, by HC pattern outcome).

### 6.1 Sub-step 3.1 — Locate confirmedBindings assignment site(s)

```bash
cd /Users/AndrewAfrica/spm-platform/web
grep -rn "confirmedBindings:\|confirmedBindings =\|\.confirmedBindings" --include="*.ts" src/lib/sci/ src/app/api/import/
```

Paste the output verbatim. Every assignment site must appear. Classify each match as: declaration (type definition), assignment (write site), read (consumed by downstream), comment (audit string only).

Paste into the DIAG output file under Phase 3 § "confirmedBindings reference inventory" as a table:
```
| File:Line | Match | Classification |
|---|---|---|
| <verbatim> | <verbatim line> | declaration | assignment | read | comment |
```

### 6.2 Sub-step 3.2 — Read each assignment site in context

For every match classified as "assignment" in 3.1, read the surrounding function/block (10 lines above, 20 lines below). Paste each verbatim with line numbers into the DIAG output file under Phase 3 § "Assignment site bodies."

### 6.3 Sub-step 3.3 — Identify the materialization source

For each assignment site, state explicitly what feeds it:

```
ASSIGNMENT SITE: <file:line>
SOURCE EXPRESSION: <verbatim right-hand side of assignment>
SOURCE FIELD(S): <e.g. unit.fieldBindings, unit.proposedBindings, derived>
FILTER APPLIED: <NONE | by confidence threshold (value) | by semantic role | by HC pattern outcome | other (describe)>
FILTER LITERAL: <verbatim literal value if any>
```

Paste into the DIAG output file under Phase 3 § "Materialization source analysis."

### 6.4 Sub-step 3.4 — Check for divergent assignment paths

The hypothesis driving this DIAG is that fresh-LLM and flywheel-replay paths converge on a shared materialization that filters asymmetrically. Inspect the assignment sites for branching:

```
DIVERGENT PATHS: <YES | NO>
IF YES: <name each path; identify what triggers each>
SHARED MATERIALIZATION: <YES | NO>
IF YES SHARED: <name the shared function and file:line>
```

Paste into the DIAG output file under Phase 3 § "Path divergence analysis."

**Proof gate 3 (IMMUTABLE):**
```
□ confirmedBindings reference inventory pasted as table with every match classified
□ Every assignment-site body pasted with surrounding context
□ Materialization source analysis populated for every assignment site
□ Path divergence analysis populated
□ DIAG output file updated; commit + push:
    git add docs/diagnostics/DIAG-050_BINDING_LIFECYCLE_TRACE_OUTPUT.md
    git commit -m "DIAG-050 Phase 3: confirmedBindings materialization mapped"
    git push origin diag-050-binding-lifecycle-trace
```

---

## §7 — Phase 4: commitContentUnit Consumption

> **Section number note:** This phase is §7 in the directive's reading order but is execution phase 4 — phase numbering tracks the binding lifecycle, section numbering tracks the file. No tail summary follows §6A. DD-11 compliance preserved.

Objective: confirm how `commitContentUnit` consumes `unit.confirmedBindings` to construct `metadata.semantic_roles` and how the row spread in `row_data` interacts with the binding set.

### 7.1 Sub-step 4.1 — Read commitContentUnit in full

```bash
cat -n /Users/AndrewAfrica/spm-platform/web/src/lib/sci/commit-content-unit.ts
```

Paste the entire file verbatim with line numbers into the DIAG output file under Phase 4 § "commitContentUnit full body."

### 7.2 Sub-step 4.2 — Identify semantic_roles construction

From the pasted file, identify the precise lines that construct `metadata.semantic_roles`. State:

```
SEMANTIC_ROLES CONSTRUCTION LINES: <line range>
SOURCE: <e.g. unit.confirmedBindings.forEach(...)>
INCLUDES: <every binding | filtered (describe filter)>
```

Paste into the DIAG output file under Phase 4 § "semantic_roles construction."

### 7.3 Sub-step 4.3 — Identify row_data construction

From the pasted file, identify the precise lines that construct `row_data` for each row. State explicitly:

```
ROW_DATA CONSTRUCTION LINES: <line range>
SPREAD EXPRESSION: <verbatim, e.g. { ...row, _sheetName: tabName, _rowIndex: i }>
ROW SOURCE: <the parameter name and its type>
COLUMN PROJECTION: <NONE (spreads full row) | YES (projects by bindings; describe)>
```

Paste into the DIAG output file under Phase 4 § "row_data construction."

### 7.4 Sub-step 4.4 — Reconcile the invariant

If `row_data` spreads the full `row` (no binding-based projection) AND `semantic_roles` is constructed from `confirmedBindings`, the database invariant `row_data_col_count == semantic_roles_count` should NOT hold automatically — `row_data` should carry every column SheetJS parsed, regardless of binding count. But the empirical data shows the invariant holds. State the reconciliation:

```
INVARIANT EXPLANATION:
  Option A: row_data is projected by confirmedBindings (cite line)
  Option B: row source (the parameter) is pre-projected upstream (cite caller)
  Option C: row source is full-width but semantic_roles count coincidentally equals
            distinct row_data keys (rule out: count from current DB state)
  Option D: <other; describe with evidence>
SELECTED: <A | B | C | D>
EVIDENCE: <verbatim line citation>
```

Paste into the DIAG output file under Phase 4 § "Invariant reconciliation."

**Proof gate 4 (IMMUTABLE):**
```
□ commit-content-unit.ts pasted in full with line numbers
□ semantic_roles construction lines identified with source/filter analysis
□ row_data construction lines identified with spread expression and projection analysis
□ Invariant reconciliation completed with selected option and evidence
□ DIAG output file updated; commit + push:
    git add docs/diagnostics/DIAG-050_BINDING_LIFECYCLE_TRACE_OUTPUT.md
    git commit -m "DIAG-050 Phase 4: commitContentUnit consumption analyzed"
    git push origin diag-050-binding-lifecycle-trace
```

---

## §8 — Phase 5: Database State Evidence

Objective: inspect what each pipeline stage persisted for the current CRP transaction batch, so the code reading from Phases 1–4 can be correlated against operative state. Read-only SQL via tsx scripts against Supabase service role.

### 8.1 Sub-step 5.1 — Create the database probe script

```bash
cat > /Users/AndrewAfrica/spm-platform/web/scripts/diag050-binding-state-probe.ts <<'EOF'
import { createClient } from '@supabase/supabase-js';

const TENANT = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7'; // CRP

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Probe A: import_batches metadata for current CRP transactions
  const { data: batches } = await sb
    .from('import_batches')
    .select('id, file_name, file_type, row_count, metadata, created_at')
    .eq('tenant_id', TENANT)
    .order('created_at', { ascending: false })
    .limit(10);

  console.log('=== PROBE A: import_batches (last 10, CRP) ===');
  for (const b of batches || []) {
    console.log(JSON.stringify({
      id: b.id,
      file_name: b.file_name,
      row_count: b.row_count,
      created_at: b.created_at,
      metadata_keys: b.metadata ? Object.keys(b.metadata) : [],
      metadata: b.metadata,
    }, null, 2));
    console.log('---');
  }

  // Probe B: committed_data metadata for one transaction row, full detail
  const { data: cdRows } = await sb
    .from('committed_data')
    .select('id, data_type, source_date, metadata, row_data, created_at')
    .eq('tenant_id', TENANT)
    .eq('data_type', 'transaction')
    .order('created_at', { ascending: false })
    .limit(1);

  console.log('=== PROBE B: committed_data sample (CRP transaction) ===');
  for (const r of cdRows || []) {
    console.log(JSON.stringify({
      id: r.id,
      data_type: r.data_type,
      source_date: r.source_date,
      created_at: r.created_at,
      metadata: r.metadata,
      row_data_keys: r.row_data ? Object.keys(r.row_data) : [],
      row_data: r.row_data,
    }, null, 2));
  }

  // Probe C: rule_sets.input_bindings for CRP
  const { data: ruleSets } = await sb
    .from('rule_sets')
    .select('id, name, input_bindings, updated_at')
    .eq('tenant_id', TENANT)
    .order('updated_at', { ascending: false });

  console.log('=== PROBE C: rule_sets.input_bindings (CRP) ===');
  for (const rs of ruleSets || []) {
    console.log(JSON.stringify({
      id: rs.id,
      name: rs.name,
      updated_at: rs.updated_at,
      input_bindings_keys: rs.input_bindings ? Object.keys(rs.input_bindings) : [],
      input_bindings: rs.input_bindings,
    }, null, 2));
    console.log('---');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
EOF
```

### 8.2 Sub-step 5.2 — Execute the probe

```bash
cd /Users/AndrewAfrica/spm-platform/web
npx tsx --env-file=.env.local scripts/diag050-binding-state-probe.ts > /tmp/diag050-probe-output.txt 2>&1
cat /tmp/diag050-probe-output.txt
```

Paste the full probe output (`/tmp/diag050-probe-output.txt`) into the DIAG output file under Phase 5 § "Database state probe output."

### 8.3 Sub-step 5.3 — Cross-reference observations

From the probe output:

```
PROBE A (import_batches):
  CRP TRANSACTION BATCH IDs: <list 4 IDs from last 4 transaction imports>
  METADATA KEYS CARRIED PER BATCH: <enumerate keys>
  ANY FIELD-BINDING-LIKE STRUCTURES IN METADATA?: <YES + cite | NO>

PROBE B (committed_data sample):
  METADATA.SEMANTIC_ROLES KEYS: <list>
  ROW_DATA KEYS (non-underscore): <list>
  KEYS IN ROW_DATA NOT IN SEMANTIC_ROLES: <list or "none">
  KEYS IN SEMANTIC_ROLES NOT IN ROW_DATA: <list or "none">

PROBE C (rule_sets.input_bindings):
  PER-PLAN BINDING COUNT: <plan name → count>
  ANY DERIVATION (vs. direct column reference)?: <YES + cite | NO>
  ANY filter QUALIFICATION PRESENT IN BINDINGS?: <YES + cite | NO>
```

Paste into the DIAG output file under Phase 5 § "Cross-reference observations."

**Proof gate 5 (IMMUTABLE):**
```
□ diag050-binding-state-probe.ts created at /Users/AndrewAfrica/spm-platform/web/scripts/
□ Probe executed; output pasted in full (verbatim, do not summarize)
□ Cross-reference observations populated for Probes A, B, C
□ Probe script committed (will be removed in Phase 6 cleanup):
    git add web/scripts/diag050-binding-state-probe.ts docs/diagnostics/DIAG-050_BINDING_LIFECYCLE_TRACE_OUTPUT.md
    git commit -m "DIAG-050 Phase 5: database state probe captured"
    git push origin diag-050-binding-lifecycle-trace
```

---

## §9 — Phase 6: Binding Lifecycle Map and Attrition Point

Objective: synthesize Phases 1–5 evidence into a single map showing binding count at each lifecycle step, and identify the precise step where 11 → 5 attrition occurs. Produce no fix recommendations.

### 9.1 Sub-step 6.1 — Author the lifecycle map

In the DIAG output file under Phase 6 § "Lifecycle map":

```
STEP 1: SheetJS parse
  COUNT: <columns in parsed row[0]>
  EVIDENCE: <from caller; cite file:line if observable; else "not directly observable in DB; inferred from CSV file as having 11 columns">

STEP 2: HC LLM call OR flywheel injection
  COUNT: <from flywheel log "injected N fieldBindings"; from Phase 1 evidence>
  TARGET FIELD: <from Phase 1.3>
  CONFIDENCE: <from Phase 1.3>

STEP 3: Classification (HC pattern + CRR)
  ENTRY COUNT: <from Step 2>
  EXIT COUNT: <from Phase 2 trace>
  TRANSFORMATIONS APPLIED: <from Phase 2.3>
  NO_MATCH PATH BEHAVIOR: <from Phase 2.4>

STEP 4: confirmedBindings materialization
  ENTRY COUNT: <from Step 3 exit>
  EXIT COUNT: <expected; correlate with DB semantic_roles=5>
  FILTER APPLIED: <from Phase 3.3>
  FILTER LITERAL: <from Phase 3.3>

STEP 5: commitContentUnit consumption
  ENTRY COUNT (confirmedBindings): <from Step 4 exit>
  SEMANTIC_ROLES OUTPUT COUNT: <from Phase 4.2>
  ROW_DATA OUTPUT COLUMN COUNT: <from Phase 4.3 + Phase 4.4>

STEP 6: Database persistence
  SEMANTIC_ROLES: 5 (empirical)
  ROW_DATA: 5 (empirical)
```

### 9.2 Sub-step 6.2 — Identify the attrition step

State the attrition step explicitly:

```
ATTRITION STEP: <step number where count drops from 11 to 5>
ATTRITION MECHANISM: <verbatim citation of the filter/transformation>
ATTRITION ASYMMETRY: <which roles survive vs which roles drop, by reference to the code logic, not by enumeration of CRP-specific field names>
RECONCILES WITH FRESH-LLM SUCCESS?: <yes/no + brief explanation grounded in the code>
```

### 9.3 Sub-step 6.3 — Adjacent surfaces

List every other code site that reads from `confirmedBindings` and could exhibit the same attrition pattern under flywheel-replay. This is class-level scope reconnaissance, not fix recommendation:

```bash
grep -rn "confirmedBindings" --include="*.ts" /Users/AndrewAfrica/spm-platform/web/src/ | grep -v test | grep -v "\.spec\."
```

Paste output. Classify each consumer as: persistence (writes to DB), runtime (used during calc), display (used in UI), test (excluded). Persistence and runtime consumers are the adjacent surfaces.

Paste into the DIAG output file under Phase 6 § "Adjacent confirmedBindings consumers."

### 9.4 Sub-step 6.4 — Commit the completed DIAG output

```bash
git add docs/diagnostics/DIAG-050_BINDING_LIFECYCLE_TRACE_OUTPUT.md
git commit -m "DIAG-050 Phase 6: binding lifecycle map and attrition point identified"
git push origin diag-050-binding-lifecycle-trace
```

### 9.5 Sub-step 6.5 — Create PR and produce completion report

```bash
gh pr create --base main --head diag-050-binding-lifecycle-trace \
  --title "DIAG-050: Binding lifecycle attrition trace (read-only diagnostic)" \
  --body "Read-only diagnostic tracing binding count from SheetJS parse through confirmedBindings materialization to DB persistence. Identifies attrition step in flywheel-replay path. No code changes, no migrations. See docs/diagnostics/DIAG-050_BINDING_LIFECYCLE_TRACE_OUTPUT.md for findings."
```

Author completion report per §10 below.

**Proof gate 6 (IMMUTABLE):**
```
□ Lifecycle map populated with counts at every step
□ Attrition step named with verbatim code citation
□ Attrition asymmetry described in role/structural terms (not field names)
□ Adjacent consumer inventory pasted and classified
□ DIAG output file committed and pushed
□ PR created (paste URL)
□ Completion report written per §10
```

---

## §10 — Reporting Discipline

Completion report file: `/Users/AndrewAfrica/spm-platform/docs/completion-reports/DIAG-050_COMPLETION_REPORT.md`. Created BEFORE final push per Rule 25. Structure per Rule 26:

```markdown
# DIAG-050 COMPLETION REPORT
## Date: 2026-05-18
## Execution Time: <minutes>

## COMMITS (in order)
| Hash | Phase | Description |

## FILES CREATED
| File | Purpose |

## FILES MODIFIED
| File | Change |

## PROOF GATES — HARD
| # | Criterion (VERBATIM from §3-§9) | PASS/FAIL | Evidence |

## STANDING RULE COMPLIANCE
- Rule 1 (commit+push each phase): <pass + commit count>
- Rule 6 (report in project root): pass
- Rule 18 (criteria verbatim): pass
- Rule 41 (Read actual code before diagnosing): pass — every phase pastes file content
- AP-25 (Korean Test): pass — greps target code symbols, not natural-language field names

## KNOWN ISSUES
<any halt conditions hit, partial reads, ambiguous classifications>

## DIAG OUTPUT SUMMARY
<3-5 sentence summary of the attrition step identification; full detail in DIAG-050_BINDING_LIFECYCLE_TRACE_OUTPUT.md>
```

Per Rule 27, "evidence" means paste, not describe. Every proof gate criterion gets pasted file content, pasted grep output, pasted SQL output, or pasted git hash + log message.

---

## §11 — HALT Conditions

- **HALT-1:** `git log origin/main --oneline -3` does NOT show HF-235 (PR #414) as the most recent merge. Architect verifies branch state before proceeding.
- **HALT-2:** Phase 0 proof gate fails (branch not created, output stub not committed, etc.). Architect investigates git state.
- **HALT-3:** Phase 1 grep returns zero results for "Tier 1" or flywheel-related symbols. Architect verifies the flywheel exists in code (it may be named differently); CC retries with broader grep using only the symbol `flywheel` (case-insensitive).
- **HALT-4:** Phase 3 reveals multiple divergent assignment paths for `confirmedBindings` without a shared materialization step. Architect dispositions whether the trace should fork (one per path) or stop (DIAG conclusion: paths are independent).
- **HALT-5:** Phase 4 invariant reconciliation cannot be resolved by Options A–D. Architect adds Option E based on pasted evidence; CC does not invent.
- **HALT-6:** Phase 5 probe fails to authenticate against Supabase (env vars missing). Architect supplies env path or alternate diagnostic mechanism.
- **HALT-7:** Phase 6 attrition step cannot be identified — the lifecycle map shows count preservation through every step. Architect dispositions: either the empirical evidence is wrong (re-query) or the code path under inspection is not the one operative for flywheel-replay imports (escalate to broader IRA scope).

CC pauses at any HALT and reports to architect channel. CC does not proceed past a HALT without architect disposition.

---

## §12 — Out of Scope

- Any code modification. This DIAG produces a trace, not a fix.
- Any migration. No schema or RLS changes.
- Clean-slating CRP or any tenant. The current state is the evidence; preserving it is essential.
- Re-importing files. The flywheel cache and existing batch state must be preserved.
- Fresh-LLM vs flywheel-replay A/B comparison via repeated imports. Out of scope for this read-only DIAG; consider as follow-on if synthesis requires it.
- Convergence pipeline (Pass 1–4) inspection. The convergence layer is downstream of `commitContentUnit`; if confirmedBindings materialization is the attrition point, convergence inherits that state. Inspecting convergence before identifying the attrition step is premature.
- Engine calculation inspection. Engine is two steps further downstream than convergence; same reasoning.
- BCL and Meridian re-imports under post-this-session code. The DB inspection of pre-session data is sufficient evidence for the universality question; re-imports would conflate the attrition signal with a fresh-LLM signal.

---

## §6A — Residuals

Operative-state known gaps not addressed by this DIAG:

1. **The "regression from $360,007.84 to $4,000/period" between first and second CRP import this session** is a separate signal. If Phase 6 identifies the attrition mechanism, that mechanism explains why $4,000/period (only 5 of 11 columns drive calculation, no filter-bearing components). It does NOT directly explain the $360,007.84 first-import success, which presumably ran a fresh-LLM path that did not trigger the attrition. The synthesis under Phase 6.2 ("RECONCILES WITH FRESH-LLM SUCCESS?") opens but does not close this gap; full closure requires either re-importing one file under fresh-LLM conditions (out of scope per §12) or substrate-level disposition.

2. **BCL R3 fix shape** remains carry-forward from prior session. Independent of this DIAG.

3. **Plan 4 scope_aggregate** remains deferred capability gap. Independent of this DIAG.

4. **Whether the attrition is intentional design or unintentional drift** is an architect-channel disposition after DIAG output, not a CC determination. If intentional (e.g., confidence-threshold gate by design), the fix path is to amend the flywheel contract to emit at higher confidence or to amend the filter to be role-asymmetric in the opposite direction. If unintentional, the fix path is to remove or relax the filter. The DIAG identifies the mechanism; the architect dispositions the response shape (HF vs IRA invocation vs substrate amendment).

5. **DIAG-049's column-description gap finding** (product_category not in column descriptions sent to Pass 4) is now explained as a consequence of binding attrition: if `product_category`'s binding was dropped at confirmedBindings materialization, downstream consumers including the convergence prompt builder have no column to describe. DIAG-050 supersedes DIAG-049's interpretive framing without invalidating its evidence.
