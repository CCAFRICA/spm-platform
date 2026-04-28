# OB-196: BCL Clean-Slate Proof Test — Six-Extension Build

**Type:** OB (Operations Backlog)
**Date:** 2026-04-28
**Substrate:** `CCAFRICA/spm-platform` `origin/main` HEAD `6bc005e6...`
**Branch:** `dev` (sync to main first)
**Predecessor:** AUD-004 Remediation Design Document v3, IRA Invocation 1 (six supersession_candidates, ACT-dispositioned), Decisions 154 + 155 LOCKED 2026-04-27
**Audit findings closed:** F-001 through F-009 + F-011
**Reconciliation gate:** Architect-side, post-merge — not in CC scope.

---

## AUTONOMY DIRECTIVE

NEVER ask yes/no. NEVER say "shall I". Just act. Execute all phases sequentially. Commit after each phase. Push after each commit. Confirm build passes after each push. If a phase fails after 3 attempts, halt and surface to architect channel with evidence.

---

## READ FIRST

Read these files completely before drafting any code:

1. `CC_STANDING_ARCHITECTURE_RULES.md` v3.0 — all rules apply.
2. `AUD_004_Remediation_Design_Document_v3_20260427.md` — extension definitions E1–E6, code-path enumeration §2, audit-finding closure map.
3. `SCHEMA_REFERENCE_LIVE.md` — `classification_signals` shape (FP-49 gate before any SQL).
4. `DIAG-024 importer-engine alignment` — diagnostic confirming the failure modes this OB closes.
5. `SCI_PIPELINE_AUDIT.md` (AUD-001) — code extraction reference.

**DO NOT read or reference any ground-truth file (e.g., any file whose name contains `Resultados`, `Esperados`, or any equivalent).** The reconciliation against ground truth is architect-side, post-merge. CC builds the system to derive correct results from source material; CC does not tune logic toward an answer key. Standing Rule: Fix Logic, Not Data.

Confirm all five files read in completion report before Phase 1.

---

## IRA INVOCATION 1 ALIGNMENT

This OB implements IRA Invocation 1's six supersession_candidates 1:1 against the platform substrate. Each phase below maps to one supersession_candidate's recommended action (ACT — extend).

| Phase | IRA Inv 1 finding | Substrate target | Audit findings closed | Bound to R# |
|---|---|---|---|---|
| 1 | Decision 24 / T2-E36 under-serves T1-E910 — vocabulary integrity | E1: canonical declaration surface | F-001, F-005, F-007, F-008 | R1, R2 |
| 2 | Decision 151 / T2-E25 under-serves T1-E904 — dispatch surface integrity | E2: structured failure on unrecognized identifiers | F-002 / F-002b/c/d, F-003, F-004, F-009 | R1, R2, R3, R5 |
| 3 | T1-E902 under-serves T1-E904 — Carry Everything stops at import boundary | E4: round-trip closure to dispatch surface | F-001 + F-008 (structurally) | R2, R8 |
| 4 | T1-E906 under-serves T0-E03 — read-before-derive principle-level | E5: convergence reads plan-agent comprehension before deriving | (Decision 147/153 forward; convergence non-determinism root cause) | R6, R7 |
| 5 | Decision 64 v2 / T2-E01 under-serves T1-E906 — read-before-derive obligation | E3: signal-type read-coupling | F-006, F-011 | R6, R7 |
| 6 | T1-E910 under-serves T0-E03 — Korean Test scope = field names only | E6 / Decision 154: Korean Test extended to operation vocabulary | meta-finding | R11, R1, R4 |

Phase ordering is dependency-driven: E1 ships the registry; E2 dispatches against it; E4 round-trips through the dispatch shape; E5 writes signals into a schema E3's migration creates; E6 verifies the verdict on now-refactored code.

---

## ASSUMPTIONS

| # | Assumption | Mitigation |
|---|---|---|
| A1 | §2 line ranges hold at HEAD `6bc005e6` | Phase 0 substrate verification table |
| A2 | TypeScript const is the right N2 registry mechanism | Phase 0 Architecture Decision Gate compares 4 alternatives against G1–G6 |
| A3 | `signal_level` + `flywheel_scope` columns suffice for E3 read-coupling at flywheel scale | Phase 4 startup check flags violations; surface as known issue if scale-coupling defects emerge |
| A4 | Plan-agent comprehension expressible as L2 Comprehension signal payload | Phase 4 ships basic flow; if D1/D2/D3 dimensions need more substrate, surface as known issue |
| A5 | Single comprehensive PR is the right vertical slice scope | OB delivers as one PR; SR-34 escalation if scope creeps |
| A6 | Decimal precision (Decision 122) holds through every refactored boundary | EFG check (Decimal grep) at every phase commit; Phase 6 negative tests verify |

