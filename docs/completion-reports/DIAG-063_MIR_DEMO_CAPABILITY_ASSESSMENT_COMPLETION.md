# DIAG-063 — MIR DEMO CAPABILITY ASSESSMENT — COMPLETION REPORT
**Directive:** `docs/vp-prompts/DIAG-063_MIR_DEMO_CAPABILITY_ASSESSMENT_DIRECTIVE_20260612.md`
**Branch:** `diag/063-mir-demo-capability-assessment` · **Anchor:** `d38d63553bddc079fab2cfda6f1fa2d178a2704a` (main) · **Date:** 2026-06-12
**Deliverable of record:** `docs/diagnostics/DIAG-063_MIR_DEMO_CAPABILITY_ASSESSMENT_OUTPUT.md` (9,310 lines; all probe evidence inline)

## Phases executed

| Phase | Content | Commit |
|---|---|---|
| 1 | Directive committed at canonical path; anchor banked; sequence verified via git history (DIAG-060/061 in HF-282/HF-283 commit bodies; DIAG-062 on `origin/diag-062-sabor-profile-census`); governing artifacts read; DB access verified | `bbfa3cb8`, `dc79a10a` |
| 2 (Module A) | A1–A7 believed-working evidence banked | `3c10caf2` |
| 3 (Module B) | B1–B5 surfacing-effort definitions | `2bd2a4b0` |
| 4 (Module C) | C1–C3 trust-loop inventory | `a19d42b2` |
| 5 (Module D) | D1–D4 net-new definitions and demo-surface invariants | `672c13e5` |
| 6 (Module E) | E1–E6 engine-path confirmations | `60c00d7b` |
| 7 | Assembly: summary matrix (24 rows), architect browser checklist (60 items), open questions (76), findings register (124) | `487c7e1c` |

## Method note

Probes executed as 24 parallel read-only agents; every probe's evidence was then adversarially verified by an independent agent re-running the quoted commands against the repository and live database. Six files required corrections (counts, sweep enumerations, one transcript); all were corrected to observed output and re-verified before assembly. No conclusion or effort class changed under correction. Entity display-name values in the §B3 export excerpt were redacted to `[name-redacted]` as a precaution beyond the directive's numeric-redaction requirement (source was the seeded synthetic tenant `b1c2d3e4-…`).

## Evidence index (probe → output-doc section)

