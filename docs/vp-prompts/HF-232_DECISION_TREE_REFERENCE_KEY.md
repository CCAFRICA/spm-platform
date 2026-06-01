# HF-232: HC DECISION TREE — reference_key DISCRIMINATES TRANSACTION FROM TARGET

## Governance

- **Predecessor:** HF-230 (PR #408, primitive-based decision tree)
- **Governing decisions:** D108 LOCKED (HC Override Authority), D154 LOCKED (Korean Test)
- **Defect:** HF-230 Branch 3 uses `identifierCount === 1` → target. Branch 4 uses `identifierCount >= 2` → transaction. CRP sales files have `transaction_id:identifier@0.95` + `sales_rep_id:reference_key@0.95`. The LLM correctly assigned `reference_key` (not `identifier`) to the entity foreign key. `identifierCount === 1`. Branch 3 fires. Sales data classifies as target. Wrong.

## Root Cause

The LLM distinguishes two kinds of ID columns: `identifier` (the row's own identity — transaction_id) and `reference_key` (a foreign key to another entity — sales_rep_id). The decision tree counted only `identifier` roles. It missed the semantic signal in `reference_key`: a file that references other entities via foreign keys is transactional, not target.

**Target files:** One identifier (the entity itself). No reference_keys. The file IS the entity-level record. `entity_id:identifier, monthly_quota:measure`.

**Transaction files:** One identifier (the event/row). One or more reference_keys (entity foreign keys). The file RECORDS events that reference entities. `transaction_id:identifier, sales_rep_id:reference_key, total_amount:measure`.

The discriminator is `reference_key` presence, not identifier count.

## What Changes (1 file, ~5 lines)

**File:** `web/src/lib/sci/hc-pattern-classifier.ts`

**Current Branches 3-5 (measure present):**
```typescript
if (identifierCount === 1) → target
if (identifierCount >= 2) → transaction
if (identifierCount === 0) → reference
```

**New Branches 3-5 (measure present):**
```typescript
if (identifierCount >= 1 && hasReferenceKey) → transaction
if (identifierCount >= 1 && !hasReferenceKey) → target
if (identifierCount === 0) → reference
```

**Updated matchedConditions:**
- Transaction: `['HAS measure', 'HAS reference_key — event references entities', ...]`
- Target: `['HAS measure', 'NO reference_key — entity-level record', ...]`

**Verification against known files:**

| File | identifier | reference_key | measure | Branch | Classification |
|---|---|---|---|---|---|
| Quota | entity_id:identifier | none | monthly_quota:measure | 4 (id≥1, no ref_key) | target ✓ |
| Sales | transaction_id:identifier | sales_rep_id:reference_key | quantity+unit_price+total_amount:measure | 3 (id≥1, has ref_key) | transaction ✓ |
| Roster | employee_id:identifier | none | none | 2 (!measure) | entity ✓ |
| Hub capacity | none | none | capacity:measure | 5 (id=0) | reference ✓ |

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
3. Git commands from repo root (spm-platform), NOT from web/.
4. Final step: `gh pr create --base main --head hf-232-decision-tree-reference-key` with descriptive title+body
5. Commit this prompt to git as first action.
6. Read `CC_STANDING_ARCHITECTURE_RULES.md` before any code changes.
7. **Every proof gate requires pasted evidence — code, terminal output, or grep results. PASS/FAIL self-attestation is NOT accepted.**

---

## PHASE 0: DIAGNOSTIC (5 min)

```bash
cd ~/spm-platform
git fetch origin
git checkout main && git pull origin main
git checkout -b hf-232-decision-tree-reference-key
```

### 0A: Read the current decision tree branches

```bash
cat -n web/src/lib/sci/hc-pattern-classifier.ts
```

Paste the full file. Identify the three measure-present branches (3, 4, 5) by line number. Confirm `hasReferenceKey` is already computed (it should be — HF-230 included it).

**Proof gate 0 (IMMUTABLE):**
```
□ Current Branches 3, 4, 5 pasted with line numbers
□ hasReferenceKey variable confirmed present (paste line)
```

**Commit:** `git add -A && git commit -m "HF-232 Phase 0: diagnostic — current decision tree branches" && git push origin hf-232-decision-tree-reference-key`

---

## PHASE 1: FIX BRANCH DISCRIMINATION (10 min)

**File:** `web/src/lib/sci/hc-pattern-classifier.ts`

Replace Branches 3 and 4. Branch 5 unchanged.

**Branch 3 (was: identifierCount === 1 → target):**
```typescript
// Branch 3: Transaction data — events that REFERENCE entities
// Has a per-row identifier AND a reference_key (foreign key to another entity).
// "Each row is an event with its own ID, linked to an entity via foreign key."
if (identifierCount >= 1 && hasReferenceKey) {
  return {
    classification: 'transaction',
    confidence: 0.85,
    patternName: 'event_transactions',
    matchedConditions: [
      'HAS measure',
      'HAS reference_key — event references entities',
      `${identifierCount} identifier(s)`,
      `${measureCount} measure column(s)`,
    ],
  };
}
```

**Branch 4 (was: identifierCount >= 2 → transaction):**
```typescript
// Branch 4: Target/reference data — entity-level records with measures
// Has an identifier but NO reference_key — this IS the entity record, not referencing another.
// "One value set per entity — quotas, targets, thresholds, rates."
if (identifierCount >= 1 && !hasReferenceKey) {
  return {
    classification: 'target',
    confidence: 0.85,
    patternName: 'entity_targets',
    matchedConditions: [
      'HAS measure',
      'NO reference_key — entity-level record',
      `${identifierCount} identifier(s)`,
      `${measureCount} measure column(s)`,
    ],
  };
}
```

**Branch 5 unchanged:** `identifierCount === 0` → reference.

**Proof gate 1 (IMMUTABLE):**
```
□ Branch 3 now checks hasReferenceKey → transaction (paste code + line number)
□ Branch 4 now checks !hasReferenceKey → target (paste code + line number)
□ Branch 5 unchanged (paste code + line number)
□ npm run build exits 0
□ Korean Test: grep -nE "'quota'|'sales'|'transaction_id'" web/src/lib/sci/hc-pattern-classifier.ts returns 0
```

**Commit:** `git add -A && git commit -m "HF-232 Phase 1: reference_key discriminates transaction from target" && git push origin hf-232-decision-tree-reference-key`

---

## PHASE 2: COMPLETION REPORT + PR (5 min)

Write completion report to `docs/completion-reports/HF-232_COMPLETION_REPORT.md` per Rules 25-28.

```bash
cd ~/spm-platform && rm -rf web/.next && cd web && npm run build
echo "BUILD EXIT: $?"
```

```bash
gh pr create --base main --head hf-232-decision-tree-reference-key \
  --title "HF-232: HC decision tree — reference_key discriminates transaction from target" \
  --body "Fixes HF-230 Branch 3/4 discrimination. Was: identifierCount 1 vs 2+. Now: hasReferenceKey (transaction — events referencing entities) vs !hasReferenceKey (target — entity-level records). The LLM distinguishes identifier (row ID) from reference_key (foreign key). The tree now uses that distinction. Quota files: identifier + measure + no reference_key = target. Sales files: identifier + measure + reference_key = transaction."
```

HALT after PR. Architect clean-slates CRP (including fingerprint cache), re-imports all files, verifies quota=target and sales=transaction, calculates all four plans.

---

## SCOPE BOUNDARY

- **Do NOT modify** Branches 1, 2, or 5 — unchanged
- **Do NOT modify** the coverage gate or HC_ROLE_THRESHOLD — unchanged
- **Do NOT modify** any other file
