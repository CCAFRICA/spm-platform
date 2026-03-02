# HF-077: DOMAIN LEAK CLEANUP — KOREAN TEST ENFORCEMENT
## Target: alpha.2.0
## Depends on: OB-120 (PR #132)

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". Just act.**

---

## READ FIRST

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules, anti-patterns
2. `SCHEMA_REFERENCE.md` — database schema
3. This prompt contains everything needed. Do not guess.

---

## CONTEXT

The CC-UAT Architecture Trace (architecture-trace.ts, commit 03695b7) identified **3 DOMAIN_LEAK violations** and **6 Korean Test failures** in foundational code. OB-120 delivered $3.25M in calculation results but introduced domain vocabulary into the platform's structural layers.

**Architecture trace scorecard: 5/16 STRUCTURAL, 10/16 Korean Test pass.**
**Target after this HF: 0 DOMAIN_LEAK, ≥13/16 Korean Test pass.**

This HF is surgical — fix the specific domain leaks identified by the trace. No feature changes. No calculation logic changes. No new capabilities. Rename, refactor, remove.

---

## THE THREE DOMAIN LEAKS

### LEAK 1: "ProductCode" Hardcoded in run-calculation.ts [CRITICAL]

**Evidence from trace:**
```
Code Integrity > Hardcoded Field Names in lib/: DOMAIN_LEAK
  1 hardcoded fields: ProductCode in run-calculation.ts
```

**What's wrong:** The foundational calculation engine — which must work for ANY domain (ICM, franchise, royalties, rebates) — references a specific field name from MBC's Insurance Referral data. If a Korean tenant has a product category field named "제품코드", the engine breaks.

**Fix:** Find every reference to "ProductCode" in `web/src/lib/calculation/run-calculation.ts`. The field name should come from the MetricDerivationRule's `filters[].field` property — the engine reads the filter field dynamically, never by name.

```bash
# Find the exact references
grep -n "ProductCode" web/src/lib/calculation/run-calculation.ts
```

Remove the hardcoded string. If the engine needs to access filter fields, it reads them from the derivation rule's `filters` array — `filter.field` is a variable, not a constant.

**Proof gate:** `grep -rn "ProductCode" web/src/lib/ --include="*.ts"` returns 0 results.

---

### LEAK 2: Domain Vocabulary in Calculation Engine [MEDIUM]

**Evidence from trace:**
```
Code Integrity > Calculation Engine Domain Vocab: DOMAIN_LEAK
  14 domain terms found:
  "commission" in commission: 0,
  "commission" in if (result.byType.commission === 0 && result.entries.some((e) => e.ruleSetId)) {
  "commission" in warnings.push('No commission calculated despite having plan assignments');
```

**What's wrong:** The calculation engine uses the word "commission" in its result structure (`byType.commission`) and warning messages. This is domain vocabulary in the foundational layer. The engine should know about "payout", "result", "component_total" — never "commission." A franchise tenant calculating royalties shouldn't see "No commission calculated."

**Fix:** 

Step 1 — Find all references:
```bash
grep -rn "commission" web/src/lib/calculation/ --include="*.ts"
grep -rn "commission" web/src/app/api/**/run-calculation* --include="*.ts"
```

Step 2 — Rename structural properties:
- `byType.commission` → `byType.component_payout` or `byType.payout`
- `'No commission calculated despite having plan assignments'` → `'No payout calculated despite having plan assignments'`
- Any other `commission` references in result types → `payout` or `component_result`

Step 3 — Check consumers of the renamed properties:
```bash
grep -rn "byType\.commission\|result\.commission\|\.commission" web/src/ --include="*.ts" --include="*.tsx"
```

Update all consumers to use the new structural name.

**Proof gate:** `grep -rn "commission" web/src/lib/calculation/ --include="*.ts"` returns 0 results in non-comment lines.

---

### LEAK 3: Domain Vocabulary in Convergence Engine [LOW]

**Evidence from trace:**
```
Code Integrity > Convergence Engine Domain Vocab: DOMAIN_LEAK
  "commission" in '2024', '2025', '2026', 'plan', 'program', 'commission',
  "referral" in && comp.calculationRate > 1; // Fixed rate like 850 per referral = count-based
```

**What's wrong:** Two issues in `web/src/lib/intelligence/convergence-service.ts`:

