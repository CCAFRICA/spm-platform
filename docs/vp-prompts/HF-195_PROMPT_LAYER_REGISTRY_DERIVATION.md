# HF-195: Prompt-Layer Registry Derivation + Two T5 Standing Rules + PrimitiveEntry Extension
# Classification: HF (Hotfix)
# Closes: Empirical defect — AI emits unrecognized componentType strings ("matrix_lookup") at prompt-layer surface, despite HF-194 importer-surface fix
# Implements: IRA-HF-195 decomposition recommendations (Inv-2 rank 1 = option_b_plus_c Phase 1; Inv-3 rank 1 = sub_option_b_beta)
# Date: 2026-05-01
# PR Target: dev → main

---

## AUTONOMY DIRECTIVE
NEVER ask yes/no. NEVER say "shall I." NEVER pause for confirmation. Execute every phase sequentially. HALT only on explicit gate failures specified in this directive.

---

## CC_STANDING_ARCHITECTURE_RULES.md
**READ THIS FILE FIRST.** All rules apply.

### Key Rules for This HF
1. Commit + push after every phase.
2. After every push: kill dev → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000.
3. Fix logic, not data. Do NOT use SQL workarounds for prompt-content drift.
4. Evidence = paste code/output (Rule 27).
5. One commit per phase (Rule 28).
6. Git from repo root (spm-platform), NOT web/.
7. **Korean Test (AP-25): zero language-specific or domain-specific string literals in foundational code.** Applies to all prompt-construction code in this HF.
8. **Schema verify before any SQL** (FP-49 prevention). Verify against SCHEMA_REFERENCE_LIVE.md.

### Rule 29 reminder
This file is structured for paste; nothing follows the final commit instruction.

---

## RECUSAL GATE
**PASS.** This HF amends VP code surfaces (`web/src/lib/compensation/*`) and adds two new T5 entries to `CC_STANDING_ARCHITECTURE_RULES.md`. Does NOT amend IRA-governing substrate (T0-E08/E09/E10/E11/E12). Does NOT amend any T0/T1 substrate body content.

---

## ARCHITECT APPROVAL GATE
**PASS.** Architect approved PrimitiveEntry interface extension (substrate-extending per DS-021 §12) per IRA-HF-195 decomposition Inv-3 rank 1 disposition. Approval recorded in this conversation, 2026-05-01.

---

## PREREQUISITES (MUST BE TRUE BEFORE PHASE 0)

| # | Prerequisite | Verification command |
|---|---|---|
| 1 | vialuce-governance PR #51 merged | `cd ~/vialuce-governance && git log origin/main --oneline -5 \| head` (must show PR #51 merge SHA) |
| 2 | IRA response files accessible at expected paths | `ls -la ~/vialuce-governance/docs/IRA-responses/HF_195_INVOCATION_{1,2,3}_response.md` |
| 3 | `ds021-substrate-audit` branch exists with Cluster B evidence | `cd ~/spm-platform && git branch -a \| grep ds021-substrate-audit` and `git show ds021-substrate-audit:docs/audit-evidence/phase4/cluster_b_evidence.md \| head` |
| 4 | HF-194 PR #357 merged on main | `cd ~/spm-platform && git log origin/main --oneline -10 \| grep -i "HF-194"` |
| 5 | Working tree clean on `~/spm-platform` | `cd ~/spm-platform && git status` |

If ANY prerequisite fails: HALT. Surface failure. Do not proceed.

---

## READ FIRST (filesystem-resolvable; no /mnt/project/ paths)

