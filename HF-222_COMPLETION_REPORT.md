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

### HG-5.5 — VG substrate-statement locks (Path A: capture-promote pipeline)

**Status:** ✅ closed. Architect dispositioned Path A on 2026-05-13; CC executed the capture-then-promote pipeline in `~/vialuce-governance` via `tsx + porsager postgres` (tsx equivalent of `psql + DATABASE_URL`; precedent: `scripts/insert_prom_igf_07.ts`). Two entries landed at `status='locked'` with substrate-coherent content shape.

**HALT-5.5.0 resolution.** Initial schema inspection (`psql "$DATABASE_URL" -c "\d igf.entries"` equivalent) surfaced two mismatches with the directive template, both halted per HALT-5.5.0 instruction and dispositioned by architect:

1. **Tooling mismatch:** `psql` binary not installed on this machine. VG repo uses `tsx + porsager postgres` via `src/lib/db.ts`. Architect Path A directive specifies use of `src/lib/db.ts withRawSql` (precedent compatible).
2. **Schema mismatch:** `igf.entries` columns are `(id, tier, title, current_version, status, ip_classification, created_at, updated_at, notes)`, not `(entry_id, tier, title, content, locked_at, locked_by)`. Content lives in `igf.entry_versions(entry_id, version_number, content jsonb, lineage_notes, supersession_id, created_at, locked_by)`. Substrate-write protocol is capture-then-promote, not direct INSERT.

**Pipeline executed (per entry):**

| Step | Function | Args |
|---|---|---|
| A | `igf.insert_layer1_capture_event(p_source_summary, p_candidate_entries, p_provenance)` | source_summary='HF-222 Phase 5.5 ...', candidate_entries=[{proposed_id, tier, title, content, ip_classification, status:'draft'}], provenance={hf:'HF-222', phase:'5.5', branch, commit_sha:'07990823', architect:'Andrew Cobb'} |
| B | `igf.dispose_capture_event(capture_event_id, 'approved', notes, per_candidate)` | per_candidate=[{candidate_index:0, disposition:'approved', notes, reason_code:'extraction_faithful'}] |
| C | `igf.promote_approved_capture_event(capture_event_id)` | (creates igf.entries row + igf.entry_versions v1 row; status='draft' initially) |
| D | `igf.promote_entry(entry_id, 'locked', 'Andrew Cobb')` | (status transition: draft → locked; enforces content completeness — statement, applies_when[≥1], violation_patterns/adherence_patterns[≥1], provenance.origin_document) |

**Pipeline execution evidence:**

Entry 1 (T1-E-PG3-source_batch_id-schema-confusion):
```
========== Locking Entry 1 (PG-3 schema-confusion class): T1-E-PG3-source_batch_id-schema-confusion ==========
Step A — insert_layer1_capture_event...
Step A OK: capture_event_id=16e36831-486d-4253-8dac-c280c144942a
Step B — dispose_capture_event(approved)...
Step B OK: dispose_result={"id":"16e36831-486d-4253-8dac-c280c144942a", "mode":"layer1", "disposition":"approved", "disposed_at":"2026-05-13T18:57:49.602Z", "disposed_by":"postgres", ...}
Step C — promote_approved_capture_event...
Step C OK: promoted_entry_ids=["T1-E-PG3-source_batch_id-schema-confusion"]
Step D — promote_entry(T1-E-PG3-source_batch_id-schema-confusion, 'locked', 'Andrew Cobb')...
Step D OK: status transitioned to locked.
```

Entry 2 (T2-E-signal-convergence-dual-path-concordance-observation-only):
```
========== Locking Entry 2 (signal observation-only): T2-E-signal-convergence-dual-path-concordance-observation-only ==========
Step A OK: capture_event_id=<uuid issued by VG>
Step B OK: dispose_result={..."disposition":"approved","disposed_at":"2026-05-13T18:57:50.575Z",...}
Step C OK: promoted_entry_ids=["T2-E-signal-convergence-dual-path-concordance-observation-only"]
Step D OK: status transitioned to locked.
```

**Verification (`scripts/hf222-phase5-5-verify.ts`):**

