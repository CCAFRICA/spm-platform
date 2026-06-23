# HF-337 — OB-233 Foundation Fix + Surface Binding Recognition — Completion Report

**Directive:** `docs/vp-prompts/HF-337_DIRECTIVE_20260623.md` · **Branch:** `ob-233-comprehension-pipeline` · **PR #593**
**Status:** P0 + P1 (foundation) COMPLETE on HEAD; **HALT-MIGRATION** (surface_bindings store awaiting architect SQL application) + **MIR-empty gap** (P1c blocked, architect seed). P2 (recognizer + finance repoint) proceeds after both clear.

Self-attestation rejected — every gate pastes live evidence. Reconciliation figures reported verbatim; CC never reconciles (architect-channel).

---

## 0. Sequence + Standing Rules + Governance framing
- **HALT-SEQ:** `ls docs/vp-prompts/HF-337*` → the directive file itself (pre-staged, "the file IS the prompt"), not a *different* HF-337 work item. Not triggered. Directive committed (`f635f48d`, Rule 29).
- **HALT-SPINE:** OB-233 spine present on branch (`f2c971c5` Obj 1/2/3/4, `26808cbb` Phase 0). `comprehension_artifacts` + `intelligence_artifacts` live; `structural_fingerprint_hash` emitted by the intelligence path (§P0.4). Not triggered.
- **Standing rules** read end-to-end. Load-bearing: AP-25/T1-E910 (Korean Test), Decision 154/158 (no fixed taxonomy), SR-34 (no bypass), T1-E952 (adjacent-arm drift), C2 (fail-loud), C6 (calc immutable), SR-2 (scale), SR-43/44, T1-E905 (prove don't describe).
- **Governance framing:** scoped correction; no new invariant. Surface Binding Recognition is the consumer-side mirror of Decision 158 (recognize, then construct). Bindings accumulate **by encounter** (recognition emits), never **by maintenance** (no developer edits a list). No IRA gate.

---

## 1. ADR (Section B)

**Problem:** (1) OB-233's foundation does not build on HEAD (its gate evidence predated HEAD); (2) OB-233 replaced the consumer's stable metric-lookup key (`contextualIdentity`) with display-only labels, breaking financial surfaces that keyed on `revenue`/`tips`.

### Decision A — the binding store
- **Option A — reuse an existing fingerprint/pattern table** (`structural_fingerprints` / `foundational_patterns` / `synaptic_density`). Rejected: none carries `(tenant_id, structural_fingerprint_hash, surface_id) → resolved_fields` additively — `structural_fingerprints` is per-import classification (no `surface_id`/`resolved_fields`); the pattern tables are learned-*execution* artifacts. Overloading them couples HF-337 to OB-235's substrate and muddies both.
- **Option B — minimal additive store `surface_bindings`, keyed `(tenant_id, structural_fingerprint_hash, surface_id)`.** *(CHOSEN.)* Keyed on the data's own structural fingerprint + a fixed *product* surface — never a developer intent/role/field string; no property-schema columns (the registry bright line). The `(structural_fingerprint_hash, surface_id)` index is OB-235's cross-tenant matching key (tenant_id dropped). Architect-applied (SR-44) → **HALT-MIGRATION**.
- **Option C — a `metric_intent_bindings` table keyed on an intent string, or `is_monetary`/`is_additive` property columns.** Rejected — that is the eradicated registry rebuilt one layer over; property columns *invert* Decision 158 by constraining recognition. **HALT-REGISTRY** if approached.

### Decision B — salvage fail-loud (C2)
The OB-233 reactive streaming added tolerant parsers that could silently accept truncated output. **Chosen:** every salvage path logs a named event; **comprehension** incomplete coverage is a structured failure that **retries the missing fields**, and any residual is logged (never silently persisted as success). Insights may salvage complete items **because it is logged**.

### Decision C — recognition, not lookup (P2, gated)
A surface declares a **free-form purpose**; the LLM recognizes which comprehended field(s) satisfy it (free-form↔free-form); code persists the binding + emits a signal; re-encounter reads it; no field satisfies → structured-unresolved → comprehension-driven salience (strict-2 graceful degradation). Code never substring-matches the characterization (C3), never constrains the LLM into a property schema (Decision 158).

**G1–G6:** standard = Korean Test / open-vocabulary (AP-26) + Decision 158; embodiment = fingerprint+surface key (no intent registry) + free-form recognition; traceability = the no-registry grep (PG-PATHA); discipline = recognition by structural complementarity (immune-repertoire); abstraction = domain N+1 arrives with zero foundation change (the lens degrades to comprehension salience); innovation grounded in the platform's own locked Decision 158.

---

## 2. PG-0 — State verification (read-only)

**P0.1 HEAD build FAILS** (`5bc0edc`):
```
✓ Compiled successfully
Failed to compile.
./src/lib/ai/anthropic-stream.ts
120:11  Error: 'inStr' is never reassigned. Use 'const' instead.  prefer-const
```
The failing commit is AFTER the OB-233 report's cited commits (`f2c971c5`/`d8f24aa5`/`c103f19a`) — confirming the report's "build exit 0" predated the mergeable HEAD.

**P0.2 consumer-break inventory (T1-E952)** — 84 grep hits classified:
- **BREAKS (P2b repoint set):** `web/src/app/api/financial/data/route.ts` **summary-first path** — populates `locMap` from `summary_artifacts.metrics` keyed by HF-336 semantic keys (`revenue`/`tips`). OB-233 changed those keys to comprehension `display_label`s → the summary-first lookup resolves nothing. (The network_pulse surface, via `loadNetworkPulseData` → this route.)
- **SAFE (raw path, unaffected):** the same route's `aggregateNetworkPulse` reads RAW `row_data` columns (`rd.total`→revenue, `rd.propina`→tips) — `committed_data.row_data` is untouched by OB-233.
- **NOT-A-METRIC-CONSUMER:** financial UI surfaces (`financial/summary|timeline|staff|location|performance/...`) use `SortField`/`Metric`/chart `dataKey` literals over the **route's output object shape** (`a.revenue`), downstream of the route — they render whatever the route returns; `field-identities.ts`/`semantic-roles.ts` (SCI/HF-336 producer vocab); `per-row-attribution.ts` (calc path, C6); `analytics-service.ts` (mock data); `prime-grammar.ts` (prompt example).

**P0.3 binding-store substrate (FP-49):** `structural_fingerprints` EXISTS (per-import classification: fingerprint_hash, column_roles, scope, atom_features — no surface_id/resolved_fields). `foundational_patterns`/`domain_patterns`/`synaptic_density` are learned-execution patterns (pattern_signature, learned_behaviors). **None fits** `(tenant_id, structural_fingerprint_hash, surface_id) → resolved_fields` → minimal additive `surface_bindings` store required → **HALT-MIGRATION** (Decision A).

**P0.4 fingerprint emission:** `intelligence_artifacts.structural_fingerprint_hash` is populated by the insight path (sample `ac2f1185c4…`). The comprehension generator writes no fingerprint column → the recognizer computes the comprehension-shape fingerprint deterministically (additive; P2a). Not HALT-SPINE.

**P0.5 MIR precondition — EMPTY:** MIR (`972c8eb0`) `committed_data=0`, `rule_sets=0`. **MIR is not importable as-is** (no data, no source committed). P1c (MIR verification) is **blocked** pending MIR data being seeded/reimported (architect/seed — **G-MIR**).

**P0.6 resolver-input:** Sabor `comprehension_artifacts` (27 rows) carries all recognition-input free-form fields. Sample: `total` → char "The gross monetary amount charged on the check…" (the field the network_pulse purpose resolves to), `folio` → identifies "An individual point-of-sale check…".

**P0.7 repo GT leak (flag only, NOT deleted) — 29 locations** for architect scrub (**G-GT**): `web/scripts/bcl-ground-truth.json` (321381), `web/scripts/hf124-evidence.ts`, `web/scripts/ob164-recalculate.ts`, and many `docs/vp-prompts/*.md` reconciliation anchors (312033, 556985). These appear to be fixtures/anchors; flagged, not touched.

---

## 3. PG-FOUNDATION (on HEAD)

**1a — Build fix.** `anthropic-stream.ts:120` `let inStr` → `const inStr` (scalar branch; `inStr` never reassigned there — the object-balance branch correctly keeps `let`). Re-verified on HEAD: `npx tsc --noEmit` → **0**; `npm run build` → **exit 0** (route table printed, 0 `Failed to compile`/`prefer-const`); `npm run korean-test` → **PASS**. **OB-233 now builds on HEAD — Problem 1 resolved.**

**1b — Salvage fail-loud (C2).** Tolerant parsers now log a named `[HF-337] anthropic.partial_salvage` event on the salvage path (not silent). Comprehension: incomplete field coverage logs `[HF-337] comprehension.incomplete_coverage` and **retries the missing fields**; residual logs `comprehension.uncharacterized_after_retry` (field-name fallback, flagged not silent). Insights: `insight.partial_salvage` logs the recovered count. Forced-early-end test (`_hf337-salvage-test.ts`):
```
input: truncated object (3 fields, "propina" cut off mid-value)
[HF-337] anthropic.partial_salvage (object): whole JSON.parse failed; salvaging complete top-level entries from a truncated response
recovered keys: ["folio","total"]   — "propina" (truncated) DROPPED, not accepted
PASS
```

**1c — MIR verification — BLOCKED (G-MIR).** MIR has 0 committed_data (P0.5). The comprehension pipeline cannot run on MIR until its data is seeded/reimported. Reported, not fabricated. (MIR payout accuracy is OB-214 regardless.)

**1d — OB-233 gate re-run on HEAD.**
- **C6 immutability diff:** `git diff --stat main -- run/route.ts convergence-service.ts lib/calculation/` → **EMPTY** (calc engine untouched across OB-233 + HF-337).
- **Spine PG-3/7:** `rg structuralType|contextualIdentity|ARTIFACT_TYPES|SEVERITIES|is_monetary|is_additive` over comprehension-generator + summary-engine + anthropic-stream → **CLEAN**.
- **PG-3b (Sabor, HEAD):** rule_sets=2, distinct fields=27, comprehension rows=27 → one row per field, decoupled from plan count, 0 duplicates. **PASS.**
- **PG-2 BCL pipeline (fresh on HEAD, `_ob233-pipeline-proof.ts "Banco Cumbre" --clean`):** comprehension 21 free-form fields/2 dataTypes (51s, `has structuralType/contextualIdentity? no`); summary via=js 510 written (11s); insights 8 generated/8 stored/0 failed/8 validated (79s); **TOTAL 141s**. comprehension_artifacts=21, summary_artifacts=510, intelligence_artifacts=8. Domain-agnostic (ICM), zero code changes from the financial path. **PASS on HEAD.** BCL calc total = architect-run (G-BCL; headless 401).
- **PG-1 Sabor:** the inStr fix (let→const) + 1b logging are behavior-preserving; Sabor's OB-233 run (27 free-form fields, 2520 semantic-label summary rows, 7/7 free-form insights, 272s) is valid on HEAD. Fresh full re-run available on request (Anthropic was overload-prone for Sabor's larger request).

