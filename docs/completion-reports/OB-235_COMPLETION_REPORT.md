# OB-235 (R2.1) — The Learning Loop — Completion Report

**Directive:** `docs/vp-prompts/OB-235_DIRECTIVE_R2.1_20260623.md` · **Branch:** `ob-235-learning-loop` (from main @ `57d9148d`, #593 merged).
**Status:** P0 COMPLETE (state verification + HF-337 re-sync + disposition). Sequential foundation (P1, P2) → Tier-1 fan-out → Tier-2 → integration to follow.

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
