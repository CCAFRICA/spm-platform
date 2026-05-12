# HF-201 — Restore L2 Signal Producer-Consumer Shape Alignment

**Class:** HF (VP code hot fix)
**Repo:** `~/spm-platform`
**Branch:** `hf-201-l2-signal-shape-alignment` (create from main HEAD `9f209bdf`)
**IRA authority:** invocation 2026-05-05; Shape B recommended (rank 1, cost $1.3462) per `docs/IRA-responses/IRA_HF_201_Type_Architecture_Shape_20260505.md`
**Substrate authority:**
- **IRA verdict:** Shape B preserves architectural boundary between intelligence layer (InterpretedComponent) and engine-format (PlanComponent); establishes type-shape-per-signal-tier pattern
- **Decision 109 (WITHDRAWN — empirically unfounded thresholds):** no developer-set thresholds introduced; correctness derives from semantic match
- **Decision 124 (Research-Derived Design):** convergence binding correctness derives from plan-agent reasoning, not magic numbers
- **Decision 64 (Dual Intelligence) / T2-E01:** Plan Intelligence Profile feeds Convergence Layer per layer's original output shape
- **Decision 117 (Field Identity Architecture) / T2-E12:** import identifies, convergence routes; preserved by maintaining engine-format/intelligence-format boundary
- **HF-198 α architectural intent:** read-before-derive operative; L2 signals carry plan-agent's original output shape
**Verification anchors (architect-channel; not in CC paste):** BCL October GT $44,590; full BCL reconciliation $312,033

## ARCHITECT INTENT

Close the empty `semantic_intent` defect localized by DIAG-030. Defect: `convertComponent` at `ai-plan-interpreter.ts:439-455` translates `InterpretedComponent → PlanComponent` and drops `reasoning` field; emitter callers at `execute/route.ts:1324, 1573` pass engine-format `PlanComponent[]` (which lacks `reasoning`) to `plan-comprehension-emitter.ts`; emitter writes `signal_value.semantic_intent = null` for all L2 signals; convergence Pass 4 receives signals with empty intent → AI semantic derivation operates without authoritative plan-agent context → 3 of 5 BCL metrics gap.

Shape B fix: re-route emitter callers to pass `interpretation.components` (InterpretedComponent[]) directly. Engine-format `PlanComponent` contract unchanged. Plan-agent's original output shape flows to L2 signal surface. Type-shape-per-signal-tier pattern instantiated.

Folded scope: DIAG-030 Known Issue 3 (`metric_inputs` partial population, 3/8 BCL signals) — same emitter, related defect. InterpretedComponent's `calculationIntent` shape is richer than PlanComponent's; Shape B re-route may incidentally fix `metric_inputs` partial population. If `metric_inputs` remains partial after re-route, CC surfaces in completion report; remediation deferred to follow-on.

## OUT OF SCOPE (deferred)

- **T1-E906 extension** per IRA supersession_candidate — VG-side ICA capture; substrate-promotion follow-on
- **T2-E12 (Decision 117) extension** per IRA supersession_candidate — VG-side ICA capture; substrate-promotion follow-on
- **HF-199 γ threshold (`BOUNDARY_FALLBACK_MIN_SCORE = 0.50`)** Decision 109 review — evaluate post-HF-201 empirically
- **canonicalization-layer closure** (DIAG-025 four sites) — separate HF; not blocking BCL reconciliation
- **clean slate** — not required; current data state sufficient for verification flow

## CC PASTE BLOCK (everything below this line is CC-pasteable; nothing follows per Rule 29)

```markdown
# HF-201 — Restore L2 Signal Producer-Consumer Shape Alignment (Shape B)

**Repo:** `~/spm-platform`
**Branch:** create `hf-201-l2-signal-shape-alignment` from main HEAD
**Inheritance:** `CC_STANDING_ARCHITECTURE_RULES.md` Rules 1-28
**Bindings:**
- T1-E905 (Prove Don't Describe) — verbatim before/after diff in completion report
- T1-E907 (Fix Logic Not Data) — code change only; no data migration
- T1-E910 (Korean Test) — InterpretedComponent shape is structural; no language-specific keys
- T2-E46 (Reconciliation-Channel Separation) — CC reports calc output; architect reconciles
- T5-E1064 (Procedural Theater Minimization) — single phase; no per-step ceremony
- SR-34 (No Bypass) — restores producer-consumer shape alignment per IRA-recommended pattern

## SCOPE

Two changes at `web/src/app/api/import/sci/execute/route.ts` (per DIAG-030 Dimension 3 evidence):

**Site 1 — line 1324 (within `executeBatchedPlanInterpretation`):** change emitter argument from `variants.flatMap(v => v.components ?? [])` to `interpretation.components`.

**Site 2 — line 1573 (within `executePlanPipeline`):** same change.

**Do NOT modify:**
- `convertComponent` at `ai-plan-interpreter.ts:439-455`
- `PlanComponent` interface at `web/src/types/compensation-plan.ts:72-89`
- `plan-comprehension-emitter.ts` (already reads `comp.reasoning` correctly; InterpretedComponent has the field)
- Any other file

## EXECUTION

### Phase 0 — Branch + baseline read

```bash
cd ~/spm-platform
git checkout main
git pull origin main
git checkout -b hf-201-l2-signal-shape-alignment
git rev-parse HEAD
```

PASTE output. Then capture pre-fix state of both call sites:

```bash
sed -n '1320,1330p' web/src/app/api/import/sci/execute/route.ts
sed -n '1568,1578p' web/src/app/api/import/sci/execute/route.ts
```

PASTE output. This becomes BEFORE state in the completion report.

### Phase 1 — Code changes

Edit both call sites to pass `interpretation.components` instead of `variants.flatMap(v => v.components ?? [])`. Verify `interpretation` variable is in scope at both call sites; if it's named differently (e.g., `result`, `planInterpretation`), use the correct local name.

After edit, capture post-fix state:

```bash
sed -n '1320,1330p' web/src/app/api/import/sci/execute/route.ts
sed -n '1568,1578p' web/src/app/api/import/sci/execute/route.ts
```

PASTE output. AFTER state for completion report.

### Phase 2 — Type compatibility check

The emitter's input type accepts a `ComponentLike` shape per DIAG-030 Dimension 2. Confirm InterpretedComponent satisfies ComponentLike:

```bash
grep -B 2 -A 15 "interface ComponentLike\|type ComponentLike" web/src/lib/compensation/plan-comprehension-emitter.ts
grep -B 2 -A 25 "interface InterpretedComponent\|type InterpretedComponent" web/src/lib/compensation/ai-plan-interpreter.ts
```

PASTE both. Confirm field compatibility. If TypeScript reports type errors after Phase 1, surface in chat; do not auto-cast.

### Phase 3 — Build + lint

```bash
cd web && npm run build 2>&1 | tail -30
npm run lint 2>&1 | tail -20
```

PASTE output. Both must pass before commit.

### Phase 4 — Commit + push

```bash
cd ~/spm-platform
git add web/src/app/api/import/sci/execute/route.ts
git commit -m "HF-201: restore L2 signal producer-consumer shape alignment

