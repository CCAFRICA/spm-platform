# OB-203 — Completion Evidence (per-phase, appended)

Design authority: `docs/design-specifications/DS-027_Ingestion_Comprehension_Signal_Spine_20260610v2.md` (v0.2 LOCKED, HALT-1 disposition 2026-06-10).

---

## PHASE 0 — Reads, Premises, Baseline

### 0.1 Reads — DONE
- DS-027 v0.2 (…v2.md) read end-to-end; DI-1…DI-10, R1/R2/R3, the unit state machine, the workbook graph, and the §4.4 observer experience confirmed present. v0.1 marked SUPERSEDED; authority/path corrected (PR #478, `b4e851b4`).
- `CC_STANDING_ARCHITECTURE_RULES.md` and this directive read. `SCHEMA_REFERENCE_LIVE.md` consulted for the surfaces below.

### 0.2 Number confirmation — OB-203 UNCLAIMED
```
docs/vp-prompts OB numbers (tail): OB-197 OB-198 OB-199 OB-200 OB-203
git log OB numbers (last 40): (none)
prior OB-203 work: directive + this evidence only — no prior implementation/commits.
```

### 0.3 Surface inventory + consumer enumeration (DD-1)

**Fallback site (the defect locus):** `src/lib/sci/header-comprehension.ts`
```
:83  console.log('[SCI] Header comprehension JSON parse failed (AIService fallback). duration=...')
:96  console.log('[SCI] Header comprehension error (falling back to heuristics):', ...)
:204 return { ..., llmCalled: false }   // silent heuristic fallback return
```
Driven from `src/app/api/import/sci/analyze/route.ts:226` (`[SCI-HC-DIAG] llmCalled=... avgConf=... cols=... insights=...`).

**Proposal payload type:** `ContentUnitProposal` — `src/lib/sci/sci-types.ts:301-337`; built by `buildProposalFromState()` — `src/lib/sci/synaptic-ingestion-state.ts:517-665`.

**Consumers of `ContentUnitProposal[]` (classify before any type change — HALT-4 guard):**

| Consumer | file:line | Role |
|---|---|---|
| Import page state machine | `src/app/operate/import/page.tsx:22,36,321,353` | UI orchestration / confirm-all |
| SCI analyze route | `src/app/api/import/sci/analyze/route.ts:28,78,532` | builds proposal (in-line path) |
| SCI analyze-document route | `src/app/api/import/sci/analyze-document/route.ts:15,189` | manual proposal construction |
| SCI process-job route | `src/app/api/import/sci/process-job/route.ts:20,283` | builds proposal (job path) |
| SCIProposal component | `src/components/sci/SCIProposal.tsx:12,62,325,360` | **renders per-unit card** (`ContentUnitCard`) |
| SCIExecution component | `src/components/sci/SCIExecution.tsx:11,49,51` | confirmed-units execution |
| SCIProposal interface | `src/lib/sci/sci-types.ts:287` | `contentUnits: ContentUnitProposal[]` |

**Unit/resolution shapes** (`synaptic-ingestion-state.ts`): `SynapticIngestionState` (:30-58, in-memory Maps), `ContentUnitResolution` (:64-72, fields incl. `decisionSource: 'signature'|'heuristic'|'llm'|'prior_signal'|'human_override'|'hc_pattern'`), `ClassificationTrace` (:80-141, the flywheel raw material, incl. `headerComprehension` block :97-105 with `llmCalled`).

**Canonical signal surface (DI-6/G7):** `src/lib/sci/classification-signal-service.ts` — `writeClassificationSignal()` (:101-128) → delegates to `@/lib/intelligence/canonical-signal-writer` `writeSignal()` → inserts `.from('classification_signals')`. This is the SCI canonical write path (OB-199 Phase 4 facade). The sibling `src/lib/intelligence/classification-signal-service.ts` (`recordSignal`) is the legacy field-mapping path — same table, same canonical writer. **One table: `classification_signals`.**
Existing `comprehension:`-family signal_types in use: `comprehension:header_binding`, `comprehension:plan_interpretation` (Phase 1's `failed_interpretation` joins this family).

**Fingerprint store (sheet-level):** table `structural_fingerprints`; reads/writes in `src/lib/sci/fingerprint-flywheel.ts` (read/Tier-1 :43-49; write :180/:194/:213; `column_roles` side-car at :219). **No per-column (atom) store exists** (Phase 2 extends this — the one expected migration surface, HALT-7 bound).
- **HF-247 gate** — read demote `fingerprint-flywheel.ts:68`; write skip `:171`.
- **HF-254 injection** — `src/app/api/import/sci/analyze/route.ts:196-204` (native `columnRole` from cached binding → headerComprehension interpretations).

**Import proposal UI:** `src/app/operate/import/page.tsx` (state machine) → `src/components/sci/SCIProposal.tsx` `ContentUnitCard` (:61-150 renders classification badge/confidence/verdict). **No dedicated `failed_interpretation` rendering path exists** (Phase 1 adds it); current near-miss handling via `needsReview` (`SCIProposal.tsx:83`).

### 0.3 HALT-2 existence check — CLEAR (no in-scope surface pre-exists)
| In-scope surface (OB introduces) | Status | Evidence |
|---|---|---|
| (a) durable comprehension **failure surface** | **ABSENT** for SCI sheet/atom comprehension — only a console.log fallback (`header-comprehension.ts:83/:96`). A *distinct, narrower* mechanism exists for **plan-component** failures only: `interpretation-errors.ts` → `import_batches.error_summary` (`reimport-resume.ts:197`) — different boundary, different table. Phase 1 must not duplicate it; the new failure signal lands on `classification_signals` (G7). |
| (b) atom-level (per-column) fingerprint store | **ABSENT** — `StructuralFingerprint` is sheet-level aggregate only; no column-level table. |
| (c) durable comprehension session | **ABSENT** — `SynapticIngestionState` is in-memory (`crypto.randomUUID()`, Maps); no `ingestion_sessions` table; only plan-component resume via `reimport-resume.ts`. |
HALT-2 not triggered. The adjacent plan-component failure mechanism is recorded so Phase 1/3 integrate rather than duplicate.

### 0.4 Sentinel audit (feeds Phase 6 reconciliation)
Unresolved-role sentinel is the literal string `'unknown'` (primary), with `''` and `null`/`undefined` as fallbacks. Predicate, identical at both surfaces:
```ts
// fingerprint-flywheel.ts:68 (read/demote)  and  :171 (write/skip)
const hasUnknownRole = Object.values(columnRoles).some(
  role => role === 'unknown' || role === '' || role == null
);
```
Diagnostic surface renders `<col>:<role>@<conf>` — e.g. `[SCI-HC-DIAG] sheet=Plan General roles=[…:unknown@0.85, …]` (`fingerprint-flywheel.ts:62-63`, `analyze/route.ts:231-233`).
**Phase 6 note:** the predicate's `role == null` already catches `undefined`; the four pre-HF-247 poisoned Tier-1 fingerprints "carrying undefined roles" must be reconciled against how they are *stored* (string `'unknown'` vs missing key) — verified live in Phase 6 before retire/re-derive.

### 0.5 Baseline witness — **BLIND-HOLDOUT, architect-executed** (awaiting run)
Per the 2026-06-10 disposition correction and directive §2 L38 / §3.5 L50 / HALT-10, the real
file is **never supplied to CC or committed**. The architect runs the import in dev against a
sandbox tenant; CC captures the console stream + a service-role tsx read of the sandbox tenant's
post-run `structural_fingerprints` / `classification_signals` state, and records the file
**sha256 as architect-reported**. Protocol + capture record in `OB-203_BASELINE_20260610.md`.
The DS-027 §1 signature stands as the documented expectation until the live capture.
**Capture tooling staged:** build is green (exit 0) and dev serves `localhost:3000` (verified
prior session); the post-run DB read is a parameterized service-role tsx script run once the
architect provides the sandbox tenant_id. Awaiting the architect run.

### Phase 2-6 testing note (blind-holdout)
All Phase 2-6 tests run against a **seeded structural-analog generator** (built in Phase 2,
committed as code) — same structural class, randomized-token/non-Latin vocabulary, never real
tenant vocabulary; cross-vocabulary generality test included; EPG-2.2 pointed at a generated
analog; induced-failure exit witness uses a corrupted analog (§3.2 L68-70, §3.6 L101/L104).

**0.5 baseline — CAPTURED & CLOSED 2026-06-11** (architect-executed run; CC DB read). Findings in
`OB-203_BASELINE_20260610.md`: (A) client-timeout / R2 evidence — Run A proposal landed server-side
04:14:18 after the ~04:14 browser FETCH FAILED; (B) `Empleados → transaction @0.7555` reproduced,
now a learned prior; (C) fingerprint store is **TENANT-SCOPED** (hash `afb789d55ae5be4e` = separate
per-tenant rows, mc 2 vs 1); run tenant `3d354bfa-…` was warm (prior_signal, not cold-start);
(D) HF-247 13 skips architect-reported, baseline-consistent. sha256 pending per disposition.

**Phase 0 status: COMPLETE.** No HALT (2,3,4,7,10) triggered. Proceeding to Phase 1.

---

## PHASE 1 — Structured Failure Surface (DI-4 minimal, forward-compatible)

### Engine
At the comprehension-failure site (`header-comprehension.ts`), the silent `null` fallback is
retired: `callLLMForHeaders` now returns a discriminated outcome carrying a NAMED structural
failure class — `parse_failure` (unparseable response, :98), `schema_mismatch` (missing `sheets`
key, :104), `timeout`/`unclassified_failure` (thrown error, classified by `classifyThrownFailure`).
`comprehendHeaders` surfaces it as `metrics.failure = { failureClass, durationMs }`.

Both SCI routes (`analyze`, `process-job`) call `emitComprehensionFailureSignals(...)` after the HC
enhancement: one durable signal per affected sheet on the canonical surface — `signal_type:
'comprehension:failed_interpretation'`, `decision_source: 'failed_interpretation'`, `confidence: 0`,
file/sheet/structural-fingerprint via dedicated columns, failure class + duration + attempted tier
in `signal_value`. Fire-and-forget, per-sheet try/caught with loud error logging — a signal-write
failure never breaks the import (DI-1). The unit uses the Phase 3 state vocabulary
(`failed_interpretation`) from day one.

### Experience
`SCIProposal.tsx` splits `comprehendedUnits` / `failedUnits`. Failed units render in a distinct
section (sheet named, state plain "could not interpret", failure class + duration shown), are
EXCLUDED from the comprehended cards, from `confirmAll`, from `allConfirmed`, and from the
`onConfirmAll` payload that proceeds to execute. Summary line: "N of M sheets could not be
interpreted." No retry/resolution actions (Phase 5). Structural copy only.

### Tests (node --test) — 5 pass
```
✔ failed_interpretation signal lands on the canonical surface as a named state
✔ failed_interpretation signal tolerates a null fingerprint
✔ marks EXACTLY the fallback-signature units; comprehended units untouched
✔ no failure -> nothing marked (success-path payload byte-identical)
✔ classifyThrownFailure maps timeout signatures, else unclassified
```
Full suite: tests 96, pass 96, fail 0.

### EPGs
- **EPG-1.1 canonical surface, zero new tables:** the failure write routes through `writeSignal`
  (the single `.from('classification_signals').insert` entry point — G7/DI-6). Grep confirms NO new
  `.from('<table>')` introduced in the Phase 1 engine (`foundational_patterns`/`domain_patterns`
  hits are pre-existing `lookupPriorSignals`).
- **EPG-1.2 silent-path retirement:** `callLLMForHeaders` returns `{ ok:false, failureClass, duration }`
  (no `null`); `comprehensions:null` carries `metrics.failure`; the UI filters `comprehendedUnits =
  effectiveUnits.filter(u => !u.failedInterpretation)` — a failed unit can never render as comprehended.
- **EPG-1.3 DIAG-050 / DI-1:** the working-tree diff adds NO `committed_data`/staging condition; the
  persistence path is untouched (the exclusion is at the proposal/confirm layer, not the commit path).

### Build
`rm -rf .next && npm run build` → exit 0 (Middleware 76.9 kB). Dev `localhost:3000/login` → HTTP 200.

### PR
`OB-203-phase-1` — recorded on creation below.

---

## PHASE 1 → PHASE 2 TRANSITION (architect disposition 2026-06-11)

### Phase 1 production verification — PENDING (blind-holdout, SR-43)
PR #480 merged: **`750d3c41`**. Production verification is architect-executed: after deploy,
the architect imports the witness file against a sandbox tenant in production; CC queries
`classification_signals` for the run's `comprehension:failed_interpretation` rows (one per
affected sheet, dedicated columns correct, class/duration in `signal_value`) and pastes the
output here with the deploy SHA. UI render is secondary and may be unreachable for this file
class (known client timeout) — a reported `FETCH FAILED` is expected and does NOT fail
verification. Phase 1 completes on the signal evidence. _Awaiting the architect production run._

### Phase 2 ENTRY VERIFICATION — failed units DO reinforce priors (YES)
**Determination: a `failed_interpretation` unit still emits a reinforcing `classification:outcome`
signal.** Code evidence — the classification-signal write loop has NO comprehension-success /
`failedInterpretation` gate at either site:
```
analyze/route.ts:686-713      for (const unit of proposal.contentUnits) { ... writeClassificationSignal({ classification: unit.classification, confidence: unit.confidence, ... }) }
                              // only `if (!fp) continue` (plan units); NO failedInterpretation check
process-job/route.ts:377-382  for (const unit of contentUnits) { ... writeClassificationSignal({ ... }) }
                              // same — no failure gate
```
This explains the architect's evidence (global CRL 37→39 across failed baseline runs; the
`Empleados → transaction @0.7555` prior learned from failures). The Phase 1 `failedInterpretation`
flag IS present on these units at the write site (forward-compatible) but is not yet consulted.