1. `~/spm-platform/CC_STANDING_ARCHITECTURE_RULES.md` (current standing rules; will be amended in Phase 5)
2. `~/spm-platform/SCHEMA_REFERENCE_LIVE.md` (VP schema)
3. `~/vialuce-governance/docs/IRA-responses/HF_195_INVOCATION_1_response.md` (substrate-coherence brief — six bindings analysis)
4. `~/vialuce-governance/docs/IRA-responses/HF_195_INVOCATION_2_response.md` (outer fix-path; rank 1 = option_b_plus_c)
5. `~/vialuce-governance/docs/IRA-responses/HF_195_INVOCATION_3_response.md` (registry shape; rank 1 = sub_option_b_beta)
6. `~/vialuce-governance/docs/completion-reports/HF_195_IRA_DECOMPOSITION_CR.md` (architect-disposition surface; verbatim T5 rule text in supersession_candidates section)
7. `~/spm-platform/web/src/lib/compensation/primitive-registry.ts` (PrimitiveEntry interface; current shape lines 74–93)
8. `~/spm-platform/web/src/lib/compensation/ai-plan-interpreter.ts` (prompt outer wrapper + document_analysis prompt — refactor target)
9. `cluster_b_evidence.md` from branch `ds021-substrate-audit` (Phase 4 audit; document_analysis prompt parallel calculationType vocabulary finding)

---

## THE PROBLEM

Empirical evidence (production runtime, 2026-05-01 18:33:22 Vercel function logs): AI emits `matrix_lookup` componentType string despite HF-194 shipping registry-derived inner substitution at the importer surface. `UnconvertibleComponentError` thrown on all 3 plan sheets during BCL plan import. Zero `rule_sets` populated. Plan-import path blocked across the platform regardless of tenant.

IRA-HF-195 decomposition (3 invocations, $4.11 total cost, zero failures) confirmed:

1. **The importer surface (HF-194) was fixed; the prompt surface that feeds it was not.** The drift is upstream of HF-194's fix.
2. **Two existing platform principles are not honored at the prompt-layer surface:**
   - **E902 (Carry Everything, Express Contextually) via E910 (Korean Test):** "AI classifications are hints, not gates." The prompt-layer surface treats AI-emitted componentType as gates. The prompt itself is not constrained to emit only registry-valid strings.
   - **E903 (No Hardcoded Assumptions / Three-Tier Resolution Chain) via E910:** "All interpretation flows through three-tier resolution: LLM-Primary, Deterministic Fallback, Human Authority." The `_exhaustive: never` guard at convertComponent makes unrecognized strings hard-fail before deterministic fallback engages.
3. **The fix path (Inv-2 rank 1):** option_b_plus_c hybrid. Phase 1 ships option_b (registry-derived enumeration at prompt-construction time) WITH option_c (structural-pattern classification) PREPARE-path slot empty. Phase 2 (separate follow-on OB) populates option_c via signal flywheel.
4. **The shape (Inv-3 rank 1):** sub_option_b_beta. PrimitiveEntry interface gains optional `promptStructuralExample?: string` field carrying STRUCTURAL worked examples (value-distribution, data-type signatures — NOT domain names). Korean Test compliance lives in the example content, not just the field shape.

---

## THE FIX

Six changes, all required:

### Change 1: Land two T5 standing rules in `CC_STANDING_ARCHITECTURE_RULES.md`
Verbatim text from IRA Inv-1 supersession_candidates. Instantiate E902 and E903 at the prompt-layer surface.

### Change 2: Extend `PrimitiveEntry` interface
Add optional `promptStructuralExample?: string` field. Populate with structural examples for primitives where structural disambiguation aids LLM classification. Empty/absent for primitives that don't need examples.

### Change 3: Refactor plan-interpretation prompt outer wrapper in `ai-plan-interpreter.ts`
- Remove ALL hardcoded componentType vocabulary literals
- Build componentType enumeration block at prompt-construction time by reading PrimitiveEntry registry IDs
- Build structural-examples block at prompt-construction time by reading PrimitiveEntry `promptStructuralExample` fields
- Empty-section handling: if zero registry entries carry `promptStructuralExample`, emit a section placeholder slot. This is the Phase 2 PREPARE-path hook.

### Change 4: Refactor document_analysis prompt (Cluster B G8-03)
The document_analysis prompt currently carries parallel calculationType vocabulary distinct from the registry. Apply same registry-derivation pattern as Change 3. Single canonical surface (Decision 154/155) at the prompt layer.

### Change 5: Build-time enforcement gate
CI/build-time check: any string literal matching primitive-name pattern outside `primitive-registry.ts` = build fails. Korean Test gate at build time, not just runtime.

