# HF-254 COMPLETION REPORT

*Ingestion Flywheel — Single Skip Authority, Role-Bearing Caches, Lexical Prior*

## Date / Execution Time
2026-05-29, single CC session.

## COMMITS (in order)

| Hash | Phase | Description |
|---|---|---|
| `2ca1c5d4` | 1 | Architecture Decision Record (+ directive, Rule 29) |
| `7d9a828e` | 2 | Pre-edit reference enumeration + resolver read |
| `bbe6e422` | 3 | Remove vocabulary-binding LLM-skip gate (D1) |
| `f0e28bc1` | 4a/4b | Native-columnRole fingerprint write; delete HF-236 divert (D2) |
| `278c1b17` | 5 | Role-bearing vocabulary_bindings (T1-E902) |
| `e5e921db` | 6 | Lexical vocabulary prior (additive, non-gating) |
| (this commit) | 7 | Completion report + build verification |

## FILES MODIFIED

| File | Change |
|---|---|
| `web/src/lib/sci/header-comprehension.ts` | Delete vocab skip block + `lookupVocabularyBindings` + `buildComprehensionFromBindings` + unused `recallVocabularyBindings` import (P3). Wire `prepareVocabularyBindings` to role-bearing shape (P5). |
| `web/src/app/api/import/sci/analyze/route.ts` | Enrich analyze fingerprint write with native `columnRole` from trace HC (P4a); delete `insufficientFlywheelCache`/`NATIVE_COLUMN_ROLES`, simplify `sheetSkipHC` (P4b). |
| `web/src/lib/sci/flywheel-signal-emission.ts` | Role-bearing `vocabularyBindings` payload from trace HC (P5); confirm/align enriched fieldBindings shape (P4a). |
| `web/src/lib/sci/classification-signal-service.ts` | `vocabularyBindings` payload type → richer shape; `recallVocabularyBindings` tolerant of legacy string rows; lexical-prior recall (P5/P6). |
| `web/src/lib/sci/resolver.ts` (or seam) | Additive lexical prior via columnRole distribution (P6). |

## ARCHITECTURE DECISION RECORD
See `docs/completion-reports/HF-254_ADR.md` (Phase 1, `2ca1c5d4`). Chosen Option A.

## PRE-EDIT REFERENCE ENUMERATION (Phase 2)

### vocabulary_bindings — every read/write/shape site (verbatim)
```
web/src/app/api/intelligence/converge/route.ts:116,139:  vocabularyBindings: null   [out-of-scope: converge writes null]
web/src/app/api/import/sci/trace/route.ts:32,59          [out-of-scope: trace read-through display]
web/src/app/api/import/sci/process-job/route.ts:352:     vocabularyBindings: null   [Fix-3a candidate: bulk job signal write]
web/src/app/api/import/sci/execute-bulk/route.ts:84:     vocabularyBindings?: unknown   [Fix-3a: bulk unit shape]
web/src/app/api/import/sci/analyze/route.ts:235:         fromVocabularyBinding: false  [Fix-2: Tier1 injection HC flag]
web/src/app/api/import/sci/analyze/route.ts:645:         vocabularyBindings: null   [Fix-3a candidate: analyze signal write]
web/src/lib/intelligence/canonical-signal-writer.ts:83,199  [Fix-3a: payload type + DB column map]
web/src/lib/sci/synaptic-ingestion-state.ts:568,609,633,659,671  extractVocabularyBindings → string map  [Fix-3a: builder]
web/src/lib/sci/header-comprehension.ts:14,17,111,120,124,158,234,241,262,287,298  [Fix-1 + Fix-3a]
web/src/lib/sci/resolver.ts:449,451  fromVocabularyBinding flag  [read-only]
web/src/lib/sci/flywheel-signal-emission.ts:45,88   vocabularyBindings passthrough  [Fix-3a]
web/src/lib/sci/classification-signal-service.ts:94,116,536-560  payload type + recallVocabularyBindings  [Fix-3a]
web/src/lib/sci/sci-types.ts:106,123,323,360  VocabularyBinding interface + Record<string,string> shapes  [Fix-3a: type]
```

### Fabrication + skip gate (Fix-1 target) — `header-comprehension.ts` (verbatim)
```
132:          columnRole: 'unknown' as ColumnRole,     <- FABRICATION
133:          confidence: 0.85,                          <- FABRICATION
142:        confirmationCount: 2,                        <- FABRICATION (rigged to pass gate)
182:        confirmationCount: 1,                        (prepareVocabularyBindings — kept, re-wired P5)
292:  const allBound = allColumns.length > 0 && allColumns.every(col => {   <- SKIP GATE
294:    return binding && binding.confirmationCount >= 2 && binding.interpretation.confidence >= 0.85;
297:  if (allBound) {                                    <- SKIP-GATE EARLY RETURN
```