1. A stop-word list for keyword extraction includes "commission" — domain vocabulary in a structural filter. The stop-word list should contain generic noise words (years, articles, prepositions), not domain terms. "Commission" is a meaningful keyword for convergence matching — removing it from stop-words actually improves matching for commission-type plans.

2. A code comment says "per referral" — using domain vocabulary to explain structural logic. Should say "per unit" or "per count" instead.

**Fix:**

Step 1 — Fix stop-word list:
```bash
grep -n "commission" web/src/lib/intelligence/convergence-service.ts
```
Remove "commission" from the stop-word array. It's a meaningful domain keyword, not noise.

Step 2 — Fix comment:
```bash
grep -n "referral" web/src/lib/intelligence/convergence-service.ts
```
Change "per referral" to "per unit" or "per qualifying event" in the comment.

Step 3 — Check for any other domain terms:
```bash
grep -rn "mortgage\|insurance\|loan\|deposit\|disbursement\|referral\|lending" \
  web/src/lib/intelligence/ --include="*.ts" | grep -v "node_modules"
```
Fix any domain vocabulary found in structural logic (not in logging or sample data).

**Proof gate:** `grep -rn "commission\|referral" web/src/lib/intelligence/ --include="*.ts"` returns 0 results in non-comment, non-logging lines.

---

## ADDITIONAL CLEANUP: SHEET_COMPONENT_PATTERNS

**Evidence from trace:**
```
SHEET_COMPONENT_PATTERNS Usage: PARTIAL, KR:FAIL
  14 references to SHEET_COMPONENT_PATTERNS. Still widely used.
```

**This HF does NOT remove SHEET_COMPONENT_PATTERNS** — that's OB-122 scope. But do:

1. Count current references:
```bash
grep -rn "SHEET_COMPONENT_PATTERNS" web/src/ --include="*.ts" | wc -l
```

2. Document which files reference it and whether convergence has replaced the usage:
```bash
grep -rn "SHEET_COMPONENT_PATTERNS" web/src/ --include="*.ts"
```

3. Add a comment at the SHEET_COMPONENT_PATTERNS definition:
```typescript
/**
 * DEPRECATION NOTICE: SHEET_COMPONENT_PATTERNS is a legacy pattern-matching table.
 * The convergence service (convergence-service.ts) replaces this with semantic matching.
 * Target removal: OB-122.
 * Current references: [count from step 1]
 * Korean Test: FAIL — patterns contain domain-specific strings.
 */
```

**Proof gate:** Deprecation comment added. Reference count documented.

---

## EXECUTION

### Phase 0: Diagnostic

```bash
cd /Users/AndrewAfrica/spm-platform

echo "=== LEAK 1: ProductCode in engine ==="
grep -n "ProductCode" web/src/lib/calculation/run-calculation.ts

echo ""
echo "=== LEAK 2: commission in engine ==="
grep -n "commission" web/src/lib/calculation/run-calculation.ts
grep -n "commission" web/src/lib/calculation/*.ts

echo ""
echo "=== LEAK 3: domain vocab in convergence ==="
grep -n "commission\|referral\|mortgage\|insurance\|loan\|deposit" \
  web/src/lib/intelligence/convergence-service.ts

echo ""
echo "=== SHEET_COMPONENT_PATTERNS references ==="
grep -rn "SHEET_COMPONENT_PATTERNS" web/src/ --include="*.ts" | wc -l
grep -rn "SHEET_COMPONENT_PATTERNS" web/src/ --include="*.ts"

echo ""
echo "=== Full domain vocabulary scan (foundational code) ==="
grep -rn "commission\|mortgage\|insurance\|loan\|deposit\|referral\|disbursement\|lending" \
  web/src/lib/calculation/ web/src/lib/intelligence/ --include="*.ts" | grep -v node_modules
```

**Commit:** `git add -A && git commit -m "HF-077 Phase 0: Domain leak diagnostic" && git push origin dev`

### Phase 1: Fix LEAK 1 — ProductCode

Remove hardcoded "ProductCode" from run-calculation.ts. The engine reads filter field names from derivation rules dynamically.

**Commit:** `git add -A && git commit -m "HF-077 Phase 1: Remove hardcoded ProductCode from engine" && git push origin dev`

### Phase 2: Fix LEAK 2 — commission vocabulary

Rename `byType.commission` → `byType.payout` (or equivalent structural name). Update warning messages. Update all consumers.