### Change 6: Vertical slice verification on architect-selected tenant
Per Vertical Slice Rule and architect direction: HF-195 closure criterion is component-level reconciliation against architect-supplied expected-results file. CC reports computed values; architect compares against ground truth. CC does not see GT values.

---

## CC FAILURE PATTERNS TO PREVENT

| # | Pattern | Prevention |
|---|---|---|
| FP-49 | Schema fabrication | All TypeScript interface changes verified against current `primitive-registry.ts`. |
| FP-66 | Manual SQL workaround | Zero data-modifying SQL. The fix is at the prompt-construction code, not the data. |
| FP-69 | Fix one thing, leave others | All six changes are required. Korean Test gate (Change 5) prevents regression. |
| FP-70 | Phase deferral as completion | HF-195 closes ONLY when component-level reconciliation passes on architect-selected tenant. Build PASS is necessary, not sufficient. |
| CWA-Premise | Tenant-specific assumptions in platform code | NO tenant-specific names, primitives, or data in any code change. Verification gate accepts any tenant ID + expected-results file path as runtime parameters. |
| Phase-1-without-hook trap | Re-architecture-later | Phase 1 prompt template MUST carry empty structural-examples section slot. Build verification confirms slot exists even when no entries populate it. |

---

## PHASE 0: PREREQUISITE VERIFICATION + CODE TRACE — ZERO CODE CHANGES

### 0A: Verify all 5 prerequisites
Run all 5 verification commands from the Prerequisites table. Paste output verbatim.

### 0B: Branch from main
```bash
cd ~/spm-platform
git checkout main && git pull
git checkout -b hf-195-prompt-layer-registry-derivation
```

### 0C: Inspect current `PrimitiveEntry` interface
```bash
grep -nA 20 "interface PrimitiveEntry\|type PrimitiveEntry" web/src/lib/compensation/primitive-registry.ts
```
Paste output. Confirm interface shape matches Cluster A G7-01 evidence (`{id, kind, description, allowedKeys}`). If shape diverges: HALT and surface.

### 0D: Locate plan-interpretation prompt outer wrapper
```bash
grep -nE "componentType|PRIMITIVE_TYPES|matrix_lookup|tiered_calculation|systemPrompt|userPrompt" web/src/lib/compensation/ai-plan-interpreter.ts | head -50
```
Paste output. Identify lines where componentType vocabulary is hardcoded as string literals. These are the refactor targets.

### 0E: Locate document_analysis prompt and verify Cluster B G8-03 finding
```bash
grep -nE "document_analysis|calculationType|analyzeDocument" web/src/lib/compensation/ai-plan-interpreter.ts | head -30
```
Paste output. Confirm document_analysis prompt exists in this file with parallel calculationType vocabulary. If file is different per current code state: surface alternate location and proceed against actual location.

### 0F: Inventory all hardcoded primitive-name literals across the codebase
```bash
grep -rnE "'matrix_lookup'|'tiered_calculation'|'flat_rate'|'percentage_of'|'lookup'|'aggregation'|'threshold'" web/src/ --include="*.ts" --include="*.tsx" | grep -v "node_modules" | grep -v "primitive-registry.ts"
```
Paste FULL output. EVERY occurrence outside `primitive-registry.ts` is a Korean Test violation that this HF must close. Build the working list.

### 0G: Verify HF-194 `convertComponent` canonical dispatch is intact
```bash
grep -nA 30 "convertComponent\|UnconvertibleComponentError" web/src/lib/compensation/ai-plan-interpreter.ts | head -80
```
Paste output. Confirm post-HF-194 12-case canonical dispatch + `UnconvertibleComponentError` + `_exhaustive: never` are present. This HF does NOT modify convertComponent — it makes the upstream constraint that convertComponent's exhaustive guard requires per new Rule N+1.