`igf.entries` post-lock:
```json
[
  {
    "id": "T1-E-PG3-source_batch_id-schema-confusion",
    "tier": 1,
    "title": "Schema-semantic confusion: provenance and data-location collapsed in single field",
    "current_version": 1,
    "status": "locked",
    "ip_classification": "internal_only",
    "created_at": "2026-05-13T18:57:49.305Z",
    "updated_at": "2026-05-13T18:57:49.602Z"
  },
  {
    "id": "T2-E-signal-convergence-dual-path-concordance-observation-only",
    "tier": 2,
    "title": "Signal classification: convergence:dual_path_concordance is observation-only",
    "current_version": 1,
    "status": "locked",
    "ip_classification": "internal_only",
    "created_at": "2026-05-13T18:57:50.336Z",
    "updated_at": "2026-05-13T18:57:50.575Z"
  }
]
```

`igf.entry_versions` post-lock (content shape verification):
```json
[
  {
    "entry_id": "T1-E-PG3-source_batch_id-schema-confusion",
    "version_number": 1,
    "content_length": 4849,
    "statement_present": true,
    "applies_when_count": 5,
    "violation_or_adherence_count": 3,
    "origin_document_present": true
  },
  {
    "entry_id": "T2-E-signal-convergence-dual-path-concordance-observation-only",
    "version_number": 1,
    "content_length": 4634,
    "statement_present": true,
    "applies_when_count": 5,
    "violation_or_adherence_count": 3,
    "origin_document_present": true
  }
]
```

**Verification summary:** both entries pass all 8 checks (status='locked', current_version=1, version_number=1, content_length>0, statement_present, applies_when_count≥1, violation_or_adherence_count≥1, origin_document_present).

**HALT-5.5-A/B/C/D conditions:** none fired. Function signatures matched the inspected definitions (`insert_layer1_capture_event(text, jsonb, jsonb) → uuid`, `dispose_capture_event(uuid, text, text, jsonb) → jsonb`, `promote_approved_capture_event(uuid) → jsonb`, `promote_entry(text, text, text) → void`). Enum values matched: 'approved' (75 prior approvals on capture_events) and 'locked' (344 prior locked entries) are operative canonical values.

**VG commit:** `00d20e9` on `vialuce-governance` `main` branch — `HF-222 Phase 5.5: PG-3 schema-class naming + signal reclassification (capture-promote pipeline via insert_layer1_capture_event)`. Scripts committed: `scripts/hf222-phase5-5-substrate-locks.ts`, `scripts/hf222-phase5-5-verify.ts`.

### HG-6.3 — Clean-slate recalc evidence

**Status:** evidence surfaced verbatim per T2-E46. No reconciliation interpretation. Architect reconciles in Phase 6.4 against `_Resultados_Esperados.xlsx`.

**Schema notes (Phase 6.3.1 inventory):**
- The directive's reference to `import_batches.period` and `calculation_runs` does not match the operative schema. Actual schema: `periods.label` (not `name`); `import_batches.status='completed'` (not `'committed'`); `calculation_runs` table does not exist — calc persists directly to `calculation_results` + `entity_period_outcomes`. Inventory and value-surface queries adjusted to operative schema.
- Architect's Phase 6.1 (Nuclear Clear) + 6.2 (re-import) executed in architect channel pre-dispatch: `periods.created_at` and `import_batches.created_at` are 2026-05-13T23:14 (post-Phase-5 commit). BCL + Meridian also have post-Phase-5 calculation results (`created_at` 23:16–23:31 for BCL, 23:29–23:31 for Meridian) — calc has already executed; no fresh dispatch needed at 6.3.2 for those two tenants. CRP has 0 periods and 0 calculation_results (state surfaced verbatim below for architect disposition).

#### §HG-6.3.1 — Inventory

