# HF-194: OB-196 PHASE 1.5 CLOSURE COMPLETION + CLUSTER B G8-03 REMEDIATION
## Align Importer to Canonical Dispatch Pattern + Refactor AI Prompt to Registry-Derived Vocabulary

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules apply (SR-1 through SR-51v2)
2. `SCHEMA_REFERENCE_LIVE.md` — authoritative column reference
3. `docs/audit-evidence/phase4/cluster_b_evidence.md` — Probe S-CODE-G5-01 (canonical dispatch pattern), Probe S-CODE-G8-03 (AI prompt construction findings), Phase 4 audit verbatim
4. `docs/audit-evidence/phase4/cluster_a_evidence.md` — Phase 4 audit Cluster A G7/G11 findings; supports cross-cluster reasoning
5. `docs/completion-reports/OB-197_COMPLETION_REPORT.md` — signal surface rebuild context
6. `web/src/lib/calculation/primitive-registry.ts` — the canonical surface (12 foundational primitives)
7. `web/src/lib/calculation/intent-executor.ts:444-471` — canonical dispatch pattern (Reference Pattern A)
8. `web/src/lib/calculation/run-calculation.ts:255-280` — canonical dispatch pattern (Reference Pattern B)

**Read all eight before writing any code.**

---

## WHAT THIS HF BUILDS

OB-196 Phase 1.5 locked Option A (eliminate legacy aliases, registry as canonical surface, prompt derives from registry, persisted data migrated). Two parts of that closure shipped with violations of its own locked disposition:

**Violation 1 — Importer dispatch holds a private 5-of-12 primitive subset.** `web/src/lib/compensation/ai-plan-interpreter.ts:432` `convertComponent` hardcodes only 5 foundational primitives as importable (`linear_function`, `piecewise_linear`, `scope_aggregate`, `scalar_multiply`, `conditional_gate`). Excludes `bounded_lookup_1d`, `bounded_lookup_2d`, `aggregate`, `ratio`, `constant`, `weighted_blend`, `temporal_window` — all in the registry, all dispatched correctly by the executor and run-calculation surfaces. This is F-005 pattern at one remaining surface.

**Violation 2 — Plan AI prompt teaches legacy vocabulary at outer wrapper.** `web/src/lib/ai/providers/anthropic-adapter.ts` has the inner `<<FOUNDATIONAL_PRIMITIVES>>` placeholder substitution working correctly (Phase 1.5.1.1 shipped). The outer wrapper — 4 worked examples (lines 162–240), RULES section (lines 332, 340–356), example labels (lines 388, 404, 425, 434), type-union strings (lines 779, 986), field-presence comments (lines 989–992) — still teaches legacy vocabulary (`matrix_lookup`, `tiered_lookup`, `flat_percentage`, `conditional_percentage`). AI emits exactly what the outer wrapper teaches.

**Violation 3 — `document_analysis` prompt holds a parallel calculationType vocabulary.** Phase 4 audit S-CODE-G8-03 finding (cluster_b_evidence.md line 323): `web/src/lib/ai/providers/anthropic-adapter.ts:766-786` defines `calculationType: "tiered_lookup|matrix_lookup|flat_percentage|conditional_percentage"` — *not registry-derived*. F-007-class concern. Same surface as Violation 2 at a different prompt.

**The HF closes all three with substrate-grounded structural patterns:**

1. **Importer dispatch alignment** — Replace the 5-case hardcoded switch with the canonical dispatch pattern that already ships at `intent-executor.ts:444-471` and `run-calculation.ts:255-280`: 12-case registry-derived switch with structured-failure default, vocabulary derivation enforced via TypeScript discriminated union from `FoundationalPrimitive`. Closes Violation 1.

