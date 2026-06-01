# HF-229: DECISION 108 ENFORCEMENT AT HC PATTERN LEVEL

## Governance

- **Predecessor:** HF-095 (PR #196, Decision 108 HC Override Authority — enforced at content-profile.ts structural detection), HF-228 (PR #406, platform data aperture — referential signal, cross-data-type discovery, metric derivation execution)
- **Governing decision:** Decision 108 LOCKED (March 7, 2026): When HC produces column roles with confidence ≥ 0.80, those roles OVERRIDE structural type detection. The system that UNDERSTANDS wins over the system that GUESSES.
- **Defect history:** Same architectural gap surfaced three times:
  - March 7: Datos_Flota_Hub misclassified as Transaction (HC said reference_key, structural said transaction). Fixed at content-profile.ts level (HF-095).
  - May 3: `Cantidad_Productos_Cruzados` misclassified — integer-isSequential structural arm overriding HC's `measure@0.90`. Fixed at agents.ts level (HF-196 Phase 1B).
  - May 17 (today): Quota file misclassified as entity — `entity_roster` HC pattern locks at 90% ignoring HC's `monthly_quota:measure@0.95`. NOT YET FIXED at HC pattern level.
- **Root cause:** Decision 108 was enforced at structural detection (content-profile.ts) and at agent scoring (agents.ts) but NEVER at HC pattern matching (synaptic-ingestion-state.ts). The HC patterns are the strongest signal in the pipeline (they lock classification at 90%) and they don't consult HC column roles.

## Why This HF Exists

The LLM correctly identifies `monthly_quota:measure@0.95` and `effective_date:temporal@0.98`. The posteriors show `entity=41%, target=29%`. Then the `entity_roster` HC pattern fires: `conditions=[HAS identifier, HAS name, idRepeatRatio=1.00 (<=1.5)]` → locks entity at 90%. The LLM's comprehension is discarded.

The `entity_roster` pattern checks three structural conditions. All three are true for quota files AND for roster files. The distinguishing signal is HC column roles — roster files have `identifier + name + attribute` columns. Quota files have `identifier + name + measure + temporal` columns. The `measure` role at high confidence is the signal that says "this file carries performance data about entities, not entity definitions."

Decision 108 says HC wins when confident. The pattern doesn't ask HC.

## What Changes (1 file, ~10 lines)

**File:** `web/src/lib/sci/synaptic-ingestion-state.ts`

**Location:** The `entity_roster` HC pattern match — find the block that checks `HAS identifier, HAS name, idRepeatRatio <= 1.5` and locks `entity@90%`.

**Current logic (pseudocode from log evidence):**
```
if (HAS identifier AND HAS name AND idRepeatRatio <= 1.5) {
  classification = entity
  confidence = 0.90
  pattern = entity_roster
}
```

**New logic — add Decision 108 negative condition:**
```
// Decision 108: HC column roles override structural pattern when confident.
// If HC identified a measure column at >= 0.80, this file carries performance
// data about entities (target/reference), not entity definitions (roster).
const hasMeasureColumn = hcRoles.some(r => r.role === 'measure' && r.confidence >= 0.80);

if (HAS identifier AND HAS name AND idRepeatRatio <= 1.5 AND NOT hasMeasureColumn) {
  classification = entity
  confidence = 0.90
  pattern = entity_roster
}
```

When `hasMeasureColumn` is true, the entity_roster pattern does NOT fire. Classification falls through to posterior-based scoring where `entity=41%, target=29%` + the HF-228 referential signal (+0.15 target, -0.15 entity) produces `target > entity`. The file classifies as target. Routes through `processDataUnit` with `data_type='target'`. Quota data lands in `committed_data` with `monthly_quota` as a column in `row_data`. Convergence discovers it. Engine uses it.

**Korean Test:** The condition checks `role === 'measure'` — this is an HC column role type, not a field name. `measure` is one of seven defined ColumnRole values in `sci-types.ts:69-75`. Structural, not linguistic. Korean Test compliant.

**Why only `measure`:** The seven ColumnRole values are: `identifier`, `name`, `temporal`, `measure`, `attribute`, `reference_key`, `currency`. Of these, `measure` is the role that distinguishes target/reference data from entity data. A roster has `identifier + name + attribute`. A target file has `identifier + name + measure`. The `temporal` role alone doesn't distinguish (rosters can have hire_date). The `measure` role at high confidence is the singular differentiator.

**What this does NOT do:**
- Does NOT change any agent scoring weights
- Does NOT change content-profile.ts structural detection (HF-095 already correct)
- Does NOT change the HC Override Authority threshold (still ≥ 0.80 per Decision 108)
- Does NOT add any new HC patterns
- Does NOT modify any other pattern match conditions
- Does NOT change the referential signal (HF-228 Phase 1 — remains additive)

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
3. Git commands from repo root (spm-platform), NOT from web/.
4. Final step: `gh pr create --base main --head hf-229-decision-108-pattern-enforcement` with descriptive title+body
5. Commit this prompt to git as first action.
6. Read `CC_STANDING_ARCHITECTURE_RULES.md` before any code changes.
7. **Every proof gate requires pasted evidence — code, terminal output, or grep results. PASS/FAIL self-attestation is NOT accepted.**

---

## PHASE 0: DIAGNOSTIC — READ CURRENT STATE (10 min)

```bash
cd ~/spm-platform
git fetch origin
git checkout main && git pull origin main
git checkout -b hf-229-decision-108-pattern-enforcement
```

### 0A: Find the entity_roster pattern match

```bash
grep -n "entity_roster\|entity.*roster\|HAS identifier.*HAS name\|idRepeatRatio.*1\.5\|pattern.*entity" web/src/lib/sci/synaptic-ingestion-state.ts | head -20
```

Read 40 lines of context around the pattern match. Paste verbatim with line numbers.

### 0B: Find where HC column roles are available at pattern match time

```bash
grep -n "hcRoles\|columnRole\|headerComprehension\|hc_.*column\|roles.*measure\|ColumnRole" web/src/lib/sci/synaptic-ingestion-state.ts | head -20
```

Determine whether HC column roles (the array of `{column, role, confidence}` objects) are in scope at the point where the entity_roster pattern fires. If not, find where they are available and how to thread them to the pattern match.

### 0C: Find ALL HC pattern matches (not just entity_roster)

```bash
grep -n "pattern=\|@90%\|@85%\|@80%\|@75%\|classification=" web/src/lib/sci/synaptic-ingestion-state.ts | head -30
```

Read each pattern match. List all patterns that lock classification at high confidence. Determine whether any OTHER patterns also need the Decision 108 negative condition.

### 0D: Read HC role data structure

```bash
grep -n "ColumnRole\|columnRole\|role.*measure\|role.*identifier\|role.*temporal\|role.*name" web/src/lib/sci/sci-types.ts | head -20
```

Paste the ColumnRole type definition. Confirm `measure` is a valid role value.

**Proof gate 0 (IMMUTABLE):**
```
□ entity_roster pattern match code pasted with line numbers
□ HC column roles availability at pattern match point confirmed (paste variable name + scope)
□ ALL HC patterns listed with their lock conditions
□ ColumnRole type definition pasted — measure confirmed as valid value
```

**Commit:** `git add -A && git commit -m "HF-229 Phase 0: diagnostic — Decision 108 pattern enforcement" && git push origin hf-229-decision-108-pattern-enforcement`

---

## PHASE 1: ADD DECISION 108 NEGATIVE CONDITION TO entity_roster PATTERN (15 min)

**File:** `web/src/lib/sci/synaptic-ingestion-state.ts`

### 1A: Thread HC roles to pattern match if not already available

If HC column roles are not in scope at the entity_roster pattern match, thread them. The HC roles are produced during classification (`applyHeaderComprehensionSignals` or the HC diagnostic block). Find where they're stored (likely on the profile or the unit) and access them at the pattern match point.

### 1B: Add the negative condition

Before the entity_roster pattern match, check for a measure column at high confidence:

```typescript
// HF-229: Decision 108 enforcement at pattern level.
// If HC identified a measure column at >= 0.80 confidence, this file carries
// performance data about entities (target/reference), not entity definitions.
// The entity_roster pattern must NOT lock classification when measure data is present.
const hasMeasureColumn = hcColumnRoles?.some(
  (r: { role: string; confidence: number }) => r.role === 'measure' && r.confidence >= 0.80
) ?? false;
```

Then add `&& !hasMeasureColumn` to the entity_roster pattern condition.

### 1C: Check other patterns

From Phase 0C, check whether any other HC pattern (e.g., `transaction_data`, `reference_data`) needs a similar Decision 108 condition. Apply the same principle: if HC identified a column role at high confidence that contradicts the pattern's classification, the pattern should not fire.

The principle is symmetric: if a file has `measure` columns, entity_roster shouldn't fire. If a file has NO `measure` or `temporal` columns but the pattern says transaction, and HC says all columns are `attribute`, transaction pattern shouldn't fire either. Apply Decision 108 consistently.

However — only add conditions that are code-justified from Phase 0C. Do NOT speculatively add conditions for patterns that don't exist in the current code.

**Proof gate 1 (IMMUTABLE):**
```
□ hasMeasureColumn check added before entity_roster pattern (paste code + line number)
□ entity_roster condition includes && !hasMeasureColumn (paste full condition)
□ HC column roles accessible at pattern match point (paste variable threading if added)
□ Other patterns assessed — list which patterns were modified (if any) and why
□ npm run build exits 0
□ Korean Test: grep -nE "'quota'|'monthly_quota'|'target_amount'" web/src/lib/sci/synaptic-ingestion-state.ts returns 0
```

**Commit:** `git add -A && git commit -m "HF-229 Phase 1: Decision 108 enforcement — entity_roster checks HC measure role" && git push origin hf-229-decision-108-pattern-enforcement`

---

## PHASE 2: COMPLETION REPORT + PR (10 min)

Write completion report to `docs/completion-reports/HF-229_COMPLETION_REPORT.md` per Rules 25-28.

Final build:
```bash
cd ~/spm-platform && rm -rf web/.next && cd web && npm run build
echo "BUILD EXIT: $?"
```

PR:
```bash
gh pr create --base main --head hf-229-decision-108-pattern-enforcement \
  --title "HF-229: Decision 108 enforcement at HC pattern level — entity_roster consults HC measure role" \
  --body "Enforces Decision 108 (HC Override Authority, LOCKED March 7 2026) at the HC pattern matching layer. The entity_roster pattern now checks whether HC identified a measure column at >= 0.80 confidence before locking entity@90%. When measure data is present, the pattern does not fire, allowing posterior-based scoring + HF-228 referential signal to correctly classify quota/target files. Same architectural gap surfaced three times (March 7, May 3, May 17) — this closes it at the pattern level, the last unenforced surface."
```

HALT after PR creation. Architect clean-slates CRP, imports quota file first, verifies classification as target, then imports remaining files and calculates.

---

## SCOPE BOUNDARY — DO NOT CHANGE

- **Do NOT modify** content-profile.ts — HF-095 already correct
- **Do NOT modify** agents.ts scoring weights — HF-228 referential signal already correct
- **Do NOT modify** tenant-context.ts — HF-228 referential adjustment already correct
- **Do NOT modify** any convergence or engine code — HF-226/227/228 already correct
- **Do NOT add** new HC patterns
- **Do NOT change** the Decision 108 confidence threshold (≥ 0.80)
- **Do NOT add** any new npm dependencies

## ANTI-PATTERNS SPECIFIC TO THIS HF

**AP-1: Adding weight adjustments instead of enforcing authority.** Decision 108 is an authority hierarchy, not a scoring adjustment. The fix is a conditional gate on the pattern, not a +/- weight. If you find yourself adjusting numerical weights, STOP.

**AP-2: Field name matching.** The condition checks `role === 'measure'` — an HC ColumnRole type, not a field name. Do NOT check for 'quota', 'target', 'monthly_quota', or any field name string.

**AP-3: Modifying structural detection.** The structural profile correctly identifies `hasEntityId=true, hasName=true, idRepeatRatio=1.00`. These are correct structural observations. The fix is not to change what the profile says — it's to ensure the pattern consults HC before acting on the profile.

---

## EXECUTION SEQUENCE

Phases 0 → 1 → 2 in sequence. Every Phase has a proof gate. Paste evidence at every gate. Do NOT skip gates.

Commit + push after every Phase.