Re-routes plan-comprehension-emitter callers at execute/route.ts:1324
and :1573 to pass interpretation.components (InterpretedComponent[])
instead of variants.flatMap(v => v.components) (PlanComponent[]).

Closes DIAG-030 capture-side defect: convertComponent drops 'reasoning'
field during InterpretedComponent → PlanComponent translation; emitter
was reading comp.reasoning from engine-format which lacks the field;
result was empty signal_value.semantic_intent across all L2 signals;
convergence Pass 4 received signals without authoritative plan-agent
context.

Shape B per IRA invocation 2026-05-05 (rank 1, cost \$1.3462). Preserves
architectural boundary between intelligence layer (InterpretedComponent)
and engine-format (PlanComponent). Establishes type-shape-per-signal-tier
pattern: L2 Comprehension signals consume intelligence layer's original
output shape, not engine-translated shape.

DIAG-030 Known Issue 3 (metric_inputs partial population) folded:
InterpretedComponent calculationIntent shape is richer than PlanComponent;
re-route may incidentally close metric_inputs partial population. If
not, surfaced in completion report for follow-on.

Substrate: T1-E906 read-before-derive; T1-E910 Korean Test; Decision 64
Dual Intelligence; Decision 117 Field Identity Architecture; Decision
147 plan-agent comprehension precedence.

IRA supersession_candidates surfaced for VG-side ICA capture (deferred):
T1-E906 extension; T2-E12 (Decision 117) extension."
git push origin hf-201-l2-signal-shape-alignment
```

PASTE output.

### Phase 5 — Open PR

```bash
gh pr create --title "HF-201: restore L2 signal producer-consumer shape alignment (Shape B)" \
  --body "Re-routes plan-comprehension-emitter callers to InterpretedComponent[]. Closes DIAG-030 empty semantic_intent defect. Shape B per IRA invocation 2026-05-05 rank 1. See commit message for substrate citations."
```

PASTE output including PR number.

### Phase 6 — Completion report

Write `docs/completion-reports/HF-201_L2_SIGNAL_SHAPE_ALIGNMENT_COMPLETION_REPORT_<YYYYMMDD>.md` per Rule 26 mandatory structure.

Hard Gates evidence:
- BEFORE state from Phase 0 (verbatim, both sites)
- AFTER state from Phase 1 (verbatim, both sites)
- Diff between them (verbatim `git diff HEAD~1` output)
- Phase 2 type compatibility evidence (ComponentLike + InterpretedComponent shapes)
- Build output PASS
- Lint output PASS
- Commit SHA + push confirmation
- PR number from Phase 5

Soft Gates:
- T1-E905 verbatim PASS
- T1-E907 code-not-data PASS
- T2-E46 channel separation PASS
- T5-E1064 single-phase PASS
- SR-34 no-bypass PASS

Known Issues section: address DIAG-030 Known Issue 3 (`metric_inputs` partial population) post-fix verification:

```bash
grep -B 3 -A 15 "metric_inputs\|metricInputs" web/src/lib/compensation/plan-comprehension-emitter.ts
```

PASTE output. CC reports whether emitter's `calcIntent?.input` access works against InterpretedComponent's calculationIntent shape (covers ratio-style operations) and whether other operation types (`bounded_lookup_2d.inputs` plural, `conditional_gate.condition`) still produce null `metric_inputs`. Architect dispositions follow-on.

PASTE completion report content in chat.

## HALT CONDITIONS (single statement; T5-E1064)

HALT and surface to architect if:
- Phase 0 sed output shows call sites have moved from expected line numbers (1324, 1573) — DIAG-030 was based on main HEAD `9f209bdf`; if branch creates from a different HEAD, lines may differ
- Phase 2 reveals InterpretedComponent does NOT satisfy ComponentLike (TypeScript error after Phase 1) — surface error verbatim; do not auto-cast or modify ComponentLike
- Phase 3 build or lint fails

Otherwise: execute continuously through Phases 0-6. NO yes/no questions. NO per-phase pings.

## NO FURTHER SCOPE

Do not touch `convertComponent`. Do not modify `PlanComponent` interface. Do not modify emitter. Do not refactor adjacent code. Do not "improve" what you find. Two-line caller re-route + completion report.

END OF DIRECTIVE.
```
