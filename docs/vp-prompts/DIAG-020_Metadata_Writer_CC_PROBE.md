DIAG-020: Metadata-writer HC-primacy code archeology

ROLE: Diagnostic. Read-only. Value-blind. Output evidence; do not draft fixes; do not
propose HFs; do not number additional artifacts. Architect interprets.

LOCKED CONTEXT: DIAG-019 disconfirmed Adjacent-Arm Drift at the entity-resolution
READER surface (entity-resolution.ts is HC-primacy-aware at lines 73-76 and 88-94).
DIAG-019 evidence localized the defect upstream: committed_data.metadata.entity_id_field
and committed_data.metadata.field_identities are persisted with degraded values for
3 of 7 Meridian batches (entity_id_field set to non-person columns Mes, Cuentas_Nuevas,
Hub on target/transaction/reference sheets). First-import batch 244cccbc (fresh HC
pass, source=hc_pattern) ALSO has wrong entity_id_field, ruling out cache-tier-only
causation. The metadata WRITER (processEntityUnit/processDataUnit in
web/src/app/api/import/sci/execute/route.ts and SCI worker equivalents) records these
values; this probe inspects whether the writer consumes the LLM HC roles or runs
parallel structural heuristics that mis-fire on non-person sheets.

CC STANDING ARCHITECTURE RULES (operative):
  - Read-only diagnostic. NO writes, NO migrations, NO fixes.
  - Decision 64: signals on classification_signals shared surface (not touched by this probe)
  - Korean Test (AP-25): if probe surfaces field-name string literals in writer code,
    record them verbatim — do not interpret as bugs; that is architect's call
  - SR-44: any browser verification is architect-only (this probe doesn't browser-verify)
  - Reconciliation-channel separation: probe is value-blind; no GT comparison
  - Premature-numbering avoidance: do not number any defect surfaced by this probe;
    architect numbers if HF surfaces

DELIVERABLE: Single output document at docs/CC-artifacts/DIAG-020_Metadata_Writer_Probe.md
with probe results. Commit to current branch when complete. Architect reads and
dispositions.

═══════════════════════════════════════════════════════════════════════════════════
DIAG-020 PHASE 1 — METADATA WRITER LOCATION
═══════════════════════════════════════════════════════════════════════════════════

Goal: locate every code site that writes committed_data.metadata.entity_id_field
or committed_data.metadata.field_identities. The writer surface is hypothesized
to be processEntityUnit/processDataUnit in execute/route.ts but other writers may
exist in SCI worker, sci-bulk, or post-commit construction paths.

Phase 1.1 — Find every write site for these metadata keys:

  $ grep -rnE "entity_id_field|field_identities" web/src --include='*.ts'
  $ grep -rnE "metadata\s*[:=].*entity_id_field" web/src --include='*.ts'
  $ grep -rnE "field_identities\s*:" web/src --include='*.ts'
  $ grep -rnE "semantic_roles\s*:" web/src --include='*.ts'

  PASTE: every match with file:line:context. Distinguish READ sites from WRITE sites
  by inspecting context. Annotate each match as READ or WRITE.

Phase 1.2 — Locate processEntityUnit and processDataUnit:

  $ grep -rn "processEntityUnit\|processDataUnit" web/src --include='*.ts'
  $ grep -rn "function processEntityUnit\|function processDataUnit\|processEntityUnit\s*=\|processDataUnit\s*=" web/src --include='*.ts'

  PASTE: definitions and all call sites with file:line:context.

Phase 1.3 — Locate SCI worker and sci-bulk writer paths (per HF-196 §6 evidence
that 11 superseded batches reflect SCI bulk re-imports):

  $ grep -rn "sci-bulk\|SCI Bulk\|sci-worker\|SCI-WORKER" web/src --include='*.ts' | head -30
  $ grep -rn "data_type.*=\s*'transaction'\|data_type.*=\s*'entity'\|data_type.*=\s*'reference'\|data_type.*=\s*'target'" web/src --include='*.ts' | head -30

  PASTE: every match with file:line:context. Note which files contain writer logic
  (insert into committed_data with metadata).

Phase 1.4 — Identify the canonical metadata-construction site:

  For each writer file identified in 1.1-1.3:
    a. Locate the function that assembles the metadata JSONB before insert
    b. Note the function name and line range
    c. Note the call chain from import API entry to the writer function

  PASTE: per-file annotation. If the canonical site is single, name it. If multiple,
  list all and note their relationship (dispatch by data_type? Parallel paths?).

═══════════════════════════════════════════════════════════════════════════════════
DIAG-020 PHASE 2 — WRITER PREDICATE ANALYSIS
═══════════════════════════════════════════════════════════════════════════════════

Goal: for each writer surface, determine whether it consumes LLM HC outputs
(profileMap, headerComprehension, columnRoles) or runs independent structural
heuristics when computing entity_id_field and field_identities.

Phase 2.1 — HC-input consumption check at each writer:

  Substitute <WRITER_FILE> with each file path identified in Phase 1.4.

  $ grep -n "headerComprehension\|interpretations\|columnRole\|profileMap\|ContentProfile" <WRITER_FILE>
  $ grep -n "hcRole\|hcInterpretation\|llmCalled\|columnRoles" <WRITER_FILE>

  PASTE: every match with file:line:context. If zero matches across all queries on
  a writer file, state explicitly: "WRITER <file> does NOT consume HC primacy
  substrate."

Phase 2.2 — Heuristic-predicate inventory at each writer:

  $ grep -n "isSequential\|repeatRatio\|cardinality\|integerRatio\|numericRatio\|isMonotonic" <WRITER_FILE>
  $ grep -n "looksLike\|looks_like\|isIdentifier\|detectIdentifier\|identifyColumn" <WRITER_FILE>
  $ grep -nE "structuralType\s*=|structural_type\s*=|columnRole\s*=" <WRITER_FILE>

  PASTE: every match with file:line:context. These are the heuristic predicates the
  writer uses (if any) when computing field_identities/entity_id_field.

Phase 2.3 — Korean Test compliance check at each writer:

  $ grep -nE "'No_Empleado'|'ID_Empleado'|'Mes'|'Año'|'Hub'|'Region'|'Periodo'|'Sucursal'" <WRITER_FILE>
  $ grep -nE "fieldName\s*===|columnName\s*===|name\s*===\s*'[A-Z]" <WRITER_FILE>
  $ grep -nE "\.toLowerCase\(\)\.includes\(|\.startsWith\(|\.endsWith\(" <WRITER_FILE>

  PASTE: every match. The Korean Test (AP-25) requires zero language-specific or
  field-name string literals in foundational classification code. Surface every
  match without interpretation; architect adjudicates whether each match violates
  AP-25.

Phase 2.4 — Pattern analysis (no interpretation; report only):

  For each function in <WRITER_FILE> that decides "what is entity_id_field for this
  batch?":
    a. Function name and line range
    b. Inputs the function consumes (parameter list with types)
    c. Predicates the function uses, IN ORDER they appear in code
    d. Path that produces entity_id_field (literal trace from input to write)
    e. State: "consumes HC primacy at line N (input=<param>)" OR "computes
       entity_id_field from structural heuristic only" OR "computes entity_id_field
       from a mix of HC and heuristic — first-match path is <X>"

  This is the §7.1 Q1/Q2 evidence for the WRITER surface. Do not draft conclusions;
  report the pattern.

═══════════════════════════════════════════════════════════════════════════════════
DIAG-020 PHASE 3 — RUNTIME TRACE CORRELATION
═══════════════════════════════════════════════════════════════════════════════════

Goal: correlate the Meridian re-import logs from 2026-05-04 02:33 against the
writer code to identify which code path produced each batch's metadata.

Phase 3.1 — DIAG-019 confirmed metadata divergence on these batches. For each,
locate the import log line that produced it:

  Reference batches (from DIAG-019 Phase 3.3):
    - 7accc165 (Plantilla / entity / eif=No_Empleado / CORRECT)
    - 3fb8551b (Datos_Rendimiento / transaction / eif=No_Empleado / CORRECT)
    - 244cccbc (Datos_Flota_Hub / reference / eif=Hub / DEGRADED, fresh HC)
    - cd60533c (Datos_Rendimiento / transaction / eif=Cuentas_Nuevas / DEGRADED, cache-hit)

  In code, locate where data_type is set per-batch:
    $ grep -nE "data_type\s*[:=]\s*'(entity|transaction|reference|target)'" web/src --include='*.ts'

  PASTE: every match. Annotate which writer produces which data_type.

Phase 3.2 — Per-data_type writer predicate trace:

  Using results from Phase 1-2, build per-data_type table:

  | data_type    | Writer function        | HC input consumed?  | entity_id_field source                   |
  |--------------|------------------------|---------------------|------------------------------------------|
  | entity       | <function:line>        | YES/NO              | <path: HC role / heuristic / mixed>      |
  | transaction  | <function:line>        | YES/NO              | <path>                                   |
  | reference    | <function:line>        | YES/NO              | <path>                                   |
  | target       | <function:line>        | YES/NO              | <path>                                   |

  This table is the synthesis evidence — paste it verbatim with each cell backed
  by file:line citation from Phase 1-2 grep output.

Phase 3.3 — DIAG-019 evidence cross-check:

  For each of the 4 reference batches in 3.1, cite the writer code path that
  would have produced its observed entity_id_field value:

  - 7accc165 entity batch produced eif=No_Empleado: which code path?
  - 244cccbc reference batch produced eif=Hub: which code path?
  - c70456ab target batch produced eif=Mes: which code path?
  - cd60533c transaction batch produced eif=Cuentas_Nuevas: which code path?

  If all four come from the same code path, name it. If different paths, name each.

═══════════════════════════════════════════════════════════════════════════════════
DIAG-020 OUTPUT — REPORT FORMAT
═══════════════════════════════════════════════════════════════════════════════════

Path: docs/CC-artifacts/DIAG-020_Metadata_Writer_Probe.md

Required sections:

  # DIAG-020 — Metadata-Writer HC-Primacy Code Archeology

  ## Provenance
  - Branch: <current branch> HEAD <SHA>
  - Probe scripts: (none required — code archeology only)
  - Probe runtime: <timestamp range>

  ## Phase 1 — Metadata Writer Location
  - Phase 1.1 results (verbatim grep output)
  - Phase 1.2 results
  - Phase 1.3 results
  - Phase 1.4 canonical writer surface(s) named
  - **Disposition statement:** "Metadata writer surface(s): <file:function:lines>"

  ## Phase 2 — Writer Predicate Analysis
  - Phase 2.1 results (HC consumption per writer)
  - Phase 2.2 results (heuristic predicates per writer)
  - Phase 2.3 results (Korean Test compliance — verbatim string-literal matches if any)
  - Phase 2.4 pattern analysis per function
  - **Disposition statement:** "Writer <function> consumes HC primacy at line N"
    OR "Writer <function> does NOT consume HC primacy (zero matches)"
    OR "Writer <function> mixes HC and heuristic — first-match path is <description>"

  ## Phase 3 — Runtime Trace Correlation
  - Phase 3.1 data_type writer mapping
  - Phase 3.2 per-data_type predicate table (verbatim)
  - Phase 3.3 four-batch trace
  - **Disposition statement:** "All four reference batches produced by code path
    <path>" OR enumerate per-batch path differences.

  ## Probe Synthesis (FACTUAL — no fix recommendations)
  Two questions, each answered with evidence-only:
    1. Does the metadata writer consume LLM HC roles (column-level structuralType
       and contextualIdentity from the SCI HC pass), or does it derive these
       independently? Cite Phase 2.1 + 2.4 evidence.
    2. Is the writer's logic Korean-Test compliant (zero language- or
       field-name-specific string literals)? Cite Phase 2.3 evidence verbatim.

  ## What this probe does NOT contain
  - No HF draft
  - No fix proposal
  - No PR
  - No reconciliation against ground truth values
  - No browser verification
  - No DML or DDL

  ## Architect Handoff
  Architect reads this report and dispositions next step. Possible dispositions:
    a. HF-N — Adjacent-Arm Drift at metadata-writer surface (writer derives
       entity_id_field independently of HC outputs; defect class same as HF-196
       §1.1.A at the 9th site)
    b. HF-N — Korean Test violation at writer (writer uses field-name string
       literals)
    c. HF-N — Composite (both Adjacent-Arm Drift and Korean Test violations)
    d. Different defect class — probe deeper at a third surface
    e. No HF — writer is HC-primacy-aware AND Korean-Test compliant; defect
       lies elsewhere (probe terminates without finding root cause)

═══════════════════════════════════════════════════════════════════════════════════

COMMIT THE REPORT (only):
  $ git add docs/CC-artifacts/DIAG-020_Metadata_Writer_Probe.md
  $ git commit -m 'DIAG-020: Metadata-writer code archeology — read-only diagnostic'

DO NOT push. Surface to architect:
  "DIAG-020 complete. Report at docs/CC-artifacts/DIAG-020_Metadata_Writer_Probe.md
   commit <SHA> on branch <name>. AWAITING ARCHITECT DISPOSITION."

OUT OF SCOPE FOR DIAG-020:
  - Any code change
  - Any schema change
  - Any HF/OB drafting
  - Any sequence numbering
  - Any value comparison against ground truth
  - Any "recommendation" — facts only
  - Any DML/DDL — code archeology only this phase

REPORTING DISCIPLINE:
  - Verbatim grep output only
  - Patterns described, not interpreted
  - Evidence-line dispositions, not synthesis
  - FP-80 guard: every disposition statement backed by pasted file:line evidence

END OF DIAG-020.
