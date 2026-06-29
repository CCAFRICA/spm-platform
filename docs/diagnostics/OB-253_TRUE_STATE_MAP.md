# OB-253 — True-State Map (Phase 1, PG-1)

**The built state of the Thalamus/PRISM layer, verified against live `main` (branch `ob-253-thalamus-substrate` @ `7cb4efb7`).**
Date: 2026-06-28 · Method: 8-agent evidence workflow + CC first-hand live DB queries. Every claim is backed by pasted grep/code/query output. No "appears to" / "likely".

> **PG-1 verdict: PASS** — every section below states what IS with pasted evidence. **Architect reviews this map before Phase 2 begins.** Three HALT conditions and several already-met deliverables are surfaced for disposition in §HALT and §ALREADY-MET (end of this doc). Per the directive, CC does NOT pick a HALT-DIVERGE path silently and does NOT begin Phase 2 implementation before architect review.

---

## 3.1 — The Normalizer's actual position

**What IS:** The "Normalizer" is the OB-249 remediation agent (the **only** remediation agent — 1 of 1), `web/src/lib/remediation/agents/normalizer.ts` (`createNormalizer`). It is a **value-canonicalization** stage (collapses variant surface forms of one observed value to one observed canonical), NOT a comprehension/atom/fingerprint producer. Invoked ONLY from the SCI ingestion pipeline at two points — EXPRESS (process-job worker, propose-time, may call the LLM) and CONSTRUCT (commit-content-unit, deterministic, the `committed_data` gate); never from a dedicated UI action or standalone endpoint. It **does** post to `classification_signals` (`signal_type='remediation:normalization'`). It reads back **only its OWN** prior normalization signals (self-loop, filtered by `signal_type` + agent name); it does NOT read other agents' signals (there is exactly one), and it does NOT touch `structural_fingerprints`/`synaptic_density`.

```
// remediation-agents.ts:11-13  — exactly ONE remediation agent
export const REMEDIATION_AGENTS: ReadonlyArray<RemediationAgent> = [ createNormalizer() ];

// ENTRY 1 EXPRESS — process-job/route.ts:497  (propose-time, before commit)
const reports = await runRemediationPropose(supabase, { tenantId, rows, columns, allowedColumns, recall: dbRecall(supabase, tenantId) });
// ENTRY 2 CONSTRUCT — commit-content-unit.ts:562  (the committed_data writer/gate, deterministic)
const remediation = await runRemediationConstruct({ tenantId, rows, columns, allowedColumns, recall: dbRecall(...) });

// WRITE — remediation-signals.ts:79-100 → writeSignalWithClient → classification_signals (signalType SIGNAL_NORMALIZATION)
// READ (SELF-LOOP) — remediation-signals.ts:41-66 readPriorNormalizationSignals: .eq('signal_type', SIGNAL_NORMALIZATION) + ctx.agent === agentName

// ABSENCE PROOF — grep structural_fingerprints|synaptic_density|promoted_patterns web/src/lib/remediation/ → (none; only a stale comment)
```

**Drift from DS-031:** The Normalizer is beside the surface as a bolt-on remediation stage, reading a self-loop (its own prior normalization signals), not the cross-agent/comprehension surface. There is exactly one agent, so "reads other agents before producing output" is structurally N/A today. → **Deficit 1 CONFIRMED.** This is Phase 3 territory (re-found as joint recognition).

---

## 3.2 — The read-path's actual state (G11)

**What IS: the read-path is HALF-OPEN.** `structural_fingerprints` is **CLOSED** for ingestion: at run start the platform reads it to SET predictions two ways — (1) `lookupFingerprint()` assigns recognition Tier 1/2/3 (skip-LLM / targeted / full-LLM), wired live into the OB-251 async worker and the sync analyze route; (2) `lookupAtoms()` read-before-derive claims known atom roles without an LLM dispatch. `synaptic_density` is **OPEN** for ingestion: it is NEVER read at ingestion/classification start — its only run-start reads are in the CALCULATION and RECONCILIATION paths. `structural_fingerprints` does **not** feed agent scoring (agent priors read `synaptic_density`/foundational/domain/`classification_signals`, never `structural_fingerprints`).

