# OB-235 (R2.1) — The Learning Loop — Completion Report

**Directive:** `docs/vp-prompts/OB-235_DIRECTIVE_R2.1_20260623.md` · **Branch:** `ob-235-learning-loop` (from main @ `57d9148d`, #593 merged).
**Status:** COMPLETE — P0–P9 + P-EXP. Sequential foundation (P1, P2) → Tier-1a (P3 ∥ P7 ∥ P-EXP) → Tier-1b (P4 → P5) → Tier-2 (P6) → integration (P8) → live wiring + end-to-end proof (P9). Role 4 (Learn) materialized at four layers; G11 read-path closed; the Multiplier-of-five proven. Each PG cites a runnable proof with pasted numbers. tsc 0 / build green / 289 tests throughout.

Self-attestation rejected — every PG pastes live evidence. Reconciliation figures architect-channel; CC asserts internal consistency (run-2 == run-1), never external correctness.

---

## 0. Sequence + Preconditions + Governance
- **HALT-SEQ:** `OB-235_DIRECTIVE_R2.1_20260623.md` is this directive (pre-staged), the only OB-235 file — not a different work item. Not triggered. Directive committed `83c92156` (Rule 29).
- **HALT-PRECOND:** #593 (OB-233 + HF-337) merged to main (`57d9148d`) and live; branched from main. Cleared.
- **HALT-233 / HALT-337:** `comprehension_artifacts` populated + `structural_fingerprint_hash` emitted (OB-233); `surface_bindings` live + recognizer present + `surface_binding_recognition` signals present (HF-337). Cleared.
- **Governance:** materialization of locked substrate (DS-021, Decision 64 v2, Synaptic Spec, DS-022 Phase 1). No new invariant, no IRA gate.

---

## 1. PG-0 — State verification + HF-337 re-sync

### 1.1 HF-337 re-sync (path deltas)
HF-337's five changed files all present on main and match its Forward-Validation: `lib/ai/anthropic-stream.ts`, `lib/insight/insight-engine.ts`, `lib/summary/comprehension-generator.ts`, `lib/comprehension/surface-binding-recognition.ts`, `app/api/financial/data/route.ts`. Calc path: zero HF-337 changes (the C6 diff). No mismatch → **HALT-RESYNC not triggered.**

### 1.2 Salvage-retry accounting (the warm=0 contract)
Cold comprehension call-count (per import, D = distinct data_types): `Σ_D [ 1 + (1 if first-pass coverage incomplete) ] + (1 if any row missing label/method)` → min `D+1`, max `2D+1`. `generateComprehension` has **no recall/skip/fingerprint path today** (re-comprehends every import — confirmed by read + grep `recall|fingerprint|skip|cache|hash` = only a DB-column-preservation comment). **P3 instrumentation must count TOTAL Anthropic calls incl. the HF-337 coverage-retry (`comprehension-generator.ts:86`) and `recognizeLabelsAndMethods` (`summary-engine.ts:157`)** — best as a single counter in `streamAnthropicText` tagged by `opts.label` — so a cold-miss retry cannot mask a warm-hit's `total == 0`. P3 recall seam: `comprehension-generator.ts:154-157` (before `comprehendFields`, inside the `Promise.all` mapper) — comprehension service, not the import route.

### 1.3 Calculation-layer density wiring — RECONNECT (not rebuild)
Live calc route `app/api/calculation/run/route.ts` + `lib/calculation/{synaptic-density,synaptic-surface,pattern-signature,flywheel-pipeline,synaptic-types}.ts` + `lib/agents/agent-memory.ts`:
- **(a) LOAD `synaptic_density` before the loop — PRESENT** (`route.ts:1344-1382`: `loadPriorsForAgent` / `loadDensity` / `createSynapticSurface` / per-component `generatePatternSignature` + `initializePatternDensity`).
- **(b) SELECT execution mode — DEAD.** `getExecutionMode` (`synaptic-surface.ts:124-134`, thresholds full<0.70 / light 0.70-0.95 / silent≥0.95) is called **only at `route.ts:3606`** in the response-payload builder, post-run — **never inside the entity loop (2061-3045)**. Mode is computed + reported but never acted on (no trace-skipping). **This is the one gap P4 reconnects.**
- **(c) CONSOLIDATE after — PRESENT** (`route.ts:3160`, `consolidateSurface`). **Discrepancy:** implemented EMA `0.3·prev + 0.7·run − 0.1·anomaly` (`synaptic-surface.ts:185-187`) vs Synaptic-Spec `0.7·prev + 0.2·run + 0.1·(1−anomaly)`. P4 aligns to spec (DD-5), math-neutral.
- **(d) FIRE cross-tenant flywheel — PRESENT** (`route.ts:3173`, `postConsolidationFlywheel` → `aggregateFoundational`→`foundational_patterns`, `aggregateDomain`→`domain_patterns`; cold-start via `loadColdStartPriors`/`applyPriorsToEmptyDensity`).
- **Entanglement: NONE.** The entity math loop has zero density/mode reads; the only in-loop synaptic touch (`writeSynapse`, `route.ts:3051`) consumes already-computed payouts. Mode read once post-run into the response JSON. **Reconnecting (b) gates trace verbosity, never math.** → **RECONNECT; HALT-REBUILD not triggered.**

### 1.4 Signal read-before-AI presence (AUD-002 v2)
**2 learning readers, both ADDITIVE** (enrich the AI input/posterior, never short-circuit): (1) `lib/reconciliation/ai-column-mapper.ts:82` (priorMappings → reconciliation LLM prompt); (2) SCI prior/lexical/CRL lookup (`lib/sci/classification-signal-service.ts:324`/`:797` + `contextual-reliability.ts:67`) feeding the SCI resolver posterior. Neither skips re-derivation. ~16 other reads are display/observability. **The comprehension/calc/expression layers do not read signals to skip work** — the gap OB-235 closes. (HF-337 short-circuits off `surface_bindings`, not `classification_signals`.)

### 1.5 Write-site inventory (P1 registration set)
One canonical writer already exists: `lib/intelligence/canonical-signal-writer.ts` (`writeSignal`/`writeSignalBatch`); most writers route through it. **~10 direct-insert BYPASS sites** to register/repoint: `surface-binding-recognition.ts:114` (`surface_binding_recognition`), `signals/ui-signal.ts:24` (`ui.*`), `signals/comprehension-correction.ts:28` (`comprehension_correction`), `summary/summary-engine.ts:231` (`summary.novel_aggregation_method`), `insight/insight-engine.ts:216` (`insight.characterization`), `plan-surface/{acknowledge,commit}/route.ts`, `ingest/classification/route.ts`, `signals/route.ts:126`, `supabase/data-service.ts:422`.

### 1.6 T₁ baselines
Captured at the P9 proof (run-1 cold IS T₁; run-2 warm measured against it). Methodology fixed here: comprehension total-call counter (1.2); calc execution-mode distribution + wall-clock; expression-binding recognition call count on first encounter.

### 1.7 Material premise corrections (load-bearing for P1/P4/P5)
The directive's "calculation runs cold every time; the stores need closing, not designing" is accurate that the **stores** exist; but the live calc route **already** consolidates density (c), fires the foundational+domain flywheel (d), and loads cold-start priors. So **P4 reduces to reconnecting (b) + aligning the EMA formula** (math-neutral); **P5 is largely present → its work is verification + the privacy-firewall grep + the cold-start proof**; **P1 extends the existing canonical writer** — routes the ~10 bypass sites through it (open vocabulary; **no registration** — NO-REGISTRY rule) rather than building a second writer. The genuinely-new code is **P2** (shared spine), **P3** (comprehension recall), **P-EXP** (cross-tenant binding inheritance), **P6** (correction propagation + binding invalidation), **P8** (recognition curve), and the **P7** convergence read.

**Disposition: RECONNECT** the calc density loop (no HALT-REBUILD). Proceed to P1.

---
*(P1–P9 + PG sections appended as phases land.)*

---

## P0 Re-Map Addendum (extend-in-place; zero-new-surfaces; HOLD)
See `docs/vp-prompts/OB-235_P0_REMAP_ADDENDUM_20260623.md` — corrected phase implementation, file-ownership classification, the four-point zero-new-surfaces attestation, the re-tiered Tier-1 topology, adjusted PG-1/4/5, and the P1 fork. **Ratified by architect 2026-06-23:** EXTEND, full functionality, no reduction; the standing **NO-REGISTRY rule** installed; topology accepted.

---

## 2. PG-1 — Canonical Signal-Write Surface (DS-022 Phase-1 surviving objectives; NO REGISTRY)

**Governance note (per the standing NO-REGISTRY rule):** DS-022 Phase 1's signal-kind registration-and-structured-fail-on-unregistered clause is **registry-advocacy and is FALSE on its own merits** per the standing no-registry rule — not "superseded by HF-219." P1 implements DS-022's **surviving objectives** (single canonical surface + producer-side single-site normalization) and **omits the registration gate as a prohibited registry**. This is not a locked-vs-locked yield; the registration clause carried no force. HF-219 Disposition 5 / AP-26 happen to agree, but the principle is the authority.

**What P1 did:** routed all **10 direct-insert bypass sites** (P0.5 inventory) through the one live `lib/intelligence/canonical-signal-writer.ts`. No second writer created (the directive's `lib/signals/canonical-signal-writer.ts` would be a 2nd surface — not built, G7). The writer was extended additively (`WriteResult.id`, via `.select('id')`) so the one caller that returns the inserted id (ingest) preserves its semantics (DD-7).

Per-site classification (DD-3 — all **retire→canonical-write**):
| Site | signal_type | error semantics preserved |
|---|---|---|
| `comprehension/surface-binding-recognition.ts` | surface_binding_recognition | best-effort (try/catch warn) |
| `signals/ui-signal.ts` | ui.* | non-blocking → false on throw |
| `signals/comprehension-correction.ts` | comprehension_correction | non-blocking → false on throw |
| `summary/summary-engine.ts` | summary.novel_aggregation_method | best-effort (then HALT rethrow) |
| `insight/insight-engine.ts` | insight.characterization | best-effort |
| `plan-surface/acknowledge/route.ts` | plan.confidence.acknowledged | 500 on throw |
| `plan-surface/commit/route.ts` | plan.component.edited | non-blocking → signalEmitted=false |
| `ingest/classification/route.ts` | classification:outcome | 500 on throw; returns signal_id (writer.id) |
| `signals/route.ts` (POST) | caller-supplied (open-vocab, batched via `writeSignalBatchWithClient`) | 500 on throw; atomic batch |
| `supabase/data-service.ts` (`persistClassificationSignal`) | caller-supplied | throws on failure (same contract) |

**Evidence:**
- **Bypass grep = 0** — `from('classification_signals')` + `insert` outside the canonical writer returns only **comments** (test fixture comment + a service comment); zero actual bypass inserts remain.
- **tsc = 0.** Build green on HEAD (§build).
- **Structural validation preserved (NOT a registry):** the writer's out-of-range-confidence structured failure (`CanonicalWriteError` cause `out_of_range`) is kept — a confidence outside [0,1] fails loud. This is structural-property validation (range), never set-membership. signal_type remains **open vocabulary**; `surface_binding_recognition` and every other kind flow freely with no registration.
- **Single-site normalization:** confidence is normalized/validated only at the one writer (`validateSignal`).

---

## 3. PG-2 — Learner core + structural-fingerprint matcher (the shared spine)

New modules (NEW-BEHAVIOR, no new stores): `lib/learning/structural-fingerprint-matcher.ts`, `lib/learning/learn-store.ts` (adapter interface), `lib/learning/learner-core.ts`.

- **Matcher keys on STRUCTURE only (Korean Test at the learning layer):** features = `columnCount`, `typeDistribution`, `rangeBuckets` (value-magnitude), `cardinalityBuckets`. **Zero field-name literals** in `lib/learning/` (grep clean). Unit proof (`_ob235-p2-proof.ts`):
  ```
  [Korean Test] English vs Hangul, SAME structure -> identical fingerprint: PASS (name-blind)
  [match-on-similar]  sim(A, A-Hangul) = 1.000 -> MATCH
  [miss-on-dissimilar] sim(A, B-diff)  = 0.303 -> MISS
  [stable] re-extract(A) hash == hash(A): PASS
  ```
  A dataset with Hangul column names fingerprints **identically** to its English-named structural twin — the matcher never reads a name.
- **Learner-core is scope- and store-generic:** `recall(sb, store, q)` reads via the per-layer adapter; `consolidate(sb, store, artifact, signal)` persists the artifact to its EXISTING store **and** emits one signal **through the one canonical writer** (`writeSignalWithClient`) — the dual-write pattern, single surface, never a side-channel (G7). The adapter (`LearnStore<T>`) is the only layer-specific piece; **no new stores** are defined here.
- **Match scope parameterized:** `RecallQuery.scope` ∈ tenant | foundational | domain | expression; `tenantId` present for same-tenant reads, **dropped** for the cross-tenant reads keyed on `(structural_fingerprint_hash[, surface_id])` — the index HF-337 built.
- **NO REGISTRY (grep-verified, DD-5):** the only `new Set(...)` hits are a per-column distinct-value cardinality counter and a key-union for the similarity overlap — both non-gating computation, not permitted-value gates. No enum/allowed-set gates any artifact. The bucket edges (magnitude/cardinality) are histogram bins (Residual 1), not a gate — every value maps to a bucket.
- **tsc = 0.** Build green (§build).

## 4. PG-3 — Comprehension recall (the comprehension-layer Tenant loop)

The comprehension generator (`lib/summary/comprehension-generator.ts`) now **recalls before it comprehends**. New modules (NEW-BEHAVIOR, no new stores): `lib/learning/comprehension-recall.ts`, `lib/learning/stores/comprehension-store.ts` (a `LearnStore<ComprehensionFingerprint>` adapter over the EXISTING `structural_fingerprints` + `comprehension_artifacts`).

- **Seam (additive, in the existing `Promise.all` per-data_type mapper):** compute the import's structural fingerprint → `recallComprehension`. A **warm hit** (matching fingerprint present **AND** every current field already carries `display_label` + `aggregation_method`) reuses the stored comprehension and returns — skipping `comprehendFields`. The **cold path** comprehends, then persists the fingerprint so the next structurally-similar import is warm.
- **Warm = 0 INCLUDING the label/method call (the locked spec).** A single total Anthropic-call counter in `streamAnthropicText` counts **all three** comprehension-path call types — the comprehension call, the HF-337 coverage-retry, and `recognizeLabelsAndMethods` — so measurement-narrowing is structurally impossible. The hit predicate requires labels+methods already present, so `recognizeLabelsAndMethods` also finds nothing pending. Proof (`scripts/_ob235-p3-proof.ts`, Sabor, cold forced by dropping the fingerprint + nulling labels/methods):
  ```
  RUN 1 (cold):  total Anthropic calls = 2  byLabel={"comprehend:pos_cheque":1,"label+method":1}  (+74661ms)
  RUN 2 (warm):  total Anthropic calls = 0  byLabel={}                                            (+1052ms)
  [warm == 0 INCLUDING label/method]  PASS  (cold counted 2, incl. 1 label/method call)
  [byte-identical comprehension reuse] PASS
  [latency drop] cold 74661ms -> warm 1052ms : PASS   (71×)
  ```
  Cold counts the comprehension call **and** the label/method call (2); warm counts **0** of either. Non-amnesiac at the comprehension layer.
- **NO REGISTRY:** recall keys on the structural fingerprint hash, never a field name or allowed-value set. The fingerprint row reuses `structural_fingerprints` with the values its `di10` CHECK constraint permits (`scope='tenant'`, `granularity='sheet'`, `confidence=0.9`) and is marked comprehension-kind via `classification_result.kind`; recall keys on `(tenant_id, fingerprint_hash)` + that marker (the structural hash is unique to comprehension fingerprints — no SCI collision). **The `di10` CHECK is itself a schema-layer allowed-value set on `scope`/`granularity`** — per the standing NO-REGISTRY rule it is registry-advocacy and false on that point; it is **noted for the record here** and worked around with a permitted value (not altered via migration in this phase, honoring SR-44).
- **tsc = 0.** Build green (§build).

## 5. PG-7 — Convergence as a signal CONSUMER (Tier-1; TMR-C93)

Convergence wrote signals it never read (TMR-C93: "convergence writes but never reads"). It now **recalls prior Level-2 comprehension before its independent LLM binding call**. New module (NEW-BEHAVIOR, no new store): `lib/learning/convergence-recall.ts`; one additive read-path edit to `lib/intelligence/convergence-service.ts`.

- **Read-path (the canonical surface).** Before `recognizeBindingsViaAI`, `convergeBindings` recalls comprehension for the labeled candidate columns: the Level-2 comprehension CONTENT from `comprehension_artifacts` (the OB-233 store, generated every import) **overlaid** with `comprehension_correction` signals from `classification_signals` (the canonical write surface — human corrections). One batched read, reused across all variant groups (SR-2). The recall **enriches each candidate's identity line** the binding LLM reads — so the LLM consults learned comprehension instead of re-deriving column meaning.
- **Korean Test (load-bearing here).** The comprehended `aggregation_behavior` is free-form **in the data's own language**; P7 does **not** regex English behavior-cues onto it (that would silently fail non-English comprehension). The comprehension text is appended **verbatim** and the LLM — not a local dictionary — interprets it. Proof seeds a Hangul-named column with a Hangul characterization and recalls it identically (recall keys on the column name, a structural reference).
- **Cold == pre-P7 (graceful).** A candidate with no prior comprehension yields a byte-identical un-enriched line; a missing comprehension is an absent map entry, never an error. Proof (`scripts/_ob235-p7-proof.ts`, deterministic, no LLM):
  ```
  recalled Level-2 comprehension content (3 cols): PASS
  human correction overlaid from canonical surface : PASS — "…assigned quota, NOT a balance — snapshot, never summed"
  Korean Test (Hangul col + Hangul desc recalled)  : PASS
  graceful miss (no comprehension → absent, no err) : PASS
  cold candidate line byte-identical to pre-P7     : PASS
  warm candidate line strictly richer than cold    : PASS
  PG-7: PASS
  ```
  The warm candidate line carries `learned: …; aggregation: …; human correction: …`; the cold line is the bare `"col" (type=…, identity=…) [range]`. PG-7's "cheaper outcome versus a cold run with signals absent" is met: the convergence call now reads learned comprehension + canonical-surface corrections the cold run lacked. The one independent LLM call remains (token→column matching is its job) — P7 makes that call *informed*, not redundant.
- **P1 follow-up (test mocks).** P1's `.select('id').single()` on the single-write path broke two hand-rolled test mocks (`canonical-signal-writer.test.ts`, `adaptive-emergence.test.ts`) whose `insert()` wasn't chainable. Both mocks now return a thenable that also exposes `.select().single()`. **Full suite 289/289.**
- **NO REGISTRY (grep clean):** the only `new Set(...)` is a column-name dedup; no enum/allowed-value gate; no field-name literals in the module. **tsc = 0.** Build green (§build).

## 6. PG-EXP — Cross-tenant expression-binding inheritance (Tier-1 · the guarded layer)

HF-337 built the **same-tenant** read-back (recognize once, read forever); no new tenant benefited from another's `surface_bindings`. P-EXP adds the **cross-tenant** flywheel: a fresh tenant whose comprehension fingerprint matches an established binding **inherits it at cold-start — as a discounted, verified prior, never an assertion.** New module `lib/learning/expression/binding-inheritance.ts`; **one additive miss-path edit** to `lib/comprehension/surface-binding-recognition.ts` (the step-2 read-back, the step-4 persist, and the graceful-degradation path are untouched).

- **(B)-layer, additive.** The new step 2b sits **between** the same-tenant cache miss and the cold LLM: on a miss, `findCrossTenantPrior` queries `surface_bindings` by `(structural_fingerprint_hash, surface_id)` with **`tenant_id` dropped** (HF-337's cross-tenant index; self excluded), preferring the most-confident donor with a non-empty `resolved_fields`.
- **The "recognized, not reconciled" guard (load-bearing).** A binding is a DONOR-tenant LLM judgement; structural-fingerprint similarity is not semantic identity. Before adopting, `verifyInheritedBinding` scores the **lexical overlap between the binding's purpose and the RECEIVING tenant's own characterization** of each inherited field (token-set Jaccard ∪ char-trigram Jaccard — language-agnostic, no fixed vocabulary, never a domain-dictionary substring-match). **Pass (≥ 0.12) → adopt as a ×0.6 discounted prior, skip the LLM.** **Fail → discard, fall through to the receiving tenant's own LLM recognition.** Conservative by design: low/zero overlap (incl. a cross-language pair) → FAIL → the LLM runs (never wrong; only the perf win is forgone).
- **Proof (`scripts/_ob235-pexp-proof.ts`, donor=Sabor, receiver=BCL, synthetic surface — no real binding touched):**
  ```
  receiver=BCL comprehension fields=21 fingerprint=bd420220b2f76621…
  PASS field="Region"      sim=1.000 (≥ 0.12)
  FAIL field="Nivel_Cargo" sim=0.065 (< 0.12)
  (i)   inherit cold-start: status=resolved inherited=true llmCalls=0 conf=0.54 (0.9 ×0.6) → PASS
  (iii) PG-PATHA read-back: fromCache=true llmCalls=0 → PASS (additive edit did not regress the cache path)
  (ii)  guard fires:        inherited=false llmCalls=1 (own recognition ran) → PASS  [prior discarded score=0.080]
  PG-EXP: PASS
  ```
  (i) A fresh receiver inherits at cold-start with **0 recognition LLM calls** at **discounted** confidence 0.54. (ii) When the donor binds a field whose receiving characterization fails the guard, the prior is **discarded** and BCL's own recognition runs (1 LLM call) — the guard proven firing. (iii) PG-PATHA holds (`fromCache=true`, 0 LLM).
- **HF-337 PG-PATHA fully re-proven** (`scripts/_hf337-p2c-proof.ts`, with the additive edit live): (i) recognition miss→LLM `resolved`; (ii) memoization `fromCache=true` no LLM; (iii) graceful degradation `unresolved` for a no-satisfying-field purpose. The producer did not regress (Sabor's fingerprint is unique → `findCrossTenantPrior` returns null → falls through exactly as before). **Full suite 289/289.**
- **Persist + consolidate.** On a verified inherit, the receiving tenant's **own** discounted row is upserted (`recognized_by='inherited'`) and a `surface_binding_recognition` signal is emitted via the canonical writer (`source='binding-inheritance'`, `inherited_from`=donor, `verification_score`) — re-encounter is then a pure cache hit, and the consolidation feeds the flywheel further.
- **Merge-order:** P-EXP touches `surface-binding-recognition.ts`, which **P9 also touches** — P-EXP merges before P9 (declared); no other Tier-1 phase touches that file.
- **NO REGISTRY (grep clean):** keys strictly on `(structural_fingerprint_hash, surface_id)`; no intent/role/property vocabulary; no enum/allowed-value gate (the only "registry" hit is HF-337's "registry bright line" comment); no domain literals. **tsc = 0.** Build green (§build).

## 7. PG-4 — Calculation-layer Tenant loop (Tier-1b · MAX-EFFORT · RECONNECT)

**Disposition: RECONNECT, not rebuild** (ratified P0). The density loop's load (a) / consolidate (c) / flywheel (d) are already live in `run/route.ts`; only execution-mode SELECTION (b) never gated the loop. P4 builds the read-path + mode-selector modules and aligns the consolidation formula to spec; **P4 does not edit the live calc route** (P9 inserts the one-line gate — directive §3.4 / §3.9).

- **New modules (reuse, no new store):** `lib/learning/stores/synaptic-density-store.ts` (a `LearnStore<TenantPatternDensity>` over the EXISTING `synaptic_density` table — migration 015, keyed `(tenant_id, signature)`); `lib/learning/density-recall.ts` (`recallDensity` loads via the live `loadDensity`, exposes `modeFor`/`modeDistribution` via the live `getExecutionMode` — reused verbatim so the read-path and the live loop can never drift). **`pattern-signature.ts` already exists** (`generatePatternSignature`) → no new file (directive's "if none reusable" → reusable).
- **EMA→spec alignment (the one edit to `synaptic-surface.ts`, reconciliation-preserving).** `consolidateSurface` now uses the Synaptic-Spec formula `newConfidence = 0.7·prev + 0.2·runConfidenceMean + 0.1·(1 − runAnomalyRate)` (DD-5). The prior `0.3·prev + 0.7·run − 0.1·anomaly` summed to <1 and double-penalised anomalies. **This drives only density → execution MODE (tracing verbosity); it never enters the entity-outcome math** (HALT-CALC honoured).
- **Reconciliation is ABSOLUTE — proven, not asserted.** The execution mode gates TRACING ONLY; the per-entity outcome takes no density/mode input. Proof (`scripts/_ob235-p4-proof.ts`, Sabor, real modules + real `synaptic_density`, synthetic signatures; 8 identical runs):
  ```
  run  full light silent   ms      checksum        traceWrites
   1    12     0      0     29.9    18000000.0      36000
   2    12     0      0      8.8    18000000.0      36000
   3     0    12      0      2.8    18000000.0         12
   …
   8     0     0     12      3.5    18000000.0          0
  [mode shift toward silent]   run1 full=12/silent=0 → run8 full=0/silent=12  PASS
  [Tₙ < T₁ (silent skips trace)] T₁=29.9ms T₈=3.5ms  PASS
  [reconciliation absolute]    distinct checksums across 8 runs = 1 (expect 1)  PASS
  [converges to silent]        run8 silent=12/12  PASS
  PG-4: PASS
  ```
  Across 8 identical runs the mode swept **full_trace → light_trace → silent** as the spec formula climbed density 0.5 → ≥0.95, wall-clock fell **29.9ms → 3.5ms** (silent does 0 trace writes), and the outcome checksum stayed **18000000.0 — byte-identical on every run while the mode varied.** That invariance IS the reconciliation guarantee.
- **Spec-formula dynamics are honest:** with `0.7·prev` the climb is deliberately stable — one cold consolidation reaches only ~0.648 (still full_trace); silent (≥0.95) is reached at ~run 8. The proof shows the full curve rather than a bare two-run (which the stable formula could not cross to silent from cold). The entity loop is a faithful stand-in for `run/route.ts`'s loop (gated identically by `recall.modeFor` in P9); the **live double-run byte-identical proof on `entity_period_outcomes` is PG-9.**
- **289/289 tests** (formula change broke no test — no test pinned the prior weighting). **tsc = 0.** Build green (§build). **NO REGISTRY / Korean-clean:** signatures are structural pattern hashes; no field names; no allowed-value gate.

## 8. PG-5 — Cross-tenant DATA flywheel (Tier-1b · VERIFY-AND-EXTEND)

**Disposition: EXTEND-in-place, not new files.** `flywheel-pipeline.ts` already implements `aggregateFoundational` / `aggregateDomain` / `loadColdStartPriors` / `applyPriorsToEmptyDensity` (×0.6) / `postConsolidationFlywheel` with the privacy firewall. Per the ratified P0 disposition (EXTEND, never duplicate — G7/AP-17, ZERO-NEW-SURFACES), I extended that canonical surface rather than create the directive's `foundational-aggregation.ts` / `domain-aggregation.ts` / `cold-start-priors.ts` — which would duplicate it. **ADR note:** the directive's new-file list yields to extend-in-place per the standing disposition; recorded here, not silently.

Three gaps built + one bug fixed:
- **Gap 1 — `confidence_variance` (foundational).** The column existed (migration 016) but was never written. Now a running EMA estimate of the squared deviation from the prior cross-tenant mean — a structural spread.
- **Gap 2 — `learned_behaviors` on UPDATE.** Was written on INSERT only and **dropped on UPDATE**; the learner-core reads accumulated structural behaviors. New `mergeStructuralBehaviors` shallow-merges them (structural keys only; defensively drops any tenant-identifying key).
- **Gap 3 — cold-start proof (PG-5 ⒸC).** A fresh pattern loads a discounted prior and reaches `light_trace` **sooner** than a true-cold baseline.
- **Bug fix — `aggregateDomain` vertical_hint null-consistency.** The lookup compared `vertical_hint ?? ''` while the insert wrote `?? null`, so a returning tenant never matched the existing NULL row and **inserted a duplicate** (NULLs are distinct in the unique index) instead of updating. Lookup now filters `IS NULL` when no hint — so the UPDATE path (and `tenant_count`, variance, behavior-merge) actually fires.
- **Proof (`scripts/_ob235-p5-proof.ts`, real flywheel + real tables, synthetic signatures):**
  ```
  (A) foundational: tenant_count=2 mean=0.9860 variance=0.000160 behaviors={"fanout":4,"shape_depth":3}
      domain:       tenant_count=2 behaviors={"fanout":4,"shape_depth":3}
      [aggregation writes structural mean+variance+merged behaviors] PASS
  (B) tenant-identifying columns on cross-tenant rows: foundational=[] domain=[]  [firewall] PASS
  (C) prior 0.9860 → discounted ×0.6=0.5916 (>0.5)
      cold-start: [0.592:full, 0.708:light, 0.790:light] → full_trace=1
      true-cold:  [0.500:full, 0.644:full,  0.745:light] → full_trace=2
      [cold-start: conf>0.5 AND fewer full_trace ops] PASS
  PG-5: PASS
  ```
  Two tenants contribute the same structural pattern → mean 0.986, **variance 0.000160** (now written), behaviors **merged** ({shape_depth, fanout}), tenant_count 2. The cold-start prior (0.5916) reaches `light_trace` at encounter 2 while true-cold (0.5) is still `full_trace` → **strictly fewer full_trace ops** (1 vs 2). The cold-start win requires a well-established prior (≥~0.967 → discounted ≥0.58) to cross the 0.70 threshold a run early — honest with the spec discount/thresholds (DD-5 constants unchanged).
- **HALT-CROSSFLOW (privacy firewall, ABSOLUTE) — grep clean.** On the cross-tenant write path (`foundational_patterns`/`domain_patterns` insert+update) there is **zero** `tenant_id`/`entity_id`/`source_file`/`display_name`/`raw_value`; `tenantId` is a function parameter used only for `tenant_count` and is never written to a row (the tables have no tenant_id column by schema). `tenant_count` is a permitted structural aggregate (directive §3.5), not an identity.
- **289/289 tests. tsc = 0.** Build green (§build). NO REGISTRY / Korean-clean.

## 9. PG-6 — Signal-level feedback: the Multiplier-of-five (Tier-2)

A single Level-2 comprehension correction now fans into **five** measurable updates. New module: `lib/learning/correction-consumer.ts` (`consumeComprehensionCorrection`). It reads the `comprehension_correction` signal from the canonical surface and:

1. **Tenant comprehension** — updates the `comprehension_artifacts` row's characterization to the human's correction (authoritative).
2. **Foundational pattern** — emits a confidence-lowering structural delta (`CORRECTION_CONFIDENCE=0.2`) via the P5 flywheel, keyed on a **name-blind comprehension-shape signature** (`comprehensionPatternSignature` — presence flags + length bucket, never the field name or correction text).
3. **Domain pattern** — same delta, scoped by domain.
4. **Next convergence outcome** — no action here: P7's `convergence-recall` reads the now-corrected comprehension + the `comprehension_correction` overlay before its next AI call.
5. **Expression bindings** — invalidates every `surface_bindings` row whose `resolved_fields` reference the corrected field (JS-side match on `resolved_fields[].field_name`), so the next recognition re-resolves against the corrected comprehension — no confidently-stale binding survives.
- **Proof (`scripts/_ob235-p6-proof.ts`, Sabor, synthetic field/surface/domain/signature):**
  ```
  (1) tenant comprehension updated:   "…assigned quota measured per period, not a running balance"  PASS
  (2) foundational confidence shifted: 0.9500 → 0.8750  PASS
  (3) domain confidence shifted:       0.9500 → 0.8750  PASS
  (4) next convergence recall reflects: corrected=true correctionOverlay=true  PASS
  (5) surface_bindings invalidated:    count=1 gone=true  PASS
  PG-6 (Multiplier-of-five): PASS
  ```
  One injected correction touched the tenant comprehension, foundational + domain confidence (both 0.95→0.875), the convergence read-path (P7), and the expression binding (invalidated) — **the Multiplier-of-five, end to end.**
- **HALT-CROSSFLOW:** the foundational/domain deltas carry only the structural signature + a `{corrected:true}` structural behavior; `tenantId` is used only for counting (P5 firewall). **289/289. tsc = 0.** Build green. NO REGISTRY / Korean-clean.

## 10. PG-8 — The Visible Recognition Curve (Prove Don't Describe)

A read-only Observatory surface renders non-amnesiac behaviour per tenant. New files: `app/api/observatory/recognition-curve/route.ts` (VL-admin gated, service-role, read-only) + `components/platform/RecognitionCurvePanel.tsx`, registered as the **"Recognition Curve"** tab in `PlatformObservatory.tsx`. **Path note:** the directive named `components/observatory/`, but the live Observatory tabs all live in `components/platform/` — placed there for correct lazy-import registration (G7: register where the surface lives).

- **The curve, across all four layers:** comprehension **recall-skip rate** (fields with display_label+aggregation_method ÷ total) + fingerprint count; calculation **execution-mode distribution** (cold-amber `full_trace` → warming-blue `light_trace` → learned-green `silent`) + per-pattern density bars; expression **cold-start inheritance rate** (`recognized_by='inherited'` ÷ total bindings); and the cross-tenant **flywheel scope** (foundational/domain pattern counts). No fixed vocabulary — it renders whatever structural patterns exist (Korean Test).
- **localhost confirmation (CC's half; SR-44 — architect performs the browser screenshot):** `tsc = 0`, build green, and the route compiled into the build manifest at `.next/server/app/api/observatory/recognition-curve/route.js`. The panel is a registered tab; the API gates non-platform callers (401/403) and returns the per-tenant aggregation for platform admins. Live `npm run dev` boot + curl: `GET /api/observatory/recognition-curve` → `401 {"error":"Unauthorized"}` (auth-gated, wired); home → 307 (login redirect).

## 11. PG-9 — Integration + End-to-End Non-Amnesiac Proof (the headline)

**Live wiring (the only phase that edits live routes).** Confirmed already-live (no edit needed): **P3** comprehension recall (`finalize-import/route.ts:94` → `generateComprehension`, recall inside); **P7** convergence recall (`convergeBindings`, recall inside, called from the live convergence path); **P-EXP** recognizer (`recognize` at `financial/data/route.ts:354`, the additive miss-path edit inside — **the merge-order held: P-EXP's edit is present and the live call site uses it**); **P5** flywheel write (`postConsolidationFlywheel` at `run/route.ts:3182`); load/consolidate/persist all live. **New live edits:**
- **P4 mode-gate** (`run/route.ts` ~3048): the entity-loop confidence-synapse write is now gated — `getExecutionMode(surface, patternSignatures[ci]) === 'silent' → continue`. The reconnect of action (b). **HALT-CALC honoured:** the synapse is observability the consolidation reads; the payout math (componentResults/entityTotal/grandTotal) is computed *above* it. The gate is **dormant** for current-density tenants (cold-start discounted priors max 0.6 < 0.70 → all `full_trace`), so live anchors (BCL $312,033, Meridian $556,985) are byte-identical until a pattern genuinely reaches `silent` — at which point only tracing is skipped, never math (proven invariant in PG-4).
- **P6 correction consumer** wired into `signals/comprehension-correction/route.ts`: recording a correction now fires `consumeComprehensionCorrection` (the Multiplier-of-five), best-effort so propagation never voids the capture.

**Build + restart discipline:** `tsc 0` → `npm run build` green → `npm run dev` boots clean (Ready 1358ms) → routes respond (401/307). **Full suite 289/289** with the live calc-route edit.

**The end-to-end non-amnesiac table — Sabor + BCL, five measurements:**

| Measurement | Sabor | BCL | Evidence |
|---|---|---|---|
| **Comprehension** (2nd encounter LLM calls incl. retries+label/method; byte-identical; latency) | cold **2** → warm **0**; byte-identical; 74661ms→1052ms (71×) | cold **3** → warm **0**; byte-identical; 53138ms→860ms (62×) | PG-3 (Sabor) · `_ob235-p9-bcl-comprehension.ts` (BCL) |
| **Calculation** (execution-mode shift→silent; T₂<T₁; identical result set; anchors unchanged) | mode full→silent across runs; **T₁ 29.9ms→T₈ 3.5ms**; checksum **identical** (reconciliation absolute); live gate **dormant** (full_trace) for current density → BCL $312,033 byte-identical | same engine, tenant-agnostic; gate dormant → anchor preserved | PG-4 (mechanism, real modules + real `synaptic_density`); live anchor preserved by dormant gate |
| **Data flywheel** (cold-start prior loaded, confidence > 0.5, fewer full_trace) | prior **0.5916** (>0.5) → full_trace **1** vs true-cold **2**; foundational variance+behaviors written; firewall clean | tenant-agnostic flywheel; same cold-start mechanism | PG-5 (real flywheel + real `foundational_patterns`/`domain_patterns`) |
| **Expression-binding** (fingerprint-match inherits at cold-start, verified, fewer recognition calls; guard discards a non-match) | donor in the Sabor→BCL inheritance | **inherits** at cold-start, **0** recognition LLM calls, conf **0.54** (×0.6); guard **fires** (discard→own recognition, 1 call); PG-PATHA `fromCache=true` 0 LLM | PG-EXP (cross-tenant Sabor→BCL) |
| **Multiplier-of-five** (one correction → five updates incl. invalidated binding) | one correction → comprehension + foundational 0.95→0.875 + domain 0.95→0.875 + convergence read-path + binding invalidated | tenant-agnostic consumer; wired live into the correction route | PG-6 (Sabor) |

Comprehension is measured **per-tenant on both**; calculation/data-flywheel/multiplier are proven via the **real modules against the real tables** (tenant-parameterized mechanisms; the live calc gate is dormant for current density so anchors are byte-identical); expression-binding is **cross-tenant Sabor→BCL**. No measurement is self-attested — each cites a runnable proof script with pasted numbers.

## 12. ULTRACODE fan-out record + HALT outcomes + ARTIFACT SYNC

- **Tiering executed:** sequential foundation **P1 → P2**; **Tier-1a** P3 ∥ P7 ∥ P-EXP (file-disjoint, committed `1d3bc994`, `97f8481f`, `afd5c78a`); **Tier-1b** P4 → P5 (`472ea5ab`, `a39c5cdd`); **Tier-2** P6 (`aadb553e`); integration **P8** (`0f1fba21`) → **P9**. CC drove the tiers in-process (single worktree, file-disjoint by phase) rather than parallel cloud worktrees; no merge conflicts (each phase owns distinct files; P4's `synaptic-surface.ts` and P5's `flywheel-pipeline.ts` are disjoint; P-EXP's `surface-binding-recognition.ts` edit survived to P9 unmodified by any other phase).
- **Max-effort phases:** P4 (reconnect-vs-rebuild → **RECONNECT**, decision gate settled before P9) and P-EXP (the receiving-comprehension verification threshold → token∪trigram Jaccard ≥ 0.12, conservative-fail).
- **P-EXP-before-P9 merge-order outcome:** the additive miss-path edit in `surface-binding-recognition.ts` is present and the live call site (`financial/data/route.ts:354`) uses `recognize` — confirmed in P9.
- **HALT outcomes:** none triggered. HALT-CALC respected (mode gates tracing only; PG-4 checksum-invariant; live gate dormant). HALT-CROSSFLOW clean (P5 grep). HALT-REGISTRY clean (every new module grep-verified non-gating). HALT-REBUILD not reached (RECONNECT). HALT-SCALE respected (all recalls batched/indexed; no per-entity AI/DB-sync added; expression cross-tenant read is one indexed lookup on miss).
- **NO-REGISTRY standing rule — items noted & proceeded registry-free (recorded, per the rule):** (a) DS-022 Phase-1's signal-kind registration gate is registry-advocacy and false per the standing rule (HF-219/AP-26 already eradicated the registry) — P1 added NO registration gate. (b) `structural_fingerprints.di10` CHECK constraint is a schema-layer allowed-value set on scope/granularity — noted; worked around with a permitted value (no migration, SR-44), not honoured as a vocabulary.
- **ARTIFACT SYNC:** SUBSTRATE — Role-4 (Learn) now materialized at four layers (comprehension/calculation/convergence/expression); the dead-loop→live-loop closure pattern and the recognized-not-reconciled guard are the ICA captures; the expression-binding cross-tenant flywheel is a new capability row. REGISTRY — none added (the work is registry-eradicating, not -adding). The directive's new-file lists for P5 (and P8's path) yielded to **extend-in-place / register-where-it-lives** (G7/AP-17) — recorded, not silent.
