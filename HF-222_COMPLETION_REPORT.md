# HF-222 Completion Report

**Branch:** `hf-222-korean-test-and-binding-schema-class-closure`
**Predecessor:** HF-221 R3 disposition
**Directive:** `docs/vp-prompts/HF-222_DIRECTIVE_20260513.md`
**Phase order executed:** 3 → 1 → 2 → 4 → 5 (5.5 architect-channel pending; 5.6 this commit)
**Phase 6 (clean-slate proof gate):** pending architect-channel dispatch

---

## Commits

| # | SHA | Phase | Subject |
|---|---|---|---|
| 1 | `4c37f4fb` | Phase 3 | source_batch_id schema-class root closure (separate provenance from data-location; entityColsByBatch eliminated) |
| 2 | `ab050269` | Phase 1 | retire HF-218 Component 4b tenantAdaptiveBoundaryThreshold (Korean Test violation: 0.50 anchor + N=5 gate removed) |
| 3 | `1828c7fe` | Phase 2 | distribution-derived distinguishability via candidate-distribution stddev (no developer-stated constants) |
| 4 | `ff2f6b06` | Phase 4 | reclassify convergence:dual_path_concordance as observation-only (gate consumer retired in Phase 1) |
| 5 | (this commit) | Phase 5 | Decision-Implementation Gap verification + VG substrate-statement locks (PG-3, signal reclassification) |

**Pre-Phase-3 SHA:** `e483bc6786269918d6545a84ea2f90732dced302`

---

## Files Touched

| File | Phases |
|---|---|
| `web/src/types/convergence-bindings.ts` | 3.2 |
| `web/src/lib/intelligence/convergence-service.ts` | 3.3, 1.2, 2.1, 2.2, 4.2, 5.1(a) reword |
| `web/src/app/api/calculation/run/route.ts` | 3.4, 3.5a, 3.5b, 3.5c |
| `web/scripts/hf222-phase3-1-read-bindings-shape.ts` | 3.1 (new) |
| `web/scripts/hf222-phase2-3-distribution-test-proof.ts` | 2.3 (new) |
| `docs/vp-prompts/HF-222_DIRECTIVE_20260513.md` | committed in Phase 3 |
| `HF-222_COMPLETION_REPORT.md` | this file |

---

## Hard Gates

### HG-3.1 — Binding shape inspection (architect SQL gate)

Phase 3.1 script `scripts/hf222-phase3-1-read-bindings-shape.ts` ran successfully against BCL tenant. Output excerpt (verbatim):

```json
{
  "id": "6008fb2c-da17-46a3-ba1e-b0181ca530a1",
  "name": "Plan de Comisiones — Banca Minorista 2025-2026",
  "tenant_id": "b1c2d3e4-aaaa-bbbb-cccc-111111111111",
  "input_bindings": {
    "convergence_bindings": {
      "component_0": {
        "row": {
          "column": "Cumplimiento_Colocacion",
          "confidence": 0.9,
          "match_pass": 1,
          "scale_factor": 100,
          "field_identity": { "confidence": 0.7, "structuralType": "measure", "contextualIdentity": "count" },
          "source_batch_id": "91c2dd82-e298-4d6b-b2f9-3a8a2c436cde"
        },
        ...
        "entity_identifier": {
          "column": "ID_Empleado",
          "confidence": 0.16666666666666666,
          "match_pass": 1,
          "field_identity": { "confidence": 0.95, "structuralType": "identifier", "contextualIdentity": "person_identifier" },
          "source_batch_id": "91c2dd82-e298-4d6b-b2f9-3a8a2c436cde"
        }
      }
    }
  }
}
```

All four BCL component bindings reference batch `91c2dd82-e298-4d6b-b2f9-3a8a2c436cde` (period-agnostic Plantilla roster). Confirms architect's structural framing in directive §1.2. **HALT-1: not fired.** Shape matched directive's Phase 3.2 target.

### HG-3.6 — git diff EPG (post-Phase-3 commit)