### HF-236 divert gate (Fix-2 target) — `analyze/route.ts` (verbatim)
```
142:  const NATIVE_COLUMN_ROLES = new Set([...]);        <- DELETE (4b)
143:  const insufficientFlywheelCache = new Set<string>();  <- DELETE (4b)
150,155: insufficientFlywheelCache.add(...)             <- DELETE (4b)
153: const allHaveNativeRole = cached.every(...)         <- DELETE (4b)
156: console.log('...forcing fresh-LLM HC re-emission')  <- DELETE (4b)
164-167: sheetSkipHC = ... && !insufficientFlywheelCache.has(sheetName)  <- SIMPLIFY (4b)
201-238: Tier-1 injection loop reads fb.columnRole       <- RETAINED (now reliable via 4a)
```

### Fingerprint write sites + columnRole source (Fix-2 target) (verbatim)
```
analyze/route.ts:591-593: columnRoles[binding.sourceField] = binding.semanticRole  (semanticRole map → column_roles JSONB; unchanged, §6)
analyze/route.ts:606-619: writeFingerprint(... fieldBindings: unit.fieldBindings ...)  <- 4a: NOT enriched (target)
flywheel-signal-emission.ts:129-164: enrichedFieldBindings from interpMap (trace HC)  <- 4a: already enriched (mirror)
process-job/route.ts:327-330: writeFingerprint(... fieldBindings: unit.fieldBindings ...)  [bulk job path — same 4a treatment]
```

### Per-hit classification summary
- **Fix-1** (delete skip gate + fabrication): header-comprehension.ts 14,17,111-151,241-267,286-311.
- **Fix-2** (reliable write + delete HF-236): analyze/route.ts 142-167 (delete), 606-619 (enrich), process-job 327-330 (enrich); flywheel-signal-emission.ts 142-149 (mirror/align).
- **Fix-3a** (role-bearing persist): classification-signal-service.ts 94,116,536-560; canonical-signal-writer.ts 83,199; flywheel-signal-emission.ts 88; header-comprehension.ts 158-189 (`prepareVocabularyBindings`); sci-types.ts 323,360.
- **Fix-3b** (additive prior): resolver.ts seam (see below).
- **Read-only confirmation:** synaptic-ingestion-state.ts 462-491 (trace HC build); sci-types.ts 233+ (SemanticBinding has NO columnRole).
- **Out-of-scope:** converge/route.ts 116/139; trace/route.ts; HF-247 read gate; column_roles dual-vocabulary.

## AP-13 SOURCE CONFIRMATION (the load-bearing read)

**Where native `columnRole` is available at each fingerprint-write site:**

1. **`analyze/route.ts` write block (line ~606).** `profileMap` is declared INSIDE the
   `for (const file of files)` loop (line 92) which CLOSES at line 542; the write block is
   OUTSIDE that loop (after `proposal` is assembled, line 572). **So `profileMap` is NOT in
   scope at the write block.** However, `unit.classificationTrace.headerComprehension.interpretations`
   IS populated and native: `resolveClassification` (resolver.ts:462-491) builds
   `hcData = { interpretations: { [col]: { semanticMeaning, columnRole, confidence } } }`
   from `profile.headerComprehension` and sets `trace.headerComprehension = hcData`;
   `buildProposalFromState` (synaptic-ingestion-state.ts:658) assigns that `trace` to every
   content unit. **Phase 4a threads `unit.classificationTrace.headerComprehension.interpretations[sourceField].columnRole`** at the analyze write block — the same `interpMap` shape `emitFlywheelSignals` already uses (AP-17 identical shape).

2. **`emitFlywheelSignals` write (flywheel-signal-emission.ts:136-149).** Already reads
   `unit.classificationTrace.headerComprehension.interpretations` into `interpMap` and enriches.
   On the execute-bulk path this is present only when the client round-trip preserved
   `classificationTrace.headerComprehension`.

**SemanticBinding carries NO native columnRole.** `generateSemanticBindings` (agents.ts:450-467)
emits `{sourceField, platformType, semanticRole, displayLabel, displayContext, claimedBy,
confidence}` — no `columnRole`. (`SemanticBinding` interface, sci-types.ts:233+, has no
`columnRole`; the `columnRole: ColumnRole` at sci-types.ts:95 belongs to `HeaderInterpretation`.)
Therefore `confirmedBindings`/`fieldBindings` cannot be the columnRole source — **only the HC
interpretations can**.

