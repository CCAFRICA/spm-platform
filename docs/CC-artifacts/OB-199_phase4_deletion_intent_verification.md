# OB-199 Phase 4 Post-Close — Deletion-Intent Verification Artifact

**Branch:** `ob-199-canonical-signal-write-implementation`
**Phase 4 close commit:** `93d6e793` (signal-persistence.ts deleted; writeClassificationSignal deleted; 24 callsites migrated)
**Architect concern:** preceding audits + drift may have produced layered naming where deleted items carried distinct functional intent from replacements. Mechanical migration verified by tests + coverage-trust grep; intent preservation NOT yet verified empirically.

This artifact maps every deletion executed in Phases 1–4 to its original purpose (cited verbatim from source body, not name-inference) and assesses replacement intent: **Identical / Superset / Subset / Divergent**. Rows flagged `ARCHITECT VERIFY` require disposition before Phase 5 authorization.

---

## Row 1 — `anthropic-adapter.ts:974` pre-OB-199 `/100` normalizer

| Attribute | Detail |
|---|---|
| **Deleted item** | Pre-OB-199 single-line `/100` normalizer at `anthropic-adapter.ts:972-986` |
| **Verbatim deleted code** | `const confidence = typeof result.confidence === 'number' && result.confidence > 0 ? result.confidence / 100 : 0;` |
| **Original purpose (per source)** | Unconditionally divided ANY positive numeric `result.confidence` by 100 to convert AI-emitted percentage (0–100) to ratio (0.0–1.0). Operated only on top-level `result.confidence`; did NOT recurse into nested `result.components[i].confidence` or other nested confidence fields. For falsy/non-numeric/zero/negative inputs, returned `0` (silent fall-through). |
| **Replacement item** | `normalizeConfidenceFieldsInPlace(result)` (recursive, exported from anthropic-adapter.ts; Phase 1, commit `7dead762`) |
| **Replacement intent assessment** | **SUPERSET** |
| **Behavioral preservation evidence** | (a) Test `OB-199 §5.4 normalization — percentage at top level becomes ratio` (anthropic-adapter-normalization.test.ts) — confirms 95→0.95 (matches old behavior). (b) Test `already-ratio values pass through unchanged` — confirms NEW behavior fixes a BUG the old code had: pre-OB-199 would have over-divided 0.5→0.005; new code passes 0.5 through. (c) Test `per-component nested confidences in result.components[]` — confirms NEW behavior covers nested confidences (old did not). DIAG-038 §4.1 empirical evidence: `comprehension:ai_plan_interpretation` row at confidence=0.0093 was the empirical signature of the OLD bug (0.93/100 over-division when AI returned ratio per HF-214 Phase 2 B1); new code prevents this. |
| **Architect verify** | NO — superset is intentional (closes F-AUD-006-003 100x asymmetry per DS-023 §5.4) |

---

## Row 2 — `AIPlainInterpreter.interpretPlan` instance method (Phase 1)

| Attribute | Detail |
|---|---|
| **Deleted item** | `AIPlainInterpreter.interpretPlan(documentContent)` instance method, lines 147–190 of pre-Phase-1 `ai-plan-interpreter.ts` |
| **Verbatim purpose (from source)** | Wrapped `aiService.interpretPlan(documentContent, 'text')` with 8 `console.log` debug statements (debug header, request ID, confidence, latency, provider, model, parsed interpretation breakdown including per-component logs, components count, worked examples count, overall confidence). Set `interpretation.rawApiResponse = JSON.stringify(response.result)` on the returned PlanInterpretation. Returned PlanInterpretation. |
| **Replacement item** | None (deleted with no replacement). Production callers used `bridgeAIToEngineFormat` (still exported), which itself calls `aiService.interpretPlan` directly and then `validateAndNormalizePlanInterpretation(rawResult)` (standalone function). |
| **Replacement intent assessment** | **SUBSET (debug-only; verified no consumer)** |
| **Behavioral preservation evidence** | `grep -rn "rawApiResponse" web/src/` returns ONE match — the type declaration `rawApiResponse?: string` in `PlanInterpretation` interface. ZERO consumers read this field. The Phase 1 grep verification (Phase 0 disposition) confirmed zero external callers of `AIPlainInterpreter` or `getAIInterpreter`. The 8 `console.log` debug statements were not load-bearing (production observability uses structured logs at write-time, not at interpret-time). |
| **Architect verify** | NO — debug logging only, no consumer of `rawApiResponse`, no test depended on the console output |