---

## CC STANDING ARCHITECTURE RULES (MANDATORY)

### Section A: Design Principles

1. **AI-First, Never Hardcoded** — Korean Test (AP-25) applies. Zero language-specific string literals in foundational code.
2. **Scale by Design** — Every decision works at 10× current volume.
3. **Fix Logic, Not Data** — Never tune toward an answer value. Fix the derivation. **No ground-truth file is read by this OB.**
4. **Domain-Agnostic Always** — Platform is Vialuce, not an ICM tool. Domain language permitted only in Domain Agent translation surfaces (per Decision 154 narrow exemption).
5. **Vertical Slice Rule** — Engine and experience evolve together. This OB is one comprehensive PR.
6. **Decision 123 — Compliance from Architecture** — compliance emerges from design, not bolted on.

### Section B: Architecture Decision Gate (mandatory before Phase 1)

CC commits an Architecture Decision Record before any code change.

```
ARCHITECTURE DECISION RECORD — OB-196
======================================
Problem: A tenant imports a plan and calculates wrong because (a) six places
         hand-maintain primitive vocabulary; (b) dispatch surface silently
         falls back on unrecognized identifiers; (c) metadata.intent
         round-trip drops fields; (d) convergence is isolated from plan-agent
         comprehension. Source: DIAG-024.

N2 mechanism alternatives:

Option A — TypeScript const + Domain Agent registration
  - Scale test: works at 10x — registry is module-loaded once
  - AI-first: yes — registry derives from TypeScript types at compile time
  - Transport: in-process module import; no HTTP
  - Atomicity: load atomic with module init
  - G1 (standards): TypeScript type system is W3C-equivalent for typed vocab
  - G2 (embodiment): every consumer imports from one path
  - G3 (traceability): grep-able single source of truth
  - G4 (discipline): compile-time enforcement
  - G5 (abstraction): foundational + domain registries decoupled
  - G6 (evidence): TypeScript compiler rejects string literals not in union

Option B — JSON resource file
  - Scale test: works
  - AI-first: yes
  - Transport: file read at boot
  - Atomicity: yes
  - Loses TypeScript type safety; consumers must validate at runtime.
  - F-005 (six declaration sites with different counts) is exactly the
    failure this would re-introduce at the JSON-vs-TypeScript boundary.

Option C — Database table
  - Scale test: degrades — DB lookup at every dispatch boundary
  - AI-first: yes
  - Transport: SQL at every dispatch — performance prohibitive
  - Wrong layer. Primitives are platform commitments, not tenant data.

Option D — Code-generated source
  - Scale test: works
  - Premature optimization for v0; TypeScript const handles registration
    without code-gen complexity.

CHOSEN: Option A (TypeScript const + Domain Agent registration).
REJECTED: B (loses type safety), C (wrong layer), D (premature complexity).
```

CC commits this ADR as the first commit of Phase 0.

### Section C: Anti-Pattern Registry (check before every code change)

| AP | Pattern | Source |
|---|---|---|
| AP-25 | Korean Test — language-specific string literals in foundational code | Decision 154 |
| AP-21 | Total ≠ sum of details — single data source for both | CLT-72 |
| AP-19 | Commits despite unresolved upstream | CLT-72 |
| AP-17 | Two code paths for one feature (legacy + new without deprecation) | CLT-63 |
| FP-49 | SQL Schema Fabrication — verify column shape against `SCHEMA_REFERENCE_LIVE.md` before SQL | Memory |
| FP-21 | Dual code path | Memory |
| FP-66 | Seeding instead of importing — including tuning logic toward an answer value | Memory |
| FP-69 | Fix one, leave others | Memory |
| FP-70 | Phase deferral as completion | Memory |
| FP-72 | Sidebar ≠ button | Memory |

---

## CC OPERATIONAL RULES

- After EVERY commit: `git push origin dev`.
- After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm `localhost:3000` responds.
- Final step: `gh pr create --base main --head dev` with descriptive title and body.
- Git from repo root (`spm-platform`), NOT `web/`.
- Completion report and proof gates saved to PROJECT ROOT.

### Standing rules invoked in this OB