```
// CLOSED — fingerprint-flywheel.ts:36-84 lookupFingerprint → Tier 1 exact match skips the LLM
//          wired: process-job/route.ts:188-205 (async worker, BEFORE classification; sheetTier gates LLM behaviour)
//          wired: analyze/route.ts:160 (sync path)
//          lookupAtoms — header-comprehension.ts:447-452 / atom-flywheel.ts:90-106 (read-before-derive)

// OPEN — grep loadDensity|loadPriorsForAgent web/src → ONLY calc/recon:
calculation/run/route.ts:1419 loadPriorsForAgent ; :1425 loadDensity
reconciliation/run/route.ts:100 loadPriorsForAgent ; :105 loadDensity
// NO import/sci/* route imports loadDensity or loadPriorsForAgent.
// synapticDensityStore.recall (OB-235 learn adapter) — grep synapticDensityStore web/src → definition only, ZERO call sites (inert)
// agent-memory.ts — grep structural_fingerprints → (no matches; not read by agent priors)
```

**Drift:** The fingerprint half of Phase 2's read-path is **already closed and live** (first-ever file → full LLM; repeat structure → Tier-1 skip). The gap is `synaptic_density`, which is purely a calc/recon surface and is never consulted to predict anything about INCOMING ingestion data; the OB-235 unify-adapter is inert. → **Deficit 2 PARTIAL** (fingerprints closed; density + agent-scoring open). **NB this materially reduces Phase 2 scope — see §ALREADY-MET and §HALT-DIVERGE.**

---

## 3.3 — The atom layer / `structural_fingerprints`

**What IS:** `structural_fingerprints` is one table holding two granularities (`sheet` + `atom`). The fingerprint **HASH is a perceptual act** — `computeFingerprintHashSync` (sheet) and `computeAtomFingerprint` (column/atom) hash ONLY raw structure (column names, type detection, cardinality/repeat/null/length buckets), with ZERO classification input, computed BEFORE the LLM, and the hash IS the gate that decides whether classification runs. **The persisted ROW is a byproduct of classification** — `writeFingerprint()` stores `classification_result` + `column_roles` only AFTER comprehension succeeds (`shouldReinforceUnit` gate). Atom rows are closer to perceptual (`atom_features` = buckets, `classification_result` = `{}` placeholder) but the WRITE is still gated by comprehension success. No `nanosignal` term exists anywhere.

```
// PERCEPTUAL HASH — atom-fingerprint.ts:1-8: "STRUCTURAL fingerprint over value distribution, type, cardinality,
//   repeat ratio, pattern flags ... the column NAME is display metadata only — never part of identity (DI-3)" (Korean Test)
// GATE ORDERING — process-job/route.ts:180-238: hash FIRST → lookupFingerprint tier → sheetsNeedingHC = filter(!tier1)
// BYPRODUCT WRITE — fingerprint-flywheel.ts:164-239 writeFingerprint stores classification_result+column_roles
//   call-site process-job/route.ts:395-430 fires AFTER content units classified (reads unit.classification/fieldBindings)
// ATOM WRITE gated by comprehension success — decomposed-comprehension.ts:146-151 (only pushes atoms when interp.data_nature resolved)
// grep nanosignal web/src → (zero matches)
```

**Drift:** Perception-before-classification exists as a GATE; perception-as-persisted-substrate (a row written purely on perception, independent of a classification outcome) does NOT — the row records classification outcomes keyed by perceptual hashes. → **Phase 2 3A.1 already met on ordering**; the "atoms written independent of commit/classification" nuance is a design point for §HALT-DIVERGE.

---

## 3.4 — The density execution modes

**What IS: the density modes are schema + observability/telemetry, NOT operational prediction-routing.** `synaptic_density.execution_mode` is consumed by exactly ONE control-flow branch in the whole codebase — `calculation/run/route.ts:3341` — and that branch only skips writing an in-memory **observability synapse** (never the math). Two facts pin the modes as effectively inert: (1) the stored `execution_mode` column is IGNORED on read — `getExecutionMode()` re-derives the mode from `confidence` every time; (2) NO code distinguishes `full_trace` from `light_trace` — the only branch anywhere is `=== 'silent'`. The SCI side has a SEPARATE density type (`full_analysis`/`light_analysis`/`confident`) read once for a display summary and branched ZERO times.

```
// ONLY behavioral branch — calculation/run/route.ts:3341: if (getExecutionMode(...) === 'silent') continue;  // skips a TRACE synapse, not math
// getExecutionMode re-derives from confidence (ignores stored column) — synaptic-surface.ts:124-134
// DENSITY_THRESHOLDS: SILENT_MIN 0.95, FULL_TRACE_MAX 0.70 — synaptic-types.ts:40-46
// grep "=== 'light_trace'|=== 'full_trace'" web/src → (none; only display counts at calculation/density/route.ts:46-48)
// SCI modes — grep "'confident'|'light_analysis'|'full_analysis'" | if/switch/case → (zero control-flow branches)
```