**Commit:** `git add -A && git commit -m "HF-077 Phase 2: Replace commission with structural vocabulary in engine" && git push origin dev`

### Phase 3: Fix LEAK 3 — convergence vocabulary

Remove "commission" from stop-words. Fix "per referral" comment. Scan for other domain terms.

**Commit:** `git add -A && git commit -m "HF-077 Phase 3: Clean domain vocabulary from convergence service" && git push origin dev`

### Phase 4: SHEET_COMPONENT_PATTERNS documentation

Add deprecation comment. Document reference count. No removal.

**Commit:** `git add -A && git commit -m "HF-077 Phase 4: SHEET_COMPONENT_PATTERNS deprecation notice" && git push origin dev`

### Phase 5: Re-run Architecture Trace

```bash
npx tsx web/scripts/architecture-trace.ts 2>&1 | tee architecture-trace-post-hf077.txt
```

**Expected improvement:**
- DOMAIN_LEAK: 3 → 0
- Korean Test: 10/16 → ≥13/16
- SHEET_COMPONENT_PATTERNS: PARTIAL (unchanged — OB-122 scope)

**Commit:** `git add -A && git commit -m "HF-077 Phase 5: Architecture trace re-run — domain leak verification" && git push origin dev`

### Phase 6: Build + PR

```bash
pkill -f "next dev" 2>/dev/null || true
cd web && rm -rf .next && npm run build 2>&1 | tail -10
echo "Build exit code: $?"

cd /Users/AndrewAfrica/spm-platform
gh pr create --base main --head dev \
  --title "HF-077: Domain leak cleanup — Korean Test enforcement" \
  --body "Architecture trace identified 3 DOMAIN_LEAKs in foundational code. Removed: ProductCode hardcoded in engine, commission vocabulary in result types, domain terms in convergence service. Korean Test: 10/16 → target ≥13/16. SHEET_COMPONENT_PATTERNS marked for deprecation (OB-122)."
```

---

## PROOF GATES

| # | Gate | Criterion |
|---|------|-----------|
| PG-01 | npm run build exits 0 | Clean build |
| PG-02 | Zero "ProductCode" in lib/calculation/ | `grep` returns 0 |
| PG-03 | Zero "commission" in lib/calculation/ (non-comment) | `grep` returns 0 |
| PG-04 | Zero domain vocabulary in lib/intelligence/ (non-comment, non-logging) | `grep` returns 0 |
| PG-05 | SHEET_COMPONENT_PATTERNS has deprecation comment | Visual check |
| PG-06 | Architecture trace: 0 DOMAIN_LEAK | Re-run trace |
| PG-07 | Architecture trace: Korean Test ≥13/16 | Re-run trace |
| PG-08 | Grand total unchanged ($3,256,677) | Calculation not affected |
| PG-09 | No auth files modified | git diff |
| PG-10 | Completion report at project root | File exists |

---

## CRITICAL CONSTRAINTS

- **Zero calculation logic changes.** This HF renames properties and removes hardcoded strings. It does NOT change how calculations work. The grand total must remain $3,256,677.
- **Zero feature changes.** No new capabilities. No new endpoints. No new files (except completion report).
- **Consumers must be updated.** Renaming `byType.commission` requires updating every file that reads this property. Missing a consumer creates a runtime error.
- **Comments and logging are acceptable for domain terms.** The Korean Test applies to logic and structural code. A comment that says "e.g., commission rates" is acceptable. A variable named `commissionResult` is not.
- **Do NOT remove SHEET_COMPONENT_PATTERNS.** Mark it deprecated. Removal is OB-122.

---

## SCOPE BOUNDARIES

### IN SCOPE
- Remove "ProductCode" from run-calculation.ts
- Rename "commission" vocabulary in calculation engine result types
- Clean domain terms from convergence-service.ts
- Add SHEET_COMPONENT_PATTERNS deprecation notice
- Re-run architecture trace to verify improvement

### OUT OF SCOPE — DO NOT TOUCH
- Auth files
- Calculation logic (rename only — no behavioral changes)
- SHEET_COMPONENT_PATTERNS removal (OB-122)
- Óptica Luminar re-import (separate backlog item)
- Consumer Lending $2M vs $6.3M calibration (separate investigation)
- Deposit Growth $0 (OB-121)

---

*HF-077 — "The Korean Test isn't a suggestion. It's the soul of domain-agnostic architecture."*
*"If the engine knows what a commission is, it's not foundational."*
