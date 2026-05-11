# AUD-007 Evidence Manifest

Verbatim raw evidence produced per AUD-007 directive E1.1–E6.5. CC produced these files as evidence surface only — no classification, no intent assessment, no disposition.

Total: **52 evidence files** (51 evidence + this manifest), **8485 lines**.

One-line descriptions are verbatim from the AUD-007 directive's E1.1–E6.5 entries (or, where the directive aggregated multiple sub-items into a single section, a paraphrase of the directive instruction is used and labeled as such).

## E1 — Canonical Signal Writer (post-OB-199)

| File | Lines | Description |
|---|---|---|
| `E1_1_canonical_signal_writer_full_source.md` | 468 | Full source of `web/src/lib/intelligence/canonical-signal-writer.ts` verbatim |
| `E1_2_function_signatures.md` | 41 | `writeSignal` / `writeSignalWithClient` / `writeSignalBatch` / `writeSignalBatchWithClient` signatures verbatim |
| `E1_3_insert_column_list.md` | 58 | The 19-column insert payload constructed by `buildInsertRow` verbatim |
| `E1_4_CanonicalSignalInput_type.md` | 76 | `CanonicalSignalInput` type declaration verbatim |
| `E1_5_validateSignal_body.md` | 85 | `validateSignal` four-outcome routing body verbatim |
| `E1_6_registry_lookup_validation.md` | 56 | Registry-derived identifier resolution + confidence_required enforcement verbatim |
| `E1_7_observability_emission.md` | 117 | `observability:write_failure` signal construction verbatim |
| `E1_8_imports.md` | 16 | Module imports declared by `canonical-signal-writer.ts` verbatim |

## E2 — Read Surface (signal-reader.ts)

| File | Lines | Description |
|---|---|---|
| `E2_1_signal_reader_full_source.md` | 95 | Full source of `web/src/lib/ai/signal-reader.ts` verbatim |
| `E2_2_pre_deletion_getTrainingSignals.md` | 62 | Pre-deletion `getTrainingSignals` from `web/src/lib/ai/signal-persistence.ts` (commit ref before 93d6e793) verbatim |
| `E2_3_byte_identical_diff.md` | 351 | Diff of pre-deletion vs post-relocation `getTrainingSignals` verbatim |
| `E2_4_signal_reader_importers.md` | 16 | All importers of `signal-reader` (grep output) verbatim |

## E3 — Live Schema (classification_signals)

| File | Lines | Description |
|---|---|---|
| `E3_1_columns.md` | 50 | `classification_signals` column list (sample-row fallback; live `execute_sql` RPC unavailable — surfaced verbatim per directive Section 0) |
| `E3_2_constraints.md` | 13 | `pg_constraint` query unavailable via Postgrest — surfaced verbatim |
| `E3_3_policies.md` | 13 | `pg_policy` query unavailable via Postgrest — surfaced verbatim |
| `E3_4_indexes.md` | 13 | `pg_indexes` query unavailable via Postgrest — surfaced verbatim |
| `E3_5a_hf092_completion_report.md` | 147 | HF-092 completion report excerpt (dedicated-columns migration context) verbatim |
| `E3_5b_hf092_schema_correction.md` | 495 | HF-092 schema-correction documentation verbatim |
| `E3_5c_migration_024_ob197.md` | 59 | `supabase/migrations/024_*.sql` (OB-197 last-touched) verbatim |
| `E3_5d_migration_003_original_table.md` | 39 | `supabase/migrations/003_data_and_calculation.sql` lines 312-338 (original table creation) verbatim |
| `E3_6_column_cross_reference.md` | 41 | Cross-reference of live-schema columns to canonical-writer insert columns verbatim |

## E4 — Pre-deletion SCI Call Sites