2. **Plan AI outer wrapper refactor** — Rewrite worked examples, RULES, type-unions, and field-presence comments to use foundational-only vocabulary. Closes Violation 2 + completes OB-196 Phase 1.5.1.2 (which was supposed to ship and didn't).

3. **`document_analysis` prompt refactor** — Replace parallel `calculationType` enumeration with registry-derived vocabulary at the structural layer. Closes Violation 3 / Phase 4 S-CODE-G8-03 finding.

**After this HF: zero private vocabulary copies of structural primitives anywhere in `web/src/lib/`. Decision 154/155 satisfied at every dispatch and documenting boundary. BCL plan import unblocks (BCL Tablas de Tasas → `bounded_lookup_2d`; Plan General → `bounded_lookup_1d` or `scalar_multiply`).**

**Out of scope (explicitly NOT in this HF):**
- Schema changes — none required; classification_signals constraint is already correct from OB-197
- Registry expansion — the 12 foundational primitives stay; this HF makes the importer recognize all 12, doesn't add a 13th
- Domain primitive registration — `registerDomainPrimitive` stub stays as Decision 154 v1; no domain registration in this HF
- G11 enforcement mechanism specification — DS-021 §14 forward-looking; separate substrate work
- Cluster B G5-02 finding (intent-validator VALID_SOURCES drift, 6 vs 8 entries) — out of scope for this HF; tracked separately
- Cluster B G8-01 finding (content-profile.ts:163 short-circuit) — out of scope for this HF; tracked separately

---

## STANDING RULES

1. After EVERY commit: `git push origin hf-194-phase15-closure-completion`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000 responds
3. Final step: `gh pr create --base main --head hf-194-phase15-closure-completion` with descriptive title and body
4. **Fix logic, not data.** Vocabulary literals introduced in this HF must come from the registry; if a refactor would require a literal not in the registry, HALT.
5. **Commit this prompt to git as first action** at `docs/vp-prompts/HF-194_PHASE15_CLOSURE_COMPLETION.md`.
6. **Git from repo root (spm-platform), NOT web/.**
7. **Zero domain language introduced.** Korean Test applies. The refactored prompt must teach structural patterns, not language-specific keywords.
8. **No new private vocabulary copies.** Every primitive identifier referenced in code must derive from `primitive-registry.ts` (TypeScript union enforcement) or be runtime-substituted from `getOperationPrimitives()` (prompt placeholder pattern). `convertComponent`'s switch follows the canonical pattern from intent-executor.ts and run-calculation.ts — type-level vocabulary derivation, structured-failure default.
9. SR-27 (paste evidence, not attestation), SR-34 (no bypass — HALT to architect), SR-35 (no behavioral changes beyond directive), SR-44 (architect handles browser verification post-merge).
10. If any phase cannot complete structurally: HALT, paste evidence, return to architect.

### COMPLETION REPORT RULES (25-28)
25. Report file created BEFORE final build, not after.
26. Mandatory structure: Commits → Files → Hard Gates → Soft Gates → Compliance → Issues.
27. Evidence = paste code/output. NOT "this was implemented."
28. One commit per phase. Collapsed commits = standing rule violation.

---

## PHASE 0: PREREQUISITES + DIAGNOSTIC

### 0-PRE: Branch + verify base + commit prompt (Rule 5)

```bash
cd /Users/AndrewAfrica/spm-platform
git checkout main && git pull origin main
git log --oneline -3
# Verify main HEAD post-OB-198 (per memory: PR #356 merged 2026-05-01)

git checkout -b hf-194-phase15-closure-completion
# Place HF-194_PHASE15_CLOSURE_COMPLETION.md prompt at docs/vp-prompts/
git add docs/vp-prompts/HF-194_PHASE15_CLOSURE_COMPLETION.md
git commit -m "HF-194: commit prompt to git (Rule 5)"
git push -u origin hf-194-phase15-closure-completion
```

### 0A: Verify canonical dispatch pattern (reference state)

```bash
cd /Users/AndrewAfrica/spm-platform

# Reference Pattern A — intent-executor.ts canonical 12-case switch
grep -A2 "switch (op.operation)" web/src/lib/calculation/intent-executor.ts | head -30
grep -n "IntentExecutorUnknownOperationError" web/src/lib/calculation/intent-executor.ts

# Reference Pattern B — run-calculation.ts canonical 12-case switch
grep -A20 "switch (component.componentType)" web/src/lib/calculation/run-calculation.ts | head -25
grep -n "LegacyEngineUnknownComponentTypeError" web/src/lib/calculation/run-calculation.ts

# Registry surface
grep -n "FOUNDATIONAL_PRIMITIVES\|isRegisteredPrimitive\|getOperationPrimitives" web/src/lib/calculation/primitive-registry.ts | head -10
```

**HALT if:** intent-executor.ts switch does not show 11 case branches + structured-failure default; run-calculation.ts switch does not show 12 case branches + structured-failure default; primitive-registry.ts does not export `FOUNDATIONAL_PRIMITIVES` const + `isRegisteredPrimitive` + `getOperationPrimitives`.

### 0B: Confirm violation surfaces still present pre-Phase-1

```bash
# Violation 1 — convertComponent 5-of-12 hardcoded switch
grep -B2 -A12 "convertComponent\|case 'linear_function'" web/src/lib/compensation/ai-plan-interpreter.ts | head -40

# Violation 2 — outer wrapper legacy vocabulary
grep -nE "matrix_lookup|tiered_lookup|flat_percentage|conditional_percentage" web/src/lib/ai/providers/anthropic-adapter.ts | wc -l
# Expected: ≥20 hits across worked examples + RULES + type-unions + field-presence comments

# Violation 3 — document_analysis parallel calculationType vocabulary
grep -B2 -A6 "calculationType.*tiered_lookup\|calculationType.*matrix_lookup" web/src/lib/ai/providers/anthropic-adapter.ts

# Inner placeholder (must be unchanged — already correct)
grep -nE "<<FOUNDATIONAL_PRIMITIVES>>|buildPrimitiveVocabularyForPrompt" web/src/lib/ai/providers/anthropic-adapter.ts
```

**HALT if:** convertComponent's 5-case hardcoded switch is no longer present (means upstream changed; this HF may already be partially shipped); outer wrapper has zero legacy vocabulary hits (means F-1 is incorrect); `<<FOUNDATIONAL_PRIMITIVES>>` placeholder is missing (means inner-substitution refactor reverted).

### 0C: Pre-flight HALT confirmation

If 0A and 0B pass, paste output and proceed.

**Commit:** `HF-194 Phase 0: pre-flight verification`

---

## PHASE 1: convertComponent ALIGNMENT WITH CANONICAL DISPATCH PATTERN

### 1A: Refactor convertComponent in `web/src/lib/compensation/ai-plan-interpreter.ts`

Replace the 5-of-12 hardcoded switch (line 432) with the canonical 12-case dispatch pattern, mirroring `intent-executor.ts:444-471` and `run-calculation.ts:255-280`.

**Required structure:**

```ts
import {
  isRegisteredPrimitive,
  type FoundationalPrimitive,
} from '@/lib/calculation/primitive-registry';

// Inside convertComponent, replacing the 5-case switch:
const calcType: string =
  (base.calculationIntent?.operation as string) || calcMethod?.type || '';

// Type-system enforcement: calcType must be FoundationalPrimitive at this surface.
// Vocabulary derivation is type-level (FoundationalPrimitive union from primitive-registry.ts).
// Runtime check via isRegisteredPrimitive provides structured failure on unrecognized identifiers
// per Decision 154 (every dispatch boundary produces named, observable, structured failure).
if (!isRegisteredPrimitive(calcType)) {
  throw new UnconvertibleComponentError(
    `[convertComponent] componentType "${calcType}" is not a registered foundational primitive. ` +
    `The registry holds ${getOperationPrimitives().length} primitives; AI emission and persisted rule_sets ` +
    `must match. This is an OB-196 Phase 1.5 closure invariant.`
  );
}

// All 12 registered primitives are importable. Dispatch follows the canonical pattern from
// intent-executor.ts:444-471 and run-calculation.ts:255-280: literal-string case clauses
// where vocabulary derivation is type-level (TypeScript discriminated union from FoundationalPrimitive),
// structured-failure default for runtime safety beyond compile-time enforcement.
switch (calcType as FoundationalPrimitive) {
  case 'bounded_lookup_1d':
  case 'bounded_lookup_2d':
  case 'scalar_multiply':
  case 'conditional_gate':
  case 'aggregate':
  case 'ratio':
  case 'constant':
  case 'weighted_blend':
  case 'temporal_window':
  case 'linear_function':
  case 'piecewise_linear':
  case 'scope_aggregate':
    return { /* existing return shape */ };
  default: {
    // Unreachable per type-system + isRegisteredPrimitive guard above.
    // Structured failure for runtime safety per Decision 154.
    const _exhaustive: never = calcType as never;
    throw new UnconvertibleComponentError(
      `[convertComponent] exhaustive guard failed for "${calcType}". ` +
      `Registry/dispatch divergence; this is a Decision 154 violation requiring architect attention.`
    );
  }
}
```

### 1B: Define `UnconvertibleComponentError` if not already in tree

```bash
grep -n "UnconvertibleComponentError" web/src/lib/compensation/ai-plan-interpreter.ts
grep -rn "class UnconvertibleComponentError\|export.*UnconvertibleComponentError" web/src/
```

If not present, define alongside the existing error classes in `ai-plan-interpreter.ts`:

```ts
export class UnconvertibleComponentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnconvertibleComponentError';
  }
}
```

### 1C: Verify Phase 1

For each modified file, paste:
1. Function signature diff (before/after)
2. Switch statement diff (before/after) — full diff, not summary
3. Confirmation `getOperationPrimitives` and `isRegisteredPrimitive` are imported and called

```bash
# Confirm 12 cases now present
grep -c "case '\(bounded_lookup_1d\|bounded_lookup_2d\|scalar_multiply\|conditional_gate\|aggregate\|ratio\|constant\|weighted_blend\|temporal_window\|linear_function\|piecewise_linear\|scope_aggregate\)'" web/src/lib/compensation/ai-plan-interpreter.ts
# Expected: 12

# Confirm registry consultation present
grep -n "isRegisteredPrimitive\|getOperationPrimitives\|FoundationalPrimitive" web/src/lib/compensation/ai-plan-interpreter.ts

# Type + lint
cd web
npx tsc --noEmit
echo "tsc exit: $?"
npx next lint
echo "lint exit: $?"
cd ..
```

**HALT if:** case count ≠ 12; registry imports absent; tsc or lint exits non-zero.

**Commit:** `HF-194 Phase 1: convertComponent aligned with canonical dispatch pattern (12 cases, registry-derived, structured-failure default)`

---

## PHASES 2–3: DEFERRED PER ARCHITECT DISPOSITION (2A-iii)

**Date deferred:** 2026-05-01
**Disposition source:** Architect, post Phase 1 commit `1541e109`, in response to Phase 2A HALT.

### What was deferred

Phase 2 (plan-interpretation outer wrapper refactor) and Phase 3 (`document_analysis` prompt refactor) are dropped from HF-194's deliverable scope. The HF closes at Phase 1 + Phase 4 (build verification + completion report + PR against the reduced scope).

### Why the deferral

The HF Phase 2A directive prescribed worked-example bodies derived from a `promptStructuralExample` field on each `PrimitiveEntry`. Phase 2B prescribed RULES content derived from `promptSelectionGuidance`. Phase 2E prescribed field-presence comments derived from `metadata_keys`. CC verified all three field names with `grep -rn web/src` — zero hits anywhere. The `PrimitiveEntry` interface (`web/src/lib/calculation/primitive-registry.ts:74–93`) carries only `{id, kind, description, allowedKeys}`.

The fabricated registry fields were architect error in HF-194 drafting; they do not exist on `PrimitiveEntry`. Two paths were available:
- **Invent the worked-example / RULES / metadata content directly in the prompt.** Decision 155 violation: the registry is the canonical source of truth; bypassing it to embed prompt content directly creates a private vocabulary copy in `anthropic-adapter.ts`, which is exactly what Phase 2 was supposed to close.
- **Populate the fields on `PrimitiveEntry` first, then refactor the prompt to read from them.** Substrate-extending design work (interface shape change + content authoring for 12 entries) — outside HF-194 scope per the HF's own "Out of scope: Registry expansion" wording.

Per Phase 2A HALT discipline ("if any registry entry's `promptStructuralExample` field is empty or missing, HALT and surface — do not invent worked-example content"), the architect dispositioned **2A-iii: reduce HF-194 scope to Phase 1**.

### What remains open

- **Plan AI outer wrapper drift (Violation 2)** — `anthropic-adapter.ts` lines 162–240 (4 worked examples), 332/340–356 (RULES), 388/404/425/434 (EXAMPLE labels), 779/986 (type-union strings), 989–992 (field-presence comments) still teach legacy vocabulary (`matrix_lookup`, `tiered_lookup`, `flat_percentage`, `conditional_percentage`). Tracked as substrate-population follow-up: register the prompt-content fields on `PrimitiveEntry`, populate for all 12 primitives, then refactor the prompt template.

- **`document_analysis` parallel calculationType (Violation 3 / Cluster B G8-03 finding)** — `anthropic-adapter.ts` `components: [{ "calculationType": "tiered_lookup|matrix_lookup|flat_percentage|conditional_percentage" }]` retained. Phase 4 audit Cluster B S-CODE-G8-03 finding remains open.

### Empirical claim being tested by Phase 1 alone

The HF's "What this HF builds" section claims Phase 1 alone may unblock BCL plan import: the model emits foundational vocabulary in the inner `calculationIntent.operation` (per the existing prompt's example payloads at lines 388-422 + the registry-derived `<<FOUNDATIONAL_PRIMITIVES>>` placeholder substitution at line 810), and `convertComponent`'s `calcType` resolution prefers `calculationIntent.operation` over `calculationMethod.type`. Even if the outer `calculationMethod.type` is still emitted as a legacy alias, the inner operation should be foundational and convertComponent will dispatch on it correctly.

