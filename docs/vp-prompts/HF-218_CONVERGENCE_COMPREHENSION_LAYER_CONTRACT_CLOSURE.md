## HF-218: CONVERGENCE & COMPREHENSION LAYER-CONTRACT CLOSURE — Vertical Slice

**Autonomy Directive (Rule 11):** NEVER ask yes/no. NEVER say "shall I". Just act.

**Status of this HF:** Closure of layer-contract structural absences surfaced by DIAG-042 §4.6 across Header Comprehension, Convergence, Engine, and Flywheel surfaces. Five-component vertical slice. Substrate amendments (E924, E904, E902 — IRA-surfaced coherence findings) deferred per architect Decision A; HF-218 proceeds platform-side. Substrate debt queued for post-HF-218 resolution.

**Predecessors:** DIAG-039, DIAG-040, DIAG-041, DIAG-042. IRA invocation `IRA_HF_218_PreDrafting_Substrate_Validation_20260512` produced 16 applicable_entries + 3 supersession_candidates (all `extend`) + tier_3_novel verdict.

**Branch:** `dev` (existing). PR to `main` at final step.

---

## CC STANDING RULES (READ FIRST)

CC reads `CC_STANDING_ARCHITECTURE_RULES.md` in full before any work. Specifically applicable here:

- **Section A Principle 1** — AI-First, Never Hardcoded. Korean Test compliance throughout. No language-specific or domain-specific literals.
- **Section A Principle 5** — Closed-Loop Learning. The flywheel principle. HF-218 closes open loops surfaced by DIAG-042 §4.6.
- **Section A Principle 7** — Prove, Don't Describe. Evidentiary gates: paste code/grep/output, never self-attestation.
- **Section A Principle 8** — Domain-Agnostic Always. No SPM-/ICM-specific code added.
- **Section A Principle 9** — IAP Gate. N/A this HF (no UI surface touched).
- **Section 0 (v3.0) GP-1** — Compliance is Architecture. Preservation discipline is structural, not procedural. Audit trail emerges from code, not from logging discipline.
- **Section 0 (v3.0) GP-2** — Research-Derived Design. SOC compliance per the established discipline of immutable history with provenance (append-only event-sourced state at the binding/correction granularity).
- **Section B** — Architecture Decision Gate. CC commits an ARCHITECTURE DECISION RECORD before implementation (Phase 1 below).
- **Section C** — Anti-Pattern Registry (AP-1 through AP-25). CC checks every component against the registry.
- **Section D Rules 1-24** — operational discipline. Commit+push every phase. `rm -rf .next` after every commit. Git from repo root.
- **Section D Rules 16-20** — proof gates verify LIVE state, not file existence.
- **Section E** — scale reference. Every component must work at "Large" tier (500K-5M records) without re-architecture.
- **Section F** — quick checklist before completion.
- **Rules 25-28** — completion report discipline. Report created BEFORE final build, mandatory structure, paste-evidence, one-commit-per-phase.

**SR-34** — No bypass. Structural fixes only. Every component closes a defect class, not a defect instance.
**SR-42** — Locked-rule halt. If any phase encounters a locked decision that dictates halt, surface verbatim and halt.
**SR-44** — Architect-only production verification. CC verifies on dev/localhost; production verification post-merge is architect-channel.
**Rule 29** — CC paste block LAST; nothing after.

---

## CONTEXT — WHY THIS HF EXISTS

Three months of HFs across BCL, CRP, and Meridian surfaced the same defect class repeatedly: convergence binding-selection produces structurally wrong bindings, the engine silently falls through to fallback paths, the flywheel does not learn from the failure. Each prior HF closed an instance. None closed the class.

DIAG-042 §4.6 surfaced the operative-state evidence:

**STRUCTURAL ABSENCES (Convergence layer, DIAG-042 §2.3):**
- No entity-value-set intersection check at binding emission
- No cardinality scoring of identifier candidates  
- No `contextualIdentity` restriction filter
- No sample-calc plausibility two-pass verification

**STRUCTURAL ABSENCES (Engine layer, DIAG-042 §3.2):**
- Engine does NOT verify `convergence_bindings.entity_identifier.column` values against tenant entities
- Engine does NOT verify `dataByBatch` cardinality matches expected tenant entity count
- Engine treats `cbMetrics === null` as silent fall-through rather than structural exception requiring user surface

**OPEN LOOPS (DIAG-042 §4.6):**
- `lifecycle:synaptic_consolidation` — engine emits at route.ts:2138; no consumer adapts engine
- `convergence:dual_path_concordance` — engine emits at route.ts:2155; no consumer adapts convergence
- `[CalcRecon-T3]` EXCEPTION lines — log-only `addLog`, not written to `classification_signals`