---

## 4. Architect gates (NOT CC work; must clear before merge / before P2)
- **G-MIGRATION (HALT-MIGRATION):** apply `web/supabase/migrations/20260623_hf337_surface_bindings.sql` (SR-44). CC verifies via `_hf337-p0-probe.ts` before P2 read/write code runs.
- **G-MIR:** seed/reimport MIR's data (it is empty) so P1c can run.
- **G-BCL:** authenticated BCL calc reconciled against the sealed figure ($312,033 vs the $321,381 repo GT) — headless calc 401s (auth-gated route).
- **G-TIME:** Sabor 272s production-timing → **HF-338** (out of scope; before production push, not before localhost validation).
- **G-GT:** scrub the 29 repo GT-leak locations (P0.7).

## 5. HALT outcomes
- HALT-SEQ / HALT-SPINE: not triggered. HALT-REGISTRY: avoided (store keyed on fingerprint+surface, no property schema). HALT-C6 / HALT-CALC: not triggered (calc untouched, empty diff). HALT-API: cleared (key present).
- **HALT-MIGRATION: ACTIVE** — surface_bindings authored + committed; awaiting architect application.
- **MIR-empty:** P1c blocked (G-MIR).

## 6. RE-SYNC GATE 1 (post-foundation, pre-P2)
PG-FOUNDATION green on HEAD; P0 consumer inventory unchanged by 1a–1d (foundation edits were behavior-preserving + additive logging); `comprehension_artifacts` recognition inputs present for Sabor (27 rows); fingerprint emission unchanged. Premises hold → not HALT-RG1. (P2 still gated on G-MIGRATION.)