- **Rule 6**: git from repo root.
- **Rule 25**: completion report file created BEFORE final build verification.
- **Rule 26**: completion report mandatory structure (Commits → Files → Hard Gates → Soft Gates → Compliance → Issues).
- **Rule 27**: evidence = paste code/output, not "this was implemented".
- **Rule 28**: one commit per phase. Collapsed commits = standing rule violation.
- **Rule 29**: this OB committed to git in Phase 0.
- **Rule 34**: no bypass recommendations. Diagnose and fix structurally.
- **Rule 36**: scope = exactly what this OB specifies.
- **Rule 39**: compliance verification gate — auth/access not touched here, but the gate runs.
- **Rule 51v2**: `npx tsc --noEmit` AND `npx next lint` after `git stash` on committed code only.
- **SR-42**: locked-rule halt — Decisions 154, 155, 122, 95 govern; halt and surface if any conflict surfaces during build.
- **Fix Logic Not Data**: no ground-truth file is read; CC tunes nothing toward an answer value.

---

## PHASE 0: SUBSTRATE SYNC + DIAGNOSTIC + ADR

### 0.1 Sync dev to main

```
git fetch origin
git checkout dev
git reset --hard origin/main
git push --force-with-lease origin dev
git rev-parse HEAD
```

The last command must print SHA starting `6bc005e6`. If `--force-with-lease` rejects, halt and surface to architect.

### 0.2 §2 substrate verification table

For each AUD-004 v3 §2 code-path entry, verify the line range still holds. Paste evidence in completion report:

| File | §2 line range | Boundary kind expected | Match at HEAD `6bc005e6` |
|---|---|---|---|
| `web/src/lib/calculation/intent-executor.ts` | 438–450 | executor switch | YES / DRIFTED / REMOVED |
| `web/src/lib/calculation/intent-executor.ts` | 61–140 | `resolveSource` | |
| `web/src/lib/calculation/intent-executor.ts` | 591–603 | `noMatchBehavior` switch | |
| `web/src/lib/calculation/run-calculation.ts` | 362–408 | legacy switch | |
| `web/src/lib/compensation/ai-plan-interpreter.ts` | 681–708 | `convertComponent` default | |
| `web/src/lib/compensation/ai-plan-interpreter.ts` | 667–679 | `convertComponent` 5-tuple | |
| `web/src/lib/calculation/intent-transformer.ts` | (full file) | `transformFromMetadata` | |
| `web/src/app/api/calculate/run/route.ts` | 61 | POST function | |
| `web/src/app/api/calculate/run/route.ts` | 1840–1862 | `training:dual_path_concordance` write | |
| `web/src/lib/intelligence/convergence-service.ts` | (~1,751 lines) | Pass 4 AI semantic derivation | |
| `web/src/lib/ai/providers/anthropic-adapter.ts` | (full file) | plan-agent system + user prompt | |
| `web/src/lib/calculation/intent-types.ts` | (full file) | `IntentOperation` union | |

DRIFTED or REMOVED on any row → halt and surface.

### 0.3 ADR commit

Write the ADR (above) to `OB-196_ARCHITECTURE_DECISION_RECORD.md` in repo root. Commit:

```
git add OB-196_BCL_CSPT_SIX_EXTENSION_BUILD.md OB-196_ARCHITECTURE_DECISION_RECORD.md
git commit -m "OB-196 Phase 0: substrate sync + ADR + §2 verification"
git push origin dev
```

Phase 0 commit: `OB-196 Phase 0: substrate sync + ADR + §2 verification`

---

## PHASE 1: E1 — Canonical declaration surface

**IRA Inv 1 finding 1:** Decision 24 / T2-E36 under-serves T1-E910. Extension required: vocabulary in exactly one canonical declaration; every boundary derives from it.

### 1.1 Create the registry

Create `web/src/lib/calculation/primitive-registry.ts`:

- Export `FoundationalPrimitive` as a TypeScript union of: `linear_function`, `piecewise_linear`, `bounded_lookup_1d`, `bounded_lookup_2d`, `scalar_multiply`, `conditional_gate`, `scope_aggregate`, `aggregate`, `ratio`, `constant`, `weighted_blend`, `temporal_window`.
- Export `isRegisteredPrimitive(s: string): s is FoundationalPrimitive` — type guard.
- Export `lookupPrimitive(id: string): PrimitiveEntry | null` — returns registry entry with structural shape (input spec, output spec, allowed `metadata.intent` keys), or null.
- Export `getRegistry()` — returns frozen array.
- Export `registerDomainPrimitive(owner, entry)` — stub for v1; throws `NotImplementedError` (domain registration out of scope for OB-196).

