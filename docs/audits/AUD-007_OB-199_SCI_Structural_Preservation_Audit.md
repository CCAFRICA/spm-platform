# AUD-007 — OB-199 SCI Structural Preservation Audit

**Status:** Evidence surface complete. Awaiting architect-channel review.
**Type:** Read-only empirical audit — evidence surface only.
**Branch:** `ob-199-canonical-signal-write-implementation`
**Date produced:** 2026-05-08.

---

## Section 0 — Audit Scope + Discipline (verbatim from directive)

> **AUD-007 — OB-199 SCI Structural Preservation Audit**
>
> Status: DIRECTIVE for CC execution.
> Type: Read-only empirical audit — evidence surface only.
>
> ### Purpose
>
> Verify OB-199 Phases 1–4 preserved the deletion intent of the prior architecture (writeClassificationSignal + signal-persistence.ts) and that SCI-specific structural markers carried forward to the canonical signal-write surface (DS-022 v2 / DS-023). CC produces verbatim raw evidence. The architect reads the evidence and judges intent preservation.
>
> ### CC's role
>
> CC produces evidence. CC does NOT:
> - classify deletions or migrations as SUPERSET / SUBSET / IDENTICAL / DIVERGENT,
> - assess intent preservation,
> - propose dispositions,
> - suggest what the architect should do,
> - synthesize conclusions, add commentary, summaries, or assessment columns.
>
> CC produces verbatim code excerpts, schema reads, specification text, and diffs with file:line markers. The architect interprets.
>
> If CC encounters a circumstance not anticipated by this directive (file not found, command fails, output unexpectedly empty), CC surfaces that fact verbatim in the report. CC does not infer, fill in, or substitute.

---

## Section 1 — Evidence Inventory

All evidence files are written to `docs/audits/AUD-007_evidence/`. Verbatim per-file descriptions, sizes, and line counts are in `docs/audits/AUD-007_evidence/MANIFEST.md`.

Totals: **51 evidence files**, **8485 lines** of verbatim raw evidence.

Inventory by section:

- **E1 — Canonical Signal Writer (post-OB-199):** 8 files, covering `web/src/lib/intelligence/canonical-signal-writer.ts` full source, function signatures, the 19-column insert payload, `CanonicalSignalInput` type, `validateSignal` four-outcome routing, registry-derived identifier validation, `observability:write_failure` emission, and module imports.
- **E2 — Read Surface (signal-reader.ts):** 4 files, covering `web/src/lib/ai/signal-reader.ts` full source, pre-deletion `getTrainingSignals` from the deleted `signal-persistence.ts`, byte-level diff between pre/post, and the 4 importers of `signal-reader`.
- **E3 — Live Schema (classification_signals):** 9 files, covering the sample-row fallback column read (`execute_sql` RPC unavailable surfaced verbatim per directive Section 0), constraint/policy/index queries (Postgrest-unavailable surfaced verbatim), HF-092 completion-report + schema-correction context, the original `003_data_and_calculation.sql` table definition, the OB-197-touched `024_*.sql` migration, and a live-schema-to-canonical-writer column cross-reference.
- **E4 — Pre-deletion SCI Call Sites:** 16 files, covering the pre-deletion `writeClassificationSignal` body, 5 post-OB-199 SCI call sites verbatim, 5 pre-deletion equivalents verbatim, 4 side-by-side diffs (B and C consolidated into one file), error-handling surfaces at the 5 call sites, and grep output for `sciVersion` / `phase: 'E'` / `schema: 'HF-092'` / `source: 'sci_agent'` SCI structural markers.
- **E5 — Substrate Specs + lib/sci/ Inventory:** 11 files, covering DS-021 (Substrate Architecture Biological Lineage v1.0 LOCKED 2026-04-30) full text, DS-022 v2 Canonical Signal-Write Surface full text, DS-022 Comprehension Surface Completeness full text, AUD-004 v3 SCI cluster B evidence excerpt, HF-195 Phase 6 SCI audit excerpt, `lib/sci/` directory inventory + full source of `classification-signal-service.ts`, `signal-capture-service.ts`, `signal-types.ts`, `types.ts`, and grep output for SCI-emission vocabulary references.
- **E6 — Read Surface Inventory:** 5 files, covering `convergence-service.ts` reader surfaces (incl. `loadMetricComprehensionSignals`), `ai-metrics-service.ts` reader surfaces (incl. `fetchSignals` + `classifyAction`), 22 reader sites' ±20-line surrounding code consolidated, reader behavior matrix (5 of 22 surfaced inline, 17 with `(read E6.3)` cross-references — CC surfaced reason verbatim in E6.4), and cross-reference grep output.

---

## Section 2 — E1–E6 Evidence Sections

Each subsection below lists the evidence files for that audit area. See `MANIFEST.md` for verbatim per-file descriptions and line counts. See the individual files in `docs/audits/AUD-007_evidence/` for the raw evidence.

### E1 — Canonical Signal Writer (post-OB-199)

- `E1_1_canonical_signal_writer_full_source.md`
- `E1_2_function_signatures.md`
- `E1_3_insert_column_list.md`
- `E1_4_CanonicalSignalInput_type.md`
- `E1_5_validateSignal_body.md`
- `E1_6_registry_lookup_validation.md`
- `E1_7_observability_emission.md`
- `E1_8_imports.md`

### E2 — Read Surface (signal-reader.ts)

- `E2_1_signal_reader_full_source.md`
- `E2_2_pre_deletion_getTrainingSignals.md`
- `E2_3_byte_identical_diff.md`
- `E2_4_signal_reader_importers.md`

### E3 — Live Schema (classification_signals)