### 0H: Read IRA Inv-1 supersession_candidates verbatim T5 rule text
```bash
grep -A 30 "supersession_candidates\|recommended action" ~/vialuce-governance/docs/IRA-responses/HF_195_INVOCATION_1_response.md | head -100
```
Paste output. The verbatim T5 rule text is the input to Phase 5; do not paraphrase.

**Commit:** `git add -A && git commit -m "HF-195 Phase 0: Prompt-layer registry derivation diagnostic + prerequisites verified" && git push origin hf-195-prompt-layer-registry-derivation`

---

## PHASE 1: EXTEND PrimitiveEntry INTERFACE

### 1A: Modify `web/src/lib/compensation/primitive-registry.ts`
Add optional field to PrimitiveEntry interface:
```typescript
export interface PrimitiveEntry {
  id: FoundationalPrimitive;
  kind: 'foundational';
  description: string;
  allowedKeys: readonly string[];
  promptStructuralExample?: string;  // HF-195: optional structural worked example
                                     // STRUCTURAL ONLY — value-distribution shapes,
                                     // data-type signatures. NO domain-named content.
                                     // Korean Test gate enforced at build time (Phase 4).
}
```

### 1B: Populate `promptStructuralExample` for primitives where structural disambiguation aids LLM classification
For each PrimitiveEntry where appropriate, add `promptStructuralExample` content. Examples MUST be structural (value-distribution, range, type signature) — NEVER domain-named.

**Examples of correct structural content:**
- "Numeric input mapped to numeric output via stepped boundaries (e.g., values 0–100 → output_a; values 100–500 → output_b)"
- "Lookup table: discrete categorical key → numeric value"
- "Aggregation across rows sharing a grouping key, producing single scalar"

**Examples of FORBIDDEN content (Korean Test FAIL):**
- "Used for sales commission tiers" (domain-named)
- "Lookup for product pricing" (domain-named)
- Any literal like "matrix_lookup" or "commission_calc" (domain-named)

### 1C: Build verification
```bash
cd web && rm -rf .next && npm run build
```
Must exit 0. Paste output. TypeScript compilation must succeed with the extended interface.

### 1D: Verify all existing PrimitiveEntry usages still compile
```bash
grep -rn "PrimitiveEntry" web/src/ --include="*.ts" --include="*.tsx"
```
Paste output. Confirm every usage site still type-checks (the field is optional; existing entries without `promptStructuralExample` continue to work).

**Commit:** `git add -A && git commit -m "HF-195 Phase 1: Extend PrimitiveEntry with optional promptStructuralExample field (substrate-extending per DS-021 §12, architect-approved)" && git push origin hf-195-prompt-layer-registry-derivation`

---

## PHASE 2: REFACTOR PLAN-INTERPRETATION PROMPT (Registry-Derived Enumeration + PREPARE-Path Slot)

### 2A: Locate prompt-construction function in `ai-plan-interpreter.ts`
Find the function that constructs the plan-interpretation prompt (typically `buildSystemPrompt`, `getInterpretationPrompt`, or similar).

### 2B: Replace hardcoded componentType enumeration with registry-derived block
Pattern:
```typescript
// BEFORE (hardcoded):
const PROMPT = `Allowed componentType values: matrix_lookup, tiered_calculation, flat_rate, ...`;

// AFTER (registry-derived):
import { PRIMITIVE_REGISTRY } from './primitive-registry';

function buildComponentTypeBlock(): string {
  const allowedIds = PRIMITIVE_REGISTRY.map(p => p.id);
  return `Allowed componentType values:\n${allowedIds.map(id => `  - ${id}`).join('\n')}`;
}

function buildStructuralExamplesBlock(): string {
  const withExamples = PRIMITIVE_REGISTRY.filter(p => p.promptStructuralExample);
  if (withExamples.length === 0) {
    // PREPARE-path slot: Phase 2 (option_c flywheel) populates this section.
    return '\n[Structural examples: none provided in current registry — this section is populated as registry entries gain promptStructuralExample content via Phase 2 follow-on work]\n';
  }
  return [
    '\nStructural examples (use these to classify based on value-distribution and data-type signature):',
    ...withExamples.map(p => `  - ${p.id}: ${p.promptStructuralExample}`),
  ].join('\n');
}

function buildSystemPrompt(): string {
  return [
    /* ... fixed prompt scaffold ... */,
    buildComponentTypeBlock(),
    buildStructuralExamplesBlock(),
    /* ... rest of prompt ... */,
  ].join('\n\n');
}
```