This is an empirical claim verified by browser test post-merge (architect SR-44). If BCL still fails after merge, the Phase 2 outer-wrapper drift IS load-bearing and the deferred work moves to a higher priority.

---

---

## PHASE 4: BUILD VERIFICATION + COMPLETION REPORT + PR

### COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE: `docs/completion-reports/HF-194_COMPLETION_REPORT.md`.

### Required structure

```markdown
# HF-194 COMPLETION REPORT
## Date: [date]
## Execution Time: [HH:MM]

## COMMITS (in order)
| Hash | Phase | Description |

## FILES MODIFIED
| File | Change |

## PROOF GATES — HARD (post architect disposition 2A-iii: reduced from 16 to 8)

| # | Criterion | PASS/FAIL | Evidence |
|---|---|---|---|
| 1 | convertComponent uses 12-case registry-derived switch with structured-failure default | | (paste full switch + before/after diff) |
| 2 | UnconvertibleComponentError class defined and thrown | | (paste class def + throw site) |
| 3 | isRegisteredPrimitive imported and called as runtime guard in convertComponent | | (paste import + call site) |
| 4 | `npx tsc --noEmit` exits 0 | | (paste exit code) |
| 5 | `npx next lint` exits 0 | | (paste exit code) |
| 6 | `npm run build` exits 0 | | (paste last 30 lines + exit code) |
| 7 | `curl -I http://localhost:3000` returns 200 or 307 | | (paste HTTP response) |
| 8 | PR opened against main | | (paste PR URL) |