| Section | Capability | Evidence tier | Effort class |
|---|---|---|---|
| §A1A2 | Scale anchor (~162k import) + multi-file single-batch | VERIFIED-CODE+DB | import E0 / calc E1 |
| §A3 | Cross-file entity resolution | VERIFIED-CODE+DB | same-key resolution E0 / cross-key alias bridging E4 (only if MIR files key entities differently) |
| §A4 | Multi-tab XLSX ingestion | VERIFIED-CODE+DB | E0 |
| §A5 | Mapping confirmation gate (import wizard + reconciliation) | VERIFIED-CODE | E1 |
| §A6 | Duplicate-execution guard | VERIFIED-CODE+DB | E0 |
| §A7 | Persona switcher post-auth-rework identity-path trace | VERIFIED-CODE+DB | E1 |
| §B1 | Five layers of proof — drill-down surface inventory and rep accessibility (total → components → inputs → source rows) | VERIFIED-CODE+DB | rep statement reachability E2 / formula-inputs trace layer E3 |
| §B2 | Individual commission statements | VERIFIED-CODE+DB | statement surface E1 / rep self-scoped statement E3 |
| §B3 | Payroll-ready export | VERIFIED-CODE+DB | export E1 / demo-bar fields (hierarchy + per-row period + external_id) E3 |
| §B4 | Trajectory surfacing (DS-015-B) | VERIFIED-CODE+DB | population trend E1 / rep next-tier E1 (code) + data gap (rule-set intent absent) |
| §B5 | Results dashboard (admin) | VERIFIED-CODE+DB | dashboard E1 / count-correctness E3 / per-component columns on /operate/calculate E2 |
| §C1 | Disputes foundation (Module C: flag transaction -> admin queue -> audited adjustment -> recalculation) | VERIFIED-CODE+DB | schema+service E4 / admin queue E2 / flag-transaction E3 / resolve+audit E3 / recalc linkage E3 / statement-open E1 |
| §C2 | Adjustments / exception approval | VERIFIED-CODE+DB | queue UI E2 / statement-flag E3 / approve+audit E3 / dispute store E4 / recalc bridge E4 |
| §C3 | Audit trail coverage | VERIFIED-CODE+DB | login E0 / plan-import+calculate+approvals E1 / import+export+persona E3 (viewer surface E2) / dispute+adjustment E4 |
| §D1 | Company-wide dashboard adjacents (composition material inventory) | VERIFIED-CODE+DB | current-period company view E1 / period-view + grouping E3 |
| §D2 | Currency formatting (PDR-01) — class analysis: single authority vs N independent sites | VERIFIED-CODE | E3 |
| §D3 | Demo-path language inventory (neutral) | VERIFIED-CODE | inventory E0 / es-MX demo path E3 |
| §D4 | Post-calc display integrity (results staleness, entity-count source, period-selector refresh) | VERIFIED-CODE+DB | calc-page refetch E0 / results-page batch pinning E3 / entity-count E0 (label nuance E2) / period-selector E0 |
| §E1 | temporal_adjustment execution | VERIFIED-CODE+DB | E3 |
| §E2 | Period-scoped plan assignment (effective_from/effective_to honoring in calculation) | VERIFIED-CODE+DB | schema E0 / calc honoring E3 |
| §E3 | Plan variant mechanism (BCL-era flat variant matcher) | VERIFIED-CODE | E1 |
| §E4 | Filtered metric derivation (sum + filters, count + filters) — MIR category-commission dependency | VERIFIED-CODE+DB | E1 |
| §E5 | Condition-subject constructor surface map (CRP Plan-3-arc / D-158 boundary map for route-around authoring) | VERIFIED-CODE+DB | E0 |
| §E6 | Multi-plan concurrency (one entity calculating under >=2 rule sets in the same period) | PARTIAL | assignments+results E1 / period-outcome aggregation E3 |

## HALTs encountered

