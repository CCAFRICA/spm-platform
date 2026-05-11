# OB-199 — Canonical Signal Write Surface Implementation (DS-023 / DS-022 v2)

**Branch:** `ob-199-canonical-signal-write-implementation`
**Base:** `main` HEAD `87477053` (post-AUD-006 merge, PR #384)
**Architectural authority:** `docs/design-specifications/DS-022_Canonical_Signal_Write_Surface_v2.md` (the directive references "DS-023"; on-main artifact is DS-022 v2 with the §5.1–§5.7 structure cited verbatim).
**Empirical authority:** `docs/audits/AUD-006_Signal_Write_Pipeline_Audit.md` + `docs/audits/AUD-007_OB-199_SCI_Structural_Preservation_Audit.md`.
**IRA review:** vialuce-governance PR #54 (`tier_3_novel`, hash `962a877f10536bb8aeaa45ceaacd031cf06e260cc73c887cb64bce93dd2931a3`).

---

## 1. Phase Summary

| Phase | Title | Commit | Outcome |
|---|---|---|---|
| 0 | Architecture Decision Record (Option A chosen) | `31908fc3` | ADR persisted; IRA-ranked-1 substrate-coherent canonical-writer-with-producer-normalization approach. |
| 0 amend | AUD-006 §2.4 grep blind-spot + Option (b) disposition | `c6d867ea` | `bridgeAIToEngineFormat` surfaced as reachable consumer of `validateAndNormalize`; architect dispositioned standalone-function extraction. |
| 0 amend | AUD-006 §1.1 inventory expansion to 19 sites | `65b5efa2` | 4 writeClassificationSignal callers documented as Divergence 4; inventory expanded from 15 → 19. |
| 1 | Producer normalization + `AIPlainInterpreter` deletion | `7dead762` | `normalizeConfidenceFieldsInPlace` introduced at `anthropic-adapter.ts`; class deleted, `validateAndNormalizePlanInterpretation` extracted standalone (Option (b)). |
| 2 | Registry consolidation + `confidence_required` schema | `ff55872c` | 32+ signal_types registered; `register()` enforces explicit `confidence_required:boolean`; AI_TASK_LEVEL_MAP collapsed into `registerAITaskMapping`/`lookupAITaskSignalType`. |
| 2 retroactive | `lifecycle:outcome` registration | `a510542b` | Found via Phase 4 inventory mismatch; registered with `confidence_required:true`. |
| 3 | Canonical writer module + §5.2 four-outcome routing + §5.5 clamp removal | `5e42d88d` | `canonical-signal-writer.ts` introduced as singular `.insert(...)` surface; `writeSignal`/`writeSignalBatch` + testable `*WithClient` variants; HF-214 Phase 2 A clamp removed. |
| 4.1 | Migrate `training-signal-service.ts` | `ba859230` | |
| 4.2 | Migrate `lib/intelligence` services | `9a33210a` | |
| 4.3 | Migrate emitter + SCI capture + lifecycle | `3e605692` | |
| 4.4 | Migrate calculation + reconciliation routes | `21e85f60` | |
| 4.5 | Migrate assessment + approvals + bypass writers (briefing/stream) | `6042d29e` | |
| 4 final | `signal-persistence.ts` deletion + `writeClassificationSignal` deletion; coverage-trust closes | `93d6e793` | 19+5 = 24 callers migrated; bypass write paths eliminated. |
| 4 post-close | Deletion-intent verification artifact | `8807c82c` | 11 deletions catalogued; 4 ARCHITECT VERIFY rows flagged. |
| AUD-007 | SCI Structural Preservation Audit — evidence surface | `df838536` | 51 evidence files + main report; read-only verbatim evidence per E1.1–E6.5. |
| 4 supplement A | `writeClassificationSignal` restored as thin facade (Row 8-sub-A) | `9f87ab73` | Function-level SCI marker commitment restored; DS-023 §5.1 single-entry-point preserved (facade delegates to writeSignal — no parallel insert path). 5 SCI sites re-migrated to facade. |
| 4 supplement B | Per-row diagnostic in `writeSignalBatchWithClient` (Row 6) | `df992317` | HF-214 Phase 1 forensic granularity restored at batch insert error path; +1 test (44→45 green). |
| 4 supplement C | AITaskType exhaustiveness compile-time test (Row 4-sub) | `29fdfff8` | Structural-typing parity restored via `Exclude` + `_exhaustivenessCheck`; +1 test (45 green total). |

Phases 0–4 + supplements A/B/C all green at HEAD `29fdfff8`. Pre-existing tsc error at `__tests__/round-trip-closure/run.ts:286` (SignalNotRegisteredError signature mismatch) persists from `main`; not introduced by this work.

---

## 2. AUD-006 Finding Closure Status

**8 of 10 in-scope findings CLOSED. 1 deferred to Phase 5 architect-execution. 1 carried to successor.**

| Finding | Severity | Status | Closure path |
|---|---|---|---|
| F-AUD-006-001 — B2 normalizer dead code on production signal-write path | P0 | **CLOSED** | Phase 1: `AIPlainInterpreter` class deleted; `validateAndNormalizePlanInterpretation` extracted as standalone; producer normalization at `anthropic-adapter.ts` (`normalizeConfidenceFieldsInPlace`) is the singular comprehension-time normalizer. |
| F-AUD-006-002 — A writer-side clamp masks Decision 30 v2 violations silently | P0 | **CLOSED** | Phase 3: §5.5 no-clamp + §5.2 four-outcome routing (out_of_range persists confidence:null + emits `observability:write_failure`). Phase 4.5 migrated bypass writers (briefing/stream) into canonical writer. |
| F-AUD-006-003 — Writer-asymmetry: `response.confidence` (post-`/100`) vs `response.result.confidence` (raw) | P0 | **CLOSED** | Phase 1: recursive `normalizeConfidenceFieldsInPlace` operates on both top-level and nested `result.components[i].confidence`; producer-side normalization collapses the asymmetry. Phase 4: single canonical writer ensures uniform surface. |
| F-AUD-006-004 — AUD-001 F-002 (dual write architecture) remains active | P1 | **CLOSED** | Phase 4 final: `signal-persistence.ts` + `writeClassificationSignal` deleted, all 24 callsites migrated; verified via `grep -rnE "\.from\(['\"]classification_signals['\"]?\)\.insert" web/src/` → only `canonical-signal-writer.ts` (4 sites: single insert + observability + batch + batch observability) + 1 test mock. Supplement A re-introduces `writeClassificationSignal` as a thin facade that delegates to the canonical writer; the singular-entry-point property is preserved (the facade adds zero new insert paths). |
| F-AUD-006-005 — 16 unregistered `ai_`-prefix signal_types from `AI_TASK_LEVEL_MAP` | P1 | **CLOSED** | Phase 2: 16 `register({...})` + `registerAITaskMapping(...)` calls; `lookupAITaskSignalType(aiTaskType): string \| null` query function; signal-registry test asserts every AITaskType resolves. Supplement C: compile-time exhaustiveness test restores structural-typing parity. |
| F-AUD-006-006 — 30 historical exact-1.0 confidence rows from pre-Phase-2 writes | P1 | **DEFERRED (Phase 5)** | Architect-executed `TRUNCATE classification_signals` post-merge + production deploy. Pre/post-wipe SQL specified in §6 below. |
| F-AUD-006-007 — `lifecycle:briefing` and `lifecycle:stream` omit confidence | P2 | **CLOSED** | Phase 2: both registered with `confidence_required:false`; the §5.2 missing_optional outcome correctly persists confidence:null without observability emission. Phase 4.5 migrated both writers into canonical writer. |
| F-AUD-006-008 — Other `anthropic-adapter.ts` prompt templates retain `(0-100)` mandate | P2 | **CARRIED to HF-216 successor** | Latent F-AUD-006-003 surface for non-plan_interpretation tasks; mitigated by Phase 1's recursive `normalizeConfidenceFieldsInPlace` (operates on whatever shape arrives); structural exposure documented as out-of-scope per directive. |
| F-AUD-006-009 — B2 fallback semantic carry-forward (`Number(c.confidence) \|\| 50` → `0.5` default) | P2 | **MOOT** | B2 deleted in Phase 1 (`AIPlainInterpreter` class deletion); replacement `validateAndNormalizePlanInterpretation` preserves the `0.5` fallback semantic on the standalone-function path. |
| F-AUD-006-010 — Cosmetic display drift: `% confidence` literal at `ai-plan-interpreter.ts:178` | P3 | **MOOT** | Site deleted with `AIPlainInterpreter` class. |

---

## 3. AUD-001 F-002 + F-003 Closure Verification

### F-002 — Dual write architecture (P1, two prior unresolved cycles)

Verbatim grep at HEAD `29fdfff8`:

```
$ grep -rnE "\.from\(['\"]classification_signals['\"]?\)\.insert" web/src/
web/src/lib/intelligence/canonical-signal-writer.ts:307:    const { error } = await supabase.from('classification_signals').insert(row);
web/src/lib/intelligence/canonical-signal-writer.ts:329:      const { error: obsError } = await supabase.from('classification_signals').insert(obsRow);
web/src/lib/intelligence/canonical-signal-writer.ts:418:    const { error } = await supabase.from('classification_signals').insert(rows);
web/src/lib/intelligence/canonical-signal-writer.ts:440:      const { error: obsError } = await supabase.from('classification_signals').insert(obsRows);
web/src/lib/intelligence/__tests__/canonical-signal-writer.test.ts:26:// Records every `.from('classification_signals').insert(rowOrRows)` call.
```

All 4 production `.insert(...)` sites are within `canonical-signal-writer.ts` (single-row writer, single-row observability emission, batch writer, batch observability emission). One test-mock comment reference. **F-002 CLOSED.**

The Supplement A `writeClassificationSignal` facade adds no insert path — it constructs a `CanonicalSignalInput` and delegates to `writeSignal`. The dual-architecture defect remains closed.

### F-003 — 14 fire-and-forget swallowed failures (P1)

Pattern at all migrated call sites: explicit `.catch((err: unknown) => { … })` with `instanceof CanonicalWriteError` discriminator + per-module log tag. Sample (SCI execute site, post-supplement-A):

```typescript
writeClassificationSignal({...}, url, key).catch((err: unknown) => {
  if (err instanceof CanonicalWriteError) {
    console.warn(`[SCIExecute] classification:outcome CanonicalWriteError (${err.cause}): ${err.message}`);
  } else {
    console.warn('[SCIExecute] classification:outcome unexpected error:', err instanceof Error ? err.message : String(err));
  }
});
```

Pre-OB-199 the same call swallowed errors silently (`.catch(() => {})` or no catch at all). Post-OB-199 every fire-and-forget site surfaces failures with structured `cause` discriminator (`unregistered_signal_type | database_unreachable | insert_failed`). Supplement B additionally restores per-row forensic detail at batch-level failures. **F-003 STRUCTURALLY MITIGATED** (failures still fire-and-forget but observable).

---

## 4. AUD-004 v3 E1–E6 Substrate Status at Signal-Write Surface

| Extension | Pre-OB-199 status | Post-OB-199 status |
|---|---|---|
| E1 — Registry-as-canonical-declaration | partial (Map registered but bypassable; AI_TASK_LEVEL_MAP not in registry) | **enforced**: `register()` requires explicit `confidence_required:boolean`; `assertRegistered` thrown synchronously at writer boundary (CanonicalWriteError `unregistered_signal_type`). |
| E2 — Declared-reader requirement (Korean Test compliance) | declared in DS but no runtime check | **enforced** at registration; `observability:write_failure` and `lifecycle:outcome` registered with declared readers. |
| E3 — Soft-warn unregistered → hard fail | soft-warn only | **hard fail** at canonical writer boundary (Decision 154/155). |
| E4 — Identifier derivation from registry | partial (literal strings throughout) | **enforced**: `validateSignal` calls `lookup(signal.signalType)`; mismatched signal_type fails before insert. |
| E5 — Single insert surface | violated (dual write architecture) | **CLOSED**: 4 `.insert(...)` sites all in `canonical-signal-writer.ts`. |
| E6 — Producer-side normalization at the adapter | absent (writer-side clamp at line 62-76, 135-149 of signal-persistence.ts) | **implemented** at `anthropic-adapter.ts` via recursive `normalizeConfidenceFieldsInPlace`; writer-side clamp removed (§5.5). |

---

## 5. DS-021 G1–G11 Verification at Signal-Write Surface

DS-021 Substrate Architecture Biological Lineage v1.0 (LOCKED 2026-04-30). The 11 governance invariants relevant at the signal-write surface:

| Invariant | Verification |
|---|---|
| G1 — Canonical surface for write | `canonical-signal-writer.ts` is the only insert site (§3 above). |
| G2 — Structural contract enforcement at boundary | `validateSignal` §5.2 four-outcome routing in canonical writer. |
| G3 — Registry as canonical declaration | E1 + E2 + E3 above. |
| G4 — Identifier traceability | `signal_type` value flows from registered declaration through writer to row; no string-derived identifiers at write time. |
| G5 — No silent loss of producer assertion | out_of_range outcome persists confidence:null + emits observability:write_failure → producer-side defect is structurally visible. |
| G6 — Structural failure observability | `observability:write_failure` signal carries `source_signal_type`, `offending_field`, `expected_range`, `actual_value`, `outcome_kind` (Phase 3). |
| G7 — Korean Test on signal-type vocabulary | Registry signal_types are domain-neutral keys; no language-specific or implementation-specific naming. |
| G8 — Fail-loud at producer | Supplement C: compile-time exhaustiveness on AITaskType prevents new producer task types from being added without registry mapping. |
| G9 — Single producer-side normalization | `normalizeConfidenceFieldsInPlace` is the singular ratio/percentage normalization site (recursive). |
| G10 — Audit-trail forensic granularity | Supplement B: per-row diagnostic at batch-failure boundary surfaces row index + signal_type + confidence + metric_name + component_index + truncated signal_value. |
| G11 — Deletion intent preserved across refactors | AUD-007 evidence surface produced (51 files, 8485 lines); Supplements A/B/C addressed the four ARCHITECT VERIFY rows. |

---

## 6. AUD-007 SCI Structural Preservation Closure

AUD-007 produced verbatim raw evidence (51 files in `docs/audits/AUD-007_evidence/`); the architect dispositioned four ARCHITECT VERIFY rows from `docs/CC-artifacts/OB-199_phase4_deletion_intent_verification.md`:

| Row | Concern | Disposition | Closure |
|---|---|---|---|
| Row 3 — `validateAndNormalize` private → standalone, silent clamping replaced by §5.2 structural failure | observable behavioral change | **accept as written** | recorded; the §5.5 + §5.2 surface is intentional per DS-023. |
| Row 4-sub — Compile-time exhaustiveness loss on AITaskType | constraint shifted from compile-time to runtime | **add compile-time test** | Supplement C (`29fdfff8`): `Exclude` + `_exhaustivenessCheck` pattern produces TS2322 on missing AITaskType; runtime registry-mapping check defense-in-depth. |
| Row 6 — Per-row diagnostic for non-range batch failures (HF-214 Phase 1 intent) | forensic granularity lost in canonical batch error path | **restore per-row diagnostic** | Supplement B (`df992317`): per-row `console.error` before single `CanonicalWriteError` throw; +1 test asserts 3 per-row lines on 3-signal batch with mocked insert error. |
| Row 8-sub-A — `writeClassificationSignal` function-level SCI marker commitment eroded to per-call-site responsibility | structural commitment lost when 5 SCI sites migrated to inline `writeSignal({...})` | **restore as thin facade** | Supplement A (`9f87ab73`): facade hardcodes `signalType: 'classification:outcome'`, `scope: 'tenant'`, `source` derivation from `humanCorrectionFrom`, `context: { sciVersion: '2.0', phase: 'E', schema: 'HF-092' }`; delegates to `writeSignal`; 5 SCI sites re-migrated to facade. Coverage-trust: `sciVersion: '2.0'` literal confined to facade module. |

SCI structural commitments verified preserved post-supplements:
- `classification:outcome` signal_type hardcoded at facade
- `scope: 'tenant'` enforced at facade
- `sciVersion: '2.0', phase: 'E', schema: 'HF-092'` context markers enforced at facade
- `source: 'sci_agent' | 'user_corrected'` derived deterministically from `humanCorrectionFrom`
- 5 SCI sites preserve per-module log tag (`[SCIExecute]`, `[ConvergeAPI]`, `[SCIProcessJob]`, `[SCIAnalyze]`) + `CanonicalWriteError` cause discriminator

---

## 7. Out-of-Scope (Per Directive)

| Item | Note |
|---|---|
| c4 magnitude defect at `route.ts:1793/1798` | HF-216 successor. Not addressed by OB-199. |
| AUD-004 v3 cluster B Korean Test concerns | Separate scope; OB-199 addresses signal-write surface only. |
| HF-198 campaign continuation | Independent track; cross-references the canonical writer but does not modify it. |
| F-AUD-006-008 — Other AI prompt templates' `(0-100)` mandates | Latent F-AUD-006-003 surface; documented as carried to HF-216 successor. |

---

## 8. Phase 5 — Production Wipe (Architect-Executed, Post-Merge)

Phase 5 closes F-AUD-006-006 (30 historical exact-1.0 rows) post-deploy. **CC does not execute Phase 5.** Architect runs the following in Supabase SQL Editor after PR merges and production deploys:

**Pre-wipe (for record):**
```sql
SELECT count(*) FROM classification_signals;
SELECT signal_type, count(*) FROM classification_signals GROUP BY signal_type ORDER BY count(*) DESC;
SELECT signal_type, count(*) FROM classification_signals WHERE confidence = 1.0 GROUP BY signal_type;
SELECT signal_type, count(*) FROM classification_signals WHERE confidence = 0.9999 GROUP BY signal_type;
```

**Wipe:**
```sql
TRUNCATE TABLE classification_signals;
```

**Post-wipe verify:**
```sql
SELECT count(*) FROM classification_signals;  -- expected 0
```

After post-wipe SCI execute, verify the first `classification:outcome` row carries the producer's asserted confidence ratio (not the legacy 0.9999 clamp value), context contains `{ sciVersion: '2.0', phase: 'E', schema: 'HF-092' }`, and the HF-092 dedicated columns populate.

DS-023 §5.6 closure on F-AUD-006-006 completes when post-wipe `SELECT count(*) FROM classification_signals` returns 0.

---

## 9. Commit Lineage on Branch (main..HEAD)

```
29fdfff8 OB-199 Phase 4 supplement C: compile-time AITaskType exhaustiveness test (Row 4-sub)
df992317 OB-199 Phase 4 supplement B: per-row diagnostic for non-range batch failures (Row 6)
9f87ab73 OB-199 Phase 4 supplement A: restore writeClassificationSignal as thin facade per Row 8-sub-A disposition
df838536 AUD-007: OB-199 SCI Structural Preservation Audit — evidence surface
8807c82c OB-199 Phase 4 post-close: deletion-intent verification artifact
93d6e793 OB-199 Phase 4 final: writeClassificationSignal callers + signal-persistence.ts deletion; coverage-trust closes
6042d29e OB-199 Phase 4.5: Migrate assessment + approvals + bypass-writers (briefing/stream)
21e85f60 OB-199 Phase 4.4: Migrate calculation + reconciliation routes to canonical writer
3e605692 OB-199 Phase 4.3: Migrate emitter + SCI capture + lifecycle to canonical writer
9a33210a OB-199 Phase 4.2: Migrate lib/intelligence services to canonical writer
ba859230 OB-199 Phase 4.1: Migrate training-signal-service.ts to canonical writer
65b5efa2 OB-199 Phase 0 amend: AUD-006 §1.1 inventory expansion to 19 sites
a510542b OB-199 Phase 2 retroactive: register lifecycle:outcome
5e42d88d OB-199 Phase 3: Canonical writer module + structural contract enforcement + clamp removal
ff55872c OB-199 Phase 2: Registry consolidation + confidence_required schema
7dead762 OB-199 Phase 1: Producer normalization + AIPlainInterpreter class deletion
c6d867ea OB-199 Phase 0 amend: AUD-006 §2.4 grep blind-spot + Option (b) disposition
31908fc3 OB-199 Phase 0: Architecture Decision Record
```

---

## Test Plan

- [x] All 45 tests green at HEAD `29fdfff8` (`npm test` in `web/`)
- [x] `npx tsc --noEmit` produces only the pre-existing `round-trip-closure/run.ts:286` error (unrelated to OB-199)
- [x] Coverage-trust grep: 4 production `.from('classification_signals').insert(...)` sites all in `canonical-signal-writer.ts`
- [x] Coverage-trust grep: `sciVersion: '2.0'` confined to `classification-signal-service.ts` facade module
- [x] AUD-007 evidence surface produced (51 files, 8485 lines)
- [x] Four ARCHITECT VERIFY rows dispositioned (Row 3 accept; Row 4-sub Supplement C; Row 6 Supplement B; Row 8-sub-A Supplement A)
- [ ] Phase 5 production wipe (architect-executed post-merge + deploy)
- [ ] Post-wipe verification of SCI markers + Decision 30 v2 in-range confidence persistence

🤖 Generated with [Claude Code](https://claude.com/claude-code)