```
rule_sets:
  BCL  (b1c2d3e4-...): 1 rule_set — dbf3357e-138d-46f0-ad93-fd28e80d0a2b "Plan de Comisiones — Banca Minorista 2025-2026"
  Meridian (5035b1e8-...): 1 rule_set — 9ac467ba-bab4-4680-9453-5cb3deae02c6 "Meridian Logistics Group Incentive Plan 2025"
  CRP  (e44bbcb1-...): 4 rule_sets
     c28c5d86-8ad1-4949-8724-fc4510a1abe3 "Cross-Sell Bonus Plan"
     b965d9b3-b34e-4b7e-b37b-fb5e648d294f "Capital Equipment Commission Plan"
     2b3777bf-6a2e-4a4a-ac30-f86e4d29dceb "District Override Plan"
     12003582-7f01-419d-856e-a9faa3d55ddf "Consumables Commission Plan"

periods:
  BCL: 6 periods — October 2025, November 2025, December 2025, January 2026, February 2026, March 2026 (all status='open', period_type='monthly')
  Meridian: 3 periods — January 2025, February 2025, March 2025 (all status='open', period_type='monthly')
  CRP: 0 periods

entities (with calc_results):
  BCL: 85
  Meridian: 79 (67 calculated per period)
  CRP: 32 entities, 0 calculated

calculation_results row counts:
  BCL: 510 (85 entities × 6 periods × 1 rule_set; created_at 2026-05-13T23:16–23:22)
  Meridian: 201 (67 entities × 3 periods × 1 rule_set; created_at 2026-05-13T23:29–23:31)
  CRP: 0
```

#### §HG-6.3.2 — Dispatch evidence

Per Phase 6.3.1 inventory, BCL + Meridian already have post-HF-222 calc results from architect-channel Phase 6.2 dispatch. No additional CC dispatch executed. CRP has 0 periods / 0 committed_data → no dispatch possible without prior import.

No `calculation_runs` table exists in operative schema; dispatch tracking is via `calculation_results.created_at` per (tenant, rule_set, period) cohort.

#### §HG-6.3.3 — Verbatim recalc values

##### BCL — Grand totals per (rule_set × period)

```
rule_set=Plan de Comisiones — Banca Minorista 2025-2026 | period=October 2025  (2025-10-01) | grand_total=$44590.00 | rows=85
rule_set=Plan de Comisiones — Banca Minorista 2025-2026 | period=November 2025 (2025-11-01) | grand_total=$46291.00 | rows=85
rule_set=Plan de Comisiones — Banca Minorista 2025-2026 | period=December 2025 (2025-12-01) | grand_total=$61986.00 | rows=85
rule_set=Plan de Comisiones — Banca Minorista 2025-2026 | period=January 2026  (2026-01-01) | grand_total=$47545.00 | rows=85
rule_set=Plan de Comisiones — Banca Minorista 2025-2026 | period=February 2026 (2026-02-01) | grand_total=$53215.00 | rows=85
rule_set=Plan de Comisiones — Banca Minorista 2025-2026 | period=March 2026    (2026-03-01) | grand_total=$58406.00 | rows=85
```

##### BCL — Per-period component breakdown (sum across all 85 entities)