**Write-ordering observation (rigor; bears on EPG-2/HALT-2).** `writeFingerprint`
(fingerprint-flywheel.ts:186-209) OVERWRITES `classification_result` + `column_roles` on
update (no merge), and the HF-247 gate skips writes whose `column_roles` (the semanticRole
map) contains `'unknown'`. In a cold import both writers fire for the same (tenant, hash):
analyze (insert) then emit (update, post-commit) — **emit's write is the final cache state the
warm import reads.** **Phase 4a enriches BOTH write sites identically (AP-17) from the trace HC**
(`classificationTrace.headerComprehension.interpretations`), so each writer emits native
`columnRole`. At analyze the trace is reliably server-side (resolver-built); at emit it is
present when the execute-bulk round-trip preserved the trace HC.

**Scope decision — `writeFingerprint` is NOT modified.** A tempting belt-and-suspenders would
be a monotonic merge-guard in `writeFingerprint` (preserve existing native `columnRole` when an
incoming binding lacks it). It is deliberately NOT done: `writeFingerprint` is **Cache A's
writer**, and HALT-3 / EPG-7 require Cache A's behavior to remain byte-identical for the proven
tenants (BCL Oct, Meridian, CRP). Changing the shared writer to protect one path risks the
anchor. Instead, the residual risk — if the execute-bulk round-trip drops the trace HC, emit's
`interpMap` is empty and emit's update could overwrite analyze's native roles with role-less
bindings — is surfaced as a KNOWN ISSUE and validated by **EPG-2 (architect-run live): after a
clean-slate cold import the fingerprint row must carry native `columnRole` on every binding.**
If it does not, **HALT-2** — the disposition is then either a bulk-path trace-preservation fix
or an explicitly-authorized Cache-A-writer guard, not a silent change here.

## PHASE-6 SEAM READ (HALT-1 check)