**Live data corroboration (CC query):** `synaptic_density` has **5 rows** total across all tenants (vs 2,849 `classification_signals`). The density layer is barely populated. **Drift:** `confidence ≥ 0.95` vs `< 0.70` produces NO difference in calculation output and NO difference in classification/processing behavior. → **Deficit 4 CONFIRMED + deepened**: Phase 4 (precision-weighting) builds on a near-inert, near-empty foundation; the "override density toward surfacing" must first make density *operational* for the surfacing decision (today the modes gate nothing operator-visible).

---

## 3.5 — `classification_signals` consumers

**What IS:** Written heavily (one canonical writer + many emitters), read in ~27 places — **almost all display/telemetry/flywheel-count**. The core payout calc path is **write-only** for this table. The computation-affecting reads are mostly **inert or dead**: SCI priors (`lookupPriorSignals` → `state.priorSignals`, which has ZERO readers post HF-341 R6); `convergence-recall.ts recallComprehensionForColumns` (reads `comprehension_correction` to overlay convergence) is **DEAD CODE — zero callers**; `computeClassificationDensity` feeds only `proposal.density` (display). Only TWO live reads actually change computed output, both OUTSIDE the core engine: (a) the OB-249 Normalizer recall (→ `committed_data` canonical values), (b) the reconciliation column-mapper (a separate benchmark subsystem).

```
// WRITE-ONLY in calc — calculation/run/route.ts:2778,3833 (writeSignal; grep .from('classification_signals').select in file = 0)
// INERT — analyze/route.ts:415 state.priorSignals.set(...); resolver.ts:124 priorSignals:[] default — never read (HF-341 R6 deleted the Bayesian scorer)
// DEAD — convergence-recall.ts:60 reads comprehension_correction; grep recallComprehensionForColumns|enrichCandidateIdentity callers → (empty)
// LIVE read #1 — remediation-stage.ts:94 → readPriorNormalizationSignals → committed_data canonical values
// LIVE read #2 — reconciliation/ai-column-mapper.ts:82 → getTrainingSignals('reconciliation') → reconciliation compare output
// data-service.getClassificationSignals — grep callers → (zero, unused)
```

**Drift:** The surface is written richly but its computation-affecting read loops are mostly inert/dead. The comprehension→convergence recall loop DS-031 envisions (`convergence-recall.ts`) is **fully written yet has zero callers**. → **Deficit 2 deepened** (the loop is dead code, not wired). Relevant to Phase 3 (joint recognition reads other facets) and to whether to revive vs rebuild these reads (§HALT-DIVERGE).

---

## 3.6 — Thalamus/PRISM topology vs `committed_data`

**What IS: comprehension happens ENTIRELY BEFORE the `committed_data` write, in a separate request/phase.** Two HTTP entry points: (A) `/api/import/sci/process-job` — parse → header comprehension (`writeAtoms` → `structural_fingerprints`) → fingerprint lookup → classify → `status='classified'` → `writeFingerprint` → `writeClassificationSignal` → remediation EXPRESS — **never touches `committed_data`**; (B) `/api/import/sci/execute-bulk` → `commitContentUnit` — the SOLE `committed_data` writer. The only comprehension-adjacent work during commit is the deterministic remediation CONSTRUCT (which RE-READS signals already written in phase A). Nothing writes atoms/fingerprints/signals AFTER the `committed_data` insert.

```
// SOLE committed_data writer — commit-content-unit.ts:665-667 .from('committed_data').insert(slice)  (via execute-bulk:1137)
// PHASE A order — process-job/route.ts: 243 runDecomposedComprehension(writeAtoms) → 287 fingerprint → 337 resolveClassification
//   → 382 status='classified' → 424 writeFingerprint → 444 writeClassificationSignal → 497 remediation EXPRESS → 517 return (NO commit)
// ABSENCE — grep writeFingerprint|writeClassificationSignal|writeAtoms|structural_fingerprints|classification_signals execute-bulk/route.ts → (none)
// signal writes are fire-and-forget — writeFingerprint(...).catch(()=>{}) (can be silently lost)
```

**Drift:** Minimal on ORDERING — comprehension already precedes commitment. → **Deficit 3 largely ALREADY MET on topology.** Notable: the "single surface" is split across `structural_fingerprints` / `classification_signals` / `synaptic_density` written by different paths; signal writes are best-effort (silent loss possible); two comprehension entry points (async `process-job` + sync `analyze`) write the same signals.

