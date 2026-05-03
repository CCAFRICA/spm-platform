# HF-196 Interim Completion Report — Platform Restoration Vision-Aligned Vertical Slice

**Branch:** `hf-196-platform-restoration-vertical-slice`
**HEAD at report:** `d811fc64` (Phase 1F-corrective)
**Date:** 2026-05-03
**Scope:** Phases 0 through 1F-corrective shipped; verification phases 5-RESET-3, 5-RESET-4, 5-RESET-5, 5C-1 through 5C-7, 5D, 5E (Oct calc only) executed.
**Status:** PHASES SHIPPED; awaiting Phase 1G architect disposition; 5G reconciliation against `$312,033` not yet verified.
**PR:** #359 (Open).

---

## Executive Summary

HF-196 closes three architectural breaks identified in Phase 6-AUDIT (commit `8c85be2c`) of the import-to-calculate substrate:

1. **Break #1 — Convergence path drift:** D153 atomic cutover incomplete.
2. **Break #2 — Entity binding gap:** OB-182 removed import-side entity resolution; calc-side never shipped.
3. **Break #3 — Import surface fragmentation:** `execute` (plan) vs `execute-bulk` (data) endpoints split with no shared post-commit construction.

All three architectural breaks closed in Phases 1, 2, 3 (plus Phase 4 integration verification). Phases 1B, 1C, 1D were latent regressions surfaced during reconstruction. Phases 1E, 1F, 1F-corrective added supersession primitive (Rule 30 lifecycle immutability over `import_batches`).

Phase 5C empirical sequence verified end-to-end Phase 1F SHA-256 supersession behavior across 7 imports + 1 plan. Phase 5E (October calc) surfaced an architectural defect upstream of the engine: `Cantidad_Productos_Cruzados` misclassified as `structuralType: 'identifier'` despite LLM HC tagging it `measure@0.90`. Phase 1G (next) applies Decision 108 (HC Override Authority Hierarchy LOCKED) to the role-binding sites that operatively write `field_identities.structuralType`.

HF-196 closes architecturally complete only on Phase 5G reconciliation against `BCL_Resultados_Esperados.xlsx` (`$312,033` ground truth). Phase 1G + Phase 5-RESET-6 are remaining sub-phases.

**Operative state at report:** dev server running PID 12080 on `localhost:3000` with commit `d811fc64`; BCL tenant has 7 operative `import_batches` + 1 `rule_set` (8th batch is the plan via HF-132 rule_sets-layer supersession path); 85 entities; 595 `committed_data` rows; 4 `convergence_bindings` (component_2 mis-bound to `Depositos_Nuevos_Netos`); October calc total `$82,551` vs expected `$44,590` (1.85x overshoot).

---

## Phase 0 — Prerequisites + Audit-Informed Current-State Read + BCL Clean-State Baseline

**Commit:** `45698a0a`
**Date:** 2026-04-30