### 2C: Remove ALL hardcoded primitive-name literals from prompt strings
For every literal identified in Phase 0F that lives in `ai-plan-interpreter.ts`: replace with a reference into the registry-derived block, or delete if redundant.

### 2D: Verify zero hardcoded literals remain in prompt construction
```bash
grep -nE "'matrix_lookup'|'tiered_calculation'|'flat_rate'|'percentage_of'|'lookup'|'aggregation'|'threshold'" web/src/lib/compensation/ai-plan-interpreter.ts
```
**Expected output: ZERO matches.** If any matches remain: HALT and surface — refactor incomplete.

### 2E: Build verification
```bash
cd web && rm -rf .next && npm run build
```
Must exit 0. Paste output.

**Commit:** `git add -A && git commit -m "HF-195 Phase 2: Plan-interpretation prompt registry-derived (option_b) + structural-examples PREPARE-path slot (option_c hook)" && git push origin hf-195-prompt-layer-registry-derivation`

---

## PHASE 3: REFACTOR document_analysis PROMPT (Cluster B G8-03 Closure)

### 3A: Locate document_analysis prompt construction
Per Phase 0E findings. The prompt carries parallel calculationType vocabulary (Cluster B G8-03 audit finding).

### 3B: Apply same registry-derivation pattern as Phase 2
The document_analysis prompt's calculationType enumeration must derive from the same PrimitiveEntry registry. Single canonical surface per Decision 154/155.

### 3C: Verify zero hardcoded literals in document_analysis prompt
```bash
grep -nA 30 "document_analysis\|analyzeDocument" web/src/lib/compensation/ai-plan-interpreter.ts | grep -E "'matrix_lookup'|'tiered_calculation'|'flat_rate'|'percentage_of'|'lookup'|'aggregation'|'threshold'"
```
**Expected output: ZERO matches.**

### 3D: Build verification
```bash
cd web && rm -rf .next && npm run build
```
Must exit 0. Paste output.

**Commit:** `git add -A && git commit -m "HF-195 Phase 3: document_analysis prompt registry-derived (Cluster B G8-03 closure)" && git push origin hf-195-prompt-layer-registry-derivation`

---

## PHASE 4: BUILD-TIME ENFORCEMENT GATE (Korean Test at Build Time)

### 4A: Add lint rule or pre-build check
Add a script (or extend existing lint config) that fails the build if any string literal matching primitive-name pattern is found OUTSIDE `primitive-registry.ts`.

Suggested approach: a custom lint rule or a pre-build script (`scripts/verify-korean-test.sh`):
```bash
#!/usr/bin/env bash
set -e

VIOLATIONS=$(grep -rnE "'matrix_lookup'|'tiered_calculation'|'flat_rate'|'percentage_of'" \
  web/src/ --include="*.ts" --include="*.tsx" \
  | grep -v "primitive-registry.ts" \
  | grep -v "node_modules" || true)

if [ -n "$VIOLATIONS" ]; then
  echo "Korean Test violation: hardcoded primitive-name literals found outside registry"
  echo "$VIOLATIONS"
  exit 1
fi

echo "Korean Test PASS: zero hardcoded primitive-name literals outside registry"
```

Wire this into the package.json build pipeline (e.g., `prebuild` script) so `npm run build` runs it.

### 4B: Verify gate triggers on intentional violation
```bash
# Create a test violation
echo "const x = 'matrix_lookup';" > web/src/lib/compensation/test-violation.ts
cd web && npm run build
```
Build MUST fail with the Korean Test violation message. Paste output.

### 4C: Remove the test violation
```bash
rm web/src/lib/compensation/test-violation.ts
cd web && npm run build
```
Build MUST pass. Paste output.