- **HALT-1 (sequence):** Evaluated at Phase 1.2 — the `main` `docs/diagnostics/` listing tops out at DIAG-059 and an untracked `DIAG-063` file existed locally. Resolved with evidence rather than halting: the untracked file was a byte-identical local copy of this directive itself (relocated to the canonical `docs/vp-prompts/` path), and git history accounts for DIAG-060/061/062 as assigned (highest = 062, matching the directive's premise). No higher number exists and no pre-existing 063 collision exists, so §4 HALT-1 does not trigger. Recorded as Finding F-1.
- **HALT-2 (write pressure):** No probe was abandoned for write pressure. Sub-items that would have required writes to investigate further were recorded as Open Questions per HALT-2 discipline (e.g. §A1A2: provenance of 43,875 `import_batch_id NULL` rows — no fix attempted; in-flight batch `307a2928` — no nudge/retry).
- **HALT-3 (access):** Not triggered; service-role read access verified before the fleet ran (Phase 1 access check, pasted in output §Phase 1).
- **HALT-4 (secrets):** Not triggered; secret-pattern scans of all evidence and scripts returned zero hits.

## Environment notes

- `scripts/diag/` is instantiated at `web/scripts/diag/`: the repository has no root `package.json`/`node_modules`, so tsx module resolution requires probe scripts to live under `web/`. All 41 committed `diag063_*.ts` scripts are SELECT-only (verified by scan: zero `.insert/.update/.delete/.upsert/.rpc` occurrences).
- `CC_DIAGNOSTIC_PROTOCOL.md`, `COMPLETION_REPORT_ENFORCEMENT.md`, and `INF_Structured_Compliant_Drafting_Reference_20260513.md` are referenced by directives but do not exist as repository files (output-doc OQ-1, with searches attempted). The directive's phase prose was executed as the authoritative executable per DD-11.
- During execution, six untracked files unrelated to this DIAG appeared in the working tree (`docs/diagnostics/DIAG-064_ANALYZE_REGRESSION_OUTPUT.md`, three `docs/vp-prompts/OB-203_PHASE-6B_*_20260612.md` files, `web/scripts/diag/diag064-*.ts`). They were left untouched and excluded from all commits (all DIAG-063 commits used explicit paths / `diag063_` globs).

## Zero-code-change attestation

`git diff main --stat` — every changed path is under `docs/` or `web/scripts/diag/`; zero `src/` changes:

```
 ...AG-063_MIR_DEMO_CAPABILITY_ASSESSMENT_OUTPUT.md | 9310 ++++++++++++++++++++
 ...EMO_CAPABILITY_ASSESSMENT_DIRECTIVE_20260612.md |  173 +
 web/scripts/diag/diag063_a1a2_calc_gap_shape.ts    |   42 +
 .../diag/diag063_a1a2_multifile_and_calc.ts        |  161 +
 web/scripts/diag/diag063_a1a2_null_batch_sample.ts |   40 +
 web/scripts/diag/diag063_a1a2_top_batches.ts       |  181 +
 .../diag063_a3_cross_file_entity_resolution.ts     |  132 +
 .../diag/diag063_a3_entity_type_distribution.ts    |   30 +
 web/scripts/diag/diag063_a4_multisheet.ts          |  104 +
 web/scripts/diag/diag063_a4_multisheet_db2.ts      |   88 +
 web/scripts/diag/diag063_a4_multisheet_db3.ts      |   44 +
 web/scripts/diag/diag063_a6_dupe_guard_table.ts    |   29 +
 .../diag/diag063_a7_profiles_id_alignment.ts       |   48 +
 web/scripts/diag/diag063_access_check.ts           |    8 +
 web/scripts/diag/diag063_b1_details_by_tenant.ts   |   49 +
 web/scripts/diag/diag063_b1_drilldown_layers.ts    |   95 +
 web/scripts/diag/diag063_b1_trace_shape.ts         |   48 +
 .../diag063_b2_statements_component_details.ts     |   41 +
 web/scripts/diag/diag063_b2_statements_data.ts     |   67 +
 .../diag/diag063_b3_hierarchy_data_availability.ts |   43 +
 .../diag/diag063_b3_payroll_export_headless.ts     |  118 +
 web/scripts/diag/diag063_b4_trajectory_inputs.ts   |   48 +
 .../diag/diag063_b4_trajectory_ruleset_shape.ts    |   69 +
 web/scripts/diag/diag063_b5_results_entitycount.ts |   51 +
 web/scripts/diag/diag063_b5_results_maxrows.ts     |   43 +
 web/scripts/diag/diag063_c1_disputes.ts            |   44 +
 .../diag/diag063_c2_adjustments_approvals.ts       |   85 +
 web/scripts/diag/diag063_c2_env_sanity.ts          |   20 +
 web/scripts/diag/diag063_c3_events.ts              |  101 +
 web/scripts/diag/diag063_d1_orphan_periods.ts      |   42 +
 web/scripts/diag/diag063_d1_outcomes_rollup.ts     |   93 +
 .../diag/diag063_d4_batch_accumulation_check.ts    |   65 +
 web/scripts/diag/diag063_e1_temporal.ts            |  127 +
 .../diag/diag063_e2_effective_range_population.ts  |   45 +
 .../diag/diag063_e4_bindings_state_census.ts       |   34 +
 .../diag/diag063_e4_derivation_rules_live.ts       |   62 +
 .../diag/diag063_e5_constructor_boundary_shapes.ts |   72 +
 .../diag063_e5_constructor_boundary_shapes2.ts     |   73 +
 .../diag063_e5_constructor_boundary_shapes3.ts     |   40 +
 web/scripts/diag/diag063_e6_multiplan.ts           |  157 +
 .../diag/diag063_e6_multiplan_results_scan.ts      |   71 +
 .../diag/diag063_e6_multiplan_tenant_detail.ts     |   83 +
 .../diag/diag063_e6_multiplan_tenant_landscape.ts  |   54 +
 43 files changed, 12330 insertions(+)
```

Verification command: `git diff main --name-only | grep -v "^docs/" | grep -v "^web/scripts/diag/"` returns nothing (exit 1).