```
October 2025:
  Colocación de Crédito - Ejecutivo:        $14590.00
  Captación de Depósitos - Ejecutivo:        $8400.00
  Cumplimiento Regulatorio - Ejecutivo:      $6300.00
  Productos Cruzados - Ejecutivo:            $6030.00
  Colocación de Crédito - Ejecutivo Senior:  $3400.00
  Productos Cruzados - Ejecutivo Senior:     $2450.00
  Captación de Depósitos - Ejecutivo Senior: $1770.00
  Cumplimiento Regulatorio - Ejecutivo Senior: $1650.00
  [sum-of-components: $44590.00]

November 2025:
  Colocación de Crédito - Ejecutivo:        $13380.00
  Captación de Depósitos - Ejecutivo:        $9580.00
  Productos Cruzados - Ejecutivo:            $6786.00
  Cumplimiento Regulatorio - Ejecutivo:      $5700.00
  Colocación de Crédito - Ejecutivo Senior:  $3320.00
  Captación de Depósitos - Ejecutivo Senior: $2950.00
  Productos Cruzados - Ejecutivo Senior:     $2775.00
  Cumplimiento Regulatorio - Ejecutivo Senior: $1800.00
  [sum-of-components: $46291.00]

December 2025:
  Colocación de Crédito - Ejecutivo:        $20690.00
  Captación de Depósitos - Ejecutivo:       $14380.00
  Productos Cruzados - Ejecutivo:            $7596.00
  Cumplimiento Regulatorio - Ejecutivo:      $5800.00
  Colocación de Crédito - Ejecutivo Senior:  $4760.00
  Captación de Depósitos - Ejecutivo Senior: $3760.00
  Productos Cruzados - Ejecutivo Senior:     $3050.00
  Cumplimiento Regulatorio - Ejecutivo Senior: $1950.00
  [sum-of-components: $61986.00]

January 2026:
  Colocación de Crédito - Ejecutivo:        $14200.00
  Captación de Depósitos - Ejecutivo:        $9720.00
  Productos Cruzados - Ejecutivo:            $7200.00
  Cumplimiento Regulatorio - Ejecutivo:      $6100.00
  Colocación de Crédito - Ejecutivo Senior:  $3660.00
  Productos Cruzados - Ejecutivo Senior:     $2875.00
  Captación de Depósitos - Ejecutivo Senior: $2440.00
  Cumplimiento Regulatorio - Ejecutivo Senior: $1350.00
  [sum-of-components: $47545.00]

February 2026:
  Colocación de Crédito - Ejecutivo:        $16160.00
  Captación de Depósitos - Ejecutivo:       $11460.00
  Productos Cruzados - Ejecutivo:            $7380.00
  Cumplimiento Regulatorio - Ejecutivo:      $6100.00
  Colocación de Crédito - Ejecutivo Senior:  $4540.00
  Captación de Depósitos - Ejecutivo Senior: $3050.00
  Productos Cruzados - Ejecutivo Senior:     $2875.00
  Cumplimiento Regulatorio - Ejecutivo Senior: $1650.00
  [sum-of-components: $53215.00]

March 2026:
  Colocación de Crédito - Ejecutivo:        $19560.00
  Captación de Depósitos - Ejecutivo:       $10720.00
  Productos Cruzados - Ejecutivo:            $7416.00
  Cumplimiento Regulatorio - Ejecutivo:      $6600.00
  Colocación de Crédito - Ejecutivo Senior:  $5680.00
  Captación de Depósitos - Ejecutivo Senior: $3780.00
  Productos Cruzados - Ejecutivo Senior:     $2700.00
  Cumplimiento Regulatorio - Ejecutivo Senior: $1950.00
  [sum-of-components: $58406.00]
```

##### BCL — Reference entity (first external_id ascending with calc_results): BCL-5001 — Adriana Reyes Molina