**Absorbed into Phase 2 scope:** gate outcome-signal reinforcement on comprehension success — a
unit in `failed_interpretation` state must not write a reinforcing `classification:outcome`; a
blocked reinforcement emits a **DI-7 remediation signal** (never a silent skip).

### Absorbed scope — Phase 6 (architect disposition 2026-06-11)
**Contaminated CRR priors:** read-only assessment of `classification:outcome` prior contamination
from historical failed runs (e.g. the `Empleados` transaction prior), alongside the four poisoned
fingerprints (§0.4). The architect dispositions any purge/retrain. Read scripts only; no mutation
without architect-applied SQL (SR-44).

### Phase 2 atom-store design constraints (carried from Phase 0.5)
`structural_fingerprints` is TENANT-SCOPED (verified: hash `afb789d55ae5be4e` = separate per-tenant
rows). Atoms accumulate tenant-scoped on this existing surface; foundational/vertical-scope rows are
DI-10-constrained (bucketed structural features only, by construction — never raw values). HALT-7
bounds the migration to the atom extension. The seeded structural-analog generator is built in this
phase; no real tenant vocabulary appears anywhere in tests.

---

## PHASE 1 — CLOSED (production witness, blind-holdout) — deploy SHA `750d3c41`
Architect-executed run (architect-reported environment: production, sandbox tenant
`3d354bfa-b298-48dd-88a0-9f8c5a00be4e`; two runs 05:05:37 + 05:06:37 retry after `FETCH FAILED`
— expected client timeout, does not fail verification). Architect witness line:
`[OB-203] failed_interpretation: emitted 12 signal(s) class=parse_failure duration=67336ms`.

CC durable signal evidence — `classification_signals` query (signal_type
`comprehension:failed_interpretation`, since 05:00Z): **24 rows, 12 per run** (05:06:46 ×12 dur=67336ms;
05:07:47 ×12 dur=68191ms). Invariants verified across all 24: `decision_source='failed_interpretation'`,
`confidence=0`, `failureClass='parse_failure'`, `attemptedTier=3`, dedicated columns populated
(`sheet_name`, `source_file_name`, `structural_fingerprint.fingerprintHash`), `signal_value`
carries `{failureClass, durationMs, attemptedTier}`. One signal per affected sheet (12 of 16; the
other 4 were Tier-1 skips). Sheets: Sucursales, Productos_SKU, Resumen_{Sucursal,Mensual,Turno,
DiaSemana,Categoria,Producto,Menu,Empleado,Diario}, Ventas_Transaccional.
**Phase 1 verified in production and CLOSED.** Merge gate for the OB now reduces to EPG-2.4 (Phase 7 anchors aside).

