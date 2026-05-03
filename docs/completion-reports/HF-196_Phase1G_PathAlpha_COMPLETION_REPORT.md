# HF-196 Phase 1G Path α (option ii) — Completion Report

**Phase:** 1G Path α (option ii) — Full HC-Primacy Architectural Realignment per Decision 108
**Branch:** `hf-196-platform-restoration-vertical-slice`
**Final commit (Phase 1G):** `dc3aa558`
**Date executed:** 2026-05-03
**Architect:** Andrew (vialuce founder)
**Status at report:** Phase 1G-1 through 1G-11 complete; Phase 5-RESET-7 architect signals awaited (per §11.13 amendment — reconciliation discipline)

---

## Phase 1G-0: Working-Tree State Reconciliation

Pre-existing working tree state at directive entry (per interim completion report `64235c41`):
- `web/src/lib/sci/agents.ts` modified (Site 2 gating; Path β shape)
- `web/src/lib/sci/negotiation.ts` modified (Site 1 split + gating; Path β shape)

**Diff vs Path α:** Sites 1+2 working-tree edits already applied the HC-silence-gating with confidence 0.85→0.75 — directly conformant with Path α §11.2 + §11.3.

**Reconciliation action taken:** integrate-as-is + extend additively (architect-dispositioned). No `git checkout HEAD`. Path α extended with Sites 3, 4, 5, 6, 7, 8 + HF-203 + pipeline reordering atomically in a single Phase 1G-11 commit.

---

## Phase 1G-1: Pre-Edit Verification

All 8 sites + HF-203 + pipeline ordering surfaced and confirmed at expected line numbers.

