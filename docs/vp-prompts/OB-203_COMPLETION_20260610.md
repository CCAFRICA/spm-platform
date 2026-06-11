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

### 0.5 Baseline witness — **PENDING ARCHITECT FIXTURE**
`datos-cadena-restaurantes-mx.xlsx` (Brasa y Maíz, 16 sheets / 162,956 rows) is **not present in the repo** (searched fixtures, scripts, test-fixtures — only `BCL_Resultados_Esperados.xlsx` and `CLT14B_Reconciliation_Detail.xlsx` exist). Per §3.5 the architect supplies it. On receipt: dev import → capture the failure logs (`[SCI] Header comprehension JSON parse failed`, `llmCalled=false avgConf=0.00`, the 16-unit mis-proposal, HF-247 write blocks) → commit to `OB-203_BASELINE_20260610.md`. The design-recorded signature (DS-027 §1) stands as the documented expectation until the live capture.

**Phase 0 status:** complete except 0.5 (blocked on the Brasa y Maíz fixture). No HALT (2,3,4,7) triggered. Ready for Phase 1 once the baseline is captured (or on architect direction to proceed in parallel).
