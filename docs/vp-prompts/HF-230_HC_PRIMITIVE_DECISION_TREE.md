# HF-230: HC PATTERN CLASSIFIER — PRIMITIVE-BASED DECISION TREE

## Governance

- **Predecessor:** HF-105 (PR #207, two-level classification model — Level 1 HC patterns, Level 2 CRR Bayesian fallback), HF-229 (PR #407, Decision 108 enforcement — entity_roster checks HC measure role)
- **Governing decisions:** Decision 108 LOCKED (HC Override Authority — LLM overrides structural when confident), Decision 152 LOCKED (import sequence independence), Decision 154 LOCKED (Korean Test)
- **Architectural correction:** The current `hc-pattern-classifier.ts` contains four enumerated patterns (`entity_roster`, `repeated_measures_over_time`, `lookup_table`, `per_entity_benchmarks`). Each pattern was added to handle a specific file shape encountered during development. This is a registry — every new file shape needs a new pattern. This HF replaces the registry with a decision tree built from HC role composition primitives. The tree is complete — it classifies any file from the LLM's column role assignments without enumeration, sampling, or developer-set thresholds.

## Why This HF Exists

The SCI classifies the CRP quota file as `entity@41%` despite the LLM identifying `monthly_quota:measure@0.95`. The HC pattern classifier (Level 1) returns NO_MATCH because no enumerated pattern covers the quota file's role signature (`identifier + name + measure + temporal + idRepeatRatio = 1.00`). Classification falls to Level 2 (CRR Bayesian) which produces `entity@41%`.

The root cause is not a missing pattern. The root cause is that the pattern classifier is a registry of observed file shapes, not an intelligence that derives classification from the LLM's comprehension. Adding a fifth pattern for "per_entity_targets" would fix CRP but break for the next file shape the registry hasn't seen.

The LLM already provides everything needed to classify any file: the column roles and their confidences. The COMBINATION of roles present determines the classification. This combination is derivable from first principles — no enumeration required.

## The Decision Tree

Built entirely from HC role counts. No row sampling. No developer thresholds. No `idRepeatRatio`.

The LLM produces seven ColumnRole values: `identifier`, `name`, `temporal`, `measure`, `attribute`, `reference_key`, `currency`.

Three HC role primitives discriminate classification:

1. **`measure` presence** — does the file carry quantitative values? Separates data-about-entities (target/transaction) from entity-definitions (entity).
2. **`identifier` count** — how many identifier columns? One = entity-level file (target). Two or more = event-level file (transaction — has entity ID + transaction/event ID).
3. **`reference_key` presence** — does the file have a categorical lookup key without entity identifiers? Separates dimensional reference data from entity-associated data.

The tree:

```
IF no HC roles at >= 0.80 confidence:
  → RETURN null (Level 2 fallback — HC is not confident enough to determine)

IF reference_key present AND identifier absent:
  → reference (dimensional lookup — hub capacity, product catalog, rate tables)

IF measure absent:
  → entity (definitions — roster, org chart, employee master)

IF measure present:
  IF identifier count = 1:
    → target (one value per entity — quotas, targets, thresholds, rates)
  IF identifier count >= 2:
    → transaction (events — sales, orders, claims, payments)
  IF identifier count = 0:
    → reference (aggregate measures without entity association)
```

**Why this works for every domain:**

| File type | HC roles | identifier count | measure present | Classification |
|---|---|---|---|---|
| Employee roster | identifier + name + attribute | 1 | no | entity |
| Quota file | identifier + name + measure + temporal | 1 | yes | target |
| Sales transactions | identifier + identifier + measure + temporal + attribute | 2 | yes | transaction |
| Hub capacity lookup | reference_key + measure | 0 | yes | reference |
| Franchise royalty rates | identifier + measure + temporal | 1 | yes | target |
| POS daily sales | identifier + identifier + measure + temporal | 2 | yes | transaction |
| Product catalog | reference_key + attribute | 0 | no | reference |
| Annual targets | identifier + measure | 1 | yes | target |

**What about edge cases?**

- File with 2 identifiers but only 1 measure: transaction. The second identifier (per-row event ID) is the discriminator, not measure count.
- File with 1 identifier and 3 measures: target. One entity, multiple target values (revenue target, unit target, margin target). Still one value set per entity.
- File with `name` and `measure` but no `identifier`: the LLM likely classified the name column as identifier. If not, falls through to Level 2.
- File where LLM is uncertain (all roles < 0.80): returns null, Level 2 CRR Bayesian handles it with structural scoring.

**What about `name` and `temporal`?**

These roles are informational but not discriminating for the top-level classification. Both entity files and target files can have `name` columns. Both target files and transaction files can have `temporal` columns. They contribute to confidence within a classification but don't change which classification is selected.

**What about `currency`?**

`currency` implies a monetary measure. It strengthens the `measure present` branch but doesn't change the tree structure. A file with `currency` but no `measure` should be treated as having a measure.

## What Changes (1 file, ~60 lines replaced)

**File:** `web/src/lib/sci/hc-pattern-classifier.ts`

**Current state (DIAG-048 + HF-229):** Four enumerated patterns with structural conditions including `idRepeatRatio` checks. The function `classifyByHCPattern` evaluates each pattern in sequence, returns the first match or null.

**New state:** Replace the four enumerated pattern blocks with the decision tree. The function signature remains identical — accepts profile + HC result, returns classification or null. The Level 1/Level 2 wiring in `analyze/route.ts` and `synaptic-ingestion-state.ts` is unchanged.

### Implementation

```typescript
export function classifyByHCPattern(
  profile: ContentProfile,
  hc: HCResult,
): HCPatternResult | null {

  // Precondition: HC must have produced roles at sufficient confidence
  const HC_CONFIDENCE_THRESHOLD = 0.80;
  
  // Count HC roles at threshold
  const roles = Array.from(hc.interpretations.values())
    .filter(interp => interp.confidence >= HC_CONFIDENCE_THRESHOLD);
  
  // Minimum coverage: at least 50% of columns must have confident roles
  const totalColumns = hc.interpretations.size;
  if (totalColumns === 0 || roles.length / totalColumns < 0.50) {
    return null; // HC not confident enough — Level 2 fallback
  }

  const identifierCount = roles.filter(r => r.role === 'identifier').length;
  const hasMeasure = roles.some(r => r.role === 'measure');
  const hasCurrency = roles.some(r => r.role === 'currency');
  const hasReferenceKey = roles.some(r => r.role === 'reference_key');
  const hasName = roles.some(r => r.role === 'name');
  const measurePresent = hasMeasure || hasCurrency;

  // Build matched conditions for observability
  const conditions: string[] = [];

  // Decision tree — three primitives, four outcomes

  // Branch 1: Reference/lookup data
  // Has a categorical key for dimensional lookup, no entity identifiers
  if (hasReferenceKey && identifierCount === 0) {
    conditions.push('HAS reference_key', 'NO identifier');
    return {
      classification: 'reference',
      confidence: 0.85,
      patternName: 'dimensional_lookup',
      matchedConditions: conditions,
    };
  }

  // Branch 2: Entity definitions
  // Has identifiers but no quantitative measures — defining entities, not measuring them
  if (!measurePresent) {
    conditions.push('NO measure', 'NO currency');
    if (identifierCount > 0) conditions.push(`${identifierCount} identifier(s)`);
    if (hasName) conditions.push('HAS name');
    return {
      classification: 'entity',
      confidence: 0.90,
      patternName: 'entity_definition',
      matchedConditions: conditions,
    };
  }

  // Branch 3: Measure present — distinguish target vs transaction by identifier count
  // One identifier = entity-level file (targets, quotas, rates)
  // Two+ identifiers = event-level file (transactions, orders, claims)
  conditions.push('HAS measure');

  if (identifierCount <= 1) {
    conditions.push(`${identifierCount} identifier(s) — entity-level`);
    return {
      classification: 'target',
      confidence: 0.85,
      patternName: 'entity_targets',
      matchedConditions: conditions,
    };
  }

  if (identifierCount >= 2) {
    conditions.push(`${identifierCount} identifier(s) — event-level`);
    return {
      classification: 'transaction',
      confidence: 0.85,
      patternName: 'event_transactions',
      matchedConditions: conditions,
    };
  }

  // Fallback: HC roles present but tree couldn't determine — Level 2
  return null;
}
```

### What this does NOT change

- `analyze/route.ts` wiring — Level 1 called first, Level 2 fallback. Unchanged.
- `synaptic-ingestion-state.ts` — calls `classifyByHCPattern` in Phase C. Unchanged.
- `sci-types.ts` — ColumnRole type definition. Unchanged.
- `HCPatternResult` return type — same interface. Unchanged.
- Level 2 CRR Bayesian resolver — completely untouched. Still runs when Level 1 returns null.
- Agent scoring weights — untouched.
- Structural profile computation — untouched.
- HC LLM call — untouched.

### What this removes

- `entity_roster` pattern (replaced by `entity_definition` branch — no measure, has identifier)
- `repeated_measures_over_time` pattern (replaced by `event_transactions` branch — 2+ identifiers with measure)
- `lookup_table` pattern (replaced by `dimensional_lookup` branch — reference_key, no identifier)
- `per_entity_benchmarks` pattern (replaced by `entity_targets` branch — 1 identifier with measure)
- ALL `idRepeatRatio` checks (developer threshold eliminated)
- ALL row-count or sampling dependencies (zero data access — operates purely on HC role output)

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
3. Git commands from repo root (spm-platform), NOT from web/.
4. Final step: `gh pr create --base main --head hf-230-hc-primitive-decision-tree` with descriptive title+body
5. Commit this prompt to git as first action.
6. Read `CC_STANDING_ARCHITECTURE_RULES.md` before any code changes.
7. **Every proof gate requires pasted evidence — code, terminal output, or grep results. PASS/FAIL self-attestation is NOT accepted.**

---

## PHASE 0: DIAGNOSTIC — READ CURRENT STATE (10 min)

```bash
cd ~/spm-platform
git fetch origin
git checkout main && git pull origin main
git checkout -b hf-230-hc-primitive-decision-tree
```

### 0A: Read the current hc-pattern-classifier.ts

```bash
cat web/src/lib/sci/hc-pattern-classifier.ts
```

Paste the ENTIRE file verbatim with line numbers. This is the file being replaced.

### 0B: Read the HCPatternResult interface

```bash
grep -n "HCPatternResult\|interface.*Pattern" web/src/lib/sci/hc-pattern-classifier.ts web/src/lib/sci/sci-types.ts | head -10
```

Paste the interface definition. The new implementation must return the same type.

### 0C: Read all call sites

```bash
grep -rn "classifyByHCPattern\|hc-pattern-classifier" web/src/lib/sci/ web/src/app/api/import/ | head -20
```

Paste all call sites. These are unchanged — the function signature and return type are preserved.

### 0D: Read the ColumnRole type and HC interpretation structure

```bash
grep -n "ColumnRole\|HCResult\|interpretations" web/src/lib/sci/sci-types.ts | head -15
```

Paste the types. Confirm the role values and the structure of `hc.interpretations`.

**Proof gate 0 (IMMUTABLE):**
```
□ Current hc-pattern-classifier.ts full file pasted
□ HCPatternResult interface pasted
□ All call sites listed (analyze/route.ts, synaptic-ingestion-state.ts, others)
□ ColumnRole type + HCResult structure pasted
□ Function signature confirmed: (profile, hc) → HCPatternResult | null
```

**Commit:** `git add -A && git commit -m "HF-230 Phase 0: diagnostic — current HC pattern classifier state" && git push origin hf-230-hc-primitive-decision-tree`

---

## PHASE 1: REPLACE ENUMERATED PATTERNS WITH DECISION TREE (20 min)

**File:** `web/src/lib/sci/hc-pattern-classifier.ts`

Replace the entire body of `classifyByHCPattern` with the decision tree implementation above. Preserve:
- The function signature exactly
- The return type exactly
- All imports
- The export

Remove:
- All `idRepeatRatio` references
- All four enumerated pattern blocks
- Any `profile.` references that accessed structural profile data for pattern matching (the tree uses ONLY HC role output)

The `profile` parameter may still be needed for the function signature compatibility even if unused. Keep it in the signature. If TypeScript warns about unused parameter, prefix with underscore: `_profile`.

**Log format preservation:** The `[SCI-HC-PATTERN]` log line format must be preserved for observability. The current patterns log `classification=X@Y% pattern=Z conditions=[...]`. The new tree must produce identical log structure. The `patternName` values change (from enumerated names to tree branch names) but the format is the same.

**Proof gate 1 (IMMUTABLE):**
```
□ classifyByHCPattern function body replaced with decision tree (paste full function)
□ Zero idRepeatRatio references remain:
    grep -n "idRepeatRatio" web/src/lib/sci/hc-pattern-classifier.ts
    Must return 0 results
□ Zero row-count or sampling references remain:
    grep -n "rowCount\|sample\|limit(30)\|limit(500)" web/src/lib/sci/hc-pattern-classifier.ts
    Must return 0 results
□ Function signature unchanged (paste)
□ Return type unchanged (paste HCPatternResult)
□ All call sites compile without changes:
    grep -rn "classifyByHCPattern" web/src/ | head -10
□ npm run build exits 0
□ Korean Test:
    grep -nE "'quota'|'monthly_quota'|'roster'|'target_amount'" web/src/lib/sci/hc-pattern-classifier.ts
    Must return 0 results
```

**Commit:** `git add -A && git commit -m "HF-230 Phase 1: primitive-based decision tree replaces enumerated pattern registry" && git push origin hf-230-hc-primitive-decision-tree`

---

## PHASE 2: COMPLETION REPORT + PR (10 min)

Write completion report to `docs/completion-reports/HF-230_COMPLETION_REPORT.md` per Rules 25-28.

Final build:
```bash
cd ~/spm-platform && rm -rf web/.next && cd web && npm run build
echo "BUILD EXIT: $?"
```

PR:
```bash
gh pr create --base main --head hf-230-hc-primitive-decision-tree \
  --title "HF-230: HC pattern classifier — primitive-based decision tree replaces enumerated registry" \
  --body "Replaces four enumerated HC patterns (entity_roster, repeated_measures_over_time, lookup_table, per_entity_benchmarks) with a decision tree built from three HC role primitives: measure presence, identifier count, reference_key presence. Zero row sampling. Zero developer thresholds. Zero idRepeatRatio. The LLM produces column roles; the tree derives classification from role composition. Decision 108 enforced by construction — when HC is confident, HC determines classification directly. Level 2 CRR Bayesian fallback unchanged. Domain-agnostic — tree covers entity/target/transaction/reference from first principles."
```

HALT after PR creation. Architect clean-slates CRP, imports quota file (should classify as target via entity_targets branch — 1 identifier, measure present), imports remaining files, calculates all four plans.

---

## SCOPE BOUNDARY — DO NOT CHANGE

- **Do NOT modify** `analyze/route.ts` Level 1/Level 2 wiring — unchanged
- **Do NOT modify** `synaptic-ingestion-state.ts` call site — unchanged
- **Do NOT modify** `sci-types.ts` ColumnRole or HCPatternResult — unchanged
- **Do NOT modify** Level 2 CRR Bayesian resolver — unchanged
- **Do NOT modify** agent scoring weights — unchanged
- **Do NOT modify** structural profile computation — unchanged
- **Do NOT modify** HC LLM call — unchanged
- **Do NOT modify** any convergence or engine code
- **Do NOT add** any new npm dependencies

## ANTI-PATTERNS SPECIFIC TO THIS HF

**AP-1: Adding developer thresholds.** The decision tree uses HC role COUNTS (0, 1, 2+). These are not thresholds — they are cardinality observations. "Does this file have 0, 1, or 2+ identifiers?" is a structural fact, not a developer-calibrated value. If you find yourself writing a number like 1.5 or 0.70 as a discriminator, STOP.

**AP-2: Accessing structural profile for classification.** The tree classifies from HC roles only. The `profile` parameter exists for signature compatibility. Do NOT read `profile.patterns.idRepeatRatio` or any other structural profile field for classification decisions.

**AP-3: Adding domain vocabulary.** The tree uses ColumnRole values (`measure`, `identifier`, `reference_key`). These are structural primitives defined in `sci-types.ts`. Do NOT add any domain terms (`quota`, `transaction_amount`, `employee`).

**AP-4: Preserving enumerated patterns alongside the tree.** The tree replaces the registry. Do NOT keep old patterns as "fallback" or "additional checks." The tree is complete.

---

## EXECUTION SEQUENCE

Phases 0 → 1 → 2 in sequence. Every Phase has a proof gate. Paste evidence at every gate. Do NOT skip gates.

Commit + push after every Phase.