---

## 3.7 — Existing UI surfaces

**What IS: 8 ingestion/processing surfaces.** The PRISM membrane (`/data/submit`, `/data/in-progress`) reads ONLY `file_objects` (never the signal surface). `/data-operations/cleaned` (`RemediationReview`) reads `committed_data.metadata.remediation` (**post-commit** truth). **`/data/page.tsx` is 100% hardcoded mock data (fake — zero fetch).** `/operate` (`LifecycleCockpit`) + `/operate/calculate` read `committed_data`/calc tables. `/operate/import` (SCI) is the ingestion-comprehension surface (fires the flywheel, writes `processing_jobs`). The **ONLY** UI reading the DS-031 substrate (`synaptic_density`/`structural_fingerprints`/`comprehension_artifacts`) is the platform-admin Observatory **"Recognition Curve"** tab (`RecognitionCurvePanel` → `/api/observatory/recognition-curve`, VL-admin-gated, read-only counts). `classification_signals` surfaces only in the admin Observatory command-center + `operate/results` lifecycle:stream. **NO UI reads `promoted_patterns`.**

```
// membrane — useFileObjects.ts:36 GET /api/prism/files → file_objects ONLY (prism/files/route.ts:38-42)
// cleaned — remediation/review/route.ts:36-42 reads committed_data.metadata.remediation (post-commit)
// FAKE — data/page.tsx:33-39 "Mock data operations data" const dataMetrics={recordsToday:2290,...} (zero fetch)
// substrate read — recognition-curve/route.ts:41/51/58 reads synaptic_density, comprehension_artifacts, structural_fingerprints (admin-gated)
// ABSENCE — grep structural_fingerprints|synaptic_density|promoted_patterns in src/app + src/components *.tsx → (all empty; substrate read only server-side in the admin route)
```

**Drift:** No operator/tenant surface reads the pre-commit signal surface. The substrate is rendered only by an admin diagnostic panel; the tenant "Data Operations" page is fake mock. → **HALT-SURFACE for Phase 4** (3C.3 wants an operator-facing trust flag + acknowledgment in the Data Operations workspace; no such operator surface reads the signal surface, and §6 forbids new surfaces). See §HALT.

---

## FP-49 — Schema verification

**What IS (CC LIVE query, authoritative over the 2026-03-18 stale `SCHEMA_REFERENCE_LIVE.md`):** all shared-surface tables EXIST with the directive's columns. **No HALT-SCHEMA for the directive's confirm-list.**

```
[classification_signals] EXISTS rows=2849  cols incl: signal_type, confidence, structural_fingerprint, agent_scores, decision_source, tenant_id ✓
[synaptic_density]        EXISTS rows=5     cols: execution_mode, confidence, total_executions, last_anomaly_rate, last_correction_count, learned_behaviors, signature, tenant_id ✓
[structural_fingerprints] EXISTS rows=121   cols incl: match_count, confidence, atom_features, classification_result, column_roles, granularity, tenant_id ✓
[committed_data]          EXISTS rows=671891
[processing_jobs]         EXISTS rows=0
[promoted_patterns]       EXISTS rows=0      ← LIVE-VERIFIED PRESENT (corrects the stale-doc inference that it is absent)
[comprehension_artifacts] EXISTS rows=102
```

**Watch-item (not a confirm-list HALT):** `SCHEMA_REFERENCE_LIVE.md` predates OB-251. The OB-251 reconcile migration (`20260628_ob251_processing_jobs_reconcile.sql`) adds `processing_jobs.{batch_id,chunk_id,total_chunks}`+`'finalized'` status and was noted architect-pending in memory. My live query confirms the TABLES `processing_jobs` + `promoted_patterns` EXIST (0 rows); column-level confirmation of the OB-251 additions and the `platform_users`→`profiles.auth_user_id` RLS fix is NOT done here (both tables are empty, so no column enumeration from data). OB-253 reads/writes only the directive-confirmed columns, all of which exist. Any OB-253 use of `promoted_patterns` or the new `processing_jobs` columns should re-verify those specific columns first (FP-49).

---

## §ALREADY-MET — Phase 2–4 deliverables the true state shows are met (per PG-1: do not rebuild)