## PROOF GATES — SOFT (post architect disposition 2A-iii: reduced from 5 to 1)

| # | Criterion | PASS/FAIL | Evidence |
|---|---|---|---|
| 9 | convertComponent dispatch pattern matches intent-executor.ts:444-471 structure (case-per-primitive + structured-failure default + type-system enforcement) | | (paste side-by-side comparison) |

## DEFERRED FROM HF-194 (per architect disposition 2A-iii)

The following gates were dropped because their underlying work was deferred:

| Original gate | Phase | Reason for deferral |
|---|---|---|
| Hard 4 (worked examples foundational) | 2A | Required `promptStructuralExample` registry field that does not exist; substrate-population work outside HF scope |
| Hard 5 (RULES registry-derived) | 2B | Required `promptSelectionGuidance` registry field that does not exist; same |
| Hard 6 (EXAMPLE labels foundational) | 2C | Tied to Phase 2A/2B chain; deferred together |
| Hard 7 (type-union strings dropped) | 2D | Same |
| Hard 8 (field-presence foundational) | 2E | Required `metadata_keys` registry field that does not exist; same |
| Hard 9 (document_analysis refactored) | 3A | Cluster B G8-03 remediation; tied to Phase 2 substrate population |
| Hard 10 (zero legacy in anthropic-adapter.ts) | 2/3 | Outer wrapper retained; legacy vocabulary remains |
| Hard 11 (zero legacy in ai-plan-interpreter.ts) | 1 fallthrough | Historical doc comments at lines 19, 264, 412 still reference legacy names; not a scope-creep concern |
| Soft 18 (worked examples from promptStructuralExample) | 2A | Field doesn't exist |
| Soft 19 (RULES from promptSelectionGuidance) | 2B | Field doesn't exist |
| Soft 20 (field-presence from metadata_keys) | 2E | Field doesn't exist |
| Soft 21 (document_analysis Option chosen) | 3A | Phase 3 deferred |