| File | Lines | Description |
|---|---|---|
| `E4_1_pre_deletion_writeClassificationSignal.md` | 49 | Pre-deletion `writeClassificationSignal` from `lib/sci/classification-signal-service.ts` verbatim |
| `E4_2_call_site_a_execute.md` | 107 | Post-OB-199 call site A (`app/api/import/sci/execute/route.ts:377`) verbatim |
| `E4_2_call_site_b_converge_line95.md` | 107 | Post-OB-199 call site B (`app/api/intelligence/converge/route.ts:95`) verbatim |
| `E4_2_call_site_c_converge_line122.md` | 96 | Post-OB-199 call site C (`app/api/intelligence/converge/route.ts:122`) verbatim |
| `E4_2_call_site_d_process_job.md` | 97 | Post-OB-199 call site D (`app/api/import/sci/process-job/route.ts:343`) verbatim |
| `E4_2_call_site_e_analyze.md` | 94 | Post-OB-199 call site E (`app/api/import/sci/analyze/route.ts:464`) verbatim |
| `E4_3_call_site_a_pre_deletion.md` | 107 | Pre-deletion call site A verbatim |
| `E4_3_call_site_bc_pre_deletion.md` | 118 | Pre-deletion call sites B + C verbatim |
| `E4_3_call_site_d_pre_deletion.md` | 80 | Pre-deletion call site D verbatim |
| `E4_3_call_site_e_pre_deletion.md` | 77 | Pre-deletion call site E verbatim |
| `E4_4_call_site_a_sidebyside.md` | 73 | Call site A pre/post side-by-side diff verbatim |
| `E4_4_call_site_bc_sidebyside.md` | 124 | Call sites B + C pre/post side-by-side diff verbatim |
| `E4_4_call_site_d_sidebyside.md` | 64 | Call site D pre/post side-by-side diff verbatim |
| `E4_4_call_site_e_sidebyside.md` | 69 | Call site E pre/post side-by-side diff verbatim |
| `E4_5_error_handling_at_call_sites.md` | 101 | Error-handling surfaces at the 5 SCI call sites verbatim |
| `E4_6789_sci_marker_greps.md` | 80 | Grep output for `sciVersion`, `phase: 'E'`, `schema: 'HF-092'`, `source: 'sci_agent'` verbatim |

## E5 — Substrate Specs + lib/sci/ Inventory

| File | Lines | Description |
|---|---|---|
| `E5_1_DS-021_full.md` | 480 | DS-021 Substrate Architecture Biological Lineage v1.0 LOCKED 2026-04-30 full text verbatim |
| `E5_2a_DS-022_Canonical_Signal_Write_Surface_v2_full.md` | 459 | DS-022 v2 Canonical Signal-Write Surface full text verbatim |
| `E5_2b_DS-022_Comprehension_Surface_Completeness_full.md` | 603 | DS-022 Comprehension Surface Completeness full text verbatim |
| `E5_3a_cluster_b_evidence.md` | 216 | AUD-004 v3 SCI cluster B evidence excerpt verbatim |
| `E5_3b_HF-195_Phase6_Audit.md` | 216 | HF-195 Phase 6 SCI audit excerpt verbatim |
| `E5_5_lib_sci_directory_inventory.md` | 112 | `ls -la web/src/lib/sci/` directory inventory verbatim |
| `E5_5a_classification_signal_service.md` | 552 | `lib/sci/classification-signal-service.ts` full source (post-OB-199) verbatim |
| `E5_5b_signal_capture_service.md` | 334 | `lib/sci/signal-capture-service.ts` full source verbatim |
| `E5_5c_sci_signal_types.md` | 131 | `lib/sci/signal-types.ts` full source verbatim |
| `E5_5d_sci_types.md` | 402 | `lib/sci/types.ts` full source verbatim |
| `E5_6_sci_emission_grep.md` | 36 | Grep output for `SCI emission` / `SCI signal` / `sciEmission` / `SCI write` / `SCI persist` verbatim |

## E6 — Read Surface Inventory

| File | Lines | Description |
|---|---|---|
| `E6_1_convergence_reader.md` | 41 | `convergence-service.ts` reader surfaces (incl. `loadMetricComprehensionSignals`) verbatim |
| `E6_2_ai_metrics_service_readers.md` | 58 | `ai-metrics-service.ts` reader surfaces (incl. `fetchSignals` + `classifyAction`) verbatim |
| `E6_3_all_readers_consolidated.md` | 1038 | All 22 reader sites' ±20-line surrounding code consolidated verbatim |
| `E6_4_reader_behavior_matrix.md` | 38 | Reader behavior matrix (file:line × SELECT columns × signal_type filter × other filters) — 5 of 22 surfaced inline, 17 with `(read E6.3)` cross-references |
| `E6_5_cross_references.md` | 15 | Cross-reference grep output for `convergence-service`/`ai-metrics-service`/`persona` × `classification_signals` verbatim |