`source_batch_id` diff:
```
- // Per-component bindings: { component_N: { actual: { source_batch_id, column, ... }, ... } }
- const cb = compBindings as Record<string, { source_batch_id?: string; column?: string }>;
- if (entityIdBinding?.source_batch_id && entityIdBinding?.column) {
- entityColsByBatch.set(entityIdBinding.source_batch_id, entityIdBinding.column);
- if (binding?.source_batch_id && !entityColsByBatch.has(binding.source_batch_id)) {
- entityColsByBatch.set(binding.source_batch_id, entityIdBinding.column);
- // Convergence bindings reference the source_batch_id where the column was LEARNED,
- if (!actualBinding?.source_batch_id && !numBinding?.source_batch_id) return null;
- if (numBinding?.source_batch_id && numBinding?.column &&
- denBinding?.source_batch_id && denBinding?.column) {
- numBinding.source_batch_id, numBinding.column, lookupKey
- denBinding.source_batch_id, denBinding.column, lookupKey
- if (actualBinding?.source_batch_id && actualBinding?.column) {
- actualBinding.source_batch_id, actualBinding.column, lookupKey
- if (targetBinding?.source_batch_id && targetBinding?.column) {
- targetBinding.source_batch_id, targetBinding.column, lookupKey
- // DIAG-003: If the binding's source_batch_id doesn't have data (different period),
- { column?: string; confidence?: number; source_batch_id?: string } | undefined;
- if (compBindings && eidColumn && eidBindingRaw?.source_batch_id) {
- const batchEntityMap = dataByBatch.get(eidBindingRaw.source_batch_id);
- // Scan committed_data rows for source_batch_id, extract distinct values per column,
- .eq('import_batch_id', eidBindingRaw.source_batch_id)
- if (eidBindingRaw?.source_batch_id) {
- .eq('id', eidBindingRaw.source_batch_id)
- `engine_structural_exception:component=${compIdx},column=${eidColumn},batch=${eidBindingRaw.source_batch_id},calc=${calculationRunId},reason=${bindingExceptionReason}`,
- source_batch_id: eidBindingRaw?.source_batch_id,
- source_batch_id: string;
- source_batch_id: targetCap.batchIds[0],
- source_batch_id: mc.batchId,
- source_batch_id: best.batchId,
- source_batch_id: batchId,
- source_batch_id: batchId,
- source_batch_id: string;
```

**Pattern:** every `-` (removed) line containing `source_batch_id`. **Zero `+` lines** containing `source_batch_id`. **HALT-2 condition (a) — not fired.**

`entityColsByBatch` diff:
```
- const entityColsByBatch = new Map<string, string>();
- entityColsByBatch.set(entityIdBinding.source_batch_id, entityIdBinding.column);
- if (binding?.source_batch_id && !entityColsByBatch.has(binding.source_batch_id)) {
- entityColsByBatch.set(binding.source_batch_id, entityIdBinding.column);
- const knownEntityCols = Array.from(new Set(Array.from(entityColsByBatch.values())));
- let entityCol = entityColsByBatch.get(batchId);
```

**Pattern:** every `-` line outright removal. **Zero `+` lines** containing `entityColsByBatch`. **HALT-2 condition (b) — not fired.**

**Phase 3.6 build verification:** `npm run build` exited 0.

### HG-1.3 — Retirement-set grep (post-Phase-1 + 5.1(a) reword)

```
$ grep -nE "tenantAdaptiveBoundaryThreshold|BOUNDARY_FALLBACK_MIN_SCORE|RECENT_N|cold-start anchor" \
    web/src/lib/intelligence/convergence-service.ts
(no output)
```

**Zero hits.** Retired identifiers and their machinery are gone. **HALT-3 condition (Phase 1 grep) — not fired.**

**Note on scope:** HF-222 Phase 1 retires the HF-218 Component 4b violation set only. Pre-existing `0.5*` literals elsewhere in `convergence-service.ts` (lines ~987/998 capability-detection; ~1076 structural-match weight; ~1107 confidence cap) are out of HF-222 scope; documented as Residual 5 below.

### HG-2.3 — Distribution-test property proof

```
$ npx tsx scripts/hf222-phase2-3-distribution-test-proof.ts
PASS: P1 — N=0 refuses
PASS: P2 — N=1 strictly-positive binds
PASS: P3 — N=1 zero refuses
PASS: P4 — N=2 distinct scores bind
PASS: P5 — N=2 identical scores refuse
PASS: P6 — N=5 clustered distribution refuses
PASS: P7 — N=5 clear outlier binds
PASS: P8 — invariant under linear scaling
PASS: P9 — invariant under uniform translation

All distribution-test properties hold.
```

**All 9 properties hold.** SR-35 + SR-38 (mathematical review gate) satisfied.

### HG-4.1 — Signal-consumer grep (Phase 4.1)

