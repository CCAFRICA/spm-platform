# HF-213 Phase 6 — Regression Evidence

**Branch:** `hf-213-atomic-supersession-resolver-closure`
**Date:** 2026-05-07
**Scope:** Architect-mediated regression evidence per directive §6.5. Verbatim outputs only; no numeric reconciliation interpretation.

---

## Section 1 — Architect-channel reconciliation verdict

**Verdict:** PASS per scope (supersession identity primitive defect closed empirically).

Reconciliation performed in architect-channel per T2-E46 reconciliation-channel separation. CC documents structural verification only.

---

## Section 2 — Meridian regression: most recent calc invocation (verbatim from dev server stdout)

**Source:** Background task `bc3byrh60` stdout at `/private/tmp/claude-501/.../tasks/bc3byrh60.output` (lines 1465-1661).

```
[CalcAPI] Phase 1E: 5 superseded batches excluded from engine reads
[CalcAPI] Starting: tenant=5035b1e8-0754-4527-b7ec-9f93f85e4c79, period=9d407e91-ad75-4a9b-b052-7808b47882e0, ruleSet=5816d6d0-7d86-4de0-b4ed-176587a93928, run=b4717af0-c842-41d7-834e-d7c27902e621
[CalcAPI] Calc-time entity resolution: tenant=5035b1e8-0754-4527-b7ec-9f93f85e4c79 null_rows_before=0 matched=0 unmatched=0 (98ms)
[CalcAPI] Rule set "Meridian Logistics Group Incentive Plan 2025" has 5 components
[CalcAPI] HF-165: input_bindings already populated — skipping convergence
[CalcAPI] HF-108 Using convergence_bindings (Decision 111) for data resolution — 5 component bindings
[CalcAPI]   component_0: row, column, entity_identifier
[CalcAPI]   component_1: actual, entity_identifier
[CalcAPI]   component_2: actual, entity_identifier
[CalcAPI]   component_3: actual, entity_identifier
[CalcAPI]   component_4: actual, entity_identifier
[CalcAPI] OB-76 Intent layer: 5 components transformed to intents
[CalcAPI] 79 entities assigned (paginated fetch)
[CalcAPI] Period: 2025-03
[CalcAPI] OB-152 source_date path: 91 rows for 2025-03-01..2025-03-31
[CalcAPI] Fetched 158 committed_data rows (hybrid, incl. period-agnostic)
[CalcAPI] HF-109 Batch cache: 3 batches indexed by external_id (DS-009 5.1)
[CalcAPI] 158 committed_data rows (158 entity-level, 0 store-level)
[CalcAPI] Store data: 0 unique stores
[CalcAPI] No roster sheet detected — calculating all 79 assigned entities
[CalcAPI] No AI context found in import_batches — using fallback name matching
[CalcAPI] Agent memory loaded: 5 tenant patterns, 36 foundational, 22 domain
[CalcAPI] Pattern signatures: 5 generated
[CalcAPI] Batch created: b4717af0-c842-41d7-834e-d7c27902e621
[CalcAPI] [CalcTrace] context tenantId=5035b1e8-0754-4527-b7ec-9f93f85e4c79 tenantName=Meridian Logistics Group periodId=9d407e91-ad75-4a9b-b052-7808b47882e0 periodLabel=2025-03 ruleSetId=5816d6d0-7d86-4de0-b4ed-176587a93928 ruleSetName=Meridian Logistics Group Incentive Plan 2025 calcBatchId=b4717af0-c842-41d7-834e-d7c27902e621
[CalcAPI] [CalcRecon-T1] entitiesAssigned=79 components=5
[CalcAPI] [CalcRecon-T1] componentList=[c0:Revenue Performance - Senior | c1:On-Time Delivery - Senior | c2:New Accounts - Senior | c3:Safety Record - Senior | c4:Fleet Utilization - Senior]
[CalcAPI] OB-76 Dual-path: 67 match, 0 mismatch (84.8% concordance)
[CalcAPI] Grand total: 4,219,229
[CalcAPI] OB-194: 67 calculated, 12 excluded (no qualifying variant)
[CalcAPI] [CalcRecon-T1] entitiesCalculated=67 grandTotal=4219229
[CalcAPI] [CalcRecon-T1] componentTotals=[c0:21900 | c1:5000 | c2:0 | c3:25300 | c4:4167029]
[CalcAPI] [CalcRecon-T1] flags={diag003Fallback:0/NaN boundaryFallback:0 ob118MergeGuardFired:0/NaN}
[CalcAPI] [CalcRecon-T1] variantDistribution={variant_1(unknown):41 | variant_0(unknown):26}
[CalcAPI] COMPLETE: batch=b4717af0-c842-41d7-834e-d7c27902e621, entities=67, total=4219229
 POST /api/calculation/run 200 in 4262ms
```

(Full ~200-line block including all per-entity Tier 2 lines and VARIANT-DIAG/VARIANT decisions captured in dev server stdout file; representative excerpt above.)

---

## Section 3 — Structural verification markers

### 3.1 — HF-196 Phase 1E supersession exclusion FIRED

```
[CalcAPI] Phase 1E: 5 superseded batches excluded from engine reads
```

Confirms 5 batches in Meridian tenant marked superseded post-HF-213 supersession primitive scope change. Engine reads filtered via `NOT IN (supersededIds)` per HF-196 Phase 1E architecture (preserved unchanged in HF-213).

### 3.2 — Operative batch count