---

## Row 3 — `AIPlainInterpreter.validateAndNormalize` private method → `validateAndNormalizePlanInterpretation` exported standalone

| Attribute | Detail |
|---|---|
| **Deleted item** | `AIPlainInterpreter.validateAndNormalize(parsed)` private method, lines 202–215 of pre-Phase-1 file (plus `normalizeConfidence` helper at 218–232 it called). Plus public passthrough `validateAndNormalizePublic` at 192–197. |
| **Verbatim purpose (from source)** | Took raw AI response payload and returned `PlanInterpretation` with: `ruleSetName` string coercion, `description`/`descriptionEs` string coercion, `currency` UPPERCASE, `employeeTypes`/`components`/`requiredInputs`/`workedExamples` via per-type normalize* helpers, `confidence` via `this.normalizeConfidence(parsed.confidence, 'interpretation.confidence', 0)`, `reasoning` string coercion. Per-component `confidence` was `this.normalizeConfidence(c.confidence, ..., 0.5)`. Helper `normalizeConfidence` divided values >1 by 100, clamped negatives to 0, logged `[AIPlanInterpreter] confidence normalized: field=... original=... normalized=...` when normalization fired. |
| **Replacement item** | `validateAndNormalizePlanInterpretation(rawResult: unknown): PlanInterpretation` (standalone exported function in `ai-plan-interpreter.ts`, lines 244–260) |
| **Replacement intent assessment** | **SUPERSET (in concert with Phase 1 producer normalization)** |
| **Behavioral preservation evidence** | (a) Shape coercion: identical — same field-by-field construction, same fallbacks ('Unnamed Plan', 'USD', empty arrays, 0/0.5 confidence default). (b) Confidence normalization: REMOVED from this site; ratio-form values arrive post-Phase-1 producer normalization at `anthropic-adapter.ts`. For ratio-form input, OLD `normalizeConfidence(0.95, ..., 0)` returned 0.95 (no-op) and NEW returns 0.95 (no-op) — IDENTICAL. (c) For negative AI input: OLD silently clamped to 0 + logged; NEW passes through to canonical writer which surfaces via §5.2 out_of_range + observability:write_failure signal — DIVERGENT BUT INTENTIONAL per DS-023 §5.5 "no writer-side clamp" and §5.2 structural-failure observability. (d) The `[AIPlanInterpreter] confidence normalized` log marker is GONE — `grep -rn "AIPlanInterpreter\] confidence"` returns zero matches in `web/src/`. No production consumer was monitoring this log (it was a verbose debug emission). |
| **Architect verify** | **YES** — the substitution of silent clamping + log warning with §5.2 structural failure + observability signal is intentional per DS-023 §5.5 but represents an observable behavioral change. Confirm acceptance. |

---

## Row 4 — `AI_TASK_LEVEL_MAP` constant (Phase 2)