### 1.2 Refactor consumers

| File | Change |
|---|---|
| `web/src/lib/calculation/intent-types.ts` | Imports identifier strings from `primitive-registry.ts`. The `IntentOperation` union derives from the foundational set. Shape interfaces stay where they are; only identifier strings come from the registry. |
| `web/src/lib/ai/providers/anthropic-adapter.ts` | `buildPrimitiveVocabularyForPrompt()` derives the list from `getRegistry()` at call time. Replaces the hardcoded list in `plan_interpretation` case. **Plan-agent prompt retains AP-25 / Decision 154 narrow exemption — Domain Agent translation surface; domain language permitted ONLY for translation purposes.** |
| `web/src/lib/compensation/ai-plan-interpreter.ts` | `normalizeComponentType` and `normalizeCalculationMethod` consult `isRegisteredPrimitive()` at every check. Reject unregistered identifiers (Phase 2 makes the rejection a structured throw). |

### 1.3 Verification

```bash
grep -rn "'linear_function'\|'piecewise_linear'\|'bounded_lookup_1d'\|'bounded_lookup_2d'\|'scalar_multiply'\|'conditional_gate'\|'scope_aggregate'" web/src/lib/calculation/ web/src/lib/compensation/
```

Expected: hits only in `primitive-registry.ts` and `intent-types.ts` (the union derivation). Hits anywhere else = Phase 1 incomplete. Plan-agent prompt under `web/src/lib/ai/providers/` is exempt — DO NOT include in this grep.

### 1.4 Commit

```
git commit -m "OB-196 Phase 1: E1 — primitive-registry.ts + consumers derive from registry (closes F-001, F-005, F-007, F-008)"
git push origin dev
```

After push: kill dev server → `rm -rf .next` → `npm run build` → confirm zero errors → `npm run dev` → confirm `localhost:3000` responds.

---

## PHASE 2: E2 — Structured failure on unrecognized identifiers

**IRA Inv 1 finding 2:** Decision 151 / T2-E25 under-serves T1-E904. Extension required: dispatch surface validates every primitive against the canonical declaration; produces *observable, named, structured* failure on unrecognized identifiers.

### 2.1 Define error classes

Create `web/src/lib/calculation/dispatch-errors.ts`:

```typescript
export class UnknownPrimitiveError extends Error {
  constructor(public primitive: string, public context: { boundary: string; tenant_id?: string }) { ... }
}
export class UnknownSourceTypeError extends Error { ... }
export class InvalidNoMatchBehaviorError extends Error { ... }
export class LegacyEngineUnknownComponentTypeError extends Error { ... }
export class UnconvertibleComponentError extends Error { ... }
```

Each carries a structured payload (boundary name, primitive identifier, tenant_id for telemetry).

### 2.2 Refactor dispatch surfaces

| File | Line range | Change |
|---|---|---|
| `web/src/lib/calculation/intent-executor.ts` | 438–450 | Default branch: `throw new UnknownPrimitiveError(op.operation, { boundary: 'intent_executor.dispatch' })`. F-002 closes. |
| `web/src/lib/calculation/intent-executor.ts` | 61–140 | `resolveSource` throws `UnknownSourceTypeError` instead of returning undefined. F-002b closes. |
| `web/src/lib/calculation/intent-executor.ts` | 591–603 | `noMatchBehavior` switch: each case explicit (`'zero'`, `'error'`, `'nearest'`). Add `default:` throwing `InvalidNoMatchBehaviorError`. F-002c, F-002d close. |
| `web/src/lib/calculation/run-calculation.ts` | 362–408 | Legacy switch: mark `@deprecated`. Default throws `LegacyEngineUnknownComponentTypeError` instead of `payout = 0`. F-003 closes. |
| `web/src/lib/compensation/ai-plan-interpreter.ts` | 681–708 | `convertComponent` default: throw `UnconvertibleComponentError(originalComponent)` instead of writing `tier_lookup`. F-004 closes. |
| `web/src/app/api/calculate/run/route.ts` | 61 | Wrap POST body in try/catch. Catch the five error types; respond HTTP 422 with structured payload `{ error_type, primitive, context }`. F-009 closes. |

### 2.3 Verification

```bash
grep -n 'return 0' web/src/lib/calculation/intent-executor.ts
grep -n '|| 0' web/src/lib/calculation/intent-executor.ts
grep -n "'tier_lookup'" web/src/lib/compensation/ai-plan-interpreter.ts
```

