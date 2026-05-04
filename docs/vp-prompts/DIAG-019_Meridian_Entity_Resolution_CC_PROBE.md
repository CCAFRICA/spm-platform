DIAG-019: Meridian entity resolution defect-class verification

ROLE: Diagnostic. Read-only. Value-blind. Output evidence; do not draft fixes; do not
propose HFs; do not number additional artifacts. Architect interprets.

LOCKED CONTEXT: HF-196 §1.1.A closed Adjacent-Arm Drift at 8 SCI classification sites.
HF-196 §5.2 confirms field_identities.structuralType operative at SCI surface. Meridian
post-clean-slate re-import shows entity resolution failing despite Decision 108 (HC
primacy) being LOCKED. §7.1 checklist suggests entity resolution is a sibling
consumer surface that may not have been touched by HF-196's 8-site closure.

CC STANDING ARCHITECTURE RULES (operative):
  - Read-only diagnostic. NO writes, NO migrations, NO fixes.
  - FP-49 guard: schema-verify before any query referencing tables/columns
  - Decision 64: signals on classification_signals shared surface (not touched by this probe)
  - SR-44: any browser verification is architect-only (this probe doesn't browser-verify)
  - Reconciliation-channel separation: probe is value-blind; no GT comparison

DELIVERABLE: Single output document at docs/CC-artifacts/DIAG-019_Meridian_Entity_Resolution_Probe.md
with probe results. Commit when complete. Architect reads and dispositions.

═══════════════════════════════════════════════════════════════════════════════════
DIAG-019 PHASE 0 — SCHEMA DISCOVERY (FP-49 guard)
═══════════════════════════════════════════════════════════════════════════════════

Author web/scripts/diag-019-probe-0-schema.ts (one-shot; do NOT commit; delete
after PASTE):

  Use service-role client. Run information_schema queries:

  Query 0.1: Find any table named field_identities (any schema):
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_name = 'field_identities';

  Query 0.2: Find ANY table with a column named structural_type, structuralType,
            structural_role, or columnRole (broader search — column may live elsewhere):
    SELECT table_schema, table_name, column_name, data_type
    FROM information_schema.columns
    WHERE column_name IN ('structural_type', 'structuralType', 'structural_role',
                          'column_role', 'columnRole', 'role', 'field_role')
      AND table_schema NOT IN ('pg_catalog', 'information_schema');

  Query 0.3: Inspect classification_signals columns (HF-196 evidence shows this is
            shared signal surface; HC primacy persistence may be column there):
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'classification_signals'
    ORDER BY ordinal_position;

  Query 0.4: Inspect committed_data columns (per AUD-001 line 478, per-content-unit
            fingerprint persists per content unit; metadata may carry column roles):
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'committed_data'
    ORDER BY ordinal_position;

  Query 0.5: Inspect entities table — entity-resolution writes here:
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'entities'
    ORDER BY ordinal_position;

  Output ALL results to probe report under section "Phase 0 — Schema Discovery".
  Then: rm web/scripts/diag-019-probe-0-schema.ts

  HALT condition: If query 0.1 + 0.2 BOTH return zero rows, surface to architect
  before continuing. The HC primacy substrate location is unidentified. Architect
  dispositions whether to abort probe or continue with Phase 1 against committed_data
  metadata path.

═══════════════════════════════════════════════════════════════════════════════════
DIAG-019 PHASE 1 — CODE ARCHEOLOGY (Q1/Q2 evidence)
═══════════════════════════════════════════════════════════════════════════════════

Goal: locate the entity-resolution code path. Determine whether it reads HC-primacy
substrate (whatever Phase 0 reveals it to be) before falling to structural heuristics.

Phase 1.1 — Locate entity resolution code (DS-009 3.3 reference from logs):

  $ grep -rn 'DS-009 3.3' web/src --include='*.ts'
  $ grep -rn 'Entity Resolution' web/src/lib --include='*.ts' | head -20
  $ grep -rn 'looks like row indices' web/src --include='*.ts'
  $ grep -rn 'resolveEntitiesFromCommittedData\|findOrCreateEntity' web/src --include='*.ts' | head -20

  PASTE: every match with file:line:context.

  Identify the canonical entity-resolution function file. Note its absolute path.

Phase 1.2 — Inspect that file for HC-primacy reads:

  Substitute <ER_FILE_PATH> with the path from 1.1.

  $ grep -n 'field_identities\|structuralType\|structural_type\|structural_role\|column_role' <ER_FILE_PATH>
  $ grep -n 'classification_signals' <ER_FILE_PATH>
  $ grep -n 'committed_data.*metadata\|row_data\|column_roles' <ER_FILE_PATH>

  PASTE: every match with file:line:context. If zero matches across all three queries,
  state that explicitly: "ZERO MATCHES — entity resolution does not reference HC
  primacy substrate."

Phase 1.3 — Inspect that file for structural heuristics on identifier columns:

  $ grep -n 'looks like row indices\|isSequential\|repeatRatio\|identifier.*candidate\|cardinalityCheck' <ER_FILE_PATH>
  $ grep -n 'integer.*sequential\|sequentialInteger\|isMonotonic' <ER_FILE_PATH>

  PASTE: every match with file:line:context. The presence of structural-heuristic
  code is expected; what matters is whether it gates on HC primacy first.

Phase 1.4 — Pattern analysis (do not interpret; report only):

  For each function in <ER_FILE_PATH> that decides "is this column an identifier?":
    a. List the function name and line range
    b. List the predicates the function uses (in order they appear in code)
    c. State: "HC primacy gate present at line N" or "HC primacy gate ABSENT"

  This is the §7.1 Q1/Q2 evidence. Do not draft conclusions; report the pattern.

═══════════════════════════════════════════════════════════════════════════════════
DIAG-019 PHASE 2 — SUBSTRATE STATE (Q3 evidence)
═══════════════════════════════════════════════════════════════════════════════════

Author web/scripts/diag-019-probe-2-substrate.ts (one-shot; do NOT commit;
delete after PASTE):

  Tenant: 5035b1e8-0754-4527-b7ec-9f93f85e4c79 (Meridian — established in
  conversation; not GT value)

  Phase 2.1 — Whatever-table-Phase-0-found-as-HC-substrate state for Meridian:

    If Phase 0 found field_identities table:
      SELECT COUNT(*) AS rows, ARRAY_AGG(DISTINCT field_name) AS fields
      FROM <schema>.field_identities
      WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';

      SELECT field_name, structural_type, confidence, source
      FROM <schema>.field_identities
      WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
      ORDER BY field_name;
      (adjust column names per Phase 0 schema discovery)

    If Phase 0 found HC primacy persists in classification_signals:
      SELECT signal_type, COUNT(*)
      FROM classification_signals
      WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
      GROUP BY signal_type ORDER BY 2 DESC;

      SELECT signal_type, signal_data->>'field_name' AS field,
             signal_data->>'role' AS role, signal_data->>'confidence' AS confidence
      FROM classification_signals
      WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
        AND signal_type LIKE 'comprehension%'
      ORDER BY created_at DESC
      LIMIT 50;

    If Phase 0 found HC primacy persists in committed_data metadata:
      SELECT id, batch_id, data_type,
             metadata->>'column_roles' AS roles
      FROM committed_data
      WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
      LIMIT 10;

  Phase 2.2 — Entity-resolution outcome state for Meridian:

    SELECT COUNT(*) AS rows_total, COUNT(entity_id) AS rows_with_entity_id,
           COUNT(*) - COUNT(entity_id) AS rows_with_null_entity_id
    FROM committed_data
    WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';

    SELECT data_type, COUNT(*) AS rows,
           COUNT(entity_id) AS linked,
           COUNT(*) - COUNT(entity_id) AS unlinked
    FROM committed_data
    WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
    GROUP BY data_type;

    SELECT COUNT(*) AS entities FROM entities
    WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';

  Phase 2.3 — Import batch state (which imports succeeded; which Tier was hit):

    SELECT id, file_name, status, structural_fingerprint, recognition_tier,
           created_at, completed_at
    FROM import_batches
    WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
    ORDER BY created_at DESC
    LIMIT 20;
    (some columns may be in processing_jobs instead — check per Phase 0 schema)

  Phase 2.4 — BCL comparison (control — proven-working tenant):

    Repeat Phase 2.1 query for tenant b1c2d3e4-aaaa-bbbb-cccc-111111111111 (BCL —
    established in conversation, not GT). Same query shape. Surface row counts
    only — no values that would constitute reconciliation evidence.

    Goal: does BCL have HC-primacy substrate populated where Meridian doesn't?
    Answers Q3 (pipeline-ordering inversion vs consumer-not-reading).

  Output ALL results to probe report under section "Phase 2 — Substrate State".
  Then: rm web/scripts/diag-019-probe-2-substrate.ts

═══════════════════════════════════════════════════════════════════════════════════
DIAG-019 PHASE 3 — TRACE LOG REPLAY (Q3 disambiguation)
═══════════════════════════════════════════════════════════════════════════════════

Author web/scripts/diag-019-probe-3-trace.ts (one-shot; do NOT commit;
delete after PASTE):

  Goal: from the live import_batches and committed_data state, infer the order in
  which the second Meridian import (Datos_Q1) interacted with HC-primacy substrate.

  Phase 3.1 — Per-batch entity_id linkage rate:

    SELECT ib.file_name, ib.created_at,
           COUNT(cd.id) AS rows,
           COUNT(cd.entity_id) AS linked
    FROM import_batches ib
    LEFT JOIN committed_data cd
      ON cd.tenant_id = ib.tenant_id AND cd.import_batch_id = ib.id
    WHERE ib.tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
    GROUP BY ib.id, ib.file_name, ib.created_at
    ORDER BY ib.created_at;
    (column names approximate — adjust per Phase 0 schema)

  Phase 3.2 — If Phase 0 found HC primacy persists in classification_signals or
            similar, query that surface for per-batch HC writes:

    Identify whether HC bindings landed on first-import batches (Tier 3 LLM run)
    but NOT on second-import batches (Tier 1 cache hit, LLM skipped).

    Specific question: if classification_signals carries 'comprehension:*' signals,
    do those signals exist for ALL Meridian import batches, or only the first one?

    Query (adapt per Phase 0):
      SELECT ib.file_name, ib.created_at,
             COUNT(cs.id) AS hc_signals_for_this_batch
      FROM import_batches ib
      LEFT JOIN classification_signals cs
        ON cs.tenant_id = ib.tenant_id
        AND cs.signal_data->>'batch_id' = ib.id::text
        AND cs.signal_type LIKE 'comprehension%'
      WHERE ib.tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
      GROUP BY ib.id, ib.file_name, ib.created_at
      ORDER BY ib.created_at;

  Output to probe report under section "Phase 3 — Trace Replay".
  Then: rm web/scripts/diag-019-probe-3-trace.ts

═══════════════════════════════════════════════════════════════════════════════════
DIAG-019 OUTPUT — REPORT FORMAT
═══════════════════════════════════════════════════════════════════════════════════

Path: docs/CC-artifacts/DIAG-019_Meridian_Entity_Resolution_Probe.md

Required sections:

  # DIAG-019 — Meridian Entity Resolution Defect-Class Verification

  ## Provenance
  - Branch: main HEAD <SHA>
  - Probe scripts: (path list — all deleted after run)
  - Probe runtime: <timestamp range>

  ## Phase 0 — Schema Discovery
  - Query 0.1 result (verbatim)
  - Query 0.2 result (verbatim)
  - Query 0.3 result (verbatim)
  - Query 0.4 result (verbatim)
  - Query 0.5 result (verbatim)
  - **Disposition statement:** "HC primacy substrate located at: <table.column>"
    OR "HC primacy substrate location UNCLEAR — surfacing to architect."

  ## Phase 1 — Code Archeology
  - Phase 1.1 results (file location)
  - Phase 1.2 results (HC primacy reads in entity resolution code)
  - Phase 1.3 results (structural heuristics in entity resolution code)
  - Phase 1.4 pattern analysis (per-function: predicates in order, HC gate present/absent)
  - **Disposition statement:** "Entity resolution reads HC primacy substrate at line N"
    OR "Entity resolution does NOT read HC primacy substrate (zero matches)."

  ## Phase 2 — Substrate State
  - Phase 2.1 results (Meridian HC primacy substrate state)
  - Phase 2.2 results (Meridian entity-link rate)
  - Phase 2.3 results (Meridian import_batches)
  - Phase 2.4 results (BCL control comparison)
  - **Disposition statement:** "Meridian HC primacy substrate has N rows;
    BCL has M rows" — no interpretation; raw counts only.

  ## Phase 3 — Trace Replay
  - Phase 3.1 per-batch link rates
  - Phase 3.2 per-batch HC signal counts (if applicable)
  - **Disposition statement:** "First-import batches have N HC signals; subsequent
    Tier-1 cache-hit batches have M HC signals" — raw counts.

  ## Probe Synthesis (FACTUAL — no fix recommendations)
  Three §7.1 questions answered with evidence-only:
    - Q1/Q5 Adjacent-Arm Drift: Evidence-line answer based on Phase 1 patterns
    - Q2 Decision-Implementation Gap: Evidence-line answer based on Phase 1
      (zero matches = gap; matches present = no gap, different defect)
    - Q3 Pipeline-Ordering Inversion: Evidence-line answer based on Phase 2 + 3
      (substrate present but consumer not reading = consumer-side gap;
       substrate absent on Tier-1 batches = pipeline-ordering inversion)

  ## What this probe does NOT contain
  - No HF draft
  - No fix proposal
  - No PR
  - No reconciliation against ground truth values

  ## Architect Handoff
  Architect reads this report and dispositions next step. Possible dispositions:
    a. HF needed — Adjacent-Arm Drift at entity resolution surface (Q1/Q2 confirmed)
    b. HF needed — Pipeline-Ordering Inversion (Q3 confirmed)
    c. Both — composite HF
    d. Different defect class than §7.1 reveals — probe deeper
    e. No HF — substrate state already correct, Meridian-specific data condition

═══════════════════════════════════════════════════════════════════════════════════

COMMIT THE REPORT (only):
  $ git add docs/CC-artifacts/DIAG-019_Meridian_Entity_Resolution_Probe.md
  $ git commit -m 'DIAG-019: Meridian entity resolution probe — read-only diagnostic'

DO NOT push. Surface to architect:
  "DIAG-019 complete. Report at docs/CC-artifacts/DIAG-019_Meridian_Entity_Resolution_Probe.md
   commit <SHA> on branch main. AWAITING ARCHITECT DISPOSITION."

OUT OF SCOPE FOR DIAG-019:
  - Any code change
  - Any schema change
  - Any HF/OB drafting
  - Any sequence numbering
  - Any value comparison against ground truth
  - Any "recommendation" — facts only

REPORTING DISCIPLINE:
  - Verbatim query outputs only
  - Patterns described, not interpreted
  - Evidence-line dispositions, not synthesis
  - FP-80 guard: every disposition statement backed by pasted evidence

END OF DIAG-019.