**DOCUMENTED-BUT-NOT-LOCATED LOOP (DIAG-042 §4.5):**
- OB-177 self-correction decrement on `structural_fingerprints.confidence` — comment at fingerprint-flywheel.ts:54-55 describes "3 failures: 0.92 → 0.72 → 0.52 → 0.32" arithmetic with explicit decrement intent. Increment write site exists (writeFingerprint line 152). Decrement write site not located in surveyed code.

**Architect's directive:** the platform exists to learn and self-correct as a moat-defining capability. HF-218 closes the layer-contract gaps that prevent this, with SOC-grade preservation discipline that makes self-correction auditable by construction.

---

## ARCHITECT DISPOSITIONS GOVERNING THIS HF

The following dispositions resolved during pre-drafting validation. CC honors all of these as binding context; they are not subject to CC modification.

**Disposition 1 — Sequenced approach (architect Decision A):** HF-218 platform work proceeds first. Substrate amendments (E924, E904, E902 extensions identified by IRA invocation) queue as substrate debt for post-HF-218 resolution. CC does not modify substrate in this HF.

**Disposition 2 — Engine reads tenant.entities (architect Decision B):** Engine reading tenant.entities for binding verification does not violate Calculation Sovereignty (E904) when reads are gate-only OR when modifications are preserved with provenance. Calculation Sovereignty's essence is "calculation results are determined by committed_data + active plan." Verification reads that don't modify outputs (or that modify with full SOC-grade preservation) preserve the essence.

**Disposition 3 — Self-correcting engine with preservation (architect Decision):** Engine may correct bindings when verification confidence exceeds existing binding confidence. All corrections preserve pre-state, post-state, trigger, actor, and timestamp via classification_signals + calculation_results snapshots. SOC compliance derives from immutable history with provenance, not from input-determinism.

**Disposition 4 — Relative confidence comparison (architect Decision):** Correction gate is `C_proposed > C_existing`, where BOTH confidences are freshly computed via the same structural methodology at verification time. No developer-set thresholds. Existing binding holds when proposed confidence does not strictly exceed it. Korean Test compliant (removes hardcoded threshold constant).

These dispositions are the operative answers to architect-channel questions that arose during pre-drafting; CC implements against them.

---

## SUBSTRATE COHERENCE — KNOWN DEBT (DO NOT ADDRESS IN THIS HF)

Per Decision A, the following substrate coherence findings are KNOWN DEBT, scheduled for post-HF-218 resolution. CC implements platform-side as drafted; the substrate amendments below are NOT in HF-218 scope:

- **IGF-T1-E924** (Closed-Loop Learning) — extend to address bidirectional signal-loop completeness (increment + decrement both required)
- **IGF-T1-E904** (Calculation Sovereignty) — extend to clarify that gate-only verification reads do not violate sovereignty; provenance-preserved modifications similarly preserve audit-grade reproducibility
- **IGF-T1-E902** (Carry Everything, Express Contextually) — extend to cover calculation-time signals (CalcRecon-T3 EXCEPTION lines as classification_signals writes)

CC notes these in completion report Known Issues but does NOT amend substrate. Substrate is in `vialuce/vialuce-governance` repo; HF-218 is in `CCAFRICA/spm-platform`.

---

## SCOPE — FIVE COMPONENTS

HF-218 is a vertical slice. All five components ship in one PR. Engine and experience evolve together.

**Component 1 — Convergence Self-Verification with Cardinality + Value-Set Intersection.**

Replace the entity_identifier selection logic at `web/src/lib/intelligence/convergence-service.ts:1937-1949`. The current 9-line `idEntries[0]` (first-by-insertion-order) selection is replaced with a structural verification protocol:

1. Inventory all candidates with `fi.structuralType === 'identifier'`
2. For each candidate, compute a freshly-computed structural confidence:
   - Cardinality ratio: distinct values in column / total rows
   - Tenant entity intersection ratio: |candidate column distinct values ∩ tenant.entities.external_id| / |candidate column distinct values|
   - Combined confidence score per a structural composition (CC determines structural composition in Phase 1 Architecture Decision Record — geometric mean, weighted sum, or structural product; must be Korean Test compliant — no domain-specific weights)
3. Select the candidate with the highest combined structural confidence
4. If no candidate achieves combined confidence > 0 (e.g., no tenant entities exist for intersection check), fall back to cardinality-only ranking
5. Persist the selected binding with `field_identity.confidence` set to the freshly-computed value (replaces inheritance of `match.matchConfidence`)
6. Emit a `classification_signal` with `signal_type: 'convergence:binding_selection'` including all candidate scores in `signal_value` (provenance for any downstream re-evaluation)