Inspect each remaining hit. Silent fallbacks at dispatch boundaries = Phase 2 failure.

### 2.4 Commit

```
git commit -m "OB-196 Phase 2: E2 — dispatch surface throws structured errors (closes F-002, F-002b, F-002c, F-002d, F-003, F-004, F-009)"
git push origin dev
```

Build verification.

---

## PHASE 3: E4 — Round-trip closure for `metadata.intent`

**IRA Inv 1 finding 4:** T1-E902 (Carry Everything) under-serves T1-E904 — Carry Everything stops at import boundary. Extension required: every primitive identifier persisted at import is recognizable at every downstream boundary.

### 3.1 Refactor `convertComponent` 5-tuple

`web/src/lib/compensation/ai-plan-interpreter.ts` lines 667–679:

- The new path: `metadata.intent` carries the full structural intent emitted by the AI.
- The legacy `componentType` + `tierConfig` shape is populated **from** `metadata.intent`, not the other way around. Backward compat for legacy readers; forward fidelity for new consumers.
- Every primitive identifier the AI emits → preserved into `metadata.intent` → readable by `intent-executor.ts` without information loss.

### 3.2 Refactor `transformFromMetadata`

`web/src/lib/calculation/intent-transformer.ts`:

- Preserves all fields from `metadata.intent`. No discard.
- Output shape conforms to `ComponentIntent` from `intent-types.ts`.

### 3.3 Round-trip unit test

Create `web/src/lib/calculation/__tests__/round-trip.test.ts`:

For each foundational primitive (12 total): build a `ComponentIntent`, project to legacy shape via `convertComponent`, project back via `transformFromMetadata`. Assert exact equality.

**Synthetic test fixtures only.** Do NOT seed test inputs from any tenant data file or ground-truth file. Test `ComponentIntent` shapes are constructed in code.

### 3.4 Verification

```bash
cd web && npx jest src/lib/calculation/__tests__/round-trip.test.ts
```

All 12 primitives PASS. Paste output to completion report.

### 3.5 Commit

```
git commit -m "OB-196 Phase 3: E4 — metadata.intent round-trip closure (closes F-001, F-008 structurally)"
git push origin dev
```

Build verification.

---

## PHASE 4: E5 — Plan-agent comprehension flows to convergence

**IRA Inv 1 finding 5:** T1-E906 under-serves T0-E03 (Comprehensive) — read-before-derive is principle-level. Plan-agent comprehension flows to convergence as L2 Comprehension signals.

### 4.1 Plan-agent comprehension write

`web/src/lib/ai/providers/anthropic-adapter.ts`:

When the plan agent returns, write its comprehension as a row on `classification_signals` with:
- `signal_type = 'plan_agent:comprehension_v1'`
- `signal_level = 'L2'` (Phase 5 migration adds this column; Phase 4 references it forward)
- `flywheel_scope = 'tenant'`
- `signal_value` = structured comprehension (entity hints, metric hints, scope hints).

### 4.2 Convergence read

`web/src/lib/intelligence/convergence-service.ts`:

Before invoking Pass 4 AI semantic derivation: read latest `plan_agent:comprehension_v1` L2 signal for the tenant + structural fingerprint. Pass that comprehension into the derivation as context.

### 4.3 Signal coupling registry

Create `web/src/lib/intelligence/signal-registry.ts`:

- Exports `EXPECTED_SIGNAL_COUPLINGS` — list of `{signal_type, expected_readers}` pairs.
- Exports `verifySignalCoupling()` — runs at application startup. For every signal_type written somewhere in the codebase, verifies at least one reader exists.
- If any signal_type has no reader, log a structured error and (in v0) emit warning. (v1: fail boot.)

Wire `verifySignalCoupling()` into application startup.

### 4.4 Verification

- Test: a plan import writes one `plan_agent:comprehension_v1` row to `classification_signals` with `signal_level = 'L2'`.
- Test: the next calculation run reads it before invoking convergence Pass 4.
- Application startup logs `[signal-registry] all expected signal types coupled` — no warnings.

**Test fixtures synthetic; no tenant ground-truth seeding.**

### 4.5 Commit

```
git commit -m "OB-196 Phase 4: E5 — plan-agent comprehension as L2 signal; convergence reads before deriving (closes F-006, implements Decision 147/153 forward)"
git push origin dev
```

Build verification.

---