**Tracked for follow-up:** Cluster B G8-03 finding remains open. Plan AI outer-wrapper drift remains. A follow-up HF or OB will populate `PrimitiveEntry` with prompt-content fields, then refactor the prompt template.

## STANDING RULE COMPLIANCE
- Rule 1, 2, 5, 6, 7, 8 (Korean Test in refactored prompts), 25-28 (completion report)

## KNOWN ISSUES
- (anything that did not work, partial implementations, deferred items)
- (architect verifies post-merge in browser per SR-44)

## OUT-OF-BAND FINDINGS
- (anything noticed beyond directive scope)
- (DO NOT FIX — flag for architect)

## VERIFICATION SCRIPT OUTPUT
(paste raw output of all verification commands)
```

### Final build verification

```bash
cd /Users/AndrewAfrica/spm-platform/web
pkill -f "next dev" 2>/dev/null || true
rm -rf .next
npm run build 2>&1 | tail -30
echo "Build exit: $?"

nohup npm run dev > /tmp/hf-xxx-dev.log 2>&1 &
sleep 12
curl -sI http://localhost:3000 | head -3
pkill -f "next dev" 2>/dev/null || true
```

Append build results to completion report.

### Final commit + PR

```bash
git add docs/completion-reports/HF-194_COMPLETION_REPORT.md
git commit -m "HF-194 Phase 4: completion report"
git push