| Attribute | Detail |
|---|---|
| **Deleted item** | `const AI_TASK_LEVEL_MAP: Record<AITaskType, string>` — 16-entry inline mapping in `training-signal-service.ts:18-39` |
| **Verbatim purpose (from source)** | Map from AITaskType (file_classification, sheet_classification, document_analysis, field_mapping, ... 16 total) to signal_type prefix strings (classification:ai_file_classification, ..., lifecycle:ai_natural_language_query). Accessed via `AI_TASK_LEVEL_MAP[response.task]` in `captureAIResponse` (line 65). The comment cited "OB-198: AI task → DS-021 §3 Role 4 semantic level (architect-disposed Option A). Record<AITaskType, string> typing makes the map exhaustive — adding a new AITaskType member without extending the map produces a tsc error." |
| **Replacement item** | 16 `register({...})` calls + 16 `registerAITaskMapping(...)` calls in `signal-registry.ts`; `lookupAITaskSignalType(aiTaskType: string): string \| null` query function |
| **Replacement intent assessment** | **SUPERSET** |
| **Behavioral preservation evidence** | (a) Same 16 mappings preserved (signal-registry-test asserts every AITaskType resolves to the same signal_type identifier the old map produced). (b) Registry adds: declared writers, declared readers, signal_level (L1/L2/L3), originating_flywheel, description, confidence_required:true. These add MORE structural metadata; do not remove any. (c) Caller change: `AI_TASK_LEVEL_MAP[response.task]` (returns `undefined` for unknown) → `lookupAITaskSignalType(response.task) ?? response.task` (returns null → falls back to raw task string, which then surfaces as registry soft-warn OR canonical-writer CanonicalWriteError('unregistered_signal_type')). This is more observable for unknown task types. (d) TS exhaustiveness check via `Record<AITaskType, ...>` is replaced by per-registration explicit type — `AITaskType` is no longer the constraint surface, so a new AITaskType addition no longer produces a tsc error AT THE MAP. The constraint shifts to runtime: an unmapped task surfaces at write time. **This is a Subset on the COMPILE-TIME exhaustiveness dimension.** |
| **Architect verify** | **YES** — sub-finding on compile-time exhaustiveness. Pre-OB-199: adding a new AITaskType member without registering it produced a TypeScript error at AI_TASK_LEVEL_MAP definition. Post-OB-199: adding a new AITaskType member without registering it produces NO compile-time error; the omission surfaces only at runtime (first call to `captureAIResponse` with the new task type returns null from `lookupAITaskSignalType` and falls back to raw task string). Compile-time safety reduced. |

---

## Row 5 — HF-214 Phase 2 A clamp (Phase 3 deletion in signal-persistence.ts thin-wrap)

| Attribute | Detail |
|---|---|
| **Deleted item** | Clamp blocks at `signal-persistence.ts:62-76` (single-row) and `:135-149` (batch). Then in Phase 4 final the entire file was deleted. |
| **Verbatim purpose (from source)** | `Math.min(Math.max(original, 0), 0.9999)` — clamped any confidence value to [0, 0.9999], emitted `[SignalPersistence] confidence clamped: original=... clamped=... signal_type=... metric_name=... component_index=...` when clamping fired. Hardcoded ceiling 0.9999 = max representable in NUMERIC(5,4). |
| **Replacement item** | DS-023 §5.2 structural-failure validation at `canonical-signal-writer.ts:validateSignal` (lines 130–149) — out_of_range outcome persists row with `confidence: null` + emits `observability:write_failure` signal |
| **Replacement intent assessment** | **DIVERGENT (intentional per DS-023 §5.5 "no writer-side clamp" + §5.2 structural-failure observability)** |
| **Behavioral preservation evidence** | Pre-OB-199 (HF-214 Phase 2 era): `confidence: 1.5` would clamp to 0.9999 and persist (silent except `console.warn`). Confidence=1.0 would clamp to 0.9999 (silent loss; Decision 30 v2 says 1.0 is admissible per IRA Q3). Post-OB-199: `confidence: 1.5` persists as `null` AND emits a queryable `observability:write_failure` row. Confidence=1.0 persists as 1.0 (Decision 30 v2 inclusive bound honored). Test `OB-199 §5.5 no writer-side clamp — confidence > 1 produces null, never 0.9999` (canonical-signal-writer.test.ts) empirically asserts the divergence. |
| **Architect verify** | NO — divergence is the explicit purpose of DS-023 §5.5; architect has dispositioned in DS-023 |

---

## Row 6 — HF-214 Phase 1 catch-block per-row diagnostic instrumentation (Phase 3 + Phase 4 final deletion)