## PHASE 5: E3 — `classification_signals` migration + read-coupling enforcement

**IRA Inv 1 finding 3:** Decision 64 v2 / T2-E01 under-serves T1-E906 — every signal written shall have at least one defined reader before the next calculation run.

### 5.1 SQL schema verification (FP-49 gate)

Before drafting migration, paste current `classification_signals` schema:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'classification_signals'
ORDER BY ordinal_position;
```

Confirm 20 columns (per `SCHEMA_REFERENCE_LIVE.md`). If schema differs, halt — `SCHEMA_REFERENCE_LIVE.md` is stale, refresh before continuing.

### 5.2 Migration

Create `web/supabase/migrations/<timestamp>_aud_004_signal_levels.sql`:

```sql
-- AUD-004 E3/E5: signal-surface read-coupling enforcement
ALTER TABLE classification_signals
  ADD COLUMN signal_level TEXT CHECK (signal_level IN ('L1', 'L2', 'L3')),
  ADD COLUMN flywheel_scope TEXT CHECK (flywheel_scope IN ('tenant', 'foundational', 'domain'));

-- Backfill: existing rows are L1 (Classification) tenant-scope per Decision 64 v2 base case
UPDATE classification_signals
SET signal_level = 'L1', flywheel_scope = 'tenant'
WHERE signal_level IS NULL;

ALTER TABLE classification_signals
  ALTER COLUMN signal_level SET NOT NULL,
  ALTER COLUMN flywheel_scope SET NOT NULL;

CREATE INDEX idx_classification_signals_level_scope
  ON classification_signals(signal_level, flywheel_scope, tenant_id, created_at DESC);
```

Apply via Supabase SQL Editor or `supabase db push`. Verify with information_schema query.

### 5.3 Update existing signal-write call sites

For every signal-write call site in the codebase: explicitly specify `signal_level` and `flywheel_scope`.

- L1 / tenant: SCI classification outcomes (existing default).
- L2 / tenant: plan-agent comprehension (Phase 4).
- L3 / tenant: convergence Pass 4 derivation outcomes.

The `training:dual_path_concordance` write at `web/src/app/api/calculate/run/route.ts:1840-1862` (F-011): no reader has been added in any prior HF; remove the write. Replace with a comment explaining the removal references F-011.

### 5.4 Verification

```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'classification_signals'
  AND column_name IN ('signal_level', 'flywheel_scope');
```

Both rows present. Constraints active. Paste output to completion report.

### 5.5 Commit

```
git commit -m "OB-196 Phase 5: E3 — classification_signals signal_level + flywheel_scope; F-011 unread-write removed"
git push origin dev
```

Build verification.

---

## PHASE 6: E6 / Decision 154 — Korean Test verdict + negative tests

**IRA Inv 1 finding 6:** T1-E910 under-serves T0-E03 — Korean Test scope = field names only. Decision 154 extends to operation/primitive vocabulary.

### 6.1 Korean Test verdict pass

For every file modified in Phases 1–5, run the Korean Test verdict check:

```bash
grep -rn "'linear_function'\|'piecewise_linear'\|'bounded_lookup_1d'\|'bounded_lookup_2d'\|'scalar_multiply'\|'conditional_gate'\|'scope_aggregate'\|'aggregate'\|'ratio'\|'constant'\|'weighted_blend'\|'temporal_window'" web/src/lib/calculation/ web/src/lib/compensation/ web/src/lib/intelligence/ \
  | grep -v primitive-registry.ts \
  | grep -v intent-types.ts \
  | grep -v __tests__ \
  | grep -v anthropic-adapter.ts