- `E3_1_columns.md`
- `E3_2_constraints.md`
- `E3_3_policies.md`
- `E3_4_indexes.md`
- `E3_5a_hf092_completion_report.md`
- `E3_5b_hf092_schema_correction.md`
- `E3_5c_migration_024_ob197.md`
- `E3_5d_migration_003_original_table.md`
- `E3_6_column_cross_reference.md`

### E4 — Pre-deletion SCI Call Sites

- `E4_1_pre_deletion_writeClassificationSignal.md`
- `E4_2_call_site_a_execute.md`
- `E4_2_call_site_b_converge_line95.md`
- `E4_2_call_site_c_converge_line122.md`
- `E4_2_call_site_d_process_job.md`
- `E4_2_call_site_e_analyze.md`
- `E4_3_call_site_a_pre_deletion.md`
- `E4_3_call_site_bc_pre_deletion.md`
- `E4_3_call_site_d_pre_deletion.md`
- `E4_3_call_site_e_pre_deletion.md`
- `E4_4_call_site_a_sidebyside.md`
- `E4_4_call_site_bc_sidebyside.md`
- `E4_4_call_site_d_sidebyside.md`
- `E4_4_call_site_e_sidebyside.md`
- `E4_5_error_handling_at_call_sites.md`
- `E4_6789_sci_marker_greps.md`

### E5 — Substrate Specs + lib/sci/ Inventory

- `E5_1_DS-021_full.md`
- `E5_2a_DS-022_Canonical_Signal_Write_Surface_v2_full.md`
- `E5_2b_DS-022_Comprehension_Surface_Completeness_full.md`
- `E5_3a_cluster_b_evidence.md`
- `E5_3b_HF-195_Phase6_Audit.md`
- `E5_5_lib_sci_directory_inventory.md`
- `E5_5a_classification_signal_service.md`
- `E5_5b_signal_capture_service.md`
- `E5_5c_sci_signal_types.md`
- `E5_5d_sci_types.md`
- `E5_6_sci_emission_grep.md`

### E6 — Read Surface Inventory

- `E6_1_convergence_reader.md`
- `E6_2_ai_metrics_service_readers.md`
- `E6_3_all_readers_consolidated.md`
- `E6_4_reader_behavior_matrix.md`
- `E6_5_cross_references.md`

---

## Section 3 — Observed-but-unjudged Surface

Raw observations CC noticed during evidence collection that the directive did not explicitly ask for but that may be material. CC surfaces these without claim of significance.

- The live `classification_signals` schema as read via sample-row fallback contains **24 columns** (E3.1); the canonical writer's `buildInsertRow` constructs **19 columns** (E1.3).
- Columns observed in the live schema that are absent from `CanonicalSignalInput` (E1.4): `header_comprehension`, `metric_name`, `component_index`.
- The E6.4 reader behavior matrix populates `SELECT columns` / `signal_type filter` / `other filters` inline for **5 of 22** reader sites; the remaining 17 carry `(read E6.3)` cross-reference placeholders, with the verbatim ±20-line context populated in E6.3 (1038 lines).
- `sciVersion: '1.0'` appears at **2 sites** in `lib/sci/signal-capture-service.ts` (E5.5b); `sciVersion: '2.0'` appears at the **5 SCI canonical-writer call sites** in E4.2.
- No file in `web/supabase/migrations/` is named with the token `HF-092`; the dedicated-columns work is documented under that label in `docs/audits/AUD-007_evidence/E3_5a_hf092_completion_report.md` and `E3_5b_hf092_schema_correction.md` but is reflected in migrations `003_data_and_calculation.sql` (original table) and `024_*.sql` (last-touched, OB-197).
- The directive's E3.1 query (`execute_sql` RPC) is unavailable in the live Postgrest schema cache, and `information_schema` is not exposed to Postgrest; E3.1, E3.2, E3.3, and E3.4 each surface this verbatim and fall back (E3.1) to sample-row column-key introspection or (E3.2–E3.4) decline to fabricate output.
- `lookupAITaskSignalType` + `registerAITaskMapping` collapse 16 `ai_`-prefixed signal_types into the registry (E5.5c + signal-registry.ts excerpt in E1.6); the prior `AI_TASK_LEVEL_MAP` exhaustive object is no longer present in the registry surface.
- `observability:write_failure` (E1.7) is the registry-declared signal_type emitted by `buildObservabilitySignal`; the signal's `confidence_required` is declared `false` in the registry (E1.6 excerpt), so it bypasses the four-outcome `validateSignal` routing.
- The E2.3 byte-identical diff between pre-deletion `getTrainingSignals` (in `signal-persistence.ts`) and post-relocation `getTrainingSignals` (in `signal-reader.ts`) shows the body relocated; the import surface in E2.4 lists 4 importers (`lib/reconciliation/ai-column-mapper.ts:21`, `lib/intelligence/classification-signal-service.ts:20`, `lib/sci/signal-capture-service.ts:11`, `lib/ai/training-signal-service.ts:14`).
- E5.6 enumerates 17 files referencing SCI-emission vocabulary, of which 3 are source code (`api/platform/observatory/route.ts`, `lib/sci/signal-capture-service.ts`, `lib/data/platform-queries.ts`).

---

## Section 4 — HALT

AUD-007 evidence surface complete. CC has produced verbatim raw evidence per directive E1.1–E6.5. CC has NOT classified intent preservation, NOT assessed SCI structural status, NOT proposed dispositions. Architect-channel review of the evidence is the next step. CC HALTS. No further code modification, no further OB-199 phase progression, no further audit work until explicit architect re-authorization.
