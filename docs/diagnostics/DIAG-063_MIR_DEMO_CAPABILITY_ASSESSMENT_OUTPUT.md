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

*(probe results pending)*

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