Caller signature change: `generateAllComponentBindings` accepts an additional `tenantEntityExternalIds: Set<string>` parameter. Caller at convergence-service.ts:299 fetches this set from tenant.entities before invocation.

Korean Test gates this component: zero hardcoded column names, zero language-specific strings. All comparison logic operates on cardinality, value-set intersection, and confidence comparison — structural primitives only.

**Component 2 — Engine Verification + Correction + Structural Exception.**

At the engine's `usedConvergenceBindings = false` flip site (`web/src/app/api/calculation/run/route.ts`, currently lines 1717-1745 per DIAG-042 §3.2; CC verifies post-HF-217 line numbers via grep), introduce verification-then-action logic:

1. Before consuming `compBindings`, verify the binding by computing fresh structural confidence (same methodology as Component 1) using current calculation-time state
2. If verification confidence ≥ stored binding confidence (`C_proposed ≥ C_existing`), proceed with existing binding. Snapshot binding into calculation_results.metadata for SOC preservation.
3. If verification confidence is strictly greater than stored binding confidence AND the verification proposes a different column (`C_proposed > C_existing` AND `column_proposed !== column_existing`), engine performs a self-correction:
   - Persist a `classification_signal` with `signal_type: 'convergence:engine_correction'` and `source: 'engine_correction'` (new SignalSource enum value — see Component 5)
   - Update `rule_sets.input_bindings.convergence_bindings` for the affected component with the corrected binding (pre-state preserved in the signal's `signal_value`, post-state visible in rule_sets row)
   - Snapshot post-correction binding into calculation_results.metadata
   - Proceed with corrected binding
4. If verification confidence is below the floor required for any binding to function (e.g., zero intersection with tenant entities AND no tenant entities exist for intersection check OR all candidates fail cardinality), engine refuses to calculate this entity-component:
   - Emit `[CalcRecon-T3] EXCEPTION` log line (matches existing pattern at route.ts:1763, 2417)
   - Persist a `classification_signal` with `signal_type: 'engine:structural_exception'` including the gap reason
   - Skip the entity-component; no result written; calculation continues for other entity-components

The engine reads tenant.entities at calc time for verification. Per Disposition 2, this is gate-and-correct, not influence-result. Result determinism preserved within a calculation run: the binding used in the calculation is snapshotted and persisted; subsequent re-runs at the same time-T are reconstructable from the snapshot.

Component 2 closes the silent fall-through described in DIAG-042 §3.2 and Section 3.4 (refusal-vs-result paths).

**Component 3 — OB-177 Decrement Loop Located or Implemented.**

DIAG-042 §4.5 surfaced that the `fingerprint-flywheel.ts:54-55` comment describes a decrement-on-failure loop (`0.92 → 0.72 → 0.52 → 0.32`) but no decrement write site was located in surveyed code. CC's investigation in Phase 0 (below) confirms either:

(a) The decrement write site EXISTS in code outside DIAG-042's surveyed paths — locate, document, verify operative behavior. No new code in this component; investigation and documentation only.

(b) The decrement write site does NOT exist in code — implement it. Implementation:

- New function `decrementFingerprintConfidence(tenantId, fingerprintHash, reason, supabaseUrl, supabaseServiceKey)` in `web/src/lib/sci/fingerprint-flywheel.ts`
- Called from the engine's structural_exception path (Component 2) when verification fails on a fingerprint-cached binding
- Computes new confidence using the inverse of the Bayesian increment formula referenced in the comment (`writeFingerprint` line 152 uses `1 - 1/(matchCount+1)`; the decrement applies a symmetric reduction such that 3 consecutive failures move 0.92 → 0.32 per the comment's arithmetic — CC determines structural formula in Phase 1 Architecture Decision Record)
- Optimistic lock per the existing increment pattern at writeFingerprint lines 158-167
- Records a `classification_signal` with `signal_type: 'flywheel:fingerprint_decrement'` including pre-confidence, post-confidence, and triggering reason
- Decrement-on-failure write site is symmetric to the increment-on-success write site (writeFingerprint line 152)

Outcome of Component 3: bidirectional flywheel loop. Increment exists today (matches reinforce). Decrement either confirmed as existing (documented, no code change) or newly implemented (code change). Either way, the structural completeness of the flywheel's self-correction mechanism is established.

**Component 4 — Open-Signal Wiring (Adaptation Consumers).**

DIAG-042 §4.6 identifies three open loops where engine emits signals with no consumer adapts behavior:

- `lifecycle:synaptic_consolidation` (engine line 2138)
- `convergence:dual_path_concordance` (engine line 2155)
- `[CalcRecon-T3]` EXCEPTION lines (log-only addLog, not in classification_signals)

Component 4 closes these:

4a. **`[CalcRecon-T3]` EXCEPTION lines → classification_signals write.** Every `addLog(`[CalcRecon-T3] EXCEPTION ...`)` site in route.ts also emits a `classification_signal` via `writeSignal` with `signal_type: 'engine:exception'` and `signal_value` carrying the EXCEPTION payload (entity, component, type, batchId, etc.). Per DIAG-042 §3.3: existing emission sites at lines 1334, 1763, 2417. The log lines remain (operator visibility); the signals write is the structural addition.

4b. **`convergence:dual_path_concordance` consumer.** A new consumer in `web/src/lib/intelligence/convergence-service.ts` reads recent `convergence:dual_path_concordance` signals (per existing `loadMetricComprehensionSignals` pattern at convergence-service.ts:775) and adapts binding-selection confidence calibration: if recent concordance rates are low for a tenant, the boundary-fallback `BOUNDARY_FALLBACK_MIN_SCORE` is replaced by a freshly-computed tenant-adaptive structural threshold (no developer-set constant; the threshold is computed from recent concordance evidence per the same relative-confidence comparison discipline).

4c. **`lifecycle:synaptic_consolidation` consumer.** A new consumer at the engine entry surface reads recent `lifecycle:synaptic_consolidation` signals for the calculation context and uses them to inform binding-snapshot scope (Component 5): high-consolidation-confidence calculations persist lighter binding metadata; low-confidence persists full provenance. This is a performance optimization, not a correctness change. CC verifies in Phase 1 Architecture Decision Record whether this scope addition is correctly placed in Component 4 or deferred to a follow-on HF.

**Component 5 — Preservation Discipline: Binding Snapshots in calculation_results.**

Every calculation result persists its own binding snapshot via `calculation_results.metadata` (existing JSONB column per SCHEMA_REFERENCE_LIVE.md). Schema verified — no DDL required.

Snapshot structure (JSON):
```
{
  "binding_snapshot": {
    "ts": "<ISO-8601 timestamp>",
    "convergence_bindings_used": <verbatim convergence_bindings as read from rule_sets at calc time>,
    "tenant_entity_external_ids_at_t": <Set of tenant.entities.external_id values at calc time, persisted as array>,
    "verification_confidences": <per-component {column, confidence_computed_at_t, methodology_version}>,
    "corrections_in_this_run": <array of correction events if any fired during this calc run>,
    "engine_version": <package.json version OR git SHA, CC determines source in Phase 1>,
    "calculation_run_id": <foreign key to calculation_batches if applicable>
  }
}
```

The snapshot is the SOC-compliance enabler: any calculation_result row, queried six months later, fully reconstructs the calculation's bindings, the tenant state at that time, and any corrections that fired. The platform can self-correct freely; audit reconstruction operates on the snapshot, not on current state.

Korean Test gates the snapshot schema: no domain-specific field names. All keys are domain-agnostic structural primitives (binding_snapshot, convergence_bindings_used, verification_confidences, corrections_in_this_run, engine_version).

SignalSource enum extension (closed-set; per DIAG-042 §7.5 the current enum is `'ai' | 'user_confirmed' | 'user_corrected'`): add `'engine_correction'` and `'flywheel_correction'` to `web/src/lib/intelligence/classification-signal-service.ts:27`. This is a code-layer extension per the closed-vocabulary convention; existing consumers handle the new sources gracefully (per existing `sci_agent` / `user_corrected` / `human_override` patterns).

---

## ARCHITECTURE DECISION GATE (MANDATORY — Section B)

CC commits the following ARCHITECTURE DECISION RECORD as the FIRST commit of HF-218, BEFORE any implementation code. Architecture Decision Record file: `docs/architecture-decisions/HF-218_ARCHITECTURE_DECISION_RECORD.md`.

```
ARCHITECTURE DECISION RECORD — HF-218
======================================
Problem: Convergence binding-selection structural absences + engine silent fall-through + 
unwired flywheel signals + un-located OB-177 decrement loop produce wrong calculation results
without audit trail. Platform's adaptive intelligence moat is structurally incomplete.

Architecturally, FIVE structural choice points exist within HF-218 scope. CC commits a decision
for each before implementation.

Decision 1 — Structural confidence composition (Component 1)
  Options:
    A. Geometric mean of (cardinality_ratio, intersection_ratio)
    B. Weighted sum with structural-default weights (e.g., equal-weight 0.5/0.5)
    C. Structural product (cardinality_ratio × intersection_ratio)
    D. Other (CC justifies via DIAG-041/042 evidence + Korean Test compliance)
  Constraints:
    - Korean Test: no domain-specific weights; if weights, structural (e.g., dimensional)
    - Range [0, 1] for compatibility with confidence comparison
    - Monotonic: higher cardinality and higher intersection both increase score
  CHOSEN: ___ because ___
  REJECTED: ___ because ___

Decision 2 — Decrement formula symmetry (Component 3, if implementation path)
  Options:
    A. Strict inverse of increment formula: existing increment uses 1 - 1/(matchCount+1); decrement decreases matchCount AND recomputes
    B. Per-event decrement: -0.20 per failure (matches the comment arithmetic 0.92 → 0.72 → 0.52 → 0.32)
    C. Bayesian-symmetric: compute the decrement via the same formula structure as the increment but inverted
  Constraints:
    - Must produce the arithmetic described in fingerprint-flywheel.ts:54-55 comment for 3-consecutive-failure case
    - Must NOT produce negative confidence
    - Must compose with the existing optimistic-lock pattern at writeFingerprint
  CHOSEN: ___ because ___
  REJECTED: ___ because ___

Decision 3 — Tenant-adaptive concordance threshold composition (Component 4b)
  Options:
    A. Recent-N concordance rate average, replaces BOUNDARY_FALLBACK_MIN_SCORE 0.50 when N signals available
    B. Time-decayed concordance rate, weights recent observations higher
    C. Composite: average if N≥5, otherwise fall back to 0.50
  Constraints:
    - Korean Test: no hardcoded N or decay rate; values derive from structural defaults (e.g., N=5 because that's the minimum-statistical-distinguishability threshold; reference research-derived per Section 0 GP-2)
    - Threshold must remain in [0, 1]
  CHOSEN: ___ because ___
  REJECTED: ___ because ___

Decision 4 — Binding snapshot persistence target (Component 5)
  Options:
    A. calculation_results.metadata JSONB (existing column; no DDL)
    B. New table calculation_binding_snapshots (DDL required; cleaner separation; larger surface)
    C. calculation_traces existing surface (extending its inputs/output JSONB)
  Constraints:
    - SOC: each calculation_result must point at its snapshot via a stable reference
    - Scale: must work at 50M records (Section E "Enterprise" tier)
    - Atomicity: snapshot write must succeed atomically with calculation_result write
  CHOSEN: ___ because ___
  REJECTED: ___ because ___

Decision 5 — SignalSource enum extension placement (Component 5)
  Options:
    A. classification-signal-service.ts:27 type union extension only (current implementation)
    B. Database CHECK constraint on classification_signals.source column (DDL required)
    C. Both A and B (defense in depth)
  Constraints:
    - Existing consumers must handle new sources gracefully (verify via grep)
    - New sources must be domain-agnostic strings (Korean Test)
  CHOSEN: ___ because ___
  REJECTED: ___ because ___

For all decisions:
- Scale test: Works at 10x? Works at "Large" (500K-5M)? ___
- AI-first: Zero hardcoded field names / language strings added? ___
- Transport: No row data through HTTP bodies; bulk Supabase service-role for snapshot writes? ___
- Atomicity: Snapshot writes succeed atomically with calculation_result writes; on failure, both roll back? ___
- G1-G6 evaluation per Section 0 governing principles? ___
```

CC commits the completed Architecture Decision Record BEFORE Phase 2 begins.

---

## PHASES — IMPLEMENTATION SEQUENCE

CC executes 9 phases. Each phase: commit + push (Rule 1, Rule 28). After each push: `rm -rf .next` + `npm run build` + `npm run dev` (Rule 2). Final phase: `gh pr create` (Rule 3).

### Phase 0 — Investigation: OB-177 Decrement Loop

CC searches the entire codebase for the decrement write site referenced in fingerprint-flywheel.ts:54-55. Beyond the surveyed files in DIAG-042:

```bash
grep -rn "structural_fingerprints" web/src/ --include="*.ts" | grep -E "update|decrement|0\\.20|0\\.92|-=" 
grep -rn "processEntityUnit:461-509\|processEntityUnit" web/src/ --include="*.ts"
grep -rn "decreaseConfidence\|decreaseFingerprint\|demoteFingerprint" web/src/ --include="*.ts"
grep -rn "confidence: .* - " web/src/lib/sci/ --include="*.ts"
```

Paste verbatim output. Outcome:
- If grep finds the decrement write site → Component 3 becomes documentation-only (Phase 4 below paste-traces the located code; no new implementation)
- If grep finds zero matches → Component 3 becomes implementation (Phase 4 below implements `decrementFingerprintConfidence`)

Commit message: `HF-218 Phase 0: OB-177 decrement loop investigation — <outcome>`

### Phase 1 — Architecture Decision Record

CC fills in the 5 architectural decisions in the gate template above. Each decision references DIAG-041/042 evidence verbatim. Each decision passes scale + AI-first + transport + atomicity gates.

File: `docs/architecture-decisions/HF-218_ARCHITECTURE_DECISION_RECORD.md`

Commit message: `HF-218 Phase 1: Architecture Decision Record committed`

### Phase 2 — Component 1: Convergence Self-Verification

Implementation per the Component 1 specification above.

Files modified:
- `web/src/lib/intelligence/convergence-service.ts` — replace lines 1937-1949 with new selection logic; add `tenantEntityExternalIds: Set<string>` to function signature
- `web/src/lib/intelligence/convergence-service.ts:299` — caller fetches tenant entities and passes set
- New helper function `computeStructuralBindingConfidence(candidate, columnStats, tenantEntities)` per Decision 1 composition

Tests: Korean Test grep at file completion shows zero hits for language/domain literals.

Commit message: `HF-218 Phase 2: Component 1 — Convergence self-verification (cardinality + intersection)`

### Phase 3 — Component 2: Engine Verification + Correction + Exception

Implementation per the Component 2 specification above.

Files modified:
- `web/src/app/api/calculation/run/route.ts` — at the `usedConvergenceBindings = false` flip site (CC verifies post-HF-217 line numbers via grep)
- New helper function `verifyBindingAtCalcTime(binding, batchId, tenantEntities, committed_data)` returning `{ verified: boolean, confidence: number, proposed_correction?: { column: string, confidence: number } }`

Tests: Engine refusal path is tested by simulating a tenant with zero entities; engine should emit structural_exception, not silently proceed. Engine correction path is tested by simulating a binding with C_existing < C_proposed; engine should apply correction with provenance.

Commit message: `HF-218 Phase 3: Component 2 — Engine verification + correction + structural exception`

### Phase 4 — Component 3: OB-177 Decrement Loop

If Phase 0 located the decrement → CC pastes located code; documents in `docs/architecture-decisions/HF-218_OB177_DECREMENT_LOCATION.md`. No implementation.

If Phase 0 did not locate → CC implements `decrementFingerprintConfidence` per Component 3 specification and Decision 2 formula. Files modified:
- `web/src/lib/sci/fingerprint-flywheel.ts` — new exported function `decrementFingerprintConfidence`
- Caller in `web/src/app/api/calculation/run/route.ts` at the structural_exception path (Phase 3 output) — invokes decrement when the failing binding traces to a fingerprint cache hit

Commit message: `HF-218 Phase 4: Component 3 — OB-177 decrement loop <located | implemented>`

### Phase 5 — Component 4: Open-Signal Wiring

Implementation per Component 4 specification, three sub-parts (4a, 4b, 4c).

Files modified:
- `web/src/app/api/calculation/run/route.ts` — every `[CalcRecon-T3]` EXCEPTION addLog site paired with a `writeSignal` call (4a)
- `web/src/lib/intelligence/convergence-service.ts` — new consumer for `convergence:dual_path_concordance` signals; tenant-adaptive boundary-fallback threshold (4b)
- `web/src/app/api/calculation/run/route.ts` (entry surface) — new consumer for `lifecycle:synaptic_consolidation` informing binding-snapshot scope (4c, if retained per Architecture Decision Record)

Commit message: `HF-218 Phase 5: Component 4 — Open-signal wiring (exception + concordance + consolidation)`

### Phase 6 — Component 5: Binding Snapshot Preservation

Implementation per Component 5 specification.

Files modified:
- `web/src/app/api/calculation/run/route.ts` — at the calculation_results insert site, every result row's metadata field contains the binding_snapshot JSON per the spec
- `web/src/lib/intelligence/classification-signal-service.ts:27` — SignalSource type union extended to include `'engine_correction'` and `'flywheel_correction'`
- Snapshot must include `calculation_run_id` per existing classification_signals column (HF-193-A A2 typed columns added this; per SCHEMA_REFERENCE_LIVE.md classification_signals has 20 columns including `calculation_run_id`)

Tests: Per Decision 4 placement, the snapshot is queryable by calculation_results.id. A test query reconstructs the binding for a specific historical calculation_result row.

Commit message: `HF-218 Phase 6: Component 5 — Binding snapshot preservation (calculation_results.metadata)`

### Phase 7 — Korean Test Verification + Anti-Pattern Registry Check

CC runs the Korean Test grep across all HF-218-touched files:

```bash
grep -rnE "'No_Empleado'|'ID_Empleado'|'Hub'|'Cumplimiento'|'Mérida'" web/src/lib/intelligence/ web/src/lib/sci/ web/src/lib/calculation/ web/src/app/api/calculation/ --include="*.ts"
grep -rnE "/empleado/i|/empresa/i|/hub/i|/empleado/i" web/src/lib/intelligence/ web/src/lib/sci/ web/src/lib/calculation/ web/src/app/api/calculation/ --include="*.ts"
```

Both must return zero hits. If either has hits → HALT, refactor, recommit Phase 2-6 as needed.

CC checks Anti-Pattern Registry (Section C) against each HF-218 change:
- AP-1 (HTTP body data transport) — verify snapshot writes use bulk service-role
- AP-5/6/7 (hardcoded dictionaries, language patterns, placeholder confidence) — verify zero hits
- AP-8 (migration without execution) — N/A (no DDL)
- AP-9/10/11 (file-existence proof gates) — verify proof gates query live state
- AP-13 (assumed schema columns) — verify all writes paste live `information_schema.columns` evidence
- AP-14 (partial state on failure) — verify snapshot+result atomic write

Commit message: `HF-218 Phase 7: Korean Test + Anti-Pattern Registry verification`

### Phase 8 — Completion Report + Final Build

Per Rule 25, completion report created BEFORE final build. Report at `HF-218_COMPLETION_REPORT.md` (project root).

Structure per Rule 26 exactly.

Final build:
```bash
rm -rf web/.next
cd web && npm run build && cd ..
cd web && npm run dev &
# Wait for localhost:3000
curl -sf http://localhost:3000 > /dev/null && echo "DEV-OK"
```

Commit message: `HF-218 Phase 8: Completion report + final build verification`

### Phase 9 — PR Creation

```bash
gh pr create --base main --head dev --title "HF-218: Convergence & Comprehension Layer-Contract Closure" --body "<paste HF-218 summary + DIAG-042 §4.6 evidence trail + Architecture Decision Record summary + Phase 7 Korean Test grep output>"
```

Commit message: N/A (PR creation, not commit).

---

## PROOF GATES — HARD

These criteria are VERBATIM. Completion report must paste evidence per Rule 27.

**Hard Gate 1:** Architecture Decision Record committed before any implementation phase. Five architectural decisions filled in with rationale citing DIAG-041/042 evidence.
- Evidence: paste commit SHA and file path

**Hard Gate 2:** Convergence binding-selection logic at convergence-service.ts:1937-1949 (or post-HF-217 line equivalent) is replaced with the structural verification protocol (Component 1). Selection no longer uses `idEntries[0]`.
- Evidence: paste verbatim new code block + Korean Test grep of the file showing zero hits

**Hard Gate 3:** Engine at the `usedConvergenceBindings` flip site implements verification-then-action (verify-and-proceed, correct, or structural exception). Silent fall-through path is structurally eliminated.
- Evidence: paste verbatim new code block + paste grep showing no remaining silent fall-through path

**Hard Gate 4:** OB-177 decrement loop is either located in code (paste-traced) or newly implemented (paste new function). Status documented in `docs/architecture-decisions/HF-218_OB177_DECREMENT_LOCATION.md`.
- Evidence: paste file contents or paste new function with caller

**Hard Gate 5:** Every `[CalcRecon-T3] EXCEPTION` addLog site has a paired `writeSignal({signal_type: 'engine:exception', ...})` call. (Component 4a)
- Evidence: paste each pair from route.ts + grep showing every addLog has matching writeSignal

**Hard Gate 6:** `convergence:dual_path_concordance` consumer reads recent signals and adapts threshold. `BOUNDARY_FALLBACK_MIN_SCORE` constant 0.50 is removed (or kept only as initial-state default with comment justifying). (Component 4b)
- Evidence: paste new consumer code + paste any remaining references to 0.50 with justification

**Hard Gate 7:** Every calculation_results.insert call includes binding_snapshot in metadata per Component 5 schema. (Component 5)
- Evidence: paste insert call from route.ts showing metadata field structure + paste a sample stored row's metadata JSON from a live test calc run

**Hard Gate 8:** SignalSource type union extended with `'engine_correction'` and `'flywheel_correction'`. (Component 5)
- Evidence: paste classification-signal-service.ts:27 verbatim

**Hard Gate 9:** Korean Test grep across all HF-218 files returns ZERO hits for language/domain-specific literals.
- Evidence: paste the grep command AND its output (zero hits)

**Hard Gate 10:** Anti-Pattern Registry check returns ZERO violations across all components.
- Evidence: paste per-AP verification with grep output

**Hard Gate 11:** Final build passes; localhost:3000 responds; browser console clean.
- Evidence: paste `npm run build` exit code, `curl` response, browser console screenshot or paste-able text

**Hard Gate 12:** All 9 phases committed as separate commits (Rule 28). `git log --oneline` shows 9 HF-218 commits.
- Evidence: paste `git log --oneline | grep HF-218`

**Hard Gate 13:** PR created with full HF-218 summary in body.
- Evidence: paste `gh pr view --json url,title,body | jq`

---

## PROOF GATES — SOFT

**Soft Gate 1:** Calculation through the new path runs end-to-end for a clean-slate test tenant import (architect performs clean-slate test post-merge per SR-44; CC pre-verifies on dev). Engine produces a calculation_result with a populated binding_snapshot.
- Evidence: paste a sample calculation_result row + its binding_snapshot.metadata JSON

**Soft Gate 2:** Self-correction fires when designed: simulate a binding pointing at a wrong column; verify engine corrects, emits signal, persists snapshot, and proceeds.
- Evidence: paste the test scenario (architect-channel; CC describes the test, not the GT value)

**Soft Gate 3:** Structural exception fires when designed: simulate a binding pointing at a non-tenant-entity column with no correction available; verify engine refuses-and-emits, does not produce a result.
- Evidence: paste the structural_exception signal row from classification_signals

**Soft Gate 4:** OB-177 decrement is operative (per Phase 0 outcome). Either: located code paste-trace shows decrement triggers on the binding failure path (Phase 0 path A), OR newly-implemented function is invoked from Phase 3 structural_exception path with a test verifying confidence decreased after a simulated failure (Phase 0 path B).
- Evidence: paste either the located trace or the new function's caller + test result

**Soft Gate 5:** Boundary-fallback threshold is tenant-adaptive per Component 4b: a tenant with low recent concordance has a different threshold than a tenant with high recent concordance.
- Evidence: paste tenant-comparison query showing different computed thresholds

---

## OUT-OF-SCOPE — DO NOT EXPAND

CC does NOT modify any of these in HF-218:

- Substrate (`vialuce/vialuce-governance` repo) — E924/E904/E902 amendments queue as Decision A debt
- Plan-interpretation surface (`anthropic-adapter.ts:plan_interpretation` prompt) — separate Decision 153 follow-on
- HC LLM prompt (`anthropic-adapter.ts:header_comprehension` prompt) — separate work
- IntentOperation primitive set extension — not in this HF
- IntentModifier discriminant extension — not in this HF
- contextualIdentity canonical enum — not in this HF
- UI surfaces — no UI touched in this HF
- New tables — no DDL in this HF

If CC discovers a scope creep opportunity during implementation, surface it in the completion report Known Issues section. Do not expand HF-218.

---

## CC OUTPUT DISCIPLINE

CC's completion-of-HF response to architect contains:

1. Final commit count and SHAs (from `git log --oneline | grep HF-218`)
2. PR URL (from `gh pr view`)
3. Completion report file path
4. Architecture Decision Record file path
5. Phase 0 OB-177 investigation outcome
6. Hard gates: PASS/FAIL summary with paste evidence pointers (line numbers in the completion report)
7. Soft gates: PASS/FAIL summary
8. Known Issues count
9. Substrate debt named (E924/E904/E902 noted as known-debt-not-addressed-per-Decision-A)

CC does NOT interpret findings or recommend next steps. The architect dispositions post-PR.

---

## COMPLETION REPORT ENFORCEMENT (Rules 25-28)

The completion report is created as a FILE, not terminal output.
- File: `HF-218_COMPLETION_REPORT.md` in PROJECT ROOT
- Created BEFORE final build verification
- Contains VERBATIM proof gate criteria (every Hard + Soft Gate from this prompt) with PASS/FAIL and PASTED evidence
- Committed to git as part of Phase 8
- If this file does not exist at PR creation, the HF is considered INCOMPLETE regardless of how many phases executed successfully

Completion Report Structure (Rule 26 mandatory order):

```markdown
# HF-218 COMPLETION REPORT
## Date
## Execution Time

## COMMITS (in order)
| Hash | Phase | Description |

## FILES CREATED
| File | Purpose |

## FILES MODIFIED
| File | Change |

## PROOF GATES — HARD
| # | Criterion (VERBATIM from prompt) | PASS/FAIL | Evidence |

## PROOF GATES — SOFT
| # | Criterion (VERBATIM from prompt) | PASS/FAIL | Evidence |

## STANDING RULE COMPLIANCE
- Rule 1 (commit+push each phase): PASS — 9 commits for 9 phases
- Rule 2 (cache clear after commit): PASS
- Rule 6 (report in project root): PASS — this file exists
- Rule 25-28 (completion report discipline): PASS
- Rule 29 (CC paste block last): PASS

## KNOWN ISSUES
- E924/E904/E902 substrate coherence findings — known debt per architect Decision A; out of HF-218 scope
- <any partial implementations, deferred items, or surface scope-creep flags>

## VERIFICATION SCRIPT OUTPUT
<paste raw output of Korean Test grep, anti-pattern registry checks, build, curl>
```

---

**End of HF-218 prompt. Paste verbatim to CC.**
