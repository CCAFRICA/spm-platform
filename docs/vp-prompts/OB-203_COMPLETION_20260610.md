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