### 4D: Add the gate's verification to README or developer documentation
A short paragraph in `web/README.md` (or equivalent) documenting the build-time Korean Test gate and what triggers it.

**Commit:** `git add -A && git commit -m "HF-195 Phase 4: Build-time Korean Test gate (Korean Test enforced at build, not just runtime)" && git push origin hf-195-prompt-layer-registry-derivation`

---

## PHASE 5: LAND TWO T5 STANDING RULES

### 5A: Read verbatim T5 rule text from IRA Inv-1 supersession_candidates
Reference: Phase 0H output. The IRA produced the rule text; do not paraphrase.

### 5B: Add to `CC_STANDING_ARCHITECTURE_RULES.md`
Append two new rules at next available rule numbers (current rules 24–26 per memory; new rules 27, 28):

**Rule 27 — Prompt-layer registry derivation:**
> Any LLM prompt that emits componentType (or any other registry-governed vocabulary) MUST derive its allowed values from the canonical registry (PrimitiveEntry or equivalent) at prompt-construction time. Parallel hardcoded vocabulary lists in prompt content are prohibited. Build-time gate enforces zero primitive-name string literals outside the registry file. Instantiates E902 (Carry Everything, Express Contextually) and E910 (Korean Test) at the prompt-layer surface.

**Rule 28 — Three-tier resolution at prompt-layer:**
> Any dispatch consuming LLM-emitted vocabulary MUST honor three-tier resolution (LLM-Primary, Deterministic Fallback, Human Authority). Exhaustive-switch patterns with `_exhaustive: never` compile-time guards are permitted ONLY when paired with EITHER (a) upstream constraint — the prompt that produces the input emits only registry-valid strings (Rule 27 holds), OR (b) downstream fallback — unrecognized strings map to a default primitive with a classification signal written. Naked `_exhaustive: never` patterns without one of these two conditions are prohibited. Instantiates E903 (Three-Tier Resolution Chain) at the prompt-layer surface.

### 5C: Verify both rules visible
```bash
grep -nA 5 "Rule 27\|Rule 28" CC_STANDING_ARCHITECTURE_RULES.md
```
Paste output. Both rules must be present.

**Commit:** `git add -A && git commit -m "HF-195 Phase 5: Land two T5 standing rules — prompt-layer registry derivation + three-tier resolution at prompt-layer" && git push origin hf-195-prompt-layer-registry-derivation`

---

## PHASE 6: VERTICAL SLICE VERIFICATION GATE (Architect-Selected Tenant)

### Architect supplies at runtime:
1. Tenant ID (UUID) — any tenant the architect designates as the verification tenant
2. Path to expected-results file (`<TENANT>_Resultados_Esperados.xlsx` or equivalent format)

### CC executes:
This phase is platform-agnostic. CC does not see GT values. CC reports computed values; architect compares.

### 6A: Confirm clean dev environment
```bash
cd web && rm -rf .next && npm run build && npm run dev
```
Confirm localhost:3000 reachable. Paste build output.

### 6B: Roster import verification (architect-driven via SR-44)
Architect imports tenant roster file via browser. CC verifies via service-role tsx-script:
```typescript
// scripts/verify-hf195-roster-import.ts
import { createClient } from '@supabase/supabase-js';
const tenantId = process.argv[2];  // architect supplies
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const { data, count } = await supabase
  .from('committed_data')
  .select('*', { count: 'exact', head: false })
  .eq('tenant_id', tenantId)
  .eq('data_type', 'entity'); // or whatever entity-band identifier
console.log(`Entities committed: ${count}`);
```
Paste output. Architect confirms count matches expected roster row count.

### 6C: Transaction import verification (architect-driven via SR-44)
Architect imports tenant transaction file. CC verifies via tsx-script (same pattern, filtered for transaction band).
Paste output. Architect confirms count + source_date population.