```
period=October 2025  | total_payout=$980.00
  Colocación de Crédito - Ejecutivo Senior:  $180.00
  Captación de Depósitos - Ejecutivo Senior: $400.00
  Productos Cruzados - Ejecutivo Senior:     $250.00
  Cumplimiento Regulatorio - Ejecutivo Senior: $150.00
  metrics={"_rowIndex":0,"Meta_Depositos":45000,"Meta_Colocacion":150000,"Monto_Colocacion":112918.53,"Pct_Meta_Depositos":1.0716,"Depositos_Nuevos_Netos":48221.25,"Indice_Calidad_Cartera":0.899,"Cumplimiento_Colocacion":0.7528,"Infracciones_Regulatorias":0,"Cantidad_Productos_Cruzados":10}

period=November 2025 | total_payout=$955.00
  Colocación de Crédito - Ejecutivo Senior:  $180.00
  Captación de Depósitos - Ejecutivo Senior: $400.00
  Productos Cruzados - Ejecutivo Senior:     $225.00
  Cumplimiento Regulatorio - Ejecutivo Senior: $150.00
  metrics={"_rowIndex":0,"Meta_Depositos":45000,"Meta_Colocacion":150000,"Monto_Colocacion":134658.24,"Pct_Meta_Depositos":1.1574,"Depositos_Nuevos_Netos":52084.62,"Indice_Calidad_Cartera":0.7139,"Cumplimiento_Colocacion":0.8977,"Infracciones_Regulatorias":0,"Cantidad_Productos_Cruzados":9}

period=December 2025 | total_payout=$820.00
  Colocación de Crédito - Ejecutivo Senior:  $120.00
  Captación de Depósitos - Ejecutivo Senior: $250.00
  Productos Cruzados - Ejecutivo Senior:     $300.00
  Cumplimiento Regulatorio - Ejecutivo Senior: $150.00
  metrics={"_rowIndex":0,"Meta_Depositos":45000,"Meta_Colocacion":150000,"Monto_Colocacion":88287.9,"Pct_Meta_Depositos":0.8599,"Depositos_Nuevos_Netos":38694.45,"Indice_Calidad_Cartera":0.8413,"Cumplimiento_Colocacion":0.5886,"Infracciones_Regulatorias":0,"Cantidad_Productos_Cruzados":12}

period=January 2026  | total_payout=$605.00
  Colocación de Crédito - Ejecutivo Senior:  $260.00
  Captación de Depósitos - Ejecutivo Senior: $120.00
  Productos Cruzados - Ejecutivo Senior:      $75.00
  Cumplimiento Regulatorio - Ejecutivo Senior: $150.00
  metrics={"_rowIndex":0,"Meta_Depositos":45000,"Meta_Colocacion":150000,"Monto_Colocacion":140387.13,"Pct_Meta_Depositos":0.7697,"Depositos_Nuevos_Netos":34638.44,"Indice_Calidad_Cartera":0.7983,"Cumplimiento_Colocacion":0.9359,"Infracciones_Regulatorias":0,"Cantidad_Productos_Cruzados":3}

period=February 2026 | total_payout=$675.00
  Colocación de Crédito - Ejecutivo Senior:  $180.00
  Captación de Depósitos - Ejecutivo Senior: $120.00
  Productos Cruzados - Ejecutivo Senior:     $225.00
  Cumplimiento Regulatorio - Ejecutivo Senior: $150.00
  metrics={"_rowIndex":0,"Meta_Depositos":45000,"Meta_Colocacion":150000,"Monto_Colocacion":117084.58,"Pct_Meta_Depositos":0.6721,"Depositos_Nuevos_Netos":30244.28,"Indice_Calidad_Cartera":0.8472,"Cumplimiento_Colocacion":0.7806,"Infracciones_Regulatorias":0,"Cantidad_Productos_Cruzados":9}

period=March 2026    | total_payout=$1010.00
  Colocación de Crédito - Ejecutivo Senior:  $360.00
  Captación de Depósitos - Ejecutivo Senior: $400.00
  Productos Cruzados - Ejecutivo Senior:     $100.00
  Cumplimiento Regulatorio - Ejecutivo Senior: $150.00
  metrics={"_rowIndex":0,"Meta_Depositos":45000,"Meta_Colocacion":150000,"Monto_Colocacion":150130.48,"Pct_Meta_Depositos":1.0996,"Depositos_Nuevos_Netos":49483.75,"Indice_Calidad_Cartera":0.7782,"Cumplimiento_Colocacion":1.0009,"Infracciones_Regulatorias":0,"Cantidad_Productos_Cruzados":4}
```

##### Meridian — Grand totals per (rule_set × period)

```
rule_set=Meridian Logistics Group Incentive Plan 2025 | period=January 2025  | grand_total=$150284.00 | rows=67
rule_set=Meridian Logistics Group Incentive Plan 2025 | period=February 2025 | grand_total=$140584.00 | rows=67
rule_set=Meridian Logistics Group Incentive Plan 2025 | period=March 2025    | grand_total=$160184.00 | rows=67
```

##### Meridian — Per-period component breakdown