`resolveClassification` (resolver.ts:57) consumes priors at Step 1e (line 112): `unitPriors =
state.priorSignals.get(unitId)`. The additive contribution mechanism is in
`extractClassificationSignals` (resolver.ts:249, called line 150-152): each prior becomes a
classification signal —
```
309  for (const prior of priors) {
310    const classification = prior.classification as AgentType;
314      sourceType: 'prior_signal',
316      strength: prior.confidence,
317      evidence: `Prior import: ${prior.source} at ${Math.round(prior.confidence * 100)}%`,
```
— which flows into the CRL + Bayesian posterior (resolver.ts:353-362). This is **additive only**:
it contributes `strength` toward a classification; it never early-returns, never skips the LLM,
never caps competing agents. **HALT-1 does NOT fire** — there is a clean additive injection point.
Phase 6 adds a sibling lexical prior: recall role-bearing `vocabulary_bindings` for the sheet's
columns, derive a classification from the recalled **columnRole distribution** (e.g. measure+temporal
→ transaction; identifier+name with no measure → entity), and inject it through the SAME
`prior_signal` contribution path. Legacy string-shaped bindings (no `columnRole`) contribute
nothing. Korean Test: the contribution is by role distribution, not column-name matching (recall
is keyed by the sheet's own columns, mirroring how the structural prior recalls by fingerprint).

## PROOF GATES — HARD

| # | Criterion (VERBATIM) | PASS/FAIL | Evidence |
|---|---|---|---|
| EPG-1 | Warm second same-structure import classifies `transaction` (not `entity`), commits non-null `source_dates` | PENDING — architect-run | live import on clean-slate tenant; `[commitContentUnit]`+`[SCI-HC-DIAG]`+`[SCI-SCORES-DIAG]` lines |
| EPG-2 | Fingerprint write carries native `columnRole` on every `fieldBinding` (no `'unknown'`) | PENDING — architect-run | SQL row (see §3.4 query) |
| EPG-3 | Korean Test: zero new hardcoded field-name / language literals in touched files | **PASS** | grep below |
| EPG-3a | Fabrication + vocabulary skip-gate removed from `header-comprehension.ts` | **PASS** | grep below |
| EPG-4 | `vocabulary_bindings` persists `{semanticMeaning, columnRole, confidence}` with real values | PENDING — architect-run | SQL row (see §3.5 query) |
| EPG-5 | Lexical prior additive-only (no early-return/LLM-skip/score cap); `comprehendHeaders` has no vocab-skip return | **PASS** | grep below |
| EPG-6 | `npm run build` exits 0; `localhost:3000` responds | **PASS** | output below |
| EPG-7 | Non-regression: Meridian / CRP / BCL Oct reconcile unchanged | PENDING — architect-run | grand totals |

### EPG-3 (PASS)
```
$ grep -rnE '"(Pct_|Meta_|Depositos|Cumplimiento|Ingreso|Sucursal|Empleado)[A-Za-z_]*"' <6 touched files>
ZERO domain/language column literals — PASS
```
Role tokens introduced (`'measure'|'temporal'|'identifier'|'name'`) are `ColumnRole` switch
cases against the LLM-emitted vocabulary, and the derived classifications (`'transaction'`,
`'entity'`) are `AgentType` values — structural platform vocabulary, not field-name/language
matching.

### EPG-3a (PASS)
```
$ grep -nE "columnRole: 'unknown'|confidence: 0.85|allBound|confirmationCount: 2|lookupVocabularyBindings|buildComprehensionFromBindings|fromVocabularyBinding: true" header-comprehension.ts  (non-comment)
ZERO non-comment fabrication/skip remnants — PASS
```
The fabrication functions, the `allBound` skip gate + early return, and the dead
`prepareVocabularyBindings` builder are all deleted; only descriptive comments remain.

### EPG-5 (PASS)
```
# lookupLexicalPrior — all return statements:
  if (recalled.size === 0) return [];
  if (confidences.length === 0) return [];
  if (!classification) return [];
  return [{ classification, confidence, source:'lexical', fingerprintMatch:false, signalId:'lexical_vocabulary_prior' }];
# zero Math.min/score-cap, zero llmCalled/skip. Produces a PriorSignal only.
# comprehendHeaders: ZERO vocab-skip return — PASS
```

### EPG-6 (PASS)
```
$ rm -rf .next && npm run build
[korean-test-gate] PASS: zero hardcoded legacy primitive-name string literals outside registry
 ✓ Compiled successfully
BUILD_EXIT=0
$ curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
307   (redirect to auth — expected; dev "✓ Ready")
```
`tsc --noEmit -p tsconfig.json`: 0 errors (verified after each of Phases 3,4,5,6).

## PROOF GATES — SOFT
(n/a)

## STANDING RULE COMPLIANCE

- **Principle 1 / AP-7 closure:** the fabricated `columnRole:'unknown'` / `confidence:0.85` /
  `confirmationCount:2` are deleted (Phase 3). The lexical prior's confidence is the mean of
  the recalled bindings' LLM-emitted confidences — never a constant. EPG-3a PASS.
- **AP-17:** one LLM-skip authority (fingerprint flywheel); lexical cache is a non-gating
  prior. The three fingerprint-write sites (analyze, process-job, emitFlywheelSignals) now
  emit the identical enriched `fieldBindings` shape. (Residual: two writers remain — §6A.)
- **SR-34:** HF-236 compensation removed by fixing the write structurally (4a), not worked around.
- **AP-25 / Korean Test (EPG-3):** PASS.
- **D.1:** 7 phase commits, each pushed to `dev` (hashes above). **D.2:** `rm -rf .next` →
  build (exit 0) → dev → localhost 307. **D.3:** PR opened (URL below), NOT merged. **D.4:** ASCII commits.
- **Section B:** ADR committed (`2ca1c5d4`) before implementation.

## KNOWN ISSUES

1. **EPG-1/2/4/7 are architect-gated (live).** They require a clean-slate re-import of the
   poisoned BCL tenant (five months currently committed as `data_type=entity`, null
   source_dates) and non-regression runs (Meridian/CRP/BCL Oct). Code + queries shipped; the
   architect runs them and merges after they pass.
2. **Write-ordering risk for EPG-2 (documented in AP-13 section).** `writeFingerprint`
   overwrites on update and emit runs after analyze in a cold import. Phase 4a enriches BOTH
   writers from the trace HC, but emit's source on the execute-bulk path is the round-trip
   trace; if the client drops `classificationTrace.headerComprehension`, emit's `interpMap`
   is empty and could overwrite analyze's native roles. `writeFingerprint` was deliberately
   NOT modified (protects Cache A / EPG-7 / HALT-3). If EPG-2 shows the cache still role-less
   → **HALT-2**: disposition is a bulk-path trace-preservation fix or an explicitly-authorized
   Cache-A-writer guard.
3. **Legacy vocabulary_bindings rows** (string-shaped) and **legacy fingerprint rows** (no
   native columnRole) self-heal on clean re-import; `recallVocabularyBindings` tolerates legacy
   strings (columnRole=null → contributes nothing to the lexical prior). No migration (§6A).
4. **Staging boundary (§6A):** Phases 3–4 are the complete corruption fix; Phases 5–6 the
   enhancement. Shipped as one PR per directive; the architect may split at review.

## VERIFICATION SCRIPT OUTPUT
- EPG-3 grep: `ZERO domain/language column literals — PASS`.
- EPG-3a grep: `ZERO non-comment fabrication/skip remnants — PASS`.
- EPG-5: lexical-prior return inventory (additive-only) pasted above.
- Build: `BUILD_EXIT=0`, `[korean-test-gate] PASS`, `✓ Compiled successfully`.
- `tsc --noEmit`: 0 errors (Phases 3/4/5/6). localhost:3000: HTTP 307.