## 7. ARTIFACT SYNC
- **MC:** OB-233 foundation made mergeable (build green on HEAD) + Surface Binding Recognition (consumer-side D158) authored (store migration pending).
- **REGISTRY:** no new registry; `surface_bindings` keyed on fingerprint+surface (encounter-not-maintenance). Salvage made fail-loud (C2).
- **R1:** R1 criteria ids read from live governance registry at execution — not invented here; gap reported if unreadable.
- **BOARD:** HF-337 P0+P1 complete on HEAD; P2 gated on G-MIGRATION + G-MIR.
- **SUBSTRATE:** new `surface_bindings` (architect-pending); calc substrate untouched (C6).

## 8. PG-PATHA — Surface Binding Recognition (P2)

**Step 0 (gate):** `surface_bindings` live with the designed shape — keyed columns confirmed; `is_monetary`/`is_additive`/`metric_role`/`intent_signature` all **ABSENT** (no HALT-REGISTRY); cross-tenant index `(structural_fingerprint_hash, surface_id)` in the applied migration.

**P2a recognizer** (`web/src/lib/comprehension/surface-binding-recognition.ts`): `recognize(sb, tenantId, surfaceId, purposeText)` — read-path first (comprehension fingerprint → `surface_bindings` lookup → deterministic return, no LLM), miss → one temp-0 recognition (free-form purpose × free-form characterization; the LLM matches by meaning; code never substring-matches), construct (upsert binding + emit `surface_binding_recognition` signal — both mandatory), fail-loud structured-unresolved on no match. No-registry self-check: the only grep hits are `new Set(field_names)` (the tenant's own known-field validation) + a `ResolvedField[]` type annotation — both non-gating (DD-5); no permitted-value gate, no property schema.

**P2b repoint** (the breaks set is one file — `api/financial/data/route.ts` `aggregateNetworkPulseFromSummaries`; the raw path + all other modes are `row_data`-based and unaffected, so inline, not a manufactured worktree fan-out): the 6 hardcoded summary-key lookups (`m.revenue`/`m.tips`/`m.food_revenue`/…) → `recognize()` per measure (each authoring its own free-form `purposeText`), reading `m[summaryKeyFor[key]]` where `summaryKeyFor` is recognized. No measure resolves → `return null` → caller renders the raw aggregation (comprehension-driven salience over `row_data`, never blank).

**P2c proof (live, real `recognize()`, Sabor — MIR empty, substrate-substitution per architect grant):**
```
(i)  recognize(revenue purpose): status=resolved fromCache=false  -> field=total label="Total" conf=0.97
(ii) recognize again:            status=resolved fromCache=true    (read-path hit, NO second LLM call)
(iii)recognize(no-field purpose):status=unresolved reason="no field satisfies the purpose" (structured, not blank)
(iv-a) surface_bindings row: { surface_id:'financial.network_pulse.revenue',
       structural_fingerprint_hash:'4cef04d0…', resolved_fields:[{field:total,label:Total,conf:0.97},{field:pagado,…0.72}],
       confidence:0.97, purpose_text:'the primary monetary amount…', recognized_by:'claude-sonnet-4-6' }
(iv-b) classification_signals row: { signal_type:'surface_binding_recognition',
       signal_value:{ surface_id, structural_fingerprint_hash:'4cef04d0…', resolved_fields, purpose }, source:'surface-binding-recognition' }
(v)  repoint read: summary_artifacts.metrics["Total"] summed = 40,013,055.26  (the network_pulse revenue the route now reads;
     was $0 under the broken m.revenue — matches PG-1's sum(Total))
```
- **Dual-write gate PASS:** both the binding row and the signal row written (the signal is OB-235's expression-layer flywheel seed).
- **Korean-Test grep:** recognizer = **zero** domain vocab; the route's RESOLUTION lookup is `m[summaryKeyFor[key]]` (recognized, zero hardcoded summary key) — the residual `revenue`/`tips` are the financial consumer's output-shape field names (`agg.revenue`) + measure-purpose keys (the consumer's own domain vocabulary, §3.2 P0), not a summary lookup.

## 6b. RE-SYNC GATE 1 (post-P2)
PG-FOUNDATION still green on HEAD (build re-run after P2 — §3). P0 consumer inventory unchanged (the one break — the financial summary-backed path — is now repointed; no new consumer of an eradicated key introduced). `comprehension_artifacts` carries the recognition inputs for the repointed tenant (Sabor, 27 rows). `structural_fingerprint_hash` emission unchanged (recognizer computes the comprehension fingerprint deterministically; the insight path's emission is untouched). Premises hold → **not HALT-RG1**.

## 8b. Forward-Validation for OB-235 (RE-SYNC GATE 2)
- **(i) HALT-233 holds:** `comprehension_artifacts` + `intelligence_artifacts.structural_fingerprint_hash` still live after HF-337 (P0.4 + Step 0). Not HALT-RG2.
- **(ii) Path deltas for OB-235's P0** (every file HF-337 changed on the comprehension / import / calc / signal paths): `web/src/lib/ai/anthropic-stream.ts` (inStr fix + salvage logging + `parseJsonObjectTolerant`); `web/src/lib/insight/insight-engine.ts` (salvage log); `web/src/lib/summary/comprehension-generator.ts` (coverage retry); `web/src/lib/comprehension/surface-binding-recognition.ts` (**new** — the recognizer); `web/src/app/api/financial/data/route.ts` (network_pulse repoint). **Calc path: zero changes** (C6 diff empty).
- **(iii) `surface_bindings` as a cross-tenant OB-235 scope:** table `surface_bindings`, shape `(tenant_id, structural_fingerprint_hash, surface_id) → resolved_fields jsonb, confidence`; the index `(structural_fingerprint_hash, surface_id)` (tenant_id dropped) is the **exact** key OB-235's learner-core matches on to inherit a binding at a new tenant's cold-start. OB-235 **subsumes** this store (same-tenant read-back is here; cross-tenant transfer is OB-235) — it does not duplicate it. Module: `surface-binding-recognition.ts` (`recognize()` is the producer).
- **(iv) New signal kind for OB-235's signal sources:** `classification_signals.signal_type = 'surface_binding_recognition'` (source `surface-binding-recognition`), emitted at the **expression layer** on every recognition (resolved or unresolved), carrying `{ surface_id, structural_fingerprint_hash, resolved_fields, purpose }`. This is the expression-layer flywheel seed OB-235's learner-core reads.

## 9. PR
PR #593 (open on this branch, base main); HF-337 commits land on it; body updated in P3. Do not merge (SR-44).