```
January 2025:
  New Accounts - Senior:            $37100.00
  New Accounts - Standard:          $32800.00
  Revenue Performance - Senior:     $23400.00
  Revenue Performance - Standard:   $20600.00
  Safety Record - Senior:           $10500.00
  On-Time Delivery - Senior:        $10300.00
  Safety Record - Standard:         $10200.00
  On-Time Delivery - Standard:       $5250.00
  Fleet Utilization - Standard:        $82.00
  Fleet Utilization - Senior:          $52.00
  [sum-of-components: $150284.00]

February 2025:
  New Accounts - Standard:          $33200.00
  New Accounts - Senior:            $31500.00
  Revenue Performance - Standard:   $20950.00
  Revenue Performance - Senior:     $20000.00
  Safety Record - Senior:           $10500.00
  Safety Record - Standard:         $10200.00
  On-Time Delivery - Senior:         $7200.00
  On-Time Delivery - Standard:       $6900.00
  Fleet Utilization - Standard:        $82.00
  Fleet Utilization - Senior:          $52.00
  [sum-of-components: $140584.00]

March 2025:
  New Accounts - Standard:          $37000.00
  New Accounts - Senior:            $31500.00
  Revenue Performance - Senior:     $28900.00
  Revenue Performance - Standard:   $20000.00
  Safety Record - Senior:           $12500.00
  Safety Record - Standard:         $11700.00
  On-Time Delivery - Standard:       $9850.00
  On-Time Delivery - Senior:         $8600.00
  Fleet Utilization - Standard:        $82.00
  Fleet Utilization - Senior:          $52.00
  [sum-of-components: $160184.00]
```

##### Meridian — Reference entity: 70010 — Antonio López Hernández

```
period=January 2025  | total_payout=$5602.00
  Revenue Performance - Senior: $1600.00
  On-Time Delivery - Senior:     $700.00
  New Accounts - Senior:        $2800.00
  Safety Record - Senior:        $500.00
  Fleet Utilization - Senior:      $2.00
  metrics={"Mes":1,"Año":2025,"_rowIndex":2,"Ingreso_Meta":361978,"Ingreso_Real":440003,"Cuentas_Nuevas":8,"Entregas_Tiempo":97,"Cargas_Flota_Hub":1083,"Entregas_Totales":99,"Volumen_Rutas_Hub":1083,"Capacidad_Flota_Hub":1306,"Pct_Entregas_Tiempo":0.9798,"Cumplimiento_Ingreso":1.2156,"Incidentes_Seguridad":0,"Tasa_Utilizacion_Hub":0.8292}

period=February 2025 | total_payout=$2452.00
  Revenue Performance - Senior: $1600.00
  On-Time Delivery - Senior:        $0.00
  New Accounts - Senior:         $350.00
  Safety Record - Senior:        $500.00
  Fleet Utilization - Senior:      $2.00
  metrics={"Mes":2,"Año":2025,"_rowIndex":69,"Ingreso_Meta":446709,"Ingreso_Real":526906,"Cuentas_Nuevas":1,"Entregas_Tiempo":51,"Cargas_Flota_Hub":1157,"Entregas_Totales":63,"Volumen_Rutas_Hub":1157,"Capacidad_Flota_Hub":1361,"Pct_Entregas_Tiempo":0.8095,"Cumplimiento_Ingreso":1.1795,"Incidentes_Seguridad":0,"Tasa_Utilizacion_Hub":0.8501}

period=March 2025    | total_payout=$2652.00
  Revenue Performance - Senior: $1400.00
  On-Time Delivery - Senior:     $400.00
  New Accounts - Senior:         $350.00
  Safety Record - Senior:        $500.00
  Fleet Utilization - Senior:      $2.00
  metrics={"Mes":3,"Año":2025,"_rowIndex":136,"Ingreso_Meta":343324,"Ingreso_Real":448704,"Cuentas_Nuevas":1,"Entregas_Tiempo":45,"Cargas_Flota_Hub":925,"Entregas_Totales":49,"Volumen_Rutas_Hub":925,"Capacidad_Flota_Hub":956,"Pct_Entregas_Tiempo":0.9184,"Cumplimiento_Ingreso":1.3069,"Incidentes_Seguridad":0,"Tasa_Utilizacion_Hub":0.9676}
```

##### CRP

```
rule_sets: 4 (Cross-Sell Bonus, Capital Equipment Commission, District Override, Consumables Commission)
periods: 0
entities: 32
committed_data rows: 0
calculation_results: 0
entity_period_outcomes: 0
```

CRP state: no periods imported, no committed_data, no calculation_results. Architect-channel disposition required per directive HALT-6.3-A ("any rule_set surfaced in 6.3.1 has tenant_id mismatch or is missing expected periods") — surfacing verbatim for Phase 6.4 disposition.

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