```

Expected: zero hits. Any hit = Decision 154 violation; refactor before commit.

### 6.2 Negative tests

Create `web/src/lib/calculation/__tests__/dispatch-errors.test.ts`:

```typescript
describe('E2 structured failure', () => {
  test('unknown primitive throws UnknownPrimitiveError', async () => {
    // Synthetic rule_set with op.operation = 'imaginary_primitive'
    // Expect: throws UnknownPrimitiveError; HTTP 422; no silent zero
  });
  test('invalid noMatchBehavior throws InvalidNoMatchBehaviorError', async () => { /* ... */ });
  test('unconvertible component throws UnconvertibleComponentError', async () => { /* ... */ });
});
```

**All test fixtures are synthetic. No tenant ground-truth file is read by any test.**

### 6.3 Decimal precision EFG check (Decision 122)

```bash
grep -rn 'Number(' web/src/lib/calculation/ | grep -v '__tests__'
grep -rn '\.toNumber()' web/src/lib/calculation/ | grep -v '__tests__'
grep -rn 'parseFloat' web/src/lib/calculation/ | grep -v '__tests__'
```

Expected: empty or only pre-existing hits documented in Decision 122. Any new hit on the dispatch path = Decimal regression. Halt and refactor.

### 6.4 Run full test suite

```bash
cd web && npm run test
```

All existing tests still pass. Paste output to completion report.

### 6.5 Commit

```
git commit -m "OB-196 Phase 6: E6 — Korean Test verdict pass + negative tests for dispatch errors (Decision 154 enforced)"
git push origin dev
```

Build verification.

---

## PHASE 7: COMPLIANCE GATES

### 7.1 Run from `web/`

```bash
git stash
npx tsc --noEmit 2>&1 | tee /tmp/tsc.out
npx next lint 2>&1 | tee /tmp/lint.out
git stash pop
```

Both pass clean. Paste output to completion report.

### 7.2 Run from repo root

```bash
git status
git log --oneline origin/main..HEAD
```

Paste output to completion report.

Phase 7 commit: `OB-196 Phase 7: compliance gate evidence`

---

## PHASE 8: COMPLETION REPORT + PR

### 8.1 Completion report

Create `OB-196_COMPLETION_REPORT.md` in repo root BEFORE final push (Rule 25).

```markdown
# OB-196 — BCL CSPT Six-Extension Build — Completion Report

## Date / time

## IRA INVOCATION 1 ALIGNMENT
| Phase | IRA Inv 1 finding | Substrate | Status |
| 1 | Decision 24 / T2-E36 → vocabulary integrity | E1 | PASS / FAIL |
| 2 | Decision 151 / T2-E25 → dispatch integrity | E2 | PASS / FAIL |
| 3 | T1-E902 → round-trip closure | E4 | PASS / FAIL |
| 4 | T1-E906 → read-before-derive | E5 | PASS / FAIL |
| 5 | Decision 64 v2 / T2-E01 → signal coupling | E3 | PASS / FAIL |
| 6 | T1-E910 → Korean Test extended | E6 / Decision 154 | PASS / FAIL |

## COMMITS (in order)
| Hash | Phase | Description |

## FILES CREATED
| File | Purpose |

## FILES MODIFIED
| File | Phase | Change |

## PROOF GATES — HARD
| # | Criterion (verbatim) | PASS/FAIL | Evidence |
| 1 | Substrate sync — HEAD = 6bc005e6 after reset | | <git rev-parse output> |
| 2 | §2 line ranges verified at HEAD | | <substrate verification table with paste evidence per row> |
| 3 | ADR committed before Phase 1 | | <git log showing ADR commit> |
| 4 | Phase 1 — primitive identifier grep clean (registry + intent-types only) | | <grep output> |
| 5 | Phase 2 — silent fallback grep clean | | <grep output for 'return 0', '|| 0', 'tier_lookup'> |
| 6 | Phase 3 — round-trip test PASS for all 12 primitives | | <jest output> |
| 7 | Phase 4 — plan-agent L2 write test PASS; convergence read test PASS | | <test output + startup log> |
| 8 | Phase 5 — migration applied; signal_level + flywheel_scope columns present | | <information_schema query output> |
| 9 | Phase 6 — Korean Test verdict pass clean (zero illegal string literals) | | <grep output> |
| 10 | Phase 6 — three negative tests PASS | | <jest output> |
| 11 | Decimal precision check — no new Number/toNumber/parseFloat hits on dispatch path | | <grep output> |
| 12 | Compliance gates — tsc + lint clean | | <tsc + lint output> |
| 13 | All existing tests still pass | | <npm run test output> |
| 14 | PR opened against main from dev | | <PR URL> |
| 15 | No ground-truth file read at any phase | | <grep over Read First and test fixtures showing zero `Resultados`/`Esperados` references> |

## PROOF GATES — SOFT
| # | Criterion | PASS/FAIL | Evidence |
| 1 | Architecture Decision Record cites G1–G6 evaluation for each option | | <ADR section paste> |
| 2 | Each phase commit message references the IRA finding it implements | | <git log> |