### 6D: Plan import verification (architect-driven via SR-44; the HF-195 unblock)
Architect imports tenant plan file. CC verifies:
```typescript
const { data: ruleSets } = await supabase
  .from('rule_sets')
  .select('id, name, components')
  .eq('tenant_id', tenantId)
  .eq('status', 'active');
console.log(`Rule sets: ${ruleSets?.length}`);
console.log(`Components per rule_set:`, ruleSets?.map(rs => ({ id: rs.id, components: (rs.components as any[]).length })));
```
Paste output. Architect confirms:
- `rule_sets` count matches expected sheet count from plan workbook
- Each rule_set has expected component count
- Zero `UnconvertibleComponentError` thrown in Vercel function logs

If any plan sheet fails to import: HALT. The fix is incomplete. Surface Vercel log output.

### 6E: Verify Korean Test compliance at runtime
```bash
# Vercel logs check: zero "matrix_lookup", "tiered_calculation", or other unrecognized componentType emissions in the last hour of plan import logs
# Architect supplies log retrieval method (Vercel CLI or dashboard)
```
Paste relevant log excerpts. Confirm AI emits ONLY registry-valid componentType strings.

### 6F: Calculation execution
Architect triggers calculation via browser for the verification tenant. CC verifies via tsx-script:
```typescript
const { data: results, count } = await supabase
  .from('calculation_results')
  .select('*', { count: 'exact', head: false })
  .eq('tenant_id', tenantId);
console.log(`Calculation results: ${count}`);
```
Paste output.

### 6G: Component-level reconciliation against expected-results file
Architect supplies path to expected-results file. CC writes a reconciliation script:
```typescript
// scripts/verify-hf195-reconciliation.ts
import * as XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';

const tenantId = process.argv[2];
const expectedPath = process.argv[3];

const expected = XLSX.readFile(expectedPath);
// Parse expected file structure (architect specifies sheet/column conventions if non-obvious)

const supabase = createClient(/*...*/);
const { data: actual } = await supabase
  .from('calculation_results')
  .select('entity_id, period_id, component_id, value')
  .eq('tenant_id', tenantId);

// Component-level reconciliation
type Key = `${string}|${string}|${string}`;  // entity_id|period_id|component_id
const actualMap = new Map<Key, number>(actual!.map(r => [`${r.entity_id}|${r.period_id}|${r.component_id}`, r.value]));
const expectedMap = parseExpectedFile(expected);  // architect-supplied parser if needed

let matches = 0;
let mismatches: Array<{key: Key; expected: number; actual: number; delta: number}> = [];
let missing: Array<{key: Key; expected: number}> = [];
let extra: Array<{key: Key; actual: number}> = [];

for (const [key, expectedValue] of expectedMap) {
  const actualValue = actualMap.get(key);
  if (actualValue === undefined) {
    missing.push({key, expected: expectedValue});
  } else if (Math.abs(actualValue - expectedValue) < 0.01) {
    matches++;
  } else {
    mismatches.push({key, expected: expectedValue, actual: actualValue, delta: actualValue - expectedValue});
  }
}
for (const [key, actualValue] of actualMap) {
  if (!expectedMap.has(key)) {
    extra.push({key, actual: actualValue});
  }
}

console.log(`Component-level reconciliation:`);
console.log(`  Matches:    ${matches}`);
console.log(`  Mismatches: ${mismatches.length}`);
console.log(`  Missing:    ${missing.length}  (in expected, not in actual)`);
console.log(`  Extra:      ${extra.length}  (in actual, not in expected)`);
console.log(`\nMismatches (first 20):`, mismatches.slice(0, 20));
console.log(`\nMissing (first 20):`, missing.slice(0, 20));
console.log(`\nExtra (first 20):`, extra.slice(0, 20));
```
Run script. Paste FULL output verbatim.

### 6H: HF-195 closure criterion
HF closes ONLY when ALL of the following hold:
1. Phase 1–5 build PASS (Korean Test gate active, zero violations)
2. Plan import succeeds for verification tenant (rule_sets populated, zero UnconvertibleComponentError)
3. Calculation execution produces calculation_results
4. Component-level reconciliation: `mismatches === 0 AND missing === 0 AND extra === 0`

If reconciliation has ANY non-zero count in mismatches/missing/extra: HALT. Surface delta. Architect dispositions whether the delta is HF-195 scope (reopen) or follow-on work (close HF-195 with delta named in CR + new HF/OB drafted).