| Attribute | Detail |
|---|---|
| **Deleted item** | Per-row diagnostic logging in `signal-persistence.ts:91-100` (single-row catch) and `:168-179` (batch catch). Phase 3 thin-wrap deleted the per-row emission; Phase 4 final deleted the entire file. |
| **Verbatim purpose (from source)** | On Supabase insert failure, the OLD code emitted per-row diagnostic logs: `[SignalPersistence] signal_type=... confidence=... metric_name=... component_index=... signal_value_truncated=...` for single-row failures and `[SignalPersistence] row=${i} signal_type=...` for each row in a failing BATCH. Designed by HF-214 Phase 1 (PR #380) specifically so the architect could identify WHICH rows in a failing batch had problematic confidence values — empirically used to diagnose the Meridian "numeric field overflow" failure (DIAG-037 → DIAG-038). Truncated `signal_value` to 200 chars for log readability. |
| **Replacement item** | `CanonicalWriteError` typed error with `cause: 'insert_failed' \| 'database_unreachable' \| 'unregistered_signal_type'`, message string, signalType property. Plus pre-insert validation that catches confidence-range failures BEFORE the database call (via §5.2 outcome routing). |
| **Replacement intent assessment** | **DIVERGENT (intentional but architecturally different)** |
| **Behavioral preservation evidence** | (a) For confidence-range failures (the original HF-214 Phase 1 motivating use case): the canonical writer's §5.2 validation now catches these BEFORE the Postgres call. Out-of-range rows persist with confidence:null + observability:write_failure signal carries (offending_field, expected_range, actual_value, outcome_kind, source_signal_type, source_entity_id, source_rule_set_id, source_calculation_run_id) — durable, queryable, structured. (b) For non-range failures (network, schema mismatch, unique-constraint violation, etc.): the canonical writer throws ONE `CanonicalWriteError` per batch with `count=N`, NO per-row context. **The OLD per-row diagnostic granularity for non-range failures is GONE.** If a batch of 10 rows fails at Postgres for, e.g., a unique-constraint violation on row 7, the architect previously saw all 10 per-row signatures; now sees only `count=10` and the batch-level error message. |
| **Architect verify** | **YES** — sub-finding on diagnostic-granularity reduction for non-range insert failures. The HF-214 Phase 1 instrumentation was specifically motivated by the Meridian diagnostic arc (DIAG-035/036/037/038). For confidence-range failures the new architecture is structurally superior. For OTHER batch insert failures (schema, unique-constraint, RLS denial, network glitch), the per-row visibility is lost. Architect dispositions whether per-row diagnostic emission should be restored as a fallback in `CanonicalWriteError`. |

---

## Row 7 — `signal-persistence.ts` entire file (Phase 4 final)

| Attribute | Detail |
|---|---|
| **Deleted item** | `web/src/lib/ai/signal-persistence.ts` (197 lines) — write surface (persistSignal, persistSignalBatch) + read surface (getTrainingSignals) + SignalData type + Json re-export |
| **Verbatim purpose (from source)** | Bridged in-memory signal capture to Supabase `classification_signals`. HF-055 origin; HF-161 refactored to argument-passing (removed dynamic-import getClient() pattern); HF-214 Phase 1 added catch-block diagnostic; HF-214 Phase 2 added writer-side clamp; HF-215 preserved clamp + B2 as defense-in-depth; OB-199 Phase 3 converted to thin-wrap of canonical writer. |
| **Replacement item** | Write surface: `canonical-signal-writer.ts` (`writeSignal`, `writeSignalBatch`). Read surface: `signal-reader.ts` (`getTrainingSignals` + `SignalData` type — byte-identical relocation). |
| **Replacement intent assessment** | **IDENTICAL** for the read surface (relocation only). For the write surface: SUPERSET (canonical writer adds §5.2 + §5.3 + §5.5 enforcement; covered in Rows 5 + 6 above). |
| **Behavioral preservation evidence** | Read surface: `signal-reader.ts` `getTrainingSignals` function body is byte-identical to the deleted version (verified by diff of file removal commit vs new file body). Same Supabase query, same return shape. 4 importers updated (verified `grep -rn "from.*signal-persistence"` returns only documentation/migration markers, zero code imports). Write surface intent covered in Rows 5+6+10. |
| **Architect verify** | NO — read surface is byte-identical relocation; write surface divergences dispositioned at Rows 5+6+10 |

---

## Row 8 — `writeClassificationSignal` function (Phase 4 final) — SCI-namespace primitive

| Attribute | Detail |
|---|---|
| **Deleted item** | `writeClassificationSignal(payload, supabaseUrl, supabaseServiceKey): Promise<string \| null>` — 40 lines at `web/src/lib/sci/classification-signal-service.ts:81-122` |
| **Verbatim purpose (from source)** | (a) Single SCI-emission gateway for `classification:outcome` rows from the SCI ingestion lifecycle. (b) Hardcoded `signal_type: 'classification:outcome'` (one specific signal_type only — function was specialized). (c) Hardcoded `scope: 'tenant'`. (d) Computed `source: payload.humanCorrectionFrom ? 'user_corrected' : 'sci_agent'` — SCI-specific source vocabulary. (e) Hardcoded `context: { sciVersion: '2.0', phase: 'E', schema: 'HF-092' }` — SCI emission identification metadata: `sciVersion` denotes SCI architectural version, `phase: 'E'` references SCI Phase E (post-execute classification signal emission), `schema: 'HF-092'` references the HF-092 dedicated-columns migration. (f) Wrote to `classification_signals` with DEDICATED COLUMNS (not JSONB-only): `source_file_name`, `sheet_name`, `structural_fingerprint`, `classification`, `decision_source`, `classification_trace`, `vocabulary_bindings`, `agent_scores`, `human_correction_from`, `scope` — the HF-092 schema migration's typed-column path. (g) Returned the inserted row's `id` via `.select('id').single()` — distinct from persistSignal's `Promise<{success: boolean}>` return shape. (h) `[SCI Signal] Write failed:` and `[SCI Signal] Write exception (non-blocking):` SCI-specific log markers. |
| **Replacement item** | `writeSignal({...}, supabaseUrl, supabaseServiceKey)` calls at 5 sites with caller-supplied: `signalType: 'classification:outcome'`, `scope: 'tenant'`, `source: wasOverridden ? 'user_corrected' : 'sci_agent'`, `context: { sciVersion: '2.0', phase: 'E', schema: 'HF-092' }`. Plus dedicated-column fields supplied directly per `CanonicalSignalInput` shape. |
| **Replacement intent assessment** | **DIVERGENT — SCI-layer primitive demoted to non-SCI-layer responsibility per architect concern** |
| **Behavioral preservation evidence** | (a) **Per-row data**: each of 5 call sites preserves the hardcoded markers (signal_type, scope, source vocabulary, context with sciVersion/phase/schema) AND the dedicated columns explicitly. Verified by grep: `grep "sciVersion: '2.0'"` returns matches at all 5 migrated call sites + 2 sci/signal-capture-service.ts sites (sciVersion: '1.0', distinct). (b) **Return shape**: pre-deletion returned `Promise<string \| null>` (the inserted `id`); 5 callers all used `.catch(() => {})` or `.catch(err => log)` — verified zero callers consumed the `id` return value. Loss of return value is **IDENTICAL** behavior per consumer surface. (c) **Log markers**: `[SCI Signal]` marker GONE at write surface; canonical writer emits `[CanonicalWriter]` instead. The marker IS preserved at read functions in the same file (`lookupPriorSignals`, vocabulary recall) — separate site. (d) **SCI structural commitments — STRUCTURAL EROSION**: pre-deletion, the function provided **function-level guarantee** that EVERY SCI emission carried sciVersion/phase/schema markers. Post-deletion, the markers are **per-call-site responsibility** — if a future caller forgets the context block, the SCI emission identification is lost without any compile-time or runtime enforcement. The canonical writer at `lib/intelligence/canonical-signal-writer.ts` does NOT enforce SCI-emission identity; it accepts whatever context the caller provides. (e) **Architectural layer**: `writeClassificationSignal` lived in `lib/sci/` namespace; canonical writer lives in `lib/intelligence/` namespace. SCI-namespace primitive responsibility has moved into intelligence-namespace responsibility. |
| **Architect verify** | **YES — explicitly per architect halt directive on SCI-namespace primitive concern** |

**Sub-finding A on Row 8 (SCI structural erosion):** the deletion of `writeClassificationSignal` moved an SCI-namespace primitive (with function-level structural commitments to SCI emission identity) into per-call-site responsibility at the intelligence-namespace canonical writer. Per the architect's halt directive: "If yes, deletion may have moved an SCI-layer primitive into a non-SCI-layer primitive's responsibility, eroding the SCI layer."

Empirical preservation: all 5 current call sites preserve the markers correctly (verified by grep). But the function-level guarantee is gone. Future SCI-emission additions (a 6th call site) would not be compile-time-checked against the SCI marker convention.

**Disposition options for architect:**
- (a) **Restore SCI-emission helper** at `lib/sci/`: a `writeClassificationSignalOutcome` (different name to avoid mechanical-revert) wrapping `writeSignal` with hardcoded SCI markers. Preserves DS-023 §5.1 (still single entry point downstream) AND restores SCI-namespace structural commitment.
- (b) **Accept per-call-site responsibility**: the directive said delete; the architect dispositions that SCI emission identity is per-call-site concern post-OB-199.
- (c) **Document SCI-emission contract** in code comments or a markdown specification, accepting that compile-time/function-level enforcement is now structural debt.

**Sub-finding B on Row 8 (return-shape change):** pre-deletion returned the inserted row's `id`. Post-deletion `writeSignal` returns `WriteResult` (no `id`). Zero current callers consumed the `id` — IDENTICAL by consumer surface. Future callers wishing to retrieve the row id post-write would need to query separately. Not blocking.

---

## Row 9 — Other deleted helper methods on the AIPlainInterpreter class (Phase 1)

| Attribute | Detail |
|---|---|
| **Deleted items** | `isConfigured()`, constructor accepting `_config`, `getAIInterpreter()` factory, `interpreterInstance` singleton, `resetAIInterpreter()`, `AIInterpreterConfig` interface |
| **Verbatim purpose (from source)** | All unused. `isConfigured` returned `true` if `getAIService()` did not throw — production code never called this. Constructor accepted `_config` but the comment said "Config is ignored - we use AIService for all AI calls". `getAIInterpreter()` lazy-instantiated and returned a singleton. `resetAIInterpreter()` cleared the singleton for tests. `AIInterpreterConfig` interface had three optional fields all noted as unused. |
| **Replacement item** | None (deleted with no replacement). Production code uses `validateAndNormalizePlanInterpretation` (standalone) and `bridgeAIToEngineFormat` (standalone exported function). |
| **Replacement intent assessment** | **IDENTICAL (deleted dead code)** |
| **Behavioral preservation evidence** | Phase 0 disposition + Phase 1 grep: `grep -rn "AIPlainInterpreter\|getAIInterpreter\|resetAIInterpreter\|AIInterpreterConfig" web/src/` returned only the file's own self-references and test infrastructure pre-deletion. Zero external callers. |
| **Architect verify** | NO — empirically dead pre-deletion |

---

## Row 10 — `signal-persistence.ts:persistSignal` / `persistSignalBatch` write functions (Phase 4 final, after Phase 3 thin-wrap conversion)

| Attribute | Detail |
|---|---|
| **Deleted item** | `persistSignal(signal, url, key): Promise<{success, error?}>` and `persistSignalBatch(signals[], url, key): Promise<{success, count, error?}>` |
| **Verbatim purpose (from source)** | (a) Public API for signal persistence. (b) Soft-warn surfaced unregistered signal_types via `[SignalRegistry] persistSignal: signal_type '...' not registered`. (c) HF-214 Phase 1: per-row catch-block diagnostic on insert failure (covered in Row 6). (d) HF-214 Phase 2 A clamp (covered in Row 5). (e) Built insert row from SignalData → JSONB-path insert columns (`tenant_id`, `entity_id`, `signal_type`, `signal_value`, `confidence`, `source`, `context`, `calculation_run_id`, `rule_set_id` — 9 columns). |
| **Replacement item** | `writeSignal` / `writeSignalBatch` from `canonical-signal-writer.ts`. Phase 3 made signal-persistence.ts a thin wrapper; Phase 4 final deleted the thin wrapper entirely. |
| **Replacement intent assessment** | **SUPERSET** |
| **Behavioral preservation evidence** | (a) Insert columns: canonical writer writes ALL 9 columns from the JSONB path AND 10 additional dedicated columns (from F-002 AUD-001 collapse). Caller passes through what was previously supplied; new fields default to null. (b) Soft-warn: canonical writer throws `CanonicalWriteError('unregistered_signal_type')` (structured failure) where signal-persistence.ts emitted `console.warn` (informational). Migration is from soft-warn to structured-failure — DIVERGENT in error-handling but per DS-023 §5.3. (c) Return shape: legacy `{success, error?}` vs canonical `WriteResult{success, observabilitySignalEmitted, error?}` — new shape has additional `observabilitySignalEmitted` discriminator. Callers don't currently consume it; preserved for future architectural use. (d) Clamp removal: covered in Row 5. (e) Per-row diagnostic removal: covered in Row 6. |
| **Architect verify** | NO — DIVERGENCE in error-handling (soft-warn → structured failure on unregistered signal_type) is intentional per DS-023 §5.3; covered by Row 4 (TS exhaustiveness consideration) |

---

## Row 11 — Unused-import cleanup post-migration (lint fix)

| Attribute | Detail |
|---|---|
| **Deleted items** | `ClassificationSignalPayload` import from `api/import/sci/analyze/route.ts:22` and `api/import/sci/execute/route.ts:24`. `ClassificationTrace` import from `api/import/sci/process-job/route.ts:26` and `api/intelligence/converge/route.ts:18`. |
| **Verbatim purpose** | Type imports used to construct the `ClassificationSignalPayload` parameter for `writeClassificationSignal`. Post-deletion, callers pass `CanonicalSignalInput` shape directly to `writeSignal`; the intermediate types are no longer needed. |
| **Replacement item** | None (lint-fix only; types still exported from origin files for any future consumer) |
| **Replacement intent assessment** | **IDENTICAL** (import-only cleanup; types still available at their declaration site) |
| **Behavioral preservation evidence** | `grep -rn "ClassificationSignalPayload\|ClassificationTrace" web/src/` returns the type declarations in their origin files plus usage in `process-job/route.ts:349` (`unit.classificationTrace as unknown as ClassificationTrace`) — still imported where actually needed. |
| **Architect verify** | NO — lint hygiene only |

---

## Summary — rows flagged `ARCHITECT VERIFY`

| Row | Subject | Severity | Disposition options |
|---|---|---|---|
| Row 3 | `validateAndNormalize` log marker `[AIPlanInterpreter] confidence normalized` GONE; negative confidence behavior diverged (clamp→pass-through to canonical writer) | LOW (intentional per DS-023 §5.5) | Accept; documented |
| Row 4 (sub-finding) | `AI_TASK_LEVEL_MAP` TypeScript exhaustiveness check on AITaskType lost; missed task→signal_type mapping no longer compile-time error | MEDIUM | (a) Accept (runtime soft-warn + canonical-writer structural failure surfaces it); (b) Add compile-time test asserting every AITaskType maps via `lookupAITaskSignalType` |
| Row 6 | HF-214 Phase 1 per-row catch-block diagnostic GONE for non-range insert failures; canonical writer reports batch-level only | MEDIUM | (a) Accept (range failures now caught upstream via §5.2; non-range failures rare); (b) Restore per-row diagnostic emission as a fallback inside `CanonicalWriteError` for batch insert failures |
| Row 8 (sub-finding A) | `writeClassificationSignal` SCI-namespace primitive deletion eroded function-level structural commitment to SCI emission identity (sciVersion/phase/schema markers now per-call-site responsibility) | HIGH per architect halt directive | (a) Restore SCI-emission helper at `lib/sci/` wrapping `writeSignal` with hardcoded SCI markers; (b) Accept per-call-site responsibility + document SCI-emission contract in spec; (c) Compile-time enforcement via TypeScript discriminated union mandating SCI markers when signal_type='classification:outcome' from SCI namespace |

---

## Status

Coverage-trust empirically closed: ✓
Mechanical migration: ✓ (43/43 tests pass; build clean)
Intent preservation: PARTIAL — 4 rows flagged for architect disposition

**HALT before Phase 5 per architect directive.** Architect dispositions Row 3 / 4-sub / 6 / 8-sub-A; reviewer authorizes Phase 5 explicitly or directs Phase 4 rework / partial restoration of one or more deletions.