## STANDING RULE COMPLIANCE
- Rule 6 (git from repo root): PASS / FAIL — evidence
- Rule 25 (CR before final build): PASS / FAIL
- Rule 26 (mandatory CR structure): PASS — this file
- Rule 27 (paste evidence): PASS / FAIL
- Rule 28 (one commit per phase): PASS — 8 commits for 8 phases
- Rule 29 (OB committed in Phase 0): PASS / FAIL
- Rule 34 (no bypass): PASS / FAIL
- Rule 36 (scope held): PASS / FAIL
- Rule 51v2 (tsc + lint stash): PASS / FAIL
- Korean Test (AP-25 / Decision 154): PASS / FAIL — evidence
- Fix Logic Not Data: PASS — evidence (no GT file referenced)

## ASSUMPTIONS VALIDATED / OPEN
| # | Assumption | Status | Notes |
| A1 | §2 line ranges hold | VALIDATED / DRIFTED | |
| A2 | TypeScript const N2 mechanism | VALIDATED | ADR Phase 0 |
| A3 | signal_level + flywheel_scope sufficient | OPEN | Surface as known issue if read-coupling at scale defects emerge |
| A4 | Plan-agent comprehension expressible as L2 signal payload | OPEN | If D1/D2/D3 dimensions need more substrate, surface |
| A5 | Single comprehensive PR scope | VALIDATED / ESCALATED | |
| A6 | Decimal precision held | VALIDATED | Phase 6 grep evidence |

## KNOWN ISSUES
(anything deferred, partially complete, surfaced for architect)

## VERIFICATION SCRIPT OUTPUT
(any verification scripts run during the build)
```

### 8.2 Push and PR

```bash
git push origin dev
gh pr create --base main --head dev \
  --title "OB-196: BCL CSPT — six-extension build (E1–E6) closes F-001 through F-009 + F-011" \
  --body "Implements AUD-004 Remediation Design Document v3 against substrate origin/main HEAD 6bc005e6.

Six phases mapping 1:1 to IRA Invocation 1's six supersession_candidates:

Phase 1: E1 — primitive-registry.ts (closes F-001, F-005, F-007, F-008)
Phase 2: E2 — dispatch surface throws structured errors (closes F-002, F-002b/c/d, F-003, F-004, F-009)
Phase 3: E4 — metadata.intent round-trip closure (closes F-001+F-008 structurally)
Phase 4: E5 — plan-agent comprehension flows to convergence as L2 signal
Phase 5: E3 — classification_signals signal_level + flywheel_scope (closes F-006, F-011)
Phase 6: E6 / Decision 154 — Korean Test extended to operation vocabulary

No ground-truth file referenced by this build. Reconciliation against ground truth is architect-side, post-merge.

Decisions 154 + 155 LOCKED 2026-04-27 against this work."
```

Phase 8 commit: `OB-196 Phase 8: completion report + PR`

---

## ANTI-PATTERN CHECKS (CC self-attests in completion report)

- [ ] No SQL data fixes (Standing Rule 34)
- [ ] No silent fallbacks at any dispatch boundary (E2)
- [ ] No domain language in foundational code outside Domain Agent translation surface (Decision 154)
- [ ] No Decimal regression on dispatch path (Decision 122)
- [ ] No collapsed commits (Rule 28)
- [ ] No self-attestation without paste evidence (Rule 27)
- [ ] No scope creep beyond E1–E6 (Rule 36)
- [ ] No bypass / workaround branches (SR-34)
- [ ] **No ground-truth file read or referenced anywhere in the build (Fix Logic Not Data)**

---

## ESCALATION TRIGGERS (halt and surface to architect channel)

1. Phase 0.1 sync rejected by `--force-with-lease`.
2. Phase 0.2 §2 line range DRIFTED or REMOVED on any row.
3. Phase 1 grep shows registry isn't the only source post-refactor.
4. Phase 4 signal-registry startup check fails — some signal_type has no reader.
5. Phase 5 schema verification shows `classification_signals` differs from `SCHEMA_REFERENCE_LIVE.md`.
6. Phase 6 Decimal precision check shows new hits on dispatch path.
7. Compliance gates (tsc, lint) fail on committed code at any phase.
8. Any phase fails 3 attempts.
9. Any temptation to read a ground-truth file or seed test fixtures from tenant data — halt; that is FP-66-class, structural.

Paste exact evidence to architect channel. No workarounds (SR-34).

---

*OB-196 · BCL Clean-Slate Proof Test build · Substrate `CCAFRICA/spm-platform` `origin/main` HEAD `6bc005e6...` · IRA Invocation 1 six supersession_candidates ACT-dispositioned · Decisions 154 + 155 LOCKED 2026-04-27 · Reconciliation against ground truth is architect-side, post-merge*