| Deliverable | Status | Evidence |
|---|---|---|
| **3A.1 Comprehension before commitment** | **MET** | 3.6 — comprehension (atoms/fingerprints/signals) writes entirely in `process-job` (status='classified') before `commitContentUnit` writes `committed_data` in a separate request. |
| **3A.2 Read-path closure (fingerprint half)** | **MET** | 3.2 — `lookupFingerprint` Tier routing + `lookupAtoms` read-before-derive are live in the async worker; first-ever file runs full LLM, repeat structure skips it. **PG-2's measurable first-vs-repeat difference already holds for fingerprints.** |
| **3A.3 Consolidation write-back (fingerprint)** | **MET** | 3.3 — `writeFingerprint` increments `match_count`/`confidence`; atom write-back exists. |
| **3.3 Perceptual atom hash (Korean-Test)** | **MET** | 3.3 — hash is pure structure, zero classification input, the gate. |

**Consequence:** Phase 2's remaining REAL work is narrow — the `synaptic_density` ingestion read (if that is even the right surface — see HALT-DIVERGE-2) and the surface-unification question (HALT-DIVERGE-1). Phase 2 must NOT rebuild the fingerprint read-path, which already delivers the cost-decreases-with-usage law.

## §HALT — conditions surfaced by Phase 1 (architect disposition required before Phase 2)

**HALT-DIVERGE-1 (G7 surface is split by stage).** DS-031 names ONE canonical signal surface (G7). The built surface is 3+ disjoint tables written by different paths and **siloed by pipeline stage**: ingestion uses `structural_fingerprints` (+ writes `classification_signals`); calculation uses `synaptic_density` + agent priors; neither reads the other's surface. Phase 3 (joint recognition with all facets co-present) and Phase 2 (read consolidated signal) both assume one surface. **Two materially-different paths:** (A) physically unify the surfaces (large, touches calc — G9 risk); (B) keep the tables but build a read-view/adapter so the facets are logically co-present at ingestion (smaller, G9-safe). CC will not pick silently.

**HALT-DIVERGE-2 (`synaptic_density` is a calc-stage surface; reading it at ingestion is a key-space mismatch).** 3A.2 says read `synaptic_density` to set ingestion predictions. But `synaptic_density` is keyed by **calc pattern `signature`** and written only at calc/recon time (5 rows total); the ingestion prediction surface that actually works is `structural_fingerprints` (keyed by structural fingerprint hash, 121 rows, live). Reading `synaptic_density` at ingestion is a category mismatch unless a bridge is defined. **Question for architect:** is Phase 2's "read density at ingestion" satisfied by the existing `structural_fingerprints` confidence/match_count (which IS the ingestion density), or must `synaptic_density` be re-keyed/bridged to ingestion fingerprints? The former is largely already met; the latter is new architecture.

**HALT-SURFACE (Phase 4 operator surface does not exist; §6 forbids new ones).** 3C.3 requires the precision-weighting trust flag to surface in the Data Operations workspace as an operator-visible, **acknowledgeable** item. 3.7 shows: no operator/tenant surface reads the pre-commit signal surface; the substrate is rendered only by the **admin-gated** Observatory Recognition Curve panel; `/data/page.tsx` ("Data Operations") is **fake mock**. The nearest operator surface, `/data-operations/cleaned` (`RemediationReview`), reads `committed_data.metadata.remediation` (post-commit) and has no acknowledgment write-back. **Options:** (A) host the flag in `RemediationReview` by writing precision-weighting output into `committed_data.metadata` + add an acknowledgment write (extends an existing surface, post-commit); (B) the directive intends a new operator surface (contradicts §6 — needs architect waiver); (C) surface only in the admin Observatory panel (not "operator", weaker trust UX). CC will not pick silently.

**Inert-foundation note (not a HALT, but scope-shaping for Phase 4).** The density execution modes gate nothing operator-visible today (3.4) and `synaptic_density` has 5 rows. Phase 4's "override density toward surfacing" presupposes density is an operational surfacing surface; it is not yet. Phase 4 likely must first make a surfacing decision operational (deterministic consequence×exposure → execution_mode override that an operator surface reads), not merely add an override to an already-operating mode.

---

## Phase 1 conclusion
The true-state map is complete with pasted evidence (PG-1 PASS). The substrate **schema is fully present** (no HALT-SCHEMA); comprehension **already precedes commitment** and the **fingerprint read-path is already closed** (much of Phase 2 is already met). The real remaining work concentrates in Phase 3 (Normalizer → joint recognition) and Phase 4 (precision-weighting on a near-inert density foundation), gated by three architect dispositions (HALT-DIVERGE-1, HALT-DIVERGE-2, HALT-SURFACE). **Awaiting architect review before Phase 2 (PG-1 gate).**