CC reports outcome to architect WITHOUT exposing GT values. Format:
```
Reconciliation outcome:
  Matches:    <count>
  Mismatches: <count>
  Missing:    <count>
  Extra:      <count>
[If mismatches/missing/extra > 0: paste keys + computed values; architect compares against GT file separately]
```

**Commit:** `git add -A && git commit -m "HF-195 Phase 6: Vertical slice verification gate executed" && git push origin hf-195-prompt-layer-registry-derivation`

---

## PHASE 7: COMPLETION REPORT + PR

### 7A: Write `docs/completion-reports/HF-195_COMPLETION_REPORT.md`
Required sections:
1. Phase summary table (per-phase commit SHA, gate results)
2. Files modified inventory
3. T5 rules landed (verbatim text)
4. PrimitiveEntry interface diff (before / after)
5. Korean Test build-time gate verification evidence (intentional-violation test from Phase 4B)
6. Vertical slice verification outcome (Phase 6H output verbatim — without GT values)
7. Substrate-bounded-authority status: PrimitiveEntry shape extension architect-approved
8. IRA-HF-195 traceability: invocation IDs, rank-1 recommendations honored
9. Phase 2 follow-on work: option_c flywheel population OB explicitly scoped (out of HF-195)

### 7B: Open PR
```bash
gh pr create --base main --head hf-195-prompt-layer-registry-derivation \
  --title "HF-195: Prompt-layer registry derivation + two T5 rules + PrimitiveEntry extension" \
  --body "$(cat <<'EOF'
## Closes
Empirical defect: AI emits unrecognized componentType strings (matrix_lookup) at prompt-layer surface, despite HF-194 importer-surface fix. Plan import blocked across all tenants.

## Implements
IRA-HF-195 decomposition recommendations:
- Inv-2 rank 1 (option_b_plus_c) Phase 1: registry-derived enumeration + structural-examples PREPARE-path slot
- Inv-3 rank 1 (sub_option_b_beta): PrimitiveEntry extended with optional promptStructuralExample
- Inv-1 supersession_candidates: two T5 standing rules landed verbatim

## Architect-approved (DS-021 §12 substrate-extending)
PrimitiveEntry interface shape extension.

## Vertical slice verification
Component-level reconciliation against architect-selected verification tenant + expected-results file: see HF-195_COMPLETION_REPORT.md Section 6.

## Phase 2 follow-on (out of HF-195 scope)
option_c structural-pattern classification populated from vocabulary_bindings flywheel — separate OB.

## Traceability
- IRA-HF-195 Inv-1 invocation: 2a104f46-7ea8-4f36-b1a1-d916e53de131 ($1.22)
- IRA-HF-195 Inv-2 invocation: 319ed49f-8e7c-4c0c-b693-da435a5cb1c4 ($1.46)
- IRA-HF-195 Inv-3 invocation: (see Inv-3 log) ($1.43)
- vialuce-governance PR #51 (IRA decomposition + schema reference refresh): merged
EOF
)"
```

Paste PR URL.

### 7C: HALT for architect review + merge
CC does not merge PRs. Architect reviews + merges.

---

## INVARIANTS THROUGHOUT

- **No tenant-specific content in any code change.** Verification gate accepts tenant ID + expected-results file path as runtime parameters. The fix is platform-agnostic.
- **No GT $$ values in any directive content, completion report, or commit message.** CC reports computed values; architect compares.
- **Korean Test universal.** Build-time gate enforces.
- **Vertical Slice Rule.** HF-195 covers from prompt construction → import → calculation → reconciliation in one PR.
- **Phase 1 PREPARE-path hook for Phase 2.** The empty structural-examples slot is the Phase 2 (option_c flywheel) hook. Phase 1 without the slot = re-architecture-later trap.
- **Substrate-extending boundary respected.** PrimitiveEntry shape extension was architect-approved before this HF began per DS-021 §12.
- **HF closes on reconciliation, not on build PASS.** Build PASS is necessary, not sufficient.
