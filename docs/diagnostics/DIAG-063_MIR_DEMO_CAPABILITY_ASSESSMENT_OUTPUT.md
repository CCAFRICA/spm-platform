# DIAG-063 — MIR DEMO CAPABILITY ASSESSMENT — OUTPUT
**Anchor SHA:** `d38d63553bddc079fab2cfda6f1fa2d178a2704a` (main HEAD, merge of PR #485, 2026-06-11)
**Date:** 2026-06-12 · **Branch:** `diag/063-mir-demo-capability-assessment`
**Directive:** `docs/vp-prompts/DIAG-063_MIR_DEMO_CAPABILITY_ASSESSMENT_DIRECTIVE_20260612.md`
**Path convention:** the application root is `web/`; all `src/...` references in this document are relative to `web/` (i.e., `src/foo.ts` = `web/src/foo.ts`). The directive's `scripts/diag/` is instantiated at `web/scripts/diag/` (the repository has no root `node_modules`; tsx module resolution requires scripts to live under `web/`).

---

## Phase 1 — Anchoring and Sequence Evidence

### 1.1 Anchor

```
$ git rev-parse HEAD
d38d63553bddc079fab2cfda6f1fa2d178a2704a
$ git log -1 --format='%H %ad %s'
d38d63553bddc079fab2cfda6f1fa2d178a2704a Thu Jun 11 19:23:11 2026 -0700 Merge pull request #485 from CCAFRICA/OB-203-phase-5
$ git status --porcelain
?? docs/diagnostics/DIAG-063_MIR_DEMO_CAPABILITY_ASSESSMENT_DIRECTIVE_20260612.md
```

The tree was clean except for one untracked file: a local copy of this very directive, dropped in `docs/diagnostics/` rather than the canonical `docs/vp-prompts/` path. `diff` against the directive as received: **IDENTICAL** (byte-for-byte). The stray copy was relocated to the canonical path (Phase 1.3) and the diagnostics copy removed. No tracked file was modified.

### 1.2 Sequence verification

```
$ ls -1 docs/diagnostics/ | sort -V
AUD-273_VARIANT_BINDING_INDEX_OUTPUT.md
DIAG-020_FINDINGS.md
DIAG-021_Fingerprint_Cache_Match_Mechanism_CC_PROBE.md
DIAG-024_FINDINGS.md
DIAG-025_TIPO_DRIFT_AUDIT_PROMPT_20260505.md
DIAG-027_RECONCILED_CALC_MECHANISM_DIRECTIVE_20260505.md
DIAG-028_HF200_PREREQUISITES_DIRECTIVE_20260505.md
DIAG-029_BCL_DERIVATION_REGRESSION_DIRECTIVE_20260505.md
DIAG-030_EMPTY_SEMANTIC_INTENT_DIRECTIVE_20260505.md
DIAG-033_SHAPE_C_VERIFICATION_GATE_20260506.md
DIAG-034_AUD-005_CALC_EXECUTION_LIVE_REFERENCE_20260506.md
DIAG-035_c4_Magnitude_Probe_Directive.md
DIAG-036_Metric_Population_Probe_Directive.md
DIAG-037_Comprehension_Signal_Write_Probe_Directive.md
DIAG-038_HF_214_Phase2_Audit_Directive.md
DIAG-039_c4_import_to_result_trace.md
DIAG-039_c4_import_to_result_trace_directive.md
DIAG-039_consolidated.md
DIAG-039_evidence
DIAG-040_DIRECTIVE.md
DIAG-040_post_hf216_traces.md
DIAG-041_COMPREHENSIVE_CODE_AUDIT.md
DIAG-041_COMPREHENSIVE_CODE_AUDIT_OUTPUT.md
DIAG-042_LAYER_CONTRACTS_DOCUMENTATION.md
DIAG-042_LAYER_CONTRACTS_DOCUMENTATION_OUTPUT.md
DIAG-043_HF223_SURFACE_VERIFICATION.md
DIAG-044_SCI_IMPORT_PATH_UNIFICATION.md
DIAG-045_C5_CONVERGENCE_BINDING_FAILURE.md
DIAG-045_C5_CONVERGENCE_BINDING_FAILURE_OUTPUT.md
DIAG-046_CRP_PLAN1_CONVERGENCE_BINDING.md
DIAG-046_CRP_PLAN1_CONVERGENCE_BINDING_OUTPUT.md
DIAG-047_CRP_FILTER_PROVENANCE.md
DIAG-047_CRP_FILTER_PROVENANCE_OUTPUT.md
DIAG-048_CRP_PLANS_234_FAILURE_TRACE.md
DIAG-048_CRP_PLANS_234_FAILURE_TRACE_OUTPUT.md
DIAG-049_POST_HF234_CONVERGENCE_STATE.md
DIAG-050_BINDING_LIFECYCLE_TRACE_OUTPUT.md
DIAG-050_DIRECTIVE_20260518.md
DIAG-050_DIRECTIVE_20260601.md
DIAG-051_BCL_EJECUTIVO_CAPTACION_INSPECTION.md
DIAG-051_CRP_PLAN2_PLAN4_DIRECTIVE_20260519.md
DIAG-051_CRP_PLAN2_PLAN4_FAILURE_SURFACE_20260519.md
DIAG-052_POST_HF238_REGRESSION_TRIAGE.md
DIAG-052_POST_HF238_REGRESSION_TRIAGE_DIRECTIVE.md
DIAG-053_PLAN_INTERPRETATION_REGRESSION_DIRECTIVE.md
DIAG-054_DAG_PATHWAY_TRACE.md
DIAG-054_DAG_PATHWAY_TRACE_DIRECTIVE.md
DIAG-055_HF-245_DIRECTIVE.md
DIAG-056_COMPLETION_REPORT_DIRECTIVE.md
DIAG-056_DIRECTIVE.md
DIAG-057_OUTPUT.md
DIAG-057_PLAN_IMPORT_STORAGE_TRANSPORT.md
DIAG-58_AGGREGATE_SCOPE_CAPABILITY_OUTPUT.md
DIAG-058_DIRECTIVE_20260531.md
DIAG-058_OUTPUT.md
DIAG-059_FLEET_PROJECTION_EVIDENCE_CAPTURE_20260601.md
DIAG-059_FLEET_PROJECTION_EVIDENCE_CAPTURE_DIRECTIVE_20260601.md
DIAG-063_MIR_DEMO_CAPABILITY_ASSESSMENT_DIRECTIVE_20260612.md   ← untracked local copy of THIS directive (relocated; see 1.1)
DIAG_DS021_Phase4_Comprehensive_Audit_Specification_20260430.md
HF-283_PHASE1_INVENTORY.md
HF-283_PHASE7_POSTAPPLY.md
QD-SABOR-1_2_20260610.md
```

**Sequence reconciliation.** The `main` listing tops out at DIAG-059; DIAG-060/061/062 artifacts are not on `main`. Git history across all refs accounts for them:

```
$ git log --all --oneline -i --grep="DIAG-06"
1deb1c0e OB-203 Phase 6B / DIAG-062: warm-witness post-mortem (A1-A5, read-only) — HALT-1 + HALT-2
86ebbba8 DIAG-062 Phase 2: completion report
b11ee5d9 DIAG-062 Phase 1: census evidence assembled (E1-E6)
c16b24ea DIAG-062 Phase 0: directive committed; provenance
4750db57 HF-283 Phase 0: directive committed; provenance + profile census
a294f007 HF-282 Phase 1+2.3: canonical reader resolveIdentity + redirect observability

$ git branch -a --contains 86ebbba8
  remotes/origin/diag-062-sabor-profile-census

$ git log -1 --format='%B' 4750db57 | grep -i "DIAG-06"   # HF-283 commit body
Provenance: origin/main HEAD db07b9cd; the three DIAG-061 traced files UNCHANGED
$ git log -1 --format='%B' a294f007 | grep -i "DIAG-06"   # HF-282 commit body
4 divergent reads: middleware /+/login .maybeSingle() (the DIAG-060 row-count fork),
Phase 2.3 — every DIAG-060 §6 redirect branch (13) now emits a named event before
```

DIAG-060 and DIAG-061 are referenced as completed work in HF-282/HF-283 commit bodies; DIAG-062 exists in full on `origin/diag-062-sabor-profile-census`. The highest assigned DIAG number is therefore **062**, matching the directive's premise. The only `DIAG-063*` file found anywhere (`find . -iname "*DIAG-06*"`) was the byte-identical untracked local copy of this directive itself. §4 HALT-1 (a *higher* number present, or a *pre-existing* 063) does not trigger: there is no collision and no self-assignment. The main-listing discrepancy is recorded as **Finding F-1**.

### 1.4 Governing artifacts read-proof

```
$ find . -name "CC_STANDING_ARCHITECTURE_RULES.md" -not -path "./node_modules/*"
./CC_STANDING_ARCHITECTURE_RULES.md
$ find . -name "CC_DIAGNOSTIC_PROTOCOL.md" -not -path "./node_modules/*"
(no output — file does not exist in the repository)
$ find . -name "SCHEMA_REFERENCE_LIVE.md" -not -path "./node_modules/*"
./SCHEMA_REFERENCE_LIVE.md
$ wc -l CC_STANDING_ARCHITECTURE_RULES.md SCHEMA_REFERENCE_LIVE.md
     309 CC_STANDING_ARCHITECTURE_RULES.md
     601 SCHEMA_REFERENCE_LIVE.md
```

`CC_STANDING_ARCHITECTURE_RULES.md` (309 lines) and `SCHEMA_REFERENCE_LIVE.md` (601 lines) were read in full before any probe. `CC_DIAGNOSTIC_PROTOCOL.md` does not exist as a repository file (see Open Questions OQ-1); the directive's phase prose was executed as the authoritative executable per DD-11. Note: `SCHEMA_REFERENCE_LIVE.md` is dated *Generated: 2026-03-18*; where live response keys diverge from the March snapshot, probes report observed keys.

### Access check (HALT-3 gate)

```
$ cd web && set -a && source .env.local && set +a && npx tsx scripts/diag/diag063_access_check.ts
import_batches reachable; row count: 115
```

---

## Summary Matrix

*(populated at assembly — one row per capability)*

| # | Capability | Evidence tier | Effort class | Probe | Architect-browser |
|---|------------|---------------|--------------|-------|-------------------|

---

## Module A — Believed-Working Evidence Banking

### A1A2 — Scale anchor (~162k import) + multi-file single-batch

**CURRENT STATE:** The ~162k scale anchor exists live: a single 15-file SCI bulk proposal (`proposalId b4c64b88-9ee9-4dd7-88fe-54a0d303651e`, tenant `3d354bfa-b298-48dd-88a0-9f8c5a00be4e`) committed **162,927** rows on 2026-06-12, with per-file declared==committed accounting on every file; its largest single file is 160,443 rows, written in a 396.0s window. Multi-file single-batch is represented as N `import_batches` rows (one per file/content unit) sharing `metadata.proposalId` — not via `processing_jobs.session_id` (table is empty) and not via per-row fan-in. 28 of 32 proposal groups contain >=3 files. No calculation has ever run against the anchor tenant: 0 periods, 0 calculation_batches, 0 calculation_results — **"Import proven at ~162k; calculation at volume: NOT YET EXECUTED"**. Code side: `commitContentUnit` is declared the sole committed_data write surface and is invoked only from the execute-bulk route (3 call sites), but two additional `committed_data` insert sites exist in the codebase.

Anonymization note: file names are redacted to `[fname-redacted len=N]` + extension by the probe scripts (tenant UUIDs only; no tenant name/slug queried; no payout columns selected). No credentials appeared in any output.

**EVIDENCE:**

Schema authority (SCHEMA_REFERENCE_LIVE.md): `import_batches` (11 cols: id, tenant_id, file_name, file_type, row_count, status, error_summary, uploaded_by, created_at, completed_at, metadata), `committed_data` (10 cols incl. import_batch_id, period_id, entity_id), `calculation_batches` (16 cols incl. started_at/completed_at, entity_count), `calculation_results` (12 cols), `processing_jobs` (18 cols incl. session_id). Live responses matched these names; no key divergence observed.

#### A1 — Top 10 import batches platform-wide by committed row count

Script: `web/scripts/diag/diag063_a1a2_top_batches.ts`. Run:

```
cd /Users/AndrewAfrica/spm-platform/web && set -a && source .env.local && set +a && npx tsx scripts/diag/diag063_a1a2_top_batches.ts
```

Output (verbatim; per-row committed_data sample block elided for length — it contains only field-role metadata, summarized below):

```
import_batches total rows fetched: 115
committed_data total: 416258; sum across batches: 372383; import_batch_id IS NULL: 43875

=== TOP 10 import_batches by committed_data rows ===
{"batch_id":"e95be66e-6546-4fbe-896f-56f3a725f7d5","tenant_id":"3d354bfa-b298-48dd-88a0-9f8c5a00be4e","file_name":"[fname-redacted len=45]","file_type":"sci","declared_row_count":160443,"committed_rows":160443,"status":"completed","created_at":"2026-06-12T15:21:55.528213+00:00","completed_at":null,"wall_clock":"n/a (completed_at null)","metadata_keys":["source","proposalId","contentUnitId","classification"]}
{"batch_id":"11665e5a-b8be-48e5-a5be-8f4235936e90","tenant_id":"3d354bfa-b298-48dd-88a0-9f8c5a00be4e","file_name":"[fname-redacted len=45]","file_type":"sci","declared_row_count":160443,"committed_rows":160443,"status":"completed","created_at":"2026-06-12T16:24:40.892959+00:00","completed_at":null,"wall_clock":"n/a (completed_at null)","metadata_keys":["source","proposalId","contentUnitId","classification"]}
{"batch_id":"307a2928-ece4-4be2-89d7-2fc0dca9568a","tenant_id":"1b770e90-9ad9-44ba-b66b-152f71c40b9a","file_name":"[fname-redacted len=45]","file_type":"sci","declared_row_count":20677,"committed_rows":18000,"status":"processing","created_at":"2026-06-12T18:29:31.820176+00:00","completed_at":null,"wall_clock":"n/a (completed_at null)","metadata_keys":["source","proposalId","contentUnitId","classification"]}
{"batch_id":"114b1283-5563-40d4-8165-8a336e4f58ac","tenant_id":"098f4915-ec5a-47bc-a7c8-d76a59f0526f","file_name":"[fname-redacted len=45]","file_type":"sci","declared_row_count":3200,"committed_rows":3200,"status":"completed","created_at":"2026-06-12T21:12:35.758589+00:00","completed_at":null,"wall_clock":"n/a (completed_at null)","metadata_keys":["source","proposalId","contentUnitId","classification"]}
{"batch_id":"ec12a8f2-76f7-4f75-957d-0d87b6bf20cd","tenant_id":"1f4f0511-6371-4458-9013-125ebdf5f735","file_name":"[fname-redacted len=45]","file_type":"sci","declared_row_count":3200,"committed_rows":3200,"status":"completed","created_at":"2026-06-12T21:15:52.595454+00:00","completed_at":null,"wall_clock":"n/a (completed_at null)","metadata_keys":["source","proposalId","contentUnitId","classification"]}
{"batch_id":"6ac3e9f1-bdfc-4752-acfd-434b5a37fdff","tenant_id":"1f4f0511-6371-4458-9013-125ebdf5f735","file_name":"[fname-redacted len=45]","file_type":"sci","declared_row_count":3200,"committed_rows":3200,"status":"completed","created_at":"2026-06-12T21:20:53.665766+00:00","completed_at":null,"wall_clock":"n/a (completed_at null)","metadata_keys":["source","proposalId","contentUnitId","classification"]}
{"batch_id":"ff6b7257-e38d-4999-b6a9-c2e903fd9869","tenant_id":"1f4f0511-6371-4458-9013-125ebdf5f735","file_name":"[fname-redacted len=45]","file_type":"sci","declared_row_count":3200,"committed_rows":3200,"status":"completed","created_at":"2026-06-12T21:24:56.228587+00:00","completed_at":null,"wall_clock":"n/a (completed_at null)","metadata_keys":["source","proposalId","contentUnitId","classification"]}
{"batch_id":"6267c0cf-2a73-41f5-a268-2d90c4482892","tenant_id":"1f4f0511-6371-4458-9013-125ebdf5f735","file_name":"[fname-redacted len=45]","file_type":"sci","declared_row_count":3200,"committed_rows":3200,"status":"completed","created_at":"2026-06-12T21:32:39.79473+00:00","completed_at":null,"wall_clock":"n/a (completed_at null)","metadata_keys":["source","proposalId","contentUnitId","classification"]}
{"batch_id":"80f275dd-17b8-44a7-ae5b-9f6554d05517","tenant_id":"1f4f0511-6371-4458-9013-125ebdf5f735","file_name":"[fname-redacted len=45]","file_type":"sci","declared_row_count":3200,"committed_rows":3200,"status":"completed","created_at":"2026-06-12T21:34:38.757997+00:00","completed_at":null,"wall_clock":"n/a (completed_at null)","metadata_keys":["source","proposalId","contentUnitId","classification"]}
{"batch_id":"26e4f11f-d324-4fa2-bead-39a88bc4937c","tenant_id":"336af2a7-e9b3-445e-abea-85792afa893d","file_name":"[fname-redacted len=45]","file_type":"sci","declared_row_count":3200,"committed_rows":3200,"status":"completed","created_at":"2026-06-12T21:48:45.847614+00:00","completed_at":null,"wall_clock":"n/a (completed_at null)","metadata_keys":["source","proposalId","contentUnitId","classification"]}

--- sanitized metadata, batch e95be66e-6546-4fbe-896f-56f3a725f7d5 ---
{ "source": "sci-bulk", "proposalId": "b4c64b88-9ee9-4dd7-88fe-54a0d303651e", "contentUnitId": "[str-redacted len=59]", "classification": "transaction" }
--- sanitized metadata, batch 11665e5a-b8be-48e5-a5be-8f4235936e90 ---
{ "source": "sci-bulk", "proposalId": "d8085364-72b1-4c6f-9d9e-20606fb14831", "contentUnitId": "[str-redacted len=59]", "classification": "transaction" }
--- sanitized metadata, batch 307a2928-ece4-4be2-89d7-2fc0dca9568a ---
{ "source": "sci-bulk", "proposalId": "f3570e27-ab7b-4be5-a0e5-2ae2f0607f47", "contentUnitId": "[str-redacted len=37]", "classification": "entity" }

--- committed_data sample (n=1000) for top batch e95be66e-6546-4fbe-896f-56f3a725f7d5 ---
distinct metadata keys in sample: [ 'entity_id_field', 'field_identities', 'informational_label', 'proposalId', 'resolved_data_type', 'semantic_roles', 'source' ]
data_type tally in sample: {"transaction":1000}

processing_jobs total: 0
sessions total: 0; sessions with >=2 jobs: 0

import_batches.metadata key frequency across all batches: {"source":115,"proposalId":115,"contentUnitId":115,"classification":115}
```

Per-row committed_data metadata (elided block): each row carries `semantic_roles` and `field_identities` maps for 31 columns (role/structuralType/contextualIdentity/confidence per column), `entity_id_field: "location_id"`, `resolved_data_type: "transaction"`, `proposalId`, `source: "sci-bulk"`, and an `informational_label` (redacted, len=11). No per-row file key and no sheet key — file provenance lives at the `import_batches` row level (one row per content unit), so the per-file accounting IS the per-batch-row accounting.

Multi-file representation verdict (all three hypotheses tested above):
- `metadata.proposalId` grouping on import_batches: YES — 115/115 batches carry `proposalId` + `contentUnitId`.
- `processing_jobs.session_id` grouping: NO — table has 0 rows.
- `committed_data` per-row file fan-in: NO — no file/sheet key among per-row metadata keys.

#### A1 — Identifying the ~162k anchor + per-file accounting (A2: >=3-file batches)

Script: `web/scripts/diag/diag063_a1a2_multifile_and_calc.ts`. Run:

```
cd /Users/AndrewAfrica/spm-platform/web && set -a && source .env.local && set +a && npx tsx scripts/diag/diag063_a1a2_multifile_and_calc.ts
```

Output part 1 — complete enumeration of all 28 proposal groups with >=3 files (verbatim header + the two anchor groups; the remaining 26 groups, all listed in the run, are summarized in the table below to keep this file readable — totals are exact):

```
proposalId groups: 32; groups with >=3 import_batches: 28; with exactly 2: 0

proposalId b4c64b88-9ee9-4dd7-88fe-54a0d303651e — 15 files, tenant(s) 3d354bfa-b298-48dd-88a0-9f8c5a00be4e
  batch 08d539cd-1317-492f-a35c-6eef8392c049 file=[fname-redacted len=45] declared=6 committed=6 status=completed created=2026-06-12T15:21:43.941371+00:00 classification=entity
  batch 340e6a22-c738-409a-8d9c-b2355fc5633a file=[fname-redacted len=45] declared=30 committed=30 status=completed created=2026-06-12T15:21:45.20743+00:00 classification=entity
  batch cb17207a-6346-47aa-877c-9cbe0dd918c3 file=[fname-redacted len=45] declared=6 committed=6 status=completed created=2026-06-12T15:21:47.827634+00:00 classification=entity
  batch 761fff29-3b16-4588-ad32-fd632acc5988 file=[fname-redacted len=45] declared=30 committed=30 status=completed created=2026-06-12T15:21:48.652033+00:00 classification=entity
  batch ac0258df-ec70-41f1-a05e-b861704d625a file=[fname-redacted len=45] declared=54 committed=54 status=completed created=2026-06-12T15:21:49.665773+00:00 classification=entity
  batch 356c3b51-75b3-4944-afef-ea92104b1b31 file=[fname-redacted len=45] declared=110 committed=110 status=completed created=2026-06-12T15:21:50.605479+00:00 classification=transaction
  batch 0f8ff242-0cda-43b7-8dc7-dae7d70842e5 file=[fname-redacted len=45] declared=120 committed=120 status=completed created=2026-06-12T15:21:51.505051+00:00 classification=transaction
  batch dc570c2b-e6a9-4c72-adc5-7ee36f371f29 file=[fname-redacted len=45] declared=18 committed=18 status=completed created=2026-06-12T15:21:52.396408+00:00 classification=transaction
  batch b9ad440a-586d-4db0-afcd-8dfc6d4a16a5 file=[fname-redacted len=45] declared=230 committed=230 status=completed created=2026-06-12T15:21:53.169096+00:00 classification=transaction
  batch e95be66e-6546-4fbe-896f-56f3a725f7d5 file=[fname-redacted len=45] declared=160443 committed=160443 status=completed created=2026-06-12T15:21:55.528213+00:00 classification=transaction
  batch e4d5f917-deb3-4480-af43-823d1660dff5 file=[fname-redacted len=45] declared=200 committed=200 status=completed created=2026-06-12T15:28:35.415242+00:00 classification=reference
  batch 5bb38398-9e95-4ed8-96c8-9d167442a855 file=[fname-redacted len=45] declared=3 committed=3 status=completed created=2026-06-12T15:28:36.26022+00:00 classification=reference
  batch 4e9cefb9-9020-4bd0-8374-d92fd6754b94 file=[fname-redacted len=45] declared=7 committed=7 status=completed created=2026-06-12T15:28:36.975366+00:00 classification=reference
  batch 0176b0f3-1eea-46b6-a51d-f8bc9f5be409 file=[fname-redacted len=45] declared=14 committed=14 status=completed created=2026-06-12T15:28:37.626384+00:00 classification=reference
  batch e750645a-0392-49ca-888c-4dfd2e926bf0 file=[fname-redacted len=45] declared=1656 committed=1656 status=completed created=2026-06-12T15:28:38.540934+00:00 classification=reference
  GROUP TOTAL committed rows: 162927

proposalId d8085364-72b1-4c6f-9d9e-20606fb14831 — 11 files, tenant(s) 3d354bfa-b298-48dd-88a0-9f8c5a00be4e
  batch bb720913-5a27-4919-b98c-821cccc82ec7 ... declared=120 committed=120 status=completed ... classification=entity
  batch adea41fd-d2a7-4de9-9a21-3758203e2218 ... declared=230 committed=230 status=completed ... classification=entity
  batch 5d32f6bc-b4cc-417e-87eb-335556a0e230 ... declared=110 committed=110 status=completed ... classification=transaction
  batch 28eddc5d-6851-44a8-ac51-73b471241c52 ... declared=18 committed=18 status=completed ... classification=transaction
  batch 11665e5a-b8be-48e5-a5be-8f4235936e90 ... declared=160443 committed=160443 status=completed ... classification=transaction
  batch e8d97f45-dbbb-4908-b5cd-6300733b7a1c ... declared=29 committed=29 status=completed ... classification=reference
  batch d3ab73c0-c3a4-4d20-a0a6-fa646c9af4bc ... declared=200 committed=200 status=completed ... classification=reference
  batch bc22be48-6d05-43a7-be0e-8fcc6752112b ... declared=3 committed=3 status=completed ... classification=reference
  batch eb3d03c9-5adc-4b73-a2b2-31210d4bb641 ... declared=7 committed=7 status=completed ... classification=reference
  batch ab2cb493-c03f-4a46-b770-72392fffc037 ... declared=14 committed=14 status=completed ... classification=reference
  batch 426b962a-8286-4191-96a3-ee7f98e95d63 ... declared=1656 committed=1656 status=completed ... classification=reference
  GROUP TOTAL committed rows: 162830
```

Remaining 26 groups (>=3 files each; complete file-level enumeration was produced by the run; exact group totals):

| proposalId | files | tenant | group total | anomalies |
|---|---|---|---|---|
| 189b25f1 | 6 | b1c2d3e4-aaaa-... | 510 | none |
| a28a92a3 | 5 | 24103940-... | 196 | none |
| 125cf2d5 | 4 | 24103940-... | 157 | none |
| d79ed433 | 4 | 336af2a7-... | 3244 | batch 96d0f8b4 declared=3200 committed=0 status=failed; retried 28s later as 26e4f11f committed=3200 completed |
| 95a288c2 | 3 | 5035b1e8-... | 304 | none |
| e7ab7495 | 3 | 5035b1e8-... | 304 | none |
| 18e558b4 | 3 | dbe3b308-... | 304 | none |
| 442ddd72 | 3 | 24103940-... | 304 | none |
| 83a78c36 | 3 | 24103940-... | 304 | none |
| aa5245c6 | 3 | 24103940-... | 103 | batch dab3377d declared=201 committed=0 status=completed (classification=target) |
| 73349d11 | 3 | 24103940-... | 304 | none |
| 117df273 | 3 | 24103940-... | 103 | batch 4254af27 declared=201 committed=0 status=completed (classification=target) |
| da0aebfb | 3 | 24103940-... | 304 | none |
| 220e5c6f | 3 | 24103940-... | 304 | none |
| de78b5e1 | 3 | 24103940-... | 304 | none |
| b97bb6da | 3 | 24103940-... | 304 | none |
| a3f3769a | 3 | 24103940-... | 304 | none |
| fc03f312 | 3 | 24103940-... | 304 | none |
| d2c9de93 | 3 | 24103940-... | 304 | none |
| bdbab5b9 | 3 | 24103940-... | 304 | none |
| 98cca60d | 3 | 24103940-... | 152 | none |
| c44f9d10 | 3 | 098f4915-... | 3244 | none |
| 792e6a2b | 3 | 1f4f0511-... | 3244 | none |
| 1674b037 | 3 | 1f4f0511-... | 3244 | none |
| 57356020 | 3 | 1f4f0511-... | 3244 | none |
| c71022c4 | 3 | 1f4f0511-... | 3244 | none |

A2 bar met: proposal `b4c64b88` is a 15-file single session with per-file declared==committed accounting on all 15 files, completing at 162,927 total committed rows.

Output part 2 — duplicate pair, ingest wall-clock, periods, calculation-at-volume (verbatim):

```
--- duplicate-pair structural comparison (values not printed) ---
same tenant: true
same file_name: false
same declared row_count: true (160443)
same metadata.contentUnitId: true
same metadata.proposalId: false
created_at gap: 62.8 minutes

batch e95be66e-6546-4fbe-896f-56f3a725f7d5: first committed row 2026-06-12T15:21:58.261136+00:00, last 2026-06-12T15:28:34.287694+00:00, write window 396.0s
batch 11665e5a-b8be-48e5-a5be-8f4235936e90: first committed row 2026-06-12T16:24:48.401359+00:00, last 2026-06-12T16:32:06.084776+00:00, write window 437.7s

periods for tenant 3d354bfa-b298-48dd-88a0-9f8c5a00be4e: 0
  period_id IS NULL rows in top batch: 160443

calculation_batches for tenant 3d354bfa-b298-48dd-88a0-9f8c5a00be4e: 0
calculation_results total for tenant: 0
```

**Import proven at ~162k; calculation at volume: NOT YET EXECUTED.**

(Wall-clock note: `import_batches.completed_at` is null on all top-10 batches, so duration was computed from the committed_data write window: 160,443 rows in 396.0s for the anchor file; full 15-file session spans 15:21:43 -> 15:28:38, about 415s.)

#### Calc-side gap shape

Script: `web/scripts/diag/diag063_a1a2_calc_gap_shape.ts`. Output (verbatim):

```
top batch e95be66e-6546-4fbe-896f-56f3a725f7d5: entity_id NULL=160353, entity_id set=90
entities rows for tenant 3d354bfa-b298-48dd-88a0-9f8c5a00be4e: 356
rule_sets rows for tenant 3d354bfa-b298-48dd-88a0-9f8c5a00be4e: 1
rule_set_assignments rows for tenant 3d354bfa-b298-48dd-88a0-9f8c5a00be4e: 0
entity_period_outcomes rows for tenant 3d354bfa-b298-48dd-88a0-9f8c5a00be4e: 0
```

Existing calc-side machinery (no code gap found for these): `src/app/api/calculation/run/route.ts`, `src/lib/calculation/run-calculation.ts`, `src/app/api/periods/detect/route.ts`, `src/app/api/periods/create-from-data/route.ts`, `src/lib/sci/calc-time-entity-resolution.ts` (all present in the committed_data reader sweep below).

#### NULL import_batch_id provenance sample

Script: `web/scripts/diag/diag063_a1a2_null_batch_sample.ts`. Output (verbatim):

```
sample size: 1000 (most recent NULL-batch rows)
by tenant_id: {"f7093bcc-e90b-4918-9680-69da7952dd65":1000}
by data_type: {"pos_cheque":1000}
by metadata.source: {"(null)":1000}
created_at range in sample: 2026-06-03T05:59:14.26516+00:00 -> 2026-06-03T05:59:14.26516+00:00
```

#### A2 code side — commitContentUnit call sites (complete grep)

```
$ cd /Users/AndrewAfrica/spm-platform/web && grep -rn "commitContentUnit" src/ --include="*.ts" --include="*.tsx"
src/app/api/import/sci/execute-bulk/route.ts:21:// data_type resolution all moved into commitContentUnit. Only the file-hash
src/app/api/import/sci/execute-bulk/route.ts:23:// and threaded into commitContentUnit per content unit).
src/app/api/import/sci/execute-bulk/route.ts:33:import { commitContentUnit } from '@/lib/sci/commit-content-unit';
src/app/api/import/sci/execute-bulk/route.ts:751:  // HF-231: Unified committed_data write via shared commitContentUnit.
src/app/api/import/sci/execute-bulk/route.ts:755:  const commitResult = await commitContentUnit(supabase, {
src/app/api/import/sci/execute-bulk/route.ts:796:  // HF-231: Unified committed_data write via shared commitContentUnit.
src/app/api/import/sci/execute-bulk/route.ts:797:  const commitResult = await commitContentUnit(supabase, {
src/app/api/import/sci/execute-bulk/route.ts:857:  // HF-231: Unified committed_data write via shared commitContentUnit.
src/app/api/import/sci/execute-bulk/route.ts:858:  const commitResult = await commitContentUnit(supabase, {
src/lib/sci/commit-content-unit.ts:16:// Side effects NOT owned by commitContentUnit (preserved at caller level):
src/lib/sci/commit-content-unit.ts:114:// HF-231 collapsed all 8 import write paths through commitContentUnit but
src/lib/sci/commit-content-unit.ts:205:// commitContentUnit — sole committed_data write surface
src/lib/sci/commit-content-unit.ts:208:export async function commitContentUnit(
src/lib/sci/commit-content-unit.ts:326:      console.error(`[commitContentUnit] HF-247 Phase 4 type-validation: ${reason}`);
src/lib/sci/commit-content-unit.ts:427:        `[commitContentUnit] Chunk ${chunksCompleted + 1}/${totalChunks} failed: ${lastErr}`,
src/lib/sci/commit-content-unit.ts:465:    `[commitContentUnit] ${classification} (${source}): ${totalInserted} rows committed, ` +
src/lib/sci/store-metadata-population.ts:7: * per-unit after commitContentUnit. After HF-239, execute-bulk's
```

Invocation call sites: exactly 3, all in `src/app/api/import/sci/execute-bulk/route.ts` (:755, :797, :858). Definition: `src/lib/sci/commit-content-unit.ts:208`.

Adjacent-arm sweep — every committed_data INSERT site in src/ (E952):

```
$ grep -rn "from('committed_data')" src/ --include="*.ts" --include="*.tsx" | grep "insert\|upsert"
src/lib/supabase/data-service.ts:167:    const { error } = await supabase.from('committed_data').insert(chunk);
```

plus (found by file-level sweep + per-file inspection):

```
src/lib/sci/commit-content-unit.ts:405-407:
      const { error: insertErr } = await supabase
        .from('committed_data')
        .insert(slice as unknown as Json[]);

src/app/api/import/commit/route.ts:853-855:
        const { error: insertErr } = await supabase
          .from('committed_data')
          .insert(slice);
```

So there are THREE distinct committed_data insert sites, against the declared expectation of one:

```
src/lib/sci/commit-content-unit.ts:204-208
// ============================================================
// commitContentUnit — sole committed_data write surface
// ============================================================

export async function commitContentUnit(
```

Status of the two extra paths:
- `src/app/api/import/commit/route.ts:853-855` — live route; `src/app/data/import/enhanced/page.tsx:69` comment: `// directCommitImportDataAsync removed — now uses server-side /api/import/commit`.
- `src/lib/supabase/data-service.ts:167` (`writeCommittedData`, defined :139) — internal callers only: `importWithEntityResolution` (data-service.ts:349) and `directCommitImportDataAsync` (data-service.ts:768); grep found NO callers of either outside data-service.ts (dormant export).

Complete file-level list of src/ files touching `from('committed_data')` (readers + writers, 23 files):

```
src/app/operate/page.tsx
src/app/operate/calculate/page.tsx
src/app/perform/statements/page.tsx
src/app/api/periods/detect/route.ts
src/app/api/periods/create-from-data/route.ts
src/app/api/financial/data/route.ts
src/app/api/intelligence/wire/route.ts
src/app/api/platform/observatory/route.ts
src/app/api/calculation/run/route.ts
src/app/api/import/commit/route.ts
src/app/api/plan-readiness/route.ts
src/lib/intelligence/convergence-service.ts
src/lib/financial/financial-data-service.ts
src/lib/intelligence/state-reader.ts
src/lib/sci/entity-resolution.ts
src/lib/sci/tenant-context.ts
src/lib/sci/commit-content-unit.ts
src/lib/sci/calc-time-entity-resolution.ts
src/lib/sci/post-commit-construction.ts
src/lib/supabase/data-service.ts
src/lib/calculation/run-calculation.ts
src/lib/data/platform-queries.ts
src/lib/data/page-loaders.ts
```

#### completed_at — why it is null on sci-bulk batches

```
src/lib/sci/commit-content-unit.ts:455-462
  // Finalize batch.
  await supabase
    .from('import_batches')
    .update({
      status: 'completed',
      row_count: totalInserted,
    })
    .eq('id', batchId);
```

`completed_at` IS set by the other two paths (`src/app/api/import/commit/route.ts:994`, `src/lib/supabase/data-service.ts:121`) but not by the sci-bulk finalize above — consistent with all top-10 batches (all `source: "sci-bulk"`) having `completed_at: null`.

Duplicate-guard note: grep of execute-bulk/commit-content-unit for `duplicate|alreadyCommitted|fingerprint` shows the "duplicate" work (HF-257/AP-17) addresses duplicate plan-interpretation execution within a session; no commit guard keyed on `contentUnitId` was found, consistent with the observed cross-proposal double-commit of the same contentUnitId (proposals b4c64b88 @15:21 and d8085364 @16:24, gap 62.8 min, 160,443 rows each). Minor: comment block at `src/lib/sci/commit-content-unit.ts:14` references `execute/route.ts` pipelines; `src/app/api/import/sci/` contains no `execute/` directory (only execute-bulk and supporting routes).

**GAP TO DEMO BAR:**
- Import scale anchor: none — 15-file, 162,927-row single-session import is live with per-file declared==committed accounting and a 396.0s write window on the 160,443-row file.
- Multi-file single-batch: none — 28 proposal groups with >=3 files; the data model is N import_batches rows sharing metadata.proposalId.
- Calculation at volume: "Import proven at ~162k; calculation at volume: NOT YET EXECUTED." The anchor tenant (3d354bfa) has periods=0, rule_set_assignments=0, calculation_batches=0, calculation_results=0; committed rows have period_id NULL (160,443/160,443) and entity_id NULL (160,353/160,443). All required services/routes exist (periods detect/create-from-data, calc-time entity resolution, /api/calculation/run); what is missing is an executed run.
- AP-17 one-projection-path: commitContentUnit is the declared sole write surface but two additional insert sites exist (one live route, one dormant library function).

**EFFORT SHAPE:**
- Import side: **E0 — none.** Routes/services proven live: `/api/import/sci/execute-bulk` -> `commitContentUnit` -> `import_batches` + `committed_data`.
- Calculation side: **E1 VERIFY-ONLY** — remaining proof is an architect browser run against tenant 3d354bfa composing existing routes (`/api/periods/detect` or `/api/periods/create-from-data`, rule-set assignment for the tenant's 1 existing rule_set, `/api/calculation/run`), observed in `calculation_batches.started_at/completed_at` + `calculation_results` row count. Escalates toward E3 only if period/entity binding fails at this volume during that run.

# A3 — Cross-file entity resolution

**CURRENT STATE:** Cross-file entity resolution exists and is verified working in code and live DB. The mechanism is `resolveEntitiesFromCommittedData()` (`src/lib/sci/entity-resolution.ts:27`), invoked from both import endpoints via `executePostCommitConstruction()` (`src/lib/sci/post-commit-construction.ts`) and again at calculation time via `resolveEntitiesAtCalcTime()` (`src/lib/sci/calc-time-entity-resolution.ts`) — defense in depth, mutually idempotent. The identifier model is a SINGLE source key per entity: `entities.external_id` (text); cross-file resolution is exact-match (trimmed string) on that key across all import batches of a tenant, deduping against existing `entities` rows and back-linking `committed_data.entity_id` across ALL batches. There is no multi-identifier/alias storage for entities — `alias_registry` is reference-item-scoped (FK `reference_item_id`), not entity-scoped. Live DB for the most recent multi-file tenant (`336af2a7-e9b3-445e-abea-85792afa893d`, 4 batches): 44 entities, 44 distinct external_ids (zero duplicate entity rows per key), 40 of 44 entities span >=2 import batches, and 0 of 3,244 committed_data rows are unlinked.

**EVIDENCE:**

Grep file list (complete, 51 files) — run from `web/`:

```
$ grep -rni "dedup\|entity.*match\|resolveEntity\|entity_identifier" src/ --include="*.ts" -l
src/types/convergence-bindings.ts
src/types/user-import.ts
src/types/compensation-plan.ts
src/app/api/reconciliation/compare/route.ts
src/app/api/reconciliation/run/route.ts
src/app/api/periods/create-from-data/route.ts
src/app/api/ingest/event/route.ts
src/app/api/calculation/run/route.ts
src/app/api/import/commit/route.ts
src/app/api/import/sci/execute-bulk/route.ts
src/app/api/import/sci/analyze/route.ts
src/lib/reconciliation/report-engine.ts
src/lib/reconciliation/benchmark-intelligence.ts
src/lib/reconciliation/comparison-engine.ts
src/lib/data-architecture/transform-pipeline.ts
src/lib/reconciliation/comparison-depth-engine.ts
src/lib/reconciliation/engine.ts
src/lib/ingestion/validation-service.ts
src/lib/data-architecture/types.ts
src/lib/normalization/dictionary-seeder.ts
src/lib/intelligence/state-reader.ts
src/lib/intelligence/convergence-service.ts
src/lib/intelligence/__tests__/binding-completeness.test.ts
src/lib/auth/resolve-identity.ts
src/lib/auth/auth-logger.ts
src/lib/signals/stream-signals.ts
src/lib/sci/source-date-extraction.ts
src/lib/sci/negotiation.ts
src/lib/sci/field-identities.ts
src/lib/sci/plan-interpretation.ts
src/lib/sci/plan-idempotency.ts
src/lib/sci/weight-evolution.ts
src/lib/sci/post-commit-construction.ts
src/lib/sci/agents.ts
src/lib/sci/import-interaction-signals.ts
src/lib/sci/commit-content-unit.ts
src/lib/sci/tenant-context.ts
src/lib/sci/sci-types.ts
src/lib/sci/entity-resolution.ts
src/lib/sci/calc-time-entity-resolution.ts
src/lib/forensics/ai-forensics.ts
src/lib/agents/reconciliation-agent.ts
src/lib/supabase/calculation-service.ts
src/lib/supabase/auth-service.ts
src/lib/calculation/run-calculation.ts
src/lib/supabase/rule-set-service.ts
src/lib/import-pipeline/import-service.ts
src/lib/ai/providers/anthropic-adapter.ts
src/lib/data/intelligence-stream-loader.ts
src/lib/user-import/identity-resolution.ts
src/lib/validation/ob02-validation.ts
```

Core resolution function — signature and identifier-column selection (the cross-file keying decision):

```
src/lib/sci/entity-resolution.ts:27-30
export async function resolveEntitiesFromCommittedData(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<{ created: number; updated: number; linked: number }> {
```

```
src/lib/sci/entity-resolution.ts:85-124
      const recordedIdField = (meta.entity_id_field as string | null | undefined) ?? null;
      if (recordedIdField && typeof recordedIdField === 'string' && recordedIdField.length > 0) {
        idColumn = recordedIdField;
      }

      // Primary fallback: field_identities (DS-009)
      const fieldIds = meta.field_identities as Record<string, {
        structuralType?: string;
        contextualIdentity?: string;
      }> | undefined;

      if (fieldIds && Object.keys(fieldIds).length > 0) {
        // HF-263 (corrected): Korean Test — select by structuralType ONLY. The prior
        // `contextualIdentity.toLowerCase().includes('person')` content-matching (on both the
        // identifier and name selection) was a hardcoded-vocabulary violation and is removed.
        // entity_id_field (above) remains the authoritative override; these are first-match
        // structural fallbacks.
        // Name: first name column
        if (!nameColumn) {
          for (const [colName, fi] of Object.entries(fieldIds)) {
            if (fi.structuralType === 'name') {
              nameColumn = colName;
              break;
            }
          }
        }
        // Fallback within field_identities. HF-268 A2: an event unit (transaction/target) must
        // discover entities from its reference_key (the entity pointer), NEVER its identifier (the
        // event ID — keying on it created 170 phantom entities from CRP transaction_ids). When no
        // reference_key is present, idColumn stays null → no entities (calc-time resolution, OB-183).
        // Entity/reference units keep identifier-based discovery (the identifier IS the entity).
        if (!idColumn) {
          const fallbackType = isEventUnit ? 'reference_key' : 'identifier';
          for (const [colName, fi] of Object.entries(fieldIds)) {
            if (fi.structuralType === fallbackType) {
              idColumn = colName;
              break;
            }
          }
        }
      }
```

Cross-file dedup (Step 3) — exact-match on `external_id` against existing entities of the tenant:

```
src/lib/sci/entity-resolution.ts:262-278
  // Step 3: Dedup against existing entities
  const existingMap = new Map<string, string>();
  const allExtIds = Array.from(allEntities.keys());
  for (let i = 0; i < allExtIds.length; i += BATCH_SIZE) {
    const slice = allExtIds.slice(i, i + BATCH_SIZE);
    const { data: existing } = await supabase
      .from('entities')
      .select('id, external_id')
      .eq('tenant_id', tenantId)
      .in('external_id', slice);

    if (existing) {
      for (const e of existing) {
        if (e.external_id) existingMap.set(e.external_id, e.id);
      }
    }
  }
```

Cross-file back-link (Step 6) — links rows in ALL batches (including transaction/target files) to the one entity per key:

```
src/lib/sci/entity-resolution.ts:407-431
  // Step 6: Backfill entity_id on ALL committed_data rows across ALL batches
  // (not just discovery batches — transaction/target batches also need entity_id)
  let linked = 0;
  for (const [batchId, { idColumn }] of Array.from(batchIdentifiers.entries())) {
    while (true) {
      const { data: unlinkeds } = await supabase
        .from('committed_data')
        .select('id, row_data')
        .eq('tenant_id', tenantId)
        .eq('import_batch_id', batchId)
        .is('entity_id', null)
        .limit(500);

      if (!unlinkeds || unlinkeds.length === 0) break;

      const updatesByEntityUuid = new Map<string, string[]>();
      for (const row of unlinkeds) {
        const rd = row.row_data as Record<string, unknown>;
        const extId = String(rd[idColumn] ?? '').trim();
        const entityUuid = entityLookup.get(extId);
        if (entityUuid) {
          if (!updatesByEntityUuid.has(entityUuid)) updatesByEntityUuid.set(entityUuid, []);
          updatesByEntityUuid.get(entityUuid)!.push(row.id);
        }
      }
```

Call sites (both import paths + calc time):

```
$ grep -rn "resolveEntitiesFromCommittedData\|resolveEntityAtCalcTime\|calc-time-entity-resolution\|entity-resolution" src/ --include="*.ts" | grep -v "^src/lib/sci/entity-resolution.ts\|^src/lib/sci/calc-time-entity-resolution.ts"
src/app/api/calculation/run/route.ts:43:import { resolveEntitiesAtCalcTime } from '@/lib/sci/calc-time-entity-resolution';
src/lib/sci/post-commit-construction.ts:15: *     resolveEntitiesFromCommittedData which uses structural identifiers
src/lib/sci/post-commit-construction.ts:22: * Idempotent: safe to call repeatedly; resolveEntitiesFromCommittedData
src/lib/sci/post-commit-construction.ts:27:import { resolveEntitiesFromCommittedData } from './entity-resolution';
src/lib/sci/post-commit-construction.ts:59:    const result = await resolveEntitiesFromCommittedData(supabase, tenantId);
src/lib/sci/post-commit-construction.ts:68:    // Runs AFTER resolveEntitiesFromCommittedData so both 'individual' (employee) and
src/lib/sci/post-commit-construction.ts:74:    // resolveEntitiesFromCommittedData failed (non-blocking):
src/lib/user-import/index.ts:8:export * from './identity-resolution';

$ grep -rn "post-commit-construction\|runPostCommitConstruction" src/ --include="*.ts" | grep -v "^src/lib/sci/post-commit-construction.ts"
src/app/api/import/sci/execute-bulk/route.ts:29:import { executePostCommitConstruction } from '@/lib/sci/post-commit-construction';
src/app/api/import/sci/execute-bulk/route.ts:891:// `@/lib/sci/post-commit-construction`. It carried Korean-Test violations
```

Calc-time wrapper (idempotent second pass):

```
src/lib/sci/calc-time-entity-resolution.ts:53-57, 90-92
export async function resolveEntitiesAtCalcTime(
  tenantId: string,
  supabase: SupabaseClient,
): Promise<CalcTimeEntityResolutionResult> {
  ...
  // Delegate structural matching to existing library function (Korean Test compliant)
  try {
    await resolveEntitiesFromCommittedData(supabase, tenantId);
```

Identifier model per SCHEMA_REFERENCE_LIVE.md (generated 2026-03-18): `entities` carries ONE `external_id` (text, nullable); `alias_registry` maps `alias_text`/`alias_normalized` → `reference_item_id` (NOT an entity FK):

```
SCHEMA_REFERENCE_LIVE.md — entities (11 columns): id, tenant_id, entity_type, status,
external_id (text, YES), display_name, profile_id, temporal_attributes, metadata,
created_at, updated_at

SCHEMA_REFERENCE_LIVE.md — alias_registry (12 columns): id, tenant_id,
reference_item_id (uuid, NO), alias_text, alias_normalized, confidence,
confirmation_count, source, scope, metadata, created_at, updated_at
```

DB probe script: `web/scripts/diag/diag063_a3_cross_file_entity_resolution.ts` (SELECT-only; tenant UUIDs only; no display_name/file_name/row_data values printed). Verbatim output:

```
$ cd /Users/AndrewAfrica/spm-platform/web && set -a && source .env.local && set +a && npx tsx scripts/diag/diag063_a3_cross_file_entity_resolution.ts
tenant=336af2a7-e9b3-445e-abea-85792afa893d import_batches_in_window=4
  batch=26e4f11f-d324-4fa2-bead-39a88bc4937c status=completed row_count=3200 created_at=2026-06-12T21:48:45.847614+00:00
  batch=96d0f8b4-7b7a-4b1d-a484-a9095fb271ce status=failed row_count=3200 created_at=2026-06-12T21:48:17.052406+00:00
  batch=087feca1-db26-41e4-a251-c703c4b78835 status=completed row_count=4 created_at=2026-06-12T21:48:15.957877+00:00
  batch=87f70f5f-355e-4769-ab76-0e717d7e06e5 status=completed row_count=40 created_at=2026-06-12T21:48:14.103775+00:00
entities_total=44
entities_with_external_id=44 distinct_external_ids=44 external_ids_mapping_to_multiple_entity_rows=0 entities_null_or_empty_external_id=0
entities_with_nonempty_metadata=40 metadata_keycount_histogram=[[1,40],[0,4]]
committed_data_rows=3244 rows_linked_to_entity=3244 rows_entity_id_null=0
entities_referenced_in_committed_data=44 entities_spanning_ge2_import_batches=40
entity_batch_span_histogram=[[1,4],[2,40]]
alias_registry_rows_for_tenant=0
```

Supplement script: `web/scripts/diag/diag063_a3_entity_type_distribution.ts`. Verbatim output:

```
$ npx tsx scripts/diag/diag063_a3_entity_type_distribution.ts
tenant=336af2a7-e9b3-445e-abea-85792afa893d entity_type/status distribution:
  individual/active=44
```

Reading of the DB result (counts requested by the probe):
- Total entities: 44. Entities with >=2 distinct source keys AS STORED: 0 — the identifier model stores exactly one source key (`external_id`) per entity row, so multi-key storage is structurally impossible; 44/44 external_ids are distinct (perfect dedup, zero duplicate entity rows per key).
- Cross-FILE resolution measured via linkage: 40 of 44 entities have committed_data rows spanning 2 distinct import batches (roster batch of 40 rows + transaction batch of 3,200 rows); 3,244/3,244 rows linked, 0 NULL `entity_id`.
- Duplicate-execution adjacency: the failed batch `96d0f8b4` (row_count=3200) was retried 29s later as completed `26e4f11f` (row_count=3200); committed_data totals 3,244 = 3,200 + 40 + 4 — the failed attempt contributed zero committed rows and zero duplicate entities (consistent with the belief-register item "duplicate execution solved").

The `metadata_keycount_histogram=[[1,40],[0,4]]` (40 entities with one metadata key) is explained by a separate enrichment writer, not a second identifier:

```
src/lib/sci/store-metadata-population.ts:13-15, 28-31
 * Reads from the unit's parsed rows (server-side parse — the bulk
 * transport model has rows by sheet, not by content unit). Updates
 * entities.metadata with store_id, volume_tier, volume_key.
...
const STORE_FIELDS = ['storeId', 'num_tienda', 'No_Tienda', 'Tienda'];
const TIER_FIELDS = ['store_volume_tier', 'Rango_Tienda', 'Rango de Tienda'];
const VOLUME_KEY_FIELDS = ['LLave Tamaño de Tienda'];
```

Adjacent-arm sweep for an entity alias/crosswalk mechanism (different key systems per file):

```
$ grep -rni "crosswalk\|alias" src/ --include="*.ts" -l   (23 files; none implement an entity-keyed alias map)
src/middleware.ts, src/app/api/lifecycle/transition/route.ts, src/app/api/import/sci/session-state/route.ts,
src/app/api/import/sci/execute-bulk/route.ts, src/app/api/import/sci/analyze/route.ts, src/lib/financial/types.ts,
src/lib/financial/articulos-parser.ts, src/lib/financial/cheque-parser.ts, src/lib/auth/server-auth.ts,
src/lib/auth/resolve-identity.ts, src/lib/auth/permissions.ts, src/lib/auth/__tests__/resolve-identity.test.ts,
src/lib/sci/comprehension-state-service.ts, src/lib/sci/sci-types.ts, src/lib/navigation/workspace-config.ts,
src/lib/supabase/data-service.ts, src/lib/supabase/database.types.ts, src/lib/supabase/auth-service.ts,
src/lib/supabase/calculation-service.ts, src/lib/compensation/ai-plan-interpreter.ts,
src/lib/calculation/results-formatter.ts, src/lib/ai/providers/anthropic-adapter.ts,
src/lib/import-pipeline/smart-mapper.ts
```

`alias_registry` is reference-item scoped (schema above) and holds 0 rows for the probed tenant. No entity-scoped alias/crosswalk table or service was located.

**GAP TO DEMO BAR:** None for same-key cross-file resolution — the mechanism is located, called from both import endpoints and at calc time, and live DB shows 40/44 entities resolved across a 40-row entity file and a 3,200-row transaction file with zero duplicates and zero unlinked rows. Two boundary notes: (1) the model stores a single `external_id` per entity, so files that key the same person with DIFFERENT identifier systems (e.g., employee number in one file, a different code in another) have no located bridging mechanism (entity-scoped alias map does not exist; `alias_registry` is reference-item scoped); (2) matching is `String(...).trim()` exact-match — no case/format normalization of the key value.

**EFFORT SHAPE:** E0 — none for same-key cross-file resolution (services: `entity-resolution.ts`, `post-commit-construction.ts`, `calc-time-entity-resolution.ts`; routes: `/api/import/sci/execute-bulk`, `/api/calculation/run`; tables: `entities`, `committed_data`, `import_batches`). IF the MIR demo dataset keys entities differently across files, cross-key bridging is E4 (net-new entity-identifier mapping table + resolver extension in `entity-resolution.ts` Steps 2-3) — verify the dataset's key consistency first.

# A4 — Multi-tab XLSX

**CURRENT STATE:** Multi-tab XLSX handling is implemented and live across every server-side ingestion path: the legacy commit route, the SCI worker, and the SCI bulk route each iterate `workbook.SheetNames` in full and parse every sheet via `sheet_to_json`. The SCI architecture decomposes a multi-tab file into one content unit per sheet, committing each as its own `import_batches` row (linked by `file_hash_sha256`), with the sheet recorded in `committed_data.row_data._sheetName`; the legacy commit path keeps all sheets in one batch and records `metadata.source_sheet`. DB evidence confirms live multi-tab imports: 24 of 39 (tenant, source_file) groups in `classification_signals` span >=2 distinct `sheet_name` values (max 34 sheets in one file), and the largest file-hash group yielded 16 distinct content units across 26 completed batches totaling 325,757 rows. The calculation engine consumes the per-sheet structure (sheet-aware metric grouping and roster detection), proving multi-sheet data flows end-to-end.

**EVIDENCE:**

## 1. Sheet iteration sites — file-level sweep (complete; E952)

```
$ cd /Users/AndrewAfrica/spm-platform/web && grep -rni "SheetNames\|worksheets\|sheet_to_json" src/ --include="*.ts" -l
src/app/api/calculation/run/route.ts
src/app/api/import/commit/route.ts
src/app/api/import/sci/execute-bulk/route.ts
src/app/api/import/sci/retry-unit/route.ts
src/app/api/import/sci/process-job/route.ts
src/lib/reconciliation/smart-file-parser.ts
src/lib/sci/plan-interpretation.ts
src/lib/calculation/run-calculation.ts
src/lib/import-pipeline/file-parser.ts
```

Per-file hit counts (49 line-level hits total):

```
$ grep -rni "SheetNames\|worksheets\|sheet_to_json" src/ --include="*.ts" -c | grep -v ":0$"
src/app/api/calculation/run/route.ts:6
src/app/api/import/commit/route.ts:2
src/app/api/import/sci/execute-bulk/route.ts:2
src/app/api/import/sci/retry-unit/route.ts:1
src/app/api/import/sci/process-job/route.ts:2
src/lib/reconciliation/smart-file-parser.ts:12
src/lib/sci/plan-interpretation.ts:7
src/lib/calculation/run-calculation.ts:6
src/lib/import-pipeline/file-parser.ts:11
```

Arm classification (all 9 sites):
- **Ingestion, iterates ALL sheets:** `api/import/commit/route.ts` (one batch, all sheets), `api/import/sci/process-job/route.ts` (SCI worker), `api/import/sci/execute-bulk/route.ts` (per-file sheet map), `lib/sci/plan-interpretation.ts` (all plan-workbook sheets, optionally filtered to plan-unit tabNames).
- **Ingestion, single-sheet by design:** `api/import/sci/retry-unit/route.ts` (re-parses exactly the named sheet of one unit).
- **Client-side parser:** `lib/import-pipeline/file-parser.ts` (enumerates all worksheets into `WorksheetInfo[]`, parses the selected or first sheet; exposes `getExcelWorksheets`).
- **Reconciliation arm:** `lib/reconciliation/smart-file-parser.ts` (defaults `activeSheet = sheetNames[0]`; workbook retained "for sheet switching").
- **Consumption (calc engine):** `lib/calculation/run-calculation.ts` and `api/calculation/run/route.ts` (sheet-aware metric grouping + multi-sheet roster detection).

## 2. Handling excerpts

`src/app/api/import/commit/route.ts:140` — legacy commit path: full SheetNames loop, one batch:

```ts
    const sheetData: SheetData[] = [];
    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
        defval: null,
        raw: true,
      });

      if (rows.length === 0) continue;

      // Apply field mappings from client metadata
      const mappings = sheetMappings?.[sheetName];

      // If no explicit mappings, auto-detect via raw column headers
      if (!mappings || Object.keys(mappings).length === 0) {
        const headers = Object.keys(rows[0]);
        const autoMappings: Record<string, string> = {};
        for (const h of headers) {
          autoMappings[h] = h; // identity mapping — entity ID fields auto-detected below
        }
        sheetData.push({ sheetName, rows, mappings: autoMappings });
      } else {
        sheetData.push({ sheetName, rows, mappings });
      }
    }

    console.log(`[ImportCommit] Parsed ${sheetData.length} sheets, ${sheetData.reduce((n, s) => n + s.rows.length, 0)} total rows`);
```

`src/app/api/import/sci/process-job/route.ts:105` — SCI worker: full SheetNames loop with per-sheet fingerprint/flywheel:

```ts
    for (const sheetName of workbook.SheetNames) {
      const ws = workbook.Sheets[sheetName];
      if (!ws) continue;
      const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
      const columns = jsonData.length > 0 ? Object.keys(jsonData[0]) : [];
      sheets.push({ sheetName, columns, rows: jsonData, totalRowCount: jsonData.length });
    }

    console.log(`[SCI-WORKER] Job ${jobId.substring(0, 8)}: Parsed ${sheets.reduce((s, sh) => s + sh.totalRowCount, 0)} rows across ${sheets.length} sheets`);

    // HF-197B: per-sheet fingerprint computation (was: single H(sheets[0]) for entire job).
    ...
    // Per-sheet flywheel lookup (DIAG-021 H3 fix). Each sheet hashes its own columns/rows.
    const sheetFlywheelResults = new Map<string, FlywheelLookupResult>();
    for (const sheet of sheets) {
```

`src/app/api/import/sci/execute-bulk/route.ts:192` — SCI bulk: per-file sheet map (format-aware; documents skip workbook parse):

```ts
      if (isSpreadsheetPath(path)) {
        const XLSX = await import('xlsx');
        const workbook = XLSX.read(buffer, { type: 'array' });
        for (const sheetName of workbook.SheetNames) {
          const ws = workbook.Sheets[sheetName];
          if (!ws) continue;
          const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
          const columns = jsonData.length > 0 ? Object.keys(jsonData[0]) : [];
          sheetDataMap.set(sheetName, { rows: jsonData, columns });
        }
      } else {
        console.log(`[SCI Bulk] HF-256: document file (.${extensionOf(path)}) — skipping workbook parse; plan unit routes to format-aware plan pipeline`);
      }
      const fileTotalRows = Array.from(sheetDataMap.values()).reduce((s, d) => s + d.rows.length, 0);
      console.log(`[SCI Bulk] ${fileName}: parsed ${fileTotalRows} rows across ${sheetDataMap.size} sheets in ${Date.now() - parseStart}ms`);
```

`src/lib/sci/commit-content-unit.ts:246` — SCI commits ONE import_batch PER content unit (sheet/tab), file-linked by `file_hash_sha256`:

```ts
  const batchId = crypto.randomUUID();

  await supabase.from('import_batches').insert({
    id: batchId,
    tenant_id: tenantId,
    file_name: fileName,
    file_type: 'sci',
    status: 'processing',
    row_count: rows.length,
    // HF-196 Phase 1F — file-level hash retained for audit (supersedure trigger
    // moved to content_unit_hash_sha256 at HF-213).
    file_hash_sha256: fileHashSha256,
    content_unit_hash_sha256: contentUnitHashSha256,
    metadata: {
      source,
      proposalId,
      contentUnitId: unit.contentUnitId,
      classification,
    } as unknown as Json,
  });
```

`src/lib/sci/commit-content-unit.ts:373` — SCI records the tab in `row_data._sheetName` (metadata has no `source_sheet` key):

```ts
    return {
      tenant_id: tenantId,
      import_batch_id: batchId,
      entity_id: null as string | null,
      period_id: null as string | null,
      source_date: sourceDate,
      data_type: dataType,
      row_data: { ...row, _sheetName: tabName, _rowIndex: i },
      metadata: {
        source,
        proposalId,
        semantic_roles: semanticRoles,
        resolved_data_type: dataType,
        entity_id_field: entityIdField,
        informational_label: classification,
        field_identities: fieldIdentities,
      },
    };
```

`src/app/api/import/commit/route.ts:838` — legacy path records `metadata.source_sheet` (second writer: `src/lib/supabase/data-service.ts:763`):

```ts
        return {
          tenant_id: tenantId,
          import_batch_id: batchId,
          entity_id: entityId,
          period_id: periodId,
          data_type: resolveDataType(sheet.sheetName),
          row_data: { ...content, _sheetName: sheet.sheetName, _rowIndex: i },
          metadata: { source_sheet: sheet.sheetName, resolved_data_type: resolveDataType(sheet.sheetName) },
        };
```

```
$ grep -rn "source_sheet" src/ --include="*.ts"
src/app/api/import/commit/route.ts:846:          metadata: { source_sheet: sheet.sheetName, resolved_data_type: resolveDataType(sheet.sheetName) },
src/lib/supabase/data-service.ts:763:        metadata: { source_sheet: sheet.sheetName },
```

`src/lib/calculation/run-calculation.ts:1222` — consumption side: multi-sheet roster detection (parent-sheet `__` convention + keyword fallback):

```ts
  // OB-147: Enhanced roster identification — three-tier detection:
  //   1. AI context: sheet classified as 'roster' or 'entity_data'
  //   2. Parent sheet heuristic: sheet whose name is a prefix of others (via __ separator)
  //   3. Keyword fallback: sheet name contains known roster terms
  const allSheetNames = new Set<string>();
  for (const [, sheetMap] of Array.from(dataByEntity.entries())) {
    for (const sheetName of Array.from(sheetMap.keys())) {
      allSheetNames.add(sheetName);
    }
  }

  let rosterSheetName: string | null = null;

  // Tier 2: Parent sheet heuristic — a sheet is a "parent" if other sheets
  // start with its name + "__". This is the import convention for multi-tab files.
  if (!rosterSheetName && allSheetNames.size > 1) {
    for (const candidate of Array.from(allSheetNames)) {
      const prefix = candidate + '__';
      const isParent = Array.from(allSheetNames).some(s => s.startsWith(prefix));
      if (isParent) {
        rosterSheetName = candidate;
        ...
```

`src/lib/reconciliation/smart-file-parser.ts:117` — reconciliation arm: first sheet is the default active sheet (workbook retained for sheet switching):

```ts
  const sheetNames = workbook.SheetNames;
  if (sheetNames.length === 0) {
    ...
  }

  const activeSheet = sheetNames[0];
  const { headers, rows } = extractSheetData(workbook, activeSheet);

  // Attach workbook for sheet switching (not serialized)
```

## 3. DB evidence (read-only; counts, UUIDs, statuses, timestamps only)

Script: `web/scripts/diag/diag063_a4_multisheet.ts` — Q1 groups `classification_signals` by (tenant_id, source_file_name) counting distinct `sheet_name`; Q2 inspects the 12 most recent `import_batches` for distinct `committed_data.metadata->>source_sheet` (distinct values discovered structurally via iterative `.neq` exclusion; sheet/file names never printed).

```
$ cd /Users/AndrewAfrica/spm-platform/web && set -a && source .env.local && set +a && npx tsx scripts/diag/diag063_a4_multisheet.ts
[Q1] classification_signals rows with sheet_name NOT NULL: 1330
[Q1] signals fetched for grouping: 1330 (cap 10000)
[Q1] distinct (tenant, source_file) groups: 39
[Q1] groups with >=2 distinct sheet_name values: 24
[Q1]   multi_file_1: tenant=24103940-ab33-4a21-b6fd-bd1042f4762c distinct_sheets=34 signals=77
[Q1]   multi_file_2: tenant=3d354bfa-b298-48dd-88a0-9f8c5a00be4e distinct_sheets=16 signals=411
[Q1]   multi_file_3: tenant=3d354bfa-b298-48dd-88a0-9f8c5a00be4e distinct_sheets=16 signals=80
[Q1]   multi_file_4: tenant=24103940-ab33-4a21-b6fd-bd1042f4762c distinct_sheets=16 signals=96
[Q1]   multi_file_5: tenant=dbe3b308-1483-4cd8-8032-6fdd4a8a8f5c distinct_sheets=16 signals=32
[Q1]   multi_file_6: tenant=1b770e90-9ad9-44ba-b66b-152f71c40b9a distinct_sheets=6 signals=23
[Q1]   multi_file_7: tenant=24103940-ab33-4a21-b6fd-bd1042f4762c distinct_sheets=5 signals=75
[Q1]   multi_file_8: tenant=24103940-ab33-4a21-b6fd-bd1042f4762c distinct_sheets=5 signals=30
[Q1]   multi_file_9: tenant=24103940-ab33-4a21-b6fd-bd1042f4762c distinct_sheets=5 signals=40
[Q1]   multi_file_10: tenant=336af2a7-e9b3-445e-abea-85792afa893d distinct_sheets=3 signals=22
```

Q2 (same run; 12 most recent batches): every batch returned `distinct_source_sheets=0` with `rows_without_source_sheet` equal to its committed row count (e.g. `batch=26e4f11f-d324-4fa2-bead-39a88bc4937c ... row_count=3200 ... distinct_source_sheets=0 rows_without_source_sheet=3200`) — consistent with the SCI writer recording the sheet in `row_data._sheetName` rather than `metadata.source_sheet` (code excerpts above). One inspected batch was `status=failed` with 0 committed rows (`96d0f8b4-7b7a-4b1d-a484-a9095fb271ce`, row_count=3200).

Script: `web/scripts/diag/diag063_a4_multisheet_db2.ts` — Q3 groups recent `import_batches` by (tenant_id, file_hash_sha256); Q4 counts distinct `row_data->>_sheetName` per recent batch.

```
$ npx tsx scripts/diag/diag063_a4_multisheet_db2.ts   (env-sourced as above)
[Q3] import_batches fetched: 115 (file_hash_sha256 column EXISTS — diverges from SCHEMA_REFERENCE_LIVE.md 11-column listing)
[Q3] distinct (tenant, file_hash) groups with hash present: 23
[Q3] groups with >1 batch (multi content-unit source files): 14
[Q3] multi_unit_file_1: tenant=3d354bfa-b298-48dd-88a0-9f8c5a00be4e file_hash=eeff4e108e77… batches=26 total_rows=325757 window=2026-06-12T15:21:43.941371+00:00 → 2026-06-12T16:32:13.09035+00:00
[Q3] multi_unit_file_2: tenant=24103940-ab33-4a21-b6fd-bd1042f4762c file_hash=6251cf3878fe… batches=12 total_rows=1216 window=2026-06-11T22:05:46.974782+00:00 → 2026-06-11T23:52:17.637755+00:00
[Q3] multi_unit_file_3: tenant=1f4f0511-6371-4458-9013-125ebdf5f735 file_hash=3203eb8f23e2… batches=10 total_rows=12932 window=2026-06-12T21:15:50.208905+00:00 → 2026-06-12T21:32:39.79473+00:00
[Q3] multi_unit_file_4: tenant=24103940-ab33-4a21-b6fd-bd1042f4762c file_hash=d525bd57a989… batches=9 total_rows=912 ...
[Q3] multi_unit_file_5: tenant=24103940-ab33-4a21-b6fd-bd1042f4762c file_hash=a0212f4321b6… batches=9 total_rows=912 ...
[Q3] multi_unit_file_6: tenant=24103940-ab33-4a21-b6fd-bd1042f4762c file_hash=bd489d9cc9d3… batches=7 total_rows=309 ...
(per-group batch UUID lists in run output; e.g. multi_unit_file_1 includes batch=426b962a-8286-4191-96a3-ee7f98e95d63, batch=ab2cb493-c03f-4a46-b770-72392fffc037, batch=eb3d03c9-5adc-4b73-a2b2-31210d4bb641, ...)

[Q4] recent batches inspected for row_data->>_sheetName: 8
[Q4] batch=26e4f11f-d324-4fa2-bead-39a88bc4937c file_type=sci status=completed row_count=3200 distinct_sheetName_values=1 tab_1=3200
[Q4] batch=96d0f8b4-7b7a-4b1d-a484-a9095fb271ce file_type=sci status=failed row_count=3200 distinct_sheetName_values=0
[Q4] batch=087feca1-db26-41e4-a251-c703c4b78835 file_type=sci status=completed row_count=4 distinct_sheetName_values=1 tab_1=4
[Q4] batch=87f70f5f-355e-4769-ab76-0e717d7e06e5 file_type=sci status=completed row_count=40 distinct_sheetName_values=1 tab_1=40
[Q4] batch=80f275dd-17b8-44a7-ae5b-9f6554d05517 file_type=sci status=completed row_count=3200 distinct_sheetName_values=1 tab_1=3200
[Q4] batch=f2c52778-8e1a-44f0-9db3-8275493a1bbd file_type=sci status=completed row_count=4 distinct_sheetName_values=1 tab_1=4
[Q4] batch=dc816820-8419-4db4-850c-fb2a6fb4b534 file_type=sci status=completed row_count=40 distinct_sheetName_values=1 tab_1=40
[Q4] batch=6267c0cf-2a73-41f5-a268-2d90c4482892 file_type=sci status=completed row_count=3200 distinct_sheetName_values=1 tab_1=3200
```

Q4 reads exactly as the code predicts: each SCI batch holds exactly ONE sheet (one content unit per batch); multi-tab files manifest as MULTIPLE batches sharing a file hash (Q3: 14 such groups). Q3's multi_unit_file_3 (10 batches in 3 waves of {40, 4, 3200} rows) corresponds to the Q2/Q4 recent-batch triplets — a 3-tab file imported repeatedly.

Script: `web/scripts/diag/diag063_a4_multisheet_db3.ts` — Q5 distinguishes distinct content units from re-processing in the largest group.

```
$ npx tsx scripts/diag/diag063_a4_multisheet_db3.ts   (env-sourced as above)
[Q5] largest group: tenant=3d354bfa-b298-48dd-88a0-9f8c5a00be4e file_hash=eeff4e108e77…
[Q5] batches=26 distinct_contentUnitIds=16
[Q5] batch statuses: completed=26
```

16 distinct content units from one source file — matching Q1's `distinct_sheets=16` for the same tenant's classification_signals file groups (multi_file_2/multi_file_3). The 26-vs-16 difference is re-processing of some units (all completed; supersession on `content_unit_hash_sha256` per `commit-content-unit.ts` excerpt above).

## 4. Reconciliation arm follow-up (sheet selection, not all-sheets)

```
$ grep -rn "activeSheet\|setActiveSheet\|switchSheet" src/ --include="*.ts" --include="*.tsx" -l
src/app/operate/reconciliation/page.tsx
src/lib/reconciliation/smart-file-parser.ts
src/lib/reconciliation/ai-column-mapper.ts
```

`src/app/operate/reconciliation/page.tsx:380` — multi-sheet ground-truth files auto-select the sheet matching the plan under reconciliation (default first sheet):

```ts
        // HF-182 Fix 12: Auto-select sheet matching the plan being reconciled
        // For multi-sheet GT files (one sheet per plan), match by plan name similarity
        let selectedSheet = workbook.SheetNames[0];
        if (workbook.SheetNames.length > 1 && selectedBatch?.ruleSetName) {
          const planNameLower = selectedBatch.ruleSetName.toLowerCase();
          const matched = workbook.SheetNames.find(s =>
            planNameLower.includes(s.toLowerCase()) || s.toLowerCase().includes(planNameLower.split(' ')[0]?.toLowerCase() ?? '')
          );
          if (matched) {
            selectedSheet = matched;
            console.log(`[Reconciliation] Sheet selection: matched "${matched}" to plan "${selectedBatch.ruleSetName}" (${workbook.SheetNames.length} sheets available)`);
          }
        }
```

## 5. Schema reference cross-check

`SCHEMA_REFERENCE_LIVE.md:132` lists `classification_signals` (20 columns) including `source_file_name` (line 145) and `sheet_name` (line 146) — both confirmed live. `SCHEMA_REFERENCE_LIVE.md:157` lists `committed_data` (10 columns) including `metadata` jsonb — confirmed. `SCHEMA_REFERENCE_LIVE.md:273` lists `import_batches` with 11 columns; live selects additionally return `file_hash_sha256` and `content_unit_hash_sha256` (observed keys; reference generated 2026-03-18, predates HF-196/HF-213).

**GAP TO DEMO BAR:** None for the capability itself — multi-tab XLSX parsing, per-sheet classification, per-sheet commit, and sheet-aware calculation are all live with banked DB evidence from multiple tenants (files with up to 34 classified sheets; a 16-unit file committing 325,757 rows). Two recording-shape notes for demo narration accuracy: (a) the active SCI path records the sheet in `row_data._sheetName` with one batch per sheet, while `metadata.source_sheet` is only written by the legacy commit path — queries keyed on `metadata.source_sheet` see nothing for SCI imports; (b) the reconciliation arm is selection-based, not all-sheets: multi-sheet ground-truth files auto-select the sheet matching the plan under reconciliation (HF-182 Fix 12, excerpt in section 4), defaulting to the first sheet.

**EFFORT SHAPE:** E0 — none. Existing structures carry the capability end-to-end: routes `api/import/sci/execute-bulk`, `api/import/sci/process-job`, `api/import/commit`; services `lib/sci/commit-content-unit.ts`, `lib/sci/plan-interpretation.ts`, `lib/import-pipeline/file-parser.ts`; tables `import_batches` (file_hash_sha256 / content_unit_hash_sha256), `committed_data` (row_data._sheetName / metadata.source_sheet), `classification_signals` (sheet_name, source_file_name). Optional E1-style confirmation: architect uploads a multi-tab workbook in the demo tenant and observes one content unit per tab in the SCI surface.

# A5 — Mapping confirmation gate

**CURRENT STATE:** A mapping confirmation gate exists in the enhanced import wizard: the Map step's "Next" button is disabled by `canProceed()` until `entityId` is mapped on at least one sheet (HF-066 deliberately relaxed the gate from "all plan-required fields" to "entityId only"; plan-metric gaps surface as validate-step warnings, not blockers). A second, harder gate exists on the reconciliation surface: the run-comparison button is disabled until both Entity ID and Total columns are confirmed. The validate step does not block on error-severity issues (`validationComplete` is set unconditionally; `isValid` is computed but never read as a gate), and the commit handler plus the server-side `/api/import/commit` route perform no mapping re-validation — the server falls back to identity/AI auto-mapping when mappings are absent. A standalone `ColumnMapper` component with a "Missing required fields" warning exists but has no importers (orphaned).

**EVIDENCE:**

Stated search — complete file-level enumeration (13 files):

```
$ cd /Users/AndrewAfrica/spm-platform/web && grep -rni "unmapped\|unresolved.*mapping\|mapping.*confirm" src/ --include="*.ts" --include="*.tsx" -l
src/app/operate/reconciliation/page.tsx
src/app/api/analyze-workbook/route.ts
src/app/data/import/enhanced/page.tsx
src/components/forensics/ComparisonUpload.tsx
src/lib/reconciliation/ai-column-mapper.ts
src/components/import/column-mapper.tsx
src/lib/reconciliation/benchmark-intelligence.ts
src/lib/intelligence/__tests__/binding-completeness.test.ts
src/lib/forensics/ai-forensics.ts
src/lib/ai/training-signal-service.ts
src/lib/import-pipeline/import-service.ts
src/lib/intelligence/convergence-service.ts
src/lib/ai/ai-service.ts
```

Per-file hit counts (same pattern, `-c`):

```
src/app/operate/reconciliation/page.tsx:3
src/app/api/analyze-workbook/route.ts:1
src/app/data/import/enhanced/page.tsx:14
src/components/forensics/ComparisonUpload.tsx:6
src/components/import/column-mapper.tsx:1
src/lib/reconciliation/benchmark-intelligence.ts:1
src/lib/reconciliation/ai-column-mapper.ts:3
src/lib/intelligence/__tests__/binding-completeness.test.ts:2
src/lib/intelligence/convergence-service.ts:1
src/lib/forensics/ai-forensics.ts:1
src/lib/ai/training-signal-service.ts:2
src/lib/ai/ai-service.ts:1
src/lib/import-pipeline/import-service.ts:1
```

### Gate 1 — import wizard Map step (the primary commit-path gate)

src/app/data/import/enhanced/page.tsx:2378-2402 (`canProceed`):

```tsx
  const canProceed = (): boolean => {
    switch (currentStep) {
      case 'upload':
        return false;
      case 'analyze':
        return !!analysis && analysis.sheets.length > 0;
      case 'map': {
        // HF-066 FIX: Only entityId is universally required at the mapping stage.
        // Plan component metrics (matrixConfig, tierConfig, etc.) are checked in the
        // validate step as warnings, NOT blockers here. The old check required every
        // plan-derived isRequired field to be mapped — but uploaded files may not
        // contain columns for all plan metrics, permanently blocking Next.
        const allMapped = fieldMappings.flatMap(s => s.mappings.filter(m => m.targetField));
        const mappedIds = new Set(allMapped.map(m => m.targetField));
        // entityId must be mapped somewhere across all sheets
        return mappedIds.has('entityId');
      }
      case 'validate':
        return validationComplete;
      case 'approve':
        return true;
      default:
        return false;
    }
  };
```

Button wiring — src/app/data/import/enhanced/page.tsx:4285-4292:

```tsx
          {currentStep !== 'approve' && currentStep !== 'upload' && (
            <Button onClick={goNext} disabled={!canProceed() || isProcessing}>
              {isProcessing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {currentStep === 'map' && currentMappingSheetIndex < mappableSheets.length - 1
                ? (isSpanish ? 'Siguiente Hoja' : 'Next Sheet')
                : (isSpanish ? 'Siguiente' : 'Next')}
              {!isProcessing && <ArrowRight className="h-4 w-4 ml-2" />}
            </Button>
          )}
```

The stepper cannot bypass the gate — forward jumps are disabled. src/app/data/import/enhanced/page.tsx:2523-2531:

```tsx
          const isActive = step === currentStep;
          const isPast = STEPS.indexOf(step) < STEPS.indexOf(currentStep);
          const isClickable = isPast || (step === 'analyze' && currentStep === 'map');

          return (
            <div key={step} className="flex items-center">
              <button
                onClick={() => isClickable && goToStep(step)}
                disabled={!isClickable && !isActive}
```

### Validate step — warnings, not blockers

Missing plan-required fields penalize the score and add an error-severity issue but do not block. src/app/data/import/enhanced/page.tsx:1918-1942 (excerpt 1918-1933):

```tsx
      // OB-16 Phase 4: Plan-aware required field validation
      // Check that ALL required fields from the plan are mapped at least once across all sheets
      const allMappedFields = fieldMappings.flatMap(s => s.mappings.filter(m => m.targetField));
      const mappedFieldIds = new Set(allMappedFields.map(m => m.targetField));
      const requiredFields = targetFields.filter(f => f.isRequired);
      const missingRequiredFields = requiredFields.filter(f => !mappedFieldIds.has(f.id));

      if (missingRequiredFields.length > 0) {
        // Penalize score for missing required fields
        const missingPenalty = Math.min(30, missingRequiredFields.length * 10);
        overallScore = Math.max(0, overallScore - missingPenalty);

        // Add issue to first sheet (cross-sheet issue)
        if (sheetScores.length > 0) {
          const missingNames = missingRequiredFields.map(f => isSpanish ? f.labelEs : f.label).join(', ');
          sheetScores[0].issues.push({
```

`validationComplete` is set unconditionally after the scoring pass; `isValid` is computed but never read as a gate. src/app/data/import/enhanced/page.tsx:1945-1958:

```tsx
      setValidationResult({
        isValid: overallScore >= 70,
        overallScore,
        sheetScores,
        periodInfo,
        detectedPeriods: periodDetectionResult,
        crossSheetValidation,
        anomalies,
        calculationPreview,
      });

      setIsValidating(false);
      setValidationComplete(true);
    }, 1500);
```

```
$ grep -n "setValidationComplete" src/app/data/import/enhanced/page.tsx
1122:  const [validationComplete, setValidationComplete] = useState(false);
1957:      setValidationComplete(true);
4224:                        setValidationComplete(false);

$ grep -n "isValid" src/app/data/import/enhanced/page.tsx | head -20
258:  isValid: boolean;
1124:  const [isValidating, setIsValidating] = useState(false);
1946:        isValid: overallScore >= 70,
3434:              {isValidating && (
3449:              {!isValidating && validationResult && (
```

### Commit — no mapping re-check client- or server-side

Client commit handler guards only tenant/file/analysis. src/app/data/import/enhanced/page.tsx:1962-1970:

```tsx
  const handleSubmitImport = useCallback(async () => {
    if (!tenantId) {
      setError('No tenant selected');
      return;
    }
    if (!uploadedFile || !analysis) {
      setError('No file or analysis available');
      return;
    }
```

Approve & Import button (src/app/data/import/enhanced/page.tsx:4003-4008) is gated only on `isImporting`:

```tsx
                <Button
                  size="lg"
                  className="px-8"
                  onClick={handleSubmitImport}
                  disabled={isImporting}
                >
```

Only confirmed mappings (those with `targetField`) are sent to commit; unmapped columns are preserved, not blocked. src/app/data/import/enhanced/page.tsx:2040-2047 and src/lib/import-pipeline/import-service.ts:202:

```tsx
              const confirmedMapping = fieldMappings.find(fm => fm.sheetName === `${prefix}${sheet.name}`);
              const sheetFieldMappings = confirmedMapping
                ? confirmedMapping.mappings
                    .filter(m => m.targetField)
                    .map(m => ({ sourceColumn: m.sourceColumn, semanticType: m.targetField!, confidence: m.confidence }))
```

```
src/lib/import-pipeline/import-service.ts:202:        // Keep unmapped fields with original name
```

Server-side `/api/import/commit` validates only request shape and compensates for absent mappings with auto-detection rather than rejecting:

```
$ grep -n "entityId\|required\|400\|validate\|mapping" src/app/api/import/commit/route.ts | head -12
6: * parses Excel server-side, applies field mappings, bulk inserts to DB.
23:  mappings?: Record<string, string>;
95:        { error: 'Missing required fields: tenantId, fileName, storagePath' },
96:        { status: 400 }
150:      // Apply field mappings from client metadata
151:      const mappings = sheetMappings?.[sheetName];
153:      // If no explicit mappings, auto-detect via raw column headers
154:      if (!mappings || Object.keys(mappings).length === 0) {
158:          autoMappings[h] = h; // identity mapping — entity ID fields auto-detected below
160:        sheetData.push({ sheetName, rows, mappings: autoMappings });
162:        sheetData.push({ sheetName, rows, mappings });
171:        { status: 400 }
```

### Gate 2 — reconciliation mapping confirmation (adjacent arm)

src/app/operate/reconciliation/page.tsx:476-477 (handler guard) and :1033-1035 (button gate):

```tsx
  const handleCompare = useCallback(async () => {
    if (!parsedFile || !selectedBatchId || !tenantId || !entityIdCol || !totalPayoutCol) return;
```

```tsx
              disabled={!entityIdCol || !totalPayoutCol || comparing}
              className="w-full mt-6 px-4 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ backgroundColor: (!entityIdCol || !totalPayoutCol || comparing) ? '#3f3f46' : '#059669', boxShadow: (!entityIdCol || !totalPayoutCol || comparing) ? 'none' : '0 0 16px rgba(5, 150, 105, 0.3)' }}
```

(Reconciliation page hit at :973 is the section header `{/* Mapping confirmation + overrides */}`; :489-490 build user-confirmed mappings with `reasoning: 'User confirmed'`.)

### Orphaned warning surface — ColumnMapper component

src/components/import/column-mapper.tsx:214-235 renders a "Missing required fields" warning:

```tsx
      {/* Unmapped Required Fields Warning */}
      {getMappedRequiredFields() < getRequiredFieldsCount() && (
        <motion.div
          ...
          <p className="font-medium text-amber-800 dark:text-amber-200">
            Missing required fields
          </p>
          <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
            Please map the following required fields:{' '}
            {targetFields
              .filter((f) => f.required && !isFieldMapped(f.key))
              .map((f) => f.label)
              .join(', ')}
```

But the component has no consumers:

```
$ grep -n "export" src/components/import/column-mapper.tsx
31:export function ColumnMapper({
$ grep -rn "ColumnMapper" src/ --include="*.tsx" --include="*.ts" | grep -v "ai-column-mapper\|reconciliation"
src/components/import/column-mapper.tsx:23:interface ColumnMapperProps {
src/components/import/column-mapper.tsx:31:export function ColumnMapper({
src/components/import/column-mapper.tsx:37:}: ColumnMapperProps) {
```

### Adjacent-arm sweep — remaining grep hits (none are commit gates)

```
src/app/api/analyze-workbook/route.ts:94: prior confirmed mappings injected into AI prompt (suggestion quality, not a gate)
src/lib/reconciliation/ai-column-mapper.ts:126,300,305: 'unmapped' as a classification value in AI column mapping
src/components/forensics/ComparisonUpload.tsx:48,59,131,251,267,328: 'unmapped' = "Preserved in raw data" option in forensics upload mapping UI (unmapped filtered out, not blocked)
src/app/operate/reconciliation/page.tsx:489,490,973: Gate 2 above
src/lib/intelligence/__tests__/binding-completeness.test.ts:10,88: HF-281 test — match_pass:'failed' marker counts as unmapped
src/lib/forensics/ai-forensics.ts:63: fallback suggestedMapping:'unmapped' when no match
src/lib/reconciliation/benchmark-intelligence.ts:187: metric detection from unmapped columns
src/lib/ai/training-signal-service.ts:31,61: 'unmapped task types' (AI telemetry, unrelated to field mapping)
src/lib/ai/ai-service.ts:209: second-pass classification "Called for unresolved fields after initial mapping"
src/lib/intelligence/convergence-service.ts:2922: boundary matching fallback for unmapped requirements (HF-111)
src/app/data/import/enhanced/page.tsx:885-893: second-pass AI classification of tier==='unresolved' fields (auto-resolution before the gate, not the gate itself)
```

**GAP TO DEMO BAR:** None for gate existence — the Map-step gate (entityId required, Next disabled) and the reconciliation gate (entity + total required, run button disabled) are both present in code with explicit disabled-button wiring. Remaining proof is browser observation of the disabled states. Noted divergences from a strict reading of "blocks commit on unresolved mappings": the gate fires at the Map step rather than at commit (commit itself has no mapping re-check, client or server; forward step-jumping is disabled so the gate cannot be bypassed), the gate covers only `entityId` (HF-066 comment documents this as intentional — plan-metric gaps are validate-step warnings), and the validate step never blocks (`validationComplete` set unconditionally; `isValid` computed but never gates).

**EFFORT SHAPE:** E1 VERIFY-ONLY — gate logic verified in code (`canProceed()` + Next button at src/app/data/import/enhanced/page.tsx:2378-2402/4286; reconciliation gate at src/app/operate/reconciliation/page.tsx:477/1033). Remaining proof: architect browser actions observing the disabled buttons. No routes, components, services, or tables required.

### A6 — Duplicate-execution guard

**CURRENT STATE:** A two-layer duplicate-execution guard exists for plan interpretation in `web/src/lib/sci/plan-idempotency.ts`, consumed by `web/src/lib/sci/plan-interpretation.ts`. Layer 1 (read-before-derive) returns a previously completed `rule_set_id` for the same SHA-256 content hash without re-executing; Layer 2 (single-flight) claims execution by inserting an `in_progress` row into `plan_interpretation_runs`, where `UNIQUE(tenant_id, content_hash)` makes a concurrent second claim fail with Postgres 23505. HF-264 added a 5-minute TTL reclaim for stranded claims plus a try/finally release on every non-completed exit. The guard was introduced by commit `2c534214` (HF-259 Phase 4+5) and hardened by `07a4d253` (HF-264 Phase 2); both are ancestors of the Phase-1 anchor `d38d6355`. Live DB shows the backing table populated (7 completed runs, 0 stranded in_progress, 0 failed). An adjacent in-flight-promise-sharing guard exists on the calculation read path (`calculation-service.ts:136`).

**EVIDENCE:**

Command 1 (from repo root) — full output:

```
$ git log --oneline --all -i --grep="duplicat"
4750db57 HF-283 Phase 0: directive committed; provenance + profile census
87df664f HF-282 migration amendment (HALT-2 disposition): delete tdelcarlo sandbox rows, defer constraint
ff5b8008 HF-282 Phase 4: author single-profile-canon migration (architect-applied; HALT-2-guarded)
0c3daca4 HF-267 P2: Carry-Everything safety net — tabular files never crash/hang in plan extraction
18e055c7 HF-258: 1C content-channel unification (Q2) + transport retirement (Q5) (#446)
2077b168 HF-257: Enforce single plan-interpretation pipeline (AP-17) (#445)
82e5e4f5 HF-256: Restore universal file ingestion (Decision 82) — document plans, multi-file, mixed-format (#444)
0c2da09d HF-255: Restore unified any-format plan import (document transport regressed by HF-239) (#443)
9cd13fe3 HF-254: Ingestion flywheel — single skip authority, role-bearing caches, lexical prior (#442)
2ca8b9a2 HF-253: Per-Variant Binding Scope + Distribution Signal in Column Mapping (#441)
327d3da4 HF-252: Per-Variant Component Intent Emission + Fallback Removal (#440)
5fde465c HF-251: Compositional Intent + Constructor — Decision 158 Implementation (#439)
37a9f76d HF-250: Multi-call skeleton/chunk separation — complete HF-249 per IRA Option A specification (#438)
ba4dce8e HF-249: Grammar-aware subtree decomposition — skeleton+chunk emission with deterministic assembler (#437)
e478a2fa HF-248: Per-component plan interpretation with bounded retry, error class differentiation, reimport-resume (#436)
809f3789 HF-247: Plan import integrity — cold-start, cache quality, silent fallback elimination, commit-stage validation (#435)
1f041531 DIAG-056: Plan interpretation LLM response capture (diagnostic log + completion report) (#434)
dabd78be DIAG-055/HF-245: Restore plan interpretation instructions lost in OB-200 prompt replacement (#433)
03dddb8d HF-244: Scale mutual exclusion + validator exhaustive emission enforcement + plan supersession (#432)
614a748d HF-243: DAG scale inference + variant binding coverage (#430)
cf53f846 HF-243: DAG scale inference + variant binding coverage
ad2f1038 HF-242: DAG-aware convergence — extract reference fields from PrimeNode trees (#428)
288b00f0 HF-242: DAG-aware convergence — extract reference fields from PrimeNode trees
7d11ea8b HF-241: Temporal-aware transaction classifier + plan supersession fix (#427)
ce6eb634 AUD-013: Execute/Execute-Bulk behavioral equivalence + classifier/supersession fixes
92d63b60 HF-240: Restore cold-start plan classification via workbook signature (#426)
bf42691b HF-240: Restore cold-start plan classification via workbook signature
c86b72c4 HF-231 Phases 2+3: wire all 7 sub-pipelines through commitContentUnit
ff23c183 HF-228 Phase 1: SCI referential classification signal
2eb56a0d HF-225 Phase 2: period diagnostic script and findings
90887ee6 OB-197 Phase 4: completion report
a0e8c116 HF-182 Fix 9: Import history shows SCI import events from import_batches
7624aa3e HF-182 Fixes 7-8: Deduplicate plan cards by name
3792df5c HF-151 Phase 4: MFA verify event dedup -- ref guard + sessionStorage
e0098a79 HF-150 Phase 3: MFA verify UX -- loading state, double-submit guard
4409ab55 HF-150 Phase 1: Fix logout logging -- capture user data before signOut
7321ad6a OB-175 Phase 1: Import display -- clean file names, source file identity, no dev metadata
817c026f HF-139: Multi-tab import content unit independence
ba1b0231 HF-133 Phase 1-2: Remove plan already-exists early return + build verification
692b2038 HF-133 Phase 0: Plan already-exists early return diagnostic
16a10449 HF-126 Phase 1: Auto-create rule_set_assignments after entity resolution
eceb73d9 Merge pull request #208 from CCAFRICA/dev
47495ab9 HF-106 Phase 2: Duplicate CU elimination + PeriodProvider removal
2f9139fd HF-106 Phase 0: Duplicate content unit + periods diagnostic prompt
e335ce5a CLT-160 Diagnostic: Comprehensive pipeline state analysis after plan import
1a9574e2 OB-156 Phase 3: Performance verification
36b4589f OB-154 Phase 4: CC-UAT-07 forensic verification — all PASS
81c38735 OB-153 Phase 4: Rendered result proof gate — metric resolution + source_date binding
e8dbdbf2 HF-088 Phase 1: Cleanup executed
52a4f48b OB-151 Phases 1-2: VL Admin profile fix + server idempotency + client dedup
aac9e4ab HF-087 Phase 1: Client-side fetch timeout fix + recovery + progress
f8404b27 HF-087 Phase 0: Client-side fetch diagnostic
62d2c600 OB-142 Phase 2: Pipeline fixes — draft plans, route redirect
5542acf3 OB-141 Phase 3: Committed data cleanup — removed 34 duplicate batches
0d150948 OB-140 Phase 2: Architecture trace output — raw evidence
4bba45af OB-136 Phase 5: Entity deduplication verified + assignment count fix
c5e65229 OB-135 Phase 0: Diagnostic — signal capture infrastructure audit
7e58e6d0 HF-079: Verification script — idempotency test 8/8 PASS
02b1399a HF-078: Verification script — 8/8 proof gates PASS
ce63ca55 HF-078: Fix calculation INSERT path for UNIQUE constraint compatibility
1c933444 OB-121 Phase 6: Integrated test — 8/8 proof gates PASS
ced5bf6b OB-121 Phase 1: Purge stale results + DELETE-before-INSERT + unique constraint
1b382cae Merge pull request #125 from CCAFRICA/dev
c875a983 OB-114 Phase 5: Archive duplicate MBC insurance referral plan
52a6da19 CLT-113 Phase 3: Plan context trace — wrong plan source identified
f0cca6a2 OB-112 Phase 1: Fix multi-file count aggregation + assignment display
ccc846b6 OB-110 Phase 3: Post-AI confidence calibration — value validation + duplicate detection
4e369499 OB-109 Phase 5-6: Sidebar cleanup + data nav consolidation
673e577f OB-102 Phase 6: Page consolidation — eliminate duplicates and legacy stubs
41d857bd HF-062 Phase 2: Fix profile query — handle multiple profiles per user
473edfab OB-97 Phase 8: Cognitive fit — charts + reference frames
be2ba237 OB-97 Phase 0: Platform UX diagnostic
01a6a07e OB-93 Phase 3: Page loaders for adjustments + users
fbfc41de OB-93 Phase 2: SessionContext + locale dedup
858176e9 HF-058 Phase 4: Standing Rule 25 — one canonical location per surface
538119a0 OB-89 Phase 0: Platform diagnostic — switcher state, stub inventory, console error sources
c97f7652 CLT-72A: Complete platform page inventory and linkage map
69f2ec93 HF-045 Phase 1: Server-side import commit API route
4acc9e1c HF-045 Phase 0: Import commit architecture diagnostic
c5d40de2 OB-53 Phase 2: Navigation consolidation — collapse single-child, all roles default to Perform
02811e8e OB-50 Phase 9: Structural validation service with 8 checks
b0eed115 HF-036 Phase 6: reduce duplicate Supabase queries
c4355d83 OB-41-4: Deduplicate period objects with canonical YYYY-MM keys
03f9e517 OB-41-1: Lifecycle-calculation coupling in orchestrator
ec5a14a3 OB-41-0: Reconnaissance findings for lifecycle plumbing
cffe216a OB-34 Phase 10: Module-aware import and AI anomaly detection
16613568 OB-32: Platform chrome fixes — breadcrumbs, pulse metrics, branding, scripts
76cfb9d7 OB-11 Phase 2: Fix handleSubmitImport to persist data
3a0552ea OB-09 Phase 3: Tenant isolation, Queue and Cycle wired to real state
847b320e OB-05 Phase 2: Remove Redundant Navbar Elements
```

Command 2 (from web/) — full output (12 files):

```
$ grep -rni "in.flight\|already.*running\|execution.*lock\|idempot" src/lib/ --include="*.ts" -l
src/lib/sci/plan-idempotency.ts
src/lib/sci/plan-interpretation.ts
src/lib/sci/entity-resolution.ts
src/lib/sci/assignment-creation.ts
src/lib/sci/post-commit-construction.ts
src/lib/sci/__tests__/comprehension-state.test.ts
src/lib/sci/calc-time-entity-resolution.ts
src/lib/sci/store-metadata-population.ts
src/lib/supabase/auth-service.ts
src/lib/supabase/calculation-service.ts
src/lib/storage/storage-migration.ts
src/lib/compensation/ai-plan-interpreter.ts
```

Adjacent-arm sweep — per-file hit counts (same pattern, `-c`, zero-hit files excluded):

```
$ grep -rni "in.flight\|already.*running\|execution.*lock\|idempot" src/lib/ --include="*.ts" -c | grep -v ":0"
src/lib/sci/plan-interpretation.ts:7
src/lib/sci/plan-idempotency.ts:3
src/lib/sci/post-commit-construction.ts:1
src/lib/sci/entity-resolution.ts:3
src/lib/sci/assignment-creation.ts:1
src/lib/supabase/calculation-service.ts:1
src/lib/sci/calc-time-entity-resolution.ts:2
src/lib/sci/store-metadata-population.ts:1
src/lib/storage/storage-migration.ts:1
src/lib/sci/__tests__/comprehension-state.test.ts:1
src/lib/supabase/auth-service.ts:1
src/lib/compensation/ai-plan-interpreter.ts:1
```

Characterization of every non-primary hit (line-level, complete):

```
$ grep -rni "in.flight\|already.*running\|execution.*lock\|idempot" src/lib/ --include="*.ts" | grep -v "plan-idempotency.ts"
src/lib/sci/plan-interpretation.ts:25:// HF-259 Q3/Q6: idempotency (single-flight + fingerprint reuse) + lifecycle audit. Degrade-safe.
src/lib/sci/plan-interpretation.ts:33:} from './plan-idempotency';
src/lib/sci/plan-interpretation.ts:217:  // ── HF-259 Q3: idempotency guard (before the expensive 1+N orchestration) ──
src/lib/sci/plan-interpretation.ts:225:    console.log(`[SCI plan-interp] HF-259 idempotent REUSE — content_hash matched completed rule_set ${reusedRuleSetId}; no re-execution`);
src/lib/sci/plan-interpretation.ts:357:  // idempotent on plan name. Error checked.
src/lib/sci/plan-interpretation.ts:383:    // HF-259 Q6: explicit audited supersession. With Q3 idempotency upstream, a duplicate import
src/lib/sci/plan-interpretation.ts:493:    // idempotent delete of the in_progress row, so it is safe even where a failure path already
src/lib/sci/post-commit-construction.ts:22: * Idempotent: safe to call repeatedly; resolveEntitiesFromCommittedData
src/lib/sci/calc-time-entity-resolution.ts:17: *   data, prior tenant state, etc.). The two paths are mutually idempotent.
src/lib/sci/calc-time-entity-resolution.ts:45: * Idempotent: safe to call repeatedly. A second call against an already-
src/lib/sci/__tests__/comprehension-state.test.ts:41:  assert.equal(isForwardTransition('classified', 'classified'), true);   // idempotent ok
src/lib/storage/storage-migration.ts:12: * This is idempotent -- safe to call multiple times.
src/lib/supabase/calculation-service.ts:136:    if (cached.promise) return cached.promise; // In-flight — share it
src/lib/compensation/ai-plan-interpreter.ts:51:// are still in flight for calc-side and UI consumers that depend on them.
src/lib/sci/entity-resolution.ts:348:  // Idempotent merge: for each existing entity that has attribute values from
src/lib/sci/entity-resolution.ts:350:  // (close prior records on value change; add new for unseen keys; idempotent
src/lib/sci/entity-resolution.ts:370:      if (existingOpen && existingOpen.value === value) continue; // idempotent
src/lib/sci/assignment-creation.ts:10: * Idempotent: existing assignments are skipped via a (entity_id, rule_set_id)
src/lib/sci/store-metadata-population.ts:14: * entities.metadata with store_id, volume_tier, volume_key. Idempotent:
src/lib/supabase/auth-service.ts:45:  // HF-151 F1: await ensures fetch completes before router.push cancels in-flight requests
```

Total: 22 line-level hits across 12 files. The execution guard proper is plan-idempotency.ts + its call site in plan-interpretation.ts; the sci/* "Idempotent: safe to call repeatedly" hits are idempotent-by-construction service contracts (re-run safety, not concurrency locks); calculation-service.ts:136 is an in-flight promise-sharing read cache; auth-service.ts:45 and ai-plan-interpreter.ts:51 are unrelated in-flight-request comments; the test hit is a state-machine idempotency assertion.

Guard code — single-flight claim (web/src/lib/sci/plan-idempotency.ts:53-79):

```typescript
// src/lib/sci/plan-idempotency.ts:53
// HF-264: a claim older than this is treated as abandoned (a prior execution crashed between
// claim and complete/fail, stranding the in_progress row — pre-HF-264 there was no TTL, so it
// blocked re-import forever). 5 min is ~10x the longest observed interpretation (~35s Meridian
// Phase A+B). Numeric duration only (Korean Test — no domain/language value).
const CLAIM_TTL_MS = 5 * 60 * 1000;

export async function claimRun(
  supabase: SupabaseClient, tenantId: string, contentHash: string, sourceFileName: string,
): Promise<{ claimed: boolean }> {
  try {
    const { error } = await supabase.from('plan_interpretation_runs').insert({
      tenant_id: tenantId,
      content_hash: contentHash,
      status: 'in_progress',
      source_file_name: sourceFileName,
    });
    if (!error) return { claimed: true };
    if ((error as { code?: string }).code === '23505') {
      // A row already exists for (tenant, content_hash). HF-264: reclaim it only if it is a
      // STALE in_progress claim; a completed/failed row or a fresh claim is respected.
      return await reclaimIfStale(supabase, tenantId, contentHash, sourceFileName);
    }
    return { claimed: true }; // table-missing / other → degrade to execute (current behavior)
  } catch {
    return { claimed: true };
  }
}
```

Guard call site — both layers (web/src/lib/sci/plan-interpretation.ts:217-238):

```typescript
// src/lib/sci/plan-interpretation.ts:217
  // ── HF-259 Q3: idempotency guard (before the expensive 1+N orchestration) ──
  // content_hash = SHA-256 of the plan file bytes (format-invariant; the unified-content key).
  const contentHash = computePlanContentHash(fileBuffer);
  const sourceFileName = storagePath.split('/').pop()?.replace(/^\d+_/, '') || primaryContentUnitId;
  // Layer 1 — read-before-derive / moat reuse: a completed run for this content → return its
  // rule_set without re-executing (~zero cost). Degrade-safe (null when the table is unapplied).
  const reusedRuleSetId = await findCompletedRuleSet(supabase, tenantId, contentHash);
  if (reusedRuleSetId) {
    console.log(`[SCI plan-interp] HF-259 idempotent REUSE — content_hash matched completed rule_set ${reusedRuleSetId}; no re-execution`);
    return planUnits.map((u, i) => ({
      contentUnitId: u.contentUnitId,
      classification: 'plan' as const,
      success: true,
      rowsProcessed: 0,
      pipeline: i === 0 ? 'plan-interpretation-reused' : 'plan-batch-included',
    }));
  }
  // Layer 2 — single-flight: claim the execution. A concurrent second import of the same content
  // loses the UNIQUE(tenant_id, content_hash) race → does NOT run a second interpretation.
  let claim = await claimRun(supabase, tenantId, contentHash, sourceFileName);
  if (!claim.claimed) {
    const concurrent = await findCompletedRuleSet(supabase, tenantId, contentHash);
```

Claim release on non-completed exit (web/src/lib/sci/plan-interpretation.ts:490-500, HF-264 Phase 3):

```typescript
// src/lib/sci/plan-interpretation.ts:490
  } finally {
    // HF-264: release the in_progress claim on every non-completed exit — the three explicit
    // failure returns above AND any uncaught throw between claim and completeRun. failRun is an
    // idempotent delete of the in_progress row, so it is safe even where a failure path already
    // released it. Only the success path (interpretationCompleted=true) skips release, because
    // completeRun has already transitioned the row to 'completed'.
    if (!interpretationCompleted) {
      try {
        await failRun(supabase, tenantId, contentHash);
        console.log(`[SCI plan-interp] HF-264: released in_progress claim on non-completed exit (content_hash=${contentHash.substring(0, 12)})`);
      } catch { /* best-effort */ }
```

Introducing commit — file history and symbol search:

```
$ git log --follow --oneline -- web/src/lib/sci/plan-idempotency.ts
07a4d253 HF-264 Phase 2: TTL expiry on stale single-flight claims (5-minute threshold)
c983db1c HF-259: relocate migration to web/supabase/migrations + timestamp scheme (20260531000000); drop stale repo-root 017
2c534214 HF-259 Phase 4+5: idempotency (Q3) + audited supersession (Q6) + lifecycle UI

$ git log -S "claimRun" --oneline --all
11c08cc0 HF-272 Phase 2: remove interpretation-time field-resolution gate + requiredInputs anchor; restore unified recognition pathway (AUD-009 / Decision 158)
3e76e785 HF-265: production resilience completion report (P1 investigation, P2/P3 diffs, HALT log)
3c2c3ff5 HF-265 P2: orphaned-claim recovery, component retry (3 attempts), construction error surfacing
8c01f18e HF-264: completion report (TTL + try/finally diffs, reclaim verification, HALT log)
5b2c06fd HF-264 Phase 3: try/finally guard — claims always released on uncaught throws
07a4d253 HF-264 Phase 2: TTL expiry on stale single-flight claims (5-minute threshold)
d7497bf6 HF-260 Phase 1 (ADR / confirmation gate): HALT-1 — fetch failed + hang NOT caused by HF-258/259
97fd2f36 HF-259 Phase 8: completion report + build verification
2c534214 HF-259 Phase 4+5: idempotency (Q3) + audited supersession (Q6) + lifecycle UI
```

Introducing commit = `2c534214` (HF-259 Phase 4+5: idempotency (Q3) + audited supersession (Q6) + lifecycle UI). Hardening commits = `07a4d253` / `5b2c06fd` (HF-264).

Anchor ancestry (exact command as specified):

```
$ git merge-base --is-ancestor 2c534214 d38d63553bddc079fab2cfda6f1fa2d178a2704a ; echo "exit: $?"
exit: 0

$ git merge-base --is-ancestor 07a4d253 d38d63553bddc079fab2cfda6f1fa2d178a2704a ; echo "exit: $?"
exit: 0
```

DB-side constraint (migration source):

```
$ ls web/supabase/migrations/ | grep -i "hf259\|idempot"
20260531000000_hf259_idempotency_lifecycle.sql

$ grep -n "UNIQUE\|unique" web/supabase/migrations/20260531000000_hf259_idempotency_lifecycle.sql
12:-- One row per (tenant, plan content hash). The UNIQUE constraint is the single-flight
26:  UNIQUE (tenant_id, content_hash)               -- single-flight: one execution per content per tenant
```

Schema-reference divergence check:

```
$ grep -n "plan_interpretation_runs" /Users/AndrewAfrica/spm-platform/SCHEMA_REFERENCE_LIVE.md | head -5
(no output — table absent from SCHEMA_REFERENCE_LIVE.md, generated 2026-03-18; migration is dated 2026-05-31)
```

Live DB verification — script source (web/scripts/diag/diag063_a6_dupe_guard_table.ts):

```typescript
// DIAG-063 / A6 — Duplicate-execution guard: live verification of plan_interpretation_runs
// READ-ONLY: head:true counts only. No tenant names/slugs. No payout values.
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function count(label: string, status?: string) {
  let q = supabase.from('plan_interpretation_runs').select('*', { count: 'exact', head: true });
  if (status) q = q.eq('status', status);
  const { count: c, error } = await q;
  if (error) {
    console.log(`${label}: ERROR ${error.code ?? ''} ${error.message}`);
    return;
  }
  console.log(`${label}: ${c}`);
}

async function main() {
  await count('plan_interpretation_runs total');
  // status values are registry-derived from src/lib/sci/plan-idempotency.ts (claimRun/completeRun/failRun)
  await count("status='completed'", 'completed');
  await count("status='in_progress'", 'in_progress');
  await count("status='failed'", 'failed');
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
```

Script output:

```
$ cd /Users/AndrewAfrica/spm-platform/web && set -a && source .env.local && set +a && npx tsx scripts/diag/diag063_a6_dupe_guard_table.ts
plan_interpretation_runs total: 7
status='completed': 7
status='in_progress': 0
status='failed': 0
```

**GAP TO DEMO BAR:** None for plan-import duplicate execution. Guard located, introducing commit identified (`2c534214`), ancestry to the Phase-1 anchor confirmed (exit 0), DB-side UNIQUE constraint confirmed in migration source, and the live table verified populated with zero stranded `in_progress` claims. Remaining proof is browser-level: a second import of an identical plan file should log "HF-259 idempotent REUSE" and produce no second rule_set.

**EFFORT SHAPE:** E0/E1 — no development effort. Code + DB evidence green (service `src/lib/sci/plan-idempotency.ts`, call site `src/lib/sci/plan-interpretation.ts`, table `plan_interpretation_runs` with UNIQUE(tenant_id, content_hash)); E1 residue is the architect browser action confirming the reuse path during the demo dry-run.

# A7 — Persona switcher post-auth-rework trace

**CURRENT STATE:** The persona switcher exists as a context-only impersonation bar (`src/components/persona/PersonaSwitcher.tsx`, OB-89), mounted by `src/components/layout/auth-shell.tsx` inside `PersonaProvider`, visible only to an authenticated VL Admin with a tenant selected. Switching calls `setPersonaOverride()` in `src/contexts/persona-context.tsx` — no signOut/signIn, no auth round-trip; override persists in `sessionStorage`. The chain's *login* identity input routes through the HF-282 canonical reader: `auth-context.tsx` → `fetchCurrentProfile()` (`src/lib/supabase/auth-service.ts:208`) → `resolveIdentity()` (`src/lib/auth/resolve-identity.ts:76`). However, the chain's *scope fetch* (triggered on every persona switch) reads `profiles` by `auth_user_id` directly with `.maybeSingle()` in `persona-context.tsx:163-168` — a divergent identity read outside `resolveIdentity()` — and passes `user.id` (which `mapProfileToUser` sets to `profiles.id`, not `auth_user_id`) as the filter value. Live DB shows 9 of 11 profiles rows have `id !== auth_user_id` (all tenant-role rows), and all 3 platform rows have `tenant_id` NULL while the read also filters `.eq('tenant_id', currentTenant.id)`; scope therefore resolves through the VL-Admin demo-sample fallback branches.

**EVIDENCE:**

## 1. Locating the switcher — stated search, full file list (99 files)

```
$ cd /Users/AndrewAfrica/spm-platform/web && grep -rni "persona\|demo.*switch\|switch.*user" src/ --include="*.ts" --include="*.tsx" -l
src/types/alert.ts
src/types/analytics.ts
src/types/rbac.ts
src/types/auth.ts
src/types/permission.ts
src/contexts/tenant-context.tsx
src/types/cheques.ts
src/contexts/persona-context.tsx
src/contexts/navigation-context.tsx
src/app/acceleration/page.tsx
src/app/my-compensation/page.tsx
src/app/test-ds/page.tsx
src/app/financial/page.tsx
src/app/financial/leakage/page.tsx
src/app/financial/products/page.tsx
src/app/financial/patterns/page.tsx
src/app/financial/location/[id]/page.tsx
src/app/financial/pulse/page.tsx
src/app/financial/staff/page.tsx
src/app/financial/performance/page.tsx
src/app/financial/timeline/page.tsx
src/app/financial/summary/page.tsx
src/app/configure/page.tsx
src/app/configure/people/page.tsx
src/app/stream/page.tsx
src/app/workforce/permissions/page.tsx
src/app/workforce/roles/page.tsx
src/app/workforce/personnel/page.tsx
src/app/operate/lifecycle/page.tsx
src/app/operate/briefing/page.tsx
src/app/perform/page.tsx
src/app/api/insights/route.ts
src/app/api/financial/data/route.ts
src/app/api/intelligence/narrate/route.ts
src/app/api/platform/agent-inbox/route.ts
src/app/api/ai/assessment/route.ts
src/app/performance/page.tsx
src/app/approvals/page.tsx
src/app/data/import/enhanced/page.tsx
src/components/intelligence/index.ts
src/components/layout/auth-shell.tsx
src/components/intelligence/RepTrajectory.tsx
src/components/intelligence/InsightPanel.tsx
src/components/layout/TopBar.tsx
src/components/intelligence/PersonalEarningsCard.tsx
src/components/navigation/mission-control/UserIdentity.tsx
src/components/navigation/ChromeSidebar.tsx
src/components/navigation/mission-control/WorkspaceSwitcher.tsx
src/components/permissions/UserPermissionCard.tsx
src/components/layout/PersonaLayout.tsx
src/components/navigation/Navbar.tsx
src/components/navigation/mission-control/CycleIndicator.tsx
src/components/agents/AgentInbox.tsx
src/components/briefing/IndividualBriefing.tsx
src/components/briefing/ManagerBriefing.tsx
src/components/navigation/Sidebar.tsx
src/components/briefing/AdminBriefing.tsx
src/components/dashboards/AdminDashboard.tsx
src/components/navigation/mission-control/MissionControlRail.tsx
src/components/dashboards/RepDashboard.tsx
src/components/dashboards/ManagerDashboard.tsx
src/components/persona/PersonaSwitcher.tsx
src/components/design-system/AssessmentPanel.tsx
src/components/design-system/index.ts
src/lib/cheques-import-service.ts
src/lib/financial/financial-data-service.ts
src/lib/financial/cheque-import-service.ts
src/lib/financial/financial-service.ts
src/lib/financial/financial-constants.ts
src/lib/intelligence/next-action-engine.ts
src/hooks/useAgentInbox.ts
src/lib/intelligence/insight-engine.ts
src/lib/approval-routing/impact-calculator.ts
src/lib/signals/stream-signals.ts
src/lib/design/tokens.ts
src/lib/intelligence/narration-service.ts
src/lib/financial/types.ts
src/lib/financial/cheque-parser.ts
src/lib/intelligence/state-reader.ts
src/lib/auth/mfa-route-guard.ts
src/lib/training/milestones.ts
src/lib/signals/briefing-signals.ts
src/lib/navigation/compensation-clock-service.ts
src/lib/agents/types.ts
src/lib/agents/runner.ts
src/lib/navigation/navigation-signals.ts
src/lib/navigation/workspace-config.ts
src/lib/agents/registry.ts
src/lib/permissions/role-templates.ts
src/lib/navigation/role-workspaces.ts
src/lib/agents/insight-agent.ts
src/lib/compensation/pos-icm-bridge.ts
src/lib/ai/providers/anthropic-adapter.ts
src/lib/ai/types.ts
src/lib/data/persona-queries.ts
src/lib/data/intelligence-stream-loader.ts
src/lib/ai/ai-service.ts
src/lib/analytics/analytics-service.ts
src/lib/design-system/tokens.ts
```

The single persona-switch entry point is proven by enumerating all `setPersonaOverride` call sites — only `PersonaSwitcher.tsx` invokes it:

```
$ grep -rn "setPersonaOverride" src/ --include="*.ts" --include="*.tsx"
src/contexts/persona-context.tsx:37:  setPersonaOverride: (persona: PersonaKey | null) => void;
src/contexts/persona-context.tsx:335:    setPersonaOverride: setOverride,
src/components/persona/PersonaSwitcher.tsx:11: * - Clicking a persona chip calls setPersonaOverride() in persona-context
src/components/persona/PersonaSwitcher.tsx:51:  const { persona, setPersonaOverride } = usePersona();
src/components/persona/PersonaSwitcher.tsx:56:      setPersonaOverride(null);
src/components/persona/PersonaSwitcher.tsx:58:      setPersonaOverride(key);
src/components/persona/PersonaSwitcher.tsx:86:  }, [setPersonaOverride, router, pathname]);
```

## 2. Hop 0 — mount point

```tsx
// src/components/layout/auth-shell.tsx:205-227
  // Authenticated user - show with or without shell based on route
  if (!showShell) {
    // OB-60: No PersonaSwitcher on Observatory (/select-tenant).
    // The Observatory is exclusively for VL Platform Admin — persona
    // switching only makes sense inside a tenant context on regular pages.
    return <>{children}</>;
  }

  // HF-106: PeriodProvider removed from shell. Pages that need periods
  // wrap themselves in <PeriodProvider> (e.g. /, /perform).
  // Decision 92: Import surface has zero period API calls.
  const shell = (
    <NavigationProvider>
      <AuthShellInner>{children}</AuthShellInner>
      <PersonaSwitcher />
    </NavigationProvider>
  );

  return (
    <PersonaProvider>
      {shell}
    </PersonaProvider>
  );
}
```

## 3. Hop 1 — entry component + handler

```tsx
// src/components/persona/PersonaSwitcher.tsx:46-91
export function PersonaSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const { currentTenant, isVLAdmin } = useTenant();
  const { isAuthenticated } = useAuth();
  const { persona, setPersonaOverride } = usePersona();

  const handleSwitch = useCallback((key: PersonaKey) => {
    // If clicking the derived default (admin for VL Admin), clear the override
    if (key === 'admin') {
      setPersonaOverride(null);
    } else {
      setPersonaOverride(key);
    }

    // OB-96: Workspace-aware navigation — stay in current workspace if accessible
    const role = personaToRole(key);

    // Detect current workspace from pathname
    const currentWsId = Object.keys(WORKSPACES).find(wsId => {
      const ws = WORKSPACES[wsId as WorkspaceId];
      if (!ws?.sections) return false;
      for (const section of ws.sections) {
        for (const route of section.routes) {
          if (pathname === route.path || pathname.startsWith(route.path + '/')) return true;
        }
      }
      return false;
    }) as WorkspaceId | undefined;

    // If current workspace is accessible to new persona, stay on current page
    if (currentWsId && canAccessWorkspace(role, currentWsId)) {
      // Stay on current page — just re-render with persona-filtered data
      return;
    }

    // Otherwise navigate to default workspace for this persona
    const defaultWs = getDefaultWorkspace(role);
    const ws = WORKSPACES[defaultWs];
    router.push(ws.defaultRoute);
  }, [setPersonaOverride, router, pathname]);

  // Only visible to authenticated VL Admin with a tenant selected
  if (!isAuthenticated || !isVLAdmin || !currentTenant) {
    return null;
  }