## PHASE 2 — second reinforcement path located (architect disposition 2026-06-11 item 2)
Beyond the CRR outcome-signal sites (`analyze:686-713`, `process-job:377-382`), a SECOND
reinforcement path updates fingerprint match_count/confidence ungated on comprehension success:
```
fingerprint-flywheel.ts:154   writeFingerprint(...)
                  :190-191     const newMatchCount = existing.match_count + 1;
                               const newConfidence = 1 - (1 / (newMatchCount + 1));   // 0.6667→0.75→0.80→0.8333
                  :193-203     .update({ match_count: newMatchCount, confidence, classification_result, column_roles, ... })
                  :208         console.log('[SCI-FINGERPRINT] Updated: ... matchCount=N confidence=X')
```
Only the HF-247 unknown-role QUALITY gate (:167) guards it — NOT a comprehension-success gate. A
Tier-1-matched sheet reinforces on every import even when the import's comprehension failed.
**Phase 2 scope:** gate this update on comprehension success (same invariant as the CRR sites);
a blocked increment emits a DI-7 remediation signal, never a silent skip.

## PHASE 6 — poisoned/contaminated-fingerprint BEFORE-STATE (architect disposition item 3)
Captured 2026-06-11 (run tenant `3d354bfa`) as the retirement before-state — confidence climbed
across the FAILED production runs via the ungated second path:
```
hash=ffb69592f7b7  mc=5  conf=0.8333  unknownRoles=false  updated=2026-06-11T05:07:49Z   <-- reinforced across failed runs
hash=b42ee218cb37  mc=5  conf=0.8333  unknownRoles=false  updated=2026-06-11T05:07:49Z   <-- reinforced
hash=7707e8553823  mc=4  conf=0.80    unknownRoles=false  updated=2026-06-11T05:06:49Z   <-- reinforced
hash=afb789d55ae5  mc=2  conf=0.6667  unknownRoles=false  updated=2026-06-10T20:41Z      (not matched this run)
hash=53c893b312f5  mc=1  conf=0.50    unknownRoles=false  updated=2026-05-15
hash=53a25f072c9a  mc=1  conf=0.50    unknownRoles=false  updated=2026-05-15
afb789d55ae5* cross-tenant: 3d354bfa(mc=2,0.6667) · dbe3b308(mc=1,0.5)  [tenant-scoped, confirmed]
```
Phase 6 reconciliation (read-only assessment; architect dispositions purge/retrain): the CRR
`classification:outcome` prior contamination from historical failed runs, AND these reinforced
fingerprints, are evaluated against this before-state.

---

## PHASE 2 — (7) REINFORCEMENT-GATING (architect-reviewed + approved 2026-06-11)

**Contamination paths CLOSED as of this commit.** A failed run can no longer raise fingerprint
confidence or reinforce a CRR prior; every block is recorded on the canonical surface (DI-7),
never silent. **This commit stops the bleeding; it does not clean the wound** — Phase 6
reconciliation still owns the already-accumulated contamination (fingerprints at ~0.83, the
`Empleados → transaction` prior).

Both live reinforcement paths gated on comprehension STATE (`failed_interpretation`), not confidence:
- fingerprint flywheel: `analyze/route.ts:608`, `process-job/route.ts:345` (skip `writeFingerprint`)
- CRR outcome prior: `analyze/route.ts:700`, `process-job/route.ts:384` (skip `writeClassificationSignal`)

Gate predicate `shouldReinforceUnit(unit) = !unit.failedInterpretation` — Tier-1/atom-resolved units
(no flag) ARE comprehension successes and reinforce (flywheel growth not frozen). Blocked writes emit
`comprehension:reinforcement_blocked` with `signal_value.blocked_surface ∈ {crr_outcome, fingerprint_update}`
(DI-7). State is available at all four sites (`markFailedInterpretationUnits` runs during proposal
assembly, before the loops) → no HALT.

Tests (executable evidence): `shouldReinforceUnit` state-keyed (failed→block, comprehended/Tier-1→reinforce);
**ordering witness** — runs the real mark→gate sequence and asserts the gate sees the populated flag, with
a control proving the ordering is load-bearing (unmarked unit would reinforce). Full suite 117 pass / 0 fail;
build exit 0.

---

## PHASE 2 — (5b) FULL DECOMPOSED-DISPATCH SWAP (architect-approved 2026-06-11)

The single all-sheets `enhanceWithHeaderComprehension` call in BOTH SCI routes (`analyze`,
`process-job`) is replaced by `runDecomposedComprehension`: atom read-before-derive → known atoms
claim roles (no LLM) → only novel residue comprehended (bounded, one repair retry) → per-unit
`failed_interpretation` (sibling units proceed) → `writeAtoms` gated by success (hold a). `profile.
headerComprehension` reconstructed to the EXACT current shape.

**Deviation 1 (approved):** known-atom interpretations use the Tier-1 precedent shape
`{ columnRole: role, semanticMeaning: role, dataExpectation: '', confidence }` — structural labels
for structural recognition (DI-10). Regression test (`deviation1-currency-suppression.test.ts`) pins
the analysis: `isNonMonetaryMeasureMeaning` (the gate inside `suppressFalseCurrencyColumns`) returns
false for every structural role label and true for rich LLM `semanticMeaning` — so currency
suppression fires on novel/LLM columns and never on atom-recognized columns. Executable, not narrative.

**Deviation 2 (approved):** atom features derive from FULL-column data, not the 5-row HC sample —
load-bearing for DI-2 (cardinality/residue accuracy) and DI-8 (stable cross-period identity). The
routes pass full `s.rows` to `runDecomposedComprehension`; the LLM residue input remains
sample-bounded (≤5 rows, novel columns only), so per-call LLM cost is unchanged while atom identity
is computed on the whole column.

**No proposal-contract change:** `ContentUnitProposal.failedInterpretation` stays per-unit
`{ failureClass, durationMs }`; the only change is that classes may now differ per sheet (per-unit
failure from the decomposed dispatch — strictly more correct). The 7 enumerated consumers are
unaffected. `markFailedInterpretationUnits` retired from the routes (per-sheet marking inline);
`enhanceWithHeaderComprehension` retains a dormant export (no callers).

Verification: tsc clean; full suite **121 pass / 0 fail**; build exit 0. Live validation is EPG-2.4
(the two-run Meridian protocol) — the gate.

---

## PHASE 2 — (8) EXPERIENCE: recognition provenance + EPG-2.3 (architect-approved 2026-06-11)

Additive optional field `recognitionProvenance?: { recognizedFraction, novelCount, llmCalled }` on
`ContentUnitProposal` (Phase 1 `failedInterpretation` pattern). Routes set it from
`runDecomposedComprehension`'s provenance map; `SCIProposal` renders a compact
"{pct}% atoms · {n} new · no LLM" chip on each card.

**Condition (a) — seven consumers compile unchanged (evidence, not precedent):**
- `tsc --noEmit` exit 0 — all consumers compile with the additive field.
- The untouched consumers ignore it: `page.tsx`, `analyze-document/route.ts`, `SCIExecution.tsx`
  contain ZERO references to `recognitionProvenance` (grep). The touched ones (`analyze`,
  `process-job` set it; `SCIProposal` renders it; `sci-types` declares it) compile.

**Condition (b) — renders only when present:** the chip is inside `{unit.recognitionProvenance && (…)}`
— legacy-shaped units render nothing (no placeholder).

**EPG-2.3 (DIAG-050):** the (8) diff adds NO `committed_data`/staging comprehension condition; the
persistence path remains free of comprehension state (DI-1). Verified by diff grep.

Verification: tsc clean; full suite **121 pass / 0 fail**; build exit 0.

---

## EPG-2.4 v2 — verification (2026-06-11)

**Item 1 — clear SUCCEEDED (not a failure).** Every sandbox `structural_fingerprints` row was
created at **16:31:01Z**, 3.5h AFTER the CC clear (~12:58Z). The clear deleted all prior state; the
architect's "warm Run 1" is because an earlier COLD import already ran at 16:31 (creating the mc=1
fingerprints) before the pasted Run 1 — an extra/unlogged import on the architect side, not surviving
state. The tenant was genuinely cold at clear time.

**Item 2 — atom WRITE WITNESS SATISFIED (Run 3).** Run 3 (modified) put `Datos_Rendimiento` at
sheet-Tier-3 → decomposed dispatch ran (20 cols @0.94, 19.7s) → **12 atom rows written**
(`granularity='atom'`, created 16:34:31-36Z): role histogram `{measure:7, name:1, attribute:3,
temporal:1}` — the 20 columns collapse to 12 distinct atom shapes (12 measures share a few
integer/decimal/mixed atoms). `atom_features` present (buckets only), DI-10-clean. **Zero
`comprehension:atom_write_failed` signals** — the write fix holds.