```
$ grep -rn "convergence:dual_path_concordance" web/src/ | grep -v test
web/src/lib/intelligence/convergence-service.ts:258:        // HF-198 E3 / F-011 closure: declared reader for convergence:dual_path_concordance.
web/src/lib/intelligence/convergence-service.ts:260:        'convergence:dual_path_concordance',
... (HF-222 Phase 4 reclassification comment block)
```

**Zero gate-consumer sites.** The remaining reference is the cross-run-priors reader at convergence-service.ts:253-260 (observation-only consumer; read-only; coherent with reclassification). No engine emit site exists (HF-220 "Concordance Shadow Removal" previously retired the emit path).

### HG-5.1(a) — Retirement-set grep (post-Phase-5.1(a) reword)

```
$ grep -nE "tenantAdaptiveBoundaryThreshold|BOUNDARY_FALLBACK_MIN_SCORE|RECENT_N|cold-start anchor" \
    web/src/lib/intelligence/convergence-service.ts
(no output)
```

**Zero hits.** HALT-3 (Phase 5) — not fired.

### HG-5.1(b) — `distinctEnoughToBind` function-body inspection

```
export function distinctEnoughToBind(scoredCandidates: Array<{ score: number }>): boolean {
  if (scoredCandidates.length === 0) return false;
  if (scoredCandidates.length === 1) {
    return scoredCandidates[0].score > 0;
  }
  const scores = scoredCandidates.map(c => c.score);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance = scores.reduce((s, x) => s + (x - mean) ** 2, 0) / scores.length;
  const stddev = Math.sqrt(variance);
  return scoredCandidates[0].score - scoredCandidates[1].score > stddev;
}
```

**Numeric-literal census** (against directive §5.1 enumeration):
- `length === 0` — structural (empty-array guard) ✓
- `length === 1` — structural (singleton-case guard) ✓
- `scoredCandidates[0]` x2 — structural (array index) ✓
- `> 0` — single allowed tuning literal (substrate eligibility floor: cardinality × intersection > 0) ✓
- `reduce((a, b) => a + b, 0)` — structural (reduce accumulator initial value, mean) ✓
- `reduce((s, x) => s + (x - mean) ** 2, 0)` — structural (reduce accumulator initial value + exponent `2` for variance formula) ✓
- `scoredCandidates[1]` — structural (array index) ✓

**No tuning constants outside the enumerated structural set.** HALT-3 (function body) — not fired.

### HG-5.2 — Schema-class root grep

```
$ grep -rn "source_batch_id" web/src/app/api/calculation/run/route.ts \
                              web/src/lib/intelligence/convergence-service.ts
(no output)
```

**Zero hits** in data-location read contexts. Class-root closed.

`learning_provenance` matches (write sites + read sites + type def):
- `convergence-service.ts`: type interface field at line 101; 5 binding-write sites at lines 554, 2038, 2071, 2153, 2206 (target, AI-proposal, boundary-fallback, entity-identifier self-verification, temporal)
- `route.ts`: 5 read sites at lines 1823, 1829, 1899, 1908, 1922 (HF-219 R1 correction-scan + HF-219 R2 fingerprint trace), 1 correction-write site at 1996
- `types/convergence-bindings.ts`: type interface field at line 35

All expected write/read shapes accounted for.

### HG-5.3 — HF-218 Component 2 verification site post-fix shape

Lines 1754-1808 of `web/src/app/api/calculation/run/route.ts` (verbatim):