```

Component header confirms the architecture (no auth round-trip on switch):

```tsx
// src/components/persona/PersonaSwitcher.tsx:3-15
/**
 * Persona Switcher — Context-Only Impersonation (OB-89)
 *
 * Floating bar at the bottom of the screen for VL Admin to switch
 * between persona views using context override ONLY.
 *
 * Architecture:
 * - VL Admin is always the authenticated Supabase user (session unchanged)
 * - Clicking a persona chip calls setPersonaOverride() in persona-context
 * - Override changes: visual identity, intent framing, data scope perception
 * - Override persists in sessionStorage across navigation
 * - NO signOut/signIn. NO page reload. NO auth round-trip.
 */
```

## 4. Hop 2 — handler target: override state in persona-context

```tsx
// src/contexts/persona-context.tsx:105-133
export function PersonaProvider({ children }: { children: ReactNode }) {
  const { user, capabilities } = useAuth();
  const { currentTenant } = useTenant();

  // OB-89: Persist persona override in sessionStorage so it survives navigation
  const [override, setOverride] = useState<PersonaKey | null>(() => {
    if (typeof window !== 'undefined') {
      const stored = sessionStorage.getItem('vl_persona_override');
      if (stored === 'admin' || stored === 'manager' || stored === 'rep') return stored;
    }
    return null;
  });
  const [scope, setScope] = useState<PersonaScope>({ entityIds: [], canSeeAll: false });
  const [profileId, setProfileId] = useState<string | null>(null);
  const [entityId, setEntityId] = useState<string | null>(null);

  // OB-89: Sync override to sessionStorage
  useEffect(() => {
    if (override) {
      sessionStorage.setItem('vl_persona_override', override);
    } else {
      sessionStorage.removeItem('vl_persona_override');
    }
  }, [override]);

  // Derive persona from user profile
  const derivedPersona = useMemo(() => derivePersona(user, capabilities), [user, capabilities]);
  const persona = override ?? derivedPersona;
  const tokens = PERSONA_TOKENS[persona];
```

## 5. Hop 3a — identity input `user`/`capabilities`: auth-context → fetchCurrentProfile

```tsx
// src/contexts/auth-context.tsx:199-217
        // 3. Both session AND user confirmed — NOW fetch profile.
        const profile = await fetchCurrentProfile();
        if (profile && profile !== SESSION_ABSENT) {
          setUser(mapProfileToUser(profile));
          setCapabilities(profile.capabilities || []);
          setProfileLocale(profile.locale);
        }
        // If profile is null (missing row) or SESSION_ABSENT, user stays null.
        // AuthShellProtected will handle the redirect. Do NOT redirect here.

        // 4. Set up auth listener for future sign-in/sign-out events
        unsubscribe = onAuthStateChange(async (event) => {
          if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
            const p = await fetchCurrentProfile();
            if (p && p !== SESSION_ABSENT) {
              setUser(mapProfileToUser(p));
              setCapabilities(p.capabilities || []);
              setProfileLocale(p.locale);
            }
          } else if (event === 'SIGNED_OUT') {
```

## 6. Hop 3b — fetchCurrentProfile delegates to resolveIdentity (CANONICAL on this arm)

```ts
// src/lib/supabase/auth-service.ts:208-235
export async function fetchCurrentProfile(): Promise<FetchProfileResult> {
  try {
    const supabase = createClient();

    // HF-097: Use getUser() as the SOLE auth check.
    // getSession() reads from cookies which may not be available immediately
    // after signInWithPassword() — this caused "Account found but profile
    // is missing" for VL Admin login. getUser() validates with the server
    // and works reliably in all cases.
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      // HF-284: session absent at fetch time — distinct from a missing profile row.
      // Emit on the client-capable path (logAuthEvent no-ops client-side) and return
      // the typed sentinel so the login surface can say "session" not "profile."
      void logAuthEventClient('identity.resolve.session_absent', { reason: userError?.message ?? 'no_user' });
      return SESSION_ABSENT;
    }

    // HF-282: delegate to the canonical reader (resolveIdentity) — THE only
    // sanctioned profiles-by-auth_user_id resolution. Array-tolerant, deterministic
    // winner, alias-normalized, anomaly-logging. Public signature preserved (DD-7).
    const identity = await resolveIdentity(supabase, user.id);
    return classifyProfileFetch(user, identity);
  } catch (err) {
    console.error('[Auth] fetchCurrentProfile error:', err);
    return null;
  }
}
```

## 7. Hop 3c — resolveIdentity (HF-282 canonical reader) and its contract

```ts
// src/lib/auth/resolve-identity.ts:1-20
/**
 * HF-282 Phase 1 — Canonical post-auth identity resolution.
 *
 * THE only sanctioned `profiles`-by-`auth_user_id` read. Architect disposition
 * (2026-06-10): one auth user maps to exactly one profiles row; role inheritance
 * is a presentation concern, never duplicate identity rows. SOC 2 CC6 (unique
 * identification -> single authorization record).
 *
 * Contract:
 *  - array-tolerant during the migration window (no `.single()` / `.maybeSingle()`
 *    anywhere in this module — those ERROR on >1 row, which is the DIAG-060 defect);
 *  - deterministic winner: first alias-normalized `platform` row, else first row
 *    carrying the `manage_tenants` capability (retained for DD-7: existing
 *    consumers fetchCurrentProfile/server-auth used this tiebreaker), else the
 *    oldest row (created_at ascending);
 *  - role compared via `resolveRole` (alias-normalized; NEVER raw literal equality
 *    against `'vl_admin'`) — Korean Test / AP-25: zero account/email/tenant literals;
 *  - loud on anomaly: query error / zero rows / duplicate rows each emit a named
 *    `identity.resolve.*` event through the non-blocking logAuthEvent channel.
 */
```

```ts
// src/lib/auth/resolve-identity.ts:76-90
export async function resolveIdentity(
  client: SupabaseClient,
  authUserId: string,
): Promise<ResolvedIdentity | null> {
  const { data: rows, error } = await client
    .from('profiles')
    .select('*')
    .eq('auth_user_id', authUserId)
    .order('created_at', { ascending: true })
    .limit(10);

  if (error) {
    // HF-284: emit via the client-capable path. resolveIdentity runs client-side on
    // the login profile-fetch, where logAuthEvent no-ops (no service key) — which is
    // why these two branches were silent on the browser path (DIAG-062 E6).
```

## 8. Hop 3d — visibility gate `isVLAdmin`: tenant-context → auth-context → types/auth

```
$ grep -n "isVLAdmin\|useAuth" src/contexts/tenant-context.tsx | head -5
12:import { useAuth } from './auth-context';
24:  isVLAdmin: boolean;
119:  const { user, isVLAdmin: isAdmin, isLoading: authLoading } = useAuth();
230:      isVLAdmin: isAdmin,
```

```tsx
// src/contexts/auth-context.tsx:337
  const isUserVLAdmin = user ? isVLAdmin(user) : false;
```

```ts
// src/types/auth.ts:40-42
export function isVLAdmin(user: User): user is VLAdminUser {
  return user.role === 'platform';
}
```

## 9. Hop 4 — scope fetch on switch: DIVERGENT identity read (recorded verbatim, not fixed)

`fetchScope` runs in a `useEffect` keyed on `override` (the switch re-triggers it — HF-060 comment at persona-context.tsx:136). It reads `profiles` by `auth_user_id` directly, bypassing `resolveIdentity()`, using `.maybeSingle()` and an added `tenant_id` filter:

```tsx
// src/contexts/persona-context.tsx:159-184
      try {
        const supabase = createClient();

        // Get the user's profile row to find profile_id
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('auth_user_id', user!.id)
          .eq('tenant_id', currentTenant!.id)
          .maybeSingle();

        let linkedEntityId: string | null = null;

        if (profile) {
          setProfileId(profile.id);

          // Profile→entity linkage goes through entities.profile_id (not profiles.entity_id)
          const { data: linkedEntity } = await supabase
            .from('entities')
            .select('id')
            .eq('profile_id', profile.id)
            .eq('tenant_id', currentTenant!.id)
            .maybeSingle();

          linkedEntityId = linkedEntity?.id ?? null;
        }
```

Divergences from the HF-282 contract, verbatim:
- `resolve-identity.ts:4` declares itself "THE only sanctioned `profiles`-by-`auth_user_id` read"; `persona-context.tsx:163-168` is a second `profiles`-by-`auth_user_id` read.
- The contract states "no `.single()` / `.maybeSingle()` anywhere ... those ERROR on >1 row, which is the DIAG-060 defect" (`resolve-identity.ts:10-11`); the divergent read uses `.maybeSingle()` (`persona-context.tsx:168`).
- The filter VALUE is `user!.id`, where `user` is built by `mapProfileToUser` with `id: profile.id` (profiles.id), not the auth user id:

```tsx
// src/contexts/auth-context.tsx:60-77
function mapProfileToUser(profile: AuthProfile): User {
  const capabilities = profile.capabilities || [];

  // Platform admin: role is 'platform' or has manage_tenants capability
  const isPlatformAdmin = profile.role === 'platform' || capabilities.includes('manage_tenants');

  if (isPlatformAdmin) {
    return {
      id: profile.id,
      email: profile.email,
      name: profile.displayName,
      role: 'platform',
      tenantId: null,
      accessLevel: capabilities.includes('manage_tenants') ? 'full' : 'readonly',
      status: 'active',
      createdAt: new Date().toISOString(),
      avatar: profile.avatarUrl || undefined,
    } as VLAdminUser;
  }
```

```ts
// src/lib/supabase/auth-service.ts:177-194 (AuthProfile.id = identity.id = profiles.id)
export function classifyProfileFetch(
  user: { id: string } | null | undefined,
  identity: ResolvedIdentity | null,
): FetchProfileResult {
  if (!user) return SESSION_ABSENT;
  if (!identity) return null;
  return {
    id: identity.id,
    authUserId: identity.authUserId,
    tenantId: identity.tenantId,
    displayName: identity.displayName,
    email: identity.email,
    role: identity.role,
    capabilities: identity.capabilities,
    locale: identity.locale,
    avatarUrl: identity.avatarUrl,
  };
}
```

So the query `profiles.auth_user_id = user.id` compares against a `profiles.id` value — a match occurs only on rows where `profiles.id === profiles.auth_user_id`.

## 10. DB probe — id/auth_user_id alignment (SELECT-only, counts only)

Schema authority check (`/Users/AndrewAfrica/spm-platform/SCHEMA_REFERENCE_LIVE.md:412-426`): `profiles` has `id` (uuid, default uuid_generate_v4()), `auth_user_id` (uuid NOT NULL), `tenant_id` (uuid nullable), `role` (text). Columns match the queries above.

Script: `web/scripts/diag/diag063_a7_profiles_id_alignment.ts`

```ts
import { createClient } from '@supabase/supabase-js';

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data, error } = await supabase
    .from('profiles')
    .select('id, auth_user_id, tenant_id, role');

  if (error) {
    console.error('query_error:', error.message);
    process.exit(1);
  }

  const rows = data ?? [];
  const eq = rows.filter((r) => r.id === r.auth_user_id).length;
  const ne = rows.length - eq;

  console.log('profiles total rows:', rows.length);
  console.log('rows where id === auth_user_id:', eq);
  console.log('rows where id !== auth_user_id:', ne);
  console.log('rows with tenant_id IS NULL:', rows.filter((r) => r.tenant_id === null).length);

  const byRole: Record<string, { id_eq_auth: number; id_ne_auth: number }> = {};
  for (const r of rows) {
    const k = String(r.role);
    byRole[k] ??= { id_eq_auth: 0, id_ne_auth: 0 };
    byRole[k][r.id === r.auth_user_id ? 'id_eq_auth' : 'id_ne_auth']++;
  }
  console.log('by role (id vs auth_user_id):', JSON.stringify(byRole, null, 2));
}

main();
```

```
$ cd /Users/AndrewAfrica/spm-platform/web && set -a && source .env.local && set +a && npx tsx scripts/diag/diag063_a7_profiles_id_alignment.ts
profiles total rows: 11
rows where id === auth_user_id: 2
rows where id !== auth_user_id: 9
rows with tenant_id IS NULL: 3
by role (id vs auth_user_id): {
  "platform": {
    "id_eq_auth": 2,
    "id_ne_auth": 1
  },
  "tenant_admin": {
    "id_eq_auth": 0,
    "id_ne_auth": 5
  },
  "admin": {
    "id_eq_auth": 0,
    "id_ne_auth": 1
  },
  "manager": {
    "id_eq_auth": 0,
    "id_ne_auth": 1
  },
  "sales_rep": {
    "id_eq_auth": 0,
    "id_ne_auth": 1
  }
}
```

Implications, stated structurally:
- Every tenant-role row (tenant_admin/admin/manager/sales_rep: 8 rows) has `id !== auth_user_id`, so for those users the divergent lookup (`auth_user_id = profiles.id`) returns zero rows → `profileId`/`entityId` stay null.
- The 2 rows with `id === auth_user_id` are `platform` rows; 3 rows have `tenant_id` NULL. The divergent read additionally filters `.eq('tenant_id', currentTenant.id)`, which excludes NULL-tenant platform rows — so for the VL Admin operating the switcher, the profile lookup also resolves null, and scope is produced by the explicit demo-override fallback branches (`persona-context.tsx:213-235` rep sample-individual; `persona-context.tsx:267-295` manager first-brand locations; `persona-context.tsx:187-193` admin canSeeAll). The switcher's persona/scope switching functions through these fallbacks; the profile-linkage arm of the scope fetch does not bind under current data.
- Related code comment (different surface, recorded for context): `auth-service.ts:201-206` (HF-097) — "VL Admin has tenant_id = NULL ... DO NOT add tenant_id filters to the login profile fetch."

## 11. Adjacent-arm sweep — every `profiles`-by-`auth_user_id` query site (E952)

```
$ grep -rn "eq('auth_user_id'" src/ --include="*.ts" --include="*.tsx" | grep -v "__tests__"
src/contexts/persona-context.tsx:166:          .eq('auth_user_id', user!.id)
src/contexts/locale-context.tsx:115:          .eq('auth_user_id', user.id);
src/app/auth/callback/route.ts:55:    .eq('auth_user_id', session.user.id)
src/app/api/auth/log-event/route.ts:64:            .eq('auth_user_id', user.id)
src/app/api/ingest/classification/route.ts:26:      .eq('auth_user_id', user.id)
src/app/api/ingest/setup/route.ts:39:      .eq('auth_user_id', user.id)
src/app/api/ingest/event/route.ts:24:      .eq('auth_user_id', user.id)
src/app/api/ingest/event/[eventId]/status/route.ts:29:      .eq('auth_user_id', user.id)
src/app/api/platform/settings/route.ts:27:      .eq('auth_user_id', user.id)
src/app/api/platform/settings/route.ts:63:      .eq('auth_user_id', user.id)
src/app/api/platform/observatory/route.ts:49:      .eq('auth_user_id', user.id)
src/app/api/platform/tenant-config/route.ts:31:      .eq('auth_user_id', user.id)
src/app/api/platform/tenants/[tenantId]/modules/route.ts:27:      .eq('auth_user_id', user.id)
src/app/api/platform/tenants/create/route.ts:25:      .eq('auth_user_id', user.id)
src/app/api/platform/users/invite/route.ts:53:      .eq('auth_user_id', user.id)
src/app/api/platform/users/invite/route.ts:172:        .eq('auth_user_id', authUserId)
src/app/api/admin/tenants/create/route.ts:26:      .eq('auth_user_id', user.id)
src/app/api/lifecycle/transition/route.ts:72:      .eq('auth_user_id', user.id)
src/app/api/ai/metrics/route.ts:31:        .eq('auth_user_id', user.id)
src/app/api/ai/calibration/route.ts:31:        .eq('auth_user_id', user.id)
src/app/api/users/update-role/route.ts:37:      .eq('auth_user_id', user.id)
src/app/api/approvals/route.ts:30:      .eq('auth_user_id', user.id)
src/app/api/approvals/route.ts:115:      .eq('auth_user_id', user.id)
src/app/api/approvals/[id]/route.ts:40:      .eq('auth_user_id', user.id)
src/app/performance/adjustments/page.tsx:136:        .eq('auth_user_id', user.id)
src/scripts/create-demo-users.ts:77:      .eq('auth_user_id', authUserId).eq('tenant_id', tenant.id).maybeSingle();
src/lib/auth/resolve-identity.ts:83:    .eq('auth_user_id', authUserId)
src/lib/supabase/auth-service.ts:88:    .eq('auth_user_id', user.id)
```

Total: 28 sites (excluding tests). 1 is the canonical reader itself (`resolve-identity.ts:83`); 27 are outside it. The site inside this probe's chain is `persona-context.tsx:166`. The others are adjacent arms (API route guards, locale fetch, auth callback, logout tenant resolution at `auth-service.ts:85-90`, a demo-users script) — enumerated here per E952; only the in-chain site is traced above. Note the API-route sites filter on the server-derived `user.id` from `supabase.auth.getUser()` (a true auth user id), unlike `persona-context.tsx:166` which passes the mapped client `user.id` (= profiles.id).

## 12. Downstream consumers of the scope fetch outputs

Files consuming `usePersona()` together with `profileId`/`entityId` tokens (file-level list):

```
$ grep -rn "profileId\|entityId" src/ --include="*.tsx" --include="*.ts" -l | xargs grep -ln "usePersona" | sort
src/app/financial/leakage/page.tsx
src/app/financial/page.tsx
src/app/financial/patterns/page.tsx
src/app/financial/performance/page.tsx
src/app/financial/products/page.tsx
src/app/financial/pulse/page.tsx
src/app/financial/staff/page.tsx
src/app/financial/summary/page.tsx
src/app/financial/timeline/page.tsx
src/app/my-compensation/page.tsx
src/app/stream/page.tsx
src/components/dashboards/ManagerDashboard.tsx
src/components/dashboards/RepDashboard.tsx
src/contexts/persona-context.tsx
```

**GAP TO DEMO BAR:** The switcher mechanism (chip → `setPersonaOverride` → sessionStorage override → scope recalculation via demo-sample fallbacks → workspace-aware navigation) is fully present in code and mounted in the authenticated shell; the remaining proof for "persona switcher works" is a live browser persona-switch on production. Separately, the chain's scope-fetch identity read diverges from the HF-282 canonical reader (recorded as a finding, not repaired): direct `profiles`-by-`auth_user_id` read with `.maybeSingle()` at `persona-context.tsx:163-168`, filter value `user.id` = profiles.id, plus a `tenant_id` filter that excludes NULL-tenant platform rows — under current data (11 rows) this arm resolves null for every user and all scope comes from the fallback branches.

**EFFORT SHAPE:** E1 VERIFY-ONLY for the switcher capability — code and DB evidence green for the override mechanism (`PersonaSwitcher.tsx`, `persona-context.tsx`, `auth-shell.tsx`); remaining proof is an architect browser action (live persona-switch on production). The recorded divergent identity read, if remediation were later commissioned, has the structural shape of one context change (`src/contexts/persona-context.tsx` scope fetch keyed by `resolveIdentity()`-provided `authUserId`/`profileId` instead of a second direct `profiles` read) — recorded for completeness, not performed (HALT-2/no-fixes).

## Module B — Surfacing-Effort Definition

*(probe results pending)*

## Module C — Trust Loop (Disputes, Adjustments, Audit)

*(probe results pending)*

## Module D — Net-New Definition and Demo-Surface Invariants

*(probe results pending)*

## Module E — Engine-Path Confirmations

*(probe results pending)*

---

## Architect Browser Verification Checklist

*(consolidated at assembly)*

## Open Questions

- **OQ-1 — `CC_DIAGNOSTIC_PROTOCOL.md` not present in repository.** Searches attempted: `find . -name "CC_DIAGNOSTIC_PROTOCOL.md" -not -path "./node_modules/*"` (no hits); `find . \( -iname "*DIAGNOSTIC*PROTOCOL*" -o -iname "*CC_DIAG*" \) -not -path "./node_modules/*" -not -path "./.git/*"` (no hits); `grep -rln "CC_DIAGNOSTIC_PROTOCOL" docs/ *.md` (referenced by 10+ directives, never materialized as a file). Same result for `COMPLETION_REPORT_ENFORCEMENT.md` and `INF_Structured_Compliant_Drafting_Reference_20260513.md`: referenced by directives, not present as files. The directive's own phase prose was executed as written; Rules 19–28 applied as cited inline in the directive.

## Findings Register

- **F-1 — Sequence premise vs. main listing.** The directive states the authoritative `docs/diagnostics/` read shows highest existing DIAG-062; the `main` listing actually tops out at DIAG-059. DIAG-060/061 exist only as references in HF-282/HF-283 commit bodies (their artifacts are not in `docs/diagnostics/` on any ref found), and DIAG-062's artifacts exist only on the unmerged branch `origin/diag-062-sabor-profile-census`. Evidence: §1.2 above. Neutral consequence: future sequence checks against `main`'s `docs/diagnostics/` listing alone will under-count; assignment provenance lives partly in unmerged branches and commit bodies.