**Item 3 — atom READ not witnessed.** At Run 3 the atom store was empty (atoms written DURING Run 3),
so all 20 columns were novel residue, not partial recognition. Needs RUN 4: a 2nd modified file
(different new column) on the CURRENT state (the 12 atoms must remain — no re-clear) so
`Datos_Rendimiento` goes sheet-novel again with the 12 known atoms + 1 novel.

**Item 4 — new findings (recorded, not silent):**
- (a) `[HF-263 CPI] entity_relationships upsert 'ON CONFLICT DO UPDATE cannot affect row a second
  time'` — fired all 3 runs. **PRE-EXISTING** (HF-263 PostCommitConstruction; Phase 2 did not touch
  execute-bulk/relationship construction). Registry item, not a Phase 2 regression.
- (b) `Hub` role flap (name→reference_key→attribute) + transaction `entity_id_field` flip
  (none→Hub→none): classification instability on a genuinely ambiguous column → **Phase 6/D3 scope**
  (workbook-graph relational resolution). Recorded.
- (c) fingerprint match_count increments **twice per import** (analyze writeFingerprint + post-execute
  writeFingerprint) — confidence inflation, **PRE-EXISTING** (both paths predate Phase 2). Flag for
  assessment. (Also observed: atom match_count increments once per same-shape column within one
  import — a same-import multiplicity to assess.)

**Item 5 — positives:** workbook-level partial recognition live (Run 3: Plantilla + Datos_Flota_Hub
stayed sheet-Tier-1 while only the modified `Datos_Rendimiento` was comprehended); `llmCallDuration`
metric fix verified (19747ms real, was 0). Classifications stable & correct: entity / transaction /
reference across all runs.

---

## ABSORBED SCOPE — Phase 5: client-tier silent failure (architect disposition 2026-06-11)

**New failure class (from the RUN-4 stall):** a client/session-side upload/parse/analyze-fetch hang
produced an **infinite spinner with zero user feedback** — DI-4 violated at the CLIENT boundary
(the server-side comprehension-failure surface, Phase 1, does not cover failures that never reach
the server).

**Absorbed into Phase 5** (observer import experience rebuild). **Scope assessment: FITS Phase 5,
does not exceed it** — Phase 5 already rebuilds the import dialogs as state observers with DI-4
failure surfaces; this extends the SAME surface to the client tier. No new tables, no engine change,
no new infrastructure — a UI error-state addition on the upload→analyzing→proposal lifecycle.

**Phase 5 requirement (DI-4 at the client boundary):** upload / parse / analyze-fetch failures and
timeouts MUST render a user-perceptible error state stating *what was encountered* and a *suggested
action* (retry / check file / restart) — never an indefinite spinner. Concretely: a timeout + catch
on the analyze fetch in the import UI (`operate/import/page.tsx` + `SCIUpload`), surfacing the
error state with the failure reason. (No HALT — within Phase 5 as scoped.)

---

## RUN-4 FIX — atom role-claim soundness (A+B+C, architect-ratified 2026-06-11)

Root cause (RUN-4 structural read): exact-hash claim over coarse features → structurally-similar
columns collapse to one atom; numeric IDs typed `integer` collide with integer measures; free-text
collides with names; `writeAtoms` last-write-wins corrupted the role (`No_Empleado:identifier`
overwritten to `measure`). D1 over-claim → D2 profile regression (`idRepeatRatio 4.02→0.00`) → D3
posterior collapse (`transaction 85%→39%`).

- **(A) discriminative features** (`atom-fingerprint.ts`, **ATOM_ALGORITHM_VERSION 1→2**): added value
  `lengthBucket` (mean) + `lengthVarBucket` (coefficient of variation). Separates ID-shape (uniform
  length) from measure-shape (varied), and name (medium/low-var) from free-text (xlong/high-var).
- **(B) role-stability gating** (`atom-flywheel.ts`): `resolveAtomRole` — a conflicting role makes the
  atom `ambiguous`; `knownAtomHashes` excludes ambiguous → the column is **comprehended, never
  asserted** (hints-not-gates at the atom layer; DI-3 preserved). Kills the `No_Empleado:measure`
  degradation at the source.
- **(C) observability** (`comprehension-planner.ts`): per-atom `[OB-203][atom-claim] … CLAIMED/NOVEL`
  + per-sheet `[OB-203][atom-residue]` — claims never silent again (DI-4 spirit).

**Tests (analogs), 6 new:** conflicting-role→ambiguous + once-ambiguous-always + agreeing-preserved;
ambiguous never claimed; stability round-trip; free-text vs name separated by length; ID-shape vs
measure-shape differ; **DI-9 bridge** (v1 hash ≠ v2 hash, v1 not matched at v2). Full suite **127
pass**, build exit 0.

**DI-9 bridge — FIRST LIVE EXERCISE (evidence):** before reset, the 12 prior-version atoms were
`algorithm_version=1`, **readable** by direct query; `lookupAtoms(v2)` over their hashes returned
**0 matched** — version-isolated, not stranded, re-derive cleanly. Then full reset → VERIFIED COLD
(structural_fingerprints 0, committed_data 0, classification_signals 0).

### Recorded (architect disposition)
- **(i) DI-3 refinement:** *structure determines identity; role requires stability evidence.* ICA
  capture candidate at arc close. The **Phase 6 workbook-graph** is the designed home of contextual
  role resolution — the `Hub` role-flap AND this ID/measure ambiguity both route there (relational
  context settles what structure cannot).
- **(ii) Phase 6 reconciliation metric — ambiguity-rate:** if the ambiguous-atom set grows large, the
  recognition moat erodes and relational resolution becomes urgent. Track the `ambiguous` fraction of
  the atom store as a Phase 6 health signal.

---

## D5 FIX — recognition-confidence vs role-confidence decoupling (2026-06-11)

RUN-4 re-run PASSED the atom witness (role-stability live, no over-claim, READ witness 14/20 & 15/21)
but surfaced **D5**: `Datos_Rendimiento` classified `target@85` in Run 3 vs `transaction@85` in Run 4
on identical claimed roles. Root: the planner claimed a known atom at `k.confidence` — the **maturing
recognition** confidence (`1−1/(matchCount+1)`: 0.75→0.83…). Fed into the role-confidence-thresholded
pattern gate (`HC_OVERRIDE_THRESHOLD=0.80`), `Mes/Año` temporal confidence crossed 0.80 between runs →
temporal detection flipped → `entity_targets` (target) vs `event_transactions_temporal` (transaction).
Nondeterminism by maturation state. (`hasTx` follows; the `0441c426eab1` collision spanning
No_Empleado/Ingreso_Meta/Ingreso_Real correctly went ambiguous → comprehend — (B) working; **ambiguity
rate ~30%** recorded as the first Phase-6 datapoint.)

**Fix:** decouple. `KnownAtom.roleConfidence` (stored in `column_roles`, from the original
comprehension) is claimed — STABLE — instead of the recognition count. `knownAtomHashes` still gates on
*recognition* confidence (whether to claim); the claimed *role* confidence is the stable comprehension
value. Legacy atoms (no stored roleConfidence) fall back to `RECOGNIZED_ROLE_CONFIDENCE=0.9` — also
stable. `writeAtoms` keeps `max` role-confidence on agreement; ambiguity unaffected. **1 new test
(D5)** pins it: claim tracks role-confidence (0.98 / 0.6), never recognition (0.5 / 0.95). Full suite
**128 pass**, build exit 0.

**HF-247 'unknown' (secondary, located):** the skip on sheet fingerprint `d464fd4d4413` at execute is
the EXISTING execute-bulk sheet-`columnRoles` write (HF-254 enrichment / HF-247 gate) — **pre-existing,
Phase-2-untouched**; the gate correctly REFUSED a fingerprint with an unknown sheet-binding role (no
poison). The decomposed path's `profile.headerComprehension` roles were all valid; the 'unknown' is at
the independent sheet-binding layer. Flagged for a precise pin if wanted; non-harmful.

---

## CLASS FIX — pattern conditions key on role PRESENCE, confidence gated once (AUD-009, architect-ratified 2026-06-11)