### Scope
- Branch creation `hf-196-platform-restoration-vertical-slice` from main.
- Audit-informed read of Phase 6-AUDIT findings (commit `8c85be2c`).
- BCL tenant clean-state baseline established.
- `.gitignore` updated to exclude `test-fixtures/` (architect's expected results — GT data must not enter repo).

### Verification
- BCL committed_data wiped (Phase 6-PRE applied `024cd5d2`).
- Branch tracks remote.
- Three architectural breaks documented per audit before reconstruction.

### PASS Criteria — MET
- Pre-existing main-branch state preserved.
- Three breaks named, scoped, sequenced.

### Out-of-Scope Carry-Forward
- Test-fixtures contents preserved locally; not committed.

### Substrate Citations
- Phase 6-AUDIT findings (`8c85be2c`).
- Memory entry 7 (Vertical Slice Rule).
- Memory entry 17 (Read-only probes; verify before recommend).

---

## Phase 1 — Break #3: Import Surface Unified

**Commit:** `6276a79a`
**Date:** 2026-04-30

### Scope
- New module: `web/src/lib/sci/post-commit-construction.ts` exports `executePostCommitConstruction({ supabase, tenantId, source })`.
- Both `execute` (plan endpoint) and `execute-bulk` (data endpoint) now invoke the shared module after commit.
- Closes Break #3 — entity resolution + post-commit binding logic deduplicated.

### Verification
- Build PASS.
- Both endpoints run identical post-commit construction (re-confirmed in Phase 4 integration verification).
- Korean Test PASS.

### PASS Criteria — MET
- Single module owns post-commit construction.
- Both endpoints converge on shared module via single function call.

### Out-of-Scope Carry-Forward
- None.

### Substrate Citations
- Decision 77 (SCI execute API).
- OB-127 (SCI architecture).
- DS-009 §3.3 (post-import entity resolution).

---

## Phase 1B — HF-186 Entity Classifier Regression + HF-110 Resolver Re-Fix

**Commit:** `0767a390`
**Date:** 2026-05-02

### Scope
- `web/src/lib/sci/agents.ts`: split `if (hcRole === 'identifier' || hcRole === 'reference_key')` predicate. Identifier branch keeps original logic; new `reference_key` branch applies HF-186 agent-aware mapping (entity-agent → `entity_relationship`; other agents → `identifiesWhat`-driven).
- `web/src/lib/sci/entity-resolution.ts`: `metadata.entity_id_field` consulted FIRST per HF-110 Fix C extension; falls back to `field_identities` (first-match-wins, `break` added); falls back to `semantic_roles` (also first-match-wins).
- 1 file changed in agents.ts (+30, -1); separate edit on entity-resolution.ts.

### Verification
- Build PASS.
- Korean Test PASS.
- Self-test against BCL metadata: `metadata.entity_id_field === 'ID_Empleado'` → resolver selects `ID_Empleado` via primary signal.
- Phase 5-RESET subsequent sequences confirmed `distinct_entity_ids = 85`.

### PASS Criteria — MET
- HF-186 ported from `negotiation.ts:inferRoleForAgent` to `agents.ts:assignSemanticRole`.
- Resolver iteration short-circuits on first match (no last-match-wins behavior).
- BCL self-test PASS.

### Out-of-Scope Carry-Forward
- `isSequential` structural arm in `negotiation.ts:299` and `agents.ts:536` NOT modified by Phase 1B (Adjacent-Arm Drift — Phase 1G addresses).

### Substrate Citations
- HF-186 (commit `25449ea5`, 2026-04-01).
- HF-110 Fix C extension.
- DS-009 §3.3.

---

## Phase 1C — TEMPORAL_ROLES Whitelist (source_date Extraction)

**Commit:** `e757bc38`
**Date:** 2026-05-02

### Scope
- `web/src/lib/sci/source-date-extraction.ts`: replaced `NON_TEMPORAL_ROLES` blacklist with `TEMPORAL_ROLES` whitelist.
- Whitelist set: `{'temporal', 'date', 'timestamp', 'transaction_date', 'event_date', 'event_timestamp', 'effective_date', 'period_marker', 'cutoff_date'}`.
- HF-185 negative-filter pattern inverted to positive filter (Decision 92 + OB-107 + April 1 EFG analysis).

### Verification
- Build PASS.
- Korean Test PASS (whitelist tokens are platform-defined semantic roles, not domain literals).
- Phase 5C source_date histograms across 6 monthly imports: `2025-10-01:85, 2025-11-01:85, 2025-12-01:85, 2026-01-01:85, 2026-02-01:85, 2026-03-01:85`. Zero spurious dates (e.g., V8 `new Date("BCL-GYE-001")` parsing as 2001 — closed).

### PASS Criteria — MET
- No spurious 2001 dates in committed_data after Phase 1C.
- 100% source_date extraction success across 510 transaction rows.

### Out-of-Scope Carry-Forward
- None.

### Substrate Citations
- Decision 92 (calc-time entity binding via `source_date BETWEEN period.start AND period.end`).
- HF-185 (`NON_TEMPORAL_ROLES` original blacklist; superseded).
- OB-107.

---

## Phase 1D — data_type per D154/D155 (Single Canonical)

**Commit:** `70e28a40`
**Date:** 2026-05-02

### Scope
- New module: `web/src/lib/sci/data-type-resolver.ts` exports `resolveDataTypeFromClassification(classification)`. Identity mapping (`data_type === informational_label`) per D154/D155.
- 4 import paths converged on shared resolver: `executeTargetPipeline`, `executeTransactionPipeline`, `executeEntityPipeline`, `executeReferencePipeline` (`execute/route.ts`); plus `processDataUnit` boundary parity (`execute-bulk/route.ts`).
- `normalizeFileNameToDataType` (legacy filename-based vocabulary) repurposed to hashing-only use; D154 violation removed.

### Verification
- Build PASS.
- Korean Test PASS.
- Phase 5C-2 through 5C-7: all 510 transaction rows persisted `data_type='transaction'` consistent across Spanish-month-token files (Oct, Nov, Dic, Ene, Feb, Mar). No divergence surfaced.

### PASS Criteria — MET
- Single canonical resolver consumed by 4 dispatch sites.
- Spanish-month-token Phase 1D carry-forward verified non-blocking at Phase 5D.

### Out-of-Scope Carry-Forward
- `commit/route.ts` + `intelligence/wire/route.ts` data_type vocabulary surfaces logged; Phase 5D empirical verification confirmed non-blocking. Future cleanup deferred.

### Substrate Citations
- D154/D155 (single canonical declaration).
- Decision 111 (HF-108 convergence_bindings primary).

---

## Phase 2 — Break #2: Calc-Time Entity Resolver (Decision 92)

**Commit:** `3dfef568`
**Date:** 2026-05-01

### Scope
- New module: `web/src/lib/sci/calc-time-entity-resolution.ts` exports `resolveEntitiesAtCalcTime(tenantId, supabase)`.
- Closes Break #2 — engine no longer relies on import-time entity_id binding alone; calc-time binding via Decision 92 (`source_date BETWEEN period.start AND period.end`).
- Wired into calculation/run/route.ts.

### Verification
- Build PASS.
- Phase 5E (Oct calc): `[CalcAPI] Calc-time entity resolution: tenant=… null_rows_before=0 matched=0 unmatched=0 (235ms)`. Indicates 100% pre-bound at import time; calc-time resolver fires defensively.

### PASS Criteria — MET
- Calc-time resolver invoked for every calc run.
- Defensive zero-op behavior when import-time binding already complete.

### Out-of-Scope Carry-Forward
- None.

### Substrate Citations
- Decision 92 (calc-time entity binding).
- DS-009 §3.3 (post-import entity resolution).

---

## Phase 3 — Break #1: D153 Atomic Cutover (Signal-Surface Reader)

**Commit:** `3d93e5b2`
**Date:** 2026-05-01

### Scope
- `web/src/lib/intelligence/convergence-service.ts`: added `loadMetricComprehensionSignals` function (~line 722).
- Added `metricComprehension: MetricComprehensionSignal[]` to observations payload.
- Closes Break #1 — D153 atomic cutover via signal-surface read (Phase 0E divergence: PR #342 had reverted seeds-eradication; Phase 3 ADDED reader rather than REPLACED nonexistent seeds path).

### Verification
- Phase 5-RESET-3 verdict PARTIAL: analyze layer INTACT; commit-bulk INERT (signal-surface reads rest of pipeline). Subsequent phases verified end-to-end.
- Phase 5D convergence emitted `2 derivations, 3 gaps, 4 component bindings` — read path operative.

### PASS Criteria — MET
- `loadMetricComprehensionSignals` invoked at convergence time.
- ZERO `seeds`/`plan_agent_seeds`/`emitSeed`/`writeSeeds` emissions in convergence run window (Phase 5D verified).

### Out-of-Scope Carry-Forward
- Path Z.1-A architect-dispositioned: signal-surface reader supplements but does not replace; consistent with PR #342 cutover-revert.

### Substrate Citations
- D153 (atomic cutover).
- PR #342 (cutover-revert).
- Decision 30 v1 (no `training:*` signal_type).

---

## Phase 4 — Integration Verification

**Commit:** `2acc66b5`
**Date:** 2026-05-01

### Scope
- End-to-end import-to-calculate flow traced across all three break-closures.
- Build + lint green.
- No new code; integration audit only.

### Verification
- Build PASS.
- Lint PASS.
- Both import endpoints invoke shared `executePostCommitConstruction`.
- Calc-time resolver wired.
- Convergence read-path operative.

### PASS Criteria — MET
- Three breaks verified closed in production code paths.

### Out-of-Scope Carry-Forward
- Empirical reconciliation deferred to Phase 5G.

### Substrate Citations
- Phase 6-AUDIT (`8c85be2c`).

---

## Phase 1E — Import Batch Supersession Schema (Rule 30 Pattern)

**Commit:** `3293b543`
**Date:** 2026-05-02

### Scope
- Migration: `import_batches` columns added — `superseded_by`, `supersedes`, `superseded_at`, `supersession_reason`. CHECK constraint enforces `superseded_by NOT NULL ↔ superseded_at NOT NULL`.
- Migration: `structural_fingerprints.import_batch_id` FK added (Path B-prime lineage primitive — informational, not load-bearing for supersession).
- New module: `web/src/lib/sci/import-batch-supersession.ts` — initial implementation triggered on `(tenant_id, structural_fingerprint)` matches per DS-017.
- Engine queries filter operative-only via `fetchSupersededBatchIds` + `NOT IN` (17 query sites converged in convergence-service.ts).
- SOC 2 CC6.1/CC7.2, GDPR Article 30, LGPD Article 37 audit trails preserved.

### Verification — Phase 5-RESET-4 INTACT end-to-end
- Audit columns populated per CHECK constraint.
- Single supersession event emitted (`[Phase 1E] Superseded prior batch …`).
- 170 rows preserved across 2 batches (85 superseded + 85 operative).
- 100% entity_id back-link.

### PASS Criteria — MET (architecturally; Phase 1F replaces trigger primitive)
- Schema applied; CHECK constraint enforced.
- Engine reads filter operative-only.

### Out-of-Scope Carry-Forward
- HF-198 candidate: `calculation_batches` parallel audit-column gap (`superseded_at`, `supersession_reason`) surfaced during Phase 1E-1.

### Substrate Citations
- Rule 30 (Lifecycle Immutability for OFFICIAL+ batches LOCKED 2026-02-14).
- DS-017 (Adaptive Immunity / Structural Fingerprinting LOCKED 2026-03-18).
- SOC 2 CC6.1/CC7.2; GDPR Article 30; LGPD Article 37.
- Memory entry 30 (Progressive Performance constitutional commitment).

---

## Phase 1F — Supersession Trigger Correction via SHA-256 Content Hash

**Commit:** `a2e9a4b1`
**Date:** 2026-05-03

### Scope
- Migration: `import_batches.file_hash_sha256` column added (FILE 1, applied pre-5-RESET-5).
- Migration: `file_hash_sha256 SET NOT NULL` (FILE 2, applied post-5-RESET-5 wipe).
- New module: `web/src/lib/sci/file-content-hash.ts` — `computeFileHashSha256(buffer)` server-side SHA-256 via `node:crypto`. Isolated from client bundle path.
- Modified module: `web/src/lib/sci/import-batch-supersession.ts` — `findPriorOperativeBatch` single-query lookup on `import_batches` by `(tenant_id, file_hash_sha256, superseded_by IS NULL)`; `supersedePriorBatchOnContentMatch` exports.
- `execute-bulk/route.ts`: SHA computed once from raw file bytes (line 141); threaded through 4 process functions; each insert sets `file_hash_sha256`; each calls `supersedePriorBatchOnContentMatch`.
- `execute/route.ts`: 4 dispatch pipelines updated; **DEFECT** at this commit — used `Buffer.from(JSON.stringify(unit.rawData))` (not raw file bytes); FP-43/AP-34/OB-50 violations.

### Verification — Phase 5-RESET-5 (5 architect signals)
- Step 1 wipe: 0 batches, 0 NULL rows.
- Step 2 first import: 1 operative batch; SHA `ea2b180e…84e80` captured; no supersession.
- Step 3 second same-file: 2 batches; supersession event emitted exactly once; CHECK constraint satisfied; superseded batch's `superseded_by`/`supersedes`/`supersession_reason`/`superseded_at` populated.
- Step 4 BCL_Datos_Oct2025.xlsx: 3 batches; new SHA `ead27d82…65e08` distinct; additive (no supersession).
- Step 5 BCL_Datos_Nov2025.xlsx: 4 batches; new SHA `9ddb369f…64e66242` distinct from Oct; additive (Phase 1E Oct/Nov misfire CLOSED — same DS-017 fingerprint `fbead6eed137` does NOT trigger supersession because content SHA differs).
- File 2 NOT NULL applied post-wipe; `23502 — null value … violates not-null constraint` self-test confirms enforcement.

### PASS Criteria — MET (architecturally; corrective in next commit)
- 4 import_batches; signal-2 superseded by signal-3-id; signal-3 + signal-4 both operative.
- Single `[Phase 1F] Superseded prior batch` log emission.
- DS-017 fingerprint match_count increments per re-import.
- Engine reads filter operative-only via NOT IN.

### Out-of-Scope Carry-Forward
- HF-199 candidate: OB-50 surface restoration (15 schema columns missing on `ingestion_events`; SCI flow bypasses).

### Substrate Citations
- Rule 30 (LOCKED 2026-02-14).
- DS-017 §2.3 (October and November files with different numbers but same columns produce same fingerprint).
- OB-50 Three-Layer Data Architecture (LOCKED 2026-02-17).
- Architect-dispositioned Path Z.1-A (2026-05-03): import_batches.file_hash_sha256 substrate-extending anchor; DS-017 structural_fingerprints unchanged for analyze-time Tier 1 immunity.

---

## Phase 1F-corrective — Forward-Fix per SR-41 (Raw File Bytes)

**Commit:** `d811fc64`
**Date:** 2026-05-03

### Scope
- `web/src/app/api/import/sci/execute/route.ts`:
  - POST handler computes SHA-256 over raw file bytes downloaded from `ingestion-raw` storage (line 87-109).
  - Validation gate returns 400 when non-plan units lack `storagePath` or download fails.
  - `executeContentUnit` accepts `fileHashSha256: string | null` parameter (line 462).
  - 4 non-plan pipelines (`executeTargetPipeline`, `executeTransactionPipeline`, `executeEntityPipeline`, `executeReferencePipeline`) accept `fileHashSha256: string` (non-null assertion at dispatch).
  - All 4 instances of `Buffer.from(JSON.stringify(unit.rawData))` removed.
  - Plan path (`executePlanPipeline`) unchanged — uses HF-132 rule_sets-layer supersession.
- 1 file changed; +51 / −16 lines.

### Verification
- Build PASS (exit 0).
- `grep "JSON.stringify.*rawData"` returns zero matches.
- Korean Test PASS (zero domain literals).
- Forward-fix per SR-41 — Phase 1F commit `a2e9a4b1` not reverted; new commit on top.
- Phase 5-RESET-5 protocol PASS criteria still hold (Phase 1F migration empirical verification carried over).

### PASS Criteria — MET
- FP-43/AP-34/OB-50 violations removed.
- Both import endpoints (`execute` + `execute-bulk`) compute SHA over raw file bytes (parser-independent, deterministic across reruns).

### Out-of-Scope Carry-Forward
- None for this commit.

### Substrate Citations
- FP-43 (LOCKED 2026-03-07): JSONB blob instead of specification-defined columns.
- AP-34 (LOCKED 2026-03-07): Stuffing structured data into generic JSONB.
- OB-50 (LOCKED 2026-02-17): Three-Layer Data Architecture — Phase 1F SHA must identify RAW layer (bytes), not TRANSFORMED layer (rawData parsed JSON).
- SR-41: revert discipline — corrections are forward-fixes, not reverts.

---

## Verification Phases — Empirical Evidence

### Phase 5-RESET-3 — Progressive Performance Verdict PARTIAL

| Layer | Status |
|---|---|
| Analyze | INTACT — DS-017 fingerprinting + HC + classification operative |
| commit-bulk pipeline | INERT — pre-Phase 1F end-to-end signal-surface reads not yet wired |

Phases 1E + 1F + Phase 5C re-runs verified subsequent layers.

### Phase 5-RESET-4 — Phase 1E Verification INTACT End-to-End

| Probe | Result |
|---|---|
| `import_batches` count | 2 |
| Audit columns populated | ✓ (`superseded_by`, `supersedes`, `superseded_at`, `supersession_reason`) |
| Supersession single-event emission | ✓ |
| 170 rows preserved across 2 batches | ✓ (85 superseded + 85 operative) |
| Engine reads filter operative-only | ✓ via `fetchSupersededBatchIds` + NOT IN |
| `entity_id` back-link rate | 100% (85/85) |

### Phase 5-RESET-5 — Phase 1F Empirical Verification

| Step | Action | Result |
|---|---|---|
| 1 | Wipe applied | 0 batches; NULL `file_hash_sha256` rows = 0 |
| 2 | First import (BCL_Plantilla_Personal.xlsx, 85 rows) | 1 operative batch (`6ad7d85a`); SHA `ea2b180e…84e80` captured; no supersession |
| 3 | Second import same file | 2 batches; `6ad7d85a` superseded by `cf956eb7`; emission count = 1; CHECK constraint satisfied |
| 4 | BCL_Datos_Oct2025.xlsx (different SHA) | 3 batches; new SHA `ead27d82…65e08`; additive (no supersession of prior batches) |
| 5 | BCL_Datos_Nov2025.xlsx (different SHA, same DS-017 fingerprint as Oct) | 4 batches; new SHA `9ddb369f…64e66242`; additive (**Phase 1E Oct/Nov misfire CLOSED**); fingerprint `fbead6eed137` Tier 1 hit `match_count=1` |
| 6 | File 2 NOT NULL applied post-wipe | `23502` violates not-null constraint self-test PASS |

### Phase 5C-1 through 5C-7 — Post-wipe full sequence

| Step | File | Operative batches | Distinct SHA | Txn fingerprint match_count | source_date histogram |
|---|---|---|---|---|---|
| 5C-1 | BCL_Plantilla_Personal.xlsx | 1 | `ea2b180e…` | n/a (entity FP `a94f3b01211a`, match=1) | n/a |
| 5C-2 | BCL_Datos_Oct2025.xlsx | 2 | `ead27d82…` | 1 (Tier 3, LLM called) | `2025-10-01:85` |
| 5C-3 | BCL_Datos_Nov2025.xlsx | 3 | `9ddb369f…` | 2 (Tier 1 cache hit) | `2025-10-01:85, 2025-11-01:85` |
| 5C-4 | BCL_Datos_Dic2025.xlsx | 4 | `90a6f43e…` | 3 | `+ 2025-12-01:85` |
| 5C-5 | BCL_Datos_Ene2026.xlsx | 5 | `d06d36671d3d` | 4 | `+ 2026-01-01:85` |
| 5C-6 | BCL_Datos_Feb2026.xlsx | 6 | `aa9a02782e9b` | 5 | `+ 2026-02-01:85` |
| 5C-7 | BCL_Datos_Mar2026.xlsx | 7 | `20db83c57792` | 6 | `+ 2026-03-01:85` |

End state: 7 operative batches; 85 entities; 510 transaction rows; 100% `entity_id` back-link (510/510); DS-017 `match_count=6` on transaction fingerprint; zero `[Phase 1F] Superseded` emissions across Phase 5C window (Phase 1E misfire confirmed structurally closed).

### Phase 5D — Plan Import (BCL_Plan_Comisiones_2025.xlsx)

| Halt Criterion | Required | Actual |
|---|---|---|
| `rule_sets` count | 1 | 1 (`bc961d14-3bbf-4972-a1ed-445a5007bc66`, "Plan de Comisiones — Banca Minorista 2025-2026", status=active, version=1) |
| `seeds` emissions in convergence | 0 | 0 |
| `UnconvertibleComponentError` emissions | 0 | 0 |

Other state:
- AI plan interpretation completed: 2 variants × 4 components = 8 components from 3 sheets.
- Convergence: `2 derivations, 3 gaps, 4 component bindings`.
- HF-126 `rule_set_assignments`: 85 entities × 1 rule set.
- Plan structural_fingerprint `ba3b22b7d673` cls=plan match_count=1 (Tier 3, LLM called 14.9s).
- HF-132 rule_sets-layer plan supersession path; plan does NOT insert into `import_batches` (architectural — Phase 1F primitive scope is non-plan only).

Cumulative end-state target listed "8 import_batches" in dispatch table; actual 7 + 1 rule_set. **This is per architecture, not regression.**

### Phase 5E — October Calc (Single Period Only)

| Metric | Expected | Actual | Verdict |
|---|---|---|---|
| Calculated grand total | $44,590 | **$82,551** | FAIL (1.85x overshoot) |
| Concordance (legacy vs intent executor) | 100% | 100% (85 match, 0 mismatch) | OK — both arrived at $82,551 |

Root cause surfaced and forensically traced to:
1. **Cantidad_Productos_Cruzados misclassification** — HC tagged `measure@0.90`; structural OR-peer arm at `negotiation.ts:299` overrode to `entity_identifier` because distinct integer values formed consecutive sequence ({1..10}) per `content-profile.ts:412-416 isSequential` definition.
2. **Persisted state** — `field_identities.structuralType = 'identifier'`, `contextualIdentity = 'person_identifier'` via `field-identities.ts:21` ROLE_MAP forced mapping.
3. **Convergence layer** excluded `Cantidad_Productos_Cruzados` from `measureColumns` candidate pool at `convergence-service.ts:1748` (filter: `fi.structuralType === 'measure'`).
4. **AI mapping** picked `Depositos_Nuevos_Netos` for component_2 (Productos Cruzados) from the eligible pool.
5. **SCALE ANOMALY auto-correction** detected ratio=2636 vs peer median; applied `scale_factor=0.001` to `Depositos_Nuevos_Netos` binding (line 325) instead of rejecting the binding; masked the misbinding into a plausible-shaped wrong result.

Authorship probe verdict: `negotiation.ts:299` OR predicate genesis at HF-095 Phase 2 (`5351a1b4`, 2026-03-06). Predicate has not changed since genesis. HF-169 (`6219f73f`), HF-171 (`43c07ac8`), HF-186 (`25449ea5`), HF-196 Phase 1B (`0767a390`) all closed adjacent arms of the same defect-class (HC primacy) but left this arm intact.

### Phase 5G — Reconciliation Against $312,033

**NOT YET VERIFIED.** Pending Phase 1G completion + Phase 5-RESET-6 empirical re-run.

---

## Decisions Locked This Session

1. **Phase 1E architecture (architect-dispositioned 2026-05-02):** Rule 30 pattern applied to `import_batches`; supersession columns (`superseded_by`, `supersedes`, `superseded_at`, `supersession_reason`); engine operative-only filter via `fetchSupersededBatchIds` + NOT IN; SOC 2/GDPR/LGPD audit trail preserved.
2. **Phase 1F primitive (architect-dispositioned 2026-05-03):** Path Z.1-A — `import_batches.file_hash_sha256` substrate-extending anchor; DS-017 `structural_fingerprints` unchanged for analyze-time Tier 1 immunity. Two surfaces, two primitives, two purposes — D154/D155 single-canonical preserved.
3. **Phase 1F-corrective forward-fix shape (architect-dispositioned 2026-05-03):** SHA computed over raw file bytes from `ingestion-raw` storage; threaded through `executeContentUnit` to 4 non-plan pipelines; replaces JSON.stringify intermediates per FP-43/AP-34/OB-50 alignment. Forward-fix per SR-41 (Phase 1F not reverted).

---

## CC Failure Patterns Encountered + Closed

| Pattern | Closure |
|---|---|
| **FP-43 / AP-34** (Phase 1F initial) | Phase 1F-corrective `d811fc64` removed all 4 `Buffer.from(JSON.stringify(rawData))` instances; SHA now computed over raw file bytes. |
| **GT data leak** (Phase 1) | `git reset --soft HEAD~1`; added `test-fixtures/` to `.gitignore`; force-pushed corrected branch. |
| **Phase 0E divergence** (PR #342 cutover-revert misread) | Phase 3 ADAPTED — added signal-surface reader rather than REPLACED nonexistent seeds path. |
| **HF-186 regression** (latent from history) | Phase 1B ported HF-186 pattern from `negotiation.ts:inferRoleForAgent` to `agents.ts:assignSemanticRole`. |
| **HF-110 Fix C extension** (latent from history) | Phase 1B added `metadata.entity_id_field` as primary signal in entity-resolution.ts iteration. |
| **HF-185 source_date over-extraction** (latent from history) | Phase 1C inverted blacklist to TEMPORAL_ROLES whitelist (positive filter). |
| **D154 violation** in `normalizeFileNameToDataType` | Phase 1D introduced single canonical resolver `resolveDataTypeFromClassification`; legacy fn repurposed for hashing. |
| **Phase 1E supersession misfire on monthly transactions** | Phase 1F replaced trigger primitive (DS-017 fingerprint → SHA-256 content hash). |
| **Adjacent-Arm Drift** (named this session) | Phase 1G (in-flight) addresses `negotiation.ts:299` + `agents.ts:536` role-binding sites. |

---

## Defects Surfaced + Status

| Defect | Status |
|---|---|
| **HF-202 candidate** — 6 isSequential affinity/upstream-signal sites pending Decision 108 (`negotiation.ts:34, 79, 125`; `content-profile.ts:217, 460`; `tenant-context.ts:146`) | Out-of-scope for Phase 1G operative scope; logged for follow-on. |
| **HF-203 candidate** — SCALE ANOMALY correction architectural inversion (`convergence-service.ts:1558-1591` + `:317-333`); should reject binding on ratio>10, not patch `scale_factor` | Logged; deferred. |
| **HF-198 candidate** — `calculation_batches.superseded_at` + `supersession_reason` audit-column gap (surfaced Phase 1E-1) | Logged. |
| **HF-199 candidate** — OB-50 surface restoration (15 schema columns missing on `ingestion_events`; SCI flow bypasses) | Logged; substrate-extending Phase 1F preserved space for HF-199. |
| **Plan-path data_type vocabulary** (`commit/route.ts` + `intelligence/wire/route.ts`) | Phase 5D verified non-blocking; carry-forward. |
| **HF-205 candidate** — Pipeline-ordering for HC primacy (Phase 1G Path α may absorb if architect dispositions case (b.1) for `content-profile.ts:218`) | In-flight architect disposition. |

---

## Phase 1G Forward Plan

**Scope (Path α candidate per architect disposition):**
- **Site 1 — `negotiation.ts:299`:** split predicate. Identifier branch on `hcRole === 'identifier'` only; structural arm gated by `(!hcRole || hcRole === 'unknown')`. Confidence 0.85 → 0.75 in HC-silence branch.
- **Site 2 — `agents.ts:536`:** gate by `(!hcRole || hcRole === 'unknown')`. Confidence 0.85 → 0.75. Twin of Site 1.
- **Site 3 — `content-profile.ts:218`:** Case (b) — HC NOT available at call site (pre-HC profile generation). Architect disposition required: (b.1) thread HC through; (b.2) demote signal strength; (c-effective) reclassify to HF-202 alongside 5 OR-peer siblings.

**Verification phase: 5-RESET-6.**

| Architect signal | CC verifies |
|---|---|
| wipe applied | `import_batches` count = 0 across all tenants; NULL file_hash_sha256 = 0 (NOT NULL constraint enforced) |
| 7 imports done | 7 operative batches; persisted `Cantidad_Productos_Cruzados.structuralType === 'measure'` (post-1G fix empirical confirmation) |
| plan import done | rule_set 1 active; convergence emits component_2 binding to **`Cantidad_Productos_Cruzados`**, NOT `Depositos_Nuevos_Netos` |
| calc done across 6 periods | 6 calculation_batches; SCALE ANOMALY emissions ≈ 0 (was symptom of misbinding); per-period totals within 0.5% of ground truth |
| 5G reconcile | grand total = $312,033 ± 0.5%; component-level reconciliation against `BCL_Resultados_Esperados.xlsx` |

**Reconciliation criterion for HF-196 architectural closure:** grand total `$312,033` ± 0.5%.

Per-period expected totals (architect-supplied dispatch table):
- $44,590 (Oct), $46,291 (Nov), $61,986 (Dic), $47,545 (Ene), $53,215 (Feb), $58,406 (Mar) = **$312,033**.

---

## Memory Entries Locked This Session

**Memory entry 30 — Progressive Performance constitutional commitment:** "Reconstruction restores what worked, not builds anew." Phase 1B/1C/1D/1E closed regressions or wired existing infrastructure consistent with this discipline. Phase 1F/1F-corrective added new substrate (Phase 1F is substrate-EXTENDING per architect Path Z.1-A; not in tension with Memory entry 30 because the SHA-256 trigger primitive replaces a defective primitive — Phase 1E fingerprint trigger — that was introduced earlier in HF-196 itself, not pre-existing operative substrate). Phase 1G is substrate-APPLYING (locked Decision 108 to a predicate that always violated it; pre-existing architectural drift from March 6 — predates reconstruction work).

---

## Phase 1G Status at Report

**Working tree (UNSTAGED, NOT committed):**
- `web/src/lib/sci/agents.ts` (modified) — Site 2 gating applied.
- `web/src/lib/sci/negotiation.ts` (modified) — Site 1 split + gating applied.
- `web/src/lib/sci/content-profile.ts` — UNTOUCHED pending architect disposition on Case (b).

Phase 1G commit deferred pending architect disposition on Site 3.

**End of report.**
