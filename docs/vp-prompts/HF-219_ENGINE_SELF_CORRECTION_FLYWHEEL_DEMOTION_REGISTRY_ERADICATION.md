## HF-219: ENGINE SELF-CORRECTION + FLYWHEEL DEMOTION + SIGNAL-REGISTRY ERADICATION — Vertical Slice

**Autonomy Directive (Rule 11):** NEVER ask yes/no. NEVER say "shall I". Just act.

**Status of this HF:** Closure of two HF-218 Known Issues (#2 auto-correction scope contraction; #4 decrement caller wiring) plus eradication of the signal-registry pattern that emerged in HF-218 and represents a recurring CC failure pattern (deterministic registry as gate against adaptive emergence). PR #389 (HF-218) merged to main. HF-219 branches from updated main.

**Predecessors:** HF-218 (PR #389, merged). DIAG-039, DIAG-040, DIAG-041, DIAG-042. IRA invocation IRA_HF_218_PreDrafting_Substrate_Validation_20260512 still operative.

**Branch:** `dev` (created fresh from updated main post-HF-218-merge). PR to `main` at final step.

---

## CC STANDING RULES (READ FIRST)

CC reads `CC_STANDING_ARCHITECTURE_RULES.md` in full before any work. Specifically applicable here:

- **Section A Principle 1** — AI-First, Never Hardcoded. Korean Test compliance throughout.
- **Section A Principle 5** — Closed-Loop Learning. HF-219 closes the operative gap in the flywheel decrement path.
- **Section A Principle 7** — Prove, Don't Describe. Evidentiary gates: paste code/grep/output, never self-attestation.
- **Section A Principle 8** — Domain-Agnostic Always.
- **Section 0 (v3.0) GP-1** — Compliance is Architecture. **Adaptive emergence is architectural commitment; closed-vocabulary registries violate this commitment.**
- **Section 0 (v3.0) GP-2** — Research-Derived Design. The platform's adaptive intelligence moat depends on observation-driven wiring, not developer-declared registration.
- **Section B** — Architecture Decision Gate mandatory before implementation (Phase 1 below).
- **Section C** — Anti-Pattern Registry. HF-219 ADDS a new entry (next-available AP number, structurally AP-23) addressing closed-vocabulary signal registries.
- **Section D Rules 1-24** — operational discipline.
- **Section D Rules 16-20** — proof gates verify LIVE state.
- **Section E** — scale reference. Every component must work at "Large" tier without re-architecture.
- **Section F** — quick checklist before completion.
- **Rules 25-28** — completion report discipline.

**SR-34** — No bypass. Structural fixes only.
**SR-42** — Locked-rule halt.
**SR-44** — Architect-only production verification.
**Rule 29** — CC paste block LAST; nothing after.

**Output discipline carry-forward from prior session:** Completion report file location is `docs/completion-reports/HF-219_COMPLETION_REPORT.md` (NOT project root). This follows the architect-confirmed operative convention from prior cycles (HF-217, DIAG-039 through DIAG-042). The Rule 25/Rule 6 boilerplate language about "PROJECT ROOT" is superseded by this operative convention.

---

## CONTEXT — WHY THIS HF EXISTS

HF-218 delivered the observability layer of the layer-contract closure. It did NOT deliver the operative self-correction layer.

**Two HF-218 gaps surfaced in the completion report Known Issues:**

- **Known Issue #2:** Component 2 auto-correction path scope-contracted to detection-only. The engine detects wrong bindings but does NOT update them. The third branch of verify-correct-or-except is absent.
- **Known Issue #4:** `decrementFingerprintConfidence` function exists at `web/src/lib/sci/fingerprint-flywheel.ts` but no operative code path invokes it. The bidirectional flywheel loop is structurally incomplete — increment fires on success; decrement is implemented but disconnected.

**Third gap surfaced architect-channel post-HF-218:**

CC introduced `signal-registry.ts` during HF-218 with `declared_writers` and `declared_readers` per signal_type. This was NOT in the HF-218 directive. CC added it as a discipline beyond what was specified, treating signal_types as a closed vocabulary requiring developer registration.

**Why this is load-bearing:** the platform exists to observe novel patterns and accurately triage, assess, define, and structure them. A registry where every signal_type must be declared by a developer before it can be emitted or consumed gates adaptive emergence behind developer action. This is the failure pattern that has recurred multiple times in this platform's history. CC reaches for registry/dictionary/enum patterns reflexively because they are deterministic and predictable. Adaptive intelligence is the opposite shape — observation-driven, pattern-emergent, no developer-step-required between novel-signal-emitted and consumer-receives.

**Architect directive:** the platform must function with the premise that it is going to receive novel information and it needs to accurately triage, assess, define, and structure that information. Registries violate this premise structurally.

---

## ARCHITECT DISPOSITIONS GOVERNING THIS HF

**Disposition 1 (carry-forward from HF-218):** Sequenced approach. Substrate amendments E924/E904/E902 remain queued in `vialuce/vialuce-governance` repo. HF-219 does NOT modify VG substrate.

**Disposition 2 (carry-forward):** Engine reads tenant.entities. Calculation Sovereignty (E904) essence preserved via SOC-grade preservation discipline.

**Disposition 3 (carry-forward and restored as binding):** Self-correcting engine with preservation. Engine MAY correct bindings when verification confidence strictly exceeds existing binding confidence; corrections preserve pre-state and post-state via classification_signals + rule_sets atomic update. HF-219 restores this disposition operatively (it was scope-contracted in HF-218).

**Disposition 4 (carry-forward):** Relative confidence comparison. C_proposed > C_existing using freshly-computed structural methodology on both sides.

**Disposition 5 (NEW — registry eradication):** The signal-registry pattern is structurally incompatible with adaptive intelligence and is eradicated. Signal_types are open-vocabulary strings; emitters produce signal_types freely without prior registration; consumers subscribe via pattern-matching predicates (string prefix, regex, type discriminant function). No registry file. No declared_writers/declared_readers. No registration gate.

**Disposition 6 (NEW — standing rule update):** Section C of CC_STANDING_ARCHITECTURE_RULES.md gets a new Anti-Pattern entry naming closed-vocabulary registries explicitly, preventing recurrence in future CC cycles. CC determines the correct next-available AP number in Phase 0 by reading the current standing rules file (the AP numbering has historical drift; CC selects the next truly-unused integer).

These dispositions are binding context. CC does NOT scope-contract via ADR. The Architecture Decision Gate is for implementation-mechanism choices (which formula, which subscription pattern, which optimistic-lock pattern), NOT for re-scoping dispositions.

---

## SCOPE — FOUR COMPONENTS

HF-219 is a vertical slice. All four components ship in one PR.

**Component R1 — Engine Verify-Correct-or-Except: Third Branch Restored.**

At the engine verification site in `web/src/app/api/calculation/run/route.ts` (post-HF-218 location around the `usedConvergenceBindings` flip and HF-218's verification block), restore the correction branch per the original HF-218 directive Component 2 specification.

After the existing verify-and-proceed and refuse-and-emit branches, add the correction branch:

When `verification.proposed_correction` exists (verification identified a different column with strictly higher freshly-computed confidence) AND `column_proposed !== column_existing`, engine:

1. Atomically update `rule_sets.input_bindings.convergence_bindings` for the affected component with the corrected binding
2. Update mechanism: read current rule_sets row, compose new convergence_bindings JSONB with the corrected entry, write with optimistic concurrency control (check current `updated_at` matches expected; abort and retry on mismatch, max 3 retries; on persistent contention emit `convergence:correction_contention` signal and fall through to refuse-and-emit)
3. Persist a `classification_signals` row with signal_type `convergence:engine_correction` and signal_value carrying pre-state binding, post-state binding, C_existing, C_proposed, tenant_id, rule_set_id, component_id, calculation_run_id, timestamp
4. The `source` field on the classification_signal is `'engine_correction'` (per HF-218 SignalSource enum extension)
5. Snapshot the post-correction binding into `calculation_results.metadata.binding_snapshot.corrections_in_this_run` (per HF-218 Component 5 surface, unchanged)
6. Proceed with the corrected binding for the current entity-component calculation

The correction is atomic with calculation: if the rule_sets update fails after retries, the calculation_result is NOT written for this entity-component; engine emits structural_exception signal and skips. Per HF-218 Component 5 SOC discipline, any successfully-written calculation_result is fully reconstructable from its snapshot regardless of subsequent corrections.

Files modified:
- `web/src/app/api/calculation/run/route.ts` — third branch added to the verify block

Korean Test gates: zero hardcoded column names, language-specific strings, or developer-set thresholds. All logic operates on structural primitives + relative confidence comparison.

**Component R2 — OB-177 Decrement Caller Wired.**

The `decrementFingerprintConfidence` function exists at `web/src/lib/sci/fingerprint-flywheel.ts` (HF-218 Phase 4 implementation). HF-219 wires the operative caller.

From the engine structural_exception path in `web/src/app/api/calculation/run/route.ts` (the path where verification fails and binding cannot be corrected — both `C_proposed < C_existing` for any candidate AND no candidate achieves operative confidence), engine:

1. Traces the failing binding to its source fingerprint:
   - Query `structural_fingerprints` keyed by tenant_id + the content_unit_hash of the import batch from which the binding's `field_identities` were derived (this trace is queryable via the binding's stored provenance per HF-218 Component 5 binding_snapshot — `convergence_bindings_used` contains binding origin metadata)
   - If trace returns a fingerprint row, capture `fingerprint_hash` and `current_confidence`
   - If trace returns no fingerprint row (binding originated without a cached fingerprint — e.g., first-import path), no decrement fires; emit structural_exception signal only
2. When trace yields a fingerprint: invoke `decrementFingerprintConfidence(tenantId, fingerprintHash, reason, supabaseUrl, supabaseServiceKey)` where `reason` includes the verification failure context (failing column, candidates considered, C_existing, batch_id, calculation_run_id)
3. `decrementFingerprintConfidence` (HF-218 implementation, unchanged in this HF): applies -0.20 decrement per call, floored at 0, optimistic-lock pattern symmetric to writeFingerprint, emits `flywheel:fingerprint_decrement` signal with pre-confidence + post-confidence + reason
4. After decrement, engine proceeds with the structural_exception path (refuse-to-calculate; skip entity-component; calculation continues for other entity-components)

The bidirectional flywheel loop is now structurally complete: increment on binding success (writeFingerprint, pre-existing); decrement on binding-traced-to-fingerprint verification failure (HF-219 wiring).

Files modified:
- `web/src/app/api/calculation/run/route.ts` — caller invocation at the structural_exception path

**Component R3 — Signal-Registry Eradication.**

The file `web/src/lib/intelligence/signal-registry.ts` (CC-introduced during HF-218) and all of its operative semantics are eradicated.

**R3a — File deletion + import removal.**

CC executes:

```bash
# Find every file referencing signal-registry
grep -rln "signal-registry" web/src/ --include="*.ts"
grep -rln "registerSignal\|declared_writers\|declared_readers\|SIGNAL_REGISTRY" web/src/ --include="*.ts"
```

Paste verbatim grep output. Then for each file in the result:

1. Remove the `import` statement that references signal-registry
2. Remove any call to registry helpers (e.g., `registerSignal`, `getRegisteredReaders`, registry-existence checks)
3. Replace any usage of registry as a gate (e.g., `if (signalIsRegistered(type)) { emit }`) with unconditional emission (`emit`)
4. Replace any usage of registry as a router (e.g., `getReadersFor(signalType).forEach(...)`) with direct pattern-matching subscription (see R3b)

After all consumers refactored, delete the file:

```bash
git rm web/src/lib/intelligence/signal-registry.ts
```

Verify deletion:

```bash
ls web/src/lib/intelligence/signal-registry.ts 2>&1   # should report "No such file"
grep -rn "signal-registry\|registerSignal\|SIGNAL_REGISTRY" web/src/ --include="*.ts"   # should return zero hits
```

**R3b — Direct subscription pattern.**

Any consumer that previously declared itself a reader-of-X-signal_type via the registry must now subscribe directly. The subscription happens at consumer code locations, not at a central registry.

Subscription mechanism is **pattern-based**, not type-based:

- Consumers query `classification_signals` table directly using SQL pattern-matching (e.g., `signal_type LIKE 'convergence:%'`, `signal_type ~ '^engine:'`, predicate function on JSONB content)
- Consumers do NOT consult a registry to determine what signal_types exist
- Consumers handle unknown/novel signal_types gracefully (the platform exists to receive novel information; consumers must not refuse to process signals because the signal_type is unfamiliar)

Concretely for HF-218's claimed reader (the OB-177 decrement caller's "declared_reader" entry):

- Pre-HF-219: `decrementFingerprintConfidence` registered as reader of `engine:structural_exception` in signal-registry.ts. Operative behavior: nothing — no code path consulted the registry to invoke the function.
- Post-HF-219: `decrementFingerprintConfidence` invoked directly from the engine structural_exception path (per Component R2 above). No registry consultation. The wiring is in code, not in declaration.

For Component 4b's tenant-adaptive concordance threshold (HF-218 Component 4b), which subscribes to `convergence:dual_path_concordance`:

- Pre-HF-219: declared as reader via signal-registry.
- Post-HF-219: consumer reads `classification_signals` table directly with `WHERE signal_type = 'convergence:dual_path_concordance' AND tenant_id = $1 ORDER BY created_at DESC LIMIT 5`. No registry consultation. Pattern-based query.

For any HF-218-introduced consumer pattern that reads registry to determine subscription:
- Refactor to direct table query with WHERE clause on signal_type pattern
- Add fallback path for `LIKE 'prefix:%'` queries when consumer logic groups multiple signal_types

**R3c — Emission paths.**

Every site that emits a classification_signal: verify it does NOT consult signal-registry before emitting. Emission is unconditional on signal_type.

```bash
grep -rn "classification_signals.*insert\|writeSignal\|insertSignal" web/src/ --include="*.ts"
```

For each emit site, paste verbatim and verify zero registry checks. If any emit site is gated on registry membership, remove the gate; emission fires on any signal_type string.

Files modified (R3 total):
- `web/src/lib/intelligence/signal-registry.ts` — DELETED
- Every file CC's grep surfaces (refactor imports, callers, gate-checks)
- Estimated 5-15 files based on signal-registry's import footprint

**Component R4 — Adaptive-Emergence Regression Test.**

Test file: `web/src/lib/intelligence/__tests__/adaptive-emergence.test.ts`.

Purpose: verify the platform's open-vocabulary signal contract operatively. If this test fails in any future HF, the registry-as-gate pattern has recurred and must be eradicated again.

Test specifications:

```typescript
// Test 1: Novel signal_type emits freely
test('Novel signal_type emits to classification_signals without prior registration', async () => {
  const novelType = `convergence:test_novel_pattern_${Date.now()}`;
  // Emit signal with novel type via the operative emission path
  const result = await emitClassificationSignal({
    tenant_id: TEST_TENANT_ID,
    signal_type: novelType,
    signal_value: { test: true },
    source: 'ai',
  });
  expect(result).toBeTruthy();
  expect(result.signal_type).toBe(novelType);
  // Verify the row landed in classification_signals
  const row = await supabase.from('classification_signals').select('*').eq('id', result.id).single();
  expect(row.data.signal_type).toBe(novelType);
});

// Test 2: Pattern-matching consumer reads novel signal_type
test('Pattern-matching subscriber receives novel signal_type matching prefix', async () => {
  const novelType = `convergence:test_emergent_${Date.now()}`;
  await emitClassificationSignal({ /* as above */ signal_type: novelType, /* ... */ });
  // Consumer subscribes via SQL pattern
  const consumed = await supabase
    .from('classification_signals')
    .select('*')
    .like('signal_type', 'convergence:%')
    .eq('tenant_id', TEST_TENANT_ID)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  expect(consumed.data.signal_type).toBe(novelType);
});

// Test 3: No signal-registry file or import exists
test('No signal-registry file in lib/intelligence', () => {
  const fs = require('fs');
  expect(fs.existsSync(path.join(__dirname, '..', 'signal-registry.ts'))).toBe(false);
});

// Test 4: No code path references signal-registry imports
test('No signal-registry imports in any web/src/ file', () => {
  const result = execSync('grep -rln "signal-registry\\|registerSignal\\|SIGNAL_REGISTRY" web/src/ --include="*.ts" || true').toString();
  expect(result.trim()).toBe('');
});
```

Test cleanup: emitted test signals are tagged with `test: true` in signal_value; cleanup task deletes test rows post-test.

The test runs in CI on every push to dev (this HF) and on every push thereafter. Any reintroduction of registry pattern fails Test 3 or Test 4.

Files created:
- `web/src/lib/intelligence/__tests__/adaptive-emergence.test.ts`

---

## SUBSTRATE UPDATE — AP-23 (CC determines actual number in Phase 0)

HF-219 updates `CC_STANDING_ARCHITECTURE_RULES.md` Section C with a new Anti-Pattern entry.

**CC reads the current file in Phase 0 to determine the correct next-available AP number.** The numbering has historical drift (AP-25 has unresolved claimants per March 2026 governance handoff; AP-23 and AP-24 may or may not be present depending on file state at HF-219 start). CC selects the next truly-unused AP integer by reading the file, then uses that number consistently. For this directive, "AP-23" is used as a placeholder; CC substitutes the actual selected number throughout.

**New AP entry content (CC inserts under the "AI & Intelligence" subsection of Section C):**

```markdown
| AP-23 | Closed-vocabulary signal registries / declared_writers / declared_readers / register-then-emit gates | Signal_types are open-vocabulary strings; emitters produce freely without prior registration; consumers subscribe via pattern-matching predicates (string prefix, regex, predicate function on signal_type) directly against classification_signals table; no registry file, no developer-declared registration step gates emission or consumption. The platform exists to receive novel information; registries that require developer action before novel signals can flow violate the adaptive intelligence moat. | HF-219 (eradication); HF-218 (recurrence) |
```

After insertion, CC verifies the table renders correctly and the entry sits in the AI & Intelligence subsection.

Files modified:
- `CC_STANDING_ARCHITECTURE_RULES.md` — new AP entry

This is platform-side standing rules (spm-platform repo), NOT VG substrate. Per Disposition 1, VG substrate amendments (E924/E904/E902) remain queued separately.

---

## ARCHITECTURE DECISION GATE (Section B)

CC commits the following ARCHITECTURE DECISION RECORD as the FIRST commit of HF-219, BEFORE any implementation. File: `docs/architecture-decisions/HF-219_ARCHITECTURE_DECISION_RECORD.md`.

```
ARCHITECTURE DECISION RECORD — HF-219
======================================
Problem: HF-218 delivered observability layer of layer-contract closure. Engine self-correction
(third branch of verify-correct-or-except) and bidirectional flywheel loop (OB-177 decrement
caller wiring) were NOT delivered. Additionally, CC introduced a signal-registry pattern that
gates adaptive emergence behind developer registration — this is a recurring failure pattern
that must be eradicated structurally.

Decisions in HF-219 scope are IMPLEMENTATION-MECHANISM only. Dispositions are binding and
NOT subject to CC scope-contraction via ADR (HF-218 lesson: scope contraction inside ADR is the
Decision-Implementation Gap pattern).

Decision 1 — Atomic rule_sets update mechanism (Component R1)
  Options:
    A. Optimistic concurrency control on updated_at column; abort+retry on mismatch (max 3)
    B. Postgres SELECT FOR UPDATE row lock during the read-compose-write window
    C. Service-role tsx-script with advisory lock keyed on tenant_id + rule_set_id
  Constraints:
    - Atomic: rule_sets update + classification_signals write must commit together OR neither
    - Scale: must work at "Large" tier (500K-5M records per Section E)
    - Contention: must handle concurrent corrections to the same rule_set gracefully (fall through to structural_exception with signal, not throw uncaught)
  CHOSEN: ___ because ___
  REJECTED: ___ because ___

Decision 2 — Fingerprint trace mechanism (Component R2)
  Options:
    A. binding_snapshot.convergence_bindings_used contains an `origin_fingerprint_hash` field; engine reads from snapshot
    B. Engine reads structural_fingerprints WHERE tenant_id AND content_unit_hash matching the active import_batch's content_unit_hash_sha256
    C. binding stores fingerprint_hash directly at write time (requires HF-218 Component 1 retrofit; out of HF-219 scope)
  Constraints:
    - Must operate WITHOUT modifying HF-218 binding structure (HF-218 is merged; no retrofit)
    - Trace must succeed when fingerprint exists; gracefully no-op when binding has no source fingerprint
    - Korean Test: structural query, no domain-specific WHERE clauses
  CHOSEN: ___ because ___
  REJECTED: ___ because ___

Decision 3 — Subscription pattern semantics (Component R3b)
  Options:
    A. SQL LIKE pattern on signal_type (e.g., `LIKE 'convergence:%'`)
    B. SQL regex pattern (`signal_type ~ '^convergence:'`)
    C. Predicate function in TypeScript that filters fetched rows (heavier read; less DB-efficient)
  Constraints:
    - Korean Test: no hardcoded signal_type literals in any consumer file (queries derive patterns from structural context)
    - Performance: must work at scale where classification_signals has 10M+ rows per tenant
    - Consumers must handle novel matching signal_types without code change
  CHOSEN: ___ because ___
  REJECTED: ___ because ___

For all decisions:
- Scale test: Works at 10x? Works at "Large"? ___
- AI-first: Zero hardcoded field names / language strings / signal_type literals added? ___
- Transport: No row data through HTTP bodies; bulk Supabase service-role for any multi-row reads? ___
- Atomicity: Compound writes succeed atomically OR roll back cleanly? ___
- G1-G6 evaluation per Section 0 governing principles? ___
```

CC commits the completed ADR BEFORE Phase 2 begins.

---

## PHASES — IMPLEMENTATION SEQUENCE

CC executes 8 phases. Each phase: commit + push. Final phase: `gh pr create`.

### Phase 0 — Pre-implementation: AP number + registry footprint discovery

```bash
# Discover current AP numbering in standing rules
grep -n "^| AP-" CC_STANDING_ARCHITECTURE_RULES.md
# Discover signal-registry footprint
grep -rln "signal-registry" web/src/ --include="*.ts"
grep -rln "registerSignal\|declared_writers\|declared_readers\|SIGNAL_REGISTRY" web/src/ --include="*.ts"
# Count consumers that need refactoring
grep -rln "signal-registry" web/src/ --include="*.ts" | wc -l
```

Paste verbatim output. CC determines:
1. Next-available AP integer (records as "selected AP number" in Phase 1 ADR)
2. Complete list of files requiring R3a refactoring
3. Count for completion report Files Modified table

Commit message: `HF-219 Phase 0: AP number + signal-registry footprint discovery`

### Phase 1 — Architecture Decision Record

CC fills in the 3 architectural decisions (R1 atomic mechanism, R2 fingerprint trace, R3b subscription semantics). Each decision cites HF-218 ADR + completion report + DIAG-042 evidence verbatim.

File: `docs/architecture-decisions/HF-219_ARCHITECTURE_DECISION_RECORD.md`

Commit message: `HF-219 Phase 1: Architecture Decision Record committed`

### Phase 2 — Component R1: Engine Verify-Correct-or-Except Third Branch

Per Component R1 specification. The third branch added after HF-218's verify-and-proceed and refuse-and-emit branches. Atomic rule_sets update per ADR Decision 1.

File modified: `web/src/app/api/calculation/run/route.ts`

Tests: TypeScript clean. Korean Test grep on file: zero hits.

Commit message: `HF-219 Phase 2: Component R1 — Engine correction branch (third branch restored)`

### Phase 3 — Component R2: OB-177 Decrement Caller Wired

Per Component R2 specification. Fingerprint trace per ADR Decision 2. Caller invocation at engine structural_exception path.

File modified: `web/src/app/api/calculation/run/route.ts`

Commit message: `HF-219 Phase 3: Component R2 — OB-177 decrement caller wired (bidirectional flywheel operative)`

### Phase 4 — Component R3a: Signal-Registry File + Imports Eradicated

Per Component R3a specification. CC:

1. Refactors every file in Phase 0 grep output (remove imports, remove gate-checks, replace registry-routing with direct table queries)
2. Deletes `web/src/lib/intelligence/signal-registry.ts`
3. Verifies via grep that zero references remain

If any consumer previously routed via registry's `getReadersFor(signalType)`: refactor to consumer-side direct query (per ADR Decision 3 pattern semantics).

Files modified: every file in Phase 0 grep output.
File deleted: `web/src/lib/intelligence/signal-registry.ts`

Commit message: `HF-219 Phase 4: Component R3a — signal-registry.ts deleted; all imports removed`

### Phase 5 — Component R3b/c: Direct Subscription Refactor + Emission Path Verification

Per Component R3b and R3c specifications.

CC:

1. For each consumer that previously consulted registry, restructures to direct `classification_signals` table query with pattern-matching WHERE clause per ADR Decision 3
2. Removes any registry-gate from emission paths (every classification_signals insert is unconditional on signal_type)
3. Verifies via grep that zero emission paths consult any registry; emission is open-vocabulary

Files modified: consumer files identified in Phase 4 (deepening their refactor).

Commit message: `HF-219 Phase 5: Components R3b/c — Direct subscription refactor + emission path verification`

### Phase 6 — Component R4: Adaptive-Emergence Regression Test

Per Component R4 specification.

File created: `web/src/lib/intelligence/__tests__/adaptive-emergence.test.ts`

CC runs the test locally; all four sub-tests pass.

Commit message: `HF-219 Phase 6: Component R4 — Adaptive-emergence regression test (prevents registry recurrence)`

### Phase 7 — Substrate Update: AP-N (Standing Rules)

Per Substrate Update section.

CC:

1. Reads `CC_STANDING_ARCHITECTURE_RULES.md` at the current Section C state
2. Inserts the new AP entry in the AI & Intelligence subsection table using the AP number selected in Phase 0
3. Verifies the table renders correctly (markdown table format integrity)

File modified: `CC_STANDING_ARCHITECTURE_RULES.md`

Commit message: `HF-219 Phase 7: Substrate update — AP-N (closed-vocabulary signal registries)`

### Phase 8 — Verification + Completion Report + Final Build + PR

CC runs:

```bash
# Korean Test verification
grep -rnE "'No_Empleado'|'ID_Empleado'|'Hub'|'Cumplimiento'|'Mérida'" \
    web/src/lib/intelligence/ web/src/lib/sci/ web/src/lib/calculation/ \
    web/src/app/api/calculation/ --include="*.ts"
grep -rnE "/empleado/i|/empresa/i|/hub/i" \
    web/src/lib/intelligence/ web/src/lib/sci/ web/src/lib/calculation/ \
    web/src/app/api/calculation/ --include="*.ts"
# Registry eradication verification
grep -rn "signal-registry\|registerSignal\|declared_writers\|declared_readers\|SIGNAL_REGISTRY" \
    web/src/ --include="*.ts"
ls web/src/lib/intelligence/signal-registry.ts 2>&1
# TypeScript clean
cd web && npx tsc --noEmit 2>&1 | head -30
# Build
rm -rf web/.next && cd web && npm run build && cd ..
# Dev server
cd web && (npm run dev &) && sleep 10 && curl -sf http://localhost:3000 > /dev/null && echo "DEV-OK"
```

Each must show zero hits / clean output / successful build / DEV-OK.

Completion report at `docs/completion-reports/HF-219_COMPLETION_REPORT.md` per Rule 26 structure (and per architect-confirmed operative convention — NOT project root).

PR creation: `gh pr create --base main --head dev --title "HF-219: Engine Self-Correction + Flywheel Demotion + Signal-Registry Eradication" --body "<paste HF-219 summary + closed gaps from HF-218 + signal-registry eradication evidence + AP-23 substrate update>"`

Commit message: `HF-219 Phase 8: Verification + completion report + PR`

---

## PROOF GATES — HARD

**Hard Gate 1:** Architecture Decision Record committed before any implementation phase. Three architectural decisions (R1 atomic mechanism, R2 fingerprint trace, R3b subscription semantics) filled in with rationale citing HF-218 ADR + completion report + DIAG-042 evidence.
- Evidence: paste commit SHA and file path

**Hard Gate 2:** Engine third branch (correction) at the verify block executes when verification proposes a different column with strictly higher confidence. The branch atomically updates rule_sets.input_bindings.convergence_bindings, emits convergence:engine_correction signal, snapshots post-correction binding, proceeds with corrected binding.
- Evidence: paste verbatim new code block; paste a test trace showing correction firing in a controlled scenario

**Hard Gate 3:** Engine structural_exception path invokes `decrementFingerprintConfidence` when failing binding traces to a fingerprint cache hit. The trace mechanism (per ADR Decision 2) is operative.
- Evidence: paste verbatim new caller code; paste a test trace showing decrement firing with pre-confidence and post-confidence values

**Hard Gate 4:** `web/src/lib/intelligence/signal-registry.ts` no longer exists. `ls` returns "No such file."
- Evidence: paste `ls` output

**Hard Gate 5:** Zero references to signal-registry / registerSignal / SIGNAL_REGISTRY / declared_writers / declared_readers anywhere in web/src/.
- Evidence: paste the grep command AND its output (zero hits)

**Hard Gate 6:** All consumers that previously routed via registry now use direct pattern-matching subscription against classification_signals table. Each consumer's WHERE clause is structural pattern (LIKE / regex), not enumerated signal_type list.
- Evidence: paste each refactored consumer's relevant code section

**Hard Gate 7:** Emission paths fire on any signal_type string without registry consultation. No emission gate references a registry.
- Evidence: paste every classification_signals insert site verbatim showing no registry check

**Hard Gate 8:** Adaptive-emergence regression test exists and passes all four sub-tests.
- Evidence: paste test output (PASS, all four sub-tests)

**Hard Gate 9:** `CC_STANDING_ARCHITECTURE_RULES.md` Section C contains a new AP entry naming closed-vocabulary signal registries. The entry sits in the AI & Intelligence subsection. The AP number is the next-available integer (CC-selected in Phase 0).
- Evidence: paste the new AP table row verbatim from the file

**Hard Gate 10:** Korean Test grep returns ZERO hits across all HF-219 files.
- Evidence: paste both grep commands and their output

**Hard Gate 11:** Anti-Pattern Registry check returns ZERO violations across all components. Specifically: the new AP-N (closed-vocabulary signal registries) does not fire on HF-219's own code (i.e., HF-219 does not itself introduce a new registry).
- Evidence: paste per-AP verification

**Hard Gate 12:** Final build passes; localhost:3000 responds; TypeScript clean on HF-219 surfaces.
- Evidence: paste `npm run build` exit code, curl response, tsc output

**Hard Gate 13:** All 8 phases committed as separate commits (Rule 28).
- Evidence: paste `git log --oneline | grep HF-219`

**Hard Gate 14:** PR created with full HF-219 summary in body.
- Evidence: paste `gh pr view --json url,title,body | jq`

---

## PROOF GATES — SOFT

**Soft Gate 1:** Engine correction branch fires in a controlled test scenario: simulate a binding pointing at a wrong column where verification identifies a correct column with strictly higher confidence; verify correction fires, rule_sets is updated atomically, signal is persisted, snapshot reflects post-correction state.
- Evidence: paste test scenario + classification_signals row + rule_sets row (pre and post)

**Soft Gate 2:** Engine structural_exception path with fingerprint trace decrements fingerprint confidence: simulate a failing binding traced to a cached fingerprint; verify confidence decreases by 0.20 (or floored to 0), flywheel:fingerprint_decrement signal persisted.
- Evidence: paste test scenario + structural_fingerprints pre/post + flywheel:fingerprint_decrement signal

**Soft Gate 3:** Novel signal_type flows end-to-end without prior registration: emit `convergence:test_emergent_${timestamp}`, consume via pattern subscriber, verify reception. (This is the adaptive-emergence test's behavior.)
- Evidence: paste test output

**Soft Gate 4:** AP-N entry visible and correctly placed in CC_STANDING_ARCHITECTURE_RULES.md.
- Evidence: paste the Section C AI & Intelligence subsection verbatim showing the new entry in context

**Soft Gate 5:** No CC failure pattern from HF-218 recurs in HF-219. Specifically: HF-219 does NOT introduce a new registry, dictionary, enum-gate, or hardcoded vocabulary in any form.
- Evidence: paste enumeration of HF-219 changes with verification that each addition is open-vocabulary / structural / pattern-based

---

## OUT-OF-SCOPE — DO NOT EXPAND

CC does NOT modify any of these in HF-219:

- VG substrate (E924/E904/E902 amendments remain queued per Disposition 1)
- HF-218 components 1, 4a, 4b, 5 (these landed correctly in HF-218; no changes)
- Plan-interpretation surface
- HC LLM prompt
- IntentOperation primitive set extension
- IntentModifier discriminant extension
- contextualIdentity canonical enum
- UI surfaces
- New tables (no DDL)
- The HF-218 SignalSource enum extension (engine_correction, flywheel_correction) — these stay; they're CORRECT (closed enum for a small set of source-types is appropriate; the registry was the wrong pattern, not the enum)

If CC discovers scope creep opportunity during implementation, surface it in Known Issues. Do not expand HF-219.

---

## CC OUTPUT DISCIPLINE

CC's completion-of-HF response to architect contains:

1. Final commit count and SHAs (from `git log --oneline | grep HF-219`)
2. PR URL (from `gh pr view`)
3. Completion report file path (`docs/completion-reports/HF-219_COMPLETION_REPORT.md`)
4. Architecture Decision Record file path
5. Phase 0 outputs (selected AP number, signal-registry footprint count)
6. Hard gates: PASS/FAIL summary with evidence line pointers
7. Soft gates: PASS/FAIL summary
8. Known Issues count
9. Substrate debt named (E924/E904/E902 still queued in VG repo per Disposition 1)

CC does NOT interpret findings or recommend next steps. Architect dispositions post-PR.

---

## COMPLETION REPORT ENFORCEMENT (Rules 25-28)

Completion report file: `docs/completion-reports/HF-219_COMPLETION_REPORT.md` — NOT project root. This applies the architect-confirmed operative convention (Rule 6's "project root" language is superseded by the operative convention from prior HF cycles HF-217, DIAG-039 through DIAG-042).

Created BEFORE final build verification (Rule 25).

Contains VERBATIM proof gate criteria with PASS/FAIL and PASTED evidence (Rule 27).

One commit per phase (Rule 28).

Structure per Rule 26 mandatory order:

```markdown
# HF-219 COMPLETION REPORT
## Date
## Execution Time
## COMMITS (in order)
## FILES CREATED
## FILES MODIFIED
## FILES DELETED
## PROOF GATES — HARD
## PROOF GATES — SOFT
## STANDING RULE COMPLIANCE
## KNOWN ISSUES
## VERIFICATION SCRIPT OUTPUT
```

---

**End of HF-219 prompt. Paste verbatim to CC.**