**Why D5's per-arm patch was insufficient.** RUNS 3+4 still diverged after D5: Run 3 (mod1) committed
`data_type=target`; Run 4 (mod2) `transaction`. Architect ruling: D5 (atom-claim maturation) and the
sheet-flywheel injection are **the same structural defect class** — `classifyByHCPattern` re-thresholds
heterogeneous-scale confidence. Per AUD-009, **one invariant at the consuming layer**; a second
per-surface patch (the flywheel arm) was declined.

**The defect, located** (`hc-pattern-classifier.ts`): every role primitive (`hasTemporal`,
`hasMeasure`, `identifierCount`, `hasReferenceKey`, `hasName`) derived from `confidentRoles` =
`interpretations.filter(c => c.confidence >= HC_ROLE_THRESHOLD(0.80))`. Memory layers supply confidence
on **different scales**: LLM ~0.95, atom recognition/roleConf, sheet-flywheel binding **0.30–0.90**. A
temporal role injected at 0.30 fell below 0.80 → excluded → `hasTemporal=false` → "NO temporal" →
`entity_targets` → target.

**The `0.30` named (store read, not narrative).** It is **NOT** a maturation formula overwriting
`column_roles`. d464 (class=target) stored `Mes/Año` `fieldBinding.confidence=0.30, semanticRole='unknown'`;
6cc99dae (class=transaction) stored the same atoms at `0.90, semanticRole='transaction_date'`. The 0.30
is the **resolver/CRR-assigned `fieldBinding.confidence` in `classification_result.fieldBindings`, written
UNDER the target classification**, then **re-injected by HF-254** (`analyze`, `confidence: fb.confidence`)
as the HC interpretation confidence. The circle: target class → low temporal binding strength stored →
re-injected at 0.30 → pattern re-thresholds to "no temporal" → target → reinforces. Self-reinforcing
contamination. (`semanticRole='unknown'` vs `'transaction_date'` confirms classification-derived binding
strength, not role certainty.)

**The fix (one site, consuming layer).** The coverage gate (`confidentRoles.length/total >=
MIN_COVERAGE_RATIO`) is retained as the **single confidence-normalization point** — it decides whether HC
is reliable enough to drive the tree at all (else Level-2 CRR owns it). Past that gate, the primitives key
on **resolved role PRESENCE**: `roles = interpretations.filter(r => r.columnRole && r.columnRole !==
'unknown')`; `hasTemporal = roles.some(r => r.columnRole === 'temporal')`, etc. A column's assigned role is
trusted regardless of which layer supplied it or at what confidence. Breaks the circle: `Mes/Año` present →
`hasTemporal=true` → `idRepeatRatio 4.02 > 1.5` → `event_transactions_temporal` → **transaction**, in Run 3
and Run 4 identically. Fixes BOTH arms (atom-claim + flywheel) at one site. Branches unchanged.

**Tests (4 new, `hc-pattern-classifier.test.ts`)** pin: (a) `Mes/Año@0.30 → hasTemporal=true →
transaction`; (b) coverage gate still returns null on thin HC; (c) flywheel(0.30)/atom(0.75)/LLM(0.98)
arms classify **identically** given identical role assignments; (d) regression — genuine no-temporal
snapshot (idRepeatRatio≤1.5) still → target. **SCI suite 57 pass; full typecheck exit 0.**