**Critical architectural finding (Critical HALT #3):** content-profile.ts `detectStructuralIdentifier` is module-private (only callers at lines 459, 464). Both call sites execute during Phase A profile generation — BEFORE HC runs (per `header-comprehension.ts:430` doc comment "Called AFTER generateContentProfile, BEFORE agent scoring"). HC runs after content-profile produces the profile object with patterns already computed. Pipeline reordering required to achieve HC primacy on Sites 3, 7, and the 461-inline duplicate of Site 7.

**Architect disposition:** α-1 two-phase content-profile split (per §11.4 amendment).

---

## Phase 1G-2: Site 1 — `negotiation.ts:299`

**Pre-edit:** `if (hcRole === 'identifier' || (field.dataType === 'integer' && !!field.distribution.isSequential)) { ... }` (single coupled OR predicate; structural arm OR-peer with HC).

**Post-edit:**
- HC-primary branch: `if (hcRole === 'identifier') { ... LLM-primary path + cardinality fallback at confidence 0.85 ... }`
- Structural fallback: `if ((!hcRole || hcRole === 'unknown') && field.dataType === 'integer' && !!field.distribution.isSequential) { ... cardinality at confidence 0.75 (reduced from 0.85) ... }`

Confidence reduced 0.85 → 0.75 in HC-silence branch (signaling reduced authoritativeness of structural-only classification).

LLM-primary path (`if (identifiesWhat)`) preserved inside HC-primary branch only — fires when HC said `'identifier'`.

---

## Phase 1G-3: Site 2 — `agents.ts:536`

**Pre-edit:** `if (field.dataType === 'integer' && field.distribution.isSequential) { ... confidence: 0.85 ... }` (twin defect of Site 1 in `assignSemanticRole`).

**Post-edit:** `if ((!hcRole || hcRole === 'unknown') && field.dataType === 'integer' && field.distribution.isSequential) { ... confidence: 0.75 ... }`. Twin gating to Site 1.

---

## Phase 1G-4: Pipeline Reordering — `content-profile.ts` (Sites 3, 7, plus 461-inline)

**Architectural change implemented:** α-1 two-phase split.

### New module exports
- `ContentProfileStats` type (alias of ContentProfile — same shape; placeholder pattern fields)
- `ContentProfilePatterns` interface (Phase B output bundle)
- `generateContentProfileStats(tabName, tabIndex, sourceFile, columns, rows, totalRowCount?)` — Phase A
- `generateContentProfilePatterns(stats, hcInterpretations?, rows?)` — Phase B
- `generateContentProfile(...)` — composite wrapper (backward-compat; HC silent → structural fallback)

### Phase A function signature (no HC parameter)
Returns `ContentProfileStats` with placeholder/zero pattern values. Stats fields (rowCount, columnCount, sparsity, headerQuality, fields, observations) are final. Pattern-derived structure fields (numericFieldRatio, categoricalFieldRatio, categoricalFieldCount, identifierRepeatRatio) are zero-initialized; patterns object zero-initialized.

### Phase B function signature
```typescript
export function generateContentProfilePatterns(
  stats: ContentProfileStats,
  hcInterpretations?: Map<string, HeaderInterpretation>,
  rows: Record<string, unknown>[] = [],
): ContentProfile
```
Mutates `stats` in place to populate patterns + structure-derived fields, append observations, mutate field-level looksLikePersonName signal.

### Sites 3 + 7: `detectStructuralIdentifier` HC primacy
```typescript
function detectStructuralIdentifier(
  field: FieldProfile,
  rowCount: number,
  hcRole?: ColumnRole,
): boolean {
  // HC primacy: HC any role except 'unknown' → structural arm yields
  if (hcRole && hcRole !== 'unknown') return false;
  // Site 7 — sequential integer (HC silent only)
  if (field.dataType === 'integer' && field.distribution.isSequential) return true;
  // Site 3 — high-cardinality integer (HC silent only)
  if (field.dataType === 'integer' && uniquenessRatio > 0.90) return true;
  ...
}
```

### `hasEntityIdentifier` OR-fold (line 461-inline) HC-aware in Phase B
All three OR-fold components (detectStructuralIdentifier + nameSignals.containsId + isSequential-inline) gate on HC silence. HC `'identifier'` returns true; HC any-other-role suppresses; HC silent → structural fallback.

### `idField` finder HC-aware
HC `'identifier'` columns chosen first via `find(getHCRole === 'identifier')`. Structural fallback chains only fire on HC-silent fields.

### Composite wrapper (backward-compat)
`generateContentProfile` calls Phase A + Phase B with `hcInterpretations=undefined` → structural arms fire (legacy behavior). Used by test fixtures and any non-production caller.

### Caller updates
- `web/src/app/api/import/sci/analyze/route.ts:91` (Phase A) + `:185` (Phase B inserted between Tier-1 flywheel injection and HC diagnostic logging)
- `web/src/app/api/import/sci/process-job/route.ts:152` (Phase A) + `:180` (Phase B inserted after HC enhancement, before classification)

### Architectural verdict
**Pipeline reordered structurally.** `generateContentProfileStats` runs first (no HC dependency, no patterns); HC runs against statsMap (or skipped for Tier 1 with flywheel injection); `generateContentProfilePatterns` runs against profile with HC interpretations. Sites 3, 7, 461-inline now operate under HC primacy.

### HC additive-override status
Preserved as defensive (header-comprehension.ts:508-509, 571-572). Architect-dispositioned: small code surface; non-defective in post-1G architecture; catches future structural-pattern sites that may bypass Phase B.

---

## Phase 1G-5: Site 8 — `tenant-context.ts:144-147`

**Pre-edit:** `const idField = profile.fields.find(f => f.nameSignals.containsId || (f.dataType === 'integer' && f.distribution.isSequential));`

**Post-edit:**
```typescript
const hcInterpretations = profile.headerComprehension?.interpretations;
const getHCRole = (fieldName: string) => hcInterpretations?.get(fieldName)?.columnRole;

const idField =
  profile.fields.find(f => getHCRole(f.fieldName) === 'identifier') ??
  profile.fields.find(f => {
    const hcRole = getHCRole(f.fieldName);
    if (hcRole && hcRole !== 'unknown') return false;
    return f.nameSignals.containsId || (f.dataType === 'integer' && f.distribution.isSequential);
  });
```

`computeEntityIdOverlap` is invoked AFTER HC has run (analyze/route.ts ~210, process-job/route.ts ~210), so `profile.headerComprehension` is populated. No signature change required.

---

## Phase 1G-6: Affinity Sites — `negotiation.ts:34, 79, 125`

| Site | Pre-edit | Post-edit |
|---|---|---|
| 4 (line 34) | `hcRole === 'identifier' \|\| (integer && isSequential)` | `hcRole === 'identifier' \|\| ((!hcRole \|\| hcRole === 'unknown') && integer && isSequential)` |
| 5 (line 79) | `f.dataType === 'integer' && !!f.distribution.isSequential` (no HC parameter consumed) | `(!hcRole \|\| hcRole === 'unknown') && f.dataType === 'integer' && !!f.distribution.isSequential` (test signature now reads `hcRole`) |
| 6 (line 125) | `hcRole === 'identifier' \|\| (field.dataType === 'integer' && !!field.distribution.isSequential)` | `hcRole === 'identifier' \|\| ((!hcRole \|\| hcRole === 'unknown') && integer && isSequential)` |

---

## Phase 1G-7: `hasEntityIdentifier` OR-fold (`content-profile.ts:461-inline`)

Closed via Phase B HC-aware redesign in §1G-4. The 461-inline `(f.dataType === 'integer' && f.distribution.isSequential)` is now inside the HC-silent branch of the some-fold (line 599); it only fires when HC is silent on the column being tested.

Verification approach: code review — the OR-fold reads HC role via `getHCRole(f.fieldName)`; if HC has any role other than `'unknown'`, the some-fold returns false on that field; structural arm only reached on HC-silent fields.

---

## Phase 1G-8: HF-203 SCALE ANOMALY Architectural Inversion

**Pre-edit detection (`convergence-service.ts:1558-1591`):**
- Detected `ratioToMedian > 10`; iterated scaleDivisor `[100, 10, 1000]` to find scale that brings ratio into `[0.1, 10]`; produced `proposedCorrection: { type: 'scale_factor', currentScale, proposedScale, correctedResult, bindingRole }`.

**Post-edit detection:**
- Detected `ratioToMedian > 10`; produces `proposedAction: { type: 'binding_rejection', rejectedColumn, bindingRole, rationale }`. No scale-divisor search. `anomalyType = 'binding_misalignment'` (new enum value added).

**Pre-edit application (`convergence-service.ts:316-333`):**
- `binding.scale_factor = pr.proposedCorrection.proposedScale` (mutation masked the misalignment).

**Post-edit application:**
- `binding.match_pass = 'failed'`; `binding.failure_reason = pr.proposedAction.rationale`. Type `match_pass` widened from `number` to `number | 'failed'`. Type extension added to `ComponentBinding` interface (`failure_reason?: string`).

**Classification signal row:**
- `decision_source: 'binding_misalignment'` (was `'structural_anomaly'`)
- `signal_value` carries `action_applied + action_type + rejected_column` (was `correction_applied + correction_type + corrected_result`)

**Engine consumption changes:** none. Lines 1416-1417, 1429, 1443, 1483-1484 (`value *= binding.scale_factor`) preserved — they operate only on bindings with legitimate scale_factor from `generateAllComponentBindings` (column-mapping process). Rejected bindings have `match_pass='failed'` for downstream handling.

**AI re-mapping fallback strategy:** out of scope for this phase. Rejected bindings produce convergence gaps; calc continues with `scale_factor` untouched. Re-mapping logic candidate for HF-204 if architect dispositions.

---

## Phase 1G-9: Build + Korean Test

- `npx tsc --noEmit`: **EXIT=0**
- `npm run build`: **EXIT=0** (full Next.js build green)
- Korean Test verifier: **`[korean-test-gate] PASS: zero hardcoded legacy primitive-name string literals outside registry`**

---

## Phase 1G-10: Self-Test

| Verification | Result |
|---|---|
| Site 1 (`negotiation.ts:299`) post-edit form | ✓ HC-primary branch + HC-silence-gated structural fallback |
| Site 2 (`agents.ts:536`) post-edit form | ✓ HC-silence gating |
| Sites 3 + 7 (`detectStructuralIdentifier`) | ✓ HC primacy gate at function entry |
| Site 4 (`negotiation.ts:34`) | ✓ HC-silence-gated structural arm |
| Site 5 (`negotiation.ts:79`) | ✓ HC-silence-gated; test reads hcRole parameter |
| Site 6 (`negotiation.ts:125`) | ✓ HC-silence-gated `isShared` |
| Site 7 transitive (`hasEntityIdentifier` OR-fold) | ✓ HC-aware in Phase B |
| Site 8 (`tenant-context.ts:144-147`) | ✓ HC-aware via `profile.headerComprehension` |
| HF-203 detection | ✓ `binding_misalignment` produced; no scale-divisor search |
| HF-203 application | ✓ `binding.match_pass = 'failed'`; zero `binding.scale_factor =` mutations |
| Pipeline two-phase exports | ✓ `generateContentProfileStats` + `generateContentProfilePatterns` exported |
| Pipeline call sites updated | ✓ analyze/route.ts + process-job/route.ts both use stats → HC → patterns |
| `grep "hcRole === 'identifier' \|\| (...isSequential)"` | ✓ zero unguarded matches |
| `grep "binding\.scale_factor ="` in convergence-service | ✓ zero mutations |

---

## Phase 1G-11: Commit

- **Commit SHA:** `dc3aa558`
- **Push:** `64235c41..dc3aa558` to `origin/hf-196-platform-restoration-vertical-slice`
- **Files changed (7):**
  - `web/src/app/api/import/sci/analyze/route.ts`
  - `web/src/app/api/import/sci/process-job/route.ts`
  - `web/src/lib/intelligence/convergence-service.ts`
  - `web/src/lib/sci/agents.ts`
  - `web/src/lib/sci/content-profile.ts`
  - `web/src/lib/sci/negotiation.ts`
  - `web/src/lib/sci/tenant-context.ts`
- **Line counts:** +330 / -109

---

## Phase 1G-12: Interim Completion Report (this document)

Sections 1G-0 through 1G-11 populated. Phase 5-RESET-7 + final verdict sections will be appended after empirical verification.

---

## Phase 5-RESET-7: Empirical Verification (PENDING)

Per §11.13 amendment — reconciliation discipline:
- CC verifies structural correctness; CC reports raw calculated values.
- Architect performs reconciliation against `BCL_Resultados_Esperados.xlsx` in architect channel.
- CC does not author or load any reference dataset; CC does not produce reconciliation interpretation.

### Architect signal 1 — wipe applied
- Wipe verification (10-table count = 0): _pending_

### Architect signal 2 — 7 imports done
- Operative import_batches count: _pending_
- committed_data total + data_type distribution: _pending_
- Transaction source_date histogram: _pending_
- DS-017 fingerprint flywheel state: _pending_
- **Persisted field_identities — Phase 1G empirical confirmation:**
  - `Cantidad_Productos_Cruzados.structuralType`: _pending_
  - `Depositos_Nuevos_Netos.structuralType`: _pending_
  - `ID_Empleado.structuralType`: _pending_

### Architect signal 3 — plan import done
- rule_sets state: _pending_
- convergence_bindings per component: _pending_
- **Productos Cruzados component → bound column:** _pending_
- scale_factor presence on bindings: _pending_
- HF-203 emissions (match_pass='failed', binding_misalignment): _pending_
- Plan-import emission scan (seeds, UnconvertibleComponentError, SCALE ANOMALY): _pending_

### Architect signal 4 — calc done
- calculation_batches count + lifecycle states: _pending_
- calculation_results total count + per-period count: _pending_
- **Per-period calculated totals (calculated values surfaced to architect channel):** _pending_
- **Grand total calculated:** _pending_
- Component-variant aggregates (across 6 periods × 85 entities): _pending_
- Calc emission scan (SCALE ANOMALY, binding_misalignment, concordance): _pending_
- Calc-time entity resolver matched/unmatched: _pending_

### Architect signal 5 — architect-reconcile complete
- **Architect-channel reconciliation verdict (architect supplies):**
  - Reconciliation reference: `BCL_Resultados_Esperados.xlsx`
  - Verdict: _pending_
  - Defect findings (if any, architect-supplied): _pending_
  - Disposition (if FAIL): _pending_

---

## Phase 1G Path α Closure Verdict (PENDING)

Structural gates (CC self-asserts):
- HC primacy operative at `field_identities`: _pending_
- Pipeline reordering operative (α-1 two-phase split): _pending_
- Convergence binding correctness: _pending_
- HF-203 architectural inversion present + correctly inert on this substrate: _pending_
- Calc completes across 6 periods: _pending_

Reconciliation gate (architect-channel):
- Architect reconciliation verdict: _pending_

Phase 1G Path α: _pending_ (PASS requires all structural gates + architect-channel PASS-RECONCILED)

---

## HF-196 Closure (PENDING)

- All architectural breaks closed: _pending_
- Phase 5-RESET-7 PASS (structural + reconciliation): _pending_
- PR #359 ready for Ready-for-Review transition: _pending_

---

## Out-of-Scope Carry-Forward

- **HF-198 candidate** — `calculation_batches.superseded_at` + `supersession_reason` audit-column gap (logged Phase 1E-1).
- **HF-199 candidate** — OB-50 surface restoration (15 schema columns missing on `ingestion_events`; SCI flow bypasses).
- **Plan-path data_type vocabulary** (`commit/route.ts` + `intelligence/wire/route.ts`) — Phase 5D verified non-blocking; carry-forward.
- **HF-202 — ABSORBED into Phase 1G Path α** (no longer carry-forward).
- **HF-203 — ABSORBED into Phase 1G Path α** (no longer carry-forward).
- **HF-205 — ABSORBED into Phase 1G Path α** (no longer carry-forward).

---

## Memory Entry 30 Closure Verification

Phase 1G Path α is **substrate-APPLYING** (Decision 108 to predicates that always violated it) AND **substrate-EXTENDING** (pipeline reordering modifies SCI architecture). Authorial intent of HF-095 Phase 2 ("HC primary, structural fallback") restored across the entire SCI classification surface; Adjacent-Arm Drift defect-class structurally closed via pipeline-ordering fix.

**End of report (interim — pending Phase 5-RESET-7 architect signals).**