```typescript
      // HF-218 Component 2 — Engine binding verification at calc time.
      // Closes DIAG-042 §3.2 silent fall-through. Per Disposition 4: relative-confidence
      // comparison (C_proposed > C_existing) using the same structural product methodology
      // as Component 1 (cardinality × intersection). Per Disposition 3: corrections preserve
      // pre-state via classification_signals + calculation_results.metadata snapshot.
      // Verification scope: entity_identifier binding only (the load-bearing identity hop).
      let bindingVerified = true;
      let bindingExceptionReason: string | null = null;
      // HF-219 Component R1: proposed correction holder. ...
      let proposedCorrection: { column: string; confidence: number } | null = null;
      let verificationExistingScore = 0;
      const eidBindingRaw = compBindings?.entity_identifier as ConvergenceBindingEntry | undefined;
      const eidColumn = eidBindingRaw?.column;
      const eidStoredConf = typeof eidBindingRaw?.confidence === 'number' ? eidBindingRaw.confidence : 0;
      if (compBindings && eidColumn) {
        // HF-222 Phase 3.5c (class-root closure): verification reads by column name
        // across all operative-period batches in dataByBatch. The set of distinct
        // entity-identifier values for this period is the union of dataByBatch keys
        // across all batches ...
        const distinctValues = new Set<string>();
        let totalRows = 0;
        for (const [, entityMap] of Array.from(dataByBatch.entries())) {
          for (const key of Array.from(entityMap.keys())) {
            if (key && key.length > 0) {
              distinctValues.add(key);
              totalRows += (entityMap.get(key)?.length ?? 0);
            }
          }
        }
        let intersectionCount = 0;
        if (tenantEntityExternalIdsForEngine.size > 0) {
          for (const v of Array.from(distinctValues)) {
            if (tenantEntityExternalIdsForEngine.has(v)) intersectionCount++;
          }
        }
        const cardinalityRatio = totalRows > 0 ? distinctValues.size / totalRows : 0;
        const intersectionRatio = distinctValues.size > 0 && tenantEntityExternalIdsForEngine.size > 0
          ? intersectionCount / distinctValues.size : 0;
        const proposedConf = cardinalityRatio * intersectionRatio;

        // Verification gate: C_proposed > 0 ...
        const operativeConf = proposedConf > 0 ? proposedConf : (tenantEntityExternalIdsForEngine.size === 0 ? cardinalityRatio : 0);
        verificationExistingScore = operativeConf;
        if (operativeConf === 0) {
          bindingVerified = false;
          bindingExceptionReason = tenantEntityExternalIdsForEngine.size === 0
            ? `cardinality_ratio=0 (column ${eidColumn} has zero distinct non-null values in batch)`
            : `intersection_ratio=0 (column ${eidColumn} distinct values do not intersect with tenant entities; distinct=${distinctValues.size} tenantSize=${tenantEntityExternalIdsForEngine.size})`;
        }
```

**Confirms by inspection:** verification reads `dataByBatch` by column name iteration (union of inner-map keys across all operative-period batches). No `dataByBatch.get(batchId)` call; no batch_id read-filter. Class-root closure realized.

### HG-5.4 — Build verification

`npm run build` exited 0 post-all-code-phases. HALT-4 — not fired at any phase boundary.

### HG-5.5 — VG substrate-statement locks (ARCHITECT-CHANNEL ONLY)

**Status:** pending architect execution. CC does not execute VG psql INSERTs.

Architect to execute the two INSERTs per directive §5.5:
1. `T1-E-PG3-source_batch_id-schema-confusion` (schema-semantic-confusion class naming)
2. `T2-E-signal-convergence-dual-path-concordance-observation-only` (signal reclassification)

Architect pastes VG `SELECT entry_id, tier, title, locked_at` outputs into this Hard Gate row when both INSERTs complete.

### HG-6.3 — Clean-slate recalc (PENDING Phase 6)

Pending architect-channel dispatch of Nuclear Clear (6.1) + re-imports (6.2). CC runs recalc + pastes verbatim totals (6.3).

### HG-6.4 — Architect ground-truth reconciliation (PENDING Phase 6)

Pending. Architect-channel comparison against `_Resultados_Esperados.xlsx`.

---

## Soft Gates

### SG-3.4 — entityColsByBatch + resolveColumnFromBatch grep inventory

Pre-edit (from Phase 3.4 EPG):
```
$ grep -n "entityColsByBatch" web/src/app/api/calculation/run/route.ts
720:    const entityColsByBatch = new Map<string, string>();
725:        entityColsByBatch.set(entityIdBinding.source_batch_id, entityIdBinding.column);
731:        if (binding?.source_batch_id && !entityColsByBatch.has(binding.source_batch_id)) {
733:            entityColsByBatch.set(binding.source_batch_id, entityIdBinding.column);
744:    const knownEntityCols = Array.from(new Set(Array.from(entityColsByBatch.values())));
750:    let entityCol = entityColsByBatch.get(batchId);
$ grep -n "resolveColumnFromBatch" web/src/app/api/calculation/run/route.ts
(5 callers + 1 definition; pre-edit signature (batchId, column, entityExternalId))
```

Post-edit:
```
$ grep -n "entityColsByBatch" web/src/app/api/calculation/run/route.ts
(no output) — eliminated
$ grep -n "resolveColumnFromBatch" web/src/app/api/calculation/run/route.ts
(4 callers + 1 definition; post-edit signature (column, entityExternalId))
```