**Item 2 — D5 PATCH: KEPT (architect ruling).** `KnownAtom.roleConfidence` is **write-layer source
correctness** (atoms store the comprehension's role confidence, not a maturing recognition count) — not a
second consuming-layer threshold, no registry accumulation. It stabilizes the coverage-gate input; it is
no longer load-bearing for the pattern (which now keys on presence). Retained.

**Item 3 — Phase 6 reconciliation scope (contamination shape).** Named shape: **`fieldBindings` stored
under a WRONG classification** (`semanticRole='unknown'`, `confidence=0.30`) **self-reinforce on
re-injection**. The consumption side is now fixed (presence-keyed); already-stored instances of this shape
(d464 + any sibling rows) remain **reconciliation scope** — purge/retrain dispositioned by the architect in
Phase 6. **HF-247 closure:** d464's stored `'unknown'` sheet-binding role IS the cause of the HF-247 skip
on `d464fd4d4413` — same contamination shape, same root. The earlier open observation (secondary,
"non-harmful") is **closed against this cause**: the skip was the HF-247 gate correctly refusing a
contaminated 'unknown' binding; reconciliation retires the row, the gate stops firing.

**Run 4 `NO_MATCH` despite temporal@0.90 (architect-noted inconsistency).** Pre-fix, Run 4's Level-1
returned null and CRR Level-2 produced transaction — the coverage/branch interaction under the old
`confidentRoles` derivation. Post-fix the pattern keys on presence and both runs resolve at Level-1; the
targeted-reset re-runs are the authoritative live witness (Run 3 AND Run 4 → transaction at Level-1).

---

## EPG-2.4 — GATE SATISFIED (architect, 2026-06-11) — FINAL EVIDENCE PACKET

Build under test `OB-203-phase-2` @ `38bb5e3a` (class fix live). Sandbox `24103940-…`, pre-run verified
state pasted (atoms 19 preserved; d464 + 6cc99dae + target batch cleared; `committed_data target=0`).
Two live imports of the architect-held Meridian file, two distinct modifications.

### Gate criterion — MET
**Run 3** (`…_mod.xlsx`, +`Activo`): `Datos_Rendimiento` → **`transaction@85` (`event_transactions_temporal`)**
→ `commitContentUnit transaction: 201 rows, data_type=transaction, source_dates=201/201`. **Run 4**
(`…_mod2.xlsx`, +`Activo`+`Comentarios`): same → `transaction@85` → `data_type=transaction, 201 rows`.
The pre-fix divergence (Run 3 target / Run 4 transaction on identical roles) is **gone** — both commit
transaction.

### Class fix — confirmed live
Both runs: `[SCI-HC-PATTERN] Datos_Rendimiento classification=transaction@85% pattern=event_transactions_temporal
conditions=[HAS measure, HAS temporal — per-period event data, idRepeatRatio=4.02, 1 identifier, 12 measures]`.
`Mes`/`Año` claimed `temporal@0.90` (presence) → `hasTemporal=true` regardless of supplying layer. The
0.30 re-threshold-to-target path is dead. (CRR posteriors independently agreed: transaction 80–81%.)

### Read-before-derive / partial recognition — witnessed
`Datos_Rendimiento` went sheet-Tier-3 both runs (composite novel after reset → re-derived), but the
**atom layer claimed the bulk without LLM**:
- Run 3: `[atom-residue] known=15/20 novel=5` → bounded comprehension 6.5s.
- Run 4: `[atom-residue] known=16/21 novel=5` → bounded comprehension 9.9s.
- Residue both runs = `[No_Empleado, Hub, Ingreso_Meta, Ingreso_Real, Incidentes_Seguridad]` — the
  **ambiguous-atom set** (role-stability gating routing collisions to comprehension, not over-claiming).
- `Comentarios` (Run 4, new col) → CLAIMED `attribute@0.90` (recog=0.50): **architect-ruled CORRECT** —
  flywheel replay of a prior comprehension, not over-claim.

### Tier distribution (Progressive Performance)
Both runs: `Plantilla` Tier-1 (`c6f13c61`, mc 12→16, LLM skipped) → entity; `Datos_Flota_Hub` Tier-1
(`8d3d20ae`, mc 6→8, LLM skipped) → reference; `Datos_Rendimiento` Tier-3 → atom-claimed → bounded
comprehension. Sheet-level recognition (2 of 3 sheets, zero LLM) **and** atom-level recognition
(15–16/21 columns, zero LLM) compose — the OB's central R1 mechanism, live.

### Atom write/read lineage
WRITE (EPG-2.4 v2): 12→19 atoms accumulated, zero `comprehension:atom_write_failed`. READ (these runs):
15–16/21 claimed from store. Ambiguity datapoint: 5/20–5/21 = **~24–25%** of columns ambiguous → routed
to comprehension (consistent with the ~30% first datapoint; the `0441c426eab1` collision spanning
`No_Empleado`/`Ingreso_Meta`/`Ingreso_Real` correctly stored `ambiguous` and was never claimed).

### Binding completeness
HF-254 flywheel injection: `Plantilla` 6 bindings, `Datos_Flota_Hub` 7 bindings (native columnRole). No
`'unknown'` role survived on a bound field in the committed sheets. Entity resolution: 67 rows linked,
0 spurious creates, both runs.

### Defect lineage closed at this gate
**D1** (over-claim) → RUN-4 fix A+B+C (discriminative features + role-stability gating + observability).
**D5** (maturation flip) → write-layer `roleConfidence` decoupling (KEPT, source correctness).
**CLASS** (heterogeneous-confidence re-threshold, D5∪flywheel arms) → presence-keyed primitives, one
gate (`38bb5e3a`). Contamination shape (`fieldBindings` under wrong classification, self-reinforcing) →
**Phase 6 reconciliation scope**; HF-247 skip closed against the same cause.

---

## SR-43 — PHASE 2 PRODUCTION VERIFICATION PLAN (post-merge, staged)

Blind-holdout preserved: architect executes the import; CC verifies via service-role reads only.

**Stage 0 — deploy gate (CC).** Confirm the Phase 2 PR merged to `main` and the production deploy SHA
contains `38bb5e3a` (class fix). Record the deploy SHA. Confirm the atom-fingerprint migration
(`20260611120000_ob203_phase2_atom_fingerprint_extension.sql`) is applied in production
(`structural_fingerprints` has `granularity`/`algorithm_version`/`scope`/`atom_features`).

**Stage 1 — architect import (ONE run).** Architect imports the `…_mod2.xlsx` Meridian file (the Run-4
modification: +`Activo`+`Comentarios`) into a **production sandbox tenant** (clean-slate or a tenant with
the Meridian atoms already accumulated — architect's choice; state it). Through `/operate/import` → SCI
proposal → confirm.

**Stage 2 — CC service-role verification (read-only, pasted):**
1. **Transaction commit (the gate):** `committed_data` for the run's tenant — `Datos_Rendimiento`'s
   content unit committed `data_type='transaction'` (exact head-count of transaction rows; `target=0` on
   that sheet). Mirrors EPG-2.4.
2. **Class fix live in prod:** `classification_signals` for the run — `Datos_Rendimiento`
   `classification='transaction'`, `decision_source` = `hc_pattern` (Level-1, presence-keyed). No
   `target` signal for that sheet.
3. **Atom claims:** `structural_fingerprints` `granularity='atom'` rows present for the tenant;
   `column_roles.roleConfidence` populated (D5 source correctness); the ambiguous `0441c426eab1`-class
   atoms stored `role='ambiguous'` (not mis-claimed).
4. **Observability clean:** zero `comprehension:atom_write_failed` and zero `failed_interpretation`
   signals for the run (or any present surfaced).

**Stage 3 — disposition.** All four green → SR-43 CLOSED, Phase 2 production-verified. Any divergence →
structural read on `main`, fix, re-verify (gate does not soften). Verification script staged at
`web/scripts/ob203-epg24-exact-counts.ts` (retarget `TENANT` to the prod sandbox).

**Awaiting:** PR merge, then architect Stage-1 import.

### SR-43 — STAGE 0 + STAGE 2 RESULTS (2026-06-11) — PASS

**Stage 0 (deploy gate, CC):** prod deploy SHA `90e75c0e` (env=Production, 22:01:27Z; contains class fix
`38bb5e3a`). Migration `20260611120000` applied in prod (`granularity`/`algorithm_version`/`scope`/
`atom_features` present). Prod sandbox tenant `24103940-…` ("OB-203 EPG-2.4 Sandbox", MXN/es-MX)
confirmed; mod3 baseline 19 atoms + 6 warm sheets (incl. the re-created `d464`/`6cc99dae` now stored
**transaction**, not target).

**Stage 1 (architect):** prod `mod3` import (mod2 + novel `Codigo_Turno`) @ 22:05Z. `Datos_Rendimiento`
sheet-novel (`3d5282383107`, Tier-3) → decomposed dispatch; the other two sheets Tier-1 (zero LLM).

**Stage 2 (CC service-role reads) — all five witnesses PASS:**
1. **Transaction commit (gate):** `committed_data` `data_type=transaction` (mod3 unit: 201 rows,
   `source_dates=201/201`); **`target=0`** tenant-wide — no contamination, no regression.
2. **Class fix live in prod:** `classification_signals` `Datos_Rendimiento class=transaction src=hc_pattern
   conf=0.85` — Level-1 presence-keyed, not target. (This run matched `event_transactions` via
   `HAS reference_key` — `Codigo_Turno@reference_key` — vs the temporal branch in Runs 3/4; still
   `transaction@85`, correct.)
3. **Atom claims (read-before-derive in prod):** `[atom-residue] known=16/22 novel=6`. New atom
   `96c54b34b2ae` (`Codigo_Turno`) written `role=reference_key, roleConfidence=0.85, match=1,
   algorithm_version=2` — novel atom comprehended + stored with D5 `roleConfidence` (source correctness
   live). Ambiguous `0441c426eab1` preserved `role=ambiguous` (never claimed). 20 atoms total (19→20).
4. **Spurious-entity mechanism (Phase 6 scope):** `Codigo_Turno` comprehended `reference_key@0.85` →
   commit selected `entity_id_field="Codigo_Turno"` → DS-009 created **8 entities** (`entity_type=location`,
   `external_id` = shift codes VES-A1, MIX-A2, MAT-B2, MAT-A1, MIX-C1, NOC-B2, NOC-D4, VES-C3). Same
   **contextual-role (Hub-flap) class** as D3: a column whose role depends on workbook-graph context the
   per-sheet comprehension can't see. **Recorded under Phase 6 contextual-role scope.** Disposition:
   sandbox-isolated, `entity_type=location`, no real tenant and no calc dependency → **stand harmless**;
   targeted cleanup is trivial if the sandbox is reused for entity-resolution witnesses (offered, not
   executed without direction).
5. **Observability clean:** zero `comprehension:atom_write_failed`, zero `failed_interpretation`.

**SR-43 PASS → PHASE 2 CLOSED.** Class fix production-verified; read-before-derive, atom write+read,
D5 `roleConfidence`, and tier composition all live in prod. Open downstream: Phase 6 reconciliation
(contaminated-`fieldBindings` shape; accumulated ambiguous atoms) + contextual-role resolution
(Hub-flap / `Codigo_Turno` spurious-entity class, D3).

---

## PHASE 3 — Durable Comprehension State (R2/DI-1) — CODE-COMPLETE (2026-06-11)

Branch `OB-203-phase-3` off `main` @ `e3efb505`. Full SCI suite **67 pass** (+10: 8 state, 2 retry);
typecheck exit 0; **production build green** (both new routes registered).

### Engine — `comprehension-state-service.ts`
- `comprehension:unit_state` on the ONE canonical surface/writer (G7-ratified: new `signal_type`, not a
  new channel; precedent `failed_interpretation` / `atom_write_failed`). Overloading
  `classification:outcome` was declined — would contaminate outcome semantics (the Phase-2 defect shape).
- State vocabulary `persisted→profiled→recognized→comprehended→classified→bound` + `failed_interpretation`
  / `resolved`; monotonic-spine guard `isForwardTransition`; pure `reduceSessionState` (DB-free) + DB
  `rebuildSessionState` (resumable from signals alone — survives process restart, R2).
- Same-batch ordering: explicit emission `seq` tiebreaks identical `created_at` (batch inserts share a
  timestamp); across requests (retry) `created_at` dominates.

### Read contract (binding expectation b) — `GET /api/import/sci/session-state?tenantId=&importSessionId=`
Returns `SessionStateView` (per-unit state + history + `retryable` + `isOpen`). **This is the Phase 5
dialog's data contract** — Phase 5 consumes it without rework.

### Emission wiring (analyze + execute-bulk)
| State | site | DI note |
|---|---|---|
| `persisted` | sheet ENUMERATION, **before** profiling | **DI-1/EPG-3.2**: state-zero independent of any downstream step (architect redirect: split from `profiled`) |
| `profiled` / `failed(profiling_error)` | after `generateContentProfileStats` (per-sheet try/catch) | |
| `recognized(tier)` | after fingerprint lookup | tier 1/2/3 |
| `comprehended` / `failed_interpretation` | after decomposed dispatch + Tier-1 inject | alongside existing `emitComprehensionFailureSignals` |
| `classified` | after proposal build (failed units excluded) | |
| `bound` | **execute-bulk** after commit, per committed unit | |
`importSessionId` (= `proposalId` alias) returned on the proposal and stamped in `context.importSessionId`.
Non-blocking `emitUnitStates` (failures surfaced via `[OB-203][state]`, never swallowed).

### Identity boundary (architect item 2, recorded)
`importSessionId` = **comprehension-session** identity (groups unit states; aliases `proposalId`).
**Distinct** from execute-side `import_batch_id` (HF-213 supersession; groups committed rows). Never
conflated: the `bound` emission reads `proposalId` from the execute body, NOT the batch id.

### Retry-without-reimport (binding expectation a) — `POST /api/import/sci/retry-unit`
`retry-unit-comprehension.ts` re-runs the **SAME** decomposed dispatch (`runDecomposedComprehension`,
injected) from the already-persisted storage artifact — atoms claim, residue comprehends — so a retried
unit benefits from everything the flywheel learned since the failure. Emits `comprehended`/`failed` with a
fresh timestamp that supersedes the prior failure in the reducer (no mutation of past signals). Test proves
same-dispatch via injection (`retry-unit-comprehension.test.ts`).

### Experience — `SessionStateLive.tsx`
Mounted in the import proposal phase. Polls `session-state` (stops when `!isOpen`), renders each unit's
state live; a `failed_interpretation` unit shows a **Retry** button → `retry-unit` → re-poll.

### EPG mapping for the live run
- **EPG-3.1 (G7 — zero new tables/channels):** the writer diff is `signal_type` value + JSONB only; ZERO
  DDL. Migration count for Phase 3 = 0. Evidence: `git diff` shows no `supabase/migrations` addition; all
  writes go through `canonical-signal-writer`.
- **EPG-3.2 (DI-1 — persistence free of comprehension conditions):** `persisted` is emitted at sheet
  enumeration BEFORE `generateContentProfileStats`; the profiling-failure test pins that a sheet still
  carries `persisted` when profiling throws. Live: query `comprehension:unit_state` where
  `signal_value->>state='persisted'` — present for every sheet regardless of downstream outcome.
- **EPG-3.3 (read-before-derive consumes durable signal):** `rebuildSessionState` reconstructs the live
  view from `classification_signals` alone (query evidence: filtered on `signal_type` +
  `context->>importSessionId`). Session resume after restart is the witness.

**Awaiting architect EPG-3.1/3.2/3.3 live run** (blind-holdout; import into a sandbox tenant, then CC
verifies the state trail + retry via service-role reads).

### PHASE 3 — LIVE RUN PASS (architect-executed 2026-06-11, tenant 24103940, mod3, session a3f3769a)

All witnesses verified (service-role reads + architect browser):
- **Spine:** all 3 sheets `persisted→profiled→recognized→comprehended→classified→bound`, monotonic, under ONE `importSessionId` (a3f3769a). Classifications transaction / reference / entity.
- **EPG-3.1 (G7):** 0 migrations, 0 direct inserts; `comprehension:unit_state` via the one canonical writer.
- **EPG-3.2 (DI-1):** `persisted` batch (22:57:02.281) strictly precedes `profiled` (22:57:02.453) for every sheet — state-zero independent of profiling.
- **EPG-3.3 / resume:** dev-server restart mid-session + reload → `SessionStateLive` re-rendered the full view from the DB (architect: resume render **yes**). In-memory state gone; `rebuildSessionState` is the sole data source. Resume-after-restart confirmed.
- **bound:** 3/3 units reached `bound` post-execute under the same session (22:58:52).
- Retry-click witness deferred to Phase 5 induced-failure CLT (architect ruling); retry stands test-proven.

**Phase 3 PASS.** All EPGs green; live witnesses verified. Ready for merge.

---

## PHASE 4 — Signal Spine: Vocabulary, Trace, Observability (R3/DI-5/DI-7) — CODE-COMPLETE (2026-06-11)

Branch `OB-203-phase-4` off `main` @ `cd5f0326`. Full SCI suite **72 pass** (+5 vocabulary); typecheck 0.

### Vocabulary (Decision-30 extension; EPG-4.3 structural, zero domain literals)
All on the ONE canonical surface via the ONE writer (`comprehension-signal-vocabulary.ts`):
`comprehension:atom_recognition`, `comprehension:composition`, `comprehension:tier_resolution`,
`comprehension:session_lifecycle`, `comprehension:resolution`, `comprehension:learning_write_blocked`,
`interaction:import`. EPG-4.3 test asserts each matches `family:structural_term` and contains no domain word.

### Emission points (all fire-and-forget — DI-7 redirect)
- analyze: `session_lifecycle` (open/settled), `tier_resolution` + `composition` per comprehended unit.
- decomposed dispatch (`header-comprehension.ts`): `atom_recognition` batch at atom write.
- retry route: `resolution` on retry success.
- **DI-7 — HF-247 gate now emits `learning_write_blocked` on BOTH** the fingerprint-write skip
  (`fingerprint-flywheel.ts:182`) and the tier1-read demote (`:82`) — previously log-only. "Every blocked
  write emits remediation" is now true.

### EPG evidence
- **EPG-4.1 (single surface):** `grep` for `.from('classification_signals').insert` in Phase 4 code → **NONE**; every write goes through `writeSignal`/`writeSignalBatch`.
- **EPG-4.2 (zero write-gating / DI-5):** `grep density|executionMode` across `atom-flywheel`, `fingerprint-flywheel`, `comprehension-planner`, `decomposed-comprehension`, `comprehension-signal-vocabulary` → only a single hit, an explanatory **comment**, no gating code. Consumption-side `computeClassificationDensity` (`classification-signal-service.ts:520-575`) READS signals → computes `executionMode` → RETURNS it; it writes nothing and gates only which LLM tier is invoked at READ.
- **EPG-4.3 (structural vocabulary):** test pins `family:structural_term` + no-domain-word.

### Trace — `scripts/ob203-trace.ts` (BL-001 data contract; named query shapes)
1. unit-state timeline (per session) · 2. failure classes · 3. comprehension cost (resolver mix + known/novel) ·
4. tier distribution · **5. DI-7 remediation FAMILY — one rollup unifying `reinforcement_blocked` +
`learning_write_blocked` + `atom_write_failed`** (architect condition: "every blocked write" answerable with
one query, not a per-type checklist) · 6. interaction:import. Smoke-tested against live DB (query #1 returns the
Phase-3 session timelines).

### SR-39 GATE — interaction signals are behavioral data (documented BEFORE PR)
`POST /api/import/sci/interaction`:
- **Authentication (CC6.1 / NIST AC-3 / OWASP A01):** rejects unauthenticated with **401** (`auth.getUser()` on the
  cookie session). No anonymous behavioral writes.
- **Tenant authorization (CC6.6 least-privilege / NIST AC-4 information-flow / OWASP A01 broken-access-control /
  A04 insecure-design):** the body `tenantId` is a routing hint, **never trusted** — authorized via the CANONICAL
  identity reader `resolveIdentity()` (D6 / HF-282: a bespoke per-tenant `profiles` lookup wrongly 403s platform-scope
  identities that hold no per-tenant row — the divergent-read defect HF-282 closed). Rule: a **platform-scope**
  identity (`canonicalRole='platform'` or `manage_tenants`) is authorized cross-tenant; a **tenant-scope** identity is
  authorized only for its own `tenantId`; otherwise **403**. No tenant-scoped caller can write to a tenant it does not
  own (no IDOR / cross-tenant write).
- **Scope (DS-014 / Decision 123):** every interaction write carries `scope:'tenant'` + the **validated** `tenant_id`.
- **DI-10:** this path introduces **no cross-scope aggregation** — interaction signals are single-tenant-scoped.
  The only cross-tenant read in the system (`lookupFoundationalPriors`) is untouched and remains anonymized by
  structural-fingerprint construction (`tenant_id IS NULL`, zero tenant-identifiable info).
- **CC6/OWASP/NIST mapping:** CC6.1 (logical access), CC6.6 (least privilege); OWASP A01 (Broken Access Control),
  A04 (Insecure Design); NIST 800-53 AC-3 (Access Enforcement), AC-4 (Information Flow Enforcement), AC-6 (Least
  Privilege). Tests assert every builder carries `scope:'tenant'` + `tenant_id`.

### Tests (+5)
vocabulary round-trip; EPG-4.3 structural; SR-39 tenant-isolation on every builder; DI-7 fire-and-forget
(forced write failure → caller unaffected + loud log); learning_write_blocked DI-7 shape.

### HALT-3 — NO halt
No new table/channel (new `signal_type` values on the one surface/writer); no write-time density gating (DI-5
preserved); no persistence conditioned on comprehension. The interaction POST writes to the same surface.

**Awaiting architect EPG-4.1/4.2/4.3 review + SR-39 sign-off, then PR.**

### PHASE 4 — LIVE WITNESS (architect-executed 2026-06-11/12, tenant 24103940, mod4, session bdbab5b9)

mod4 = mod3 + `Notas_Turno` (novel column → `Datos_Rendimiento` Tier-3 → decomposed dispatch). Trace:
- `unit_state` 18 (3 sheets × full spine) · `session_lifecycle` open→settled (unitCount=3) ·
  `tier_resolution` 3 (mixed: 2 flywheel/tier_1 + 1 llm/tier_3) · `composition` 1 (known 17/novel 6, rf 0.74) ·
  `atom_recognition` 23 (17 claimed + 6 novel; roles measure/attribute/name) · `interaction:import` 1 (view — **D6 closed**, POST 200).
- `resolution` 0 + `learning_write_blocked` 0 — condition-gated (no retry, no unknown-role block in a clean import);
  shape + DI-7 fire-and-forget proven by unit tests; the DI-7 rollup query (#5) verified (returns family structure, 0 events).
- D6 fixed: interaction authorized via canonical `resolveIdentity()` (platform-scope cross-tenant; tenant-scope confined) — HF-282 class.

**Phase 4 PASS.** EPG-4.1/4.2/4.3 + SR-39 accepted; 5/7 vocabulary types live-witnessed, 2 condition-gated + test-proven.

---

## PHASE 5 — Observer Import Experience (D4 full) — CODE-COMPLETE (2026-06-11)

Branch `OB-203-phase-5` off `main` @ `458b9fdb`. Full SCI suite **76 pass** (+4); typecheck 0.

### Observer (DS-027 §4.4) — `SessionStateLive` as the unified state surface (architect path-a ratified)
Polls `SessionStateView` (Phase 3) live; each unit renders its state; **`failed_interpretation` holds visibly**
and carries the STANDING resolution action set. Recognition provenance (Phase 2 field, via `contentUnits`)
renders on comprehended/classified/bound rows. `SCIProposal` keeps Decision-73 confirm/correct for comprehended units.

### Resolution action set (HALT-6 RATIFIED — standing interpretation-failure pattern) + signal mapping
| Action | Mechanism | Outcome signal(s) |
|---|---|---|
| view structural detail | expand read-only panel (tier / atoms known / novel residue / failure class) | `interaction action='expand'` |
| retry comprehension | Phase 3 `retry-unit` (same decomposed dispatch) | `resolution` (failed→comprehended) + `action_click` |
| manually assign classification | `resolve-unit` action=assign | `unit_state='resolved'` + `resolution` (`user_corrected`) + `interaction action='correction'` |
| exclude unit | `resolve-unit` action=exclude | `interaction action_click control='exclude'` |

**Manual assign is CLASSIFICATION-LEVEL only** (architect item 2). **BINDING-LEVEL correction → Phase 6**
(interacts with convergence + the workbook graph), recorded here as the explicit boundary alongside contextual-role resolution.

### Endpoint — `POST /api/import/sci/resolve-unit` (SR-39: 401 unauth; tenant via `resolveIdentity`)
The action→signal mapping is the pure `resolveUnitSignals()` (`resolve-unit-signals.ts`); the route does nothing
but emit what it returns — `assign` awaits the `resolved` state then fires `resolution` + `correction`; `exclude`
fires the `action_click`. **EPG-5.2** holds by construction: an action's entire durable effect IS its returned signals.

### Client-tier failure surface (absorbed scope) — `page.tsx`
`fetchAnalyzeWithTimeout` wraps both analyze fetches in an `AbortController` + 120s deadline. On timeout/abort/network
failure → the existing `error` phase with a **perceptible cause + suggested action** ("timed out after 120s … try
again or split the file" / "could not reach the server … check connection"). No infinite spinner.

### EPGs
- **5.1 (every action emits a signal):** `resolveUnitSignals` test — assign → resolved+resolution+correction; exclude
  → action_click; every action ≥1 signal. view/expand + retry capture via `captureImportInteraction`/`retry-unit`.
- **5.2 (no mutation outside the signal path):** action effect = `{states, signals}` only; route emits, nothing else.

### CLT (browser) — corrupt-analog + observer/action witness
1. **Generate input:** `npx tsx scripts/ob203-clt-corrupt-analog.ts 4242 /tmp/ob203_clt.xlsx` — a seeded analog whose
   FACT sheet is collapsed to one unintelligible noise column (boundary-corruption; the engineered-to-fail unit);
   clean sheets comprehend normally → a MIX.
2. **Import** `/tmp/ob203_clt.xlsx` via `/operate/import` (sandbox tenant). **Observe:** clean sheets progress to
   classified; the corrupted unit holds at `failed_interpretation` with the action set rendered.
3. **Retry** the failed unit → re-runs the same decomposed dispatch (lights `resolution` on success).
4. **Assign** a classification on the failed unit → unit shows `resolved`; **lights `comprehension:resolution`
   (`user_corrected`) live** (the deferred resolution witness).
5. **Exclude** → `action_click control=exclude`. **Confirm** the proposal (excluded/failed units absent).
6. **Verify:** `npx tsx scripts/ob203-trace.ts <tenant> <session>` — `failed_interpretation` present, then
   `comprehension:resolution` + `interaction:import` (expand/correction/action_click) rows.

### Tests (+4)
`resolve-unit-signals`: assign signal set, exclude signal set, every-action-≥1-signal (5.1), tenant-scope (5.2).

### HALT — none. No new table/channel; resolution actions write via the canonical surface; client failure surface is UI-only.

**Awaiting architect CLT run (corrupt-analog import → observe → retry → assign → confirm) for the live witness, then PR.**

### PHASE 5 — CLT v2: boundary fault-injection (architect 2026-06-11; data-corruption couldn't defeat the LLM)

Data-level corruption comprehended anyway (Wimoxi: a role assigned to an empty column name). Replaced with
**dev-only fault injection at the comprehension-response boundary** (`header-comprehension.ts`):
- `ob203FaultInjected(sheetName)` — TRUE only when **not production** AND `OB203_FAULT_SHEET` is set AND it names
  the sheet. The residue comprehender then returns `{ ok:false, failureClass:'parse_failure' }` BEFORE the LLM call,
  so the failure traverses the **real Phase 1 path** (decomposed dispatch → `perSheetFailure` → `failed_interpretation`
  state + `emitComprehensionFailureSignals`). **Hard-gated** (inert without the env var; NEVER in prod builds —
  `NODE_ENV` guard). Durable test instrumentation, not a workaround. 3 gate tests.

**Re-run recipe (which sheet fails):**
1. Fresh witness (prior analog's fingerprints are warm): `web/clt-witness/ob203_clt_corrupt_5555.xlsx` —
   sheets **Naroji, Gakudo, Viraqu, Rocece, Ziqufe** (all Tier-3 novel → all run comprehension).
2. `OB203_FAULT_SHEET=Gakudo npm run dev` (faults the `Gakudo` unit; pick any sheet name).
3. Import the seed-5555 file (sandbox 24103940). **Gakudo holds at `failed_interpretation`**; the others comprehend.
4. Observer action set → **Assign** a classification → `resolved` + **`comprehension:resolution` (user_corrected)** live
   (the deferred resolution witness). **Retry** while the env var is set re-fails (supersession witness); unset + retry
   to witness retry-success. **Exclude** → `action_click`. **Confirm**.
5. Verify: `npx tsx scripts/ob203-trace.ts <tenant> <session>` — `failed_interpretation`, then `comprehension:resolution`
   + `interaction:import` rows.

### REGISTRY OBSERVATION (recorded, NOT Phase 5 scope — architect disposition later)
CLT run committed `Wimoxi` at `winner=target@31%` (and other sub-50% units): **low-confidence units proceed to commit
through confirm without a distinct low-confidence HOLD state**. The state machine has `failed_interpretation` for
comprehension failure but no "low-confidence / needs-review" hold distinct from a confident classification — a unit can
commit at 31% with only the existing `requiresHumanReview` warning chip. Assess against the CLT registry + DS-027 (the
`§4.4` action set could extend to a low-confidence hold); disposition deferred to the architect. Not in Phase 5 scope.
