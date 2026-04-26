# DIAG-020-A COMPLETION REPORT
## Date: 2026-04-25
## Execution Time: 17:18 PDT - 17:25 PDT

## COMMITS (in order)

| Hash       | Phase      | Description                                |
|------------|------------|--------------------------------------------|
| (pending)  | All phases | DIAG-020-A field_identities follow-up      |

(Commit SHA pasted to architect channel after Phase 4.3.)

## FILES CREATED

| File                                                    | Purpose       |
|---------------------------------------------------------|---------------|
| docs/completion-reports/DIAG-020-A_COMPLETION_REPORT.md | This file     |

## FILES MODIFIED

| File                                  | Change                                  |
|---------------------------------------|-----------------------------------------|
| docs/diagnostics/DIAG-020_FINDINGS.md | Appended Section 9 (DIAG-020-A results) |

## PROOF GATES — HARD

| # | Criterion (VERBATIM) | PASS/FAIL | Evidence |
|---|----------------------|-----------|----------|
| Phase 0 | HEAD on hf-193-signal-surface confirmed | PASS | `git rev-parse HEAD` → `882bc94c99a0200ebf10ef4b16df72c5e069d6a5`. `git rev-parse --abbrev-ref HEAD` → `hf-193-signal-surface`. Last 3 commits: 882bc94c (DIAG-020), 445fcb00 (HF-193 Phase 4), e76c3e27 (HF-193 Phase 3). HEAD = DIAG-020 final commit. |
| Phase 1 | metadata-key-frequency table produced for BCL | PASS | Phase 1 sampled 50 BCL rows out of 595. Six distinct top-level keys observed: `source`, `proposalId`, `semantic_roles`, `entity_id_field`, `resolved_data_type`, `informational_label` — each present in 50/50 rows. No keys starting with `field_` or `identity_`. Table pasted in Section 9. |
| Phase 1 | field_identities presence/absence stated explicitly | PASS | Quote: "field_identities present in: 0 of 50 sampled rows." Quote: "Keys starting with `field_` or `identity_`: (none)." |
| Phase 2 | If absent: per-batch absence table produced | PASS | All 7 distinct (import_batch_id, data_type) pairs probed with 10-row samples each (70 rows total). Every pair shows `with_field_identities = 0`. Table pasted in Section 9. Absence is universal across import batches and data_types. |
| Phase 2 | If present: field_identities raw structure pasted for ≥1 row | N/A | field_identities was absent in 70/70 rows; no structures to paste. |
| Phase 3 | Cross-tenant comparison table produced | PARTIAL | Table produced. CRP (`e44bbcb1-...`) and Meridian (`5035b1e8-...`) have 0 `committed_data` rows; H3 condition encountered (anticipated by directive — "proceed with available tenants; surface with note 'cross-tenant comparison limited.'"). BCL row in the table is fully populated (20 sampled, 0 with FI, 6 other metadata keys enumerated). |
| Phase 4 | DIAG-020_FINDINGS.md Section 9 appended with all 4 sub-sections | PASS | `grep -nE "^## 9\.\|^### Phase [123]:\|^### Confirmation status:\|^### Hypothesis confidence" docs/diagnostics/DIAG-020_FINDINGS.md` returns the 4 sub-section anchors plus the Section 9 header. File grew from 15504 to ~19500 bytes. |
| Phase 4 | Confirmation status is exactly one classification | PASS | Quote line: "**CONFIRMED — field_identities absent on BCL rows.**" |
| Phase 4 | Hypothesis confidence promoted (or held/lowered) explicitly | PASS | Quote line: "Promoted from MEDIUM to: **HIGH**." |

## PROOF GATES — SOFT

| # | Criterion | PASS/FAIL | Evidence |
|---|-----------|-----------|----------|
| Phase 1 | Sample size ≥ 50 rows | PASS | 50 rows sampled in the initial scan; 70 additional rows in the per-batch widened sample (Phase 2). |
| Phase 3 | Sample size ≥ 20 rows per non-BCL tenant | FAIL (uncontrollable) | CRP and Meridian have 0 `committed_data` rows in the live database; sampling cannot exceed available rows. Logged as KNOWN ISSUE. |

## STANDING RULE COMPLIANCE

- Rule 25: PASS — completion report created before Phase 4.3 commit/push.
- Rule 26: PASS — this file follows the template (COMMITS, FILES CREATED, FILES MODIFIED, PROOF GATES HARD/SOFT, STANDING RULE COMPLIANCE, KNOWN ISSUES, VERIFICATION SCRIPT OUTPUT).
- Rule 27: PASS — every gate has pasted evidence.
- Rule 28: N/A — single logical commit per directive.
- Rule 29: PASS — verified in source artifact.
- Rule 34: PASS — structural diagnostic; no code changes; no schema mutation; no fix attempted.
- Rule 36: PASS — scope held to metadata inspection. Import-pipeline files (`web/src/app/api/import/sci/execute*/route.ts`) were named in the hypothesis paragraph but NOT inspected — that's the H4 boundary the directive draws between observation and resolution.
- Rule 51v2: PASS — no code changes; commit affects only `docs/`.
- Korean Test: PASS — structural identifiers only (column names, key names, tenant UUIDs, SHAs).

## KNOWN ISSUES

- **Cross-tenant comparison limited.** CRP (tenant `e44bbcb1-2710-4880-8c7d-a1bd902720b7`) and Meridian (tenant `5035b1e8-0754-4527-b7ec-9f93f85e4c79`) have 0 `committed_data` rows in the live database; cross-tenant probe could only confirm BCL absence, not universality. The CROSS-TENANT classification (universal absence across tenants) cannot be ruled in or out from current state. To resolve, either (a) a fresh CRP or Meridian import is performed and the same probe re-run, or (b) the import-pipeline writer's behavior is inspected directly (deferred to HF-194 per disposition matrix).
- **Anchor-data caveat carried over from DIAG-020.** The current BCL `committed_data` was created on 2026-04-25 (today), per `created_at` on the rule_set and the metric_comprehension signals. DIAG-020-A demonstrates `field_identities` absence on the *current* BCL data. Whether March-19's BCL data also lacked `field_identities` (i.e., whether this is a true regression vs. a never-worked condition) cannot be determined without restoring the March-19 snapshot. The fact that BCL produced 4 component bindings on March 19 (per architect's prior observation) implies that EITHER (i) March-19 BCL data carried `field_identities` and the writer regressed since, OR (ii) March-19 used a different matcher path (e.g., richer token overlap from non-hash-prefixed `data_type` values) that today's data no longer triggers. Both require import-pipeline-side inspection (HF-194 scope).
- **HEAD branch.** Same as DIAG-020 — current branch is `hf-193-signal-surface`, not `main`. Push target is the same branch.

## VERIFICATION SCRIPT OUTPUT

None. (DIAG-020-A is evidence-paste only.)