### SG-3.5a — source_batch_id pre-edit inventory

```
$ grep -n "source_batch_id" web/src/app/api/calculation/run/route.ts
(pre-edit: references at ~1742-1798 verification block (1766, 1769, 1773),
           ~1861 (HF-219 R1 correction scan),
           ~1930, ~1939, ~1953 (HF-219 R2 fingerprint trace),
           ~1980 (HF-219 R1 correction-write)
 plus the docstring comment at ~319 and the structural references inside
 resolveMetricsFromConvergenceBindings)
```

All references migrated to `learning_provenance.batch_id` (provenance-scoped reads) or replaced via Phase 3.5c verification rewrite (data-location read sites).

### SG-3.5a — Inner provenance guard

Added at `route.ts:1823`: `if (eidBindingRaw?.learning_provenance?.batch_id && tenantEntityExternalIdsForEngine.size > 0)`. Restores pre-Phase-3 outer-condition semantics for the HF-219 R1 correction-scan block (since Phase 3.5c drops the outer `source_batch_id` truthy-guard from the verification gate).

---

## Compliance

| Principle | Status | Evidence |
|---|---|---|
| AP-25 / IGF-T1-E910 (Korean Test) — foundational binding-gate code | ✅ Closed | HG-1.3, HG-5.1(a), HG-5.1(b) |
| Decision 153 (signal-surface integrity) — observation-only reclassification | 🟨 Code: closed; substrate-lock: pending architect VG INSERT | HG-4.1, HG-5.5 |
| Adjacent-Arm Drift Discipline (IGF-T1-E952) — schema-class root closure | 🟨 Code: closed; substrate-statement-lock: pending architect VG INSERT | HG-5.2, HG-5.3, HG-5.5 |
| Decision-Implementation Gap (IGF-T1-E953) — grep verification | ✅ Verified | HG-5.1, HG-5.2 |
| Reconciliation-Channel Separation (T2-E46) | ✅ Bound | Phase 6 — CC pastes verbatim; architect reconciles |
| SR-34 (No Bypass) | ✅ Bound | No workarounds; structural fixes throughout |
| SR-35 (EPG) | ✅ Bound | HG-2.3 property proof script committed |
| SR-38 (Mathematical Review Gate) | ✅ Bound | All 9 properties hold pre-Phase-2 commit |
| SR-41 (Revert Discipline) | ✅ Bound | No force-push; no destructive ops |
| Rules 25-28 (Completion Report Discipline) | ✅ Bound | This file created Phase 3 commit; structured per Rule 26; evidence-paste per Rule 27; one commit per phase per Rule 28 |

---

## Issues

None encountered during execution. Two minor deviations from directive line numbers (line drift post-Phase-3 edits; resolved via grep before each subsequent phase) and one directive-content discrepancy (Phase 4.2 emit site at route.ts:~2155 does not exist; HF-220 "Concordance Shadow Removal" had previously retired it — Phase 4 reframed to document the observation-only role at the reader site instead, with substrate-statement classification still locking via Phase 5.5 architect-channel VG INSERT).

---

## Residuals (per directive §6A)

All five residuals from directive §6A are operative-state known gaps, named explicitly and not addressed by HF-222. Audit trail surfaces the scope boundary.

**Residual 1 — Governance-surface unchanged.** HF-222 ships under the same governance surface that produced HF-218. Forward reference: separate substrate-amendment HF per IRA Phase 1 reshape.

**Residual 2 — Broader Hard-Gate self-permission meta-pattern unaddressed.** HF-218 Hard Gate 6's escape clause closed for this instance; meta-pattern unaddressed at substrate.

**Residual 3 — convergence_bindings.source_batch_id instance lineage retrospective.** HF-109, HF-145, HF-186 closures remain code-level instance fixes (now structurally moot post-Phase-3); audit-trail only.

**Residual 4 — Substrate-amendment HF sequencing.** Lock-first discipline inverted (code first per BCL operational urgency); broader substrate amendments (SC-1 / SC-2 / PG-1 / PG-2) remain unwritten. Substrate-statement-level naming for PG-3 + signal reclassification locks in Phase 5.5.

**Residual 5 — Pre-existing 0.5* literals in convergence-service.ts outside HF-222 retirement scope.** Lines ~987, ~998, ~1076, ~1107. Future file-wide Korean Test sweep candidate.

---