```
[CalcAPI] HF-109 Batch cache: 3 batches indexed by external_id (DS-009 5.1)
```

3 operative batches contributing committed_data to engine reads. Compare to pre-HF-213 state (per directive §1 Manifestation 1: 6 batches collapsed into 1 operative under file_hash_sha256 scope; 5 batches were superseded into a chain leaving only the last surviving).

Post-HF-213: 3 operative batches each represent an independent content unit. Cross-content-unit supersession chaining structurally prevented by content_unit_hash_sha256 scope.

### 3.3 — Committed_data row count (non-zero, structurally complete)

```
[CalcAPI] OB-152 source_date path: 91 rows for 2025-03-01..2025-03-31
[CalcAPI] Fetched 158 committed_data rows (hybrid, incl. period-agnostic)
[CalcAPI] 158 committed_data rows (158 entity-level, 0 store-level)
```

158 rows reach the engine: 91 from source_date path (period 2025-03) + 67 period-agnostic (per OB-128).

Compare to pre-HF-213 manifestation: only 36 rows (last batch only) reached engine because cross-content-unit supersession chained Plantilla and Datos_Rendimiento out of operative state. Post-HF-213: 158 rows reach engine; data flow restored.

### 3.4 — Entity calculation count

```
[CalcAPI] OB-194: 67 calculated, 12 excluded (no qualifying variant)
```

67 human entities calculated; 12 hub entities excluded as `no_qualifying_variant` (variant matching domain-orthogonal — separate from supersession scope).

Compare to pre-HF-213 manifestation: grandTotal=$0 because all 67 humans excluded under the prior supersession scope (their data was in Plantilla and Datos_Rendimiento — both filtered as superseded). Post-HF-213: 67 humans calculated; data flow restored at supersession boundary.

### 3.5 — Calc completion

```
[CalcAPI] COMPLETE: batch=b4717af0-c842-41d7-834e-d7c27902e621, entities=67, total=4219229
 POST /api/calculation/run 200 in 4262ms
```

HTTP 200 in 4262ms. Engine completes successfully. Calc output is structurally non-trivial (non-zero grand total; non-trivial per-component totals).

---

## Section 4 — Hash module unit test verification (Phase 2.3)

9/9 unit tests PASS at Phase 2.3 (per `npm test` output captured in Phase 2 commit `62b4534d`):

```
✔ empty rows produces stable hash
✔ column order independence
✔ row order independence
✔ whitespace normalization (trim)
✔ null/undefined/empty-string equivalence
✔ different content produces different hashes
✔ Korean Test compliance
✔ CSV escape disambiguation
✔ Manifestation 2 — cross-container content identity
ℹ tests 9
ℹ pass 9
ℹ fail 0
```

**Manifestation 2 closure verified structurally** by Test 9 (cross-container content identity): identical record content in different file containers produces identical `content_unit_hash_sha256`.

---

## Section 5 — BCL and CRP regression — skipped per architect direction

Per architect-channel direction (2026-05-07): BCL and CRP regression skipped because:

> "BCL and CRP regression skipped per architect direction (HF-213 verified empirically on Meridian; BCL/CRP not at risk because their data shapes are single-content-unit-per-file, never exercised the multi-content-unit defect that HF-213 closed)."

Single-content-unit-per-file tenants do not exercise Manifestation 1 (cross-content-unit supersession chaining within a single file). HF-196 Phase 1F supersession scope behaved correctly for these tenants pre-HF-213. Post-HF-213, the new content_unit_hash_sha256 scope produces equivalent supersession behavior for single-content-unit-per-file inputs (single content unit's hash IS the file's hash domain, structurally).

---

## Section 6 — C4 magnitude carry-forward (separate defect class; NOT HF-213 scope)

Component `c4` (Fleet Utilization) shows magnitude divergence from architect-channel ground truth in the Meridian regression. Per architect-channel disposition (2026-05-07):

> "C4 magnitude defect is separate work (not HF-213 scope, surfaces post-HF-213 because supersession closure unblocked data flow to c4)."

> "Component c4 (Fleet Utilization) shows magnitude divergence from architect-channel ground truth — this is a SEPARATE defect class (component formula / Fleet Utilization computation surface) that was latent pre-HF-213 because c4's data was filtered from operative reads under the prior supersession scope. C4 magnitude is not HF-213 scope."

> "Per directive Critical HALT Condition 5: calc output IS explained by HF-213's supersession-scope correction. C4 magnitude defect is downstream surface unblocked by HF-213, not caused by HF-213."

> "Per Vertical Slice Rule: c4 closure is its own vertical slice (HF-214 candidate). Architect carries forward as separate work."

**Carry-forward:** HF-214 candidate (c4 Fleet Utilization computation surface). Independent vertical slice. Out of HF-213 scope.

---

## Section 7 — Verdict

| Manifestation | Closure type | Evidence |
|---|---|---|
| Manifestation 1 (multi-content-unit single-file imports supersession-chaining) | CLOSED EMPIRICALLY | Phase 1E 5 superseded batches excluded; 3 operative batches; 158 committed_data rows reach engine; 67 entities calculated. |
| Manifestation 2 (same record content arriving in different file containers) | CLOSED STRUCTURALLY | Hash module Test 9 PASS (cross-container content identity). 9/9 unit tests PASS Phase 2.3. |

**HF-213 supersession identity primitive defect class: CLOSED per scope.**

C4 magnitude divergence: separate defect class, downstream of HF-213, HF-214 candidate.