cd /Users/AndrewAfrica/spm-platform
gh pr create --base main --head hf-194-phase15-closure-completion \
  --title "HF-194: OB-196 Phase 1.5 Closure Completion + Cluster B G8-03 Remediation" \
  --body "## Closes Three Locked-Disposition Violations

### Violation 1 — Importer dispatch private subset (Phase 1)
- \`convertComponent\` aligned to canonical dispatch pattern (intent-executor.ts:444-471 / run-calculation.ts:255-280)
- 12-case registry-derived switch + structured-failure default
- \`isRegisteredPrimitive\` runtime guard + \`UnconvertibleComponentError\`
- Decision 154 satisfied at this surface

### Violation 2 — Plan AI outer wrapper legacy vocabulary (Phase 2)
- 4 worked examples → foundational vocabulary (sourced from registry's promptStructuralExample)
- RULES section → registry-derived structural-pattern guidance (sourced from promptSelectionGuidance)
- EXAMPLE labels, type-unions, field-presence comments → foundational
- OB-196 Phase 1.5.1.2 closure completion

### Violation 3 — document_analysis parallel calculationType vocabulary (Phase 3)
- Phase 4 audit Cluster B S-CODE-G8-03 finding closed
- Option [α|β] per architect disposition

### Out of scope
- Schema changes (none required — OB-197 constraint already correct)
- Registry expansion (12 primitives stay; HF aligns importer to recognize all 12)
- Cluster B G5-02 (validator VALID_SOURCES drift) — separate HF
- Cluster B G8-01 (content-profile.ts:163 short-circuit) — separate HF
- G11 enforcement mechanism specification — DS-021 §14 forward-looking

### Proof gates: 21 — see HF-194_COMPLETION_REPORT.md"
```

**Commit:** `HF-194 Phase 4: completion report + PR`

---

## ARCHITECT ACTION REQUIRED (Post-PR Open)

Same SR-44 / capability-routing pattern as OB-197 / OB-198:

1. **Architect disposition on Phase 3 Option α vs β** — provided inline at Phase 3 pause. Default β if not provided.
2. **PR review** — confirm scope adherence; validate that no new private vocabulary copies were introduced; validate worked-example bodies derive from registry rather than being architect-invented.
3. **`gh pr merge <PR#> --merge --delete-branch`** — architect executes.
4. **Browser verification on production (vialuce.ai)** — exercise BCL plan import end-to-end. Expected: 3 sheets interpret successfully; componentTypes emitted are foundational-only; classification_signals new rows show foundational componentTypes via signal_value. SR-44.
5. **"HF-194 PASS" sign-off** — closes the OB-196 Phase 1.5 closure debt + Cluster B G8-03 finding.

CC does not perform browser verification. CC does not merge PRs. CC does not interpret production logs.

---

## MAXIMUM SCOPE

3 implementation phases + 1 completion-report phase. 21 proof gates. After this HF, every dispatch and documenting boundary in `web/src/lib/` derives vocabulary from `primitive-registry.ts`. Decision 154/155 satisfied at every surface in scope. BCL plan import unblocks. Phase 4 audit Cluster B G8-03 finding closed. OB-196 Phase 1.5 closure debt resolved.

---

*HF-194 — 2026-05-01*
*Substrate-grounded; not substrate-extending. Every fix derives from a locked decision or a Phase 4 audit finding.*
